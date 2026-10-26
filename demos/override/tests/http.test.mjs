import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.mjs';
import { Investigations } from '../server/session.mjs';
import { modelConfig } from '../server/interviews.mjs';

test('HTTP access protects state and exports; malformed requests and cross-site writes are rejected', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-http-'));
  const app = createApp({ investigations: new Investigations({ dataDir: dir, config: modelConfig({}) }), accessCode: 'colleague-code' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
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
  assert.equal(state.records.length, 0);
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
  const app = createApp({ investigations: new Investigations({ dataDir: dir, config: modelConfig({}), answer }), accessCode: 'colleague-code' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
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
  await post(first, 'start'); await post(first, 'reveal');
  await post(second, 'start');
  assert.notEqual(first.state.session.id, second.state.session.id);
  // One player's pending answer does not block another player's game.
  const pending = post(first, 'interview', { character: 'pip', question: 'Who told you?' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await post(second, 'reveal')).status, 200);
  assert.equal((await post(second, 'interview', { character: 'nori', question: 'Did you hear the bell?' })).status, 200);
  assert.equal((await post(first, 'reveal')).status, 409);
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

test('the case catalog needs the access token and lists public rows only', async t => {
  const rows = [
    { id: 'banana-mystery', title: 'The Banana Mystery', lead: 'The bananas are gone.\nThe bell never rang.', order: 1 },
    { id: 'banana-control', title: 'The Banana Mix-up', lead: 'The bananas are gone.\nBut did anyone break the rule?', order: 2 },
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
  assert.equal((await fetch(`${base}/server/cases/banana-control.mjs`)).status, 404);
});
