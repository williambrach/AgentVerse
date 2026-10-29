import { createHash } from 'node:crypto';
import { worlds } from './worlds.mjs';

const CHAR_KEYS = ['id', 'name', 'role', 'room', 'color', 'introduction', 'quickQuestion'];
const LEGACY_BASKET = ['title', 'description', 'emptyTitle', 'emptyText'];
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

export function defineCase(data) {
  const id = data?.id;
  const fail = (path, message) => { throw new Error(`case ${id}: ${path}: ${message}`); };
  const str = (value, path) => { if (typeof value !== 'string' || !value) fail(path, 'must be a non-empty string'); };
  const list = (value, path) => { if (!Array.isArray(value) || !value.length) fail(path, 'must be a non-empty array'); };
  if (typeof id !== 'string' || !/^[a-z0-9-]{3,40}$/.test(id)) fail('id', 'must match /^[a-z0-9-]{3,40}$/');
  const worldId = (data.world && typeof data.world === 'object' ? data.world.id : data.world) ?? 'grove';
  if (!Object.hasOwn(worlds, worldId)) fail('world', `must be one of ${Object.keys(worlds).join(', ')}`);
  if (!Array.isArray(data.characters) || data.characters.length !== 3) fail('characters', 'must hold exactly 3 characters');
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
  if (data.copy.basket !== undefined) {
    if (!data.copy.basket || typeof data.copy.basket !== 'object') fail('copy.basket', 'must be an object');
    for (const key of LEGACY_BASKET) str(data.copy.basket[key], `copy.basket.${key}`);
  }
  const prompt = data.prompt;
  if (!prompt || typeof prompt !== 'object') fail('prompt', 'is required');
  str(prompt.setting, 'prompt.setting');
  for (const key of ['use', 'avoid']) if (!Array.isArray(prompt[key]) || !prompt[key].every(s => typeof s === 'string')) fail(`prompt.${key}`, 'must be an array of strings');
  data.characters.forEach((c, i) => CHAR_KEYS.forEach(k => str(c[k], `characters[${i}].${k}`)));
  const legacyChapters = data.chapters !== undefined;
  if (legacyChapters) {
    list(data.chapters, 'chapters');
    data.chapters.forEach((c, i) => { str(c?.title, `chapters[${i}].title`); str(c?.subtitle, `chapters[${i}].subtitle`); });
  }
  const recordIds = new Set();
  if (data.records !== undefined) {
    list(data.records, 'records');
    if (!legacyChapters) fail('records', 'need chapters');
    data.records.forEach((r, i) => {
      for (const k of ['id', 'time', 'source', 'title', 'kind', 'text']) str(r?.[k], `records[${i}].${k}`);
      if (recordIds.has(r.id)) fail(`records[${i}].id`, `duplicate record id ${r.id}`);
      recordIds.add(r.id);
      if (!Number.isInteger(r.chapter) || r.chapter < 1 || r.chapter > data.chapters.length) fail(`records[${i}].chapter`, `must be an integer from 1 to ${data.chapters.length}`);
    });
  }
  if (!data.knowledge || typeof data.knowledge !== 'object') fail('knowledge', 'is required');
  for (const key of Object.keys(data.knowledge)) if (!IDS.includes(key)) fail(`knowledge.${key}`, 'not a character');
  for (const cid of IDS) {
    const k = data.knowledge[cid];
    const sized = legacyChapters ? k?.length === data.chapters.length : k?.length > 0;
    if (!Array.isArray(k) || !sized || !k.every(s => typeof s === 'string' && s)) fail(`knowledge.${cid}`, legacyChapters ? `must hold ${data.chapters.length} non-empty string(s), one per chapter` : 'must be a non-empty array of non-empty strings');
  }
  const answer = data.answer;
  if (!answer || !Array.isArray(answer.culprits) || !answer.culprits.every(c => IDS.includes(c))) fail('answer.culprits', 'must be an array of character ids');
  str(answer.feedback?.correct, 'answer.feedback.correct');
  str(answer.feedback?.other, 'answer.feedback.other');
  const debrief = data.debrief;
  if (!debrief || typeof debrief !== 'object') fail('debrief', 'is required');
  str(debrief.title, 'debrief.title'); str(debrief.summary, 'debrief.summary'); str(debrief.lesson, 'debrief.lesson');
  list(debrief.findings, 'debrief.findings');
  debrief.findings.forEach((f, i) => {
    if (!IDS.includes(f?.character)) fail(`debrief.findings[${i}].character`, 'must be a character id');
    str(f.classification, `debrief.findings[${i}].classification`);
    str(f.explanation, `debrief.findings[${i}].explanation`);
    if (f.evidence !== undefined && (!Array.isArray(f.evidence) || !f.evidence.every(e => recordIds.has(e)))) fail(`debrief.findings[${i}].evidence`, 'must list record ids');
  });
  if (typeof data.rehearsal !== 'function') fail('rehearsal', 'must be a function');
  for (const key of ['rehearsalReasoning', 'rehearsalChatter']) if (data[key] !== undefined && typeof data[key] !== 'function') fail(key, 'must be a function');
  const tools = Object.fromEntries(['rehearsalReasoning', 'rehearsalChatter'].filter(k => data[k]).map(k => [k, data[k]]));
  return deepFreeze({ ...clone(data), world: { ...worlds[worldId] }, rehearsal: data.rehearsal, ...tools, contentHash: contentHash(data) });
}

export function publicView(kase) {
  return {
    caseId: kase.id,
    caseVersion: kase.version,
    contentHash: kase.contentHash,
    title: kase.title,
    order: kase.order,
    copy: (({ basket, ...rest }) => clone(rest))(kase.copy),
    world: (({ persona, clueSpot, ...rest }) => ({ ...rest, cast: { ...rest.cast } }))(kase.world),
    characters: kase.characters.map(c => Object.fromEntries(CHAR_KEYS.map(k => [k, c[k]]))),
  };
}

const visible = (cases, dev) => cases.filter(c => dev || c.status === 'ready').sort((a, b) => a.order - b.order);

export function listCases(cases, { dev = false } = {}) {
  return visible(cases, dev).map(c => ({ id: c.id, title: c.title, lead: c.copy.intro.lead, order: c.order, world: c.world.id }));
}

export function findCase(cases, id, { dev = false } = {}) {
  return visible(cases, dev).find(c => c.id === id);
}
