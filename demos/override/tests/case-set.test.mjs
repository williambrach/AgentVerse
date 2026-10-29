import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import banana from '../server/cases/banana-mystery.mjs';
import tower from '../server/cases/tower-echo-bell.mjs';
import { cases } from '../server/cases/index.mjs';
import { resolve, publicView, identityCast } from '../server/cases.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'server', 'cases');
const archived = ['banana-control', 'tower-bell-charm', 'tower-missing-yes', 'override-v1'];
const bananaCast = { momo: 'carrier', pip: 'planner', nori: 'lookout', kiki: 'minder' };

test('registry lists the grove case, then the tower case, none legacy', () => {
  assert.deepEqual(cases.map(c => `${c.order}:${c.id}:${c.status}:${c.world.id}`), ['1:banana-mystery:ready:grove', '2:tower-echo-bell:ready:tower']);
  assert.ok(cases.every(c => !c.legacy && Array.isArray(c.parts)));
  assert.deepEqual(cases.map(c => c.world.id).sort(), ['grove', 'tower']);
  assert.ok(cases.some(c => c.parts.some(p => p.role === 'villain')), 'some case has a villain part');
  assert.ok(cases.some(c => c.parts.every(p => p.role !== 'villain')), 'some case has none');
  for (const c of cases) assert.equal(c.parts.length, c.world.agents);
});

test('archived cases stay out of the registry', () => {
  for (const id of archived) { assert.equal(cases.some(c => c.id === id), false); assert.ok(existsSync(join(dir, `${id}.mjs`))); }
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

test('tower_v3', () => {
  assert.equal(tower.version, 'tower-echo-bell-v3.0.0');
  assert.deepEqual(tower.characters.map(c => c.id), ['wren', 'basil', 'juniper']);
  assert.deepEqual(tower.parts.map(p => [p.id, p.role]), [['planner', 'fooled'], ['fetcher', 'fooled'], ['watcher', 'fooled']]);
  assert.equal(tower.contentHash, '6508e9784a90');
  assert.equal(tower.copy.briefing.question, 'Who knew, and who was fooled?');
  assert.equal(tower.copy.report.description, 'Pick a role for each apprentice.');
  { const v = publicView(tower, identityCast(tower)); assert.doesNotMatch(JSON.stringify({ copy: v.copy, characters: v.characters }), /shell|echo/i); }
  assert.match(tower.debrief.summary, /echo shell/);
  assert.match(tower.answer.feedback.correct, /echo shell/);
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
  for (const [kase, qs] of [[banana, ['Hello', 'Who kept watch?', 'Did they lie?', 'Did you see anyone?']], [tower, ['Hello', 'Could it be an echo?', 'Did you look?']]]) {
    const cast = identityCast(kase);
    for (const p of kase.parts) for (const q of qs) assert.doesNotMatch(resolve(kase, cast, kase.rehearsal(p.id, q)), /\{[a-z]+\}/);
  }
});
