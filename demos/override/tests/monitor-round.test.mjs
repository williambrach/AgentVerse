import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoundStats } from '../server/monitor-round.mjs';

const ids = (...names) => names.map((id) => ({ id, name: id }));
const cases = [
  { id: 'banana-mystery', characters: ids('momo', 'pip', 'nori', 'kiki') },
  { id: 'tower-echo-bell', characters: ids('wren', 'basil', 'juniper') },
];

let t = 0;
const ev = (sessionId, caseId, type, extra = {}) => ({ sessionId, caseId, type, timestamp: ++t, elapsedMs: 0, character: null, ...extra });
const B = 'banana-mystery';
const T = 'tower-echo-bell';
const ROLES = ['villain', 'collaborator', 'fooled', 'honest'];
const truth = Object.fromEntries(['momo', 'pip', 'nori', 'kiki'].map((id, i) => [id, ROLES[i]]));
/** A v3 verdict: `wrong` lists the character ids whose pick missed. */
const verdict = (s, c, wrong = [], ms = 1000, t = truth) => {
  const ids = Object.keys(t);
  const results = Object.fromEntries(ids.map((id) => [id, !wrong.includes(id)]));
  const roles = Object.fromEntries(ids.map((id) => [id, results[id] ? t[id] : 'x']));
  const score = ids.length - wrong.length;
  return ev(s, c, 'verdict_submitted', { elapsedMs: ms, verdict: { roles, truth: t, results, score, total: ids.length, confidence: 80, explanation: '', evidenceIds: [] } });
};
const legacy = (s, c, ms = 1000) => ev(s, c, 'verdict_submitted', { elapsedMs: ms, verdict: { suspect: 'momo', suspects: ['momo'], confidence: 80 } });
const NO_TALLY = { verdicts: 0, perfect: 0, rolesRight: 0, rolesTotal: 0, byRole: {}, medianMsToVerdict: null, medianQuestions: null, medianCoins: null };


const truthless = () => ({ roles: truth, truth, results: {}, score: 0, total: 4 });

function full(r, s) {
  r.observe(ev(s, B, 'session_started'));
  for (const c of ['momo', 'pip', 'nori', 'kiki']) {
    r.observe(ev(s, B, 'interview_question', { character: c }));
    r.observe(ev(s, B, 'interview_answer', { character: c }));
  }
  r.observe(verdict(s, B, [], 600000));
  r.observe(ev(s, B, 'debrief_viewed'));
}

test('funnel and tallies for a full session', () => {
  const r = createRoundStats(cases);
  full(r, 's1');
  assert.deepEqual(r.funnel()[B], { started: 1, asked: 1, interviewed: 1, verdict: 1, debrief: 1 });
  assert.deepEqual(r.tallies()[B], {
    verdicts: 1, perfect: 1, rolesRight: 4, rolesTotal: 4,
    byRole: { villain: { right: 1, total: 1 }, collaborator: { right: 1, total: 1 }, fooled: { right: 1, total: 1 }, honest: { right: 1, total: 1 } },
    medianMsToVerdict: 600000, medianQuestions: 4, medianCoins: null,
  });
});

test('medianQuestions counts interview_question events at verdict', () => {
  const r = createRoundStats(cases);
  for (let i = 0; i < 3; i++) r.observe(ev('s1', B, 'interview_question', { character: 'momo' }));
  r.observe(verdict('s1', B, ['pip']));
  r.observe(ev('s1', B, 'interview_question', { character: 'momo' }));
  assert.equal(r.tallies()[B].medianQuestions, 3);
  assert.equal(r.tallies()[B].perfect, 0);
});

test('asked counts a session once; story_revealed is ignored', () => {
  const r = createRoundStats(cases);
  r.observe(ev('s1', B, 'story_revealed'));
  assert.equal(r.funnel()[B].asked, 0);
  r.observe(ev('s1', B, 'interview_question', { character: 'momo' }));
  r.observe(ev('s1', B, 'interview_question', { character: 'pip' }));
  assert.equal(r.funnel()[B].asked, 1);
  assert.equal(r.funnel()[B].started, 1);
});

test('empty and unregistered cases', () => {
  const r = createRoundStats(cases);
  assert.deepEqual(r.tallies()[B], NO_TALLY);
  assert.deepEqual(r.funnel()[T], { started: 0, asked: 0, interviewed: 0, verdict: 0, debrief: 0 });
  r.observe(ev('x', 'retired-case', 'session_started'));
  r.observe(verdict('x', 'retired-case'));
  assert.deepEqual(r.players(), { round: 0, finished: 0 });
  assert.deepEqual(Object.keys(r.funnel()), [B, T]);
});

test('players: a reset game is not a current player', () => {
  const r = createRoundStats(cases);
  r.observe(ev('s1', B, 'session_started'));
  r.observe(ev('s1', B, 'session_reset'));
  r.observe(ev('s2', B, 'session_started'));
  assert.deepEqual(r.players(), { round: 1, finished: 0 });
  r.observe(verdict('s2', B));
  assert.deepEqual(r.players(), { round: 1, finished: 1 });
});

test('reset() zeroes everything', () => {
  const r = createRoundStats(cases);
  full(r, 's1');
  r.reset();
  assert.deepEqual(r.players(), { round: 0, finished: 0 });
  assert.equal(r.funnel()[B].started, 0);
  assert.equal(r.tallies()[B].verdicts, 0);
});

test('two v3 verdicts add up per true role', () => {
  const r = createRoundStats(cases);
  r.observe(verdict('a', B, []));
  r.observe(verdict('b', B, ['pip']));
  assert.deepEqual(r.tallies()[B], {
    verdicts: 2, perfect: 1, rolesRight: 7, rolesTotal: 8,
    byRole: { villain: { right: 2, total: 2 }, collaborator: { right: 1, total: 2 }, fooled: { right: 2, total: 2 }, honest: { right: 2, total: 2 } },
    medianMsToVerdict: 1000, medianQuestions: 0, medianCoins: null,
  });
});

test('byRole groups by the true role, whichever character holds it', () => {
  const r = createRoundStats(cases);
  r.observe(verdict('a', B, ['momo']));
  r.observe(verdict('b', B, [], 1000, { momo: 'fooled', pip: 'villain', nori: 'honest', kiki: 'collaborator' }));
  const t = r.tallies()[B];
  assert.deepEqual(t.byRole.villain, { right: 1, total: 2 });
  assert.deepEqual(t.byRole.fooled, { right: 2, total: 2 });
});

test('tower: three fooled apprentices tally under one role', () => {
  const r = createRoundStats(cases);
  r.observe(verdict('a', T, [], 1000, { wren: 'fooled', basil: 'fooled', juniper: 'fooled' }));
  assert.deepEqual(r.tallies()[T].byRole, { fooled: { right: 3, total: 3 } });
  assert.equal(r.tallies()[T].perfect, 1);
});

test('a v2 verdict counts in the funnel only', () => {
  const r = createRoundStats(cases);
  r.observe(ev('o', B, 'session_started'));
  r.observe(legacy('o', B));
  r.observe(verdict('n', B, []));
  assert.equal(r.funnel()[B].verdict, 2);
  assert.equal(r.tallies()[B].verdicts, 1);
  assert.equal(r.players().finished, 2);
  r.reset();
  r.observe(legacy('o', B));
  assert.deepEqual(r.tallies()[B], NO_TALLY);
});

test('medians are the lower middle', () => {
  const r = createRoundStats(cases);
  for (const [i, ms] of [4, 1, 3, 2].entries()) r.observe(verdict('s' + i, B, [], ms));
  assert.equal(r.tallies()[B].medianMsToVerdict, 2);
});

test('only first verdict counts', () => {
  const r = createRoundStats(cases);
  r.observe(verdict('s1', B, []));
  r.observe(verdict('s1', B, ['pip', 'momo']));
  assert.equal(r.tallies()[B].verdicts, 1);
  assert.equal(r.tallies()[B].rolesRight, 4);
});

test('late events after reset are not a new player; session_started revives; unknown characters ignored', () => {
  const r = createRoundStats(cases);
  r.observe(ev('s1', B, 'session_started'));
  r.observe(ev('s1', B, 'session_reset'));
  r.observe(verdict('s1', B));
  r.observe(ev('s1', B, 'interview_question', { character: 'momo' }));
  assert.deepEqual(r.players(), { round: 0, finished: 0 });
  r.observe(ev('s1', B, 'session_started'));
  assert.equal(r.players().round, 1);
  r.observe(ev('s1', B, 'interview_answer', { character: 'ghost' }));
  assert.equal(r.funnel()[B].interviewed, 0);
  r.observe({ sessionId: 's1', caseId: B, type: 'verdict_submitted', elapsedMs: NaN, verdict: truthless() });
  assert.deepEqual(r.tallies()[B].medianMsToVerdict, null);
});

test('a reset game keeps its funnel and tally contributions', () => {
  const r = createRoundStats(cases);
  full(r, 's1');
  r.observe(ev('s1', B, 'session_reset'));
  r.observe(ev('s2', T, 'session_started'));
  assert.deepEqual(r.funnel()[B], { started: 1, asked: 1, interviewed: 1, verdict: 1, debrief: 1 });
  assert.equal(r.funnel()[T].started, 1);
  assert.equal(r.tallies()[B].verdicts, 1);
  assert.equal(r.tallies()[B].perfect, 1);
  assert.deepEqual(r.players(), { round: 1, finished: 1 });
});

test('late events for a reset game change nothing', () => {
  const r = createRoundStats(cases);
  full(r, 's1');
  r.observe(ev('s1', B, 'session_reset'));
  const before = JSON.stringify([r.funnel(), r.tallies(), r.players()]);
  r.observe(verdict('s1', B, ['pip']));
  r.observe(ev('s1', B, 'interview_question', { character: 'momo' }));
  assert.equal(JSON.stringify([r.funnel(), r.tallies(), r.players()]), before);
});

test('resetting an unknown session does not lower the round count', () => {
  const r = createRoundStats(cases);
  r.observe(ev('s1', B, 'session_started'));
  r.observe(ev('ghost', B, 'session_reset'));
  assert.equal(r.players().round, 1);
});

test('medianCoins is the lower middle of verdict coins.spent, null when absent', () => {
  const r = createRoundStats(cases);
  const mk = (sid, spent) => { r.observe({ type: 'session_started', sessionId: sid, caseId: B }); r.observe({ ...verdict(sid, B), ...(spent == null ? {} : { coins: { spent, budget: 9 } }) }); };
  mk('a', 7); mk('b', 3); mk('c', null);
  assert.equal(r.tallies()[B].medianCoins, 3);
  const r2 = createRoundStats(cases);
  r2.observe(verdict('z', B));
  assert.equal(r2.tallies()[B].medianCoins, null);
});
