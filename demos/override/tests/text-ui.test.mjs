import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { t, plain, tn, setText, loadText } from '../client/text.ts';
import { hudShell, castCard } from '../client/hud.ts';
import { toolCard, toolGuide, toolChip, toolsBlock, threadPanel, talkBriefingList, talkVerdictLabel, reasoningBlock, noThoughtBlock } from '../client/tools.ts';

const read = name => JSON.parse(readFileSync(new URL(`../client/text/${name}.json`, import.meta.url), 'utf8'));
const hud = read('hud');
const tools = read('tools');
afterEach(() => setText({}));

const eco = { budget: 15, spent: 0, costs: { ask: 2, inspect: 5, continue: 3 }, charges: { inspect: { max: 1, used: 0 }, continue: { max: 3, used: 0 } } };
const render = () => [
  hudShell({ teamName: 'x', headline: 'y', topline: 'z' }),
  castCard({ id: 'a', name: 'A', part: 'P', faceClass: 'f', state: 'talking', asked: true }),
  castCard({ id: 'a', name: 'A', part: 'P', faceClass: 'f', state: 'new' }),
  toolGuide(eco),
  toolCard({ tool: 'inspect', id: 'i', label: 'L', target: '', chip: 'c', enabled: true, busy: false, fresh: true }),
  reasoningBlock({ sourceEventId: 'e', reasoning: 'r' }, 'Maya'), noThoughtBlock('Maya', 1),
  threadPanel([], {}, 2), talkBriefingList(),
].join('\n');

test('catalog_prefixes', () => {
  assert.ok(Object.keys(hud).every(k => k.startsWith('hud.')));
  assert.ok(Object.keys(tools).every(k => k.startsWith('tools.')));
});

test('t_plain_tn', () => {
  assert.equal(t('tools.talk'), 'Let them talk');
  setText({ 'tools.talk': '<b>Chat</b>' });
  assert.equal(t('tools.talk'), '&lt;b&gt;Chat&lt;/b&gt;');
  assert.equal(plain('tools.talk'), '<b>Chat</b>');
  setText({});
  assert.equal(tn('tools.coin', 1), '1 coin');
  assert.equal(tn('tools.coin', 3), '3 coins');
  assert.equal(t('nope.key'), 'nope.key');
});

test('vars_escaped_in_t_raw_in_plain', () => {
  assert.equal(t('hud.talking', { part: '<i>' }), '&lt;i&gt; · talking');
  assert.equal(plain('hud.talking', { part: '<i>' }), '<i> · talking');
});

test('probe_escapes', () => {
  const evil = {};
  for (const k of [...Object.keys(hud), ...Object.keys(tools)]) evil[k] = '<i>"&';
  setText(evil);
  const html = render();
  assert.ok(!html.includes('<i>'), 'raw tag leaked');
  assert.ok(!html.includes('&amp;amp;'), 'double escaped');
  assert.ok(html.includes('&lt;i&gt;'));
  const chip = toolChip(eco, 'inspect');
  assert.ok(!chip.includes('&amp;'));
});

test('overrides_apply_to_plain_exports', () => {
  setText({ 'tools.chipLeft': '{cost} / {n}', 'tools.notEnough': 'Poor' });
  assert.equal(toolChip(eco, 'inspect'), '5 coins / 1');
  assert.equal(toolsBlock({ ...eco, spent: 14 }, ['ask'], 0).reason, 'Poor');
  assert.equal(talkVerdictLabel(1).progress, '1 quote saved');
});

test('load_timeout', async () => {
  setText({});
  const started = Date.now();
  await loadText(() => new Promise(() => {}), 150);
  assert.ok(Date.now() - started >= 140);
  assert.equal(t('tools.talk'), 'Let them talk');
  await loadText(async () => ({ ok: false, status: 500, json: async () => ({ text: { 'tools.talk': 'X' } }) }), 150);
  assert.equal(t('tools.talk'), 'Let them talk');
  await loadText(async () => { throw new Error('down'); }, 150);
  assert.equal(t('tools.talk'), 'Let them talk');
  await loadText(async () => ({ ok: true, json: async () => ({ text: { 'tools.talk': 'Chat' } }) }), 150);
  assert.equal(t('tools.talk'), 'Chat');
});

test('keys_exist', () => {
  const all = { ...hud, ...tools };
  for (const file of ['hud.ts', 'tools.ts']) {
    const src = readFileSync(new URL(`../client/${file}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\b(?:t|plain|tn|plainTn)\(\s*'([\w.]+)'/g)) {
      const key = m[1];
      const found = key in all || (`${key}.one` in all && `${key}.other` in all);
      assert.ok(found, `${file}: ${key}`);
    }
  }
});

test('all_areas_loaded: every client/text/*.json is imported and its keys resolve to the default', () => {
  const dir = new URL('../client/text/', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const src = readFileSync(new URL('../client/text.ts', import.meta.url), 'utf8');
  assert.equal((src.match(/from '\.\/text\/[\w-]+\.json'/g) || []).length, files.length);
  for (const f of files) {
    for (const [key, value] of Object.entries(JSON.parse(readFileSync(new URL(f, dir), 'utf8')))) {
      assert.equal(plain(key), value, key);
    }
  }
});
