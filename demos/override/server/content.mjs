import { mkdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { defineCase } from './cases.mjs';
import { appendJsonl, readJsonl } from './dataset.mjs';
import { worlds as liveWorlds } from './worlds.mjs';

const MAX_TEXT = 2000;
const PART_FIELDS = ['label', 'introduction', 'quickQuestion', 'knowledge', 'finding.classification', 'finding.explanation'];
const LISTS = new Set(['prompt.use', 'prompt.avoid']);

export class ContentError extends Error {
  constructor(status, message, path = null) {
    super(message);
    this.name = 'ContentError';
    this.status = status;
    this.path = path;
  }
}

export function editablePaths(kase) {
  return [
    'copy.headline', 'copy.intro.lead', 'copy.intro.body',
    'copy.briefing.title', 'copy.briefing.description', 'copy.briefing.question', 'copy.briefing.hint',
    'copy.report.title', 'copy.report.description',
    'prompt.setting', 'prompt.use', 'prompt.avoid',
    ...kase.parts.flatMap(p => PART_FIELDS.map(f => `parts.${p.id}.${f}`)),
    'debrief.title', 'debrief.summary', 'debrief.lesson',
    'answer.feedback.correct', 'answer.feedback.other',
  ];
}

const isList = path => LISTS.has(path) || path.endsWith('.knowledge');

const clone = v => (Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortedJson = o => JSON.stringify(Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]])));

// Read a path out of a case; `parts.<id>.x.y` addresses the part by id.
function getAt(kase, path) {
  const segs = path.split('.');
  let node = kase;
  for (let i = 0; i < segs.length; i++) {
    if (segs[i] === 'parts' && i === 0) {
      node = kase.parts.find(p => p.id === segs[1]);
      i++;
    } else node = node?.[segs[i]];
  }
  return node;
}

function setAt(raw, path, value) {
  const segs = path.split('.');
  let node = raw;
  let i = 0;
  if (segs[0] === 'parts') { node = raw.parts.find(p => p.id === segs[1]); i = 2; }
  for (; i < segs.length - 1; i++) node = node[segs[i]];
  node[segs[segs.length - 1]] = value;
}

const rawOf = base => {
  const { contentHash, ...rest } = base; // eslint-disable-line no-unused-vars
  return { ...clone(rest), world: base.world.id, rehearsal: base.rehearsal, ...(base.rehearsalReasoning ? { rehearsalReasoning: base.rehearsalReasoning } : {}), ...(base.rehearsalChatter ? { rehearsalChatter: base.rehearsalChatter } : {}) };
};

// defineCase paths use indices (`parts[0].knowledge[2]`); map them back to edit paths.
const editPathOf = (base, path) => {
  const m = path.match(/^parts\[(\d+)\](?:\.(.*))?$/);
  if (m) {
    const id = base.parts[Number(m[1])]?.id;
    const rest = (m[2] ?? '').replace(/\[\d+\]/g, '');
    return id ? `parts.${id}${rest ? `.${rest}` : ''}` : path;
  }
  return path.replace(/\[\d+\]/g, '');
};

export function createContentStore({ cases, dataDir, worlds = liveWorlds, now = () => Date.now() }) {
  const dir = resolvePath(dataDir, 'content');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const order = cases.map(c => c.id);
  const states = new Map();

  const build = (base, edits) => {
    const raw = rawOf(base);
    for (const [path, value] of Object.entries(edits)) setAt(raw, path, clone(value));
    try { return defineCase(raw, { worlds }); } catch (error) {
      const m = /^case [^:]*: ([^:]+): (.*)$/s.exec(error.message);
      if (!m) throw error;
      throw new ContentError(400, m[2], editPathOf(base, m[1]));
    }
  };

  const validate = (base, edits) => {
    if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw new ContentError(400, 'Edits must be an object.', null);
    const allowed = new Set(editablePaths(base));
    const out = {};
    for (const [path, value] of Object.entries(edits)) {
      if (!allowed.has(path)) throw new ContentError(400, `Unknown field ${path}.`, path);
      const text = (s, where) => {
        if (typeof s !== 'string') throw new ContentError(400, 'Must be text.', where);
        if (s.length > MAX_TEXT) throw new ContentError(400, `Must be at most ${MAX_TEXT} characters.`, where);
      };
      if (isList(path)) {
        if (!Array.isArray(value)) throw new ContentError(400, 'Must be a list of text.', path);
        const max = path.endsWith('.knowledge') ? 20 : 30;
        const min = path.endsWith('.knowledge') ? 1 : 0;
        if (value.length < min || value.length > max) throw new ContentError(400, `Must hold ${min} to ${max} items.`, path);
        value.forEach(item => { text(item, path); if (!item.trim()) throw new ContentError(400, 'Items must not be empty.', path); });
      } else text(value, path);
      out[path] = clone(value);
    }
    const merged = {};
    for (const [path, value] of Object.entries(out)) if (!same(value, getAt(base, path))) merged[path] = value;
    build(base, merged);
    return Object.keys(merged).length ? merged : null;
  };

  const state = id => {
    const s = states.get(id);
    if (!s) throw new ContentError(404, 'Unknown case.');
    return s;
  };

  const effective = kase => Object.fromEntries(editablePaths(kase).map(p => [p, clone(getAt(kase, p))]));
  const changed = (before, after) => Object.keys(after).filter(p => !same(before[p], after[p]));

  let listCache = null;
  const rebuildList = () => { listCache = order.map(id => states.get(id).current); };

  for (const base of cases) {
    const s = { base, current: base, overlay: null, records: [], stale: false };
    states.set(base.id, s);
    let records = [];
    try { records = readJsonl(resolvePath(dir, `${base.id}.jsonl`), { repair: true }); } catch { records = []; }
    s.records = records.filter(r => r && r.type === 'content_revision' && r.version === base.version && Number.isInteger(r.rev));
    const last = s.records.at(-1);
    if (last) {
      try {
        const overlay = last.edits && typeof last.edits === 'object' ? last.edits : null;
        s.current = overlay && Object.keys(overlay).length ? build(base, overlay) : base;
        s.overlay = s.current === base ? null : overlay;
      } catch { s.stale = true; s.current = base; s.overlay = null; }
    }
  }
  rebuildList();

  const revOf = s => s.records.at(-1)?.rev ?? 0;

  const append = (id, s, edits, by, revertOf) => {
    const kase = edits ? build(s.base, edits) : s.base;
    const before = effective(s.current);
    const after = effective(kase);
    const record = {
      type: 'content_revision', caseId: id, version: s.base.version, rev: revOf(s) + 1,
      timestamp: new Date(now()).toISOString(), by: by ?? null, edits, contentHash: kase.contentHash,
      fields: changed(before, after), ...(revertOf === undefined ? {} : { revertOf }),
    };
    appendJsonl(resolvePath(dir, `${id}.jsonl`), record, 'content');
    s.records.push(record);
    s.current = kase;
    s.overlay = edits;
    s.stale = false;
    rebuildList();
    return record;
  };

  return {
    list: () => listCache,
    current: id => state(id).current,
    base: id => state(id).base,
    info(id) {
      const s = state(id);
      const last = s.records.at(-1);
      return {
        id, title: s.base.title, version: s.base.version, status: s.base.status, world: s.base.world.id,
        rev: last?.rev ?? 0, by: last?.by ?? null, editedAt: last?.timestamp ?? null,
        contentHash: s.current.contentHash, baseContentHash: s.base.contentHash, stale: s.stale,
      };
    },
    fields(id) {
      const s = state(id);
      return { authored: effective(s.base), current: effective(s.current) };
    },
    structure(id) {
      const { base } = state(id);
      const { id: wid, place, agents } = base.world;
      return {
        characters: base.characters.map(({ id: cid, name, color }) => ({ id: cid, name, color })),
        parts: base.parts.map(p => ({ id: p.id, role: p.role })),
        world: { id: wid, place, agents },
        placeholders: base.parts.map(p => `{${p.id}}`),
      };
    },
    history(id) {
      return state(id).records.map(({ rev, timestamp, by, fields, contentHash, revertOf }) => ({ rev, timestamp, by, fields, contentHash, revertOf }));
    },
    preview(id, edits) {
      const s = state(id);
      const overlay = validate(s.base, edits);
      return overlay ? build(s.base, overlay) : s.base;
    },
    publish(id, edits, { by, baseRev } = {}) {
      const s = state(id);
      if (baseRev !== revOf(s)) throw new ContentError(409, 'The content changed since you loaded it.');
      const overlay = validate(s.base, edits);
      if ((overlay ? sortedJson(overlay) : null) === (s.overlay ? sortedJson(s.overlay) : null)) {
        return { rev: revOf(s), contentHash: s.current.contentHash, fields: [] };
      }
      const r = append(id, s, overlay, by);
      return { rev: r.rev, contentHash: r.contentHash, fields: r.fields };
    },
    revert(id, rev, { by } = {}) {
      const s = state(id);
      const target = rev === 0 ? { edits: null } : s.records.find(r => r.rev === rev);
      if (!Number.isInteger(rev) || !target) throw new ContentError(404, 'Unknown revision.');
      const r = append(id, s, target.edits && Object.keys(target.edits).length ? target.edits : null, by, rev);
      return { rev: r.rev, contentHash: r.contentHash, fields: r.fields, revertOf: rev };
    },
  };
}
