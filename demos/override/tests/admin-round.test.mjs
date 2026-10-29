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
  { id: 'banana-mystery', title: 'The Banana Mystery', characters: [{ id: 'momo', name: 'Momo' }, { id: 'pip', name: 'Pip' }, { id: 'nori', name: 'Nori' }] },
  { id: 'tower-echo-bell', title: 'Lanterns Too Soon', characters: [{ id: 'wren', name: 'Wren' }, { id: 'basil', name: 'Basil' }, { id: 'juniper', name: 'Juniper' }] },
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

const tower = { verdicts: 2, perfect: 1, rolesRight: 7, rolesTotal: 8,
  byRole: { villain: { right: 2, total: 2 }, collaborator: { right: 0, total: 0 }, fooled: { right: 1, total: 2 }, honest: { right: 4, total: 4 } },
  medianMsToVerdict: 754000, medianQuestions: 7 };

test('tallyRows example (roles right, perfect, only roles with total > 0)', () => {
  const r = round.tallyRows({ tallies: { 'tower-echo-bell': tower } }, catalog)[1];
  assert.deepEqual(r, { caseId: 'tower-echo-bell', title: 'Lanterns Too Soon', verdicts: 2, perfect: 1, rolesPct: 88,
    roles: [{ id: 'villain', label: 'Villain', right: 2, total: 2, pct: 100 }, { id: 'fooled', label: 'Honest but fooled', right: 1, total: 2, pct: 50 },
      { id: 'honest', label: 'Honest', right: 4, total: 4, pct: 100 }], medianMin: '12:34', medianQuestions: 7, medianCoins: null });
});

test('tallyRows zero verdicts, zero roles: null and never NaN', () => {
  const r0 = round.tallyRows({ tallies: {} }, catalog)[0];
  assert.equal(r0.rolesPct, null);
  assert.equal(r0.medianMin, '–');
  assert.deepEqual(r0.roles, []);
  const r = round.tallyRows({ tallies: { 'banana-mystery': { verdicts: 3, perfect: 0, rolesRight: 1, rolesTotal: 3, byRole: {}, medianMsToVerdict: 61000, medianQuestions: 4 } } }, catalog)[0];
  assert.equal(r.rolesPct, 33);
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

test('renderTallies heading, one bar per role, markup stays literal', () => {
  const doc = makeDoc(); const root = new El('div', doc);
  round.renderTallies(root, { tallies: { 'tower-echo-bell': tower } }, catalog);
  assert.equal(byClass(root, 'tally-head')[0].textContent, '2 verdicts · 88 % roles right · 1 perfect');
  assert.equal(byClass(root, 'bar-fill').length, 3);
  assert.deepEqual(byClass(root, 'bar-fill').map((e) => e.style.width), ['100%', '50%', '100%']);
  assert.deepEqual(byClass(root, 'step-n').map((e) => e.textContent), ['2/2 · 100 %', '1/2 · 50 %', '4/4 · 100 %']);
  assert.ok(root.textContent.includes('Honest but fooled'));
  const cat = [{ id: 'c', title: '<b>x</b>', characters: [] }];
  round.renderTallies(root, { tallies: { c: { verdicts: 1, perfect: 0, rolesRight: 0, rolesTotal: 1, byRole: { honest: { right: 0, total: 1 } }, medianMsToVerdict: 1000, medianQuestions: 1 } } }, cat);
  assert.ok(byClass(root, 'case-title')[0].textContent === '<b>x</b>');
  assert.equal(byClass(root, 'tally-head')[0].textContent, '1 verdicts · 0 % roles right · 0 perfect');
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

test('seam: real tallies() output and toRow verdict feed the admin readers', async () => {
  const { createRoundStats } = await import('../server/monitor-round.mjs');
  const { toRow } = await import('../server/monitor.mjs');
  const log = await import('../server/admin/log.js');
  const cs = [{ id: 'banana-mystery', characters: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id })) }];
  const truth = { a: 'villain', b: 'collaborator', c: 'fooled', d: 'honest' };
  const results = { a: true, b: false, c: true, d: true };
  const v = { roles: { ...truth, b: 'honest' }, truth, results, score: 3, total: 4, confidence: 70, explanation: '', evidenceIds: [] };
  const e = { sessionId: 's', caseId: 'banana-mystery', type: 'verdict_submitted', timestamp: 1, elapsedMs: 5000, character: null, verdict: v, coins: { spent: 6, budget: 12 } };
  const stats = createRoundStats(cs);
  stats.observe({ ...e, type: 'session_started' });
  stats.observe(e);
  const r = round.tallyRows({ tallies: stats.tallies() }, [{ id: 'banana-mystery', title: 'B', characters: [] }])[0];
  assert.equal(r.verdicts, 1);
  assert.equal(r.rolesPct, 75);
  assert.equal(r.medianCoins, 6);
  assert.deepEqual(r.roles.map((x) => [x.label, x.right, x.total, x.pct]), [['Villain', 1, 1, 100], ['Collaborator', 0, 1, 0], ['Honest but fooled', 1, 1, 100], ['Honest', 1, 1, 100]]);
  const row = toRow(e, { cases: cs });
  assert.equal(log.describe(row, []).text, '3/4 roles · 70 %');
});

test('tallyRows carries medianCoins and the round view shows it', () => {
  const snap = { tallies: { 'banana-mystery': { verdicts: 2, perfect: 1, rolesRight: 7, rolesTotal: 8, byRole: {}, medianMsToVerdict: 1000, medianQuestions: 1, medianCoins: 4 } } };
  assert.equal(round.tallyRows(snap, catalog)[0].medianCoins, 4);
  const doc = makeDoc(); const root = new El('div', doc);
  round.renderTallies(root, snap, catalog);
  assert.equal(byClass(root, 'tally-sub')[0].textContent, 'median 0:01 min · 1 questions · median 4 coins');
});
