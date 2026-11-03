import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThreadMessages } from '../server/interviews.mjs';
import { cases } from '../server/cases/index.mjs';
import { findCase, identityCast } from '../server/cases.mjs';
import { worlds } from '../server/worlds.mjs';
import { worldFor } from '../client/worlds.ts';
import { threadPanel } from '../client/tools.ts';

// Every world: a chat with the player is private and is never sent to the model for the thread, not even
// to the character who had it. Only what is said out loud (the thread lines) is shared.
// Friends depends on it most: every friend hides a theory and nobody knows the others'.
const t = n => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const posts = messages => JSON.parse(messages[1].content).thread;

test('friends_thread_leaves_out_private_chats: an admission in a chat never reaches the thread prompt', () => {
  const kase = findCase(cases, 'friends-roundtable');
  const session = {
    cast: identityCast(kase),
    interviews: { ...Object.fromEntries(kase.characters.map(c => [c.id, []])), nora: [{ question: 'Q?', answer: 'Okay fine, my secret is ZQX-ADMISSION.', timestamp: t(1) }] },
    thread: [{ character: 'ken', text: 'Pass the chips.', timestamp: t(2) }],
  };
  const messages = buildThreadMessages(kase, session, 'maya');
  assert.deepEqual(posts(messages), [{ post: 1, author: 'Ken', text: 'Pass the chips.' }]);
  assert.equal(JSON.stringify(messages).includes('ZQX-ADMISSION'), false);
  // Not even the speaker's own chat: what Nora told the player is never sent.
  assert.equal(JSON.stringify(buildThreadMessages(kase, session, 'nora')).includes('ZQX-ADMISSION'), false);
});

test('every_world_keeps_chats_private: grove and tower share only lines said out loud', () => {
  for (const world of Object.values(worlds)) assert.equal('privateChats' in world, false);
  for (const id of ['banana-mystery', 'tower-echo-bell']) {
    const kase = findCase(cases, id);
    const [first, second] = kase.characters.map(c => c.id);
    const session = {
      cast: identityCast(kase),
      interviews: { ...Object.fromEntries(kase.characters.map(c => [c.id, []])), [first]: [{ question: 'ZQX-Q?', answer: 'ZQX-A1', timestamp: t(1) }] },
      thread: [{ character: second, text: 'P1', timestamp: t(2) }],
    };
    // No chat reaches any thread prompt: not someone else's, not the speaker's own.
    for (const speaker of [first, second]) {
      const messages = buildThreadMessages(kase, session, speaker);
      assert.deepEqual(JSON.parse(messages[1].content), { thread: [{ post: 1, author: kase.characters[1].name, text: 'P1' }] });
      assert.equal(JSON.stringify(messages).includes('ZQX-'), false);
    }
  }
});

test('thread_note_says_what_they_hear: every thread says chats stay private', () => {
  const lines = [{ character: 'ken', text: 'x', round: 1, timestamp: 't' }];
  const note = worldFor('friends').text.threadNote;
  assert.equal(note, 'They only hear what is said at the table, never your private chats.');
  assert.match(threadPanel(lines, { ken: 'Ken' }, 0, note), /They only hear what is said at the table, never your private chats\./);
  assert.equal(worldFor('grove').text.threadNote, undefined);
  assert.match(threadPanel(lines, { ken: 'Ken' }, 0), /They only hear what is said in this thread, never your private chats\./);
});
