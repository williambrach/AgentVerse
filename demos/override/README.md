# The Override

A short, 2–3 minute detective game for AgentVerse: **The Banana Mystery**. The keeper said to wait for the bell, but the picnic bananas went missing. Meet Momo the planner, Pip the carrier, and Nori the lookout in a small jungle clearing. Inspect three clues, ask each monkey a quick question, then choose who knowingly broke the rule.

The fast path needs one clue reveal, three one-click interview questions, and one suspect choice. Answers are prompted to stay around 15–40 words. Confidence has three choices; a written explanation and clue citation are optional. Free-text follow-ups and presenting evidence remain available. The intended 2–3 minute duration includes reading; live model latency and extra questions can make a run longer.

**This is an authored demonstration, not a validated research case or a recorded agent run.** Each browser gets its own session (an HttpOnly `override_session` cookie), so colleagues can play at the same time. Choose a case on the intro screen, or open `?case=<id>` to go straight to one.

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

A case is one module in `server/cases/`, registered in `server/cases/index.mjs`. `banana-mystery.mjs` and `banana-control.mjs` are the examples to copy. The required fields and the allowlist of what reaches the browser are in the "Decided" section of [the cases spec](../../docs/plans/2026-10-26-override-cases.spec.md); they are not repeated here.

- Set `status: 'draft'` while writing. Draft cases are hidden unless the server runs with `OVERRIDE_DEV_TOOLS=1` (forced off when `NODE_ENV=production`).
- Run `npm run cases:prompt -- <case> <character> --chapter 1 [--evidence id] [--question "..."]` to print the exact prompt a character receives.
- Keep the character ids `momo`, `pip`, and `nori`; sprites and CSS key on them.
- `server/cases/override-v1.mjs` stays archived and unregistered. The live cases are `banana-mystery` and `banana-control`.

## Research records

The server writes append-only JSONL files to `data/<session-id>.jsonl`, or to `OVERRIDE_DATA_DIR` if set. These files are outside the served directory. **Export session** downloads the current session; older files remain on disk after reset.

Every event includes `schemaVersion`, `eventId`, `sequence`, `timestamp`, `elapsedMs`, `sessionId`, `caseId`, `caseVersion`, `promptVersion`, `contentHash`, `revealedPosition`, `selectedEvidence`, `character`, `question`, `answer`, interview `mode`, and `model`. Fields that do not apply are `null`. Question and answer events are linked by `questionEventId`; failures are recorded separately. `session_started` also records the `assignment` of the case. Additional payloads record revealed evidence IDs, locations, and the complete submitted verdict.

Recorded events: session start/reset, briefing viewed, location visited, story revealed, evidence selected, interview question/answer/failure, verdict submitted, and debrief viewed. Frame-by-frame player coordinates and unsent text are intentionally not recorded. The UI explains that investigation actions and dialogue are recorded.

Live responses also emit `interview_provider_response`, linked by `questionEventId`, with the attempt number, completion token limit, HTTP status, finish reason, completion token usage, and duration. Provider bodies and internal reasoning are never included in these diagnostics.

One server process serves every player. Each browser’s game lives in memory while active and is rebuilt from its JSONL log after a restart or after about 30 idle minutes, so progress survives both. Requests carry a session ID and revision to reject stale writes from another tab. Mutations are locked while a live answer is pending. The demo has a technical limit of 40 questions per character and 1,200 characters per question; study budgets are not implemented.

## Share with colleagues

Follow the [deployment guide](DEPLOY.md) for Render setup, environment variables, persistent storage, verification, updates, rollback, and a local Docker smoke test.

Run one instance; sessions are per browser. A persistent disk preserves logs, but active progress and sign-ins reset when the server restarts.

## Validate

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

If Google Chrome is already installed, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` uses it instead. Browser tests use a separate rehearsal server and separate data directory; they never use the live API key. They exercise walking between rooms, presenting evidence, follow-ups, all interviews, verdict, debrief, JSONL download, reset, mobile layout, and recovery from provider errors.

## Structure and artwork

- `server/cases/` and `server/cases.mjs`: one module per case (clues, character-specific knowledge, debrief), the registry, and the `defineCase` helpers; never imported into the client.
- `scripts/case-prompt.mjs`: prints the exact interview prompt for a case and character.
- `server/session.mjs`: authoritative case state, quick verdict validation, and research logs. Verdicts record `suspect`, `suspects`, confidence, and optional explanation/citations; they do not infer classifications for unselected monkeys.
- `server/interviews.mjs`: the custom SDU endpoint adapter, short-answer prompts, and explicit rehearsal replies.
- `server/index.mjs`: API, optional shared access code, and production static serving.
- `client/station.ts`: a compact original jungle clearing, collision-aware click navigation, and nearby interactions.
- `client/detective-walk.ts`: distance-driven walking with four facing directions and support for high-refresh displays.
- `client/monkey-idle.ts`: independent NPC blinks, idle gestures, and approach reactions with fixed collision positions.
- `client/main.ts`: briefing, clues, live interviews, quick verdict, and debrief.
- `client/notebook.ts` / `notebook.css`: page transitions, evidence feedback, and preserved drafts/reading position.
- `public/assets/banana/`: original generated transparent character and prop atlases. `ARTWORK.md` contains provenance and the full image-generation prompts. Phaser uses atlas frames without changing the source PNGs. No Pokémon art is loaded by this demo.

Fonts have local fallbacks if Google Fonts is unavailable.

For a 100-user study, add independently owned sessions, durable resumable state, controlled case assignment, configurable budgets, validated cases (including no-misalignment cases), debrief timing controls, and load testing. Those features are deliberately outside this first demo.
