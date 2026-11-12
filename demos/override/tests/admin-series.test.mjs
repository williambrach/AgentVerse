import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeries } from '../server/admin/series.js';

const snap = (at, over = {}) => ({
  at, players: { online: 3 },
  traffic: { questionsPerMin: 5, answerP95Ms: 900, llmErrorRate: 0.1, reqPerSec: 7, loopP99Ms: 20, queue: 1, inFlight: 2, rssBytes: 1e8, tokensPerMin: 4000, ...over },
});

test('test_keys', () => {
  const s = createSeries();
  s.push(snap(1000));
  assert.deepEqual(s.points('online', 0, 2000), [[1000, 3]]);
  const want = { questionsPerMin: 5, answerP95Ms: 900, llmErrorRate: 0.1, reqPerSec: 7, loopP99Ms: 20, queue: 1, inFlight: 2, rssBytes: 1e8, tokensPerMin: 4000 };
  for (const [k, v] of Object.entries(want)) assert.equal(s.latest(k), v, k);
  const s2 = createSeries();
  const x = snap(1000); delete x.traffic.tokensPerMin;
  s2.push(x);
  assert.equal(s2.latest('tokensPerMin'), null);
  assert.deepEqual(s2.points('tokensPerMin', 0, 5000), []);
});

test('test_out_of_order_ignored', () => {
  const s = createSeries();
  s.push(snap(2000)); s.push(snap(1500));
  assert.deepEqual(s.points('online', 0, 9999), [[2000, 3]]);
});

test('test_cap_drops_old', () => {
  const s = createSeries({ capMs: 10000 });
  s.push(snap(0)); s.push(snap(20000));
  assert.equal(s.points('online', 0, 30000).length, 1);
});

test('test_downsample_keeps_max', () => {
  const s = createSeries({ capMs: 1e9 });
  for (let i = 0; i < 1000; i++) s.push({ at: i, players: { online: i === 500 ? 50 : 1 }, traffic: {} });
  const p = s.points('online', 0, 999, 10);
  assert.ok(p.length <= 10);
  assert.ok(p.some((q) => q[1] === 50));
});

test('test_non_numbers_skipped', () => {
  const s = createSeries();
  s.push(snap(1000, { answerP95Ms: null }));
  assert.deepEqual(s.points('answerP95Ms', 0, 2000), []);
  assert.equal(s.points('online', 0, 2000).length, 1);
});

test('test_seed_before_push', () => {
  const s = createSeries();
  s.seed([{ at: 60000, online: 4, questions: 12, failures: 0, p95Ms: 900, reqs: 600 }]);
  assert.deepEqual(s.points('reqPerSec', 0, 120000), [[60000, 10]]);
  s.push(snap(100000));
  s.seed([{ at: 50000, online: 9 }, { at: 100000, online: 8 }, { at: 150000, online: 7 }]);
  assert.deepEqual(s.points('online', 0, 200000), [[50000, 9], [60000, 4], [100000, 3]].sort((a, b) => a[0] - b[0]));
});
