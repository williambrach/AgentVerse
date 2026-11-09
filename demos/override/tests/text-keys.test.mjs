import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const clientDir = new URL('../client/', import.meta.url);
const textDir = new URL('../client/text/', import.meta.url);

const catalog = {};
for (const f of readdirSync(textDir).filter(n => n.endsWith('.json'))) {
  Object.assign(catalog, JSON.parse(readFileSync(new URL(f, textDir), 'utf8')));
}

// Keys built at runtime: they count as used when their prefix appears as a template literal.
const DYNAMIC_PREFIXES = [];

const sources = readdirSync(clientDir).filter(n => n.endsWith('.ts')).map(n => [n, readFileSync(new URL(n, clientDir), 'utf8')]);
const KEY = /\b(t|plain|tn|plainTn)\(\s*(['"`])([\w.-]+)\2/g;

const literals = [];
for (const [file, src] of sources) {
  for (const m of src.matchAll(KEY)) literals.push({ file, fn: m[1], key: m[3] });
}

const isPlural = key => key.endsWith('.one') || key.endsWith('.other');
const pluralBase = key => key.replace(/\.(one|other)$/, '');

test('keys_used_exist', () => {
  assert.ok(literals.length > 50, 'found key literals');
  for (const { file, fn, key } of literals) {
    if (fn === 'tn' || fn === 'plainTn') {
      assert.ok(`${key}.one` in catalog, `${file}: ${key}.one`);
      assert.ok(`${key}.other` in catalog, `${file}: ${key}.other`);
    } else {
      assert.ok(key in catalog, `${file}: ${key}`);
    }
  }
});

test('plural_pairs_complete', () => {
  const direct = new Set(literals.filter(l => l.fn === 't' || l.fn === 'plain').map(l => l.key));
  for (const key of Object.keys(catalog).filter(isPlural)) {
    if (direct.has(key)) continue; // a plain key that happens to end in .one or .other
    const base = pluralBase(key);
    assert.ok(`${base}.one` in catalog && `${base}.other` in catalog, `${base} needs one and other`);
  }
});

test('no_orphan_keys', () => {
  // A key counts as used when it appears as a quoted literal anywhere in client code
  // (call sites, ternaries, lookup tables), or when it is half of a tn/plainTn plural pair.
  const all = sources.map(([, s]) => s).join('\n');
  const plural = new Set(literals.filter(l => l.fn === 'tn' || l.fn === 'plainTn').flatMap(l => [`${l.key}.one`, `${l.key}.other`]));
  const quoted = key => ["'", '"', '`'].some(q => all.includes(q + key + q));
  const orphans = Object.keys(catalog).filter(key => {
    if (plural.has(key) || quoted(key)) return false;
    return !DYNAMIC_PREFIXES.some(p => key.startsWith(p) && all.includes('`' + p));
  });
  assert.deepEqual(orphans, []);
});

test('keys_prefixed_by_file_area', () => {
  for (const f of readdirSync(textDir).filter(n => n.endsWith('.json'))) {
    const area = f.replace(/\.json$/, '');
    for (const key of Object.keys(JSON.parse(readFileSync(new URL(f, textDir), 'utf8')))) {
      assert.ok(key.startsWith(`${area}.`) || key.split('.')[0] in { tools: 1, hud: 1 }, `${f}: ${key}`);
    }
  }
});

test('quoted_area_keys_exist', () => {
  // Keys passed through ternaries and tables are not call literals; any quoted `area.name` string must still resolve.
  const areas = readdirSync(textDir).filter(n => n.endsWith('.json')).map(n => n.replace(/\.json$/, ''));
  const re = new RegExp(`(['"\`])((?:${areas.join('|')})\\.[\\w.]+)\\1`, 'g');
  const bases = new Set(Object.keys(catalog).filter(isPlural).map(pluralBase));
  for (const [file, src] of sources) {
    if (file === 'text.ts') continue;
    for (const m of src.matchAll(re)) {
      const key = m[2];
      if (key.startsWith('hud.') && /\.(css|ts|js|json)$/.test(key)) continue;
      assert.ok(key in catalog || bases.has(key), `${file}: ${key}`);
    }
  }
});
