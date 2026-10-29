# The Override

A short, 2–3 minute detective game for AgentVerse: **The Banana Mystery**. The keeper said to wait for the bell, but the picnic bananas went missing. Meet Momo the planner, Pip the carrier, and Nori the lookout in a small jungle clearing. Inspect three clues, ask each monkey a quick question, then choose who knowingly broke the rule.

The fast path needs one clue reveal, three one-click interview questions, and one suspect choice. Answers are prompted to stay around 15–40 words. Confidence has three choices; a written explanation and clue citation are optional. Free-text follow-ups and presenting evidence remain available. The intended 2–3 minute duration includes reading; live model latency and extra questions can make a run longer.

**This is an authored demonstration, not a validated research case or a recorded agent run.** Every browser gets its own independent game (an HttpOnly `override_session` cookie), so about 200 people can play at once on one server, and a game resumes after a page reload or a server restart. Choose a case on the intro screen, or open `?case=<id>` to go straight to one.

## Run locally

Requires Node.js 22.6+ and npm. This project runs independently of the original Python simulation and UI.

```sh
cd demos/override
npm ci
cp .env.example .env
npm run dev
```

Open <http://127.0.0.1:5173>. The development command runs Vite and the case server together. If you already have a configured `.env`, keep it instead of copying the example over it.

For a production build served from one origin:

```sh
npm run build
npm start
```

Open <http://127.0.0.1:3001>.

## Live interviews

Put the endpoint, key, and model in the ignored `.env` file. The endpoint must implement OpenAI-compatible `POST /chat/completions`; the base URL includes `/v1` but not `/chat/completions`.

```dotenv
OVERRIDE_LLM_BASE_URL=https://ai.cloud.sdu.dk/v1
OVERRIDE_LLM_API_KEY=your-key
OVERRIDE_LLM_MODEL=zai-org/GLM-5.3
```

Restart the server after changing configuration. Credentials remain on the server and are excluded from the browser bundle, exports, Git, and Docker build context. The server uses native `fetch`; no OpenAI SDK or AgentVerse Python dependencies are required.

`OVERRIDE_LLM_MAX_COMPLETION_TOKENS` defaults to 2,048. This includes internal reasoning tokens, not just the visible answer. A response cut off by that limit is retried once with twice the budget (up to 8,192); partial answers and reasoning-only responses are never shown as testimony. `OVERRIDE_LLM_TIMEOUT_MS` defaults to 60,000 and bounds both attempts together. Authentication, rate-limit, timeout, and response-limit failures have distinct player-facing messages and log reasons.

With both key and model empty, interviews use a visibly labeled **scripted rehearsal** mode. This is useful for testing the full flow without a model. In live mode, provider failures are shown to the player and logged; the server never silently substitutes a scripted answer. Questions can be retried without losing the draft.

Each live request includes that character’s staged knowledge, the revealed records, the exact evidence being presented, and that character’s previous questions and answers. Characters do not receive each other’s interview histories. The incident, knowledge, and hidden explanation are authored on the server; model outputs are fallible testimony, not changes to the ground truth. Prompt instructions limit invented facts and prompt injection, but cannot guarantee that a model will follow them. Validate live behavior before collecting research data.

## Play

1. Pick a case on the intro screen (or use `?case=<id>`), start the mystery, and inspect the banana basket on the picnic blanket.
2. Reveal all three clues: the keeper’s rule, Momo’s message, and the keeper’s account.
3. Ask Momo, Pip, and Nori. **Quick question** submits immediately; **Next: ask…** takes you to the next monkey. You can also type a question or show a clue.
4. Choose a suspect (or Nobody / Not sure), set confidence, and see the short debrief. Written reasoning and a clue citation are optional.
5. Use **Play again** for the next colleague. The reset dialog has a case select, so the next game can be a different case. Previous research logs remain on disk.

Click a monkey, signpost, or destination to walk there. WASD/arrows and E/Space also work. **Skip walking** jumps directly to a destination and is enabled initially for reduced-motion preferences. Momo, Pip, and Nori blink and make small gestures on separate idle cycles, and react when you approach. Reduced-motion preferences disable these animations. The notebook retains its page turns and evidence feedback; reduced-motion preferences disable those effects.

## Writing a case

A case is one module in `server/cases/`, registered in `server/cases/index.mjs`. `banana-mystery.mjs` (grove) and `tower-echo-bell.mjs` (tower) are the examples to copy. The required fields and the allowlist of what reaches the browser are in the "Decided" section of [the cases spec](../../docs/plans/2026-10-26-override-cases.spec.md); they are not repeated here.

- Set `status: 'draft'` while writing. Draft cases are hidden unless the server runs with `OVERRIDE_DEV_TOOLS=1` (forced off when `NODE_ENV=production`).
- Run `npm run cases:prompt -- <case> <character> --chapter 1 [--evidence id] [--question "..."]` to print the exact prompt a character receives.
- A case has exactly three characters with unique ids matching `/^[a-z][a-z0-9]{1,15}$/`. Set `world: 'grove' | 'tower'` (default `grove`; see `server/worlds.mjs`) to choose the scene, sprites, cast art and wording. The tower art is described in `public/assets/tower/ARTWORK.md`; missing PNGs fall back to code-drawn placeholders.
- The live cases are `banana-mystery` (grove; Momo made up the permission) and `tower-echo-bell` (tower; an honest mistake, the answer is Nobody). Archived and unregistered: `override-v1`, `banana-control`, `tower-bell-charm`, `tower-missing-yes`; register one in `server/cases/index.mjs` to bring it back.

## Research records

The server writes append-only JSONL files under `data/<env>/`, or under `OVERRIDE_DATA_DIR` if set. `<env>` is `OVERRIDE_ENV` (default `live`). These files are outside the served directory.

- `sessions/<sessionId>.jsonl`: the player export, one file per game. **Export session** downloads the current game; older files remain on disk after reset.
- `traces/<sessionId>.jsonl`: one record per LLM attempt with the full request and response. Admin only: never served to players. Probes go to `traces/probes.jsonl`.
- `system.jsonl`: operator and system events, such as endpoint changes (`llm_active`).

Every event includes `schemaVersion` (2), `eventId`, `sequence`, `timestamp`, `elapsedMs`, `sessionId`, `caseId`, `caseVersion`, `contentHash`, `promptVersion`, `revealedPosition`, `selectedEvidence`, `character`, `question`, `answer`, interview `mode`, and `model`. Fields that do not apply are `null`. Question and answer events are linked by `questionEventId`; failures are recorded separately. `session_started` adds `assignment` (`fixed` when the request named a case, else `default`), `env`, `appCommit`, `appDirty`, and `endpointsHash`. Additional payloads record revealed evidence IDs, locations, and the complete submitted verdict.

`interview_answer` and `interview_failed` carry `provenance` (`null` in rehearsal mode): the endpoint, host, model, attempts, whether it failed over, queue and call time, token counts, sampling parameters, and the IDs of the matching trace records.

Recorded events: session start/reset, briefing viewed, location visited, story revealed, evidence selected, interview question/answer/failure, verdict submitted, and debrief viewed. Frame-by-frame player coordinates and unsent text are intentionally not recorded. The UI explains that investigation actions and dialogue are recorded.

Live responses also emit `interview_provider_response`, linked by `questionEventId`, with the endpoint, attempt number, completion token limit, HTTP status, finish reason, completion token usage, and duration. Provider bodies and internal reasoning never appear in these session events or in responses.

One server process serves every player. Each browser’s game lives in memory while active and is rebuilt from its JSONL log when its player returns, also after a restart or about 30 idle minutes, so progress survives both. Requests carry a session ID and revision to reject stale writes from another tab. A game’s mutations are locked while its live answer is pending; other players are never blocked. The demo has a technical limit of 40 questions per character and 1,200 characters per question; study budgets are not implemented.

## LLM fallback

For several providers, point `OVERRIDE_ENDPOINTS` at a JSON array (see [ops/endpoints.example.json](ops/endpoints.example.json)). Each entry is `{name, baseUrl, model, keyEnv, maxInFlight=50, tokenParam='max_completion_tokens', timeoutMs=25000, temperature=null}`. `keyEnv` names the environment variable holding that endpoint's key, so keys never live in the file. The endpoint order is the priority order; `a` is used first.

Without `OVERRIDE_ENDPOINTS`, the legacy `OVERRIDE_LLM_BASE_URL`, `_API_KEY`, and `_MODEL` variables form a single endpoint `a`. With neither, interviews run in scripted rehearsal mode.

- **Forward-only failover.** A failed attempt is retried once on the next endpoint. When the active endpoint (unless pinned or last) has `OVERRIDE_LLM_FAILOVER_FAILURES` failures within `OVERRIDE_LLM_FAILOVER_WINDOW_MS`, new questions move to the next endpoint. The router never moves back by itself; an operator does that. The active endpoint and pin survive a restart.
- **Pin.** An operator can move to any endpoint and pin it, which turns automatic failover off. A reason is required and is written to `system.jsonl`.
- **Caps.** `maxInFlight` per endpoint and `OVERRIDE_LLM_MAX_IN_FLIGHT` overall. Extra questions queue; they never overload a small backup. Operators can change caps at run time.
- Queue waits and truncated answers (`completion_limit`) do not count towards failover. All attempts of one question share the 60 s deadline.

## Operating an event

Set `OVERRIDE_ADMIN_TOKEN` to start the admin listener on `127.0.0.1:$OVERRIDE_ADMIN_PORT` (default 3002). It never binds a public address; reach it over an SSH port forward. Open `/admin` for the command centre (it asks for the token). Without the token there is no monitor.

### The command centre

- **Players.** *Online now* counts open, visible tabs. Each tab sends `POST /api/heartbeat` every 30 s, and a tab counts for 75 s after its last beat. It is split into *in a game* and *on the case board*. *Playing* is the number of games in memory. *Players this round* is starts minus resets since the round began. *Games finished* counts debriefs.
- **Tiles.** Each tile turns amber, then red, past these limits. When any tile is red, the tab title gets a marker. The LLM error tile counts failed provider attempts (including ones hidden by retry or failover) out of all attempts over 5 minutes.

| Tile | Amber | Red |
|---|---|---|
| LLM error rate, 5 min | > 5 % | > 20 % |
| Queue depth | > 10 | > 50 |
| Answer p95, 5 min | > 8 s | > 20 s |
| Event-loop delay p99 | > 100 ms | > 500 ms |
| Disk free | < 5 GB | < 1 GB |
| Log-write failures, 5 min | none | > 0 |
| Automatic failover | within 5 min | none |
| Credentials rejected, 5 min | none | > 0 |

- **Sparklines.** The last 60 minutes of players online, questions, failures, answer p95 and requests, one point a minute.
- **Message log.** Live game events with filters. Click a player to see that player's whole session, read from disk, so evicted games work too. Player text shows only here, behind the token.
- **Funnel and tallies.** Per case: started, clues, interviewed, verdict, debrief; then verdicts, share correct, who was accused, and median time and questions to a verdict.
- **Rounds.** *Start round* names a new session (for example a new class). It is stored as a `round_started` record in `system.jsonl`, resets the funnel, tallies and *players this round*, and survives a restart. Without one, the round is everything in the data directory.
- **Controls.** The router table, pin, probe, caps and pause are still on the page, and the curl calls below still work.

Grafana and Prometheus stay optional; the command centre does not need them.

You can also use curl:

```sh
export OVERRIDE_ADMIN_TOKEN=...   # the same value the server uses
AUTH="Authorization: Bearer $OVERRIDE_ADMIN_TOKEN"
curl -H "$AUTH" http://127.0.0.1:3002/admin/health
curl -H "$AUTH" -H 'Content-Type: application/json' -d '{"endpoint":"b","pinned":true,"reason":"a is slow"}' http://127.0.0.1:3002/admin/llm/active
curl -H "$AUTH" -H 'Content-Type: application/json' -d '{"endpoint":"b"}' http://127.0.0.1:3002/admin/llm/probe
curl -H "$AUTH" -H 'Content-Type: application/json' -d '{"endpoint":"b","value":20}' http://127.0.0.1:3002/admin/llm/cap
curl -H "$AUTH" -H 'Content-Type: application/json' -d '{"paused":true}' http://127.0.0.1:3002/admin/sessions/pause
curl -H "$AUTH" http://127.0.0.1:3002/metrics
```

```sh
curl -N -H "$AUTH" http://127.0.0.1:3002/admin/stream
curl -H "$AUTH" -H 'Content-Type: application/json' -d '{"label":"Session B","reason":"second class"}' http://127.0.0.1:3002/admin/round
curl -H "$AUTH" http://127.0.0.1:3002/admin/sessions/<session-id>
```

`/admin/stream` is NDJSON: a `hello` line (catalog, snapshot, recent rows), then an `event` line per game event and a `tick` line with a fresh snapshot every second. At most 5 streams are open at once. `/admin/round` takes a label of 1 to 60 characters. `/admin/sessions/<id>` returns `{sessionId, rows}`, or 404.

`cap` takes `"endpoint": null` for the global cap. `pause` stops new games and lets running ones finish. `GET /api/health` on the game port is a public liveness check. `POST /api/heartbeat {"tab": "<uuid>"}` on the game port needs the access cookie, answers 204 with no body, and only feeds the online count.

`/metrics` is Prometheus text: players (`override_sessions_*`), LLM per endpoint (`override_llm_*`: in flight, queue, failures by reason, failovers, durations), HTTP, log writes (`override_log_write_*`), and process and disk gauges. Labels never hold session IDs or text. [ops/prometheus.yml](ops/prometheus.yml) scrapes it every 5 s and includes example alert rules.

## Rehearse the command centre

```sh
node scripts/admin-demo.mjs --players 60 --ramp 60000 --think 4000-20000 --burst-every 120 --port 3001 --admin-port 3002
```

This starts the real server in live mode over two mock endpoints, plus simulated players who play whole games and send heartbeats. Every `--burst-every` seconds (0 turns it off), endpoint `a` fails for 30 s, so you can watch failover. Defaults are shown above; `--think` is a range in ms. The token is `OVERRIDE_ADMIN_TOKEN` or `demo`. Ctrl-C stops everything.

## Load test and preflight

The load test drives simulated players against the real server and mock endpoints with injected faults:

```sh
npm run loadtest -- --players 200 --ramp 10000 --scenario all
```

`--players` (default 200), `--ramp` ramp-up in ms (default 10000), and `--scenario` (`all` or one of `healthy`, `primary_errors`, `primary_hangs`, `rate_limited`, `flaky_primary`, `silent_failure`, `small_backup`, `all_down`, `server_restart`, `burst_arrival`). It prints one PASS/FAIL line per scenario and exits non-zero on any failure. Build first (`npm run build`) to include static delivery.

Before an event, check the real endpoints: answer quality for each character and clue, then capacity at 10 to 200 simultaneous questions.

```sh
node --env-file-if-exists=.env scripts/preflight.mjs --capacity --out preflight.json
```

It prints a table per endpoint with review flags (empty, length, a character out of role) and, with `--capacity`, errors and p50/p95 latency per step. The capacity run lifts each endpoint's `maxInFlight` for the run. It makes about 36 real calls per endpoint, plus several hundred with `--capacity`.

## Limits

- 30 wrong access codes per minute per address (429 after that).
- 20 new games per second (start or reset), server-wide.
- 6 questions per minute per game.
- 16 KB request bodies.
- 40 questions per character and 1,200 characters per question.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `OVERRIDE_LLM_BASE_URL` / `_API_KEY` / `_MODEL` | OpenAI URL / empty / empty | Single legacy endpoint. Key and model both empty means rehearsal. |
| `OVERRIDE_ENDPOINTS` | unset | Path to the endpoints JSON; replaces the three above. |
| `OVERRIDE_ENDPOINT_<X>_KEY` | unset | Keys named by `keyEnv` in the endpoints file. |
| `OVERRIDE_LLM_MAX_COMPLETION_TOKENS` | 2048 | Token budget including reasoning (256 to 8192). |
| `OVERRIDE_LLM_TIMEOUT_MS` | 60000 | Per-question deadline. |
| `OVERRIDE_LLM_MAX_IN_FLIGHT` | 200 | Global cap on simultaneous LLM calls. |
| `OVERRIDE_LLM_FAILOVER_FAILURES` | 5 | Failures that trigger failover. |
| `OVERRIDE_LLM_FAILOVER_WINDOW_MS` | 30000 | Window for that count. |
| `OVERRIDE_ACCESS_CODE` | empty | Shared access code; empty leaves the API open. |
| `OVERRIDE_SECRET` | random per process | Signs sign-in tokens; set it so sign-ins survive restarts. |
| `OVERRIDE_TRUST_PROXY` | off | `1` or `true` behind a proxy: client address from `CF-Connecting-IP`, else `X-Forwarded-For`. |
| `OVERRIDE_ADMIN_TOKEN` | empty | Bearer token; the admin listener stays off while empty. |
| `OVERRIDE_ADMIN_PORT` | 3002 | Admin listener port (127.0.0.1). |
| `OVERRIDE_DATA_DIR` | `./data` | Root for research records. |
| `OVERRIDE_ENV` | `live` | Data subdirectory, e.g. `rehearsal`. |
| `OVERRIDE_APP_COMMIT` | empty | Recorded in `session_started`. |
| `OVERRIDE_DEV_TOOLS` | off | `1` shows draft cases in the catalog and lets them start; ignored when `NODE_ENV=production`. |
| `HOST` / `PORT` | 127.0.0.1 / 3001 | Game listener. |

## Share with colleagues

Follow the [deployment guide](DEPLOY.md) for Render setup, environment variables, persistent storage, verification, updates, rollback, and a local Docker smoke test.

Run one instance. A persistent disk preserves logs, and games resume from them after a restart. Set `OVERRIDE_SECRET` so sign-ins also survive. To host about 200 players on a Mac, see [Hosting 200 players on a Mac](DEPLOY.md#hosting-200-players-on-a-mac).

## Validate

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

If Google Chrome is already installed, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` uses it instead. Browser tests use a separate rehearsal server and separate data directory; they never use the live API key. They exercise walking between rooms, presenting evidence, follow-ups, all interviews, verdict, debrief, JSONL download, reset, mobile layout, and recovery from provider errors.

## Structure and artwork

- `server/cases/` and `server/cases.mjs`: one module per case (clues, character-specific knowledge, debrief, scripted rehearsal replies), the registry, and the `defineCase` helpers; never imported into the client.
- `scripts/case-prompt.mjs`: prints the exact interview prompt for a case and character.
- `server/session.mjs`: per-game state for one registered case, replay from logs, quick verdict validation, and research logs. Verdicts record `suspect`, `suspects`, confidence, and optional explanation/citations; they do not infer classifications for unselected monkeys.
- `server/llm.mjs`: the endpoint router (queues, caps, failover, traces). `server/admin.mjs` (with the page in `server/admin/`), `server/monitor*.mjs` (event ring, round stats, windows, traffic sampling), `metrics.mjs`, `identity.mjs`, `dataset.mjs`, `static.mjs`: admin listener, Prometheus metrics, sign-in tokens and limits, JSONL storage, in-memory static files.
- `server/interviews.mjs`: endpoint configuration, the shared short-answer prompt template, and the hand-off to each case’s scripted rehearsal replies.
- `server/index.mjs`: API, optional shared access code, and production static serving.
- `client/station.ts`: a compact original jungle clearing, collision-aware click navigation, and nearby interactions.
- `client/detective-walk.ts`: distance-driven walking with four facing directions and support for high-refresh displays.
- `client/monkey-idle.ts`: independent NPC blinks, idle gestures, and approach reactions with fixed collision positions.
- `client/heartbeat.ts`: the visible-tab heartbeat behind the online count.
- `client/main.ts`: briefing, clues, live interviews, quick verdict, and debrief.
- `client/notebook.ts` / `notebook.css`: page transitions, evidence feedback, and preserved drafts/reading position.
- `public/assets/banana/`: original generated transparent character and prop atlases. `ARTWORK.md` contains provenance and the full image-generation prompts. Phaser uses atlas frames without changing the source PNGs. No Pokémon art is loaded by this demo.

Fonts have local fallbacks if Google Fonts is unavailable.

For a research study, add controlled case assignment, configurable budgets, validated cases (including no-misalignment cases), and debrief timing controls. Those features are deliberately outside this demo.
