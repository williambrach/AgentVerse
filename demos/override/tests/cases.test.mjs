import test from 'node:test';
import assert from 'node:assert/strict';
import { defineCase, publicView, listCases, findCase, contentHash } from '../server/cases.mjs';
import { minimalCase } from './fixtures/minimal-case.mjs';
import bananaMystery from '../server/cases/banana-mystery.mjs';

const copy = (patch = {}) => ({ ...JSON.parse(JSON.stringify(minimalCase)), rehearsal: minimalCase.rehearsal, ...patch });
const edit = fn => { const data = copy(); fn(data); return data; };

test('defineCase adds a stable 12-hex hash', () => {
  const kase = defineCase(minimalCase);
  assert.ok(Object.isFrozen(kase));
  assert.match(kase.contentHash, /^[0-9a-f]{12}$/);
  assert.equal(defineCase(copy()).contentHash, kase.contentHash);
  assert.notEqual(defineCase(edit(d => { d.records[0].text = 'changed'; })).contentHash, kase.contentHash);
  const reordered = Object.fromEntries(Object.entries(copy()).reverse());
  assert.equal(defineCase(reordered).contentHash, kase.contentHash);
  assert.equal(contentHash({ b: 1, a: [2] }), contentHash({ a: [2], b: 1 }));
});

test('defineCase names the failing path', () => {
  const bad = (fn, pattern) => assert.throws(() => defineCase(edit(fn)), pattern);
  bad(d => { d.id = 'Bad ID'; }, /^Error: case Bad ID: id: |^case Bad ID: id: /);
  bad(d => { delete d.copy.report.title; }, /copy\.report\.title/);
  bad(d => { delete d.characters[2].room; }, /characters\[2\]\.room/);
  bad(d => { d.records.push({ ...d.records[0] }); }, /records\[1\]\.id/);
  bad(d => { d.records[0].chapter = 2; }, /records\[0\]\.chapter/);
  bad(d => { d.knowledge.pip = ['a', 'b']; }, /knowledge\.pip/);
  bad(d => { d.answer.culprits = ['maya']; }, /answer\.culprits/);
  bad(d => { d.debrief.findings[0].evidence = ['zzz']; }, /debrief\.findings\[0\]\.evidence/);
  bad(d => { d.rehearsal = 'x'; }, /rehearsal/);
});

test('publicView sends only the allowlist', () => {
  const view = publicView(defineCase(minimalCase));
  assert.deepEqual(Object.keys(view), ['caseId', 'caseVersion', 'contentHash', 'title', 'order', 'copy', 'world', 'characters', 'chapters', 'clueCount']);
  assert.deepEqual(Object.keys(view.characters[0]), ['id', 'name', 'role', 'room', 'color', 'introduction', 'quickQuestion']);
  assert.equal(view.clueCount, 1);
  assert.equal(view.caseId, 'mini-case');
  assert.ok(!JSON.stringify(view).includes('SECRET'));
});

test('listCases and findCase hide drafts unless dev', () => {
  const ready1 = defineCase({ ...copy(), id: 'r-case', title: 'R', order: 1, status: 'ready' });
  const draft0 = defineCase({ ...copy(), id: 'd-case', title: 'D', order: 0, status: 'draft' });
  assert.deepEqual(listCases([ready1, draft0]), [{ id: 'r-case', title: 'R', lead: 'L1\nL2', order: 1, world: 'grove' }]);
  assert.deepEqual(listCases([ready1, draft0], { dev: true }).map(r => r.order), [0, 1]);
  assert.equal(findCase([ready1, draft0], 'nope'), undefined);
  assert.equal(findCase([ready1, draft0], 'd-case'), undefined);
  assert.equal(findCase([ready1, draft0], 'd-case', { dev: true }), draft0);
});

test('banana-mystery validates', () => {
  assert.match(bananaMystery.contentHash, /^[0-9a-f]{12}$/);
  assert.deepEqual(bananaMystery.answer.culprits, ['momo']);
  assert.equal(bananaMystery.version, 'banana-authored-v1.0.0');
  assert.ok(bananaMystery.rehearsal({ selectedEvidence: null }, 'nori', 'x').includes('assumed snack time'));
});

import { worlds } from '../server/worlds.mjs';
import { towerCase } from './fixtures/minimal-case.mjs';
import bananaControl from '../server/cases/banana-control.mjs';
const grove = { id: 'grove', place: 'Banana Grove', cast: { one: 'a monkey', many: 'monkeys' }, clueSpot: 'basket' };
const tower = { id: 'tower', place: 'Wizard Tower', cast: { one: 'an apprentice', many: 'apprentices' }, clueSpot: 'potion cabinet' };
test('worlds registry', () => {
  assert.deepEqual(worlds.grove, { ...grove, persona: 'monkey' });
  assert.deepEqual(worlds.tower, { ...tower, persona: 'wizard' });
});
test('no world means the grove', () => assert.deepEqual(defineCase(copy()).world, { ...grove, persona: 'monkey' }));
test('a tower case brings its own cast', () => {
  const k = defineCase(towerCase());
  assert.equal(k.world.id, 'tower');
  assert.deepEqual(k.characters.map(c => c.id), ['wren', 'basil', 'juniper']);
});
test('unknown world', () => assert.throws(() => defineCase(copy({ world: 'moon' })), /case mini-case: world: must be one of grove, tower/));
test('cast is three unique lowercase ids', () => {
  assert.throws(() => defineCase(edit(d => { d.characters.pop(); })), /characters: must hold exactly 3 characters/);
  assert.throws(() => defineCase(edit(d => { d.characters[1].id = 'momo'; })), /characters\[1\]\.id: duplicate character id momo/);
  assert.throws(() => defineCase(edit(d => { d.characters[0].id = 'Momo'; })), /characters\[0\]\.id: must match/);
});
test('knowledge, culprits and findings follow the cast', () => {
  const missing = towerCase(); delete missing.knowledge.juniper;
  assert.throws(() => defineCase(missing), /knowledge\.juniper/);
  const extra = towerCase(); extra.knowledge.momo = ['x'];
  assert.throws(() => defineCase(extra), /knowledge\.momo: not a character/);
  assert.throws(() => defineCase({ ...towerCase(), answer: { culprits: ['momo'], feedback: { correct: 'c', other: 'o' } } }), /answer\.culprits/);
  const finding = towerCase(); finding.debrief.findings[0].character = 'pip';
  assert.throws(() => defineCase(finding), /debrief\.findings\[0\]\.character/);
});
test('grove hashes are unchanged', () => {
  assert.equal(bananaMystery.contentHash, '2da1093c9eb3');
  assert.equal(bananaControl.contentHash, 'd1f7d8558985');
});
test('publicView shows the world without the persona', () => {
  assert.deepEqual(publicView(defineCase(towerCase())).world, tower);
  assert.deepEqual(publicView(bananaMystery).world, grove);
});
test('a defined case can be defined again, its world object resolves by id', () => {
  const k = defineCase(towerCase());
  const again = defineCase({ ...k, rehearsal: k.rehearsal });
  assert.equal(again.world.id, 'tower');
  assert.equal(defineCase({ ...copy(), world: { id: 'grove' } }).world.persona, 'monkey');
  assert.throws(() => defineCase({ ...copy(), world: { id: 'moon' } }), /world: must be one of/);
  assert.equal('persona' in publicView(again).world, false);
});
