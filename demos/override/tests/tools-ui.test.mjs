import test from 'node:test';
import assert from 'node:assert/strict';
import { coinLabel, toolChip, toolBlock, toolCard, toolGuide, reasoningBlock, noThoughtBlock, threadPanel, pluralise, HINTS } from '../client/tools.ts';

const eco = (budget, spent, used = {}) => ({
  budget, spent, costs: { ask: 2, inspect: 5, continue: 1 },
  charges: { inspect: { max: 1, used: used.inspect ?? 0 }, continue: { max: 3, used: used.continue ?? 0 } },
});

test('coin_label', () => {
  assert.equal(coinLabel(eco(15, 6)), '6 / 15 coins');
  assert.equal(coinLabel(eco(null, 1)), '1 coin');
  assert.equal(coinLabel(eco(null, 4)), '4 coins');
});

test('tool_chip', () => {
  assert.equal(toolChip(eco(null, 0), 'ask'), '2 coins');
  assert.equal(toolChip(eco(null, 0), 'inspect'), '5 coins · 1 left');
  assert.equal(toolChip(eco(null, 0, { continue: 3 }), 'continue'), '0 left');
});

test('tool_block', () => {
  assert.deepEqual(toolBlock(eco(15, 0, { continue: 3 }), 'continue', 0), { enabled: false, reason: '0 left' });
  assert.deepEqual(toolBlock(eco(15, 12), 'inspect', 0), { enabled: false, reason: 'Not enough coins' });
  assert.deepEqual(toolBlock(eco(15, 6), 'inspect', 6), { enabled: false, reason: 'Save coins to ask everyone' });
  assert.deepEqual(toolBlock(eco(15, 0), 'inspect', 6), { enabled: true, reason: null });
  assert.deepEqual(toolBlock(eco(null, 999), 'inspect', 50), { enabled: true, reason: null });
  assert.deepEqual(toolBlock(eco(null, 0, { inspect: 1 }), 'inspect', 0), { enabled: false, reason: '0 left' });
  assert.equal(toolBlock(eco(null, 0, { inspect: 1, continue: 3 }), 'ask', 0).enabled, true);
  assert.notEqual(toolChip(eco(null, 0, { inspect: 1, continue: 3 }), 'ask'), '0 left');
});

test('reasoning_block_escapes', () => {
  const html = reasoningBlock({ character: 'momo', sourceEventId: 'e1', reasoning: '<b>', timestamp: 't' }, 'Momo');
  assert.match(html, /class="speech reasoning"/);
  assert.match(html, /data-motion-key="reasoning-e1"/);
  assert.match(html, /Momo’s reasoning/);
  assert.match(html, /&lt;b&gt;/);
  const nasty = `&<>"'`;
  const h2 = reasoningBlock({ character: 'm', sourceEventId: nasty, reasoning: nasty, timestamp: 't' }, nasty);
  assert.ok(!/[<>]"|<b|"'/.test(h2.replace(/<[^>]*>/g, '')));
  assert.equal((h2.match(/&amp;&lt;&gt;&quot;&#39;/g) ?? []).length, 3);
});

test('thread_panel', () => {
  const lines = [{ character: 'momo', text: '<i>hi</i>', round: 1, timestamp: 't' }, { character: 'pip', text: 'x', round: 1, timestamp: 't' }];
  const html = threadPanel(lines, { momo: 'Momo', pip: 'Pip' }, 0);
  assert.match(html, /id="thread-log"/);
  assert.match(html, /role="log"/);
  assert.equal((html.match(/class="thread-post"/g) ?? []).length, 2);
  assert.match(html, /class="panel-heading"><span class="eyebrow">[^<]+<\/span><h2>The agents’ thread<\/h2>/);
  assert.match(html, /<div class="notebook-content"><ol id="thread-log"/);
  assert.match(html, /<h4 class="thread-author">#1 Momo<\/h4>/);
  assert.match(html, /#1 Momo/);
  assert.match(html, /#2 Pip/);
  assert.match(html, /&lt;i&gt;hi&lt;\/i&gt;/);
  assert.match(html, /They see each other’s earlier lines, never your questions\./);
  assert.ok(!html.includes('thread-pending'));
  assert.match(threadPanel(lines, { momo: '<M>', pip: 'Pip' }, 1), /thread-pending/);
  assert.match(threadPanel(lines, { momo: '<M>', pip: 'Pip' }, 1), /#1 &lt;M&gt;/);
});

test('tool_card', () => {
  const on = toolCard({ tool: 'inspect', id: 'inspect-button', label: 'Inspect reasoning', target: '<Momo>', chip: '5 coins · 1 left', enabled: true, busy: false, fresh: true });
  assert.match(on, /<button class="tool-button" id="inspect-button" type="button" aria-describedby="tip-inspect">Inspect reasoning<\/button>/);
  assert.match(on, /<span class="tool-target">&lt;Momo&gt;<\/span><span class="tool-chip" data-tool="inspect">5 coins · 1 left<\/span>/);
  assert.match(on, /class="tool-card fresh"/);
  assert.match(on, /class="tool-new"/);
  assert.match(on, /id="tip-inspect" role="tooltip">See how this character reasoned/);
  const off = toolCard({ tool: 'continue', id: 'continue-button', label: 'Let them talk', target: '', chip: '0 left', enabled: false, busy: false, fresh: false, extra: '<button id="read-thread">Read thread</button>' });
  assert.match(off, /class="tool-card off"/);
  assert.match(off, /aria-describedby="tip-continue" disabled>Let them talk<\/button>/);
  assert.ok(!off.includes('tool-target') && !off.includes('tool-new'));
  assert.match(off, /<button id="read-thread">Read thread<\/button>/);
  const busy = toolCard({ tool: 'inspect', id: 'inspect-button', label: 'Inspect reasoning', target: 'Momo', chip: '5 coins · 1 left', enabled: true, busy: true, fresh: false });
  assert.match(busy, /class="tool-card" data-card="inspect"/);
  assert.match(busy, /aria-describedby="tip-inspect" disabled>/);
});

test('tool_guide', () => {
  const html = toolGuide(eco(15, 0));
  assert.equal(html.match(/<li>/g).length, 2);
  assert.match(html, /<b>Inspect reasoning<\/b>.*<em>5 coins · 1 use<\/em>/);
  assert.match(html, /<b>Let them talk<\/b>.*<em>1 coin · 3 uses<\/em>/);
});

test('hints', () => {
  for (const k of ['coins', 'ask', 'inspect', 'continue']) assert.ok(HINTS[k].length > 5);
});

test('tools_block_combined', async () => {
  const { toolsBlock } = await import('../client/tools.ts');
  // 3 coins left: ask alone (2) fits, ask + continue (3) leaves 0 but reserve 1 blocks it
  assert.deepEqual(toolsBlock(eco(15, 12), ['ask'], 0), { enabled: true, reason: null });
  assert.deepEqual(toolsBlock(eco(15, 12), ['ask', 'continue'], 1), { enabled: false, reason: 'Save coins to ask everyone' });
  assert.deepEqual(toolsBlock(eco(15, 13), ['ask', 'continue'], 0), { enabled: false, reason: 'Not enough coins' });
  assert.deepEqual(toolsBlock(eco(null, 0, { continue: 3 }), ['ask', 'continue'], 0), { enabled: false, reason: '0 left' });
});

test('pluralise', () => {
  assert.equal(pluralise(1, 'question'), '1 question');
  assert.equal(pluralise(0, 'question'), '0 questions');
  assert.equal(pluralise(2, 'inspection'), '2 inspections');
  assert.equal(pluralise(1, 'conversation'), '1 conversation');
  assert.equal(pluralise(3, 'conversation'), '3 conversations');
});

test('noThoughtBlock says the character did not think, escaped', () => {
  const html = noThoughtBlock('<b>Momo</b>', 2);
  assert.match(html, /class="speech reasoning no-thought"/);
  assert.match(html, /data-motion-key="no-thought-2"/);
  assert.ok(html.includes('&lt;b&gt;Momo&lt;/b&gt; did not think. No coins spent.'));
  assert.ok(!html.includes('<b>Momo'));
});
