// Ottavio (sprite `wizard`) is cut from his own conversation sheet, art request R2: `art/renaissance/cut.py --wizard`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPng } from './png.mjs';

const dir = new URL('../public/assets/renaissance/characters/', import.meta.url);
const file = name => fileURLToPath(new URL(`wizard-${name}.png`, dir));
const cutter = fileURLToPath(new URL('../art/renaissance/cut.py', import.meta.url));
const css = readFileSync(new URL('../client/renaissance.css', import.meta.url), 'utf8');
const SHEET = '/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/wizard-conversation.png';
// The delivered R2 sheet's digest, pinned so a re-delivered sheet is noticed.
const SHEET_SHA = '22f65c9d3b5be04cadc6a18967b6af15069484a98c00ed245892d4fc6461e6f4';
// Sheet frames 1-8 in order: idle (neutral, breath, neutral, blink), talk, think.
const frames = ['idle-0', 'idle-1', 'idle-2', 'idle-3', 'talk-0', 'talk-1', 'think-0', 'think-1'];
const stills = { listening: 'idle-0', speaking: 'talk-0', thinking: 'think-0' };

const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];
/** Rows and columns holding a pixel over `min` alpha, inside an optional window. */
function extent(img, min = 8, win = { x0: 0, y0: 0, x1: img.width, y1: img.height }) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = win.y0; y < win.y1; y++) for (let x = win.x0; x < win.x1; x++) {
    if (alphaAt(img, x, y) > min) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { x0, y0, x1, y1 };
}

test('eight conversation frames and three still poses, all 132x188 RGBA', () => {
  for (const f of [...frames, ...Object.keys(stills)]) {
    const b = readFileSync(file(f));
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20), b[25]], [132, 188, 6], f);
  }
  for (const extra of ['idle-4', 'talk-2', 'think-2']) assert.equal(existsSync(file(extra)), false, extra);
});

test('the still poses are sheet frames 1, 5 and 7', () => {
  for (const [still, frame] of Object.entries(stills)) {
    assert.deepEqual(readPng(file(still)).data, readPng(file(frame)).data, `${still} = ${frame}`);
  }
});

test('one root position and one scale: feet, shoes, staff top and beret top match in every frame', () => {
  const look = f => {
    const img = readPng(file(f));
    const all = extent(img);
    const shoes = extent(img, 128, { x0: 0, y0: all.y1 - 5, x1: img.width, y1: all.y1 + 1 });
    const beret = extent(img, 128, { x0: 0, y0: 0, x1: 86, y1: 40 }); // left of the staff
    return { feet: all.y1, top: all.y0, shoes: [shoes.x0, shoes.x1], beret: beret.y0 };
  };
  const first = look(frames[0]);
  assert.equal(first.feet, 184, 'feet on the cast feet line (anchor y 185)');
  for (const f of frames.slice(1)) {
    const l = look(f);
    assert.equal(l.feet, first.feet, `${f} feet`);
    assert.ok(Math.abs(l.top - first.top) <= 1, `${f} staff top ${l.top} vs ${first.top}`);
    assert.ok(Math.abs(l.shoes[0] - first.shoes[0]) <= 1 && Math.abs(l.shoes[1] - first.shoes[1]) <= 1, `${f} shoes ${l.shoes} vs ${first.shoes}`);
    assert.ok(Math.abs(l.beret - first.beret) <= 1, `${f} beret top ${l.beret} vs ${first.beret}`);
  }
});

test('nothing clipped: staff, beret, robe and hands stay clear of the frame edges', () => {
  for (const f of frames) {
    const img = readPng(file(f));
    const e = extent(img);
    assert.ok(e.y0 >= 2 && e.x0 >= 2 && e.x1 <= img.width - 3, `${f} reaches ${JSON.stringify(e)}`);
  }
});

test('face crop: the CSS window holds the whole beret in every pose, at the same place', () => {
  const rule = css.split('\n').find(l => l.includes('.monkey-face.ottavio'));
  const m = rule.match(/background-position: calc\(var\(--fc\) \* -(\d+) \/ 45\) calc\(var\(--fc\) \* -(\d+) \/ 45\)/);
  assert.ok(m, 'Ottavio has his own crop window');
  const [x0, y0] = [Number(m[1]), Number(m[2])];
  assert.match(rule, /wizard-listening\.png/);
  const tops = frames.map(f => extent(readPng(file(f)), 128, { x0, y0, x1: x0 + 45, y1: y0 + 45 }).y0);
  for (const [i, top] of tops.entries()) {
    assert.ok(top >= y0 + 2, `${frames[i]}: the beret top (${top}) is inside the window, not cut`);
    assert.ok(Math.abs(top - tops[0]) <= 1, `${frames[i]}: framed like the listening pose`);
  }
});

test('differs from the inventor: Ottavio has his own art, not a recolour of Matteo', () => {
  for (const f of ['listening', 'speaking', 'thinking', 'idle-0', 'idle-1', 'idle-2', 'idle-3', 'talk-0']) {
    const w = readFileSync(file(f));
    const i = readFileSync(fileURLToPath(new URL(`inventor-${f}.png`, dir)));
    assert.ok(!w.equals(i), f);
  }
});

test('the shipped frames are a fresh cut of the delivered R2 sheet', (t) => {
  if (!existsSync(SHEET)) return t.skip('motion pack not present');
  assert.equal(createHash('sha256').update(readFileSync(SHEET)).digest('hex'), SHEET_SHA);
  const r = spawnSync('python3', ['-I', cutter, '--wizard', SHEET, '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
