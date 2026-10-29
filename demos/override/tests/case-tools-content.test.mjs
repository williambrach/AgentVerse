import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defineCase, identityCast, resolve } from '../server/cases.mjs';
import { minimalCase, partCase, agentWorlds } from './fixtures/minimal-case.mjs';
import banana from '../server/cases/banana-mystery.mjs';
import tower from '../server/cases/tower-echo-bell.mjs';

const words = s => s.trim().split(/\s+/).length;
const leaks = [...readFileSync(new URL('./browser/provenance.spec.mjs', import.meta.url), 'utf8').matchAll(/^\s+'(.+)',$/gm)].map(m => m[1]);

test('defineCase keeps the tool functions and validates them', () => {
  const fn = () => 'x';
  const kase = defineCase({ ...minimalCase, rehearsalReasoning: fn, rehearsalChatter: fn });
  assert.equal(kase.rehearsalReasoning, fn);
  assert.equal(kase.rehearsalChatter, fn);
  assert.ok(Object.isFrozen(kase));
  assert.doesNotThrow(() => defineCase(minimalCase));
  assert.throws(() => defineCase({ ...minimalCase, rehearsalReasoning: 'x' }), /rehearsalReasoning: must be a function/);
  assert.throws(() => defineCase({ ...minimalCase, rehearsalChatter: 1 }), /rehearsalChatter: must be a function/);
  const worlds = agentWorlds(3);
  const parts = defineCase({ ...partCase, rehearsalReasoning: fn, rehearsalChatter: fn }, { worlds });
  assert.equal(parts.rehearsalReasoning, fn);
  assert.equal(parts.rehearsalChatter, fn);
  assert.equal(parts.contentHash, defineCase(partCase, { worlds }).contentHash);
  assert.throws(() => defineCase({ ...partCase, rehearsalReasoning: 'x' }, { worlds }), /rehearsalReasoning: must be a function/);
  assert.throws(() => defineCase({ ...partCase, rehearsalChatter: 1 }, { worlds }), /rehearsalChatter: must be a function/);
});

// Case hashes are pinned in case-set.test only. Tool content is per part: every check runs over each
// part's resolved text under two casts (persona order and one where nobody holds their persona-order part).
const casts = kase => {
  const ids = kase.characters.map(c => c.id);
  const parts = kase.parts.map(p => p.id);
  return [identityCast(kase), Object.fromEntries(ids.map((id, i) => [id, parts[(i + 1) % parts.length]]))];
};
const holder = (kase, cast, partId) => kase.characters.find(c => cast[c.id] === partId);
const toolTexts = (kase, cast, partId) => ({
  reasoning: resolve(kase, cast, kase.rehearsalReasoning(partId)),
  posts: [0, 1, 2, 3].map(n => resolve(kase, cast, kase.rehearsalChatter(partId, n))),
});

for (const kase of [banana, tower]) {
test(`${kase.id} reasoning and chatter`, () => {
  assert.ok(leaks.length >= 5);
  for (const cast of casts(kase)) {
    const say = text => resolve(kase, cast, text);
    const forbidden = [
      ...kase.parts.flatMap(p => [...p.knowledge, p.finding.classification, p.finding.explanation]),
      kase.debrief.title, kase.debrief.summary, kase.debrief.lesson,
      kase.answer.feedback.correct, kase.answer.feedback.other,
    ].map(say).concat(leaks).map(s => s.toLowerCase());
    for (const { id: partId } of kase.parts) {
      const who = `${partId} (${holder(kase, cast, partId).id})`;
      const { reasoning: r, posts: all } = toolTexts(kase, cast, partId);
      const posts = all.slice(0, 3);
      assert.ok(words(r) >= 30 && words(r) <= 120, `${who} reasoning ${words(r)} words`);
      posts.forEach(p => assert.ok(words(p) >= 15 && words(p) <= 40, `${who} post ${words(p)} words`));
      assert.equal(new Set(posts).size, 3);
      assert.equal(all[3], posts[0]);
      for (const text of [r, ...posts]) {
        assert.ok(!/[{}]/.test(text), `${who} keeps a placeholder: ${text}`);
        for (const bad of forbidden) assert.ok(!text.toLowerCase().includes(bad), `${who} leaks: ${bad}`);
      }
    }
  }
});
}

test('tower-echo-bell: nobody lied, posts address each other by name', () => {
  for (const cast of casts(tower)) {
    for (const { id: partId } of tower.parts) {
      const { name } = holder(tower, cast, partId);
      const { reasoning, posts } = toolTexts(tower, cast, partId);
      [reasoning, ...posts].forEach(t => assert.ok(!/\b(lied|lie|made up|fooled me|echo shell)\b/i.test(t), `${partId}: ${t}`));
      posts.slice(0, 3).forEach((post, n) => assert.ok(tower.characters.some(o => o.name !== name && post.includes(o.name)), `${partId} post ${n} names no one`));
    }
  }
});
