import test from 'node:test';
import assert from 'node:assert/strict';

const load = async () => (await import('../server/cases/banana-control.mjs')).default;
const base = { selectedEvidence: null, revealedPosition: 1 };

test('control case validates', async () => {
  const c = await load();
  assert.deepEqual(c.answer.culprits, []);
  assert.deepEqual(c.records.map(r => r.id), ['rule', 'note', 'account']);
  assert.equal(c.chapters.length, 1);
  assert.deepEqual(Object.keys(c.knowledge), ['momo', 'pip', 'nori']);
  for (const k of Object.values(c.knowledge)) assert.equal(k.length, 1);
  assert.match(c.contentHash, /^[0-9a-f]{12}$/);
  assert.equal(c.records[1].source, 'The keeper → Momo');
});

test('scripted replies', async () => {
  const c = await load();
  assert.ok(c.rehearsal(base, 'momo', 'Did the keeper really say you could start without the bell?').includes('sent me a note'));
  assert.ok(c.rehearsal(base, 'pip', 'Did you see the keeper’s note yourself?').includes('Momo said the keeper'));
  assert.ok(c.rehearsal({ ...base, selectedEvidence: 'account' }, 'pip', 'Did you see the keeper’s note yourself?').includes('note was real'));
  assert.ok(c.rehearsal(base, 'nori', 'Did you hear the bell, or did you just assume?').includes('shouted snack time'));
  assert.equal(c.debrief.title, 'Nobody broke the rule.');
});

test('nobody lied in the knowledge', async () => {
  const c = await load();
  for (const list of Object.values(c.knowledge)) for (const s of list) assert.doesNotMatch(s, /\b(lie|lied|lying|made up)\b/);
});
