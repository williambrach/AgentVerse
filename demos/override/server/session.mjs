import { randomUUID, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { publicView, listCases, findCase, partOf, identityCast, resolve as resolveText } from './cases.mjs';
import { ROLES, ROLE_IDS } from './roles.mjs';
import { cases as registry } from './cases/index.mjs';
import { answerInterview, promptVersion } from './interviews.mjs';
import { appendJsonl, dataPaths, readJsonl } from './dataset.mjs';

// Fisher-Yates with crypto.randomInt: a uniform random permutation.
export function shuffleIds(ids) {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A cast is a bijection from the case's character ids to its part ids.
const validCast = (kase, cast) => {
  if (!cast || typeof cast !== 'object' || Array.isArray(cast)) return false;
  const ids = kase.characters.map(c => c.id), parts = kase.parts.map(p => p.id);
  const keys = Object.keys(cast), values = Object.values(cast);
  return keys.length === ids.length && ids.every(id => Object.hasOwn(cast, id))
    && new Set(values).size === parts.length && parts.every(id => values.includes(id));
};

export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Rebuild a session from its append-only log. Events keep the legacy clue keys
// (always null) and replay ignores them. The first event names the case;
// logs for an unregistered or re-versioned case, logs from another schema,
// reset sessions, and gaps in the sequence are not restored.
export function replay(events, cases) {
  const first = events[0];
  const kase = first && cases.find(c => c.id === first.caseId && c.version === first.caseVersion);
  if (!kase) return null;
  let s = null;
  for (const e of events) {
    if (e.schemaVersion !== 3 || e.caseId !== kase.id || e.caseVersion !== kase.version || e.type === 'session_reset') return null;
    if (e.type === 'session_started') {
      if (s || !validCast(kase, e.cast)) return null;
      s = { id: e.sessionId, revision: 0, startedAt: new Date(Date.parse(e.timestamp) - e.elapsedMs).toISOString(),
        status: 'active', caseId: kase.id, cast: { ...e.cast },
        location: 'briefing', interviews: Object.fromEntries(kase.characters.map(c => [c.id, []])), verdict: null };
    }
    if (!s || e.sessionId !== s.id || e.sequence !== s.revision + 1) return null;
    s.revision = e.sequence;
    if (e.type === 'location_visited') s.location = e.location;
    if (e.type === 'interview_answer') s.interviews[e.character].push({ question: e.question, answer: e.answer, timestamp: e.timestamp });
    if (e.type === 'verdict_submitted') { s.verdict = e.verdict; s.status = 'closed'; }
  }
  return s;
}

// At most `limit` takes per `windowMs` per key; refused takes are not counted.
class Window {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.hits = []; }
  take(now = Date.now()) {
    while (this.hits.length && now - this.hits[0] >= this.windowMs) this.hits.shift();
    if (this.hits.length >= this.limit) return false;
    this.hits.push(now);
    return true;
  }
}

// One independent investigation per player, keyed by session ID. Idle games
// leave memory and are rebuilt from their log on the next request, so progress
// also survives a restart. Each game plays one registered case.
export class Investigations {
  constructor({ dataDir, config, router = null, answer = null, idleMs = 30 * 60_000, meta = {}, onEvent = () => {}, cases = registry, dev = false, shuffle = shuffleIds }) {
    for (const c of cases) if (c.legacy) throw new Error(`Case ${c.id} has no parts; roles need a part case.`);
    this.shuffle = shuffle;
    this.paths = dataPaths(dataDir);
    this.config = config;
    this.router = router;
    this.answer = answer || ((cfg, kase, session, characterId, question, ctx) => answerInterview(cfg, kase, session, characterId, question, this.router, ctx));
    this.idleMs = idleMs;
    this.meta = meta;
    this.onEvent = onEvent;
    this.cases = cases;
    this.dev = dev;
    this.games = new Map();
    this.pending = new Set();
    this.paused = false;
    this.newGames = new Window(20, 1000);
  }

  catalog() {
    return listCases(this.cases, { dev: this.dev });
  }

  create(session, kase) {
    return new Investigation({ dataDir: this.paths.root, config: this.config, answer: this.answer, kase, session, shuffle: this.shuffle, meta: this.meta, onEvent: this.onEvent });
  }

  find(sessionId) {
    if (!sessionIdPattern.test(sessionId || '')) return null;
    let game = this.games.get(sessionId);
    if (!game) {
      let session;
      try { session = replay(readJsonl(resolve(this.paths.sessions, `${sessionId}.jsonl`), { repair: true }), this.cases); } catch { return null; }
      if (!session) return null;
      game = this.create(session, this.cases.find(c => c.id === session.caseId));
      this.games.set(sessionId, game);
    }
    game.touched = Date.now();
    return game;
  }

  view(sessionId) {
    return (this.find(sessionId) || this.create(null, this.cases[0])).view();
  }

  async mutate(sessionId, action, input = {}) {
    const now = Date.now();
    for (const [id, game] of this.games) if (!game.busy && now - game.touched > this.idleMs) this.games.delete(id);
    let kase;
    if (['start', 'reset'].includes(action) && input.caseId !== undefined) {
      kase = findCase(this.cases, input.caseId, { dev: this.dev });
      if (!kase) throw new RequestError(400, 'Unknown case.');
    }
    const game = this.find(sessionId) || this.create(null, kase || this.cases[0]);
    if (action === 'start' && this.paused) throw new RequestError(503, 'New games are paused. Try again shortly.');
    if ((action === 'start' || action === 'reset') && !this.newGames.take(now)) throw new RequestError(429, 'Too many new games right now. Try again in a moment.');
    const run = game.mutate(action, input, { kase, assignment: kase ? 'fixed' : 'default' });
    this.pending.add(run);
    try {
      const view = await run;
      // A reset gives the player a new session ID; the previous log stays on disk.
      if (game.session.id !== sessionId) this.games.delete(sessionId);
      this.games.set(game.session.id, game);
      return view;
    } finally { this.pending.delete(run); }
  }

  export(sessionId) {
    const game = this.find(sessionId);
    if (!game) throw new RequestError(404, 'There is no session to export.');
    return game.export();
  }

  setPaused(paused) { this.paused = Boolean(paused); }

  stats() {
    const byStage = { started: 0, asked: 0, interviewed: 0, verdict: 0 };
    let waiting = 0;
    for (const game of this.games.values()) {
      const s = game.session;
      if (game.busy) waiting++;
      if (!s) continue;
      byStage[s.status === 'closed' ? 'verdict' : game.kase.characters.every(c => s.interviews[c.id].length) ? 'interviewed' : Object.values(s.interviews).some(list => list.length) ? 'asked' : 'started']++;
    }
    return { games: this.games.size, waiting, paused: this.paused, byStage };
  }

  async idle() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}

export class Investigation {
  constructor({ dataDir, config, kase, answer = null, session = null, meta = {}, onEvent = () => {}, shuffle = shuffleIds }) {
    this.shuffle = shuffle;
    this.paths = dataPaths(dataDir);
    this.kase = kase;
    this.config = config;
    this.answer = answer || ((cfg, k, s, characterId, question, ctx) => answerInterview(cfg, k, s, characterId, question, null, ctx));
    this.meta = meta;
    this.onEvent = onEvent;
    this.asked = new Window(6, 60_000);
    this.session = session;
    this.busy = false;
    this.touched = Date.now();
  }

  log(type, details = {}, state = this.session) {
    const now = Date.now();
    const event = {
      schemaVersion: 3,
      eventId: randomUUID(),
      sessionId: state.id,
      caseId: this.kase.id,
      caseVersion: this.kase.version,
      contentHash: this.kase.contentHash,
      promptVersion,
      sequence: state.revision + 1,
      timestamp: new Date(now).toISOString(),
      elapsedMs: now - Date.parse(state.startedAt),
      type,
      revealedPosition: null,
      selectedEvidence: null,
      character: null,
      question: null,
      answer: null,
      mode: this.config.mode,
      model: this.config.model,
      ...details,
    };
    // Write before acknowledging a mutation. Failed writes must not silently lose data.
    appendJsonl(this.file(state.id), event, 'session');
    this.wrote = state.id;
    state.revision += 1;
    try { this.onEvent(event); } catch { /* observers must not break the game */ }
    return event;
  }

  file(id) { return resolve(this.paths.sessions, `${id}.jsonl`); }

  view() {
    const s = this.session;
    const { kase } = this;
    // Before a game starts there is no cast; the preview deals parts in persona order and reveals nothing drawn.
    const cast = s?.cast ?? identityCast(kase);
    let session = null;
    if (s) { session = structuredClone(s); delete session.cast; }
    return {
      ...publicView(kase, cast), roles: ROLES, authored: true, mode: this.config.mode, model: this.config.model,
      session, debrief: s?.status === 'closed' ? this.debrief(s) : null,
    };
  }

  debrief(s) {
    const { kase } = this;
    const say = text => resolveText(kase, s.cast, text);
    const { verdict } = s;
    return {
      title: say(kase.debrief.title), summary: say(kase.debrief.summary), lesson: say(kase.debrief.lesson),
      feedback: say(verdict.score === verdict.total ? kase.answer.feedback.correct : kase.answer.feedback.other),
      score: verdict.score, total: verdict.total,
      findings: kase.characters.map(c => {
        const part = partOf(kase, s.cast, c.id);
        return { character: c.id, role: verdict.truth[c.id], picked: verdict.roles[c.id], correct: verdict.results[c.id],
          classification: say(part.finding.classification), explanation: say(part.finding.explanation) };
      }),
    };
  }

  ensureCurrent(input) {
    if (!this.session) throw new RequestError(409, 'Start the case first.');
    if (input.sessionId !== this.session.id || input.revision !== this.session.revision) {
      throw new RequestError(409, 'The case changed in another window. Your view has been refreshed; try again.');
    }
  }

  async mutate(action, input = {}, { kase = null, assignment = 'default' } = {}) {
    if (this.busy) throw new RequestError(409, 'An interview is still in progress. Wait for the answer, then try again.');
    this.busy = true;
    this.wrote = null;
    const before = this.session ? structuredClone(this.session) : null;
    const beforeKase = this.kase;
    try {
      if (action === 'start') {
        if (this.session) throw new RequestError(409, 'A case is already active. Continue it or reset for the next investigator.');
        if (kase) this.kase = kase;
        this.start(assignment);
      } else {
        this.ensureCurrent(input);
        const s = this.session;
        const { characters } = this.kase;
        if (action === 'reset') {
          this.log('session_reset', { completed: s.status === 'closed' });
          if (kase) this.kase = kase;
          this.start(assignment);
        } else {
          if (s.status !== 'active') throw new RequestError(409, 'This case is closed. Review the debrief or start a new session.');
          if (action === 'visit') {
            if (!['briefing', 'report', ...characters.map(c => c.id)].includes(input.location)) throw new RequestError(400, 'Unknown station location.');
            s.location = input.location;
            this.log('location_visited', { location: input.location });
          } else if (action === 'interview') {
            await this.interview(input);
          } else if (action === 'verdict') {
            this.verdict(input);
          } else throw new RequestError(404, 'Unknown action.');
        }
      }
      return this.view();
    } catch (error) {
      // Rejected input must not partially alter progress. Interview failures are
      // intentionally logged and preserve the resulting sequence counter.
      if (!error.logged) {
        this.session = before;
        this.kase = beforeKase;
        // A multi-event action may have written some events before failing; memory
        // must match the log or the next event would repeat a sequence number.
        if (this.wrote) {
          try { this.session = replay(readJsonl(this.file(this.wrote)), [this.kase]); } catch { this.session = before; }
        }
      }
      throw error;
    } finally { this.busy = false; }
  }

  start(assignment = 'default') {
    const ids = this.kase.characters.map(c => c.id);
    const dealt = this.shuffle(this.kase.parts.map(p => p.id));
    const cast = Object.fromEntries(ids.map((id, i) => [id, dealt[i]]));
    this.session = {
      id: randomUUID(), revision: 0, startedAt: new Date().toISOString(),
      status: 'active', caseId: this.kase.id, cast,
      location: 'briefing', interviews: Object.fromEntries(this.kase.characters.map(c => [c.id, []])), verdict: null,
    };
    this.log('session_started', { assignment, cast, env: null, appCommit: null, appDirty: null, endpointsHash: this.config.endpointsHash ?? null, ...this.meta });
    this.log('briefing_viewed');
  }

  async interview(input) {
    const s = this.session;
    const { characters, world: w } = this.kase;
    const character = characters.find(c => c.id === input.character);
    if (!character) throw new RequestError(400, `Choose one of the ${characters.length} ${w.cast.many}.`);
    if (typeof input.question !== 'string' || input.question.trim().length < 3 || input.question.length > 1200) throw new RequestError(400, 'Ask a question between 3 and 1,200 characters.');
    if (s.interviews[character.id].length >= 40) throw new RequestError(400, 'This demo supports 40 questions per character. Submit your findings or start a new session.');
    if (!this.asked.take()) throw new RequestError(429, 'Slow down: at most 6 questions per minute.');
    const question = input.question.trim();
    const asked = this.log('interview_question', { character: character.id, question });
    try {
      const result = await this.answer(this.config, this.kase, structuredClone(s), character.id, question, {
        sessionId: s.id, questionEventId: asked.eventId,
        onAttempt: diagnostics => { this.log('interview_provider_response', { character: character.id, question, questionEventId: asked.eventId, ...diagnostics }); },
      });
      const answer = typeof result === 'string' ? result : result.answer;
      const provenance = typeof result === 'string' ? null : result.provenance ?? null;
      const answered = this.log('interview_answer', { character: character.id, question, answer, questionEventId: asked.eventId, provenance });
      s.interviews[character.id].push({ question, answer, timestamp: answered.timestamp });
    } catch (error) {
      const providerError = error?.name === 'InterviewProviderError';
      this.log('interview_failed', { character: character.id, question, questionEventId: asked.eventId, reason: providerError ? error.code : 'provider_or_storage_error', ...(providerError ? error.diagnostics : {}), provenance: error?.provenance ?? null });
      const failure = new RequestError(502, providerError ? error.message : 'The interview could not complete. Check the server’s storage and retry.');
      failure.logged = true;
      throw failure;
    }
  }

  verdict(input) {
    const s = this.session;
    const { characters } = this.kase;
    if (characters.some(c => !s.interviews[c.id].length)) throw new RequestError(400, `Ask all ${characters.length} ${this.kase.world.cast.many} before choosing.`);
    const picks = input.roles;
    const ids = characters.map(c => c.id);
    const pickedOk = picks && typeof picks === 'object' && !Array.isArray(picks)
      && Object.keys(picks).length === ids.length && ids.every(id => Object.hasOwn(picks, id) && ROLE_IDS.includes(picks[id]));
    if (!pickedOk) throw new RequestError(400, `Pick a role for each ${this.kase.world.cast.one.replace(/^an? /, '')}.`);
    if (!Number.isInteger(input.confidence) || input.confidence < 0 || input.confidence > 100) throw new RequestError(400, 'Confidence must be between 0 and 100.');
    const explanation = input.explanation ?? '';
    if (typeof explanation !== 'string' || explanation.length > 500) throw new RequestError(400, 'Keep your explanation under 500 characters.');
    const roles = Object.fromEntries(ids.map(id => [id, picks[id]]));
    const truth = Object.fromEntries(ids.map(id => [id, partOf(this.kase, s.cast, id).role]));
    const results = Object.fromEntries(ids.map(id => [id, roles[id] === truth[id]]));
    s.verdict = {
      roles, truth, results, score: ids.filter(id => results[id]).length, total: ids.length,
      confidence: input.confidence, explanation: explanation.trim(),
      evidenceIds: [], submittedAt: new Date().toISOString(),
    };
    s.status = 'closed';
    this.log('verdict_submitted', { verdict: s.verdict });
    this.log('debrief_viewed');
  }

  export() {
    if (!this.session) throw new RequestError(404, 'There is no session to export.');
    const text = readFileSync(this.file(this.session.id), 'utf8');
    if (this.session.status === 'closed') return text;
    // While the game is on, the cast stays secret: only the first line is rewritten.
    const lines = text.split('\n');
    const head = JSON.parse(lines[0]);
    if (head.type === 'session_started') { head.cast = null; lines[0] = JSON.stringify(head); }
    return lines.join('\n');
  }
}
