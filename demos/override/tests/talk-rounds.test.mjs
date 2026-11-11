import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Investigation, Investigations, seededShuffle } from '../server/session.mjs';
import { economyRules } from '../server/economy.mjs';
import { cases } from '../server/cases/index.mjs';
import { findCase } from '../server/cases.mjs';
import { modelConfig } from '../server/interviews.mjs';

// "Let them talk": one round is one line from every character, whatever the cast size.
const identity = ids => [...ids];

// Round and lines left, without the dealt speaking order.
const progress = ({ round, pending }) => ({ round, pending });

function setup(t, caseId, order = identity, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-talk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const kase = findCase(cases, caseId);
  const config = { ...modelConfig({}), economy: economyRules({ budget: 30 }), ...extra };
  const g = new Investigation({ dataDir: dir, config, kase, answer: async () => 'fine', shuffle: identity, order });
  const act = (action, input = {}) => g.mutate(action, { sessionId: g.session?.id, revision: g.session?.revision, ...input });
  const restore = () => new Investigations({ dataDir: dir, config, answer: async () => 'fine', cases: [kase] }).find(g.session.id).session;
  return { g, act, kase, dir, restore, config };
}

for (const [caseId, size] of [['friends-roundtable', 5], ['banana-mystery', 4]]) {
  test(`round_hears_everyone: ${caseId} (${size} characters) speaks ${size} lines per press, each once`, async t => {
    const { g, act, kase } = setup(t, caseId);
    await act('start');
    await act('continue');
    assert.deepEqual(progress(g.session.chatter), { round: 1, pending: size - 1 });
    while (g.session.chatter.pending > 0) await act('continue');
    assert.deepEqual(g.session.thread.map(l => l.character), kase.characters.map(c => c.id));
    assert.equal(g.session.economy.charges.continue.used, 1);
    // The next press starts round 2 with the first character again.
    await act('continue');
    assert.deepEqual(progress(g.session.chatter), { round: 2, pending: size - 1 });
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
  assert.deepEqual(progress(restore().chatter), { round: 1, pending: 3 });
  assert.deepEqual(restore(), g.session);
});

test('old_logs_keep_three_line_rounds: a chatter_line without roundLines replays as a 3-line round', async t => {
  const { act, dir, restore } = setup(t, 'friends-roundtable');
  await act('start');
  await act('continue');
  const file = join(dir, 'sessions', readdirSync(join(dir, 'sessions'))[0]);
  const old = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).map(e => {
    if (e.type !== 'chatter_line') return e;
    const { roundLines, order, ...rest } = e;
    return rest;
  });
  writeFileSync(file, old.map(e => JSON.stringify(e)).join('\n') + '\n');
  assert.deepEqual(restore().chatter, { round: 1, pending: 2, order: null });
});

test('old_round_in_progress_finishes_at_three: a restored 3-line round gets lines 2 and 3, then a full round starts', async t => {
  const { act, dir, kase, g } = setup(t, 'friends-roundtable');
  await act('start');
  await act('continue');
  const file = join(dir, 'sessions', readdirSync(join(dir, 'sessions'))[0]);
  const old = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).map(e => {
    if (e.type !== 'chatter_line') return e;
    const { roundLines, order, ...rest } = e;
    return rest;
  });
  writeFileSync(file, old.map(e => JSON.stringify(e)).join('\n') + '\n');
  const config = { ...modelConfig({}), economy: economyRules({ budget: 30 }) };
  const game = new Investigations({ dataDir: dir, config, answer: async () => 'fine', cases: [kase] }).find(g.session.id);
  const step = () => game.mutate('continue', { sessionId: game.session.id, revision: game.session.revision });
  await step();
  assert.deepEqual(progress(game.session.chatter), { round: 1, pending: 1 });
  await step();
  assert.deepEqual(progress(game.session.chatter), { round: 1, pending: 0 });
  await step();
  assert.deepEqual(progress(game.session.chatter), { round: 2, pending: 4 });
  const logged = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.type === 'chatter_line').map(e => [e.round, e.line, e.roundLines]);
  assert.deepEqual(logged, [[1, 1, undefined], [1, 2, 3], [1, 3, 3], [2, 1, 5]]);
});

test('random_order: every round deals a fresh order, each character once, never the same speaker twice in a row', async t => {
  // Round 1 is dealt reversed, round 2 as is, so round 2 would open with round 1's last speaker.
  const { g, act, kase } = setup(t, 'friends-roundtable', (ids, seed, round) => (round % 2 ? [...ids].reverse() : [...ids]));
  const ids = kase.characters.map(c => c.id);
  await act('start');
  for (let i = 0; i < ids.length * 2; i++) await act('continue');
  const spoken = g.session.thread.map(l => l.character);
  assert.deepEqual(spoken.slice(0, ids.length), [...ids].reverse());
  // Round 2 was dealt in case order; its opener spoke last, so it moves to the end.
  assert.deepEqual(spoken.slice(ids.length), [...ids.slice(1), ids[0]]);
  for (let i = 1; i < spoken.length; i++) assert.notEqual(spoken[i], spoken[i - 1]);
});

test('random_order_replays: a restored round goes on in its logged order', async t => {
  const { g, act, kase, dir } = setup(t, 'friends-roundtable', ids => [ids[2], ids[0], ids[4], ids[1], ids[3]]);
  await act('start');
  await act('continue');
  await act('continue');
  const config = { ...modelConfig({}), economy: economyRules({ budget: 30 }) };
  const game = new Investigations({ dataDir: dir, config, answer: async () => 'fine', cases: [kase], order: ids => [...ids] }).find(g.session.id);
  while (game.session.chatter.pending > 0) await game.mutate('continue', { sessionId: game.session.id, revision: game.session.revision });
  const ids = kase.characters.map(c => c.id);
  assert.deepEqual(game.session.thread.map(l => l.character), [ids[2], ids[0], ids[4], ids[1], ids[3]]);
});

test('random_order_default: the real shuffle still hears everyone once per round', async t => {
  const { g, act, kase } = setup(t, 'friends-roundtable', seededShuffle);
  await act('start');
  for (let i = 0; i < kase.characters.length; i++) await act('continue');
  assert.deepEqual([...g.session.thread.map(l => l.character)].sort(), kase.characters.map(c => c.id).sort());
});

// The seed: one value per game, logged at the start; the same seed replays the same speaking order.
async function talkThrough(t, extra, rounds = 3) {
  const { g, act, kase } = setup(t, 'friends-roundtable', seededShuffle, extra);
  await act('start');
  for (let i = 0; i < kase.characters.length * rounds; i++) await act('continue');
  return g;
}

test('seed_replays: two games with the same seed speak in the same order, round after round', async t => {
  const a = await talkThrough(t, { talkSeed: 'imada-1' });
  const b = await talkThrough(t, { talkSeed: 'imada-1' });
  assert.equal(a.session.talkSeed, 'imada-1');
  assert.deepEqual(a.session.thread.map(l => l.character), b.session.thread.map(l => l.character));
});

test('seed_changes_order: different seeds give different sequences', async t => {
  const seqs = new Set();
  for (const seed of ['1', '2', '3', '4', '5']) seqs.add((await talkThrough(t, { talkSeed: seed }, 2)).session.thread.map(l => l.character).join());
  assert.ok(seqs.size > 1, [...seqs].join(' | '));
});

test('seed_logged_and_hidden: session_started carries the seed; the view and an open export do not', async t => {
  const { g, act, dir } = setup(t, 'friends-roundtable', seededShuffle);
  await act('start');
  const seed = g.session.talkSeed;
  assert.equal(seed, '42069');
  const file = join(dir, 'sessions', readdirSync(join(dir, 'sessions'))[0]);
  assert.equal(JSON.parse(readFileSync(file, 'utf8').split('\n')[0]).talkSeed, seed);
  assert.equal('talkSeed' in g.view().session, false);
  assert.equal(JSON.parse(g.export().split('\n')[0]).talkSeed, null);
});

test('seed_survives_restore: a restored game deals its next rounds from the logged seed', async t => {
  const whole = await talkThrough(t, { talkSeed: 'r' }, 3);
  const { g, act, kase, dir, config } = setup(t, 'friends-roundtable', seededShuffle, { talkSeed: 'r' });
  await act('start');
  for (let i = 0; i < kase.characters.length + 2; i++) await act('continue');
  // The restarted server has another seed configured; the game keeps the one it started with.
  const game = new Investigations({ dataDir: dir, config: { ...config, talkSeed: 'other' }, answer: async () => 'fine', cases: [kase] }).find(g.session.id);
  while (game.session.thread.length < kase.characters.length * 3) await game.mutate('continue', { sessionId: game.session.id, revision: game.session.revision });
  assert.deepEqual(game.session.thread.map(l => l.character), whole.session.thread.map(l => l.character));
});

test('seeded_shuffle: a permutation, the same for the same seed and round', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(seededShuffle(ids, 's', 1), seededShuffle(ids, 's', 1));
  assert.deepEqual([...seededShuffle(ids, 's', 1)].sort(), ids);
  assert.deepEqual(ids, ['a', 'b', 'c', 'd', 'e']);
});

test('talk_seed_env: OVERRIDE_TALK_SEED sets the config seed; empty leaves it out', () => {
  assert.equal(modelConfig({ OVERRIDE_TALK_SEED: ' 42 ' }).talkSeed, '42');
  assert.equal('talkSeed' in modelConfig({ OVERRIDE_TALK_SEED: '' }), false);
});
