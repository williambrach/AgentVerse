// Harness for the stream Playwright project: the real server in live mode over a mock LLM, plus a control port.
//   game port 4327, control port 4328:  POST /ctl {mode?, content?, reasoning?, streamChunkMs?, delayMs?, queue?: string[]}
// `queue` is a list of replies handed out one per model call (then `content` again): the first dirty, the second clean makes a guard retry.
import { resolve, dirname } from 'node:path';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.mjs';
import { startMockLlm } from './mock-llm.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GAME_PORT = Number(process.env.STREAM_E2E_PORT || 4327);
const CTL_PORT = Number(process.env.STREAM_E2E_CTL_PORT || 4328);

const mock = await startMockLlm({ mode: 'ok', delayMs: [30, 60], streamChunkMs: 120 });
const queue = [];

// A front for the mock: before each model call it hands the mock the next queued reply, then relays the answer untouched.
const front = createServer((req, res) => {
  const parts = [];
  req.on('data', part => parts.push(part));
  req.on('end', async () => {
    if (queue.length) mock.setMode('ok', { content: queue.shift() });
    try {
      const upstream = await fetch(mock.url + req.url.replace(/^\/v1/, ''), { method: req.method, headers: { 'content-type': 'application/json' }, body: Buffer.concat(parts) });
      res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      if (upstream.body) for await (const chunk of upstream.body) res.write(chunk);
      res.end();
    } catch { res.destroy(); }
  });
});
await new Promise(done => front.listen(0, '127.0.0.1', done));

const control = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/ctl') { res.writeHead(404).end(); return; }
  const parts = [];
  req.on('data', part => parts.push(part));
  req.on('end', () => {
    try {
      const cfg = JSON.parse(Buffer.concat(parts).toString() || '{}');
      const { mode = 'ok', reasoning = null, queue: next = [], ...opts } = cfg;
      mock.setMode(mode, opts);
      mock.setReasoning(reasoning);
      queue.length = 0;
      queue.push(...next);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    } catch { res.writeHead(400).end(); }
  });
});
await new Promise(done => control.listen(CTL_PORT, '127.0.0.1', done));

const dist = resolve(root, 'dist');
// A developer shell must not leak in: blank every knob that could aim the server at a real provider (OVERRIDE_ENDPOINTS wins over the base URL)
// or change the streaming, timeout or deadline behavior the specs depend on.
const blanked = Object.fromEntries(['OVERRIDE_ENDPOINTS', 'OVERRIDE_LLM_REASONING_EFFORT', 'OVERRIDE_LLM_MAX_COMPLETION_TOKENS', 'OVERRIDE_LLM_TIMEOUT_MS', 'OVERRIDE_LLM_MAX_IN_FLIGHT',
  'OVERRIDE_LLM_FAILOVER_FAILURES', 'OVERRIDE_LLM_FAILOVER_WINDOW_MS', 'OVERRIDE_TALK_SEED', 'OVERRIDE_DEADLINE_SECONDS'].map(name => [name, '']));
const running = await startServer({
  ...process.env,
  ...blanked, OVERRIDE_LLM_STREAM: '1',
  PORT: String(GAME_PORT), HOST: '127.0.0.1', OVERRIDE_ACCESS_CODE: '',
  OVERRIDE_LLM_API_KEY: 'stream-e2e-key', OVERRIDE_LLM_MODEL: 'mock-model', OVERRIDE_LLM_BASE_URL: `http://127.0.0.1:${front.address().port}/v1`,
}, { publicDir: existsSync(resolve(dist, 'index.html')) ? dist : null });

let closing = null;
const shutdown = () => closing ||= (async () => {
  await Promise.allSettled([running.close?.(), mock.close(), new Promise(d => control.close(d)), new Promise(d => { front.close(d); front.closeAllConnections?.(); })]);
  process.exit(0);
})();
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
console.log(`stream-e2e ready on ${GAME_PORT}, control ${CTL_PORT}`);
