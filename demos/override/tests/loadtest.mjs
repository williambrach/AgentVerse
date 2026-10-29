import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.mjs';
import { startMockLlm } from './mock-llm.mjs';

// Fault-injection load test: the real server against four mock endpoints (spec A2).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LETTERS = ['a', 'b', 'c', 'd'];
const CONNECTION_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const jitter = (lo, hi) => lo + Math.random() * (hi - lo);

// What each mock does, and what must hold afterwards. `answersFrom` limits provenance endpoints.
const scenarioTable = {
  healthy: { modes: {}, strict: true },
  primary_errors: { modes: { a: 'error500' }, failoverTo: 'b', answersFrom: ['b'] },
  primary_hangs: { modes: { a: 'hang' }, failoverTo: 'b', answersFrom: ['b'], hangs: true },
  rate_limited: { modes: { a: 'rate429' }, failoverTo: 'b', answersFrom: ['b'], aSilentAfterFailover: true },
  flaky_primary: { modes: { a: 'flaky' }, failoverTo: 'b', aSilentAfterFailover: true },
  silent_failure: { modes: { a: 'empty' }, answersFrom: ['b'], semantic: true },
  small_backup: { modes: { a: 'error500' }, capB: true, idleEndpoints: ['c', 'd'] },
  all_down: { modes: { a: 'error500', b: 'error500', c: 'error500', d: 'error500' }, allDown: true },
  server_restart: { modes: {}, restart: true, strict: true },
  burst_arrival: { modes: {}, burst: true },
};
export const scenarios = Object.keys(scenarioTable);

function makeHttp() {
  const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
  const request = (url, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ agent, host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
  return { request, destroy: () => agent.destroy() };
}

export function makePublicDir(dir) {
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><body><script src="/assets/app-abcdef12.js"></script></body></html>');
  writeFileSync(join(dir, 'assets', 'app-abcdef12.js'), `console.log("${'banana '.repeat(400)}");`);
  return dir;
}

// The OS accept-queue cap, or null when unknown. Never throws.
export function acceptQueueLimit() {
  try {
    const raw = process.platform === 'linux'
      ? readFileSync('/proc/sys/net/core/somaxconn', 'utf8')
      : execFileSync('sysctl', ['-n', 'kern.ipc.somaxconn'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch { return null; }
}

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]);
};

export async function runScenario(name, { players = 200, rampMs = 10_000, deadlineMs = 60_000, endpointTimeoutMs = 25_000, cap = 50, publicDir = null } = {}) {
  const spec = scenarioTable[name];
  if (!spec) throw new Error(`Unknown scenario ${name}.`);
  if (spec.burst) rampMs = 0;
  // The endpoint loader refuses a timeout under 1000 ms.
  const timeoutMs = Math.max(1000, spec.hangs ? Math.min(endpointTimeoutMs, 3000) : endpointTimeoutMs);
  const cleanups = [];
  const failures = [];
  const net = makeHttp();
  cleanups.push(async () => net.destroy());
  try {
    const dir = mkdtempSync(join(tmpdir(), 'override-load-'));
    cleanups.push(async () => rmSync(dir, { recursive: true, force: true }));
    const pub = publicDir || makePublicDir(join(dir, 'public'));
    const mocks = {};
    for (const letter of LETTERS) {
      mocks[letter] = await startMockLlm({ mode: spec.modes[letter] || 'ok', delayMs: [20, 80], maxConcurrent: letter === 'b' && spec.capB ? cap : Infinity });
      cleanups.push(() => mocks[letter].close());
    }
    const endpointsFile = join(dir, 'endpoints.json');
    writeFileSync(endpointsFile, JSON.stringify(LETTERS.map(l => ({
      name: l, baseUrl: mocks[l].url, model: `mock-${l}`, keyEnv: `OVERRIDE_ENDPOINT_${l.toUpperCase()}_KEY`, timeoutMs,
      maxInFlight: l === 'b' && spec.capB ? cap : 200,
    }))));
    const env = {
      PORT: '0', OVERRIDE_ENV: 'test', OVERRIDE_DATA_DIR: join(dir, 'data'), OVERRIDE_SECRET: 'load-secret', OVERRIDE_ACCESS_CODE: 'load-code',
      OVERRIDE_ENDPOINTS: endpointsFile, OVERRIDE_LLM_TIMEOUT_MS: String(deadlineMs),
      ...Object.fromEntries(LETTERS.map(l => [`OVERRIDE_ENDPOINT_${l.toUpperCase()}_KEY`, `dummy-key-${l}`])),
    };
    let running = await startServer(env, { publicDir: pub });
    cleanups.push(() => running.close());
    const ctx = { url: running.url, connectionErrors: 0, httpErrors: 0, firstDone: 0, restarted: null };
    const html = readFileSync(join(pub, 'index.html'), 'utf8');
    const asset = /\/assets\/[^"']+/.exec(html)?.[0] || null;

    const started = Date.now();
    const watch = { failoverAt: null, aAtFailover: null };
    const poller = setInterval(() => {
      if (watch.failoverAt !== null) return;
      const active = running.router?.snapshot().active;
      if (active && active !== 'a') {
        watch.failoverAt = Date.now() - started;
        // Requests already on the wire when the switch happened are not "after" it.
        setTimeout(() => { watch.aAtFailover = mocks.a.stats.requests; }, 250).unref();
      }
    }, 50);
    cleanups.push(async () => clearInterval(poller));

    const restart = async () => {
      await running.close();
      running = await startServer(env, { publicDir: pub });
      cleanups.push(() => running.close());
      ctx.url = running.url;
    };

    const results = [];
    const play = async index => {
      const r = { questions: [], verdict: false, export: null, error: null, requests: [] };
      results.push(r);
      const jar = {};
      const call = async (method, path, body) => {
        for (let attempt = 0; ; attempt++) {
          const t0 = performance.now();
          try {
            const response = await net.request(`${ctx.url}${path}`, {
              method, body: body === undefined ? undefined : JSON.stringify(body),
              headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
            });
            for (const line of [].concat(response.headers['set-cookie'] || [])) { const [pair] = line.split(';'); const eq = pair.indexOf('='); jar[pair.slice(0, eq)] = pair.slice(eq + 1); }
            let data = null;
            try { data = JSON.parse(response.text); } catch { /* exports and assets are not JSON */ }
            if (response.status >= 400) ctx.httpErrors++;
            return { status: response.status, data, text: response.text, ms: performance.now() - t0 };
          } catch (error) {
            if (!CONNECTION_CODES.has(error.code)) throw error;
            ctx.connectionErrors++;
            if (!spec.restart || attempt >= 100) throw error;
            await sleep(100);
          }
        }
      };
      // One game action. A stale revision (409) refreshes the state and tries again.
      const act = async (action, extra = {}) => {
        for (let tries = 0; tries < 20; tries++) {
          const s = r.state?.session;
          const res = await call('POST', `/api/${action}`, { sessionId: s?.id, revision: s?.revision, ...extra });
          if (res.status === 200) { r.state = res.data; return res; }
          if (res.status === 429 && (action === 'start' || action === 'reset')) { await sleep(jitter(300, 1000)); continue; }
          if (res.status === 409 && s) { const fresh = await call('GET', '/api/state'); r.state = fresh.data; continue; }
          return res;
        }
        return { status: 0, data: { error: 'gave up' } };
      };
      try {
        await sleep(rampMs ? (rampMs * index) / players : 0);
        await call('GET', '/');
        if (asset) await call('GET', asset);
        const access = await call('POST', '/api/access', { code: 'load-code' });
        if (access.status !== 200) throw new Error(`sign-in ${access.status}`);
        const start = await act('start');
        if (start.status !== 200) throw new Error(`start ${start.status}`);
        for (const character of r.state.characters) {
          const q = { character: character.id, ok: false, statuses: [], messages: [] };
          r.questions.push(q);
          for (let attempt = 0; attempt < 3 && !q.ok; attempt++) {
            const res = await act('interview', { character: character.id, question: character.quickQuestion });
            q.statuses.push(res.status);
            r.requests.push(res.ms);
            if (res.status === 200) { q.ok = true; break; }
            q.messages.push(res.data?.error || '');
            if (res.status !== 502) break;
            const fresh = await call('GET', '/api/state');
            r.state = fresh.data;
          }
          if (q.ok && ++ctx.firstDone === Math.ceil(players / 2) && spec.restart) ctx.restarted = restart();
        }
        if (r.questions.every(q => q.ok)) r.verdict = (await act('verdict', { suspect: 'momo', confidence: 70 })).status === 200;
        const exported = await call('GET', '/api/events');
        r.export = exported.status === 200 ? exported.text : null;
      } catch (error) { r.error = error.message || error.code || String(error); }
    };

    await Promise.all(Array.from({ length: players }, (_, i) => play(i)));
    await ctx.restarted;
    clearInterval(poller);
    // Let in-flight requests settle so the counts are final.
    await sleep(300);

    const questions = results.flatMap(r => r.questions);
    const failedQuestions = questions.filter(q => !q.ok).length;
    const verdicts = results.filter(r => r.verdict).length;
    const answers = [];
    results.forEach((r, i) => {
      if (r.error) failures.push(`player ${i}: ${r.error}`);
      if (!r.export) { if (!r.error) failures.push(`player ${i}: no export`); return; }
      let events;
      try { events = r.export.trim().split('\n').map(line => JSON.parse(line)); } catch { failures.push(`player ${i}: export is not JSON lines`); return; }
      if (!events.every((e, n) => e.sequence === n + 1 && e.sessionId === events[0].sessionId)) failures.push(`player ${i}: export has a sequence gap or foreign events`);
      if (/dummy-key|"messages"/.test(r.export)) failures.push(`player ${i}: export leaks a key or prompt`);
      answers.push(...events.filter(e => e.type === 'interview_answer'));
    });
    const requestMs = results.flatMap(r => r.requests);
    const requestsByEndpoint = Object.fromEntries(LETTERS.map(l => [l, mocks[l].stats.requests]));
    const maxInFlightByEndpoint = Object.fromEntries(LETTERS.map(l => [l, mocks[l].stats.maxInFlight]));
    const activeAfter = running.router.snapshot().active;
    const stats = { players, verdicts, questions: questions.length, failedQuestions, p95InterviewMs: percentile(requestMs, 0.95), maxInterviewMs: Math.round(Math.max(0, ...requestMs)), activeAfter, failoverAtMs: watch.failoverAt, requestsByEndpoint, maxInFlightByEndpoint, connectionErrors: ctx.connectionErrors, httpErrors: ctx.httpErrors };

    if (!spec.restart && ctx.connectionErrors) {
      failures.unshift(`${ctx.connectionErrors} connection errors`);
    }
    if (spec.allDown) {
      // A player's retries of failed questions can reach the 6-per-minute limit (429); that is a clear answer too.
      const bad = questions.filter(q => q.messages.some(m => !m) || q.statuses.some(s => s >= 500 && s !== 502) || !q.statuses.every(s => s === 502 || s === 429));
      if (bad.length) failures.push(`${bad.length} failed questions did not return a clear 502`);
      if (!questions.some(q => q.statuses.includes(502))) failures.push('no question returned 502');
      if (failedQuestions !== questions.length) failures.push('some questions were answered with every endpoint down');
    } else {
      if (failedQuestions / Math.max(1, questions.length) >= 0.05) failures.push(`${failedQuestions} of ${questions.length} questions failed`);
      if (spec.strict && failedQuestions) failures.push(`${failedQuestions} failed questions (none allowed)`);
      if ((spec.strict || !failedQuestions) && verdicts !== players) failures.push(`${verdicts} of ${players} verdicts`);
    }
    if (spec.failoverTo) {
      if (activeAfter !== spec.failoverTo) failures.push(`active is ${activeAfter}, expected ${spec.failoverTo}`);
      if (watch.failoverAt === null || watch.failoverAt > 30_000) failures.push(`failover at ${watch.failoverAt} ms`);
    }
    if (spec.aSilentAfterFailover) {
      if (watch.aAtFailover === null) failures.push('no failover observed');
      else if (mocks.a.stats.requests !== watch.aAtFailover) failures.push(`endpoint a got ${mocks.a.stats.requests - watch.aAtFailover} requests after failover`);
    }
    if (spec.answersFrom) {
      if (!answers.length) failures.push('no answers');
      const stray = answers.filter(a => !spec.answersFrom.includes(a.provenance?.endpoint));
      if (stray.length) failures.push(`${stray.length} answers came from ${[...new Set(stray.map(a => a.provenance?.endpoint))]}`);
    }
    if (spec.semantic && !answers.some(a => a.provenance?.semanticRetry)) failures.push('no semantic retry recorded');
    if (spec.capB && stats.maxInFlightByEndpoint.b > cap) failures.push(`b peaked at ${stats.maxInFlightByEndpoint.b} in flight (cap ${cap})`);
    for (const l of spec.idleEndpoints || []) if (requestsByEndpoint[l]) failures.push(`endpoint ${l} got ${requestsByEndpoint[l]} requests`);
    if (stats.maxInterviewMs > deadlineMs + 1000) failures.push(`a question took ${stats.maxInterviewMs} ms (deadline ${deadlineMs})`);
    // An undersized OS accept queue makes the burst unverifiable here: run it, but never call it a pass.
    const queue = spec.burst ? acceptQueueLimit() : null;
    const precondition = queue !== null && queue < players
      ? `${process.platform === 'linux' ? 'net.core.somaxconn' : 'kern.ipc.somaxconn'} is ${queue}, below ${players} players: run sudo sysctl -w ${process.platform === 'linux' ? 'net.core.somaxconn' : 'kern.ipc.somaxconn'}=1024`
      : null;
    return { name, pass: failures.length === 0 && !precondition, failures, stats, ...(precondition ? { precondition } : {}) };
  } finally {
    for (const cleanup of cleanups.reverse()) { try { await cleanup(); } catch { /* best effort */ } }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (flag, fallback) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : fallback; };
  const players = Number(arg('--players', 200));
  const rampMs = Number(arg('--ramp', 10_000));
  const which = arg('--scenario', 'all');
  const names = which === 'all' ? scenarios : [which];
  const dist = resolve(root, 'dist');
  const publicDir = existsSync(join(dist, 'index.html')) ? dist : null;
  const rows = [];
  for (const name of names) {
    const t0 = Date.now();
    const result = await runScenario(name, { players, rampMs, publicDir });
    rows.push(result);
    const s = result.stats;
    console.log(`${result.pass ? 'PASS' : result.precondition ? 'FAIL (precondition)' : 'FAIL'} ${name.padEnd(15)} players ${s.players} verdicts ${s.verdicts} failed ${s.failedQuestions}/${s.questions} p95 ${s.p95InterviewMs}ms active ${s.activeAfter} req ${LETTERS.map(l => `${l}:${s.requestsByEndpoint[l]}`).join(' ')} conn-err ${s.connectionErrors} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (result.precondition) console.log(`     - ${result.precondition}`);
    for (const f of result.failures.slice(0, 5)) console.log(`     - ${f}`);
  }
  process.exit(rows.every(r => r.pass) ? 0 : 1);
}
