import test from 'node:test';
import assert from 'node:assert/strict';
import { createTyper, createThrottle } from '../client/stream-ui.ts';

test('pacing: the reveal never runs ahead of received text', () => {
  const t = createTyper(false);
  t.set('Hello there, detective.');
  let guard = 0;
  while (t.tick() && guard++ < 100) assert.ok(t.received().startsWith(t.shown()));
  assert.equal(t.shown(), 'Hello there, detective.');
  assert.equal(t.pending(), false);
  t.set('Hello there, detective. More.');
  assert.equal(t.shown(), 'Hello there, detective.');
  assert.equal(t.pending(), true);
});

test('pacing: the first step shows a few characters, not everything', () => {
  const t = createTyper(false);
  t.set('x'.repeat(10));
  t.tick();
  assert.equal(t.shown().length, 1);
});

test('pacing: click reveals all received at once', () => {
  const t = createTyper(false);
  t.set('A long answer from the suspect.');
  t.revealAll();
  assert.equal(t.shown(), 'A long answer from the suspect.');
});

test('pacing: reduced motion shows each chunk as it arrives', () => {
  const t = createTyper(true);
  t.set('One');
  assert.equal(t.shown(), 'One');
  t.set('One two');
  assert.equal(t.shown(), 'One two');
});

test('scrub: shorter or replaced text restarts the reveal, the false start never shows', () => {
  const t = createTyper(false);
  t.set('A false start');
  t.revealAll();
  t.set('');
  assert.equal(t.shown(), '');
  t.set('Fresh');
  assert.equal(t.shown(), '');
  t.set('Other words entirely, longer than before');
  t.tick();
  assert.ok(t.shown().length <= 2);
});

test('pacing: speak throttle allows one call per window', () => {
  const gate = createThrottle(600);
  assert.equal(gate(1000), true);
  assert.equal(gate(1300), false);
  assert.equal(gate(1600), true);
});

import { readFileSync } from 'node:fs';
const main = readFileSync(new URL('../client/main.ts', import.meta.url), 'utf8');

test('transport: a failed stream aborts the request so the reader is released', () => {
  assert.match(main, /signal: abort\.signal/);
  assert.match(main, /catch \(error\) \{\s*abort\.abort\(\)/);
});

test('watch: a Watch that outlives the stream is awaited before the no-thought note and its newer view is kept', () => {
  assert.match(main, /if \(watchInFlight\) await watchInFlight;/);
  assert.match(main, /revision \?\? 0\) > \(state\.session\?\.revision \?\? 0\)/);
});
