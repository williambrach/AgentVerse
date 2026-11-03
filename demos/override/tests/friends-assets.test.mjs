import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRIENDS = fileURLToPath(new URL('../public/assets/friends/', import.meta.url));
const PACK = '/Users/williambrach/Developer/arbiter/assets/animated-sprites-v1';
const PACK_EXPORTS = join(PACK, 'exports');

const CHARACTER_STRIPS = [
  'player-seated-idle.png', 'player-seated-talk.png', 'player-seated-think.png',
  'maya-seated-idle.png', 'maya-seated-talk.png', 'maya-seated-think.png',
  'ken-seated-idle.png', 'ken-seated-talk.png', 'ken-seated-think.png',
  'alex-idle.png', 'alex-talk.png', 'alex-think.png',
  'nora-idle.png', 'nora-talk.png', 'nora-think.png',
  'sam-idle.png', 'sam-talk.png', 'sam-think.png',
];

const ROOM_FILES = [
  'roundtable-fullscreen.png', 'fireplace-loop.png', 'sconce-loop.png',
  'wall-panel.png', 'floor-panel.png', 'bookcase.png', 'window.png',
  'plant.png', 'sideboard.png', 'rug.png', 'chair-front.png',
  'chair-left.png', 'chair-right.png',
];

// Relative paths under the friends folder, with the pack source for each.
const LISTED = [
  'animations.json',
  ...CHARACTER_STRIPS,
  'room/animations.json',
  ...ROOM_FILES.map((name) => `room/${name}`),
];

function packSourceFor(rel) {
  return join(PACK_EXPORTS, ...rel.split('/'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function walkPngs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkPngs(full));
    } else if (entry.endsWith('.png')) {
      out.push(full);
    }
  }
  return out;
}

function pngSize(path) {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('assets_listed_files_exist', () => {
  for (const rel of LISTED) {
    const full = join(FRIENDS, ...rel.split('/'));
    assert.ok(existsSync(full), `missing ${rel}`);
    assert.ok(statSync(full).isFile(), `not a file ${rel}`);
  }
});

test('assets_match_pack_sha256', (t) => {
  if (!existsSync(PACK)) {
    t.skip(`pack not present at ${PACK}`);
    return;
  }
  for (const rel of LISTED) {
    const copied = join(FRIENDS, ...rel.split('/'));
    const source = packSourceFor(rel);
    assert.equal(sha256(copied), sha256(source), `sha256 differs for ${rel}`);
  }
});

test('assets_png_rgba', () => {
  const pngs = walkPngs(FRIENDS);
  assert.ok(pngs.length > 0, 'no png files found');
  for (const path of pngs) {
    const buf = readFileSync(path);
    const name = relative(FRIENDS, path).split(sep).join('/');
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `not a PNG: ${name}`);
    assert.equal(buf[25], 6, `colour type is not RGBA (6): ${name}`);
  }
});

test('assets_strip_sizes', () => {
  for (const name of CHARACTER_STRIPS) {
    assert.deepEqual(
      pngSize(join(FRIENDS, name)),
      { width: 1152, height: 288 },
      `strip size for ${name}`,
    );
  }
  for (const name of ['room/fireplace-loop.png', 'room/sconce-loop.png']) {
    assert.deepEqual(
      pngSize(join(FRIENDS, ...name.split('/'))),
      { width: 1536, height: 256 },
      `loop size for ${name}`,
    );
  }
  assert.deepEqual(
    pngSize(join(FRIENDS, 'room', 'roundtable-fullscreen.png')),
    { width: 1672, height: 941 },
    'roundtable-fullscreen size',
  );
});
