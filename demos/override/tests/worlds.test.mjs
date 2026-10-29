import test from 'node:test';
import assert from 'node:assert/strict';
import { worldFor } from '../client/worlds.ts';
import { worlds } from '../server/worlds.mjs';
import { listCases } from '../server/cases.mjs';
import { cases } from '../server/cases/index.mjs';

const banana = '<path d="M5 4c-2 8 5 16 14 14-6 5-15 1-16-6C2 8 3 5 5 4zm0 0 2-1"/>';
const star = '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7z"/>';

test("grove text is today's text", () => {
  const w = worldFor('grove');
  assert.equal(w.id, 'grove');
  assert.deepEqual(w.text, { place: 'Banana Grove', eyebrow: 'GROVE', day: 'PICNIC DAY', one: 'monkey', many: 'monkeys', castLabel: 'MONKEY', clueSpot: 'basket', clueNav: 'Basket', clueLabel: 'BANANA BASKET', clueTitle: 'Inspect the banana basket', hint: 'Click a monkey or use WASD / arrows to explore.', clickOne: 'a monkey', investigator: 'monkey investigator', icon: banana });
  assert.deepEqual(w.art, { cast: '/assets/banana/monkeys.png', idle: '/assets/banana/monkey-idle.png', walk: '/assets/banana/detective-walk.png', props: '/assets/banana/jungle-props.png' });
  assert.deepEqual(w.palette, { ground: '#82a75e', label: '#40533c', labelBg: '#fff6dd' });
});

test('tower text', () => {
  const w = worldFor('tower');
  assert.deepEqual(w.text, { place: 'Wizard Tower', eyebrow: 'TOWER', day: 'POTION DAY', one: 'apprentice', many: 'apprentices', castLabel: 'APPRENTICE', clueSpot: 'potion cabinet', clueNav: 'Cabinet', clueLabel: 'POTION CABINET', clueTitle: 'Inspect the potion cabinet', hint: 'Click an apprentice or use WASD / arrows to explore.', clickOne: 'an apprentice', investigator: 'inspector', icon: star });
  assert.deepEqual(w.art, { cast: '/assets/tower/apprentices.png', idle: '/assets/tower/apprentice-idle.png', walk: '/assets/tower/inspector-walk.png', props: '/assets/tower/tower-props.png' });
  assert.deepEqual(w.palette, { ground: '#5d566e', label: '#3d3550', labelBg: '#f3ecff' });
});

test('packs match the server worlds', () => {
  for (const id of ['grove', 'tower']) {
    const w = worldFor(id), s = worlds[id];
    assert.equal(w.id, s.id);
    assert.equal(w.text.place, s.place);
    assert.equal(w.text.many, s.cast.many);
    assert.equal(w.text.clueSpot, s.clueSpot);
    assert.ok(s.cast.one.endsWith(' ' + w.text.one));
  }
});

test('unknown world is the grove', () => {
  assert.equal(worldFor(undefined).id, 'grove');
  assert.equal(worldFor('moon').id, 'grove');
});

test('catalog rows name their world', () => {
  const rows = listCases(cases, { dev: true });
  assert.equal(rows.find(r => r.id === 'banana-mystery').world, 'grove');
  assert.equal(rows.find(r => r.id === 'tower-echo-bell').world, 'tower');
});

test('the tower measures its art; the grove keeps its tuned tables', () => {
  assert.deepEqual(worldFor('tower').heights, { cast: 47, investigator: 45 });
  assert.equal(worldFor('tower').strideFix, undefined);
  assert.equal(worldFor('grove').heights, undefined);
  assert.equal(worldFor('grove').strideFix, undefined);
});
