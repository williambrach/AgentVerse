import test from 'node:test';
import assert from 'node:assert/strict';
import { evidencePanel } from '../client/dialogue.ts';
import { createStage } from '../client/stage.ts';
import { worldFor } from '../client/worlds.ts';

const card = (id, title = id, text = 'text') => ({ id, title, text });

test('evidence panel empty state', () => {
  const html = evidencePanel([], null, 8);
  assert.match(html, /Nothing examined yet\. Walk up to a yellow marker and press E\./);
  assert.match(html, /0 of 8 examined/);
  assert.doesNotMatch(html, /evidence-card/);
});

test('evidence panel lists newest first and opens the focus card', () => {
  const html = evidencePanel([card('a'), card('b'), card('c')], 'b', 8);
  assert.match(html, /3 of 8 examined/);
  const order = [...html.matchAll(/data-evidence="(\w)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['c', 'b', 'a']);
  assert.equal([...html.matchAll(/evidence-card focus open/g)].length, 1);
  assert.match(html, /<article class="evidence-card focus open" data-evidence="b"/);
  assert.match(html, /src="\/assets\/department\/props\/a\.png"/);
});

test('evidence panel escapes title and text', () => {
  const html = evidencePanel([card('x', '<b>T</b>', '<script>alert("1")</script>')], null, 1);
  assert.doesNotMatch(html, /<script>|<b>T/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;T/);
});

test('stage forwards evidence to the live station only', () => {
  const calls = [];
  const fake = name => Object.fromEntries(['configure', 'say', 'clearBubbles', 'resetPosition', 'setEnabled', 'setCovered', 'focus', 'think', 'speak', 'evidence'].map(m => [m, (...a) => { calls.push([name, m, ...a]); }]));
  const stage = createStage({ station: () => fake('station'), roundtable: () => fake('roundtable'), show: () => {} });
  const items = [{ id: 'a', title: 'A', examined: true }];
  stage.evidence(items);
  assert.deepEqual(calls, []);
  stage.configure(worldFor('grove'), [{ id: 'a' }]);
  calls.length = 0;
  stage.evidence(items);
  assert.deepEqual(calls, [['station', 'evidence', items]]);
  stage.configure(worldFor('friends'), [{ id: 'a' }]);
  calls.length = 0;
  stage.evidence(items);
  assert.deepEqual(calls.filter(c => c[1] === 'evidence').map(c => c[0]), ['roundtable']);
});

test('evidence titles reach a prompt that is already shown', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../client/station.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('  evidence(items: EvidenceMark[])'), src.indexOf('private figureImage'));
  assert.match(body, /prompt\.textContent = `\[E\] \$\{shownStop\.title\}`/);
});
