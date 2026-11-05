import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('app.css forces [hidden] elements to display none', () => {
  const css = readFileSync(new URL('../../server/admin/app.css', import.meta.url), 'utf8');
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
});
