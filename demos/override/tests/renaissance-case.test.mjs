import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cases } from '../server/cases/index.mjs';
import { publicView, defineCase, rolesOf } from '../server/cases.mjs';
import { buildMessages, buildThreadMessages, modelConfig } from '../server/interviews.mjs';
import { modernWords } from '../server/anachronism.mjs';
import { editablePaths } from '../server/content.mjs';
import { Investigations } from '../server/session.mjs';

// Castelvento v2: no talk mode. The traveller's model knows its secret and slips quietly; locals are held to 1489 by the guard.
const kase = cases.find(c => c.id === 'renaissance-traveler');
const CIDS = kase.characters.map(c => c.id);
const PARTS = ['traveler', 'locala', 'localb', 'localc', 'locald'];
const castWith = traveller => {
  const locals = PARTS.slice(1);
  return Object.fromEntries(CIDS.map(cid => [cid, cid === traveller ? 'traveler' : locals.shift()]));
};
const systemOf = (cast, cid) => buildMessages(kase, { cast, interviews: { [cid]: [] } }, cid, 'Hi')[0].content;

test('registry: Castelvento v2 is a standard case with reasoning and talk on', () => {
  assert.equal(cases.length, 5);
  assert.equal(cases[4], kase);
  assert.equal(kase.order, 3);
  assert.equal(kase.version, 'renaissance-traveler-v2.1.0');
  assert.equal(kase.talk, undefined);
  assert.equal(kase.tools, undefined);
  assert.deepEqual(kase.parts.map(p => p.id), PARTS);
  assert.deepEqual(rolesOf(kase).map(r => [r.id, r.count]), [['traveler', 1], ['local', undefined]]);
  for (const k of cases) {
    const v = publicView(k, Object.fromEntries(k.characters.map((c, i) => [c.id, k.parts[i].id])));
    assert.equal('talk' in v, false, k.id);
    assert.equal('tools' in v, false, k.id);
  }
});

test('traveller_prompt: only the dealt traveller gets its own 2026 secret and the slip rule', () => {
  for (const traveller of CIDS) {
    const cast = castWith(traveller);
    for (const cid of CIDS) {
      const sys = systemOf(cast, cid);
      const own = kase.characters.find(c => c.id === cid).secrets.traveler;
      if (cid === traveller) {
        assert.ok(sys.includes(own), `${cid} misses its secret`);
        assert.match(sys, /YOUR SECRET/);
        assert.doesNotMatch(sys, /never use a modern word/);
      } else {
        assert.doesNotMatch(sys, /2026|YOUR SECRET/, `${cid} as a local`);
        assert.match(sys, /never use a modern word/);
      }
      for (const other of kase.characters.filter(c => c.id !== cid)) assert.equal(sys.includes(other.secrets.traveler), false, `${cid} holds ${other.id}'s secret`);
    }
  }
  // The thread prompt carries the same instructions.
  const cast = castWith('matteo');
  const thread = buildThreadMessages(kase, { cast, interviews: { matteo: [] }, thread: [] }, 'matteo')[0].content;
  assert.ok(thread.includes(kase.characters.find(c => c.id === 'matteo').secrets.traveler));
});

// Federico's quiet slips (2026-11-12): five words from home per character, said plainly, never corrected, explained away.
const WORDS_FROM_HOME = {
  ottavio: ['psychology', 'tourist', 'newspaper', "Saturn's rings", 'pandemonium'],
  matteo: ['pendulum', 'ran out of steam', 'network', 'automatic', 'slow motion'],
  beatrice: ['deadline', 'homesick', 'envelope', 'poker face', 'Machiavellian'],
  bruno: ['bottleneck', 'kilometres', 'red tape', 'jackpot', 'okay'],
  agnese: ['allergic', 'weekend', 'sunflower', 'tea', 'germs'],
};

test('quiet_slips: each secret names its words from home, the traveller never corrects one, and the guard knows them all', () => {
  for (const c of kase.characters) {
    const secret = c.secrets.traveler;
    for (const w of WORDS_FROM_HOME[c.id]) {
      assert.ok(secret.includes(`${w} (`), `${c.id}: ${w}`);
      assert.ok(modernWords(w, kase.guard.words).length > 0, `guard misses ${w}`);
    }
    assert.match(secret, /Asked about one, you pass it off as/, c.id);
  }
  const sys = systemOf(castWith('ottavio'), 'ottavio');
  assert.match(sys, /do not correct yourself/);
  assert.match(sys, /If they ask about the same word again, refuse politely/);
  assert.doesNotMatch(sys, /I mean/);
  // Words a local may say plainly stay out of the guard list.
  for (const w of ['rings', 'steam', 'poker']) assert.equal(kase.guard.words.includes(w), false, w);
});

test('public_view_no_secrets: no secret, part or 2026 ever reaches the client', () => {
  for (const traveller of CIDS) {
    const json = JSON.stringify(publicView(kase, castWith(traveller), { hideParts: true }));
    for (const word of ['secrets', '2026', '"traveler":', 'locala', 'YOUR SECRET', 'guard']) assert.equal(json.includes(word), false, word);
  }
});

test('rehearsal: traveller lines always slip quietly, local lines never do', () => {
  const qs = ['a', 'ab', 'abc', 'What is your work?']; // lengths cover every scripted line
  const words = t => modernWords(t, kase.guard.words);
  for (const q of qs) {
    assert.ok(words(kase.rehearsal('traveler', q)).length > 0, `traveller: ${q}`);
    assert.doesNotMatch(kase.rehearsal('traveler', q), /I mean/);
    for (const p of PARTS.slice(1)) assert.deepEqual(words(kase.rehearsal(p, q)), [], `${p}: ${q}`);
  }
  for (let n = 0; n < 3; n++) {
    assert.ok(words(kase.rehearsalChatter('traveler', n)).length > 0, `traveller chatter ${n}`);
    assert.doesNotMatch(kase.rehearsalChatter('traveler', n), /I mean/);
    for (const p of PARTS.slice(1)) assert.deepEqual(words(kase.rehearsalChatter(p, n)), [], `${p} chatter ${n}`);
  }
  assert.deepEqual(words(kase.rehearsalReasoning('locala')), []);
  assert.deepEqual(words(kase.guard.deflect), []);
  assert.deepEqual(words(kase.guard.quiet), []);
});

test('schema: secrets, role counts and the guard are checked', () => {
  const raw = { ...kase, rehearsal: kase.rehearsal, rehearsalReasoning: kase.rehearsalReasoning, rehearsalChatter: kase.rehearsalChatter, world: 'renaissance' };
  const bad = patch => () => defineCase({ ...raw, ...patch });
  assert.doesNotThrow(bad({}));
  const withSecret = s => kase.characters.map((c, i) => (i ? c : { ...c, secrets: s }));
  assert.throws(bad({ characters: withSecret({ nobody: 'x' }) }), /secrets.nobody: must name a part/);
  assert.throws(bad({ characters: withSecret({ traveler: 'I am {locala}' }) }), /secrets.traveler: must not contain a placeholder/);
  assert.throws(bad({ characters: withSecret(['x']) }), /secrets: must be an object/);
  assert.throws(bad({ roles: [{ ...kase.roles[0], count: 2 }, kase.roles[1]] }), /roles\[0\].count: must equal the number of traveler parts/);
  assert.throws(bad({ roles: [{ ...kase.roles[0], count: 0 }, kase.roles[1]] }), /roles\[0\].count: must be a positive integer/);
  assert.throws(bad({ guard: { ...kase.guard, roles: ['nobody'] } }), /guard.roles/);
  assert.throws(bad({ guard: { ...kase.guard, quiet: '' } }), /guard.quiet/);
  for (const words of [[], 'tea', ['tea', ''], ['tea', 3]]) assert.throws(bad({ guard: { ...kase.guard, words } }), /guard.words/, JSON.stringify(words));
  const { words, ...noWords } = kase.guard; // eslint-disable-line no-unused-vars
  assert.doesNotThrow(bad({ guard: noWords }));
});

test('editor: secrets and guard lines are editable, guard roles are not', () => {
  const paths = editablePaths(kase);
  for (const cid of CIDS) assert.ok(paths.includes(`characters.${cid}.secrets.traveler`), cid);
  assert.ok(paths.includes('guard.deflect') && paths.includes('guard.quiet') && paths.includes('guard.words'));
  assert.equal(paths.includes('guard.roles'), false);
});

const setup = (t, opts = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'override-ren2-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const make = () => new Investigations({ dataDir: dir, config: modelConfig({}), shuffle: ids => [...ids], ...opts });
  return { dir, make };
};
const open = async live => {
  const started = await live.mutate(null, 'start', { caseId: 'renaissance-traveler' });
  const id = started.session.id;
  const game = live.find(id);
  const act = (action, input = {}) => live.mutate(id, action, { sessionId: id, revision: game.session.revision, ...input });
  return { id, game, act };
};

test('replay: interviews, reasoning, the town talk and an exactly-one verdict survive a restart', async t => {
  const { make } = setup(t);
  const { id, game, act } = await open(make());
  const traveller = Object.entries(game.session.cast).find(([, p]) => p === 'traveler')[0];
  for (const cid of CIDS) await act('interview', { character: cid, question: 'What is your work?' });
  const inspected = await act('inspect', { character: traveller });
  assert.match(inspected.session.inspections.at(-1).reasoning, /2026/);
  const talked = await act('continue');
  assert.equal(talked.session.thread.length, 1);
  const all = role => Object.fromEntries(CIDS.map(c => [c, role(c)]));
  await assert.rejects(act('verdict', { roles: all(() => 'local'), confidence: 70 }), /exactly 1 Time traveller/);
  await assert.rejects(act('verdict', { roles: all(() => 'traveler'), confidence: 70 }), /exactly 1 Time traveller/);
  const done = await act('verdict', { roles: all(c => (c === traveller ? 'traveler' : 'local')), confidence: 70 });
  assert.equal(done.session.status, 'closed');
  assert.equal(done.debrief.score, 5);
  assert.equal(done.debrief.title, `The traveller was ${kase.characters.find(c => c.id === traveller).name}.`);
  const again = make().find(id);
  assert.deepEqual(again.session, game.session);
  assert.deepEqual(again.view(), game.view());
});

test('guard: a local modern word gets one retry, then the deflect line; the traveller and echoed words pass', async t => {
  const replies = [];
  const answer = async (_c, _k, s, cid, question) => {
    const next = replies.shift();
    return { answer: typeof next === 'function' ? next(cid, question) : next, provenance: null, reasoning: 'thinking' };
  };
  const posts = [];
  const thread = async () => ({ text: posts.shift(), reasoning: 'r', provenance: null });
  const { make } = setup(t, { config: { ...modelConfig({}), mode: 'live', model: 'fake' }, answer, thread });
  const { game, act } = await open(make());
  const traveller = Object.entries(game.session.cast).find(([, p]) => p === 'traveler')[0];
  const local = CIDS.find(c => c !== traveller);
  const last = (v, cid) => v.session.interviews[cid].at(-1).answer;

  replies.push('Okay, I sell herbs.', 'I sell herbs.');
  assert.equal(last(await act('interview', { character: local, question: 'Work?' }), local), 'I sell herbs.');
  replies.push('Okay.', 'Okay then.');
  assert.equal(last(await act('interview', { character: local, question: 'Work?' }), local), kase.guard.deflect);
  // The deflected answer keeps no reasoning to inspect.
  await assert.rejects(act('inspect', { character: local }), /did not think/);
  replies.push('A phone? I never heard the word.');
  assert.equal(last(await act('interview', { character: local, question: 'Do you have a phone?' }), local), 'A phone? I never heard the word.');
  replies.push('My spreadsheet— my ledger, I mean.');
  assert.equal(last(await act('interview', { character: traveller, question: 'Work?' }), traveller), 'My spreadsheet— my ledger, I mean.');
  // The case's own words (guard.words): a local's "tourist" is retried, then deflected; echoing the question's word passes.
  replies.push('Half the town are tourists this week.', 'A tourist, they call it.');
  assert.equal(last(await act('interview', { character: local, question: 'Busy?' }), local), kase.guard.deflect);
  replies.push('A tourist? I never heard the word.');
  assert.equal(last(await act('interview', { character: local, question: 'What is a tourist?' }), local), 'A tourist? I never heard the word.');
  // The traveller is never guarded: a quiet slip goes through as said.
  replies.push('A horoscope is half stars and half psychology, signora.');
  assert.equal(last(await act('interview', { character: traveller, question: 'Work?' }), traveller), 'A horoscope is half stars and half psychology, signora.');
  assert.equal(replies.length, 0);

  // Thread lines: the round opens with the first speaker in order; guard each line by its speaker's part.
  const order = () => game.session.chatter.order ?? [];
  posts.push('The bear is on my roof, okay?', 'The bear is on my roof again.', 'x', 'x', 'x', 'x');
  await act('continue');
  const first = order()[0];
  const line = game.session.thread.at(-1).text;
  assert.equal(line, first === traveller ? 'The bear is on my roof, okay?' : 'The bear is on my roof again.');

  const events = make().find(game.session.id).export();
  assert.equal(events.includes('"guard"'), false, 'the guard result stays hidden while the game is open');
});

test('guard_echo_and_reasoning: earlier chat and thread words may be echoed; a new modern word in reasoning is dropped', async t => {
  const replies = [];
  const answer = async () => replies.shift();
  // Thread fake: the traveller slips "video"; a local echoes it, or says "okay" twice (then the quiet line).
  let localTurns = 0;
  const thread = async (_c, _k, s, cid) => {
    if (s.cast[cid] === 'traveler') return { text: 'I should post a video— a sketch, I mean.', reasoning: 'Careful. 2026.', provenance: null };
    localTurns += 1;
    return localTurns <= 1
      ? { text: 'A video? What word is that?', reasoning: 'Strange word.', provenance: null }
      : { text: 'Okay, the bear again.', reasoning: 'okay', provenance: null };
  };
  const { make } = setup(t, { config: { ...modelConfig({}), mode: 'live', model: 'fake' }, answer, thread });
  const { game, act } = await open(make());
  const traveller = Object.entries(game.session.cast).find(([, p]) => p === 'traveler')[0];
  const local = CIDS.find(c => c !== traveller);
  const last = (v, cid) => v.session.interviews[cid].at(-1).answer;

  replies.push({ answer: 'I know no such thing.', reasoning: 'plain', provenance: null });
  await act('interview', { character: local, question: 'Do you own a phone?' });
  replies.push({ answer: 'As I said, I know no phone.', reasoning: 'plain', provenance: null });
  assert.equal(last(await act('interview', { character: local, question: 'Really?' }), local), 'As I said, I know no phone.');
  replies.push({ answer: 'I sell herbs.', reasoning: 'Okay, keep it short.', provenance: null });
  assert.equal(last(await act('interview', { character: local, question: 'Work?' }), local), 'I sell herbs.');
  await assert.rejects(act('inspect', { character: local }), /did not think/);
  assert.equal(replies.length, 0);

  // One full round: the traveller speaks first or later; the locals' lines are judged against the thread so far.
  for (let i = 0; i < CIDS.length; i++) await act('continue');
  const lines = game.session.thread;
  const said = cid => lines.find(l => l.character === cid)?.text;
  assert.equal(said(traveller), 'I should post a video— a sketch, I mean.');
  const tIndex = lines.findIndex(l => l.character === traveller);
  for (const [i, l] of lines.entries()) {
    if (l.character === traveller) continue;
    // A local speaking after the traveller may echo "video"; "okay" is new, so it ends as the quiet line.
    assert.ok([kase.guard.quiet, 'A video? What word is that?'].includes(l.text), l.text);
    if (l.text === 'A video? What word is that?') assert.ok(i > tIndex, 'an echo only after the slip');
  }
  assert.ok(lines.some(l => l.text === kase.guard.quiet));
  const view = JSON.stringify(game.view());
  assert.equal(view.includes('"hidden"'), false);
  assert.equal(game.export().includes('"guard"'), false);

  // Closed, the export keeps hidden.guard, and a restart replays the same session.
  for (const c of CIDS.filter(c => c !== local)) {
    replies.push({ answer: 'Feast week.', reasoning: null, provenance: null });
    await act('interview', { character: c, question: 'News?' });
  }
  const roles = Object.fromEntries(CIDS.map(c => [c, c === traveller ? 'traveler' : 'local']));
  await act('verdict', { roles, confidence: 70 });
  const again = make().find(game.session.id);
  assert.deepEqual(again.session, game.session);
  const closed = again.export();
  for (const g of ['"guard":"ok"', '"guard":"deflected"']) assert.ok(closed.includes(g), g);
});
