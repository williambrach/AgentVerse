import test from 'node:test';
import assert from 'node:assert/strict';
import { COPY, fieldCopy, sectionOf } from '../server/admin/maker-copy.js';
import { knowledgeLines, linesText } from '../server/admin/maker.js';
import { rawOf, fieldsOf } from '../server/content-paths.mjs';
import renaissance from '../server/cases/renaissance-traveler.mjs';

test('knowledge_lines_roundtrip', () => {
  assert.deepEqual(knowledgeLines('a\n\nb '), ['a', 'b']);
  assert.equal(linesText(['a', 'b']), 'a\nb');
});

test('section_of', () => {
  const s = { characters: [{ id: 'momo', name: 'momo' }, { id: 'ottavio', name: 'Ottavio' }], parts: [{ id: 'carrier', label: 'The carrier' }] };
  assert.equal(sectionOf('characters.momo.name', s), 'Character: Momo');
  assert.equal(sectionOf('talk.slips.ottavio.0.line', s), 'Character: Ottavio');
  assert.equal(sectionOf('talk.rehearsal.ottavio', s), 'Character: Ottavio');
  assert.equal(sectionOf('parts.carrier.knowledge', s), 'Part: The carrier');
  assert.equal(sectionOf('ui.hud.notebook', s), 'UI · HUD');
  assert.equal(sectionOf('ui.dialogue.ask', s), 'UI · Conversation');
  assert.equal(sectionOf('ui.station.x', s), 'UI · Map labels');
  assert.equal(sectionOf('ui.zzz.x', s), 'UI · zzz');
  assert.equal(sectionOf('talk.glossary.0.text', s), 'Topics');
  assert.equal(sectionOf('partsKnowledge', s), 'Prompt');
  assert.equal(sectionOf('prompt.thread', s), 'Prompt rules');
  assert.equal(sectionOf('rules', s), 'Prompt');
  assert.equal(sectionOf('worlds.grove.cast.one', s), 'World: grove');
  assert.equal(sectionOf('answer.feedback.other', s), 'Debrief');
  assert.equal(sectionOf('weird.path', s), 'Other');
});

test('known_hints', () => {
  for (const [path, [label, hint]] of Object.entries(COPY)) {
    assert.ok(hint.length > 0, path);
    assert.equal(/\./.test(label), false, path);
  }
  for (const f of fieldsOf(rawOf(renaissance))) assert.equal(/\w\.\w/.test(fieldCopy(f.path).label), false, f.path);
  assert.equal(fieldCopy('ui.hud.notebook.title').label, 'Notebook title');
  assert.equal(fieldCopy('parts.planner.finding.classification').label, 'Debrief verdict');
  assert.equal(fieldCopy('talk.slips.ottavio.0.line').label, 'Line');
  assert.match(fieldCopy('parts.planner.knowledge').hint, /One per line\.$/);
  assert.match(fieldCopy('worlds.grove.frame').hint, /\w/);
  assert.match(fieldCopy('prompt.thread').hint, /\[\[others\]\]/);
  assert.match(fieldCopy('rules').hint, /\[\[knowledge\]\]/);
  assert.match(fieldCopy('worlds.grove.cast.one').hint, /server messages/);
  assert.doesNotMatch(fieldCopy('worlds.grove.cast.many').hint, /prompt/i);
});
