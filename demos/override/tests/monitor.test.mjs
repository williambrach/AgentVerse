import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitor, toRow } from '../server/monitor.mjs';

const SID = '7f3a0000-0000-4000-8000-000000000000';
const T0 = Date.parse('2026-10-29T14:00:00.000Z');
const CASES = [
  { id: 'banana-mystery', title: 'Banana', world: { id: 'grove' }, answer: { culprits: ['momo'] }, characters: [{ id: 'momo', name: 'Momo' }] },
  { id: 'tower-echo-bell', title: 'Tower', world: 'grove', answer: { culprits: [] }, characters: [{ id: 'wren', name: 'Wren' }] },
];
const q = { eventId: 'e1', sessionId: SID, caseId: 'banana-mystery', type: 'interview_question', character: 'pip', question: 'Where were you?', timestamp: '2026-10-29T14:00:00.000Z', elapsedMs: 5000 };
const a = { eventId: 'e2', sessionId: SID, caseId: 'banana-mystery', type: 'interview_answer', character: 'pip', questionEventId: 'e1', answer: 'In the library.', provenance: { endpoint: 'a', failedOver: true }, timestamp: '2026-10-29T14:00:02.140Z', elapsedMs: 7140 };

function fakes(over = {}) {
  const calls = { observe: [], reset: 0, q: 0, ans: [], fail: 0, samples: [], sample: 0 };
  const o = {
    cases: CASES, mode: 'live', ringSize: 1000, now: () => 50_000,
    roundStats: { observe: (e) => calls.observe.push(e), reset: () => { calls.reset++; }, funnel: () => ({}), tallies: () => ({}), players: () => ({ round: 2, finished: 1 }) },
    windows: { question: () => { calls.q++; }, answer: (ms) => calls.ans.push(ms), failure: () => { calls.fail++; }, sample: (s) => calls.samples.push(s),
      stats: () => ({ questionsPerMin: 3, answerP95Ms: 100, llmErrorRate: 0.1 }), history: () => [] },
    presence: { beat: () => {}, counts: () => ({ online: 4, onlineInGame: 3, onlineBoard: 1 }) },
    sample: () => { calls.sample++; return { reqPerSec: 4, reqs: 40, share4xx: 0.25, share5xx: 0, share429: 0, loopP99Ms: 5, rssBytes: 9, diskFreeBytes: null, writeFailures5m: 1, credentialsRejected5m: 0 }; },
    extras: () => ({ router: { active: 'a', pinned: false, inFlight: 2, queued: 1, maxInFlight: 20, endpoints: [] }, sessions: { games: 7 } }),
    readSession: () => null,
    ...over,
  };
  return { m: createMonitor(o), calls };
}

test('toRow maps question, answer, rehearsal, ignored and verdict', () => {
  const ctx = { cases: CASES, mode: 'live', questions: new Map([['e1', T0]]) };
  assert.deepEqual(toRow(q, ctx), { id: 'e1', at: T0, sessionId: SID, player: '7f3a', caseId: 'banana-mystery', kind: 'question', character: 'pip', text: 'Where were you?', ms: null, endpoint: null, failedOver: false, reason: null, verdict: null, elapsedMs: 5000, cost: null });
  const r = toRow(a, ctx);
  assert.equal(r.kind, 'answer'); assert.equal(r.text, 'In the library.'); assert.equal(r.ms, 2140); assert.equal(r.endpoint, 'a'); assert.equal(r.failedOver, true);
  assert.equal(toRow({ ...a, provenance: null }, { ...ctx, mode: 'rehearsal' }).endpoint, 'rehearsal');
  assert.equal(toRow({ type: 'interview_provider_response', timestamp: q.timestamp }, ctx), null);
  const v = toRow({ ...q, type: 'verdict_submitted', caseId: 'tower-echo-bell', verdict: { suspect: 'none', confidence: 70 } }, ctx);
  assert.deepEqual(v.verdict, { suspect: 'none', confidence: 70, correct: true });
  const f = toRow({ ...q, type: 'interview_failed', reason: 'timeout', provenance: null }, ctx);
  assert.equal(f.kind, 'failure'); assert.equal(f.text, 'Where were you?'); assert.equal(f.reason, 'timeout');
  assert.equal(toRow({ ...q, type: 'location_visited', location: 'Kitchen' }, ctx).text, 'Kitchen');
});

test('rows reach subscribers in order; throwing subscriber dropped; observeGame never throws', () => {
  const { m } = fakes();
  const got = []; let boom = 0;
  m.subscribe(() => { boom++; throw new Error('x'); });
  m.subscribe((r) => got.push(r.id));
  assert.doesNotThrow(() => { m.observeGame(q); m.observeGame(a); m.observeGame(null); m.observeGame({ type: 'x' }); });
  assert.deepEqual(got, ['e1', 'e2']);
  assert.equal(boom, 1);
});

test('ring capped, answers feed windows, pre-round events skip roundStats', () => {
  const { m, calls } = fakes({ ringSize: 3 });
  m.load([], { label: 'B', startedAt: T0 + 1000 });
  for (let i = 0; i < 5; i++) m.observeGame({ ...q, eventId: `x${i}` });
  assert.equal(m.recent().length, 3);
  assert.deepEqual(m.recent(2).map((r) => r.id), ['x3', 'x4']);
  assert.equal(calls.observe.length, 0);
  m.observeGame(q); m.observeGame(a);
  assert.equal(calls.q, 6); assert.deepEqual(calls.ans, [2140]);
  m.observeGame({ ...q, timestamp: '2026-10-29T14:00:05.000Z', eventId: 'late' });
  assert.equal(calls.observe.length, 2);
});

test('startRound resets and returns label/startedAt; failoverAt from observeLlm', () => {
  const { m, calls } = fakes();
  assert.deepEqual(m.startRound({ label: 'S', reason: 'r' }), { label: 'S', startedAt: 50_000 });
  assert.equal(calls.reset, 1);
  assert.equal(m.snapshot().traffic.failoverAt, null);
  m.observeLlm({ type: 'failover', from: 'a', to: 'b', reason: 'x' });
  assert.equal(m.snapshot().traffic.failoverAt, 50_000);
});

test('snapshot keys; tick samples once, snapshot never', () => {
  const { m, calls } = fakes();
  const s = m.snapshot();
  assert.equal(calls.sample, 0);
  assert.deepEqual(Object.keys(s), ['at', 'mode', 'round', 'players', 'traffic', 'history', 'funnel', 'tallies', 'router', 'sessions', 'system']);
  assert.deepEqual(Object.keys(s.players), ['online', 'onlineInGame', 'onlineBoard', 'playing', 'round', 'finished']);
  assert.deepEqual(Object.keys(s.traffic), ['reqPerSec', 'share4xx', 'share5xx', 'share429', 'questionsPerMin', 'answerP95Ms', 'llmErrorRate', 'queue', 'inFlight', 'cap', 'active', 'pinned', 'loopP99Ms', 'rssBytes', 'diskFreeBytes', 'writeFailures5m', 'failoverAt', 'credentialsRejected5m']);
  assert.equal(s.players.playing, 7);
  m.tick();
  assert.equal(calls.sample, 1);
  assert.deepEqual(calls.samples, [{ online: 4, reqs: 40 }]);
  const t = m.snapshot().traffic;
  assert.equal(t.reqPerSec, 4); assert.equal(t.queue, 1); assert.equal(t.cap, 20); assert.equal(t.active, 'a');
  assert.equal(calls.sample, 1);
});

test('load replays silently; session maps rows; catalog', () => {
  const { m } = fakes({ readSession: (id) => (id === SID ? [q, a] : null) });
  const got = []; m.subscribe((r) => got.push(r));
  m.load([q, a], { label: null, startedAt: 0 });
  assert.equal(got.length, 0);
  assert.deepEqual(m.recent().map((r) => r.id), ['e1', 'e2']);
  assert.equal(m.session('nope'), null);
  const rows = m.session(SID);
  assert.deepEqual(rows, m.recent());
  assert.equal(rows[1].ms, 2140);
  assert.deepEqual(m.catalog()[0], { id: 'banana-mystery', title: 'Banana', world: 'grove', answer: ['momo'], characters: [{ id: 'momo', name: 'Momo' }] });
  m.observeSystem({ type: 'round_started' });
  assert.equal(m.snapshot().system.length, 1);
});

test('isolation: failing collaborators never throw, subscribers still notified', () => {
  const boom = () => { throw new Error('x'); };
  const { m } = fakes({
    roundStats: { observe: boom, reset: () => {}, funnel: () => ({}), tallies: () => ({}), players: () => ({ round: 0, finished: 0 }) },
    windows: { question: boom, answer: boom, failure: boom, sample: boom, stats: () => ({}), history: () => [] },
    presence: { beat: boom, counts: () => ({ online: 0, onlineInGame: 0, onlineBoard: 0 }) },
    sample: boom,
  });
  const got = []; m.subscribe((r) => got.push(r.id));
  assert.doesNotThrow(() => { m.observeGame(q); m.observeGame(a); m.heartbeat('t', SID); m.tick(); m.observeLlm(null); m.observeSystem(null); });
  assert.deepEqual(got, ['e1', 'e2']);
});

test('recent(0) is empty; startRound trims label', () => {
  const { m } = fakes();
  m.observeGame(q);
  assert.deepEqual(m.recent(0), []);
  assert.equal(m.recent(1).length, 1);
  assert.equal(m.startRound({ label: '  B  ' }).label, 'B');
  assert.equal(m.startRound({ label: '   ' }).label, null);
});

test('story_revealed and evidence_selected (old logs) produce no row', () => {
  const base = { eventId: 'c1', sessionId: SID, caseId: 'tower-echo-bell', timestamp: q.timestamp };
  assert.equal(toRow({ ...base, type: 'story_revealed', revealedPosition: 1 }, {}), null);
  assert.equal(toRow({ ...base, type: 'evidence_selected', selectedEvidence: 'x' }, {}), null);
});

test('llmErrorRate is failed provider attempts over 5 min, not player-visible failures', () => {
  let t = 50_000;
  const { m } = fakes({ now: () => t });
  assert.equal(m.snapshot().traffic.llmErrorRate, 0);
  for (let i = 0; i < 10; i++) m.observeLlm({ type: 'attempt', endpoint: 'a', ok: i >= 3, reason: 'http_500', durationMs: 5, semantic: false, queueMs: 0 });
  assert.equal(m.snapshot().traffic.llmErrorRate, 0.3);
  m.observeGame({ ...q, type: 'interview_failed', reason: 'timeout', provenance: null });
  assert.equal(m.snapshot().traffic.llmErrorRate, 0.3);
  t += 301_000;
  assert.equal(m.snapshot().traffic.llmErrorRate, 0);
  assert.doesNotThrow(() => { m.observeLlm(undefined); m.observeLlm('x'); m.observeLlm({ type: 'attempt' }); m.observeLlm({ type: 'attempt', ok: {} }); });
});

test('toRow maps chatter, inspect, chatter_failed and cost', () => {
  const ctx = { cases: CASES, mode: 'live', questions: new Map() };
  const c = toRow({ ...q, type: 'chatter_line', text: 'hi all', provenance: { endpoint: 'a' }, spend: { tools: [], cost: 2, total: 5 } }, ctx);
  assert.equal(c.kind, 'chatter'); assert.equal(c.text, 'hi all'); assert.equal(c.endpoint, 'a'); assert.equal(c.cost, 2);
  assert.equal(toRow({ ...q, type: 'chatter_line', text: 'x', provenance: null }, { ...ctx, mode: 'rehearsal' }).endpoint, 'rehearsal');
  const i = toRow({ ...q, type: 'reasoning_inspected', reasoning: 'because', spend: { cost: 1, total: 1 } }, ctx);
  assert.equal(i.kind, 'inspect'); assert.equal(i.text, 'because'); assert.equal(i.cost, 1);
  const f = toRow({ ...q, type: 'chatter_failed', reason: 'timeout', provenance: null }, ctx);
  assert.equal(f.kind, 'failure'); assert.equal(f.text, null); assert.equal(f.reason, 'timeout');
});

test('sessionCoins reads budget and last spend total; old logs give 0 / null', () => {
  const ev = { s1: [{ type: 'session_started', economy: { budget: 9 } }, { type: 'x', spend: { total: 3 } }, { type: 'y', spend: { total: 5 } }], s2: [{ type: 'session_started' }], none: null };
  const { m } = fakes({ readSession: (id) => ev[id] ?? null });
  assert.deepEqual(m.sessionCoins('s1'), { spent: 5, budget: 9 });
  assert.deepEqual(m.sessionCoins('s2'), { spent: 0, budget: null });
  assert.equal(m.sessionCoins('none'), null);
});
