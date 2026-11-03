import test from 'node:test';
import assert from 'node:assert/strict';
import { RIG, rigFrames, faceFrame } from '../client/roundtable-rig.ts';
import { composeSeatedSam, samLegColour, SAM_RIG } from '../client/sam-rig.ts';
import { ACTOR_IDS } from '../client/sprite-anim.ts';
import { friendsFrame } from './png.mjs';

const STATES = ['idle', 'talk', 'think'];
const W = 192, H = 288;
const px = (p, x, y) => p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4);
const body = (actor, state) => {
  const src = RIG[actor].states[state].source;
  if ('sam' in src) return composeSeatedSam(friendsFrame(`sam-${src.sam}.png`), friendsFrame('player-seated-idle.png'), SAM_RIG.parts[src.sam]);
  return friendsFrame(src.image, src.frame);
};

/** Pixels that differ between a (at x, y) and b (at x - dx, y - dy) inside region (every other row and column). */
function mismatch(a, b, [x0, y0, x1, y1], dx, dy) {
  let n = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const p = px(a, x, y), q = px(b, x - dx, y - dy);
    if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) + Math.abs(p[3] - q[3]) > 60) n++;
  }
  return n;
}
function bestShift(a, b, region, r = 14) {
  let best = [Infinity, 0, 0];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const m = mismatch(a, b, region, dx, dy); if (m < best[0]) best = [m, dx, dy]; }
  return best;
}
// Face and hair, above the chin, of each actor's idle drawing (the rig frame for Sam).
const HEADS = { player: [55, 25, 120, 105], maya: [55, 25, 125, 108], ken: [55, 25, 125, 105], alex: [60, 24, 125, 88], nora: [60, 22, 128, 85], sam: [58, 58, 128, 121] };

test('rig covers every actor and state with sane bands', () => {
  assert.deepEqual(Object.keys(RIG).sort(), [...ACTOR_IDS].sort());
  for (const [actor, rig] of Object.entries(RIG)) {
    assert.ok(rig.visibleRows > 0 && rig.visibleRows <= H, actor);
    for (const state of STATES) {
      const st = rig.states[state];
      assert.ok(st, `${actor} ${state}`);
      assert.ok(st.neck > 60 && st.neck < st.chest && st.chest <= rig.visibleRows, `${actor} ${state} bands ${st.neck}/${st.chest}/${rig.visibleRows}`);
      for (const [x0, y0, x1, y1] of [...st.eyes, ...(st.mouth ? [st.mouth] : [])]) {
        assert.ok(x0 >= 0 && y0 >= 0 && x1 <= W && y1 <= st.neck && x0 < x1 && y0 < y1, `${actor} ${state}: face box inside the head band`);
      }
      assert.equal(st.eyes.length, 2, `${actor} ${state}: two eyes`);
      assert.equal(Boolean(st.mouth), state === 'talk', `${actor} ${state}: a mouth to close only while talking`);
    }
  }
});

test('standing legs are never drawn: far standing friends stop at the waist', () => {
  assert.ok(RIG.alex.visibleRows <= 172);
  assert.ok(RIG.nora.visibleRows <= 172);
  for (const s of STATES) assert.ok('sam' in RIG.sam.states[s].source, `sam ${s} uses the seated rig`);
});

test("Ken thinks in his seated idle drawing (same head scale and glasses)", () => {
  assert.deepEqual(RIG.ken.states.think.source, RIG.ken.states.idle.source);
  assert.deepEqual(RIG.ken.states.think.register, [0, 0]);
});

test('face frames exist for every state', () => {
  for (const state of STATES) {
    const frames = rigFrames(state);
    for (const blink of [false, true]) for (const open of [false, true]) {
      const name = faceFrame(state, blink, open);
      if (state === 'talk' || open) assert.ok(frames.includes(name), `${state} ${blink} ${open}: ${name}`);
    }
    assert.equal(faceFrame(state, false, true), state);
  }
});

test('registration keeps each head where the idle head is (measured on the art)', () => {
  for (const [actor, rig] of Object.entries(RIG)) {
    const idle = body(actor, 'idle');
    for (const state of ['talk', 'think']) {
      const st = rig.states[state];
      if (JSON.stringify(st.source) === JSON.stringify(rig.states.idle.source)) continue;
      const [, dx, dy] = bestShift(idle, body(actor, state), HEADS[actor]);
      assert.ok(Math.abs(dx - st.register[0]) <= 1 && Math.abs(dy - st.register[1]) <= 1, `${actor} ${state}: register ${st.register} vs measured ${dx},${dy}`);
    }
  }
});

test('near seats keep their feet too: the base band registers on the seat, never lower than the torso band', () => {
  const idle = body('player', 'idle');
  for (const state of ['talk', 'think']) {
    const st = RIG.player.states[state];
    assert.ok(st.baseRegister, `player ${state} has a seat registration`);
    const [, dx, dy] = bestShift(idle, body('player', state), [30, 190, 170, 280]);
    assert.ok(Math.abs(dx - st.baseRegister[0]) <= 1 && Math.abs(dy - st.baseRegister[1]) <= 1, `player ${state}: base ${st.baseRegister} vs measured seat ${dx},${dy}`);
    assert.ok(st.baseRegister[1] <= st.register[1], `player ${state}: the base would sit lower than the torso and open a gap`);
    // The rows hidden between the bands must not show: just below the split, the drawing looks the same as the rows
    // the eye sees there instead (only vertical lines cross the split).
    const b = body('player', state), skip = st.register[1] - st.baseRegister[1];
    let differ = 0;
    for (let x = 0; x < W; x++) { const p = px(b, x, st.chest + 1), q = px(b, x, st.chest + 1 + skip); if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) + Math.abs(p[3] - q[3]) > 80) differ++; }
    assert.ok(differ <= 20, `player ${state}: the splice at row ${st.chest} changes ${differ} px`);
  }
  // Far friends' legs are behind the table: only the head registers.
  for (const actor of ['maya', 'ken', 'alex', 'nora']) for (const state of STATES) assert.equal(RIG[actor].states[state].baseRegister, undefined, `${actor} ${state}`);
});

test("Sam's rig: one head position in every state, hem on the lap, no gap between body and legs", () => {
  const idle = body('sam', 'idle');
  for (const state of ['talk', 'think']) {
    const [, dx, dy] = bestShift(idle, body('sam', state), HEADS.sam, 4);
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, `${state}: head moves ${dx},${dy}`);
  }
  for (const state of STATES) {
    const b = body('sam', state);
    // Down the middle of the body every row is opaque from the collar to the shoes.
    for (let y = 120; y < 268; y++) {
      let opaque = 0;
      for (let x = 70; x < 130; x++) if (px(b, x, y)[3] > 128) opaque++;
      assert.ok(opaque > 20, `${state}: row ${y} nearly empty (${opaque})`);
    }
  }
});

test("Sam's legs wear his colours: tan trousers, brown shoes, outlines kept", () => {
  const hue = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
  const jeans = samLegColour(0x5f, 0x64, 0x73, 220), shoe = samLegColour(0xdc, 0xcb, 0xbc, 255), outline = samLegColour(3, 1, 1, 220);
  assert.ok(Math.abs(hue(jeans) - 29) < 6, `trousers hue ${hue(jeans)}`);
  assert.ok(Math.abs(hue(shoe) - 19) < 6 && Math.max(...shoe) < 130, `shoe ${shoe}`);
  assert.deepEqual(outline, [3, 1, 1]);
  // Nothing of the player's blue jeans or the hoodie flap survives below Sam's own (navy) hem.
  for (const state of STATES) {
    const b = body('sam', state);
    const hem = SAM_RIG.parts[state].samRow + SAM_RIG.parts[state].dy;
    let blue = 0;
    for (let y = hem; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl, a] = px(b, x, y); if (a > 128 && bl > r + 12 && bl > g + 6 && bl > 80) blue++; }
    assert.ok(blue <= 3, `${state}: ${blue} blue px below the hem`);
  }
});
