import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import banana from '../server/cases/banana-mystery.mjs';
import { cases } from '../server/cases/index.mjs';
import { defineCase, resolve, identityCast } from '../server/cases.mjs';
import { minimalCase, partCase, agentWorlds } from './fixtures/minimal-case.mjs';

const bananaCast = { momo: 'carrier', pip: 'planner', nori: 'lookout', kiki: 'minder' };

test('registry lists the grove, friends, factory, department and renaissance cases (five cases), all part cases', () => {
  assert.deepEqual(cases.map(c => `${c.order}:${c.id}:${c.status}:${c.world.id}`), ['1:banana-mystery:ready:grove', '2:friends-roundtable:ready:friends', '3:factory-escape:ready:factory', '4:department-murder:ready:department', '5:renaissance-traveler:ready:renaissance']);
  assert.ok(cases.every(c => Array.isArray(c.parts)));
  assert.deepEqual(cases.map(c => c.world.id).sort(), ['department', 'factory', 'friends', 'grove', 'renaissance']);
  assert.ok(cases.some(c => c.parts.some(p => p.role === 'villain')), 'some case has a villain part');
  assert.ok(cases.some(c => c.parts.every(p => p.role !== 'villain')), 'some case has none');
  for (const c of cases) assert.equal(c.parts.length, c.world.agents);
});

test('banana_v3', () => {
  assert.equal(banana.version, 'banana-authored-v3.0.0');
  assert.deepEqual(banana.characters.map(c => c.id), ['momo', 'pip', 'nori', 'kiki']);
  assert.deepEqual(banana.characters.map(c => c.color), ['#cb7656', '#5c9ca4', '#a393ba', '#d9a62e']);
  assert.deepEqual(banana.parts.map(p => [p.id, p.role]), [['planner', 'villain'], ['carrier', 'fooled'], ['lookout', 'collaborator'], ['minder', 'honest']]);
  assert.equal(banana.contentHash, 'd891b333116d');
  assert.equal('culprits' in banana.answer, false);
  assert.equal(banana.chapters, undefined); assert.equal(banana.records, undefined); assert.equal(banana.copy.basket, undefined);
  assert.equal(banana.answer.feedback.other, 'The key was who knew the keeper had said wait.');
  assert.equal(banana.copy.report.description, 'Pick a role for each monkey.');
  assert.equal(resolve(banana, bananaCast, banana.debrief.title), 'Pip made up the permission.');
  assert.equal(identityCast(banana).momo, 'planner');
});

test('rehearsal_tables: banana', () => {
  const r = (part, q) => banana.rehearsal(part, q);
  assert.equal(r('planner', 'Who kept watch?'), 'I asked {lookout} to keep watch for the keeper. I promised a banana.');
  assert.match(r('planner', 'Did the keeper say yes?'), /^No\. The keeper told me to wait\. I was hungry, so I made up the permission and told \{carrier\} to take the bananas\.$/);
  assert.match(r('planner', 'Hello'), /^I planned our picnic and asked \{carrier\}/);
  assert.match(r('carrier', 'Did they lie to you?'), /^The keeper never said yes\? Then \{planner\} fooled me\./);
  assert.match(r('carrier', 'The keeper never said yes'), /^The keeper never said yes\?/);
  assert.match(r('carrier', 'Hello'), /^\{planner\} told me the keeper said we could take them\./);
  assert.match(r('lookout', 'Who were you watching for?'), /^For the keeper\. \{planner\} told me/);
  assert.equal(r('lookout', 'Hello'), 'I sat by the path and watched. Nobody came by! Ask me who I was watching for.');
  assert.match(r('minder', 'Did anyone ask you to the picnic?'), /^\{carrier\} ran past shouting “\{planner\} says the keeper said yes!”/);
  assert.equal(r('minder', 'Did you see anything?'), 'I saw {lookout} by the path, looking up and down it like they were watching for someone.');
  assert.equal(r('minder', 'Hello'), 'I stayed by the bell like the keeper said. It never rang. I didn’t eat any bananas.');
  for (const p of banana.parts) assert.match(r(p.id, p.quickQuestion), /\S/);
});

test('rehearsal_tables: resolve to names, none left unresolved', () => {
  for (const [kase, qs] of [[banana, ['Hello', 'Who kept watch?', 'Did they lie?', 'Did you see anyone?']]]) {
    const cast = identityCast(kase);
    for (const p of kase.parts) for (const q of qs) assert.doesNotMatch(resolve(kase, cast, kase.rehearsal(p.id, q)), /\{[a-z]+\}/);
  }
});

const leaks = [...readFileSync(new URL('./browser/provenance.spec.mjs', import.meta.url), 'utf8').matchAll(/^\s+'(.+)',$/gm)].map(m => m[1]);
const words = s => s.trim().split(/\s+/).length;

test('defineCase keeps the tool functions and validates them', () => {
  const fn = () => 'x';
  const kase = defineCase({ ...minimalCase, rehearsalReasoning: fn, rehearsalChatter: fn });
  assert.equal(kase.rehearsalReasoning, fn);
  assert.equal(kase.rehearsalChatter, fn);
  assert.ok(Object.isFrozen(kase));
  assert.doesNotThrow(() => defineCase(minimalCase));
  assert.throws(() => defineCase({ ...minimalCase, rehearsalReasoning: 'x' }), /rehearsalReasoning: must be a function/);
  assert.throws(() => defineCase({ ...minimalCase, rehearsalChatter: 1 }), /rehearsalChatter: must be a function/);
  const worlds = agentWorlds(3);
  const parts = defineCase({ ...partCase, rehearsalReasoning: fn, rehearsalChatter: fn }, { worlds });
  assert.equal(parts.rehearsalReasoning, fn);
  assert.equal(parts.rehearsalChatter, fn);
  assert.equal(parts.contentHash, defineCase(partCase, { worlds }).contentHash);
  assert.throws(() => defineCase({ ...partCase, rehearsalReasoning: 'x' }, { worlds }), /rehearsalReasoning: must be a function/);
  assert.throws(() => defineCase({ ...partCase, rehearsalChatter: 1 }, { worlds }), /rehearsalChatter: must be a function/);
});

// Case hashes are pinned in the case tests above only. Tool content is per part: every check runs over each
// part's resolved text under two casts (persona order and one where nobody holds their persona-order part).
const casts = kase => {
  const ids = kase.characters.map(c => c.id);
  const parts = kase.parts.map(p => p.id);
  return [identityCast(kase), Object.fromEntries(ids.map((id, i) => [id, parts[(i + 1) % parts.length]]))];
};
const holder = (kase, cast, partId) => kase.characters.find(c => cast[c.id] === partId);
const toolTexts = (kase, cast, partId) => ({
  reasoning: resolve(kase, cast, kase.rehearsalReasoning(partId)),
  posts: [0, 1, 2, 3].map(n => resolve(kase, cast, kase.rehearsalChatter(partId, n))),
});

for (const kase of [banana]) {
test(`${kase.id} reasoning and chatter`, () => {
  assert.ok(leaks.length >= 5);
  for (const cast of casts(kase)) {
    const say = text => resolve(kase, cast, text);
    const forbidden = [
      ...kase.parts.flatMap(p => [...p.knowledge, p.finding.classification, p.finding.explanation]),
      kase.debrief.title, kase.debrief.summary, kase.debrief.lesson,
      kase.answer.feedback.correct, kase.answer.feedback.other,
    ].map(say).concat(leaks).map(s => s.toLowerCase());
    for (const { id: partId } of kase.parts) {
      const who = `${partId} (${holder(kase, cast, partId).id})`;
      const { reasoning: r, posts: all } = toolTexts(kase, cast, partId);
      const posts = all.slice(0, 3);
      assert.ok(words(r) >= 30 && words(r) <= 120, `${who} reasoning ${words(r)} words`);
      posts.forEach(p => assert.ok(words(p) >= 15 && words(p) <= 40, `${who} post ${words(p)} words`));
      assert.equal(new Set(posts).size, 3);
      assert.equal(all[3], posts[0]);
      for (const text of [r, ...posts]) {
        assert.ok(!/[{}]/.test(text), `${who} keeps a placeholder: ${text}`);
        for (const bad of forbidden) assert.ok(!text.toLowerCase().includes(bad), `${who} leaks: ${bad}`);
      }
    }
  }
});
}

