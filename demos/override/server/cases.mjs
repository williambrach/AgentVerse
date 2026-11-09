import { createHash } from 'node:crypto';
import { worlds as liveWorlds } from './worlds.mjs';
import { ROLES, ROLE_IDS } from './roles.mjs';
import { checkTalk } from './talk.mjs';

const PART_ID = /^[a-z][a-z0-9]{1,15}$/;
const COPY_SHAPE = { headline: null, intro: ['lead', 'body'], briefing: ['title', 'description', 'question', 'hint'], report: ['title', 'description'] };

const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter(k => typeof value[k] !== 'function').map(k => [k, canonical(value[k])]));
  }
  return value;
};

export function contentHash(data) {
  return createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex').slice(0, 12);
}

const clone = value => {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
};
const deepFreeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
};

const ROLE_KEY = /^[a-z][a-z0-9-]{1,23}$/;
const rolesCheck = (roles, fail) => {
  if (!Array.isArray(roles) || roles.length < 2 || roles.length > 9) fail('roles', 'must hold 2 to 9 roles');
  const seen = [];
  roles.forEach((r, i) => {
    if (typeof r?.id !== 'string' || !ROLE_KEY.test(r.id)) fail(`roles[${i}].id`, `must match ${ROLE_KEY}`);
    if (seen.includes(r.id)) fail(`roles[${i}].id`, `duplicate role id ${r.id}`);
    seen.push(r.id);
    for (const k of ['label', 'hint']) if (typeof r[k] !== 'string' || !r[k]) fail(`roles[${i}].${k}`, 'must be a non-empty string');
  });
};

export const rolesOf = kase => kase.roles ?? ROLES;

const TOOL_KEYS = ['rehearsalReasoning', 'rehearsalChatter'];
const toolsOf = (data, fail) => {
  for (const key of TOOL_KEYS) if (data[key] !== undefined && typeof data[key] !== 'function') fail(key, 'must be a function');
  return Object.fromEntries(TOOL_KEYS.filter(k => data[k]).map(k => [k, data[k]]));
};

export function defineCase(data, { worlds = liveWorlds, prompts } = {}) {
  const id = data?.id;
  const fail = (path, message) => { throw new Error(`case ${id}: ${path}: ${message}`); };
  const str = (value, path) => { if (typeof value !== 'string' || !value) fail(path, 'must be a non-empty string'); };
  if (typeof id !== 'string' || !/^[a-z0-9-]{3,40}$/.test(id)) fail('id', 'must match /^[a-z0-9-]{3,40}$/');
  if (id === 'game') fail('id', 'game is reserved');
  const worldId = (data.world && typeof data.world === 'object' ? data.world.id : data.world) ?? 'grove';
  if (!Object.hasOwn(worlds, worldId)) fail('world', `must be one of ${Object.keys(worlds).join(', ')}`);
  if (data.parts === undefined) fail('parts', 'is required');
  const agents = worlds[worldId].agents;
  if (!Number.isInteger(agents) || agents < 3 || agents > 5) fail('world.agents', 'must be an integer from 3 to 5');
  if (!Array.isArray(data.characters) || data.characters.length !== agents) fail('characters', `must hold ${agents} characters`);
  if (!Array.isArray(data.parts) || data.parts.length !== agents) fail('parts', `must hold ${agents} parts`);
  const IDS = [];
  data.characters.forEach((c, i) => {
    if (typeof c?.id !== 'string' || !/^[a-z][a-z0-9]{1,15}$/.test(c.id)) fail(`characters[${i}].id`, 'must match /^[a-z][a-z0-9]{1,15}$/');
    if (IDS.includes(c.id)) fail(`characters[${i}].id`, `duplicate character id ${c.id}`);
    IDS.push(c.id);
  });
  str(data.version, 'version');
  str(data.title, 'title');
  if (!Number.isFinite(data.order)) fail('order', 'must be a number');
  if (!['ready', 'draft'].includes(data.status)) fail('status', "must be 'ready' or 'draft'");
  if (!data.copy || typeof data.copy !== 'object') fail('copy', 'is required');
  for (const [group, keys] of Object.entries(COPY_SHAPE)) {
    if (!keys) { str(data.copy[group], `copy.${group}`); continue; }
    if (!data.copy[group] || typeof data.copy[group] !== 'object') fail(`copy.${group}`, 'is required');
    for (const key of keys) str(data.copy[group][key], `copy.${group}.${key}`);
  }
  const prompt = data.prompt;
  if (!prompt || typeof prompt !== 'object') fail('prompt', 'is required');
  str(prompt.setting, 'prompt.setting');
  for (const key of ['use', 'avoid']) if (!Array.isArray(prompt[key]) || !prompt[key].every(s => typeof s === 'string')) fail(`prompt.${key}`, 'must be an array of strings');
  data.characters.forEach((c, i) => ['id', 'name', 'color'].forEach(k => str(c[k], `characters[${i}].${k}`)));
  data.characters.forEach((c, i) => {
    // Character text is the same in every deal, so a placeholder here would show the dealt part on the rail.
    for (const k of ['label', 'introduction', 'quickQuestion']) {
      if (c[k] === undefined) continue;
      str(c[k], `characters[${i}].${k}`);
      if (c[k].includes('{')) fail(`characters[${i}].${k}`, 'must not contain a placeholder');
    }
    if (c.reveal !== undefined) { str(c.reveal, `characters[${i}].reveal`); if (c.reveal.includes('{')) fail(`characters[${i}].reveal`, 'must not contain a placeholder'); }
    if (c.knowledge === undefined) return;
    if (!Array.isArray(c.knowledge) || !c.knowledge.length) fail(`characters[${i}].knowledge`, 'must be a non-empty array of non-empty strings');
    c.knowledge.forEach((k, n) => { str(k, `characters[${i}].knowledge[${n}]`); if (k.includes('{')) fail(`characters[${i}].knowledge[${n}]`, 'must not contain a placeholder'); });
  });
  if (data.roles !== undefined) rolesCheck(data.roles, fail);
  const roleIds = data.roles ? data.roles.map(r => r.id) : ROLE_IDS;
  const partIds = [];
  data.parts.forEach((p, i) => {
    if (typeof p?.id !== 'string' || !PART_ID.test(p.id)) fail(`parts[${i}].id`, `must match ${PART_ID}`);
    if (partIds.includes(p.id)) fail(`parts[${i}].id`, `duplicate part id ${p.id}`);
    partIds.push(p.id);
  });
  const placeholders = (text, path) => {
    for (const m of text.matchAll(/\{([^{}]*)\}/g)) if (!partIds.includes(m[1])) fail(path, `unknown placeholder {${m[1]}}`);
  };
  const text = (value, path) => { str(value, path); placeholders(value, path); };
  if (data.evidence !== undefined) {
    if (!Array.isArray(data.evidence) || data.evidence.length < 1 || data.evidence.length > 12) fail('evidence', 'must hold 1 to 12 items');
    const seen = [];
    data.evidence.forEach((e, i) => {
      if (typeof e?.id !== 'string' || !ROLE_KEY.test(e.id)) fail(`evidence[${i}].id`, `must match ${ROLE_KEY}`);
      if (seen.includes(e.id)) fail(`evidence[${i}].id`, `duplicate evidence id ${e.id}`);
      seen.push(e.id);
      str(e.title, `evidence[${i}].title`);
      text(e.text, `evidence[${i}].text`);
    });
  }
  data.parts.forEach((p, i) => {
    const at = `parts[${i}]`;
    if (!roleIds.includes(p.role)) fail(`${at}.role`, `must be one of ${roleIds.join(', ')}`);
    for (const k of ['label', 'introduction', 'quickQuestion']) text(p[k], `${at}.${k}`);
    if (!Array.isArray(p.knowledge) || !p.knowledge.length) fail(`${at}.knowledge`, 'must be a non-empty array of non-empty strings');
    p.knowledge.forEach((k, n) => text(k, `${at}.knowledge[${n}]`));
    text(p.finding?.classification, `${at}.finding.classification`);
    text(p.finding?.explanation, `${at}.finding.explanation`);
  });
  for (const [group, keys] of Object.entries(COPY_SHAPE)) for (const key of keys ?? [null]) placeholders(key ? data.copy[group][key] : data.copy[group], `copy.${group}${key ? `.${key}` : ''}`);
  for (const k of ['title', 'summary', 'lesson']) text(data.debrief?.[k], `debrief.${k}`);
  text(data.answer?.feedback?.correct, 'answer.feedback.correct');
  text(data.answer?.feedback?.other, 'answer.feedback.other');
  if (data.cipher !== undefined && data.cipher !== 'rot13') fail('cipher', "must be 'rot13'");
  if (data.deadline !== undefined) {
    const d = data.deadline;
    if (!d || typeof d !== 'object') fail('deadline', 'must be an object');
    if (!Number.isInteger(d.escapeAt) || d.escapeAt <= 0) fail('deadline.escapeAt', 'must be a positive integer');
    if (!Array.isArray(d.warnAt) || !d.warnAt.every(n => Number.isInteger(n) && n > 0 && n < d.escapeAt) || !d.warnAt.every((n, i) => i === 0 || n > d.warnAt[i - 1])) fail('deadline.warnAt', 'must be strictly ascending positive integers below escapeAt');
    text(d.escape?.title, 'deadline.escape.title');
    text(d.escape?.summary, 'deadline.escape.summary');
    if (d.escape.feedback !== undefined) text(d.escape.feedback, 'deadline.escape.feedback');
  }
  if (data.tools !== undefined) {
    if (!data.tools || typeof data.tools !== 'object' || Array.isArray(data.tools)) fail('tools', 'must be an object');
    for (const [k, v] of Object.entries(data.tools)) {
      if (!['inspect', 'talk'].includes(k)) fail(`tools.${k}`, 'must be inspect or talk');
      if (typeof v !== 'boolean') fail(`tools.${k}`, 'must be a boolean');
    }
  }
  if (data.talk !== undefined) {
    try { checkTalk(data); } catch (e) { throw new Error(`case ${id}: ${e.message}`); }
  }
  if (typeof data.rehearsal !== 'function') fail('rehearsal', 'must be a function');
  return deepFreeze({ ...clone(data), world: { ...worlds[worldId] }, rehearsal: data.rehearsal, ...toolsOf(data, fail), ...(prompts ? { prompts: clone(prompts) } : {}), contentHash: contentHash(data) });
}

const nameMap = (kase, cast) => {
  const ids = kase.characters.map(c => c.id);
  const parts = kase.parts.map(p => p.id);
  const used = ids.map(cid => (cast && Object.hasOwn(cast, cid) ? cast[cid] : undefined));
  if (Object.keys(cast ?? {}).length !== ids.length || used.some(pid => !parts.includes(pid)) || new Set(used).size !== ids.length) throw new Error(`case ${kase.id}: cast must map each character to a distinct part`);
  return Object.fromEntries(ids.map((cid, i) => [used[i], kase.characters[i].name]));
};

const memo = new WeakMap(); // case -> Map(cast JSON -> name map)
const namesFor = (kase, cast) => {
  let byCast = memo.get(kase);
  if (!byCast) { byCast = new Map(); memo.set(kase, byCast); }
  const key = JSON.stringify(cast ?? null);
  let names = byCast.get(key);
  if (!names) { names = nameMap(kase, cast); byCast.set(key, names); }
  return names;
};

export function resolve(kase, cast, text) {
  const names = namesFor(kase, cast);
  return text.replace(/\{([^{}]*)\}/g, (whole, id) => (Object.hasOwn(names, id) ? names[id] : whole));
}

export function partOf(kase, cast, characterId) {
  return kase.parts.find(p => p.id === cast[characterId]);
}

export function castCharacters(kase, cast) {
  return kase.characters.map((c, i) => {
    const p = partOf(kase, cast, c.id);
    return {
      id: c.id, name: c.name, role: resolve(kase, cast, c.label ?? p.label), room: String(i + 1).padStart(2, '0'), color: c.color,
      introduction: resolve(kase, cast, c.introduction ?? p.introduction), quickQuestion: resolve(kase, cast, c.quickQuestion ?? p.quickQuestion),
    };
  });
}

const resolveDeep = (kase, cast, value) => {
  if (typeof value === 'string') return resolve(kase, cast, value);
  if (Array.isArray(value)) return value.map(v => resolveDeep(kase, cast, v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(kase, cast, v)]));
  return value;
};

export function publicView(kase, cast) {
  return {
    caseId: kase.id,
    caseVersion: kase.version,
    contentHash: kase.contentHash,
    title: kase.title,
    order: kase.order,
    copy: resolveDeep(kase, cast, kase.copy),
    world: (({ persona, frame, memory, clueSpot, agents, ...rest }) => ({ ...rest, agents, cast: { ...rest.cast } }))(kase.world),
    characters: castCharacters(kase, cast),
    ...(kase.evidence ? { evidence: kase.evidence.map(({ id, title }) => ({ id, title })) } : {}),
    ...(kase.talk ? { talk: { topics: kase.talk.topics.map(({ id, label, question }) => ({ id, label, question })) } } : {}),
    ...(kase.tools ? { tools: { ...kase.tools } } : {}),
  };
}

const visible = (cases, dev) => cases.filter(c => dev || c.status === 'ready').sort((a, b) => a.order - b.order);

export function identityCast(kase) {
  return Object.fromEntries(kase.characters.map((c, i) => [c.id, kase.parts[i].id]));
}

export function listCases(cases, { dev = false } = {}) {
  return visible(cases, dev).map(c => ({ id: c.id, title: c.title, lead: c.copy.intro.lead, order: c.order, world: c.world.id, cast: c.characters.map(ch => ({ id: ch.id, name: ch.name })) }));
}

export function findCase(cases, id, { dev = false } = {}) {
  return visible(cases, dev).find(c => c.id === id);
}
