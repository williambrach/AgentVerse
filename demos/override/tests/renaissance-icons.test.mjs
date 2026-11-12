import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const css = readFileSync(new URL('../client/renaissance.css', import.meta.url), 'utf8');
const local = new URL('../public/assets/renaissance/expansion/atlas.json', import.meta.url);
const atlasPath = existsSync(local) ? local : '/Users/williambrach/Developer/arbiter/assets/castelvento-expansion-v1/atlas.json';
const atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
const sheet = atlas.sheets.find((s) => s.file === 'inventory-objects.png');
const R = '#app[data-world="renaissance"]';
const targets = [
  ['#notebook-button::before', 'notebook'],
  ['.verdict-button::before', 'seal-stamp'],
  ['#coin-counter::before', 'coin-pouch'],
  ['.world-panel .world-swatch', 'town-map'],
];
const rule = (sel) => {
  const m = css.split('\n').find((l) => l.startsWith(`${R} ${sel} {`));
  assert.ok(m, `rule for ${sel}`);
  return m;
};

test('rects_match_atlas', () => {
  for (const [sel, id] of targets) {
    const [x, y, w, h] = sheet.items.find((i) => i.id === id).sourceRect;
    const line = rule(sel);
    const m = line.match(/inventory-objects\.png'\) (-?[\d.]+)px (-?[\d.]+)px \/ ([\d.]+)px ([\d.]+)px no-repeat/);
    assert.ok(m, `background shorthand for ${id}`);
    const s = 24 / Math.max(w, h);
    const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${id}: ${a} vs ${b}`);
    near(+m[3], sheet.width * s);
    near(+m[4], sheet.height * s);
    near(+m[1], -x * s + (24 - w * s) / 2);
    near(+m[2], -y * s + (24 - h * s) / 2);
    assert.match(line, /image-rendering: pixelated/);
  }
});

test('scoped_to_renaissance', () => {
  const block = css.slice(css.indexOf('Castelvento HUD icons'));
  const rules = block.split('\n').filter((l) => l.includes('{') && !l.startsWith('/*'));
  assert.ok(rules.length >= 5);
  for (const l of rules) {
    for (const sel of l.slice(0, l.indexOf('{')).split(',')) assert.ok(sel.trim().startsWith(R), sel);
  }
});

test('svg_hidden_only_where_replaced', () => {
  const l = css.split('\n').find((x) => x.includes('> svg'));
  assert.ok(l.includes('#notebook-button > svg') && l.includes('.verdict-button > svg'));
  assert.equal((css.match(/> svg/g) || []).length, 2);
  assert.ok(!/#coin-counter[^{]*svg/.test(css));
});
