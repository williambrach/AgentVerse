// The content editor page. Text only, through textContent and value; no markup is ever parsed.
import { el } from './dom.js';
import { renderForm } from './maker-form.js';
import { createChat } from './maker-chat.js';
import { mountSignIn } from './signin.js';

const GAME = 'game';

export function mountMaker(root, { api, caseId = null, location = null, confirm = (m) => window.confirm(m), debounceMs = 80 } = {}) {
  const doc = root.ownerDocument || root;
  const $ = (id) => doc.getElementById(id);
  let cases = [];
  let id = null;
  let detail = null;
  let form = null;
  let currentKey = null;
  let navTimer = null;
  const chat = createChat(doc, {
    api,
    getEdits: () => (form ? form.overlay() || {} : {}),
    getCaseId: () => id,
    onFieldError: (path, msg) => { const k = form && form.setError(path, msg); if (k) selectSection(k); },
  });

  const clear = (node) => { node.textContent = ''; };
  const flags = () => [
    detail?.stale ? 'Stale: the last revision no longer fits this case version, so the authored text is shown' : null,
    detail?.corrupt ? 'History file has an unreadable line; the readable revisions were kept' : null,
    detail?.skipped?.length ? `Skipped, no longer valid: ${detail.skipped.join(', ')}` : null,
  ].filter(Boolean);
  const setStatus = () => {
    const dirty = !!(form && form.dirty());
    const fl = flags();
    $('status').textContent = dirty ? 'Unsaved changes' : (fl.join(' · ') || 'Up to date');
    $('status').dataset.state = dirty ? 'unsaved' : (fl.length ? 'bad' : 'ok');
    const n = form ? form.dirtyCount() : 0;
    $('dirty-count').textContent = n === 0 ? '' : n === 1 ? '1 unsaved change' : `${n} unsaved changes`;
    renderNavSoon();
  };
  const showError = (message) => { $('status').textContent = message; $('status').dataset.state = 'bad'; };

  // Typing updates the status at once; the nav (dots, order, titles) catches up after a pause.
  function renderNavSoon() {
    if (navTimer !== null) return;
    navTimer = setTimeout(renderNav, debounceMs);
  }

  function renderNav() {
    if (detail && detail.id !== GAME) chat.refresh();
    if (navTimer !== null) { clearTimeout(navTimer); navTimer = null; }
    const nav = $('sections');
    if (!nav || !form) return;
    clear(nav);
    const dirty = form.dirtySections();
    const item = (key, title, role) => {
      const b = el(doc, 'button', 'nav-item', { parent: nav });
      b.type = 'button';
      b.dataset.section = key;
      el(doc, 'span', 'nav-title', { text: title, parent: b });
      if (role) el(doc, 'span', 'badge role-badge', { text: role, parent: b });
      if (dirty.includes(key)) el(doc, 'span', 'dot', { parent: b });
      if (key === currentKey) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => selectSection(key));
    };
    for (const sec of form.sections()) item(sec.key, sec.title, sec.role);
    item('history', 'History');
  }

  function selectSection(key) {
    currentKey = key;
    const hist = key === 'history';
    $('form').hidden = hist;
    $('history-section').hidden = !hist;
    if (!hist) form.show(key);
    renderNav();
  }
  const wanted = () => caseId ?? (location && location.search ? new URLSearchParams(location.search).get('case') : null);

  let caseSel = null;
  function renderTabs() {
    if (!caseSel) {
      caseSel = $('case-select');
      if (!caseSel) {
        caseSel = el(doc, 'select', null, { parent: $('cases') });
        caseSel.id = 'case-select';
        caseSel.setAttribute('aria-label', 'Case');
      }
      caseSel.addEventListener('change', () => {
        const next = caseSel.value;
        if (next === id) return Promise.resolve();
        return select(next).catch((err) => showError(err.message)).finally(() => { caseSel.value = id; });
      });
    }
    clear(caseSel);
    for (const c of [...cases.filter((x) => x.id !== GAME), ...cases.filter((x) => x.id === GAME)]) {
      const o = el(doc, 'option', null, { text: `${c.title}${c.rev ? ' · rev ' + c.rev : ''}${c.stale ? ' · stale' : ''}`, parent: caseSel });
      o.value = c.id;
    }
    if (id) caseSel.value = id;
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

  function show(next) {
    detail = next;
    if (form) form.setDetail(detail);
    else form = renderForm($('form'), detail, { onChange: setStatus });
    if ($('field-search')) $('field-search').value = '';
    const game = detail.id === GAME;
    if ($('panel')) $('panel').hidden = game;
    if (!game) chat.setDetail(detail);
    renderHistory();
    if (currentKey !== 'history' && !form.sections().some((x) => x.key === currentKey)) currentKey = form.sections()[0]?.key ?? 'history';
    selectSection(currentKey);
    setStatus();
  }

  async function fetchDetail() {
    const want = id;
    const next = await api(`/admin/content/${want}`);
    if (want === id) show(next);
  }

  async function load() {
    const list = await api('/admin/content');
    cases = list.cases || [];
    const want = wanted();
    id = (cases.find(c => c.id === want) || cases.find(c => c.id !== GAME) || cases[0] || {}).id ?? null;
    currentKey = null;
    renderTabs();
    if (id) await fetchDetail();
  }

  async function select(next) {
    if (form && form.dirty() && !confirm('Discard unsaved changes?')) return;
    id = next;
    currentKey = null;
    $('prompt').textContent = '';
    chat.hidePrompt();
    $('publish-note').textContent = '';
    renderTabs();
    await fetchDetail();
  }

  function fieldError(err, note) {
    const k = err.path && form ? form.setError(err.path, err.message) : null;
    if (k) selectSection(k);
    else note.textContent = err.message;
  }

  let publishing = false;
  async function publish() {
    if (publishing) return;
    publishing = true;
    try { await doPublish(); } finally { publishing = false; }
  }

  async function doPublish() {
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
    if (form && form.dirty() && !confirm('Discard unsaved changes?')) return;
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

  $('publish').addEventListener('click', publish);
  if ($('field-search')) {
    $('field-search').addEventListener('input', () => {
      if (!form) return;
      form.setFilter($('field-search').value);
      if (currentKey !== 'history') currentKey = form.shownKey();
      renderNav();
    });
  }

  return { load, select, preview: chat.showPrompt, tryAsk: chat.send, publish, restore };
}

function start() {
  const $ = (id) => document.getElementById(id);
  async function api(path, body, method = body ? 'POST' : 'GET') {
    const init = { method, headers: {}, credentials: 'same-origin' };
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
  const app = mountMaker(document.body, { api, caseId: new URLSearchParams(window.location.search).get('case'), location: window.location });
  const go = () => app.load().catch((err) => { $('status').textContent = err.message; $('status').dataset.state = 'bad'; });
  mountSignIn(document, { onSignedIn: go });
}

if (typeof document !== 'undefined') start();
