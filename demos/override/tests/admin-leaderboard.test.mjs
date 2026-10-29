import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdmin } from '../server/admin.mjs';
import { createMonitor, toRow } from '../server/monitor.mjs';

const T = 'secret-token';
const ID = '11111111-2222-4333-8444-555555555555';
const board = () => {
  const calls = [];
  const st = { rankBy: 'time', startedAt: 1, teams: [{ rank: 1, teamId: ID, name: 'Owls', points: 2, played: 2, timeMs: 5000, coins: 3, hidden: false, you: false }] };
  return { calls, standings: () => st, setRankBy: (m) => calls.push(['rank', m]), setHidden: (id, h) => calls.push(['hide', id, h]) };
};
async function start(leaderboard) {
  const srv = createAdmin({ token: T, investigations: { stats: () => ({}) }, registry: { render: () => '' }, dataDir: '.', leaderboard });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, body, auth = true) => {
    const r = await fetch(base + path, { method, headers: { ...(auth ? { authorization: `Bearer ${T}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json() };
  };
  return { srv, call };
}

test('leaderboard routes: auth, validation, 409 when off', async () => {
  const b = board();
  const { srv, call } = await start(b);
  try {
    for (const [m, p] of [['GET', '/admin/leaderboard'], ['POST', '/admin/leaderboard'], ['POST', '/admin/teams/hidden']]) {
      assert.equal((await call(m, p, m === 'POST' ? {} : undefined, false)).status, 401);
    }
    const g = await call('GET', '/admin/leaderboard');
    assert.equal(g.status, 200);
    assert.equal(g.json.teams[0].name, 'Owls');
    const bad = await call('POST', '/admin/leaderboard', { rankBy: 'x' });
    assert.deepEqual([bad.status, bad.json.error], [400, 'rankBy must be time or coins.']);
    assert.equal((await call('POST', '/admin/leaderboard', { rankBy: 'coins' })).status, 200);
    const t1 = await call('POST', '/admin/teams/hidden', { teamId: 'nope', hidden: true });
    assert.deepEqual([t1.status, t1.json.error], [400, 'teamId must be a team id.']);
    const t2 = await call('POST', '/admin/teams/hidden', { teamId: ID, hidden: 'yes' });
    assert.deepEqual([t2.status, t2.json.error], [400, 'hidden must be true or false.']);
    assert.equal((await call('POST', '/admin/teams/hidden', { teamId: ID, hidden: true })).status, 200);
    assert.deepEqual(b.calls, [['rank', 'coins'], ['hide', ID, true]]);
    assert.equal((await call('DELETE', '/admin/leaderboard')).status, 405);
  } finally { srv.close(); }
});

test('409 when the leaderboard is off', async () => {
  const { srv, call } = await start(null);
  try {
    for (const [m, p, b] of [['GET', '/admin/leaderboard'], ['POST', '/admin/leaderboard', { rankBy: 'time' }], ['POST', '/admin/teams/hidden', { teamId: ID, hidden: true }]]) {
      const r = await call(m, p, b);
      assert.deepEqual([r.status, r.json.error], [409, 'The leaderboard is off.']);
    }
  } finally { srv.close(); }
});

test('monitor rows carry the team name, snapshot the leaderboard', () => {
  const stub = { observe() {}, reset() {}, players: () => ({}), funnel: () => ({}), tallies: () => ({}) };
  const win = { question() {}, failure() {}, answer() {}, sample() {}, stats: () => ({}), history: () => [] };
  const events = [
    { type: 'session_started', sessionId: 's1', timestamp: '2026-10-29T10:00:00.000Z', team: { id: ID, name: 'Owls' } },
    { type: 'location_visited', sessionId: 's1', timestamp: '2026-10-29T10:00:01.000Z', location: 'x' },
  ];
  const m = createMonitor({ roundStats: stub, windows: win, presence: { counts: () => ({}), beat() {} }, extras: () => ({ leaderboard: { rankBy: 'time' } }), readSession: () => events });
  m.observeGame(events[0]); m.observeGame(events[1]);
  assert.deepEqual(m.recent().map((r) => r.team), ['Owls', 'Owls']);
  assert.deepEqual(m.snapshot().leaderboard, { rankBy: 'time' });
  assert.deepEqual(m.session('s1').map((r) => r.team), ['Owls', 'Owls']);
  assert.equal(toRow(events[1]).team, null);
});

test('leaderboard routes reject query tokens, wrong tokens, bad bodies and methods', async () => {
  const b = board();
  const { srv, call } = await start(b);
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    assert.equal((await fetch(`${base}/admin/leaderboard?token=${T}`)).status, 401);
    assert.equal((await fetch(`${base}/admin/leaderboard`, { headers: { authorization: 'Bearer nope' } })).status, 401);
    assert.equal((await call('POST', '/admin/teams/hidden', [], true)).status, 400);
    assert.equal((await call('POST', '/admin/teams/hidden', { teamId: ID, hidden: 'true' })).status, 400);
    assert.equal((await call('POST', '/admin/teams/hidden', { teamId: 'AAAAAAAA-2222-4333-8444-555555555555', hidden: true })).status, 400);
    assert.equal((await call('PUT', '/admin/leaderboard', {})).status, 405);
    assert.equal((await call('GET', '/admin/teams/hidden')).status, 405);
    assert.deepEqual(b.calls, []);
    assert.equal((await call('POST', '/admin/teams/hidden', { teamId: ID, hidden: true, extra: 1 })).status, 200);
    assert.deepEqual(b.calls, [['hide', ID, true]]);
  } finally { srv.close(); }
});
