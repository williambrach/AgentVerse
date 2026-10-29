import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hueShift, faceSheetPlan, faceSheetVar, SHEET_CAST } from '../client/recolor.ts';
import { worldFor } from '../client/worlds.ts';

const hueOf = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
};
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const gap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

test('hue_shift_moves_saturated', () => {
  const out = hueShift(new Uint8ClampedArray([203, 118, 86, 255]), '#cb7656', '#d9a62e');
  assert.ok(gap(hueOf(out[0], out[1], out[2]), hueOf(...hexRgb('#d9a62e'))) <= 4);
  assert.equal(out[3], 255);
  const faint = hueShift(new Uint8ClampedArray([203, 118, 86, 90]), '#cb7656', '#d9a62e');
  assert.equal(faint[3], 90);
});

test('hue_shift_moves_shaded_fur_and_does_not_mutate', () => {
  const input = new Uint8ClampedArray([140, 80, 55, 255]);
  const out = hueShift(input, '#cb7656', '#d9a62e');
  assert.deepEqual([...input], [140, 80, 55, 255]);
  assert.ok(hueOf(out[0], out[1], out[2]) > hueOf(140, 80, 55) + 15);
  assert.ok(out.every((v) => v >= 0 && v <= 255));
});

test('hue_shift_keeps_outline', () => {
  const out = hueShift(new Uint8ClampedArray([40, 40, 40, 255]), '#cb7656', '#d9a62e');
  assert.deepEqual([...out], [40, 40, 40, 255]);
  const brownish = hueShift(new Uint8ClampedArray([60, 52, 50, 255]), '#cb7656', '#d9a62e');
  assert.deepEqual([...brownish], [60, 52, 50, 255]);
});

test('hue_shift_ignores_transparent_and_bad_colours', () => {
  assert.deepEqual([...hueShift(new Uint8ClampedArray([203, 118, 86, 0]), '#cb7656', '#d9a62e')], [203, 118, 86, 0]);
  assert.deepEqual([...hueShift(new Uint8ClampedArray([203, 118, 86, 255]), 'nope', '#d9a62e')], [203, 118, 86, 255]);
});

test('slots_spread', () => {
  const fixed = [[116, 156], [364, 156], [364, 268]];
  const stops = [[132, 276], [244, 276]];
  for (const id of ['grove', 'tower']) {
    const { slots } = worldFor(id);
    assert.equal(slots.length, 5);
    fixed.forEach(([x, y], i) => assert.deepEqual([slots[i].x, slots[i].y], [x, y]));
    slots.forEach((p, i) => {
      assert.ok(p.x >= 48 && p.x <= 432 && p.y >= 110 && p.y <= 300, `${id} slot ${i} in bounds`);
      stops.forEach(([x, y]) => assert.ok(Math.hypot(p.x - x, p.y - y) >= 64, `${id} slot ${i} clear of stop`));
      slots.slice(i + 1).forEach((q, j) => assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= 64, `${id} slots ${i}/${i + j + 1}`));
    });
  }
});

test('hue_shift_scales_saturation_and_lightness_by_clamped_ratio', () => {
  // target far lighter and more saturated than source: ratios clamp at 2, never beyond
  const src = [100, 60, 40, 255];
  const out = hueShift(new Uint8ClampedArray(src), '#80402a', '#ffd966');
  const l = (r, g, b) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
  assert.ok(l(out[0], out[1], out[2]) <= l(...src) * 2 + 0.01);
  assert.ok(l(out[0], out[1], out[2]) > l(...src));
  // equal colours leave pixels where they were (ratio 1, turn 0)
  const same = hueShift(new Uint8ClampedArray(src), '#80402a', '#80402a');
  src.forEach((v, i) => assert.ok(Math.abs(same[i] - v) <= 1));
});

test('case_board_faces_per_world', () => {
  const cast = ['#cb7656', '#5a9482', '#d9a62e', '#4a90d9', '#7bc96f'].map((color) => ({ color }));
  const grove = faceSheetPlan('grove', cast, 5), tower = faceSheetPlan('tower', cast, 5);
  assert.deepEqual(grove.map((s) => s.index), [3, 4]);
  assert.equal(SHEET_CAST, 3);
  // same colours in two worlds: separate variables and separate keys
  grove.forEach((g, i) => {
    assert.equal(g.name, faceSheetVar('grove', g.index));
    assert.notEqual(g.name, tower[i].name);
    assert.notEqual(g.key, tower[i].key);
  });
  assert.deepEqual([grove[0].from, grove[0].to, grove[1].from, grove[1].to], ['#cb7656', '#4a90d9', '#5a9482', '#7bc96f']);
  // a three-agent cast has nothing to recolour
  assert.deepEqual(faceSheetPlan('tower', cast.slice(0, 3), 5).map((s) => s.key), [null, null]);
  // the stylesheet reads each world's own variable for its preview line
  const css = readFileSync(new URL('../client/banana.css', import.meta.url), 'utf8');
  for (const world of ['grove', 'tower']) for (const i of [3, 4]) {
    assert.ok(css.includes(`.monkey-line[data-world="${world}"] .slot-${i}.monkey-face { background-image: var(${faceSheetVar(world, i)}`), `${world} ${i}`);
  }
  assert.ok(!/--face-sheet-\d/.test(css), 'no world-less variable');
});

test('no pad stub in the scene', () => {
  const src = readFileSync(new URL('../client/station.ts', import.meta.url), 'utf8');
  assert.ok(!/[?&]pad|get\('pad'\)/.test(src));
  assert.ok(src.includes("title: 'Pick the roles'"));
});
