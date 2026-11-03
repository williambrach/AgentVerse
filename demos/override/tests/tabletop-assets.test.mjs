import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const TABLETOP = fileURLToPath(new URL('../public/assets/tabletop/', import.meta.url));
const PACK = '/Users/williambrach/Developer/arbiter/assets/tabletop-v2';
const SOURCE = readFileSync(new URL('../client/roundtable.ts', import.meta.url), 'utf8');
const PROP = /'(card_[A-Za-z0-9_]+|dice_\d+|tea_\d+|cup|cookie)'/g;
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
/** SHA-256 of the shipped files as downloaded (SOURCES.md: copied without redrawing or re-encoding). */
const SHIPPED = {
  'card_back.png': 'a2ab56d55cd08b99933f8997d46b6907ea0b62082931e7adb8b31b9e000ae3c8',
  'card_clubs_A.png': '3e395c988bd0875944a21e1e13ef3ca739a61b5256a773bd2001c04e7afc60e0',
  'card_diamonds_07.png': 'd48f046758a6467165a1626726bd0188e74b8e8db39e31252fe9b5430b7af283',
  'card_hearts_A.png': '5e3bdbae26950633ebfced363f810fea91a6fe79c439b3d6e5b717871d65f4a7',
  'card_spades_K.png': '39d5f82fa15389774273a06c4f3267f88a5803ec0d94f69dc079e39ab1553c02',
  'cookie.png': '4fa3f5d9775e7aa2dd4294aa9f243be21b2abe3acef4fba6526c18c663664861',
  'cup.png': '77359944c22769b90198d95230f1fe020d0c2b3bfe3645ff7ec42e1939fc6d98',
  'dice_3.png': 'a1908f14b1113860901bd9be4f8a5a70448fc1699dae1eea31b5dbf8eae718a4',
  'dice_5.png': '950f0073dc0f8398523cf92f42e1f5f79e369098bf15f7b31591dbb15b3a6a38',
  'tea_01.png': '72aa471ad2e1d5c3ca07d1ce5ceff3430d15ff177cc2516043473b2418d0a445',
  'tea_03.png': '8655011be582983517ae7ae1dcc8fa82449f9d74863f387ff9c9de72cf9b013d',
  'tea_08.png': 'f1d056c45d7d6878a8069d314979328579f79ee40d6471b1e714934e3c9a96c2',
  'SOURCES.md': '259453c7a33d7bdcf48a02687958c2696d88c2d59196bf18cd36f2d4715b18c7',
  'KENNEY-LICENSE.txt': '008f732afaa1ebc0fc8227541899fec1f50011798431a48c2eb7afd5342521ef',
  'FLEURMAN-LICENSE.txt': '985cb244339a623c0ca7685700971a6430afd1ba54e4d45ddbd3f47da7d23c75',
};

const preloaded = () => {
  const m = /const TABLE_PROPS = \[([^\]]*)\]/.exec(SOURCE);
  assert.ok(m, 'TABLE_PROPS list');
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
};

test('every table prop the scene draws is preloaded and shipped', () => {
  const loaded = preloaded();
  const used = new Set([...SOURCE.matchAll(PROP)].map(x => x[1]));
  assert.ok(used.size >= 10, `found ${used.size} prop names`);
  for (const name of used) {
    assert.ok(loaded.has(name), `${name} is drawn but never preloaded`);
    assert.ok(existsSync(join(TABLETOP, `${name}.png`)), `${name}.png missing`);
  }
});

test('the CC0 sources and licence files ship beside the props', () => {
  for (const name of ['SOURCES.md', 'KENNEY-LICENSE.txt', 'FLEURMAN-LICENSE.txt']) assert.ok(existsSync(join(TABLETOP, name)), name);
  const sources = readFileSync(join(TABLETOP, 'SOURCES.md'), 'utf8');
  for (const word of ['Kenney', 'Fleurman', 'CC0']) assert.match(sources, new RegExp(word));
});

test('props and licences are unchanged bytes (pinned hashes, no pack needed)', () => {
  for (const name of [...preloaded()].map(n => `${n}.png`)) assert.ok(SHIPPED[name], `${name} has a pinned hash`);
  for (const [name, hash] of Object.entries(SHIPPED)) assert.equal(sha(join(TABLETOP, name)), hash, `${name} was changed`);
});

test('props and licences are byte copies of the pack', (t) => {
  if (!existsSync(PACK)) { t.skip(`pack not present at ${PACK}`); return; }
  for (const name of [...preloaded()].map(n => `${n}.png`).concat(['SOURCES.md', 'KENNEY-LICENSE.txt', 'FLEURMAN-LICENSE.txt'])) {
    assert.equal(sha(join(TABLETOP, name)), sha(join(PACK, name)), `${name} differs from the pack`);
  }
});
