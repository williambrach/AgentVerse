# Feature plan: override-cases

**Spec:** `docs/plans/2026-10-26-override-cases.spec.md` · **Source plan:** `demos/override/docs/CASES_PLAN.md` · **Project root:** `demos/override` · **Orchestrator:** AI

## Goal

Let The Override demo play more than one mystery with the same grove and the same three monkeys, starting with a control case where nobody lied. For the player: pick a case, play it, get feedback that matches that case. For the researcher: every log line says which case, version and content hash was played, and the answer never leaves the server.

## What changes

**Web UI (`client/`)**
- Intro screen: a case picker (two cards) when no session exists; `?case=<id>` preselects one. "Continue mystery" unchanged when a session exists.
- Reset dialog ("Start a fresh mystery?"): a case select, current case preselected.
- Grove heading, intro, briefing, basket, report and debrief copy come from the case. Counts ("3 clues", "Ask 3 monkeys", "MONKEY 01 OF 03", "0 / 3 found", notebook index) come from case data. The debrief feedback line comes from the server.
- Header wordmark becomes the product name ("THE OVERRIDE · AGENTVERSE"); the case title moves into the page.

**API (`server/`)**
- `GET /api/cases` → public list.
- `POST /api/start` and `POST /api/reset` accept `caseId`.
- `/api/state` gains `contentHash`, `title`, `order`, `copy`, `clueCount`, `session.caseId`, and `debrief.feedback` after the verdict.
- Case content moves from `server/case.mjs` to `server/cases/*.mjs` modules behind `defineCase`; `server/cases.mjs` validates, hashes and builds the public view; replay looks the case up from the log.

**Logs** (`data/<session>.jsonl`): `contentHash` on every event, `assignment` on `session_started`.

**CLI**: `npm run cases:prompt -- <case> <character> --chapter N [--evidence id] [--question "…"]` prints the exact interview messages.

**Prompt**: `You play Momo (The planner)` instead of `You play Momo, the The planner`.

## Acceptance checks

1. Open `/`: two case cards. Pick "The Banana Mix-up", press begin. The heading, intro, briefing, basket and report texts are the control case's.
2. Open `/?case=banana-control` fresh: the control card is preselected. `/?case=nope` falls back to the first card.
3. Play the control case: reveal 3 clues, ask all three monkeys (scripted replies), choose **Nobody** → control debrief title and its "correct" feedback line. In a second run choose Momo → the "other" line.
4. Play The Banana Mystery: identical copy and flow to today; the existing Playwright spec passes.
5. From an active game, open the reset dialog, choose the other case, confirm: fresh session, new case's copy.
6. Export a control-case session: every event has `caseId`, `caseVersion`, 12-hex `contentHash`; `session_started.assignment` is `fixed` when started via `?case=`.
7. `curl /api/state` before the verdict, in both cases: no knowledge sentence, no debrief text, no feedback line. `/api/cases` has only `id`, `title`, `lead`, `order`.
8. Restart the server mid-game in the control case: the game resumes with the control copy and clues.
9. `npm run cases:prompt -- banana-mystery momo --chapter 1` prints `You play Momo (The planner)` and never `the The`.
10. `npm test` and `npm run test:e2e` green; `server/case.mjs` deleted.

## Code map

**Stand-up.** `npm run dev` (`server/dev.mjs`: `node --watch server/index.mjs` on 3001 + Vite on 5173 proxying `/api`). Production: `npm run build` (tsc + Vite → `dist/`) then `npm start` (`server/index.mjs` serves `dist/` and the API on one origin, port 3001). Rehearsal mode (no LLM key) is a shipped, deterministic mode: scripted replies, no external calls. Playwright starts its own rehearsal server on 4317 with `OVERRIDE_DATA_DIR=./test-results/sessions`.

**Files the feature touches and their seams**

| File | Role | Seam |
|---|---|---|
| `server/case.mjs` (31 lines) | all case data as named exports | imported at module top by `session.mjs` and `interviews.mjs`; deleted |
| `server/session.mjs` | `Investigations` registry, `Investigation` game, `replay()` | reads `caseId/caseVersion/characters/chapters/records/debrief` globals; `replay` compares one global `caseVersion` and hardcodes `{momo,pip,nori}`; `view()` builds the browser payload |
| `server/interviews.mjs` | `modelConfig`, `buildMessages`, `answerInterview`, `rehearsalAnswer` | `buildMessages(session, characterId, question)` reads case globals; template has the `the ${role}` bug (line 37) |
| `server/index.mjs` | `createApp({ investigations, accessCode, publicDir })`, routes, cookies, static | `start` is `mutate(sessionId, 'start', input)`; add `GET /api/cases`, pass `caseId` |
| `client/types.ts` | `CharacterId` union, `CaseState` | widen to `string`; add state fields |
| `client/main.ts` (334 lines) | boot → shell → render; template-string panels; `escape()` | literals at lines 10, 19, 59, 74–90, 147, 163–166, 179, 181, 196–203, 212–216, 226–227, 244, 260–262, 276; reset dialog at 308–312 |
| `client/station.ts`, `monkey-idle.ts`, `*.css` | grove, sprites, styles keyed on `momo/pip/nori` | unchanged |
| `tests/session.test.mjs` | 13 tests over `Investigation(s)`, `buildMessages`, `answerInterview` | constructs `Investigation({dataDir, config, answer})`; calls `buildMessages(session, c, q)` and `answerInterview(config, session, c, q, fetch)`; asserts literal version and interviews map |
| `tests/http.test.mjs` | 2 tests over `createApp` | ephemeral ports; asserts `/server/case.mjs` → 404 |
| `tests/browser/investigation.spec.mjs` | 3 Playwright specs | asserts banana copy (unchanged values) and `caseVersion === 'banana-authored-v1.0.0'` |
| `package.json` | scripts | add `cases:prompt` |
| `README.md` | docs | "Writing a case" section; remove the stale "one shared investigation" sentence |

**Interfaces that must not change (FROZEN)**
- HTTP: `POST /api/access`, `GET /api/state`, `GET /api/events`, `POST /api/{start,reset,reveal,evidence,visit,interview,verdict}`; existing response fields; cookies `override_access`, `override_session`; 401/403/404/409/429 behaviour.
- `createApp({ investigations, accessCode, publicDir })`; `Investigations.view(sessionId)`, `.mutate(sessionId, action, input)`, `.export(sessionId)`; `modelConfig(env)`.
- JSONL event fields and `schemaVersion: 1` (additive only).
- `client/station.ts` API (`createStation`, `travel`, `resetPosition`, `setEnabled`), `renderNotebook`, CSS class names keyed on character ids, asset paths.

**Interfaces that change (internal)**: `Investigation` constructor gains `kase`; `Investigations` constructor gains `cases`; `replay(events, cases)`; `buildMessages(kase, session, characterId, question)`; `answerInterview(config, kase, session, characterId, question, fetcher?, onAttempt?)`; `rehearsalAnswer` moves into each case module.

**Conventions and toolchain.** ESM `.mjs`, no server framework, `node:test` + `node:assert/strict`, temp dirs per test; client is strict TypeScript with inline HTML template strings and `escape()`; Vite 7, TS 5.9, Playwright 1.58 (chromium cached locally). **UI component set: none.** Screens are hand-written template strings styled by `style.css`, `banana.css`, `pixel.css`, `notebook.css`; the picker composes from existing classes (`.intro-card`, `.primary-button`, `.secondary-button`, `.suspect-option`, `.eyebrow`, `.reset-card`).

## Prototype scope

Target kind: web. **Keep:** the whole demo (server in rehearsal mode, client, tests). **Stub:** nothing. **Drop:** nothing.

Ruling: no stub is built because the app's rehearsal mode is already a deterministic fake of the only external service, and the server is 500 lines; a fake API would cost more than the real change. Level **L2** (own `npm ci`, data dir `./data-proto`, port 3011) because the feature is a data-shape change. Cost if wrong: the prototype worktree holds about 200 MB of `node_modules`.

Prototype cut (what the acceptance checks need, at most 8 tasks): case registry + helpers; the control case; session/interview threading with feedback; `/api/cases` and `caseId` on start/reset; case-driven client rendering; the picker, reset select and deep link; an e2e integration task. Left for integration: replay-by-case, `contentHash`/`assignment` in logs, the prompt script, README, draft-case gating, README/docs.

Run: `cd demos/override && npm run build && PORT=3011 HOST=127.0.0.1 OVERRIDE_DATA_DIR=./data-proto node server/index.mjs`. Reach: `http://127.0.0.1:3011/?case=banana-control`.

## Integration outline

Worktree `superlite/override-cases`. One task per touched module, ported from the prototype: cases helpers + registry (+ delete `case.mjs`), control case, session/interviews, index routes, client types + rendering, client picker. Then: replay-by-case + log fields (`contentHash`, `assignment`) with restart test; `scripts/case-prompt.mjs` + npm script; README and CASES_PLAN pointers; draft-case gating via `OVERRIDE_DEV_TOOLS`; a seam task running the full `npm test` and `npm run test:e2e` with the prototype's acceptance specs as the target. About 11 tasks.
