import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountSignIn } from '../server/admin/signin.js';

class El {
  constructor() { this.listeners = {}; this.hidden = false; this.value = ''; this._text = ''; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  fire(t, ev = {}) { return Promise.all((this.listeners[t] ?? []).map(f => f({ preventDefault() { this.prevented = true; }, ...ev }))); }
}
function shell() {
  const byId = {};
  for (const id of ['auth', 'password', 'signin', 'auth-error', 'signout']) byId[id] = new El();
  const location = { reloads: 0, reload() { this.reloads += 1; } };
  const doc = { getElementById: id => byId[id] ?? null, location };
  return { doc, $: id => byId[id], location };
}
const res = (status) => ({ status, ok: status < 300 });
function fake(routes) {
  const calls = [];
  const fetch = async (path, init = {}) => { calls.push([path, init]); const r = routes[`${init.method ?? 'GET'} ${path}`]; return r.shift ? (r.length > 1 ? r.shift() : r[0]) : r; };
  return { fetch, calls };
}

test('signin_flow: a 401 session shows the form, a 204 login sends JSON {password} and signs in once', async () => {
  const s = shell();
  const f = fake({ 'GET /admin/session': res(401), 'POST /admin/login': res(204) });
  let signed = 0;
  await mountSignIn(s.doc, { fetch: f.fetch, onSignedIn: () => { signed += 1; } });
  assert.equal(s.$('auth').hidden, false);
  assert.equal(s.$('signout').hidden, true);
  assert.equal(signed, 0);
  s.$('password').value = 'päss "w\\ord"';
  await s.$('auth').fire('submit');
  const [path, init] = f.calls.at(-1);
  assert.equal(path, '/admin/login');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { password: 'päss "w\\ord"' });
  assert.equal(signed, 1);
  assert.equal(s.$('auth').hidden, true);
  assert.equal(s.$('signout').hidden, false);
  assert.equal(s.$('password').value, '');
});

test('an existing session skips the form and signs in once', async () => {
  const s = shell();
  const f = fake({ 'GET /admin/session': res(200) });
  let signed = 0;
  await mountSignIn(s.doc, { fetch: f.fetch, onSignedIn: () => { signed += 1; } });
  assert.equal(s.$('auth').hidden, true);
  assert.equal(s.$('signout').hidden, false);
  assert.equal(signed, 1);
});

test('wrong password shows the error and stays on the form', async () => {
  const s = shell();
  const f = fake({ 'GET /admin/session': res(401), 'POST /admin/login': res(401) });
  let signed = 0;
  await mountSignIn(s.doc, { fetch: f.fetch, onSignedIn: () => { signed += 1; } });
  const ev = {};
  await s.$('auth').fire('submit', ev);
  assert.equal(s.$('auth-error').textContent, 'Wrong password.');
  assert.equal(s.$('auth').hidden, false);
  assert.equal(signed, 0);
});

test('throttled_message: a 429 shows the wait text', async () => {
  const s = shell();
  const f = fake({ 'GET /admin/session': res(401), 'POST /admin/login': res(429) });
  await mountSignIn(s.doc, { fetch: f.fetch, onSignedIn() {} });
  await s.$('auth').fire('submit');
  assert.equal(s.$('auth-error').textContent, 'Too many attempts. Try again in a minute.');
});

test('signout: POST /admin/logout, then reload', async () => {
  const s = shell();
  const f = fake({ 'GET /admin/session': res(200), 'POST /admin/logout': res(204) });
  await mountSignIn(s.doc, { fetch: f.fetch, onSignedIn() {} });
  await s.$('signout').fire('click');
  assert.deepEqual(f.calls.at(-1)[0], '/admin/logout');
  assert.equal(f.calls.at(-1)[1].method, 'POST');
  assert.equal(s.location.reloads, 1);
});

test('no_token_left: app.js keeps no token and sends no authorization header', () => {
  const src = readFileSync(new URL('../server/admin/app.js', import.meta.url), 'utf8');
  assert.equal(/sessionStorage/i.test(src), false);
  assert.equal(/authorization/i.test(src), false);
});
