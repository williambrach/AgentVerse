import { createServer } from 'node:http';

const chunkWords = text => (text.match(/\S+\s*|\s+/g) ?? []).reduce((groups, word) => {
  const last = groups[groups.length - 1];
  if (last && last.length + word.length < 30) groups[groups.length - 1] = last + word;
  else groups.push(word);
  return groups;
}, []);

// Stats object identity is stable so callers can hold `mock.stats`.
export async function startMockLlm({ mode = 'ok', delayMs = [20, 60], maxConcurrent = Infinity, content = 'I never heard the bell, so I guessed it was snack time.', reasoning = null, streamChunkMs = 8 } = {}) {
  const cfg = { mode, delayMs, maxConcurrent, content, reasoning, streamChunkMs };
  const stats = { requests: 0, inFlight: 0, maxInFlight: 0, byStatus: {} };
  const pending = new Set();
  let flip = 0;
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) { res.writeHead(404).end(); return; }
    let raw = '';
    req.on('data', part => { raw += part; });
    req.on('end', () => run(req, res, raw));
  });
  const run = (req, res, raw) => {
    let wantStream = false;
    try { wantStream = JSON.parse(raw)?.stream === true; } catch { /* a malformed body stays buffered */ }
    stats.requests++;
    stats.inFlight++;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    let done = false;
    const timers = new Set();
    const settle = status => {
      if (done) return false;
      done = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      pending.delete(abort);
      stats.inFlight--;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      return true;
    };
    const finish = (status, body) => {
      if (!settle(status)) return;
      if (!res.writableEnded && !res.destroyed) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
    };
    const abort = () => { if (done) return; done = true; for (const timer of timers) clearTimeout(timer); stats.inFlight--; res.destroy(); };
    res.on('close', () => { if (!done) abort(); });
    pending.add(abort);
    if (stats.inFlight > cfg.maxConcurrent) return finish(429, { error: { message: 'too many concurrent requests' } });
    if (cfg.mode === 'hang') return;
    const [lo, hi] = cfg.delayMs;
    const reply = () => {
      let m = cfg.mode;
      if (m === 'flaky') m = flip++ % 2 === 0 ? 'error500' : 'ok';
      if (m === 'error500') return finish(500, { error: { message: 'mock failure' } });
      if (m === 'rate429') return finish(429, { error: { message: 'mock rate limit' } });
      const length = m === 'length';
      const silent = length || m === 'empty';
      const text = silent ? '' : cfg.content;
      const thought = silent ? '' : cfg.reasoning ?? '';
      if (!wantStream) {
        return finish(200, { model: 'mock-model', choices: [{ message: { content: length ? null : m === 'empty' ? '' : cfg.content, ...(cfg.reasoning && !length && m !== 'empty' ? { reasoning_content: cfg.reasoning } : {}) }, finish_reason: length ? 'length' : 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 12 } });
      }
      if (!settle(200)) return; // settled at the header: the pieces that follow are payload, not a new response
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      const alive = () => !res.destroyed && !res.writableEnded;
      const send = obj => { if (alive()) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
      const pieces = [...chunkWords(thought).map(p => ({ reasoning_content: p })), ...chunkWords(text).map(p => ({ content: p }))];
      pieces.forEach((delta, i) => {
        const timer = setTimeout(() => { timers.delete(timer); send({ model: 'mock-model', choices: [{ index: 0, delta }] }); }, cfg.streamChunkMs * (i + 1));
        timers.add(timer);
      });
      const tail = setTimeout(() => {
        timers.delete(tail);
        send({ model: 'mock-model', choices: [{ index: 0, delta: {}, finish_reason: length ? 'length' : 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 12 } });
        if (alive()) res.end('data: [DONE]\n\n');
      }, cfg.streamChunkMs * (pieces.length + 1));
      timers.add(tail);
    };
    const wait = lo + Math.random() * (hi - lo);
    if (wait > 0) { const timer = setTimeout(() => { timers.delete(timer); reply(); }, wait); timers.add(timer); } else reply();
  };
  server.keepAliveTimeout = 5000;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`,
    stats,
    setMode(next, opts = {}) { cfg.mode = next; flip = 0; for (const k of ['delayMs', 'maxConcurrent', 'content', 'streamChunkMs']) if (k in opts) cfg[k] = opts[k]; },
    setReasoning(text) { cfg.reasoning = text; },
    reset() { Object.assign(stats, { requests: 0, inFlight: 0, maxInFlight: 0, byStatus: {} }); },
    async close() {
      for (const abort of [...pending]) abort();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}
