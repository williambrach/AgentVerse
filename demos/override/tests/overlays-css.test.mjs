import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../client/${f}`, import.meta.url), 'utf8');
const files = { 'case-board.css': read('case-board.css'), 'team.css': read('team.css') };

test('no old-theme white or paper backgrounds, tokens in use', () => {
  for (const [name, css] of Object.entries(files)) {
    assert.doesNotMatch(css, /background[^;{}]*#fff(?![0-9a-f])/i, name);
    assert.doesNotMatch(css, /#fff9e8|#f3f0d8|#fffbed/i, name);
    assert.match(css, /var\(--/, name);
  }
});

test('team.css styles .team-gate on its own, with a readable #team-error and no .topbar rule', () => {
  const css = files['team.css'];
  assert.match(css, /\.team-gate\s*\{/);
  assert.doesNotMatch(css, /\.modal-shade/);
  assert.doesNotMatch(css, /\.topbar/);
  assert.match(css, /#team-error[^{]*\{[^}]*color:\s*var\(--[a-z-]+,\s*#(?:F08A8A|F2A093|EA6A55|FF[0-9A-F]{4})/i);
});

const rule = (css, selector) => { const at = css.indexOf(`${selector} {`); assert.ok(at >= 0, selector); return css.slice(at, css.indexOf('}', at)); };

test('dark panels: gold primary, cream-outline secondary, readable eyebrow, on gate, access screen and overlay', () => {
  const css = files['team.css'];
  for (const host of ['.reset-card.team-gate', '.access-screen .reset-card', '.reset-card.board-card']) {
    assert.ok(css.includes(`${host} .primary-button`), host);
    assert.ok(css.includes(`${host} .secondary-button`), host);
    assert.ok(css.includes(`${host} .eyebrow`), host);
  }
  assert.match(rule(css, '.reset-card.team-gate .primary-button, .access-screen .reset-card .primary-button, .reset-card.board-card .primary-button'), /background: var\(--gold, #F4B740\)/);
  assert.match(rule(css, '.reset-card.team-gate .secondary-button, .access-screen .reset-card .secondary-button, .reset-card.board-card .secondary-button'), /border-color: var\(--cream, #F4EBD3\); color: var\(--cream, #F4EBD3\)/);
  assert.match(rule(css, '.access-screen .reset-card'), /background: var\(--panel/);
});

test('the leaderboard overlay styles its own table and is wide enough for one-line rows', () => {
  const css = files['team.css'];
  assert.match(rule(css, '.board-card'), /width: 8[0-9]{2}px/);
  for (const part of ['.board-card .board-table', '.board-card .board-table caption', '.board-card .board-table td', '.board-card .board-row.you td'])
    assert.ok(css.includes(`${part} {`), part);
  assert.match(rule(css, '.board-card .board-table td'), /white-space: nowrap/);
});

test('the case preview pane has a type scale and spacing on parchment, with a gold primary', () => {
  const css = files['case-board.css'];
  for (const part of ['.case-board .intro-card', '.intro-card .intro-stamp', '.intro-card h2', '.intro-card .intro-lead', '.intro-card #intro-body', '.intro-card .intro-flow', '.intro-card .fine-print', '.intro-card .monkey-line'])
    assert.ok(css.includes(`${part} {`), part);
  assert.match(css, /\.case-board \.intro-card \{ display: flex;[^}]*padding: 2\d+px/);
  assert.match(rule(css, '.intro-card h2'), /font-size: 3\d+px/);
  assert.match(rule(css, '.intro-card .secondary-button'), /border-color: var\(--text/);
  assert.doesNotMatch(css, /\.intro-card \.primary-button[^{]*\{[^}]*background/);
});
