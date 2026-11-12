import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { defineCase } from './cases.mjs';
import { rawOf, fieldsOf, getPath, setPath, editPathOf } from './content-paths.mjs';
import { appendJsonl, readJsonl } from './dataset.mjs';
import { gameFields, checkGameEdit, applyGame } from './game-text.mjs';
import { ROLES } from './roles.mjs';
import { worlds as liveWorlds } from './worlds.mjs';

const MAX_TEXT = 2000;
// The rules hold the whole shared prompt, facts everyone knows included, so they get more room.
const MAX_RULES = 4000;
const GAME = 'game';

export class ContentError extends Error {
  constructor(status, message, path = null) {
    super(message);
    this.name = 'ContentError';
    this.status = status;
    this.path = path;
  }
}

/** Editable paths of a case, in document order. */
export const editablePaths = kase => fieldsOf(rawOf(kase)).map(f => f.path);

const clone = v => (Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
const sortedJson = o => JSON.stringify(sorted(o));
const nonEmpty = o => (o && typeof o === 'object' && Object.keys(o).length ? o : null);
const hashOf = o => (o ? createHash('sha256').update(sortedJson(o)).digest('hex').slice(0, 12) : null);

// Every parsable record of a revision file. readJsonl repairs a partial last line but throws on a
// corrupt line anywhere else; that must not drop the revisions around it, so fall back to a
// line-by-line read and flag the case as corrupt. The file is newline-terminated either way, so
// the next append never glues onto an unterminated line.
const readRecords = file => {
  try { return { records: readJsonl(file, { repair: true }), corrupt: false }; } catch {
    let text = '';
    try { text = readFileSync(file, 'utf8'); } catch { return { records: [], corrupt: true }; }
    const records = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { records.push(JSON.parse(line)); } catch { /* reported by the corrupt flag */ }
    }
    if (text && !text.endsWith('\n')) { try { writeFileSync(file, `${text}\n`); } catch { /* read-only data stays as it is */ } }
    return { records, corrupt: true };
  }
};

export function createContentStore({ cases, dataDir, contentDir, uiDefaults = {}, worlds = liveWorlds, now = () => Date.now() }) {
  const dir = resolvePath(dataDir, 'content');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const trackedDir = resolvePath(contentDir ?? resolvePath(dataDir, 'content-files')); // callers without a tracked folder keep files beside the log
  const order = cases.map(c => c.id);
  const states = new Map();
  const game = { id: GAME, version: null, base: null, overlay: null, skipped: [], records: [], stale: false, corrupt: false };
  states.set(GAME, game);
  const gameDefaults = Object.fromEntries(gameFields(uiDefaults, worlds).map(f => [f.path, f.value]));
  let applied = { worlds, prompts: null, ui: {} };

  const fileOf = id => resolvePath(trackedDir, id === GAME ? 'game.json' : `cases/${id}.json`);
  const logOf = id => resolvePath(dir, `${id}.jsonl`);

  // The tracked file: atomic tmp + rename, directories made on first write. No edits deletes it.
  const writeTracked = (s, edits) => {
    const file = fileOf(s.id);
    if (!edits) { rmSync(file, { force: true }); return; }
    mkdirSync(dirname(file), { recursive: true });
    const doc = { id: s.id, ...(s.id === GAME ? {} : { version: s.base.version }), edits: sorted(edits) };
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
    renameSync(tmp, file);
  };
  const readTracked = s => {
    const file = fileOf(s.id);
    if (!existsSync(file)) return { status: 'absent' };
    try {
      const doc = JSON.parse(readFileSync(file, 'utf8'));
      const ok = doc && doc.id === s.id && doc.edits && typeof doc.edits === 'object' && !Array.isArray(doc.edits) && (s.id === GAME || doc.version === s.base.version);
      return ok ? { status: 'ok', edits: nonEmpty(doc.edits) } : { status: 'bad' };
    } catch { return { status: 'bad' }; }
  };

  // The case object for an overlay under the game's worlds and prompts. Unedited stays the authored object.
  const compose = (base, edits, ctx = applied) => {
    if (!edits && !ctx.prompts && ctx.worlds === worlds) return base;
    const raw = rawOf(base);
    const kinds = new Map(fieldsOf(raw).map(f => [f.path, f.kind]));
    for (const [path, value] of Object.entries(edits ?? {})) {
      const kind = kinds.get(path);
      if (!kind) throw new ContentError(400, `Unknown field ${path}.`, path);
      const fits = kind === 'list' ? Array.isArray(value) && value.every(x => typeof x === 'string') : typeof value === 'string';
      if (!fits) throw new ContentError(400, kind === 'list' ? 'Must be a list of text.' : 'Must be text.', path);
      setPath(raw, path, clone(value));
    }
    if (base.roles === undefined && same(raw.roles, ROLES)) delete raw.roles; // default roles stay implicit: same hash
    const opts = { worlds: ctx.worlds, ...(ctx.prompts ? { prompts: ctx.prompts } : {}) };
    try {
      if (!edits && raw.world === 'grove') { // authored data may leave the default world implicit; keep its hash
        const bare = defineCase({ ...raw, world: undefined }, opts);
        if (bare.contentHash === base.contentHash) return bare;
      }
      return defineCase(raw, opts);
    } catch (error) {
      const m = /^case [^:]*: ([^:]+): (.*)$/s.exec(error.message);
      if (!m) throw error;
      throw new ContentError(400, m[2], editPathOf(raw, m[1]));
    }
  };

  const textCheck = (value, path) => {
    if (typeof value !== 'string') throw new ContentError(400, 'Must be text.', path);
    const max = path === 'rules' || /^parts\.[^.]+\.rules$/.test(path) ? MAX_RULES : MAX_TEXT;
    if (value.length > max) throw new ContentError(400, `Must be at most ${max} characters.`, path);
  };

  // Case edits: known fields only, caps, no-ops dropped, then defineCase decides.
  const validateCase = (base, edits, ctx = applied) => {
    if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw new ContentError(400, 'Edits must be an object.', null);
    const raw = rawOf(base);
    const kinds = new Map(fieldsOf(raw).map(f => [f.path, f.kind]));
    const merged = {};
    for (const [path, value] of Object.entries(edits)) {
      const kind = kinds.get(path);
      if (!kind) throw new ContentError(400, `Unknown field ${path}.`, path);
      if (kind === 'list') {
        if (!Array.isArray(value)) throw new ContentError(400, 'Must be a list of text.', path);
        const knowledge = path.endsWith('.knowledge') || path === 'partsKnowledge';
        // Knowledge is the actor's own text, one item per line, so the limit is on lines of a long text.
        const [min, max] = knowledge ? [1, 200] : [0, 30];
        if (value.length < min || value.length > max) throw new ContentError(400, `Must hold ${min} to ${max} items.`, path);
        value.forEach(item => { textCheck(item, path); if (!item.trim()) throw new ContentError(400, 'Items must not be empty.', path); });
      } else textCheck(value, path);
      if (!same(value, getPath(raw, path))) merged[path] = clone(value);
    }
    compose(base, nonEmpty(merged), ctx);
    return nonEmpty(merged);
  };

  // Game edits: each key on its own.
  const validateGame = edits => {
    if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw new ContentError(400, 'Edits must be an object.', null);
    const merged = {};
    for (const [path, value] of Object.entries(edits)) {
      const problem = checkGameEdit(path, value, uiDefaults, worlds);
      if (problem) throw new ContentError(400, problem, path);
      if (value !== gameDefaults[path]) merged[path] = value;
    }
    return nonEmpty(merged);
  };

  const applyFor = overlay => applyGame(overlay ?? {}, worlds);
  // Every case under a game overlay; throws if any case no longer builds.
  const composeAll = (ctx, overlayOf) => order.map(id => compose(states.get(id).base, overlayOf(id), ctx));

  const gameCurrent = () => ({ ...gameDefaults, ...(game.overlay ?? {}) });
  const caseValues = kase => Object.fromEntries(fieldsOf(rawOf(kase)).map(f => [f.path, clone(f.value)]));
  const effective = s => (s.id === GAME ? gameCurrent() : caseValues(s.current));
  const changedKeys = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].filter(k => !same(a?.[k], b?.[k])).sort();

  let listCache = null;
  const rebuildList = () => { listCache = order.map(id => states.get(id).current); };
  // The highest rev on file, not the last line: a corrupt line must never make a number repeat.
  const revOf = s => s.records.reduce((max, r) => Math.max(max, r.rev), 0);

  const record = (s, edits, by, extra) => ({
    type: 'content_revision', caseId: s.id, version: s.id === GAME ? null : s.base.version, rev: revOf(s) + 1,
    timestamp: new Date(now()).toISOString(), by: by ?? null, edits, tracked: true, ...extra,
  });
  const log = (s, r) => { appendJsonl(logOf(s.id), r, 'content'); s.records.push(r); };

  // Boot: the tracked file wins; a legacy log without a file is imported; a removed file is recorded.
  const boot = s => {
    const { records, corrupt } = readRecords(logOf(s.id));
    s.corrupt = corrupt;
    const version = s.id === GAME ? null : s.base.version;
    s.records = records.filter(r => r && r.type === 'content_revision' && r.version === version && Number.isInteger(r.rev));
    const last = s.records.at(-1);
    const logEdits = nonEmpty(last?.edits);
    const file = readTracked(s);
    const fileRecord = edits => {
      const r = record(s, edits, 'file', { fields: changedKeys(logEdits ?? {}, edits ?? {}) });
      try { r.contentHash = s.id === GAME ? hashOf(edits) : compose(s.base, edits).contentHash; } catch { r.contentHash = null; }
      try { log(s, r); } catch { /* a read-only data dir must not stop the boot */ }
    };
    let overlay = null;
    if (file.status === 'ok') {
      overlay = file.edits;
      if (!same(sorted(overlay ?? {}), sorted(logEdits ?? {}))) s.act = () => fileRecord(overlay);
      else if (logEdits && !last.tracked) s.act = () => fileRecord(overlay); // marker: a later missing file is a removal
    } else if (file.status === 'bad') s.stale = true;
    else if (logEdits && !last.tracked) {
      overlay = logEdits;
      s.act = () => {
        try { writeTracked(s, overlay); } catch { return; } // imported again next boot
        const r = record(s, overlay, 'import', { fields: [] });
        try { r.contentHash = s.id === GAME ? hashOf(overlay) : compose(s.base, overlay).contentHash; } catch { r.contentHash = null; }
        try { log(s, r); } catch { /* a read-only data dir must not stop the boot */ }
      };
    } else if (logEdits) s.act = () => fileRecord(null);
    return overlay;
  };

  // Game first: its worlds and prompts rebuild every case.
  {
    const overlay = boot(game);
    const valid = {};
    for (const [path, value] of Object.entries(overlay ?? {})) {
      if (checkGameEdit(path, value, uiDefaults, worlds)) game.skipped.push(path); else valid[path] = value;
    }
    game.skipped.sort();
    game.overlay = nonEmpty(valid);
    applied = applyFor(game.overlay);
  }
  for (const base of cases) {
    const s = { id: base.id, base, current: base, overlay: null, records: [], stale: false, corrupt: false };
    states.set(base.id, s);
    const overlay = boot(s);
    if (!s.stale) {
      try {
        s.current = compose(base, overlay);
        s.overlay = s.current === base || !overlay ? null : overlay;
      } catch { s.stale = true; s.current = base; s.overlay = null; }
    }
    if (!s.stale) s.act?.();
  }
  game.act?.();
  rebuildList();

  const state = id => {
    const s = states.get(id);
    if (!s) throw new ContentError(404, 'Unknown case.');
    return s;
  };

  // Commit one revision: tracked file, then log, then memory. Everything that can throw runs before the first write.
  const commit = (s, edits, by, revertOf) => {
    const before = effective(s);
    let nextCases = null;
    let nextApplied = applied;
    let kase = null;
    if (s.id === GAME) {
      nextApplied = applyFor(edits);
      try { nextCases = composeAll(nextApplied, id => states.get(id).overlay); } catch (e) { throw e instanceof ContentError ? new ContentError(400, e.message, null) : e; }
    } else kase = compose(s.base, edits);
    const after = s.id === GAME ? { ...gameDefaults, ...(edits ?? {}) } : caseValues(kase);
    const r = record(s, edits, by, {
      contentHash: s.id === GAME ? hashOf(edits) : kase.contentHash,
      fields: changedKeys(before, after), ...(revertOf === undefined ? {} : { revertOf }),
    });
    writeTracked(s, edits);
    log(s, r);
    s.stale = false;
    s.overlay = edits;
    if (s.id === GAME) {
      applied = nextApplied;
      order.forEach((id, i) => { states.get(id).current = nextCases[i]; });
      game.skipped = [];
    } else s.current = kase;
    rebuildList();
    return r;
  };

  return {
    list: () => listCache,
    current: id => state(id).current,
    base: id => state(id).base,
    uiText: () => ({ ...applied.ui }),
    info(id) {
      const s = state(id);
      const last = s.records.at(-1);
      const common = { rev: revOf(s), by: last?.by ?? null, editedAt: last?.timestamp ?? null };
      if (s.id === GAME) {
        return { id: GAME, title: 'Game text', version: null, status: null, world: null, ...common, contentHash: hashOf(s.overlay), baseContentHash: null, stale: s.stale, corrupt: s.corrupt, skipped: [...s.skipped] };
      }
      return {
        id, title: s.base.title, version: s.base.version, status: s.base.status, world: s.base.world.id, ...common,
        contentHash: s.current.contentHash, baseContentHash: s.base.contentHash, stale: s.stale, corrupt: s.corrupt,
      };
    },
    fields(id) {
      const s = state(id);
      if (s.id === GAME) return { authored: { ...gameDefaults }, current: gameCurrent(), order: Object.keys(gameDefaults) };
      const authored = fieldsOf(rawOf(s.base));
      return { authored: Object.fromEntries(authored.map(f => [f.path, clone(f.value)])), current: caseValues(s.current), order: authored.map(f => f.path) };
    },
    structure(id) {
      const s = state(id);
      if (s.id === GAME) {
        return { characters: [], parts: [], world: null, placeholders: [], areas: [...new Set(Object.keys(uiDefaults).map(k => k.split('.')[0]))], worlds: Object.keys(worlds) };
      }
      const { base } = s;
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
      if (s.id === GAME) throw new ContentError(409, 'Preview works on a case.');
      return compose(s.base, validateCase(s.base, edits));
    },
    publish(id, edits, { by, baseRev } = {}) {
      const s = state(id);
      if (baseRev !== revOf(s)) throw new ContentError(409, 'The content changed since you loaded it.');
      const overlay = s.id === GAME ? validateGame(edits) : validateCase(s.base, edits);
      if (sortedJson(overlay ?? {}) === sortedJson(s.overlay ?? {})) {
        return { rev: revOf(s), contentHash: s.id === GAME ? hashOf(s.overlay) : s.current.contentHash, fields: [] };
      }
      const r = commit(s, overlay, by);
      return { rev: r.rev, contentHash: r.contentHash, fields: r.fields };
    },
    revert(id, rev, { by } = {}) {
      const s = state(id);
      const target = rev === 0 ? { edits: null } : s.records.find(r => r.rev === rev);
      if (!Number.isInteger(rev) || !target) throw new ContentError(404, 'Unknown revision.');
      const edits = nonEmpty(target.edits);
      const r = commit(s, s.id === GAME && edits ? validGameOnly(edits) : edits, by, rev);
      return { rev: r.rev, contentHash: r.contentHash, fields: r.fields, revertOf: rev };
    },
  };

  function validGameOnly(edits) {
    return nonEmpty(Object.fromEntries(Object.entries(edits).filter(([p, v]) => !checkGameEdit(p, v, uiDefaults, worlds))));
  }
}
