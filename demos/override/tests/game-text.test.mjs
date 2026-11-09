import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { worlds } from '../server/worlds.mjs';
import { DEFAULT_TEMPLATES } from '../server/interviews.mjs';
import { loadUiDefaults, gameFields, checkGameEdit, applyGame } from '../server/game-text.mjs';

const fixture = files => {
  const dir = mkdtempSync(join(tmpdir(), 'game-text-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(body));
  return dir;
};
const ui = { 'hud.notebook': 'Notebook', 'tools.coins': '{n} coins' };
const defaults = loadUiDefaults(fixture({ 'hud.json': { 'hud.notebook': 'Notebook' }, 'tools.json': { 'tools.coins': '{n} coins' } }));

test('load_ui_defaults', () => {
  assert.deepEqual(defaults, ui);
  assert.throws(() => loadUiDefaults(fixture({ 'hud.json': { 'x.y': 'a' } })), { message: 'UI text key x.y belongs in x.json.' });
  assert.throws(() => loadUiDefaults(fixture({ 'hud.extra.json': { 'hud.extra.k': 'a' }, 'hud.json': { 'hud.extra.k': 'b' } })), { message: 'UI text key hud.extra.k is defined twice.' });
});

test('fields_cover_all', () => {
  const fields = gameFields(defaults, worlds);
  const paths = fields.map(f => f.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const key of Object.keys(defaults)) assert.ok(paths.includes(`ui.${key}`));
  assert.ok(paths.includes('prompt.interview') && paths.includes('prompt.thread'));
  assert.equal(Object.keys(worlds).length, 6);
  for (const id of Object.keys(worlds)) for (const f of ['frame', 'persona', 'memory', 'cast.one', 'cast.many']) assert.ok(paths.includes(`worlds.${id}.${f}`), `${id}.${f}`);
  assert.equal(fields.find(f => f.path === 'worlds.grove.cast.one').value, 'a monkey');
  assert.equal(fields.find(f => f.path === 'prompt.thread').value, DEFAULT_TEMPLATES.thread);
  assert.equal(paths.length, 2 + 2 + 6 * 5);
});

test('check_game_edit', () => {
  assert.equal(checkGameEdit('ui.tools.coins', '{n} {foo}', defaults, worlds), 'Unknown placeholder {foo}.');
  assert.equal(checkGameEdit('ui.tools.coins', '{n} pennies', defaults, worlds), null);
  assert.equal(checkGameEdit('ui.tools.coins', 'free', defaults, worlds), null);
  assert.equal(checkGameEdit('ui.nope', 'x', defaults, worlds), 'Unknown field ui.nope.');
  assert.equal(checkGameEdit('worlds.grove.agents', '5', defaults, worlds), 'Unknown field worlds.grove.agents.');
  assert.equal(checkGameEdit('worlds.nowhere.frame', 'x', defaults, worlds), 'Unknown field worlds.nowhere.frame.');
  assert.equal(checkGameEdit('ui.hud.notebook', '', defaults, worlds), 'Must not be empty.');
  assert.equal(checkGameEdit('ui.hud.notebook', 5, defaults, worlds), 'Must be text.');
  assert.equal(checkGameEdit('worlds.grove.persona', 'ape', defaults, worlds), null);
});

test('length_caps', () => {
  assert.equal(checkGameEdit('ui.hud.notebook', 'a'.repeat(2001), defaults, worlds), 'Must be at most 2000 characters.');
  assert.equal(checkGameEdit('ui.hud.notebook', 'a'.repeat(2000), defaults, worlds), null);
  assert.equal(checkGameEdit('prompt.interview', 'a'.repeat(8001), defaults, worlds), 'Must be at most 8000 characters.');
});

test('template_checked', () => {
  assert.equal(checkGameEdit('prompt.interview', 'hello', defaults, worlds), 'The template needs [[knowledge]] exactly once.');
  assert.equal(checkGameEdit('prompt.thread', '[[knowledge]] [[foo]]', defaults, worlds), 'Unknown token [[foo]].');
  assert.equal(checkGameEdit('prompt.interview', DEFAULT_TEMPLATES.interview, defaults, worlds), null);
});

test('apply_empty_is_identity', () => {
  const out = applyGame({}, worlds);
  assert.equal(out.worlds, worlds);
  assert.deepEqual({ prompts: out.prompts, ui: out.ui }, { prompts: null, ui: {} });
});

test('ui_only_no_prompts', () => {
  const out = applyGame({ 'ui.hud.notebook': 'Book' }, worlds);
  assert.equal(out.prompts, null);
  assert.deepEqual(out.ui, { 'hud.notebook': 'Book' });
  assert.equal(out.worlds, worlds);
});

test('world_edit_builds_prompts_without_mutating', () => {
  const before = JSON.stringify(worlds);
  const out = applyGame({ 'worlds.grove.persona': 'ape', 'worlds.grove.cast.one': 'an ape' }, worlds);
  assert.equal(JSON.stringify(worlds), before);
  assert.equal(out.worlds.grove.persona, 'ape');
  assert.equal(out.worlds.grove.cast.one, 'an ape');
  assert.equal(out.worlds.grove.cast.many, 'monkeys');
  assert.equal(out.worlds.tower, worlds.tower);
  assert.ok(Object.isFrozen(out.worlds) && Object.isFrozen(out.worlds.grove) && Object.isFrozen(out.worlds.grove.cast));
  assert.equal(out.prompts.interview, DEFAULT_TEMPLATES.interview);
  assert.equal(out.prompts.thread, DEFAULT_TEMPLATES.thread);
  assert.match(out.prompts.interviewVersion, /^interview-v5\+[0-9a-f]{8}$/);
  assert.match(out.prompts.threadVersion, /^thread-v4\+[0-9a-f]{8}$/);
  const same = applyGame({ 'worlds.grove.cast.one': 'an ape', 'worlds.grove.persona': 'ape' }, worlds);
  assert.equal(same.prompts.interviewVersion, out.prompts.interviewVersion);
  assert.notEqual(applyGame({ 'worlds.grove.persona': 'gibbon' }, worlds).prompts.interviewVersion, out.prompts.interviewVersion);
});

test('cast_only_edit_keeps_prompts_null', () => {
  const out = applyGame({ 'worlds.grove.cast.many': 'apes' }, worlds);
  assert.equal(out.prompts, null);
  assert.equal(out.worlds.grove.cast.many, 'apes');
});

test('prompt_edit', () => {
  const tpl = '[[knowledge]] only';
  const out = applyGame({ 'prompt.interview': tpl }, worlds);
  assert.equal(out.prompts.interview, tpl);
  assert.equal(out.prompts.thread, DEFAULT_TEMPLATES.thread);
  assert.equal(out.worlds, worlds);
});
