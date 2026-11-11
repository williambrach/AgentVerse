import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Investigation, Investigations, replay } from '../server/session.mjs';
import { readJsonl } from '../server/dataset.mjs';
import { defineCase } from '../server/cases.mjs';
import { modelConfig, buildMessages } from '../server/interviews.mjs';
import { economyRules, minimumBudget } from '../server/economy.mjs';
import { fiveCase, partCase, agentWorlds } from './fixtures/minimal-case.mjs';
import { talkData } from './fixtures/talk-fixture.mjs';

const rehearsal = modelConfig({});
const live = { ...rehearsal, mode: 'live', model: 'fake' };
const IDS = ['xa', 'xb', 'xc', 'xd', 'xe'];
const OLD = ['a', 'b', 'c', 'd', 'e'];
const rename = id => `x${id}`;

// The talk fixture on ids long enough for a case; xa is the traveller when the cast is the identity.
function buildCase() {
  const d = structuredClone({ ...fiveCase(), rehearsal: undefined });
  const t = structuredClone(talkData);
  d.id = 'mini-talk';
  d.characters = t.characters.map(c => ({ ...c, id: rename(c.id) }));
  const re = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [rename(k), v]));
  d.talk = {
    ...t.talk, lines: re(t.talk.lines), replies: re(t.talk.replies), rehearsal: re(t.talk.rehearsal),
    slips: Object.fromEntries(Object.entries(t.talk.slips).map(([k, list]) => [rename(k), list.map(s => ({ ...s, id: `${rename(k)}-${s.topic}` }))])),
  };
  d.roles = [{ id: 'traveler', label: 'Traveller', hint: 'From another time.' }, { id: 'local', label: 'Local', hint: 'Of this town.' }];
  d.parts = ['traveler', 'locala', 'localb', 'localc', 'locald'].map(id => ({
    id, role: id === 'traveler' ? 'traveler' : 'local', label: 'Townsperson', introduction: 'I live here.', quickQuestion: 'Who are you?',
    knowledge: ['The town stands on a hill.'], finding: { classification: 'c', explanation: 'e' },
  }));
  d.copy = t.copy ? { ...d.copy, headline: t.copy.headline } : d.copy;
  d.debrief = { title: 'The traveller', summary: 'It was found.', lesson: 'Words slip.' };
  d.answer = { feedback: { correct: 'Right, signora.', other: 'Not this one.' } };
  d.tools = { inspect: false, talk: false };
  d.rehearsal = () => 'scripted';
  return d;
}
const kase = defineCase(buildCase(), { worlds: agentWorlds(5) });
const banana = defineCase(fiveCase(), { worlds: agentWorlds(5) });
const same = ids => [...ids];
// identity cast: xa is the traveller

function setup(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'override-talk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const investigation = new Investigation({ dataDir: dir, config: rehearsal, kase, shuffle: same, ...options });
  const act = (action, input = {}) => investigation.mutate(action, { sessionId: investigation.session?.id, revision: investigation.session?.revision, ...input });
  const events = () => readJsonl(join(dir, 'sessions', `${investigation.session.id}.jsonl`));
  return { investigation, act, dir, events };
}
const ask = (act, character, topic) => act('interview', { character, topic });
const lastTurn = (v, c) => v.session.interviews[c].at(-1);

test('topic answers carry state, slips only for the traveller', async t => {
  const { act, investigation } = setup(t);
  await act('start');
  const v1 = await ask(act, 'xa', 'work');
  assert.match(lastTurn(v1, 'xa').answer, /spreadsheet/);
  assert.equal(lastTurn(v1, 'xa').kind, 'topic');
  assert.equal(lastTurn(v1, 'xa').topic, 'work');
  assert.deepEqual(v1.session.talk.asked.xa, ['work']);
  const v2 = await ask(act, 'xb', 'work');
  assert.doesNotMatch(lastTurn(v2, 'xb').answer, /laptop/);
  assert.equal(v2.talk.topics.length, 4);
  assert.deepEqual(v2.tools, { inspect: false, talk: false });
  assert.equal(investigation.session.talk.delivered['xa-work'], lastTurn(v1, 'xa').id);
});

test('about_line_of_other_speaker_is_neverSaid', async t => {
  const { act, investigation } = setup(t);
  await act('start');
  const line = lastTurn(await ask(act, 'xa', 'work'), 'xa').id;
  const v = await act('interview', { character: 'xb', about: { line, text: 'spreadsheet' } });
  assert.equal(lastTurn(v, 'xb').answer, kase.talk.replies.xb.neverSaid);
  assert.equal(lastTurn(v, 'xb').kind, 'about');
  assert.deepEqual(investigation.session.talk.challenged, {});
});

test('topic_twice_400', async t => {
  const { act } = setup(t);
  await act('start');
  await ask(act, 'xb', 'travel');
  await assert.rejects(ask(act, 'xb', 'travel'), e => e.status === 400 && e.message === 'You already asked Berto about Travel.');
  await assert.rejects(act('interview', { character: 'xb', topic: 'nope' }), e => e.status === 400);
  await assert.rejects(act('interview', { character: 'xb', topic: 'work', question: 'Hello there' }), e => e.status === 400);
});

test('about: wording follow-ups on a slip, then the guarded line; excerpt_not_in_line_400', async t => {
  const { act, investigation } = setup(t);
  await act('start');
  const v = await ask(act, 'xa', 'work');
  const line = lastTurn(v, 'xa').id;
  await assert.rejects(act('interview', { character: 'xa', about: { line, text: 'unicorn' } }), e => e.status === 400);
  await assert.rejects(act('interview', { character: 'xa', about: { line: 'nope', text: 'spreadsheet' } }), e => e.status === 400);
  await assert.rejects(act('interview', { character: 'xa', about: { line, text: '   ' } }), e => e.status === 400);
  const a1 = await act('interview', { character: 'xa', about: { line, text: ' spreadsheet ' } });
  assert.equal(lastTurn(a1, 'xa').question, 'What did you mean by “spreadsheet”?');
  assert.equal(lastTurn(a1, 'xa').kind, 'about');
  assert.equal(investigation.session.talk.challenged['xa-work'], 1);
  const a2 = await act('interview', { character: 'xa', about: { line, text: 'spreadsheet' } });
  assert.notEqual(lastTurn(a2, 'xa').answer, lastTurn(a1, 'xa').answer);
  const other = await act('interview', { character: 'xb', about: { line, text: 'spreadsheet' } });
  assert.match(lastTurn(other, 'xb').answer, /never said that/);
});

test('typed: followUp and puzzled are authored; the model is not called', async t => {
  let calls = 0;
  const { act } = setup(t, { config: live, answer: async () => { calls += 1; return 'Xa says: plain bread.'; } });
  await act('start');
  const p = await act('interview', { character: 'xb', question: 'Tell me about your smartphone' });
  assert.match(lastTurn(p, 'xb').answer, /do not know that word/);
  assert.equal(calls, 0);
  const m = await act('interview', { character: 'xb', question: 'What bread do you like?' });
  assert.equal(lastTurn(m, 'xb').answer, 'Xa says: plain bread.');
  assert.equal(calls, 1);
});

test('typed_guard_retry_then_deflect', async t => {
  const replies = ['I own a laptop', 'Fresh bread', 'my laptop again', 'a laptop still'];
  let n = 0;
  const { act, events } = setup(t, { config: live, answer: async () => ({ answer: replies[n++], provenance: null, reasoning: null }) });
  await act('start');
  const ok = await act('interview', { character: 'xb', question: 'What do you eat?' });
  assert.equal(lastTurn(ok, 'xb').answer, 'Fresh bread');
  assert.equal(n, 2);
  const deflected = await act('interview', { character: 'xc', question: 'What do you eat?' });
  assert.match(lastTurn(deflected, 'xc').answer, /let us speak of something else/);
  assert.equal(n, 4);
  const guards = events().filter(e => e.type === 'interview_answer').map(e => e.hidden.guard);
  assert.deepEqual(guards, ['retried', 'deflected']);
});

test('rehearsal typed rotates the authored lines', async t => {
  const { act } = setup(t);
  await act('start');
  const a = await act('interview', { character: 'xb', question: 'What bread do you like?' });
  const b = await act('interview', { character: 'xb', question: 'And what cheese?' });
  assert.match(lastTurn(a, 'xb').answer, /ask me more/);
  assert.match(lastTurn(b, 'xb').answer, /day is long/);
});

test('the model never sees a slip line or a lexicon word', async t => {
  const { act, investigation } = setup(t);
  await act('start');
  const v = await ask(act, 'xa', 'work');
  const s = structuredClone(investigation.session);
  const messages = buildMessages(kase, s, 'xa', 'Why a selfie?');
  const text = JSON.stringify(messages);
  assert.doesNotMatch(text, /spreadsheet/);
  assert.doesNotMatch(text, /selfie/);
  assert.ok(text.includes('in order, as always'));
  assert.ok(lastTurn(v, 'xa'));
});

test('quotes: whole line, excerpt, duplicate, limit, other lines; quote_limit_30', async t => {
  const { act } = setup(t);
  await act('start');
  const v = await ask(act, 'xa', 'work');
  const line = lastTurn(v, 'xa').id;
  const answer = lastTurn(v, 'xa').answer;
  const q1 = await act('quote', { line });
  assert.equal(q1.session.talk.quotes[0].text, answer);
  assert.equal(q1.session.talk.quotes[0].character, 'xa');
  await assert.rejects(act('quote', { line }), e => e.status === 400);
  await assert.rejects(act('quote', { line, text: 'ab' }), e => e.status === 400);
  await assert.rejects(act('quote', { line, text: 'not in the line' }), e => e.status === 400);
  await assert.rejects(act('quote', { line: 'nope' }), e => e.status === 400);
  const q2 = await act('quote', { line, text: ' spreadsheet ' });
  assert.equal(q2.session.talk.quotes[1].text, 'spreadsheet');
  const id = q2.session.talk.quotes[1].id;
  const q3 = await act('unquote', { quote: id });
  assert.equal(q3.session.talk.quotes.length, 1);
  await assert.rejects(act('unquote', { quote: id }), e => e.status === 400);
  // fill to 30 with distinct excerpts of the whole answer
  let view = q3;
  const pieces = [...new Set(answer.split('').flatMap((_, i) => [answer.slice(i, i + 4).trim(), answer.slice(i, i + 5).trim(), answer.slice(i, i + 6).trim()]))]
    .filter(x => x.length >= 3 && x !== answer && x !== 'spreadsheet');
  for (let i = 0; view.session.talk.quotes.length < 30; i++) view = await act('quote', { line, text: pieces[i] });
  assert.equal(view.session.talk.quotes.length, 30);
  await assert.rejects(act('quote', { line, text: pieces[40] }), e => e.status === 400 && /30/.test(e.message));
});

test('cited_quote_of_other_person_400 and quote-count bounds', async t => {
  const { act } = setup(t);
  await act('start');
  const a = lastTurn(await ask(act, 'xa', 'work'), 'xa');
  const b = lastTurn(await ask(act, 'xb', 'work'), 'xb');
  await act('quote', { line: a.id });
  const v = await act('quote', { line: b.id });
  const [qa, qb] = v.session.talk.quotes;
  await assert.rejects(act('accuse', { character: 'xa', quotes: [qb.id] }), e => e.status === 400 && e.message === 'Choose 1 to 3 of Alba\'s quotes.');
  await assert.rejects(act('accuse', { character: 'xa', quotes: [qa.id, qb.id] }), e => e.status === 400);
  await assert.rejects(act('accuse', { character: 'xa', quotes: [] }), e => e.status === 400);
  await assert.rejects(act('accuse', { character: 'xa', quotes: [qa.id, qa.id] }), e => e.status === 400);
  await assert.rejects(act('accuse', { character: 'zz', quotes: [qa.id] }), e => e.status === 400);
});

async function wrongAccusation(act, character = 'xb') {
  const v = lastTurn(await ask(act, character, 'work'), character);
  const q = (await act('quote', { line: v.id })).session.talk.quotes.at(-1);
  return act('accuse', { character, quotes: [q.id] });
}

test('same_feedback_wrong_or_unsupported', async t => {
  const { act, investigation } = setup(t);
  await act('start');
  // xb is a local: wrong person
  const wrong = await wrongAccusation(act, 'xb');
  // xa is the traveller but cites a quote with no slip term: unsupported
  await ask(act, 'xa', 'work');
  const plain = (await act('quote', { line: lastTurn(investigation.view(), 'xa').id, text: 'I keep my work' })).session.talk.quotes.at(-1);
  const unsupported = await act('accuse', { character: 'xa', quotes: [plain.id] });
  assert.equal(wrong.session.status, 'active');
  assert.equal(unsupported.session.status, 'active');
  const [w, u] = unsupported.session.talk.accusations;
  assert.equal(w.feedback, 'Not this one.');
  assert.equal(w.feedback, u.feedback);
  assert.equal(u.denial, 'Alba says: you accuse the wrong person.');
  assert.equal(Object.hasOwn(w, 'hidden'), false);
});

test('score_formula: 0 wrong gives 5, 1 gives 3, 3 gives 1', async t => {
  for (const [wrongs, score] of [[0, 5], [1, 3], [3, 1], [4, 1]]) {
    const { act, investigation } = setup(t);
    await act('start');
    for (let i = 0; i < wrongs; i++) await act('accuse', { character: 'xb', quotes: [(await act('quote', { line: lastTurn(await ask(act, 'xb', ['work', 'travel', 'letters', 'square'][i]), 'xb').id })).session.talk.quotes.at(-1).id] });
    const line = lastTurn(await ask(act, 'xa', 'work'), 'xa').id;
    const q = (await act('quote', { line, text: 'on a spreadsheet' })).session.talk.quotes.at(-1);
    const done = await act('accuse', { character: 'xa', quotes: [q.id] });
    assert.equal(done.session.status, 'closed');
    assert.equal(done.session.verdict.score, score, `${wrongs} wrong`);
    assert.equal(done.debrief.score, score);
    assert.equal(done.debrief.wrong, wrongs);
    assert.equal(done.debrief.feedback, 'Right, signora.');
    assert.equal(done.debrief.reveal.character, 'xa');
    assert.match(done.debrief.reveal.text, /smartphone/);
    assert.deepEqual(done.debrief.slips.map(s => [s.character, s.term, s.cited]), [['xa', 'spreadsheet', true]]);
    assert.equal(investigation.session.verdict.roles.xa, 'traveler');
    assert.equal(investigation.session.verdict.roles.xb, 'local');
  }
});

test('export_strips_hidden_while_open, and a closed export keeps it', async t => {
  const { act, investigation, events } = setup(t);
  await act('start');
  const line = lastTurn(await ask(act, 'xa', 'work'), 'xa').id;
  const q = (await act('quote', { line, text: 'on a spreadsheet' })).session.talk.quotes.at(-1);
  await wrongAccusation(act, 'xb');
  assert.ok(events().some(e => e.hidden));
  const open = investigation.export();
  assert.equal(open.includes('"hidden"'), false);
  assert.equal(open.includes('xa-work'), false);
  assert.equal(JSON.parse(open.split('\n')[0]).cast, null);
  await act('accuse', { character: 'xa', quotes: [q.id] });
  assert.equal(investigation.export().includes('"hidden"'), true);
});

test('replay_restores_talk', async t => {
  const { act, investigation, events } = setup(t);
  await act('start');
  const l1 = lastTurn(await ask(act, 'xa', 'work'), 'xa').id;
  await ask(act, 'xa', 'travel');
  await act('interview', { character: 'xa', about: { line: l1, text: 'spreadsheet' } });
  const q = (await act('quote', { line: l1, text: 'spreadsheet' })).session.talk.quotes[0];
  const q2 = (await act('quote', { line: l1 })).session.talk.quotes[1];
  await act('unquote', { quote: q2.id });
  await wrongAccusation(act, 'xb');
  const restored = replay(events(), [kase]);
  assert.deepEqual(restored.talk, investigation.session.talk);
  assert.deepEqual(restored.interviews, investigation.session.interviews);
  assert.equal(restored.talk.quotes.length, 2);
  assert.equal(restored.talk.challenged['xa-work'], 1);
  assert.deepEqual(restored.talk.asked.xa, ['work', 'travel']);
  assert.ok(q.id);
  // a closed game restores its verdict and debrief
  const done = await act('accuse', { character: 'xa', quotes: [q.id] });
  assert.equal(done.session.status, 'closed');
  const again = replay(events(), [kase]);
  assert.equal(again.status, 'closed');
  assert.equal(again.verdict.accusation.wrong, 1);
});

test('disk replay through Investigations keeps the talk view', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-talk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const make = () => new Investigations({ dataDir: dir, config: rehearsal, cases: [kase], shuffle: same });
  const one = make();
  const started = await one.mutate(undefined, 'start', { caseId: 'mini-talk' });
  const id = started.session.id;
  const v = await one.mutate(id, 'interview', { sessionId: id, revision: started.session.revision, character: 'xa', topic: 'work' });
  const two = make();
  assert.deepEqual(two.view(id).session.talk, v.session.talk);
  assert.deepEqual(two.view(id).session.interviews, v.session.interviews);
});

test('tools_off_409 and verdict_action_400', async t => {
  const { act, investigation } = setup(t);
  await act('start');
  await ask(act, 'xa', 'work');
  await assert.rejects(act('inspect', { character: 'xa' }), e => e.status === 409 && e.message === 'Not in this case.');
  await assert.rejects(act('continue'), e => e.status === 409 && e.message === 'Not in this case.');
  await assert.rejects(act('verdict', { roles: {}, confidence: 50 }), e => e.status === 400 && e.message === 'Accuse the traveller with quotes instead.');
  assert.ok(Object.values(investigation.view().session.inspectable).every(x => x === false));
});

test('topic and follow-up questions are free; a typed question costs one ask', async t => {
  const { act, events } = setup(t);
  const start = await act('start');
  const v = await ask(act, 'xa', 'work');
  assert.equal(v.session.economy.spent, start.session.economy.spent);
  const line = lastTurn(v, 'xa');
  const a = await act('interview', { character: 'xa', about: { line: line.id, text: line.answer.split(' ').slice(-2).join(' ') } });
  assert.equal(a.session.economy.spent, start.session.economy.spent);
  const typed = await act('interview', { character: 'xb', question: 'How is the bread today?' });
  assert.equal(typed.session.economy.spent, start.session.economy.spent + typed.session.economy.costs.ask);
  const spends = events().filter(e => e.type === 'interview_answer').map(e => e.spend.cost);
  assert.deepEqual(spends, [0, 0, typed.session.economy.costs.ask]);
});

test('no ask-everyone reserve in a talk case: typed questions to one person run until the coins do', async t => {
  const budget = minimumBudget();
  const { act } = setup(t, { config: { ...rehearsal, economy: economyRules({ budget }) } });
  let v = await act('start');
  const ask = v.session.economy.costs.ask;
  for (let n = 0; n < budget / ask; n++) v = await act('interview', { character: 'xa', question: `How is the bread today, number ${n}?` });
  assert.equal(v.session.economy.spent, budget);
  await assert.rejects(act('interview', { character: 'xa', question: 'And tomorrow?' }), /Not enough coins/);
  const topic = await act('interview', { character: 'xb', topic: 'work' });
  assert.equal(topic.session.economy.spent, budget);
});

test('client reserve is zero in a talk case, like the server', () => {
  const src = readFileSync(new URL('../client/main.ts', import.meta.url), 'utf8');
  assert.match(src, /function reserveFor\(target: string \| null\): number \{\s*const session = state\.session;\s*if \(!session \|\| state\.talk\) return 0;/);
});

test('the smallest coin budget still lets every topic be asked, so the case stays solvable', async t => {
  const budget = String(minimumBudget());
  const { act, investigation } = setup(t, { config: { ...rehearsal, economy: economyRules({ budget: Number(budget) }) } });
  let v = await act('start');
  assert.equal(v.session.economy.budget, Number(budget));
  for (const topic of kase.talk.topics.map(x => x.id)) for (const c of IDS) v = await ask(act, c, topic);
  assert.equal(v.session.economy.spent, 0);
  assert.ok(Object.keys(investigation.session.talk.delivered).length >= 3);
  const slipLine = investigation.session.talk.delivered['xa-work'];
  const turn = v.session.interviews.xa.find(x => x.id === slipLine);
  const term = kase.talk.slips.xa.find(x => x.id === 'xa-work').term;
  const quoted = await act('quote', { line: turn.id, text: term });
  const done = await act('accuse', { character: 'xa', quotes: [quoted.session.talk.quotes.at(-1).id] });
  assert.equal(done.session.status, 'closed');
});

test('non_talk_cases_unchanged', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-talk-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const inv = new Investigation({ dataDir: dir, config: rehearsal, kase: banana, shuffle: same });
  const act = (a, i = {}) => inv.mutate(a, { sessionId: inv.session?.id, revision: inv.session?.revision, ...i });
  await act('start');
  const view = await act('interview', { character: 'momo', question: 'What happened?' });
  assert.deepEqual(Object.keys(view.session.interviews.momo[0]), ['question', 'answer', 'timestamp']);
  assert.equal('talk' in view.session, false);
  assert.equal('talk' in view, false);
  assert.equal('tools' in view, false);
  const events = readJsonl(join(dir, 'sessions', `${inv.session.id}.jsonl`));
  for (const e of events) for (const k of ['kind', 'topic', 'about', 'hidden']) assert.equal(k in e, false, `${e.type} ${k}`);
  await assert.rejects(act('quote', { line: 'x' }), e => e.status === 404);
  await assert.rejects(act('interview', { character: 'momo', topic: 'work' }), e => e.status === 400);
  assert.equal(inv.export().split('\n').length, readFileSync(join(dir, 'sessions', `${inv.session.id}.jsonl`), 'utf8').split('\n').length);
});

test('buildMessages works on a talk-case session without talk state', () => {
  const session = { cast: Object.fromEntries(IDS.map((id, i) => [id, kase.parts[i].id])), interviews: Object.fromEntries(IDS.map(id => [id, []])) };
  const messages = buildMessages(kase, session, 'xa', 'Hello there');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(JSON.parse(messages[1].content).question, 'Hello there');
});

test('time travel questions get the authored denial for everyone, and model answers naming it are deflected', async t => {
  let calls = 0, reply = 'I am a time traveller from far away.';
  const { act, events } = setup(t, { config: live, answer: async () => { calls += 1; return reply; } });
  await act('start');
  for (const c of ['xa', 'xb']) {
    const v = await act('interview', { character: c, question: 'Are you a Time-Traveller from the future?' });
    assert.equal(lastTurn(v, c).answer, kase.talk.replies[c].denial);
  }
  assert.equal(calls, 0);
  assert.ok(events().filter(e => e.type === 'interview_answer').every(e => e.hidden.followUp === null && e.hidden.slip === null));
  const v = await act('interview', { character: 'xb', question: 'What bread do you like?' });
  assert.equal(lastTurn(v, 'xb').answer, kase.talk.replies.xb.deflect);
  assert.equal(calls, 2);
  reply = 'As an AI, I like bread.';
  const w = await act('interview', { character: 'xc', question: 'Tell me about bread today' });
  assert.equal(lastTurn(w, 'xc').answer, kase.talk.replies.xc.deflect);
  reply = 'Ai, signora, bread is good.';
  const ok = await act('interview', { character: 'xd', question: 'Tell me about bread today' });
  assert.equal(lastTurn(ok, 'xd').answer, reply);
});

test('multi-word slip: a whole token counts for about; proof needs the term or a word modern on its own', async t => {
  const d = buildCase();
  const s = d.talk.slips.xa.find(x => x.topic === 'travel');
  s.term = 'selfie stick'; s.aliases = [];
  s.line = 'Alba says: I keep my travel on a selfie stick, as always.';
  const multi = defineCase(d, { worlds: agentWorlds(5) });
  const play = async () => {
    const r = setup(t, { kase: multi });
    await r.act('start');
    const line = lastTurn(await ask(r.act, 'xa', 'travel'), 'xa').id;
    return { ...r, line };
  };
  { // about "stick" -> first follow-up; about "by"-like short or unrelated word -> wordReply
    const { act, line, investigation } = await play();
    const a = await act('interview', { character: 'xa', about: { line, text: 'stick' } });
    assert.match(lastTurn(a, 'xa').answer, /travel one|\(travel one\)/);
    assert.equal(investigation.session.talk.challenged['xa-travel'], 1);
    const w = await act('interview', { character: 'xa', about: { line, text: 'keep' } });
    assert.doesNotMatch(lastTurn(w, 'xa').answer, /\(travel/);
  }
  for (const [text, solves] of [['selfie stick', true], ['selfie', true], ['stick', false], ['on a', false], ['always', false]]) {
    const { act, line } = await play();
    const q = (await act('quote', { line, text })).session?.talk.quotes.at(-1) ?? null;
    if (!q) continue;
    const r = await act('accuse', { character: 'xa', quotes: [q.id] });
    assert.equal(r.session.status === 'closed', solves, text);
  }
  { // a local with the same words and no slip gets the plain wordReply
    const { act } = await play();
    const lb = lastTurn(await ask(act, 'xb', 'travel'), 'xb');
    const r = await act('interview', { character: 'xb', about: { line: lb.id, text: 'plainly' } });
    assert.doesNotMatch(lastTurn(r, 'xb').answer, /\(travel/);
  }
});
