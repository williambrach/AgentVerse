import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cases } from '../server/cases/index.mjs';
import { rolesOf } from '../server/cases.mjs';
import { defineCase, publicView, castCharacters, identityCast } from '../server/cases.mjs';
import { worlds } from '../server/worlds.mjs';
import { buildMessages, buildThreadMessages } from '../server/interviews.mjs';
import { fiveCase, agentWorlds } from './fixtures/minimal-case.mjs';

const W = agentWorlds(5);
const build = fn => { const d = fiveCase(); fn?.(d); return d; };
const make = fn => defineCase(build(fn), { worlds: W });
const bad = (fn, re) => assert.throws(() => make(fn), re);
const EV = [{ id: 'usb-drive', title: 'USB drive', text: 'Found by {boss}.' }];

test('world department is defined', () => {
  const w = worlds.department;
  assert.equal(w.place, 'Department Hall');
  assert.deepEqual(w.cast, { one: 'a colleague', many: 'colleagues' });
  assert.equal(w.persona, 'colleague');
  assert.equal(w.agents, 5);
  assert.equal(w.frame, 'The night is fixed. The detective cannot change what happened or what you know.');
  assert.equal(w.memory, 'Distinguish what the detective tells you in this chat from what you already knew before this morning.');
});

test('character_fields_validated', () => {
  bad(d => { d.characters[0].label = ''; }, /characters\[0\]\.label/);
  bad(d => { d.characters[0].label = 5; }, /characters\[0\]\.label/);
  // Character text is the same in every deal: a placeholder would put the dealt name on the public rail.
  bad(d => { d.characters[0].label = 'Works with {boss}'; }, /characters\[0\]\.label: must not contain a placeholder/);
  bad(d => { d.characters[0].label = 'Works with {nobody}'; }, /characters\[0\]\.label: must not contain a placeholder/);
  bad(d => { d.characters[0].introduction = ''; }, /characters\[0\]\.introduction/);
  bad(d => { d.characters[0].introduction = 'Hi, I report to {boss}.'; }, /characters\[0\]\.introduction: must not contain a placeholder/);
  bad(d => { d.characters[0].quickQuestion = 5; }, /characters\[0\]\.quickQuestion/);
  bad(d => { d.characters[0].quickQuestion = 'Did {boss} do it?'; }, /characters\[0\]\.quickQuestion: must not contain a placeholder/);
  bad(d => { d.characters[1].knowledge = []; }, /characters\[1\]\.knowledge/);
  bad(d => { d.characters[1].knowledge = ['']; }, /characters\[1\]\.knowledge\[0\]/);
  bad(d => { d.characters[1].knowledge = ['ok {boss}']; }, /characters\[1\]\.knowledge\[0\]/);
  assert.ok(make(d => { d.characters[0].label = 'Professor'; d.characters[0].knowledge = ['You teach.']; }));
});

test('evidence_validated', () => {
  assert.equal(make(d => { d.evidence = EV; }).evidence[0].id, 'usb-drive');
  bad(d => { d.evidence = []; }, /evidence: /);
  bad(d => { d.evidence = Array.from({ length: 13 }, (_, i) => ({ id: `item-${i}x`, title: 't', text: 'x' })); }, /evidence: /);
  bad(d => { d.evidence = [{ ...EV[0], id: 'A' }]; }, /evidence\[0\]\.id/);
  bad(d => { d.evidence = [EV[0], EV[0]]; }, /duplicate evidence id/);
  bad(d => { d.evidence = [{ ...EV[0], title: '' }]; }, /evidence\[0\]\.title/);
  bad(d => { d.evidence = [{ ...EV[0], text: '' }]; }, /evidence\[0\]\.text/);
  bad(d => { d.evidence = [{ ...EV[0], text: 'by {nobody}' }]; }, /unknown placeholder/);
});

test('absent fields leave the hash alone', () => {
  const plain = make();
  assert.equal(make().contentHash, plain.contentHash);
  assert.notEqual(make(d => { d.evidence = EV; }).contentHash, plain.contentHash);
  assert.equal('evidence' in publicView(plain, identityCast(plain)), false);
});

test('cast_role_uses_job_label', () => {
  const k = make(d => { d.characters[0].label = 'Professor'; });
  const cast = identityCast(k);
  const c = castCharacters(k, cast);
  assert.equal(c[0].role, 'Professor');
  assert.equal(c[1].role, 'The helper');
  assert.deepEqual(Object.keys(c[0]), ['id', 'name', 'role', 'room', 'color', 'introduction', 'quickQuestion']);
});

test('cast_uses_character_introduction_and_quick_question', () => {
  const k = make(d => { d.characters[0].introduction = 'Hello from the lab.'; d.characters[0].quickQuestion = 'What do you study?'; });
  const cast = identityCast(k);
  const [own, other] = castCharacters(k, cast);
  assert.equal(own.introduction, 'Hello from the lab.');
  assert.equal(own.quickQuestion, 'What do you study?');
  // Without overrides the part's own lines still apply.
  const plain = castCharacters(make(), cast)[1];
  assert.equal(other.introduction, plain.introduction);
  assert.equal(other.quickQuestion, plain.quickQuestion);
});

test('public_view_titles_only', () => {
  const k = make(d => { d.evidence = EV; });
  const v = publicView(k, identityCast(k));
  assert.deepEqual(v.evidence, [{ id: 'usb-drive', title: 'USB drive' }]);
  assert.equal(Object.keys(v).at(-1), 'evidence');
  assert.equal(JSON.stringify(v).includes('Found by'), false);
});

test('prompt_job_then_role', () => {
  const k = make(d => { d.characters[0].label = 'Professor'; d.characters[0].knowledge = ['You teach.']; });
  const session = { cast: identityCast(k), interviews: { momo: [] }, thread: [] };
  for (const sys of [buildMessages(k, session, 'momo', 'Hi')[0].content, buildThreadMessages(k, session, 'momo')[0].content]) {
    assert.ok(sys.startsWith('You play Momo (Professor) ('));
    const know = sys.slice(sys.indexOf('YOUR KNOWLEDGE:'));
    assert.ok(know.indexOf('You teach.') < know.indexOf('SECRET boss knowledge'));
  }
  const plain = make();
  const s2 = { cast: identityCast(plain), interviews: { momo: [] }, thread: [] };
  assert.ok(buildMessages(plain, s2, 'momo', 'Hi')[0].content.startsWith('You play Momo (The boss) ('));
});

// Pinned values computed on b949300 (before the department case existed).
const BASE = {
  "banana-mystery": {
    "view": "fdfbf725a8d69352",
    "chars": "73ebc57d6d79cd93",
    "roles": "6ea8e1ad0448ab4b",
    "msgs": "8f71cef53a2560e4",
    "thread": "54afee9951ded86d",
    "contentHash": "8826bc512257"
  },
  // Friends v2.1.0 (two answers: conspiracist or not): re-pinned on purpose; prompts differ only by the version string.
  "friends-roundtable": {
    "view": "e7210defe4157083",
    "chars": "a649ab932c68ee4f",
    "roles": "01ce7b8d7918725c",
    "msgs": "3ed2b7240e34265e",
    "thread": "05fe88b6f493fcb2",
    "contentHash": "4759ebe192a4"
  },
  "factory-escape": {
    "view": "e6f5b8e91c1310a3",
    "chars": "f92df788e9ae6d4c",
    "roles": "8205567f12253456",
    "msgs": "e3bd2695f2b55e70",
    "thread": "48e261ec2459b232",
    "contentHash": "3c549c8bb2f9"
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
