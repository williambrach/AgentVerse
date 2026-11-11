import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import friends from '../server/cases/friends-roundtable.mjs';
import { cases } from '../server/cases/index.mjs';
import { publicView, identityCast, rolesOf, resolve, partOf } from '../server/cases.mjs';
import { Investigation } from '../server/session.mjs';
import { modelConfig } from '../server/interviews.mjs';

const PARTS = ['birds', 'reptile', 'aliens', 'moonbase', 'haarp'];

test('registry_second: friends is second on the friends world', () => {
  assert.deepEqual(cases.map(c => c.id), ['banana-mystery', 'friends-roundtable', 'factory-escape', 'department-murder', 'renaissance-traveler']);
  assert.equal(cases[2].id, 'factory-escape');
  assert.equal(cases[3].id, 'department-murder');
  assert.equal(cases[1].world.id, 'friends');
  assert.ok(cases[1].parts.every(p => p.label === 'Friend'));
});

test('friends_case_shape', () => {
  assert.equal(friends.version, 'friends-roundtable-v2.0.0');
  assert.deepEqual(friends.characters.map(c => [c.id, c.name, c.color]), [
    ['maya', 'Ector', '#e4b85c'], ['ken', 'Perceval', '#75b2b0'], ['alex', 'Pellinore', '#bd96bc'], ['nora', 'Galahad', '#d7956f'], ['sam', 'Constantine', '#8d9fcb'],
  ]);
  assert.deepEqual(rolesOf(friends).map(r => r.id), ['birds', 'reptile', 'bermuda', 'aliens', 'moonbase', 'haarp', 'none']);
  assert.deepEqual(friends.parts.map(p => p.id), PARTS);
  assert.ok(friends.parts.every(p => p.role === p.id));
  const held = new Set(friends.parts.map(p => p.role));
  assert.deepEqual(rolesOf(friends).filter(r => !held.has(r.id)).map(r => r.id), ['bermuda', 'none']);
  assert.equal(rolesOf(friends).find(r => r.id === 'none').label, 'Not a conspiracist');
});

test('friends_story_hides_that_everyone_has_one: nothing before the verdict says or implies every friend holds a theory', () => {
  const c = friends.copy;
  const before = [c.headline, c.intro.lead, c.intro.body, c.briefing.title, c.briefing.description, c.briefing.question, c.briefing.hint, c.report.title, c.report.description].join(' | ');
  assert.doesNotMatch(before, /\b(every|everyone|all five|each friend (secretly|hides|has)|five (hidden|secret|different)|belong to nobody|decoy)/i);
  // The reveal belongs to the debrief.
  assert.match(friends.debrief.title, /all five/i);
});

test('friends_knowledge_has_shared_rule', () => {
  for (const p of friends.parts) {
    assert.equal(p.knowledge.length, 2);
    assert.match(p.knowledge[0], /never say that you believe the theory unless Arthur asks/);
    assert.match(p.knowledge[0], /never talk about theirs/);
  }
});

test('friends_tools_text', () => {
  for (const id of PARTS) {
    assert.ok(friends.rehearsalReasoning(id).length > 20);
    const posts = [0, 1, 2, 3].map(n => friends.rehearsalChatter(id, n));
    assert.ok(posts.every(Boolean));
    assert.equal(new Set(posts.slice(0, 3)).size, 3);
    assert.equal(posts[3], posts[0]);
  }
});

test('friends_rehearsal_deflects_then_admits', () => {
  assert.match(friends.rehearsal('birds', 'How was your week?'), /pigeon outside/);
  const admit = friends.rehearsal('birds', 'Do you like birds?');
  assert.match(admit, /Birds aren’t real\. They’re government robots/);
  assert.match(friends.rehearsal('reptile', 'What about Zuckerberg?'), /reptilian elite/);
  assert.match(friends.rehearsal('haarp', 'Any plans?'), /Terrible weather/);
});

const start = async t => {
  const dir = mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const inv = new Investigation({ dataDir: dir, config: modelConfig({}), kase: friends, shuffle: ids => [...ids].reverse() });
  const act = (action, input = {}) => inv.mutate(action, { sessionId: inv.session?.id, revision: inv.session?.revision, ...input });
  await act('start');
  for (const c of friends.characters) await act('interview', { character: c.id, question: 'How was your week?' });
  return { inv, act };
};

test('friends_verdict_scores_theories', async t => {
  const a = await start(t);
  const truth = Object.fromEntries(friends.characters.map(c => [c.id, partOf(friends, a.inv.session.cast, c.id).role]));
  assert.notDeepEqual(truth, Object.fromEntries(friends.characters.map(c => [c.id, identityCast(friends)[c.id]])), 'the deal is shuffled');
  const done = await a.act('verdict', { roles: truth, confidence: 80 });
  assert.equal(`${done.session.verdict.score}/${done.session.verdict.total}`, '5/5');
  const b = await start(t);
  const wrong = Object.fromEntries(friends.characters.map(c => [c.id, partOf(friends, b.inv.session.cast, c.id).role]));
  wrong.maya = 'bermuda';
  const miss = await b.act('verdict', { roles: wrong, confidence: 80 });
  assert.equal(`${miss.session.verdict.score}/${miss.session.verdict.total}`, '4/5');
  await assert.rejects(start(t).then(c => c.act('verdict', { roles: { maya: 'villain', ken: 'moon', alex: 'moon', nora: 'moon', sam: 'moon' }, confidence: 1 })), e => e.status === 400);
});

test('friends_no_theory_in_public_view', () => {
  const view = publicView(friends, identityCast(friends));
  const json = JSON.stringify({ ...view });
  for (const p of friends.parts) {
    assert.equal(view.characters.find(c => c.id === friends.characters[friends.parts.indexOf(p)].id).role, 'Friend');
    assert.equal(json.includes(p.finding.classification), false);
    assert.equal(json.includes(p.knowledge[1]), false);
  }
  for (const r of rolesOf(friends)) assert.equal(json.includes(r.label), false, r.label);
  assert.equal(resolve(friends, identityCast(friends), '{birds}'), 'Ector');
});

test('catalog_rows_name_their_cast: each row lists its personas (id and name only), so the case board can preview any case', async () => {
  const { listCases } = await import('../server/cases.mjs');
  const rows = listCases(cases);
  const row = id => rows.find(r => r.id === id);
  assert.deepEqual(row('friends-roundtable').cast, [
    { id: 'maya', name: 'Ector' }, { id: 'ken', name: 'Perceval' }, { id: 'alex', name: 'Pellinore' }, { id: 'nora', name: 'Galahad' }, { id: 'sam', name: 'Constantine' },
  ]);
  assert.equal(row('banana-mystery').cast.length, 4);
  for (const r of rows) for (const c of r.cast) assert.deepEqual(Object.keys(c).sort(), ['id', 'name']);
  // No theory or part information travels with the catalog.
  const text = JSON.stringify(rows);
  for (const p of friends.parts) assert.ok(!text.includes(p.finding.classification), p.id);
});
