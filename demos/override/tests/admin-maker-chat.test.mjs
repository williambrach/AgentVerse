import test from 'node:test';
import assert from 'node:assert/strict';
import { createChat } from '../server/admin/maker-chat.js';

class El {
  constructor(tag, doc) { this.tag = tag; this.ownerDocument = doc; this.children = []; this.listeners = {}; this.className = ''; this._text = ''; this.dataset = {}; this.hidden = false; this.disabled = false; this.value = ''; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  fire(t, ev = {}) { return Promise.all((this.listeners[t] ?? []).map(f => f({ preventDefault() {}, ...ev }))); }
  all(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach(c => c.all(pred, out)); return out; }
}
const IDS = ['character', 'thread', 'question', 'ask', 'try', 'preview', 'prompt-box', 'prompt', 'new-chat', 'try-note'];
const detail = (over = {}) => ({
  mode: 'live',
  structure: { characters: [{ id: 'momo', name: 'Momo', color: '#fff' }, { id: 'pip', name: 'Pip', color: '#000' }], parts: [{ id: 'boss', role: 'villain' }, { id: 'aide', role: 'helper' }] },
  authored: { 'parts.boss.label': 'The boss' }, current: { 'parts.boss.label': 'The planner' },
  ...over,
});
function setup({ reply, d = detail(), onFieldError, caseRef = { id: 'case1' } } = {}) {
  const byId = {};
  const doc = { createElement: t => new El(t, doc), getElementById: id => byId[id] ?? null };
  for (const id of IDS) byId[id] = new El(id === 'character' ? 'select' : 'div', doc);
  const calls = [];
  let n = 0;
  const api = async (path, body, method) => {
    calls.push({ path, body: JSON.parse(JSON.stringify(body)), method });
    if (reply) return reply(path, body, ++n);
    return { answer: 'a' + (++n), reasoning: null };
  };
  const edits = { x: 1 };
  const chat = createChat(doc, { api, getEdits: () => edits, getCaseId: () => caseRef.id, onFieldError });
  chat.setDetail(d);
  return { chat, $: id => byId[id], calls, edits };
}
const ask = async (s, q) => { s.$('question').value = q; await s.chat.send(); };

test('option_text_name_part_role', () => {
  const s = setup();
  assert.deepEqual(s.$('character').children.map(o => [o.value, o.textContent]), [['momo', 'Momo · The planner (villain)'], ['pip', 'Pip · aide (helper)']]);
});

test('third_send_carries_two_turns', async () => {
  const s = setup();
  await ask(s, 'q1'); await ask(s, 'q2'); await ask(s, 'q3');
  assert.deepEqual(s.calls[2].body.history, [{ question: 'q1', answer: 'a1' }, { question: 'q2', answer: 'a2' }]);
  assert.deepEqual(s.calls[2].body.edits, s.edits);
  assert.equal(s.calls[2].body.characterId, 'momo');
  assert.equal(s.calls[2].path, '/admin/content/case1/try');
});

test('first_send_omits_history', async () => {
  const s = setup();
  await ask(s, 'q1');
  assert.ok(!('history' in s.calls[0].body));
  assert.equal(s.calls[0].body.question, 'q1');
});

test('history_capped_at_20', async () => {
  const s = setup();
  for (let i = 1; i <= 22; i++) await ask(s, 'q' + i);
  await ask(s, 'q23');
  const h = s.calls[22].body.history;
  assert.equal(h.length, 20);
  assert.equal(h[0].question, 'q3');
  assert.equal(h[19].question, 'q22');
  assert.equal(s.chat.turns().length, 20);
});

test('double_send_ignored_while_busy', async () => {
  let release;
  const s = setup({ reply: () => new Promise(r => { release = () => r({ answer: 'x' }); }) });
  s.$('question').value = 'q';
  const p1 = s.chat.send();
  const p2 = s.chat.send();
  release();
  await Promise.all([p1, p2]);
  assert.equal(s.calls.length, 1);
});

test('error_not_recorded', async () => {
  const seen = [];
  const err = Object.assign(new Error('bad field'), { status: 400, path: 'copy.headline' });
  const s = setup({ reply: () => { throw err; }, onFieldError: (p, m) => seen.push([p, m]) });
  await ask(s, 'q');
  assert.equal(s.chat.turns().length, 0);
  const e = s.$('thread').all(x => x.className === 'msg err');
  assert.equal(e.length, 1);
  assert.equal(e[0].textContent, 'bad field');
  assert.deepEqual(seen, [['copy.headline', 'bad field']]);
});

test('rehearsal_disables', async () => {
  const s = setup({ d: detail({ mode: 'rehearsal' }), reply: () => ({ messages: [{ role: 'user', content: 'u' }, { role: 'system', content: 'SYS' }] }) });
  assert.equal(s.$('question').disabled, true);
  assert.equal(s.$('try').disabled, true);
  assert.equal(s.$('try-note').textContent, 'Rehearsal mode: replies are scripted. Start the server in live mode to try the model.');
  await s.chat.showPrompt();
  assert.equal(s.calls[0].path, '/admin/content/case1/preview');
  assert.ok(!('question' in s.calls[0].body));
  assert.equal(s.$('prompt').textContent, 'SYS');
  assert.equal(s.$('prompt-box').hidden, false);
});

test('reset_on_character_change_and_new_chat', async () => {
  const s = setup();
  await ask(s, 'q1');
  await s.$('character').fire('change');
  assert.equal(s.chat.turns().length, 0);
  assert.equal(s.$('thread').children.length, 0);
  await ask(s, 'q2');
  await ask(s, 'q3');
  await s.$('new-chat').fire('click');
  assert.equal(s.chat.turns().length, 0);
});

test('reasoning_collapsed', async () => {
  let k = 0;
  const s = setup({ reply: () => ({ answer: 'a', reasoning: ++k === 2 ? 'because' : null }) });
  await ask(s, 'q1'); await ask(s, 'q2');
  const det = s.$('thread').all(x => x.tag === 'details');
  assert.equal(det.length, 1);
  assert.equal(det[0].className, 'reasoning');
  assert.ok(!det[0].open);
  assert.equal(det[0].textContent, 'Reasoningbecause');
  assert.deepEqual(s.chat.turns().map(t => t.reasoning), [null, 'because']);
});

test('text_not_markup', async () => {
  const s = setup({ reply: () => ({ answer: '<b>x</b>', reasoning: null }) });
  await ask(s, '<i>q</i>');
  const a = s.$('thread').all(x => x.className === 'msg a')[0];
  assert.equal(a.textContent, '<b>x</b>');
  assert.equal(s.$('thread').all(x => x.tag === 'b' || x.tag === 'i').length, 0);
});

test('pending_text_names_character', async () => {
  let seen;
  const s = setup({ reply: () => new Promise(r => setTimeout(() => r({ answer: 'z' }), 0)) });
  s.$('question').value = 'q';
  const p = s.chat.send();
  seen = s.$('thread').all(x => x.className === 'msg a')[0].textContent;
  await p;
  assert.equal(seen, 'Momo is thinking…');
});

test('failed_send_restores_question_and_shows_error', async () => {
  const s = setup({ reply: async () => { throw new Error('network down'); } });
  await ask(s, 'why?');
  assert.equal(s.$('question').value, 'why?');
  const err = s.$('thread').all(n => n.className === 'msg err');
  assert.equal(err.length, 1);
  assert.equal(err[0].textContent, 'network down');
  assert.deepEqual(s.chat.turns(), []);
});

test('failed_send_keeps_newer_typing', async () => {
  let s;
  s = setup({ reply: async () => { s.$('question').value = 'newer'; throw new Error('x'); } });
  await ask(s, 'old');
  assert.equal(s.$('question').value, 'newer');
});

test('thread_survives_setDetail_of_same_case', async () => {
  const s = setup();
  await ask(s, 'q1');
  s.chat.setDetail(detail());
  assert.equal(s.chat.turns().length, 1);
  assert.equal(s.$('thread').children.length, 1);
  await ask(s, 'q2');
  assert.deepEqual(s.calls[1].body.history, [{ question: 'q1', answer: 'a1' }]);
});

test('thread_empties_on_case_switch_character_switch_and_new_chat', async () => {
  const caseRef = { id: 'case1' };
  const s = setup({ caseRef });
  await ask(s, 'q1');
  caseRef.id = 'case2';
  s.chat.setDetail(detail());
  assert.equal(s.chat.turns().length, 0);
  assert.equal(s.$('thread').children.length, 0);
  await ask(s, 'q2');
  s.$('character').value = 'pip';
  await s.$('character').fire('change');
  assert.equal(s.chat.turns().length, 0);
  await ask(s, 'q3');
  await s.$('new-chat').fire('click');
  assert.equal(s.chat.turns().length, 0);
  assert.equal(s.$('thread').children.length, 0);
});

test('late_answer_after_reset_is_not_added_to_new_thread', async () => {
  let release;
  const s = setup({ reply: () => new Promise(r => { release = () => r({ answer: 'late' }); }) });
  s.$('question').value = 'q1';
  const p = s.chat.send();
  await s.$('new-chat').fire('click');
  release();
  await p;
  assert.deepEqual(s.chat.turns(), []);
});

test('late_failure_after_reset_touches_no_field_and_keeps_input_empty', async () => {
  for (const how of ['new-chat', 'character', 'case']) {
    let fail;
    const seen = [];
    const caseRef = { id: 'case1' };
    const s = setup({ caseRef, reply: () => new Promise((_, rej) => { fail = rej; }), onFieldError: (p, m) => seen.push([p, m]) });
    s.$('question').value = 'q1';
    const p = s.chat.send();
    if (how === 'new-chat') await s.$('new-chat').fire('click');
    else if (how === 'character') { s.$('character').value = 'pip'; await s.$('character').fire('change'); }
    else { caseRef.id = 'case2'; s.chat.setDetail(detail()); }
    const err = new Error('bad'); err.path = 'parts.boss.label';
    fail(err);
    await p;
    assert.deepEqual(seen, [], how);
    assert.equal(s.$('question').value, '', how);
    assert.deepEqual(s.chat.turns(), [], how);
    assert.equal(s.$('thread').children.length, 0, how);
    s.$('question').value = 'again';
    s.chat.send();
    assert.equal(s.calls.length, 2, how + ' not stuck busy');
  }
});

test('show_prompt_button_toggles', async () => {
  const s = setup({ reply: () => ({ messages: [{ role: 'system', content: 'SYS' }] }) });
  await s.$('preview').fire('click');
  assert.equal(s.$('prompt-box').hidden, false);
  assert.equal(s.$('preview').textContent, 'Hide prompt');
  const calls = s.calls.length;
  await s.$('preview').fire('click');
  assert.equal(s.$('prompt-box').hidden, true);
  assert.equal(s.$('preview').textContent, 'Show prompt');
  assert.equal(s.calls.length, calls);
  await s.$('preview').fire('click');
  assert.equal(s.$('prompt-box').hidden, false);
  assert.equal(s.calls.length, calls + 1);
});

test('option_names_follow_published_and_typed_names', () => {
  const d = detail();
  d.current['characters.momo.name'] = 'Tinky Winky';
  const s = setup({ d });
  assert.equal(s.$('character').children[0].textContent, 'Tinky Winky · The planner (villain)');
  s.edits['characters.pip.name'] = 'Dipsy';
  s.edits['parts.boss.label'] = 'The chief';
  s.$('character').value = 'pip';
  s.chat.refresh();
  assert.deepEqual(s.$('character').children.map(o => o.textContent), ['Tinky Winky · The chief (villain)', 'Dipsy · aide (helper)']);
  assert.equal(s.$('character').value, 'pip');
});
