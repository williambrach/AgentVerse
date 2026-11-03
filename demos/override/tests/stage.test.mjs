import test from 'node:test';
import assert from 'node:assert/strict';
import { createStage } from '../client/stage.ts';
import { worldFor } from '../client/worlds.ts';

const methods = ['configure', 'say', 'clearBubbles', 'resetPosition', 'setEnabled', 'setCovered', 'focus', 'think', 'speak'];
function setup() {
  const calls = [], made = { station: 0, roundtable: 0 };
  const fake = name => Object.fromEntries(methods.map(m => [m, (...a) => calls.push([name, m, ...a])]));
  const stage = createStage({
    station: () => { made.station++; return fake('station'); },
    roundtable: () => { made.roundtable++; return fake('roundtable'); },
    show: which => calls.push(['show', which]),
  });
  return { stage, calls, made };
}
const friends = worldFor('friends'), grove = worldFor('grove');
const cast = [{ id: 'a' }];

test('calls before the first configure are no-ops', () => {
  const { stage, calls, made } = setup();
  stage.say('a', 'x'); stage.focus('a'); stage.setEnabled(true); stage.clearBubbles();
  assert.deepEqual(calls, []);
  assert.deepEqual(made, { station: 0, roundtable: 0 });
  assert.equal(stage.active, null);
});

test('configure picks by scene, lazily, once', () => {
  const { stage, calls, made } = setup();
  stage.configure(friends, cast);
  assert.deepEqual(made, { station: 0, roundtable: 1 });
  assert.deepEqual(calls.slice(0, 2), [['show', 'roundtable'], ['roundtable', 'configure', friends, cast]]);
  stage.configure(friends, cast);
  assert.equal(made.roundtable, 1);
  assert.equal(stage.active, 'roundtable');
});

test('stage_forwards_only_to_active', () => {
  const { stage, calls } = setup();
  stage.configure(friends, cast);
  stage.configure(grove, cast);
  calls.length = 0;
  stage.setEnabled(true); stage.say('a', 'hi'); stage.resetPosition();
  assert.deepEqual(calls, [['station', 'setEnabled', true], ['station', 'say', 'a', 'hi'], ['station', 'resetPosition']]);
});

test('switch covers, disables and clears the old scene', () => {
  const { stage, calls } = setup();
  stage.configure(friends, cast);
  calls.length = 0;
  stage.configure(grove, cast);
  assert.deepEqual(calls.slice(0, 5), [
    ['roundtable', 'setEnabled', false], ['roundtable', 'setCovered', true], ['roundtable', 'clearBubbles'],
    ['show', 'station'], ['station', 'configure', grove, cast],
  ]);
});

test('stage_reapplies_enabled_covered_on_switch', () => {
  const { stage, calls } = setup();
  stage.configure(friends, cast);
  stage.setEnabled(true); stage.setCovered(false);
  calls.length = 0;
  stage.configure(grove, cast);
  assert.deepEqual(calls.slice(-2), [['station', 'setEnabled', true], ['station', 'setCovered', false]]);
  calls.length = 0;
  stage.configure(friends, cast);
  assert.deepEqual(calls.slice(-2), [['roundtable', 'setEnabled', true], ['roundtable', 'setCovered', false]]);
});

test('stage_cues_noop_on_station', () => {
  const { stage, calls } = setup();
  stage.configure(grove, cast);
  calls.length = 0;
  stage.focus('a'); stage.think('a'); stage.speak('a', 'x');
  assert.deepEqual(calls, []);
});

test('cues reach the roundtable', () => {
  const { stage, calls } = setup();
  stage.configure(friends, cast);
  calls.length = 0;
  stage.focus('a'); stage.think(null); stage.speak('a', 'x');
  assert.deepEqual(calls, [['roundtable', 'focus', 'a'], ['roundtable', 'think', null], ['roundtable', 'speak', 'a', 'x']]);
});
