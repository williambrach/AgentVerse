import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenCounter } from '../server/monitor-tokens.mjs';

const make = () => { const t = { v: 0 }; return { t, c: createTokenCounter({ now: () => t.v }) }; };

test('adds and resets the round', () => {
  const { c } = make();
  c.add({ promptTokens: 100, completionTokens: 20 });
  assert.deepEqual(c.stats(), { total: { prompt: 100, completion: 20, total: 120 }, round: { prompt: 100, completion: 20, total: 120 }, perMin: 120, calls: 1 });
  c.startRound();
  assert.deepEqual(c.stats().round, { prompt: 0, completion: 0, total: 0 });
  assert.equal(c.stats().total.total, 120);
});

test('test_missing_usage_counts_call_only', () => {
  const { c } = make();
  c.add({}); c.add({ promptTokens: null, completionTokens: 'x' });
  const s = c.stats();
  assert.equal(s.calls, 2); assert.equal(s.total.total, 0); assert.equal(s.perMin, 0);
});

test('test_per_min_window', () => {
  const { t, c } = make();
  c.add({ promptTokens: 10, completionTokens: 5 });
  t.v = 61000;
  c.add({ promptTokens: 3, completionTokens: 1 });
  assert.equal(c.stats().perMin, 4);
  assert.equal(c.stats().total.total, 19);
});
