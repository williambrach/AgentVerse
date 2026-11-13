import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { InterviewProviderError } from './errors.mjs';
import { partOf, resolve } from './cases.mjs';
import { integerEnv } from './http-util.mjs';
import { modelHistory, newTalkState, terms } from './talk.mjs';
import { maskGuard } from './anachronism.mjs';
import { DEFAULT_TEMPLATES, renderTemplate } from './templates.mjs';

export const promptVersion = 'interview-v6';
export const threadPromptVersion = 'thread-v7';

export { DEFAULT_TEMPLATES, checkTemplate, renderTemplate } from './templates.mjs';

export { InterviewProviderError };

function integerSetting(value, fallback, name, minimum, maximum) {
  const range = `${name} must be an integer between ${minimum} and ${maximum}.`;
  let number;
  try { number = integerEnv(value, fallback, name); } catch { throw new Error(range); }
  if (number < minimum || number > maximum) throw new Error(range);
  return number;
}

function checkBaseUrl(raw, label = 'The model endpoint') {
  const baseUrl = String(raw).replace(/\/$/, '');
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error(`${label} must have a valid baseUrl.`); }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) {
    throw new Error(`${label} must use HTTPS (HTTP is allowed for a local model).`);
  }
  return baseUrl;
}

const EFFORTS = ['low', 'medium', 'high'];
// Unset means low: providers such as SDU default to max, which spends the whole budget thinking.
// "none" (or null in an endpoints file) sends no reasoning_effort, for a model that rejects the field.
export const DEFAULT_EFFORT = 'low';

// The hash covers everything but the key, so two machines with different keys but the same routing agree.
const hashEndpoints = endpoints => createHash('sha256')
  .update(JSON.stringify(endpoints.map(({ name, baseUrl, model, keyEnv, maxInFlight, tokenParam, timeoutMs, temperature, reasoningEffort }) => ({ name, baseUrl, model, keyEnv, maxInFlight, tokenParam, timeoutMs, temperature, reasoningEffort }))))
  .digest('hex').slice(0, 16);

export function loadEndpoints(env = process.env, readFile = path => readFileSync(path, 'utf8')) {
  const path = env.OVERRIDE_ENDPOINTS;
  let list;
  try { list = JSON.parse(readFile(path)); } catch (error) { throw new Error(`OVERRIDE_ENDPOINTS could not be read as JSON (${path}): ${error.code || error.name}.`); }
  if (!Array.isArray(list) || !list.length) throw new Error('OVERRIDE_ENDPOINTS must be a non-empty JSON array.');
  const names = new Set();
  const endpoints = list.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Endpoint #${index + 1} must be an object.`);
    const { name, model, keyEnv } = raw;
    if (typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(name)) throw new Error(`Endpoint #${index + 1} needs a name of letters, digits, - or _.`);
    if (names.has(name)) throw new Error(`Endpoint name ${name} is used twice.`);
    names.add(name);
    const label = `Endpoint ${name}`;
    if (typeof model !== 'string' || !model.trim()) throw new Error(`${label} needs a model.`);
    if (typeof keyEnv !== 'string' || !keyEnv.trim()) throw new Error(`${label} needs keyEnv, the name of its key variable.`);
    const key = env[keyEnv]?.trim();
    if (!key) throw new Error(`${label}: environment variable ${keyEnv} is not set.`);
    const tokenParam = raw.tokenParam ?? 'max_completion_tokens';
    if (!['max_completion_tokens', 'max_tokens'].includes(tokenParam)) throw new Error(`${label}: tokenParam must be max_completion_tokens or max_tokens.`);
    const temperature = raw.temperature ?? null;
    if (temperature !== null && !(typeof temperature === 'number' && temperature >= 0 && temperature <= 2)) throw new Error(`${label}: temperature must be a number between 0 and 2.`);
    const reasoningEffort = raw.reasoningEffort === undefined ? DEFAULT_EFFORT : raw.reasoningEffort === 'none' ? null : raw.reasoningEffort;
    if (reasoningEffort !== null && !EFFORTS.includes(reasoningEffort)) throw new Error(`${label}: reasoningEffort must be low, medium, high or none.`);
    return {
      name, baseUrl: checkBaseUrl(raw.baseUrl ?? '', label), model: model.trim(), key, keyEnv,
      maxInFlight: integerSetting(raw.maxInFlight, 200, `${label}: maxInFlight`, 1, 1000), tokenParam,
      timeoutMs: integerSetting(raw.timeoutMs, 25_000, `${label}: timeoutMs`, 1000, 120_000), temperature, reasoningEffort,
    };
  });
  return { endpoints, hash: hashEndpoints(endpoints) };
}

export function modelConfig(env = process.env) {
  const key = env.OVERRIDE_LLM_API_KEY?.trim();
  const model = env.OVERRIDE_LLM_MODEL?.trim();
  const maxCompletionTokens = integerSetting(env.OVERRIDE_LLM_MAX_COMPLETION_TOKENS, 2048, 'OVERRIDE_LLM_MAX_COMPLETION_TOKENS', 256, 8192);
  const timeoutMs = integerSetting(env.OVERRIDE_LLM_TIMEOUT_MS, 60_000, 'OVERRIDE_LLM_TIMEOUT_MS', 1000, 120_000);
  const maxInFlight = integerSetting(env.OVERRIDE_LLM_MAX_IN_FLIGHT, 300, 'OVERRIDE_LLM_MAX_IN_FLIGHT', 1, 10_000);
  const failover = {
    failures: integerSetting(env.OVERRIDE_LLM_FAILOVER_FAILURES, 5, 'OVERRIDE_LLM_FAILOVER_FAILURES', 1, 1000),
    windowMs: integerSetting(env.OVERRIDE_LLM_FAILOVER_WINDOW_MS, 30_000, 'OVERRIDE_LLM_FAILOVER_WINDOW_MS', 1000, 600_000),
  };
  const effortSetting = env.OVERRIDE_LLM_REASONING_EFFORT?.trim() || DEFAULT_EFFORT;
  const effortRaw = effortSetting === 'none' ? null : effortSetting;
  if (effortRaw !== null && !EFFORTS.includes(effortRaw)) throw new Error('OVERRIDE_LLM_REASONING_EFFORT must be low, medium, high or none.');
  // Optional: one seed for every game's "Let them talk" order, to replay a run.
  const talkSeed = env.OVERRIDE_TALK_SEED?.trim() || null;
  const shared = { promptVersion, maxCompletionTokens, timeoutMs, maxInFlight, failover, ...(talkSeed ? { talkSeed } : {}) };
  if (env.OVERRIDE_ENDPOINTS) {
    const { endpoints, hash } = loadEndpoints(env);
    return { mode: 'live', endpoints, endpointsHash: hash, model: endpoints[0].model, ...shared };
  }
  if (Boolean(key) !== Boolean(model)) throw new Error('Set both OVERRIDE_LLM_API_KEY and OVERRIDE_LLM_MODEL, or leave both empty for rehearsal mode.');
  const baseUrl = checkBaseUrl(env.OVERRIDE_LLM_BASE_URL || 'https://api.openai.com/v1');
  if (!key) return { mode: 'rehearsal', endpoints: [], endpointsHash: null, model: null, ...shared };
  const endpoints = [{ name: 'a', baseUrl, model, key, keyEnv: 'OVERRIDE_LLM_API_KEY', maxInFlight: Math.min(maxInFlight, 200), tokenParam: 'max_completion_tokens', timeoutMs, temperature: null, reasoningEffort: effortRaw }];
  return { mode: 'live', endpoints, endpointsHash: hashEndpoints(endpoints), model, ...shared };
}

// The one set of instructions a character gets, in a chat and in the thread alike: the case's own rules,
// with the name, part name and knowledge filled in.
export function systemPrompt(kase, session, characterId) {
  const character = kase.characters.find(c => c.id === characterId);
  const part = partOf(kase, session.cast, characterId);
  const say = text => resolve(kase, session.cast, text);
  // A part with its own rules uses them instead of the case's.
  return renderTemplate(part.rules === undefined ? kase.rules : say(part.rules), {
    name: character.name, label: say(character.label ?? part.label), version: kase.version,
    promptVersion: kase.prompts?.interviewVersion ?? promptVersion, frame: kase.world.frame, frameFirst: kase.world.frame.split('. ')[0],
    persona: kase.world.persona, memory: kase.world.memory,
    // A character's secret for the dealt part sits between its own story and the part's knowledge.
    knowledge: [...(character.knowledge ?? []), ...(character.secrets?.[part.id] ? [character.secrets[part.id]] : []), ...(part.knowledge ?? [])].map(say).join('\n'),
  });
}

export function buildMessages(kase, session, characterId, question) {
  const instructions = systemPrompt(kase, session, characterId);
  // A talk case never shows the model a slip line or a lexicon word: history is cleaned and the question masked.
  const talk = Boolean(kase.talk);
  const turns = talk ? modelHistory(kase, session.talk ?? newTalkState(kase), session.interviews[characterId]) : session.interviews[characterId];
  const history = turns.flatMap(turn => [
    { role: 'user', content: JSON.stringify({ question: turn.question }) },
    { role: 'assistant', content: turn.answer },
  ]);
  return [
    { role: 'system', content: instructions },
    ...history,
    { role: 'user', content: JSON.stringify({ question: talk ? maskGuard(question, terms(kase)) : question }) },
  ];
}

// Rehearsal mode uses the case's own scripted replies, explicitly labeled and
// deterministic: never a silent live fallback. Live mode goes through the router.
export async function answerInterview(config, kase, session, characterId, question, router, context = {}) {
  if (config.mode === 'rehearsal') return { answer: resolve(kase, session.cast, kase.rehearsal(session.cast[characterId], question)), provenance: null, reasoning: null };
  const { sessionId, questionEventId, onAttempt } = context;
  const { content, reasoning = null, provenance } = await router.complete({ messages: buildMessages(kase, session, characterId, question), sessionId, questionEventId, onAttempt });
  return { answer: content, provenance, reasoning };
}

// The forum thread: what was said out loud (thread lines) plus the speaker's OWN chat with the player.
// A chat is private to the player and that one character: no other character's chat ever reaches this prompt.
export function buildThreadMessages(kase, session, characterId) {
  const { characters } = kase;
  const others = characters.filter(c => c.id !== characterId).map(c => c.name);
  const nameOf = id => characters.find(c => c.id === id)?.name ?? id;
  // Only the speaker's own part reaches the instructions: its label and knowledge, names resolved through the cast.
  const instructions = systemPrompt(kase, session, characterId);
  const task = renderTemplate(kase.prompts?.thread ?? DEFAULT_TEMPLATES.thread, { others: others.join(' and ') });
  // Thread lines are logged in time order.
  const posts = (session.thread || []).map((l, i) => ({ post: i + 1, author: nameOf(l.character), text: l.text }));
  // Only this speaker's turns. A talk case cleans them as it does for an interview.
  const turns = session.interviews?.[characterId] ?? [];
  const own = kase.talk ? modelHistory(kase, session.talk ?? newTalkState(kase), turns) : turns;
  const privateChat = own.map(t => ({ question: t.question, answer: t.answer }));
  return [
    { role: 'system', content: instructions },
    { role: 'user', content: JSON.stringify({ task, privateChat, thread: posts }) },
  ];
}

export async function answerThread(config, kase, session, characterId, router, context = {}) {
  if (config.mode === 'rehearsal') {
    const n = (session.thread || []).filter(l => l.character === characterId).length;
    const name = kase.characters.find(c => c.id === characterId).name;
    const template = kase.rehearsalChatter?.(session.cast[characterId], n);
    return { text: template ? resolve(kase, session.cast, template) : `${name} has nothing to add.`, reasoning: null, provenance: null };
  }
  const { sessionId, lineEventId, onAttempt } = context;
  const { content, reasoning = null, provenance } = await router.complete({ messages: buildThreadMessages(kase, session, characterId), sessionId, questionEventId: lineEventId ?? null, onAttempt });
  return { text: content, reasoning, provenance };
}
