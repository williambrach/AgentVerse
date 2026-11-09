import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { talkBriefingSteps, talkBriefingList, talkVerdictLabel, coinHint, HINTS } from '../client/tools.ts';

// Pure functions: no producer to fake, so SUPERLITE_REAL needs no switch.
test('talk briefing has the three talk steps and none of the stock ones', () => {
  const steps = talkBriefingSteps();
  assert.equal(steps.length, 3);
  const all = JSON.stringify(steps);
  assert.match(steps[0].title, /everyday/i);
  assert.match(steps[1].text, /Pick words/);
  assert.match(steps[1].text, /Save quote/);
  assert.match(steps[2].title, /1–3 quotes/);
  assert.match(steps[2].text, /costs points, not the game/);
  for (const stale of ['Ask 5', 'quick question', 'Arbiter tools', 'Make your verdict', 'Pick a role']) assert.doesNotMatch(all, new RegExp(stale, 'i'));
});

test('talk briefing list is an escaped task-list', () => {
  const html = talkBriefingList();
  assert.match(html, /^<ol class="task-list">/);
  assert.equal(html.match(/<li>/g).length, 3);
  assert.match(html, /don&#39;t|don’t/);
});

test('rail verdict label counts saved quotes', () => {
  assert.deepEqual(talkVerdictLabel(0), { title: 'Accuse the traveller', progress: '0 quotes saved' });
  assert.equal(talkVerdictLabel(1).progress, '1 quote saved');
  assert.equal(talkVerdictLabel(3).progress, '3 quotes saved');
});

test('main.ts has no inline max-height guess and passes the steps option', () => {
  const src = readFileSync(new URL('../client/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /style\.maxHeight/);
  assert.doesNotMatch(src, /\.replace\(\/<ol class/);
  assert.match(src, /steps: talkBriefingList\(\)/);
  assert.match(src, /talkVerdictLabel/);
});

test('accuse panel gets no background of its own (it painted a blank block over the world)', () => {
  const css = readFileSync(new URL('../client/renaissance.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.split('}')) {
    const [sel, body = ''] = rule.split('{');
    if (/\.accuse-panel\b/.test(sel) && !/\.accuse-panel\s+\S/.test(sel.trim().split(',').pop())) assert.doesNotMatch(body, /background/, sel);
  }
  assert.match(css, /\.dossier:not\(:has\(\.dialogue\)\) \{ background: #f1e4c3/);
});

test('coin hint: a talk case says topics and follow-ups are free; other cases keep the stock line', () => {
  assert.equal(coinHint(false), HINTS.coins);
  assert.match(coinHint(true), /Typed questions cost coins/);
  assert.match(coinHint(true), /free/);
  const src = readFileSync(new URL('../client/main.ts', import.meta.url), 'utf8');
  assert.match(src, /#coin-tip[\s\S]{0,120}coinHint\(Boolean\(state\.talk\)\)/);
});
