import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThreadMessages } from '../server/interviews.mjs';
import { cases } from '../server/cases/index.mjs';
import { findCase, identityCast } from '../server/cases.mjs';
import { worlds } from '../server/worlds.mjs';
import { worldFor } from '../client/worlds.ts';
import { threadPanel } from '../client/tools.ts';

// Every world: a chat is private to the player and the one character who had it. That character's thread
// prompt carries it; no other character's prompt ever does. What is said out loud (the thread lines) is shared.
// Friends depends on it most: every friend hides a theory and nobody knows the others'.
const t = n => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const posts = messages => JSON.parse(messages[1].content).thread;

test('friends_thread_keeps_chats_private: an admission in a chat reaches only the friend who made it', () => {
  const kase = findCase(cases, 'friends-roundtable');
  const session = {
    cast: identityCast(kase),
    interviews: { ...Object.fromEntries(kase.characters.map(c => [c.id, []])), nora: [{ question: 'Q?', answer: 'Okay fine, my secret is ZQX-ADMISSION.', timestamp: t(1) }] },
    thread: [{ character: 'ken', text: 'Pass the chips.', timestamp: t(2) }],
  };
  const messages = buildThreadMessages(kase, session, 'maya');
  assert.deepEqual(posts(messages), [{ post: 1, author: 'Perceval', text: 'Pass the chips.' }]);
  assert.equal(JSON.stringify(messages).includes('ZQX-ADMISSION'), false);
  // Every friend but Nora: nothing of her chat. Nora herself gets it back as privateChat, and nowhere else.
  for (const c of kase.characters.filter(x => x.id !== 'nora')) assert.equal(JSON.stringify(buildThreadMessages(kase, session, c.id)).includes('ZQX-ADMISSION'), false);
  const own = buildThreadMessages(kase, session, 'nora');
  assert.deepEqual(JSON.parse(own[1].content).privateChat, [{ question: 'Q?', answer: 'Okay fine, my secret is ZQX-ADMISSION.' }]);
  assert.equal(own[0].content.includes('ZQX-ADMISSION'), false);
});

test('every_world_keeps_chats_private: a chat goes to its own speaker and to nobody else', () => {
  for (const world of Object.values(worlds)) assert.equal('privateChats' in world, false);
  for (const id of cases.filter(c => c.tools?.talk !== false).map(c => c.id)) {
    const kase = findCase(cases, id);
    const [first, second] = kase.characters.map(c => c.id);
    const session = {
      cast: identityCast(kase),
      interviews: { ...Object.fromEntries(kase.characters.map(c => [c.id, []])), [first]: [{ question: 'ZQX-Q?', answer: 'ZQX-A1', timestamp: t(1) }] },
      thread: [{ character: second, text: 'P1', timestamp: t(2) }],
    };
    const thread = [{ post: 1, author: kase.characters[1].name, text: 'P1' }];
    const sent = m => { const { task, ...rest } = JSON.parse(m[1].content); assert.equal(typeof task, 'string'); return rest; };
    assert.deepEqual(sent(buildThreadMessages(kase, session, first)), { privateChat: [{ question: 'ZQX-Q?', answer: 'ZQX-A1' }], thread });
    for (const c of kase.characters.filter(x => x.id !== first)) {
      const messages = buildThreadMessages(kase, session, c.id);
      assert.deepEqual(sent(messages), { privateChat: [], thread });
      assert.equal(JSON.stringify(messages).includes('ZQX-'), false);
    }
  }
});

test('thread_note_says_what_they_hear: every thread says whose chat each one remembers', () => {
  const lines = [{ character: 'ken', text: 'x', round: 1, timestamp: 't' }];
  const note = worldFor('friends').text.threadNote;
  assert.equal(note, 'They hear what is said at the table. Each remembers only their own chat with you.');
  assert.match(threadPanel(lines, { ken: 'Ken' }, 0, note), /They hear what is said at the table\. Each remembers only their own chat with you\./);
  assert.equal(worldFor('grove').text.threadNote, undefined);
  assert.match(threadPanel(lines, { ken: 'Ken' }, 0), /They hear what is said in this thread\. Each remembers only their own chat with you\./);
});
