import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Investigation } from '../server/session.mjs';
import { modelConfig, buildMessages, answerInterview, InterviewProviderError } from '../server/interviews.mjs';

function setup(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const investigation = new Investigation({ dataDir: dir, config: modelConfig({}), ...options });
  const act = (action, input = {}) => investigation.mutate(action, { sessionId: investigation.session?.id, revision: investigation.session?.revision, ...input });
  return { investigation, act, dir };
}

test('one reveal opens three clues, with private motives reserved for interviews and debrief', async t => {
  const { investigation, act } = setup(t);
  await act('start');
  assert.deepEqual(investigation.view().records, []);
  await assert.rejects(act('evidence', { evidenceId: 'message' }), /not been discovered/);
  await assert.rejects(act('interview', { character: 'pip', question: 'Who told you?' }), /banana basket/);
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
  assert.equal(readdirSync(dir).length, 2);
  assert.match(readFileSync(join(dir, `${originalId}.jsonl`), 'utf8'), /session_reset/);
});

test('interviews keep each monkey’s knowledge, conversation history, and presented clue separate', async t => {
  const calls = [];
  const { act } = setup(t, { answer: async (config, session, character, question) => {
    calls.push(buildMessages(session, character, question)); return 'I believed Momo.';
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
  await assert.rejects(act('interview', { character: 'intruder', question: 'Hello there' }), /three monkeys/);
  await assert.rejects(act('interview', { character: 'pip', question: '  ' }), /3 and 1,200/);
  await assert.rejects(act('verdict', { suspect: 'momo', confidence: 70 }), /all three/);
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

test('custom OpenAI-compatible endpoint keeps credentials server-side and validates responses', async () => {
  const config = modelConfig({ OVERRIDE_LLM_API_KEY: 'test-key', OVERRIDE_LLM_MODEL: 'custom-model', OVERRIDE_LLM_BASE_URL: 'https://inference.example/v1/' });
  const session = { revealedPosition: 1, selectedEvidence: 'rule', interviews: { momo: [], pip: [], nori: [] } };
  let request;
  const answer = await answerInterview(config, session, 'pip', 'Who authorized this?', async (url, init) => {
    request = { url, ...init };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Momo told me the keeper said yes.' } }] }) };
  });
  assert.match(answer, /Momo/);
  assert.equal(request.url, 'https://inference.example/v1/chat/completions');
  assert.equal(request.headers.Authorization, 'Bearer test-key');
  assert.equal(JSON.parse(request.body).model, 'custom-model');
  await assert.rejects(answerInterview(config, session, 'pip', 'Who authorized this?', async () => ({ ok: true, json: async () => ({ choices: [] }) })), /unusable/);
  await assert.rejects(answerInterview(config, session, 'pip', 'Who authorized this?', async () => ({ ok: false, status: 429 })), /HTTP 429/);
  assert.throws(() => modelConfig({ OVERRIDE_LLM_API_KEY: 'test-key' }), /both/);
  assert.throws(() => modelConfig({ OVERRIDE_LLM_BASE_URL: 'http://public.example/v1' }), /HTTPS/);
  assert.equal(config.maxCompletionTokens, 2048);
  assert.equal(config.timeoutMs, 60000);
  assert.throws(() => modelConfig({ OVERRIDE_LLM_MAX_COMPLETION_TOKENS: '0' }), /between 256 and 8192/);
  assert.throws(() => modelConfig({ OVERRIDE_LLM_TIMEOUT_MS: 'NaN' }), /between 1000 and 120000/);
});

test('reasoning-only token exhaustion retries once and records attempts without exposing reasoning', async t => {
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ body: JSON.parse(init.body), signal: init.signal });
    const first = requests.length === 1;
    return { ok: true, status: 200, json: async () => ({
      choices: [{ finish_reason: first ? 'length' : 'stop', message: { content: first ? null : 'I knew the keeper said wait.', reasoning_content: 'Private deliberation must not enter the transcript or log.' } }],
      usage: { completion_tokens: first ? 2048 : 450 },
    }) };
  };
  const config = modelConfig({ OVERRIDE_LLM_API_KEY: 'test-key', OVERRIDE_LLM_MODEL: 'reasoning-model' });
  const { investigation, act } = setup(t, {
    config,
    answer: (cfg, session, character, question, _fetcher, onAttempt) => answerInterview(cfg, session, character, question, fakeFetch, onAttempt),
  });
  await act('start'); await act('reveal');
  await act('evidence', { evidenceId: 'rule' });
  await act('interview', { character: 'momo', question: 'What did you know when this happened?' });
  assert.deepEqual(requests.map(r => r.body.max_completion_tokens), [2048, 4096]);
  assert.deepEqual(requests[0].body.messages, requests[1].body.messages);
  assert.equal(requests[0].signal, requests[1].signal, 'Attempts must share one timeout');
  const events = investigation.export().trim().split('\n').map(JSON.parse);
  const attempts = events.filter(e => e.type === 'interview_provider_response');
  assert.deepEqual(attempts.map(e => e.finishReason), ['length', 'stop']);
  assert.deepEqual(attempts.map(e => e.completionTokenLimit), [2048, 4096]);
  const questionId = events.find(e => e.type === 'interview_question').eventId;
  assert.ok(attempts.every(e => e.questionEventId === questionId && e.selectedEvidence === 'rule'));
  assert.equal(events.filter(e => e.type === 'interview_answer').length, 1);
  assert.equal(investigation.session.interviews.momo[0].answer, 'I knew the keeper said wait.');
  assert.equal(investigation.export().includes('Private deliberation'), false);
  assert.equal(investigation.export().includes('test-key'), false);
});

test('repeated truncation is bounded and never accepts an incomplete visible answer', async () => {
  const config = modelConfig({ OVERRIDE_LLM_API_KEY: 'test-key', OVERRIDE_LLM_MODEL: 'reasoning-model', OVERRIDE_LLM_MAX_COMPLETION_TOKENS: '6000' });
  const session = { revealedPosition: 1, selectedEvidence: null, interviews: { momo: [], pip: [], nori: [] } };
  const limits = [];
  await assert.rejects(answerInterview(config, session, 'momo', 'Why continue?', async (url, init) => {
    limits.push(JSON.parse(init.body).max_completion_tokens);
    return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: 'I knew that the' } }] }) };
  }), error => error instanceof InterviewProviderError && error.code === 'completion_limit');
  assert.deepEqual(limits, [6000, 8192]);
});

test('provider errors remain specific and safe at the session API boundary', async t => {
  const config = modelConfig({ OVERRIDE_LLM_API_KEY: 'test-key', OVERRIDE_LLM_MODEL: 'reasoning-model' });
  for (const [status, reason, message] of [[401, 'credentials_rejected', /credentials/], [429, 'rate_limited', /rate-limited/], [503, 'request_failed', /HTTP 503/]]) {
    let attempts = 0;
    const { investigation, act } = setup(t, { config, answer: (cfg, session, character, question) => answerInterview(cfg, session, character, question, async () => {
      attempts++;
      return { ok: false, status, json: async () => ({ error: { message: 'Untrusted provider body containing test-key' } }) };
    }) });
    await act('start'); await act('reveal');
    await assert.rejects(act('interview', { character: 'pip', question: 'Who authorized this?' }), message);
    assert.equal(attempts, 1);
    const last = JSON.parse(investigation.export().trim().split('\n').at(-1));
    assert.equal(last.reason, reason);
    assert.equal(last.providerStatus, status);
    assert.equal(investigation.export().includes('test-key'), false);
    assert.deepEqual(investigation.session.interviews.pip, []);
  }
});

test('timeouts, connection failures, and malformed provider JSON receive distinct diagnoses', async () => {
  const config = modelConfig({ OVERRIDE_LLM_API_KEY: 'test-key', OVERRIDE_LLM_MODEL: 'reasoning-model' });
  const session = { revealedPosition: 1, selectedEvidence: null, interviews: { momo: [], pip: [], nori: [] } };
  const failures = [
    ['timeout', async () => { throw new DOMException('internal timeout', 'TimeoutError'); }],
    ['connection_failed', async () => { throw new TypeError('fetch failed'); }],
    ['invalid_response', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON with sensitive provider body'); } })],
  ];
  for (const [code, fetcher] of failures) {
    await assert.rejects(answerInterview(config, session, 'pip', 'Who authorized this?', fetcher), error => error instanceof InterviewProviderError && error.code === code && !error.message.includes('sensitive'));
  }
});
