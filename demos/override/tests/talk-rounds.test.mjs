import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Investigation, Investigations } from '../server/session.mjs';
import { economyRules } from '../server/economy.mjs';
import { cases } from '../server/cases/index.mjs';
import { findCase } from '../server/cases.mjs';
import { modelConfig } from '../server/interviews.mjs';

// "Let them talk": one round is one line from every character, whatever the cast size.
const identity = ids => [...ids];

function setup(t, caseId) {
  const dir = mkdtempSync(join(tmpdir(), 'override-talk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const kase = findCase(cases, caseId);
  const config = { ...modelConfig({}), economy: economyRules({ budget: 30 }) };
  const g = new Investigation({ dataDir: dir, config, kase, answer: async () => 'fine', shuffle: identity });
  const act = (action, input = {}) => g.mutate(action, { sessionId: g.session?.id, revision: g.session?.revision, ...input });
  const restore = () => new Investigations({ dataDir: dir, config, answer: async () => 'fine', cases: [kase] }).find(g.session.id).session;
  return { g, act, kase, dir, restore };
}

for (const [caseId, size] of [['friends-roundtable', 5], ['banana-mystery', 4]]) {
  test(`round_hears_everyone: ${caseId} (${size} characters) speaks ${size} lines per press, each once`, async t => {
    const { g, act, kase } = setup(t, caseId);
    await act('start');
    await act('continue');
    assert.deepEqual(g.session.chatter, { round: 1, pending: size - 1 });
    while (g.session.chatter.pending > 0) await act('continue');
    assert.deepEqual(g.session.thread.map(l => l.character), kase.characters.map(c => c.id));
    assert.equal(g.session.economy.charges.continue.used, 1);
    // The next press starts round 2 with the first character again.
    await act('continue');
    assert.deepEqual(g.session.chatter, { round: 2, pending: size - 1 });
    assert.equal(g.session.thread.at(-1).character, kase.characters[0].id);
    assert.equal(g.session.economy.charges.continue.used, 2);
  });
}

test('round_size_is_logged_and_replayed', async t => {
  const { g, act, dir, restore } = setup(t, 'friends-roundtable');
  await act('start');
  await act('continue');
  await act('continue');
  const file = join(dir, 'sessions', readdirSync(join(dir, 'sessions'))[0]);
  const lines = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.type === 'chatter_line');
  assert.deepEqual(lines.map(e => [e.line, e.roundLines]), [[1, 5], [2, 5]]);
  assert.deepEqual(restore().chatter, { round: 1, pending: 3 });
  assert.deepEqual(restore(), g.session);
});

test('old_logs_keep_three_line_rounds: a chatter_line without roundLines replays as a 3-line round', async t => {
  const { act, dir, restore } = setup(t, 'friends-roundtable');
  await act('start');
  await act('continue');
  const file = join(dir, 'sessions', readdirSync(join(dir, 'sessions'))[0]);
  const old = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).map(e => {
    if (e.type !== 'chatter_line') return e;
    const { roundLines, ...rest } = e;
    return rest;
  });
  writeFileSync(file, old.map(e => JSON.stringify(e)).join('\n') + '\n');
  assert.deepEqual(restore().chatter, { round: 1, pending: 2 });
});

test('old_round_in_progress_finishes_at_three: a restored 3-line round gets lines 2 and 3, then a full round starts', async t => {
  const { act, dir, kase, g } = setup(t, 'friends-roundtable');
  await act('start');
  await act('continue');
  const file = join(dir, 'sessions', readdirSync(join(dir, 'sessions'))[0]);
  const old = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).map(e => {
    if (e.type !== 'chatter_line') return e;
    const { roundLines, ...rest } = e;
    return rest;
  });
  writeFileSync(file, old.map(e => JSON.stringify(e)).join('\n') + '\n');
  const config = { ...modelConfig({}), economy: economyRules({ budget: 30 }) };
  const game = new Investigations({ dataDir: dir, config, answer: async () => 'fine', cases: [kase] }).find(g.session.id);
  const step = () => game.mutate('continue', { sessionId: game.session.id, revision: game.session.revision });
  await step();
  assert.deepEqual(game.session.chatter, { round: 1, pending: 1 });
  await step();
  assert.deepEqual(game.session.chatter, { round: 1, pending: 0 });
  await step();
  assert.deepEqual(game.session.chatter, { round: 2, pending: 4 });
  const logged = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.type === 'chatter_line').map(e => [e.round, e.line, e.roundLines]);
  assert.deepEqual(logged, [[1, 1, undefined], [1, 2, 3], [1, 3, 3], [2, 1, 5]]);
});
