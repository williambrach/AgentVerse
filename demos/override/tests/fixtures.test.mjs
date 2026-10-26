import test from 'node:test';
import assert from 'node:assert/strict';
import { minimalCase } from './fixtures/minimal-case.mjs';
test('minimal case fixture has the agreed shape', () => {
  assert.equal(minimalCase.id, 'mini-case');
  assert.deepEqual(minimalCase.characters.map(c => c.id), ['momo', 'pip', 'nori']);
  assert.equal(minimalCase.records.length, 1);
  assert.deepEqual(Object.keys(minimalCase.copy), ['headline', 'intro', 'briefing', 'basket', 'report']);
  assert.equal(typeof minimalCase.rehearsal, 'function');
});
