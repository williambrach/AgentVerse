import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Investigation, Investigations } from '../server/session.mjs';
import { economyRules } from '../server/economy.mjs';
import { cases } from '../server/cases/index.mjs';
import { findCase } from '../server/cases.mjs';
import { modelConfig } from '../server/interviews.mjs';

const banana = findCase(cases, 'banana-mystery');
// Tool content is a part template; the session resolves {partId} through its cast (identity here: momo plays the first part).
const withFns = { ...banana, rehearsalReasoning: p => `R:{${p}}`, rehearsalChatter: (p, n) => `{${p}}#${n}` };
const identity = ids => [...ids];
const ok = async () => 'fine';

function setup(t, { env = { OVERRIDE_COIN_BUDGET: '15' }, kase = withFns, answer = ok, shuffle = identity } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-tools-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = { ...modelConfig({}), economy: economyRules(env) };
  const g = new Investigation({ dataDir: dir, config, kase, answer, shuffle });
  const act = (action, input = {}) => g.mutate(action, { sessionId: g.session?.id, revision: g.session?.revision, ...input });
  const ask = (character = 'momo') => act('interview', { character, question: 'What happened?' });
  const events = () => g.export().trim().split('\n').map(JSON.parse);
  return { g, act, ask, events, dir, config };
}
async function begun(t, opts) { const s = setup(t, opts); await s.act('start'); return s; }

test('ask_costs_two', async t => {
  const { g, ask, events } = await begun(t);
  await ask();
  assert.equal(g.session.economy.spent, 2);
  assert.deepEqual(events().find(e => e.type === 'interview_answer').spend, { tools: ['ask'], cost: 2, total: 2 });
});

test('failed_answer_costs_nothing', async t => {
  const { g, ask } = await begun(t, { answer: async () => { throw new Error('boom'); } });
  await assert.rejects(ask(), /could not complete/);
  assert.equal(g.session.economy.spent, 0);
});

test('reserve_blocks_continue', async t => {
  // Four monkeys: after asking momo (2 of 8), the other three need 6, so a continue (1) would cut into them.
  const { ask, act } = await begun(t, { env: { OVERRIDE_COIN_BUDGET: '8' } });
  await ask();
  await assert.rejects(act('continue'), { status: 409, message: 'Save coins: you need 6 to ask everyone once.' });
});

test('inspect_before_line_409', async t => {
  const { act, g } = await begun(t);
  await assert.rejects(act('inspect', { character: 'momo' }), { status: 409, message: 'Momo has not said anything yet.' });
  assert.equal(g.session.economy.spent, 0);
});

test('inspect_once', async t => {
  const { act, ask, g, events } = await begun(t);
  await ask();
  await act('inspect', { character: 'momo' });
  const answerId = events().find(e => e.type === 'interview_answer').eventId;
  assert.equal(g.session.economy.spent, 7);
  assert.deepEqual(g.session.inspections.map(({ character, sourceEventId, reasoning }) => ({ character, sourceEventId, reasoning })),
    [{ character: 'momo', sourceEventId: answerId, reasoning: 'R:Momo' }]);
  await assert.rejects(act('inspect', { character: 'momo' }), { status: 409, message: 'No reasoning inspections left.' });
  assert.equal(g.session.economy.spent, 7);
});

test('inspect_twice_with_two_charges', async t => {
  const { act, ask, g } = await begun(t, { env: { OVERRIDE_REASONING_CHARGES: '2' } });
  await ask();
  await act('inspect', { character: 'momo' });
  await act('inspect', { character: 'momo' });
  assert.equal(g.session.inspections.length, 2);
});

test('inspect_no_function_409', async t => {
  const { act, ask, g } = await begun(t, { kase: banana });
  await ask();
  const kase = { ...banana, rehearsalReasoning: undefined };
  g.kase = kase;
  await assert.rejects(act('inspect', { character: 'momo' }), { status: 409, message: 'No reasoning available for Momo.' });
  assert.equal(g.session.economy.spent, 2);
});

test('continue_rotates_and_rounds', async t => {
  const { act, g } = await begun(t);
  for (let i = 0; i < 3; i++) await act('continue');
  assert.deepEqual(g.session.thread.map(l => l.character), ['momo', 'pip', 'nori']);
  assert.deepEqual(g.session.thread.map(l => l.text), ['Momo#0', 'Pip#0', 'Nori#0']);
  assert.deepEqual(g.session.chatter, { round: 1, pending: 0 });
  assert.equal(g.session.economy.spent, 1);
  await act('continue');
  assert.equal(g.session.thread[3].character, 'kiki');
  assert.deepEqual(g.session.chatter, { round: 2, pending: 2 });
  for (let i = 0; i < 2 + 3; i++) await act('continue');
  assert.deepEqual(g.session.chatter, { round: 3, pending: 0 });
  assert.equal(g.session.economy.charges.continue.used, 3);
  await assert.rejects(act('continue'), { status: 409, message: 'No conversations left.' });
});

test('continue_from_start', async t => {
  const { act, g } = setup(t);
  await act('start');
  await act('continue');
  assert.equal(g.session.thread.length, 1);
  assert.equal(g.session.economy.spent, 1);
});

test('continue_skips_rate_limit', async t => {
  const { act, ask } = await begun(t, { env: {} });
  for (let i = 0; i < 6; i++) await ask();
  await assert.rejects(ask(), { status: 429 });
  await act('continue');
});

test('thread_not_in_interviews', async t => {
  const { act, g } = await begun(t);
  await act('continue');
  assert.equal(Object.values(g.session.interviews).flat().length, 0);
});

test('stale revision still 409', async t => {
  const { g } = await begun(t);
  await assert.rejects(g.mutate('continue', { sessionId: g.session.id, revision: 0 }), { status: 409 });
  await assert.rejects(g.mutate('inspect', { sessionId: 'x', revision: g.session.revision, character: 'momo' }), { status: 409 });
});

test('busy lock covers continue', async t => {
  let release;
  const slow = () => new Promise(r => { release = () => r('fine'); });
  const { g, act, ask } = await begun(t, { answer: slow });
  const first = ask();
  await assert.rejects(act('continue'), { status: 409 });
  await assert.rejects(act('inspect', { character: 'momo' }), { status: 409 });
  release();
  await first;
});

test('restore_equal', async t => {
  const { act, ask, g, dir, config } = await begun(t);
  await ask(); await ask('pip');
  await act('inspect', { character: 'pip' });
  for (let i = 0; i < 4; i++) await act('continue');
  const view = g.view();
  const again = new Investigations({ dataDir: dir, config, answer: ok, cases: [withFns] });
  assert.deepEqual(again.find(g.session.id).view(), view);
});

test('failed write rolls back spend exactly once', async t => {
  const { act, ask, g, events } = await begun(t);
  await ask();
  const before = structuredClone(g.session.economy);
  const log = g.log.bind(g);
  g.log = (type, ...rest) => { if (type === 'reasoning_inspected') throw new Error('disk'); return log(type, ...rest); };
  await assert.rejects(act('inspect', { character: 'momo' }), /disk/);
  assert.deepEqual(g.session.economy, before);
  g.log = log;
  await act('inspect', { character: 'momo' });
  assert.equal(g.session.economy.spent, before.spent + 5);
  assert.equal(events().filter(e => e.type === 'reasoning_inspected').length, 1);
});

test('verdict_has_coins', async t => {
  const { act, ask, events } = await begun(t);
  for (const c of ['momo', 'pip', 'nori', 'kiki']) await ask(c);
  await act('verdict', { roles: { momo: 'villain', pip: 'fooled', nori: 'collaborator', kiki: 'honest' }, confidence: 50 });
  assert.deepEqual(events().find(e => e.type === 'verdict_submitted').coins, { spent: 8, budget: 15 });
});

test('inspect reserve counts the inspected character when not yet interviewed', async t => {
  // budget 12: ask momo (2) and continue (1) leave 9; inspect (5) would leave 4: enough for pip and kiki,
  // but not for nori too (6). Only counting the inspected character refuses it.
  const { act, ask, events } = await begun(t, { env: { OVERRIDE_COIN_BUDGET: '12' } });
  await ask();
  await act('continue');
  await assert.rejects(act('inspect', { character: 'nori' }), { status: 409 });
  assert.equal(events().filter(e => e.type === 'reasoning_inspected').length, 0);
});

test('failure after the answer is logged keeps the logged spend', async t => {
  const { act, ask, g, events } = await begun(t);
  await ask('momo');
  g.remember = () => { throw new Error('after'); };
  await assert.rejects(ask('pip'));
  const logged = events().filter(e => e.type === 'interview_answer').at(-1).spend.total;
  assert.equal(logged, 4);
  assert.equal(g.session.economy.spent, logged);
});

test('answer write that throws after reaching the file leaves the wallet matching the log', async t => {
  const { g, act, ask, events } = await begun(t);
  await ask('momo');
  const orig = g.log.bind(g);
  g.log = (type, details, state) => {
    const e = orig(type, details, state);
    if (type === 'interview_answer') { (state ?? g.session).revision -= 1; throw new Error('disk'); }
    return e;
  };
  await assert.rejects(ask('pip'));
  g.log = orig;
  const logged = events().filter(e => e.type === 'interview_answer').at(-1).spend.total;
  assert.equal(g.session.economy.spent, logged);
  const seqs = events().map(e => e.sequence);
  assert.deepEqual(seqs, seqs.map((_, i) => i + 1));
  await act('visit', { location: 'report' });
});

// Merged behaviour (agent roles x coins and tools): tool content follows the session's cast.
const rotate = ids => [...ids.slice(1), ids[0]]; // momo carrier, pip lookout, nori minder, kiki planner
const PART_OR_ROLE = /\{|\b(planner|carrier|lookout|minder|villain|collaborator|fooled|honest)\b/i;

test('rehearsal inspect and chatter resolve through a shuffled cast', async t => {
  const { act, ask, g } = await begun(t, { kase: banana, shuffle: rotate });
  assert.deepEqual(g.session.cast, { momo: 'carrier', pip: 'lookout', nori: 'minder', kiki: 'planner' });
  await ask('momo');
  await act('inspect', { character: 'momo' });
  const reasoning = g.session.inspections[0].reasoning;
  assert.ok(reasoning.startsWith('Kiki sounded so sure, so I did not stop to wonder.'), reasoning);
  assert.doesNotMatch(reasoning, PART_OR_ROLE);
  await act('continue');
  const post = g.session.thread[0];
  assert.equal(post.character, 'momo');
  assert.equal(post.text, 'Kiki, you told me we could take them, so I did. I never heard a bell, though. Nori, did you? I keep wondering why I did not check with the keeper first.');
  assert.doesNotMatch(post.text, PART_OR_ROLE);
  await act('continue');
  assert.equal(g.session.thread[1].text, 'Quiet morning on the path. Nobody came by, not once. Momo, you did all the heavy lifting. Kiki, the picnic looked lovely from where I sat.');
});

test('replay of a v3 log restores economy, cast, thread and inspections', async t => {
  const { act, ask, g, dir, config, events } = await begun(t, { kase: banana, shuffle: rotate });
  await ask('pip');
  await act('inspect', { character: 'pip' });
  await act('continue');
  const log = events();
  assert.ok(log.every(e => e.schemaVersion === 3));
  const started = log.find(e => e.type === 'session_started');
  assert.equal(started.cast, null); // the export hides the cast while the game is on
  const again = new Investigations({ dataDir: dir, config, answer: ok, cases: [banana] });
  const restored = again.find(g.session.id).session;
  assert.deepEqual(restored.cast, { momo: 'carrier', pip: 'lookout', nori: 'minder', kiki: 'planner' });
  assert.deepEqual(restored.economy, g.session.economy);
  assert.equal(restored.economy.spent, 2 + 5 + 1);
  assert.equal(restored.economy.budget, 15);
  assert.deepEqual(restored.thread, g.session.thread);
  assert.deepEqual(restored.inspections, g.session.inspections);
  assert.deepEqual(restored.chatter, { round: 1, pending: 2 });
  assert.deepEqual(restored, g.session);
  assert.deepEqual(again.find(g.session.id).view(), g.view());
});
