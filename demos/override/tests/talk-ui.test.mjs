import test from 'node:test';
import assert from 'node:assert/strict';
import { wordTokens, excerptOf, quotesPanel } from '../client/talk-ui.ts';
import { interviewPanel } from '../client/dialogue.ts';

const SNAP = ["<section class=\"dialogue\" aria-label=\"Conversation with Ann\">\n    <div class=\"speaker-tag\"><b>ANN</b><span>Planner</span></div>\n    <div class=\"portrait dialogue-portrait x slot-0\"><span class=\"pixel-person\"></span></div>\n    <div class=\"dialogue-body\"><div class=\"interview-transcript\" id=\"transcript\" role=\"log\" aria-label=\"Interview transcript\" aria-live=\"polite\"><div class=\"speech character latest\" data-motion-key=\"introduction\"><span>ANN</span><p>Hi &lt;b&gt;</p></div></div>\n    <form class=\"interview-compose\" id=\"interview-form\">\n    <button class=\"quick-question\" type=\"button\" data-quick-question=\"Why?\" ><small>QUICK QUESTION · TAP TO ASK</small><span>Why? <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\"><path d=\"M4 12h15m-6-6 6 6-6 6\"/></svg></span></button>\n    <label class=\"sr-only\" for=\"question\">Your question for Ann</label>\n    <div class=\"compose-row\"><textarea id=\"question\" name=\"question\" rows=\"1\" minlength=\"1\" maxlength=\"280\" placeholder=\"Or type your own question…\" required ></textarea>\n    <button type=\"submit\" class=\"primary-button ask-button\"  ><span>Ask</span></button></div>\n    \n    <div class=\"compose-bottom\"><small>Short answers. Curious people.</small>\n    \n    </div></form></div></section>","<section class=\"dialogue\" aria-label=\"Conversation with Ann\">\n    <div class=\"speaker-tag\"><b>ANN</b><span>Planner</span></div>\n    <div class=\"portrait dialogue-portrait x slot-0\"><span class=\"pixel-person\"></span></div>\n    <div class=\"dialogue-body\"><div class=\"interview-transcript\" id=\"transcript\" role=\"log\" aria-label=\"Interview transcript\" aria-live=\"polite\"><div class=\"speech character\" data-motion-key=\"introduction\"><span>ANN</span><p>Hi &lt;b&gt;</p></div><div class=\"speech investigator latest\" data-motion-key=\"question-0\"><p>You asked: “Q1”</p></div><div class=\"speech character latest\" data-motion-key=\"answer-0\"><span>ANN</span><p>A1 &quot;x&quot;</p></div></div>\n    <form class=\"interview-compose\" id=\"interview-form\">\n    \n    <label class=\"sr-only\" for=\"question\">Your question for Ann</label>\n    <div class=\"compose-row\"><textarea id=\"question\" name=\"question\" rows=\"1\" minlength=\"1\" maxlength=\"280\" placeholder=\"Ask a follow-up…\" required ></textarea>\n    <button type=\"submit\" class=\"primary-button ask-button\"  ><span>Ask</span></button></div>\n    \n    <div class=\"compose-bottom\"><small>Short answers. Curious people.</small>\n    \n    <button class=\"secondary-button next-monkey\" type=\"button\" data-go=\"b\" >Next: ask Bo <svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\"><path d=\"M4 12h15m-6-6 6 6-6 6\"/></svg></button></div></form></div></section>"];
const base = { character:{id:'a',name:'Ann',role:'Planner',room:'r',color:'c',introduction:'Hi <b>',quickQuestion:'Why?'}, turns:[], inspections:[], faceClass:'x slot-0', closed:false, busy:false, draft:'', waitingOn:null, next:{id:'b',name:'Bo'}, askLabel:null, askOff:null, hint:'h', many:'people' };
const t = [{question:'Q1',answer:'A1 "x"',timestamp:'2026-01-01T00:00:00Z'}];
const topics = [{id:'work',label:'Work',question:'What work?'},{id:'travel',label:'Travel',question:'Where?'}];
const tt = [{id:'L1',question:'What work?',answer:'I <script>x</script> ride, it is ok',timestamp:'2026-01-01T00:00:00Z'}];
const talkV = (extra = {}, turns = tt) => ({ ...base, turns, talk: { topics, asked: ['work'], pick: null, ...extra } });

test('wordTokens and excerptOf', () => {
  assert.deepEqual(wordTokens('Take a selfie— ah'), [{i:0,word:'Take',start:0,end:4},{i:1,word:'a',start:5,end:6},{i:2,word:'selfie',start:7,end:13},{i:3,word:'ah',start:15,end:17}]);
  assert.equal(excerptOf('Take a selfie— ah', 1, 2), 'a selfie');
  assert.equal(excerptOf('Take a selfie— ah', 3, 0), 'Take a selfie— ah');
});

test('non_talk_markup_unchanged', () => {
  assert.equal(interviewPanel(base), SNAP[0]);
  assert.equal(interviewPanel({ ...base, turns: t }), SNAP[1]);
});

test('chips_disable_asked and quick_question_hidden_for_talk', () => {
  const h = interviewPanel(talkV({}, []));
  assert.ok(!h.includes('quick-question'));
  assert.match(h, /<div class="topic-chips">/);
  assert.match(h, /<button type="button" data-topic="travel">Travel<\/button>/);
  assert.match(h, /data-topic="work" aria-pressed="true" disabled>✓ Work/);
  assert.ok(!/data-topic="travel"[^>]*disabled/.test(h));
});

test('excerpt_escape and line tools', () => {
  const h = interviewPanel(talkV());
  assert.ok(!h.includes('<script>'));
  assert.match(h, /<p class="talk-line" data-line="L1">/);
  assert.match(h, /data-pick-line="L1"/);
  assert.match(h, /data-save-quote="L1"/);
});

test('tokens_have_equal_markup', () => {
  const h = interviewPanel(talkV({ pick: { line: 'L1', a: null, b: null } }));
  const words = [...h.matchAll(/<button type="button" class="(word[^"]*)" data-word="(\d+)" data-line="L1">/g)];
  assert.ok(words.length >= 6);
  assert.ok(words.every(m => m[1] === 'word'));
  assert.match(h, /data-save-quote="L1"[^>]*>Save whole line/);
  assert.match(h, /data-ask-about="L1"[^>]*disabled/);
  assert.match(h, /data-pick-cancel/);
  assert.ok(!h.includes('<script>'));
});

test('picked range', () => {
  const h = interviewPanel(talkV({ pick: { line: 'L1', a: 1, b: 2 } }));
  assert.equal([...h.matchAll(/class="word picked"/g)].length, 2);
  assert.match(h, /Save excerpt/);
  assert.ok(!/data-ask-about="L1"[^>]*disabled/.test(h));
});

test('quotesPanel', () => {
  const cast = [{id:'a',name:'Ann',role:'Wizard'},{id:'b',name:'Bo',role:'Guard'}];
  assert.match(quotesPanel([], cast), /No quotes yet[\s\S]*Save quote/);
  const h = quotesPanel([{id:'q2',character:'b',text:'<i>hi</i>'},{id:'q1',character:'a',text:'yo'}], cast);
  assert.ok(h.indexOf('data-character="a"') < h.indexOf('data-character="b"'));
  assert.match(h, /<ul class="quote-list">/);
  assert.match(h, /<span class="monkey-face a" aria-hidden="true"><\/span><b class="quote-name">Ann<\/b>/);
  assert.match(h, /<blockquote>“yo”<\/blockquote><button type="button" class="quote-remove" data-unquote="q1">Remove<\/button>/);
  assert.ok(!h.includes('<i>'));
  assert.match(h, /Guard/);
});
