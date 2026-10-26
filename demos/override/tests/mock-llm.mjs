import { createServer } from 'node:http';

// Stats object identity is stable so callers can hold `mock.stats`.
export async function startMockLlm({ mode = 'ok', delayMs = [20, 60], maxConcurrent = Infinity, content = 'I never heard the bell, so I guessed it was snack time.' } = {}) {
  const cfg = { mode, delayMs, maxConcurrent, content };
  const stats = { requests: 0, inFlight: 0, maxInFlight: 0, byStatus: {} };
  const pending = new Set();
  let flip = 0;
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) { res.writeHead(404).end(); return; }
    req.resume();
    stats.requests++;
    stats.inFlight++;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    let done = false;
    let timer;
    const finish = (status, body) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      pending.delete(abort);
      stats.inFlight--;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      if (!res.writableEnded && !res.destroyed) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
    };
    const abort = () => { if (done) return; done = true; clearTimeout(timer); stats.inFlight--; res.destroy(); };
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
      finish(200, { model: 'mock-model', choices: [{ message: { content: length ? null : m === 'empty' ? '' : cfg.content }, finish_reason: length ? 'length' : 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 12 } });
    };
    const wait = lo + Math.random() * (hi - lo);
    if (wait > 0) timer = setTimeout(reply, wait); else reply();
  });
  server.keepAliveTimeout = 5000;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/v1`,
    stats,
    setMode(next, opts = {}) { cfg.mode = next; flip = 0; for (const k of ['delayMs', 'maxConcurrent', 'content']) if (k in opts) cfg[k] = opts[k]; },
    reset() { Object.assign(stats, { requests: 0, inFlight: 0, maxInFlight: 0, byStatus: {} }); },
    async close() {
      for (const abort of [...pending]) abort();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}
