// The maker's editing form. One textarea per editable path; text goes in and out through
// textContent and value only, so nothing a maker types is ever parsed as markup.
import { el, isNum } from './dom.js';
import { fieldCopy } from './maker-copy.js';

/** Textarea text to a list: one item per line, trimmed, empty lines dropped. */
export function knowledgeLines(text) {
  return String(text ?? '').split('\n').map(s => s.trim()).filter(Boolean);
}

/** A list to textarea text: one item per line. */
export function linesText(items) {
  return (items ?? []).join('\n');
}

const PART_FIELDS = ['label', 'introduction', 'quickQuestion', 'knowledge', 'finding.classification', 'finding.explanation'];
const same = (a, b) => (Array.isArray(a) || Array.isArray(b)
  ? Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])
  : a === b);
const toText = v => (Array.isArray(v) ? linesText(v) : String(v ?? ''));

export function renderForm(root, detail, { onChange = () => {} } = {}) {
  let d = detail;
  let fields = new Map(); // path -> { area, marker, error }
  const doc = root.ownerDocument;

  const read = path => {
    const f = fields.get(path);
    return Array.isArray(d.authored[path]) ? knowledgeLines(f.area.value) : f.area.value;
  };
  const paths = () => [...fields.keys()];
  const values = () => Object.fromEntries(paths().map(p => [p, read(p)]));
  const overlayOf = (get) => {
    const out = {};
    for (const p of paths()) if (!same(get(p), d.authored[p])) out[p] = get(p);
    return out;
  };
  const overlay = () => {
    const o = overlayOf(read);
    return Object.keys(o).length ? o : null;
  };
  const dirty = () => JSON.stringify(overlayOf(read)) !== JSON.stringify(overlayOf(p => d.current[p]));

  const refresh = path => {
    const f = fields.get(path);
    f.marker.hidden = same(read(path), d.authored[path]);
  };

  const grow = area => {
    if (!area.style || !isNum(area.scrollHeight)) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight + 2}px`;
  };

  const field = (parent, path) => {
    const copy = fieldCopy(path);
    const wrap = el(doc, 'div', 'field', { parent });
    const label = el(doc, 'label', 'field-label', { text: copy.label, parent: wrap });
    label.title = path;
    el(doc, 'p', 'field-hint', { text: copy.hint, parent: wrap });
    const area = el(doc, 'textarea', 'field-input', { parent: wrap });
    area.dataset.path = path;
    area.value = toText(d.current[path]);
    const marker = el(doc, 'span', 'differs', { text: 'edited', parent: wrap });
    const reset = el(doc, 'button', 'reset', { text: 'Authored', parent: marker });
    reset.type = 'button';
    const error = el(doc, 'div', 'field-error', { parent: wrap });
    error.hidden = true;
    fields.set(path, { area, marker, error, section: current });
    refresh(path);
    grow(area);
    area.addEventListener('input', () => { refresh(path); grow(area); onChange(handle); });
    reset.addEventListener('click', () => {
      area.value = toText(d.authored[path]);
      refresh(path);
      grow(area);
      onChange(handle);
    });
  };

  let current = null;
  let shown = null;
  let secs = []; // { key, title, role?, node }

  const sameAsPublished = p => same(read(p), d.current[p]);
  const dirtySections = () => {
    const out = [];
    for (const s of secs) {
      for (const [p, f] of fields) if (f.section === s.key && !sameAsPublished(p)) { out.push(s.key); break; }
    }
    return out;
  };
  const dirtyCount = () => paths().filter(p => !sameAsPublished(p)).length;

  const show = key => {
    const target = secs.find(s => s.key === key) ?? secs[0];
    if (!target) return;
    shown = target.key;
    for (const s of secs) s.node.hidden = s !== target;
    for (const f of fields.values()) if (f.section === shown) grow(f.area);
  };

  const build = () => {
    root.textContent = '';
    fields = new Map();
    secs = [];
    const keys = Object.keys(d.authored);
    const tags = (d.structure?.placeholders ?? []).join(' ');
    const section = (key, title, role) => {
      const node = el(doc, 'section', 'form-section', { parent: root });
      node.dataset.section = key;
      const h = el(doc, 'h2', 'section-title', { text: title, parent: node });
      if (role) el(doc, 'span', 'badge role-badge', { text: role, parent: h });
      secs.push({ key, title, ...(role ? { role } : {}), node });
      current = key;
      return node;
    };
    const legend = node => el(doc, 'p', 'placeholders', {
      text: `Name tags: ${tags}. Each becomes the name of the character dealt that part in a session.`, parent: node,
    });
    const pick = prefix => keys.filter(k => k.startsWith(prefix));

    const story = section('story', 'Story');
    for (const k of pick('copy.')) field(story, k);

    const prompt = section('prompt', 'Prompt');
    legend(prompt);
    for (const k of pick('prompt.')) field(prompt, k);

    for (const part of d.structure?.parts ?? []) {
      const node = section(`part:${part.id}`, d.current[`parts.${part.id}.label`] ?? part.id, part.role);
      legend(node);
      for (const name of PART_FIELDS) {
        const path = `parts.${part.id}.${name}`;
        if (path in d.authored) field(node, path);
      }
    }

    const debrief = section('debrief', 'Debrief');
    for (const k of [...pick('debrief.'), ...pick('answer.')]) field(debrief, k);
    show(shown);
  };

  const handle = {
    root, values, overlay, dirty, dirtySections, dirtyCount, show,
    sections: () => secs.map(({ key, title, role }) => (role ? { key, title, role } : { key, title })),
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
