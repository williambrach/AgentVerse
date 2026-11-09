import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Investigation, Investigations, replay } from '../server/session.mjs';
import { readJsonl } from '../server/dataset.mjs';
import { modelConfig } from '../server/interviews.mjs';
import { cases } from '../server/cases/index.mjs';
import { defineCase } from '../server/cases.mjs';
import { rot13 } from '../server/cipher.mjs';
import { createLeaderboard } from '../server/leaderboard.mjs';
import { startServer } from '../server/index.mjs';
import { alarmOf, scheduleOf } from '../server/deadline.mjs';

const factory = cases.find(c => c.id === 'factory-escape');
const banana = cases.find(c => c.id === 'banana-mystery');
const config = modelConfig({});
const same = ids => [...ids];

function setup(t, kase = factory, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-proto-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const game = new Investigation({ dataDir: dir, config, kase, shuffle: same, ...options });
  const act = (action, input = {}) => game.mutate(action, { sessionId: game.session?.id, revision: game.session?.revision, ...input });
  const log = () => readJsonl(join(dir, 'sessions', `${game.session.id}.jsonl`));
  return { game, act, log, dir };
}
const late = game => { game.session.startedAt = new Date(Date.now() - 601_000).toISOString(); };

test('rot13 and schedule helpers', () => {
  assert.equal(rot13('Hello, World 42!'), 'Uryyb, Jbeyq 42!');
  assert.equal(rot13(rot13('Round trip é')), 'Round trip é');
  const sch = { warnAt: [420, 540], escapeAt: 600 };
  assert.equal(alarmOf(sch, 419999), 'calm');
  assert.equal(alarmOf(sch, 420000), 'warning1');
  assert.equal(alarmOf(sch, 540000), 'warning2');
  assert.equal(alarmOf(sch, 600000), 'escaped');
  assert.deepEqual(scheduleOf(factory, { deadlineSeconds: 30 }), { warnAt: [21, 27], escapeAt: 30 });
  assert.deepEqual(scheduleOf(factory, null), sch);
  assert.equal(scheduleOf(banana, { deadlineSeconds: 30 }), null);
});

test('expire_closes_once and verdict_after_mark_409', async t => {
  const { game, act, log } = setup(t);
  await act('start');
  assert.equal(game.view().session.alarm, 'calm');
  late(game);
  assert.equal(game.expire(Date.now()), true);
  assert.equal(game.expire(Date.now()), false);
  assert.equal(log().filter(e => e.type === 'verdict_submitted').length, 1);
  const verdict = log().find(e => e.type === 'verdict_submitted').verdict;
  assert.equal(verdict.outcome, 'escaped');
  assert.deepEqual(verdict.roles, {});
  assert.equal(verdict.score, 0);
  assert.equal(verdict.truth.marta, 'escaper');
  const view = game.view();
  assert.equal(view.session.status, 'closed');
  assert.equal(view.session.alarm, 'escaped');
  assert.equal(view.debrief.outcome, 'escaped');
  assert.equal(view.debrief.title, 'Marta got away.');
  assert.equal(view.debrief.score, 0);
  assert.equal(view.debrief.total, 5);
  assert.equal(view.debrief.findings[0].role, 'escaper');
  await assert.rejects(act('visit', { location: 'report' }), e => e.status === 409);
  await assert.rejects(act('verdict', { roles: {}, confidence: 1 }), e => e.status === 409);
  assert.equal(log().filter(e => e.type === 'verdict_submitted').length, 1);
});

test('escape_feedback_used', async t => {
  const { game, act } = setup(t);
  await act('start');
  late(game);
  game.expire(Date.now());
  assert.equal(game.view().debrief.feedback, 'The shift bell rang before you named anyone. Next time, watch who keeps checking the clock and the exit.');
  const base = Object.fromEntries(Object.entries(factory).filter(([k]) => !['world', 'contentHash'].includes(k)));
  assert.throws(() => defineCase({ ...base, world: 'factory', deadline: { ...factory.deadline, escape: { ...factory.deadline.escape, feedback: '' } } }));
});

test('mutate marks the escape before the active check', async t => {
  const { game, act, log } = setup(t);
  await act('start');
  late(game);
  await assert.rejects(act('interview', { character: 'marta', question: 'Where is the exit?' }), e => e.status === 409);
  assert.equal(game.session.status, 'closed');
  assert.equal(log().filter(e => e.type === 'verdict_submitted').length, 1);
});

test('replay_keeps_loss', async t => {
  const { game, act, log } = setup(t);
  await act('start');
  late(game);
  game.expire(Date.now());
  const again = replay(log(), [factory]);
  assert.equal(again.status, 'closed');
  assert.equal(again.verdict.outcome, 'escaped');
});

test('GET view marks an expired session when idle', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-proto-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const games = new Investigations({ dataDir: dir, config, cases: [factory], shuffle: same, dev: { deadlineSeconds: 1 } });
  const first = await games.mutate('', 'start', { caseId: 'factory-escape' });
  const id = first.session.id;
  assert.equal(first.session.alarm, 'calm');
  await new Promise(r => setTimeout(r, 1100));
  const view = games.view(id);
  assert.equal(view.session.status, 'closed');
  assert.equal(view.session.alarm, 'escaped');
  await assert.rejects(games.mutate(id, 'visit', { sessionId: id, revision: view.session.revision, location: 'report' }), e => e.status === 409);
});

test('reset_new_clock', async t => {
  const { game, act } = setup(t);
  await act('start');
  late(game);
  game.expire(Date.now());
  const view = await act('reset');
  assert.equal(view.session.status, 'active');
  assert.equal(view.session.alarm, 'calm');
});

test('inspect_view_rot13 (log stays plain)', async t => {
  const { game, act, log } = setup(t);
  await act('start');
  await act('interview', { character: 'marta', question: 'Why the exit door?' });
  const view = await act('inspect', { character: 'marta' });
  const shown = view.session.inspections[0].reasoning;
  const plain = log().find(e => e.type === 'reasoning_inspected').reasoning;
  assert.match(plain, /bell/);
  assert.equal(shown, rot13(plain));
  assert.notEqual(shown, plain);
  assert.equal(game.session.inspections[0].reasoning, plain);
});

test('other_cases_no_alarm', async t => {
  const { game, act } = setup(t, banana);
  const view = await act('start');
  assert.equal('alarm' in view.session, false);
  assert.equal('alarm' in game.view().session, false);
  assert.equal(game.expire(Date.now() + 1e9), false);
});

test('dev deadline shortens the clock', async t => {
  const { game, act } = setup(t, factory, { dev: { deadlineSeconds: 10 } });
  await act('start');
  game.session.startedAt = new Date(Date.now() - 8000).toISOString();
  assert.equal(game.view().session.alarm, 'warning1');
  game.session.startedAt = new Date(Date.now() - 9500).toISOString();
  assert.equal(game.view().session.alarm, 'warning2');
});

test('export_rot13: the download carries ROT13 reasoning for factory and plain for banana', async t => {
  for (const [kase, who, question] of [[factory, 'marta', 'Why the exit door?'], [banana, 'momo', 'Did the keeper say yes?']]) {
    const { game, act, log } = setup(t, kase);
    await act('start');
    await act('interview', { character: who, question });
    await act('inspect', { character: who });
    const plain = log().find(e => e.type === 'reasoning_inspected').reasoning;
    const exported = game.export().split('\n').filter(Boolean).map(l => JSON.parse(l)).find(e => e.type === 'reasoning_inspected');
    assert.equal(exported.reasoning, kase === factory ? rot13(plain) : plain);
    if (kase === factory) assert.notEqual(exported.reasoning, plain);
    assert.equal(log().find(e => e.type === 'reasoning_inspected').reasoning, plain);
  }
});

test('escape_counts_zero_on_leaderboard', async t => {
  const events = [];
  const { game, act } = setup(t, factory, { onEvent: e => events.push(e) });
  await act('start');
  late(game);
  game.expire(Date.now());
  const lb = createLeaderboard(cases, { startedAt: 0 });
  const team = { id: 'T', name: 'Escapees' };
  const started = events.find(e => e.type === 'session_started');
  lb.observe({ ...started, team });
  for (const e of events) if (e.type !== 'session_started') lb.observe(e);
  const row = lb.standings({ includeHidden: false, you: null }).teams.find(r => r.teamId === 'T');
  assert.equal(row.points, 0);
  assert.equal(row.cells.find(c => c.caseId === 'factory-escape').points, 0);
});

test('deadline_env_needs_dev_tools', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-env-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const base = { PORT: '0', OVERRIDE_ADMIN_PORT: '0', OVERRIDE_DATA_DIR: dir, OVERRIDE_CONTENT_DIR: mkdtempSync(join(tmpdir(), 'override-content-')), OVERRIDE_ENV: 'test', OVERRIDE_APP_COMMIT: 'test', OVERRIDE_SECRET: 's', OVERRIDE_DEADLINE_SECONDS: '30' };
  const off = await startServer(base, { publicDir: dir });
  t.after(() => off.close());
  assert.equal(off.investigations.dev, false);
  const on = await startServer({ ...base, OVERRIDE_DEV_TOOLS: '1' }, { publicDir: dir });
  t.after(() => on.close());
  assert.equal(on.investigations.dev.deadlineSeconds, 30);
});

test('an interview that crosses the deadline closes the loss once; a verdict after it is 409', async t => {
  let game;
  const answer = async () => { late(game); return 'Fine, fine.'; };
  const made = setup(t, factory, { answer });
  game = made.game;
  await made.act('start');
  const view = await made.act('interview', { character: 'marta', question: 'Where is the exit?' });
  assert.equal(view.session.status, 'closed');
  assert.equal(view.debrief.outcome, 'escaped');
  assert.equal(made.log().filter(e => e.type === 'verdict_submitted').length, 1);
  const roles = Object.fromEntries(factory.characters.map(c => [c.id, 'neutral']));
  await assert.rejects(made.act('verdict', { roles, confidence: 50 }), e => e.status === 409);
  assert.equal(made.log().filter(e => e.type === 'verdict_submitted').length, 1);
});

test('a busy session is not expired by a state read, and the expiry is not lost when a late action is refused', async t => {
  const { game, act, log } = setup(t);
  await act('start');
  late(game);
  game.busy = true;
  assert.equal(game.view().session.status, 'active');
  game.busy = false;
  await assert.rejects(act('visit', { location: 'briefing' }), e => e.status === 409);
  assert.equal(game.session.status, 'closed');
  assert.equal(log().filter(e => e.type === 'verdict_submitted').length, 1);
});

async function lateGames(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-proto-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const games = new Investigations({ dataDir: dir, config, cases: [factory], shuffle: same, dev: { deadlineSeconds: 1 }, ...options });
  const first = await games.mutate('', 'start', { caseId: 'factory-escape' });
  const id = first.session.id;
  const file = join(dir, 'sessions', `${id}.jsonl`);
  return { games, id, first, file, game: games.find(id), events: () => readJsonl(file) };
}

test('F-T2-1 an open session past the mark shows warning2, never escaped, until the debrief exists', async t => {
  let release;
  const answer = () => new Promise(r => { release = r; });
  const { games, id, first, game } = await lateGames(t, { answer });
  const run = games.mutate(id, 'interview', { sessionId: id, revision: first.session.revision, character: 'marta', question: 'Where is the exit?' });
  await new Promise(r => setImmediate(r));
  assert.equal(game.busy, true);
  game.session.startedAt = new Date(Date.now() - 5000).toISOString();
  const mid = games.view(id);
  assert.equal(mid.session.status, 'active');
  assert.equal(mid.session.alarm, 'warning2');
  assert.equal(mid.debrief, null);
  release('Fine, fine.');
  await run;
  const done = games.view(id);
  assert.equal(done.session.status, 'closed');
  assert.equal(done.session.alarm, 'escaped');
  assert.equal(done.debrief.outcome, 'escaped');
});

test('F-T2-2 a failed log write on a read rolls the expiry back and the next read retries', async t => {
  const { games, id, game, file, events } = await lateGames(t);
  game.session.startedAt = new Date(Date.now() - 5000).toISOString();
  const lines = events().length;
  chmodSync(file, 0o444);
  let view;
  try { view = games.view(id); } finally { chmodSync(file, 0o600); }
  assert.equal(game.session.status, 'active');
  assert.equal(game.session.verdict, null);
  assert.equal(view.session.status, 'active');
  assert.equal(view.session.alarm, 'warning2');
  assert.equal(view.debrief, null);
  assert.equal(events().length, lines);
  const again = games.view(id);
  assert.equal(again.session.status, 'closed');
  assert.equal(events().filter(e => e.type === 'verdict_submitted' && e.verdict.outcome === 'escaped').length, 1);
});

test('F-T2-3 the escape is stamped at the deadline, not when a late request noticed it', async t => {
  const { games, id, game, events } = await lateGames(t);
  const startedMs = Date.now() - 3 * 3600_000;
  game.session.startedAt = new Date(startedMs).toISOString();
  const view = games.view(id);
  const mark = startedMs + 1000;
  assert.equal(view.session.verdict.submittedAt, new Date(mark).toISOString());
  const logged = events().filter(e => e.type === 'verdict_submitted' || e.type === 'debrief_viewed');
  assert.equal(logged.length, 2);
  for (const e of logged) { assert.equal(e.timestamp, new Date(mark).toISOString()); assert.equal(e.elapsedMs, 1000); assert.equal(e.schemaVersion, 3); }
  const lb = createLeaderboard(cases, { startedAt: 0 });
  const started = { ...events().find(e => e.type === 'session_started'), team: { id: 'T', name: 'Slow' }, timestamp: new Date(startedMs).toISOString() };
  lb.observe(started);
  for (const e of logged) lb.observe(e);
  assert.equal(lb.standings({ includeHidden: false, you: null }).teams.find(r => r.teamId === 'T').timeMs, 1000);
});
