import test from 'node:test';
import assert from 'node:assert/strict';
import { minimalCase, partCase, towerPartCase, fiveCase } from './fixtures/minimal-case.mjs';
test('minimal case fixture has the agreed shape', () => {
  assert.equal(minimalCase.id, 'mini-case');
  assert.deepEqual(minimalCase.characters.map(c => c.id), ['momo', 'pip', 'nori']);
  assert.equal('records' in minimalCase, false);
  assert.equal('chapters' in minimalCase, false);
  assert.deepEqual(Object.keys(minimalCase.copy), ['headline', 'intro', 'briefing', 'report']);
  assert.equal(typeof minimalCase.rehearsal, 'function');
});
test('part fixtures have the agreed shape', () => {
  assert.deepEqual(partCase.characters.map(c => c.id), ['momo', 'pip', 'nori']);
  assert.deepEqual(partCase.parts.map(p => [p.id, p.role]), [['boss', 'villain'], ['helper', 'fooled'], ['bystander', 'honest']]);
  assert.ok(partCase.parts.every(p => p.knowledge.join().includes('SECRET') && p.finding.explanation.includes('SECRET')));
  assert.equal('answer' in partCase && 'culprits' in partCase.answer, false);
  assert.deepEqual(towerPartCase().characters.map(c => c.id), ['wren', 'basil', 'juniper']);
  assert.equal(towerPartCase().world, 'tower');
  assert.equal(fiveCase().characters.length, 5);
  assert.equal(fiveCase().parts.length, 5);
  assert.equal(typeof fiveCase().rehearsal, 'function');
});
