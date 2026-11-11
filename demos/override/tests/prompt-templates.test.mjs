import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_TEMPLATES, checkTemplate, renderTemplate, buildMessages, buildThreadMessages, modelConfig } from '../server/interviews.mjs';
import { defineCase, identityCast } from '../server/cases.mjs';
import { Investigation } from '../server/session.mjs';
import { readJsonl } from '../server/dataset.mjs';
import { partCase, agentWorlds } from './fixtures/minimal-case.mjs';

const worlds = agentWorlds(3);
const base = defineCase(partCase, { worlds });
const sess = k => ({ cast: identityCast(k), interviews: { momo: [], pip: [], nori: [] }, thread: [] });

test('checkTemplate and renderTemplate follow the examples', () => {
  assert.equal(checkTemplate('interview', DEFAULT_TEMPLATES.interview), null);
  assert.equal(checkTemplate('thread', DEFAULT_TEMPLATES.thread), null);
  assert.equal(checkTemplate('interview', 'hello'), 'The template needs [[knowledge]] exactly once.');
  assert.equal(checkTemplate('interview', '[[knowledge]] [[knowledge]]'), 'The template needs [[knowledge]] exactly once.');
  assert.equal(checkTemplate('thread', '[[others]] [[foo]]'), 'Unknown token [[foo]].');
  assert.equal(checkTemplate('interview', '[[knowledge]] [[others]]'), 'Unknown token [[others]].');
  assert.equal(renderTemplate('Hi [[name]]', { name: 'Momo' }), 'Hi Momo');
  assert.equal(renderTemplate('[[a]] [[b]]', { a: '[[b]]', b: 'x' }), '[[b]] x');
});

test('default_render_identical: the default templates render today prompt', () => {
  const s = sess(base);
  const sys = buildMessages(base, s, 'momo', 'Q?')[0].content;
  assert.match(sys, /^You play Momo \(/);
  assert.ok(sys.includes(`(${base.version}, interview-v6).`));
  assert.ok(sys.endsWith(base.parts[0].knowledge[0].replace(/\{[^{}]*\}/g, m => m)) || sys.includes('YOUR KNOWLEDGE:\n'));
  const thread = buildThreadMessages(base, s, 'momo');
  assert.equal(thread[0].content, sys);
  assert.ok(JSON.parse(thread[1].content).task.startsWith('You are now posting in a short forum thread with Pip and Nori.'));
});

test('custom_template_used: a given template replaces the default', () => {
  const k = defineCase({ ...partCase, rules: 'X [[name]] [[knowledge]]' }, { worlds, prompts: { thread: 'T [[others]] go', interviewVersion: 'interview-v6+abcd1234', threadVersion: 'thread-v7+ffff0000' } });
  assert.ok(buildMessages(k, sess(k), 'momo', 'Q?')[0].content.startsWith('X Momo '));
  assert.ok(buildThreadMessages(k, sess(k), 'momo')[0].content.startsWith('X Momo '));
  assert.equal(JSON.parse(buildThreadMessages(k, sess(k), 'momo')[1].content).task, 'T Pip and Nori go');
  assert.ok(Object.isFrozen(k.prompts));
});

test('version_logged: a session logs the prompts version', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const k = defineCase(partCase, { worlds, prompts: { interview: DEFAULT_TEMPLATES.interview, thread: DEFAULT_TEMPLATES.thread, interviewVersion: 'interview-v6+abcd1234', threadVersion: 'thread-v7+ffff0000' } });
  const inv = new Investigation({ dataDir: dir, config: modelConfig({}), kase: k, shuffle: ids => [...ids] });
  const act = (action, input = {}) => inv.mutate(action, { sessionId: inv.session?.id, revision: inv.session?.revision, ...input });
  await act('start');
  await act('interview', { character: 'momo', question: 'What happened?' });
  const events = readJsonl(join(dir, 'sessions', `${inv.session.id}.jsonl`));
  const q = events.filter(e => e.type === 'question_answered' || e.question);
  assert.ok(events.length > 1);
  assert.ok(events.every(e => e.promptVersion === 'interview-v6+abcd1234'));
  assert.ok(q.length >= 1);
});

test('reserved_game: the id game is reserved', () => {
  assert.throws(() => defineCase({ ...partCase, id: 'game' }, { worlds }), /game is reserved/);
});

test('prompts_not_hashed: prompts do not change the contentHash', () => {
  const k = defineCase(partCase, { worlds, prompts: { interview: 'X [[knowledge]]', thread: 'Y [[knowledge]]', interviewVersion: 'a', threadVersion: 'b' } });
  assert.equal(k.contentHash, base.contentHash);
  assert.equal(base.prompts, undefined);
});

test('interview_accepts_frameFirst: the token is allowed and rendered', () => {
  assert.equal(checkTemplate('interview', '[[frameFirst]] [[knowledge]]'), null);
  const k = defineCase({ ...partCase, rules: 'F:[[frameFirst]] [[knowledge]]' }, { worlds, prompts: { thread: DEFAULT_TEMPLATES.thread, interviewVersion: 'interview-v6+abcd1234', threadVersion: 'thread-v7+ffff0000' } });
  const first = k.world.frame.split('. ')[0];
  const sys = buildMessages(k, sess(k), 'momo', 'Q?')[0].content;
  assert.ok(sys.startsWith(`F:${first} `));
});

test('case_rules: a case without rules starts from the default ones, and bad rules are refused', () => {
  // The world's three sentences are written in, so the default rules hold no world token.
  assert.equal(/\[\[(frame|persona|memory)\]\]/.test(base.rules), false);
  assert.ok(base.rules.includes(base.world.frame) && base.rules.includes(base.world.memory));
  assert.equal(buildMessages(base, sess(base), 'momo', 'Q?')[0].content.includes('[['), false);
  assert.throws(() => defineCase({ ...partCase, rules: 'no slot' }, { worlds }), /rules: The template needs \[\[knowledge\]\] exactly once/);
  assert.throws(() => defineCase({ ...partCase, rules: '[[knowledge]] [[setting]]' }, { worlds }), /rules: Unknown token \[\[setting\]\]/);
});
