// Demo driver: real server in live mode over two mock LLM endpoints, with simulated players.
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.mjs';
import { cases } from '../server/cases/index.mjs';
import { startMockLlm } from '../tests/mock-llm.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BURST_MS = 30_000;
const BEAT_MS = 30_000;

export async function runDemo({ players = 60, rampMs = 60_000, thinkMs: thinkRaw = [4000, 20_000], burstEvery = 120, port = 3001, adminPort = 3002, token = 'demo', seconds = 0 } = {}) {
  const thinkMs = Array.isArray(thinkRaw) && thinkRaw.length === 2 && thinkRaw.every(Number.isFinite) ? thinkRaw : [4000, 20_000];
  const dir = mkdtempSync(join(tmpdir(), 'override-demo-'));
  const timers = new Set();
  const ctl = new AbortController();
  const mocks = {};
  let running = null;
  let closing = null;
  const sleep = (ms) => new Promise((resolveSleep) => {
    if (ctl.signal.aborted) return resolveSleep();
    const done = () => { clearTimeout(id); timers.delete(id); resolveSleep(); };
    const id = setTimeout(done, ms);
    timers.add(id);
    ctl.signal.addEventListener('abort', done, { once: true });
  });
  const between = (lo, hi) => lo + Math.random() * (hi - lo);
  const think = () => sleep(between(thinkMs[0], thinkMs[1]));
  const every = (ms, fn) => { const id = setInterval(fn, ms); timers.add(id); return id; };

  const close = () => closing ||= (async () => {
    ctl.abort();
    for (const id of timers) { clearTimeout(id); clearInterval(id); }
    timers.clear();
    await Promise.allSettled(loops);
    await Promise.allSettled([running?.close(), ...Object.values(mocks).map((m) => m.close())]);
    rmSync(dir, { recursive: true, force: true });
  })();
  const loops = [];

  try {
    for (const l of ['a', 'b']) mocks[l] = await startMockLlm({ mode: 'ok', delayMs: [300, 2500] });
    const endpoints = join(dir, 'endpoints.json');
    writeFileSync(endpoints, JSON.stringify(['a', 'b'].map((l) => ({ name: l, baseUrl: mocks[l].url, model: `mock-${l}`, keyEnv: `OVERRIDE_ENDPOINT_${l.toUpperCase()}_KEY`, maxInFlight: 200 }))));
    const dist = resolve(root, 'dist');
    running = await startServer({
      PORT: String(port), OVERRIDE_ADMIN_PORT: String(adminPort), OVERRIDE_ENV: 'demo', OVERRIDE_DATA_DIR: join(dir, 'data'), OVERRIDE_SECRET: 'demo-secret',
      OVERRIDE_ADMIN_TOKEN: token, OVERRIDE_ENDPOINTS: endpoints, OVERRIDE_ENDPOINT_A_KEY: 'demo-key-a', OVERRIDE_ENDPOINT_B_KEY: 'demo-key-b',
    }, { publicDir: existsSync(join(dist, 'index.html')) ? dist : null });
  } catch (error) { await close(); throw error; }

  if (burstEvery > 0) {
    every(burstEvery * 1000, () => {
      mocks.a.setMode('error500');
      const id = setTimeout(() => { timers.delete(id); mocks.a.setMode('ok'); }, BURST_MS);
      timers.add(id);
    });
  }

  const base = running.url;
  const play = async (index) => {
    const tab = randomUUID();
    const jar = new Map();
    let view = null;
    const call = async (method, path, body) => {
      try {
        const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
        for (const set of res.headers.getSetCookie()) { const [pair] = set.split(';'); const eq = pair.indexOf('='); jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1)); }
        const data = res.status === 204 ? null : await res.json().catch(() => null);
        return { status: res.status, data };
      } catch { return { status: 0, data: null }; }
    };
    const act = async (action, extra = {}) => {
      for (let tries = 0; tries < 8 && !ctl.signal.aborted; tries++) {
        const s = view?.session;
        const res = await call('POST', `/api/${action}`, { sessionId: s?.id, revision: s?.revision, ...extra });
        if (res.status === 200) { view = res.data; return res; }
        if (res.status === 429 || res.status === 502 || res.status === 503) { await sleep(between(1000, 3000)); continue; }
        if (res.status === 409 && s) { const fresh = await call('GET', '/api/state'); if (fresh.data) view = fresh.data; continue; }
        return res;
      }
      return { status: 0, data: null };
    };
    const beat = () => call('POST', '/api/heartbeat', { tab });
    await sleep(rampMs ? (rampMs * index) / Math.max(1, players) : 0);
    every(BEAT_MS, beat);
    beat();
    await call('POST', '/api/team', { name: `Demo team ${index + 1}`, join: true }); // failure: play teamless
    let caseNo = index;
    while (!ctl.signal.aborted) {
      const caseId = cases[caseNo++ % cases.length].id;
      const start = await act(view?.session ? 'reset' : 'start', { caseId });
      if (start.status !== 200) { await sleep(2000); continue; }
      await think();
      for (const character of view?.characters ?? []) {
        await think();
        await act('visit', { location: character.id });
        const n = 2 + Math.floor(Math.random() * 3);
        for (let q = 0; q < n && !ctl.signal.aborted; q++) {
          await think();
          await act('interview', { character: character.id, question: q === 0 ? character.quickQuestion : `Tell me more, round ${q + 1}?` });
        }
      }
      if (ctl.signal.aborted) break;
      await think();
      const ids = (view?.characters ?? []).map((c) => c.id);
      await act('verdict', { suspect: Math.random() < 0.7 ? ids[Math.floor(Math.random() * ids.length)] : 'none', confidence: Math.round(between(30, 100)) });
      await think();
      if (Math.random() < 0.5) await sleep(between(2000, 8000));
    }
  };
  for (let i = 0; i < players; i++) loops.push(play(i).catch(() => {}));
  if (seconds > 0) { const id = setTimeout(() => { close().catch(() => {}); }, seconds * 1000); timers.add(id); }
  return { url: running.url, adminUrl: running.adminUrl, close };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (flag, fallback) => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : fallback; };
  const range = (text) => { const p = String(text).split('-').map(Number); if (p.length !== 2 || !p.every((n) => Number.isFinite(n) && n >= 0) || p[0] > p[1]) { console.error(`Bad --think "${text}", expected MIN-MAX in ms, e.g. 4000-20000`); process.exit(2); } return p; };
  const num = (flag, fallback) => { const v = Number(arg(flag, fallback)); if (!Number.isFinite(v) || v < 0) { console.error(`Bad value for ${flag}`); process.exit(2); } return v; };
  const demo = await runDemo({
    players: num('--players', 60), rampMs: num('--ramp', 60_000), thinkMs: range(arg('--think', '4000-20000')),
    burstEvery: num('--burst-every', 120), port: num('--port', 3001), adminPort: num('--admin-port', 3002),
    token: process.env.OVERRIDE_ADMIN_TOKEN || 'demo', seconds: 0,
  });
  console.log(`Player site: ${demo.url}\nAdmin: ${demo.adminUrl}/admin (token ${process.env.OVERRIDE_ADMIN_TOKEN ? 'from OVERRIDE_ADMIN_TOKEN' : 'demo'})`);
  const stop = () => demo.close().then(() => process.exit(0), () => process.exit(1));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
