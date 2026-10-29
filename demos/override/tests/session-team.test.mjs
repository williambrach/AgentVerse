import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Investigations, replay } from '../server/session.mjs';
import { modelConfig } from '../server/interviews.mjs';
import { cases } from '../server/cases/index.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'override-team-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, make: () => new Investigations({ dataDir: dir, config: modelConfig({}), cases }) };
}
const team = { id: 'uuid-a', name: 'Banana Squad', extra: 'x' };
const events = (dir, id) => readFileSync(join(dir, 'sessions', `${id}.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);

test('start_with_team', async t => {
  const { dir, make } = setup(t);
  const view = await make().mutate(null, 'start', {}, { team });
  assert.deepEqual(view.session.team, { id: 'uuid-a', name: 'Banana Squad' });
  assert.deepEqual(events(dir, view.session.id)[0].team, { id: 'uuid-a', name: 'Banana Squad' });
});

test('start_without_team', async t => {
  const { dir, make } = setup(t);
  const view = await make().mutate(null, 'start', {});
  assert.equal(view.session.team, null);
  assert.equal(events(dir, view.session.id)[0].team, null);
});

test('reset_takes_ctx_team', async t => {
  const { make } = setup(t);
  const inv = make();
  const a = await inv.mutate(null, 'start', {}, { team });
  const b = await inv.mutate(a.session.id, 'reset', { sessionId: a.session.id, revision: a.session.revision }, { team: { id: 'uuid-b', name: 'Owls' } });
  assert.deepEqual(b.session.team, { id: 'uuid-b', name: 'Owls' });
  assert.notEqual(b.session.id, a.session.id);
});

test('replay_restores_team', async t => {
  const { make } = setup(t);
  const view = await make().mutate(null, 'start', {}, { team });
  const again = make().view(view.session.id);
  assert.deepEqual(again.session.team, { id: 'uuid-a', name: 'Banana Squad' });
});

test('replay_drops_bad_team', async t => {
  const { dir, make } = setup(t);
  const view = await make().mutate(null, 'start', {}, { team });
  const file = join(dir, 'sessions', `${view.session.id}.jsonl`);
  const lines = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  lines[0].team = { id: 5, name: 'x' };
  writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  assert.equal(replay(lines, cases).team, null);
  assert.equal(make().view(view.session.id).session.team, null);
});

test('failed_mutation_keeps_team', async t => {
  const { make } = setup(t);
  const inv = make();
  const v = await inv.mutate(null, 'start', {}, { team });
  await assert.rejects(inv.mutate(v.session.id, 'visit', { sessionId: v.session.id, revision: v.session.revision, location: 'nowhere' }));
  assert.deepEqual(inv.view(v.session.id).session.team, { id: 'uuid-a', name: 'Banana Squad' });
});
