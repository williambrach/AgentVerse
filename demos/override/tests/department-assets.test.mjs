import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from './png.mjs';

const DEPARTMENT = fileURLToPath(new URL('../public/assets/department/', import.meta.url));
const PACK = '/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2';

const CHARACTERS = ['phd-01', 'phd-02', 'professor', 'it-admin', 'department-admin', 'player']
  .flatMap((who) => ['listening', 'speaking', 'thinking'].map((pose) => `characters/${who}-${pose}.png`));
const PROPS = [
  'access-card', 'case-folder', 'coffee-mug', 'cracked-phone', 'evidence-bag', 'evidence-marker',
  'keys', 'laptop', 'notebook', 'server-tower', 'torn-document', 'usb-drive',
].map((id) => `props/${id}.png`);
const BACKDROP = 'department-hall.png';
const LISTED = [...CHARACTERS, ...PROPS, BACKDROP];

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Source file in the pack for each shipped file. */
function packSource(rel) {
  if (rel === BACKDROP) return join(PACK, 'source', 'department-hall.png');
  if (rel.startsWith('props/')) return join(PACK, 'exports', rel);
  const name = rel.slice('characters/'.length);
  if (name.startsWith('player-')) return join(PACK, 'main-character', 'exports', name);
  return join(PACK, 'exports', 'characters', name);
}

test('department_assets_listed', () => {
  assert.equal(CHARACTERS.length, 18);
  assert.equal(PROPS.length, 12);
  for (const rel of LISTED) assert.ok(existsSync(join(DEPARTMENT, rel)), `missing ${rel}`);
  for (const dir of ['characters', 'props']) {
    const want = LISTED.filter((r) => r.startsWith(`${dir}/`)).map((r) => r.slice(dir.length + 1)).sort();
    assert.deepEqual(readdirSync(join(DEPARTMENT, dir)).sort(), want, `${dir} has extra or missing files`);
  }
  assert.ok(existsSync(join(DEPARTMENT, BACKDROP)), 'missing department-hall.png');
});

test('department_character_png', () => {
  for (const rel of CHARACTERS) {
    const path = join(DEPARTMENT, rel);
    const buf = readFileSync(path);
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `not a PNG: ${rel}`);
    assert.equal(buf.readUInt32BE(16), 192, `width of ${rel}`);
    assert.equal(buf.readUInt32BE(20), 384, `height of ${rel}`);
    assert.equal(buf[25], 6, `colour type of ${rel}`);

    const png = readPng(path);
    const alpha = (x, y) => png.data[(y * png.width + x) * 4 + 3];
    const corners = [[0, 0], [191, 0], [0, 383], [191, 383]];
    for (const [x, y] of corners) assert.equal(alpha(x, y), 0, `corner (${x},${y}) opaque in ${rel}`);

    let lowest = -1;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        if (alpha(x, y) > 16) { lowest = y; break; }
      }
    }
    assert.ok(lowest >= 366 && lowest <= 383, `lowest opaque row ${lowest} out of 366..383 in ${rel}`);
  }
});

test('department_props_png', () => {
  for (const rel of PROPS) {
    const buf = readFileSync(join(DEPARTMENT, rel));
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `not a PNG: ${rel}`);
    assert.equal(buf.readUInt32BE(16), 256, `width of ${rel}`);
    assert.equal(buf.readUInt32BE(20), 256, `height of ${rel}`);
  }
});

test('department_backdrop_png', () => {
  const buf = readFileSync(join(DEPARTMENT, BACKDROP));
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', 'backdrop is not a PNG');
  assert.equal(buf.readUInt32BE(16), 1536, 'backdrop width');
  assert.equal(buf.readUInt32BE(20), 1024, 'backdrop height');
});

test('department_assets_match_pack', (t) => {
  if (!existsSync(PACK)) {
    t.skip(`pack not present at ${PACK}`);
    return;
  }
  for (const rel of LISTED) {
    assert.equal(sha256(join(DEPARTMENT, rel)), sha256(packSource(rel)), `sha256 differs for ${rel}`);
  }
});
