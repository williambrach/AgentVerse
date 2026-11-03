import test from 'node:test';
import assert from 'node:assert/strict';
import { paintBlink, paintClosedMouth, applyOverlay, opaqueBounds, skinIn } from '../client/face-paint.ts';
import { RIG } from '../client/roundtable-rig.ts';
import { composeSeatedSam, SAM_RIG } from '../client/sam-rig.ts';
import { friendsFrame } from './png.mjs';

const SKIN = [240, 180, 140], WHITE = [250, 250, 250], BLACK = [10, 8, 8], RED = [150, 40, 40], GREY = [90, 88, 92];
function canvas(w, h, rgb = SKIN) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { data, width: w, height: h };
}
const set = (p, x, y, rgb) => p.data.set([...rgb, 255], (y * p.width + x) * 4);
const get = (p, x, y) => [...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)];
const painted = p => { let n = 0; for (let i = 3; i < p.data.length; i += 4) if (p.data[i]) n++; return n; };

test('blink paints the eye with the skin around it and draws a lid line, nothing outside the window', () => {
  const p = canvas(40, 30);
  for (let y = 10; y < 16; y++) for (let x = 12; x < 20; x++) set(p, x, y, x < 15 ? WHITE : BLACK);
  set(p, 2, 2, BLACK); // a dark pixel outside the window stays
  const lash = [24, 14, 12];
  const out = paintBlink(p, [[10, 8, 22, 18]], lash);
  for (let i = 3; i < out.data.length; i += 4) {
    const x = ((i - 3) / 4) % 40, y = Math.floor((i - 3) / 4 / 40);
    if (out.data[i]) assert.ok(x >= 10 && x < 22 && y >= 8 && y < 18, `painted outside the window at ${x},${y}`);
  }
  const closed = applyOverlay(p, out);
  let eyeLeft = 0, lid = 0;
  for (let y = 10; y < 16; y++) for (let x = 12; x < 20; x++) {
    const c = get(closed, x, y).slice(0, 3).join();
    if (c === WHITE.join() || c === BLACK.join()) eyeLeft++;
    if (c === lash.join()) lid++;
  }
  assert.equal(eyeLeft, 0, 'no eye white or pupil left');
  assert.ok(lid >= 8, 'a lid line crosses the eye');
  assert.deepEqual(get(closed, 2, 2), [...BLACK, 255]);
});

test('a blink window inside a lens keeps the rim', () => {
  const p = canvas(40, 30);
  for (let x = 8; x < 26; x++) { set(p, x, 6, BLACK); set(p, x, 20, BLACK); }
  for (let y = 6; y <= 20; y++) { set(p, 8, y, BLACK); set(p, 25, y, BLACK); }
  for (let y = 10; y < 16; y++) for (let x = 14; x < 19; x++) set(p, x, y, BLACK);
  const closed = applyOverlay(p, paintBlink(p, [[10, 8, 24, 19]], [24, 14, 12]));
  for (let x = 8; x < 26; x++) { assert.deepEqual(get(closed, x, 6), [...BLACK, 255]); assert.deepEqual(get(closed, x, 20), [...BLACK, 255]); }
  for (let y = 6; y <= 20; y++) { assert.deepEqual(get(closed, 8, y), [...BLACK, 255]); assert.deepEqual(get(closed, 25, y), [...BLACK, 255]); }
});

test('closed mouth fills from the face around it and draws one lip line; in a beard it fills with beard', () => {
  for (const around of [SKIN, GREY]) {
    const p = canvas(40, 30, around);
    for (let y = 12; y < 17; y++) for (let x = 14; x < 24; x++) set(p, x, y, y === 12 ? BLACK : RED);
    const lip = [120, 66, 40];
    const closed = applyOverlay(p, paintClosedMouth(p, [13, 11, 25, 18], lip));
    let red = 0, lipPx = 0, rows = new Set();
    for (let y = 11; y < 18; y++) for (let x = 13; x < 25; x++) {
      const c = get(closed, x, y).slice(0, 3);
      if (c.join() === RED.join() || c.join() === BLACK.join()) red++;
      if (c.join() === lip.join()) { lipPx++; rows.add(y); }
      else assert.ok(c.every((v, i) => Math.abs(v - around[i]) <= 2), `${around} fill at ${x},${y}: ${c}`);
    }
    assert.equal(red, 0);
    assert.ok(lipPx >= 6);
    assert.equal(rows.size, 1, 'one lip row');
  }
});

test('opaque bounds within rows', () => {
  const p = { data: new Uint8ClampedArray(10 * 10 * 4), width: 10, height: 10 };
  set(p, 2, 3, BLACK); set(p, 7, 8, BLACK);
  assert.deepEqual(opaqueBounds(p), [2, 3, 8, 9]);
  assert.deepEqual(opaqueBounds(p, 0, 5), [2, 3, 3, 4]);
  assert.equal(opaqueBounds(p, 4, 7), null);
});

// ---- on the real art ----

const isWhite = (p, x, y) => { const [r, g, b, a] = get(p, x, y); return a > 200 && r > 195 && g > 195 && b > 190 && Math.max(r, g, b) - Math.min(r, g, b) < 45; };
const body = (actor, state) => {
  const src = RIG[actor].states[state].source;
  if ('sam' in src) return composeSeatedSam(friendsFrame(`sam-${src.sam}.png`), friendsFrame('player-seated-idle.png'), SAM_RIG.parts[src.sam]);
  return friendsFrame(src.image, src.frame);
};

test('every painted blink closes the eyes of its own drawing and stays inside the face', () => {
  for (const [actor, rig] of Object.entries(RIG)) for (const [state, st] of Object.entries(rig.states)) {
    const b = body(actor, state);
    const overlay = paintBlink(b, st.eyes, rig.lash, st.skin);
    const closed = applyOverlay(b, overlay);
    let whites = 0, left = 0;
    for (const [x0, y0, x1, y1] of st.eyes) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (isWhite(b, x, y)) whites++; if (isWhite(closed, x, y)) left++; }
    if (actor !== 'ken') assert.ok(whites >= 15, `${actor} ${state}: the eye windows hold the eyes (${whites} white px)`);
    assert.equal(left, 0, `${actor} ${state}: an eye white is left after the blink`);
    // A small patch: two eyes, never a face-sized box.
    const n = painted(overlay);
    assert.ok(n > 40 && n < 700, `${actor} ${state}: ${n} px painted`);
  }
});

test("Ken's blinks keep the glasses: no pixel of the frame (lenses, bridge) changes", () => {
  const luma = p => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  for (const state of ['idle', 'talk']) {
    const st = RIG.ken.states[state];
    const b = body('ken', state);
    const closed = applyOverlay(b, paintBlink(b, st.eyes, RIG.ken.lash, st.skin));
    // The frame, found without the eye windows: dark pixels connected to the bridge between the two lenses.
    const [left, right] = [...st.eyes].sort((p, q) => p[0] - q[0]);
    const X0 = left[0] - 10, X1 = right[2] + 10, Y0 = Math.min(left[1], right[1]) - 8, Y1 = Math.max(left[3], right[3]) + 8;
    // Rim cores are under luma 60; the eye's lash touches the rim only through lighter anti-aliased pixels.
    const dark = (x, y) => { const p = get(b, x, y); return x >= X0 && x < X1 && y >= Y0 && y < Y1 && p[3] > 128 && luma(p) < 60; };
    const frame = new Set(), queue = [];
    for (let y = Y0; y < Y1; y++) for (let x = left[2] + 2; x < right[0] - 2; x++) if (dark(x, y)) { frame.add(`${x},${y}`); queue.push([x, y]); }
    while (queue.length) {
      const [x, y] = queue.pop();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (!frame.has(k) && dark(nx, ny)) { frame.add(k); queue.push([nx, ny]); }
      }
    }
    assert.ok(frame.size > 80, `ken ${state}: found the frame (${frame.size} px)`);
    // Plus the frame's anti-aliased edge (luma < 120 next to the core), except pixels that also touch the eye's own dark core.
    const core = new Set();
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (dark(x, y) && !frame.has(`${x},${y}`)) core.add(`${x},${y}`);
    const near = (set, x, y) => [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => set.has(`${x + dx},${y + dy}`)));
    const edge = [];
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      const p = get(b, x, y);
      if (!frame.has(`${x},${y}`) && p[3] > 128 && luma(p) < 120 && near(frame, x, y) && !near(core, x, y)) edge.push(`${x},${y}`);
    }
    for (const k of [...frame, ...edge]) {
      const [x, y] = k.split(',').map(Number);
      assert.deepEqual(get(closed, x, y), get(b, x, y), `ken ${state}: frame pixel ${k} changed`);
    }
    // No half-blink: inside each lens (boxes read off the art, inside the rims and independent of the eye windows),
    // nothing dark is left after the blink except the painted lid line. Ken's eyes have no whites to leave behind.
    const LENSES = { idle: [[83, 61, 92, 75], [110, 60, 116, 75]], talk: [[77, 63, 87, 77], [104, 61, 111, 75]] };
    const lash = RIG.ken.lash.join();
    const isWhite = p => p[3] > 200 && p[0] > 195 && p[1] > 195 && p[2] > 190 && Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) < 45;
    for (const [i, [lx0, ly0, lx1, ly1]] of LENSES[state].entries()) {
      // The lens colour around the eye, as the blink samples it (outside its window).
      const fill = skinIn(b, [lx0, ly0, lx1, ly1], st.eyes[i]);
      const far = p => Math.hypot(p[0] - fill[0], p[1] - fill[1], p[2] - fill[2]) > 48;
      let eye = 0, survivors = [];
      // Between the 2-row shadows the rim casts into the lens (top and bottom), nothing darker than the lens and unlike it
      // may be left except the lid line: a pupil, iris edge or lash is always darker; a lens highlight is lighter.
      for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) {
        if (luma(get(b, x, y)) < 60) eye++;
        const c = get(closed, x, y);
        if (y >= ly0 + 2 && y < ly1 - 2 && far(c) && luma(c) < luma(fill) && c.slice(0, 3).join() !== lash) survivors.push(`${x},${y}`);
        assert.ok(!isWhite(get(b, x, y)), `ken ${state}: an eye white at ${x},${y}`);
      }
      assert.ok(eye >= 15, `ken ${state}: the lens ${lx0},${ly0} holds an eye (${eye} dark px)`);
      assert.equal(survivors.length, 0, `ken ${state}: eye px left in the lens at ${lx0},${ly0} after the blink: ${survivors.join(' ')}`);
    }
  }
});

test('every closed mouth removes the open mouth of its talking drawing: only the face around it and one lip line remain', () => {
  for (const [actor, rig] of Object.entries(RIG)) {
    const st = rig.states.talk;
    assert.ok(st.mouth, `${actor} has a talking mouth`);
    const b = body(actor, 'talk');
    const closed = applyOverlay(b, paintClosedMouth(b, st.mouth, rig.lip));
    const [x0, y0, x1, y1] = st.mouth;
    // The face colour around the box (its 1 px ring), as the paint sees it.
    const ring = [];
    for (let x = x0 - 1; x <= x1; x++) ring.push(get(b, x, y0 - 1), get(b, x, y1));
    for (let y = y0; y < y1; y++) ring.push(get(b, x0 - 1, y), get(b, x1, y));
    const ref = [0, 1, 2].map(c => ring.map(p => p[c]).sort((m, n) => m - n)[ring.length >> 1]);
    const far = p => Math.hypot(p[0] - ref[0], p[1] - ref[1], p[2] - ref[2]) > 60;
    let before = 0, after = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (far(get(b, x, y))) before++;
      const c = get(closed, x, y);
      if (far(c) && c.slice(0, 3).join() !== rig.lip.join()) after++;
    }
    assert.ok(before >= 6, `${actor}: the box holds the open mouth (${before} px unlike the face)`);
    assert.ok(after <= 2, `${actor}: ${after} open-mouth px left`);
  }
});
