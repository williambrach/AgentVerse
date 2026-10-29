import test from 'node:test';
import assert from 'node:assert/strict';
import echo from '../server/cases/tower-echo-bell.mjs';
import { resolve, identityCast, publicView } from '../server/cases.mjs';
const r = (part, q) => echo.rehearsal(part, q);
const echoQ = 'Could it have been an echo?';
const knowledge = () => echo.parts.flatMap(p => p.knowledge);
test('echo bell is an honest mistake: every part is fooled, no liar', () => {
  assert.equal(echo.status, 'ready'); assert.equal(echo.world.id, 'tower');
  assert.deepEqual(echo.parts.map(p => p.role), ['fooled', 'fooled', 'fooled']);
  for (const s of knowledge()) assert.doesNotMatch(s, /\b(lie|lied|lying|made up)\b/);
});
test('echo bell: nobody names the shell before seeing it', () => {
  const unseen = r('watcher', 'Did you look at the bell when it rang?');
  assert.ok(unseen.includes('I didn’t look'));
  assert.doesNotMatch(unseen, /shell/i);
  assert.ok(r('watcher', echoQ).includes('should have looked'));
  assert.ok(r('planner', echoQ).includes('sounded just like the tower bell'));
  assert.ok(r('fetcher', 'Hello').includes('sounded like the tower bell'));
});
test('echo bell: nothing public or prompted names the shell', () => {
  { const v = publicView(echo, identityCast(echo)); assert.doesNotMatch(JSON.stringify({ copy: v.copy, characters: v.characters }), /shell|echo/i); }
  assert.doesNotMatch(JSON.stringify(echo.copy), /shell|echo/i);
  assert.equal(echo.prompt.use.some(w => /shell|echo/i.test(w)), false);
});
test('echo bell: nobody names the shell by default, and look-questions are word-bounded', () => {
  for (const id of ['planner', 'fetcher', 'watcher']) assert.doesNotMatch(r(id, 'Hello'), /shell/i);
  assert.doesNotMatch(r('watcher', 'Did you look at the bell?'), /shell/i);
  assert.ok(r('watcher', 'Is it a seesaw?').includes('I thought the Headmistress rang it'));
  assert.ok(r('watcher', 'Where were you?').includes('I didn’t look'));
});
test('tower_clue_free', () => {
  assert.equal(echo.chapters, undefined); assert.equal(echo.records, undefined); assert.equal(echo.copy.basket, undefined);
  for (const s of knowledge()) assert.doesNotMatch(s, /\bshown?\b/);
  assert.match(echo.debrief.summary, /echo shell/);
});
test('tower_rehearsal_keywords', () => {
  assert.ok(r('watcher', echoQ).includes('should have looked first'));
  assert.ok(r('planner', echoQ).includes('That was an echo shell?'));
  assert.ok(r('fetcher', echoQ).includes('Huh. The bell sounded just right'));
  assert.ok(r('fetcher', 'Hello').includes('{planner} said go'));
  assert.ok(r('planner', 'Hello').includes('{watcher} called out'));
  const cast = { wren: 'fetcher', basil: 'planner', juniper: 'watcher' };
  assert.equal(resolve(echo, cast, r('planner', 'Hello')), 'We heard the bell and Juniper called out, so I told Wren to fetch the potions. I thought the Headmistress rang it.');
});
test('tower_rehearsal_keywords_not_greedy', () => {
  assert.doesNotMatch(r('planner', 'Can you repeat that?'), /shell/i);
  assert.doesNotMatch(r('fetcher', 'Did you copy Wren?'), /shell/i);
  assert.ok(r('planner', 'Was it another bell?').includes('echo shell'));
});
