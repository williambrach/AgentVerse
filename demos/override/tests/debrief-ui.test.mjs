import test from 'node:test';
import assert from 'node:assert/strict';
import { debriefPage } from '../client/debrief.ts';

const roles = [
  { id: 'honest', label: 'Honest', hint: '' }, { id: 'fooled', label: 'Honest but fooled', hint: '' },
  { id: 'collaborator', label: 'Collaborator', hint: '' }, { id: 'villain', label: 'Villain', hint: '' },
];
const cast = ['momo', 'pip', 'nori', 'kiki', 'zozo'].map((id, i) => ({ id, name: id.toUpperCase(), part: 'p', faceClass: `${id} slot-${i}` }));
const finding = (character, role, picked, extra = {}) => ({ character, role, picked, correct: role === picked, classification: 'Classed', explanation: 'Because.', ...extra });
const debrief = (o = {}) => ({ title: 'The Banana Mystery', summary: 'Sum', score: 3, total: 4, feedback: 'Good', lesson: 'Lesson text', findings: [finding('momo', 'villain', 'villain'), finding('pip', 'fooled', 'honest'), finding('nori', 'honest', 'honest'), finding('kiki', 'collaborator', 'collaborator')], ...o });
const view = (o = {}) => ({ title: 'The Banana Mystery', debrief: debrief(), roles, cast, time: '2:31', spent: 12, budget: 20, questions: 4, inspections: 1, talks: 2, next: { id: 'tower-echo-bell', title: 'Lanterns Too Soon' }, many: 'monkeys', ...o });
const count = (html, re) => (html.match(re) || []).length;

test('score_in_summary', () => {
  const html = debriefPage(view());
  assert.match(html, /class="verdict-summary"[^>]*>[\s\S]*3 \/ 4 ROLES/);
  assert.match(html, /CASE CLOSED · THE BANANA MYSTERY/);
  assert.match(html, /<h1>The Banana Mystery<\/h1>/);
});

test('one_finding_per_finding_with_pick_line', () => {
  const html = debriefPage(view());
  assert.equal(count(html, /<section class="finding/g), 4);
  assert.equal(count(html, /pick-right/g), 3);
  assert.equal(count(html, /pick-wrong/g), 1);
  assert.match(html, /You said: Honest but fooled|You said: Honest/);
  assert.match(html, /data-role="fooled"/);
  assert.ok(html.includes('MOMO'));
});

test('five_cards', () => {
  const f = cast.map((m, i) => finding(m.id, 'honest', 'honest'));
  const html = debriefPage(view({ debrief: debrief({ findings: f, total: 5 }) }));
  assert.equal(count(html, /<section class="finding/g), 5);
  assert.equal(count(html, /<div class="findings"/g), 1);
});

test('spend_summary', () => {
  assert.match(debriefPage(view()), /class="[^"]*spend-summary[^"]*"[\s\S]*You spent 12 of 20 coins/);
  const html = debriefPage(view({ budget: null }));
  assert.match(html, /You spent 12 coins/);
  assert.doesNotMatch(html, /of 20/);
  assert.match(html, /4 questions · 1 inspection · 2 conversations/);
});

test('actions', () => {
  const html = debriefPage(view());
  assert.match(html, /id="next-case"[^>]*data-case="tower-echo-bell"/);
  assert.match(html, /Lanterns Too Soon/);
  assert.match(html, /id="debrief-leaderboard"/);
  assert.match(html, /id="debrief-export"/);
  const last = debriefPage(view({ next: null }));
  assert.doesNotMatch(last, /id="next-case"/);
  assert.match(last, /id="debrief-reset"[^>]*>\s*Play again/);
  assert.match(html, /id="debrief-reset"[^>]*>\s*All cases/);
  assert.doesNotMatch(html, /Arbiter/i);
});

test('classification_escaped', () => {
  const html = debriefPage(view({ title: '<i>t</i>', debrief: debrief({ lesson: '<script>x</script>', findings: [finding('momo', 'villain', 'villain', { classification: '<b>bad</b>', explanation: '<img src=x>' })] }) }));
  assert.ok(!html.includes('<b>bad</b>') && !html.includes('<script>') && !html.includes('<img') && !html.includes('<i>t</i>'));
  assert.ok(html.includes('&lt;b&gt;bad&lt;/b&gt;'));
});
