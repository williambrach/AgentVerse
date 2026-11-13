import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/index.mjs';
import { Investigations } from '../server/session.mjs';
import { InterviewProviderError } from '../server/errors.mjs';
import { modelConfig } from '../server/interviews.mjs';
import { readJsonl } from '../server/dataset.mjs';
import { defineCase } from '../server/cases.mjs';
import { partCase, agentWorlds } from './fixtures/minimal-case.mjs';
import { until } from './helpers/until.mjs';

// A sink that records every line, plus the raw sequence for assertions.
function collectingSink() {
  const lines = [];
  return { lines, opened: true, line(obj) { lines.push(obj); }, end() {}, fail(error) { lines.push({ t: 'fail', status: 502, error: error.message }); } };
}
const ts = (lines, t) => lines.filter(l => l.t === t);
// A client's fold: deltas accumulate per label, a scrub wipes that label's buffer.
const joined = (lines, t, a) => {
  let out = '';
  for (const l of lines) {
    if (l.t === t && l.a === a) out += l.text;
    else if (l.t === 'scrub' && l.a === a) out = '';
  }
  return out;
};

function liveGames(t, { answer, cases = null, extraConfig = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-stream-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = modelConfig({ OVERRIDE_LLM_API_KEY: 'k', OVERRIDE_LLM_MODEL: 'm', ...extraConfig });
  const games = new Investigations({ dataDir: dir, config, cases: cases ?? [kase3], shuffle: ids => [...ids], answer });
  return { dir, games, config, events: id => readJsonl(join(dir, 'sessions', `${id}.jsonl`)) };
}
const kase3 = defineCase(partCase, { worlds: agentWorlds(3) });

async function started(games) {
  const view = await games.mutate(undefined, 'start', {});
  return view.session.id;
}

// ---- streaming through the session ----

test('rehearsal answers stream: accepted, start, delta chunks, then the same view a buffered call gives', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-stream-reh-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const games = new Investigations({ dataDir: dir, config: modelConfig({}), cases: [kase3], shuffle: ids => [...ids] });
  const view = await games.mutate(undefined, 'start', {});
  const id = view.session.id;
  const sink = collectingSink();
  const question = 'What did you see by the picnic blanket yesterday evening?';
  const fresh = await games.mutate(id, 'interview', { sessionId: id, revision: view.session.revision, character: 'momo', question }, { sink, queueDepth: 3 });
  const accepted = ts(sink.lines, 'accepted')[0];
  assert.equal(accepted.t, 'accepted');
  assert.equal(accepted.queued, 3);
  assert.equal(typeof accepted.questionEventId, 'string');
  assert.deepEqual(ts(sink.lines, 'start'), [{ t: 'start', a: 'c1', attempt: 1, endpoint: 'rehearsal' }]);
  const answer = fresh.session.interviews.momo[0].answer;
  assert.equal(answer, `scripted boss: ${question}`);
  assert.equal(joined(sink.lines, 'delta', 'c1'), answer);
  assert.ok(ts(sink.lines, 'delta').length > 1, 'the line arrives in pieces');
  assert.equal(sink.lines.at(-1).t, 'delta', 'the session itself says nothing past the last piece');
});

test('live deltas and provenance: content is not committed from the stream, only the validated answer', async t => {
  const { games } = liveGames(t, { answer: async (cfg, k, s, cid, q, ctx) => {
    ctx.onStart?.(ctx.label ?? 'c1', { attempt: 1, endpoint: 'a' });
    ctx.onDelta(ctx.label ?? 'c1', 'content', 'Never ');
    ctx.onDelta(ctx.label ?? 'c1', 'content', 'heard it. ');
    ctx.onDelta(ctx.label ?? 'c1', 'content', 'Guessed snack time.');
    return { answer: 'Never heard it. Guessed snack time.', provenance: { endpoint: 'a', streamed: true, firstTokenMs: 120 }, reasoning: null };
  } });
  const id = await started(games);
  const sink = collectingSink();
  const fresh = await games.mutate(id, 'interview', { sessionId: id, revision: 2, character: 'momo', question: 'What happened?' }, { sink });
  assert.equal(joined(sink.lines, 'delta', 'c1'), 'Never heard it. Guessed snack time.');
  assert.equal(fresh.session.interviews.momo[0].answer, 'Never heard it. Guessed snack time.');
  const logged = readJsonl(join(games.paths.sessions, `${id}.jsonl`)).find(e => e.type === 'interview_answer');
  assert.equal(logged.answer, 'Never heard it. Guessed snack time.');
  assert.equal(logged.provenance.streamed, true);
});

test('reasoning stays hidden until the player watches, then catches up and streams; the charge waits for the commit', async t => {
  let gate;
  const release = new Promise(resolve => { gate = resolve; });
  const { games } = liveGames(t, { answer: async (cfg, k, s, cid, q, ctx) => {
    const label = ctx.label ?? 'c1';
    ctx.onStart?.(label, { attempt: 1, endpoint: 'a' });
    ctx.onDelta(label, 'reasoning', 'I hope nobody noticed ');
    ctx.onDelta(label, 'reasoning', 'the basket. ');
    await release;
    ctx.onDelta(label, 'content', 'I slept through it.');
    return { answer: 'I slept through it.', provenance: { endpoint: 'a' }, reasoning: 'I hope nobody noticed the basket.' };
  } });
  const id = await started(games);
  const sink = collectingSink();
  const pending = games.mutate(id, 'interview', { sessionId: id, revision: 2, character: 'momo', question: 'What happened?' }, { sink });
  await until(() => games.find(id).live?.labels.get('c1')?.reasoning?.length > 0); // wait for reasoning to reach the server buffer
  assert.deepEqual(ts(sink.lines, 'reasoning'), [], 'reasoning never precedes the Watch');
  // Watch live: a normal action during the interview is still refused.
  await assert.rejects(games.mutate(id, 'inspect', { sessionId: id, revision: 3, character: 'momo' }), e => e.status === 409 && /interview is still in progress/.test(e.message));
  const viewWhile = await games.mutate(id, 'inspect', { sessionId: id, character: 'momo', live: true, questionEventId: ts(sink.lines, 'accepted')[0].questionEventId });
  assert.ok(viewWhile.session, 'watch returns the current view');
  const catchup = ts(sink.lines, 'reasoning').map(l => l.text).join('');
  assert.equal(catchup, 'I hope nobody noticed the basket. ', 'the whole buffered line replays');
  gate();
  const fresh = await pending;
  assert.equal(fresh.session.interviews.momo[0].answer, 'I slept through it.');
  assert.equal(fresh.session.economy.charges.inspect.used, 1, 'the watched line pays its five coins at the commit');
  const insp = readJsonl(join(games.paths.sessions, `${id}.jsonl`)).find(e => e.type === 'reasoning_inspected');
  assert.equal(insp.reasoning, 'I hope nobody noticed the basket.');
  assert.equal(insp.watched, true);
  assert.equal(insp.sourceEventId, readJsonl(join(games.paths.sessions, `${id}.jsonl`)).find(e => e.type === 'interview_answer').eventId);
});

test('watching a line with no reasoning costs nothing', async t => {
  let gate;
  const release = new Promise(resolve => { gate = resolve; });
  const { games } = liveGames(t, { answer: async (cfg, k, s, cid, q, ctx) => {
    const label = ctx.label ?? 'c1';
    ctx.onDelta(label, 'content', 'Nothing to add.');
    await release;
    return { answer: 'Nothing to add.', provenance: { endpoint: 'a' }, reasoning: null };
  } });
  const id = await started(games);
  const sink = collectingSink();
  const pending = games.mutate(id, 'interview', { sessionId: id, revision: 2, character: 'momo', question: 'What?' }, { sink });
  await until(() => ts(sink.lines, 'accepted')[0]?.questionEventId);
  const qe = ts(sink.lines, 'accepted')[0].questionEventId;
  const watch = await games.mutate(id, 'inspect', { sessionId: id, character: 'momo', live: true, questionEventId: qe });
  assert.ok(watch.session, 'the watch of a line that has not thought yet still answers');
  gate();
  const fresh = await pending;
  assert.equal(fresh.session.economy.charges.inspect.used, 0);
  assert.equal(fresh.session.inspections.length, 0);
  assert.equal(readJsonl(join(games.paths.sessions, `${id}.jsonl`)).some(e => e.type === 'reasoning_inspected'), false);
});

test('a live watch must name the interview in flight: wrong id, wrong character and a finished line are refused', async t => {
  let gate;
  const release = new Promise(resolve => { gate = resolve; });
  const { games } = liveGames(t, { answer: async (cfg, k, s, cid, q, ctx) => {
    ctx.onDelta?.('c1', 'content', 'Wait for it.');
    await release;
    return { answer: 'Wait for it.', provenance: { endpoint: 'a' }, reasoning: 'hmm' };
  } });
  const id = await started(games);
  const sink = collectingSink();
  const pending = games.mutate(id, 'interview', { sessionId: id, revision: 2, character: 'momo', question: 'What?' }, { sink });
  await until(() => ts(sink.lines, 'accepted')[0]?.questionEventId);
  const qe = ts(sink.lines, 'accepted')[0].questionEventId;
  await assert.rejects(games.mutate(id, 'inspect', { sessionId: id, character: 'momo', live: true, questionEventId: 'x' }), e => e.status === 409 && /still in progress/.test(e.message));
  await assert.rejects(games.mutate(id, 'inspect', { sessionId: id, character: 'pip', live: true, questionEventId: qe }), e => e.status === 409 && /still in progress/.test(e.message));
  gate();
  const fresh = await pending;
  // After the commit the same Watch request is served by the history path.
  const late = await games.mutate(id, 'inspect', { sessionId: id, revision: fresh.session.revision, character: 'momo', live: true, questionEventId: qe });
  assert.equal(late.session.economy.charges.inspect.used, 1);
});

test('a guard retry scrubs the streamed false start and keeps the clean answer', async t => {
  const guarded = defineCase({ ...partCase, id: 'mini-guarded', version: 'mini-guarded-v1', parts: partCase.parts.map(p => ({ ...p, role: 'villain' })), guard: { roles: ['villain'], deflect: 'I will say no more.', quiet: 'A monkey shrugs.', words: ['phone'] } }, { worlds: agentWorlds(3) });
  let calls = 0;
  const { games } = liveGames(t, { cases: [guarded], answer: async (cfg, k, s, cid, q, ctx) => {
    calls++;
    const label = ctx.label ?? 'c1';
    ctx.onStart?.(label, { attempt: 1, endpoint: 'a' });
    if (calls === 1) {
      ctx.onDelta(label, 'content', 'My phone rang.');
      return { answer: 'My phone rang.', provenance: { endpoint: 'a' }, reasoning: 'I said phone' };
    }
    ctx.onDelta(label, 'content', 'I heard nothing.');
    return { answer: 'I heard nothing.', provenance: { endpoint: 'a' }, reasoning: null };
  } });
  const id = await started(games);
  const sink = collectingSink();
  const fresh = await games.mutate(id, 'interview', { sessionId: id, revision: 2, character: 'momo', question: 'What did you hear?' }, { sink });
  assert.equal(calls, 2);
  assert.equal(fresh.session.interviews.momo[0].answer, 'I heard nothing.');
  assert.deepEqual(ts(sink.lines, 'scrub').map(l => l.a), ['c1']);
  assert.deepEqual(ts(sink.lines, 'start').map(l => l.a), ['c1', 'c2']);
  assert.equal(joined(sink.lines, 'delta', 'c1'), '');
  assert.equal(joined(sink.lines, 'delta', 'c2'), 'I heard nothing.');
  const guardEvent = readJsonl(join(games.paths.sessions, `${id}.jsonl`)).find(e => e.type === 'interview_answer');
  assert.equal(guardEvent.hidden.guard, 'retried');
});

test('a failing streamed answer ends with a fail line and records interview_failed', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-http-fail-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = modelConfig({ OVERRIDE_LLM_API_KEY: 'k', OVERRIDE_LLM_MODEL: 'm' });
  const games = new Investigations({ dataDir: dir, config, cases: [kase3], shuffle: ids => [...ids], answer: async (cfg, k, s, cid, q, ctx) => {
    ctx.onDelta?.('c1', 'content', 'Half an ');
    throw new InterviewProviderError('timeout', 'too slow', {});
  } });
  const { base, cookie } = await appWith(t, { investigations: games });
  const start = await (await fetch(`${base}/api/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cookie }, body: '{}' })).json();
  const res = await postStream(base, { Cookie: `override_session=${start.session.id}` }, 'interview', { sessionId: start.session.id, revision: start.session.revision, character: 'momo', question: 'What?', stream: true });
  const lines = await readLines(res);
  assert.equal(lines[0].t, 'accepted');
  assert.equal(lines[1].t, 'delta');
  assert.equal(lines.at(-1).t, 'fail');
  assert.equal(lines.at(-1).status, 502);
  assert.match(lines.at(-1).error, /too slow/);
  const events = readJsonl(join(dir, 'sessions', `${start.session.id}.jsonl`));
  assert.equal(events.some(e => e.type === 'interview_failed' && e.reason === 'timeout'), true);
  assert.equal(events.some(e => e.type === 'interview_answer'), false);
});

// ---- the NDJSON route ----

async function appWith(t, { investigations, accessCode = '' }) {
  const app = createApp({ investigations, accessCode, secret: 'test-secret' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(async () => { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); });
  const base = `http://127.0.0.1:${app.address().port}`;
  let cookie = {};
  if (accessCode) {
    const r = await fetch(`${base}/api/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: accessCode }) });
    cookie = { Cookie: r.headers.get('set-cookie').split(';')[0] };
  }
  return { base, cookie };
}
async function postStream(base, cookie, path, body) {
  const res = await fetch(`${base}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cookie }, body: JSON.stringify(body) });
  return res;
}
async function readLines(res) {
  const text = await res.text();
  return text.trim().split('\n').map(l => JSON.parse(l));
}

test('POST /api/interview with stream: answers in NDJSON and ends with the view', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-http-stream-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const games = new Investigations({ dataDir: dir, config: modelConfig({}), cases: [kase3], shuffle: ids => [...ids] });
  const { base, cookie } = await appWith(t, { investigations: games });
  const start = await (await fetch(`${base}/api/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cookie }, body: '{}' })).json();
  const session = `override_session=${start.session.id}`;
  const res = await postStream(base, { Cookie: session }, 'interview', { sessionId: start.session.id, revision: start.session.revision, character: 'momo', question: 'What happened?', stream: true });
  assert.equal(res.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
  assert.equal(res.headers.get('x-accel-buffering'), 'no');
  const lines = await readLines(res);
  assert.equal(lines[0].t, 'accepted');
  assert.equal(lines.at(-1).t, 'view');
  assert.equal(lines.filter(l => l.t === 'delta').map(l => l.text).join(''), 'scripted boss: What happened?');
  assert.equal(lines.at(-1).session.interviews.momo[0].answer, 'scripted boss: What happened?');
});

test('stream: false in live mode keeps the plain JSON body', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-http-stream2-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = modelConfig({ OVERRIDE_LLM_API_KEY: 'k', OVERRIDE_LLM_MODEL: 'm', OVERRIDE_LLM_STREAM: 'false' });
  const games = new Investigations({ dataDir: dir, config, shuffle: ids => [...ids], answer: async () => ({ answer: 'buffered only', provenance: null, reasoning: null }) });
  const { base, cookie } = await appWith(t, { investigations: games });
  const start = await (await fetch(`${base}/api/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cookie }, body: '{}' })).json();
  const res = await postStream(base, { Cookie: `override_session=${start.session.id}` }, 'interview', { sessionId: start.session.id, revision: start.session.revision, character: 'momo', question: 'Who?', stream: true });
  assert.match(res.headers.get('content-type'), /application\/json/);
  const body = await res.json();
  assert.equal(body.session.interviews.momo[0].answer, 'buffered only');
});

test('a client that hangs up still commits the streamed answer, and a mid-stream provider failure arrives as fail', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-http-stream3-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let gate;
  const release = new Promise(resolve => { gate = resolve; });
  const games = new Investigations({ dataDir: dir, config: modelConfig({ OVERRIDE_LLM_API_KEY: 'k', OVERRIDE_LLM_MODEL: 'm' }), shuffle: ids => [...ids], answer: async (cfg, k, s, cid, q, ctx) => {
    ctx.onDelta?.('c1', 'content', 'Half an answer');
    await release;
    return { answer: 'Half an answer, fully told.', provenance: { endpoint: 'a' }, reasoning: null };
  } });
  const { base, cookie } = await appWith(t, { investigations: games });
  const start = await (await fetch(`${base}/api/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cookie }, body: '{}' })).json();
  const sid = start.session.id;
  const req = http.request(`${base}/api/interview`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `override_session=${sid}` } }, res => {
    // read the first line, then hang up mid-stream
    res.once('data', () => req.destroy());
  });
  req.end(JSON.stringify({ sessionId: sid, revision: start.session.revision, character: 'momo', question: 'What?', stream: true }));
  await until(() => { const game = games.find(sid); return game?.live?.questionEventId != null; });
  gate();
  await until(() => readJsonl(join(dir, 'sessions', `${sid}.jsonl`)).some(e => e.type === 'interview_answer' && e.answer === 'Half an answer, fully told.'));
  assert.ok(true, 'the answer committed although no one was reading');
});
