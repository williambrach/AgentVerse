import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from './png.mjs';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const assets = path.join(root, 'public/assets/renaissance');

function ihdr(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString(), 'PNG', file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colour: b[25] };
}

const talkFrames = { wizard: 1, inventor: 1, noble: 2, guard: 1, apothecary: 2, scout: 1 };

test('character poses and loops are 132x188 RGBA', () => {
  for (const [s, talk] of Object.entries(talkFrames)) {
    const names = ['listening', 'speaking', 'thinking', ...[0, 1, 2, 3].map(n => `idle-${n}`), ...Array.from({ length: talk }, (_, n) => `talk-${n}`)];
    for (const p of names) {
      const i = ihdr(path.join(assets, 'characters', `${s}-${p}.png`));
      assert.deepEqual([i.w, i.h, i.colour], [132, 188, 6], `${s}-${p}`);
    }
    assert.equal(fs.existsSync(path.join(assets, 'characters', `${s}-talk-${talk}.png`)), false, `${s} has no extra talk frame`);
  }
  for (let n = 0; n < 4; n++) {
    const i = ihdr(path.join(assets, 'characters', `scout-walk-${n}.png`));
    assert.deepEqual([i.w, i.h, i.colour], [132, 188, 6]);
  }
});

test('frames are registered: feet on one line, head over the centre column', () => {
  for (const s of Object.keys(talkFrames)) {
    for (const p of ['listening', 'speaking', 'thinking', 'idle-0', 'idle-1', 'idle-2', 'idle-3']) {
      const { data, width, height } = readPng(path.join(assets, 'characters', `${s}-${p}.png`));
      let bottom = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 8) bottom = y;
      assert.ok(Math.abs(bottom - 184) <= 2, `${s}-${p} feet at ${bottom}`);
    }
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
  const m = src.match(/IDLE = \[[^\]]*\]\n[\s\S]*?SCOUT_WALK = \[[^\]]*\]/);
  assert.ok(m, 'frame map found');
  const rows = [...m[0].matchAll(/\((\d), (\d)\)/g)].map((x) => Number(x[1]));
  assert.ok(rows.length >= 14);
  assert.ok(rows.every((r) => r <= 2), 'rows are 0..2 only (row index 3 is the suspicious action)');
});

test('scout walk sheet (art request R1) ships byte for byte as delivered', (t) => {
  const source = '/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/scout-walk.png';
  const shipped = path.join(assets, 'characters', 'scout-walk.png');
  const i = ihdr(shipped);
  assert.deepEqual([i.w, i.h, i.colour], [1536, 1024, 6]);
  const sha = f => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  // The delivered R1 sheet's digest, pinned so the check runs without the motion pack.
  assert.equal(sha(shipped), '9aab2585cccaf6404ef62817dd49c7e0cb9d037fb9107d657d522553f3d1834d');
  if (!fs.existsSync(source)) return t.skip('motion pack not present');
  assert.equal(sha(shipped), sha(source));
});
