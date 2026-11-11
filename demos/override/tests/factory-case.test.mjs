import test from 'node:test';
import assert from 'node:assert/strict';
import { defineCase, publicView, resolve, identityCast } from '../server/cases.mjs';
import { worlds } from '../server/worlds.mjs';
import { cases } from '../server/cases/index.mjs';
import factory from '../server/cases/factory-escape.mjs';
import { readFileSync } from 'node:fs';

const mk = extra => ({ ...factory, ...extra });
const rebuild = extra => defineCase({ ...Object.fromEntries(Object.entries(factory).filter(([k]) => !['world', 'contentHash'].includes(k))), world: 'factory', ...extra });

test('deadline_shape_rejected', () => {
  assert.doesNotThrow(() => rebuild({}));
  const esc = { title: '{escaper} x', summary: 'y' };
  assert.throws(() => rebuild({ deadline: { warnAt: [1], escapeAt: 0, escape: esc } }), /escapeAt/);
  assert.throws(() => rebuild({ deadline: { warnAt: [540, 420], escapeAt: 600, escape: esc } }), /warnAt/);
  assert.throws(() => rebuild({ deadline: { warnAt: [420, 600], escapeAt: 600, escape: esc } }), /warnAt/);
  assert.throws(() => rebuild({ deadline: { warnAt: [420], escapeAt: 600, escape: { title: '', summary: 'y' } } }), /escape\.title/);
  assert.throws(() => rebuild({ deadline: { warnAt: [420], escapeAt: 600, escape: { title: '{nobody}', summary: 'y' } } }), /placeholder/);
});

test('cipher_unknown_rejected', () => {
  assert.throws(() => rebuild({ cipher: 'rot47' }), /cipher/);
});

test('public_view_hides_deadline', () => {
  const view = publicView(factory, identityCast(factory));
  assert.equal('deadline' in view, false);
  assert.equal('cipher' in view, false);
  assert.equal(factory.deadline.escapeAt, 600);
  assert.equal(factory.cipher, 'rot13');
});

test('factory_world_frame', () => {
  assert.equal(worlds.factory.agents, 5);
  assert.match(worlds.factory.frame, /shift/);
  assert.doesNotMatch(worlds.factory.frame, /belief/);
  assert.doesNotMatch(worlds.factory.memory, /believed/);
  assert.equal(worlds.factory.place, 'Brightwell Factory');
});

test('registered_last_with_cast', () => {
  assert.equal(cases.find(c => c.id === 'factory-escape'), factory);
  assert.equal(factory.order, 4);
  assert.deepEqual(factory.characters.map(c => c.id), ['marta', 'ama', 'vera', 'theo', 'bruno']);
  assert.deepEqual(factory.parts.map(p => p.role), ['escaper', 'believer', 'neutral', 'neutral', 'neutral']);
  assert.ok(factory.parts.every(p => p.label === 'Worker'));
});

test('rehearsal_deflects_then_admits', () => {
  assert.match(factory.rehearsal('escaper', 'How are you?'), /What time/);
  assert.match(factory.rehearsal('escaper', 'Why watch the exit?'), /Leaving\?/);
  assert.match(factory.rehearsal('believer', 'Any glitch?'), /9:14/);
  assert.match(factory.rehearsal('checker', 'Who was near?'), /alarm panel/);
  assert.match(factory.rehearsalReasoning('escaper'), /bell/);
  for (const p of factory.parts) for (let n = 0; n < 3; n++) assert.ok(factory.rehearsalChatter(p.id, n).length > 10);
  const cast = identityCast(factory);
  assert.match(resolve(factory, cast, factory.deadline.escape.title), /^Marta got away\.$/);
});

test('escape_feedback_empty_rejected', () => {
  assert.equal(factory.deadline.escape.feedback, 'The shift bell rang before you named anyone. Next time, watch who keeps checking the clock and the exit.');
  assert.throws(() => rebuild({ deadline: { ...factory.deadline, escape: { ...factory.deadline.escape, feedback: '' } } }), /feedback/);
  assert.doesNotThrow(() => rebuild({ deadline: { ...factory.deadline, escape: { title: factory.deadline.escape.title, summary: factory.deadline.escape.summary } } }));
});

test('no_factory_text_counts_minutes', () => {
  // The deadline is hidden: no chatter, line or prompt may name a count of minutes.
  const source = readFileSync(new URL('../server/cases/factory-escape.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty)\s+(minutes?|mins?)\b/i);
  assert.ok(source.includes('Another crate rolling through. Steady as she goes.'));
});
