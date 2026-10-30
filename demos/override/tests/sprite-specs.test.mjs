import test from 'node:test';
import assert from 'node:assert/strict';
import { idleSpec, groveIdle, reskinIdle, MonkeyIdle } from '../client/monkey-idle.ts';
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

test('grove idle numbers are halved with the 2x downscaled sheets', () => {
  assert.deepEqual(groveIdle.momo.poses[2], { x: 362, y: 0, w: 181, h: 181, anchorX: 84.75, anchorY: 177 });
  assert.equal(groveIdle.pip.scale, 44 / 156.5);
  assert.equal(groveIdle.momo.scale, 47 / 158.5);
  assert.equal(groveIdle.nori.offset, 2600);
  assert.equal(groveIdle.nori.period, 5600);
  assert.equal(groveIdle.pip.poses[0].y, 181);
  assert.equal(groveIdle.nori.poses[3].anchorX, 85.5);
  assert.equal(groveIdle.momo.textureKey, 'monkey-idle');
});

test('grove walk numbers are halved with the 2x downscaled sheets', () => {
  assert.deepEqual(groveWalk.frames[5], { x: 157, y: 165, w: 157, h: 146, anchorX: 81.5, anchorY: 142 });
  assert.equal(groveWalk.frames.length, 16);
  assert.equal(groveWalk.scale, 0.32);
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
  assert.deepEqual(s.sprite.origin, [84.5 / 181, 177 / 181]);
  assert.equal(s.frames.get('momo-2').x, 362);

  const frame = { x: 0, y: 0, w: 20, h: 40, anchorX: 10, anchorY: 40 };
  s = fakeScene();
  new MonkeyIdle(s, 'wren', 0, 0, idleSpec([frame, frame, frame, frame], 'k', 40, 0));
  assert.deepEqual(s.sprite.origin, [0.5, 1]);

  s = fakeScene();
  new DetectiveWalk(s, 0, 0, walkSpec(Array(16).fill(frame), 'k', 40));
  assert.deepEqual(s.sprite.origin, [0.5, 1]);
  assert.ok(s.frames.has('right-3'));
});

test('five idle entries keep distinct timing', () => {
  const p = poses(40);
  const specs = [0, 1, 2, 3, 4].map((slot) => idleSpec(p, 'k', 46, slot));
  assert.deepEqual(specs.map((x) => x.period), [4800, 4300, 5600, 5000, 4500]);
  assert.deepEqual(specs.map((x) => x.offset), [0, 1200, 2600, 1800, 3400]);
  assert.equal(new Set(specs.map((x) => `${x.period}/${x.offset}`)).size, 5);
  const skin = reskinIdle(specs[0], 'k-rc3', 3);
  assert.equal(skin.textureKey, 'k-rc3');
  assert.deepEqual([skin.period, skin.offset, skin.scale, skin.poses], [5000, 1800, specs[0].scale, p]);
});

test('a monkey with the player nearby reaches a gesture pose within 700 ms of simulated time', () => {
  const s = fakeScene();
  const monkey = new MonkeyIdle(s, 'momo', 0, 0, groveIdle.momo);
  const seen = [];
  for (let t = 0; t < 700; t += 16) {
    monkey.update(16, true, false, true);
    seen.push(s.sprite.frame.name);
  }
  assert.ok(seen.includes('momo-2'));
  assert.ok(seen.includes('momo-3'));
  monkey.reset();
  assert.equal(s.sprite.frame.name, 'momo-0');
});

test('a walker keeps its stride between physics ticks shorter than 80 ms and drops it after', () => {
  const s = fakeScene();
  const walker = new DetectiveWalk(s, 0, 0, groveWalk);
  walker.update(12, 0, 'right', true, false, 16);
  assert.equal(s.sprite.frame.name, 'right-1');
  walker.update(12, 0, 'right', true, false, 79);
  assert.equal(s.sprite.frame.name, 'right-1');
  walker.update(12, 0, 'right', true, false, 1);
  assert.equal(s.sprite.frame.name, 'right-0');
});
