# Feature plan: admin text

Spec: `docs/plans/2026-11-09-admin-text.spec.md` (wins on drift). App: `demos/override`. Orchestrator: AI.

## Goal

For the people who run an Override event: one admin password opens the whole admin panel. In the content editor they can change every word of a case, the shared prompt rules, the world prompt text and every game UI string. Each publish writes a readable JSON file under `demos/override/content/`, which a developer commits and pushes by hand.

## What changes

| Target | Change |
|---|---|
| Admin sign-in | Both admin pages show a password form until signed in, and offer Sign out. Uses `POST /admin/login`, `POST /admin/logout` and `GET /admin/session`. Cookie `override_admin`. `Bearer <password>` still works for curl and Prometheus. |
| Env | `OVERRIDE_ADMIN_PASSWORD` (new), `OVERRIDE_ADMIN_TOKEN` (deprecated alias), `OVERRIDE_MAKER_TOKENS` (removed, warns), `OVERRIDE_CONTENT_DIR` (new). |
| Editor, per case | Every string of the case as a field, in sections: Story, Prompt, one per character (including that character's talk lines, slips, replies and rehearsal), Parts, Evidence, Roles, Topics and glossary, Debrief. Search box. |
| Editor, "Game text" | A new entry in the case dropdown, with sections: UI (one per client area), Prompt rules (interview and thread templates), Worlds. |
| Game client | Loads `GET /api/text` at boot. Every visible string comes from the catalog, with English defaults. |
| Server | Generic path walker over case data. Game document (`game`). Template tokens in `interviews.mjs`. `defineCase(raw, {worlds, prompts})`. Tracked-file store plus the local revision log. `/api/text`. |
| Repo | New tracked `demos/override/content/` (with a README). `client/text/*.json` defaults. Dockerfile and docs updated. |

## Acceptance checks

1. `OVERRIDE_ADMIN_PASSWORD=pw npm run dev`, then open `http://127.0.0.1:3002/admin`. Type a wrong password: "Wrong password.". Type `pw`: the command centre loads. Open the editor in a new tab: no sign-in needed. Press Sign out, then reload either page: the sign-in form is back.
2. `curl -H "Authorization: Bearer pw" http://127.0.0.1:3002/admin/health` returns 200. A curl with the cookie and `Sec-Fetch-Site: cross-site` to `POST /admin/round` returns 403. After 11 wrong sign-ins within a minute: 429.
3. In the editor, pick The Banana Mystery and rename Momo. Publish. In the game, press Reset session: the board, HUD and interview show the new name. `git status` shows `demos/override/content/cases/banana-mystery.json`.
4. Pick A Word Out of Time: talk lines, slips, glossary and replies are fields. Edit a slip line so it drops its term, then Publish: the error shows under that field.
5. Game text → UI: change "Let them talk". Publish and reload the game: the new label shows. Set a label to `<b>x</b>`: it shows literally.
6. Game text → Prompt rules: delete `[[knowledge]]` and Publish: 400 under the field. Undo, edit one rule sentence and Publish. In a new game, Preview shows the new sentence, and the session log has `promptVersion` `interview-v5+…`.
7. Restart the server: the edits stay. Press Restore authored on the banana case: the tracked file is deleted.
8. With no edits, every existing unit test and Playwright project passes. `git status demos/override/content` is clean after the test runs.

## Code map

**Stand-up.** `cd demos/override`. `npm run dev` runs `server/dev.mjs` (node `--watch` server on 3001 plus Vite on 5173, which proxies `/api`). The admin listener on `127.0.0.1:${OVERRIDE_ADMIN_PORT:-3002}` starts only with an admin secret. `npm run build` is `tsc --noEmit && vite build` into `dist/`. `npm start` serves `dist/`. Rehearsal mode applies when no LLM key is set. Tests: `npm test` (`node --test tests/*.test.mjs`, about 710). Playwright: `npx playwright test --project <name>`, with projects `default`, `admin`, `admin-live` and others in `playwright.config.mjs`. Build `dist/` first. Never run the unit and e2e suites at once.

**Auth seams**
- `server/admin.mjs`
  - `createAdmin({token, makers, allowedHosts, …})` at :43; `actor()` at :45-51; `hostOk` at :53.
  - Pages are served public, GET only (:229-235). The auth gate is at :236-240. CSP is at :14, with `form-action 'none'`.
  - Routes table at :167-223. `CONTENT_ROUTE` at :17; `contentRoute` at :124-165; `draftOf` at :102-121.
- `server/index.mjs`
  - `makerTokens()` at :152-169 and `adminHosts()` at :171.
  - `OVERRIDE_ADMIN_TOKEN` gates the monitor (:239) and the listener (:275-299).
  - The secret is set at :262. The player cookie helpers are private, at :37-41. The player CSRF check is at :63-64; mirror it.
- `server/identity.mjs`: `mac()` with a hard-coded `override-session-v1:` prefix (:5), plus `signToken`, `verifyToken`, `WindowCounter` and `clientAddress`.
- Admin pages: `server/admin/app.js` (token at :33-48 and :134-149, stream fetch at :101), `maker.js` (:197-225), and the `#auth` forms in `index.html` (:27-30) and `maker.html` (:22-25). No other admin JS touches the token.

**Content seams**
- `server/content.mjs`
  - `editablePaths` (:21-35, fixed allowlist), `getAt`/`setAt` (:44-63, id lookup only for `parts`), `rawOf` (:65), `editPathOf` (:70-79), `readRecords` (:85).
  - `createContentStore({cases, dataDir, worlds, now})` at :99. Records are filtered by version at :157; stale handling at :164; the identity rule at :152-165.
  - API: `list`, `current`, `base`, `info`, `fields`, `structure`, `history`, `preview`, `publish`, `revert`. All of these are FROZEN in name and shape; fields may be added.
- `server/cases.mjs`
  - `defineCase(data, {worlds})` at :51-154. The `{partId}` placeholder check is at :104-107. `contentHash` (:9-19) is computed over the raw input with functions dropped. The return is at :153.
  - `publicView` (:200-214), `listCases` (:222).
- `server/talk.mjs` `checkTalk`: its error paths use dot-index form (`talk.slips.ottavio.0.line`).
- `server/interviews.mjs`: `buildMessages` (:96-120) and `buildThreadMessages` (:133-153) are single template literals. `promptVersion` and `threadPromptVersion` are at :9-10.
- `server/worlds.mjs`: a frozen map with 6 worlds.
- `server/session.mjs:142`: `Investigations.cases` getter over `content.list()`. Events carry `contentHash` and `promptVersion` (:259-261).
- The probe at `index.mjs:279-284` reads `content.current()`.
- Admin editor: `server/admin/maker-form.js` (sections hard-coded in `build()` at :103-142; a path with any other prefix is silently dropped), `maker-copy.js` (labels and hints table), `maker.js` (nav at :37-54, status per keystroke at :26-34, publish at :150-170, revert at :172-184, tabs at :66-87), and `maker-chat.js`.

**Client text seams**
- `client/main.ts` has about 80 strings: boot at :923-959, `api()` at :119, about 27 innerHTML sites.
- Other files and their approximate string counts:
  - hud.ts ~20, tools.ts ~30 (module constants HINTS, ARBITER_TOOLS, NOT_IN_CASE), dialogue.ts ~33, debrief.ts ~25, lineup.ts ~21 (CONFIDENCE), team.ts ~18 (NAME_ERROR)
  - board.ts ~22 (EMPTY), splash.ts ~13 (SPONSORS), accuse.ts ~6, talk-ui.ts ~4, notebook.ts
  - worlds.ts: 6 text packs of about 10 strings each
  - station.ts and roundtable.ts: DOM overlays and aria-labels
- `client/html.ts` has `escape`, and `heading()` interpolates raw.
- There is no i18n helper and no Phaser text. `index.html` has a static `<title>`.
- Module-level string constants are frozen at import time and must become lazy lookups.

**Tests to keep green or update**
- Maker-token tests are removed or rewritten for the password: `tests/admin-makers.test.mjs`, `http.test.mjs` :457-522, `admin-content.test.mjs` (`by:'alice'` becomes `'admin'`), and `playwright.config.mjs` :62 and :69.
- Specs that fill `#token`: `tests/browser/admin.spec.mjs`, `maker.spec.mjs` and `admin-upgrade.spec.mjs` (`openMaker`, 11 uses).
- The fixed-path assumption: `tests/admin-maker-form.test.mjs` (`every_field_has_hint`, `labels_have_no_dotted_key`), `content.test.mjs:47`, `department-case.test.mjs:91-104` and `renaissance-case.test.mjs:115-127`.
- Pinned hashes and prompts must stay unchanged: `case-roles.test.mjs`, `cases-content.test.mjs`, `renaissance-schema`, `department-schema`, `thread-prompt.test.mjs` and `cases.test.mjs`.
- Source-regex tests over client code: `renaissance-main.test.mjs:33-53`, `accuse-ui.test.mjs:61-66` and `department-ui.test.mjs:51-53`.
- `tests/docs.test.mjs` (`env_example_complete`): every new `OVERRIDE_*` goes into `.env.example`.
- About 400 unit and 217 browser assertions check English UI literals. The defaults keep them true.
- Open from earlier work and not this feature's job: the stale `grove-look` pixel baseline and the `hud.spec` follow-up race.

**Conventions.**
- Node 22 ESM with no deps. Tests use `node:test`.
- Admin UI is hand-written DOM through `dom.js` `el()` with textContent only. CSS tokens live in `app.css` `:root`, with light mode in `[data-theme=light]`. There is no UI component library.
- Writes go through `dataset.mjs` (`appendJsonl`, `readJsonl`).
- Commit messages are plain, one feature per branch. AGENTS.md has one-feature-per-worktree.

## Prototype scope (L1)

Keep: the real server, the real admin pages, the content store, the cases, and one slice of client text.
- Stubs: no migration of legacy logs, no Docker or docs changes.
- Client conversion: only `hud.ts` and `tools.ts`.
- Tests: the maker-token tests are skipped rather than rewritten.

The prototype must prove the risky seams:
1. Generic walker plus error mapping on all 6 cases.
2. The editor with about 470 renaissance fields, still responsive.
3. Prompt templates byte-identical when unedited.
4. The `/api/text` pipeline with escaping.
5. The tracked-file store.
6. The cookie sign-in.

## Integration outline

Integration runs in its own worktree on `superlite/admin-text`, based on `main`. The code is ported from the prototype task by task. Tasks:
1. Auth (`identity.mjs` purpose, `admin.mjs`, `index.mjs` env, both pages' sign-in).
2. Path walker module plus `content.mjs` paths and validation.
3. Tracked-file store plus log sync plus legacy import.
4. `defineCase` `prompts` option, `interviews.mjs` templates and the version suffix.
5. Game document (ui, prompt, worlds) plus `/api/text`.
6. Client `text.ts` plus boot load.
7. Client conversions, one task per area group: main.ts; hud and tools; dialogue, talk-ui and accuse; debrief, lineup and notebook; team, board and splash; worlds, station and roundtable.
8. Editor sections, search, game doc and perf.
9. Test migration (maker tokens, `#token` specs, Playwright env with `OVERRIDE_CONTENT_DIR`).
10. Docs, `.env.example`, Dockerfile and `content/README.md`.
11. Seam check: the escaping probe over every UI key, byte-identity of prompts and views, and a clean `git status` of `content/` after the suites.
