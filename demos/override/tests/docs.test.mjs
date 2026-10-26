import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelConfig } from '../server/interviews.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('endpoints_example_loads', () => {
  const env = { OVERRIDE_ENDPOINTS: join(root, 'ops/endpoints.example.json') };
  for (const letter of 'ABCD') env[`OVERRIDE_ENDPOINT_${letter}_KEY`] = `key-${letter}`;
  const config = modelConfig(env);
  assert.equal(config.mode, 'live');
  assert.deepEqual(config.endpoints.map(e => e.name), ['a', 'b', 'c', 'd']);
});

test('env_example_complete', () => {
  const example = readFileSync(join(root, '.env.example'), 'utf8');
  const spec = readFileSync(join(root, 'docs/plans/2026-10-26-backend-200.spec.md'), 'utf8');
  const line = spec.split('\n').find(l => l.startsWith('**Environment:**'));
  const names = new Set(line.match(/OVERRIDE_[A-Z_]+/g));
  for (const file of readdirSync(join(root, 'server')).filter(f => f.endsWith('.mjs'))) {
    for (const m of readFileSync(join(root, 'server', file), 'utf8').matchAll(/env\.(OVERRIDE_[A-Z_]+)/g)) names.add(m[1]);
  }
  assert.ok(names.size >= 15);
  for (const name of names) assert.match(example, new RegExp(`^#?\\s*${name}=`, 'm'), `${name} missing from .env.example`);
});
