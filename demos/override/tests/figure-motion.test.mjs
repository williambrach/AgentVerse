import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../client/figure-motion.ts';

const drawn = { idle: 4, talk: 2, walk: 4 };

test('seedOf: stable, in [0, 1), different per id', () => {
  const ids = ['marta', 'ama', 'vera', 'theo', 'bruno', 'detective'];
  const seeds = ids.map(m.seedOf);
  assert.deepEqual(seeds, ids.map(m.seedOf));
  assert.ok(seeds.every(s => s >= 0 && s < 1));
  assert.equal(new Set(seeds).size, ids.length);
});

test('pose pop: squash, stretch, settle, then nothing', () => {
  assert.deepEqual([0, 79, 80, 159, 160, 239, 240, 5000, -1].map(m.popStretch), [-3, -3, 3, 3, 1, 1, 0, 0, 0]);
});

test('idle loop ping-pongs so no frame jumps back to the start', () => {
  const at = t => m.idleFrameAt(4, t);
  assert.deepEqual([0, 519, 520, 1040, 1560, 2080, 2600, 3120].map(at), [0, 0, 1, 2, 3, 2, 1, 0]);
  assert.equal(m.idleFrameAt(1, 9999), 0);
  assert.equal(m.idleFrameAt(4, NaN), 0);
});

test('breathing is whole pixels, 0 to 2, and reaches both ends', () => {
  const values = new Set();
  for (let t = 0; t < 4000; t += 20) values.add(m.breath(t, .3));
  assert.deepEqual([...values].sort(), [0, 1, 2]);
});

test('talking alternates rest and a 1 to 3 pixel beat', () => {
  for (let beat = 0; beat < 40; beat++) {
    const v = m.talkBob(beat * m.TALK_BEAT_MS + 1, .42);
    if (beat % 2 === 0) assert.equal(v, 0);
    else assert.ok([1, 2, 3].includes(v), `beat ${beat}: ${v}`);
  }
});

test('thinking sways in half-degree steps, never past 1.5 degrees', () => {
  const seen = new Set();
  for (let t = 0; t < 3000; t += 10) {
    const lean = m.thinkLean(t, .1);
    assert.equal(lean * 2, Math.round(lean * 2));
    assert.ok(Math.abs(lean) <= 1.5);
    seen.add(lean);
  }
  assert.ok(seen.has(1.5) && seen.has(-1.5));
});

test('standLook: static art breathes in its pose, drawn art cycles its loops', () => {
  const still = m.standLook('listening', 1000, .2, 9999);
  assert.deepEqual(still.texture, { kind: 'pose', pose: 'listening' });
  assert.ok([0, 1, 2].includes(still.stretch));
  const idle = m.standLook('listening', 1000, .2, 9999, drawn);
  assert.equal(idle.texture.kind, 'idle');
  assert.equal(idle.stretch, 0, 'drawn idle frames breathe on their own');
  const frames = new Set();
  for (let t = 0; t < 2000; t += 50) frames.add(m.standLook('speaking', t, .2, 9999, drawn).texture.frame);
  assert.deepEqual([...frames].sort(), [0, 1]);
  assert.deepEqual(m.standLook('speaking', 0, .2, 9999, { idle: 4, talk: 1, walk: 0 }).texture, { kind: 'pose', pose: 'speaking' });
  assert.deepEqual(m.standLook('thinking', 0, .2, 9999, drawn).texture, { kind: 'pose', pose: 'thinking' });
  assert.equal(m.standLook('speaking', 0, .2, 0).stretch, -3, 'a fresh pose pops first');
  assert.deepEqual(m.stillLook('thinking'), { texture: { kind: 'pose', pose: 'thinking' }, stretch: 0, lift: 0, lean: 0 });
});

test('walkLook static art: a hop per step, leaning one way then the other', () => {
  const first = m.walkLook(m.STEP_UNITS / 2, 'listening');
  const second = m.walkLook(m.STEP_UNITS * 1.5, 'listening');
  assert.deepEqual(first.texture, { kind: 'pose', pose: 'listening' });
  assert.equal(first.lift, 3);
  assert.equal(second.lift, 3);
  assert.ok(first.lean > 0 && second.lean < 0, `${first.lean} ${second.lean}`);
  const contact = m.walkLook(0, 'listening');
  assert.deepEqual([contact.lift, contact.stretch, contact.lean], [0, -2, 0]);
  for (let d = 0; d < 120; d += 1.3) {
    const look = m.walkLook(d, 'listening');
    assert.equal(look.lift, Math.round(look.lift));
    assert.ok(Math.abs(look.lean) <= 2);
  }
});

test('walkLook drawn art: frames by distance, no added bob', () => {
  assert.deepEqual(m.walkLook(m.WALK_FRAME_UNITS * 5, 'listening', drawn), { texture: { kind: 'walk', frame: 1 }, stretch: 0, lift: 0, lean: 0 });
});

test('stride: a 120 Hz screen over 60 Hz physics keeps walking', () => {
  let s = m.STANDING;
  for (let i = 0; i < 20; i++) {
    s = m.strideNext(s, i % 2 ? 0 : 2, true, 8.3);
    assert.equal(s.walking, true, `frame ${i}`);
  }
  assert.equal(s.distance, 20);
});

test('stride: release, a blocked 80 ms and a teleport all stop it', () => {
  const walking = m.strideNext(m.STANDING, 2, true, 16);
  assert.equal(walking.walking, true);
  assert.deepEqual(m.strideNext(walking, 2, false, 16), m.STANDING);
  assert.deepEqual(m.strideNext(walking, 30, true, 16), m.STANDING);
  let s = walking;
  for (let i = 0; i < 4; i++) s = m.strideNext(s, 0, true, 16);
  assert.equal(s.walking, true, '64 ms still');
  s = m.strideNext(s, 0, true, 16);
  assert.equal(s.walking, false, '80 ms still');
  assert.equal(s.distance, 0);
});

test('chillAt: repeatable, a mix of acts, never in step across the department cast', () => {
  const seeds = ['freja', 'mikkel', 'birgit', 'jonas', 'signe'].map(m.seedOf);
  const ts = Array.from({ length: 1200 }, (_, i) => i * 250);
  for (const s of seeds) assert.deepEqual(ts.map(t => m.chillAt(t, s)), ts.map(t => m.chillAt(t, s)));
  const acts = new Set(seeds.flatMap(s => ts.map(t => m.chillAt(t, s).act)));
  assert.deepEqual([...acts].sort(), ['glance', 'ponder', 'rest', 'shift']);
  const tracks = seeds.map(s => ts.map(t => m.chillAt(t, s).act).join());
  assert.equal(new Set(tracks).size, seeds.length);
  // Mostly at rest: acts are short breaks, not the whole time.
  for (const s of seeds) assert.ok(ts.filter(t => m.chillAt(t, s).act === 'rest').length > ts.length * .5);
});

test('chillAt: acts last 2.4 to 4 s, shift leans one degree, bad time rests', () => {
  const s = m.seedOf('jonas');
  for (let t = 0; t < 300000; t += 100) {
    const c = m.chillAt(t, s);
    assert.ok(c.since >= 0 && c.since < 4000);
    if (c.act === 'shift') assert.equal(Math.abs(c.lean), 1); else assert.equal(c.lean, 0);
  }
  assert.deepEqual(m.chillAt(NaN, s), m.CHILL_REST);
  assert.deepEqual(m.chillAt(-5, s), m.CHILL_REST);
});

test('faceFor: home facing, glance turns away, the detective wins when near or engaged', () => {
  const base = { home: false, current: false, x: 100, y: 200, engaged: false, glance: false };
  assert.equal(m.faceFor(base), false);
  assert.equal(m.faceFor({ ...base, home: true }), true);
  assert.equal(m.faceFor({ ...base, glance: true }), true);
  const far = { x: 20, y: 200 };
  assert.equal(m.faceFor({ ...base, detective: far }), false);
  assert.equal(m.faceFor({ ...base, detective: far, engaged: true }), true);
  assert.equal(m.faceFor({ ...base, detective: { x: 60, y: 210 } }), true);
  assert.equal(m.faceFor({ ...base, home: true, glance: true, detective: { x: 140, y: 200 } }), false);
  assert.equal(m.faceFor({ ...base, current: true, detective: { x: 103, y: 230 } }), true);
});
