import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameAt, actorAnimation, ANCHOR, ACTOR_IDS, MISSING_ART } from '../client/sprite-anim.ts';

const F = [
  { x: 0, y: 0, w: 192, h: 288, duration: 500 },
  { x: 192, y: 0, w: 192, h: 288, duration: 170 },
];

test('frame_at examples', () => {
  assert.equal(frameAt(F, 499), 0);
  assert.equal(frameAt(F, 500), 1);
  assert.equal(frameAt(F, 670), 0);
  assert.equal(frameAt(F, 1170), 1);
});
test('frame_at_zero_total', () => {
  assert.equal(frameAt(F.map((f) => ({ ...f, duration: 0 })), 1234), 0);
  assert.equal(frameAt([], 5), 0);
});
test('frame_at_huge_elapsed', () => {
  const i = frameAt(F, 1e12);
  assert.ok(Number.isInteger(i) && i >= 0 && i < F.length);
});
test('frame_at_negative', () => {
  assert.equal(frameAt(F, -10), 0);
  assert.equal(frameAt(F, NaN), 0);
  assert.equal(frameAt(F, Infinity), 0);
});
test('actor animation examples', () => {
  assert.deepEqual(actorAnimation('maya', 'talk'), { key: 'maya:seated-talk', image: 'maya-seated-talk.png', fallback: null });
  assert.deepEqual(actorAnimation('alex', 'think'), { key: 'alex:think', image: 'alex-think.png', fallback: 'standing drawing shown from the waist up behind the table: no seated art yet' });
  assert.deepEqual(actorAnimation('ken', 'think'), { key: 'ken:seated-think', image: 'ken-seated-think.png', fallback: 'holds his seated idle drawing (the upper-body thinking substitute has another head scale)' });
  // Sam's rig is a runtime composition: never presented as seated art.
  assert.match(actorAnimation('sam', 'idle').fallback, /temporary seated rig.*no seated art yet/);
  assert.deepEqual(ANCHOR, { x: 0.5, y: 0.9791666666666666 });
});
test('unknown_actor_throws', () => {
  assert.throws(() => actorAnimation('bob', 'idle'));
  assert.throws(() => actorAnimation('maya', 'dance'));
});
test('actor_ids_six', () => {
  assert.deepEqual(ACTOR_IDS, ['player', 'maya', 'ken', 'alex', 'nora', 'sam']);
});
test('table_keys_exist_in_pack_json', () => {
  const pack = JSON.parse(readFileSync(new URL('../public/assets/friends/animations.json', import.meta.url), 'utf8'));
  for (const a of ACTOR_IDS) for (const s of ['idle', 'talk', 'think']) {
    const { key, image } = actorAnimation(a, s);
    const e = pack.animations[key];
    assert.ok(e, key);
    assert.equal(e.image, image);
    assert.equal(e.frames.length, 6);
    for (const f of e.frames) { assert.equal(f.w, 192); assert.equal(f.h, 288); }
  }
});
test('missing_art_lists_alex_nora_sam_and_ken_think', () => {
  const t = MISSING_ART.join(' ');
  for (const w of ['Alex', 'Nora', 'Sam', 'Ken', 'thinking', 'temporary runtime rig', 'painted at runtime']) assert.match(t, new RegExp(w));
  assert.doesNotMatch(t, /walk cycle|seated cycle/i);
});
