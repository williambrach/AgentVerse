import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as m from '../client/scenery.ts';

const atlas = JSON.parse(readFileSync(new URL('../public/assets/renaissance/expansion/atlas.json', import.meta.url), 'utf8'));
const barrel = () => m.atlasItem(atlas, 'market-props.png', 'barrel');
const P = { far: { y: 150, scale: 0.9 }, near: { y: 320, scale: 1 } };

test('atlas_item_lookup', () => {
  assert.deepEqual(barrel(), { id: 'barrel', sourceRect: [444, 107, 260, 376], anchor: [130, 372] });
});
test('place_prop_examples', () => {
  assert.deepEqual(m.placeProp(barrel(), { id: 'barrel', x: 100, y: 200, width: 26, foot: { w: 20, h: 6 } }),
    { scale: 0.1, originX: 0.5, originY: 372 / 376, depth: 200, footprint: { x: 90, y: 194, w: 20, h: 6 } });
  assert.deepEqual(m.placeProp(barrel(), { id: 'barrel', x: 100, y: 200, width: 26 }, 0.5),
    { scale: 0.05, originX: 0.5, originY: 372 / 376, depth: 200, footprint: null });
});
test('depth_scale_examples', () => {
  assert.ok(Math.abs(m.depthScale(P, 235) - 0.95) < 1e-9 || Math.abs(m.depthScale(P, 235) - 0.95) < 0.003);
  assert.equal(m.depthScale(undefined, 10), 1);
});
test('clamps_outside_range', () => {
  assert.equal(m.depthScale(P, 100), 0.9);
  assert.equal(m.depthScale(P, 400), 1);
});
test('foot_scales_with_factor', () => {
  const r = m.placeProp(barrel(), { id: 'barrel', x: 100, y: 200, width: 26, foot: { w: 20, h: 6 } }, 0.5);
  assert.deepEqual(r.footprint, { x: 95, y: 197, w: 10, h: 3 });
});
test('unknown_id_undefined', () => {
  assert.equal(m.atlasItem(atlas, 'market-props.png', 'nope'), undefined);
  assert.equal(m.atlasItem(atlas, 'nope.png', 'barrel'), undefined);
});
test('copies_byte_identical', t => {
  const src = '/Users/williambrach/Developer/arbiter/assets/castelvento-expansion-v1/';
  if (!existsSync(src)) return t.skip('source dir missing');
  for (const f of ['market-props.png', 'inventory-objects.png', 'atlas.json']) {
    const h = p => createHash('sha256').update(readFileSync(p)).digest('hex');
    assert.equal(h(new URL(`../public/assets/renaissance/expansion/${f}`, import.meta.url)), h(src + f));
  }
});
