import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Investigations } from '../server/session.mjs';
import { economyRules } from '../server/economy.mjs';
import { cases } from '../server/cases/index.mjs';
import { InterviewProviderError } from '../server/interviews.mjs';

const banana = cases.find(c => c.id === 'banana-mystery');
// Tool content is a part template; the session resolves {partId} through its cast.
const rehearsal = { ...banana, rehearsalReasoning: partId => `REH:{${partId}}` };
const prov = { attempts: [{ endpoint: 'a' }] };

function setup(t, { answer, thread, kase = banana, mode = 'live' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-live-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = { mode, model: 'm', economy: economyRules({ OVERRIDE_COIN_BUDGET: '30' }) };
  const make = () => new Investigations({ dataDir: dir, config, cases: [kase], answer, thread });
  const state = { inv: make(), id: null, rev: null };
  const act = async (action, input = {}) => {
    const view = await state.inv.mutate(state.id ?? 'x', action, { sessionId: state.id, revision: state.rev, ...input });
    state.id = view.session.id; state.rev = view.session.revision;
    return view;
  };
  const log = () => state.inv.export(state.id).trim().split('\n').map(JSON.parse);
  return { state, act, log, restart: () => { state.inv = make(); } };
}
async function begun(t, opts) {
  const x = setup(t, opts);
  await x.act('start');
  return x;
}
const ans = reasoning => async () => ({ answer: 'fine', provenance: prov, reasoning });
const ask = (act, character = 'momo') => act('interview', { character, question: 'What happened?' });

test('reasoning_hidden_until_inspected', async t => {
  const x = await begun(t, { answer: ans('R') });
  const view = await ask(x.act);
  assert.ok(!JSON.stringify(view).includes('"R"'));
  assert.ok(!x.log().some(e => JSON.stringify(e).includes('"R"')));
  const v2 = await x.act('inspect', { character: 'momo' });
  assert.equal(v2.session.inspections[0].reasoning, 'R');
  assert.equal(x.log().at(-1).type, 'reasoning_inspected');
});

test('reasoning_lost_on_restore', async t => {
  const x = await begun(t, { answer: ans('R') });
  await ask(x.act);
  const spent = x.state.inv.find(x.state.id).session.economy.spent;
  x.restart();
  await assert.rejects(() => x.act('inspect', { character: 'momo' }), e => e.status === 409 && e.message === 'No reasoning available for Momo.');
  assert.equal(x.state.inv.find(x.state.id).session.economy.spent, spent);
});

test('stale_reasoning_not_used', async t => {
  let n = 0;
  const x = await begun(t, { answer: async () => ({ answer: 'a', provenance: prov, reasoning: n++ ? null : 'R' }) });
  await ask(x.act);
  await ask(x.act);
  await assert.rejects(() => x.act('inspect', { character: 'momo' }), e => e.status === 409);
});

test('chatter_failed_costs_nothing', async t => {
  const x = await begun(t, { answer: ans(null), thread: async () => { throw new InterviewProviderError('timeout', 'boom'); } });
  await ask(x.act);
  const before = x.state.inv.find(x.state.id).session;
  const spent = before.economy.spent;
  await assert.rejects(() => x.act('continue'), e => e.status === 502);
  const after = x.state.inv.find(x.state.id).session;
  assert.equal(after.economy.spent, spent);
  assert.deepEqual(after.chatter, before.chatter);
  assert.equal(after.thread.length, 0);
  const failed = x.log().at(-1);
  assert.equal(failed.type, 'chatter_failed');
  assert.equal(failed.round, 1);
  assert.equal(failed.reason, 'timeout');
  assert.equal(after.revision, failed.sequence);
});

test('chatter_line_provenance', async t => {
  const x = await begun(t, { answer: ans(null), thread: async () => ({ text: 'hello there', reasoning: 'TR', provenance: prov }) });
  await ask(x.act);
  const view = await x.act('continue');
  const line = x.log().find(e => e.type === 'chatter_line');
  assert.deepEqual(line.provenance, prov);
  assert.equal(line.threadPromptVersion, 'thread-v2');
  assert.ok(!JSON.stringify(view).includes('TR'));
  const speaker = line.character;
  const v = await x.act('inspect', { character: speaker });
  assert.equal(v.session.inspections[0].reasoning, 'TR');
});

test('rehearsal_inspect_uses_rehearsal_reasoning', async t => {
  const x = await begun(t, { kase: rehearsal, mode: 'rehearsal', answer: async () => 'fine' });
  await ask(x.act);
  const v = await x.act('inspect', { character: 'momo' });
  assert.equal(v.session.inspections[0].reasoning, 'REH:Momo');
});

test('reasoning_stale_after_thread_line_without_reasoning', async t => {
  const x = await begun(t, { answer: ans('R'), thread: async () => ({ text: 'chat', reasoning: null, provenance: prov }) });
  await ask(x.act, 'momo');
  await x.act('continue');
  const speaker = x.log().at(-1).character;
  if (speaker !== 'momo') await x.act('continue');
  await x.act('continue');
  await x.act('continue');
  const momoLines = x.log().filter(e => e.character === 'momo' && e.type === 'chatter_line');
  assert.ok(momoLines.length >= 1);
  await assert.rejects(() => x.act('inspect', { character: 'momo' }), e => e.status === 409);
});
