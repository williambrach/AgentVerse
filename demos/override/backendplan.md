# Backend plan: The Banana Mystery for 200 concurrent players

This plan takes the Override demo from one shared investigation to a hosted study: 200 players at once, each with an independent game, running on one Mac, collecting a research dataset, with LLM fallback across 3–4 endpoints and live monitoring.

It covers the backend and operations. Frontend changes appear only where the backend depends on them ([section 11](#11-frontend-dependencies)).

## Contents

1. [Goals and non-goals](#1-goals-and-non-goals)
2. [Open decisions](#2-open-decisions)
3. [Baseline](#3-baseline)
4. [Architecture](#4-architecture)
5. [Sessions and identity](#5-sessions-and-identity)
6. [Dataset and traces](#6-dataset-and-traces)
7. [LLM routing](#7-llm-routing)
8. [Monitoring and admin](#8-monitoring-and-admin)
9. [Performance and static delivery](#9-performance-and-static-delivery)
10. [Security](#10-security)
11. [Frontend dependencies](#11-frontend-dependencies)
12. [Hosting on the Mac](#12-hosting-on-the-mac)
13. [Testing and rehearsal](#13-testing-and-rehearsal)
14. [Event runbook](#14-event-runbook)
15. [Phases](#15-phases)
16. [Risk register](#16-risk-register)
17. [Evidence so far](#17-evidence-so-far)
18. [Appendix: modules, config, environment](#18-appendix-modules-config-environment)

## 1. Goals and non-goals

**Goals**

- 200 concurrent players, each playing an independent game.
- One Mac hosts everything: game server, monitoring.
- The game is also a dataset collection: every prompt, answer, and decision is recorded with enough provenance to analyse it later.
- LLM fallback across 3–4 OpenAI-compatible endpoints, with one switch that moves every player.
- Live monitoring of players, LLM endpoints, and the server.
- A restart or crash does not lose games or data.

**Non-goals**

- Multiple server instances, high availability, or zero-downtime deploys. One process is enough for 200 players ([section 17](#17-evidence-so-far)).
- Cloud hosting. DEPLOY.md keeps covering Render for small demos.
- Thousands of players. That would need external state (Postgres/Redis), stateless servers, and a CDN.

## 2. Open decisions

Each decision changes the design. The plan assumes the default until it is decided.

| # | Decision | Default in this plan | What changes otherwise |
| --- | --- | --- | --- |
| D1 | Does "different game" mean a separate copy of the same case, or different cases per player? | Same case, separate copy per player | Different cases need a case registry, assignment rules, and per-session case loading ([5.8](#58-extension-multiple-cases)). |
| D2 | Do players reach the Mac on the same network or over the internet? | Both paths are described; pick one before rehearsal | LAN: Wi-Fi capacity and client isolation. Internet: Cloudflare Tunnel and its edge cache ([12.2](#122-network)). |
| D3 | Identity: per-participant links or anonymous cookies? | Participant links for the study, cookie mode for open demos | Cookies alone cannot detect duplicate people, link to surveys, or resume across devices. |
| D4 | Store model reasoning traces and raw provider bodies? | Off (matches the current README promise) | On requires a consent text change, README change, and more storage. It cannot be added after the event. |
| D5 | Switching policy | Failover moves forward automatically after repeated failures; only an operator moves traffic back | Automatic return to a recovered endpoint moves traffic back and forth on a flaky endpoint ([7.1](#71-design-routing-lives-in-the-game-server)). |
| D6 | Repeat plays | Allowed, linked, and flagged with a play index | Study mode can block a second play per participant. |
| D7 | Which providers may receive participant text? | Only providers named in the consent text | Every fallback endpoint must be covered by consent, or excluded. |

## 3. Baseline

The committed demo (`cd24be8`) is built for one supervised investigator at a time:

| Area | Today | Limit at 200 players |
| --- | --- | --- |
| Game state | One `Investigation` with one `session` ([server/session.mjs](server/session.mjs)) | All players share one game. Anyone can reset it. |
| Locking | One global `busy` flag | A pending answer (up to 60 s) blocks every other player. |
| Export | `/api/events` exports the active session | A player can download someone else's data. |
| Sign-in | Shared access code; tokens in memory | Restart signs everyone out. |
| Login limiter | Counts every attempt per socket address, 10 per minute | Behind a proxy or shared network, the 11th correct sign-in per minute fails. |
| LLM | One endpoint, retry on truncation, diagnostics only | No fallback; no exact prompt, raw response, or endpoint in the log. |
| Durability | Append-only JSONL per session | Logs survive a restart; active games do not. |
| Static files | Read from disk per request, uncompressed | About 6.6 MB per player, 1.3 GB for 200 at once. |
| Monitoring | Console errors only | No visibility during the event. |

A prototype of the session registry, replay, and login limiter exists in the working tree on `demo/override` (uncommitted). It was load-tested with 200 simulated players ([section 17](#17-evidence-so-far)).

## 4. Architecture

```
                         ┌────────────────────────── Mac ───────────────────────────┐
players ─► LAN or tunnel ┼─► game server :3001 (public)                             │
                         │    ├─ game API, sessions, identity                       │
                         │    ├─ LLM controller ────────────────────────────────────┼─► endpoint A (order 1)
                         │    │   (queue, failover, pin, provenance)                ├─► endpoint B (order 2)
                         │    ├─ dataset writers ─► data/<env>/…                    ├─► endpoint C (order 3)
                         │    └─ static files (precompressed, in memory)            └─► endpoint D (order 4)
                         │  game admin 127.0.0.1:3002 (/admin, /metrics, admin API) │
                         │  Prometheus 127.0.0.1:9090 ◄─ scrapes the game           │
                         │  Grafana 127.0.0.1:3000                                  │
                         │  backup job: data/ ─► external disk (+ cloud)            │
                         └──────────────────────────────────────────────────────────┘
outside the Mac: uptime check against the public /api/health
```

| Process | Port | Bound to | Supervised by |
| --- | --- | --- | --- |
| Game server (Node) | 3001 public, 3002 admin | public: LAN or tunnel; admin: 127.0.0.1 | launchd or pm2 |
| Prometheus | 9090 | 127.0.0.1 | Homebrew service |
| Grafana | 3000 | 127.0.0.1 | Homebrew service |
| cloudflared (internet path only) | none | outbound only | launchd |
| Backup job | none | none | launchd timer |

The game server emits each event once on an internal event bus. Dataset writers, metrics, and the admin live stream subscribe to it. Game logic stays free of instrumentation code.

## 5. Sessions and identity

### 5.1 One game per player

- `Investigations` registry: `Map<sessionId, Investigation>`. The existing `Investigation` class becomes one game; its `busy` flag becomes a per-game lock.
- Session cookie `override_session` (HttpOnly, SameSite=Strict, Secure on HTTPS, 12 h).
- `/api/state`, `/api/events`, and all actions resolve the game from the cookie. Export returns 404 without a session.
- Reset closes the current session (its log stays on disk), starts a new one, and sets a new cookie.
- Existing stale-write protection stays: every action carries `sessionId` and `revision`; a mismatch returns 409 and the client refreshes.

### 5.2 Restore from logs

The JSONL log is the source of truth. On a cache miss the server rebuilds the game by replaying `sessions/<id>.jsonl`.

- Validate the session ID as a UUID before it touches the file system.
- Refuse logs from another `caseVersion`, logs with a sequence gap, and sessions that ended in `session_reset`.
- A torn final line (crash during a write) is dropped and the file is truncated to the last complete line before the next append. The game resumes from the last complete event.
- `log()` reads the clock once per event, so `startedAt` and turn timestamps rebuild exactly.
- Idle games (30 min) leave memory and reload on the next request.

### 5.3 Participant links (D3)

For the study, each participant gets a personal link: `https://<host>/p/<token>`.

- Token: `base64url(participantId . expiry . HMAC(secret, participantId . expiry))`. No database lookup is needed to verify it.
- Opening the link verifies the token, sets a signed `override_participant` cookie, and redirects to `/`.
- `participants/<participantId>.jsonl` records `link_opened`, `consent_given`, and `session_assigned`. Opening the same link on another device resumes the participant's current game.
- `scripts/make-links.mjs` generates a CSV of participant IDs and links. Participant IDs are pseudonyms; any mapping to real identities lives outside this system.
- In link mode the shared access code is not needed. Cookie mode (shared code, anonymous sessions) remains for open demos.

### 5.4 Repeat plays (D6)

- `session_started` records `playIndex` and `previousSessionId` for the participant (or browser in cookie mode).
- Default: repeat plays are allowed and flagged. `OVERRIDE_MAX_PLAYS` can block further plays in study mode.
- Analysis uses `playIndex = 1` unless repeat behaviour is the research question.

### 5.5 Environments

`OVERRIDE_ENV` is `live`, `rehearsal`, or `test`. Each has its own data folder (`data/<env>/`) and is written into every event. Smoke tests and load tests never run with `live`.

### 5.6 Sign-in that survives restarts

Access tokens become stateless: `HMAC(secret, expiry)`. A restart no longer signs everyone out. The secret comes from `OVERRIDE_SECRET`.

### 5.7 Limits and abuse

| Limit | Default | Why |
| --- | --- | --- |
| Failed access codes | 30 per minute per address; correct codes never count | Many players share one address behind a tunnel or venue network. |
| Proxy header for client address | Trusted only when `OVERRIDE_TRUST_PROXY` is set | Otherwise anyone can forge it. |
| New sessions | Global rate limit (for example 20 per second) and per-participant limit | A script cannot create thousands of games. |
| Questions | One in flight per game (existing lock), at most 6 per minute per game, 40 per character (existing) | One player cannot use up LLM capacity. |
| Request size | 16 KB (existing) | Existing protection. |

### 5.8 Extension: multiple cases (D1)

If players get different cases:

- Case registry: `server/cases/<caseId>.mjs`, each exporting the current case shape with its own `caseVersion` and `promptVersion`.
- Assignment: balanced random, fixed by participant link, or chosen by an admin; recorded in `session_started`.
- Replay loads the case named in the log instead of the current default.
- Preflight runs per case ([7.6](#76-preflight-check)).
- The client already receives characters, chapters, and records from the server; only per-case artwork needs frontend work.

## 6. Dataset and traces

### 6.1 Required data

These items are missing today and are required:

- The exact prompt sent. Today it can only be rebuilt from the code version, which breaks as soon as the code changes.
- The raw model response and prompt token counts.
- Which endpoint answered.
- App version, participant ID, consent version, and client info.
- Endpoint switches.

Each item's source:

| Item | Source |
| --- | --- |
| Exact prompt sent | The game logs the messages it builds, in `traces/<sessionId>.jsonl`. |
| Raw response and token counts | The game logs the response it receives: content, finish reason, the raw `usage` object (field names differ by provider; the provenance object carries normalised counts), provider model name. |
| Which endpoint answered | The controller records the endpoint it called: stable name (`a`), API base host, provider model name, attempt number, and whether the question had already failed over. |
| App version | Git commit and dirty flag, read at startup (`OVERRIDE_APP_COMMIT` in packaged builds). |
| Participant ID, consent version | Participant link and consent step ([5.3](#53-participant-links-d3)). |
| Client info | `User-Agent` header plus a small validated object sent with `start`: viewport, language, time zone, reduced-motion preference. |
| Endpoint switches | `system.jsonl`: every automatic failover with its counts and reason, and every manual change with the operator's reason. |

### 6.2 File layout

```
data/<env>/
  sessions/<sessionId>.jsonl     game events; the player export
  traces/<sessionId>.jsonl       one record per LLM attempt; admin only
  participants/<id>.jsonl        link, consent, session assignment
  system.jsonl                   switches, pins, restarts, config hashes, admin actions, deletions
```

Traces are never in the player export. The system prompt contains the solution and each monkey's private motive.

### 6.3 Event changes

**`session_started`** adds: `appCommit`, `appDirty`, `env`, `participantId`, `playIndex`, `previousSessionId`, `consentVersion`, `client` (user agent, viewport, language, time zone, reduced motion), `endpointsHash`.

**`interview_answer`** and **`interview_failed`** add a `provenance` object: `endpoint` (stable name such as `a`), `apiBaseHost`, `providerModel`, `attempts` (number of LLM calls for this question), `failedOver` (true when the answer came from a different endpoint than the first attempt), `pinned`, `queueMs`, `durationMs`, `promptTokens`, `completionTokens`, `reasoningTokens` (when reported), `samplingParams`, `traceIds`, `semanticRetry` (true when the game retried an empty or truncated answer).

`schemaVersion` becomes 2. A schema document lists every field.

### 6.4 Trace record

One line per LLM attempt:

```json
{
  "schemaVersion": 1,
  "traceId": "…",
  "sessionId": "…",
  "questionEventId": "…",
  "attempt": 1,
  "timestamp": "…",
  "endpoint": "a",
  "pinned": false,
  "request": { "apiBaseHost": "…", "model": "<provider model>", "messages": ["…exact messages…"], "params": { "max_completion_tokens": 2048, "temperature": 0.7 } },
  "response": { "status": 200, "content": "…", "finishReason": "stop", "usage": { "prompt_tokens": 0, "completion_tokens": 0 }, "providerModel": "…" },
  "queueMs": 0,
  "durationMs": 0,
  "error": null
}
```

Authorization headers and keys are never written. Reasoning content is written only when D4 is on.

### 6.5 Durability and backup

- Keep write-before-acknowledge with `appendFileSync`. A process crash loses nothing: the write already reached the OS.
- A power loss or kernel panic can lose recent writes. On macOS a full flush is slow (several ms), so flush touched files on a timer about once a second instead of after every write.
- Backup job: `rsync data/` to an external disk every 5 minutes, and optionally to cloud storage. Backups may contain a torn last line; the validator and replay skip it.
- After the event, restore the backup to another folder and run the validator against it.

### 6.6 Validation and export

- `scripts/validate-data.mjs`:
  - every session has a gapless sequence
  - every answer has provenance and a matching trace
  - every session has a consent version and an app commit
  - session counts match participant assignments
- It also flags sessions that mixed models, include a failover, are repeat plays, or are incomplete.
- Admin export: one archive per environment with sessions, traces, participants, `system.jsonl`, the schema document, and the endpoint configuration hash.
- Analysis: DuckDB reads the JSONL directly (`read_json_auto('data/live/sessions/*.jsonl')`).
- A dataset card records versions, providers, known incidents from `system.jsonl`, and exclusion rules.

### 6.7 Optional client telemetry

Off by default. If enabled:

- `POST /api/telemetry` accepts batched events: panel viewed, quick versus typed question, time to first question.
- It has a size cap and a rate limit, and writes to `telemetry/<sessionId>.jsonl`.
- Player coordinates and unsent text stay excluded unless consent and the README change.

### 6.8 Consent and privacy

- Consent screen before `start`. Its version is logged in the participant file and in `session_started`.
- The consent text names every provider that may receive participant text, including all fallback endpoints (D7).
- Pseudonymous participant IDs. Typed questions can still contain personal data, so treat all text as personal data.
- Deletion: `scripts/delete-participant.mjs <id>` removes the participant's sessions, traces, and telemetry, then logs the deletion (without content) to `system.jsonl`.
- Retention period and access rules are written down before the event. The data folder is owned by the service user with mode 0700.

## 7. LLM routing

### 7.1 Design: routing lives in the game server

The game server calls the 3–4 endpoints directly. There is no proxy between the game and the providers.

The game has to handle semantic failures, pinning, the queue, and provenance in any design. A proxy sees HTTP 200 for an empty or reasoning-only answer and counts it as a success, and it knows nothing about the per-question deadline or the player waiting. Once the game does that work, a proxy adds a process that can be down, a second retry layer to cap, and failover semantics to verify, and it removes nothing. A proxy would also have held the provider keys; on one Mac with a dedicated service user, the game's environment holds them instead ([section 10](#10-security)).

The routing rule:

- Endpoints are an ordered list, `a` first. One index marks the active endpoint.
- A question goes to the active endpoint. If the attempt fails, the question tries the next endpoint in order, once.
- Repeated failures on the active endpoint move the index forward automatically. **Nothing moves it back except an operator.** This is what stops traffic from flapping between a flaky primary and its backup.
- The operator can set the active endpoint to any entry and pin it, which stops automatic advance.

### 7.2 Endpoint configuration

`ops/endpoints.json` lists the endpoints in priority order. Keys stay in the environment and are referenced by variable name:

```json
[
  { "name": "a", "baseUrl": "https://<endpoint-a>/v1", "model": "<model-a>", "keyEnv": "OVERRIDE_ENDPOINT_A_KEY", "maxInFlight": 50, "tokenParam": "max_completion_tokens", "timeoutMs": 25000, "temperature": 0.7 },
  { "name": "b", "baseUrl": "https://<endpoint-b>/v1", "model": "<model-b>", "keyEnv": "OVERRIDE_ENDPOINT_B_KEY", "maxInFlight": 50, "tokenParam": "max_tokens", "timeoutMs": 25000, "temperature": 0.7 }
]
```

- `maxInFlight` is the per-endpoint cap on concurrent calls. It comes from the capacity table ([7.4](#74-endpoint-capacity)).
- `tokenParam` names the completion-budget parameter the provider accepts (`max_tokens` or `max_completion_tokens`).
- `timeoutMs` is the per-attempt timeout. Queue wait plus two attempts must fit inside the 60 s question deadline.
- `temperature` and the token budget are sent explicitly on every call and logged. Provider defaults differ.
- The existing `OVERRIDE_LLM_BASE_URL`, `OVERRIDE_LLM_API_KEY`, and `OVERRIDE_LLM_MODEL` still configure a single endpoint named `a`. `OVERRIDE_ENDPOINTS` replaces them when set. Rehearsal mode (no key, no model) is unchanged.
- The file is validated at startup: unique names, HTTPS or localhost HTTP, every `keyEnv` present. A hash of the file (without keys) is logged at startup and written into every `session_started` as `endpointsHash`.

### 7.3 Controller

New module `server/llm.mjs`, replacing the direct provider call in [server/interviews.mjs](server/interviews.mjs). The prompt builder and the scripted rehearsal answers stay where they are.

- **Active endpoint:** an index into the list plus a `pinned` flag. Every change is written to `system.jsonl` and restored on restart.
- **Attempt:** one HTTP call to one endpoint with that endpoint's key, model, token parameter, timeout, and sampling parameters.
- **Failed attempt:** connection errors, timeouts, HTTP 429 and 5xx, empty content, reasoning-only output, content-filter results, and invalid answers. HTTP 401 and 403 also count as failures but raise an alert at once: a bad key does not get better.
- **Retry:** a failed attempt tries the next endpoint in order. `finish_reason: length` retries on the same endpoint with double the token budget, as today. Either way a question makes **at most two LLM calls**, so retries never multiply.
- **Automatic failover:** when the active endpoint accumulates 5 failed attempts within 30 s (`OVERRIDE_LLM_FAILOVER_FAILURES`, `OVERRIDE_LLM_FAILOVER_WINDOW_MS`), the index advances to the next endpoint and `endpoint_failover` (time, from, to, reason, counts) goes to `system.jsonl`. A pinned endpoint never advances. At the end of the list the index stays put and failures reach the player as errors.
- **Deadline:** one deadline per question (60 s, as today). Queue wait and both attempts count against it.
- **Queue:** one semaphore per endpoint sized by `maxInFlight`, plus a global cap `OVERRIDE_LLM_MAX_IN_FLIGHT`. Waiting questions queue in arrival order, and the client shows the queue position. Both caps are adjustable live from the admin API. A retry on the next endpoint waits for that endpoint's semaphore too, so a failover cannot overload the backup.
- **Provenance:** every attempt writes a trace record and the `provenance` object on the event ([6.3](#63-event-changes), [6.4](#64-trace-record)).
- **Health:** no background health checks. Real traffic is the health check, and the preflight script checks every endpoint before the event. The controller keeps per-endpoint counters (in flight, last success, last failure, failures in the last 5 minutes) for the admin page and metrics. The admin API can send one probe question to any endpoint, so the operator can check a recovered endpoint before moving traffic back.

### 7.4 Endpoint capacity

Fill this in from the preflight load step before the event:

| Endpoint | Model | Max concurrent before errors | p95 latency at 50 concurrent | Rate limits | Consent covers it |
| --- | --- | --- | --- | --- | --- |
| A | | | | | |
| B | | | | | |
| C | | | | | |
| D | | | | | |

When the active endpoint fails at peak, about 200 queued questions move to the next endpoint. If that endpoint holds fewer, its semaphore keeps the rest in the queue instead of letting them turn into 429s and a cascade to C and D. The capacity table sets the semaphores, so it must be filled in before the event.

### 7.5 Switching policy (D5)

- Brief failures are absorbed by the one retry per question.
- Sustained failures advance the active endpoint automatically ([7.3](#73-controller)). The operator also moves it by hand when:
  - the active endpoint's error rate is above 20% for 1 minute, **or**
  - p95 latency is above 30 s for 2 minutes.
- Traffic never returns to an earlier endpoint on its own. The operator moves it back between rounds, not during one, after probes against it have succeeded for 10 minutes.
- Every manual change is logged with a reason typed by the operator. Every automatic change is logged with its failure counts.

### 7.6 Preflight check

`scripts/preflight.mjs` runs against every endpoint before rehearsal and on the event day:

- **Fidelity:**
  - Every character, with and without each clue presented, gets the quick question and two follow-ups.
  - Checks: non-empty, short (about 15–40 words), in character, and consistent with the case. Momo admits the invented permission when asked. Pip does not claim to know Momo's motive. Nori did not hear the bell.
  - Output: a report per endpoint for human review.
- **Capacity:** step up concurrency (10, 25, 50, 100, 200) and record errors and latency into the capacity table.

## 8. Monitoring and admin

### 8.1 Admin listener

A second listener on `127.0.0.1:3002`. It is never exposed through the tunnel and needs an admin token.

| Route | Purpose |
| --- | --- |
| `GET /admin` | Live operations page |
| `GET /admin/stream` | Server-sent events feeding the page every second |
| `GET /metrics` | Prometheus metrics |
| `GET /admin/health` | Detailed health: data folder writable, disk free, active endpoint, each endpoint's last result, queue |
| `POST /admin/llm/active` | Set the active endpoint, pin or unpin, with a reason |
| `POST /admin/llm/probe` | Send one probe question to a named endpoint and return the result |
| `POST /admin/llm/cap` | Change the global or a per-endpoint in-flight cap |
| `POST /admin/sessions/pause` | Stop new sessions, or resume them |
| `GET /admin/export` | Dataset archive for an environment |

An operator who is not at the Mac reaches the admin listener through an SSH port forward or Tailscale, never through the public tunnel.

The public server keeps a minimal `GET /api/health` (ok or not) for the external uptime check.

### 8.2 Admin page

- Active players and players currently waiting for an answer.
- Progress through the game: started → clues found → all three monkeys asked → verdict.
- Active endpoint, pinned or automatic, and per endpoint: in flight, last success, last failure, failures in the last 5 minutes.
- LLM in flight, queue length, p50/p95 latency, and errors by type over the last 5 minutes.
- Move and pin buttons, probe button, cap controls, and pause new sessions.
- Recent errors and recent `system.jsonl` entries.

### 8.3 Game metrics

Exposed with `prom-client`, including its default Node metrics (event loop delay, heap, garbage collection):

| Metric | Labels |
| --- | --- |
| `override_http_requests_total` | route, status |
| `override_http_request_duration_seconds` | route |
| `override_sessions_active` | none |
| `override_sessions_started_total`, `override_sessions_completed_total` | none |
| `override_sessions_by_stage` | stage |
| `override_llm_in_flight`, `override_llm_queue_length` | endpoint |
| `override_llm_request_duration_seconds` | endpoint |
| `override_llm_failures_total` | endpoint, reason |
| `override_llm_semantic_retries_total` | reason |
| `override_llm_active_endpoint` | endpoint (info gauge) |
| `override_llm_pinned` | none |
| `override_llm_failovers_total` | from, to, reason |
| `override_log_write_duration_seconds` | file kind |
| `override_log_write_failures_total` | file kind |
| `override_disk_free_bytes` | none |
| `override_static_bytes_total` | none |

No session IDs, participant IDs, or text in labels.

### 8.4 Prometheus and Grafana

- Prometheus scrapes the game admin listener every 5 seconds.
- Grafana has one dashboard with four rows: Players, LLM (per endpoint), Server, Data.
- Run both as Homebrew services. Bind both to 127.0.0.1.

**Alerts:**

| Alert | Condition | Severity |
| --- | --- | --- |
| Data write failure | `override_log_write_failures_total` increases | Critical |
| Active endpoint failing | Error rate above 20% for 1 min | High |
| LLM slow | p95 above 30 s for 2 min | High |
| Queue growing | Queue above 50 for 1 min | High |
| Automatic failover | `override_llm_failovers_total` increases | High |
| Last endpoint active | `override_llm_active_endpoint` is the last entry in the list | High |
| Credentials rejected | `override_llm_failures_total{reason="credentials_rejected"}` increases | Critical |
| Event loop stalls | p99 event loop delay above 200 ms | Medium |
| Disk low | Below 5 GB free | Medium |
| Public site down | External uptime check fails | Critical |

Monitoring runs on the same Mac, so it goes down with the Mac. The external uptime check is the only alert that still works then.

### 8.5 Logs

The server writes structured JSON log lines to a rotated file. These are operational logs, separate from the dataset.

## 9. Performance and static delivery

| Item | Change |
| --- | --- |
| Connection queue | `server.listen(port, host, 1024)` and `sudo sysctl -w kern.ipc.somaxconn=1024`. macOS holds 128 waiting connections by default, and a burst of 1,400 connections caused resets in testing. |
| Compression | Precompress JS and CSS with brotli and gzip at build time; serve by `Accept-Encoding`. JS drops from 1.25 MB to about 344 KB gzip. |
| In-memory static | Load `dist/` into memory at startup (about 7 MB). |
| Caching | Hashed Vite assets get `Cache-Control: public, max-age=31536000, immutable`. PNGs keep 1 h, or move into the Vite pipeline so they get hashes. |
| PNG size | Lossless optimisation is safe. Lossy quantisation could take each PNG from about 1.3 MB to about 300 KB but changes pixels, so the artist decides. |
| Graceful shutdown | On SIGTERM: stop accepting connections, let pending answers finish (up to 60 s), flush logs, exit. |
| Log writes | Keep synchronous appends. They were negligible on the Mac's SSD at the measured rate. |
| File descriptors | No action needed: Node raises its own limit at startup (verified with a 256 shell limit). |

Not needed: clustering, worker threads, Redis, Postgres, or asynchronous log writes.

## 10. Security

- **Service user:** run the whole stack as a dedicated macOS user (`override`), with no access to your home folder, SSH keys, or browser profiles.
- **Exposure:** only the game's public port goes through the tunnel or onto the LAN. The admin listener, Prometheus, and Grafana bind to 127.0.0.1.
- **Secrets:**
  - Provider keys live in the game server's environment, readable only by the service user. The controller never logs them, and traces strip the `Authorization` header.
  - The game also holds `OVERRIDE_SECRET` for links and tokens.
  - None of these go in Git, logs, traces, or exports.
- **Supply chain:**
  - `npm ci` from the lockfile. The server's only runtime npm dependency is `prom-client`.
  - No Docker and no unpinned installs on the event machine.
- **Abuse limits:** see [5.7](#57-limits-and-abuse).
- **Prompt injection:** players will try to make a monkey reveal its instructions. The prompt already resists it, and attempts are kept in the dataset. Nothing in the prompt is a secret beyond the case solution.
- **After the event:** rotate the access code and any provider keys shared with the team.

## 11. Frontend dependencies

The backend plan depends on these client changes:

- Participant link landing and the consent screen ([6.8](#68-consent-and-privacy)).
- `start` sends client info (viewport, language, time zone, reduced motion).
- Waiting state: show queue position, and let players read clues and walk while an answer is pending. Today the whole UI locks during an answer, and with real latency that can mean over a minute of frozen screen.
- Clear error and retry copy when a failover happens mid-question.
- Copy changes for independent games (done in the prototype: "Your own case").
- Optional telemetry batching ([6.7](#67-optional-client-telemetry)).

## 12. Hosting on the Mac

### 12.1 Machine

Checked on this Mac:

- System sleep is set to 1 minute.
- Power Nap is on.
- Three Ethernet adapters are available.
- The connection queue limit is 128.

Before the event:

- Run `caffeinate -dims` for the whole event, disable Power Nap, keep the power adapter connected, and keep the lid open.
- Turn off automatic macOS updates and scheduled restarts.
- Use Ethernet, not Wi-Fi.
- Freeze the configuration 48 hours before the event. No development on this Mac during the event.

### 12.2 Network

**Same network (LAN):**

- Give the Mac a fixed address or a stable `.local` name.
- Check that the Wi-Fi does not isolate clients from each other, and that there is no captive portal.
- Check that the access points can carry 200 devices downloading about 1.3 GB in total. This is the strongest argument for the PNG work in [section 9](#9-performance-and-static-delivery).
- Without HTTPS, cookies are not marked Secure. That is acceptable on a closed LAN only.

**Internet:**

- Use a named Cloudflare Tunnel (`cloudflared`) to the public port only. No inbound ports on the router.
- Cloudflare's edge caches PNG, JS, and CSS, so the Mac's uplink serves them about once.
- Cloudflare's proxy timeout (100 s) exceeds the 60 s LLM deadline.
- Check that bot protection does not challenge 200 players arriving from one venue address.
- Set `OVERRIDE_TRUST_PROXY` and read `CF-Connecting-IP` for the login limiter.
- Avoid free tunnel tiers with request limits.

### 12.3 Processes

- `ops/stack-up.sh` and `ops/stack-down.sh` start and stop everything in order:
  1. game server
  2. Prometheus and Grafana
  3. tunnel
  4. backup timer
- launchd (or pm2) restarts the game server on crash. Replay restores games, and the active endpoint and pin are restored from `system.jsonl`.

## 13. Testing and rehearsal

### 13.1 Automated tests

- **Sessions:**
  - two players never share state
  - one player's pending answer never blocks another
  - reset issues a new cookie
  - forged cookies get no session
- **Replay:**
  - restored games equal the originals
  - reset and other-version logs are refused
  - a torn tail is truncated and the game resumes
  - idle eviction reloads correctly
- **Identity:**
  - link tokens verify and expire
  - tampered tokens fail
  - the same link on two devices resumes one game
- **Limits:**
  - 40 correct sign-ins in a row pass
  - the 31st failure returns 429
  - session and question rate limits work
- **Dataset:**
  - every answer has provenance and a trace
  - traces never appear in the player export
  - no keys appear in any file
- **LLM controller:**
  - transport and semantic failures retry once on the next endpoint
  - a question never makes more than two LLM calls
  - repeated failures advance the active endpoint; it never moves back on its own
  - a pinned endpoint never advances
  - active endpoint and pin persist across restart
  - per-endpoint caps hold; a retry waits for the backup's semaphore
  - credential rejections raise an alert

### 13.2 Load and failure tests

Extend the existing load harness. It runs 200 players with a 10 s arrival ramp, the full flow, and a restart midway. Add 3–4 mock endpoints with injectable faults:

| Scenario | Fault | Pass criteria |
| --- | --- | --- |
| Primary errors | Endpoint A returns 500 | Traffic on B within 30 s; under 5% of questions fail; provenance and switch log correct |
| Primary hangs | A accepts and never answers | Same as above; no question exceeds the 60 s deadline |
| Rate limiting | A returns 429 bursts | Failover to B after the threshold; no traffic returns to A on its own; queue absorbs the load |
| Flaky primary | A fails 50% of requests | Automatic failover within 30 s; no traffic returns to A until the operator moves it |
| Silent failure | A returns HTTP 200 with empty content | Game retries through B; semantic retry metric increases |
| Small backup | B holds 50 concurrent | B's semaphore holds in-flight at 50; the rest wait in the queue; no cascade to C and D |
| All endpoints down | A–D all return 500 | Players see a clear error and can retry; no data lost; alert fires |
| Game server down | Kill the game server mid-round | Every game restores; no data lost; players continue after reload |
| Burst arrival | 200 players within 1 s, with the raised connection queue | No connection resets |


### 13.3 Rehearsals

1. **Preflight** against the real endpoints ([7.6](#76-preflight-check)).
2. **Dress rehearsal** with 20–30 real people on real devices over the real network path:
   - the full flow, including consent
   - one live pin and unpin
   - a server restart during play
   - a backup restore
   - a dataset export through the validator
3. **Event-day smoke test** in the `rehearsal` environment, never `live`.

## 14. Event runbook

**Day before**

- Configuration frozen; preflight report reviewed; capacity table filled in.
- Participant links generated; consent text final.
- Backup target mounted and tested.

**One hour before**

- `ops/stack-up.sh`; `caffeinate` running; Ethernet connected.
- `/admin/health` all green; Grafana open; external uptime check active.
- Smoke test in `rehearsal`; then switch to `live`.

**During**

- Watch the admin page and Grafana.
- Pin according to [7.5](#75-switching-policy-d5), and type the reason.
- If a player sees an error: reload the page. The game resumes from the log.
- To restart a process, follow the stack scripts. Never delete `data/`.

**After**

1. Pause new sessions; let pending answers finish.
2. Final backup; restore it elsewhere.
3. Run the validator and export.
4. Write the dataset card, including incidents from `system.jsonl`.
5. Rotate keys.

## 15. Phases

| Phase | Content | Size | Depends on |
| --- | --- | --- | --- |
| 1. Core sessions | Registry, cookies, per-game lock, replay with torn-tail repair, login limiter, connection queue, stateless sign-in | M (prototype covers part) | none |
| 2. Dataset | Event bus, file layout, trace records, provenance fields, metadata, batched flush, backup, validator, export, participant links, consent, deletion | M–L | 1 |
| 3. LLM routing | Endpoint configuration, game controller (failover, pin, per-endpoint queue, semantic retry, provenance), preflight script | M | 1 |
| 4. Monitoring and admin | Admin listener, admin page, game metrics, Prometheus, Grafana dashboard, alerts, external uptime check | M | 2, 3 |
| 5. Hardening | Static compression and in-memory serving, graceful shutdown, abuse limits, service user, stack scripts | S–M | 1 |
| 6. Testing and rehearsal | Fault-injection load tests, preflight, dress rehearsal | M | all |

Phases 2, 3, and 5 can run in parallel after phase 1. The load harness from phase 6 should be extended alongside phase 3, so failover is tested as it is built.

## 16. Risk register

| # | Risk | Impact | Mitigation | Section |
| --- | --- | --- | --- | --- |
| 1 | Consent does not cover fallback providers | Dataset unusable | Name every provider; restrict fallbacks to covered providers | 6.8, D7 |
| 2 | Repeat plays are not linked | Contaminated data | `playIndex`, `previousSessionId`, optional block | 5.4 |
| 3 | A cookie identifies a browser, not a person; test data mixes with live data | Duplicates and pollution | Participant links; `OVERRIDE_ENV` folders | 5.3, 5.5 |
| 4 | Mixed models inside one session; provider default sampling differs | Confounded analysis | Provenance, explicit sampling, mixed-model flag, preflight | 6.3, 7.3 |
| 5 | Reasoning traces not decided before the event | Data that can never be recovered | Decide D4 before rehearsal | 2 |
| 6 | Traffic flaps between a flaky endpoint and its backup | Flapping and timeouts for players | Forward-only automatic failover; only an operator moves traffic back | 7.1, 7.5 |
| 7 | Failover overloads the next endpoint; retries multiply load | Cascading outage | Capacity table, queue cap, one retry per question | 7.3, 7.4 |
| 8 | HTTP 200 with unusable content (empty, reasoning-only, filtered) | Player errors without fallback | The controller treats these as failed attempts | 7.3 |
| 9 | Provider keys live on the game server | Key exposure if the server is compromised | Service user, keys only in the environment, stripped from traces, rotated after the event | 10 |
| 10 | Failover logic untested against real failure modes | Failover does not work as designed | Fault-injection load tests with mock endpoints; preflight against real endpoints | 13.2, 7.6 |
| 11 | The Mac is the only machine, and runs its own monitoring | Silent outage, data loss | External uptime check, off-machine backup, macOS settings | 8.4, 6.5, 12.1 |
| 12 | Exposed development machine; admin on the public port; abuse | Compromise, LLM capacity burned | Service user, localhost-only admin, rate limits | 10, 5.7 |
| 13 | Real network path untested | Players cannot connect, or downloads are slow | Dress rehearsal on the real network | 12.2, 13.3 |
| 14 | Real latency freezes the UI; session time measures LLM latency | Dropouts, timing confound | Non-blocking waiting UI, per-answer latency in the data | 11, 6.3 |
| 15 | Crash during a write loses a game | One player's progress lost | Torn-tail truncation | 5.2 |

## 17. Evidence so far

The prototype (session registry, replay, failure-only login limiter) was load-tested on this Mac:

- **Setup:** 200 simulated players arriving over 10 s, in live mode against a mock LLM answering in 2–8 s.
- **Flow:** each player loaded the page and assets, signed in, played the full flow, and exported their data.
- **Restart:** the server was killed with SIGKILL between moves and restarted.

| Result | Value |
| --- | --- |
| Distinct sessions | 200 of 200 |
| Errors | 0 |
| Games restored after the restart | 200 of 200 |
| Exports with only the player's own, gapless log | All |
| Peak concurrent LLM requests | 196 |
| Non-LLM request latency, p95 | Under 10 ms (assets 9 ms, actions 4–9 ms) |
| Interview latency, p50 / p95 | 5.0 s / 7.7 s (mock latency) |
| Total run time | 39 s |

**Limits of this evidence:**

- The network path was loopback, and the LLM was a mock.
- Peak memory and CPU were not measured.
- Firing 1,400 connections in the same millisecond caused connection resets because of the 128-connection queue ([section 9](#9-performance-and-static-delivery)).

## 18. Appendix: modules, config, environment

### New and changed files

| Path | Purpose |
| --- | --- |
| `server/session.mjs` | `Investigations` registry, replay, per-game lock |
| `server/identity.mjs` | Participant links, stateless tokens, cookies |
| `server/dataset.mjs` | Event bus subscribers, file writers, batched flush, traces |
| `server/llm.mjs` | Endpoint list, failover, pin, per-endpoint queue, semantic retry, provenance |
| `server/metrics.mjs` | `prom-client` registry and game metrics |
| `server/admin.mjs` | Admin listener, page, live stream, admin API |
| `server/static.mjs` | Precompressed in-memory static files |
| `scripts/make-links.mjs` | Participant link CSV |
| `scripts/preflight.mjs` | Fidelity and capacity check per endpoint |
| `scripts/validate-data.mjs` | Dataset validation and flags |
| `scripts/export-data.mjs` | Dataset archive |
| `scripts/delete-participant.mjs` | Deletion requests |
| `ops/endpoints.json` | Endpoint list in priority order (no keys) |
| `ops/prometheus.yml` | Scrape configuration |
| `ops/grafana/dashboard.json` | Dashboard |
| `ops/launchd/*.plist` | Service definitions |
| `ops/stack-up.sh`, `ops/stack-down.sh` | Start and stop in order |
| `tests/loadtest.mjs` | Load and fault-injection harness |

### Environment variables

| Variable | Purpose |
| --- | --- |
| `OVERRIDE_ENV` | `live`, `rehearsal`, or `test`; selects the data folder |
| `OVERRIDE_DATA_DIR` | Data root (existing) |
| `OVERRIDE_SECRET` | HMAC secret for links and sign-in tokens |
| `OVERRIDE_IDENTITY` | `links` or `open` |
| `OVERRIDE_ACCESS_CODE` | Shared code for open mode (existing) |
| `OVERRIDE_CONSENT_VERSION` | Required consent version; empty disables the consent step |
| `OVERRIDE_MAX_PLAYS` | Plays allowed per participant |
| `OVERRIDE_TRUST_PROXY` | Read the client address from the proxy header |
| `OVERRIDE_ENDPOINTS` | Path to `ops/endpoints.json`; when set, replaces the single-endpoint variables below |
| `OVERRIDE_ENDPOINT_<NAME>_KEY` | Provider key for each endpoint, referenced by `keyEnv` |
| `OVERRIDE_LLM_BASE_URL`, `OVERRIDE_LLM_API_KEY`, `OVERRIDE_LLM_MODEL` | Single-endpoint configuration (existing); becomes endpoint `a` when `OVERRIDE_ENDPOINTS` is unset |
| `OVERRIDE_LLM_MAX_IN_FLIGHT` | Global cap on LLM calls in flight; per-endpoint caps come from `endpoints.json` |
| `OVERRIDE_LLM_FAILOVER_FAILURES`, `OVERRIDE_LLM_FAILOVER_WINDOW_MS` | Automatic failover threshold (default 5 failures in 30 s) |
| `OVERRIDE_LLM_TIMEOUT_MS` | Per-question deadline (existing) |
| `OVERRIDE_STORE_REASONING` | D4; off by default |
| `OVERRIDE_ADMIN_PORT`, `OVERRIDE_ADMIN_TOKEN` | Admin listener |
| `OVERRIDE_APP_COMMIT` | Git commit for packaged builds |

### References

- Existing demo docs: [README.md](README.md), [DEPLOY.md](DEPLOY.md)
