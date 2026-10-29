import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as path } from 'node:path';
import { createTeams, teamName } from '../server/teams.mjs';

const tmp = () => path(mkdtempSync(path(tmpdir(), 'teams-')), 'teams.jsonl');

test('team_name_rules', () => {
  assert.deepEqual(teamName('  Banana   Squad '), { name: 'Banana Squad', key: 'banana squad' });
  assert.equal(teamName('Æble Hold 3').key, 'æble hold 3');
  assert.equal(teamName("Owls' Nest!").name, "Owls' Nest!");
  assert.equal(teamName('Café Team').name, 'Café Team');
  assert.equal(teamName('Команда 1').key, 'команда 1');
  for (const bad of ['x', 'a'.repeat(25), '  ', '-Owls', 5, null, '<b>Owls</b>', 'Owls<script>', 'a​b']) {
    assert.equal(teamName(bad), null, String(bad));
  }
  assert.equal(teamName('a'.repeat(24)).name.length, 24);
});

test('join_create_taken_join', () => {
  const t = createTeams({ file: null, max: 10 });
  const first = t.join('Banana Squad', { join: false });
  assert.equal(first.created, true);
  assert.equal(first.team.sessionId, null);
  assert.deepEqual(t.join('banana squad', { join: false }), { taken: 'Banana Squad' });
  assert.deepEqual(t.join('banana squad', { join: true }), { team: first.team, created: false });
  assert.equal(t.exists('BANANA squad'), true);
  assert.equal(t.exists('Owls'), false);
  assert.equal(t.exists('x'), false);
});

test('find_rejects_non_uuid', () => {
  const t = createTeams({ file: null, max: 10 });
  const { team } = t.join('Owls', { join: false });
  assert.deepEqual(t.find(team.id), team);
  for (const bad of ['nope', '', null, undefined, 5, {}, '__proto__']) assert.equal(t.find(bad), null);
});

test('persist_and_reload', () => {
  const file = tmp();
  const a = createTeams({ file, max: 10 });
  const { team } = a.join('Banana Squad', { join: false });
  a.attach(team.id, 's1');
  a.attach(team.id, 's2');
  const b = createTeams({ file, max: 10 });
  assert.deepEqual(b.find(team.id), { id: team.id, name: 'Banana Squad', sessionId: 's2' });
  assert.equal(b.join('banana squad', { join: true }).team.id, team.id);
});

test('cap_503', () => {
  const t = createTeams({ file: null, max: 2 });
  t.join('One', { join: false });
  t.join('Two', { join: false });
  assert.throws(() => t.join('Three', { join: false }), (e) => e.status === 503 && e.message === 'The team list is full. Ask the organisers.');
  assert.equal(t.join('two', { join: true }).created, false);
});

test('invalid_400', () => {
  const t = createTeams({ file: null, max: 2 });
  assert.throws(() => t.join('x', { join: false }), (e) => e.status === 400 && e.message === 'Team names are 2 to 24 letters, numbers and spaces.');
});

test('partial_tail_ignored', () => {
  const file = tmp();
  const a = createTeams({ file, max: 10 });
  const { team } = a.join('Owls', { join: false });
  appendFileSync(file, '{"type":"team_created","teamId":"zz","na');
  const b = createTeams({ file, max: 10 });
  assert.equal(b.find('zz'), null);
  assert.equal(b.find(team.id).name, 'Owls');
  b.join('Lynx', { join: false });
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 2);
  assert.equal(createTeams({ file, max: 10 }).exists('Lynx'), true);
});

test('attach_unknown_ignored', () => {
  const file = tmp();
  const t = createTeams({ file, max: 10 });
  t.attach('nope', 's1');
  assert.equal(t.find('nope'), null);
  assert.equal(existsSync(file), false);
});

test('replay_ignores_duplicate_names_and_normalises', () => {
  const file = tmp();
  const rec = (r) => appendFileSync(file, JSON.stringify(r) + '\n');
  rec({ type: 'team_created', teamId: 't1', name: 'Owls  Nest', timestamp: 'x' });
  rec({ type: 'team_created', teamId: 't2', name: 'owls nest', timestamp: 'x' });
  rec({ type: 'team_created', teamId: 't1', name: 'Other Name', timestamp: 'x' });
  rec({ type: 'team_session', teamId: 'nope', sessionId: 's', timestamp: 'x' });
  const teams = createTeams({ file });
  assert.equal(teams.find('t1').name, 'Owls Nest');
  assert.equal(teams.find('t2'), null);
  assert.equal(teams.exists('Other Name'), false);
});
