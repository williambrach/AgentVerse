// The content editor page. Text only, through textContent and value; no markup is ever parsed.
import { el } from './dom.js';
import { renderForm } from './maker-form.js';

const REHEARSAL_NOTE = 'Rehearsal mode: replies are scripted. Start the server in live mode to try the model.';

export function mountMaker(root, { api, caseId = null, location = null } = {}) {
  const doc = root.ownerDocument || root;
  const $ = (id) => doc.getElementById(id);
  let cases = [];
  let id = null;
  let detail = null;
  let form = null;

  const clear = (node) => { node.textContent = ''; };
  const setStatus = () => { $('status').textContent = form && form.dirty() ? 'Unsaved changes' : 'Up to date'; };
  const wanted = () => caseId ?? (location && location.search ? new URLSearchParams(location.search).get('case') : null);

  function renderTabs() {
    const nav = $('cases');
    clear(nav);
    for (const c of cases) {
      const b = el(doc, 'button', c.id === id ? 'tab active' : 'tab', { text: `${c.title} · ${c.rev ? 'rev ' + c.rev : 'authored'}`, parent: nav });
      b.type = 'button';
      b.addEventListener('click', () => select(c.id));
    }
  }

  function renderHistory() {
    const ol = $('history');
    clear(ol);
    const row = (text, rev) => {
      const li = el(doc, 'li', null, { parent: ol });
      el(doc, 'span', 'rev-text', { text, parent: li });
      const b = el(doc, 'button', 'restore', { text: 'Restore', parent: li });
      b.type = 'button';
      b.addEventListener('click', () => restore(rev));
    };
    row('authored', 0);
    for (const h of detail.history || []) {
      const when = typeof h.timestamp === 'string' ? h.timestamp.slice(0, 16).replace('T', ' ') + ' UTC' : '';
      row(`rev ${h.rev} · ${h.by ?? 'unknown'} · ${when} · ${(h.fields || []).join(', ')}`, h.rev);
    }
  }

  function renderPanel() {
    const sel = $('character');
    clear(sel);
    for (const c of detail.structure?.characters || []) {
      const cid = typeof c === 'string' ? c : c.id;
      const o = el(doc, 'option', null, { text: cid, parent: sel });
      o.value = cid;
    }
    const live = detail.mode === 'live';
    $('try').disabled = !live;
    $('try-note').textContent = live ? '' : REHEARSAL_NOTE;
  }

  function show(next) {
    detail = next;
    if (form) form.setDetail(detail);
    else form = renderForm($('form'), detail, { onChange: setStatus });
    renderPanel();
    renderHistory();
    setStatus();
  }

  async function fetchDetail() {
    show(await api(`/admin/content/${id}`));
  }

  async function load() {
    const list = await api('/admin/content');
    cases = list.cases || [];
    const want = wanted();
    id = (cases.find(c => c.id === want) || cases[0] || {}).id ?? null;
    renderTabs();
    if (id) await fetchDetail();
  }

  async function select(next) {
    id = next;
    $('prompt').textContent = '';
    $('answer').textContent = '';
    $('reasoning').textContent = '';
    $('publish-note').textContent = '';
    renderTabs();
    await fetchDetail();
  }

  const body = () => ({ edits: form.overlay() || {}, characterId: $('character').value, question: $('question').value || undefined });

  function fieldError(err, note) {
    if (err.path && form) form.setError(err.path, err.message);
    else note.textContent = err.message;
  }

  async function preview() {
    form.clearErrors();
    $('prompt').textContent = '';
    try {
      const r = await api(`/admin/content/${id}/preview`, body());
      $('prompt').textContent = (r.messages || []).find(m => m.role === 'system')?.content ?? '';
    } catch (err) {
      fieldError(err, $('prompt'));
    }
  }

  async function tryAsk() {
    form.clearErrors();
    $('answer').textContent = '';
    $('reasoning').textContent = '';
    $('try-note').textContent = '';
    try {
      const r = await api(`/admin/content/${id}/try`, body());
      $('answer').textContent = r.answer ?? '';
      $('reasoning').textContent = r.reasoning ?? '';
    } catch (err) {
      fieldError(err, $('try-note'));
    }
  }

  async function publish() {
    form.clearErrors();
    const note = $('publish-note');
    note.textContent = '';
    try {
      await api(`/admin/content/${id}`, { edits: form.overlay() || {}, baseRev: detail.rev }, 'PUT');
      await fetchDetail();
      note.textContent = `Published rev ${detail.rev} by ${detail.by}`;
      await refreshTabs();
    } catch (err) {
      if (err.status === 409) note.textContent = `Changed meanwhile: rev ${err.body?.rev} by ${err.body?.by}. Reload.`;
      else fieldError(err, note);
    }
  }

  async function restore(rev) {
    const note = $('publish-note');
    note.textContent = '';
    try {
      await api(`/admin/content/${id}/revert`, { rev });
      await fetchDetail();
      note.textContent = `Restored rev ${rev}; now rev ${detail.rev}`;
      await refreshTabs();
    } catch (err) {
      note.textContent = err.message;
    }
  }

  async function refreshTabs() {
    cases = (await api('/admin/content')).cases || cases;
    renderTabs();
  }

  $('preview').addEventListener('click', preview);
  $('try').addEventListener('click', tryAsk);
  $('publish').addEventListener('click', publish);

  return { load, select, preview, tryAsk, publish, restore };
}

function start() {
  const $ = (id) => document.getElementById(id);
  const token = () => sessionStorage.getItem('adminToken') || '';
  async function api(path, body, method = body ? 'POST' : 'GET') {
    const init = { method, headers: { authorization: 'Bearer ' + token() } };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(path, init);
    let j = {};
    try { j = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error(j.error || 'HTTP ' + res.status);
      err.status = res.status;
      err.path = j.path;
      err.body = j;
      throw err;
    }
    return j;
  }
  $('token').value = token();
  const app = mountMaker(document.body, { api, caseId: new URLSearchParams(window.location.search).get('case'), location: window.location });
  const go = () => app.load().catch((err) => { $('status').textContent = err.message; });
  $('auth').addEventListener('submit', (e) => {
    e.preventDefault();
    sessionStorage.setItem('adminToken', $('token').value.trim());
    go();
  });
  if (token()) go();
}

if (typeof document !== 'undefined') start();
