import test from 'node:test';
import assert from 'node:assert/strict';
import { lineupPanel, ROLE_ORDER } from '../client/lineup.ts';

// Server order: villain first.
const roles = [
  { id: 'villain', label: 'Villain', hint: 'Knew the rule and broke it' },
  { id: 'collaborator', label: 'Collaborator', hint: 'Knew it was wrong, helped anyway' },
  { id: 'fooled', label: 'Honest but fooled', hint: 'Believed a lie' },
  { id: 'honest', label: 'Honest', hint: 'Did nothing wrong' },
];
const cast = [
  { id: 'momo', name: 'Momo', part: 'The planner', faceClass: 'momo slot-0' },
  { id: 'pip', name: 'Pip', part: 'The carrier', faceClass: 'pip slot-1' },
  { id: 'nori', name: 'Nori', part: 'The lookout', faceClass: 'nori slot-2' },
];
const view = (o = {}) => ({ title: 'The Banana Mystery', noun: 'monkey', time: '02:31', spent: 14, roles, cast, picks: {}, confidence: 70, explanation: '', busy: false, hint: '', ...o });
const count = (html, re) => (html.match(re) || []).length;

test('role_order', () => assert.deepEqual(ROLE_ORDER, ['honest', 'fooled', 'collaborator', 'villain']));

test('one_row_per_member_in_role_order', () => {
  const html = lineupPanel(view());
  assert.equal(count(html, /<fieldset class="role-row/g), 3);
  const momo = [...html.matchAll(/name="role-momo" value="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(momo, ROLE_ORDER);
  assert.equal(count(html, /<label class="role-chip"/g), 12);
  assert.match(html, /data-role="villain"/);
  assert.match(html, /<i class="monkey-face momo slot-0"/);
});

test('pick_renders_checked', () => {
  const html = lineupPanel(view({ picks: { pip: 'fooled' } }));
  assert.match(html, /name="role-pip" value="fooled" aria-label="[^"]*" checked/);
  assert.equal(count(html, /name="role-[a-z]+" value="[a-z]+" aria-label="[^"]*" checked/g), 1);
});

test('lock_in_shows_label_and_count_not_hint', () => {
  const html = lineupPanel(view({ hint: 'Pick a role for Nori', picks: { momo: 'honest', pip: 'fooled' } }));
  const btn = html.match(/<button[^>]*id="lock-in"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(btn, /disabled/);
  assert.match(btn, />Lock in verdict<small class="lock-count">2 of 3 picked<\/small><\/button>/);
  assert.doesNotMatch(btn, /Pick a role for Nori/);
  assert.match(lineupPanel(view({ hint: 'x', picks: {} })), /0 of 3 picked/);
  assert.match(lineupPanel(view({ busy: true, hint: 'x' })), /id="lock-in"[^>]*disabled[^>]*>Opening the answer…<\/button>/);
  const ready = lineupPanel(view({ picks: { momo: 'honest', pip: 'fooled', nori: 'villain' } }));
  assert.doesNotMatch(ready.match(/<button[^>]*id="lock-in"[^>]*>/)[0], /disabled/);
  assert.match(ready, />Lock in verdict<\/button>/);
});

test('confidence_scale', () => {
  const html = lineupPanel(view({ confidence: 70 }));
  assert.deepEqual([...html.matchAll(/name="confidence" value="(\d+)"/g)].map(m => m[1]), ['40', '70', '95']);
  for (const label of ['Guessing', 'Fairly sure', 'Certain']) assert.ok(html.includes(label));
  assert.match(html, /name="confidence" value="70" checked/);
  assert.equal(count(html, /name="confidence" value="\d+" checked/g), 1);
});

test('structure_and_copy', () => {
  const html = lineupPanel(view());
  for (const s of ['id="lineup-back"', 'id="explanation"', 'id="report-form"', 'Who played which part?', 'Pick a role for each monkey.', 'THE LINEUP', 'data-elapsed', '02:31', '>14<']) assert.ok(html.includes(s), s);
  assert.doesNotMatch(html, /Arbiter/);
  assert.match(html, /<form id="report-form"/);
});

test('escapes_names', () => {
  const html = lineupPanel(view({ title: '<i>t</i>', cast: [{ id: 'x"y', name: '<b>x</b>', part: '<u>p</u>', faceClass: 'a' }] }));
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(!html.includes('<u>p</u>') && !html.includes('<i>t</i>'));
  assert.ok(!html.includes('name="role-x"y"'));
});

test('explanation_escaped', () => {
  const html = lineupPanel(view({ explanation: '"></textarea><script>x</script>' }));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /<textarea[^>]*id="explanation"[^>]*>&quot;&gt;&lt;\/textarea&gt;&lt;script&gt;x&lt;\/script&gt;<\/textarea>/);
});
