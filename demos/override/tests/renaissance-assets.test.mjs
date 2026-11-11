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

const talkFrames = { wizard: 1, inventor: 1, noble: 2, guard: 1, apothecary: 1, scout: 1 };

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

test('town square is the supplied market square, 1536x1024 opaque RGB, byte for byte', (t) => {
  const shipped = path.join(assets, 'town-square.png');
  const i = ihdr(shipped);
  assert.deepEqual([i.w, i.h, i.colour], [1536, 1024, 2]);
  const sha = f => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  assert.equal(sha(shipped), 'dcf028c3a7615d2511b419caa2e4e05844278e0a754b69190ef2f20473f635cd');
  const source = '/Users/williambrach/Developer/arbiter/assets/renaissance-background-v1/market-square.png';
  if (!fs.existsSync(source)) return t.skip('background pack not present');
  assert.equal(sha(shipped), sha(source));
});

test('apothecary vial frames: 8 registered 132x188 RGBA frames, clear edges (no neighbouring pose)', () => {
  for (let n = 0; n < 8; n++) {
    const file = path.join(assets, 'characters', `apothecary-vial-${n}.png`);
    const i = ihdr(file);
    assert.deepEqual([i.w, i.h, i.colour], [132, 188, 6]);
    const { data, width, height } = readPng(file);
    let bottom = -1, edge = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 8) bottom = y;
      if ((x === 0 || x === width - 1 || y === 0) && a > 8) edge++;
    }
    assert.ok(Math.abs(bottom - 184) <= 2, `vial-${n} feet at ${bottom}`);
    assert.equal(edge, 0, `vial-${n} touches its frame edge`);
  }
  assert.equal(fs.existsSync(path.join(assets, 'characters', 'apothecary-vial-8.png')), false);
});

test('apothecary source rectangles: integer edges in the gutters, every pose inside its own rectangle', (t) => {
  const src = fs.readFileSync(path.join(root, 'art/renaissance/cut.py'), 'utf8');
  const span = name => JSON.parse(src.match(new RegExp(`${name} = (\\[.*\\])`))[1].replace(/\(/g, '[').replace(/\)/g, ']'));
  const cols = span('APOTHECARY_COLS'), rows = span('APOTHECARY_ROWS');
  // Measured pose boxes (alpha > 8): columns and rows of the 4 x 4 sheet.
  const poseCols = [[63, 235], [384, 559], [706, 847], [1016, 1163]], poseRows = [[7, 306], [323, 615], [634, 933], [949, 1245]];
  for (let i = 0; i < 4; i++) {
    assert.ok(cols[i][0] <= poseCols[i][0] && poseCols[i][1] <= cols[i][1], `column ${i}`);
    assert.ok(rows[i][0] <= poseRows[i][0] && poseRows[i][1] <= rows[i][1], `row ${i}`);
    if (i) { assert.equal(cols[i][0], cols[i - 1][1]); assert.equal(rows[i][0], rows[i - 1][1]); }
  }
  assert.deepEqual([cols[0][0], cols[3][1], rows[0][0], rows[3][1]], [0, 1254, 0, 1254]);
  const sheet = '/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/apothecary.png';
  if (!fs.existsSync(sheet)) return t.skip('character pack not present');
  const { data, width } = readPng(sheet);
  // No opaque pixel on any rectangle edge inside the sheet: a cut never slices a pose.
  for (const [x0] of cols.slice(1)) for (let y = 0; y < 1254; y++) assert.ok(data[(y * width + x0) * 4 + 3] <= 8, `column edge ${x0}, y ${y}`);
  for (const [y0] of rows.slice(1)) for (let x = 0; x < 1254; x++) assert.ok(data[(y0 * width + x) * 4 + 3] <= 8, `row edge ${y0}, x ${x}`);
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

test('cut.py frame map never uses row 4 (the apothecary vial gesture is listed apart)', () => {
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
