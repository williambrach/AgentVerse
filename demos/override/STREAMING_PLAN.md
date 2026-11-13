# Streaming interviews — status & remaining plan

Scope agreed: typewriter reveal + honest poses + live reasoning inspection (chatter streaming is out of scope). Transport: streaming POST — the interview request answers as NDJSON.

## Done (server, all green: `npm test` = 1365 pass)

- `server/llm.mjs`: SSE reader (`readCompletion`), `complete({stream, onStart, onDelta})`, `streamed`/`firstTokenMs` provenance, `markStreamUnsupported` on 4xx blaming stream (+ `llm_stream_unsupported` system event), endpoint `stream` flag.
- `server/interviews.mjs`: `OVERRIDE_LLM_STREAM` off-switch, endpoints-file `stream` validation, rehearsal streams scripted lines (`streamScripted`).
- `server/session.mjs`: per-interview `live` record (label buffers, sink); reasoning held back until a live Watch; Watch during a streaming answer is the one allowed action (names `questionEventId` + `character`, refuses wrong id/character, falls to history path after settle); Watch of a no-reasoning line costs nothing; guard retry emits `scrub`; commit is still the single write path.
- `server/index.mjs`: `createNdjsonSink`, interview POST emits `accepted|start|delta|scrub|reasoning|reasoning_scrub|ping|fail|view`.
- `scripts/mock-llm.mjs`: answers `stream: true` requests as SSE (chunked deltas, finish chunk with usage, `[DONE]`).
- `tests/stream.test.mjs` (10), stream tests in `tests/llm.test.mjs` and `tests/mock-llm.test.mjs`, `.env.example` + `system.jsonl` updated.

## Remaining (all done in the streaming-client branch)

1. [x] Client streaming read path (`client/main.ts`): send `stream: true` on interview; read NDJSON; on `accepted` record `questionEventId` + queue copy; `start` (attempt>1) clears that label's buffers; `delta` appends into the waiting bubble via a live-only DOM node (no full re-render per token); `fail`/`view` reuse `action()`'s success/recovery paths; plain-JSON reply must still work (server may refuse streaming).
2. [x] Typewriter + poses: reveal per chunk in the waiting bubble (`dialogue.ts` waiting block gets `data-stream="answer"` live text node + caret), `station.say/speak` pacing per chunk, reduced-motion path, click = reveal-all.
3. [x] Live Watch UI: Watch button while streaming → direct fetch `/api/inspect {sessionId, character, live: true, questionEventId}` WITHOUT `revision` (client must bypass its own `busy` guard); streamed `reasoning` lines into a live card (`tools.ts` block); if commit lands with no reasoning, mark `noThought` client-side (no charge was made).
4. [x] Text keys: any new `dialogue.*` keys go in `client/text/dialogue.json` (`text-keys.test` fails otherwise: used keys must exist, no orphans).
5. [x] Mock/demo: `scripts/admin-demo.mjs` already benefits from the SSE mock; give it `setMode(..., {streamChunkMs})` pacing if desired; `tests/loadtest.mjs` untouched otherwise.
6. [x] e2e: new playwright project + `stream.spec.mjs` (own port ~4327, admin-demo-style live mock): assert typing reveal, Watch-during-stream, scrub on guard retry, fail line.
7. [x] README: streaming paragraph under Live interviews + `OVERRIDE_LLM_STREAM` row in the env table.
8. [x] Verify `npm run build` at the end.

Gotchas: `until()` returns no value (read sinks after it); NDJSON `scrub` must reset the label's fold; live Watch response arrives mid-interview — merge as a fresh view, the committed `view` line follows later.
