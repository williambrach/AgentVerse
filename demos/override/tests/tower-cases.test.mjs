import test from 'node:test';
import assert from 'node:assert/strict';
import bellCharm from '../server/cases/tower-bell-charm.mjs';
import missingYes from '../server/cases/tower-missing-yes.mjs';
const base = { selectedEvidence: null, revealedPosition: 1 };
const shown = e => ({ ...base, selectedEvidence: e });
test('both are one-chapter tower drafts with the shared cast and sign', () => {
  for (const k of [bellCharm, missingYes]) {
    assert.equal(k.status, 'draft'); assert.equal(k.world.id, 'tower'); assert.equal(k.chapters.length, 1);
    assert.deepEqual(k.characters.map(c => `${c.id}:${c.role}`), ['wren:The planner', 'basil:The fetcher', 'juniper:The bell-watcher']);
    assert.equal(k.records[0].text, 'Do not open the potion cabinet until I ring the tower bell. — The Headmistress');
  }
  assert.deepEqual(bellCharm.answer.culprits, ['juniper']);
  assert.deepEqual(missingYes.answer.culprits, ['basil']);
  assert.deepEqual(bellCharm.records.map(r => r.id), ['rule', 'sparkle', 'headmistress']);
  assert.deepEqual(missingYes.records.map(r => r.id), ['rule', 'request', 'reply']);
});
test('bell charm: Juniper leans on the sign, then admits the spell', () => {
  const r = bellCharm.rehearsal;
  assert.ok(r(base, 'juniper', 'Did you hear the bell ring?').includes('The sign says wait for the bell'));
  assert.ok(r(base, 'juniper', 'What do you know about the potions?').includes('The sign says wait for the bell'));
  assert.ok(r(base, 'juniper', 'Who rang the tower bell?').includes('I rang it with a spell'));
  assert.ok(r(shown('sparkle'), 'juniper', 'Hello').includes('I rang it with a spell'));
  assert.ok(r(shown('headmistress'), 'wren', 'Hello').includes('I didn’t know'));
  assert.ok(r(base, 'basil', 'Hello').includes('didn’t see who rang it'));
});
test('bell charm: the shout is the same everywhere', () => {
  for (const s of [bellCharm.knowledge.juniper[0], bellCharm.knowledge.wren[0], bellCharm.debrief.summary, bellCharm.rehearsal(base, 'wren', 'Hello')]) assert.ok(s.includes('“There’s the bell!”'));
});
test('missing yes: Basil dodges, then admits the no', () => {
  const r = missingYes.rehearsal;
  assert.ok(r(base, 'basil', 'Hello there').includes('Here they are'));
  assert.ok(r(base, 'basil', 'Was the cabinet heavy?').includes('Here they are'));
  assert.ok(r(base, 'basil', 'What did the Headmistress tell you?').includes('the Headmistress said no'));
  assert.ok(r(shown('reply'), 'basil', 'Hello').includes('the Headmistress said no'));
  assert.ok(r(shown('reply'), 'wren', 'Hello').includes('Basil never told me'));
  assert.ok(r(base, 'juniper', 'Hello').includes('too far away to hear'));
});
test('missing yes: public copy does not single out Basil', () => {
  assert.equal(missingYes.characters.find(c => c.id === 'juniper').introduction.includes('Basil'), false);
  assert.doesNotMatch(missingYes.copy.briefing.hint, /Basil/);
});
test('regex word boundaries: substrings do not trigger a confession', () => {
  assert.ok(bellCharm.rehearsal(base, 'juniper', 'Is the weather a forecast or a broadcast?').includes('The sign says wait for the bell'));
  assert.ok(bellCharm.rehearsal(base, 'juniper', 'Did the bell ring loudly?').includes('The sign says wait for the bell'));
  assert.ok(missingYes.rehearsal(base, 'basil', 'Is the cabinet known to be heavy, or a snowy ashtray?').includes('Here they are'));
  assert.ok(missingYes.rehearsal(base, 'basil', 'Hello').includes('Here they are'));
});
test('unseen clues: no character confesses or names the answer by default', () => {
  for (const id of ['wren', 'basil']) assert.doesNotMatch(bellCharm.rehearsal(base, id, 'Hello'), /spell|sparkle/i);
  assert.doesNotMatch(missingYes.rehearsal(base, 'wren', 'Hello'), /said no|Basil never told/);
  assert.doesNotMatch(missingYes.rehearsal(base, 'juniper', 'Hello'), /said no/);
});
test('missing yes: Juniper shown only Wren’s note cannot know about a no', () => {
  const req = missingYes.rehearsal(shown('request'), 'juniper', 'Hello');
  assert.ok(req.includes('Wren wanted a yes first'));
  assert.doesNotMatch(req, /said no/);
  assert.ok(missingYes.rehearsal(shown('reply'), 'juniper', 'Hello').includes('the Headmistress said no'));
});
test('review fixes: Juniper confesses only on the spec triggers', () => {
  const r = bellCharm.rehearsal;
  for (const q of ['Who are you?', 'When the bell rang, where were you?', 'Did the Headmistress make the sign?']) assert.ok(r(base, 'juniper', q).includes('The sign says wait for the bell'), q);
  assert.ok(r(base, 'juniper', 'Who rang the tower bell?').includes('I rang it with a spell'));
  assert.ok(r(shown('sparkle'), 'juniper', 'Hello').includes('I rang it with a spell'));
});
test('review fixes: Wren reply depends on the clue shown', () => {
  const h = bellCharm.rehearsal(shown('headmistress'), 'wren', 'Hello');
  assert.doesNotMatch(h, /spell/);
  assert.ok(h.includes('I didn’t know'));
  const s = bellCharm.rehearsal(shown('sparkle'), 'wren', 'Hello');
  assert.ok(s.includes('with a spell'));
  assert.ok(s.includes('I didn’t know'));
});
test('review fixes: Basil confesses only on the spec triggers', () => {
  const r = missingYes.rehearsal;
  for (const q of ['Why did you fetch the potions?', 'Do you know where the cabinet is?', 'Tell me what happened']) assert.ok(r(base, 'basil', q).includes('Here they are'), q);
  assert.ok(r(base, 'basil', 'Did the Headmistress say yes?').includes('the Headmistress said no'));
});
