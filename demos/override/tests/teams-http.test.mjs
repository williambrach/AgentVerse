import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/index.mjs';

const json = { 'Content-Type': 'application/json' };
const TAKEN = (n) => `A team called ${n} is already playing. Join it, or pick another name.`;

async function boot(t, env = {}, dir = null) {
  if (!dir) { dir = mkdtempSync(join(tmpdir(), 'override-teams-')); t.after(() => rmSync(dir, { recursive: true, force: true })); }
  const s = await startServer({ PORT: '0', OVERRIDE_ADMIN_PORT: '0', OVERRIDE_DATA_DIR: dir, OVERRIDE_ENV: 'test', OVERRIDE_SECRET: 'secret-one', OVERRIDE_ADMIN_TOKEN: 'admin-token', ...env });
  t.after(() => s.close());
  return { ...s, dir };
}

// A browser: a cookie jar over fetch.
function browser(url) {
  const jar = {};
  const call = async (path, method = 'GET', body, headers = {}) => {
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(url + path, { method, headers: { ...(body ? json : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const raw = res.headers.get('set-cookie');
    if (raw) { const [kv] = raw.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
  };
  return { jar, call, team: (name, join = false) => call('/api/team', 'POST', { name, join }) };
}

// Every grove character marked honest: whatever the cast, exactly one (the bell-minder) is right, so one point.
const ALL_HONEST = { momo: 'honest', pip: 'honest', nori: 'honest', kiki: 'honest' };

async function solve(b, roles = ALL_HONEST) {
  let view = (await b.call('/api/start', 'POST', {})).body;
  const act = async (a, input = {}) => { const r = await b.call(`/api/${a}`, 'POST', { sessionId: view.session.id, revision: view.session.revision, ...input }); if (r.status === 200) view = r.body; return r; };
  for (const character of Object.keys(roles)) assert.equal((await act('interview', { character, question: 'What happened?' })).status, 200);
  assert.equal((await act('verdict', { roles, confidence: 70 })).status, 200);
  return view;
}

const admin = (s, path, body) => fetch(s.adminUrl + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer admin-token', ...(body ? json : {}) }, body: body ? JSON.stringify(body) : undefined });

test('team_gate_flow', async t => {
  const s = await boot(t);
  const a = browser(s.url);
  assert.deepEqual((await a.call('/api/team')).body, { team: null });
  assert.equal((await a.team('x')).status, 400);
  const made = await a.team('Owls');
  assert.equal(made.status, 200);
  assert.deepEqual(made.body, { team: { name: 'Owls' }, created: true });
  assert.match(made.headers.get('set-cookie'), /^override_team=[0-9a-f-]{36}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200/);
  assert.deepEqual((await a.call('/api/team')).body, { team: { name: 'Owls' } });
  const b = browser(s.url);
  const taken = await b.team('owls');
  assert.equal(taken.status, 409);
  assert.deepEqual(taken.body, { error: TAKEN('Owls'), taken: 'Owls' });
  assert.equal(b.jar.override_team, undefined);
  const joined = await b.team('owls', true);
  assert.deepEqual([joined.status, joined.body], [200, { team: { name: 'Owls' }, created: false }]);
  assert.equal(b.jar.override_team, a.jar.override_team);
  const stale = browser(s.url);
  stale.jar.override_team = 'nope';
  assert.deepEqual((await stale.call('/api/team')).body, { team: null });
});

test('same_team_two_browsers, session_started_team', async t => {
  const s = await boot(t);
  const a = browser(s.url);
  await a.team('Owls');
  const started = await a.call('/api/start', 'POST', {});
  assert.equal(a.jar.override_session, undefined);
  const id = started.body.session.id;
  assert.equal(started.body.session.team.name, 'Owls');
  const b = browser(s.url);
  await b.team('Owls', true);
  assert.equal((await b.call('/api/state')).body.session.id, id);
  const reset = await b.call('/api/reset', 'POST', { sessionId: id, revision: started.body.session.revision });
  assert.equal(reset.status, 200);
  assert.notEqual(reset.body.session.id, id);
  assert.equal(b.jar.override_session, undefined);
  assert.equal((await a.call('/api/state')).body.session.id, reset.body.session.id);
  const log = readFileSync(join(s.dir, 'test', 'sessions', `${id}.jsonl`), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(log.find(e => e.type === 'session_started').team.name, 'Owls');
});

test('leaderboard_public', async t => {
  const s = await boot(t);
  const a = browser(s.url);
  await a.team('Owls');
  await solve(a);
  const mine = (await a.call('/api/leaderboard')).body;
  assert.equal(mine.rankBy, 'time');
  assert.equal(mine.teams.length, 1);
  const row = mine.teams[0];
  assert.deepEqual(Object.keys(row).sort(), ['coins', 'name', 'played', 'points', 'rank', 'timeMs', 'you']);
  assert.deepEqual([row.rank, row.points, row.you, row.name], [1, 1, true, 'Owls']);
  assert.equal(JSON.stringify(mine).includes(a.jar.override_team), false);
  const o = browser(s.url);
  await o.team('Hawks');
  assert.equal((await o.call('/api/leaderboard')).body.teams[0].you, false);
  assert.equal((await browser(s.url).call('/api/leaderboard')).body.teams[0].you, false);
  const adm = await (await admin(s, '/admin/leaderboard')).json();
  assert.equal(adm.teams[0].teamId, a.jar.override_team);
  await admin(s, '/admin/teams/hidden', { teamId: a.jar.override_team, hidden: true });
  assert.deepEqual((await o.call('/api/leaderboard')).body.teams, []);
});

test('teamless_still_works', async t => {
  const s = await boot(t);
  const p = browser(s.url);
  const view = await solve(p);
  assert.equal(p.jar.override_session, view.session.id);
  assert.equal(view.session.team, null);
  assert.deepEqual((await p.call('/api/leaderboard')).body.teams, []);
});

test('new_team_rate_limit', async t => {
  const s = await boot(t, {}, null);
  const b = browser(s.url);
  for (let i = 0; i < 120; i++) assert.equal((await b.team(`Team ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`)).status, 200);
  const over = await b.team('Late Team');
  assert.equal(over.status, 429);
  assert.equal(over.body.error, 'Too many new teams. Try again in a minute.');
  assert.equal((await b.team('team aa', true)).status, 200);
  assert.equal((await b.team('team aa')).status, 409);
});

test('restart_restores', async t => {
  const first = await boot(t);
  const a = browser(first.url);
  await a.team('Owls');
  const view = (await a.call('/api/start', 'POST', {})).body;
  assert.equal((await admin(first, '/admin/leaderboard', { rankBy: 'coins' })).status, 200);
  await first.close();
  const second = await boot(t, {}, first.dir);
  const again = browser(second.url);
  again.jar.override_team = a.jar.override_team;
  assert.deepEqual((await again.call('/api/team')).body, { team: { name: 'Owls' } });
  assert.equal((await again.call('/api/state')).body.session.id, view.session.id);
  assert.equal((await again.call('/api/leaderboard')).body.rankBy, 'coins');
});

test('round_empties_board', async t => {
  const s = await boot(t);
  const a = browser(s.url);
  await a.team('Owls');
  await solve(a);
  assert.equal((await a.call('/api/leaderboard')).body.teams.length, 1);
  await new Promise(r => setTimeout(r, 5));
  assert.equal((await admin(s, '/admin/round', { label: 'Round 2' })).status, 200);
  assert.deepEqual((await a.call('/api/leaderboard')).body.teams, []);
});

test('start_race_pointer_follows_last, stale_session_cookie_ignored, no_attach_on_failure', async t => {
  const s = await boot(t);
  const a = browser(s.url);
  await a.team('Owls');
  const b = browser(s.url);
  await b.team('Owls', true);
  const [ra, rb] = await Promise.all([a.call('/api/start', 'POST', {}), b.call('/api/start', 'POST', {})]);
  assert.ok([ra.status, rb.status].every(c => c === 200 || c === 409));
  assert.ok(ra.status === 200 || rb.status === 200);
  const pointer = (await a.call('/api/state')).body.session.id;
  assert.ok([ra, rb].some(r => r.status === 200 && r.body.session.id === pointer));
  assert.equal((await b.call('/api/state')).body.session.id, pointer);
  // a stale teamless session cookie never beats the team
  const c = browser(s.url);
  await c.team('Owls', true);
  c.jar.override_session = '11111111-1111-4111-8111-111111111111';
  assert.equal((await c.call('/api/state')).body.session.id, pointer);
  // a rejected mutation leaves the pointer alone
  const bad = await c.call('/api/reset', 'POST', { sessionId: pointer, revision: 999 });
  assert.equal(bad.status, 409);
  assert.equal((await a.call('/api/state')).body.session.id, pointer);
  // public payloads and errors never carry the team id
  const id = a.jar.override_team;
  for (const path of ['/api/leaderboard', '/api/cases']) assert.equal(JSON.stringify((await a.call(path)).body).includes(id), false);
  assert.equal(JSON.stringify((await b.team('owls')).body).includes(id), false);
});
