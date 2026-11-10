import test from 'node:test';
import assert from 'node:assert/strict';
import { readPng } from './png.mjs';
import * as ff from '../client/factory-figures.ts';
import * as m from '../client/figure-motion.ts';
import { worldFor } from '../client/worlds.ts';

const art = worldFor('department').figures;
const sheet = art.walkSheet;
const png = readPng(new URL(`../public${sheet.url}`, import.meta.url).pathname);
const alphaAt = (x, y) => png.data[(y * png.width + x) * 4 + 3];

/** Opaque (alpha >= 128) bounds inside a rectangle of the sheet, local to it; null when empty. */
function opaque(r) {
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (alphaAt(x, y) < 128) continue;
    left = Math.min(left, x - r.x); right = Math.max(right, x - r.x); top = Math.min(top, y - r.y); bottom = Math.max(bottom, y - r.y);
  }
  return right < 0 ? null : { left, top, right, bottom };
}

test('walk sheet: 1536 x 1024, 4 x 2 cells of 384 x 512, eight frames', () => {
  assert.equal(png.width, sheet.columns * sheet.cell.w);
  assert.equal(png.height, Math.ceil(sheet.frames / sheet.columns) * sheet.cell.h);
  assert.deepEqual([png.width, png.height, sheet.frames], [1536, 1024, 8]);
});

test('walk sheet: cells read left to right, then the second row', () => {
  const cells = Array.from({ length: 8 }, (_, i) => ff.sheetCell(sheet, i));
  assert.deepEqual(cells.map(c => [c.x, c.y]), [[0, 0], [384, 0], [768, 0], [1152, 0], [0, 512], [384, 512], [768, 512], [1152, 512]]);
  assert.ok(cells.every(c => c.w === 384 && c.h === 512));
});

test('walk sheet: one window per cell, centred on the pivot, inside the cell, the same offset in every frame', () => {
  const half = Math.min(sheet.pivot.x, sheet.cell.w - sheet.pivot.x);
  for (let i = 0; i < 8; i++) {
    const cell = ff.sheetCell(sheet, i), r = ff.sheetRect(sheet, i);
    assert.equal(r.x - cell.x, sheet.pivot.x - half, `frame ${i + 1}`);
    assert.equal(r.w, 2 * half);
    assert.ok(r.x >= cell.x && r.x + r.w <= cell.x + cell.w && r.y === cell.y && r.h === cell.h);
  }
  assert.deepEqual(ff.sheetOrigin(sheet), { x: .5, y: sheet.pivot.y / sheet.cell.h });
});

test('walk sheet art: every frame has a figure and the window cuts no opaque pixel of it', () => {
  for (let i = 0; i < 8; i++) {
    const inCell = opaque(ff.sheetCell(sheet, i)), inWindow = opaque(ff.sheetRect(sheet, i));
    assert.ok(inCell && inWindow, `frame ${i + 1} empty`);
    assert.equal(inWindow.bottom - inWindow.top, inCell.bottom - inCell.top, `frame ${i + 1} height`);
    assert.equal(inWindow.right - inWindow.left, inCell.right - inCell.left, `frame ${i + 1} width`);
  }
});

test('walk sheet art: shoes end within 8 px of the pivot line in every frame', () => {
  for (let i = 0; i < 8; i++) {
    const b = opaque(ff.sheetCell(sheet, i));
    assert.ok(Math.abs(b.bottom - sheet.pivot.y) <= 8, `frame ${i + 1}: shoes at ${b.bottom}`);
  }
});

test('walk sheet art: walking and standing are the same size on screen (within 4%)', () => {
  const still = readPng(new URL(`../public${ff.poseUrl(art, art.detective, 'listening')}`, import.meta.url).pathname);
  let top = Infinity, bottom = -1;
  for (let y = 0; y < still.height; y++) for (let x = 0; x < still.width; x++) if (still.data[(y * still.width + x) * 4 + 3] >= 128) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  const standing = (bottom - top + 1) * art.scale;
  for (let i = 0; i < 8; i++) {
    const b = opaque(ff.sheetCell(sheet, i)), walking = (b.bottom - b.top + 1) * sheet.scale;
    assert.ok(Math.abs(walking / standing - 1) <= .04, `frame ${i + 1}: ${walking.toFixed(1)} vs ${standing.toFixed(1)} world units`);
  }
});

test('walk sheet: the detective alone walks with it, eight frames; workers keep none', () => {
  assert.equal(ff.drawnOf(art, art.detective).walk, 8);
  assert.equal(ff.drawnOf(art, 'phd-01').walk, 0);
  assert.equal(worldFor('factory').figures.walkSheet, undefined);
  assert.equal(worldFor('renaissance').figures.walkSheet, undefined);
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
