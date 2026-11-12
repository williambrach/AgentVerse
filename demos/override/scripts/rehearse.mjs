// Rehearsal: N simulated teams play (admin-demo players) while a probe uses the command centre the
// way an operator would, timing every admin route and the live stream. Prints a report and PASS/FAIL.
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { runDemo } from './admin-demo.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]);
};
const summary = (ms) => ({ n: ms.length, p50: percentile(ms, 0.5), p95: percentile(ms, 0.95), max: Math.round(Math.max(0, ...ms)) });

// The environment that points the server at real LLM endpoints, or null when none is configured.
export function realLlmEnv(env = process.env) {
  const picked = Object.fromEntries(Object.entries(env).filter(([k]) => /^OVERRIDE_(LLM_|ENDPOINTS?$|ENDPOINT_)/.test(k)));
  return picked.OVERRIDE_ENDPOINTS || picked.OVERRIDE_LLM_BASE_URL ? picked : null;
}

// Pure verdict over collected numbers, so the thresholds are testable without a run.
export function judge(r, t) {
  const failures = [];
  for (const [route, s] of Object.entries(r.admin)) if (s.n && s.p95 > t.adminP95) failures.push(`admin ${route} p95 ${s.p95} ms > ${t.adminP95} ms`);
  for (const [route, s] of Object.entries(r.adminErrors)) failures.push(`admin ${route}: ${s} failed requests`);
  if (r.stream.lag.p95 > t.lagP95) failures.push(`stream lag p95 ${r.stream.lag.p95} ms > ${t.lagP95} ms`);
  if (r.stream.disconnects) failures.push(`stream dropped ${r.stream.disconnects} times`);
  if (!r.stream.events) failures.push('stream sent no events');
  if (r.stream.tickGap.max > t.tickGapMax) failures.push(`stream tick gap ${r.stream.tickGap.max} ms > ${t.tickGapMax} ms`);
  if (r.loop.p99 > t.loopP99) failures.push(`event loop p99 ${r.loop.p99} ms > ${t.loopP99} ms`);
  if (r.player.server5xx) failures.push(`${r.player.server5xx} player requests got a non-LLM 5xx`);
  if (r.player.connectionErrors) failures.push(`${r.player.connectionErrors} player requests had no response`);
  if (r.player.finishedPlayers < r.players) failures.push(`${r.players - r.player.finishedPlayers} of ${r.players} teams never finished a game`);
  for (const c of r.checks) if (!c.ok) failures.push(c.what);
  return failures;
}

export async function rehearse({ players = 25, seconds = 600, rampMs = 30_000, thinkMs = [2000, 8000], probeMs = 2000, burst = true, real = false, port = 0, adminPort = 0, thresholds = {}, log = console.log } = {}) {
  const t = { adminP95: 300, lagP95: 1000, loopP99: 100, tickGapMax: 3000, ...thresholds };
  const llmEnv = real ? realLlmEnv() : null;
  if (real && !llmEnv) throw new Error('--real needs OVERRIDE_ENDPOINTS or OVERRIDE_LLM_BASE_URL in the environment (try node --env-file=.env).');
  const token = 'rehearse-admin';
  const playerMs = new Map();
  const statusCounts = {};
  let server5xx = 0, connectionErrors = 0;
  const finished = new Map();
  const onCall = (route, status, ms) => {
    const key = route.replace(/\?.*$/, '');
    if (!playerMs.has(key)) playerMs.set(key, []);
    playerMs.get(key).push(ms);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    // 502 is a failed model answer and 503 is paused games: both are the LLM's or the operator's, not ours.
    if (status >= 500 && status !== 502 && status !== 503) server5xx++;
    if (status === 0) connectionErrors++;
  };
  const onFinish = (i) => finished.set(i, (finished.get(i) || 0) + 1);

  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  let rssPeak = 0;
  const rssTimer = setInterval(() => { rssPeak = Math.max(rssPeak, process.memoryUsage().rss); }, 1000);

  const demo = await runDemo({ players, rampMs, thinkMs, burstEvery: burst && !real ? Math.max(10, Math.round(seconds / 2)) : 0, port, adminPort, token, seconds: 0, llmEnv, onCall, onFinish });
  log(`Player site ${demo.url}  admin ${demo.adminUrl}/admin (password ${token})  ${real ? 'REAL LLM' : 'mock LLM'}  ${players} teams for ${seconds}s`);
  const admin = demo.adminUrl;
  const auth = { Authorization: `Bearer ${token}` };
  const adminMs = new Map();
  const adminErrors = {};
  const checks = [];
  const sessions = new Set();
  const stopProbe = new AbortController();
  const timed = async (label, path, init = {}) => {
    const t0 = performance.now();
    try {
      const res = await fetch(`${admin}${path}`, { ...init, headers: { ...auth, ...(init.headers || {}) }, signal: stopProbe.signal });
      const body = await res.json().catch(() => null);
      if (!adminMs.has(label)) adminMs.set(label, []);
      adminMs.get(label).push(performance.now() - t0);
      if (res.status !== 200) adminErrors[label] = (adminErrors[label] || 0) + 1;
      return { status: res.status, body };
    } catch (e) {
      if (!stopProbe.signal.aborted) adminErrors[label] = (adminErrors[label] || 0) + 1;
      return { status: 0, body: null };
    }
  };

  // The live stream, as the command centre reads it: hello, then event rows and a tick per second.
  const stream = { events: 0, ticks: 0, disconnects: 0, lag: [], tickGap: [], last: null, firstByteMs: [] };
  const readStream = async () => {
    while (!stopProbe.signal.aborted) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${admin}/admin/stream`, { headers: auth, signal: stopProbe.signal });
        if (res.status !== 200) throw new Error(`stream ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let lastTick = null;
        let first = true;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (first) { stream.firstByteMs.push(performance.now() - t0); first = false; }
          buf += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
            if (!line) continue;
            const msg = JSON.parse(line);
            const now = Date.now();
            if (msg.type === 'event') {
              stream.events++;
              stream.lag.push(Math.max(0, now - msg.row.at));
              if (msg.row.sessionId) sessions.add(msg.row.sessionId);
            } else if (msg.type === 'tick' || msg.type === 'hello') {
              if (msg.type === 'tick') { stream.ticks++; if (lastTick !== null) stream.tickGap.push(now - lastTick); lastTick = now; }
              stream.last = msg.snapshot;
            }
          }
        }
        if (!stopProbe.signal.aborted) stream.disconnects++;
      } catch {
        if (stopProbe.signal.aborted) return;
        stream.disconnects++;
        await sleep(500);
      }
    }
  };
  const streaming = readStream();

  // What an operator clicks: health, leaderboard, metrics, the content list and one session's drill-down.
  let drillBad = 0;
  const probe = async () => {
    while (!stopProbe.signal.aborted) {
      await Promise.all([
        timed('GET /admin/health', '/admin/health'),
        timed('GET /admin/leaderboard', '/admin/leaderboard'),
        timed('GET /admin/content', '/admin/content'),
        (async () => {
          const t0 = performance.now();
          try {
            const res = await fetch(`${admin}/metrics`, { headers: auth, signal: stopProbe.signal });
            await res.text();
            if (!adminMs.has('GET /metrics')) adminMs.set('GET /metrics', []);
            adminMs.get('GET /metrics').push(performance.now() - t0);
            if (res.status !== 200) adminErrors['GET /metrics'] = (adminErrors['GET /metrics'] || 0) + 1;
          } catch { if (!stopProbe.signal.aborted) adminErrors['GET /metrics'] = (adminErrors['GET /metrics'] || 0) + 1; }
        })(),
        (async () => {
          const ids = [...sessions];
          if (!ids.length) return;
          const sid = ids[Math.floor(Math.random() * ids.length)];
          const { status, body } = await timed('GET /admin/sessions/<id>', `/admin/sessions/${sid}`);
          if (status === 200 && !(Array.isArray(body?.rows) && body.rows.length && body.rows.every((r) => r.sessionId === sid))) drillBad++;
        })(),
      ]);
      await sleep(probeMs);
    }
  };
  const probing = probe();

  const started = Date.now();
  // Midway the operator starts a new round. The board only counts sessions started since the round began,
  // so the team count is checked just before that.
  let midwayDone = Promise.resolve();
  const midway = setTimeout(() => {
    midwayDone = (async () => {
      const board = await timed('GET /admin/leaderboard', '/admin/leaderboard');
      const teams = Array.isArray(board.body?.teams) ? board.body.teams.length : null;
      if (rampMs < (seconds * 1000) / 2) checks.push({ what: `leaderboard lists ${teams} teams before the new round, driver made ${players}`, ok: teams === players });
      await timed('POST /admin/round', '/admin/round', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Rehearsal round 2', reason: 'rehearse.mjs midway' }) });
    })();
  }, (seconds * 1000) / 2);
  const progress = setInterval(() => {
    const p = stream.last?.players ?? {};
    const tr = stream.last?.traffic ?? {};
    log(`  ${Math.round((Date.now() - started) / 1000)}s  online ${p.online ?? '?'}  games ${stream.last?.sessions?.games ?? '?'}  finished ${[...finished.values()].reduce((a, b) => a + b, 0)}  q/min ${tr.questionsPerMin ?? '?'}  answer p95 ${tr.answerP95Ms ?? '?'}ms  active ${tr.active ?? '?'}  queue ${tr.queue ?? 0}  stream events ${stream.events}`);
  }, 15_000);

  await sleep(seconds * 1000);
  clearInterval(progress);
  clearTimeout(midway);
  await midwayDone;

  // End-of-run consistency, read before the players stop: does the command centre agree with the driver?
  const snap = stream.last ?? {};
  if (rampMs < seconds * 1000) checks.push({ what: `command centre shows ${snap.players?.online} online, driver has ${players} tabs`, ok: snap.players?.online === players });
  checks.push({ what: `${drillBad} session drill-downs returned rows from another session or none`, ok: drillBad === 0 });
  const health = await timed('GET /admin/health', '/admin/health');

  stopProbe.abort();
  await Promise.allSettled([streaming, probing]);
  await demo.close();
  clearInterval(rssTimer);
  loop.disable();

  const player = Object.fromEntries([...playerMs].sort().map(([k, v]) => [k, summary(v)]));
  const report = {
    players, seconds, real, at: new Date().toISOString(),
    player: { routes: player, statusCounts, server5xx, connectionErrors, finishedGames: [...finished.values()].reduce((a, b) => a + b, 0), finishedPlayers: finished.size },
    admin: Object.fromEntries([...adminMs].sort().map(([k, v]) => [k, summary(v)])), adminErrors,
    stream: { events: stream.events, ticks: stream.ticks, disconnects: stream.disconnects, lag: summary(stream.lag), tickGap: summary(stream.tickGap), firstByte: summary(stream.firstByteMs) },
    loop: { p50: Math.round(loop.percentile(50) / 1e6), p99: Math.round(loop.percentile(99) / 1e6), max: Math.round(loop.max / 1e6) },
    rssPeakMb: Math.round(rssPeak / 1048576),
    commandCentre: { online: snap.players?.online ?? null, games: snap.sessions?.games ?? null, byStage: snap.sessions?.byStage ?? null, answerP95Ms: snap.traffic?.answerP95Ms ?? null, llmErrorRate: snap.traffic?.llmErrorRate ?? null, active: snap.traffic?.active ?? null, failoverAt: snap.traffic?.failoverAt ?? null, funnel: snap.funnel ?? null },
    router: health.body?.router ?? null,
    checks,
  };
  report.failures = judge(report, t);
  report.pass = report.failures.length === 0;
  return report;
}

export function printReport(r, log = console.log) {
  const row = (name, s) => `  ${name.padEnd(30)} n ${String(s.n).padStart(5)}  p50 ${String(s.p50).padStart(6)}  p95 ${String(s.p95).padStart(6)}  max ${String(s.max).padStart(6)} ms`;
  log(`\n${r.pass ? 'PASS' : 'FAIL'}  ${r.players} teams, ${r.seconds}s, ${r.real ? 'real LLM' : 'mock LLM'}`);
  log('Player requests');
  for (const [k, s] of Object.entries(r.player.routes)) log(row(k, s));
  log(`  statuses ${JSON.stringify(r.player.statusCounts)}  finished games ${r.player.finishedGames} (by ${r.player.finishedPlayers} of ${r.players} teams)`);
  log('Command centre');
  for (const [k, s] of Object.entries(r.admin)) log(row(k, s));
  log(row('stream event lag', r.stream.lag));
  log(row('stream tick gap', r.stream.tickGap));
  log(`  stream events ${r.stream.events}  ticks ${r.stream.ticks}  disconnects ${r.stream.disconnects}`);
  log(`Server  event loop p50 ${r.loop.p50} / p99 ${r.loop.p99} / max ${r.loop.max} ms  RSS peak ${r.rssPeakMb} MB`);
  const c = r.commandCentre;
  log(`Shown on the command centre at the end: online ${c.online}, games ${c.games}, answer p95 ${c.answerP95Ms} ms, LLM error rate ${(100 * (c.llmErrorRate ?? 0)).toFixed(1)}%, active ${c.active}`);
  for (const f of r.failures) log(`  - ${f}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv;
  const arg = (flag, fallback) => { const i = argv.indexOf(flag); return i > 0 ? argv[i + 1] : fallback; };
  const num = (flag, fallback) => { const v = Number(arg(flag, fallback)); if (!Number.isFinite(v) || v < 0) { console.error(`Bad value for ${flag}`); process.exit(2); } return v; };
  const think = String(arg('--think', '2000-8000')).split('-').map(Number);
  if (think.length !== 2 || !think.every(Number.isFinite) || think[0] > think[1]) { console.error('Bad --think, expected MIN-MAX in ms'); process.exit(2); }
  const report = await rehearse({
    players: num('--players', 25), seconds: num('--seconds', 600), rampMs: num('--ramp', 30_000), thinkMs: think,
    burst: !argv.includes('--no-burst'), real: argv.includes('--real'), port: num('--port', 0), adminPort: num('--admin-port', 0),
    thresholds: { adminP95: num('--admin-p95', 300), lagP95: num('--lag-p95', 1000), loopP99: num('--loop-p99', 100) },
  });
  printReport(report);
  const out = arg('--out', null);
  if (out) { writeFileSync(out, JSON.stringify(report, null, 2)); console.log(`Report written to ${out}`); }
  process.exit(report.pass ? 0 : 1);
}
