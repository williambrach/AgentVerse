// The maker's editing form. One textarea per editable path; text goes in and out through
// textContent and value only, so nothing a maker types is ever parsed as markup.
import { el } from './dom.js';

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

  const field = (parent, path, label) => {
    const wrap = el(doc, 'div', 'field', { parent });
    el(doc, 'label', 'field-label', { text: label, parent: wrap });
    const area = el(doc, 'textarea', 'field-input', { parent: wrap });
    area.dataset.path = path;
    area.value = toText(d.current[path]);
    const marker = el(doc, 'span', 'differs', { text: 'edited', parent: wrap });
    const reset = el(doc, 'button', 'reset', { text: 'Authored', parent: marker });
    reset.type = 'button';
    const error = el(doc, 'div', 'field-error', { parent: wrap });
    error.hidden = true;
    fields.set(path, { area, marker, error });
    refresh(path);
    area.addEventListener('input', () => { refresh(path); onChange(handle); });
    reset.addEventListener('click', () => {
      area.value = toText(d.authored[path]);
      refresh(path);
      onChange(handle);
    });
  };

  const build = () => {
    root.textContent = '';
    fields = new Map();
    const keys = Object.keys(d.authored);
    const section = (cls, title) => {
      const s = el(doc, 'section', cls, { parent: root });
      el(doc, 'h3', 'section-title', { text: title, parent: s });
      return s;
    };
    const rest = prefix => keys.filter(k => k.startsWith(prefix));

    const prompt = section('prompt', 'Prompt');
    for (const k of rest('prompt.')) field(prompt, k, k.slice('prompt.'.length));

    const names = (d.structure?.placeholders ?? []);
    const legend = el(doc, 'p', 'placeholders', { parent: root });
    legend.textContent = `${names.join(' ')} (names are dealt per session)`;
    for (const part of d.structure?.parts ?? []) {
      const set = el(doc, 'fieldset', 'part', { parent: root });
      el(doc, 'legend', null, { text: `${d.current[`parts.${part.id}.label`] ?? part.id} · ${part.role}`, parent: set });
      el(doc, 'span', 'role-badge', { text: part.role, parent: set });
      for (const name of PART_FIELDS) {
        const path = `parts.${part.id}.${name}`;
        if (path in d.authored) field(set, path, name);
      }
    }

    const copy = section('copy', 'Copy');
    for (const k of rest('copy.')) field(copy, k, k.slice('copy.'.length));
    const debrief = section('debrief', 'Debrief');
    for (const k of [...rest('debrief.'), ...rest('answer.')]) field(debrief, k, k);
  };

  const handle = {
    root, values, overlay, dirty,
    setDetail(next) { d = next; build(); },
    setError(path, message) {
      handle.clearErrors();
      const f = fields.get(path);
      if (!f) return;
      f.error.textContent = message;
      f.error.hidden = false;
    },
    clearErrors() {
      for (const f of fields.values()) { f.error.textContent = ''; f.error.hidden = true; }
    },
  };
  build();
  return handle;
}
