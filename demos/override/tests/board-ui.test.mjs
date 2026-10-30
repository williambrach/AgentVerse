import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardScreen, boardRow } from '../client/board.ts';

const cases = [
  { id: 'banana-mystery', title: 'The Banana Mystery', order: 1, total: 4 },
  { id: 'tower-echo-bell', title: 'Lanterns Too Soon', order: 2, total: 3 },
];
const team = (i, state1 = 'perfect', state2 = 'none', o = {}) => ({ rank: i, name: `Team ${i}`, points: 4, played: 1, timeMs: 90000, coins: 12, you: false,
  cells: [{ caseId: 'banana-mystery', state: state1, points: 4 }, { caseId: 'tower-echo-bell', state: state2, points: 1 }], ...o });
const board = (o = {}) => ({ rankBy: 'time', round: 'Session B', cases, teams: [team(1)], ...o });
const count = (html, re) => (html.match(re) || []).length;

test('header_and_counts', () => {
  const html = boardScreen(board({ teams: [team(1), team(2)] }));
  assert.match(html, /class="board-screen"/);
  assert.ok(html.includes('THE ARBITER') && html.includes('LEADERBOARD · SESSION B'));
  assert.match(html, /<b>2<\/b><span>TEAMS/);
  assert.match(html, /<b>2<\/b><span>CASES/);
  assert.equal(count(html, /class="cell-num"/g), 2);
  assert.ok(boardScreen(board({ round: null })).includes('>LEADERBOARD<'));
});

test('cell_states', () => {
  const html = boardScreen(board({ teams: [team(1, 'perfect', 'playing'), team(2, 'partial', 'zero'), team(3, 'none', 'none')] }));
  for (const c of ['perfect', 'partial', 'zero', 'playing', 'none']) assert.ok(html.includes(`class="cell ${c}"`), c);
  assert.match(html, /class="cell perfect"[^>]*>[\s\S]*?<span aria-hidden="true">4<\/span>/);
  assert.match(html, /class="cell playing"[^>]*>[\s\S]*?<span aria-hidden="true">…<\/span>/);
  assert.match(html, /class="cell zero"[^>]*>[\s\S]*?<span aria-hidden="true">0<\/span>/);
});

test('legend', () => {
  const html = boardScreen(board());
  for (const s of ['every role right', 'some right', 'playing now', 'The Banana Mystery', 'Lanterns Too Soon']) assert.ok(html.includes(s), s);
});

test('ten_rows_and_more_line', () => {
  const teams = Array.from({ length: 13 }, (_, i) => team(i + 1));
  const html = boardScreen(board({ teams }));
  assert.equal(count(html, /<tr class="board-row/g), 10);
  assert.ok(html.includes('+ 3 more teams · ties by time'));
  assert.ok(boardScreen(board({ teams, rankBy: 'coins' })).includes('+ 3 more teams · ties by coins'));
  assert.ok(!boardScreen(board({ teams: teams.slice(0, 10) })).includes('more team'));
});

test('unranked_and_no_arbiter_row', () => {
  const html = boardScreen(board({ teams: [team(null)] }));
  assert.match(html, /<td class="board-rank">—<\/td>/);
  assert.doesNotMatch(html, /line to beat|ahead of/i);
});

test('team_name_escaped_board', () => {
  const html = boardScreen(board({ teams: [team(1, 'perfect', 'none', { name: '<b>x</b>' })], cases: [{ ...cases[0], title: '<i>c</i>' }] }));
  assert.ok(!html.includes('<b>x</b>') && !html.includes('<i>c</i>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('empty_board', () => {
  const html = boardScreen(board({ teams: [] }));
  assert.ok(html.includes('No team has finished a case yet.'));
  assert.doesNotMatch(html, /<tr class="board-row/);
});

test('screen_points_and_coins_are_bare_numbers_and_the_overlay_row_keeps_its_units', () => {
  const html = boardScreen(board({ teams: [team(1, 'perfect', 'none', { points: 9, coins: 9, timeMs: 61000 })] }));
  assert.match(html, /<td class="board-points">9<\/td><td>1:01<\/td><td>9<\/td><\/tr>/);
  assert.doesNotMatch(html, /\bpts?\b|\bcoins?<\/td>/);
  const row = boardRow(team(1, 'perfect', 'none', { points: 1, coins: 1 }), cases, 'Playing');
  assert.ok(row.includes('1 pt<') && row.includes('1 coin<'));
});

test('screen_never_highlights_a_row_as_you', () => {
  const html = boardScreen(board({ teams: [team(1, 'perfect', 'none', { you: true }), team(2)] }));
  assert.doesNotMatch(html, /board-row you/);
  assert.ok(boardRow(team(1, 'perfect', 'none', { you: true }), cases, 'Playing').includes('board-row you'));
});

test('cells_in_a_row_align_on_the_middle, not on their text baseline', () => {
  const css = readFileSync(new URL('../client/board.css', import.meta.url), 'utf8');
  assert.match(css.match(/\n\.cell \{[^}]*\}/)[0], /vertical-align:\s*middle/);
});
