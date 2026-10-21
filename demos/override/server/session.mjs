import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { caseId, caseVersion, characters, chapters, records, debrief, promptVersion } from './case.mjs';
import { answerInterview, InterviewProviderError } from './interviews.mjs';

export class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export class Investigation {
  constructor({ dataDir, config, answer = answerInterview }) {
    this.dataDir = resolve(dataDir);
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.config = config;
    this.answer = answer;
    this.session = null;
    this.busy = false;
  }

  log(type, details = {}, state = this.session) {
    const event = {
      schemaVersion: 1,
      eventId: randomUUID(),
      sessionId: state.id,
      caseId,
      caseVersion,
      promptVersion,
      sequence: state.revision + 1,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - Date.parse(state.startedAt),
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
    return {
      caseId, caseVersion, authored: true, mode: this.config.mode,
      model: this.config.model, characters, chapters,
      session: s ? structuredClone(s) : null,
      records: s ? records.filter(r => s.status === 'closed' || r.chapter <= s.revealedPosition) : [],
      debrief: s?.status === 'closed' ? debrief : null,
    };
  }

  ensureCurrent(input) {
    if (!this.session) throw new RequestError(409, 'Start the case first.');
    if (input.sessionId !== this.session.id || input.revision !== this.session.revision) {
      throw new RequestError(409, 'The case changed in another window. Your view has been refreshed; try again.');
    }
  }

  async mutate(action, input = {}) {
    if (this.busy) throw new RequestError(409, 'An interview is still in progress. Wait for the answer, then try again.');
    this.busy = true;
    const before = this.session ? structuredClone(this.session) : null;
    try {
      if (action === 'start') {
        if (this.session) throw new RequestError(409, 'A case is already active. Continue it or reset for the next investigator.');
        this.start();
      } else {
        this.ensureCurrent(input);
        const s = this.session;
        if (action === 'reset') {
          this.log('session_reset', { completed: s.status === 'closed' });
          this.start();
        } else {
          if (s.status !== 'active') throw new RequestError(409, 'This case is closed. Review the debrief or start a new session.');
          if (action === 'reveal') {
            if (s.revealedPosition >= chapters.length) throw new RequestError(400, 'All three clues are already open.');
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
      if (!error.logged) this.session = before;
      throw error;
    } finally { this.busy = false; }
  }

  start() {
    this.session = {
      id: randomUUID(), revision: 0, startedAt: new Date().toISOString(),
      status: 'active', revealedPosition: 0, selectedEvidence: null,
      location: 'briefing', interviews: { momo: [], pip: [], nori: [] }, verdict: null,
    };
    this.log('session_started');
    this.log('briefing_viewed');
  }

  async interview(input) {
    const s = this.session;
    const character = characters.find(c => c.id === input.character);
    if (!character) throw new RequestError(400, 'Choose one of the three monkeys.');
    if (s.revealedPosition === 0) throw new RequestError(400, 'Inspect the banana basket before asking the monkeys.');
    if (typeof input.question !== 'string' || input.question.trim().length < 3 || input.question.length > 1200) throw new RequestError(400, 'Ask a question between 3 and 1,200 characters.');
    if (s.interviews[character.id].length >= 40) throw new RequestError(400, 'This demo supports 40 questions per character. Submit your findings or start a new session.');
    const question = input.question.trim();
    const evidence = s.selectedEvidence;
    const asked = this.log('interview_question', { character: character.id, question });
    try {
      const answer = await this.answer(this.config, structuredClone(s), character.id, question, undefined, diagnostics => {
        this.log('interview_provider_response', { character: character.id, question, questionEventId: asked.eventId, ...diagnostics });
      });
      this.log('interview_answer', { character: character.id, question, answer, questionEventId: asked.eventId });
      s.interviews[character.id].push({ question, answer, evidence, revealedPosition: s.revealedPosition, timestamp: new Date().toISOString() });
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
    if (!s.revealedPosition || characters.some(c => !s.interviews[c.id].length)) throw new RequestError(400, 'Inspect the clues and ask all three monkeys before choosing.');
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
