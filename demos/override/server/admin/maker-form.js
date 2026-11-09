// The editing form. One textarea per editable path, laid out in sections; text goes in and out
// through textContent and value only, so nothing an admin types is ever parsed as markup.
import { el, isNum } from './dom.js';
import { fieldCopy, routeOf, sectionKeys } from './maker-copy.js';

/** Textarea text to a list: one item per line, trimmed, empty lines dropped. */
export function knowledgeLines(text) {
  return String(text ?? '').split('\n').map(s => s.trim()).filter(Boolean);
}

/** A list to textarea text: one item per line. */
export function linesText(items) {
  return (items ?? []).join('\n');
}

const TOKENS = ['name', 'label', 'setting', 'version', 'promptVersion', 'frame', 'frameFirst', 'use', 'avoid', 'persona', 'memory', 'knowledge'];
const TEMPLATE_TOKENS = {
  'prompt.interview': TOKENS,
  'prompt.thread': [...TOKENS, 'others'],
};
const same = (a, b) => (Array.isArray(a) || Array.isArray(b)
  ? Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])
  : a === b);
const toText = v => (Array.isArray(v) ? linesText(v) : String(v ?? ''));
const idOf = x => (typeof x === 'string' ? x : x?.id);

export function renderForm(root, detail, { onChange = () => {} } = {}) {
  let d = detail;
  let fields = new Map(); // path -> { area, marker, error, wrap, section, hay }
  let secs = []; // { key, title, node, titleEl, role? }
  let dirtyPaths = new Set();
  let shown = null;
  let query = '';
  const doc = root.ownerDocument;

  const read = path => {
    const f = fields.get(path);
    return Array.isArray(d.authored[path]) ? knowledgeLines(f.area.value) : f.area.value;
  };
  const paths = () => [...fields.keys()];
  const values = () => Object.fromEntries(paths().map(p => [p, read(p)]));
  const overlay = () => {
    const out = {};
    for (const p of paths()) {
      const v = read(p);
      if (!same(v, d.authored[p])) out[p] = v;
    }
    return Object.keys(out).length ? out : null;
  };
  const isDirty = p => !same(read(p), d.current[p]);

  const refresh = path => {
    fields.get(path).marker.hidden = same(read(path), d.authored[path]);
    if (isDirty(path)) dirtyPaths.add(path); else dirtyPaths.delete(path);
  };

  const grow = area => {
    if (!area.style || !isNum(area.scrollHeight) || !area.scrollHeight) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight + 2}px`;
  };

  const legend = (node, text, cls) => el(doc, 'p', cls, { text, parent: node });

  const field = (parent, path, key) => {
    const copy = fieldCopy(path);
    const template = path in TEMPLATE_TOKENS;
    const wrap = el(doc, 'div', 'field', { parent });
    const label = el(doc, 'label', 'field-label', { text: copy.label, parent: wrap });
    label.title = path;
    el(doc, 'span', 'field-path', { text: path, parent: label });
    if (copy.hint) el(doc, 'p', 'field-hint', { text: copy.hint, parent: wrap });
    if (template) {
      legend(wrap, `Slots: ${TEMPLATE_TOKENS[path].map(t => `[[${t}]]`).join(' ')}. [[knowledge]] must appear exactly once.`, 'token-legend');
    }
    const area = el(doc, 'textarea', template ? 'field-input mono' : 'field-input', { parent: wrap });
    area.dataset.path = path;
    area.value = toText(d.current[path]);
    const marker = el(doc, 'span', 'differs', { text: 'edited', parent: wrap });
    const reset = el(doc, 'button', 'reset', { text: 'Authored', parent: marker });
    reset.type = 'button';
    const error = el(doc, 'div', 'field-error', { parent: wrap });
    error.hidden = true;
    fields.set(path, { area, marker, error, wrap, section: key, hay: `${path} ${copy.label}`.toLowerCase() });
    refresh(path);
    area.addEventListener('input', () => { refresh(path); grow(area); if (query) applyFilter(); onChange(handle); });
    reset.addEventListener('click', () => {
      area.value = toText(d.authored[path]);
      refresh(path);
      grow(area);
      if (query) applyFilter();
      onChange(handle);
    });
  };

  // The structure with the names and labels as they are typed right now.
  const liveStructure = () => {
    const s = d.structure ?? {};
    const live = (path, fallback) => (fields.has(path) ? read(path) : d.current[path]) || fallback;
    return {
      ...s,
      characters: (s.characters ?? []).map(c => ({ id: idOf(c), name: live(`characters.${idOf(c)}.name`, c?.name) })),
      parts: (s.parts ?? []).map(p => ({ ...p, label: live(`parts.${p.id}.label`, p.label) })),
    };
  };

  function applyFilter() {
    const q = query.trim().toLowerCase();
    for (const [p, f] of fields) {
      f.wrap.hidden = !!q && !(f.hay.includes(q) || toText(read(p)).toLowerCase().includes(q));
    }
    show(shown);
  }
  const visibleCount = s => {
    let n = 0;
    for (const f of fields.values()) if (f.section === s.key && !f.wrap.hidden) n++;
    return n;
  };
  const listed = () => (query.trim() ? secs.filter(s => visibleCount(s) > 0) : secs);

  function show(key) {
    const target = secs.find(s => s.key === key) ?? listed()[0] ?? secs[0];
    if (!target) return;
    shown = target.key;
    const all = !!query.trim();
    for (const s of secs) {
      s.node.hidden = all ? visibleCount(s) === 0 : s !== target;
      if (!s.node.hidden) for (const f of fields.values()) if (f.section === s.key) grow(f.area);
    }
  }

  const sectionOfPath = new Map();
  function build() {
    root.textContent = '';
    fields = new Map();
    secs = [];
    dirtyPaths = new Set();
    sectionOfPath.clear();
    const order = d.order ?? Object.keys(d.authored);
    const structure = liveStructure();
    const groups = new Map(); // key -> { title, paths }
    for (const p of order) {
      if (!(p in d.authored)) continue;
      const r = routeOf(p, structure);
      if (!groups.has(r.key)) groups.set(r.key, { title: r.title, paths: [] });
      groups.get(r.key).paths.push(p);
    }
    const canon = sectionKeys(structure);
    const keys = [
      ...canon.filter(k => groups.has(k)),
      ...[...groups.keys()].filter(k => !canon.includes(k) && k !== 'other'),
      ...(groups.has('other') ? ['other'] : []),
    ];
    const tags = (d.structure?.placeholders ?? []).join(' ');
    for (const key of keys) {
      const g = groups.get(key);
      const node = el(doc, 'section', 'form-section', { parent: root });
      node.dataset.section = key;
      const h = el(doc, 'h2', 'section-title', { parent: node });
      const titleEl = el(doc, 'span', 'section-name', { text: g.title, parent: h });
      const part = (d.structure?.parts ?? []).find(p => `part:${p.id}` === key);
      if (part?.role) el(doc, 'span', 'badge role-badge', { text: part.role, parent: h });
      if (tags && (key === 'prompt' || part)) {
        legend(node, `Name tags: ${tags}. Each becomes the name of the character dealt that part in a session.`, 'placeholders');
      }
      secs.push({ key, title: g.title, node, titleEl, ...(part?.role ? { role: part.role } : {}) });
      for (const p of g.paths) { sectionOfPath.set(p, key); field(node, p, key); }
    }
    query = '';
    show(shown);
  }

  const dirtySections = () => [...new Set([...dirtyPaths].map(p => fields.get(p).section))];

  const handle = {
    root, values, overlay,
    dirty: () => dirtyPaths.size > 0,
    dirtySections,
    dirtyCount: () => dirtyPaths.size,
    show,
    shownKey: () => shown,
    sections() {
      const s = liveStructure();
      return listed().map(sec => {
        const first = [...fields.entries()].find(([, f]) => f.section === sec.key)?.[0];
        const title = first && sec.key !== 'other' ? routeOf(first, s).title : sec.title;
        if (title !== sec.title) { sec.title = title; sec.titleEl.textContent = title; }
        return { key: sec.key, title, ...(sec.role ? { role: sec.role } : {}) };
      });
    },
    setFilter(text) { query = String(text ?? ''); applyFilter(); },
    filter: () => query,
    setDetail(next) { d = next; build(); },
    setError(path, message) {
      handle.clearErrors();
      const f = fields.get(path);
      if (!f) return null;
      f.error.textContent = message;
      f.error.hidden = false;
      return f.section;
    },
    clearErrors() {
      for (const f of fields.values()) { f.error.textContent = ''; f.error.hidden = true; }
    },
  };
  build();
  return handle;
}
