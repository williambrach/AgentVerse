import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as real from '../client/dialogue.ts';

const css = readFileSync(new URL('../client/dialogue.css', import.meta.url), 'utf8');
const rule = sel => { const i = css.indexOf(sel + ' {'); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('}', i)); };

// Pure functions of their view: no producer to fake, so SUPERLITE_REAL needs no switch.
const { interviewPanel, briefingPanel } = real;

const character = { id: 'pip', name: 'Pip', role: 'The carrier', room: '2', color: '#fff', introduction: 'Hello, I am Pip.', quickQuestion: 'Why the bananas?' };
const turn = (o = {}) => ({ question: 'Why?', answer: 'Because.', timestamp: '2026-01-01T00:00:01Z', ...o });
const view = (o = {}) => ({ character, turns: [], inspections: [], faceClass: 'pip slot-1', closed: false, busy: false, draft: '', waitingOn: null, next: { id: 'nori', name: 'Nori' }, askLabel: '2', askOff: null, hint: 'Ask one question', many: 'monkeys', ...o });
const bv = (o = {}) => ({ copy: { briefing: { title: 'T', description: 'D', question: 'Q?', hint: 'H' } }, cast: 4, many: 'monkeys', one: 'monkey', firstId: 'momo', firstName: 'Momo', guide: '', ...o });

test('no turns', () => {
  const h = interviewPanel(view());
  assert.match(h, /data-quick-question="Why the bananas\?"/);
  assert.match(h, /id="transcript"[^>]*role="log"[^>]*aria-live="polite"/);
  assert.match(h, /class="speech character[^"]*"[^>]*data-motion-key="introduction"[\s\S]*Hello, I am Pip\./);
  assert.match(h, /placeholder="Or type your own question…"/);
  assert.doesNotMatch(h, /next-monkey/);
});

test('one turn', () => {
  const h = interviewPanel(view({ turns: [turn()] }));
  assert.doesNotMatch(h, /data-quick-question/);
  assert.match(h, /placeholder="Ask a follow-up…"/);
  assert.match(h, /class="speech investigator[^"]*" data-motion-key="question-0"/);
  assert.match(h, /class="speech character[^"]*" data-motion-key="answer-0"/);
  assert.match(h, /data-go="nori"/);
  assert.match(h, /Next: ask Nori/);
  const end = interviewPanel(view({ turns: [turn()], next: null }));
  assert.match(end, /data-go="report"/);
  assert.match(end, /Make your verdict/);
});

test('ask off, closed, waiting', () => {
  const off = interviewPanel(view({ askOff: 'Not enough coins' }));
  assert.match(off, /<button type="submit"[^>]*disabled/);
  assert.match(off, /<p class="ask-off" id="ask-off" role="status">Not enough coins<\/p>/);
  assert.match(off, /aria-describedby="tip-ask ask-off"/);
  assert.match(off, /class="tool-hint sr-only" id="tip-ask">Ask one question</);
  assert.doesNotMatch(interviewPanel(view({ closed: true })), /<form/);
  const wait = interviewPanel(view({ busy: true, waitingOn: 'pip', draft: 'Hmm?' }));
  assert.match(wait, /speech character waiting/);
  assert.match(wait, /Thinking/);
});

test('form controls', () => {
  const h = interviewPanel(view());
  assert.match(h, /<button type="submit"[^>]*>\s*(<span[^>]*>)?Ask/);
  assert.match(h, /<textarea id="question"[^>]*minlength="3"[^>]*maxlength="1200"/);
  assert.doesNotMatch(h, /class="tool-row"/);
});

test('answer_escaped', () => {
  const h = interviewPanel(view({ turns: [turn({ answer: '<script>alert(1)</script>', question: '<img onerror=x>' })], character: { ...character, name: '<b>P</b>' } }));
  assert.doesNotMatch(h, /<script|<img|<b>P/);
  assert.match(h, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('question_textarea', () => {
  const h = interviewPanel(view({ draft: '</textarea><script>x</script>' }));
  assert.equal(h.match(/<textarea/g).length, 1);
  assert.equal(h.match(/<\/textarea>/g).length, 1);
  assert.doesNotMatch(h, /<script/);
});

test('reasoning block sits in the transcript in time order', () => {
  const h = interviewPanel(view({ turns: [turn()], inspections: [{ character: 'pip', sourceEventId: 'e1', reasoning: '<i>r</i>', timestamp: '2026-01-01T00:00:02Z' }] }));
  assert.match(h, /speech reasoning[\s\S]*&lt;i&gt;r&lt;\/i&gt;/);
  assert.ok(h.indexOf('answer-0') < h.indexOf('reasoning-e1'));
});

test('speaker label is screen-reader only, question line has curly quotes', () => {
  const h = interviewPanel(view({ turns: [turn({ question: 'Why?' })] }));
  assert.match(h, /class="speech investigator[^"]*" data-motion-key="question-0"><p>You asked: “Why\?”<\/p>/);
  assert.doesNotMatch(h, /<span>YOU<\/span>/);
  assert.match(h, /<span>PIP<\/span><p>Because\./);
  assert.match(rule('.dialogue .speech > span'), /clip: rect\(0 0 0 0\)/);
  assert.doesNotMatch(css, /content: 'You asked/);
  assert.match(interviewPanel(view({ busy: true, waitingOn: 'pip', draft: 'Hmm?' })), /You asked: “Hmm\?”/);
});

test('ask button holds the coin icon and the bare price', () => {
  const h = interviewPanel(view({ askLabel: '2 coins · 3 left' }));
  const btn = h.match(/<button type="submit"[\s\S]*?<\/button>/)[0];
  assert.match(btn, /<span>Ask<\/span><span class="coin-price"><svg[\s\S]*<\/svg><span class="tool-chip" data-tool="ask">2<\/span><\/span>/);
  assert.doesNotMatch(h, /2 coins/);
  assert.doesNotMatch(h, /class="tool-row"/);
  assert.match(btn, /aria-describedby="tip-ask"/);
  assert.match(h, /id="tip-ask"/);
  assert.doesNotMatch(h, /class="ask-off"/);
});

test('briefing restyle: copy and parchment palette', () => {
  const h = briefingPanel(bv());
  assert.match(h, /sit in the left rail/);
  assert.match(h, /The cards on the left open a page straight away\./);
  assert.match(h, /Make your verdict/);
  assert.doesNotMatch(h, /under the map|Make your guess/);
  assert.match(rule('#app .notebook-content .primary-button'), /color: #FFF6DE; background: #18252D[\s\S]*box-shadow: 0 3px 0 #000/);
  assert.match(rule('#app .briefing-note'), /background: #FFFDF5; border: 2px dashed #D9C796/);
  for (const [sel, size] of [['#app .task-list .tool-guide small', 13], ['#app .tool-guide em', 13], ['#app .notebook-content .eyebrow, #app .notebook-page .panel-heading .eyebrow', 13]]) {
    assert.ok(Number(rule(sel).match(/(?:font:[^;]*?| font-size: )(\d+)px/)[1]) >= size, sel);
  }
});

test('non-interview panels: section tag, thread box, alignment', () => {
  assert.match(rule('#app #notebook-section'), /top: -20px[\s\S]*background: #18252D/);
  assert.match(css, /#app \.dossier:has\(\.dialogue\) #notebook-section \{ display: none; \}/);
  assert.match(rule('#app .dossier:has(.thread-panel)'), /max-height: 40dvh/);
  assert.match(rule('#app .thread-panel .panel-heading'), /clip: rect\(0 0 0 0\)/);
  assert.match(rule('#app .thread-panel .thread-author'), /font: 600 13px/);
  assert.match(rule('#app .thread-panel .fine'), /font-size: 13px/);
  assert.match(rule('#app .dialogue .interview-compose'), /padding: 12px 0 0 !important/);
  assert.match(rule('#app .dialogue .interview-transcript'), /padding: 0 4px 0 0 !important/);
  assert.match(rule('#app .dialogue .quick-question'), /margin: 0/);
});

test('briefing', () => {
  const h = briefingPanel(bv({ guide: '<p class="g">guide</p>' }));
  assert.match(h, /data-go="momo"/);
  assert.match(h, /Ask 4 monkeys/);
  assert.match(h, /class="briefing-note"/);
  assert.match(h, /class="task-list"/);
  assert.match(h, /class="subtle-note"/);
  assert.match(h, /<p class="g">guide<\/p>/);
  assert.doesNotMatch(briefingPanel(bv({ copy: { briefing: { title: '<s>', description: '', question: '', hint: '' } } })), /<s>/);
});

test('notebook.css is retired and dialogue.css stands alone', async () => {
  const { existsSync } = await import('node:fs');
  assert.ok(!existsSync(new URL('../client/notebook.css', import.meta.url)));
  for (const c of ['.notebook-page', '.task-list', '.thinking-dots', '.thread-post', '.tool-guide', '.dossier-close'])
    assert.ok(css.includes(c), c);
  assert.match(css, /dialogue-fade 160ms/);
});
