import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setText, plain } from '../client/text.ts';

const main = JSON.parse(readFileSync(new URL('../client/text/main.json', import.meta.url), 'utf8'));
const src = readFileSync(new URL('../client/main.ts', import.meta.url), 'utf8');

test('access_offline_defaults_are_the_original_literals', () => {
  setText(main);
  assert.equal(plain('main.access.title'), 'Banana Mystery.');
  assert.equal(plain('main.access.body'), 'Enter the shared access code to open the grove.');
  assert.equal(plain('main.access.open'), 'Open the grove');
  assert.equal(plain('main.offline.title'), 'The grove is offline.');
  for (const k of ['access.title', 'access.body', 'access.open', 'offline.title']) assert.match(src, new RegExp(`t\\('main\\.${k.replace('.', '\\.')}'\\)`));
});
