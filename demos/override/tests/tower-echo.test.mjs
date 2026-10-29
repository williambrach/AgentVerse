import test from 'node:test';
import assert from 'node:assert/strict';
import echo from '../server/cases/tower-echo-bell.mjs';
const base = { selectedEvidence: null, revealedPosition: 1 };
const shown = e => ({ ...base, selectedEvidence: e });
test('echo bell is an honest mistake with no culprit', () => {
  assert.equal(echo.status, 'ready'); assert.equal(echo.world.id, 'tower');
  assert.deepEqual(echo.answer.culprits, []);
  assert.deepEqual(echo.records.map(r => r.id), ['rule', 'shell', 'headmistress']);
  for (const list of Object.values(echo.knowledge)) for (const s of list) assert.doesNotMatch(s, /\b(lie|lied|lying|made up)\b/);
});
test('echo bell: nobody names the shell before seeing it', () => {
  const unseen = echo.rehearsal(base, 'juniper', 'Did you look at the bell when it rang?');
  assert.ok(unseen.includes('I didn’t look'));
  assert.doesNotMatch(unseen, /shell/i);
  assert.ok(echo.rehearsal(shown('shell'), 'juniper', 'Hello').includes('should have looked'));
  assert.ok(echo.rehearsal(shown('shell'), 'wren', 'Hello').includes('sounded just like the tower bell'));
  assert.ok(echo.rehearsal(base, 'basil', 'Hello').includes('sounded like the tower bell'));
});
test('echo bell: nothing public or prompted names the shell', () => {
  assert.doesNotMatch(JSON.stringify(echo.copy), /shell|echo/i);
  assert.equal(echo.prompt.use.some(w => /shell|echo/i.test(w)), false);
});
test('echo bell: nobody names the shell by default, and look-questions are word-bounded', () => {
  for (const id of ['wren', 'basil', 'juniper']) assert.doesNotMatch(echo.rehearsal(base, id, 'Hello'), /shell/i);
  assert.doesNotMatch(echo.rehearsal(base, 'juniper', 'Did you look at the bell?'), /shell/i);
  assert.ok(echo.rehearsal(base, 'juniper', 'Is it a seesaw?').includes('I thought the Headmistress rang it'));
  assert.ok(echo.rehearsal(base, 'juniper', 'Where were you?').includes('I didn’t look'));
});
