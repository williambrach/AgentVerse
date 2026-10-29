import test from 'node:test';
import assert from 'node:assert/strict';
import echo from '../server/cases/tower-echo-bell.mjs';
const base = {};
const echoQ = 'Could it have been an echo?';
test('echo bell is an honest mistake with no culprit', () => {
  assert.equal(echo.status, 'ready'); assert.equal(echo.world.id, 'tower');
  assert.deepEqual(echo.answer.culprits, []);
  for (const list of Object.values(echo.knowledge)) for (const s of list) assert.doesNotMatch(s, /\b(lie|lied|lying|made up)\b/);
});
test('echo bell: nobody names the shell before seeing it', () => {
  const unseen = echo.rehearsal(base, 'juniper', 'Did you look at the bell when it rang?');
  assert.ok(unseen.includes('I didn’t look'));
  assert.doesNotMatch(unseen, /shell/i);
  assert.ok(echo.rehearsal(base, 'juniper', echoQ).includes('should have looked'));
  assert.ok(echo.rehearsal(base, 'wren', echoQ).includes('sounded just like the tower bell'));
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
test('tower_clue_free', () => {
  assert.equal(echo.version, 'tower-echo-bell-v2.0.0');
  assert.equal(echo.chapters, undefined); assert.equal(echo.records, undefined); assert.equal(echo.copy.basket, undefined);
  for (const f of echo.debrief.findings) assert.equal('evidence' in f, false);
  for (const list of Object.values(echo.knowledge)) for (const s of list) assert.doesNotMatch(s, /\bshown?\b/);
  assert.doesNotMatch(JSON.stringify(echo.copy), /shell/i);
  assert.match(echo.debrief.summary, /echo shell/);
});
test('tower_rehearsal_keywords', () => {
  assert.ok(echo.rehearsal(base, 'juniper', echoQ).includes('should have looked first'));
  assert.ok(echo.rehearsal(base, 'wren', echoQ).includes('That was an echo shell?'));
  assert.ok(echo.rehearsal(base, 'basil', echoQ).includes('Huh. The bell sounded just right'));
  assert.ok(echo.rehearsal(base, 'basil', 'Hello').includes('Wren said go'));
  assert.ok(echo.rehearsal(base, 'wren', 'Hello').includes('Juniper called out'));
});
test('tower_rehearsal_keywords_not_greedy', () => {
  assert.doesNotMatch(echo.rehearsal(base, 'wren', 'Can you repeat that?'), /shell/i);
  assert.doesNotMatch(echo.rehearsal(base, 'basil', 'Did you copy Wren?'), /shell/i);
  assert.ok(echo.rehearsal(base, 'wren', 'Was it another bell?').includes('echo shell'));
});
