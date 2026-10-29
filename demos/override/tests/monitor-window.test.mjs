import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindows, createPresence } from '../server/monitor-window.mjs';

const clock = (t = 0) => ({ now: () => t, set: v => { t = v; } });
function loaded() {
  const c = clock(0);
  const w = createWindows({ now: c.now });
  for (let i = 0; i < 25; i++) w.question();
  for (let i = 1; i <= 20; i++) w.answer(1000 * i);
  for (let i = 0; i < 5; i++) w.failure();
  return { c, w };
}

test('stats over the windows', () => {
  const { w } = loaded();
  assert.deepEqual(w.stats(), { questionsPerMin: 25, answerP95Ms: 19000, llmErrorRate: 0.2 });
});

test('stats age out', () => {
  const { c, w } = loaded();
  c.set(301000);
  assert.deepEqual(w.stats(), { questionsPerMin: 0, answerP95Ms: null, llmErrorRate: 0 });
});

test('questions age out after a minute, answers after five', () => {
  const { c, w } = loaded();
  c.set(61000);
  assert.equal(w.stats().questionsPerMin, 0);
  assert.equal(w.stats().answerP95Ms, 19000);
});

test('history merges samples into the minute', () => {
  const { c, w } = loaded();
  w.sample({ online: 12, reqs: 300 });
  c.set(30000);
  w.sample({ online: 9, reqs: 100 });
  assert.deepEqual(w.history(), [{ at: 0, online: 12, questions: 25, failures: 5, p95Ms: 19000, reqs: 400 }]);
});

test('history keeps 60 minutes, oldest first', () => {
  const c = clock(0);
  const w = createWindows({ now: c.now });
  for (let m = 0; m < 70; m++) { c.set(m * 60000); w.sample({ online: m, reqs: 1 }); }
  const h = w.history();
  assert.equal(h.length, 60);
  assert.equal(h[0].at, 10 * 60000);
  assert.equal(h[59].at, 69 * 60000);
  assert.equal(h[0].p95Ms, null);
});

test('latencies per minute are capped at 5000', () => {
  const c = clock(0);
  const w = createWindows({ now: c.now });
  for (let i = 0; i < 6000; i++) w.answer(i < 5000 ? 1 : 99999);
  assert.equal(w.history()[0].p95Ms, 1);
});

test('presence counts board and game tabs', () => {
  const c = clock(0);
  const p = createPresence({ now: c.now, windowMs: 75000, max: 5000 });
  p.beat('t1', null);
  p.beat('t2', 's1');
  assert.deepEqual(p.counts(), { online: 2, onlineInGame: 1, onlineBoard: 1 });
  c.set(76000);
  assert.deepEqual(p.counts(), { online: 0, onlineInGame: 0, onlineBoard: 0 });
});

test('a second beat with a session moves the tab to the game', () => {
  const c = clock(0);
  const p = createPresence({ now: c.now, windowMs: 75000, max: 5000 });
  p.beat('t1', null);
  p.beat('t1', 's1');
  assert.deepEqual(p.counts(), { online: 1, onlineInGame: 1, onlineBoard: 0 });
});

test('presence over max drops the oldest tab', () => {
  const c = clock(0);
  const p = createPresence({ now: c.now, windowMs: 75000, max: 3 });
  for (const t of ['a', 'b', 'c', 'd']) p.beat(t, null);
  assert.equal(p.counts().online, 3);
  p.beat('b', 's');
  p.beat('e', null);
  assert.deepEqual(p.counts(), { online: 3, onlineInGame: 1, onlineBoard: 2 });
  const d = createPresence({ now: c.now, windowMs: 75000, max: 5000 });
  d.beat('x', null);
  assert.equal(d.counts().online, 1);
});

test('answer ignores non-finite latency', async () => {
  const { createWindows } = await import('../server/monitor-window.mjs');
  const w = createWindows({ now: () => 1000 });
  w.answer(NaN); w.answer(undefined); w.answer(100);
  assert.equal(w.stats().answerP95Ms, 100);
  assert.equal(w.stats().llmErrorRate, 0);
});
