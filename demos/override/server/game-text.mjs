import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DEFAULT_TEMPLATES, checkTemplate, promptVersion, threadPromptVersion } from './interviews.mjs';

// The game text document: UI strings, the two prompt templates and each world's wording, as flat `path -> text` fields.
const UI_MAX = 2000;
const TEMPLATE_MAX = 8000;
const WORLD_FIELDS = ['frame', 'persona', 'memory', 'cast.one', 'cast.many'];
// The rules for all actors are per case (`rules`); the game document keeps only the thread task line.
const PROMPT_KINDS = ['thread'];

/** Reads every `<name>.json` in `dir` into one map. Each key must start with `<name>.` and appear once. */
export function loadUiDefaults(dir) {
  const out = {};
  for (const file of readdirSync(dir).filter(name => name.endsWith('.json')).sort()) {
    const name = basename(file, '.json');
    const part = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    for (const [key, value] of Object.entries(part)) {
      if (Object.hasOwn(out, key)) throw new Error(`UI text key ${key} is defined twice.`);
      if (!key.startsWith(`${name}.`)) throw new Error(`UI text key ${key} belongs in ${key.split('.')[0]}.json.`);
      if (typeof value !== 'string') throw new Error(`UI text key ${key} must be text.`);
      out[key] = value;
    }
  }
  return out;
}

const worldValue = (world, field) => (field === 'cast.one' ? world.cast?.one : field === 'cast.many' ? world.cast?.many : world[field]);

/** Every editable field of the game document, with today's text. */
export function gameFields(uiDefaults, worlds) {
  const fields = Object.entries(uiDefaults).map(([key, value]) => ({ path: `ui.${key}`, kind: 'text', value }));
  for (const kind of PROMPT_KINDS) fields.push({ path: `prompt.${kind}`, kind: 'text', value: DEFAULT_TEMPLATES[kind] });
  for (const id of Object.keys(worlds)) for (const field of WORLD_FIELDS) fields.push({ path: `worlds.${id}.${field}`, kind: 'text', value: worldValue(worlds[id], field) });
  return fields;
}

const placeholders = text => new Set([...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]));

/** The message for a bad edit, or null. */
export function checkGameEdit(path, value, uiDefaults, worlds) {
  const unknown = `Unknown field ${path}.`;
  if (typeof path !== 'string') return 'Unknown field.';
  let kind;
  if (path.startsWith('ui.')) { if (!Object.hasOwn(uiDefaults, path.slice(3))) return unknown; kind = 'ui'; }
  else if (path.startsWith('prompt.')) { if (!PROMPT_KINDS.includes(path.slice(7))) return unknown; kind = 'prompt'; }
  else {
    const m = /^worlds\.([^.]+)\.(.+)$/.exec(path);
    if (!m || !Object.hasOwn(worlds, m[1]) || !WORLD_FIELDS.includes(m[2])) return unknown;
    kind = 'world';
  }
  if (typeof value !== 'string') return 'Must be text.';
  if (value.trim() === '') return 'Must not be empty.';
  if (value.length > (kind === 'prompt' ? TEMPLATE_MAX : UI_MAX)) return `Must be at most ${kind === 'prompt' ? TEMPLATE_MAX : UI_MAX} characters.`;
  if (kind === 'prompt') return checkTemplate(path.slice(7), value);
  if (kind === 'ui') {
    const allowed = placeholders(uiDefaults[path.slice(3)]);
    const bad = [...placeholders(value)].find(name => !allowed.has(name));
    if (bad !== undefined) return `Unknown placeholder {${bad}}.`;
  }
  return null;
}

/** Edits are checked already. Returns the worlds to run (the same object when none changed), the prompts (null when none changed) and the UI overrides. */
export function applyGame(edits, worlds) {
  const ui = {};
  const prompt = {};
  const wording = {};
  const next = {};
  for (const [path, value] of Object.entries(edits ?? {})) {
    if (path.startsWith('ui.')) ui[path.slice(3)] = value;
    else if (path.startsWith('prompt.')) { prompt[path.slice(7)] = value; wording[path] = value; }
    else {
      const m = /^worlds\.([^.]+)\.(.+)$/.exec(path);
      if (!m || !Object.hasOwn(worlds, m[1])) continue;
      (next[m[1]] ??= {})[m[2]] = value;
      if (!m[2].startsWith('cast.')) wording[path] = value;
    }
  }
  let applied = worlds;
  if (Object.keys(next).length) {
    applied = Object.freeze(Object.fromEntries(Object.entries(worlds).map(([id, world]) => {
      const edit = next[id];
      if (!edit) return [id, world];
      const cast = Object.freeze({ ...world.cast, ...(edit['cast.one'] !== undefined && { one: edit['cast.one'] }), ...(edit['cast.many'] !== undefined && { many: edit['cast.many'] }) });
      return [id, Object.freeze({ ...world, ...Object.fromEntries(['frame', 'persona', 'memory'].filter(f => edit[f] !== undefined).map(f => [f, edit[f]])), cast })];
    })));
  }
  if (!Object.keys(wording).length) return { worlds: applied, prompts: null, ui };
  const hash = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(wording).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))))).digest('hex').slice(0, 8);
  return {
    worlds: applied,
    prompts: {
      thread: prompt.thread ?? DEFAULT_TEMPLATES.thread,
      interviewVersion: `${promptVersion}+${hash}`,
      threadVersion: `${threadPromptVersion}+${hash}`,
    },
    ui,
  };
}
