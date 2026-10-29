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
  r.observe(ev(s, B, 'story_revealed'));
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
  assert.deepEqual(r.funnel()[B], { started: 1, clues: 1, interviewed: 1, verdict: 1, debrief: 1 });
  assert.deepEqual(r.tallies()[B], { verdicts: 1, correct: 1, accused: { momo: 1 }, medianMsToVerdict: 600000, medianQuestions: 3 });
});

test('medianQuestions counts interview_question events at verdict', () => {
  const r = createRoundStats(cases);
  for (let i = 0; i < 3; i++) r.observe(ev('s1', B, 'interview_question', { character: 'momo' }));
  r.observe(verdict('s1', B, 'pip'));
  r.observe(ev('s1', B, 'interview_question', { character: 'momo' }));
  assert.equal(r.tallies()[B].medianQuestions, 3);
  assert.equal(r.tallies()[B].correct, 0);
});

test('second story_revealed does not count twice', () => {
  const r = createRoundStats(cases);
  r.observe(ev('s1', B, 'story_revealed'));
  r.observe(ev('s1', B, 'story_revealed'));
  assert.equal(r.funnel()[B].clues, 1);
  assert.equal(r.funnel()[B].started, 1);
});

test('empty and unregistered cases', () => {
  const r = createRoundStats(cases);
  assert.deepEqual(r.tallies()[B], { verdicts: 0, correct: null, accused: {}, medianMsToVerdict: null, medianQuestions: null });
  assert.deepEqual(r.funnel()[T], { started: 0, clues: 0, interviewed: 0, verdict: 0, debrief: 0 });
  r.observe(ev('x', 'banana-control', 'session_started'));
  r.observe(verdict('x', 'banana-control', 'momo'));
  assert.deepEqual(r.players(), { round: 0, finished: 0 });
  assert.deepEqual(Object.keys(r.funnel()), [B, T]);
});

test('players: reset drops the session', () => {
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
  r.observe(ev('s1', B, 'story_revealed'));
  assert.deepEqual(r.players(), { round: 0, finished: 0 });
  r.observe(ev('s1', B, 'session_started'));
  assert.equal(r.players().round, 1);
  r.observe(ev('s1', B, 'interview_answer', { character: 'ghost' }));
  assert.equal(r.funnel()[B].interviewed, 0);
  r.observe({ sessionId: 's1', caseId: B, type: 'verdict_submitted', elapsedMs: NaN, verdict: { suspect: 'momo' } });
  assert.deepEqual(r.tallies()[B].medianMsToVerdict, null);
});
