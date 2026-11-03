import test from 'node:test';
import assert from 'node:assert/strict';
import { naturalMotion, MOTION } from '../client/roundtable-motion.ts';

const ACTORS = ['player', 'maya', 'ken', 'alex', 'nora', 'sam'];
const sample = (actor, state, ms, step = 10, options = {}) => Array.from({ length: Math.floor(ms / step) }, (_, i) => naturalMotion(actor, state, i * step, options));
/** [start, length] of each run where pick(sample) is true, in samples. */
const runs = (samples, pick) => {
  const out = []; let start = -1;
  samples.forEach((s, i) => { if (pick(s) && start < 0) start = i; if (!pick(s) && start >= 0) { out.push([start, i - start]); start = -1; } });
  if (start >= 0) out.push([start, samples.length - start]);
  return out;
};

test('blinks are brief and occasional, in every state', () => {
  for (const actor of ACTORS) for (const state of ['idle', 'talk', 'think']) {
    const blinks = runs(sample(actor, state, 60000), s => s.blink);
    assert.ok(blinks.length >= 9 && blinks.length <= 24, `${actor} ${state}: ${blinks.length} blinks a minute`);
    for (const [, len] of blinks) assert.ok(len * 10 <= MOTION.blinkMs[1] + 10, `${actor} ${state}: a ${len * 10} ms blink`);
  }
});

test('the table never blinks or breathes in unison', () => {
  const blink = Object.fromEntries(ACTORS.map(a => [a, sample(a, 'idle', 30000).map(s => s.blink)]));
  const breath = Object.fromEntries(ACTORS.map(a => [a, sample(a, 'idle', 30000).map(s => s.torso)]));
  for (const a of ACTORS) for (const b of ACTORS) {
    if (a >= b) continue;
    const both = blink[a].filter((v, i) => v && blink[b][i]).length;
    assert.ok(both <= 30, `${a}+${b} blink together for ${both * 10} ms in 30 s`);
    const same = breath[a].filter((v, i) => v === breath[b][i]).length / breath[a].length;
    assert.ok(same < 0.92, `${a}+${b} breathe in step (${same.toFixed(2)})`);
  }
});

test('breathing is a slow 1 px drop of the upper body, never while talking', () => {
  for (const actor of ACTORS) {
    const idle = sample(actor, 'idle', 30000);
    assert.ok(idle.every(s => s.torso === 0 || s.torso === 1), actor);
    const drops = runs(idle, s => s.torso === 1);
    assert.ok(drops.length >= 4 && drops.length <= 8, `${actor}: ${drops.length} breaths in 30 s`);
    assert.ok(sample(actor, 'talk', 10000).every(s => s.torso === 0), `${actor} breathes while talking`);
  }
});

test('near actors breathe only while idle (their other poses cross the chest seam)', () => {
  for (const actor of ['player', 'sam']) {
    assert.ok(sample(actor, 'think', 20000, 10, { near: true }).every(s => s.torso === 0));
    assert.ok(sample(actor, 'idle', 20000, 10, { near: true }).some(s => s.torso === 1));
  }
});

test('talking moves only the mouth and short nods of at most 2 px', () => {
  for (const actor of ACTORS) {
    const talk = sample(actor, 'talk', 12000);
    assert.deepEqual(new Set(talk.map(s => s.mouthOpen)), new Set([true, false]), actor);
    assert.ok(talk.every(s => s.head >= 0 && s.head <= 2 && s.head >= s.torso), actor);
    const nods = runs(talk, s => s.head > 0);
    assert.ok(nods.length >= 1 && nods.length <= 6, `${actor}: ${nods.length} nods in 12 s`);
    for (const [, len] of nods) assert.ok(len * 10 <= MOTION.nodMs + 10, `${actor}: a ${len * 10} ms nod`);
    // Each phrase ends with the mouth closed.
    for (let k = 0; k < 5; k++) assert.equal(naturalMotion(actor, 'talk', k * MOTION.phraseMs + MOTION.phraseMs - 50).mouthOpen, false);
  }
});

test('the mouth is still when not talking, and thinking never nods', () => {
  for (const actor of ACTORS) {
    assert.ok(sample(actor, 'idle', 20000).every(s => s.mouthOpen && s.head === s.torso), `${actor} idle`);
    assert.ok(sample(actor, 'think', 20000, 10, { listening: true }).every(s => s.mouthOpen && s.head === s.torso), `${actor} think`);
  }
});

test('listeners nod now and then, 1 px, only while someone else talks', () => {
  for (const actor of ACTORS) {
    const quiet = sample(actor, 'idle', 60000);
    const listening = sample(actor, 'idle', 60000, 10, { listening: true });
    assert.ok(quiet.every(s => s.head === s.torso));
    const nods = runs(listening, s => s.head > s.torso);
    assert.ok(nods.length >= 2 && nods.length <= 12, `${actor}: ${nods.length} listening nods in 60 s`);
    assert.ok(listening.every(s => s.head - s.torso <= 1));
  }
});

test('reduced motion: nothing moves and the drawing keeps its own face', () => {
  for (const actor of ACTORS) for (const state of ['idle', 'talk', 'think']) for (const t of [0, 180, 450, 4550, 99999]) {
    assert.deepEqual(naturalMotion(actor, state, t, { still: true, listening: true }), { head: 0, torso: 0, blink: false, mouthOpen: true });
  }
});

test('bad times are safe', () => {
  for (const t of [NaN, -5, Infinity]) assert.deepEqual(Object.keys(naturalMotion('maya', 'talk', t)).sort(), ['blink', 'head', 'mouthOpen', 'torso']);
});
