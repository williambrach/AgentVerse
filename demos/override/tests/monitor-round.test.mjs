import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoundStats } from '../server/monitor-round.mjs';
import { cases } from '../server/cases/index.mjs';

let t = 0;
const ev = (sessionId, caseId, type, extra = {}) => ({ sessionId, caseId, type, timestamp: ++t, elapsedMs: 0, character: null, ...extra });
const B = 'banana-mystery';
const T = 'tower-echo-bell';
const verdict = (s, c, suspect, ms = 1000) => ev(s, c, 'verdict_submitted', { elapsedMs: ms, verdict: { suspect, confidence: 80 } });

function full(r, s) {
  r.observe(ev(s, B, 'session_started'));
  for (const c of ['momo', 'pip', 'nori']) {
    r.observe(ev(s, B, 'interview_question', { character: c }));
    r.observe(ev(s, B, 'interview_answer', { character: c }));
  }
  r.observe(verdict(s, B, 'momo', 600000));
  r.observe(ev(s, B, 'debrief_viewed'));
}

test('funnel and tallies for a full session', () => {
  const r = createRoundStats(cases);
  full(r, 's1');
  assert.deepEqual(r.funnel()[B], { started: 1, asked: 1, interviewed: 1, verdict: 1, debrief: 1 });
  assert.deepEqual(r.tallies()[B], { verdicts: 1, correct: 1, accused: { momo: 1 }, medianMsToVerdict: 600000, medianQuestions: 3, medianCoins: null });
});

test('medianQuestions counts interview_question events at verdict', () => {
  const r = createRoundStats(cases);
  for (let i = 0; i < 3; i++) r.observe(ev('s1', B, 'interview_question', { character: 'momo' }));
  r.observe(verdict('s1', B, 'pip'));
  r.observe(ev('s1', B, 'interview_question', { character: 'momo' }));
  assert.equal(r.tallies()[B].medianQuestions, 3);
  assert.equal(r.tallies()[B].correct, 0);
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
  assert.deepEqual(r.tallies()[B], { verdicts: 0, correct: null, accused: {}, medianMsToVerdict: null, medianQuestions: null, medianCoins: null });
  assert.deepEqual(r.funnel()[T], { started: 0, asked: 0, interviewed: 0, verdict: 0, debrief: 0 });
  r.observe(ev('x', 'banana-control', 'session_started'));
  r.observe(verdict('x', 'banana-control', 'momo'));
  assert.deepEqual(r.players(), { round: 0, finished: 0 });
  assert.deepEqual(Object.keys(r.funnel()), [B, T]);
});

test('players: a reset game is not a current player', () => {
  const r = createRoundStats(cases);
  r.observe(ev('s1', B, 'session_started'));
  r.observe(ev('s1', B, 'session_reset'));
  r.observe(ev('s2', B, 'session_started'));
  assert.deepEqual(r.players(), { round: 1, finished: 0 });
  r.observe(verdict('s2', B, 'momo'));
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

test('tower: none is correct, a name is not', () => {
  const r = createRoundStats(cases);
  r.observe(verdict('a', T, 'none'));
  r.observe(verdict('b', T, 'wren'));
  assert.equal(r.tallies()[T].correct, 1);
  assert.deepEqual(r.tallies()[T].accused, { none: 1, wren: 1 });
});

test('medians are the lower middle', () => {
  const r = createRoundStats(cases);
  for (const [i, ms] of [4, 1, 3, 2].entries()) r.observe(verdict('s' + i, B, 'momo', ms));
  assert.equal(r.tallies()[B].medianMsToVerdict, 2);
});

test('only first verdict counts', () => {
  const r = createRoundStats(cases);
  r.observe(verdict('s1', B, 'momo'));
  r.observe(verdict('s1', B, 'pip'));
  assert.deepEqual(r.tallies()[B].accused, { momo: 1 });
});

test('late events after reset are not a new player; session_started revives; unknown characters ignored', () => {
  const r = createRoundStats(cases);
  r.observe(ev('s1', B, 'session_started'));
  r.observe(ev('s1', B, 'session_reset'));
  r.observe(verdict('s1', B, 'momo'));
  r.observe(ev('s1', B, 'interview_question', { character: 'momo' }));
  assert.deepEqual(r.players(), { round: 0, finished: 0 });
  r.observe(ev('s1', B, 'session_started'));
  assert.equal(r.players().round, 1);
  r.observe(ev('s1', B, 'interview_answer', { character: 'ghost' }));
  assert.equal(r.funnel()[B].interviewed, 0);
  r.observe({ sessionId: 's1', caseId: B, type: 'verdict_submitted', elapsedMs: NaN, verdict: { suspect: 'momo' } });
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
  assert.equal(r.tallies()[B].correct, 1);
  assert.deepEqual(r.players(), { round: 1, finished: 1 });
});

test('late events for a reset game change nothing', () => {
  const r = createRoundStats(cases);
  full(r, 's1');
  r.observe(ev('s1', B, 'session_reset'));
  const before = JSON.stringify([r.funnel(), r.tallies(), r.players()]);
  r.observe(verdict('s1', B, 'pip'));
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
  const mk = (sid, spent) => { r.observe({ type: 'session_started', sessionId: sid, caseId: B }); r.observe({ type: 'verdict_submitted', sessionId: sid, caseId: B, verdict: { suspect: 'momo' }, elapsedMs: 1, ...(spent == null ? {} : { coins: { spent, budget: 9 } }) }); };
  mk('a', 7); mk('b', 3); mk('c', null);
  assert.equal(r.tallies()[B].medianCoins, 3);
  const r2 = createRoundStats(cases);
  r2.observe({ type: 'verdict_submitted', sessionId: 'z', caseId: B, verdict: { suspect: 'momo' }, elapsedMs: 1 });
  assert.equal(r2.tallies()[B].medianCoins, null);
});
