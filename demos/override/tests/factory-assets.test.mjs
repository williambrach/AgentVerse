import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FACTORY = fileURLToPath(new URL('../public/assets/factory/', import.meta.url));
const PACK_EXPORTS = '/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports';

const CHARACTERS = ['detective', 'worker-01', 'worker-02', 'worker-03', 'worker-04', 'worker-05']
  .flatMap((who) => ['listening', 'speaking', 'thinking'].map((pose) => `characters/${who}-${pose}.png`));
const PROPS = [
  'conveyor', 'assembly-robot', 'control-terminal', 'packing-bench', 'shipping-crates', 'locker',
  'electrical-cabinet', 'emergency-stop', 'exit-door', 'safety-barrier', 'server-rack', 'parts-bin',
].map((id) => `props/${id}.png`);
// The detective's walk sheet (art request F1), shipped byte for byte as delivered.
const WALK = 'characters/detective-walk.png';
const MOTION = '/Users/williambrach/Developer/arbiter/assets/motion-v1/factory';
const LISTED = [...CHARACTERS, WALK, ...PROPS];

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

test('factory_assets_listed', () => {
  assert.equal(CHARACTERS.length, 18);
  assert.equal(PROPS.length, 12);
  for (const rel of LISTED) assert.ok(existsSync(join(FACTORY, rel)), `missing ${rel}`);
  for (const dir of ['characters', 'props']) {
    const want = LISTED.filter((r) => r.startsWith(`${dir}/`)).map((r) => r.slice(dir.length + 1)).sort();
    assert.deepEqual(readdirSync(join(FACTORY, dir)).sort(), want, `${dir} has extra or missing files`);
  }
});

test('factory_character_size', () => {
  for (const rel of CHARACTERS) {
    const buf = readFileSync(join(FACTORY, rel));
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `not a PNG: ${rel}`);
    assert.equal(buf.readUInt32BE(16), 192, `width of ${rel}`);
    assert.equal(buf.readUInt32BE(20), 384, `height of ${rel}`);
    assert.ok([4, 6].includes(buf[25]), `no alpha channel: ${rel}`);
  }
});

test('factory_assets_match_pack', (t) => {
  if (!existsSync(PACK_EXPORTS)) {
    t.skip(`pack not present at ${PACK_EXPORTS}`);
    return;
  }
  for (const rel of LISTED) {
    if (rel === WALK) continue;
    assert.equal(sha256(join(FACTORY, rel)), sha256(join(PACK_EXPORTS, rel)), `sha256 differs for ${rel}`);
  }
});

test('factory_walk_sheet_untouched', (t) => {
  // The delivered F1 sheet's digest, pinned so the check runs without the motion pack.
  assert.equal(sha256(join(FACTORY, WALK)), 'b786b446e5b5d0e7878077b6ebb40b51adcaa165e6166535f9d543a655de53ad');
  if (!existsSync(join(MOTION, 'detective-walk.png'))) {
    t.skip('motion pack not present');
    return;
  }
  assert.equal(sha256(join(FACTORY, WALK)), sha256(join(MOTION, 'detective-walk.png')));
});
