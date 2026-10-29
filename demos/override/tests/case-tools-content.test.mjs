import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defineCase } from '../server/cases.mjs';
import { minimalCase } from './fixtures/minimal-case.mjs';
import banana from '../server/cases/banana-mystery.mjs';
import tower from '../server/cases/tower-echo-bell.mjs';

const words = s => s.trim().split(/\s+/).length;
const leaks = [...readFileSync(new URL('./browser/provenance.spec.mjs', import.meta.url), 'utf8').matchAll(/^\s+'(.+)',$/gm)].map(m => m[1]);
const session = { selectedEvidence: null };

test('defineCase keeps the tool functions and validates them', () => {
  const fn = () => 'x';
  const kase = defineCase({ ...minimalCase, rehearsalReasoning: fn, rehearsalChatter: fn });
  assert.equal(kase.rehearsalReasoning, fn);
  assert.equal(kase.rehearsalChatter, fn);
  assert.ok(Object.isFrozen(kase));
  assert.doesNotThrow(() => defineCase(minimalCase));
  assert.throws(() => defineCase({ ...minimalCase, rehearsalReasoning: 'x' }), /rehearsalReasoning: must be a function/);
  assert.throws(() => defineCase({ ...minimalCase, rehearsalChatter: 1 }), /rehearsalChatter: must be a function/);
});

test('banana-mystery hash is unchanged', () => assert.equal(banana.contentHash, 'd3d6d3b88060'));

test('tower-echo-bell hash is unchanged', () => assert.equal(tower.contentHash, '034b87367f37'));

for (const kase of [banana, tower]) {
test(`${kase.id} reasoning and chatter`, () => {
  assert.ok(leaks.length >= 5);
  const forbidden = [
    ...Object.values(kase.knowledge).flat(),
    kase.debrief.title, kase.debrief.summary, kase.debrief.lesson,
    ...kase.debrief.findings.flatMap(f => [f.classification, f.explanation]),
    kase.answer.feedback.correct, kase.answer.feedback.other, ...leaks,
  ].map(s => s.toLowerCase());
  for (const { id } of kase.characters) {
    const r = kase.rehearsalReasoning(session, id);
    assert.ok(words(r) >= 30 && words(r) <= 120, `${id} reasoning ${words(r)} words`);
    const posts = [0, 1, 2].map(n => kase.rehearsalChatter(session, id, n));
    posts.forEach(p => assert.ok(words(p) >= 15 && words(p) <= 40, `${id} post ${words(p)} words`));
    assert.equal(new Set(posts).size, 3);
    assert.equal(kase.rehearsalChatter(session, id, 3), posts[0]);
    for (const text of [r, ...posts]) for (const bad of forbidden) assert.ok(!text.toLowerCase().includes(bad), `${id} leaks: ${bad}`);
  }
});
}

test('tower-echo-bell: nobody lied, posts address each other by name', () => {
  const names = tower.characters.map(c => c.name);
  for (const { id, name } of tower.characters) {
    const texts = [tower.rehearsalReasoning(session, id), ...[0, 1, 2].map(n => tower.rehearsalChatter(session, id, n))];
    texts.forEach(t => assert.ok(!/\b(lied|lie|made up|fooled me|echo shell)\b/i.test(t), `${id}: ${t}`));
    for (const n of [0, 1, 2]) {
      const post = tower.rehearsalChatter(session, id, n);
      assert.ok(names.some(o => o !== name && post.includes(o)), `${id} post ${n} names no one`);
    }
  }
});
