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
const LISTED = [...CHARACTERS, ...PROPS];

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
    assert.equal(sha256(join(FACTORY, rel)), sha256(join(PACK_EXPORTS, rel)), `sha256 differs for ${rel}`);
  }
});
