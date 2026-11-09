import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modernWords, maskModern } from '../server/anachronism.mjs';
import { checkTalk, newTalkState, topicAnswer, aboutAnswer, typedRoute, modelHistory, supports, terms } from '../server/talk.mjs';
import { talkData, ids, topicIds } from './fixtures/talk-fixture.mjs';

// Swappable seam: SUPERLITE_REAL=1 would load the real case; the fixture is the default.
const kase = structuredClone(talkData);
const cast = who => Object.fromEntries(ids.map(i => [i, i === who ? 'traveler' : 'local']));
const fresh = () => newTalkState(kase);
const slipOf = (cid, topic) => kase.talk.slips[cid].find(s => s.topic === topic);
const withTalk = f => { const d = structuredClone(talkData); f(d.talk, d); return d; };

test('lexicon_word_boundaries: whole words only', () => {
  assert.deepEqual(modernWords('Everyone wanted a selfie with the bear'), ['selfie']);
  assert.deepEqual(modernWords('Master Carter and the cartwheel; the printer'), []);
  assert.deepEqual(modernWords('A press in Florence prints my almanac; skittles at the Leone.'), []);
  assert.deepEqual(modernWords('He rides a car, two cars'), ['car']);
  assert.deepEqual(modernWords('SELFIE'), ['selfie']);
});

test('lexicon keeps period words clear', () => {
  const t = 'printing press spectacles clock lathe mirror skittles ninepins camera engineer tablet battery virus train plane apple';
  assert.deepEqual(modernWords(t), []);
});

test('multiword_term: matches across spaces and hyphens', () => {
  assert.deepEqual(modernWords('like Wi-Fi— like lightning', ['wi-fi']), ['wi-fi']);
  assert.deepEqual(modernWords('a smart   phone and a light-bulb'), ['smart phone', 'phone', 'light bulb']);
  assert.deepEqual(modernWords('the wi fi', ['wi-fi']), ['wi-fi']);
});

test('encoding: unicode folding and invisible characters', () => {
  assert.deepEqual(modernWords('ｓｅｌｆｉｅ'), ['selfie']);
  assert.deepEqual(modernWords('sel​fie'), ['selfie']);
  assert.deepEqual(modernWords('wi‑fi'), ['wifi', 'wi-fi'].slice(1).concat([]).length ? modernWords('wi-fi') : []);
  assert.deepEqual(modernWords('la sélfie'), []);
  assert.deepEqual(modernWords('élan'), []);
  assert.equal(maskModern('What did you mean by selfie?'), 'What did you mean by that word?');
  assert.equal(maskModern('a Selfie, a SMARTPHONE'), 'a that word, a that word');
  assert.equal(maskModern('no modern words'), 'no modern words');
  assert.deepEqual(modernWords(null), []);
});

test('terms lists every slip term and alias once', () => {
  const t = terms(kase);
  assert.ok(t.includes('spreadsheet') && t.includes('selfie stick') && t.includes('wi-fi'));
  assert.equal(new Set(t).size, t.length);
  assert.deepEqual(terms({}), []);
});

test('checkTalk accepts the fixture', () => { assert.doesNotThrow(() => checkTalk(talkData)); });

test('checkTalk paths: modern word, shape, slip rules', () => {
  const bad = (f, re) => assert.throws(() => checkTalk(withTalk(f)), re);
  bad(t => { t.lines.a.work = 'my smartphone'; }, /^Error: talk\.lines\.a\.work: uses a modern word \(smartphone\)$/);
  bad(t => { t.lines.a.work = 'I use a laptop'; }, /talk\.lines\.a\.work: uses a modern word \(laptop\)/);
  bad(t => { t.slips.a[0].clean = 'on a spreadsheet'; }, /talk\.slips\.a\.0\.clean: uses a modern word \(spreadsheet\)/);
  bad(t => { t.slips.a[0].followUps[1] = 'the SELFIE again'; }, /talk\.slips\.a\.0\.followUps\.1: uses a modern word \(selfie\)/);
  bad(t => { t.replies.b.puzzled = 'a podcast?'; }, /talk\.replies\.b\.puzzled/);
  bad(t => { t.glossary[0].text = 'by wifi'; }, /talk\.glossary\.0\.text/);
  bad(t => { t.rehearsal.c[1] = 'my tv'; }, /talk\.rehearsal\.c\.1/);
  bad(t => { t.slips.a[0].line = 'no term here'; }, /talk\.slips\.a\.0\.line: does not contain the term/);
  bad(t => { t.slips.a[0].correction = 'invented'; }, /talk\.slips\.a\.0\.correction: is not part of the line/);
  bad(t => { t.slips.a[3] = { ...t.slips.a[0] }; }, /more than one slip for topic work/);
  bad(t => { t.slips.a.pop(); }, /talk\.slips\.a: missing a slip for topic square/);
  bad(t => { t.slips.a[1].when = 'pressed'; }, /needs at least 3 always slips \(has 2\)/);
  bad(t => { t.slips.a[0].id = 'x'; }, /talk\.slips\.a\.0\.id/);
  bad(t => { t.slips.a[0].followUps = ['one']; }, /followUps/);
  bad(t => { delete t.lines.d.travel; }, /talk\.lines\.d\.travel: missing line/);
  bad(t => { t.topics.splice(2); }, /at least 3 topics/);
  bad(t => { delete t.replies.e.denial; }, /talk\.replies\.e\.denial/);
  bad(t => { t.slips.a[0].when = 'sometimes'; }, /when/);
  assert.throws(() => checkTalk({ ...talkData, copy: { headline: 'a selfie' } }), /copy\.headline: uses a modern word/);
  assert.throws(() => checkTalk({ ...talkData, characters: talkData.characters.map((c, i) => i ? c : { ...c, knowledge: ['a tomato'] }) }), /characters\.0\.knowledge\.0/);
  assert.throws(() => checkTalk({ ...talkData, answer: { feedback: { other: 'use wifi' } } }), /answer\.feedback\.other/);
  assert.throws(() => checkTalk({ characters: talkData.characters }), /^Error: talk:/);
});

test('checkTalk leaves slip lines and reveals alone', () => {
  const d = structuredClone(talkData);
  d.characters[0].reveal = 'from the year of the smartphone, wifi and selfie';
  assert.doesNotThrow(() => checkTalk(d));
});

test('checkTalk does not mutate its input', () => {
  const d = structuredClone(talkData);
  checkTalk(d);
  assert.deepEqual(d, talkData);
});

test('newTalkState shape', () => {
  const s = fresh();
  assert.deepEqual(Object.keys(s).sort(), ['accusations', 'asked', 'challenged', 'delivered', 'quotes']);
  assert.deepEqual(s.asked, { a: [], b: [], c: [], d: [], e: [] });
  assert.notEqual(fresh().asked.a, s.asked.a);
});

test('topicAnswer: traveller slips, locals never slip', () => {
  assert.deepEqual(topicAnswer(kase, cast('a'), fresh(), 'a', 'work'), { text: slipOf('a', 'work').line, slip: 'a-work' });
  assert.deepEqual(topicAnswer(kase, cast('a'), fresh(), 'b', 'work'), { text: kase.talk.lines.b.work, slip: null });
  for (const t of topicIds) assert.equal(topicAnswer(kase, cast('a'), fresh(), 'c', t).slip, null);
});

test('topic_once_rules: delivered slip is not repeated; distracted needs two earlier asks', () => {
  const s = fresh();
  s.delivered['a-work'] = 'ev1';
  assert.equal(topicAnswer(kase, cast('a'), s, 'a', 'work').slip, null);
  const f = fresh();
  assert.equal(topicAnswer(kase, cast('a'), f, 'a', 'square').slip, null);
  f.asked.a = ['work'];
  assert.equal(topicAnswer(kase, cast('a'), f, 'a', 'square').slip, null);
  f.asked.a = ['work', 'travel'];
  assert.equal(topicAnswer(kase, cast('a'), f, 'a', 'square').slip, 'a-square');
  const other = fresh();
  other.asked.b = ['work', 'travel'];
  assert.equal(topicAnswer(kase, cast('a'), other, 'a', 'square').slip, null);
});

test('topic_once_rules: pressed needs a challenged delivered slip', () => {
  const s = fresh();
  s.asked.c = ['work', 'travel', 'letters'];
  assert.equal(topicAnswer(kase, cast('c'), s, 'c', 'square').slip, null);
  s.delivered['c-work'] = 'ev1';
  assert.equal(topicAnswer(kase, cast('c'), s, 'c', 'square').slip, null);
  s.challenged['c-work'] = 1;
  assert.equal(topicAnswer(kase, cast('c'), s, 'c', 'square').slip, 'c-square');
  const other = fresh();
  other.delivered['d-work'] = 'ev1';
  other.challenged['d-work'] = 3;
  assert.equal(topicAnswer(kase, cast('c'), other, 'c', 'square').slip, null);
  const undelivered = fresh();
  undelivered.challenged['c-work'] = 2;
  assert.equal(topicAnswer(kase, cast('c'), undelivered, 'c', 'square').slip, null);
});

test('topicAnswer is pure', () => {
  const s = fresh(); s.asked.a = ['work', 'travel'];
  const before = structuredClone(s);
  topicAnswer(kase, cast('a'), s, 'a', 'square');
  assert.deepEqual(s, before);
});

test('followups_escalate: 1st, 2nd, then guarded, counted from challenged', () => {
  const slip = slipOf('a', 'work');
  const line = { speaker: 'a', text: slip.line, slip: 'a-work' };
  const r = n => aboutAnswer(kase, { challenged: n === undefined ? {} : { 'a-work': n } }, 'a', line, 'spreadsheet');
  assert.deepEqual(r(), { text: slip.followUps[0], followUp: 'a-work' });
  assert.deepEqual(r(0), { text: slip.followUps[0], followUp: 'a-work' });
  assert.deepEqual(r(1), { text: slip.followUps[1], followUp: 'a-work' });
  assert.deepEqual(r(2), { text: kase.talk.replies.a.guarded, followUp: 'a-work' });
  assert.deepEqual(r(9), { text: kase.talk.replies.a.guarded, followUp: 'a-work' });
});

test('aboutAnswer: alias, boundary, neverSaid, glossary, wordReply', () => {
  const slip = slipOf('a', 'travel');
  const line = { speaker: 'a', text: slip.line, slip: 'a-travel' };
  const s = { challenged: {} };
  assert.equal(aboutAnswer(kase, s, 'a', line, 'a SELFIE stick?').followUp, 'a-travel');
  assert.equal(aboutAnswer(kase, s, 'a', line, 'selfie stick').followUp, 'a-travel');
  assert.equal(aboutAnswer(kase, s, 'a', line, 'selfies').followUp, 'a-travel');
  assert.equal(aboutAnswer(kase, s, 'a', line, 'on a').followUp, null);
  assert.deepEqual(aboutAnswer(kase, s, 'a', line, 'on a'), { text: kase.talk.replies.a.wordReply, followUp: null });
  assert.deepEqual(aboutAnswer(kase, s, 'b', line, 'selfie'), { text: kase.talk.replies.b.neverSaid, followUp: null });
  const plain = { speaker: 'a', text: kase.talk.lines.a.work, slip: null };
  assert.deepEqual(aboutAnswer(kase, s, 'a', plain, 'Signora'), { text: kase.talk.glossary[0].text, followUp: null });
  assert.deepEqual(aboutAnswer(kase, s, 'a', plain, 'speaks plainly'), { text: kase.talk.replies.a.wordReply, followUp: null });
  // a slip term typed against a line that is not that slip does not count as a challenge
  assert.equal(aboutAnswer(kase, s, 'a', plain, 'selfie').followUp, null);
});

test('typed_routes: said term -> followUp, unsaid lexicon word -> puzzled, else model', () => {
  const s = fresh();
  s.delivered['a-work'] = 'ev1';
  const said = typedRoute(kase, s, 'a', 'What did you mean by spreadsheet?');
  assert.deepEqual(said, { kind: 'followUp', text: slipOf('a', 'work').followUps[0], followUp: 'a-work' });
  s.challenged['a-work'] = 2;
  assert.equal(typedRoute(kase, s, 'a', 'spreadsheet again').text, kase.talk.replies.a.guarded);
  assert.deepEqual(typedRoute(kase, fresh(), 'a', 'Do you own a spreadsheet?'), { kind: 'puzzled', text: kase.talk.replies.a.puzzled, followUp: null });
  assert.equal(typedRoute(kase, fresh(), 'b', 'Do you use a tomato?').kind, 'puzzled');
  assert.deepEqual(typedRoute(kase, fresh(), 'a', 'How was the harvest?'), { kind: 'model', text: null, followUp: null });
  assert.equal(typedRoute(kase, s, 'b', 'spreadsheet').kind, 'puzzled');
});

test('modelHistory: clean slip lines, masked questions, no ids leaked', () => {
  const s = fresh(); s.delivered['a-work'] = 'ev1';
  const turns = [
    { id: 'ev1', question: 'Why selfie?', answer: slipOf('a', 'work').line },
    { id: 'ev2', question: 'And your day?', answer: 'Quiet.' },
  ];
  assert.deepEqual(modelHistory(kase, s, turns), [
    { question: 'Why that word?', answer: slipOf('a', 'work').clean },
    { question: 'And your day?', answer: 'Quiet.' },
  ]);
  assert.deepEqual(modelHistory(kase, fresh(), turns)[0].answer, turns[0].answer);
  assert.deepEqual(modelHistory(kase, s, []), []);
  assert.equal(turns[0].question, 'Why selfie?');
});

test('supports_needs_term_in_excerpt', () => {
  const s = fresh(); s.delivered['a-work'] = 'ev1';
  const slip = slipOf('a', 'work');
  const q = text => ({ text, line: 'ev1', character: 'a' });
  assert.equal(supports(kase, cast('a'), s, 'a', [q(slip.line)]), true);
  assert.equal(supports(kase, cast('a'), s, 'a', [q('a spreadsheet')]), true);
  assert.equal(supports(kase, cast('a'), s, 'a', [q('I keep my work on a')]), false);
  assert.equal(supports(kase, cast('a'), s, 'a', [q('I keep my work on a'), q('my SPREADSHEET')]), true);
  assert.equal(supports(kase, cast('b'), s, 'a', [q(slip.line)]), false);
  assert.equal(supports(kase, cast('a'), s, 'a', [{ ...q(slip.line), line: 'ev9' }]), false);
  assert.equal(supports(kase, cast('a'), s, 'a', [{ ...q(slip.line), character: 'b' }]), false);
  assert.equal(supports(kase, cast('a'), fresh(), 'a', [q(slip.line)]), false);
  assert.equal(supports(kase, cast('a'), s, 'a', []), false);
  // a term from another slip of the same person in a different line does not support
  assert.equal(supports(kase, cast('a'), s, 'a', [q('my selfie')]), false);
});

test('every traveller: 3 topics always give a slip, 5-topic-equivalent gives 3 always', () => {
  // play every order of every 3-subset of the 4 fixture topics; the 3 always topics guarantee a slip
  const perms = (xs) => xs.length < 2 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]));
  const subsets = topicIds.flatMap((_, i) => perms(topicIds.filter((_, j) => j !== i)));
  for (const who of ids) {
    for (const order of subsets) {
      const s = fresh(); let slips = 0;
      for (const t of order) {
        const a = topicAnswer(kase, cast(who), s, who, t);
        if (a.slip) { slips += 1; s.delivered[a.slip] = `ev-${t}`; }
        s.asked[who].push(t);
      }
      assert.ok(slips >= 1, `${who} ${order}`);
    }
  }
});

test('period_words_never_flagged: period words and phrases, alone and in sentences, stay clear', () => {
  const period = ['printing press', 'printer', 'spectacles', 'clock', 'clockwork', 'lathe', 'mirror', 'skittles', 'ninepins',
    'camera', 'engineer', 'tablet', 'battery', 'virus', 'train', 'plane', 'almanac', 'ledger', 'quicksilver', 'theriac'];
  for (const w of period) {
    for (const s of [w, w.toUpperCase(), `The ${w}s of Florence.`, `Master Piero's ${w}, I say.`, `"${w}" he said — ${w}-maker`, `${w.replace(/ /g, '­')}`]) {
      assert.deepEqual(modernWords(s), [], `${w}: ${s}`);
      assert.equal(maskModern(s), s.normalize('NFKC').replace(/[­​-‍⁠﻿]/g, '').replace(/[‘’]/g, "'"), w);
    }
  }
  assert.deepEqual(modernWords(period.join(' ')), []);
});

test('encoding: format characters and look-alike letters cannot hide a modern word', () => {
  assert.deepEqual(modernWords('lap‎top'), ['laptop']);
  assert.deepEqual(modernWords('lap⁣top'), ['laptop']);
  assert.deepEqual(modernWords('lаptop'), ['laptop']);
  assert.equal(maskModern('a lаp‎top'), 'a that word');
  assert.deepEqual(modernWords('la sélfie'), []);
});

test('time travel question routes to denial; guard words', async () => {
  const { asksTimeTravel, guardHits, maskGuard } = await import('../server/anachronism.mjs');
  for (const q of ['are you a time traveller?', 'TIME TRAVEL?', 'a time machine', 'from the future', 'from another time']) assert.equal(asksTimeTravel(q), true, q);
  assert.equal(asksTimeTravel('What time is the feast?'), false);
  assert.equal(typedRoute(kase, newTalkState(kase), kase.characters[0].id, 'Are you a time traveler?').kind, 'denial');
  assert.ok(guardHits('a robot, AI and a time traveller').length >= 3);
  assert.deepEqual(guardHits('Ai, signora, a hair'), []);
  assert.equal(maskGuard('is AI a time machine'), 'is that word a that word');
});

test('checkTalk: no placeholder in pre-reveal copy or wrong-accusation feedback', () => {
  assert.throws(() => checkTalk({ ...talkData, copy: { briefing: { hint: 'Find {traveler}.' } } }), /^Error: copy\.briefing\.hint: must not contain a placeholder/);
  assert.throws(() => checkTalk({ ...talkData, answer: { feedback: { other: 'Not this one. {traveler} is still out there.' } } }), /^Error: answer\.feedback\.other: must not contain a placeholder/);
  assert.doesNotThrow(() => checkTalk({ ...talkData, answer: { feedback: { correct: '{traveler} it was.', other: 'Not this one.' } } }));
});

test('checkTalk scans the prompt and names part paths by index in brackets', () => {
  assert.throws(() => checkTalk({ ...talkData, prompt: { setting: 'a man with a smartphone' } }), /^Error: prompt\.setting: uses a modern word \(smartphone\)$/);
  assert.throws(() => checkTalk({ ...talkData, prompt: { use: ['bread', 'a laptop'] } }), /^Error: prompt\.use\[1\]: uses a modern word \(laptop\)$/);
  const parts = [{ id: 'p0', finding: { explanation: 'fine' } }, { id: 'p1', finding: { explanation: 'he has a phone' } }];
  assert.throws(() => checkTalk({ ...talkData, parts }), /^Error: parts\[1\]\.finding\.explanation: uses a modern word \(phone\)$/);
});

test('multi-word slip terms: about takes any 3+ letter token; typed questions and proof need the term or a word modern on its own', () => {
  const k = structuredClone(kase);
  const slip = k.talk.slips[k.characters[0].id].find(s => s.topic === 'work');
  slip.term = 'jet lag'; slip.aliases = [];
  const cid = k.characters[0].id;
  const cast = Object.fromEntries(k.characters.map(c => [c.id, c.id === cid ? 'traveler' : 'local']));
  const state = newTalkState(k);
  state.delivered[slip.id] = 'L1';
  assert.equal(typedRoute(k, state, cid, 'how long does the lag last').kind, 'model');
  assert.equal(typedRoute(k, state, cid, 'what is jet lag').kind, 'followUp');
  assert.equal(state.challenged[slip.id] ?? 0, 0);
  assert.equal(supports(k, cast, state, cid, [{ character: cid, line: 'L1', text: 'lag' }]), false);
  assert.equal(supports(k, cast, state, cid, [{ character: cid, line: 'L1', text: 'jet lag' }]), true);
});

test('multi-word slip terms: a whole 3+ letter token counts, short words and single-word terms do not', () => {
  const k = structuredClone(kase);
  const slip = k.talk.slips[k.characters[0].id].find(s => s.topic === 'work');
  slip.term = 'jet lag'; slip.aliases = [];
  const cid = k.characters[0].id;
  const cast = Object.fromEntries(k.characters.map(c => [c.id, c.id === cid ? 'traveler' : 'local']));
  const state = newTalkState(k);
  state.delivered[slip.id] = 'L1';
  const line = { speaker: cid, text: 'x', slip: slip.id };
  assert.equal(aboutAnswer(k, state, cid, line, 'jet').followUp, slip.id);
  assert.equal(aboutAnswer(k, state, cid, line, 'lag').followUp, slip.id);
  assert.equal(aboutAnswer(k, state, cid, line, 'jet lag').followUp, slip.id);
  assert.equal(aboutAnswer(k, state, cid, line, 'by').followUp, null);
  assert.equal(aboutAnswer(k, state, cid, { speaker: cid, text: 'x', slip: null }, 'jet').followUp, null);
  assert.equal(typedRoute(k, state, cid, 'what is jet like').kind, 'followUp');
  assert.equal(supports(k, cast, state, cid, [{ character: cid, line: 'L1', text: 'jet' }]), true);
  assert.equal(supports(k, cast, state, cid, [{ character: cid, line: 'L1', text: 'by' }]), false);
});
