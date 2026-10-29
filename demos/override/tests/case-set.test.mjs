import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Investigations } from '../server/session.mjs';
import { cases } from '../server/cases/index.mjs';
import { modelConfig } from '../server/interviews.mjs';

const newGames = (t, options = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'override-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const games = new Investigations({ dataDir: dir, config: modelConfig({}), ...options });
  const act = async (id, action, input = {}) => {
    const s = games.find(id)?.session;
    return games.mutate(id, action, { sessionId: s?.id, revision: s?.revision, ...input });
  };
  return { games, act, dir };
};
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const towerId = 'tower-echo-bell';
const archived = ['banana-control', 'tower-bell-charm', 'tower-missing-yes'];
test('registry lists one grove case, then one tower case', () => {
  assert.deepEqual(cases.map(c => `${c.order}:${c.id}:${c.status}:${c.world.id}`), ['1:banana-mystery:ready:grove', '2:tower-echo-bell:ready:tower']);
});
test('the case set spans both worlds, one culprit and one nobody', () => {
  assert.deepEqual(cases.map(c => c.world.id).sort(), ['grove', 'tower']);
  assert.ok(cases.some(c => c.answer.culprits.length > 0), 'some case has a culprit');
  assert.ok(cases.some(c => c.answer.culprits.length === 0), 'some case answers nobody');
});
for (const dev of [false, true]) {
  test(`archived cases stay out of the catalog (dev ${dev})`, async t => {
    const { games, act } = newGames(t, { dev });
    assert.deepEqual(games.catalog().map(c => c.id), ['banana-mystery', towerId]);
    for (const id of archived) await assert.rejects(act(undefined, 'start', { caseId: id }), /Unknown case/);
  });
}
test(`${towerId} plays in rehearsal and scores the verdict`, async t => {
  const kase = cases.find(c => c.id === towerId);
  for (const [suspect, line] of [['none', 'correct'], ['wren', 'other']]) {
    const { act } = newGames(t);
    const sid = (await act(undefined, 'start', { caseId: towerId })).session.id;
    await act(sid, 'reveal');
    for (const c of kase.characters) await act(sid, 'interview', { character: c.id, question: 'What happened?' });
    const view = await act(sid, 'verdict', { suspect, confidence: 80 });
    assert.equal(view.debrief.feedback, kase.answer.feedback[line]);
    assert.equal(view.debrief.title, 'Nobody knew it was too soon.');
  }
});
test('case-prompt prints a tower character', () => {
  const out = execFileSync(process.execPath, ['scripts/case-prompt.mjs', towerId, 'juniper'], { cwd: root, encoding: 'utf8' });
  assert.ok(out.includes('You play Juniper (The bell-watcher), a young wizard'));
  assert.ok(out.includes('A little wizard personality is welcome'));
});
