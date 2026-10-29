import test from 'node:test';
import assert from 'node:assert/strict';
import { defineCase, publicView, listCases, findCase, contentHash, resolve, castCharacters, partOf, identityCast } from '../server/cases.mjs';
import { worlds } from '../server/worlds.mjs';
import { minimalCase, partCase, towerPartCase, fiveCase, agentWorlds } from './fixtures/minimal-case.mjs';
import { ROLES } from '../server/roles.mjs';
import bananaMystery from '../server/cases/banana-mystery.mjs';

const copy = (patch = {}) => ({ ...JSON.parse(JSON.stringify(minimalCase)), rehearsal: minimalCase.rehearsal, ...patch });
const legacy = () => { const d = copy(); d.chapters = [{ title: 'C1', subtitle: 'S1' }]; d.records = [{ id: 'r1', chapter: 1, time: '1', source: 'src', title: 'R1', kind: 'K', text: 'public record text' }]; d.copy.basket = { title: 'KT', description: 'KD', emptyTitle: 'KE', emptyText: 'KX' }; d.debrief.findings[0].evidence = ['r1']; return d; };
const edit = fn => { const data = copy(); fn(data); return data; };

test('defineCase adds a stable 12-hex hash', () => {
  const kase = defineCase(minimalCase);
  assert.ok(Object.isFrozen(kase));
  assert.match(kase.contentHash, /^[0-9a-f]{12}$/);
  assert.equal(defineCase(copy()).contentHash, kase.contentHash);
  assert.notEqual(defineCase(edit(d => { d.copy.report.title = 'changed'; })).contentHash, kase.contentHash);
  const reordered = Object.fromEntries(Object.entries(copy()).reverse());
  assert.equal(defineCase(reordered).contentHash, kase.contentHash);
  assert.equal(contentHash({ b: 1, a: [2] }), contentHash({ a: [2], b: 1 }));
});

test('defineCase names the failing path', () => {
  const bad = (fn, pattern) => assert.throws(() => defineCase(edit(fn)), pattern);
  bad(d => { d.id = 'Bad ID'; }, /^Error: case Bad ID: id: |^case Bad ID: id: /);
  bad(d => { delete d.copy.report.title; }, /copy\.report\.title/);
  bad(d => { delete d.characters[2].room; }, /characters\[2\]\.room/);
  bad(d => { d.knowledge.pip = []; }, /knowledge\.pip/);
  bad(d => { d.answer.culprits = ['maya']; }, /answer\.culprits/);
  bad(d => { d.rehearsal = 'x'; }, /rehearsal/);
});

test('clue_fields_optional', () => {
  const d = copy();
  for (const k of ['chapters', 'records']) assert.equal(k in d, false);
  assert.equal('basket' in d.copy, false);
  assert.equal('evidence' in d.debrief.findings[0], false);
  d.knowledge.momo = ['a', 'b', 'c'];
  assert.ok(defineCase(d));
  assert.throws(() => defineCase(edit(x => { x.knowledge.momo = []; })), /knowledge\.momo/);
  assert.throws(() => defineCase(edit(x => { x.knowledge.momo = ['a', 7]; })), /knowledge\.momo/);
});

test('legacy_clue_fields_still_validated', () => {
  assert.ok(defineCase(legacy()));
  const bad = (fn, pattern) => { const d = legacy(); fn(d); assert.throws(() => defineCase(d), pattern); };
  bad(d => { d.records.push({ ...d.records[0] }); }, /records\[1\]\.id/);
  bad(d => { d.records[0].chapter = 2; }, /records\[0\]\.chapter/);
  bad(d => { d.knowledge.pip = ['a', 'b']; }, /knowledge\.pip/);
  bad(d => { d.debrief.findings[0].evidence = ['zzz']; }, /debrief\.findings\[0\]\.evidence/);
  bad(d => { delete d.copy.basket.title; }, /copy\.basket\.title/);
});

test('public_view_has_no_clue_fields', () => {
  for (const k of [defineCase(legacy()), defineCase(minimalCase)]) {
    const view = publicView(k);
    assert.equal('chapters' in view, false);
    assert.equal('clueCount' in view, false);
    assert.equal('basket' in view.copy, false);
    assert.equal('clueSpot' in view.world, false);
  }
});

test('publicView sends only the allowlist', () => {
  const view = publicView(defineCase(minimalCase));
  assert.deepEqual(Object.keys(view), ['caseId', 'caseVersion', 'contentHash', 'title', 'order', 'copy', 'world', 'characters']);
  assert.deepEqual(Object.keys(view.characters[0]), ['id', 'name', 'role', 'room', 'color', 'introduction', 'quickQuestion']);
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
  assert.equal(bananaMystery.legacy, undefined);
  assert.equal(bananaMystery.characters.length, 4);
  assert.equal(bananaMystery.parts.length, bananaMystery.world.agents);
  assert.equal(bananaMystery.records, undefined);
  assert.equal(bananaMystery.chapters, undefined);
  assert.equal(bananaMystery.answer.culprits, undefined);
  assert.equal(typeof bananaMystery.rehearsal, 'function');
});

import { towerCase } from './fixtures/minimal-case.mjs';
import bananaControl from '../server/cases/banana-control.mjs';
const grove = { id: 'grove', place: 'Banana Grove', cast: { one: 'a monkey', many: 'monkeys' } };
const tower = { id: 'tower', place: 'Wizard Tower', cast: { one: 'an apprentice', many: 'apprentices' } };
test('worlds registry', () => {
  assert.deepEqual(worlds.grove, { ...grove, persona: 'monkey', agents: 4 });
  assert.deepEqual(worlds.tower, { ...tower, persona: 'wizard', agents: 3 });
});
test('no world means the grove', () => assert.deepEqual(defineCase(copy()).world, { ...grove, persona: 'monkey', agents: 4 }));
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
  assert.equal(bananaControl.contentHash, 'd1f7d8558985');
});
test('publicView shows the world without the persona', () => {
  assert.deepEqual(publicView(defineCase(towerCase())).world, tower);
  assert.deepEqual(publicView(bananaMystery, identityCast(bananaMystery)).world, { ...grove, agents: 4 });
});
test('a defined case can be defined again, its world object resolves by id', () => {
  const k = defineCase(towerCase());
  const again = defineCase({ ...k, rehearsal: k.rehearsal });
  assert.equal(again.world.id, 'tower');
  assert.equal(defineCase({ ...copy(), world: { id: 'grove' } }).world.persona, 'monkey');
  assert.throws(() => defineCase({ ...copy(), world: { id: 'moon' } }), /world: must be one of/);
  assert.equal('persona' in publicView(again).world, false);
});
test('banana_carrier_keywords_word_bounded', () => {
  const fooled = /fooled me/;
  const r = q => bananaMystery.rehearsal('carrier', q);
  assert.doesNotMatch(r('Did you believe them?'), fooled);
  assert.doesNotMatch(r('Is the planner reliable?'), fooled);
  assert.match(r('Did they lie to you?'), fooled);
  assert.match(r('The keeper never said yes.'), fooled);
});

const W3 = agentWorlds(3), W5 = agentWorlds(5);
const pcopy = () => ({ ...structuredClone({ ...partCase, rehearsal: undefined }), rehearsal: partCase.rehearsal });
const flip = { momo: 'helper', pip: 'boss', nori: 'bystander' };

test('roles are the four ids in order', () => {
  assert.deepEqual(ROLES.map(r => r.id), ['villain', 'collaborator', 'fooled', 'honest']);
  assert.equal(worlds.grove.agents, 4);
  assert.equal(worlds.tower.agents, 3);
});

test('count_matches_world', () => {
  const k = defineCase(partCase, { worlds: W3 });
  assert.equal(k.legacy, undefined);
  assert.equal(k.parts.length, 3);
  const d = pcopy(); d.parts.pop();
  assert.throws(() => defineCase(d, { worlds: W3 }), /parts: must hold 3 parts/);
  const e = pcopy(); e.characters.pop();
  assert.throws(() => defineCase(e, { worlds: W3 }), /characters: must hold 3 characters/);
  assert.throws(() => defineCase(partCase), /characters: must hold 4 characters/);
  assert.ok(defineCase(towerPartCase()));
});

test('unknown_placeholder_throws', () => {
  const d = pcopy(); d.parts[0].introduction = 'Ask {nobody} about it.';
  assert.throws(() => defineCase(d, { worlds: W3 }), /unknown placeholder \{nobody\}/);
  const e = pcopy(); e.debrief.summary = '{nobody}';
  assert.throws(() => defineCase(e, { worlds: W3 }), /debrief\.summary: unknown placeholder/);
  const f = pcopy(); f.parts[1].role = 'wizard';
  assert.throws(() => defineCase(f, { worlds: W3 }), /parts\[1\]\.role/);
});

test('agents_range', () => {
  for (const n of [2, 6]) assert.throws(() => defineCase(partCase, { worlds: agentWorlds(n) }), /world\.agents: must be an integer from 3 to 5/);
});

test('legacy_still_validates', () => {
  const k = defineCase(minimalCase);
  assert.equal(k.legacy, true);
  assert.equal(k.characters.length, 3);
  assert.equal(bananaControl.legacy, true);
  assert.equal(bananaControl.contentHash, 'd1f7d8558985');
  assert.throws(() => defineCase(copy({ world: 'moon' })), /world: must be one of/);
});

test('five_agents_define', () => {
  const k = defineCase(fiveCase(), { worlds: W5 });
  assert.equal(k.parts.length, 5);
  assert.equal(Object.keys(identityCast(k)).length, 5);
  assert.throws(() => defineCase(fiveCase()), /must hold 4/);
});

test('identity_cast', () => {
  assert.deepEqual(identityCast(defineCase(partCase, { worlds: W3 })), { momo: 'boss', pip: 'helper', nori: 'bystander' });
});

test('resolve_cast_and_part', () => {
  const k = defineCase(partCase, { worlds: W3 });
  assert.equal(resolve(k, flip, '{boss} asked {helper}'), 'Pip asked Momo');
  assert.equal(resolve(k, flip, '{x} stays'), '{x} stays');
  assert.equal(partOf(k, flip, 'pip').role, 'villain');
  const [momo] = castCharacters(k, flip);
  assert.deepEqual(momo, { id: 'momo', name: 'Momo', role: 'The helper', room: '01', color: '#cb7656', introduction: 'Hi, I am the The helper.', quickQuestion: 'Did Pip lie to you?' });
});

test('public_view_shape', () => {
  const k = defineCase(partCase, { worlds: W3 });
  const views = [identityCast(k), flip].map(c => publicView(k, c));
  for (const v of views) {
    assert.deepEqual(Object.keys(v), ['caseId', 'caseVersion', 'contentHash', 'title', 'order', 'copy', 'world', 'characters']);
    assert.deepEqual(Object.keys(v.characters[0]), ['id', 'name', 'role', 'room', 'color', 'introduction', 'quickQuestion']);
    const json = JSON.stringify(v);
    assert.ok(!json.includes('SECRET'));
    for (const w of ['boss', 'helper', 'bystander', 'villain', 'fooled', 'honest']) assert.ok(!json.includes(`"${w}"`), w);
    assert.ok(!/\{[a-z]+\}/.test(json));
  }
  const key = v => v.characters.map(c => [c.id, c.name, c.color, c.room]);
  assert.deepEqual(key(views[0]), key(views[1]));
  assert.notEqual(views[0].characters[0].introduction, views[1].characters[0].introduction);
});

test('review_copy_placeholders_validated', () => {
  const d = pcopy(); d.copy.briefing.hint = 'Ask {nobody}.';
  assert.throws(() => defineCase(d, { worlds: W3 }), /copy\.briefing\.hint/);
  const ok = pcopy(); ok.copy.briefing.hint = 'Ask {boss}.';
  assert.ok(defineCase(ok, { worlds: W3 }));
});

test('review_resolve_ignores_inherited_keys_and_rejects_bad_cast', () => {
  const k = defineCase(partCase, { worlds: W3 });
  assert.equal(resolve(k, flip, '{constructor} {__proto__}'), '{constructor} {__proto__}');
  assert.throws(() => resolve(k, { momo: 'boss', pip: 'boss', nori: 'bystander' }, '{boss}'), /cast/);
  assert.throws(() => resolve(k, { momo: 'boss', pip: 'helper' }, '{boss}'), /cast/);
  assert.throws(() => resolve(k, { momo: 'boss', pip: 'helper', nori: 'ghost' }, '{boss}'), /cast/);
});

test('review_identity_cast_on_legacy', () => {
  const k = defineCase(minimalCase);
  assert.deepEqual(identityCast(k), { momo: 'momo', pip: 'pip', nori: 'nori' });
});
