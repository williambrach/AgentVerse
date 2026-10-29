import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as round from '../server/admin/round.js';

class El {
  constructor(tag, doc) { this.tagName = tag; this.ownerDocument = doc; this.children = []; this.style = {}; this.className = ''; this._text = ''; this.listeners = {}; this.value = ''; this.hidden = false; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, f) { this.listeners[t] = f; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
}
const makeDoc = () => { const d = {}; d.createElement = (t) => new El(t, d); return d; };
const find = (el, pred, out = []) => { if (pred(el)) out.push(el); el.children.forEach((c) => find(c, pred, out)); return out; };
const byClass = (el, cls) => find(el, (e) => e.className.split(' ').includes(cls));

const catalog = [
  { id: 'banana-mystery', title: 'The Banana Mystery', answer: ['momo'], characters: [{ id: 'momo', name: 'Momo' }, { id: 'pip', name: 'Pip' }, { id: 'nori', name: 'Nori' }] },
  { id: 'tower-echo-bell', title: 'Lanterns Too Soon', answer: [], characters: [{ id: 'wren', name: 'Wren' }, { id: 'basil', name: 'Basil' }, { id: 'juniper', name: 'Juniper' }] },
];

test('funnelRows example', () => {
  const snap = { funnel: { 'banana-mystery': { started: 40, asked: 36, interviewed: 30, verdict: 20, debrief: 18 } } };
  const rows = round.funnelRows(snap, catalog);
  assert.deepEqual(rows[0], { caseId: 'banana-mystery', title: 'The Banana Mystery', steps: [
    { label: 'Started', n: 40, pct: 100 }, { label: 'First question', n: 36, pct: 90 }, { label: 'Interviewed all', n: 30, pct: 75 },
    { label: 'Verdict', n: 20, pct: 50 }, { label: 'Debrief', n: 18, pct: 45 }] });
  assert.equal(rows.length, 2);
  assert.ok(rows[1].steps.every((s) => s.n === 0 && s.pct === 0));
});

test('funnel started 0 gives pct 0 everywhere, never NaN', () => {
  const rows = round.funnelRows({ funnel: { 'banana-mystery': { started: 0, asked: 3, interviewed: 0, verdict: 0, debrief: 0 } } }, catalog);
  assert.ok(rows[0].steps.every((s) => s.pct === 0));
});

test('tallyRows example (answer [] = Nobody correct)', () => {
  const snap = { tallies: { 'tower-echo-bell': { verdicts: 10, correct: 0.4, accused: { none: 4, wren: 6 }, medianMsToVerdict: 754000, medianQuestions: 7 } } };
  const r = round.tallyRows(snap, catalog)[1];
  assert.deepEqual(r, { caseId: 'tower-echo-bell', title: 'Lanterns Too Soon', verdicts: 10, correctPct: 40,
    accused: [{ who: 'Wren', n: 6, pct: 60, correct: false }, { who: 'Nobody', n: 4, pct: 40, correct: true }], medianMin: '12:34', medianQuestions: 7, medianCoins: null });
});

test('tallyRows zero verdicts and uncertain', () => {
  const r0 = round.tallyRows({ tallies: {} }, catalog)[0];
  assert.equal(r0.correctPct, null);
  assert.equal(r0.medianMin, '–');
  const r = round.tallyRows({ tallies: { 'banana-mystery': { verdicts: 3, correct: 1 / 3, accused: { uncertain: 1, momo: 1, pip: 1 }, medianMsToVerdict: 61000, medianQuestions: 4 } } }, catalog)[0];
  assert.equal(r.accused.find((a) => a.n === 1 && a.who === 'Not sure').correct, false);
  assert.equal(r.accused.find((a) => a.who === 'Momo').correct, true);
  assert.equal(r.accused.find((a) => a.who === 'Pip').correct, false);
  assert.equal(r.correctPct, 33);
  assert.equal(r.medianMin, '1:01');
});

test('renderFunnel sizes bars via CSSOM and writes text only', () => {
  const doc = makeDoc(); const root = new El('div', doc);
  round.renderFunnel(root, { funnel: { 'banana-mystery': { started: 40, asked: 36, interviewed: 30, verdict: 20, debrief: 18 } } }, catalog);
  const widths = byClass(root, 'bar-fill').map((e) => e.style.width);
  assert.deepEqual(widths.slice(0, 5), ['100%', '90%', '75%', '50%', '45%']);
  assert.ok(root.textContent.includes('The Banana Mystery'));
  round.renderFunnel(root, { funnel: {} }, catalog); // re-render does not accumulate
  assert.equal(byClass(root, 'case-box').length, 2);
});

test('renderTallies escapes nothing because it is text: markup stays literal', () => {
  const doc = makeDoc(); const root = new El('div', doc);
  const cat = [{ id: 'c', title: '<b>x</b>', answer: [], characters: [{ id: 'a', name: '<img src=x>' }] }];
  round.renderTallies(root, { tallies: { c: { verdicts: 1, correct: 0, accused: { a: 1 }, medianMsToVerdict: 1000, medianQuestions: 1 } } }, cat);
  assert.ok(root.textContent.includes('<img src=x>'));
  assert.ok(byClass(root, 'case-title')[0].textContent === '<b>x</b>');
  round.renderTallies(root, { tallies: {} }, catalog);
  assert.ok(root.textContent.includes('No verdicts yet'));
});

test('round control label, form, success and failure', async () => {
  const doc = makeDoc(); const root = new El('div', doc);
  const calls = [];
  let fail = false;
  const ctl = round.createRoundControl(root, { api: async (p, b) => { calls.push([p, b]); if (fail) throw new Error('boom'); return {}; } });
  const label = () => byClass(root, 'round-label')[0].textContent;
  ctl.update({ at: 0, round: { label: null, startedAt: 0 } });
  assert.equal(label(), 'No round started');
  const t0 = new Date(2026, 9, 29, 14, 5).getTime();
  ctl.update({ at: t0 + 12 * 60000 + 5000, round: { label: 'Round 2', startedAt: t0 } });
  assert.equal(label(), 'Round 2 · since 14:05 (12 min)');

  const form = byClass(root, 'round-form')[0];
  assert.equal(form.hidden, true);
  byClass(root, 'round-open')[0].listeners.click();
  assert.equal(form.hidden, false);
  const name = byClass(root, 'round-name')[0]; const reason = byClass(root, 'round-reason')[0]; const go = byClass(root, 'round-go')[0]; const err = byClass(root, 'round-error')[0];
  await go.listeners.click();
  assert.equal(calls.length, 0);
  assert.equal(err.textContent, 'A label is required');
  name.value = '  Round 3 '; reason.value = 'new group';
  fail = true;
  await go.listeners.click();
  assert.deepEqual(calls[0], ['/admin/round', { label: 'Round 3', reason: 'new group' }]);
  assert.equal(err.textContent, 'boom');
  assert.equal(form.hidden, false);
  fail = false;
  await go.listeners.click();
  assert.equal(form.hidden, true);
});

test('module never uses innerHTML', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../server/admin/round.js', import.meta.url), 'utf8');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|setAttribute\('style'/.test(src));
});

test('tallyRows carries medianCoins', () => {
  const snap = { tallies: { 'banana-mystery': { verdicts: 2, correct: 1, accused: {}, medianMsToVerdict: 1000, medianQuestions: 1, medianCoins: 4 } } };
  assert.equal(round.tallyRows(snap, catalog)[0].medianCoins, 4);
});
