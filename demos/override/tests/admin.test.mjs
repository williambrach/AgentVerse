import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdmin } from '../server/admin.mjs';

const SNAP = { active: 'a', pinned: false, inFlight: 0, queued: 0, maxInFlight: 200, endpoints: [{ name: 'a', model: 'model-a', apiBaseHost: 'a.test', inFlight: 0, maxInFlight: 50, queued: 0, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null, failures5m: 0 }] };
const STATS = { games: 2, waiting: 1, paused: false, byStage: { started: 1, clues: 0, interviewed: 0, verdict: 1 } };

function fakes() {
  const calls = [];
  const router = {
    snapshot: () => SNAP,
    setActive(name, opts) { if (name === 'zz') throw new Error('Unknown endpoint zz.'); if (!opts.reason) throw new Error('A reason is required.'); calls.push(['active', name, opts]); return { ...SNAP, active: name, pinned: !!opts.pinned }; },
    setCap(o) { calls.push(['cap', o]); return SNAP; },
    async probe(name) { calls.push(['probe', name]); return { ok: true, endpoint: name, durationMs: 420, content: 'ready', reason: null }; },
  };
  const investigations = { stats: () => STATS, setPaused(p) { calls.push(['pause', p]); } };
  const registry = { render: () => '# TYPE x_total counter\nx_total 1\n' };
  return { router, investigations, registry, calls };
}

async function boot(over = {}) {
  const f = fakes();
  const events = [];
  const srv = createAdmin({ token: 't', dataDir: mkdtempSync(join(tmpdir(), 'adm-')), probeMessages: [{ role: 'user', content: 'hi' }], readSystem: () => Array.from({ length: 30 }, (_, i) => ({ i })), onSystem: (e) => events.push(e), ...f, ...over });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const req = (path, { method = 'GET', body, token = 't', raw } = {}) => fetch(base + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  return { srv, req, events, ...f, close: () => { srv.close(); srv.closeAllConnections(); } };
}

test('empty_token_throws', () => {
  assert.throws(() => createAdmin({ token: '', ...fakes() }));
  assert.throws(() => createAdmin({ ...fakes() }));
});

test('wrong_token_401 on every route except GET /admin', async () => {
  const a = await boot();
  for (const [m, p] of [['GET', '/admin/health'], ['GET', '/metrics'], ['POST', '/admin/llm/active'], ['POST', '/admin/llm/probe'], ['POST', '/admin/llm/cap'], ['POST', '/admin/sessions/pause']]) {
    for (const token of ['wrong', null, 'tt']) {
      const r = await a.req(p, { method: m, token, body: m === 'POST' ? {} : undefined });
      assert.equal(r.status, 401, `${m} ${p}`);
    }
  }
  assert.equal((await a.req('/admin', { token: null })).status, 200);
  assert.equal(a.calls.length, 0);
  a.close();
});

test('health shape', async () => {
  const a = await boot();
  const r = await a.req('/admin/health');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.dataWritable, true);
  assert.equal(typeof j.diskFreeBytes, 'number');
  assert.deepEqual(j.router, SNAP);
  assert.deepEqual(j.sessions, STATS);
  assert.equal(j.recentSystem.length, 20);
  assert.equal(j.recentSystem.at(-1).i, 29);
  a.close();
});

test('router_null_rehearsal', async () => {
  const a = await boot({ router: null });
  const j = await (await a.req('/admin/health')).json();
  assert.equal(j.router, null);
  for (const p of ['/admin/llm/active', '/admin/llm/probe', '/admin/llm/cap']) {
    const r = await a.req(p, { method: 'POST', body: { endpoint: 'a', reason: 'x', value: 3 } });
    assert.equal(r.status, 409);
    assert.deepEqual(await r.json(), { error: 'Live LLM mode is off.' });
  }
  assert.equal((await a.req('/admin/sessions/pause', { method: 'POST', body: { paused: true } })).status, 200);
  a.close();
});

test('active move + pin', async () => {
  const a = await boot();
  const r = await a.req('/admin/llm/active', { method: 'POST', body: { endpoint: 'b', pinned: true, reason: 'A slow' } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.active, 'b'); assert.equal(j.pinned, true);
  assert.deepEqual(a.calls[0], ['active', 'b', { pinned: true, reason: 'A slow', by: 'admin' }]);
  a.close();
});

test('unknown_endpoint_400', async () => {
  const a = await boot();
  const r = await a.req('/admin/llm/active', { method: 'POST', body: { endpoint: 'zz', reason: 'x' } });
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: 'Unknown endpoint zz.' });
  const r2 = await a.req('/admin/llm/active', { method: 'POST', body: { endpoint: 'a' } });
  assert.equal(r2.status, 400);
  assert.deepEqual(await r2.json(), { error: 'A reason is required.' });
  a.close();
});

test('cap_validation_400 and cap_logged', async () => {
  const a = await boot();
  for (const value of [0, 'x', 1.5, 1001, null, -1]) {
    const r = await a.req('/admin/llm/cap', { method: 'POST', body: { endpoint: 'a', value } });
    assert.equal(r.status, 400, String(value));
  }
  assert.equal(a.calls.length, 0);
  const ok = await a.req('/admin/llm/cap', { method: 'POST', body: { endpoint: null, value: 40 } });
  assert.equal(ok.status, 200);
  assert.deepEqual(a.calls[0], ['cap', { endpoint: null, value: 40 }]);
  assert.equal(a.events[0].type, 'admin_action'); assert.equal(a.events[0].action, 'cap'); assert.equal(a.events[0].value, 40);
  a.close();
});

test('probe logged', async () => {
  const a = await boot();
  const r = await a.req('/admin/llm/probe', { method: 'POST', body: { endpoint: 'b' } });
  assert.deepEqual(await r.json(), { ok: true, endpoint: 'b', durationMs: 420, content: 'ready', reason: null });
  assert.deepEqual(a.calls[0], ['probe', 'b']);
  assert.equal(a.events[0].action, 'probe'); assert.equal(a.events[0].endpoint, 'b');
  assert.equal(typeof a.events[0].timestamp, 'number');
  a.close();
});

test('pause_logged', async () => {
  const a = await boot();
  const r = await a.req('/admin/sessions/pause', { method: 'POST', body: { paused: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(a.calls[0], ['pause', true]);
  assert.equal(a.events[0].type, 'admin_action'); assert.equal(a.events[0].action, 'pause'); assert.equal(a.events[0].paused, true);
  assert.equal((await a.req('/admin/sessions/pause', { method: 'POST', body: { paused: 'yes' } })).status, 400);
  a.close();
});

test('body_limit_413', async () => {
  const a = await boot();
  const r = await a.req('/admin/sessions/pause', { method: 'POST', raw: JSON.stringify({ paused: true, pad: 'x'.repeat(16 * 1024) }) });
  assert.equal(r.status, 413);
  a.close();
});

test('bad json 400, unknown route 404, wrong method 405', async () => {
  const a = await boot();
  assert.equal((await a.req('/admin/sessions/pause', { method: 'POST', raw: '{nope' })).status, 400);
  assert.equal((await a.req('/admin/nothing')).status, 404);
  assert.equal((await a.req('/admin/health', { method: 'POST', body: {} })).status, 405);
  a.close();
});

test('metrics_content_type', async () => {
  const a = await boot();
  const r = await a.req('/metrics');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/plain; version=0.0.4');
  assert.equal(await r.text(), '# TYPE x_total counter\nx_total 1\n');
  a.close();
});

test('page: csp, no data, textContent', async () => {
  const a = await boot();
  const r = await a.req('/admin', { token: null });
  assert.match(r.headers.get('content-type'), /^text\/html/);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /https?:|\*/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const html = await r.text();
  // page_has_no_data: static, contains neither token nor live state
  assert.ok(!html.includes('"t"') && !html.includes('model-a') && !html.includes('a.test'));
  assert.equal(html, await (await a.req('/admin', { token: null })).text());
  // page_uses_textContent
  assert.ok(html.includes('textContent'));
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(html));
  assert.ok(!/src=["']?https?:|href=["']?https?:/.test(html));
  a.close();
});

test('rejects foreign Host header and accepts lowercase bearer', async () => {
  const a = await boot();
  const res = await new Promise((resolve) => {
    const rq = http.request({ host: '127.0.0.1', port: a.srv.address().port, path: '/admin', headers: { host: 'evil.example' } }, (r) => { r.resume(); resolve(r.statusCode); });
    rq.end();
  });
  assert.equal(res, 403);
  const ok = await fetch(`http://127.0.0.1:${a.srv.address().port}/admin/health`, { headers: { authorization: 'bearer t' } });
  assert.equal(ok.status, 200);
  a.close();
});
