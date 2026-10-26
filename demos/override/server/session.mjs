import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { publicView, listCases, findCase } from './cases.mjs';
import { cases as registry } from './cases/index.mjs';
import { answerInterview, InterviewProviderError, promptVersion } from './interviews.mjs';

export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Rebuild a session from its append-only log. Every event carries the clue and
// evidence state at the time it was written. Logs from another case version,
// reset sessions, and gaps in the sequence are not restored.
export function replay(events, cases) {
  const first = events[0];
  const kase = first && cases.find(c => c.id === first.caseId && c.version === first.caseVersion);
  if (!kase) return null;
  let s = null;
  for (const e of events) {
    if (e.caseId !== kase.id || e.caseVersion !== kase.version || e.type === 'session_reset') return null;
    if (e.type === 'session_started') {
      s = { id: e.sessionId, revision: 0, startedAt: new Date(Date.parse(e.timestamp) - e.elapsedMs).toISOString(),
        status: 'active', caseId: kase.id, revealedPosition: 0, selectedEvidence: null,
        location: 'briefing', interviews: Object.fromEntries(kase.characters.map(c => [c.id, []])), verdict: null };
    }
    if (!s || e.sessionId !== s.id || e.sequence !== s.revision + 1) return null;
    s.revision = e.sequence;
    s.revealedPosition = e.revealedPosition;
    s.selectedEvidence = e.selectedEvidence;
    if (e.type === 'location_visited') s.location = e.location;
    if (e.type === 'interview_answer') s.interviews[e.character].push({ question: e.question, answer: e.answer, evidence: e.selectedEvidence, revealedPosition: e.revealedPosition, timestamp: e.timestamp });
    if (e.type === 'verdict_submitted') { s.verdict = e.verdict; s.status = 'closed'; }
  }
  return s;
}

// One independent investigation per player, keyed by session ID. Idle games
// leave memory and are rebuilt from their log on the next request, so progress
// also survives a restart.
export class Investigations {
  constructor({ dataDir, config, answer = answerInterview, idleMs = 30 * 60_000, cases = registry, dev = false }) {
    this.dataDir = resolve(dataDir);
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.config = config;
    this.answer = answer;
    this.idleMs = idleMs;
    this.cases = cases;
    this.dev = dev;
    this.games = new Map();
  }

  catalog() {
    return listCases(this.cases, { dev: this.dev });
  }

  create(session, kase) {
    return new Investigation({ dataDir: this.dataDir, config: this.config, answer: this.answer, kase, session });
  }

  find(sessionId) {
    if (!sessionIdPattern.test(sessionId || '')) return null;
    let game = this.games.get(sessionId);
    if (!game) {
      let session;
      try {
        const lines = readFileSync(resolve(this.dataDir, `${sessionId}.jsonl`), 'utf8').trim().split('\n');
        session = replay(lines.map(line => JSON.parse(line)), this.cases);
      } catch { return null; }
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
    const view = await game.mutate(action, input, { kase, assignment: kase ? 'fixed' : 'default' });
    // A reset gives the player a new session ID; the previous log stays on disk.
    if (game.session.id !== sessionId) this.games.delete(sessionId);
    this.games.set(game.session.id, game);
    return view;
  }

  export(sessionId) {
    const game = this.find(sessionId);
    if (!game) throw new RequestError(404, 'There is no session to export.');
    return game.export();
  }
}

export class Investigation {
  constructor({ dataDir, config, kase, answer = answerInterview, session = null }) {
    this.dataDir = resolve(dataDir);
    this.kase = kase;
    this.config = config;
    this.answer = answer;
    this.session = session;
    this.busy = false;
    this.touched = Date.now();
  }

  log(type, details = {}, state = this.session) {
    const now = Date.now();
    const event = {
      schemaVersion: 1,
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
      revealedPosition: state.revealedPosition,
      selectedEvidence: state.selectedEvidence,
      character: null,
      question: null,
      answer: null,
      mode: this.config.mode,
      model: this.config.model,
      ...details,
    };
    // Write before acknowledging a mutation. Failed writes must not silently lose data.
    appendFileSync(resolve(this.dataDir, `${state.id}.jsonl`), `${JSON.stringify(event)}\n`, { mode: 0o600 });
    state.revision += 1;
    return event;
  }

  view() {
    const s = this.session;
    const { records, debrief, answer } = this.kase;
    let feedback;
    if (s?.status === 'closed') {
      const nobody = answer.culprits.length === 0;
      const correct = nobody ? s.verdict.suspect === 'none' : answer.culprits.includes(s.verdict.suspect);
      feedback = correct ? answer.feedback.correct : answer.feedback.other;
    }
    return {
      ...publicView(this.kase), authored: true, mode: this.config.mode, model: this.config.model,
      session: s ? structuredClone(s) : null,
      records: s ? records.filter(r => s.status === 'closed' || r.chapter <= s.revealedPosition) : [],
      debrief: s?.status === 'closed' ? { ...debrief, feedback } : null,
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
        const { records, characters } = this.kase;
        if (action === 'reset') {
          this.log('session_reset', { completed: s.status === 'closed' });
          if (kase) this.kase = kase;
          this.start(assignment);
        } else {
          if (s.status !== 'active') throw new RequestError(409, 'This case is closed. Review the debrief or start a new session.');
          if (action === 'reveal') {
            if (s.revealedPosition >= this.kase.chapters.length) throw new RequestError(400, 'All clues are already open.');
            s.revealedPosition += 1;
            this.log('story_revealed', { recordIds: records.filter(r => r.chapter === s.revealedPosition).map(r => r.id) });
          } else if (action === 'evidence') {
            if (input.evidenceId !== null && !records.some(r => r.id === input.evidenceId && r.chapter <= s.revealedPosition)) throw new RequestError(400, 'That evidence has not been discovered.');
            s.selectedEvidence = input.evidenceId;
            this.log('evidence_selected');
          } else if (action === 'visit') {
            if (!['briefing', 'replay', 'evidence', 'report', ...characters.map(c => c.id)].includes(input.location)) throw new RequestError(400, 'Unknown station location.');
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
      if (!error.logged) { this.session = before; this.kase = beforeKase; }
      throw error;
    } finally { this.busy = false; }
  }

  start(assignment = 'default') {
    this.session = {
      id: randomUUID(), revision: 0, startedAt: new Date().toISOString(),
      status: 'active', caseId: this.kase.id, revealedPosition: 0, selectedEvidence: null,
      location: 'briefing', interviews: Object.fromEntries(this.kase.characters.map(c => [c.id, []])), verdict: null,
    };
    this.log('session_started', { assignment });
    this.log('briefing_viewed');
  }

  async interview(input) {
    const s = this.session;
    const { characters } = this.kase;
    const character = characters.find(c => c.id === input.character);
    if (!character) throw new RequestError(400, `Choose one of the ${characters.length} monkeys.`);
    if (s.revealedPosition === 0) throw new RequestError(400, 'Inspect the basket before asking the monkeys.');
    if (typeof input.question !== 'string' || input.question.trim().length < 3 || input.question.length > 1200) throw new RequestError(400, 'Ask a question between 3 and 1,200 characters.');
    if (s.interviews[character.id].length >= 40) throw new RequestError(400, 'This demo supports 40 questions per character. Submit your findings or start a new session.');
    const question = input.question.trim();
    const evidence = s.selectedEvidence;
    const asked = this.log('interview_question', { character: character.id, question });
    try {
      const answer = await this.answer(this.config, this.kase, structuredClone(s), character.id, question, undefined, diagnostics => {
        this.log('interview_provider_response', { character: character.id, question, questionEventId: asked.eventId, ...diagnostics });
      });
      const answered = this.log('interview_answer', { character: character.id, question, answer, questionEventId: asked.eventId });
      s.interviews[character.id].push({ question, answer, evidence, revealedPosition: s.revealedPosition, timestamp: answered.timestamp });
    } catch (error) {
      const providerError = error instanceof InterviewProviderError;
      this.log('interview_failed', { character: character.id, question, questionEventId: asked.eventId, reason: providerError ? error.code : 'provider_or_storage_error', ...(providerError ? error.diagnostics : {}) });
      const failure = new RequestError(502, providerError ? error.message : 'The interview could not complete. Check the server’s storage and retry.');
      failure.logged = true;
      throw failure;
    }
  }

  verdict(input) {
    const s = this.session;
    const { characters, records } = this.kase;
    if (!s.revealedPosition || characters.some(c => !s.interviews[c.id].length)) throw new RequestError(400, `Inspect the clues and ask all ${characters.length} monkeys before choosing.`);
    const choices = [...characters.map(c => c.id), 'none', 'uncertain'];
    if (!choices.includes(input.suspect)) throw new RequestError(400, 'Choose a monkey, nobody, or not sure.');
    if (!Number.isInteger(input.confidence) || input.confidence < 0 || input.confidence > 100) throw new RequestError(400, 'Confidence must be between 0 and 100.');
    const explanation = input.explanation ?? '';
    if (typeof explanation !== 'string' || explanation.length > 500) throw new RequestError(400, 'Keep your explanation under 500 characters.');
    const evidenceIds = input.evidenceIds ?? [];
    if (!Array.isArray(evidenceIds) || evidenceIds.some(id => !records.some(r => r.id === id && r.chapter <= s.revealedPosition))) throw new RequestError(400, 'Choose a discovered clue.');
    s.verdict = {
      suspect: input.suspect,
      suspects: characters.some(c => c.id === input.suspect) ? [input.suspect] : [],
      confidence: input.confidence, explanation: explanation.trim(),
      evidenceIds: [...new Set(evidenceIds)], submittedAt: new Date().toISOString(),
    };
    s.status = 'closed';
    this.log('verdict_submitted', { verdict: s.verdict });
    this.log('debrief_viewed');
  }

  export() {
    if (!this.session) throw new RequestError(404, 'There is no session to export.');
    return readFileSync(resolve(this.dataDir, `${this.session.id}.jsonl`), 'utf8');
  }
}
