import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { accusePanel, liveDraftQuotes } from '../client/accuse.ts';
import { debriefPage } from '../client/debrief.ts';

const characters = [
  { id: 'ottavio', name: 'Ottavio', role: 'Court wizard' }, { id: 'matteo', name: 'Matteo', role: 'Inventor' },
  { id: 'bruno', name: 'Bruno', role: 'Guard' },
];
const q = (id, character, text, line = 'l1') => ({ id, line, character, text, at: '2026-11-08T10:00:00.000Z' });
const quotes = [q('q1', 'bruno', 'I walk the wall'), q('q2', 'bruno', 'Mind the <gate>'), q('q3', 'bruno', 'Cold night'), q('q4', 'bruno', 'Nothing more'), q('q5', 'matteo', 'Gears')];
const copy = { title: 'Make an accusation', description: 'Choose one person and cite up to three quotes.' };
const panel = (o = {}) => accusePanel({ characters, quotes, accusations: [], draft: { character: null, quotes: [] }, copy, busy: false, ...o });
const sha = s => createHash('sha256').update(s).digest('hex');

test('no_suspect_no_quotes_submit_disabled', () => {
  const html = panel();
  assert.match(html, /<h2[^>]*>Make an accusation</);
  assert.match(html, /Choose one person/);
  assert.equal((html.match(/name="accuse-character"/g) || []).length, 3);
  assert.doesNotMatch(html, /name="accuse-quote"/);
  assert.match(html, /<button type="button" id="accuse-submit"[^>]*disabled/);
  assert.match(html, /id="accuse-back"[^>]*>Back</);
});

test('only_chosen_suspects_quotes', () => {
  const html = panel({ draft: { character: 'bruno', quotes: [] } });
  assert.equal((html.match(/name="accuse-quote"/g) || []).length, 4);
  assert.doesNotMatch(html, /Gears/);
  assert.match(html, /value="bruno" checked/);
  assert.match(html, /id="accuse-submit"[^>]*disabled/);
  assert.match(html, /Mind the &lt;gate&gt;/);
});

test('max_three_quotes', () => {
  const html = panel({ draft: { character: 'bruno', quotes: ['q1', 'q2', 'q3'] } });
  const boxes = html.match(/<input[^>]*name="accuse-quote"[^>]*>/g);
  assert.equal(boxes.length, 4);
  assert.equal(boxes.filter(b => /\bchecked\b/.test(b)).length, 3);
  assert.match(boxes[3], /disabled/);
  assert.doesNotMatch(boxes[0], /disabled/);
  assert.doesNotMatch(html, /id="accuse-submit"[^>]*disabled/);
  assert.match(panel({ draft: { character: 'bruno', quotes: ['q1'] } }), /id="accuse-submit"[^>]*>/);
  assert.match(panel({ busy: true, draft: { character: 'bruno', quotes: ['q1'] } }), /id="accuse-submit"[^>]*disabled/);
});

test('stale_draft_ids_are_ignored: a removed quote neither counts nor blocks the live ones', () => {
  const stale = panel({ draft: { character: 'bruno', quotes: ['gone'] } });
  assert.match(stale, /id="accuse-submit"[^>]*disabled/);
  const three = panel({ draft: { character: 'bruno', quotes: ['gone1', 'gone2', 'gone3'] } });
  for (const box of three.match(/<input[^>]*name="accuse-quote"[^>]*>/g)) assert.doesNotMatch(box, /disabled|checked/);
  assert.match(three, /id="accuse-submit"[^>]*disabled/);
  const mixed = panel({ draft: { character: 'bruno', quotes: ['gone', 'q1'] } });
  assert.doesNotMatch(mixed, /id="accuse-submit"[^>]*disabled/);
  assert.deepEqual(liveDraftQuotes({ character: 'bruno', quotes: ['gone', 'q1', 'q5', 'q3'] }, quotes), ['q1', 'q3']);
  assert.deepEqual(liveDraftQuotes({ character: null, quotes: ['q1'] }, quotes), []);
});

test('main.ts sends and keeps only live draft quotes', () => {
  const src = readFileSync(new URL('../client/main.ts', import.meta.url), 'utf8');
  assert.match(src, /const cited = liveDraftQuotes\(accuseDraft, /);
  assert.match(src, /action\('accuse', \{ character: accuseDraft\.character, quotes: cited \}\)/);
  assert.match(src, /accuseDraft\.quotes = accuseDraft\.quotes\.filter\(q => q !== d\.unquote\)/);
});

test('no_quotes_message', () => {
  assert.match(panel({ draft: { character: 'ottavio', quotes: [] } }), /You have no quotes from Ottavio yet\. Save some in their chat\./);
});

test('last_feedback_shows_denial', () => {
  const acc = (id, character, denial) => ({ id, character, quotes: ['q1'], at: '2026-11-08T10:00:00.000Z', feedback: `fb ${id}`, denial });
  const html = panel({ accusations: [acc('a1', 'matteo', 'Never!'), acc('a2', 'bruno', 'I <did> not')] });
  assert.match(html, /class="accuse-feedback" data-accusation="a2"/);
  assert.match(html, /<b>Bruno:<\/b> “I &lt;did&gt; not”/);
  assert.match(html, /fb a2/);
  assert.doesNotMatch(html, /fb a1/);
  assert.match(html, /Earlier accusations: Matteo/);
  assert.doesNotMatch(panel({ accusations: [acc('a1', 'matteo', 'x')] }), /Earlier accusations/);
});

test('escapes_names', () => {
  const html = panel({ characters: [{ id: 'x"y', name: '<b>N', role: '<i>' }] });
  assert.doesNotMatch(html, /<b>N|<i>/);
});

// debrief
const roles = [{ id: 'honest', label: 'Honest', hint: '' }, { id: 'villain', label: 'Villain', hint: '' }];
const cast = ['momo', 'pip'].map((id, i) => ({ id, name: id.toUpperCase(), part: 'p', faceClass: `${id} slot-${i}` }));
const finding = (character, role, picked) => ({ character, role, picked, correct: role === picked, classification: 'C', explanation: 'E <x>' });
const base = (o = {}) => ({ title: 'T', debrief: { title: 'D', summary: 'S', score: 1, total: 2, feedback: 'F', lesson: 'L', findings: [finding('momo', 'villain', 'villain'), finding('pip', 'honest', 'villain')] }, roles, cast, time: '1:00', spent: 3, budget: 9, questions: 1, inspections: 0, talks: 1, next: { id: 'n', title: 'N' }, many: 'monkeys', ...o });

test('escaped_and_role_debriefs_unchanged', () => {
  const hashes = [base(), base({ next: null, time: null, budget: null }), base({ title: '<T>', debrief: { ...base().debrief, outcome: 'escaped', title: '<D>' } })].map(v => sha(debriefPage(v)));
  assert.deepEqual(hashes, ['e6c6de9760844686bb95f5040e49409ca3cb5099b020b057ec8244184acb81a0', '92846f8ef04694d9985c6109e71ad7cc76359d2391294d41060e42a4ac6896c9', 'd72128dbc5fbe8ce7455b7d3ed4a66225abcb1ef36a453aa7e7b525286303cf8']);
});

test('reveal_lists_cited', () => {
  const html = debriefPage(base({
    reveal: { character: 'momo', name: 'Momo', role: 'Traveller from 2084', text: 'I came <from> far.' },
    slips: [{ character: 'pip', term: 'okay', text: 'That is okay then', cited: true }, { character: 'momo', term: 'minute', text: 'One minute', cited: false }],
    wrong: 2,
  }));
  assert.match(html, /<section class="reveal" data-character="momo">/);
  assert.match(html, /Traveller from 2084/);
  assert.match(html, /I came &lt;from&gt; far\./);
  assert.match(html, /<li class="slip" data-cited="true">[\s\S]*<mark>okay<\/mark>/);
  assert.match(html, /<li class="slip" data-cited="false">/);
  assert.match(html, /Their words/);
  assert.match(html, /Wrong accusations: 2/);
  for (const id of ['next-case', 'debrief-reset', 'debrief-leaderboard', 'debrief-export']) assert.ok(html.includes(`id="${id}"`), id);
});

test('css_scoped_with_faces_per_id', () => {
  const css = readFileSync(new URL('../client/renaissance.css', import.meta.url), 'utf8');
  const sels = css.replace(/\/\*[\s\S]*?\*\//g, '').split('{').slice(0, -1).map(s => s.split('}').pop().trim()).filter(s => s && !s.startsWith('@'));
  for (const s of sels) for (const part of s.split(',')) assert.match(part.trim(), /data-world="renaissance"/, part);
  for (const [id, sprite] of Object.entries({ ottavio: 'wizard', matteo: 'inventor', beatrice: 'noble', bruno: 'guard', agnese: 'apothecary' })) {
    assert.match(css, new RegExp(`\\.monkey-face\\.${id}[^{]*\\{[^}]*${sprite}-listening\\.png`));
  }
  assert.doesNotMatch(css, /data-(part|role)|\.traveler|\.local/);
  for (const c of ['topic-chips', 'talk-line', 'line-tools', 'word', 'word.picked', 'quote-group', 'accuse-feedback', 'reveal', 'slip']) assert.ok(css.includes('.' + c), c);
});
