import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const css = readFileSync(new URL('../client/stage.css', import.meta.url), 'utf8');
const baseLine = (text) => text.split('\n').find((l) => l.startsWith('.station-prompt {'));

test('compact worlds restyle the station prompt', () => {
  const line = css.split('\n').find((l) => l.startsWith('.station-labels[data-labels="compact"] .station-prompt'));
  assert.ok(line, 'compact prompt rule missing');
  assert.match(line, /#F4B740/);
  assert.match(line, /rgba\(22, 16, 10, \.78\)/);
  assert.match(line, /\* 5\.5\)/);
});

test('base station prompt rule is unchanged from dc77be1', () => {
  const base = execSync('git show dc77be1:demos/override/client/stage.css', { encoding: 'utf8', cwd: new URL('../..', import.meta.url) });
  assert.ok(baseLine(base));
  assert.equal(baseLine(css), baseLine(base));
});
