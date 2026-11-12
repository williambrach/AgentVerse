import test from 'node:test';
import assert from 'node:assert/strict';
import { worldFor } from '../client/worlds.ts';
import { spriteScale } from '../client/factory-figures.ts';

const ids = ['grove', 'tower', 'friends', 'factory', 'department', 'renaissance'];

test('renaissance_has_scenery_and_perspective', () => {
  const w = worldFor('renaissance');
  assert.equal(w.scenery.sheet, '/assets/renaissance/expansion/market-props.png');
  assert.equal(w.scenery.atlas, '/assets/renaissance/expansion/atlas.json');
  assert.equal(w.scenery.props.length, 8);
  for (const p of w.scenery.props) assert.equal(typeof p.id, 'string');
  assert.deepEqual(w.perspective, { far: { y: 158, scale: 0.86 }, near: { y: 326, scale: 1 } });
});

test('other_worlds_have_neither', () => {
  for (const id of ids.filter(i => i !== 'renaissance')) {
    const w = worldFor(id);
    assert.equal(w.scenery, undefined, id);
    assert.equal(w.perspective, undefined, id);
  }
});

test('labels_compact_on_department_and_renaissance_only', () => {
  for (const id of ids) assert.equal(worldFor(id).labels, id === 'department' || id === 'renaissance' ? 'compact' : undefined, id);
});

test('sprite_scale_takes_a_depth_factor', () => {
  const art = worldFor('renaissance').figures;
  assert.equal(spriteScale(art, 'wizard'), 1 / 3);
  assert.equal(spriteScale(art, 'wizard', 0.9), (1 / 3) * 0.9);
});

test('figure_click_has_enabled_covered_and_typing_guards', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../client/station.ts', import.meta.url), 'utf8');
  assert.match(src, /pointerdown', \(\) => \{ if \(this\.enabled && !this\.covered && !this\.typing\(\)\) this\.onArrival\(id\)/);
});
