import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './png.mjs';
import * as ff from '../client/factory-figures.ts';
import * as m from '../client/figure-motion.ts';
import { worldFor } from '../client/worlds.ts';

// Every level whose player walks a supplied sheet: department D1, factory F1, Castelvento R1.
const SHEETS = ['department', 'factory', 'renaissance'];

for (const id of SHEETS) {
const art = worldFor(id).figures;
const sheet = art.walkSheet;
const png = readPng(new URL(`../public${sheet.url}`, import.meta.url).pathname);
const alphaAt = (x, y) => png.data[(y * png.width + x) * 4 + 3];
const offset = i => sheet.offsets?.[i] ?? 0;

/** Opaque (alpha >= 128) bounds inside a rectangle of the sheet, local to it; null when empty. */
function opaque(r) {
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (alphaAt(x, y) < 128) continue;
    left = Math.min(left, x - r.x); right = Math.max(right, x - r.x); top = Math.min(top, y - r.y); bottom = Math.max(bottom, y - r.y);
  }
  return right < 0 ? null : { left, top, right, bottom };
}

/** The head column of cell i: the middle of the opaque span in the figure's top 60 rows. */
function headColumn(i) {
  const cell = ff.sheetCell(sheet, i), b = opaque(cell);
  let left = Infinity, right = -1;
  for (let y = b.top; y < b.top + 60; y++) for (let x = 0; x < cell.w; x++) if (alphaAt(cell.x + x, cell.y + y) >= 128) { left = Math.min(left, x); right = Math.max(right, x); }
  return (left + right) / 2;
}

test(`${id} walk sheet: 1536 x 1024, 4 x 2 cells of 384 x 512, eight frames, one offset per frame`, () => {
  assert.equal(png.width, sheet.columns * sheet.cell.w);
  assert.equal(png.height, Math.ceil(sheet.frames / sheet.columns) * sheet.cell.h);
  assert.deepEqual([png.width, png.height, sheet.frames], [1536, 1024, 8]);
  if (sheet.offsets) assert.equal(sheet.offsets.length, sheet.frames);
});

test(`${id} walk sheet: cells read left to right, then the second row`, () => {
  const cells = Array.from({ length: 8 }, (_, i) => ff.sheetCell(sheet, i));
  assert.deepEqual(cells.map(c => [c.x, c.y]), [[0, 0], [384, 0], [768, 0], [1152, 0], [0, 512], [384, 512], [768, 512], [1152, 512]]);
  assert.ok(cells.every(c => c.w === 384 && c.h === 512));
});

test(`${id} walk sheet: one window per cell, centred on the pivot, inside the cell, the same offset in every frame`, () => {
  const half = Math.min(sheet.pivot.x, sheet.cell.w - sheet.pivot.x);
  for (let i = 0; i < 8; i++) {
    const cell = ff.sheetCell(sheet, i), r = ff.sheetRect(sheet, i);
    assert.equal(r.x - cell.x, sheet.pivot.x - half, `frame ${i + 1}`);
    assert.equal(r.w, 2 * half);
    assert.ok(r.x >= cell.x && r.x + r.w <= cell.x + cell.w && r.y === cell.y && r.h === cell.h);
    assert.deepEqual(ff.sheetOrigin(sheet, i), { x: .5, y: (sheet.pivot.y - offset(i)) / sheet.cell.h });
  }
});

test(`${id} walk sheet art: every frame has a figure and the window cuts no opaque pixel of it`, () => {
  for (let i = 0; i < 8; i++) {
    const inCell = opaque(ff.sheetCell(sheet, i)), inWindow = opaque(ff.sheetRect(sheet, i));
    assert.ok(inCell && inWindow, `frame ${i + 1} empty`);
    assert.equal(inWindow.bottom - inWindow.top, inCell.bottom - inCell.top, `frame ${i + 1} height`);
    assert.equal(inWindow.right - inWindow.left, inCell.right - inCell.left, `frame ${i + 1} width`);
  }
});

test(`${id} walk sheet art: drawn with its offset, the shoes end within 1.5 world units of the foot point`, () => {
  for (let i = 0; i < 8; i++) {
    const b = opaque(ff.sheetCell(sheet, i)), off = (b.bottom + offset(i) - sheet.pivot.y) * sheet.scale;
    assert.ok(Math.abs(off) <= 1.5, `frame ${i + 1}: shoes ${off.toFixed(2)} world units off`);
  }
});

// D1's head drifts 6.5 px as drawn (art/requests/department.md); F1 and R1 hold within 4.
const headDrift = id === 'department' ? 7 : 4;
test(`${id} walk sheet art: the head column holds within ${headDrift} px across the cycle (no sideways jitter)`, () => {
  const cols = Array.from({ length: 8 }, (_, i) => headColumn(i));
  assert.ok(Math.max(...cols) - Math.min(...cols) <= headDrift, cols.join(' '));
});

test(`${id} walk sheet art: walking and standing are the same size on screen (within 4%)`, () => {
  const still = readPng(new URL(`../public${ff.poseUrl(art, art.detective, 'listening')}`, import.meta.url).pathname);
  let top = Infinity, bottom = -1;
  for (let y = 0; y < still.height; y++) for (let x = 0; x < still.width; x++) if (still.data[(y * still.width + x) * 4 + 3] >= 128) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  const standing = (bottom - top + 1) * art.scale;
  for (let i = 0; i < 8; i++) {
    const b = opaque(ff.sheetCell(sheet, i)), walking = (b.bottom - b.top + 1) * sheet.scale;
    assert.ok(Math.abs(walking / standing - 1) <= .04, `frame ${i + 1}: ${walking.toFixed(1)} vs ${standing.toFixed(1)} world units`);
  }
});

// Placed the way the game places it (origin from sheetOrigin), relative to the foot point in cell px:
// a frame's top sits at -originY * cell.h, so its head top is that plus the opaque top, and its shoes that plus the bottom.
const placed = i => {
  const b = opaque(ff.sheetCell(sheet, i)), top = -ff.sheetOrigin(sheet, i).y * sheet.cell.h;
  return { head: top + b.top, shoes: top + b.bottom };
};

test(`${id} walk sheet: placed through sheetOrigin, the shoes sit within 1.5 world units of the foot point`, () => {
  for (let i = 0; i < 8; i++) assert.ok(Math.abs(placed(i).shoes * sheet.scale) <= 1.5, `frame ${i + 1}: ${(placed(i).shoes * sheet.scale).toFixed(2)}`);
});

if (id === 'renaissance') test('renaissance walk sheet: placed through sheetOrigin, the head bob spans at most 8 px', () => {
  const heads = Array.from({ length: 8 }, (_, i) => placed(i).head);
  assert.ok(Math.max(...heads) - Math.min(...heads) <= 8, heads.join(' '));
});

if (id === 'renaissance') test('renaissance walk sheet art: offsets hold the head bob to +-4 px of a common line', () => {
  const tops = Array.from({ length: 8 }, (_, i) => opaque(ff.sheetCell(sheet, i)).top + offset(i));
  const raw = Array.from({ length: 8 }, (_, i) => opaque(ff.sheetCell(sheet, i)).top);
  assert.ok(Math.max(...raw) - Math.min(...raw) >= 20, 'the art itself bobs about 24 px');
  assert.ok(Math.max(...tops) - Math.min(...tops) <= 8, tops.join(' '));
});
}

const art = worldFor('department').figures;
const sheet = art.walkSheet;

test('walk sheet: the detective alone walks with it, eight frames; workers keep none', () => {
  assert.equal(ff.drawnOf(art, art.detective).walk, 8);
  assert.equal(ff.drawnOf(art, 'phd-01').walk, 0);
  for (const id of ['factory', 'renaissance']) {
    const other = worldFor(id).figures;
    assert.equal(ff.drawnOf(other, other.detective).walk, 8, id);
    for (const sprite of Object.values(other.sprites)) assert.equal(ff.drawnOf(other, sprite).walk, 0, `${id} ${sprite}`);
  }
  for (const id of ['grove', 'tower', 'friends']) assert.equal(worldFor(id).figures?.walkSheet, undefined, id);
});

test('walk clock: 100 ms a frame by walking time, 1..8 then back to 1', () => {
  const drawn = ff.drawnOf(art, art.detective);
  const frameAt = ms => m.walkLook(0, 'listening', drawn, { ms, frameMs: sheet.frameMs }).texture.frame;
  assert.equal(sheet.frameMs, 100);
  assert.deepEqual([0, 99, 100, 250, 799, 800, 899, 1600].map(frameAt), [0, 0, 1, 2, 7, 0, 0, 0]);
  // Distance plays no part when the clock is given.
  assert.equal(m.walkLook(1000, 'listening', drawn, { ms: 0, frameMs: 100 }).texture.frame, 0);
});

test('walk clock: independent of the render rate', () => {
  const run = (step, total) => { let s = m.STANDING; for (let t = 0; t < total; t += step) s = m.strideNext(s, 2, true, step); return s.ms; };
  // 60 Hz and 120 Hz over the same second land on the same frame.
  assert.equal(Math.floor(run(1000 / 60, 1000) / 100), Math.floor(run(1000 / 120, 1000) / 100));
  // A 120 Hz screen over 60 Hz physics: the frames without travel still count time.
  let s = m.STANDING;
  for (let i = 0; i < 25; i++) s = m.strideNext(s, i % 2 ? 0 : 2, true, 8);
  assert.equal(s.ms, 24 * 8);
});

test('walk clock: a new walk starts at frame 1; release and walls stop it', () => {
  let s = m.strideNext(m.STANDING, 2, true, 16);
  assert.equal(s.ms, 0, 'first walking frame is frame 1');
  for (let i = 0; i < 10; i++) s = m.strideNext(s, 2, true, 16);
  assert.equal(s.ms, 160);
  assert.deepEqual(m.strideNext(s, 0, false, 16), m.STANDING, 'release');
  let blocked = s;
  for (let i = 0; i < 5; i++) blocked = m.strideNext(blocked, 0, true, 16);
  assert.equal(blocked.walking, false, 'a wall for 80 ms stands her');
  assert.equal(blocked.ms, 0);
  assert.equal(m.strideNext(blocked, 2, true, 16).ms, 0, 'walking again restarts at frame 1');
});
