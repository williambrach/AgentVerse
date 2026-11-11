import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cases } from '../server/cases/index.mjs';
import { rolesOf, publicView, castCharacters, identityCast } from '../server/cases.mjs';
import { buildMessages, buildThreadMessages, modelConfig } from '../server/interviews.mjs';
import { Investigations } from '../server/session.mjs';

// Pins computed from the code at commit bbb28ce, before the renaissance level.
const BASE = {
  "banana-mystery": {
    "view": "9e6f4a0017cdde14",
    "chars": "73ebc57d6d79cd93",
    "roles": "6ea8e1ad0448ab4b",
    "msgs": "5a823fc4c2bc99d9",
    "thread": "44a55501f9587173",
    "contentHash": "d891b333116d"
  },
  "friends-roundtable": {
    "view": "63c1d09788fb26f9",
    "chars": "a649ab932c68ee4f",
    "roles": "da52c5588cfffe9a",
    "msgs": "f4f09e31070f1ea6",
    "thread": "5f609ee8c5301faf",
    "contentHash": "c097961cadff"
  },
  "factory-escape": {
    "view": "bd471bee05707dcf",
    "chars": "f92df788e9ae6d4c",
    "roles": "8205567f12253456",
    "msgs": "01d099cd2e72c55d",
    "thread": "2eac89e5b3351413",
    "contentHash": "2171e3404532"
  },
  "department-murder": {
    "view": "a6feda05c2bb72c4",
    "chars": "196ccddd8630cea0",
    "roles": "5c1d3fa48ec1ca9b",
    "msgs": "b1a2f3767fc96205",
    "thread": "f8b1a0b6b6bed950",
    "contentHash": "befbc6d328c9"
  }
};

test('other_cases_byte_identical_to_base', () => {
  const h = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 16);
  for (const [id, want] of Object.entries(BASE)) {
    const k = cases.find(c => c.id === id);
    const cast = identityCast(k);
    const first = k.characters[0].id;
    const s = { cast, interviews: Object.fromEntries(k.characters.map(c => [c.id, []])), thread: [] };
    const got = {
      view: h(publicView(k, cast)), chars: h(castCharacters(k, cast)), roles: h(rolesOf(k)),
      msgs: h(buildMessages(k, s, first, 'Hello').map(m => m.content).join('\n')),
      thread: h(buildThreadMessages(k, s, first).map(m => m.content).join('\n')), contentHash: k.contentHash,
    };
    assert.deepEqual(got, want, id);
  }
});

test('real_case_replay', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-renaissance-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = modelConfig({});
  const keep = ids => [...ids];
  const live = new Investigations({ dataDir: dir, config, shuffle: keep });
  {
    const started = await live.mutate(null, 'start', { caseId: 'renaissance-traveler' });
    const id = started.session.id;
    const game = live.find(id);
    const act = (action, input = {}) => live.mutate(id, action, { sessionId: id, revision: game.session.revision, ...input });
    // Identity cast: the first character carries the traveller part.
    const traveler = game.session.cast && Object.entries(game.session.cast).find(([, part]) => part === 'traveler')[0];
    const local = game.kase.characters.map(c => c.id).find(c => c !== traveler);
    const lastTurn = (v, c) => v.session.interviews[c].at(-1);
    const slip = game.kase.talk.slips[traveler].find(s => s.when === 'always');
    const wrongSlip = game.kase.talk.slips[local][0];

    const t1 = lastTurn(await act('interview', { character: traveler, topic: slip.topic }), traveler);
    assert.equal(game.session.talk.delivered[slip.id], t1.id);
    await act('interview', { character: local, topic: wrongSlip.topic });
    await act('interview', { character: traveler, about: { line: t1.id, text: slip.term } });
    await act('interview', { character: local, question: 'Who are you, then?' });
    const q1 = (await act('quote', { line: t1.id, text: slip.term })).session.talk.quotes.at(-1);
    const q2 = (await act('quote', { line: t1.id })).session.talk.quotes.at(-1);
    await act('unquote', { quote: q2.id });
    const localLine = game.session.interviews[local][0].id;
    const ql = (await act('quote', { line: localLine })).session.talk.quotes.at(-1);
    const wrong = await act('accuse', { character: local, quotes: [ql.id] });
    assert.equal(wrong.session.status, 'active');
    assert.equal(game.session.talk.accusations.length, 1);
    const done = await act('accuse', { character: traveler, quotes: [q1.id] });
    assert.equal(done.session.status, 'closed');
    assert.equal(done.debrief.wrong, 1);
    assert.equal(done.debrief.score, 3);

    const fresh = new Investigations({ dataDir: dir, config, shuffle: keep });
    const again = fresh.find(id);
    assert.ok(again);
    for (const key of ['asked', 'quotes', 'delivered', 'challenged', 'accusations']) assert.deepEqual(again.session.talk[key], game.session.talk[key], key);
    assert.deepEqual(again.session, game.session);
    assert.deepEqual(again.view(), game.view());
    assert.deepEqual(again.view().debrief, done.debrief);
    assert.ok(again.export().includes('"hidden"'));
    assert.equal(again.export(), game.export());
  }
});
