import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { worldFor } from '../client/worlds.ts';

const pub = fileURLToPath(new URL('../public', import.meta.url));

test('factory_floor_art: the painted floor at 5/12, no backdrop behaviour', () => {
  const w = worldFor('factory');
  assert.deepEqual(w.floorArt, { url: '/assets/factory/factory-floor.png', width: 1536, height: 1024, scale: 5 / 12, x: -88, y: -20, fill: '#7b755e' });
  // Full screen: covers the widest stage views up to 16:9 (1280 x 720 shows x -87..517, 1920 x 1080 -62..542).
  assert.ok(w.floorArt.x <= -87 && w.floorArt.x + w.floorArt.width * w.floorArt.scale >= 542);
  assert.equal(w.backdrop, undefined);
  // Same aspect as the source and wide enough to cover the 480 x 340 world.
  assert.ok(w.floorArt.x <= 0 && w.floorArt.x + w.floorArt.width * w.floorArt.scale >= 480);
  assert.ok(w.floorArt.y <= 0 && w.floorArt.y + w.floorArt.height * w.floorArt.scale >= 340);
  // The wall props stand on the floor, below the painted wall base (source y 234).
  const wallBase = w.floorArt.y + 234 * w.floorArt.scale;
  for (const p of w.floor.props) assert.ok(p.y > wallBase, `${p.id} above the wall base`);
});

test('factory_floor_png: opaque 1536 x 1024 PNG', () => {
  const buf = readFileSync(`${pub}/assets/factory/factory-floor.png`);
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG');
  assert.equal(buf.readUInt32BE(16), 1536);
  assert.equal(buf.readUInt32BE(20), 1024);
  assert.equal(buf[25], 2, 'colour type RGB (no alpha)');
});

test('floor_art_factory_only', () => {
  for (const id of ['grove', 'tower', 'friends', 'department', 'renaissance']) assert.equal(worldFor(id).floorArt, undefined, id);
});
