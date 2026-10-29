# Feature plan: admin-command-centre

**Spec:** `docs/plans/2026-10-29-admin-command-centre.spec.md` · **Project root:** `demos/override` · **Orchestrator:** AI · **Base:** `demo/override` @ 3f2c291

## Goal

Turn `/admin` on the admin listener (127.0.0.1:3002) into a command centre for running a game event with up to ~200 players on one Mac. It is for the operator (the user), watching on a laptop over an SSH forward. One screen answers: how many players are here, is the server and the LLM coping, what players ask and get back, how far they are. No Grafana/Prometheus needed; `/metrics` stays for anyone who wants it.

## What changes

**Admin page** (`GET /admin`, same token prompt):
- Top: player counts (online now: in a game / on the case board; playing; players this round; finished) and the round label with a **Start round** button.
- Tiles with green/amber/red: req/s with 4xx/5xx/429 share, questions/min, answer p95, LLM error rate, queue, in-flight/cap, active endpoint (pinned?), event-loop p99, memory, disk free, write failures. Sparklines for the last 60 minutes under them. Tab title gets a marker when anything is red.
- Message log: live rows `time · player · case · → character "question"` / `← character "answer" 2.1 s · a` / `✕ failure reason`, other game events behind a kind filter; filters for case, character, kind, text, player; follow/freeze.
- Player drill-down panel: the whole game timeline from its session log.
- Per case: funnel (started → first clue → interviewed all → verdict → debrief) and tallies (who was accused incl. Nobody, share correct, median time to verdict, median questions).
- Kept: endpoint table with Move + pin / Unpin / Probe / Cap, global cap, Pause/Resume, recent system records (readable rows).

**Admin API** (token, loopback, host guard): `GET /admin/stream` (NDJSON: `hello`, `event`, `tick`), `POST /admin/round {label, reason}`, `GET /admin/sessions/<id>`; static page files under `/admin` without token. Existing routes unchanged.

**Game API**: `POST /api/heartbeat {tab}` (204). The player page sends it every 30 s while visible. Nothing visible changes for players.

**Server**: new `server/monitor.mjs`, fed from `startServer`'s existing hooks; `system.jsonl` gains `round_started` records.

## Acceptance checks

1. `OVERRIDE_ADMIN_TOKEN=x npm start`, open `http://127.0.0.1:3002/admin`, enter `x`: "connected", counts, tiles, log; no console errors; response CSP has no `'unsafe-inline'`.
2. Open the game in two browsers: online now = 2 within 35 s (one on the case board counts too); close one: 1 within 80 s.
3. Ask a question: the log shows the question, then the answer with latency and endpoint (`rehearsal` in rehearsal mode) within 2 s.
4. Filter by case / character / kind / text / player; click a player: their full timeline incl. verdict.
5. Submit a verdict: the case's funnel and tally update (accused, share correct, medians).
6. Start round "Session B": counts reset, label shown, `system.jsonl` has `round_started`. Restart the server: round, counts and recent log are back.
7. Live mode on mock endpoints with failures injected: error-rate tile amber → red, red failure rows, endpoint table failures; Move + pin, Probe, Cap, Pause still work.
8. 200 load-test players with the page open: page responsive, no 429 on heartbeats, no game created by a heartbeat.
9. No token → 401 on `/admin/stream`, `/admin/round`, `/admin/sessions/…`; foreign Host → 403; a question `<img src=x onerror=alert(1)>` shows as text.
10. `npm test`, `npm run build`, `npm run test:e2e` green; existing admin routes return the same shapes.

## Code map

**Stand-up.** `npm run dev` (server 3001 + Vite 5173); prod `npm run build && npm start`. Admin listener only when `OVERRIDE_ADMIN_TOKEN` is set (`server/index.mjs:160-172`). Rehearsal mode (no LLM env) → `router` null. Live mode locally = `OVERRIDE_ENDPOINTS` JSON pointing at `startMockLlm` (`tests/mock-llm.mjs`, modes ok/error500/rate429/flaky/empty/length/hang, `setMode` at runtime); fixtures doing this: `liveServer()` `tests/http.test.mjs:183-191`, `runScenario` `tests/loadtest.mjs:72-101` (always boots its own server, no admin token, no target flag).

**Seams**

| File | Role today | Change |
|---|---|---|
| `server/index.mjs` `startServer` 125-194 | builds `onSystem` (133), router `onEvent` (138), Investigations `onEvent` (142), `createApp` (152), `createAdmin` (165-169, gets `readSystem`, `onSystem`) | create the monitor; fan out the three closures to it (existing targets kept); pass `monitor` to `createApp` (heartbeat) and `createAdmin` |
| `server/index.mjs` `createApp` 21-120 | `/api/*` routes; metrics route label list (47); POSTs need JSON + not cross-site (50-51); access gate `validToken` (31) | add `POST /api/heartbeat`, label `heartbeat`; optional `onHeartbeat` arg |
| `server/admin.mjs` | `createAdmin`, inline `PAGE` + CSP (6, 125-195), routes table, auth/host guard, `log()` → `onSystem` unwrapped (50) | new routes, static files from `server/admin/`, stricter CSP; `PAGE` removed |
| `server/metrics.mjs` | `Registry.metrics: Map` with public `series` (values readable in-process); loop-delay collector resets on read (169-175) | none; monitor reads counters directly and keeps its own loop-delay histogram |
| `server/llm.mjs` | `onEvent` `{type:'attempt', endpoint, ok, reason, durationMs, semantic, queueMs}` / `{type:'failover', from, to, reason}`; `onSystem` `llm_active`; `snapshot()` | none |
| `server/session.mjs` | events (schema v2); `games` Map, `touched`, `busy`, `stats()`; reset logs `session_reset` on old id then `session_started` on new id (233-236, 274-282); verdict `{suspect, suspects, confidence, …}`, correctness not logged (from `kase.answer.culprits`) | none |
| `server/dataset.mjs` | `dataPaths`, sync `readJsonl`, `lastRecord`; single-slot `setWriteObserver` | none (monitor reads `override_log_write_failures_total` instead of the observer slot) |
| `client/main.ts` | `api()` 66-71; `boot()` 453-475 (`shell(); render();` at 470-471); no visibility handling; HttpOnly session cookie | heartbeat start after `render()` in `boot()` |
| `tests/admin.test.mjs` | `createAdmin` with fakes (`fakes()` 12-23, `boot()` 25-33); page assertions 162-180 | page assertions move to served files, same strength; new route tests |
| `tests/http.test.mjs` | real `startServer` (`boot` 98-103) incl. admin | heartbeat + monitor wiring tests |
| `playwright.config.mjs` | projects `default` 4317, `tower` 4318; no admin token | new `admin` project |

**Frozen interfaces:** all `/api/*` payloads; `GET /admin/health`, `POST /admin/llm/{active,probe,cap}`, `POST /admin/sessions/pause` shapes; `/metrics` text; `createApp(...)`/`createAdmin(...)` current args (new ones optional); `Investigations`, `Investigation`, `LlmRouter` public methods; session log schema v2.

**UI component set:** none applies. The game's CSS (`client/style.css` tokens, Google Fonts import) is themed per world and blocked by the admin CSP. The admin page is one-off markup with its own small token set (system fonts, dark/light).

**Toolchain:** Node 22 ESM, `node --test tests/*.test.mjs`; `tsc --noEmit && vite build`; Playwright 1.58, build before e2e, `--output` isolated, never unit and e2e at once.

## Prototype scope

Level **L1**. Keep `createAdmin` as the entry point and build the real admin routes and the real page files. Stub the monitor with a **fake monitor** that simulates ~180 players over two cases, using the real case registry for names and answers, with a failure-burst knob. Stub router/investigations/registry as in `tests/admin.test.mjs`. Run: `node scripts/admin-proto.mjs` → `http://127.0.0.1:3012/admin`, token `proto`. Out of the prototype: heartbeat, the real monitor, `startServer` wiring. Ruling: L1. The page and the stream contract are the risk; the data shapes come from the logged events the research mapped exactly.

## Integration outline

Dedicated worktree `superlite/admin-command-centre` from `demo/override`.
- **monitor core**: `server/monitor.mjs`, a pure reducer over game events, LLM events and system records (ring buffer, minute buckets, round, funnel, tallies, online tabs).
- **monitor sources**: reading the registry and the router, its own loop-delay histogram, rebuild from logs, and the session drill-down from disk.
- **admin routes + page**: ported from the prototype.
- **heartbeat**: in `createApp` and `client/main.ts`.
- **wiring**: in `startServer`, plus README "Operating an event".
- **acceptance specs**: a Playwright `admin` project, and a `--admin/--hold` option for the load test for checks 7 and 8.
