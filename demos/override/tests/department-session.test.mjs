import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Investigation, Investigations } from '../server/session.mjs';
import { readJsonl } from '../server/dataset.mjs';
import { defineCase } from '../server/cases.mjs';
import { modelConfig } from '../server/interviews.mjs';
import { partCase, agentWorlds } from './fixtures/minimal-case.mjs';

const evidence = [
  { id: 'badge', title: 'Badge', text: 'SECRET badge text' },
  { id: 'memo', title: 'Memo', text: 'SECRET memo text' },
];
const withEv = defineCase({ ...partCase, id: 'mini-ev', version: 'mini-ev-v1', evidence }, { worlds: agentWorlds(3) });
const plain = defineCase(partCase, { worlds: agentWorlds(3) });
const config = modelConfig({});
const same = ids => [...ids];

function setup(t, kase = withEv, dir = null) {
  dir ??= mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const inv = new Investigation({ dataDir: dir, config, kase, shuffle: same });
  const act = (action, input = {}) => inv.mutate(action, { sessionId: inv.session?.id, revision: inv.session?.revision, ...input });
  return { inv, act, dir };
}

test('visit_evidence_logs_location', async t => {
  const { inv, act, dir } = setup(t);
  await act('start');
  await act('visit', { location: 'evidence:badge' });
  const ev = readJsonl(join(dir, 'sessions', `${inv.session.id}.jsonl`)).filter(e => e.type === 'location_visited');
  assert.equal(ev.at(-1).location, 'evidence:badge');
  assert.equal(inv.session.location, 'evidence:badge');
});

test('examine_once_in_order', async t => {
  const { inv, act } = setup(t);
  await act('start');
  await act('visit', { location: 'evidence:memo' });
  await act('visit', { location: 'evidence:badge' });
  await act('visit', { location: 'evidence:memo' });
  assert.deepEqual(inv.session.examined, ['memo', 'badge']);
  assert.deepEqual(inv.view().session.evidence.map(e => e.id), ['memo', 'badge']);
  assert.equal(inv.view().session.evidence[0].text, 'SECRET memo text');
});

test('visit_evidence_page_ok', async t => {
  const { inv, act } = setup(t);
  await act('start');
  await act('visit', { location: 'evidence' });
  assert.equal(inv.session.location, 'evidence');
  assert.deepEqual(inv.session.examined, []);
});

test('unknown_evidence_400', async t => {
  const { act } = setup(t);
  await act('start');
  await assert.rejects(act('visit', { location: 'evidence:nope' }), e => e.status === 400 && /Unknown station location/.test(e.message));
});

test('other_case_rejects_evidence', async t => {
  const { act } = setup(t, plain);
  await act('start');
  for (const location of ['evidence', 'evidence:badge']) await assert.rejects(act('visit', { location }), e => e.status === 400);
});

test('replay_restores_examined', async t => {
  const { inv, act, dir } = setup(t);
  await act('start');
  await act('visit', { location: 'evidence:memo' });
  await act('visit', { location: 'evidence:badge' });
  const before = inv.view();
  const again = new Investigations({ dataDir: dir, config, cases: [withEv], shuffle: same }).find(inv.session.id);
  assert.deepEqual(again.session.examined, ['memo', 'badge']);
  assert.deepEqual(again.view().session.evidence, before.session.evidence);
});

test('text_absent_until_examined', async t => {
  const { inv, act } = setup(t);
  await act('start');
  assert.deepEqual(inv.view().session.evidence, []);
  assert.equal(JSON.stringify(inv.view()).includes('SECRET badge text'), false);
  await act('visit', { location: 'evidence:badge' });
  const json = JSON.stringify(inv.view());
  assert.ok(json.includes('SECRET badge text'));
  assert.equal(json.includes('SECRET memo text'), false);
});

test('other_cases_view_unchanged', async t => {
  const { inv, act } = setup(t, plain);
  await act('start');
  assert.equal('examined' in inv.session, false);
  assert.equal('examined' in inv.view().session, false);
  assert.equal('evidence' in inv.view().session, false);
});

test('real_department_case_replays_to_identical_view', async t => {
  const { default: dept } = await import('../server/cases/department-murder.mjs');
  const { inv, act, dir } = setup(t, dept);
  await act('start');
  await act('visit', { location: 'evidence:usb-drive' });
  await act('visit', { location: 'evidence:cracked-phone' });
  await act('visit', { location: 'evidence' });
  // The verdict needs every colleague interviewed, not just two.
  for (const { id: character } of dept.characters) await act('interview', { character, question: 'Where were you on Thursday night?' });
  const cast = inv.session.cast;
  const roles = Object.fromEntries(dept.characters.map(c => [c.id, dept.parts.find(p => p.id === cast[c.id]).role]));
  assert.deepEqual(Object.values(roles).sort(), ['innocent', 'innocent', 'innocent', 'killer', 'leaker']);
  await act('verdict', { roles, confidence: 80 });
  const live = inv.view();
  assert.equal(live.session.status, 'closed');
  assert.equal(live.debrief.score ?? live.session.verdict.score, 5);

  const games = new Investigations({ dataDir: dir, config, cases: [dept], shuffle: same });
  const again = games.find(inv.session.id);
  assert.deepEqual(again.session.examined, ['usb-drive', 'cracked-phone']);
  assert.deepEqual(again.view(), live);
  assert.deepEqual(again.view().session.evidence.map(e => e.id), ['usb-drive', 'cracked-phone']);
  assert.equal(again.view().session.status, 'closed');
  assert.ok(again.view().debrief);

  const json = JSON.stringify(again.view());
  const nameOf = id => dept.characters.find(c => cast[c.id] && dept.parts.find(p => p.id === cast[c.id]).role === id)?.name;
  const textOf = e => e.text.replaceAll('{killer}', nameOf('killer'));
  for (const e of live.session.evidence) assert.ok(json.includes(textOf(dept.evidence.find(x => x.id === e.id))) || json.includes(e.text));
  assert.equal(live.session.evidence[1].text.includes('{killer}'), false);
  for (const e of dept.evidence.filter(x => !['usb-drive', 'cracked-phone'].includes(x.id))) assert.equal(json.includes(textOf(e)), false, e.id);

  await assert.rejects(again.mutate('visit', { sessionId: again.session.id, revision: again.session.revision, location: 'evidence:laptop' }), e => e.status === 409);
});
