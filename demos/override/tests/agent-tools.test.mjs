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
const withFns = { ...banana, rehearsalReasoning: (s, c) => `R:${c}`, rehearsalChatter: (s, c, n) => `${c}#${n}` };
const ok = async () => 'fine';

function setup(t, { env = { OVERRIDE_COIN_BUDGET: '15' }, kase = withFns, answer = ok } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-tools-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = { ...modelConfig({}), economy: economyRules(env) };
  const g = new Investigation({ dataDir: dir, config, kase, answer });
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
  const { ask, act } = await begun(t, { env: { OVERRIDE_COIN_BUDGET: '6' } });
  await ask();
  await assert.rejects(act('continue'), { status: 409, message: 'Save coins: you need 4 to ask everyone once.' });
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
    [{ character: 'momo', sourceEventId: answerId, reasoning: 'R:momo' }]);
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
  assert.deepEqual(g.session.thread.map(l => l.text), ['momo#0', 'pip#0', 'nori#0']);
  assert.deepEqual(g.session.chatter, { round: 1, pending: 0 });
  assert.equal(g.session.economy.spent, 1);
  await act('continue');
  assert.equal(g.session.thread[3].character, 'momo');
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
  for (const c of ['momo', 'pip', 'nori']) await ask(c);
  await act('verdict', { suspect: 'none', confidence: 50 });
  assert.deepEqual(events().find(e => e.type === 'verdict_submitted').coins, { spent: 6, budget: 15 });
});

test('inspect reserve counts the inspected character when not yet interviewed', async t => {
  // budget 8: ask momo (2) leaves 6; inspect (5) would leave 1 < 4 needed for pip and nori.
  const { act, ask, events } = await begun(t, { env: { OVERRIDE_COIN_BUDGET: '8' } });
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
