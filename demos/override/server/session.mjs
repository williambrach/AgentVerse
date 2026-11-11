import { randomUUID, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { publicView, listCases, findCase, partOf, identityCast, rolesOf, resolve as resolveText } from './cases.mjs';
import { cases as registry } from './cases/index.mjs';
import { answerInterview, answerThread, promptVersion, threadPromptVersion } from './interviews.mjs';
import { economyRules, createWallet, quote, spend } from './economy.mjs';
import { appendJsonl, dataPaths, readJsonl } from './dataset.mjs';
import { alarmOf, scheduleOf } from './deadline.mjs';
import { rot13 } from './cipher.mjs';
import { newTalkState, topicAnswer, aboutAnswer, typedRoute, supports, terms } from './talk.mjs';
import { guardHits } from './anachronism.mjs';

// One log line with reasoning_inspected reasoning in ROT13; other lines pass through untouched.
function encipher(line) {
  if (!line.includes('"reasoning_inspected"')) return line;
  try {
    const e = JSON.parse(line);
    if (e.type !== 'reasoning_inspected' || typeof e.reasoning !== 'string') return line;
    return JSON.stringify({ ...e, reasoning: rot13(e.reasoning) });
  } catch { return line; }
}

// Fisher-Yates with crypto.randomInt: a uniform random permutation.
// A line with a `hidden` object loses it while the game is open; other lines pass through untouched.
function stripHidden(line) {
  if (!line.includes('"hidden"')) return line;
  try {
    const e = JSON.parse(line);
    if (!e || typeof e !== 'object' || !Object.hasOwn(e, 'hidden')) return line;
    delete e.hidden;
    return JSON.stringify(e);
  } catch { return line; }
}

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

const reasoningLimit = 4000;

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Rebuild a session from its append-only log. The first event names the case;
// logs for an unregistered or re-versioned case, logs from another schema,
// reset sessions, and gaps in the sequence are not restored. When `lastSaid`
// (a Map) is given it is filled with each character's latest spoken event id.
export function replay(events, cases, lastSaid = null) {
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
        location: 'briefing', interviews: Object.fromEntries(kase.characters.map(c => [c.id, []])), verdict: null,
        economy: createWallet(e.economy ?? economyRules({})), thread: [], chatter: { round: 0, pending: 0 }, inspections: [],
        team: e.team && typeof e.team.id === 'string' && typeof e.team.name === 'string' ? { id: e.team.id, name: e.team.name } : null };
      if (kase.evidence) s.examined = [];
      if (kase.talk) s.talk = newTalkState(kase);
    }
    if (!s || e.sessionId !== s.id || e.sequence !== s.revision + 1) return null;
    s.revision = e.sequence;
    if (e.spend) {
      s.economy.spent = e.spend.total;
      for (const tool of e.spend.tools) if (s.economy.charges[tool]) s.economy.charges[tool].used += 1;
    }
    if (e.type === 'location_visited') {
      s.location = e.location;
      const found = kase.evidence && typeof e.location === 'string' && e.location.startsWith('evidence:') ? e.location.slice(9) : null;
      if (found && kase.evidence.some(x => x.id === found) && !s.examined.includes(found)) s.examined.push(found);
    }
    if (lastSaid && (e.type === 'interview_answer' || e.type === 'chatter_line')) lastSaid.set(e.character, e.eventId);
    if (e.type === 'chatter_line') {
      s.thread.push({ character: e.character, text: e.text, round: e.round, timestamp: e.timestamp });
      // Rounds were 3 lines before roundLines was logged; older logs keep that.
      s.chatter = { round: e.round, pending: (e.roundLines ?? 3) - e.line };
    }
    if (e.type === 'reasoning_inspected') s.inspections.push({ character: e.character, sourceEventId: e.sourceEventId, reasoning: e.reasoning, timestamp: e.timestamp });
    if (e.type === 'interview_answer') {
      if (kase.talk && e.kind) {
        s.interviews[e.character].push({ question: e.question, answer: e.answer, timestamp: e.timestamp, id: e.eventId, kind: e.kind, topic: e.topic ?? null });
        if (e.kind === 'topic' && e.topic && !s.talk.asked[e.character].includes(e.topic)) s.talk.asked[e.character].push(e.topic);
        if (e.hidden?.slip) s.talk.delivered[e.hidden.slip] = e.eventId;
        if (e.hidden?.followUp) s.talk.challenged[e.hidden.followUp] = (s.talk.challenged[e.hidden.followUp] ?? 0) + 1;
      } else s.interviews[e.character].push({ question: e.question, answer: e.answer, timestamp: e.timestamp });
    }
    if (kase.talk && e.type === 'quote_saved') s.talk.quotes.push({ id: e.eventId, line: e.quote.line, character: e.quote.character, text: e.quote.text, at: e.timestamp });
    if (kase.talk && e.type === 'quote_removed') s.talk.quotes = s.talk.quotes.filter(q => q.id !== e.quote);
    if (kase.talk && e.type === 'accusation_rejected') s.talk.accusations.push({ id: e.eventId, character: e.character, quotes: e.quotes, at: e.timestamp });
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
  constructor({ dataDir, config, router = null, answer = null, thread = null, idleMs = 30 * 60_000, meta = {}, onEvent = () => {}, cases = registry, content = null, dev = false, shuffle = shuffleIds }) {
    this.shuffle = shuffle;
    this.paths = dataPaths(dataDir);
    this.config = config;
    this.router = router;
    this.answer = answer || ((cfg, kase, session, characterId, question, ctx) => answerInterview(cfg, kase, session, characterId, question, this.router, ctx));
    this.thread = thread || ((cfg, kase, session, characterId, ctx) => answerThread(cfg, kase, session, characterId, this.router, ctx));
    this.idleMs = idleMs;
    this.meta = meta;
    this.onEvent = onEvent;
    Object.defineProperty(this, 'cases', { enumerable: true, get: () => (content ? content.list() : cases) });
    this.dev = dev;
    this.games = new Map();
    this.pending = new Set();
    this.paused = false;
    this.newGames = new Window(100, 1000);
  }

  catalog() {
    return listCases(this.cases, { dev: this.dev });
  }

  create(session, kase, lastSaid = null) {
    return new Investigation({ dev: this.dev, dataDir: this.paths.root, paths: this.paths, lastSaid, config: this.config, answer: this.answer, thread: this.thread, kase, session, shuffle: this.shuffle, meta: this.meta, onEvent: this.onEvent });
  }

  find(sessionId) {
    if (!sessionIdPattern.test(sessionId || '')) return null;
    let game = this.games.get(sessionId);
    if (!game) {
      let session;
      const lastSaid = new Map();
      try { session = replay(readJsonl(resolve(this.paths.sessions, `${sessionId}.jsonl`), { repair: true }), this.cases, lastSaid); } catch { return null; }
      if (!session) return null;
      game = this.create(session, this.cases.find(c => c.id === session.caseId), lastSaid);
      this.games.set(sessionId, game);
    }
    game.touched = Date.now();
    return game;
  }

  view(sessionId) {
    const game = this.find(sessionId);
    if (!game) return this.create(null, this.cases[0]).view();
    // The clock may have run out while nobody was asking; mark it before showing the state.
    // A failed log write is retried by the next request; this read still answers.
    if (!game.busy) { try { game.expire(Date.now()); } catch { /* expire restored the game */ } }
    return game.view();
  }

  async mutate(sessionId, action, input = {}, { team = null } = {}) {
    const now = Date.now();
    for (const [id, game] of this.games) if (!game.busy && now - game.touched > this.idleMs) this.games.delete(id);
    let kase;
    if (['start', 'reset'].includes(action) && input.caseId !== undefined) {
      kase = findCase(this.cases, input.caseId, { dev: this.dev });
      if (!kase) throw new RequestError(400, 'Unknown case.');
    }
    const game = this.find(sessionId) || this.create(null, kase || this.cases[0]);
    if (action === 'reset' && input.caseId === undefined) kase = this.cases.find(c => c.id === game.kase.id);
    if (action === 'start' && this.paused) throw new RequestError(503, 'New games are paused. Try again shortly.');
    // Only a start or reset that will create a session takes a slot; a repeat start on an active game is a 409 and costs none.
    const makesSession = action === 'reset' || (action === 'start' && !game.session);
    if (makesSession && !this.newGames.take(now)) throw new RequestError(429, 'Too many new games right now. Try again in a moment.');
    const run = game.mutate(action, input, { kase, assignment: input.caseId !== undefined ? 'fixed' : 'default', team });
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
  constructor({ dataDir, dev = false, paths = null, lastSaid = null, config, kase, answer = null, thread = null, session = null, meta = {}, onEvent = () => {}, shuffle = shuffleIds }) {
    this.shuffle = shuffle;
    this.dev = dev;
    this.paths = paths ?? dataPaths(dataDir);
    // characterId -> eventId of their latest interview answer or chatter line; mirrors the log.
    this.lastSaid = lastSaid ?? new Map();
    this.kase = kase;
    this.config = config;
    this.answer = answer || ((cfg, k, s, characterId, question, ctx) => answerInterview(cfg, k, s, characterId, question, null, ctx));
    this.thread = thread || ((cfg, k, s, characterId, ctx) => answerThread(cfg, k, s, characterId, null, ctx));
    this.reasoning = new Map();
    this.meta = meta;
    this.onEvent = onEvent;
    this.session = session;
    this.busy = false;
    this.touched = Date.now();
  }

  // `at` stamps the event at an earlier moment (ms since epoch), such as a deadline noticed late.
  log(type, details = {}, state = this.session, at = Date.now()) {
    const now = at;
    const event = {
      schemaVersion: 3,
      eventId: randomUUID(),
      sessionId: state.id,
      caseId: this.kase.id,
      caseVersion: this.kase.version,
      contentHash: this.kase.contentHash,
      promptVersion: this.kase.prompts?.interviewVersion ?? promptVersion,
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
    if (type === 'interview_answer' || type === 'chatter_line') this.lastSaid.set(event.character, event.eventId);
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
    if (s) {
      session = structuredClone(s); delete session.cast; session.inspectable = this.inspectable();
      if (kase.talk) {
        session.talk = {
          asked: structuredClone(s.talk.asked), quotes: structuredClone(s.talk.quotes),
          accusations: s.talk.accusations.map(a => ({ ...structuredClone(a), feedback: resolveText(kase, s.cast, kase.answer.feedback.other), denial: kase.talk.replies[a.character].denial })),
        };
      }
      if (kase.evidence) session.evidence = s.examined.map(id => { const x = kase.evidence.find(y => y.id === id); return { id, title: x.title, text: resolveText(kase, s.cast, x.text) }; });
      if (kase.cipher === 'rot13') session.inspections = session.inspections.map(i => ({ ...i, reasoning: rot13(i.reasoning) }));
      const alarm = this.alarm(s);
      if (alarm) session.alarm = alarm;
    }
    return {
      ...publicView(kase, cast), roles: rolesOf(kase), authored: true, mode: this.config.mode, model: this.config.model,
      session, debrief: s?.status === 'closed' ? this.debrief(s) : null,
    };
  }

  schedule() { return scheduleOf(this.kase, this.dev); }

  // The hidden clock's state; only cases with a deadline have one. Once closed it stops at the escape or at the verdict.
  alarm(s, now = Date.now()) {
    const schedule = this.schedule();
    if (!schedule) return null;
    if (s.status !== 'closed') {
      // An open session never reports the escape: it shows the last warning until expire() closes it with a debrief.
      const a = alarmOf(schedule, now - Date.parse(s.startedAt));
      return a !== 'escaped' ? a : schedule.warnAt[1] !== undefined ? 'warning2' : schedule.warnAt[0] !== undefined ? 'warning1' : 'calm';
    }
    if (s.verdict?.outcome === 'escaped') return 'escaped';
    return alarmOf(schedule, Date.parse(s.verdict?.submittedAt ?? now) - Date.parse(s.startedAt));
  }

  // Close the session as a loss once the deadline has passed. Logs one verdict_submitted, only while active.
  expire(now = Date.now()) {
    const s = this.session;
    const schedule = this.schedule();
    if (!s || s.status !== 'active' || !schedule || now - Date.parse(s.startedAt) < schedule.escapeAt * 1000) return false;
    const ids = this.kase.characters.map(c => c.id);
    // The loss happened at the deadline, however late the next request noticed it.
    const mark = Date.parse(s.startedAt) + schedule.escapeAt * 1000;
    const revision = s.revision;
    s.verdict = {
      outcome: 'escaped', roles: {}, score: 0, total: ids.length,
      truth: Object.fromEntries(ids.map(id => [id, partOf(this.kase, s.cast, id).role])),
      results: Object.fromEntries(ids.map(id => [id, false])),
      confidence: 0, explanation: '', evidenceIds: [], submittedAt: new Date(mark).toISOString(),
    };
    s.status = 'closed';
    try {
      this.log('verdict_submitted', { verdict: s.verdict, coins: { spent: s.economy.spent, budget: s.economy.budget } }, s, mark);
      this.log('debrief_viewed', {}, s, mark);
    } catch (error) {
      if (s.revision === revision) { s.verdict = null; s.status = 'active'; } else {
        // One event reached the log: memory must follow it.
        try {
          const fresh = new Map();
          this.session = replay(readJsonl(this.file(s.id)), [this.kase], fresh);
          this.lastSaid = fresh;
        } catch { s.verdict = null; s.status = 'active'; }
      }
      throw error;
    }
    return true;
  }

  debrief(s) {
    const { kase } = this;
    const say = text => resolveText(kase, s.cast, text);
    const { verdict } = s;
    const escaped = verdict.outcome === 'escaped';
    const copy = escaped ? { title: say(kase.deadline.escape.title), summary: say(kase.deadline.escape.summary) } : { title: say(kase.debrief.title), summary: say(kase.debrief.summary) };
    const accusation = kase.talk && !escaped ? verdict.accusation : null;
    return {
      ...(escaped ? { outcome: 'escaped' } : {}), ...copy, lesson: say(kase.debrief.lesson),
      feedback: say(accusation ? kase.answer.feedback.correct : escaped && kase.deadline.escape.feedback ? kase.deadline.escape.feedback : !escaped && verdict.score === verdict.total ? kase.answer.feedback.correct : kase.answer.feedback.other),
      score: verdict.score, total: verdict.total,
      findings: kase.characters.map(c => {
        const part = partOf(kase, s.cast, c.id);
        return { character: c.id, role: verdict.truth[c.id], picked: verdict.roles[c.id] ?? null, correct: verdict.results[c.id],
          classification: say(part.finding.classification), explanation: say(part.finding.explanation) };
      }),
      ...(accusation ? this.reveal(s, accusation) : {}),
    };
  }

  // The talk case's debrief: who it was, and each slip the traveller delivered, in order, with whether the solving accusation cited it.
  reveal(s, accusation) {
    const { kase } = this;
    const cited = new Set(accusation.quotes.map(id => s.talk.quotes.find(q => q.id === id)?.line));
    const slips = Object.entries(s.talk.delivered).map(([slipId, eventId]) => {
      const character = kase.characters.find(c => slipId.startsWith(`${c.id}-`) && kase.talk.slips[c.id]?.some(x => x.id === slipId))?.id;
      const slip = kase.talk.slips[character].find(x => x.id === slipId);
      const turn = s.interviews[character].find(t => t.id === eventId);
      return { character, term: slip.term, text: turn?.answer ?? slip.line, cited: cited.has(eventId) };
    });
    return {
      reveal: { character: accusation.character, text: kase.characters.find(c => c.id === accusation.character).reveal },
      slips, wrong: accusation.wrong,
    };
  }

  ensureCurrent(input) {
    if (!this.session) throw new RequestError(409, 'Start the case first.');
    if (input.sessionId !== this.session.id || input.revision !== this.session.revision) {
      throw new RequestError(409, 'The case changed in another window. Your view has been refreshed; try again.');
    }
  }

  async mutate(action, input = {}, { kase = null, assignment = 'default', team = null } = {}) {
    if (this.busy) throw new RequestError(409, 'An interview is still in progress. Wait for the answer, then try again.');
    this.busy = true;
    this.wrote = null;
    const before = this.session ? structuredClone(this.session) : null;
    const beforeKase = this.kase;
    try {
      if (action === 'start') {
        if (this.session) throw new RequestError(409, 'A case is already active. Continue it or reset for the next investigator.');
        if (kase) this.kase = kase;
        this.start(assignment, team);
      } else {
        this.ensureCurrent(input);
        const s = this.session;
        const { characters } = this.kase;
        this.expire(Date.now());
        if (action === 'reset') {
          this.log('session_reset', { completed: s.status === 'closed' });
          if (kase) this.kase = kase;
          this.start(assignment, team);
        } else {
          if (s.status !== 'active') throw new RequestError(409, 'This case is closed. Review the debrief or start a new session.');
          if (action === 'visit') {
            const allowed = ['briefing', 'report', ...characters.map(c => c.id), ...(this.kase.evidence ? ['evidence', ...this.kase.evidence.map(x => `evidence:${x.id}`)] : [])];
            if (!allowed.includes(input.location)) throw new RequestError(400, 'Unknown station location.');
            s.location = input.location;
            if (input.location.startsWith('evidence:') && !s.examined.includes(input.location.slice(9))) s.examined.push(input.location.slice(9));
            this.log('location_visited', { location: input.location });
          } else if (action === 'interview') {
            await this.interview(input);
            this.expire(Date.now());
          } else if (action === 'inspect') {
            if (this.kase.tools?.inspect === false) throw new RequestError(409, 'Not in this case.');
            this.inspect(input);
          } else if (action === 'continue') {
            if (this.kase.tools?.talk === false) throw new RequestError(409, 'Not in this case.');
            await this.chat();
            this.expire(Date.now());
          } else if (action === 'verdict') {
            if (this.kase.talk) throw new RequestError(400, 'Accuse the traveller with quotes instead.');
            this.verdict(input);
          } else if (['quote', 'unquote', 'accuse'].includes(action) && this.kase.talk) {
            this[action](input);
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
          try {
            const fresh = new Map();
            this.session = replay(readJsonl(this.file(this.wrote)), [this.kase], fresh);
            this.lastSaid = fresh;
          } catch { this.session = before; }
        }
      }
      throw error;
    } finally { this.busy = false; }
  }

  start(assignment = 'default', team = null) {
    this.reasoning.clear();
    this.lastSaid.clear();
    const rules = this.config.economy ?? economyRules({});
    const ids = this.kase.characters.map(c => c.id);
    const dealt = this.shuffle(this.kase.parts.map(p => p.id));
    const cast = Object.fromEntries(ids.map((id, i) => [id, dealt[i]]));
    this.session = {
      id: randomUUID(), revision: 0, startedAt: new Date().toISOString(),
      status: 'active', caseId: this.kase.id, cast,
      location: 'briefing', interviews: Object.fromEntries(this.kase.characters.map(c => [c.id, []])), verdict: null,
      economy: createWallet(rules), thread: [], chatter: { round: 0, pending: 0 }, inspections: [],
      team: team && typeof team.id === 'string' && typeof team.name === 'string' ? { id: team.id, name: team.name } : null,
    };
    if (this.kase.evidence) this.session.examined = [];
    if (this.kase.talk) this.session.talk = newTalkState(this.kase);
    this.log('session_started', { assignment, economy: rules, cast, env: null, appCommit: null, appDirty: null, endpointsHash: this.config.endpointsHash ?? null, team: this.session.team, ...this.meta });
    this.log('briefing_viewed');
  }

  async interview(input) {
    const s = this.session;
    const { characters, world: w } = this.kase;
    const character = characters.find(c => c.id === input.character);
    if (!character) throw new RequestError(400, `Choose one of the ${characters.length} ${w.cast.many}.`);
    const talk = this.kase.talk ? this.talkPlan(input, character) : null;
    if (!talk && (typeof input.question !== 'string' || input.question.trim().length < 1 || input.question.length > 280)) throw new RequestError(400, 'Ask a question between 1 and 280 characters.');
    if (s.interviews[character.id].length >= 40) throw new RequestError(400, 'This demo supports 40 questions per character. Submit your findings or start a new session.');
    // In a talk case the authored topic and follow-up answers are free: the slips must stay reachable on any coin budget.
    const tools = talk && talk.kind !== 'typed' ? [] : ['ask'];
    const check = quote(s.economy, tools, this.reserve(character.id));
    if (!check.ok) throw new RequestError(409, check.reason);
    const question = talk ? talk.question : input.question.trim();
    const wallet = structuredClone(s.economy);
    let answeredLogged = false;
    const asked = this.log('interview_question', { character: character.id, question, ...(talk ? { kind: talk.kind, topic: talk.topic, about: talk.about } : {}) });
    try {
      const context = {
        sessionId: s.id, questionEventId: asked.eventId,
        onAttempt: diagnostics => { this.log('interview_provider_response', { character: character.id, question, questionEventId: asked.eventId, ...diagnostics }); },
      };
      let hidden = null;
      let result;
      if (talk) ({ result, hidden } = await this.talkAnswer(talk, character.id, question, context));
      else result = await this.answer(this.config, this.kase, structuredClone(s), character.id, question, context);
      const answer = typeof result === 'string' ? result : result.answer;
      const provenance = typeof result === 'string' ? null : result.provenance ?? null;
      const reasoning = typeof result === 'string' ? null : result.reasoning ?? null;
      const paid = spend(s.economy, tools);
      const answered = this.log('interview_answer', { character: character.id, question, answer, questionEventId: asked.eventId, provenance, spend: paid, ...(talk ? { kind: talk.kind, topic: talk.topic, about: talk.about, hidden } : {}) });
      answeredLogged = true;
      this.remember(character.id, answered.eventId, reasoning);
      if (talk) {
        s.interviews[character.id].push({ question, answer, timestamp: answered.timestamp, id: answered.eventId, kind: talk.kind, topic: talk.topic });
        if (talk.kind === 'topic') s.talk.asked[character.id].push(talk.topic);
        if (hidden.slip) s.talk.delivered[hidden.slip] = answered.eventId;
        if (hidden.followUp) s.talk.challenged[hidden.followUp] = (s.talk.challenged[hidden.followUp] ?? 0) + 1;
      } else s.interviews[character.id].push({ question, answer, timestamp: answered.timestamp });
    } catch (error) {
      if (!answeredLogged) {
        // The answer write itself may have thrown after the line reached the file:
        // then the log already holds the spend, so memory must follow the log.
        let onDisk = null, fresh = null;
        try {
          const events = readJsonl(this.file(s.id));
          if (events.some(e => e.type === 'interview_answer' && e.questionEventId === asked.eventId)) { fresh = new Map(); onDisk = replay(events, [this.kase], fresh); }
        } catch { /* fall back to the pre-spend wallet */ }
        if (onDisk) { this.session = onDisk; this.lastSaid = fresh; this.wrote = onDisk.id; } else s.economy = wallet;
      }
      const providerError = error?.name === 'InterviewProviderError';
      this.log('interview_failed', { character: character.id, question, questionEventId: asked.eventId, reason: providerError ? error.code : 'provider_or_storage_error', ...(providerError ? error.diagnostics : {}), provenance: error?.provenance ?? null });
      const failure = new RequestError(502, providerError ? error.message : 'The interview could not complete. Check the server’s storage and retry.');
      failure.logged = true;
      throw failure;
    }
  }

  // Which turn (and whose) an interview answer id names.
  turnOf(id) {
    for (const [character, turns] of Object.entries(this.session.interviews)) {
      const turn = turns.find(t => t.id === id);
      if (turn) return { character, turn };
    }
    return null;
  }

  // Validate a talk case's interview input: exactly one of topic, about or question.
  talkPlan(input, character) {
    const s = this.session;
    const given = ['topic', 'about', 'question'].filter(k => input[k] !== undefined);
    if (given.length !== 1) throw new RequestError(400, 'Ask one thing at a time: a topic, a phrase or a question.');
    if (given[0] === 'topic') {
      const topic = this.kase.talk.topics.find(t => t.id === input.topic);
      if (!topic) throw new RequestError(400, 'Choose one of the topics.');
      if (s.talk.asked[character.id].includes(topic.id)) throw new RequestError(400, `You already asked ${character.name} about ${topic.label}.`);
      return { kind: 'topic', topic: topic.id, about: null, question: topic.question };
    }
    if (given[0] === 'about') {
      const about = input.about;
      const found = about && typeof about === 'object' && typeof about.line === 'string' ? this.turnOf(about.line) : null;
      if (!found) throw new RequestError(400, 'Choose a line to ask about.');
      const text = typeof about.text === 'string' ? about.text.trim() : '';
      if (text.length < 1 || text.length > 200 || !found.turn.answer.includes(text)) throw new RequestError(400, 'Choose words from that line.');
      return { kind: 'about', topic: null, about: { line: about.line, text }, question: `What did you mean by “${text}”?`, speaker: found.character, turn: found.turn };
    }
    if (typeof input.question !== 'string' || input.question.trim().length < 1 || input.question.length > 280) throw new RequestError(400, 'Ask a question between 1 and 280 characters.');
    return { kind: 'typed', topic: null, about: null, question: input.question.trim() };
  }

  // The authored or guarded answer of a talk case: { result, hidden }.
  async talkAnswer(talk, cid, question, context) {
    const s = this.session;
    const { kase } = this;
    const authored = (text, slip, followUp) => ({ result: { answer: text, provenance: null, reasoning: null }, hidden: { slip, followUp, guard: null } });
    if (talk.kind === 'topic') {
      const r = topicAnswer(kase, s.cast, s.talk, cid, talk.topic);
      return authored(r.text, r.slip, null);
    }
    if (talk.kind === 'about') {
      const slip = Object.entries(s.talk.delivered).find(([, id]) => id === talk.about.line)?.[0] ?? null;
      const r = aboutAnswer(kase, s.talk, cid, { speaker: talk.speaker, text: talk.turn.answer, slip }, talk.about.text);
      return authored(r.text, null, r.followUp);
    }
    const route = typedRoute(kase, s.talk, cid, question);
    if (route.kind !== 'model') return authored(route.text, null, route.followUp);
    if (this.config.mode === 'rehearsal') {
      const list = kase.talk.rehearsal[cid];
      const n = s.interviews[cid].filter(t => t.kind === 'typed').length;
      return authored(list[n % list.length], null, null);
    }
    const extra = terms(kase);
    const ask = async () => {
      const r = await this.answer(this.config, kase, structuredClone(s), cid, question, context);
      return typeof r === 'string' ? { answer: r, provenance: null, reasoning: null } : r;
    };
    let result = await ask();
    let guard = 'ok';
    if (guardHits(result.answer ?? '', extra).length) {
      guard = 'retried';
      result = await ask();
      if (guardHits(result.answer ?? '', extra).length) {
        guard = 'deflected';
        result = { ...result, answer: kase.talk.replies[cid].deflect, reasoning: null };
      }
    }
    return { result, hidden: { slip: null, followUp: null, guard } };
  }

  // Save words from an answer to the notebook. Free.
  quote(input) {
    const s = this.session;
    const found = typeof input.line === 'string' ? this.turnOf(input.line) : null;
    if (!found) throw new RequestError(400, 'Choose a line to quote.');
    let text;
    if (input.text === undefined) text = found.turn.answer;
    else {
      text = typeof input.text === 'string' ? input.text.trim() : '';
      if (text.length < 3 || !found.turn.answer.includes(text)) throw new RequestError(400, 'Choose at least 3 characters from that line.');
    }
    if (s.talk.quotes.some(q => q.line === input.line && q.text === text)) throw new RequestError(400, 'You already saved that quote.');
    if (s.talk.quotes.length >= 30) throw new RequestError(400, 'The notebook holds 30 quotes. Remove one first.');
    const event = this.log('quote_saved', { quote: { line: input.line, character: found.character, text } });
    s.talk.quotes.push({ id: event.eventId, line: input.line, character: found.character, text, at: event.timestamp });
  }

  unquote(input) {
    const s = this.session;
    if (typeof input.quote !== 'string' || !s.talk.quotes.some(q => q.id === input.quote)) throw new RequestError(400, 'That quote is not in your notebook.');
    this.log('quote_removed', { quote: input.quote });
    s.talk.quotes = s.talk.quotes.filter(q => q.id !== input.quote);
  }

  // Accuse one character with 1 to 3 of their own saved quotes. Free. Right and proven closes the case.
  accuse(input) {
    const s = this.session;
    const { characters } = this.kase;
    const character = characters.find(c => c.id === input.character);
    if (!character) throw new RequestError(400, `Choose one of the ${characters.length} ${this.kase.world.cast.many}.`);
    const ids = input.quotes;
    const cited = Array.isArray(ids) && ids.length >= 1 && ids.length <= 3 && new Set(ids).size === ids.length
      ? ids.map(id => s.talk.quotes.find(q => q.id === id)) : null;
    if (!cited || cited.some(q => !q || q.character !== character.id)) throw new RequestError(400, `Choose 1 to 3 of ${character.name}'s quotes.`);
    const traveler = partOf(this.kase, s.cast, character.id).role === 'traveler';
    const supported = supports(this.kase, s.cast, s.talk, character.id, cited);
    if (traveler && supported) {
      const wrong = s.talk.accusations.length;
      const all = characters.map(c => c.id);
      s.verdict = {
        roles: Object.fromEntries(all.map(id => [id, id === character.id ? 'traveler' : 'local'])),
        truth: Object.fromEntries(all.map(id => [id, partOf(this.kase, s.cast, id).role])),
        results: Object.fromEntries(all.map(id => [id, true])),
        score: Math.max(1, 5 - 2 * wrong), total: all.length, confidence: 100, explanation: '', evidenceIds: [],
        submittedAt: new Date().toISOString(), accusation: { character: character.id, quotes: [...ids], wrong },
      };
      s.status = 'closed';
      this.log('verdict_submitted', { verdict: s.verdict, coins: { spent: s.economy.spent, budget: s.economy.budget } });
      this.log('debrief_viewed');
      return;
    }
    const event = this.log('accusation_rejected', { character: character.id, quotes: [...ids], hidden: { traveler, supported } });
    s.talk.accusations.push({ id: event.eventId, character: character.id, quotes: [...ids], at: event.timestamp });
  }

  // Whose latest line can be inspected. Every line goes through remember(), so held reasoning is always the latest line's.
  inspectable() {
    const scripted = typeof this.kase.rehearsalReasoning === 'function';
    if (this.kase.tools?.inspect === false) return Object.fromEntries(this.kase.characters.map(c => [c.id, false]));
    return Object.fromEntries(this.kase.characters.map(c => [c.id, this.config.mode === 'live' ? this.reasoning.has(c.id) : scripted]));
  }

  // Live reasoning stays in memory, tied to the line it explains, until inspected.
  remember(characterId, eventId, reasoning) {
    if (typeof reasoning === 'string' && reasoning) {
      this.reasoning.set(characterId, { eventId, text: reasoning.length > reasoningLimit ? `${reasoning.slice(0, reasoningLimit)}…` : reasoning });
    } else this.reasoning.delete(characterId);
  }

  // Coins to keep so everyone can still be asked once, not counting `exceptId`.
  reserve(exceptId = null) {
    const s = this.session;
    // A talk case asks everyone for free (topic chips), so nothing is held back for it.
    if (this.kase.talk) return 0;
    return s.economy.costs.ask * this.kase.characters.filter(c => c.id !== exceptId && !s.interviews[c.id].length).length;
  }

  inspect(input) {
    const s = this.session;
    const { characters } = this.kase;
    const character = characters.find(c => c.id === input.character);
    if (!character) throw new RequestError(400, `Choose one of the ${characters.length} ${this.kase.world.cast.many}.`);
    let sourceEventId = this.lastSaid.get(character.id);
    if (!sourceEventId) {
      const said = readJsonl(this.file(s.id)).filter(e => e.character === character.id && (e.type === 'interview_answer' || e.type === 'chatter_line'));
      if (!said.length) throw new RequestError(409, `${character.name} has not said anything yet.`);
      sourceEventId = said[said.length - 1].eventId;
    }
    const live = this.config.mode === 'live';
    const held = this.reasoning.get(character.id);
    if (live ? !held || held.eventId !== sourceEventId : typeof this.kase.rehearsalReasoning !== 'function') throw new RequestError(409, `${character.name} did not think.`);
    const check = quote(s.economy, ['inspect'], this.reserve());
    if (!check.ok) throw new RequestError(409, check.reason);
    let reasoning;
    if (live) reasoning = held.text;
    else try { reasoning = resolveText(this.kase, s.cast, this.kase.rehearsalReasoning(s.cast[character.id])); } catch { reasoning = null; }
    if (typeof reasoning !== 'string' || !reasoning) throw new RequestError(409, `${character.name} did not think.`);
    const paid = spend(s.economy, ['inspect']);
    const event = this.log('reasoning_inspected', { character: character.id, sourceEventId, reasoning, spend: paid });
    s.inspections.push({ character: character.id, sourceEventId, reasoning, timestamp: event.timestamp });
  }

  async chat() {
    const s = this.session;
    const { characters } = this.kase;
    const starting = s.chatter.pending === 0;
    if (starting) {
      const check = quote(s.economy, ['continue'], this.reserve());
      if (!check.ok) throw new RequestError(409, check.reason);
    }
    const last = s.thread.length ? characters.findIndex(c => c.id === s.thread[s.thread.length - 1].character) : -1;
    const speaker = characters[(last + 1) % characters.length];
    const n = s.thread.filter(l => l.character === speaker.id).length;
    const round = starting ? s.chatter.round + 1 : s.chatter.round;
    // A new round is one line from every character. A round in progress keeps its size,
    // so a round restored from an older log (3 lines) ends where it would have.
    const done = starting ? 0 : s.thread.filter(l => l.round === s.chatter.round).length;
    const roundLines = starting ? characters.length : done + s.chatter.pending;
    const line = done + 1;
    let text;
    let reasoning = null;
    let provenance = null;
    if (this.config.mode === 'live') {
      try {
        const result = await this.thread(this.config, this.kase, structuredClone(s), speaker.id, {
          sessionId: s.id, lineEventId: null,
          onAttempt: diagnostics => { this.log('chatter_provider_response', { character: speaker.id, round, ...diagnostics }); },
        });
        text = typeof result === 'string' ? result : result.text;
        reasoning = typeof result === 'string' ? null : result.reasoning ?? null;
        provenance = typeof result === 'string' ? null : result.provenance ?? null;
        if (typeof text !== 'string' || !text.trim()) throw new Error('empty thread line');
      } catch (error) {
        const providerError = error?.name === 'InterviewProviderError';
        this.log('chatter_failed', { character: speaker.id, round, reason: providerError ? error.code : 'provider_or_storage_error', provenance: error?.provenance ?? null });
        const failure = new RequestError(502, providerError ? error.message : 'The thread could not continue. Check the server’s storage and retry.');
        failure.logged = true;
        throw failure;
      }
    } else {
      try { const template = this.kase.rehearsalChatter?.(s.cast[speaker.id], n); text = typeof template === 'string' ? resolveText(this.kase, s.cast, template) : null; } catch { text = null; }
      if (typeof text !== 'string' || !text) text = `${speaker.name} has nothing to add.`;
    }
    const paid = starting ? spend(s.economy, ['continue']) : null;
    const event = this.log('chatter_line', { character: speaker.id, text, round, line, roundLines, provenance, threadPromptVersion: this.kase.prompts?.threadVersion ?? threadPromptVersion, spend: paid });
    this.remember(speaker.id, event.eventId, reasoning);
    s.thread.push({ character: speaker.id, text, round, timestamp: event.timestamp });
    s.chatter = { round, pending: roundLines - line };
  }

  verdict(input) {
    const s = this.session;
    const { characters } = this.kase;
    if (characters.some(c => !s.interviews[c.id].length)) throw new RequestError(400, `Ask all ${characters.length} ${this.kase.world.cast.many} before choosing.`);
    const roleIds = rolesOf(this.kase).map(r => r.id);
    const picks = input.roles;
    const ids = characters.map(c => c.id);
    const pickedOk = picks && typeof picks === 'object' && !Array.isArray(picks)
      && Object.keys(picks).length === ids.length && ids.every(id => Object.hasOwn(picks, id) && roleIds.includes(picks[id]));
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
    this.log('verdict_submitted', { verdict: s.verdict, coins: { spent: s.economy.spent, budget: s.economy.budget } });
    this.log('debrief_viewed');
  }

  export() {
    if (!this.session) throw new RequestError(404, 'There is no session to export.');
    let text = readFileSync(this.file(this.session.id), 'utf8');
    // The stored log stays plain; the download carries the same cipher the player sees.
    if (this.kase.cipher === 'rot13') text = text.split('\n').map(line => encipher(line)).join('\n');
    if (this.session.status === 'closed') return text;
    // While the game is on, the cast stays secret: only the first line is rewritten.
    const lines = text.split('\n').map(stripHidden);
    const head = JSON.parse(lines[0]);
    if (head.type === 'session_started') { head.cast = null; lines[0] = JSON.stringify(head); }
    return lines.join('\n');
  }
}
