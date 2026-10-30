import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdmin } from '../server/admin.mjs';
import { until } from './helpers/until.mjs';

const SNAP = { active: 'a', pinned: false, inFlight: 0, queued: 0, maxInFlight: 200, endpoints: [{ name: 'a', model: 'model-a', apiBaseHost: 'a.test', inFlight: 0, maxInFlight: 50, queued: 0, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null, failures5m: 0 }] };
const STATS = { games: 2, waiting: 1, paused: false, byStage: { started: 1, asked: 0, interviewed: 0, verdict: 1 } };

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
  const opened = [];
  return { srv, req, events, opened, ...f, close: () => { for (const s of opened) { s.r.resume(); s.abort(); } srv.close(); srv.closeAllConnections(); } };
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

const CSP_WANT = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const UID = '0123abcd-0000-4000-8000-000000000001';

function fakeMonitor() {
  const subs = new Set();
  const row = { id: 1, at: 1, sessionId: UID, player: '0123', kind: 'start' };
  return {
    subs,
    snapshot: () => ({ at: 1, mode: 'live' }),
    recent: () => [row],
    catalog: () => [{ id: 'c', title: 'C', world: 'w', characters: [] }],
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    startRound(o) { this.round = o; return { label: o.label, startedAt: 777 }; },
    session: (id) => (id === UID ? [row] : null),
    push(r) { for (const f of [...subs]) f(r); },
  };
}

function openStream(a, { host } = {}) {
  return new Promise((resolve, reject) => {
    const lines = [];
    let buf = '';
    const waiters = [];
    const rq = http.request({ host: '127.0.0.1', port: a.srv.address().port, path: '/admin/stream', headers: { authorization: 'Bearer t', ...(host ? { host } : {}) } }, (r) => {
      r.setEncoding('utf8');
      r.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } waiters.splice(0).forEach((w) => w()); });
      const handle = { r, lines, abort: () => rq.destroy(), next: async (pred, ms = 1000) => { const end = Date.now() + ms; for (;;) { const f = lines.find(pred); if (f) return f; if (Date.now() > end) throw new Error('timeout'); await new Promise((ok) => { waiters.push(ok); setTimeout(ok, 20); }); } } };
      a.opened?.push(handle);
      resolve(handle);
    });
    rq.on('error', reject);
    rq.end();
  });
}
// A negative assertion has nothing to poll for, so it gets one short, bounded wait.
const quiet = (ms) => new Promise((r) => setTimeout(r, ms));

test('stream_hello_event_tick', async () => {
  const monitor = fakeMonitor();
  const a = await boot({ monitor, tickMs: 50 });
  const s = await openStream(a);
  assert.equal(s.r.statusCode, 200);
  assert.equal(s.r.headers['content-type'], 'application/x-ndjson');
  assert.equal(s.r.headers['cache-control'], 'no-store');
  const hello = await s.next((l) => l.type === 'hello');
  assert.ok(hello.catalog && hello.snapshot && hello.recent);
  monitor.push({ id: 2, kind: 'question' });
  assert.deepEqual(await s.next((l) => l.type === 'event'), { type: 'event', row: { id: 2, kind: 'question' } });
  await s.next((l) => l.type === 'tick', 300);
  s.abort(); a.close();
});

test('stream_auth', async () => {
  const a = await boot({ monitor: fakeMonitor() });
  assert.equal((await a.req('/admin/stream', { token: null })).status, 401);
  const s = await openStream(a, { host: 'evil.example' });
  assert.equal(s.r.statusCode, 403);
  a.close();
});

test('stream_cap', async () => {
  const a = await boot({ monitor: fakeMonitor() });
  const ss = [];
  for (let i = 0; i < 5; i++) ss.push(await openStream(a));
  const six = await openStream(a);
  assert.equal(six.r.statusCode, 503);
  six.r.resume();
  ss[0].abort();
  let again;
  await until(async function slotFrees() {
    const s = await openStream(a);
    if (s.r.statusCode === 200) { again = s; return true; }
    s.r.resume();
    return false;
  });
  assert.equal(again.r.statusCode, 200);
  again.abort(); ss.forEach((s) => s.abort()); a.close();
});

test('stream_cap error body', async () => {
  const a = await boot({ monitor: fakeMonitor() });
  const ss = [];
  for (let i = 0; i < 5; i++) ss.push(await openStream(a));
  const r = await a.req('/admin/stream');
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: 'Too many admin streams.' });
  ss.forEach((s) => s.abort()); a.close();
});

test('stream_cleanup', async () => {
  const monitor = fakeMonitor();
  const a = await boot({ monitor, tickMs: 20 });
  const s = await openStream(a);
  await s.next((l) => l.type === 'hello');
  assert.equal(monitor.subs.size, 1);
  const snaps = monitor.snapshot;
  let calls = 0;
  monitor.snapshot = () => { calls++; return snaps(); };
  s.abort();
  await until(function unsubscribed() { return monitor.subs.size === 0; });
  const before = calls;
  await quiet(60);
  assert.equal(calls, before);
  a.close();
});

test('stream_no_monitor', async () => {
  const a = await boot();
  for (const [m, p] of [['GET', '/admin/stream'], ['POST', '/admin/round'], ['GET', `/admin/sessions/${UID}`]]) {
    const r = await a.req(p, { method: m, body: m === 'POST' ? { label: 'x' } : undefined });
    assert.equal(r.status, 409, p);
    assert.deepEqual(await r.json(), { error: 'The monitor is off.' });
  }
  a.close();
});

test('round_post', async () => {
  const monitor = fakeMonitor();
  const a = await boot({ monitor });
  const r = await a.req('/admin/round', { method: 'POST', body: { label: 'Session B', reason: 'second class' } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { label: 'Session B', startedAt: 777 });
  const ev = a.events.find((e) => e.type === 'round_started');
  assert.deepEqual({ ...ev, timestamp: typeof ev.timestamp }, { type: 'round_started', timestamp: 'number', label: 'Session B', reason: 'second class', startedAt: 777 });
  for (const label of ['', '   ', 'x'.repeat(61), 5, undefined, null]) {
    const bad = await a.req('/admin/round', { method: 'POST', body: { label } });
    assert.equal(bad.status, 400, String(label));
    assert.deepEqual(await bad.json(), { error: 'Label is required (1-60 characters).' });
  }
  await a.req('/admin/round', { method: 'POST', body: { label: 'L', reason: 'r'.repeat(300) } });
  assert.equal(monitor.round.reason.length, 200);
  assert.equal((await a.req('/admin/round', { method: 'POST', token: null, body: { label: 'L' } })).status, 401);
  a.close();
});

test('session_drilldown', async () => {
  const a = await boot({ monitor: fakeMonitor() });
  const r = await a.req(`/admin/sessions/${UID}`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.sessionId, UID); assert.equal(j.rows.length, 1);
  const none = await a.req('/admin/sessions/ffffffff-0000-4000-8000-000000000000');
  assert.equal(none.status, 404);
  assert.deepEqual(await none.json(), { error: 'No such session.' });
  assert.equal((await a.req('/admin/sessions/abc')).status, 404);
  assert.equal((await a.req(`/admin/sessions/${UID}`, { token: null })).status, 401);
  a.close();
});

test('static_files', async () => {
  const pageDir = mkdtempSync(join(tmpdir(), 'page-'));
  writeFileSync(join(pageDir, 'index.html'), '<!doctype html>hi');
  writeFileSync(join(pageDir, 'app.js'), 'export {};');
  writeFileSync(join(pageDir, 'app.css'), 'body{}');
  const a = await boot({ pageDir });
  for (const [p, type, body] of [['/admin', 'text/html; charset=utf-8', '<!doctype html>hi'], ['/admin/app.js', 'text/javascript; charset=utf-8', 'export {};'], ['/admin/app.css', 'text/css; charset=utf-8', 'body{}']]) {
    const r = await a.req(p, { token: null });
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get('content-type'), type);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await r.text(), body);
  }
  assert.equal((await a.req('/admin/nope.js', { token: null })).status, 401);
  a.close();
});

test('static_missing_dir serves 404 without throwing', async () => {
  const a = await boot({ pageDir: join(tmpdir(), 'does-not-exist-xyz') });
  assert.equal((await a.req('/admin', { token: null })).status, 404);
  assert.equal((await a.req('/admin/health')).status, 200);
  a.close();
});

test('page_csp_strict', async () => {
  const pageDir = mkdtempSync(join(tmpdir(), 'page-'));
  writeFileSync(join(pageDir, 'index.html'), '<!doctype html>');
  const a = await boot({ pageDir });
  const r = await a.req('/admin', { token: null });
  const csp = r.headers.get('content-security-policy');
  assert.equal(csp, CSP_WANT);
  assert.doesNotMatch(csp, /unsafe-inline|http|\*/);
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

test('stream_monitor_throws_hello_drops_client_frees_slot', async () => {
  const monitor = fakeMonitor();
  monitor.snapshot = () => { throw new Error('boom'); };
  const a = await boot({ monitor });
  for (let i = 0; i < 7; i++) {
    await openStream(a).then((s) => new Promise((r) => { s.r.on('close', r); s.r.on('error', r); s.r.resume(); }), () => {});
  }
  monitor.snapshot = () => ({ at: 1 });
  const ok = await openStream(a);
  await ok.next((l) => l.type === 'hello');
  assert.equal(monitor.subs.size, 1);
  ok.abort(); a.close();
});

test('stream_monitor_throws_on_tick_does_not_crash', async () => {
  const monitor = fakeMonitor();
  const a = await boot({ monitor, tickMs: 20 });
  const s = await openStream(a);
  await s.next((l) => l.type === 'hello');
  monitor.snapshot = () => { throw new Error('tick boom'); };
  await until(function dropped() { return monitor.subs.size === 0; });
  assert.equal((await a.req('/admin/health')).status, 200);
  s.abort(); a.close();
});

test('stream_rows_with_line_separators_stay_one_line', async () => {
  const monitor = fakeMonitor();
  const a = await boot({ monitor });
  const s = await openStream(a);
  await s.next((l) => l.type === 'hello');
  const text = 'a b c\nd\re';
  monitor.push({ id: 9, text });
  const ev = await s.next((l) => l.type === 'event');
  assert.equal(ev.row.text, text);
  s.abort(); a.close();
});

test('close_ends_streams', async () => {
  const monitor = fakeMonitor();
  let snaps = 0;
  const snap = monitor.snapshot;
  monitor.snapshot = () => { snaps++; return snap(); };
  const a = await boot({ monitor, tickMs: 20 });
  const s1 = await openStream(a);
  const s2 = await openStream(a);
  await s1.next((l) => l.type === 'hello'); await s2.next((l) => l.type === 'hello');
  const closed = new Promise((r) => a.srv.once('close', r));
  a.srv.close(); a.srv.closeAllConnections();
  await closed;
  assert.equal(monitor.subs?.size ?? monitor.subscribers?.(), 0);
  const n = snaps;
  await quiet(60);
  assert.equal(snaps, n);
});

test('session_drilldown_coins', async () => {
  const withSpend = { ...fakeMonitor(), sessionCoins: () => ({ spent: 7, budget: 12 }) };
  const a = await boot({ monitor: withSpend });
  assert.deepEqual((await (await a.req(`/admin/sessions/${UID}`)).json()).coins, { spent: 7, budget: 12 });
  a.close();
  const old = await boot({ monitor: fakeMonitor() }); // no sessionCoins: old-format session
  assert.deepEqual((await (await old.req(`/admin/sessions/${UID}`)).json()).coins, { spent: 0, budget: null });
  old.close();
});

// The shipped page files, served for real: static, safe, secret-free.
const PAGE_DIR = new URL('../server/admin/', import.meta.url);
const PAGE_FILES = readdirSync(PAGE_DIR);
const pageText = (f) => readFileSync(new URL(f, PAGE_DIR), 'utf8');
const pageUrl = (f) => (f === 'index.html' ? '/admin' : `/admin/${f}`);

test('page directory has the expected files', () => {
  for (const f of ['index.html', 'app.js', 'tiles.js', 'log.js', 'round.js', 'controls.js']) assert.ok(PAGE_FILES.includes(f), f);
});

test('every served file is safe, static and secret-free', async () => {
  const token = 'secret-token-9f3a';
  const router = { snapshot: () => ({ active: 'zeta', pinned: false, inFlight: 0, queued: 0, maxInFlight: 5, endpoints: [{ name: 'zeta', model: 'model-zeta-77', apiBaseHost: 'llm.zeta-host.example' }] }) };
  const investigations = { stats: () => ({ games: 0, waiting: 0, paused: false, byStage: {} }), setPaused() {} };
  const server = createAdmin({ token, router, investigations, registry: { render: () => '' }, dataDir: mkdtempSync(join(tmpdir(), 'admin-files-')) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let usesTextContent = false;
    for (const f of PAGE_FILES) {
      const r1 = await fetch(base + pageUrl(f));
      assert.equal(r1.status, 200, f);
      const a = Buffer.from(await r1.arrayBuffer());
      const b = Buffer.from(await (await fetch(base + pageUrl(f))).arrayBuffer());
      assert.ok(a.equals(b), `${f} differs between requests`);
      const text = a.toString('utf8');
      assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(text), `${f} uses a banned API`);
      for (const secret of [token, 'model-zeta-77', 'zeta-host']) assert.ok(!text.includes(secret), `${f} leaks ${secret}`);
      if (f.endsWith('.html')) {
        assert.ok(!/style\s*=/.test(text), 'inline style in html');
        assert.ok(!/<script(?![^>]*\bsrc=)/.test(text), 'inline script in html');
        for (const m of text.matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/g)) assert.ok(m[1].startsWith('/admin/') || m[1].startsWith('#'), `external ref ${m[1]}`);
      }
      if (f.endsWith('.css')) assert.ok(!/https?:|@import/.test(text), `${f} references a network origin`);
      if (f.endsWith('.js') && text.includes('textContent')) usesTextContent = true;
    }
    assert.ok(usesTextContent, 'no .js file uses textContent');
  } finally { await new Promise((r) => { server.close(r); server.closeAllConnections?.(); }); }
});

test('app.css is dark only on the deep token', () => {
  const css = pageText('app.css');
  assert.ok(!css.includes('prefers-color-scheme'));
  assert.match(css, /--bg:\s*#0B151B/i);
  assert.ok(!/font-family:[^;]*(Atkinson|googleapis)/.test(css));
});

test('index.html carries the watch banner, the big-screen link and the command-centre title', () => {
  const html = pageText('index.html');
  assert.match(html, /<section id="watch" hidden><\/section>/);
  assert.match(html, /<a id="board-link"[^>]*target="_blank"[^>]*rel="noreferrer"[^>]*hidden>big-screen ↗<\/a>/);
  assert.match(html, /<h1>command-centre<\/h1>/);
  assert.ok(!/<script[^>]*watch\.js/.test(html), 'watch.js loads through app.js');
});

test('healthy tile values are plain light text, problems keep colour', () => {
  const css = pageText('tiles.css');
  assert.match(css, /\[data-level="ok"\] \.tile-v \{ color: #E8EEF0;/);
  assert.match(css, /\[data-level="warn"\] \.tile-v \{ color: var\(--gold\)/);
  assert.match(css, /\[data-level="bad"\] \.tile-v \{ color: var\(--bad\)/);
});
