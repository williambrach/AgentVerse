import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBubble, LABEL_CLEARANCE } from '../client/bubble-layout.ts';

test('centres above the label', () => assert.deepEqual(placeBubble(240, 120, 140), { left: 170, top: 25, bottom: 105, maxHeight: 101, tail: 70 }));
test('clamps to the left edge', () => assert.deepEqual(placeBubble(30, 120, 140), { left: 4, top: 25, bottom: 105, maxHeight: 101, tail: 26 }));
test('clamps to the right edge', () => assert.deepEqual(placeBubble(470, 120, 140), { left: 336, top: 25, bottom: 105, maxHeight: 101, tail: 134 }));
test('bottom clears the name label box and the tail by at least 2px', () => {
  const labelTop = 120 - 6.5;
  const b = placeBubble(100, 120, 140);
  assert.equal(b.bottom, 120 - LABEL_CLEARANCE);
  assert.ok(b.bottom + 6 <= labelTop - 2);
});
test('growth is bounded by the scene top', () => {
  assert.equal(placeBubble(100, 90, 140).maxHeight, 71);
  assert.equal(placeBubble(100, 2, 140).maxHeight, 0);
});
test('topClear caps the height from the stage top', () => {
  assert.deepEqual(placeBubble(240, 100, 140, 34), { left: 170, top: 5, bottom: 85, maxHeight: 51, tail: 70 });
  assert.equal(placeBubble(240, 100, 140).maxHeight, 81);
  assert.equal(placeBubble(240, 20, 140, 34).maxHeight, 0);
});
