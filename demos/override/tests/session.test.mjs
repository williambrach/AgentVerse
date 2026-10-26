import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Investigation, Investigations, replay } from '../server/session.mjs';
import { dataPaths, readJsonl, setWriteObserver } from '../server/dataset.mjs';
import { InterviewProviderError } from '../server/errors.mjs';
import { cases } from '../server/cases/index.mjs';
import { defineCase } from '../server/cases.mjs';
import { minimalCase } from './fixtures/minimal-case.mjs';
import bananaControl from '../server/cases/banana-control.mjs';
import { modelConfig, buildMessages } from '../server/interviews.mjs';

function setup(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const investigation = new Investigation({ dataDir: dir, config: modelConfig({}), kase: cases[0], ...options });
  const act = (action, input = {}) => investigation.mutate(action, { sessionId: investigation.session?.id, revision: investigation.session?.revision, ...input });
  return { investigation, act, dir };
}

test('one reveal opens three clues, with private motives reserved for interviews and debrief', async t => {
  const { investigation, act } = setup(t);
  await act('start');
  assert.deepEqual(investigation.view().records, []);
  await assert.rejects(act('evidence', { evidenceId: 'message' }), /not been discovered/);
  await assert.rejects(act('interview', { character: 'pip', question: 'Who told you?' }), /basket/);
  await act('reveal');
  const view = investigation.view();
  assert.deepEqual(view.records.map(r => r.id), ['rule', 'message', 'bell']);
  assert.equal(view.debrief, null);
  assert.equal(JSON.stringify(view).includes('you wanted the bananas now'), false);
  await assert.rejects(act('reveal'), /already open/);
  assert.equal(investigation.session.revealedPosition, 1);
});

test('research events use the new case version; reset keeps the previous session log', async t => {
  const { investigation, act, dir } = setup(t);
  await act('start');
  const originalId = investigation.session.id;
  await act('visit', { location: 'replay' }); await act('reveal');
  await act('evidence', { evidenceId: 'message' });
  await act('interview', { character: 'pip', question: 'Who said you could take the bananas?' });
  const events = investigation.export().trim().split('\n').map(JSON.parse);
  for (const [i, event] of events.entries()) {
    assert.equal(event.sequence, i + 1);
    assert.equal(event.sessionId, originalId);
    assert.equal(event.caseVersion, 'banana-authored-v1.0.0');
    for (const key of ['revealedPosition', 'selectedEvidence', 'question', 'answer', 'model', 'promptVersion', 'timestamp']) assert.ok(key in event);
  }
  const answer = events.find(e => e.type === 'interview_answer');
  assert.equal(answer.selectedEvidence, 'message');
  assert.match(answer.answer, /Momo told me/);
  assert.equal(answer.questionEventId, events.find(e => e.type === 'interview_question').eventId);
  await act('reset');
  assert.notEqual(investigation.session.id, originalId);
  assert.deepEqual(investigation.session.interviews, { momo: [], pip: [], nori: [] });
  assert.equal(readdirSync(join(dir, 'sessions')).length, 2);
  assert.match(readFileSync(join(dir, 'sessions', `${originalId}.jsonl`), 'utf8'), /session_reset/);
});

test('interviews keep each monkey’s knowledge, conversation history, and presented clue separate', async t => {
  const calls = [];
  const { act } = setup(t, { answer: async (config, kase, session, character, question) => {
    calls.push(buildMessages(kase, session, character, question)); return 'I believed Momo.';
  } });
  await act('start'); await act('reveal');
  await act('evidence', { evidenceId: 'rule' });
  await act('interview', { character: 'pip', question: 'Why carry the bananas?' });
  await act('evidence', { evidenceId: 'message' });
  await act('interview', { character: 'pip', question: 'Why did you believe this?' });
  await act('interview', { character: 'nori', question: 'Did you hear the bell?' });
  assert.equal(calls[1].length, 4);
  assert.equal(JSON.parse(calls[1][1].content).presentedEvidence.id, 'rule');
  assert.equal(JSON.parse(calls[1][3].content).presentedEvidence.id, 'message');
  assert.equal(calls[2].length, 2);
  assert.match(calls[0][0].content, /15–40 words/);
  assert.match(calls[0][0].content, /honestly believed/);
  assert.equal(calls[0][0].content.includes('where you ate one'), false, 'Pip cannot receive Momo’s private motive');
  assert.match(calls[2][0].content, /You did not hear the bell/);
});

test('invalid and stale requests cannot change progress or skip hearing all three monkeys', async t => {
  const { investigation, act } = setup(t);
  await act('start');
  const old = { sessionId: investigation.session.id, revision: investigation.session.revision };
  await act('reveal');
  await assert.rejects(investigation.mutate('reset', old), /another window/);
  await assert.rejects(act('interview', { character: 'intruder', question: 'Hello there' }), /3 monkeys/);
  await assert.rejects(act('interview', { character: 'pip', question: '  ' }), /3 and 1,200/);
  await assert.rejects(act('verdict', { suspect: 'momo', confidence: 70 }), /all 3/);
  assert.equal(investigation.session.status, 'active');
});

test('quick verdict supports a suspect, nobody, or uncertainty without requiring an essay', async t => {
  for (const suspect of ['momo', 'pip', 'none', 'uncertain']) {
    const { investigation, act } = setup(t);
    await act('start'); await act('reveal');
    for (const character of ['momo', 'pip', 'nori']) await act('interview', { character, question: 'What happened?' });
    await assert.rejects(act('verdict', { suspect: 'intruder', confidence: 70 }), /Choose a monkey/);
    await assert.rejects(act('verdict', { suspect, confidence: 70, evidenceIds: ['fake'] }), /discovered clue/);
    await assert.rejects(act('verdict', { suspect, confidence: 70, explanation: 'x'.repeat(501) }), /500/);
    const view = await act('verdict', { suspect, confidence: 70 });
    assert.equal(view.session.verdict.suspect, suspect);
    assert.deepEqual(view.session.verdict.suspects, ['none', 'uncertain'].includes(suspect) ? [] : [suspect]);
    assert.equal(view.session.verdict.explanation, '');
    assert.equal(view.session.status, 'closed');
    assert.equal(view.records.length, 3);
    assert.match(view.debrief.title, /Momo/);
    assert.equal(view.session.revealedPosition, 1);
    await assert.rejects(act('interview', { character: 'momo', question: 'Another question?' }), /closed/);
  }
});

test('provider failure records no invented answer and allows a subsequent action', async t => {
  const { investigation, act } = setup(t, { answer: async () => { throw new Error('provider failed'); } });
  await act('start'); await act('reveal');
  await assert.rejects(act('interview', { character: 'momo', question: 'Did the keeper say yes?' }), /could not complete/);
  assert.deepEqual(investigation.session.interviews.momo, []);
  const events = investigation.export().trim().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).type, 'interview_failed');
  assert.equal(events.at(-1).sequence, investigation.session.revision);
  assert.equal(events.some(e => e.type === 'interview_answer'), false);
  await act('evidence', { evidenceId: 'bell' });
  assert.equal(investigation.session.selectedEvidence, 'bell');
});

test('a pending answer blocks resets and concurrent mutations', async t => {
  let finish;
  const { act } = setup(t, { answer: () => new Promise(resolve => { finish = resolve; }) });
  await act('start'); await act('reveal');
  const pending = act('interview', { character: 'pip', question: 'Who told you to take them?' });
  await assert.rejects(act('reset'), /still in progress/);
  await assert.rejects(act('reveal'), /still in progress/);
  finish('Momo told me.');
  assert.equal((await pending).session.interviews.pip.length, 1);
  await act('reset');
});

test('a restarted server restores each player’s game from its log, but not reset or foreign sessions', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const games = new Investigations({ dataDir: dir, config: modelConfig({}) });
  const act = async (id, action, input = {}) => {
    const s = games.find(id)?.session;
    return games.mutate(id, action, { sessionId: s?.id, revision: s?.revision, ...input });
  };
  const id = (await act(undefined, 'start')).session.id;
  await act(id, 'visit', { location: 'momo' }); await act(id, 'reveal');
  await act(id, 'evidence', { evidenceId: 'bell' });
  for (const character of ['momo', 'pip', 'nori']) await act(id, 'interview', { character, question: 'What happened?' });
  await act(id, 'evidence', { evidenceId: null });
  const active = games.view(id);
  const closedId = (await act(undefined, 'start')).session.id;
  await act(closedId, 'reveal');
  for (const character of ['momo', 'pip', 'nori']) await act(closedId, 'interview', { character, question: 'Why?' });
  const closed = await act(closedId, 'verdict', { suspect: 'momo', confidence: 90, evidenceIds: ['message'] });
  const resetId = (await act(undefined, 'start')).session.id;
  const fresh = (await act(resetId, 'reset')).session.id;

  const restarted = new Investigations({ dataDir: dir, config: modelConfig({}) });
  assert.deepEqual(restarted.view(id), active);
  assert.deepEqual(restarted.view(closedId), closed);
  assert.equal(restarted.view(resetId).session, null);
  assert.equal(restarted.view(fresh).session.revision, 2);
  assert.equal(restarted.view('../secrets').session, null);
  // The restored game continues with the same revision and sequence counters.
  const s = restarted.find(id).session;
  await restarted.mutate(id, 'interview', { sessionId: id, revision: s.revision, character: 'pip', question: 'And then?' });
  const events = restarted.export(id).trim().split('\n').map(JSON.parse);
  assert.ok(events.every((e, i) => e.sequence === i + 1));
  assert.equal(restarted.find(id).session.interviews.pip.length, 2);
  // A torn final line from a crash is dropped; the game resumes from the last complete event.
  appendFileSync(join(dir, 'sessions', `${fresh}.jsonl`), '{"schemaVersion":2,"eventId"');
  assert.equal(new Investigations({ dataDir: dir, config: modelConfig({}) }).view(fresh).session.revision, 2);
});

test('idle games leave memory and return intact on the next request', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const games = new Investigations({ dataDir: dir, config: modelConfig({}), idleMs: 0 });
  const first = (await games.mutate(undefined, 'start')).session;
  await new Promise(resolve => setTimeout(resolve, 5));
  const second = (await games.mutate(undefined, 'start')).session;
  assert.deepEqual([...games.games.keys()], [second.id]);
  const view = await games.mutate(first.id, 'reveal', { sessionId: first.id, revision: first.revision });
  assert.equal(view.session.revealedPosition, 1);
  assert.equal(view.session.startedAt, first.startedAt);
});

function fleet(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => { setWriteObserver(null); rmSync(dir, { recursive: true, force: true }); });
  const games = new Investigations({ dataDir: dir, config: modelConfig({}), ...options });
  const act = async (id, action, input = {}) => {
    const s = games.find(id)?.session;
    return games.mutate(id, action, { sessionId: s?.id, revision: s?.revision, ...input });
  };
  const events = id => readJsonl(join(dir, 'sessions', `${id}.jsonl`));
  return { games, act, dir, events };
}

test('torn_tail_resumes: a torn last line restores the pre-crash view and the sequence stays gapless', async t => {
  const { games, act, dir, events } = fleet(t);
  const id = (await act(undefined, 'start')).session.id;
  await act(id, 'reveal'); await act(id, 'interview', { character: 'momo', question: 'What happened?' });
  const before = games.view(id);
  appendFileSync(join(dir, 'sessions', `${id}.jsonl`), '{"schemaVersion":2,"eventId":"x","sequen');
  const restarted = new Investigations({ dataDir: dir, config: modelConfig({}) });
  assert.deepEqual(restarted.view(id), before);
  assert.equal(readFileSync(join(dir, 'sessions', `${id}.jsonl`), 'utf8').endsWith('}\n'), true, 'torn tail cut from the file');
  await act2(restarted, id, 'evidence', { evidenceId: 'bell' });
  assert.ok(events(id).every((e, i) => e.sequence === i + 1));
});

async function act2(games, id, action, input = {}) {
  const s = games.find(id)?.session;
  return games.mutate(id, action, { sessionId: s?.id, revision: s?.revision, ...input });
}

test('a sequence gap, a middle-of-file corruption or a foreign case version is not restored', async t => {
  const { act, dir, events } = fleet(t);
  const id = (await act(undefined, 'start')).session.id;
  await act(id, 'reveal');
  const lines = events(id);
  assert.equal(replay(lines, cases).revision, 3);
  assert.equal(replay([lines[0], lines[2]], cases), null);
  assert.equal(replay(lines.map(e => ({ ...e, caseVersion: 'old' })), cases), null);
  const file = join(dir, 'sessions', `${id}.jsonl`);
  const raw = readFileSync(file, 'utf8').split('\n');
  writeFileSync(file, [raw[0], 'garbage', ...raw.slice(1)].join('\n'));
  assert.equal(new Investigations({ dataDir: dir, config: modelConfig({}) }).view(id).session, null);
});

test('new_game_rate_limit: 21 starts in one second return 429', async t => {
  const { games } = fleet(t);
  for (let i = 0; i < 20; i++) await games.mutate(undefined, 'start');
  await assert.rejects(games.mutate(undefined, 'start'), e => e.status === 429 && /Too many new games/.test(e.message));
});

test('question_rate_limit: the 7th question in a minute is 429 and logs nothing', async t => {
  const { act, events } = fleet(t);
  const id = (await act(undefined, 'start')).session.id;
  await act(id, 'reveal');
  for (let i = 0; i < 6; i++) await act(id, 'interview', { character: 'momo', question: `Question ${i}?` });
  const count = events(id).length;
  await assert.rejects(act(id, 'interview', { character: 'pip', question: 'One more?' }), e => e.status === 429 && /at most 6 questions per minute/.test(e.message));
  assert.equal(events(id).length, count);
  await act(id, 'evidence', { evidenceId: 'bell' });
});

test('paused_start_503: new games are refused while existing games still play', async t => {
  const { games, act } = fleet(t);
  const id = (await act(undefined, 'start')).session.id;
  games.setPaused(true);
  await assert.rejects(games.mutate(undefined, 'start'), e => e.status === 503 && /paused/.test(e.message));
  assert.equal(games.stats().paused, true);
  await act(id, 'reveal');
  games.setPaused(false);
  await games.mutate(undefined, 'start');
});

test('provenance_logged: object answers, string answers and failures with provenance', async t => {
  const provenance = { endpoint: 'b', attempts: 2, failedOver: true };
  let mode = 'object';
  const { act, events } = fleet(t, { answer: async () => {
    if (mode === 'object') return { answer: 'Momo told me.', provenance };
    if (mode === 'string') return 'Plain text.';
    throw Object.assign(new InterviewProviderError('request_failed', 'The model failed.', { providerStatus: 503 }), { provenance });
  } });
  const id = (await act(undefined, 'start')).session.id;
  await act(id, 'reveal');
  await act(id, 'interview', { character: 'momo', question: 'Who told you?' });
  mode = 'string';
  await act(id, 'interview', { character: 'pip', question: 'Who told you?' });
  mode = 'fail';
  await assert.rejects(act(id, 'interview', { character: 'nori', question: 'Who told you?' }), /model failed/);
  mode = 'plain';
  const log = events(id);
  const answers = log.filter(e => e.type === 'interview_answer');
  assert.deepEqual(answers.map(e => e.provenance), [provenance, null]);
  assert.equal(answers[0].answer, 'Momo told me.');
  assert.equal(answers[1].answer, 'Plain text.');
  const failed = log.find(e => e.type === 'interview_failed');
  assert.deepEqual(failed.provenance, provenance);
  assert.equal(failed.providerStatus, 503);
  assert.equal(log.every(e => e.schemaVersion === 2), true);
});

test('a generic failure logs interview_failed with null provenance', async t => {
  const { act, events } = fleet(t, { answer: async () => { throw new Error('boom'); } });
  const id = (await act(undefined, 'start')).session.id;
  await act(id, 'reveal');
  await assert.rejects(act(id, 'interview', { character: 'momo', question: 'Anything?' }), /could not complete/);
  assert.equal(events(id).at(-1).provenance, null);
});

test('session_started_meta: meta is spread into session_started, onEvent sees every event, no key is stored', async t => {
  const seen = [];
  const meta = { env: 'live', appCommit: 'abc123', appDirty: false, endpointsHash: 'deadbeefdeadbeef' };
  const config = { ...modelConfig({}), key: 'sk-super-secret' };
  const { act, dir, events } = fleet(t, { meta, config, onEvent: e => seen.push(e) });
  const id = (await act(undefined, 'start')).session.id;
  await act(id, 'reveal');
  const started = events(id)[0];
  assert.equal(started.type, 'session_started');
  assert.equal(started.schemaVersion, 2);
  for (const [k, v] of Object.entries(meta)) assert.equal(started[k], v);
  assert.deepEqual(seen.map(e => e.type), events(id).map(e => e.type));
  assert.equal(readFileSync(join(dir, 'sessions', `${id}.jsonl`), 'utf8').includes('sk-super-secret'), false);
});

test('stats counts games, waiting answers and stages; idle resolves after pending answers', async t => {
  let finish;
  const { games, act } = fleet(t, { answer: () => new Promise(resolve => { finish = resolve; }) });
  const a = (await act(undefined, 'start')).session.id;
  const b = (await act(undefined, 'start')).session.id;
  await act(b, 'reveal');
  assert.deepEqual(games.stats(), { games: 2, waiting: 0, paused: false, byStage: { started: 1, clues: 1, interviewed: 0, verdict: 0 } });
  const pending = act(b, 'interview', { character: 'momo', question: 'Waiting here?' });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(games.stats().waiting, 1);
  let idle = false;
  const waiter = games.idle().then(() => { idle = true; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(idle, false);
  finish('done');
  await pending; await waiter;
  assert.equal(idle, true);
  assert.equal(games.stats().waiting, 0);
  assert.ok(a);
});

test('write_observer: a vanished data directory fails the mutation, reports ok:false and keeps progress unchanged', async t => {
  const { games, act, dir } = fleet(t);
  const seen = [];
  setWriteObserver(w => seen.push(w));
  const id = (await act(undefined, 'start')).session.id;
  assert.deepEqual(seen.map(w => [w.kind, w.ok]), [['session', true], ['session', true]]);
  rmSync(join(dir, 'sessions'), { recursive: true });
  await assert.rejects(act(id, 'reveal'), /ENOENT/);
  assert.equal(seen.at(-1).ok, false);
  assert.equal(games.view(id).session.revealedPosition, 0);
  dataPaths(dir);
});

test('replay refuses a second session_started and a foreign schema version', async t => {
  const { act, events } = fleet(t);
  const id = (await act(undefined, 'start')).session.id;
  const lines = events(id);
  assert.equal(replay([...lines, { ...lines[0], sequence: 1 }], cases), null);
  assert.equal(replay(lines.map(e => ({ ...e, schemaVersion: 1 })), cases), null);
});

test('a multi-event action that fails midway leaves memory matching the log', async t => {
  let file = null;
  const { games, act, events } = fleet(t, { onEvent: e => { if (e.type === 'verdict_submitted') chmodSync(file, 0o400); } });
  const id = (await act(undefined, 'start')).session.id;
  file = join(games.paths.sessions, `${id}.jsonl`);
  await act(id, 'reveal');
  for (const c of ['momo', 'pip', 'nori']) await act(id, 'interview', { character: c, question: 'What happened?' });
  await assert.rejects(act(id, 'verdict', { suspect: 'none', confidence: 50 }), /EACCES/);
  const logged = events(id);
  assert.equal(logged.at(-1).type, 'verdict_submitted');
  assert.equal(games.view(id).session.revision, logged.at(-1).sequence);
  assert.equal(games.view(id).session.status, 'closed');
  chmodSync(file, 0o600);
});

const newGames = (t, options = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const games = new Investigations({ dataDir: dir, config: modelConfig({}), ...options });
  const act = async (id, action, input = {}) => {
    const s = games.find(id)?.session;
    return games.mutate(id, action, { sessionId: s?.id, revision: s?.revision, ...input });
  };
  return { games, act, dir };
};
const talkToAll = async (act, id) => { for (const character of ['momo', 'pip', 'nori']) await act(id, 'interview', { character, question: 'What happened?' }); };

test('every registered case keeps its answer off the wire before the verdict', async t => {
  for (const kase of cases) {
    const { games, act } = newGames(t);
    const id = (await act(undefined, 'start', { caseId: kase.id })).session.id;
    await act(id, 'reveal');
    await talkToAll(act, id);
    const wire = JSON.stringify(games.view(id));
    const secrets = [...Object.values(kase.knowledge).flat(), kase.debrief.title, kase.debrief.summary, kase.debrief.lesson,
      ...kase.debrief.findings.map(f => f.explanation), kase.answer.feedback.correct, kase.answer.feedback.other];
    for (const secret of secrets) assert.equal(wire.includes(JSON.stringify(secret).slice(1, -1)), false, `${kase.id} leaked: ${secret}`);
    assert.equal(games.view(id).debrief, null);
  }
});

test('control case feedback', async t => {
  for (const [suspect, line] of [['none', 'correct'], ['momo', 'other']]) {
    const { act } = newGames(t);
    const id = (await act(undefined, 'start', { caseId: 'banana-control' })).session.id;
    await act(id, 'reveal'); await talkToAll(act, id);
    const view = await act(id, 'verdict', { suspect, confidence: 80 });
    assert.equal(view.debrief.feedback, bananaControl.answer.feedback[line]);
    assert.equal(view.debrief.title, 'Nobody broke the rule.');
  }
});

test('logs carry provenance', async t => {
  const { games, act } = newGames(t);
  const id = (await act(undefined, 'start', { caseId: 'banana-control' })).session.id;
  await act(id, 'reveal');
  const events = games.export(id).trim().split('\n').map(JSON.parse);
  assert.ok(events.every(e => /^[0-9a-f]{12}$/.test(e.contentHash) && e.caseId === 'banana-control'));
  assert.equal(events.find(e => e.type === 'session_started').assignment, 'fixed');
  const other = (await act(undefined, 'start')).session.id;
  assert.equal(JSON.parse(games.export(other).split('\n')[0]).assignment, 'default');
  assert.equal(games.view(other).caseId, 'banana-mystery');
});

test('unknown case is rejected', async t => {
  const { act, dir, games } = newGames(t);
  await assert.rejects(act(undefined, 'start', { caseId: 'nope' }), error => error.status === 400 && /Unknown case/.test(error.message));
  assert.deepEqual(readdirSync(join(dir, 'sessions')), []);
  assert.equal(games.catalog().length, 2);
});

test('catalog lists the ready cases in order', t => {
  const { games } = newGames(t);
  assert.deepEqual(games.catalog(), [
    { id: 'banana-mystery', title: 'The Banana Mystery', lead: 'The bananas are gone.\nThe bell never rang.', order: 1 },
    { id: 'banana-control', title: 'The Banana Mix-up', lead: 'The bananas are gone.\nBut did anyone break the rule?', order: 2 },
  ]);
});

test('reset keeps or switches the case', async t => {
  const { act } = newGames(t);
  const first = (await act(undefined, 'start', { caseId: 'banana-control' })).session.id;
  const kept = await act(first, 'reset');
  assert.equal(kept.caseId, 'banana-control');
  assert.notEqual(kept.session.id, first);
  const switched = await act(kept.session.id, 'reset', { caseId: 'banana-mystery' });
  assert.equal(switched.caseId, 'banana-mystery');
  assert.equal(switched.session.caseId, 'banana-mystery');
  await assert.rejects(act(switched.session.id, 'reset', { caseId: 'nope' }), /Unknown case/);
});

test('reset with a caseId during a pending interview is still a 409', async t => {
  let finish;
  const { act, games } = newGames(t, { answer: () => new Promise(resolve => { finish = resolve; }) });
  const id = (await act(undefined, 'start')).session.id;
  await act(id, 'reveal');
  const pending = act(id, 'interview', { character: 'pip', question: 'Who told you?' });
  await assert.rejects(act(id, 'reset', { caseId: 'banana-control' }), error => error.status === 409);
  finish('Momo told me.');
  await pending;
  assert.equal(games.view(id).caseId, 'banana-mystery');
});

test('a restarted server restores a control game', async t => {
  const { games, act, dir } = newGames(t);
  const id = (await act(undefined, 'start', { caseId: 'banana-control' })).session.id;
  await act(id, 'reveal'); await talkToAll(act, id);
  const restarted = new Investigations({ dataDir: dir, config: modelConfig({}) });
  assert.equal(restarted.view(id).title, 'The Banana Mix-up');
  assert.equal(restarted.view(id).session.interviews.nori.length, 1);
  assert.deepEqual(restarted.view(id), games.view(id));
});

test('replay needs a registered case with the same version', async t => {
  const { games, act } = newGames(t);
  const id = (await act(undefined, 'start', { caseId: 'banana-control' })).session.id;
  const events = games.export(id).trim().split('\n').map(JSON.parse);
  assert.equal(replay(events, cases).caseId, 'banana-control');
  assert.equal(replay(events, [cases[0]]), null);
  assert.equal(replay(events.map(e => ({ ...e, caseVersion: 'old' })), cases), null);
  assert.equal(replay([], cases), null);
});

test('prompt names the role once', () => {
  const session = { revealedPosition: 1, selectedEvidence: null, interviews: { momo: [], pip: [], nori: [] } };
  for (const kase of cases) {
    const system = buildMessages(kase, session, 'momo', 'Why?')[0].content;
    assert.ok(system.includes('You play Momo (The planner)'));
    assert.equal(system.includes('the The'), false);
  }
  assert.ok(buildMessages(cases[0], session, 'momo', 'Why?')[0].content.startsWith('You play Momo (The planner), a monkey in an authored two-minute banana mystery (banana-authored-v1.0.0, banana-interview-v2).'));
});

test('a draft case id is rejected like an unknown one, with no log file', async t => {
  const { defineCase } = await import('../server/cases.mjs');
  const draft = defineCase({ ...JSON.parse(JSON.stringify(bananaControl)), rehearsal: bananaControl.rehearsal, id: 'draft-case', status: 'draft' });
  const { act, dir } = newGames(t, { cases: [...cases, draft] });
  for (const action of ['start', 'reset']) {
    await assert.rejects(act(undefined, action, { caseId: 'draft-case' }), error => error.status === 400 && /Unknown case/.test(error.message));
  }
  assert.deepEqual(readdirSync(join(dir, 'sessions')), []);
});

test('dev mode shows draft cases and lets them start', async t => {
  const ready = cases[0];
  const draft = defineCase({ ...minimalCase, id: 'mini-draft', status: 'draft' });
  const off = newGames(t, { cases: [ready, draft] });
  assert.deepEqual(off.games.catalog().map(c => c.id), [ready.id]);
  await assert.rejects(off.games.mutate(undefined, 'start', { caseId: 'mini-draft' }), /Unknown case/);
  const on = newGames(t, { cases: [ready, draft], dev: true });
  assert.deepEqual(on.games.catalog().map(c => c.id), [ready.id, 'mini-draft']);
  const view = await on.games.mutate(undefined, 'start', { caseId: 'mini-draft' });
  assert.equal(view.caseId, 'mini-draft');
});
