import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWatch } from '../server/admin/watch.js';
import { createAdmin } from '../server/admin.mjs';

class El {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.className = ''; this._text = ''; this.hidden = false; this.handlers = {}; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, f) { this.handlers[t] = f; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
}
const doc = { createElement(t) { return new El(t, doc); } };
const root = () => new El('div', doc);
const MIN = 60_000;

test('failover within 5 minutes shows WATCH, time and active endpoint', () => {
  const r = root();
  renderWatch(r, { traffic: { failoverAt: 1_000_000, active: 'backup' } }, 1_000_000 + 2 * MIN);
  assert.equal(r.hidden, false);
  assert.match(r.textContent, /WATCH/);
  assert.match(r.textContent, /Failover 00:16:40 UTC \(2 min ago\)/);
  assert.match(r.textContent, /Active backup/);
});

test('stale_failover: older than 5 minutes or none hides the banner', () => {
  const r = root();
  renderWatch(r, { traffic: { failoverAt: 1_000_000, active: 'a' } }, 1_000_000 + 5 * MIN + 1);
  assert.equal(r.hidden, true);
  renderWatch(r, { traffic: { failoverAt: null } }, 5);
  assert.equal(r.hidden, true);
  renderWatch(r, {}, 5);
  assert.equal(r.hidden, true);
});

test('the example snapshot shape (trends.failoverAt) shows WATCH', () => {
  const r = root();
  renderWatch(r, { trends: { failoverAt: 1000 } }, 2000);
  assert.equal(r.hidden, false);
  assert.match(r.textContent, /WATCH/);
});

test('probe button posts the active endpoint', async () => {
  const r = root();
  const calls = [];
  renderWatch(r, { traffic: { failoverAt: 10, active: 'b' } }, 20, { api: async (p, b) => { calls.push([p, b]); return { ok: true }; } });
  const btn = r.children.find((c) => c.tagName === 'button');
  btn.handlers.click();
  await new Promise((x) => setTimeout(x, 0));
  assert.deepEqual(calls, [['/admin/llm/probe', { endpoint: 'b' }]]);
  assert.equal(btn.textContent, 'Probe ok');
});

test('GET /admin/links returns { board } with auth, 401 without', async () => {
  const srv = createAdmin({ token: 't', investigations: { stats: () => ({}) }, registry: { render: () => '' }, dataDir: '.', boardUrl: 'http://x.test/?view=board' });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/admin/links`;
  try {
    const ok = await fetch(url, { headers: { authorization: 'Bearer t' } });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { board: 'http://x.test/?view=board' });
    assert.equal((await fetch(url)).status, 401);
  } finally { srv.close(); srv.closeAllConnections(); }
});

test('boardUrlOf accepts http(s) only, strips credentials-free trailing slash, falls back to loopback', async () => {
  const { boardUrlOf } = await import('../server/index.mjs');
  assert.equal(boardUrlOf('https://o.example.org/', 1), 'https://o.example.org/?view=board');
  assert.equal(boardUrlOf('', 4000), 'http://127.0.0.1:4000/?view=board');
  assert.equal(boardUrlOf(undefined, undefined), 'http://127.0.0.1:3001/?view=board');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x', 'nonsense', 'https://u:p@x.test']) {
    assert.throws(() => boardUrlOf(bad, 1), /http or https/, bad);
  }
});
