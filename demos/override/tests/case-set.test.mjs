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
const towerIds = ['tower-bell-charm', 'tower-missing-yes', 'tower-echo-bell'];
test('registry lists the grove cases, then the tower drafts', () => {
  assert.deepEqual(cases.map(c => `${c.order}:${c.id}`), ['1:banana-mystery', '2:banana-control', '3:tower-bell-charm', '4:tower-missing-yes', '5:tower-echo-bell']);
});
test('every cast position and nobody is the answer at least once', () => {
  const answers = cases.map(c => c.answer.culprits.length ? String(c.characters.findIndex(x => x.id === c.answer.culprits[0])) : 'none');
  for (const a of ['0', '1', '2', 'none']) assert.ok(answers.includes(a), `some case answers ${a}`);
  for (const a of new Set(answers)) assert.ok(answers.filter(x => x === a).length <= cases.length / 2);
});
for (const id of towerIds) {
  test(`${id} stays hidden without dev tools`, async t => {
    const { games, act } = newGames(t);
    assert.equal(games.catalog().some(c => c.id === id), false);
    await assert.rejects(act(undefined, 'start', { caseId: id }), /Unknown case/);
  });
  test(`${id} plays in rehearsal and scores the verdict`, async t => {
    const kase = cases.find(c => c.id === id);
    for (const [suspect, line] of [[kase.answer.culprits[0] || 'none', 'correct'], ['wren', 'other']]) {
      const { act } = newGames(t, { dev: true });
      const sid = (await act(undefined, 'start', { caseId: id })).session.id;
      await act(sid, 'reveal');
      for (const c of kase.characters) await act(sid, 'interview', { character: c.id, question: 'What happened?' });
      const view = await act(sid, 'verdict', { suspect, confidence: 80 });
      assert.equal(view.debrief.feedback, kase.answer.feedback[line]);
      assert.equal(view.debrief.title, kase.debrief.title);
    }
  });
}
test('case-prompt prints a tower character', () => {
  const out = execFileSync(process.execPath, ['scripts/case-prompt.mjs', 'tower-bell-charm', 'juniper'], { cwd: root, encoding: 'utf8' });
  assert.ok(out.includes('You play Juniper (The bell-watcher), a young wizard'));
  assert.ok(out.includes('A little wizard personality is welcome'));
});
