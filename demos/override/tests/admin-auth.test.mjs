import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdmin } from '../server/admin.mjs';
import { signToken, verifyToken } from '../server/identity.mjs';
import { adminSecret, adminTrustProxy, createApp } from '../server/index.mjs';

const SECRET = 'srv-secret';
const content = {
  list: () => [], info: () => ({}), uiText: () => ({}),
  publish(id, edits, { by, baseRev }) { content.last = { id, edits, by, baseRev }; return { rev: baseRev + 1, contentHash: 'h', fields: Object.keys(edits) }; },
};

async function boot(over = {}) {
  const events = [];
  const srv = createAdmin({
    token: 'pw', secret: SECRET, dataDir: mkdtempSync(join(tmpdir(), 'auth-')), content,
    investigations: { stats: () => ({}), setPaused() {} }, registry: { render: () => 'x 1\n' },
    monitor: { startRound: () => ({ startedAt: 1 }) }, onSystem: e => events.push(e), ...over,
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;
  const call = (path, { method = 'GET', body, headers = {} } = {}) => fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const login = async (password = 'pw') => {
    const r = await call('/admin/login', { method: 'POST', body: { password } });
    return { r, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
  };
  return { srv, events, call, login, port, close: () => { srv.close(); srv.closeAllConnections(); } };
}

test('login_cookie', async t => {
  const a = await boot(); t.after(a.close);
  const { r } = await a.login();
  assert.equal(r.status, 204);
  const sc = r.headers.get('set-cookie');
  assert.match(sc, /^override_admin=[^;]+; HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200$/);
});

test('login_wrong', async t => {
  const a = await boot(); t.after(a.close);
  const { r } = await a.login('nope');
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: 'Wrong password.' });
  assert.equal(r.headers.get('set-cookie'), null);
});

test('login_throttle', async t => {
  const a = await boot(); t.after(a.close);
  for (let i = 0; i < 10; i++) assert.equal((await a.login('bad')).r.status, 401);
  const r = (await a.login('bad')).r;
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: 'Too many attempts. Try again in a minute.' });
  assert.equal((await a.login('pw')).r.status, 429, 'the right password is blocked while throttled');
});

test('cookie_session', async t => {
  const a = await boot(); t.after(a.close);
  const { cookie } = await a.login();
  const ok = await a.call('/admin/session', { headers: { cookie } });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { signedIn: true });
  assert.equal((await a.call('/admin/session')).status, 401);
  assert.equal((await a.call('/admin/health', { headers: { cookie } })).status, 200);
});

test('bearer_ok', async t => {
  const a = await boot(); t.after(a.close);
  const h = { authorization: 'Bearer pw' };
  assert.equal((await a.call('/admin/health', { headers: h })).status, 200);
  assert.equal((await a.call('/metrics', { headers: h })).status, 200);
  assert.equal((await a.call('/metrics', { headers: { authorization: 'Bearer no' } })).status, 401);
});

test('csrf', async t => {
  const a = await boot(); t.after(a.close);
  const { cookie } = await a.login();
  const post = headers => a.call('/admin/round', { method: 'POST', body: { label: 'r1' }, headers: { cookie, ...headers } });
  for (const h of [{ 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { origin: 'http://evil.test' }, { origin: 'http://evil.test', 'sec-fetch-site': 'same-origin' }]) {
    const r = await post(h);
    assert.equal(r.status, 403, JSON.stringify(h));
    assert.deepEqual(await r.json(), { error: 'Cross-site requests are not allowed.' });
  }
  assert.equal((await post({ 'sec-fetch-site': 'same-origin' })).status, 200);
  assert.equal((await post({ origin: `http://127.0.0.1:${a.port}` })).status, 200);
  assert.equal((await post({})).status, 200, 'absent headers are allowed');
  // Bearer skips CSRF; GET with cookie skips it too.
  const b = await a.call('/admin/round', { method: 'POST', body: { label: 'r2' }, headers: { authorization: 'Bearer pw', 'sec-fetch-site': 'cross-site' } });
  assert.equal(b.status, 200);
  assert.equal((await a.call('/admin/health', { headers: { cookie, 'sec-fetch-site': 'cross-site' } })).status, 200);
});

test('player_token_rejected', async t => {
  const a = await boot(); t.after(a.close);
  const forged = signToken(SECRET, Date.now() + 60_000);
  assert.equal((await a.call('/admin/session', { headers: { cookie: `override_admin=${forged}` } })).status, 401);
  assert.equal((await a.call('/admin/session', { headers: { cookie: 'override_admin=garbage' } })).status, 401);
});

test('password_change', async t => {
  const a = await boot({ token: 'pw1' }); t.after(a.close);
  const b = await boot({ token: 'pw2' }); t.after(b.close);
  const { cookie } = await a.login('pw1');
  assert.equal((await a.call('/admin/session', { headers: { cookie } })).status, 200);
  assert.equal((await b.call('/admin/session', { headers: { cookie } })).status, 401);
});

test('logout', async t => {
  const a = await boot(); t.after(a.close);
  const { cookie } = await a.login();
  const r = await a.call('/admin/logout', { method: 'POST', body: {}, headers: { cookie } });
  assert.equal(r.status, 204);
  assert.match(r.headers.get('set-cookie'), /^override_admin=; .*Max-Age=0/);
});

test('by_admin', async t => {
  const a = await boot(); t.after(a.close);
  const { cookie } = await a.login();
  const r = await a.call('/admin/content/banana-mystery', { method: 'PUT', body: { edits: { title: 'x' }, baseRev: 0 }, headers: { cookie } });
  assert.equal(r.status, 200);
  assert.equal(content.last.by, 'admin');
  assert.equal(a.events.find(e => e.action === 'content_published').by, 'admin');
});

test('game_preview_409', async t => {
  const a = await boot(); t.after(a.close);
  for (const sub of ['preview', 'try']) {
    const r = await a.call(`/admin/content/game/${sub}`, { method: 'POST', body: { edits: {} }, headers: { authorization: 'Bearer pw' } });
    assert.equal(r.status, 409);
    assert.deepEqual(await r.json(), { error: 'Preview works on a case.' });
  }
});

test('token_helpers: purpose separates MACs', () => {
  const exp = Date.now() + 1000;
  assert.equal(verifyToken('s', signToken('s', exp), Date.now()), true);
  assert.equal(verifyToken('s', signToken('s', exp, 'other'), Date.now()), false);
  assert.equal(verifyToken('s', signToken('s', exp, 'other'), Date.now(), 'other'), true);
  assert.equal(verifyToken('s', signToken('s', exp), Date.now(), 'other'), false);
});

test('adminSecret', () => {
  assert.deepEqual(adminSecret({ OVERRIDE_ADMIN_PASSWORD: 'pw' }), { password: 'pw', warnings: [] });
  assert.deepEqual(adminSecret({ OVERRIDE_ADMIN_TOKEN: 't' }), { password: 't', warnings: ['OVERRIDE_ADMIN_TOKEN is deprecated; use OVERRIDE_ADMIN_PASSWORD.'] });
  assert.deepEqual(adminSecret({}), { password: null, warnings: [] });
  assert.throws(() => adminSecret({ OVERRIDE_ADMIN_PASSWORD: 'a', OVERRIDE_ADMIN_TOKEN: 'b' }), { message: 'OVERRIDE_ADMIN_PASSWORD and OVERRIDE_ADMIN_TOKEN differ; set only OVERRIDE_ADMIN_PASSWORD.' });
  assert.deepEqual(adminSecret({ OVERRIDE_ADMIN_PASSWORD: 'pw', OVERRIDE_MAKER_TOKENS: 'a:b' }).warnings, ['OVERRIDE_MAKER_TOKENS is ignored: one admin password opens the admin panel.']);
});

test('api_text_public', async t => {
  const server = createApp({ investigations: {}, accessCode: 'code', staticFiles: new Map(), text: () => ({ 'hud.notebook': 'Book' }) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.close(); server.closeAllConnections(); });
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/text`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /no-cache/);
  assert.deepEqual(await r.json(), { text: { 'hud.notebook': 'Book' } });
});

test('list_includes_game_doc', async t => {
  const c = { ...content, list: () => [{ id: 'a' }], info: id => ({ id, title: id === 'game' ? 'Game text' : id }) };
  const a = await boot({ content: c }); t.after(a.close);
  const r = await a.call('/admin/content', { headers: { authorization: 'Bearer pw' } });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).cases.map(x => x.id), ['a', 'game']);
});

test('logout_csrf', async t => {
  const a = await boot(); t.after(a.close);
  const { cookie } = await a.login();
  for (const h of [{ 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { origin: 'http://evil.test' }]) {
    const r = await a.call('/admin/logout', { method: 'POST', body: {}, headers: { cookie, ...h } });
    assert.equal(r.status, 403, JSON.stringify(h));
    assert.deepEqual(await r.json(), { error: 'Cross-site requests are not allowed.' });
    assert.equal(r.headers.get('set-cookie'), null, 'cookie untouched');
  }
  const ok = await a.call('/admin/logout', { method: 'POST', body: {}, headers: { cookie, 'sec-fetch-site': 'same-origin' } });
  assert.equal(ok.status, 204);
  assert.match(ok.headers.get('set-cookie'), /Max-Age=0/);
});

test('no_maker_tokens', async () => {
  const index = await import('../server/index.mjs');
  assert.equal('makerTokens' in index, false);
});

test('bearer_guesses_throttled', async t => {
  const a = await boot(); t.after(a.close);
  for (let i = 0; i < 60; i++) assert.equal((await a.call('/metrics', { headers: { authorization: 'Bearer nope' } })).status, 401);
  assert.equal((await a.call('/metrics', { headers: { authorization: 'Bearer nope' } })).status, 429);
  assert.equal((await a.call('/metrics', { headers: { authorization: 'Bearer pw' } })).status, 429, 'locked out, even with the right password');
  assert.equal((await a.login('pw')).r.status, 204, 'the sign-in window is separate');
});

test('login_csrf', async t => {
  const a = await boot(); t.after(a.close);
  for (const h of [{ 'sec-fetch-site': 'cross-site' }, { origin: 'http://evil.test' }]) {
    const r = await a.call('/admin/login', { method: 'POST', body: { password: 'pw' }, headers: h });
    assert.equal(r.status, 403, JSON.stringify(h));
    assert.equal(r.headers.get('set-cookie'), null);
  }
});

test('secure_behind_trusted_proxy', async t => {
  const a = await boot({ trustProxy: true }); t.after(a.close);
  const r = await a.call('/admin/login', { method: 'POST', body: { password: 'pw' }, headers: { 'x-forwarded-proto': 'https' } });
  assert.match(r.headers.get('set-cookie'), /; Secure$/);
});

test('no_secure_untrusted', async t => {
  const a = await boot({ trustProxy: false }); t.after(a.close);
  const r = await a.call('/admin/login', { method: 'POST', body: { password: 'pw' }, headers: { 'x-forwarded-proto': 'https' } });
  assert.doesNotMatch(r.headers.get('set-cookie'), /Secure/);
});

const lg = (a, ip, password) => a.call('/admin/login', { method: 'POST', body: { password }, headers: { 'x-forwarded-for': ip } }).then(r => r.status);

test('throttle_per_forwarded_client', async t => {
  const a = await boot({ trustProxy: true }); t.after(a.close);
  for (let i = 0; i < 10; i++) assert.equal(await lg(a, '203.0.113.1', 'bad'), 401);
  assert.equal(await lg(a, '203.0.113.2', 'pw'), 204);
  assert.equal(await lg(a, '203.0.113.1', 'bad'), 429);
});

test('throttle_ignores_header_untrusted', async t => {
  const a = await boot({ trustProxy: false }); t.after(a.close);
  for (let i = 0; i < 10; i++) assert.equal(await lg(a, `203.0.113.${i + 1}`, 'bad'), 401);
  assert.equal(await lg(a, '203.0.113.99', 'bad'), 429);
});

test('admin_trust_is_separate', () => {
  assert.equal(adminTrustProxy({}), false);
  assert.equal(adminTrustProxy({ OVERRIDE_TRUST_PROXY: '1' }), false);
  assert.equal(adminTrustProxy({ OVERRIDE_ADMIN_TRUST_PROXY: '1' }), true);
  assert.equal(adminTrustProxy({ OVERRIDE_ADMIN_TRUST_PROXY: 'TRUE' }), true);
});
