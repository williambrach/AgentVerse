// Talk engine: pure functions over a case's `talk` data and a plain state object.
// Nothing here mutates its inputs, calls a model, or touches the clock.
import { modernWords, maskModern, hasTerm, fold, asksTimeTravel } from './anachronism.mjs';

const WHEN = ['always', 'distracted', 'pressed'];
const REPLY_KEYS = ['guarded', 'wordReply', 'neverSaid', 'puzzled', 'deflect', 'denial'];
const isStr = v => typeof v === 'string' && v.trim() !== '';
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const slipsOf = (kase, cid) => kase?.talk?.slips?.[cid] ?? [];
const termsOfSlip = s => [s.term, ...(s.aliases ?? [])];
// A text names a slip when it holds a whole term or alias, or a whole 3+ letter word of a multi-word one.
const tokensOf = t => fold(t).split(/[\s\-]+/).filter(w => w.length >= 3 && /^[\p{L}]+$/u.test(w));
const namesTerm = (text, slip) => termsOfSlip(slip).some(t => hasTerm(text, t) || (/[\s\-]/.test(fold(t).trim()) && tokensOf(t).some(w => hasTerm(text, w))));
// Typed questions and cited quotes are stricter: the whole term or alias, or a word of it that is modern on its own
// ("video" of "video call", "jet" of "jet lag"), never a plain word like "call", "game" or "lag".
const citesTerm = (text, slip) => termsOfSlip(slip).some(t => hasTerm(text, t) || (/[\s\-]/.test(fold(t).trim()) && tokensOf(t).some(w => modernWords(w).length > 0 && hasTerm(text, w))));

// Every slip term and alias in the case, lower-case, once.
export function terms(kase) {
  const out = [];
  const seen = new Set();
  for (const list of Object.values(kase?.talk?.slips ?? {})) {
    for (const s of list) {
      for (const t of termsOfSlip(s)) {
        const k = fold(t).trim().toLowerCase();
        if (k && !seen.has(k)) { seen.add(k); out.push(k); }
      }
    }
  }
  return out;
}

function fail(path, msg) { throw new Error(`${path}: ${msg}`); }

function walkStrings(value, path, visit) {
  if (typeof value === 'string') visit(path, value);
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, `${path}.${i}`, visit));
  else if (isObj(value)) for (const [k, v] of Object.entries(value)) walkStrings(v, `${path}.${k}`, visit);
}

// Throws Error('<path>: <msg>') on the first problem. Shape first, then the modern-word scan.
export function checkTalk(data) {
  const talk = data?.talk;
  if (!isObj(talk)) fail('talk', 'must be an object');
  const cids = (data.characters ?? []).map(c => c?.id);
  if (!cids.length || !cids.every(isStr)) fail('characters', 'need ids');

  if (!Array.isArray(talk.topics) || talk.topics.length < 3) fail('talk.topics', 'need at least 3 topics');
  const topicIds = [];
  talk.topics.forEach((t, i) => {
    for (const k of ['id', 'label', 'question']) if (!isStr(t?.[k])) fail(`talk.topics.${i}.${k}`, 'must be a non-empty string');
    if (topicIds.includes(t.id)) fail(`talk.topics.${i}.id`, `duplicate topic (${t.id})`);
    topicIds.push(t.id);
  });

  if (!isObj(talk.lines)) fail('talk.lines', 'must be an object');
  if (!isObj(talk.slips)) fail('talk.slips', 'must be an object');
  if (!isObj(talk.replies)) fail('talk.replies', 'must be an object');
  if (!isObj(talk.rehearsal)) fail('talk.rehearsal', 'must be an object');
  for (const cid of cids) {
    for (const t of topicIds) if (!isStr(talk.lines[cid]?.[t])) fail(`talk.lines.${cid}.${t}`, 'missing line');

    const list = talk.slips[cid];
    if (!Array.isArray(list)) fail(`talk.slips.${cid}`, 'must be an array');
    const seen = new Set();
    let always = 0;
    list.forEach((s, i) => {
      const p = `talk.slips.${cid}.${i}`;
      if (!topicIds.includes(s?.topic)) fail(`${p}.topic`, `unknown topic (${s?.topic})`);
      if (s.id !== `${cid}-${s.topic}`) fail(`${p}.id`, `must be ${cid}-${s.topic}`);
      if (seen.has(s.topic)) fail(`${p}.topic`, `more than one slip for topic ${s.topic}`);
      seen.add(s.topic);
      if (!WHEN.includes(s.when)) fail(`${p}.when`, `must be one of ${WHEN.join(', ')}`);
      if (s.when === 'always') always += 1;
      for (const k of ['term', 'line', 'clean', 'correction']) if (!isStr(s[k])) fail(`${p}.${k}`, 'must be a non-empty string');
      if (!Array.isArray(s.aliases) || !s.aliases.every(isStr)) fail(`${p}.aliases`, 'must be an array of strings');
      if (!Array.isArray(s.followUps) || s.followUps.length !== 2 || !s.followUps.every(isStr)) fail(`${p}.followUps`, 'need exactly 2 strings');
      if (!termsOfSlip(s).some(t => hasTerm(s.line, t))) fail(`${p}.line`, `does not contain the term (${s.term})`);
      if (!s.line.includes(s.correction)) fail(`${p}.correction`, 'is not part of the line');
    });
    for (const t of topicIds) if (!seen.has(t)) fail(`talk.slips.${cid}`, `missing a slip for topic ${t}`);
    if (always < 3) fail(`talk.slips.${cid}`, `needs at least 3 always slips (has ${always})`);

    for (const k of REPLY_KEYS) if (!isStr(talk.replies[cid]?.[k])) fail(`talk.replies.${cid}.${k}`, 'missing reply');
    const rh = talk.rehearsal[cid];
    if (!Array.isArray(rh) || rh.length !== 2 || !rh.every(isStr)) fail(`talk.rehearsal.${cid}`, 'need exactly 2 strings');
  }
  if (!Array.isArray(talk.glossary)) fail('talk.glossary', 'must be an array');
  talk.glossary.forEach((g, i) => {
    if (!Array.isArray(g?.terms) || !g.terms.length || !g.terms.every(isStr)) fail(`talk.glossary.${i}.terms`, 'need strings');
    if (!isStr(g.text)) fail(`talk.glossary.${i}.text`, 'must be a non-empty string');
  });

  // Scan: everything authored except slip lines and reveals must be free of modern words.
  const extra = terms(data);
  const scan = (path, text) => {
    const hit = modernWords(text, extra);
    if (hit.length) fail(path, `uses a modern word (${hit[0]})`);
  };
  const scanTree = (path, value) => walkStrings(value, path, scan);
  scanTree('talk.topics', talk.topics);
  scanTree('talk.lines', talk.lines);
  scanTree('talk.replies', talk.replies);
  scanTree('talk.glossary', talk.glossary);
  scanTree('talk.rehearsal', talk.rehearsal);
  for (const cid of cids) {
    talk.slips[cid].forEach((s, i) => {
      for (const k of ['clean', 'correction']) scan(`talk.slips.${cid}.${i}.${k}`, s[k]);
      s.followUps.forEach((f, j) => scan(`talk.slips.${cid}.${i}.followUps.${j}`, f));
    });
  }
  (data.characters ?? []).forEach((c, i) => {
    for (const k of ['label', 'introduction', 'quickQuestion', 'knowledge']) scanTree(`characters.${i}.${k}`, c[k]);
  });
  // Part paths use defineCase's `parts[1].finding` form, so the maker can map an error back to its field.
  (data.parts ?? []).forEach((p, i) => walkStrings(p, `parts[${i}]`, scan));
  scanTree('copy', data.copy);
  scanTree('debrief', data.debrief);
  scanTree('answer.feedback', data.answer?.feedback);
  // The prompt goes to the model in every deal; list entries use `prompt.use[1]` like the other defineCase paths.
  for (const [k, v] of Object.entries(data.prompt ?? {})) {
    if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, `prompt.${k}[${i}]`, scan));
    else walkStrings(v, `prompt.${k}`, scan);
  }

  // Copy and the wrong-accusation feedback show while the game is open and are filled from the real deal,
  // so a placeholder there would name the traveller. Only the debrief and the correct feedback may use one.
  const noPlaceholder = (path, text) => { if (/\{[^{}]*\}/.test(text)) fail(path, 'must not contain a placeholder in a talk case'); };
  walkStrings(data.copy, 'copy', noPlaceholder);
  if (data.answer?.feedback?.other !== undefined) walkStrings(data.answer.feedback.other, 'answer.feedback.other', noPlaceholder);
}

export function newTalkState(kase) {
  const cids = (kase?.characters ?? []).map(c => c.id);
  const asked = {};
  for (const cid of cids) asked[cid] = [];
  return { asked, quotes: [], accusations: [], delivered: {}, challenged: {} };
}

export function topicAnswer(kase, cast, state, cid, topic) {
  const plain = { text: kase.talk.lines[cid][topic], slip: null };
  if (cast?.[cid] !== 'traveler') return plain;
  const slip = slipsOf(kase, cid).find(s => s.topic === topic);
  if (!slip || state.delivered?.[slip.id]) return plain;
  let fires = false;
  if (slip.when === 'always') fires = true;
  else if (slip.when === 'distracted') fires = (state.asked?.[cid]?.length ?? 0) >= 2;
  else fires = slipsOf(kase, cid).some(s => state.delivered?.[s.id] && (state.challenged?.[s.id] ?? 0) >= 1);
  return fires ? { text: slip.line, slip: slip.id } : plain;
}

// The answer to challenging a slip: its follow-ups in order, then the guarded line.
function challengeText(kase, state, cid, slip) {
  const n = state.challenged?.[slip.id] ?? 0;
  return n < slip.followUps.length ? slip.followUps[n] : kase.talk.replies[cid].guarded;
}

export function aboutAnswer(kase, state, cid, line, phrase) {
  const replies = kase.talk.replies[cid];
  if (line?.speaker !== cid) return { text: replies.neverSaid, followUp: null };
  const slip = line.slip ? slipsOf(kase, cid).find(s => s.id === line.slip) : null;
  if (slip && namesTerm(phrase, slip)) return { text: challengeText(kase, state, cid, slip), followUp: slip.id };
  const gloss = (kase.talk.glossary ?? []).find(g => g.terms.some(t => hasTerm(phrase, t)));
  if (gloss) return { text: gloss.text, followUp: null };
  return { text: replies.wordReply, followUp: null };
}

export function typedRoute(kase, state, cid, question) {
  if (asksTimeTravel(question)) return { kind: 'denial', text: kase.talk.replies[cid].denial, followUp: null };
  for (const slip of slipsOf(kase, cid)) {
    if (state.delivered?.[slip.id] && citesTerm(question, slip)) {
      return { kind: 'followUp', text: challengeText(kase, state, cid, slip), followUp: slip.id };
    }
  }
  if (modernWords(question, terms(kase)).length) {
    return { kind: 'puzzled', text: kase.talk.replies[cid].puzzled, followUp: null };
  }
  return { kind: 'model', text: null, followUp: null };
}

// What the model may see of earlier turns: slip lines as their clean form, lexicon words masked.
export function modelHistory(kase, state, turns) {
  const all = Object.values(kase?.talk?.slips ?? {}).flat();
  const extra = terms(kase);
  return (turns ?? []).map(t => {
    const slip = all.find(s => state.delivered?.[s.id] !== undefined && state.delivered[s.id] === t.id);
    return { question: maskModern(t.question, extra), answer: slip ? slip.clean : t.answer };
  });
}

// True when a cited quote proves the accusation: the traveller's own delivered slip line, with its term inside the excerpt.
export function supports(kase, cast, state, character, cited) {
  if (cast?.[character] !== 'traveler') return false;
  const slips = slipsOf(kase, character);
  return (cited ?? []).some(q => q.character === character
    && slips.some(s => state.delivered?.[s.id] === q.line && citesTerm(q.text, s)));
}
