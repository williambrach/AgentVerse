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
  assert.deepEqual(w.text, { place: 'Banana Grove', eyebrow: 'GROVE', day: 'PICNIC DAY', one: 'monkey', many: 'monkeys', castLabel: 'MONKEY', hint: 'Walk with WASD / arrows. Press E next to a monkey.', oneWithArticle: 'a monkey', investigator: 'monkey investigator', icon: banana });
  assert.deepEqual(w.art, { cast: '/assets/banana/monkeys.png', idle: '/assets/banana/monkey-idle.png', walk: '/assets/banana/detective-walk.png', props: '/assets/banana/jungle-props.png' });
  assert.deepEqual(w.palette, { ground: '#82a75e', label: '#40533c', labelBg: '#fff6dd' });
});

test('tower text', () => {
  const w = worldFor('tower');
  assert.deepEqual(w.text, { place: 'Wizard Tower', eyebrow: 'TOWER', day: 'POTION DAY', one: 'apprentice', many: 'apprentices', castLabel: 'APPRENTICE', hint: 'Walk with WASD / arrows. Press E next to an apprentice.', oneWithArticle: 'an apprentice', investigator: 'inspector', icon: star });
  assert.deepEqual(w.art, { cast: '/assets/tower/apprentices.png', idle: '/assets/tower/apprentice-idle.png', walk: '/assets/tower/inspector-walk.png', props: '/assets/tower/tower-props.png' });
  assert.deepEqual(w.palette, { ground: '#5d566e', label: '#3d3550', labelBg: '#f3ecff' });
});

test('packs match the server worlds', () => {
  for (const id of ['grove', 'tower']) {
    const w = worldFor(id), s = worlds[id];
    assert.equal(w.id, s.id);
    assert.equal(w.text.place, s.place);
    assert.equal(w.text.many, s.cast.many);
    for (const key of ['clueSpot', 'clueNav', 'clueLabel', 'clueTitle']) { assert.equal(key in w.text, false); assert.equal(key in s, false); }
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
  assert.equal(rows.find(r => r.id === 'friends-roundtable').world, 'friends');
});

test('the tower measures its art; the grove keeps its tuned tables', () => {
  assert.deepEqual(worldFor('tower').heights, { cast: 47, investigator: 45 });
  assert.equal(worldFor('grove').heights, undefined);
});

import { worlds as serverWorlds } from '../server/worlds.mjs';
test('every world sets an agent count from 3 to 5', () => {
  for (const w of Object.values(serverWorlds)) assert.ok(Number.isInteger(w.agents) && w.agents >= 3 && w.agents <= 5);
  assert.equal(serverWorlds.grove.agents, 4);
  assert.equal(serverWorlds.tower.agents, 3);
});

test('friends pack is a roundtable', () => {
  const w = worldFor('friends');
  assert.equal(w.scene, 'roundtable');
  assert.equal(worldFor('grove').scene, undefined);
  assert.equal(worldFor('tower').scene, undefined);
  assert.deepEqual(w.text, { ...w.text, place: 'The Roundtable', eyebrow: 'FRIENDS', day: 'GAME NIGHT', one: 'friend', many: 'friends', castLabel: 'FRIEND', hint: 'Click a friend at the table, or pick one on the left.' });
  assert.deepEqual(w.art, { cast: '', idle: '', walk: '', props: '' });
  assert.deepEqual(w.slots, []);
});

test('friends_pack_matches_server_world', () => {
  const w = worldFor('friends'), s = serverWorlds.friends;
  assert.ok(s, 'server world friends (T2) has landed');
  assert.equal(w.id, s.id);
  assert.equal(w.text.place, s.place);
  assert.equal(w.text.many, s.cast.many);
  assert.ok(s.cast.one.endsWith(' ' + w.text.one));
});

test('factory_pack_matches_server_world', () => {
  const w = worldFor('factory'), s = serverWorlds.factory;
  assert.equal(w.id, 'factory');
  assert.equal(w.text.place, 'Brightwell Factory');
  assert.ok(s, "server world factory (T1) has landed");
  assert.equal(w.id, s.id);
    assert.equal(w.text.place, s.place);
    assert.equal(w.text.many, s.cast.many);
    assert.ok(s.cast.one.endsWith(' ' + w.text.one));
    assert.equal(s.agents, w.slots.length);
  assert.equal(w.slots.length, 5);
});

test('walking_packs_have_no_factory_fields', () => {
  for (const id of ['grove', 'tower', 'friends']) {
    const w = worldFor(id);
    assert.equal(w.figures, undefined); assert.equal(w.floor, undefined); assert.equal(w.stops, undefined);
  }
});

test('client_escape_review_guards', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../client/main.ts', import.meta.url), 'utf8');
  const station = readFileSync(new URL('../client/station.ts', import.meta.url), 'utf8');
  assert.match(main, /Promise\.race\(\[station\.escape\(escaper\)/, 'escape cannot hang the report');
  assert.match(main, /state\.session\?\.id !== sid\) return/, 'a reset during the walk keeps the newer view');
  assert.match(main, /clearInterval\(pollTimer\);\n\s*pollTimer = setInterval/, 'one poll timer');
  assert.match(station, /think\(id: string \| null\): void \{\n\s*if \(!this\.world\.figures\) return;/, 'grove think untouched');
  assert.match(station, /speak\(id: string, text: string\): void \{\n\s*if \(!this\.world\.figures\) return;/, 'grove speak untouched');
});

test('department_pack_matches_server_world', () => {
  const w = worldFor('department'), s = serverWorlds.department;
  assert.equal(w.text.place, 'Department Hall');
  assert.equal(w.text.many, 'colleagues');
  assert.equal(w.text.oneWithArticle, 'a colleague');
  assert.ok(s, 'server world department (T2) has landed');
  assert.equal(w.id, s.id);
  assert.equal(w.text.place, s.place);
  assert.equal(w.text.many, s.cast.many);
  assert.equal(s.cast.one, 'a colleague');
  assert.equal(s.agents, w.slots.length);
  assert.equal(w.slots.length, 5);
});
