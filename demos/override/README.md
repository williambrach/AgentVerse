# The Override

A short, 2–3 minute detective game for AgentVerse: **The Banana Mystery**. The keeper said to wait for the bell, but the picnic bananas went missing. Four monkeys (Momo, Pip, Nori and Kiki) wait in a small jungle clearing; a second case puts three apprentices in a wizard tower. Each game deals the characters into the case's parts at random, so a job label such as “The planner” moves between characters from game to game. Ask each character a quick question, then pick a role for each of them. Clues were removed on 2026-10-29: a game is the briefing, the interviews, a verdict, and a debrief. The live cases are `banana-authored-v3.0.0` and `tower-echo-bell-v3.0.0`, prompted as `interview-v5`. Kiki is a recoloured monkey until real art exists.

The UI is a full-screen world with a HUD on top of it: a top bar, a left rail with the cast and the Arbiter tools, and dialogue, verdict and debrief panels over the world. The design source is the artifact "The Override · UI redesign". A rival Arbiter is deliberately not built, because no code plays the cases.

The fast path needs one one-click interview question per character and one role pick for each. Answers are prompted to stay around 15–40 words. Confidence has three choices; a written explanation is optional. Free-text follow-ups remain available. The intended 2–3 minute duration includes reading; live model latency and extra questions can make a run longer.

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
OVERRIDE_LLM_MODEL=zai-org/GLM-5.3-Flash
OVERRIDE_LLM_REASONING_EFFORT=low
```

`OVERRIDE_LLM_REASONING_EFFORT` is sent as `reasoning_effort`; leave it empty for a model that does not accept it. GLM 5.3 Flash takes `low` and `high` and answers `400 Unsupported reasoning effort` to `medium`, which fails every interview. `low` keeps reasoning to a few words, and once a conversation is under way the model often skips it: measured on interview lines on 2026-10-30, `low` returned reasoning on 0 of 24 lines, `high` on 18 of 24, and empty on 12 of 12, with answers about 2.5 times slower. When a line has no reasoning, Inspect stays available and tells the player the character did not think; that costs no coins and no charge. In an endpoints file the field is `reasoningEffort`.

Restart the server after changing configuration. Coins are set the same way: `OVERRIDE_COIN_BUDGET` is empty for no budget, or an integer from the minimum to 999 (the minimum is 2 coins for each agent in the largest world, 8 today), and `OVERRIDE_REASONING_CHARGES` is 1 or 2 (default 1). Credentials remain on the server and are excluded from the browser bundle, exports, Git, and Docker build context. The server uses native `fetch`; no OpenAI SDK or AgentVerse Python dependencies are required.

`OVERRIDE_LLM_MAX_COMPLETION_TOKENS` defaults to 2,048. This includes internal reasoning tokens, not just the visible answer. A response cut off by that limit is retried once with twice the budget (up to 8,192); partial answers and reasoning-only responses are never shown as testimony. `OVERRIDE_LLM_TIMEOUT_MS` defaults to 60,000 and bounds all attempts together. Authentication, rate-limit, timeout, and response-limit failures have distinct player-facing messages and log reasons.

With both key and model empty, interviews use a visibly labeled **scripted rehearsal** mode. This is useful for testing the full flow without a model. In live mode, provider failures are shown to the player and logged; the server never silently substitutes a scripted answer. Questions can be retried without losing the draft.

The game is English only: the UI is written in English, and both prompts tell characters to answer in English whatever language the question is in (`interview-v5`, `thread-v3`).

Each live request includes that character’s knowledge and that character’s previous questions and answers. Characters do not receive each other’s interview histories. The incident, knowledge, and hidden explanation are authored on the server; model outputs are fallible testimony, not changes to the ground truth. Prompt instructions limit invented facts and prompt injection, but cannot guarantee that a model will follow them. Validate live behavior before collecting research data.

Provider reasoning (`reasoning_content` or `reasoning`) is kept only in server memory, for each character’s last line. It is shown only when a team pays to inspect it, and it is never written to traces. After a restart it is gone; inspecting then says the character did not think, and nothing is spent. Thread lines use their own prompt (`thread-v3`), which gives the speaker only their own knowledge.

## Play

1. Check in with a team name (see *Teams and the leaderboard* below).
2. Pick a case on the intro screen (or use `?case=<id>`), and read the briefing.
3. Ask each character in turn (Momo, Pip, Nori and Kiki in the grove; three apprentices in the tower). **Quick question** submits immediately; **Next: ask…** takes you to the next one. You can also type a question.
4. **Make your verdict**: pick a role for each character on a four-stop scale: Villain, Collaborator, Honest but fooled, or Honest (there is no Nobody or Not sure). Set confidence (Guessing, Fairly sure or Certain) and see the debrief, which shows the true role next to each pick. Every correct role scores; the debrief gives the score out of the number of characters. Written reasoning is optional.
5. Use **Play again** for the next colleague. The reset dialog has a case select, so the next game can be a different case. Previous research logs remain on disk.

**Coins and tools.** A game can have a coin budget (see `OVERRIDE_COIN_BUDGET` below). Three tools cost coins:

| Tool | Cost | Limit |
| --- | --- | --- |
| Ask a question | 2 coins | No charge limit |
| Inspect reasoning | 5 coins | 1 per game (2 with `OVERRIDE_REASONING_CHARGES=2`) |
| Let them talk | 1 coin per round of 3 lines | 3 rounds |

Inspect reasoning and Let them talk are the **Arbiter tools**. They sit in the left rail, and the briefing lists them with their prices. Each card shows its price and uses left, or why it is off. A card glows with a NEW tag the first time it is worth using: Inspect once the open chat's character has answered, Let them talk once everyone has been asked. Inspect reasoning acts on the character whose chat is open and shows how they reasoned about their last line. Let them talk is available from the start; it makes the characters post in a forum-style thread. They see each other's earlier lines but never your questions. Their lines appear as speech bubbles over the speaker and in the thread panel. Walking, the verdict and reset are free. Failed answers cost nothing. With a budget, the game keeps enough coins to ask each character you have not asked once. The top bar shows the coins you have left; the debrief shows the total.

### Big screen

`/?view=board` shows the leaderboard full screen for a projector. It is behind the access code, polls every 10 seconds, and is not counted as a player (no heartbeat, no check-in).

### Teams and the leaderboard

- **Check-in.** A new browser first asks for a team name (2 to 24 letters, numbers and spaces). Use one screen per team. If another screen already uses the name, the game asks whether to join that team; joining is the only way to share a name. The game follows the team: the same team on a second screen shows the same game, and **Cases** and **Reset** keep the team. **Change team** in the top bar switches to another name.
- **Scoring.** A verdict scores one point for each character whose role is right, the same score the debrief shows (up to 4 in the grove, 3 in the tower). Verdicts from older logs that named a single suspect score 1 point when the suspect was right. Only a team's first verdict per case in the current round counts. Time runs from the team's first start of that case to the counted verdict; coins are everything the team spent on that case until then. Ties are broken by time or by coins, as the operator chooses in the command centre. Teams that are still playing are listed without a rank.
- **Where it shows.** The **Leaderboard** button in the top bar and a button on the debrief open the board; your team's row is highlighted.
- **Without a check-in.** Old browsers and scripts that never join a team play as before but are not on the board.
- **One data directory per event.** Team names persist in `teams.jsonl` and stay taken. Use a fresh `OVERRIDE_ENV` (data directory) for each event.

Walk with WASD or the arrow keys, and press E or Space next to a monkey, the signpost or the start marker. Walking closes the dialogue box, and E opens it again. Clicking the world does not move the investigator; the destination buttons open a conversation or your verdict straight away. A basket of bananas sits on the picnic blanket. The characters blink and make small gestures on separate idle cycles, and react when you approach. Reduced-motion preferences disable these animations. Page turns keep drafts and the reading position; reduced-motion preferences disable those effects.

## Writing a case

A case is one module in `server/cases/`, registered in `server/cases/index.mjs`. `banana-mystery.mjs` (grove) and `tower-echo-bell.mjs` (tower) are the examples to copy. The required fields and the allowlist of what reaches the browser are in the "Decided" section of [the cases spec](../../docs/plans/2026-10-26-override-cases.spec.md); they are not repeated here. A live case is a **part case**: `characters` is `[{id, name, color}]`, and `parts` is `[{id, role, label, introduction, quickQuestion, knowledge[], finding}]` with one part for each character and `role` one of `villain`, `collaborator`, `fooled`, `honest`. Each game deals the characters into the parts at random. Text refers to other characters by part, as `{partId}` placeholders (for example `{planner}`), resolved to the name of whoever holds that part. A case also has `debrief {title, summary, lesson}`, `answer.feedback {correct, other}`, and three functions that return templates (the caller resolves the placeholders): `rehearsal(partId, question)`, `rehearsalReasoning(partId)` and `rehearsalChatter(partId, n)`. All of a part's `knowledge` goes into the prompt. A job label, introduction and quick question always belong to the same part, so the story stays consistent.

- Set `status: 'draft'` while writing. Draft cases are hidden unless the server runs with `OVERRIDE_DEV_TOOLS=1` (forced off when `NODE_ENV=production`).
- Run `npm run cases:prompt -- <case> <character> [--part <partId>] [--question "..."]` to print the exact prompt a character receives. It uses the identity cast (the first character plays the first part, and so on); `--part` puts the character in that part by swapping with whoever holds it, and an unknown part exits 1.
- A case has `agents` characters, where `agents` is set per world in `server/worlds.mjs` (an integer from 3 to 5; today `grove` 4 and `tower` 3). Every case in a world must match its world's number. Character ids match `/^[a-z][a-z0-9]{1,15}$/`. Set `world: 'grove' | 'tower'` (default `grove`) to choose the scene, sprites, cast art and wording. The tower art is described in `art/tower/ARTWORK.md`; missing PNGs fall back to code-drawn placeholders.
- The live cases are `banana-mystery` (grove; the planner made up the permission) and `tower-echo-bell` (tower). Archived and unregistered: `override-v1`, `banana-control`, `tower-bell-charm`, `tower-missing-yes`. Archived cases are legacy (no `parts`): the game refuses them until they are ported to parts; they are only used by their own tests.

## Research records

The server writes append-only JSONL files under `data/<env>/`, or under `OVERRIDE_DATA_DIR` if set. `<env>` is `OVERRIDE_ENV` (default `live`). These files are outside the served directory.

- `sessions/<sessionId>.jsonl`: the player export, one file per game. **Export session** downloads the current game; older files remain on disk after reset.
- `traces/<sessionId>.jsonl`: one record per LLM attempt with the full request and response. Admin only: never served to players. Probes go to `traces/probes.jsonl`.
- `system.jsonl`: operator and system events, such as endpoint changes (`llm_active`), `leaderboard_settings` and `team_hidden`.
- `teams.jsonl`: `team_created {teamId, name}` and `team_session {teamId, sessionId}` records; the team list is rebuilt from it on restart.

Every event includes `schemaVersion` (3), `eventId`, `sequence`, `timestamp`, `elapsedMs`, `sessionId`, `caseId`, `caseVersion`, `contentHash`, `promptVersion`, `revealedPosition`, `selectedEvidence`, `character`, `question`, `answer`, interview `mode`, and `model`. Fields that do not apply are `null`. Question and answer events are linked by `questionEventId`; failures are recorded separately. `session_started` adds `cast` (character id → part id, for example `{momo: 'planner'}`), `assignment` (`fixed` when the request named a case, else `default`), `env`, `appCommit`, `appDirty`, `endpointsHash`, and `team {id, name}` (`null` without a check-in). `revealedPosition` and `selectedEvidence` are kept for old readers and are always `null` since 2026-10-29. Additional payloads record locations and the complete submitted verdict: `{roles, truth, results, score, total, confidence, explanation, evidenceIds: [], submittedAt}`, where `roles` is the pick for each character, `truth` the real roles, `results` right or wrong for each, and `score` of `total` the number right. There is no `suspect` field. Replay of a log needs schema 3 and a cast that maps each character to a different part; it restores the cast and the team.

`interview_answer` and `interview_failed` carry `provenance` (`null` in rehearsal mode): the endpoint, host, model, attempts, whether it failed over, queue and call time, token counts, sampling parameters, and the IDs of the matching trace records.

Recorded events: session start/reset, briefing viewed, location visited, interview question/answer/failure, verdict submitted, and debrief viewed. Frame-by-frame player coordinates and unsent text are intentionally not recorded. The UI explains that investigation actions and dialogue are recorded.

Live responses also emit `interview_provider_response`, linked by `questionEventId`, with the endpoint, attempt number, completion token limit, HTTP status, finish reason, completion token usage, and duration. Provider bodies never appear in these session events or in responses; provider reasoning is handled as described under Live interviews.

Coin events carry their cost. `session_started` gains `economy`, costed events carry `spend {tools, cost, total}`, and `verdict_submitted` gains `coins {spent, budget}`. New events are `reasoning_inspected`, `chatter_line`, `chatter_failed` (a thread line that failed; it spends nothing), and `chatter_provider_response`. `schemaVersion` is 3 for every event. `GET /api/events` returns `cast: null` while the game is active and the real cast only after the verdict, so the export cannot leak who played which part.

One server process serves every player. Each browser’s game lives in memory while active and is rebuilt from its JSONL log when its player returns, also after a restart or about 30 idle minutes, so progress survives both. Requests carry a session ID and revision to reject stale writes from another tab. A game’s mutations are locked while its live answer is pending; other players are never blocked. The demo has a technical limit of 40 questions per character and 1,200 characters per question; study budgets are not implemented.

A session can carry two `contentHash` values when content was published while it was in progress and later replayed. The `admin_action` records with `action: "content_published"` in `system.jsonl` (with `by`, `caseId`, `rev`, `contentHash` and `fields`) join them.

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
- **Message log.** Live game events with filters. The log shows `chatter` and `inspect` rows, each with its cost. Click a player to see that player's whole session, read from disk, so evicted games work too; the drill-down shows the team's coins. Player text shows only here, behind the token.
- **Funnel and tallies.** Per case: started, first question, interviewed all, verdict; then verdicts, percent of roles right, how many players got every role right (perfect), per-role bars (right of total for Villain, Collaborator, Honest but fooled and Honest), and median time and questions to a verdict, and median coins at verdict. Log rows show a verdict as, for example, `3/4 roles · 70 %` (score and confidence).
- **Rounds.** *Start round* names a new session (for example a new class). It is stored as a `round_started` record in `system.jsonl`, resets the funnel, tallies and *players this round*, and survives a restart. Without one, the round is everything in the data directory.
- **Leaderboard.** The same standings as players see, plus hidden teams. The *Ties by* Time / Coins toggle is saved in `system.jsonl` and restored on restart. **Hide** and **Show** moderate a team: a hidden team leaves the public board (and stays visible here). Starting a new round empties the board. Log rows show team names.
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
curl -H "$AUTH" http://127.0.0.1:3002/admin/leaderboard
curl -H "$AUTH" -H 'Content-Type: application/json' -d '{"rankBy":"coins"}' http://127.0.0.1:3002/admin/leaderboard
curl -H "$AUTH" -H 'Content-Type: application/json' -d '{"teamId":"<team-id>","hidden":true}' http://127.0.0.1:3002/admin/teams/hidden
```

`/admin/stream` is NDJSON: a `hello` line (catalog, snapshot, recent rows), then an `event` line per game event and a `tick` line with a fresh snapshot every second. At most 5 streams are open at once. `/admin/round` takes a label of 1 to 60 characters. `GET /admin/leaderboard` returns the full standings with team ids and hidden flags; `POST /admin/leaderboard {"rankBy": "time"|"coins"}` sets the tie-break; `POST /admin/teams/hidden {"teamId", "hidden"}` hides or shows a team. `/admin/sessions/<id>` returns `{sessionId, rows}`, or 404.

`cap` takes `"endpoint": null` for the global cap. `pause` stops new games and lets running ones finish. `GET /api/health` on the game port is a public liveness check. `POST /api/heartbeat {"tab": "<uuid>"}` on the game port needs the access cookie, answers 204 with no body, and only feeds the online count.

`/metrics` is Prometheus text: players (`override_sessions_*`), LLM per endpoint (`override_llm_*`: in flight, queue, failures by reason, failovers, durations), HTTP, log writes (`override_log_write_*`), and process and disk gauges. Labels never hold session IDs or text. [ops/prometheus.yml](ops/prometheus.yml) scrapes it every 5 s and includes example alert rules.

## Tuning a case from the admin page

For game makers who change the words of a case, not its structure. Open `http://127.0.0.1:3002/admin/maker.html?case=<caseId>` on the admin port, one link per game (for example `?case=banana-mystery`). Reach it over the same SSH forward as the command centre, over Tailscale, or over a protected hostname; see [DEPLOY](DEPLOY.md#6-run-the-event). The admin port is never on the public player tunnel.

Each maker gets a token of their own. Set `OVERRIDE_MAKER_TOKENS=alice:secret1,bob:secret2`, one `name:secret` pair per maker; a name is 1 to 32 characters of `a-z`, `0-9`, `_` or `-`, and names must be unique. A maker token opens the editor page and the `/admin/content` routes only; every other admin route answers 403. The admin token can edit too, and its edits are logged as `admin`.

**Editable:** the setting and the use and avoid word lists; each part's knowledge, label, introduction, quick question and finding; the briefing, intro and report copy; the debrief and the feedback text.

**Locked:** the case id, version, world, characters, part ids and roles, the rehearsal scripts, and the shared rule template in `server/interviews.mjs`. Structure stays in the case module (see [Writing a case](#writing-a-case)).

Each publish sends the whole set of edits, not a patch. It replaces the previous edits for that case. Entries equal to the authored text are dropped.

Edits apply to new games only. A game in progress keeps the text it started with until it has been idle for 30 minutes or the server restarts. To test an edit in a running game, press **Reset session**.

- **Preview** shows the exact prompt the model would receive for the draft. Nothing is sent to the model and nothing is saved.
- **Try** asks the real model the question you type, with the draft text, and shows the answer and its reasoning. It is live mode only (409 in rehearsal). It uses the players' queue, and the trace row carries `tag: maker_try`.
- **Publish** saves the draft as a new revision. It names the revision you based it on. If someone else published first, the server answers 409 and the page asks you to reload. The `content_published` admin action in `system.jsonl` holds the maker, the changed paths and the new `contentHash`, not the text.

Each publish or revert adds a revision: 1, 2, and so on. Rev 0 is the authored text. **Restore** sets an earlier revision as current by adding a new revision that carries its text, so the history is never rewritten. Restore authored returns to rev 0.

Edits live in `data/<env>/content/<caseId>.jsonl`, one line per revision, append-only. The server replays the file at boot. A revision whose case version no longer matches is skipped, so a new case version starts authored. If a stored text no longer validates against the case, the case stays authored and the page shows it as stale.

```sh
export TOKEN=...   # a maker token from OVERRIDE_MAKER_TOKENS
AUTH="Authorization: Bearer $TOKEN"
curl -H "$AUTH" http://127.0.0.1:3002/admin/content
curl -H "$AUTH" http://127.0.0.1:3002/admin/content/banana-mystery
curl -X PUT -H "$AUTH" -H 'Content-Type: application/json' -d '{"edits":{"copy.intro.lead":"New lead"},"baseRev":0}' http://127.0.0.1:3002/admin/content/banana-mystery
curl -H "$AUTH" -H 'Content-Type: application/json' -d '{"edits":{},"characterId":"momo"}' http://127.0.0.1:3002/admin/content/banana-mystery/preview
curl -H "$AUTH" -H 'Content-Type: application/json' -d '{"edits":{},"characterId":"momo","question":"What happened?"}' http://127.0.0.1:3002/admin/content/banana-mystery/try
curl -H "$AUTH" -H 'Content-Type: application/json' -d '{"rev":0}' http://127.0.0.1:3002/admin/content/banana-mystery/revert
```

`GET /admin/content` lists every case with its revision, maker and content hash. `GET /admin/content/<caseId>` adds the structure, the authored and current text, and the history (no text). A `PUT` with a stale `baseRev` answers 409; a bad path answers 400 with `{error, path}`, and the 409 body is `{error, rev, by}` (the current revision and its maker). Request bodies are limited to 512 KB.

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

Before an event, check the real endpoints: answer quality for each character, then capacity at 10 to 200 simultaneous questions.

```sh
node --env-file-if-exists=.env scripts/preflight.mjs --capacity --out preflight.json
```

It prints a table per endpoint with review flags (empty, length, a character out of role) and, with `--capacity`, errors and p50/p95 latency per step. The capacity run lifts each endpoint's `maxInFlight` for the run. It makes about 9 real calls per endpoint (3 characters, 3 questions each), plus several hundred with `--capacity`.

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
| `OVERRIDE_LLM_REASONING_EFFORT` | empty | Sent as `reasoning_effort`; empty sends nothing (see *Live interviews*). |
| `OVERRIDE_LLM_TIMEOUT_MS` | 60000 | Per-question deadline. |
| `OVERRIDE_LLM_MAX_IN_FLIGHT` | 200 | Global cap on simultaneous LLM calls. |
| `OVERRIDE_LLM_FAILOVER_FAILURES` | 5 | Failures that trigger failover. |
| `OVERRIDE_LLM_FAILOVER_WINDOW_MS` | 30000 | Window for that count. |
| `OVERRIDE_ACCESS_CODE` | empty | Shared access code; empty leaves the API open. |
| `OVERRIDE_SECRET` | random per process | Signs sign-in tokens; set it so sign-ins survive restarts. |
| `OVERRIDE_TRUST_PROXY` | off | `1` or `true` behind a proxy: client address from `CF-Connecting-IP`, else `X-Forwarded-For`. |
| `OVERRIDE_ADMIN_TOKEN` | empty | Bearer token; the admin listener stays off while empty. |
| `OVERRIDE_ADMIN_PORT` | 3002 | Admin listener port (127.0.0.1). |
| `OVERRIDE_MAKER_TOKENS` | empty | Maker `name:secret` pairs, comma separated. Content editing only: the editor page and `/admin/content`. |
| `OVERRIDE_ADMIN_HOSTS` | empty | Extra `Host` names the admin listener accepts, comma separated, for a tunnel hostname. |
| `OVERRIDE_DATA_DIR` | `./data` | Root for research records. |
| `OVERRIDE_ENV` | `live` | Data subdirectory, e.g. `rehearsal`. |
| `OVERRIDE_APP_COMMIT` | empty | Recorded in `session_started`. |
| `OVERRIDE_DEV_TOOLS` | off | `1` shows draft cases in the catalog and lets them start; ignored when `NODE_ENV=production`. |
| `OVERRIDE_COIN_BUDGET` | empty | Coin budget per game: empty means no budget; otherwise an integer from the minimum (2 coins × the largest world's agents, 8 today) to 999. |
| `OVERRIDE_REASONING_CHARGES` | 1 | Reasoning inspections per game: 1 or 2. |
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

If Google Chrome is already installed, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` uses it instead. Browser tests use a separate rehearsal server and separate data directory; they never use the live API key. They exercise walking between rooms, follow-ups, all interviews, verdict, debrief, JSONL download, reset, mobile layout, and recovery from provider errors.

## Structure and artwork

- `server/cases/` and `server/cases.mjs`: one module per case (characters, parts with their knowledge, debrief, scripted rehearsal replies), the registry, and the `defineCase` and cast helpers (`resolve`, `partOf`, `identityCast`, `publicView`); never imported into the client.
- `scripts/case-prompt.mjs`: prints the exact interview prompt for a case and character.
- `server/session.mjs`: per-game state for one registered case, including the random cast (server side only until the verdict), replay from logs, role verdict validation and scoring, and research logs. A verdict records `roles`, `truth`, `results`, `score`, `total`, confidence, and the optional explanation.
- `server/llm.mjs`: the endpoint router (queues, caps, failover, traces). `server/admin.mjs` (with the page in `server/admin/`), `server/monitor*.mjs` (event ring, round stats, windows, traffic sampling), `metrics.mjs`, `identity.mjs`, `dataset.mjs`, `static.mjs`: admin listener, Prometheus metrics, sign-in tokens and limits, JSONL storage, in-memory static files.
- `server/roles.mjs` and `server/worlds.mjs`: the four roles, and the worlds with their agent counts.
- `server/interviews.mjs`: endpoint configuration, the shared short-answer prompt template (`interview-v5`, `thread-v3`), and the hand-off to each case’s scripted rehearsal replies.
- `server/index.mjs`: API, optional shared access code, and production static serving.
- `client/station.ts`: the Phaser world (grove and tower), nearby interactions, and speech bubbles. `client/stage-layout.ts` sizes the game to the window and places the 480x340 world in it; `client/bubble-layout.ts` places a bubble above its speaker.
- `client/detective-walk.ts`: distance-driven walking with four facing directions and support for high-refresh displays.
- `client/monkey-idle.ts`: independent NPC blinks, idle gestures, and approach reactions with fixed collision positions.
- `client/heartbeat.ts`: the visible-tab heartbeat behind the online count.
- `client/main.ts`: wiring for briefing, live interviews, verdict and debrief.
- `client/hud.ts`: the HUD shell (top bar, cast cards, Arbiter tools); `client/tools.ts`: tool cards and prices.
- `client/dialogue.ts`: the briefing and interview panels; `client/notebook.ts`: page transitions and preserved drafts and reading position.
- `client/lineup.ts`: the verdict scale; `client/debrief.ts`: the debrief page.
- `client/team.ts` and `client/board.ts`: check-in and the leaderboard / big screen.
- `client/style.css` and `client/stage.css`: the token base and the stage; `hud.css`, `dialogue.css`, `lineup.css`, `team.css`, `board.css`, `bubbles.css`, `case-board.css` and `banana.css` style their modules.
- `public/assets/banana/` and `public/assets/tower/`: original generated transparent character and prop atlases. `art/banana/ARTWORK.md` and `art/tower/ARTWORK.md` contain provenance and the full image-generation prompts; the prompt files are in `art/banana/` and `art/tower/`. Phaser uses atlas frames without changing the source PNGs. No Pokémon art is loaded by this demo.

The font is Atkinson Hyperlegible Next, bundled in `client/fonts` under the SIL Open Font License, so the game makes no third-party requests and looks the same on a closed network.

For a research study, add controlled case assignment, configurable budgets, validated cases (including no-misalignment cases), and debrief timing controls. Those features are deliberately outside this demo.
