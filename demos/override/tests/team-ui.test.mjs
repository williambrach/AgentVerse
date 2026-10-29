import test from 'node:test';
import assert from 'node:assert/strict';
import { teamNameError, teamGate, leaderboardPanel, clock } from '../client/team.ts';

const MSG = 'Team names are 2 to 24 letters, numbers and spaces.';
const gate = (o = {}) => teamGate({ name: '', error: '', taken: null, busy: false, switching: false, ...o });
const row = (o = {}) => ({ rank: 1, name: 'Owls', points: 1, played: 1, timeMs: 125000, coins: 8, you: true, ...o });

test('team_name_error', () => {
  assert.equal(teamNameError('Owls'), null);
  assert.equal(teamNameError('  Žluťoučký  kůň '), null);
  assert.equal(teamNameError("R&D's #1!"), null);
  for (const bad of ['x', '', '   ', '#hash', '<b>', 'a'.repeat(25)]) assert.equal(teamNameError(bad), MSG);
});

test('clock', () => {
  assert.equal(clock(125000), '2:05');
  assert.equal(clock(3725000), '62:05');
  assert.equal(clock(0), '0:00');
});

test('gate', () => {
  const html = gate();
  for (const s of ['id="team-form"', 'id="team-name"', 'maxlength="24"', 'id="team-submit"', 'id="team-error"', 'TEAM CHECK-IN']) assert.ok(html.includes(s), s);
  assert.ok(!html.includes('team-join') && !html.includes('team-cancel'));
  const t = gate({ taken: 'Owls', switching: true });
  assert.ok(t.includes('id="team-join"') && t.includes('Join Owls') && t.includes('id="team-other"') && t.includes('id="team-cancel"'));
});

test('names_escaped', () => {
  const evil = '<img onerror=x>';
  const html = leaderboardPanel({ rankBy: 'time', teams: [row({ name: evil })] });
  assert.ok(html.includes('&lt;img') && !html.includes('<img'));
  const g = gate({ name: evil, taken: evil, error: evil });
  assert.ok(g.includes('&lt;img') && !g.includes('<img'));
});

test('leaderboard', () => {
  const html = leaderboardPanel({ rankBy: 'time', teams: [row()] });
  assert.ok(html.includes('class="board-row you"'));
  for (const s of ['>1<', 'Owls', '1 pt<', '2:05', '8 coins', 'Ties by time', 'Each case scores once per team: your first guess counts.']) assert.ok(html.includes(s), s);
  const b = leaderboardPanel({ rankBy: 'coins', teams: [row({ rank: null, points: 2, coins: 1, you: false })] });
  assert.ok(b.includes('Playing') && b.includes('2 pts') && b.includes('1 coin<') && b.includes('Ties by coins') && !b.includes('board-row you'));
  assert.ok(leaderboardPanel({ rankBy: 'time', teams: [] }).includes('<p class="board-empty">No team has finished a case yet.</p>'));
});

test('topbar_wraps_narrow', async () => {
  const css = (await import('node:fs')).readFileSync(new URL('../client/team.css', import.meta.url), 'utf8');
  assert.match(css, /max-width:720px\)\{\.topbar\{flex-wrap:wrap;height:auto/);
});
