// The content editor: the story, each actor as a name and one text box, the game's rules, and the rest in plain fields.
// Text only, through textContent and value; no markup is ever parsed.
import { el } from './dom.js';
import { createChat } from './maker-chat.js';
import { mountSignIn } from './signin.js';
import { fieldCopy, routeOf } from './maker-copy.js';

const GAME = 'game';

/** Textarea text to a list: one item per line, trimmed, empty lines dropped. */
export function knowledgeLines(text) {
  return String(text ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
}

/** A list to textarea text: one item per line. */
export function linesText(items) {
  return (items ?? []).join('\n');
}
const same = (a, b) => (Array.isArray(a) || Array.isArray(b)
  ? Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])
  : a === b);
const idOf = (x) => (typeof x === 'string' ? x : x?.id);

const TEMPLATE_TOKENS = {
  interview: ['name', 'label', 'version', 'promptVersion', 'frame', 'persona', 'memory', 'knowledge', 'frameFirst'],
  thread: ['others'],
};

/** What the server would refuse in a template, or null. */
export function templateProblem(kind, text) {
  const found = [...String(text ?? '').matchAll(/\[\[([A-Za-z0-9_]*)\]\]/g)].map((m) => m[1]);
  const bad = found.find((t) => !TEMPLATE_TOKENS[kind].includes(t));
  if (bad !== undefined) return `Unknown token [[${bad}]].`;
  if (kind === 'interview' && found.filter((t) => t === 'knowledge').length !== 1) return 'The rules need [[knowledge]] exactly once: that is where each actor\'s own text goes.';
  return null;
}

/**
 * The pages that hold a prompt. Names are dealt to parts at random each game, so a page is never "a name with a part":
 * - where the parts carry the story identity (their own label), one page per part, and the name is whoever gets it;
 * - where every character has its own label, one page per character, and the dealt part's facts are added in the game.
 * Each entry names the editable path behind every piece of the prompt, or null when the case has none.
 */
export function actorsOf(detail) {
  const has = (p) => Boolean(p) && Object.hasOwn(detail.authored ?? {}, p);
  const parts = detail.structure?.parts ?? [];
  const chars = detail.structure?.characters ?? [];
  const path = (p) => (has(p) ? p : null);
  const shared = path('partsKnowledge');
  const byCharacter = chars.length > 0 && chars.every((c) => has(`characters.${idOf(c)}.label`));
  if (byCharacter) {
    return chars.map((c) => {
      const id = idOf(c);
      const own = (key) => path(`characters.${id}.${key}`);
      return {
        id, kind: 'character', chatId: id, partId: null, role: null, fallbackName: c?.name || id, nameShown: own('name'),
        label: own('label'), introduction: own('introduction'), quickQuestion: own('quickQuestion'),
        ownKnowledge: own('knowledge'), partKnowledge: null, debrief: [], extra: [],
      };
    });
  }
  return parts.map((part, i) => {
    const own = (key) => path(`parts.${part.id}.${key}`);
    const player = chars[i] ?? chars[0] ?? null; // who plays this part in the test chat
    return {
      id: part.id, kind: 'part', chatId: idOf(player) ?? null, partId: part.id, role: part.role ?? null, fallbackName: player?.name || '', nameShown: null,
      label: own('label'), introduction: own('introduction'), quickQuestion: own('quickQuestion'),
      ownKnowledge: null, partKnowledge: own('knowledge') ?? shared, debrief: [], extra: [],
    };
  });
}

const promptPaths = (a) => [a.label, a.ownKnowledge, a.partKnowledge, a.introduction, a.quickQuestion].filter(Boolean);
const actorPaths = (a) => [...promptPaths(a), ...a.debrief, ...a.extra];

/**
 * Every editable path placed exactly once: the story, the names, one actor page (all the text about it),
 * or a named group for the rest.
 */
export function layoutOf(detail) {
  const order = (detail.order ?? Object.keys(detail.authored ?? {})).filter((p) => Object.hasOwn(detail.authored ?? {}, p));
  const actors = actorsOf(detail);
  const names = order.filter((p) => /^characters\.[^.]+\.name$/.test(p));
  const rules = order.includes('rules') ? 'rules' : null;
  const taken = new Set([...names, ...actors.flatMap(promptPaths), ...(rules ? [rules] : [])]);
  const story = order.filter((p) => p === 'title' || p.startsWith('copy.'));
  const groups = []; // { key, title, paths, role? }
  for (const p of order) {
    if (taken.has(p) || story.includes(p)) continue;
    const r = routeOf(p, detail.structure);
    const owner = actors.find((a) => r.key === `${a.kind}:${a.id}`);
    if (owner) { (/^parts\.[^.]+\.finding\./.test(p) ? owner.debrief : owner.extra).push(p); continue; }
    let g = groups.find((x) => x.key === r.key);
    if (!g) {
      const part = (detail.structure?.parts ?? []).find((x) => r.key === `part:${x.id}`);
      groups.push(g = { key: r.key, title: p === 'partsKnowledge' ? 'Facts everyone knows' : r.title, paths: [], ...(part?.role ? { role: part.role } : {}) });
    }
    g.paths.push(p);
  }
  return { story, names, rules, actors, groups };
}

export function mountMaker(doc, { api, caseId = null, confirm = (m) => window.confirm(m) } = {}) {
  const $ = (id) => doc.getElementById(id);
  let cases = [];
  let id = null;
  let detail = null;
  let layout = null;
  let model = new Map(); // path -> working value
  let bound = new Map(); // path -> { node, error }
  let section = 'story'; // 'story' | 'actor:<id>' | a group key
  let pageId = null; // id of the actor page last opened; its player is the one in the test chat
  let chatTimer = null;

  const chat = createChat(doc, {
    api,
    getEdits: () => overlay() || {},
    getCaseId: () => id,
    onFieldError: (path, msg) => fieldError(path, msg),
  });

  const clear = (node) => { node.textContent = ''; };
  const get = (path) => model.get(path);
  const text = (path) => (Array.isArray(get(path)) ? linesText(get(path)) : String(get(path) ?? ''));
  const overlay = () => {
    const out = {};
    for (const [p, v] of model) if (!same(v, detail.authored[p])) out[p] = v;
    return Object.keys(out).length ? out : null;
  };
  const dirtyPaths = () => [...model].filter(([p, v]) => !same(v, detail.current[p])).map(([p]) => p);
  function setStatus() {
    const n = detail ? dirtyPaths().length : 0;
    const flags = [
      detail?.stale ? 'Stale: the last revision no longer fits this case version, so the authored text is shown' : null,
      detail?.corrupt ? 'History file has an unreadable line; the readable revisions were kept' : null,
    ].filter(Boolean);
    $('status').textContent = n ? 'Unsaved changes' : (flags.join(' · ') || 'Up to date');
    $('status').dataset.state = n ? 'unsaved' : (flags.length ? 'bad' : 'ok');
    $('dirty-count').textContent = n === 0 ? '' : n === 1 ? '1 unsaved change' : `${n} unsaved changes`;
    renderNavSoon();
  }
  const showError = (message) => { $('status').textContent = message; $('status').dataset.state = 'bad'; };

  // ---- one bound input -------------------------------------------------------------------------
  const mark = (node, path) => {
    node.classList.toggle('unsaved', !same(get(path), detail.current[path]));
  };
  /** kind: 'text' | 'lines' (one item per line). */
  function bind(node, path, kind = Array.isArray(detail.authored[path]) ? 'lines' : 'text') {
    node.dataset.path = path;
    node.value = text(path);
    mark(node, path);
    node.addEventListener('input', () => {
      model.set(path, kind === 'lines' ? knowledgeLines(node.value) : node.value);
      mark(node, path);
      const b = bound.get(path);
      if (b?.error) { b.error.textContent = ''; b.error.hidden = true; }
      setStatus();
      if (/\.(name|label)$/.test(path)) namesChanged();
    });
    return node;
  }

  function namesChanged() {
    renderNav();
    for (const n of doc.querySelectorAll('[data-live]')) n.textContent = liveText(n.dataset.live);
    if (chatTimer === null) chatTimer = setTimeout(() => { chatTimer = null; chat.refresh(); }, 150);
  }

  /** A labelled textarea, as in the story section. */
  function field(parent, path, { label, hint, kind } = {}) {
    const copy = fieldCopy(path);
    const wrap = el(doc, 'div', 'field', { parent });
    const lab = el(doc, 'label', 'field-label', { text: label ?? copy.label, parent: wrap });
    lab.title = path;
    const h = hint ?? copy.hint;
    if (h) el(doc, 'p', 'field-hint', { text: h, parent: wrap });
    const area = bind(el(doc, 'textarea', 'field-input', { parent: wrap }), path, kind);
    const error = el(doc, 'div', 'field-error', { parent: wrap });
    error.hidden = true;
    bound.set(path, { node: area, error });
    return wrap;
  }

  // ---- story -----------------------------------------------------------------------------------
  function heading(root, title, role) {
    const h = el(doc, 'h2', 'section-title', { parent: root });
    const name = el(doc, 'span', 'section-name', { text: title, parent: h });
    if (role) {
      const badge = el(doc, 'span', 'badge role-badge', { text: role, parent: h });
      badge.title = 'The answer the player is scored against. It is never sent to the model.';
    }
    return name;
  }
  function renderFields(root, title, paths) {
    heading(root, title);
    for (const p of paths) field(root, p);
  }

  // ---- side panel ------------------------------------------------------------------------------
  let navTimer = null;
  function renderNavSoon() {
    if (navTimer !== null) return;
    navTimer = setTimeout(renderNav, 120);
  }
  function renderNav() {
    if (navTimer !== null) { clearTimeout(navTimer); navTimer = null; }
    const nav = $('sections');
    if (!nav || !layout) return;
    clear(nav);
    const isDirty = (paths) => paths.some((p) => !same(get(p), detail.current[p]));
    const item = (key, title, { role, dirty } = {}) => {
      const b = el(doc, 'button', 'nav-item', { parent: nav });
      b.type = 'button';
      b.dataset.section = key;
      el(doc, 'span', 'nav-title', { text: title, parent: b });
      if (role) el(doc, 'span', 'badge role-badge', { text: role, parent: b });
      if (dirty) el(doc, 'span', 'dot', { parent: b });
      if (key === section) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => selectSection(key));
    };
    if (hasStory()) item('story', 'Story', { dirty: isDirty([...layout.story, ...layout.names]) });
    for (const a of layout.actors) item(`actor:${a.id}`, titleOf(a), { role: a.role, dirty: isDirty(actorPaths(a)) });
    if (layout.rules) item('rules', 'Rules for all actors', { dirty: isDirty([layout.rules]) });
    for (const g of layout.groups) item(g.key, g.title, { role: g.role, dirty: isDirty(g.paths) });
    item('history', 'History');
  }

  const hasStory = () => layout.story.length + layout.names.length > 0;
  // The game text document has no story: it opens on its first group.
  const firstSection = () => (hasStory() ? 'story' : layout.groups[0]?.key ?? 'history');

  function selectSection(key) {
    const known = (key === 'story' && hasStory()) || key === 'history' || (key === 'rules' && layout.rules) || layout.groups.some((g) => g.key === key) || layout.actors.some((a) => `actor:${a.id}` === key);
    section = known ? key : firstSection();
    const root = $('section');
    clear(root);
    root.oninput = null;
    bound = new Map();
    root.dataset.section = section;
    // The test chat belongs to an actor: it shows only while an actor page is open.
    if ($('panel')) $('panel').hidden = !section.startsWith('actor:');
    if (section === 'story') { renderFields(root, 'Story', layout.story); renderNames(root); }
    else if (section.startsWith('actor:')) {
      pageId = section.slice('actor:'.length);
      renderActor(root);
      const sel = $('character');
      const who = actor()?.chatId;
      if (sel && who && sel.value !== who) {
        sel.value = who;
        sel.dispatchEvent(new Event('change'));
        chat.hidePrompt();
      }
    } else if (section === 'rules') renderRules(root);
    else if (section === 'history') renderHistory(root);
    else {
      const g = layout.groups.find((x) => x.key === section);
      renderFields(root, g.title, g.paths);
    }
    renderNav();
    setStatus();
  }

  // ---- actors ----------------------------------------------------------------------------------
  const actor = () => layout.actors.find((a) => a.id === pageId) ?? layout.actors[0] ?? null;
  const characterName = (cid) => text(`characters.${cid}.name`) || cid || '';
  const nameOf = (a) => (a.chatId ? characterName(a.chatId) : '') || a.fallbackName;
  const partOf = (a) => (a.label ? text(a.label) : '') || a.partId || '';
  // Parts that share a label (five "Friend"s) are told apart by their id.
  const titleOf = (a) => {
    if (a.kind !== 'part') return `${nameOf(a)}${partOf(a) ? ' · ' + partOf(a) : ''}`;
    const twin = layout.actors.some((o) => o !== a && partOf(o) === partOf(a));
    return twin && a.partId !== partOf(a) ? `${partOf(a)} · ${a.partId}` : partOf(a);
  };
  const liveText = (key) => {
    const a = actor();
    if (!a) return '';
    if (key === 'own') return `What ${nameOf(a)} always knows`;
    if (key === 'part') return a.partKnowledge === 'partsKnowledge' ? 'What every part knows' : `What ${partOf(a) || 'this part'} knows`;
    if (key === 'head') return titleOf(a);
    if (key === 'name') return nameOf(a);
    if (key === 'chat') return `The names are dealt to the parts at random each game. In the test chat this part is played by ${nameOf(a)}.`;
    return '';
  };

  /** The cast's names, in the story: any of them can end up with any part. */
  function renderNames(root) {
    if (!layout.names.length) return;
    el(doc, 'h3', 'sub-title', { text: 'Names', parent: root });
    el(doc, 'p', 'field-hint', { parent: root, text: `The ${layout.names.length} characters of this story. Each game deals the parts to them at random, so a name is not tied to a part.` });
    const row = el(doc, 'div', 'names', { parent: root });
    const error = el(doc, 'div', 'field-error', { parent: root });
    error.hidden = true;
    layout.names.forEach((p, i) => {
      const input = bind(el(doc, 'input', 'name-input', { parent: row }), p, 'text');
      input.type = 'text';
      input.setAttribute('aria-label', `Name ${i + 1}`);
      input.title = p;
      bound.set(p, { node: input, error });
    });
  }

  // ---- one actor: a name and one text box --------------------------------------------------------
  /** The big text box: plain text, grows with what is typed. */
  function bigBox(parent, hint) {
    if (hint) el(doc, 'p', 'field-hint', { text: hint, parent });
    const area = el(doc, 'textarea', 'big-box', { parent });
    area.spellcheck = true;
    return area;
  }

  function renderActor(root) {
    const a = actor();
    if (!a) return;
    heading(root, liveText('head'), a.role).dataset.live = 'head';
    const error = el(doc, 'div', 'field-error', {});
    error.hidden = true;
    if (a.label) {
      const row = el(doc, 'label', 'name-row', { parent: root });
      el(doc, 'span', 'field-label', { text: 'Name', parent: row });
      row.title = a.kind === 'part' ? 'Players do not see this name while the game is open.' : 'Players see this under the character\'s name.';
      const input = bind(el(doc, 'input', 'name-input', { parent: row }), a.label, 'text');
      input.type = 'text';
      input.title = a.label;
      bound.set(a.label, { node: input, error });
    }
    const facts = a.ownKnowledge ?? a.partKnowledge;
    if (facts) {
      const tags = (detail.structure?.placeholders ?? []).join(' ');
      const who = a.kind === 'part' ? 'whoever is dealt this part' : nameOf(a);
      const area = bigBox(root, `Who this actor is and what they know. It is told to ${who}, in the one-to-one chat and in the group thread alike. One fact per line.${tags ? ` Name tags: ${tags}.` : ''}`);
      bind(area, facts, 'lines');
      area.title = facts;
      bound.set(facts, { node: area, error });
    }
    root.appendChild(error);
    if (a.kind === 'character') el(doc, 'p', 'field-hint', { parent: root, text: 'In a game the facts of the part this character is dealt are added. They are on the Part pages in the side panel.' });
    const sub = (title, paths) => {
      if (!paths.length) return;
      el(doc, 'h3', 'sub-title', { text: title, parent: root });
      for (const p of paths) field(root, p);
    };
    sub('Shown to the player, not part of the prompt', [a.introduction, a.quickQuestion].filter(Boolean));
    sub('In the debrief', a.debrief);
    if (a.extra.length) {
      const more = el(doc, 'details', 'more-group', { parent: root });
      const sum = el(doc, 'summary', null, { text: 'More text for this actor', parent: more });
      el(doc, 'span', 'muted', { text: ` · ${a.extra.length}`, parent: sum });
      for (const p of a.extra) field(more, p);
    }
  }

  // ---- the rules every actor of this game gets --------------------------------------------------
  function renderRules(root) {
    heading(root, 'Rules for all actors');
    const area = bigBox(root, 'Every actor in this game gets this text, in the one-to-one chat and in the group thread alike. Other games have their own. [[name]] becomes the actor\'s name, [[label]] its Name field, and [[knowledge]] the actor\'s own text box; [[knowledge]] must stay, once.');
    bind(area, layout.rules, 'text');
    area.spellcheck = false;
    const error = el(doc, 'div', 'field-error', { parent: root });
    bound.set(layout.rules, { node: area, error });
    const check = () => { const p = templateProblem('interview', area.value); error.textContent = p ?? ''; error.hidden = !p; };
    check();
    area.addEventListener('input', check);
  }

  // ---- history ---------------------------------------------------------------------------------
  function renderHistory(root) {
    heading(root, 'History');
    el(doc, 'p', 'field-hint', { parent: root, text: 'Every publish of this text. Restore brings a version back as a new revision.' });
    const ol = el(doc, 'ol', 'history', { parent: root });
    ol.id = 'history';
    const row = (label, rev) => {
      const li = el(doc, 'li', null, { parent: ol });
      el(doc, 'span', 'rev-text', { text: label, parent: li });
      const b = el(doc, 'button', 'restore', { text: 'Restore', parent: li });
      b.type = 'button';
      b.addEventListener('click', () => restore(rev));
    };
    row('As first written', 0);
    for (const h of detail.history || []) {
      const when = typeof h.timestamp === 'string' ? h.timestamp.slice(0, 16).replace('T', ' ') + ' UTC' : '';
      row(`rev ${h.rev} · ${h.by ?? 'unknown'} · ${when} · ${(h.fields || []).join(', ')}`, h.rev);
    }
  }

  async function restore(rev) {
    if (dirtyPaths().length && !confirm('Discard unsaved changes?')) return;
    const note = $('publish-note');
    note.textContent = '';
    try {
      await api(`/admin/content/${id}/revert`, { rev });
      await fetchDetail();
      note.textContent = `Restored rev ${rev}; now rev ${detail.rev}`;
      cases = (await api('/admin/content')).cases || cases;
      renderCases();
    } catch (err) {
      note.textContent = err.message;
    }
  }

  // ---- errors ----------------------------------------------------------------------------------
  function fieldError(path, message) {
    const owner = layout?.actors.find((a) => actorPaths(a).includes(path));
    const group = layout?.groups.find((g) => g.paths.includes(path));
    const want = owner ? `actor:${owner.id}` : group ? group.key : path === layout?.rules ? 'rules' : layout?.story.includes(path) || layout?.names.includes(path) ? 'story' : null;
    if (want && want !== section) selectSection(want);
    const b = bound.get(path);
    if (!b) { $('publish-note').textContent = `${path}: ${message}`; return; }
    b.error.textContent = message;
    b.error.hidden = false;
    for (let n = b.node.parentElement; n; n = n.parentElement) if (n.tagName === 'DETAILS') n.open = true;
    b.node.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    b.node.focus?.();
  }

  // ---- loading and saving ----------------------------------------------------------------------
  function renderCases() {
    const sel = $('case-select');
    clear(sel);
    for (const c of [...cases.filter((x) => x.id !== GAME), ...cases.filter((x) => x.id === GAME)]) {
      const o = el(doc, 'option', null, { text: `${c.title}${c.rev ? ' · rev ' + c.rev : ''}${c.stale ? ' · stale' : ''}`, parent: sel });
      o.value = c.id;
    }
    if (id) sel.value = id;
  }

  function show(next) {
    detail = next;
    layout = layoutOf(detail);
    model = new Map(Object.keys(detail.authored).map((p) => [p, detail.current[p]]));
    if (!layout.actors.some((a) => a.id === pageId)) pageId = layout.actors[0]?.id ?? null;
    if (detail.id !== GAME) chat.setDetail(detail);
    if (actor()?.chatId && $('character')) $('character').value = actor().chatId;
    selectSection(section);
  }

  async function fetchDetail() {
    const want = id;
    const next = await api(`/admin/content/${want}`);
    if (want !== id) return;
    show(next);
  }

  async function load() {
    cases = (await api('/admin/content')).cases || [];
    id = (cases.find((c) => c.id === caseId) || cases.find((c) => c.id !== GAME) || cases[0] || {}).id ?? null;
    renderCases();
    if (id) await fetchDetail();
  }

  async function select(next) {
    if (detail && dirtyPaths().length && !confirm('Discard unsaved changes?')) return;
    id = next;
    pageId = null;
    section = 'story';
    chat.hidePrompt();
    $('publish-note').textContent = '';
    renderCases();
    await fetchDetail();
  }

  let publishing = false;
  async function publish() {
    if (publishing || !detail) return;
    publishing = true;
    const note = $('publish-note');
    note.textContent = '';
    for (const b of bound.values()) { b.error.textContent = ''; b.error.hidden = true; }
    if (!dirtyPaths().length) { note.textContent = 'Nothing to publish.'; publishing = false; return; }
    try {
      await api(`/admin/content/${id}`, { edits: overlay() || {}, baseRev: detail.rev }, 'PUT');
      await fetchDetail();
      note.textContent = `Published rev ${detail.rev} by ${detail.by}`;
      cases = (await api('/admin/content')).cases || cases;
      renderCases();
    } catch (err) {
      if (err.status === 409) note.textContent = `Changed meanwhile${err.body?.rev !== undefined ? `: rev ${err.body.rev} by ${err.body.by}` : ''}. Reload.`;
      else if (err.path && Object.hasOwn(detail.authored, err.path)) fieldError(err.path, err.message);
      else note.textContent = err.path ? `${err.path}: ${err.message}` : err.message;
    } finally {
      publishing = false;
    }
  }

  $('publish').addEventListener('click', publish);
  $('case-select').addEventListener('change', () => {
    const next = $('case-select').value;
    if (next === id) return;
    select(next).catch((err) => showError(err.message)).finally(() => { $('case-select').value = id; });
  });
  doc.defaultView?.addEventListener('beforeunload', (e) => { if (detail && dirtyPaths().length) e.preventDefault(); });

  return { load, select, publish, restore };
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
  const app = mountMaker(document, { api, caseId: new URLSearchParams(window.location.search).get('case') });
  const go = () => app.load().catch((err) => { $('status').textContent = err.message; $('status').dataset.state = 'bad'; });
  mountSignIn(document, { onSignedIn: go });
}

if (typeof document !== 'undefined') start();
