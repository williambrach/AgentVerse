import { rolesOf } from './cases.mjs';

// Locked keys at any depth (spec D4): structure the editor never changes.
const LOCKED = new Set(['id', 'version', 'world', 'status', 'order', 'color', 'role', 'cipher', 'when', 'tools']);
const LOCKED_PATHS = new Set(['deadline.escapeAt', 'deadline.warnAt', 'guard.roles']);
// Arrays of objects that are addressed by `id` (D5). Every other array of objects is addressed by index.
const ID_ARRAYS = new Set(['characters', 'parts', 'evidence', 'roles', 'talk.topics']);

const PART_KNOWLEDGE = /^parts\.[^.]+\.knowledge$/;
const SHARED = 'partsKnowledge';

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isList = v => Array.isArray(v) && v.every(x => typeof x === 'string');
const clone = v => (Array.isArray(v) ? v.map(clone) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);

// The editable shape of a registered case: a deep copy with the world as its id, no hash, and the
// role labels materialized so default roles are editable per case.
export function rawOf(kase) {
  const { contentHash, prompts, ...rest } = kase; // eslint-disable-line no-unused-vars
  const raw = { ...clone(rest), world: kase.world?.id ?? kase.world };
  if (raw.roles === undefined) raw.roles = clone(rolesOf(kase));
  return raw;
}

// Name of an array item inside its parent path: its id for the id arrays, else its index.
const segOf = (schema, item, index, siblings) => {
  if (!ID_ARRAYS.has(schema) || typeof item?.id !== 'string' || !item.id || item.id.includes('.') || /^\d+$/.test(item.id)) return String(index); // a dotted or numeric id would make the path ambiguous
  return siblings.filter(s => s?.id === item.id).length === 1 ? item.id : String(index);
};

// Every editable field of a case in document order. `schema` is the key path without ids or indices.
export function fieldsOf(raw) {
  const out = [];
  const walk = (value, path, schema) => {
    if (typeof value === 'string') out.push({ path, kind: 'text', value });
    else if (isList(value)) out.push({ path, kind: 'list', value: [...value] });
    else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}.${segOf(schema, item, i, value)}`, schema));
    else if (isObj(value)) {
      for (const [k, v] of Object.entries(value)) {
        const child = schema ? `${schema}.${k}` : k;
        if (LOCKED.has(k) || LOCKED_PATHS.has(child) || typeof v === 'function') continue;
        walk(v, path ? `${path}.${k}` : k, child);
      }
    }
  };
  walk(raw, '', '');
  // A part field that every character overrides never shows, so it is not editable.
  const hidden = path => {
    const m = /^parts\.[^.]+\.(label|introduction|quickQuestion)$/.exec(path);
    return !!m && Array.isArray(raw.characters) && raw.characters.length > 0 && raw.characters.every(c => c?.[m[1]] !== undefined);
  };
  const fields = out.filter(f => !hidden(f.path));
  if (!raw.talk) return fields;
  // A talk case shares one knowledge list across its parts: a single virtual field stands in for them.
  const first = fields.findIndex(f => PART_KNOWLEDGE.test(f.path));
  const rest = fields.filter(f => !PART_KNOWLEDGE.test(f.path));
  if (first < 0) return rest;
  const at = fields.slice(0, first).filter(f => !PART_KNOWLEDGE.test(f.path)).length;
  rest.splice(at, 0, { path: SHARED, kind: 'list', value: [...fields[first].value] });
  return rest;
}

// Resolve one path segment under a node: object key, array id, or array index.
const step = (node, seg, schema) => {
  if (Array.isArray(node)) {
    if (/^\d+$/.test(seg)) return node[Number(seg)]; // numeric ids are addressed by index (see segOf)
    const byId = ID_ARRAYS.has(schema) ? node.filter(x => x?.id === seg) : [];
    return byId.length === 1 ? byId[0] : undefined;
  }
  return isObj(node) && Object.hasOwn(node, seg) ? node[seg] : undefined;
};

const unknown = path => new Error(`Unknown field ${path}.`);

export function getPath(raw, path) {
  if (path === SHARED && raw.talk) return raw.parts?.[0]?.knowledge;
  const segs = String(path).split('.');
  let node = raw;
  let schema = '';
  for (const seg of segs) {
    const next = step(node, seg, schema);
    if (next === undefined) return undefined;
    if (!Array.isArray(node)) schema = schema ? `${schema}.${seg}` : seg;
    node = next;
  }
  return node;
}

export function setPath(raw, path, value) {
  if (!fieldsOf(raw).some(f => f.path === path)) throw unknown(path);
  if (path === SHARED) { raw.parts.forEach(p => { p.knowledge = [...value]; }); return; }
  const segs = path.split('.');
  const last = segs.pop();
  const parent = segs.length ? getPath(raw, segs.join('.')) : raw;
  if (Array.isArray(parent)) {
    const i = parent.findIndex(x => x?.id === last);
    parent[i >= 0 ? i : Number(last)] = value;
  } else parent[last] = value;
}

// Map a defineCase / checkTalk error path (`parts[1].knowledge[2]`, `talk.topics.0.label`) to an edit path.
// Null when it does not land on a field (a count, an id, a locked key).
export function editPathOf(raw, errorPath) {
  const tokens = String(errorPath).replace(/\[(\d+)\]/g, '.$1').split('.');
  const out = [];
  let node = raw;
  let schema = '';
  for (const tok of tokens) {
    if (Array.isArray(node)) {
      const item = step(node, tok, schema);
      if (item === undefined) return null;
      if (!isList(node)) out.push(segOf(schema, item, node.indexOf(item), node)); // a list item maps to its list
      node = item;
    } else {
      const next = step(node, tok, schema);
      if (next === undefined) return null;
      out.push(tok);
      schema = schema ? `${schema}.${tok}` : tok;
      node = next;
    }
  }
  let path = out.join('.');
  if (raw.talk && PART_KNOWLEDGE.test(path)) path = SHARED;
  return fieldsOf(raw).some(f => f.path === path) ? path : null;
}
