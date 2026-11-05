// The content editor's test chat. Text only, through textContent and value; no markup is ever parsed.
import { el } from './dom.js';

export const REHEARSAL_NOTE = 'Rehearsal mode: replies are scripted. Start the server in live mode to try the model.';
const MAX_HISTORY = 20;

export function createChat(doc, { api, getEdits, getCaseId, onFieldError } = {}) {
  const $ = (id) => doc.getElementById(id);
  let detail = null;
  let turns = [];
  let busy = false;
  let epoch = 0;
  let lastCase;

  const cast = () => detail?.structure?.characters || [];
  const parts = () => detail?.structure?.parts || [];
  const nameOf = (c) => (typeof c === 'string' ? c : c.name || c.id);
  const idOf = (c) => (typeof c === 'string' ? c : c.id);
  const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  function partLabel(p) {
    const k = `parts.${p.id}.label`;
    return detail.current?.[k] || detail.authored?.[k] || p.id;
  }

  function optionText(c, i) {
    const name = capital(nameOf(c));
    const p = parts()[i];
    return p ? `${name} · ${partLabel(p)} (${p.role})` : name;
  }

  function clearEl(node) {
    if (!node) return;
    node.textContent = '';
  }

  function characterName() {
    const sel = $('character');
    const id = sel?.value;
    const c = cast().find((x) => idOf(x) === id) ?? cast()[0];
    return c ? capital(nameOf(c)) : 'The character';
  }

  function renderOptions() {
    const sel = $('character');
    if (!sel) return;
    const keep = sel.value;
    clearEl(sel);
    cast().forEach((c, i) => {
      const o = el(doc, 'option', null, { text: optionText(c, i), parent: sel });
      o.value = idOf(c);
    });
    if (keep && cast().some((c) => idOf(c) === keep)) sel.value = keep;
    else if (cast().length) sel.value = idOf(cast()[0]);
  }

  function applyMode() {
    const live = detail?.mode === 'live';
    const q = $('question');
    const t = $('try');
    if (q) q.disabled = !live;
    if (t) t.disabled = !live;
    const note = $('try-note');
    if (note) note.textContent = live ? '' : REHEARSAL_NOTE;
  }

  function reset() {
    turns = [];
    epoch += 1;
    clearEl($('thread'));
    const note = $('try-note');
    if (note && detail?.mode === 'live') note.textContent = '';
  }

  function setDetail(next) {
    detail = next;
    const before = $('character')?.value;
    renderOptions();
    applyMode();
    // The thread belongs to a case and a character; a reload of the same case (Publish, Restore) keeps it.
    const caseId = getCaseId?.();
    const switched = lastCase !== undefined && caseId !== lastCase;
    lastCase = caseId;
    if (switched || (before && $('character')?.value !== before)) reset();
  }

  function body(question) {
    const b = { edits: getEdits(), characterId: $('character')?.value };
    if (question) b.question = question;
    if (turns.length) b.history = turns.slice(-MAX_HISTORY).map((t) => ({ question: t.question, answer: t.answer }));
    return b;
  }

  function fail(err, node) {
    const msg = err?.message ?? String(err);
    if (err?.path && onFieldError) onFieldError(err.path, msg);
    if (node) {
      node.className = 'msg err';
      node.textContent = msg;
    }
  }

  async function send() {
    if (busy || detail?.mode !== 'live') return;
    const input = $('question');
    const question = String(input?.value ?? '').trim();
    if (!question) return;
    busy = true;
    const mine = epoch;
    const turn = el(doc, 'div', 'turn', { parent: $('thread') });
    el(doc, 'div', 'msg q', { text: question, parent: turn });
    const a = el(doc, 'div', 'msg a', { text: `${characterName()} is thinking…`, parent: turn });
    if (input) input.value = '';
    try {
      const r = await api(`/admin/content/${getCaseId()}/try`, body(question), 'POST');
      const answer = r?.answer ?? '';
      const reasoning = r?.reasoning ?? null;
      a.textContent = answer;
      if (reasoning) {
        const d = el(doc, 'details', 'reasoning', { parent: turn });
        d.open = false;
        el(doc, 'summary', null, { text: 'Reasoning', parent: d });
        el(doc, 'pre', null, { text: reasoning, parent: d });
      }
      if (mine === epoch) {
        turns.push({ question, answer, reasoning });
        if (turns.length > MAX_HISTORY) turns = turns.slice(-MAX_HISTORY);
      }
    } catch (err) {
      if (mine !== epoch) return;
      fail(err, a);
      if (input && !input.value) input.value = question;
    } finally {
      busy = false;
    }
  }

  async function showPrompt() {
    const pre = $('prompt');
    const box = $('prompt-box');
    const q = String($('question')?.value ?? '').trim();
    try {
      const r = await api(`/admin/content/${getCaseId()}/preview`, body(q), 'POST');
      if (pre) pre.textContent = (r?.messages || []).find((m) => m.role === 'system')?.content ?? '';
      if (box) box.hidden = false;
    } catch (err) {
      if (err?.path && onFieldError) onFieldError(err.path, err.message);
      else if (pre) {
        pre.textContent = err?.message ?? String(err);
        if (box) box.hidden = false;
      }
    }
  }

  const on = (id, type, fn) => $(id)?.addEventListener(type, fn);
  on('ask', 'submit', (e) => { e?.preventDefault?.(); return send(); });
  on('preview', 'click', () => showPrompt());
  on('new-chat', 'click', () => reset());
  on('character', 'change', () => reset());

  return { setDetail, send, showPrompt, reset, turns: () => turns.map((t) => ({ ...t })) };
}
