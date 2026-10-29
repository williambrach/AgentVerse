import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, startServer } from '../server/index.mjs';
import { startMockLlm } from './mock-llm.mjs';
import { Investigations } from '../server/session.mjs';
import { modelConfig } from '../server/interviews.mjs';

test('HTTP access protects state and exports; malformed requests and cross-site writes are rejected', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-http-'));
  const app = createApp({ investigations: new Investigations({ dataDir: dir, config: modelConfig({}) }), accessCode: 'colleague-code', secret: 'test-secret' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.address().port}`;
  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  assert.equal((await fetch(`${base}/api/events`)).status, 401);
  const login = await fetch(`${base}/api/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'colleague-code' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { 'Content-Type': 'application/json', Cookie: cookie };
  assert.equal((await fetch(`${base}/api/start`, { method: 'POST', headers, body: '[]' })).status, 400);
  assert.equal((await fetch(`${base}/api/start`, { method: 'POST', headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' }, body: '{}' })).status, 403);
  const start = await fetch(`${base}/api/start`, { method: 'POST', headers, body: '{}' });
  assert.equal(start.status, 200);
  const state = await start.json();
  assert.equal(state.mode, 'rehearsal');
  assert.equal('records' in state, false);
  for (const gone of ['reveal', 'evidence']) {
    const r = await fetch(`${base}/api/${gone}`, { method: 'POST', headers, body: '{}' });
    assert.equal(r.status, 404);
    assert.match((await r.json()).error, /Unknown endpoint\./);
  }
  assert.equal(state.debrief, null);
  const session = start.headers.get('set-cookie').split(';')[0];
  assert.equal(session, `override_session=${state.session.id}`);
  assert.equal((await fetch(`${base}/api/events`, { headers: { Cookie: cookie } })).status, 404);
  const exported = await fetch(`${base}/api/events`, { headers: { Cookie: `${cookie}; ${session}` } });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('content-disposition'), /attachment/);
  assert.equal((await exported.text()).trim().split('\n').length, 2);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/server/case.mjs`)).status, 404);
});

test('each browser plays its own investigation, and correct sign-ins never count toward the limit', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-http-'));
  let finish;
  const answer = (config, kase, session, character) => character === 'pip' ? new Promise(resolve => { finish = resolve; }) : 'I never heard the bell.';
  const app = createApp({ investigations: new Investigations({ dataDir: dir, config: modelConfig({}), answer }), accessCode: 'colleague-code', secret: 'test-secret' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.address().port}`;
  const login = code => fetch(`${base}/api/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const players = [];
  for (let i = 0; i < 40; i++) {
    const response = await login('colleague-code');
    assert.equal(response.status, 200);
    players.push({ cookie: response.headers.get('set-cookie').split(';')[0] });
  }
  const post = async (player, action, body = {}) => {
    const response = await fetch(`${base}/api/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: player.cookie }, body: JSON.stringify({ sessionId: player.state?.session.id, revision: player.state?.session.revision, ...body }) });
    const session = response.headers.get('set-cookie')?.split(';')[0];
    if (session) player.cookie = `${player.cookie.split('; ')[0]}; ${session}`;
    const data = await response.json();
    if (response.ok) player.state = data;
    return { status: response.status, data };
  };
  const [first, second] = players;
  await post(first, 'start');
  await post(second, 'start');
  assert.notEqual(first.state.session.id, second.state.session.id);
  // One player's pending answer does not block another player's game.
  const pending = post(first, 'interview', { character: 'pip', question: 'Who told you?' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await post(second, 'interview', { character: 'nori', question: 'Did you hear the bell?' })).status, 200);
  assert.equal((await post(first, 'visit', { location: 'report' })).status, 409);
  finish('Momo told me.');
  assert.equal((await pending).status, 200);
  const firstView = await (await fetch(`${base}/api/state`, { headers: { Cookie: first.cookie } })).json();
  const secondView = await (await fetch(`${base}/api/state`, { headers: { Cookie: second.cookie } })).json();
  assert.deepEqual([firstView.session.interviews.pip.length, firstView.session.interviews.nori.length], [1, 0]);
  assert.deepEqual([secondView.session.interviews.pip.length, secondView.session.interviews.nori.length], [0, 1]);
  const exported = await (await fetch(`${base}/api/events`, { headers: { Cookie: second.cookie } })).text();
  assert.ok(exported.trim().split('\n').every(line => JSON.parse(line).sessionId === second.state.session.id));
  // A reset issues a new session cookie; the other player is unaffected.
  const before = first.state.session.id;
  await post(first, 'reset');
  assert.notEqual(first.state.session.id, before);
  assert.match(first.cookie, new RegExp(`override_session=${first.state.session.id}`));
  assert.equal((await (await fetch(`${base}/api/state`, { headers: { Cookie: second.cookie } })).json()).session.revision, second.state.session.revision);
  // Forged or unknown session cookies show no case instead of reading the disk.
  assert.equal((await (await fetch(`${base}/api/state`, { headers: { Cookie: `${players[2].cookie}; override_session=../../etc/passwd` } })).json()).session, null);
  for (let i = 0; i < 30; i++) assert.equal((await login('wrong')).status, 401);
  assert.equal((await login('colleague-code')).status, 429);
});

const json = { 'Content-Type': 'application/json' };
const tmp = t => { const dir = mkdtempSync(join(tmpdir(), 'override-http-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
const boot = async (t, env, opts) => {
  const dir = tmp(t);
  const running = await startServer({ PORT: '0', OVERRIDE_ADMIN_PORT: '0', OVERRIDE_DATA_DIR: dir, OVERRIDE_ENV: 'test', OVERRIDE_SECRET: 'secret-one', ...env }, opts);
  t.after(() => running.close());
  return { ...running, dir };
};
const login = (url, code, headers = {}) => fetch(`${url}/api/access`, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify({ code }) });
const rawGet = (url, headers) => new Promise((resolve, reject) => http.get(url, { headers }, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ res, body: Buffer.concat(chunks) })); }).on('error', reject));

test('signin_survives_restart: a token stays valid for the same secret and not for another', async t => {
  const env = { OVERRIDE_ACCESS_CODE: 'colleague-code' };
  const first = await boot(t, env);
  const cookie = (await login(first.url, 'colleague-code')).headers.get('set-cookie').split(';')[0];
  assert.equal((await (await fetch(`${first.url}/api/access`, { headers: { Cookie: cookie } })).json()).authorized, true);
  await first.close();
  const same = await boot(t, env);
  assert.equal((await (await fetch(`${same.url}/api/access`, { headers: { Cookie: cookie } })).json()).authorized, true);
  const other = await boot(t, { ...env, OVERRIDE_SECRET: 'secret-two' });
  assert.equal((await (await fetch(`${other.url}/api/access`, { headers: { Cookie: cookie } })).json()).authorized, false);
  assert.equal((await (await fetch(`${same.url}/api/access`, { headers: { Cookie: 'override_access=9999999999999.deadbeef' } })).json()).authorized, false);
});

test('trust_proxy_per_client: each proxied address has its own failure budget, and spoofed headers are ignored without the flag', async t => {
  const trusted = await boot(t, { OVERRIDE_ACCESS_CODE: 'colleague-code', OVERRIDE_TRUST_PROXY: '1' });
  for (let i = 0; i < 30; i++) assert.equal((await login(trusted.url, 'wrong', { 'CF-Connecting-IP': '1.1.1.1' })).status, 401);
  assert.equal((await login(trusted.url, 'wrong', { 'CF-Connecting-IP': '1.1.1.1' })).status, 429);
  assert.equal((await login(trusted.url, 'wrong', { 'CF-Connecting-IP': '1.1.1.2' })).status, 401);
  assert.equal((await login(trusted.url, 'colleague-code', { 'X-Forwarded-For': '1.1.1.3, 10.0.0.1' })).status, 200);
  const direct = await boot(t, { OVERRIDE_ACCESS_CODE: 'colleague-code' });
  for (let i = 0; i < 30; i++) await login(direct.url, 'wrong', { 'CF-Connecting-IP': `2.2.2.${i}` });
  assert.equal((await login(direct.url, 'wrong', { 'CF-Connecting-IP': '2.2.3.1' })).status, 429);
});

test('health_public: /api/health needs no sign-in and says only ok', async t => {
  const server = await boot(t, { OVERRIDE_ACCESS_CODE: 'colleague-code' });
  const response = await fetch(`${server.url}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal((await fetch(`${server.url}/api/state`)).status, 401);
});

test('backlog_1024: the player listener asks for a 1024 backlog', async t => {
  const original = http.Server.prototype.listen;
  const calls = [];
  http.Server.prototype.listen = function (...args) { calls.push(args); return original.apply(this, args); };
  let running;
  try { running = await boot(t, {}); } finally { http.Server.prototype.listen = original; }
  assert.ok(calls.some(args => args.includes(1024)), JSON.stringify(calls));
  assert.equal(calls.filter(args => args.includes('127.0.0.1')).length, calls.length, 'nothing listens beyond loopback by default');
  assert.ok(running.url.startsWith('http://127.0.0.1:'));
});

test('static_gzip: files are served from memory, compressed on request, with a 404 for the rest', async t => {
  const publicDir = join(tmp(t), 'public');
  mkdirSync(publicDir);
  writeFileSync(join(publicDir, 'index.html'), `<html>${'banana '.repeat(500)}</html>`);
  const server = await boot(t, { OVERRIDE_ADMIN_TOKEN: 'admin-token' }, { publicDir });
  const gz = await rawGet(`${server.url}/`, { 'Accept-Encoding': 'gzip' });
  assert.equal(gz.res.headers['content-encoding'], 'gzip');
  assert.match(gz.res.headers['cache-control'], /no-cache/);
  const plain = await rawGet(`${server.url}/`, {});
  assert.equal(plain.res.headers['content-encoding'], undefined);
  assert.match(plain.body.toString(), /banana/);
  assert.equal((await fetch(`${server.url}/missing.js`)).status, 404);
  assert.equal((await fetch(`${server.url}/%2e%2e/%2e%2e/etc/passwd`)).status, 404);
  assert.equal((await fetch(`${server.url}/`, { method: 'POST' })).status, 405);
  await fetch(`${server.url}/api/health`);
  const metrics = await (await fetch(`${server.adminUrl}/metrics`, { headers: { Authorization: 'Bearer admin-token' } })).text();
  assert.match(metrics, /override_static_bytes_total [1-9]/);
  assert.match(metrics, /override_http_requests_total\{route="\/api\/health",status="200"\} 1/);
});

test('the admin listener binds loopback only, needs its token, and is absent without one', async t => {
  const none = await boot(t, {});
  assert.equal(none.adminUrl, null);
  assert.equal(none.admin, null);
  const server = await boot(t, { OVERRIDE_ADMIN_TOKEN: 'admin-token' });
  assert.match(server.adminUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(server.admin.address().address, '127.0.0.1');
  assert.equal((await fetch(`${server.adminUrl}/metrics`)).status, 401);
  const ok = await fetch(`${server.adminUrl}/admin/health`, { headers: { Authorization: 'Bearer admin-token' } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).router, null, 'rehearsal mode has no router');
});

async function liveServer(t, delayMs, extra = {}) {
  const mock = await startMockLlm({ delayMs: [delayMs, delayMs] });
  t.after(() => mock.close());
  const dir = tmp(t);
  const endpoints = join(dir, 'endpoints.json');
  writeFileSync(endpoints, JSON.stringify([{ name: 'a', baseUrl: mock.url, model: 'mock-model', keyEnv: 'OVERRIDE_ENDPOINT_A_KEY' }]));
  const server = await boot(t, { OVERRIDE_ENDPOINTS: endpoints, OVERRIDE_ENDPOINT_A_KEY: 'sk-test-key', OVERRIDE_ADMIN_TOKEN: 'admin-token', ...extra });
  return { ...server, mock };
}
async function player(url) {
  const start = await fetch(`${url}/api/start`, { method: 'POST', headers: json, body: '{}' });
  const state = await start.json();
  const cookie = start.headers.get('set-cookie').split(';')[0];
  const post = async (action, body) => {
    const view = await (await fetch(`${url}/api/${action}`, { method: 'POST', headers: { ...json, Cookie: cookie }, body: JSON.stringify({ sessionId: state.session.id, ...body }) })).json();
    return view;
  };
  const visited = await post('visit', { revision: state.session.revision, location: 'report' });
  return { id: state.session.id, cookie, revision: visited.session.revision, post };
}

test('traces_not_exported: a live interview writes a trace file but the player export has no prompts or keys', async t => {
  const server = await liveServer(t, 10);
  const p = await player(server.url);
  const answered = await fetch(`${server.url}/api/interview`, { method: 'POST', headers: { ...json, Cookie: p.cookie }, body: JSON.stringify({ sessionId: p.id, revision: p.revision, character: 'momo', question: 'Did the keeper say yes?' }) });
  assert.equal(answered.status, 200);
  const trace = join(server.dir, 'test', 'traces', `${p.id}.jsonl`);
  assert.ok(existsSync(trace));
  const exported = await (await fetch(`${server.url}/api/events`, { headers: { Cookie: p.cookie } })).text();
  assert.equal(exported.includes('"messages"'), false);
  assert.equal(exported.includes('sk-test-key'), false);
  assert.equal(readFileSync(trace, 'utf8').includes('sk-test-key'), false);
  const answer = exported.trim().split('\n').map(JSON.parse).find(e => e.type === 'interview_answer');
  assert.equal(answer.provenance.endpoint, 'a');
  const started = JSON.parse(exported.trim().split('\n')[0]);
  assert.match(started.endpointsHash, /^[0-9a-f]{16}$/);
  assert.equal(started.env, 'test');
  const metrics = await (await fetch(`${server.adminUrl}/metrics`, { headers: { Authorization: 'Bearer admin-token' } })).text();
  assert.match(metrics, /override_llm_active_endpoint\{endpoint="a"\} 1/);
  assert.match(metrics, /override_sessions_started_total 1/);
});

test('graceful_close: a pending interview still returns 200 after close() and new connections are refused', async t => {
  const server = await liveServer(t, 300);
  const p = await player(server.url);
  const pending = fetch(`${server.url}/api/interview`, { method: 'POST', headers: { ...json, Cookie: p.cookie }, body: JSON.stringify({ sessionId: p.id, revision: p.revision, character: 'momo', question: 'Did the keeper say yes?' }) });
  await new Promise(resolve => setTimeout(resolve, 80));
  const closing = server.close();
  await new Promise(resolve => setTimeout(resolve, 30));
  await assert.rejects(fetch(`${server.url}/api/health`));
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).session.interviews.momo.length, 1);
  await closing;
});

test('cookie_secure_trusted_only: a spoofed X-Forwarded-Proto marks cookies Secure only when the proxy is trusted; timeouts fit 60 s answers', async t => {
  const direct = await boot(t, { OVERRIDE_ACCESS_CODE: 'colleague-code' });
  const trusted = await boot(t, { OVERRIDE_ACCESS_CODE: 'colleague-code', OVERRIDE_TRUST_PROXY: '1' });
  const sign = async server => (await login(server.url, 'colleague-code', { 'X-Forwarded-Proto': 'https' })).headers.get('set-cookie');
  const plain = await sign(direct);
  assert.ok(!plain.includes('Secure'));
  assert.match(plain, /HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200/);
  assert.ok((await sign(trusted)).includes('; Secure'));
  assert.ok(direct.server.requestTimeout >= 30_000 && direct.server.headersTimeout <= direct.server.requestTimeout);
});

test('the case catalog needs the access token and lists public rows only', async t => {
  const rows = [
    { id: 'banana-mystery', title: 'The Banana Mystery', lead: 'The bananas are gone.\nThe bell never rang.', order: 1 },
    { id: 'tower-echo-bell', title: 'Lanterns Too Soon', lead: 'A bell rang.\nThe potions came out too soon.', order: 2 },
  ];
  const investigations = { catalog: () => rows, view: () => ({ session: null }), mutate: async () => ({ session: null }), export: () => '' };
  const app = createApp({ investigations, accessCode: 'colleague-code' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  assert.equal((await fetch(`${base}/api/cases`)).status, 401);
  const login = await fetch(`${base}/api/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'colleague-code' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${base}/api/cases`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { cases: rows });
  assert.equal((await fetch(`${base}/server/cases/tower-echo-bell.mjs`)).status, 404);
});

const adminHeaders = { Authorization: 'Bearer admin-token' };
async function streamHello(server) {
  const ctl = new AbortController();
  try {
    const res = await fetch(`${server.adminUrl}/admin/stream`, { headers: adminHeaders, signal: ctl.signal });
    const reader = res.body.getReader();
    let text = '';
    while (!text.includes('\n')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += Buffer.from(value).toString();
    }
    return JSON.parse(text.split('\n')[0]);
  } finally { ctl.abort(); }
}
const beat = (url, tab, cookie, headers = {}) => fetch(`${url}/api/heartbeat`, { method: 'POST', headers: { ...json, ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: JSON.stringify({ tab }) });
const TAB = '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

test('heartbeat_route: 204 with the cookie session, gated, validated, labelled, and no game touched', async t => {
  const calls = [];
  const dir = tmp(t);
  const { createApp } = await import('../server/index.mjs');
  const { Investigations } = await import('../server/session.mjs');
  const { modelConfig } = await import('../server/interviews.mjs');
  const { Registry, createGameMetrics } = await import('../server/metrics.mjs');
  const registry = new Registry();
  const inv = new Investigations({ dataDir: dir, config: modelConfig({}), router: null, dev: false, meta: {} });
  const touched = [];
  for (const m of ['find', 'view', 'mutate']) { const orig = inv[m]?.bind(inv); if (orig) inv[m] = (...a) => { touched.push(m); return orig(...a); }; }
  const server = createApp({ investigations: inv, accessCode: 'code', secret: 's', staticFiles: new Map(), metrics: createGameMetrics(registry), onHeartbeat: (tab, sid) => calls.push([tab, sid]) });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await beat(url, TAB)).status, 401);
  const access = (await login(url, 'code')).headers.get('set-cookie').split(';')[0];
  const sid = '7f3a0000-0000-4000-8000-000000000000';
  const ok = await beat(url, TAB, `${access}; override_session=${sid}`);
  assert.equal(ok.status, 204);
  assert.equal(await ok.text(), '');
  assert.equal((await beat(url, TAB, access)).status, 204);
  assert.equal((await beat(url, TAB, `${access}; override_session=../../x`)).status, 204);
  assert.deepEqual(calls, [[TAB, sid], [TAB, null], [TAB, null]]);
  assert.equal((await beat(url, 'x', access)).status, 400);
  assert.equal((await beat(url, TAB, access, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.deepEqual(touched, []);
  assert.match(registry.render(), /override_http_requests_total\{route="\/api\/heartbeat",status="204"\} 3/);
});

test('monitor_wired: a played game reaches the admin stream and a heartbeat counts online', async t => {
  const server = await boot(t, { OVERRIDE_ADMIN_TOKEN: 'admin-token' });
  const p = await player(server.url);
  await p.post('interview', { revision: p.revision, character: 'momo', question: 'Did the keeper say yes?' });
  assert.equal((await beat(server.url, TAB, p.cookie)).status, 204);
  const hello = await streamHello(server);
  assert.equal(hello.type, 'hello');
  const mine = hello.recent.filter(r => r.sessionId === p.id).map(r => r.kind);
  assert.ok(mine.includes('start') && mine.includes('question') && mine.includes('answer'), mine.join());
  assert.equal(hello.snapshot.funnel['banana-mystery'].started, 1);
  assert.equal(hello.snapshot.players.online, 1);
  assert.equal(hello.snapshot.players.onlineInGame, 1);
});

test('round_survives_restart: label, round count and recent rows come back from disk', async t => {
  const dir = tmp(t);
  const env = { PORT: '0', OVERRIDE_ADMIN_PORT: '0', OVERRIDE_DATA_DIR: dir, OVERRIDE_ENV: 'test', OVERRIDE_SECRET: 'secret-one', OVERRIDE_ADMIN_TOKEN: 'admin-token' };
  const first = await startServer(env);
  let closed = false;
  t.after(() => { if (!closed) return first.close(); });
  const set = await fetch(`${first.adminUrl}/admin/round`, { method: 'POST', headers: { ...json, ...adminHeaders }, body: JSON.stringify({ label: 'B' }) });
  assert.equal(set.status, 200);
  await new Promise(r => setTimeout(r, 5));
  const p = await player(first.url);
  await p.post('interview', { revision: p.revision, character: 'momo', question: 'Did the keeper say yes?' });
  await first.close();
  closed = true;
  const second = await startServer(env);
  t.after(() => second.close());
  const hello = await streamHello(second);
  assert.equal(hello.snapshot.round.label, 'B');
  assert.equal(hello.snapshot.players.round, 1);
  assert.ok(hello.recent.some(r => r.sessionId === p.id && r.kind === 'answer'));
});

test('no_admin_no_monitor: heartbeats still return 204 and nothing is kept', async t => {
  const server = await boot(t, {});
  assert.equal(server.admin, null);
  assert.equal((await beat(server.url, TAB)).status, 204);
});

test('heartbeat_protocol: oversized, non-json and GET heartbeats are refused', async t => {
  const server = await boot(t, {});
  const post = (body, headers) => fetch(`${server.url}/api/heartbeat`, { method: 'POST', headers, body });
  assert.equal((await post(JSON.stringify({ tab: TAB, pad: 'x'.repeat(20_000) }), json)).status, 413);
  assert.equal((await post(JSON.stringify({ tab: TAB }), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('[]', json)).status, 400);
  assert.equal((await fetch(`${server.url}/api/heartbeat`)).status === 204, false);
});
