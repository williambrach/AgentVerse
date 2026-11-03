import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThreadMessages } from '../server/interviews.mjs';
import { cases } from '../server/cases/index.mjs';
import { findCase, identityCast } from '../server/cases.mjs';
import { worlds } from '../server/worlds.mjs';
import { worldFor } from '../client/worlds.ts';
import { threadPanel } from '../client/tools.ts';

// Friends: every friend hides a theory and nobody knows the others'. What a friend admits in a
// private chat must never reach the table, so the Friends thread carries only lines said at the table.
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
  // Not even the speaker's own chat: what Nora told the player stays between them.
  assert.equal(JSON.stringify(buildThreadMessages(kase, session, 'nora')).includes('ZQX-ADMISSION'), false);
});

test('walking_worlds_keep_chats_in_the_thread: grove and tower are unchanged', () => {
  assert.equal(worlds.grove.privateChats, undefined);
  assert.equal(worlds.tower.privateChats, undefined);
  assert.equal(worlds.friends.privateChats, true);
  const kase = findCase(cases, 'banana-mystery');
  const session = {
    cast: identityCast(kase),
    interviews: { momo: [{ question: 'Q?', answer: 'A1', timestamp: t(1) }], pip: [], nori: [], kiki: [] },
    thread: [{ character: 'pip', text: 'P1', timestamp: t(2) }],
  };
  assert.deepEqual(posts(buildThreadMessages(kase, session, 'momo')).map(p => p.text), ['A1', 'P1']);
});

test('thread_note_says_what_they_hear: the Friends thread says chats stay private, the others keep their line', () => {
  const lines = [{ character: 'ken', text: 'x', round: 1, timestamp: 't' }];
  const note = worldFor('friends').text.threadNote;
  assert.equal(note, 'They only hear what is said at the table, never your private chats.');
  assert.match(threadPanel(lines, { ken: 'Ken' }, 0, note), /They only hear what is said at the table, never your private chats\./);
  assert.equal(worldFor('grove').text.threadNote, undefined);
  assert.match(threadPanel(lines, { ken: 'Ken' }, 0), /They see each other’s earlier lines, never your questions\./);
});
