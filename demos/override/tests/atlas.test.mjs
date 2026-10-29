import test from 'node:test';
import assert from 'node:assert/strict';
import { sliceAtlas } from '../client/atlas.ts';
const blank = (w, h) => ({ w, h, a: new Uint8Array(w * h) });
const rect = (img, x, y, rw, rh, v = 255) => { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) img.a[j * img.w + i] = v; return img; };
const slice = (img, cols, rows) => sliceAtlas(img.a, img.w, img.h, cols, rows);
test('trims each cell to its sprite', () => {
  assert.deepEqual(slice(rect(rect(blank(20, 10), 2, 2, 4, 6), 12, 1, 6, 8), 2, 1), [{ x: 2, y: 2, w: 4, h: 6, anchorX: 2, anchorY: 6 }, { x: 12, y: 1, w: 6, h: 8, anchorX: 3, anchorY: 8 }]);
});
test('cuts in the real gutter, not the even split', () => {
  const [a, b] = slice(rect(rect(blank(20, 10), 3, 0, 9, 10), 14, 0, 4, 10), 2, 1);
  assert.deepEqual([a.x, a.w, b.x, b.w], [3, 9, 14, 4]);
});
test('anchors on the head, not the body', () => {
  assert.deepEqual(slice(rect(rect(blank(10, 10), 5, 0, 2, 4), 2, 4, 8, 6), 1, 1)[0], { x: 2, y: 0, w: 8, h: 10, anchorX: 4, anchorY: 10 });
});
test('an empty cell is the whole cell', () => {
  assert.deepEqual(slice(rect(blank(20, 10), 2, 2, 4, 6), 2, 1)[1], { x: 10, y: 0, w: 10, h: 10, anchorX: 5, anchorY: 10 });
});
test('rows split and come out row-major', () => {
  const f = slice(rect(rect(rect(blank(20, 20), 1, 1, 5, 7), 11, 2, 5, 6), 2, 12, 5, 7), 2, 2);
  assert.deepEqual(f.map(g => [g.x, g.y]), [[1, 1], [11, 2], [2, 12], [9, 10]]);
});
test('faint pixels are not sprite', () => {
  assert.deepEqual(slice(rect(rect(blank(10, 10), 0, 0, 10, 10, 10), 3, 3, 2, 2), 1, 1)[0], { x: 3, y: 3, w: 2, h: 2, anchorX: 1, anchorY: 2 });
});
test('threshold boundary: 16 is faint, 17 is sprite', () => {
  assert.equal(slice(rect(blank(10, 10), 3, 3, 2, 2, 16), 1, 1)[0].w, 10);
  assert.equal(slice(rect(blank(10, 10), 3, 3, 2, 2, 17), 1, 1)[0].w, 2);
});
test('a sprite touching the image edges is kept whole', () => {
  const f = slice(rect(rect(blank(20, 10), 0, 0, 4, 10), 16, 0, 4, 10), 2, 1);
  assert.deepEqual([f[0].x, f[0].w, f[1].x, f[1].w, f[1].y, f[1].h], [0, 4, 16, 4, 0, 10]);
});
test('a 2000x2000 atlas slices in under 100 ms', () => {
  const img = blank(2000, 2000);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) rect(img, c * 500 + 100, r * 500 + 50, 300, 400);
  sliceAtlas(img.a, 2000, 2000, 4, 4);
  const t = performance.now();
  const f = sliceAtlas(img.a, 2000, 2000, 4, 4);
  assert.ok(performance.now() - t < 100);
  assert.deepEqual([f[5].x, f[5].y, f[5].w, f[5].h], [600, 550, 300, 400]);
});
const two = () => rect(rect(blank(20, 10), 3, 0, 7, 10), 14, 0, 4, 10);
const AB = [[3, 0, 7, 10], [14, 0, 4, 10]];
const box = f => f.map(g => [g.x, g.y, g.w, g.h]);
test('ignores a stray pixel near the gutter', () => {
  const img = two(); img.a[5 * 20 + 11] = 255;
  assert.deepEqual(box(slice(img, 2, 1)), AB);
});
test('ignores a thin shadow across the gutter', () => {
  const img = two(); for (let x = 3; x < 18; x++) if (img.a[9 * 20 + x] === 0) img.a[9 * 20 + x] = 100;
  assert.deepEqual(box(slice(img, 2, 1)), AB);
});
test('ignores a one-pixel bridge', () => {
  const img = two(); for (let x = 10; x < 14; x++) img.a[5 * 20 + x] = 255;
  assert.deepEqual(box(slice(img, 2, 1)), AB);
});
