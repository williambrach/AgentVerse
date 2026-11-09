import test from 'node:test';
import assert from 'node:assert/strict';
import { cases } from '../server/cases/index.mjs';
import { publicView, defineCase } from '../server/cases.mjs';
import { buildMessages } from '../server/interviews.mjs';
import { checkTalk, newTalkState, topicAnswer, typedRoute, supports } from '../server/talk.mjs';
import { modernWords } from '../server/anachronism.mjs';

const kase = cases.find(c => c.id === 'renaissance-traveler');
const CIDS = kase.characters.map(c => c.id);
const PARTS = ['traveler', 'locala', 'localb', 'localc', 'locald'];
const TOPICS = kase.talk.topics.map(t => t.id);
const castWith = traveller => {
  const locals = PARTS.slice(1);
  return Object.fromEntries(CIDS.map(cid => [cid, cid === traveller ? 'traveler' : locals.shift()]));
};

test('registry_six: the case is sixth, after After Hours, and the others keep their places', () => {
  assert.equal(cases.length, 6);
  assert.equal(cases[5], kase);
  assert.equal(kase.order, 6);
  assert.equal(kase.status, 'ready');
  assert.equal(kase.version, 'renaissance-traveler-v1.0.0');
  assert.equal(cases[0].id, 'banana-mystery');
  assert.equal(cases[4].id, 'department-murder');
  assert.equal(kase.world.id, 'renaissance');
  assert.deepEqual(kase.talk.topics.map(t => t.id), ['work', 'travel', 'letters', 'pastimes', 'square']);
  assert.deepEqual(kase.tools, { inspect: false, talk: false });
  assert.deepEqual(kase.parts.map(p => p.id), PARTS);
  assert.deepEqual(kase.roles.map(r => r.id), ['traveler', 'local']);
});

test('prompt_identical_across_deals: every character, every part, byte-identical', () => {
  for (const cid of CIDS) {
    const seen = new Set();
    for (const traveller of CIDS) {
      const cast = castWith(traveller);
      seen.add(JSON.stringify(buildMessages(kase, { cast, interviews: { [cid]: [] } }, cid, 'Hi')));
    }
    assert.equal(seen.size, 1, `${cid} prompt differs between deals`);
    // and across all five parts of the same character
    const all = new Set();
    for (const pid of PARTS) {
      const others = PARTS.filter(p => p !== pid);
      const filled = Object.fromEntries(CIDS.map(c => [c, c === cid ? pid : others.shift()]));
      all.add(JSON.stringify(buildMessages(kase, { cast: filled, interviews: { [cid]: [] } }, cid, 'Hi')));
    }
    assert.equal(all.size, 1, `${cid} prompt differs between parts`);
  }
});

test('fairness_all_travellers: any 3 topics give a slip, all 5 give at least 3', () => {
  const run = (traveller, order) => {
    const cast = castWith(traveller);
    const state = newTalkState(kase);
    let slips = 0;
    order.forEach((topic, n) => {
      const out = topicAnswer(kase, cast, state, traveller, topic);
      if (out.slip) { slips += 1; state.delivered[out.slip] = `ev${n}`; }
      state.asked[traveller].push(topic);
    });
    return slips;
  };
  const perms = (xs, k) => (k === 0 ? [[]] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)], k - 1).map(p => [x, ...p])));
  for (const traveller of CIDS) {
    for (const order of perms(TOPICS, 3)) assert.ok(run(traveller, order) >= 1, `${traveller}: ${order} gave no slip`);
    for (const order of perms(TOPICS, 5)) assert.ok(run(traveller, order) >= 3, `${traveller}: ${order} gave fewer than 3 slips`);
  }
});

test('locals never slip', () => {
  for (const traveller of CIDS) {
    const cast = castWith(traveller);
    for (const cid of CIDS.filter(c => c !== traveller)) for (const topic of TOPICS) {
      assert.deepEqual(topicAnswer(kase, cast, newTalkState(kase), cid, topic), { text: kase.talk.lines[cid][topic], slip: null });
    }
  }
});

test('no_modern_in_local_text: checkTalk passes and plain lines hold no modern word', () => {
  assert.doesNotThrow(() => checkTalk(kase));
  for (const cid of CIDS) for (const topic of TOPICS) assert.deepEqual(modernWords(kase.talk.lines[cid][topic]), [], `${cid}.${topic}`);
  for (const cid of CIDS) assert.equal(kase.talk.slips[cid].length, 5);
  for (const cid of CIDS) assert.equal(kase.talk.slips[cid].filter(s => s.when === 'always').length, 3);
});

test('public_view_no_secrets', () => {
  const view = publicView(kase, castWith('agnese'));
  assert.deepEqual(view.talk, { topics: kase.talk.topics });
  assert.deepEqual(view.tools, { inspect: false, talk: false });
  const json = JSON.stringify(view);
  for (const key of ['slips', 'reveal', 'parts', 'lines', 'followUps', 'clean']) assert.equal(json.includes(`"${key}"`), false, key);
  for (const word of ['"traveler"', '"locala"', 'spreadsheet', 'Wi-Fi']) assert.equal(json.includes(word), false, word);
  assert.deepEqual(view.characters.map(c => c.role), ['Astrologer', 'Clockmaker', 'Noblewoman', 'Sergeant of the watch', 'Apothecary']);
});

test('other cases keep their public view keys', () => {
  for (const k of cases.slice(0, 5)) {
    const v = publicView(k, Object.fromEntries(k.characters.map((c, i) => [c.id, k.parts[i].id])));
    assert.equal('talk' in v, false);
    assert.equal('tools' in v, false);
  }
});

test('schema: tools must be booleans, reveal a placeholder-free string, talk is checked', () => {
  const raw = { ...kase, rehearsal: kase.rehearsal, world: 'renaissance' };
  const bad = patch => () => defineCase({ ...raw, ...patch });
  assert.doesNotThrow(bad({}));
  assert.throws(bad({ tools: { inspect: 'no' } }), /tools.inspect: must be a boolean/);
  assert.throws(bad({ tools: { fly: true } }), /tools.fly/);
  assert.throws(bad({ characters: kase.characters.map((c, i) => (i ? c : { ...c, reveal: 'I am {traveler}' })) }), /reveal: must not contain a placeholder/);
  assert.throws(bad({ talk: { ...kase.talk, lines: { ...kase.talk.lines, ottavio: { ...kase.talk.lines.ottavio, work: 'Use my smartphone.' } } } }), /uses a modern word \(smartphone\)/);
});

test('maker_cannot_split_part_knowledge: no part knowledge path is offered or accepted', async () => {
  const { editablePaths, createContentStore, ContentError } = await import('../server/content.mjs');
  const { worlds } = await import('../server/worlds.mjs');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const paths = editablePaths(kase);
  assert.deepEqual(paths.filter(p => p.endsWith('.knowledge')), []);
  assert.ok(paths.some(p => p.endsWith('.introduction') || p.endsWith('.finding.explanation')), 'other part fields stay editable');
  for (const other of cases.filter(c => !c.talk)) assert.ok(editablePaths(other).some(p => p.endsWith('.knowledge')) || !other.parts.some(p => p.knowledge), other.id);
  const store = createContentStore({ cases: [kase], dataDir: mkdtempSync(join(tmpdir(), 'ren-')), worlds });
  const path = `parts.${kase.parts[0].id}.knowledge`;
  assert.throws(() => store.preview(kase.id, { [path]: ['A different fact.'] }), e => e instanceof ContentError && e.status === 400 && e.path === path);
});

test('plain words of a multi-word slip term are not a challenge or proof (call, game, mail, lag...)', () => {
  const plain = [];
  for (const cid of CIDS) {
    const state = newTalkState(kase);
    for (const s of kase.talk.slips[cid]) state.delivered[s.id] = `line-${s.id}`;
    for (const s of kase.talk.slips[cid]) {
      for (const t of [s.term, ...s.aliases].filter(t => /[\s-]/.test(t))) {
        for (const w of t.split(/[\s-]+/).filter(w => w.length >= 3 && !modernWords(w).length)) {
          plain.push(w);
          assert.equal(typedRoute(kase, state, cid, `Tell me, what of the ${w} here?`).kind, 'model', `${cid}: "${w}" of "${t}"`);
          assert.equal(supports(kase, castWith(cid), state, cid, [{ character: cid, line: state.delivered[s.id], text: w }]), false, `${cid}: proof "${w}"`);
        }
      }
    }
  }
  for (const w of ['call', 'game', 'mail', 'lag', 'security', 'message']) assert.ok(plain.includes(w), w);
  const state = newTalkState(kase);
  state.delivered['agnese-letters'] = 'L1';
  assert.equal(typedRoute(kase, state, 'agnese', 'Do you call on your sister often?').kind, 'model');
  assert.equal(typedRoute(kase, state, 'agnese', 'What is a video call?').kind, 'followUp');
  assert.equal(supports(kase, castWith('agnese'), state, 'agnese', [{ character: 'agnese', line: 'L1', text: 'video' }]), true);
});
