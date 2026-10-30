import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeaderboard } from '../server/leaderboard.mjs';
import { cases } from '../server/cases/index.mjs';

const iso = (s) => new Date(s * 1000).toISOString();
const A = { id: 'A', name: 'Banana Squad' };
const B = { id: 'B', name: 'Owls' };
const C = { id: 'C', name: 'Lynx' };
// The clock jumps 2 s per read so the 1 s standings cache never hides a change in these tests.
const board = (at = 0) => { let t = 0; return createLeaderboard(cases, { startedAt: at * 1000, now: () => (t += 2000) }); };
const start = (sid, team, caseId, s, extra = {}) => ({ type: 'session_started', sessionId: sid, caseId, timestamp: iso(s), team, ...extra });
const verdict = (sid, suspect, s, extra = {}) => ({ type: 'verdict_submitted', sessionId: sid, timestamp: iso(s), verdict: { suspect }, ...extra });
// A role verdict as the game logs it: one role per character, scored against the drawn cast.
const roleVerdict = (sid, caseId, right, s, extra = {}) => {
  const kase = cases.find((c) => c.id === caseId);
  const ids = kase.characters.map((c) => c.id);
  const results = Object.fromEntries(ids.map((id, i) => [id, i < right]));
  return { type: 'verdict_submitted', sessionId: sid, timestamp: iso(s), verdict: { roles: {}, truth: {}, results, score: right, total: ids.length, confidence: 'sure' }, ...extra };
};
const none = (caseId) => ({ caseId, state: 'none', points: 0 });
const caseList = cases.map((c) => ({ id: c.id, title: c.title, order: c.order, total: c.characters.length }));
const feed = (lb, evs) => evs.forEach((e) => lb.observe(e));
const names = (lb, o = { includeHidden: false, you: null }) => lb.standings(o).teams.map((t) => t.name);

test('example standings', () => {
  const lb = board();
  feed(lb, [
    start('a', A, 'banana-mystery', 0), { type: 'x', sessionId: 'a', timestamp: iso(10), spend: { total: 8 } }, roleVerdict('a', 'banana-mystery', 4, 120, { coins: { spent: 8, budget: 20 } }),
    start('b', B, 'banana-mystery', 0), roleVerdict('b', 'banana-mystery', 0, 60, { coins: { spent: 4, budget: 20 } }),
    start('c', C, 'banana-mystery', 0),
  ]);
  assert.deepEqual(lb.standings({ includeHidden: false, you: 'A' }), {
    rankBy: 'time', startedAt: 0, round: null, cases: caseList, teams: [
      { rank: 1, teamId: 'A', name: 'Banana Squad', points: 4, played: 1, timeMs: 120000, coins: 8, hidden: false, you: true, cells: [{ caseId: 'banana-mystery', state: 'perfect', points: 4 }, none('tower-echo-bell')] },
      { rank: 2, teamId: 'B', name: 'Owls', points: 0, played: 1, timeMs: 60000, coins: 4, hidden: false, you: false, cells: [{ caseId: 'banana-mystery', state: 'zero', points: 0 }, none('tower-echo-bell')] },
      { rank: null, teamId: 'C', name: 'Lynx', points: 0, played: 0, timeMs: 0, coins: 0, hidden: false, you: false, cells: [{ caseId: 'banana-mystery', state: 'playing', points: 0 }, none('tower-echo-bell')] },
    ],
  });
  lb.setHidden('A', true);
  assert.deepEqual(names(lb), ['Owls', 'Lynx']);
  const all = lb.standings({ includeHidden: true, you: null }).teams;
  assert.deepEqual(all.map((t) => [t.name, t.rank, t.hidden]), [['Banana Squad', null, true], ['Owls', 1, false], ['Lynx', null, false]]);
});

test('first_verdict_counts', () => {
  const lb = board();
  feed(lb, [start('a', A, 'banana-mystery', 0), roleVerdict('a', 'banana-mystery', 1, 10), roleVerdict('a', 'banana-mystery', 4, 20)]);
  const [t] = lb.standings({}).teams;
  assert.equal(t.points, 1); assert.equal(t.played, 1);
});

test('nobody_case', () => {
  const lb = board();
  // Nobody is guilty here: a role verdict scores its `score`; a verdict without `score` scores 0.
  feed(lb, [start('a', A, 'tower-echo-bell', 0), roleVerdict('a', 'tower-echo-bell', 1, 5), start('b', B, 'tower-echo-bell', 0), verdict('b', 'none', 5)]);
  const t = Object.fromEntries(lb.standings({}).teams.map((x) => [x.name, x.points]));
  assert.deepEqual(t, { 'Banana Squad': 1, Owls: 0 });
});

test('time_from_first_start', () => {
  const lb = board();
  feed(lb, [start('a', A, 'banana-mystery', 0), { type: 'session_reset', sessionId: 'a', timestamp: iso(30) }, start('a2', A, 'banana-mystery', 60), verdict('a2', 'momo', 150)]);
  assert.equal(lb.standings({}).teams[0].timeMs, 150000);
});

test('coins_across_sessions', () => {
  const lb = board();
  feed(lb, [
    start('s1', A, 'banana-mystery', 0), { type: 'interview_question', sessionId: 's1', timestamp: iso(5), spend: { total: 6 } },
    start('s2', A, 'banana-mystery', 20), verdict('s2', 'momo', 50, { coins: { spent: 4, budget: 20 } }),
    start('s3', A, 'banana-mystery', 60), { type: 'interview_question', sessionId: 's3', timestamp: iso(70), spend: { total: 9 } },
    { type: 'interview_question', sessionId: 's2', timestamp: iso(80), spend: { total: 7 } },
  ]);
  assert.equal(lb.standings({}).teams[0].coins, 10);
});

test('rank_by_time_and_coins', () => {
  const lb = board();
  feed(lb, [
    start('a', A, 'banana-mystery', 0), verdict('a', 'momo', 100, { coins: { spent: 12 } }),
    start('b', B, 'banana-mystery', 0), verdict('b', 'momo', 200, { coins: { spent: 4 } }),
  ]);
  assert.deepEqual(names(lb), ['Banana Squad', 'Owls']);
  lb.setRankBy('coins');
  assert.equal(lb.standings({}).rankBy, 'coins');
  assert.deepEqual(names(lb), ['Owls', 'Banana Squad']);
});

test('ties_share_rank and unranked_after_ranked', () => {
  const lb = board();
  feed(lb, [
    start('c', C, 'banana-mystery', 0),
    start('a', A, 'banana-mystery', 0), verdict('a', 'momo', 100, { coins: { spent: 2 } }),
    start('b', B, 'banana-mystery', 0), verdict('b', 'momo', 100, { coins: { spent: 2 } }),
    start('d', { id: 'D', name: 'Zed' }, 'banana-mystery', 0), verdict('d', 'momo', 300, { coins: { spent: 2 } }),
  ]);
  const t = lb.standings({}).teams;
  assert.deepEqual(t.map((x) => x.rank), [1, 1, 3, null]);
  assert.equal(t[3].name, 'Lynx');
});

test('reset_round', () => {
  const lb = board(100);
  feed(lb, [start('a', A, 'banana-mystery', 50), verdict('a', 'momo', 120), start('b', B, 'banana-mystery', 110)]);
  assert.deepEqual(names(lb), ['Owls']);
  lb.reset(500000);
  assert.deepEqual(lb.standings({}), { rankBy: 'time', startedAt: 500000, round: null, cases: caseList, teams: [] });
  feed(lb, [start('c', C, 'banana-mystery', 400)]);
  assert.deepEqual(names(lb), []);
});

test('restore_settings', () => {
  const lb = board();
  lb.restore([{ type: 'leaderboard_settings', rankBy: 'coins' }, { type: 'leaderboard_settings', rankBy: 'time' }, { type: 'leaderboard_settings', rankBy: 'coins' },
    { type: 'team_hidden', teamId: 'A', hidden: true }, { type: 'team_hidden', teamId: 'B', hidden: true }, { type: 'team_hidden', teamId: 'A', hidden: false }]);
  feed(lb, [start('a', A, 'banana-mystery', 0), start('b', B, 'banana-mystery', 0)]);
  assert.equal(lb.standings({}).rankBy, 'coins');
  assert.deepEqual(names(lb), ['Banana Squad']);
});

test('ignores_teamless_and_unknown_case', () => {
  const lb = board();
  feed(lb, [start('a', null, 'banana-mystery', 0), verdict('a', 'momo', 5), start('b', B, 'nope', 0), verdict('b', 'momo', 5)]);
  assert.deepEqual(lb.standings({}).teams, []);
});

test('score_field_points', () => {
  const lb = board();
  feed(lb, [start('a', A, 'banana-mystery', 0), { ...verdict('a', 'x', 5), verdict: { suspect: 'x', score: 3 } }]);
  assert.equal(lb.standings({}).teams[0].points, 3);
});

test('role_verdict_points_are_roles_right', () => {
  const lb = board();
  feed(lb, [
    start('a', A, 'banana-mystery', 0), roleVerdict('a', 'banana-mystery', 4, 10),
    start('b', B, 'tower-echo-bell', 0), roleVerdict('b', 'tower-echo-bell', 3, 10),
    start('c', C, 'banana-mystery', 0), roleVerdict('c', 'banana-mystery', 2, 10),
  ]);
  const t = Object.fromEntries(lb.standings({}).teams.map((x) => [x.name, x.points]));
  assert.deepEqual(t, { 'Banana Squad': 4, Owls: 3, Lynx: 2 });
});

test('setRankBy_rejects', () => {
  assert.throws(() => board().setRankBy('speed'));
});

test('never_throws', () => {
  const lb = board();
  for (const e of [null, undefined, {}, 5, { type: 'verdict_submitted' }, { type: 'session_started', team: 3 }]) lb.observe(e);
  assert.deepEqual(lb.standings({}).teams, []);
});

test('name_latest', () => {
  const lb = board();
  feed(lb, [start('a', A, 'banana-mystery', 0), start('b', { id: 'A', name: 'Banana Squad 2' }, 'banana-mystery', 5)]);
  assert.deepEqual(names(lb), ['Banana Squad 2']);
});

test('bad_numbers_and_out_of_order_starts', () => {
  const lb = board();
  feed(lb, [
    start('a', A, 'banana-mystery', 50), start('a2', A, 'banana-mystery', 10),
    { type: 'x', sessionId: 'a', timestamp: iso(60), spend: { total: -5 } },
    { type: 'x', sessionId: 'a', timestamp: iso(61), spend: { total: NaN } },
    verdict('a', 'momo', 100, { coins: { spent: -3 } }),
    { type: 'session_started', timestamp: iso(5), caseId: 'banana-mystery', team: B },
  ]);
  const [row] = lb.standings({}).teams;
  assert.equal(row.coins, 0);
  assert.equal(row.timeMs, 90000);
  assert.equal(lb.standings({}).teams.length, 1);
  lb.reset('1970-01-01T00:08:20.000Z');
  assert.equal(lb.standings({}).startedAt, 500000);
});

test('cells in case order, one per case, with states', () => {
  const lb = board();
  feed(lb, [
    start('a', A, 'banana-mystery', 0), roleVerdict('a', 'banana-mystery', 4, 10),
    start('b', B, 'banana-mystery', 0), roleVerdict('b', 'banana-mystery', 2, 10),
    start('c', C, 'banana-mystery', 0), roleVerdict('c', 'banana-mystery', 0, 10),
    start('d', { id: 'D', name: 'Dots' }, 'tower-echo-bell', 0),
  ]);
  const t = Object.fromEntries(lb.standings({ includeHidden: true }).teams.map((x) => [x.teamId, x.cells]));
  for (const id of ['A', 'B', 'C', 'D']) assert.deepEqual(t[id].map((c) => c.caseId), cases.map((c) => c.id));
  assert.deepEqual(t.A[0], { caseId: 'banana-mystery', state: 'perfect', points: 4 });
  assert.equal(t.B[0].state, 'partial');
  assert.equal(t.C[0].state, 'zero');
  assert.deepEqual([t.D[0].state, t.D[1].state], ['none', 'playing']);
});

test('round label', () => {
  const lb = board();
  assert.equal(lb.standings().round, null);
  lb.reset(0, 'Session B');
  assert.equal(lb.standings().round, 'Session B');
  lb.reset(0);
  assert.equal(lb.standings().round, null);
});

test('restarted finished case stays scored; reset without a label clears round; stale cells vanish', () => {
  const lb = board();
  const id = cases[0].id;
  feed(lb, [start('a1', A, id, 0), roleVerdict('a1', id, cases[0].characters.length, 30), start('a2', A, id, 40)]);
  lb.reset(1000 * 100, 'Final');
  assert.equal(lb.standings().round, 'Final');
  lb.reset(1000 * 200);
  assert.equal(lb.standings().round, null);
  lb.reset(0, 'R');
  feed(lb, [start('a1', A, id, 0), roleVerdict('a1', id, cases[0].characters.length, 30), start('a2', A, id, 40)]);
  const cell = lb.standings().teams[0].cells.find((c) => c.caseId === id);
  assert.equal(cell.state, 'perfect');
  lb.reset(1000 * 500, 'R2');
  assert.deepEqual(lb.standings().teams, []);
});

test('rank_cache_refreshes_after_1s', () => {
  // Rows are cached for 1 s; cells depend on the live case list, so editing it probes the cache.
  const local = cases.map((c) => ({ ...c, characters: [...(c.characters ?? [])] }));
  const k = local.find((c) => c.id === 'banana-mystery');
  let t = 1_000_000;
  const lb = createLeaderboard(local, { startedAt: 0, now: () => t });
  feed(lb, [start('a', A, 'banana-mystery', 0), roleVerdict('a', 'banana-mystery', k.characters.length, 10)]);
  const cell = () => lb.standings({}).teams[0].cells.find((x) => x.caseId === 'banana-mystery').state;
  assert.equal(cell(), 'perfect');
  k.characters.push({}); // no event: only a recompute can notice
  t += 500;
  assert.equal(cell(), 'perfect'); // still cached
  t += 501;
  assert.equal(cell(), 'partial'); // 1001 ms after the cache was built
});

test('you_applies_per_request_through_the_cache', () => {
  const lb = createLeaderboard(cases, { startedAt: 0, now: () => 5 });
  feed(lb, [start('a', A, 'banana-mystery', 0), roleVerdict('a', 'banana-mystery', 2, 10), start('b', B, 'banana-mystery', 0), roleVerdict('b', 'banana-mystery', 1, 10)]);
  assert.deepEqual(lb.standings({ you: 'A' }).teams.map((x) => x.you), [true, false]);
  assert.deepEqual(lb.standings({ you: 'B' }).teams.map((x) => x.you), [false, true]);
});

test('ties_keep_rank', () => {
  const lb = board();
  feed(lb, [
    start('a', A, 'banana-mystery', 0), roleVerdict('a', 'banana-mystery', 2, 10),
    start('b', B, 'banana-mystery', 0), roleVerdict('b', 'banana-mystery', 2, 10),
    start('c', C, 'banana-mystery', 0), roleVerdict('c', 'banana-mystery', 1, 10),
  ]);
  assert.deepEqual(lb.standings({}).teams.map((x) => x.rank), [1, 1, 3]);
});

test('verdict_visible_immediately', () => {
  const lb = createLeaderboard(cases, { startedAt: 0, now: () => 5000 });
  feed(lb, [start('a', A, 'banana-mystery', 0)]);
  assert.equal(lb.standings({}).teams[0].points, 0);
  feed(lb, [roleVerdict('a', 'banana-mystery', 3, 10)]);
  const [t] = lb.standings({}).teams;
  assert.equal(t.points, 3); assert.equal(t.played, 1);
});
