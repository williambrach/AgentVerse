import test from 'node:test';
import assert from 'node:assert/strict';
import { stageLayout, WORLD_WIDTH, WORLD_HEIGHT, RAIL, COMPACT_QUERY } from '../client/stage-layout.ts';

const r3 = n => Math.round(n * 1000) / 1000;

test('constants', () => {
  assert.deepEqual([WORLD_WIDTH, WORLD_HEIGHT, RAIL], [480, 340, 252]);
  assert.match(COMPACT_QUERY, /max-width: 900px/);
});

test('known_layouts', () => {
  const a = stageLayout(1440, 900, 252);
  assert.deepEqual({ ...a, scale: r3(a.scale) }, { width: 544, height: 340, offsetX: 64, offsetY: 0, scale: 2.647 });
  const b = stageLayout(1440, 1000, 252);
  assert.deepEqual({ ...b, scale: r3(b.scale) }, { width: 543, height: 377, offsetX: 63, offsetY: 19, scale: 2.652 });
  const c = stageLayout(1920, 1080, 252);
  assert.deepEqual([c.width, c.height, c.offsetX, c.offsetY], [604, 340, 62, 0]);
  const d = stageLayout(1366, 768, 252);
  assert.equal(d.width, 605);
  assert.equal(d.offsetX, 80);
});

test('rail_only_covers_the_unwalkable_left_edge', () => {
  for (const [w, h] of [[1440, 900], [1440, 1000], [1920, 1080], [1366, 768]]) {
    const l = stageLayout(w, h, 252);
    assert.ok((l.offsetX + 32) * l.scale >= 251, `${w}x${h}`);
    assert.ok(l.width >= 480 && l.height >= 340);
    assert.ok(l.offsetX >= 0 && l.offsetX <= l.width - 480);
  }
});

test('exact_division_does_not_round_up', () => {
  // s = 1, rail 100: ceil(100) - 32 = 68, not 69.
  const l = stageLayout(548, 340, 100);
  assert.equal(l.scale, 1);
  assert.equal(l.offsetX, 68);
});
