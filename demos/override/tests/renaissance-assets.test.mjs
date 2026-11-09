import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const assets = path.join(root, 'public/assets/renaissance');

function ihdr(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString(), 'PNG', file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colour: b[25] };
}

test('character poses are 125x188 RGBA', () => {
  for (const s of ['wizard', 'inventor', 'noble', 'guard', 'apothecary', 'scout']) {
    for (const p of ['listening', 'speaking', 'thinking']) {
      const i = ihdr(path.join(assets, 'characters', `${s}-${p}.png`));
      assert.deepEqual([i.w, i.h, i.colour], [125, 188, 6], `${s}-${p}`);
    }
  }
  for (let n = 0; n < 4; n++) {
    const i = ihdr(path.join(assets, 'characters', `scout-walk-${n}.png`));
    assert.deepEqual([i.w, i.h, i.colour], [125, 188, 6]);
  }
});

test('town square is 1536x1024 opaque RGB', () => {
  const i = ihdr(path.join(assets, 'town-square.png'));
  assert.deepEqual([i.w, i.h, i.colour], [1536, 1024, 2]);
});

test('props are small RGBA icons', () => {
  for (const n of ['scroll', 'seal', 'quill']) {
    const i = ihdr(path.join(assets, 'props', `${n}.png`));
    assert.equal(i.colour, 6);
    assert.ok(i.w <= 128 && i.h <= 128 && i.w >= 64);
  }
});

test('quill icon is exactly 96x96 RGBA', () => {
  const i = ihdr(path.join(assets, 'props', 'quill.png'));
  assert.deepEqual([i.w, i.h, i.colour], [96, 96, 6]);
});

test('cut.py frame map never uses row 4', () => {
  const src = fs.readFileSync(path.join(root, 'art/renaissance/cut.py'), 'utf8');
  const m = src.match(/FRAMES = \{[\s\S]*?\n\}\nSCOUT_WALK = \[[^\]]*\]/);
  assert.ok(m, 'frame map found');
  const rows = [...m[0].matchAll(/\((\d), (\d)\)/g)].map((x) => Number(x[1]));
  assert.ok(rows.length >= 16);
  assert.ok(rows.every((r) => r <= 2), 'rows are 0..2 only (row index 3 is the suspicious action)');
});
