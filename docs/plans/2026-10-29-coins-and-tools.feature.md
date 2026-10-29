# Feature plan: coins-and-tools

**Spec:** `docs/plans/2026-10-29-coins-and-tools.spec.md` (spec wins if this drifts) · **Project root:** `demos/override` · **Orchestrator:** AI · **Base:** `demo/override` @ 8c1e847

## Goal

Teams playing Override at an event spend coins on every question and tool. Each tool has limited charges. Two new tools show what the agents do when nobody asks: **Inspect reasoning** (rare, expensive) and **Let them talk** (cheap; the agents continue among themselves in a forum-style thread, shown as speech bubbles). This is for the players (teams at an event) and for the operator, who sees each team's coin total in `/admin`.

## What changes

**Player page**
- Top bar: `#coin-counter` ("9 coins", or "9 / 15 coins" with a budget), with a hint on hover and focus.
- Interview panel: Ask question (2 coins), Show a clue (+1 coin, 3 left), and the new **Inspect reasoning** (5 coins, 1 left). Each has a chip with its cost and uses left, plus a one-line hint. Inspected reasoning appears as a `.speech.reasoning` block under the line it explains.
- Under the scene (`.station-bottomline`): **Let them talk** (1 coin, 3 left), with a hint. "Keep listening" appears while lines are pending. **Read thread** opens the thread log.
- Scene: each thread line is a bubble over its speaker (`.station-bubble`), one at a time, paced for reading.
- Dossier: a thread panel (`#thread-log`, `role="log"`) with the posts in order and a fine-print line: "They see each other's earlier lines, never your questions."
- Debrief: "You spent N of B coins", plus the tools used.
- Disabled controls say why ("0 left", "Not enough coins", "Save coins to ask everyone").

**Game API:** `POST /api/inspect {sessionId, revision, character}` and `POST /api/continue {sessionId, revision}` return the view. View `session` gains `economy`, `thread`, `chatter`, `inspections` (shapes in the spec).

**Session log:** `session_started.economy`, `spend` on costed events, `reasoning_inspected`, `chatter_line`, `chatter_failed`, `verdict_submitted.coins`. `schemaVersion` stays 2.

**Admin:** log rows of kind `inspect` and `chatter`, and `cost` on rows. The drill-down shows the team's coins. Tallies show the median coins at verdict.

**Env:** `OVERRIDE_COIN_BUDGET` (optional, 6–999) and `OVERRIDE_REASONING_CHARGES` (1–2, default 1).

## Acceptance checks

1. `OVERRIDE_COIN_BUDGET=15`, rehearsal mode: start The Banana Mystery. The counter reads `0 / 15 coins`. Reveal a clue and walk: still 0.
2. Quick question to Momo: 2. Select a clue and ask Pip: 5, and the clue chip reads "2 left". Use the remaining two showings: the selection clears, and the picker is disabled with "0 left".
3. Inspect reasoning on Momo: 5 coins are added, and a reasoning block appears under Momo's last line. The Inspect control is now disabled ("0 left") for every character. With `OVERRIDE_REASONING_CHARGES=2`, two inspections work.
4. Let them talk: +1. Three bubbles appear in turn over three different speakers (cast order after the last poster), and the thread log lists them. Two more rounds work, then "0 left".
5. Spend toward the budget: controls whose cost no longer fits, or would leave too little to ask each uninterviewed character once, are disabled. A direct API call gets 409. A verdict is always possible.
6. Reload mid-round (pending 2): the thread, the counter and the charges are unchanged. "Keep listening" finishes the round for free. Restart the server: the same.
7. Live mode on the mock LLM (with reasoning): an answer's reasoning is not in the view, the session log or the trace until inspected; after the inspection it is in the view and in `reasoning_inspected`. The thread request has no player question text.
8. Submit the verdict: the debrief shows the coin total. `/admin` (token) shows the cost per row, `inspect`/`chatter` rows, the team's coins in the drill-down, and the median coins in the case tallies.
9. Tower case (`?case=tower-echo-bell`): the same tools work with tower styling and authored rehearsal text.
10. `npm test`, `npm run build`, `npm run test:e2e` green. The grove pixel baseline is unchanged. "Fits one screen" still passes.

## Code map

**Stand-up.** The game is the Override demo, a Node 22 ESM app. It is stood up three ways:
- **Dev:** `npm run dev` runs the server on 3001 and Vite on 5173.
- **Production build:** `npm run build && PORT=… node server/index.mjs` serves `dist/`, cached at startup.
- **Mode:** rehearsal mode applies when there is no LLM key or model. Live mode on mocks uses `OVERRIDE_ENDPOINTS` with `tests/mock-llm.mjs` (as in `tests/loadtest.mjs:84-100`). Playwright projects run `default` on 4317, `tower` on 4318 (dev tools) and `admin` on 4319/4320, all in rehearsal mode.

**Seams**

| File | Role today | Change |
|---|---|---|
| `server/index.mjs` `createApp` | action allowlist (:22), metrics route label (:52), `/api/<action>` → `investigations.mutate` (:98-103); `startServer` builds config/router | add `inspect`, `continue` to both lists; pass economy config |
| `server/session.mjs` `Investigation` | `start` logs `session_started`; `mutate` dispatch (:217-258) + busy lock + rollback; `interview` (:285-311) logs question/answer/failure, limits (3–1200 chars, 40/char, 6/min); `verdict` (:314) gate = all characters interviewed; `log()` (:161-190) appends then `revision++` then `onEvent`; `replay()` (:19-41) handles only `location_visited`, `interview_answer`, `verdict_submitted`, tolerates unknown types; `view()` (:194-209) sends the **whole** `session` | economy checks/spend, `inspect`, `continue`, `spend` payloads, replay of the new events, private in-memory reasoning map (never in `session`) |
| `server/interviews.mjs` | `buildMessages` (:84-107) one character's prompt + own history; `answerInterview` (:111-116) rehearsal → `kase.rehearsal()`, live → `router.complete` | return `reasoning`; new `buildThreadMessages` + `answerThread` (rehearsal → `kase.rehearsalChatter`) |
| `server/llm.mjs` | `complete()` reads only `message.content` (:156-166), drops body (:168), trace keeps content+usage (:173-183), returns `{content, provenance}` | also return `reasoning` (not traced) |
| `server/cases.mjs` `defineCase` | validates fields; `contentHash` over non-function fields; deep-frozen; `rehearsal` must be a function | accept optional `rehearsalReasoning`, `rehearsalChatter` functions |
| `server/cases/{banana-mystery,tower-echo-bell}.mjs` | rehearsal regex scripts | authored reasoning + thread lines (functions; no hash change) |
| `server/monitor.mjs`, `monitor-round.mjs`, `server/admin/log.js` | `KINDS` maps 11 event types (unknown dropped); row shape deepEqual-frozen (`tests/monitor.test.mjs:32`); drill-down `{sessionId, rows}`; tallies frozen (`tests/monitor-round.test.mjs`) | kinds `inspect`/`chatter`, row `cost`, drill-down `coins`, tallies `medianCoins`; tests updated additively |
| `client/main.ts` | `shell()` (:100-139), `render()` (:220-267), delegated `onClick` (:173-203), `action()` (:74-98) replaces state; `interviewPanel` (:346-364); `reportPanel`; debrief | counter, chips/hints, inspect, continue loop, thread panel, debrief total |
| `client/station.ts` | `Station` (`configure`, `travel`…); `.station-labels` overlay via `label()` (:356-365), `labelLayer()` (:368-392) with `--u` scaling; `init()` clears overlay (:104); NPCs fixed at `slotPoints` | `say(characterId, text)`, `clearBubbles()` |
| `client/types.ts` | `Session`, `CaseState`, `Turn` | economy/thread/chatter/inspections types |
| CSS `style.css`, `notebook.css`, `pixel.css`, `banana.css`, `tower.css`, `fit.css` | tokens; `.mode-badge`, `.speech`, `.station-label` (`calc(var(--u)*N)`); tower under `:root[data-theme="tower"]`; `fit.css` sizes canvas from `--chrome` | chips, hints, bubble, reasoning block; no world-column height change |
| `tests/mock-llm.mjs` | fixed body, no reasoning | option to include `reasoning_content` |

**Tests touching the seams:**
- `tests/session.test.mjs`: `setup`/`act` (:16), `fleet` (:193), the replay deepEqual (:142-178, :460-467), the leak scan (:384-396), the prompt hash (:517-520), and `onEvent` types (:311).
- `tests/interviews.test.mjs`: "Private deliberation" (:149-169) and the no cross-history check (:201-209).
- `tests/llm.test.mjs`: `no_keys_in_trace` (:257-267) and `reasoning_only_failure` (:269-275).
- `tests/http.test.mjs`: `boot`, `liveServer`, `player`.
- `tests/monitor*.test.mjs`, `tests/admin*.test.mjs`, and `tests/docs.test.mjs` (env names in `.env.example`).
- Browser specs: `investigation`, `provenance` (LEAKS), `cases` ("fits one screen"), `grove-look` (`#station canvas` element screenshot, 50 px), `tower` (overlay box), and `admin`, which drives players via the API and expects 200 throughout.

**Frozen interfaces:**
- All existing `/api/*` fields.
- The `Investigation`/`Investigations`/`LlmRouter` public methods. New optional args and return fields are allowed.
- `defineCase`'s required fields, and the case hashes.
- Session log schema v2: existing types and fields keep their meaning.
- Admin route paths.
- The "Ask question" button text and `.speech.character` semantics.
- `Station.configure(world, cast)`.

**UI component set:** there is no component library. The repo uses its own CSS classes, each with a tower variant: `.primary-button`, `.secondary-button`, `.quiet-button`, `.mode-badge`, `.case-chip`, `.subtle-note`, `.fine-print`, `.speech`, `.station-label`, `icon(name)`. New controls are composed from these.

**Toolchain:** `node --test tests/*.test.mjs` (37 files, about 346 tests), `tsc --noEmit && vite build`, and Playwright 1.58. Build before e2e, use an isolated `--output`, and never run the unit and e2e suites at once.

## Prototype scope

Level **L1**. The container is the real app in **rehearsal mode**, with the scripted replies as the LLM stub. The prototype keeps:
- the real server actions and economy, in memory only;
- the real client, scene and CSS;
- authored rehearsal reasoning and thread lines for The Banana Mystery.

It leaves out:
- replay of the new events (state lives in memory only);
- live-mode reasoning capture and the thread prompt;
- the mock LLM;
- the admin changes;
- tower content (tower gets placeholder rehearsal text);
- README.

Run: `cd demos/override && npm run build && OVERRIDE_COIN_BUDGET=15 PORT=3013 OVERRIDE_DATA_DIR=<tmp> node server/index.mjs`, then open `http://127.0.0.1:3013/?case=banana-mystery`.

Ruling: the risk is the UX (layout of the counter, chips, hints and bubbles inside a one-screen layout, and the pacing of the thread) plus the economy rules. Data shapes are fixed by the spec, so L1 is enough.

## Integration outline

Dedicated worktree `superlite/coins-and-tools` from `demo/override`. The prototype is ported task by task. Planned tasks:

1. **economy**: `server/economy.mjs` (rules, env, spend, reserve) and `.env.example`.
2. **llm reasoning**: `complete()` returns `reasoning`, the mock-LLM option, and retargeted privacy tests.
3. **thread prompt**: `buildThreadMessages`, `answerThread`, and `answerInterview` returns reasoning.
4. **case content**: the optional `defineCase` functions, authored text for both live cases and the fixtures, plus a hash-unchanged test.
5. **session**: spend on interview and evidence, `inspect`, `continue`, replay, the verdict coins, the routes, and restore tests.
6. **admin**: kinds, cost, drill-down coins, tallies, the page, and tests.
7. **client economy**: types, the counter, chips and hints, inspect, and the debrief.
8. **station bubbles**: `say` and `clearBubbles`, and bubble CSS per world.
9. **client thread**: the continue loop, pacing, and the thread panel.
10. **acceptance e2e**: the prototype spec ported, the full suites, and the baseline unchanged.
11. **README**: costs, tools, env vars, events, and the reasoning disclosure.
