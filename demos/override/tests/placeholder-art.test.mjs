import test from 'node:test';
import assert from 'node:assert/strict';
import { placeholderAtlas } from '../client/placeholder-art.ts';

const colors = ['#cf7a4a', '#6e9a5c', '#9a85c2'];
const px = (a, x, y) => { const i = (y * a.width + x) * 4; return [a.data[i], a.data[i + 1], a.data[i + 2], a.data[i + 3]]; };
const cells = a => { const out = []; for (let r = 0; r < a.rows; r++) for (let c = 0; c < a.cols; c++) out.push([c, r]); return out; };

test('sizes per kind', () => {
  const want = { cast: [256, 256, 4, 4], idle: [256, 192, 4, 3], walk: [256, 256, 4, 4], props: [128, 128, 2, 2] };
  for (const [kind, [width, height, cols, rows]] of Object.entries(want)) {
    const a = placeholderAtlas(kind, colors);
    assert.deepEqual([a.width, a.height, a.cols, a.rows], [width, height, cols, rows], kind);
    assert.equal(a.data.length, width * height * 4);
    assert.ok(a.data instanceof Uint8ClampedArray);
  }
});

test('every cell has a sprite with a clear margin', () => {
  for (const kind of ['cast', 'idle', 'walk', 'props']) {
    const a = placeholderAtlas(kind, colors);
    for (const [c, r] of cells(a)) {
      let n = 0;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        if (px(a, c * 64 + x, r * 64 + y)[3] === 0) continue;
        n++;
        assert.ok(x >= 4 && x < 60 && y >= 4 && y < 60, `${kind} ${c},${r} pixel ${x},${y}`);
      }
      assert.ok(n > 50, `${kind} ${c},${r} empty`);
    }
  }
});

test('feet share a baseline', () => {
  for (const kind of ['cast', 'idle', 'walk']) {
    const a = placeholderAtlas(kind, colors);
    for (const [c, r] of cells(a)) {
      let low = -1;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (px(a, c * 64 + x, r * 64 + y)[3] > 0) low = y;
      assert.equal(low, 59, `${kind} ${c},${r}`);
    }
  }
});

test('idle rows carry the cast colours', () => {
  const a = placeholderAtlas('idle', colors);
  let found = false;
  for (let y = 64; y < 128 && !found; y++) for (let x = 0; x < 64; x++) {
    const p = px(a, x, y);
    if (p[3] === 255 && p[0] === 0x6e && p[1] === 0x9a && p[2] === 0x5c) { found = true; break; }
  }
  assert.ok(found);
});

test('blink closes the eyes', () => {
  const a = placeholderAtlas('idle', colors);
  let diff = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const p = px(a, x, y), q = px(a, 64 + x, y);
    if (p.some((v, i) => v !== q[i])) { diff++; assert.ok(y < 30, `diff at y ${y}`); }
  }
  assert.ok(diff > 0);
});

test('deterministic', () => {
  for (const kind of ['cast', 'idle', 'walk', 'props']) {
    assert.deepEqual(placeholderAtlas(kind, colors).data, placeholderAtlas(kind, colors).data);
  }
});
