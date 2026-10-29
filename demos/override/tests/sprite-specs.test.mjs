import test from 'node:test';
import assert from 'node:assert/strict';
import { idleSpec, groveIdle, MonkeyIdle } from '../client/monkey-idle.ts';
import { walkSpec, groveWalk, DetectiveWalk } from '../client/detective-walk.ts';

function fakeScene() {
  const frames = new Map();
  const sprite = {
    origin: null, frame: null, scale: null,
    setScale(s) { this.scale = s; return this; },
    setDepth() { return this; },
    setPosition() { return this; },
    setFrame(name) { this.frame = { name }; return this; },
    setOrigin(x, y) { this.origin = [x, y]; return this; },
  };
  const texture = {
    has: (n) => frames.has(n),
    add: (n, _s, x, y, w, h) => { frames.set(n, { x, y, w, h }); },
  };
  return {
    sprite, frames,
    textures: { get: () => texture },
    add: { sprite: () => sprite },
  };
}

const poses = (h) => [0, 1, 2, 3].map((i) => ({ x: i * 10, y: 0, w: 30, h, anchorX: 15, anchorY: h }));

test('grove idle numbers are unchanged', () => {
  assert.deepEqual(groveIdle.momo.poses[2], { x: 724, y: 0, w: 362, h: 362, anchorX: 169.5, anchorY: 354 });
  assert.equal(groveIdle.pip.scale, 44 / 313);
  assert.equal(groveIdle.momo.scale, 47 / 317);
  assert.equal(groveIdle.nori.offset, 2600);
  assert.equal(groveIdle.nori.period, 5600);
  assert.equal(groveIdle.pip.poses[0].y, 362);
  assert.equal(groveIdle.nori.poses[3].anchorX, 171);
  assert.equal(groveIdle.momo.textureKey, 'monkey-idle');
});

test('grove walk numbers are unchanged', () => {
  assert.deepEqual(groveWalk.frames[5], { x: 314, y: 330, w: 313, h: 292, anchorX: 163, anchorY: 284 });
  assert.equal(groveWalk.frames.length, 16);
  assert.equal(groveWalk.scale, 0.16);
  assert.equal(groveWalk.textureKey, 'detective-walk');
});

test('idleSpec and walkSpec derive scale and timing', () => {
  const p = poses(40);
  assert.deepEqual(idleSpec(p, 'tower-idle', 46, 1), { textureKey: 'tower-idle', poses: p, scale: 1.15, period: 4300, offset: 1200 });
  const f = Array.from({ length: 16 }, () => ({ x: 0, y: 0, w: 40, h: 50, anchorX: 20, anchorY: 50 }));
  assert.equal(walkSpec(f, 'tower-walk', 40).scale, 0.8);
});

test('origins come from the spec', () => {
  let s = fakeScene();
  new MonkeyIdle(s, 'momo', 10, 20, groveIdle.momo);
  assert.deepEqual(s.sprite.origin, [169 / 362, 354 / 362]);
  assert.equal(s.frames.get('momo-2').x, 724);

  const frame = { x: 0, y: 0, w: 20, h: 40, anchorX: 10, anchorY: 40 };
  s = fakeScene();
  new MonkeyIdle(s, 'wren', 0, 0, idleSpec([frame, frame, frame, frame], 'k', 40, 0));
  assert.deepEqual(s.sprite.origin, [0.5, 1]);

  s = fakeScene();
  new DetectiveWalk(s, 0, 0, walkSpec(Array(16).fill(frame), 'k', 40));
  assert.deepEqual(s.sprite.origin, [0.5, 1]);
  assert.ok(s.frames.has('right-3'));
});
