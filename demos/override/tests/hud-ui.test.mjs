import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { hudShell, castCard } from '../client/hud.ts';

const shell = (over = {}) => hudShell({ teamName: 'Night Owls', headline: 'Who took the bananas?', topline: 'THE BANANA MYSTERY', ...over });
const css = readFileSync(new URL('../client/hud.css', import.meta.url), 'utf8');
const rule = selector => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `rule for ${selector}`);
  return css.slice(at, css.indexOf('}', at));
};

test('shell_has_hooks', () => {
  const html = shell();
  for (const needle of ['id="station"', 'class="topbar"', 'id="case-eyebrow"', 'id="case-headline"', 'id="world-name"', 'id="elapsed"',
    'id="team-button"', 'id="coin-counter"', 'id="notebook-button"', 'id="leaderboard-button"', 'id="restart-button"', 'id="reset-button"',
    'id="export-button"', 'id="room-nav"', 'id="toolbelt"', 'id="toolbelt-cards"', 'ARBITER TOOLS', 'id="quick-progress"', 'data-go="report"',
    'Make your verdict', 'id="panel"', 'id="notebook-section"', 'id="dialogue-close"', 'id="movement-hint"', 'id="toast"', 'id="overlay-root"',
    'AUTHORED DEMONSTRATION', 'id="mode-badge"', 'aria-label="The Override home"']) assert.ok(html.includes(needle), needle);
  assert.ok(html.includes('Who took the bananas?') && html.includes('THE BANANA MYSTERY'));
});

test('no_rival_arbiter_chip', () => {
  assert.ok(!/The Arbiter</.test(shell()));
});

test('team_name_escaped', () => {
  const html = shell({ teamName: '<img src=x>', headline: '<b>x</b>', topline: '"><script>' });
  assert.ok(!html.includes('<img src=x>') && !html.includes('<b>x</b>') && !html.includes('<script>'));
  assert.ok(html.includes('&lt;img src=x&gt;'));
});

test('hud_gaps_click_through', () => {
  assert.match(rule('#app[data-hud]'), /pointer-events:\s*none/);
  // Not on bare #app: the team gate and the access screen render inside it before the shell exists.
  assert.doesNotMatch(rule('#app'), /pointer-events/);
  assert.match(rule('.hud-body'), /pointer-events:\s*none/);
  assert.match(css, /\.dossier[^{]*\{[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.hud-rail > \*[^{]*\{[^}]*pointer-events:\s*auto/);
});

test('closed_box_hidden_and_compact_flow', () => {
  assert.match(css, /#app\[data-dialogue="closed"\] \.dossier\s*\{\s*display:\s*none/);
  assert.match(css, /max-width:\s*900px/);
  assert.match(css, /480\s*\/\s*340/);
});

const card = (state, extra = {}) => castCard({ id: 'pip', name: 'Pip', part: 'The carrier', faceClass: 'pip slot-1', state, ...extra });

test('cast_card_states', () => {
  const talking = card('talking'), asked = card('asked'), fresh = card('new');
  assert.ok(talking.startsWith('<button data-go="pip"'));
  assert.ok(talking.includes('The carrier · talking') && !talking.includes('not asked'));
  assert.ok(asked.includes('The carrier</small>'));
  assert.ok(fresh.includes('The carrier · not asked'));
  assert.ok(talking.includes('aria-current="true"'));
  assert.ok(!asked.includes('aria-current') && !fresh.includes('aria-current'));
  assert.ok(talking.includes('class="monkey-face pip slot-1"'));
});

test('cast_card_check_icon', () => {
  assert.ok(card('asked').includes('<svg'));
  assert.ok(!card('new').includes('<svg'));
  assert.ok(!card('talking').includes('<svg'));
  assert.ok(card('talking', { asked: true }).includes('<svg'));
});

test('cast_card_escapes', () => {
  const html = castCard({ id: 'a"b', name: '<i>', part: '<u>', faceClass: 'x" onclick="y', state: 'new' });
  assert.ok(!html.includes('<i>') && !html.includes('<u>') && !html.includes('onclick="y'));
});

test('shell_has_a_strip_for_the_mode_below_the_top_bar', () => {
  const html = shell();
  const bar = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  assert.ok(!bar.includes('authored-label') && !bar.includes('id="mode-badge"'));
  assert.ok(html.indexOf('class="mode-strip"') > html.indexOf('</header>') && html.indexOf('id="mode-badge"') > html.indexOf('class="mode-strip"'));
  assert.ok(html.includes('id="elapsed">0:00<'));
});

test('portrait_size_comes_from_cell', () => {
  // The .monkey-face sizing rule itself lives in banana.css; the rail card only sets --cell.
  assert.match(rule('.cast-tile'), /--cell:\s*44px/);
  assert.doesNotMatch(css, /#app \.monkey-face\b/);
});

test('gate_clicks_only_under_data_hud', () => {
  assert.doesNotMatch(css, /(^|\n)#app \{[^}]*pointer-events/);
  for (const m of css.matchAll(/([^{}\n]+)\{[^}]*pointer-events:\s*none/g)) {
    if (m[1].trim() === '#app') assert.fail(`bare #app gate: ${m[1]}`);
  }
});

test('tools_css_merged_and_gone', () => {
  assert.ok(!existsSync(new URL('../client/tools.css', import.meta.url)));
  assert.match(css, /\.tool-tipbox/);
  assert.match(css, /\.coin-wrap:hover \.coin-tip/);
  assert.doesNotMatch(css, /\.tool-guide|\.speech\.reasoning|\.thread-post|\n\.dossier-top \{/);
});

test('lineup_dossier_edge_to_edge', () => {
  const r = rule('#app[data-view="lineup"] .dossier');
  assert.match(r, /position:\s*fixed/); assert.match(r, /inset:\s*0/); assert.match(r, /margin:\s*0/);
});
