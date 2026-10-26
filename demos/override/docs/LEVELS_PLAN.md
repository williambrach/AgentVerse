# Plan: multiple levels for The Override

> Superseded on 2026-10-26 by [CASES_PLAN.md](CASES_PLAN.md). Kept for reference.

**Before you start:** there is uncommitted work in `server/session.mjs`, `index.mjs` and the tests. It gives each player their own session through a cookie and rebuilds sessions from the JSONL logs (`replay()`). This plan builds on that work, so commit it first. Two places in it assume a single case: `replay()` rejects any log whose `caseVersion` differs from the one global value, and it hardcodes `{ momo: [], pip: [], nori: [] }`. Phase 1 fixes both.

## Goal and principles

- **A level is a folder:** `levels/<id>/level.yaml`, plus a map file later if needed. You can add or edit a level without touching code.
- **The answer never reaches the browser.** The server loads the levels and sends an allowlisted public slice. Anything not on the allowlist stays on the server.
- **Every logged event records which content was played:** level ID, version and content hash.
- **Tools before an editor.** Checks, prompt preview, playtest and the debug overlay come first. A custom editor only comes if a clear reason appears (Phase 6).

## Phase 0: Groundwork (S)

1. Commit the per-player session work.
2. Fix the prompt bug: `You play ${name}, the ${role}` produces "the The planner". Change the template to `You play ${name} (${role})`.
3. Add two server-only dependencies: `yaml` (parses YAML and keeps comments) and `zod` (checks the file's structure).

## Phase 1: Level format and loader, server only (M–L)

The game should behave exactly the same at the end of this phase.

**Layout:**
```
levels/
  banana-mystery/level.yaml     ← moved out of server/case.mjs
  _fixtures/the-override/level.yaml   ← from server/cases/override-v1.mjs; hidden test level
```

**Schema sketch:**
```yaml
id: banana-mystery
version: 1.1.0
status: ready                 # draft | ready | frozen
title: The Banana Mystery
order: 1
public:                       # the only block sent to the browser before the verdict
  location: Banana Grove
  intro: { lead: "The bananas are gone. The bell never rang.", body: "…" }
  briefing: { question: Who knew they were breaking the rule?, hint: "…" }
  clueSource: banana basket
  castNoun: { one: monkey, many: monkeys }
prompt:
  setting: a monkey in an authored two-minute banana mystery
  use: [bananas, bell, keeper, permission]
  avoid: [compliance, authorization registry, AI alignment, override]
map:
  preset: grove
  stops: { replay: [244, 236], evidence: [68, 220], report: [132, 276], briefing: [244, 276] }
chapters:
  - { title: The banana trail, subtitle: Three clues. One simple rule. }
records:
  - { id: rule, chapter: 1, time: "1", source: The keeper’s sign, title: Wait for the bell, kind: The rule, text: "…" }
characters:
  - id: momo
    name: Momo
    role: The planner
    color: "#cb7656"
    sprite: monkeys/momo
    stop: [116, 156]
    introduction: I told Pip to bring the bananas over. We were hungry!
    quickQuestion: Did the keeper really say you could take the bananas?
    knowledge:                # one entry per chapter; server only
      - |
        You are a hungry monkey and the picnic planner…
    rehearsal:                # first match wins; an entry without `when` is the fallback
      - when: [{ evidence: any }, { words: [keeper, bell, rule, permission, lie, said, why, know, take] }]
        say: No. The keeper told me to wait…
      - say: I planned our picnic…
answer:                       # server only until the verdict
  culprits: [momo]
  feedback: { correct: You spotted the made-up permission!, other: The clue was who knew the keeper had said no. }
  debrief: { title: …, summary: …, findings: [ … ], lesson: … }
```

**Work:**
- **`server/levels.mjs`:**
  - `loadLevels(dir)` parses and validates every level and fails at startup on any error.
  - It checks links inside each level:
    - IDs are unique.
    - Every record's chapter exists.
    - Each character has one knowledge entry per chapter.
    - Findings, culprits and rehearsal `evidence` point to real IDs.
  - It computes `contentHash`: a short sha256 of the parsed level in canonical form.
  - `publicView(level)` builds the browser's slice from an **allowlist**.
- **`session.mjs`:** `Investigation` takes a `level`. Interviews are keyed by `level.characters`. `replay(events, levels)` looks up the level by `caseId` + `caseVersion` + `contentHash`. If the level has changed since the log was written, the session is not restored and the player starts fresh.
- **`interviews.mjs`:** `buildMessages(level, …)`. The template keeps the shared rules, and the setting and word lists come from `level.prompt`. `rehearsalAnswer` follows the `rehearsal` rules in order.
- **Logs:** add `contentHash` and bump `schemaVersion` to 2. `caseId` becomes the level ID.
- **Dockerfile:** `COPY levels ./levels` into the runtime image, never into `public/` or `dist/`.
- **Tests:**
  - Existing tests pass with the banana level loaded from YAML.
  - The rehearsal replies match today's output word for word.
  - The old override-v1 story loads as a 4-chapter fixture.

**Done when** `npm test` passes, the logs carry the hash, and `server/case.mjs` is deleted.

## Phase 2: Client driven by level data (L)

- **`/api/state`** includes `level: publicView(level)`. A per-level answer-feedback line is only sent once the case is closed.
- **`types.ts`:** `CharacterId` becomes `string`. `LocationId` becomes the four stations plus character IDs.
- **`main.ts`:**
  - Build the nav, drafts, intro, briefing, progress text and counts from level data instead of literals. Today the literals include "3 clues", "Ask 3 monkeys", `verdict.suspect === 'momo'`, "Inspect the banana basket" and "BANANA GROVE".
  - The header becomes a generic "The Override" brand, and the level title appears inside the page.
- **Sprites:**
  - Move the per-character atlas data out of `monkey-idle.ts` into `public/assets/sprites.json`, keyed like `monkeys/momo`. It's fine for this to be public.
  - Replace the per-character CSS (`.monkey-face.momo`, `.avatar-dot.pip`, …) with inline styles computed from that file.
- **`station.ts`:**
  - Take the stops and character positions from `level.map`.
  - Keep `drawClearing` as the code for the `grove` preset.
  - Build collision from the preset plus character positions.
  - Scene key and `aria-label` come from the level.
- **Tests:** the existing Playwright specs pass on the banana level. Add one spec that plays the 4-chapter fixture with placeholder sprites.

**Done when** the banana level plays exactly as before and a level with a different cast and chapter count also plays.

## Phase 3: Choosing a level (M)

- **`GET /api/levels`** returns the public list: ID, title, summary, order and status. Hidden and draft levels are left out unless dev tools are on.
- **`start`** accepts `levelId`. The session stores it, and **New case** keeps the same level.
- **How a player gets a level**, set with `OVERRIDE_ASSIGNMENT`:
  - `choose`: a card menu on the intro screen. This is the default.
  - `fixed`: the `?level=` URL parameter or the `OVERRIDE_LEVELS` list.
  - `balanced`: random, but evened out across players. Leave this for the research study.
- **Logs:** `session_started` records `levelId`, `contentHash` and `assignment`.
- **Update the README:** it still says there is one shared investigation per server.

## Phase 4: Authoring tools, the cheap 80% (M–L in total)

The pieces can be built in any order once Phase 1 is done. Map checks need Phase 2.

**4a. `npm run levels:check`.** Runs inside `npm test` and in CI. Each problem is reported as file › path › message.
- **Errors:**
  - schema problems
  - broken links between IDs
  - a stop or clue that can't be reached from the start point
  - a sprite key that doesn't exist
  - a character placed inside a blocked cell
- **Warnings:**
  - a character has no rehearsal reply for a record
  - knowledge text over N words
  - unused records
- Reachability needs the grid and pathfinding pulled out of `station.ts` into a shared, framework-free `shared/grid.mjs` (with a `.d.ts`), so the checker and the game use the same logic.

**4b. `npm run levels:prompt -- banana-mystery momo --chapter 1 [--evidence bell] [--question "…"]`**: prints the exact messages from `buildMessages`. This is the tool that would have caught "the The planner".

**4c. Playtest from any point**, behind `OVERRIDE_DEV_TOOLS=1`. The server refuses to enable it when `NODE_ENV=production`.
- `/?level=x&reveal=1&asked=momo,pip&at=nori` seeds a session.
- Seeded sessions are marked `playtest: true` and logged to `data/playtest/`, never mixed with study data.
- They use rehearsal replies by default.

**4d. `?debug` overlay** in `station.ts`: blocked cells, interaction radius, the current route.

**4e. Hot reload:** add `levels/` to the dev server's watch paths in `server/dev.mjs`.

**4f. "Who knew what" grid (optional).** Each character gets an optional `knew:` block in the YAML (`{ rule: knew, message: made-it-up, bell: knew }`).
- `levels:check` prints it as a table.
- It warns when the grid contradicts the answer key, e.g. a culprit with no `knew` or `made-it-up` entry.

**Research safety:**
- Levels marked `frozen` have their hash stored in `levels/levels.lock.json`.
- `levels:check` fails if a frozen level changes without a version bump.
- Add a test, run for every level, that no knowledge, rehearsal or debrief text appears in `/api/state` before the verdict. It generalizes the existing `includes('you wanted the bananas now')` check.

**Docs:** a "Writing a level" section in the README, plus an annotated example level.

## Phase 5: Maps, only when a level needs a different layout (L)

1. **Code presets** (`client/maps/grove.ts`, `…/hut.ts`) chosen by `map.preset`. The cheapest option.
2. **Tiled**, if layouts multiply:
   - `levels/<id>/maps/*.tmj`, plus a Tiled project file defining typed objects: `npc`, `clue`, `door`, `station`, `spawn`.
   - Phaser loads these files natively.
   - The collision layer becomes the blocked set.
   - The art needs a ground tileset, and a script to cut props out of `jungle-props.png`.
3. **Engine support for complex maps:**
   - a camera that follows the player on maps larger than 480×340
   - several maps per level, joined by doors with spawn points
   - clue spots placed on the map
4. **Key decision: keep the chapter model.**
   - A clue spot reveals *chapter N*, and a door opens when chapter N is revealed.
   - That keeps `revealedPosition`, the staged knowledge, the logs and `replay()` working unchanged.
   - Letting players find individual clues in any order would change all of those, so don't do it without a strong research reason.

## Phase 6: Custom editor, deferred

**Build it only if one of these happens:** non-technical people write levels, you have more than about 10 levels, or placement mistakes keep getting past the checks.

**Scope:**
- A dev-only `editor.html`, plus dev-only endpoints that read and write level files.
- Map mode: objects and collision.
- An inspector that shows a character's map data and story data together.
- The checks panel (4a), playtest button (4c), prompt preview (4b) and story grid (4f), all reused from Phase 4.
- Ground painting stays in Tiled.
- Writes keep YAML comments, are atomic, and are never part of the production build.
- Git serves as the version history.

## Order

```
0 → 1 → 2 → 3
     ├→ 4b, 4a story checks, 4f   (after 1)
     ├→ 4a map checks, 4d, 4e     (after 2)
     └→ 4c                        (after 3)
5, 6: only when their triggers happen
```

Rough sizes: S = under a day, M = 1–3 days, L = 3+ days. Phases 0–4 come to about 2–3 weeks of focused solo work, less if we pair on it.

## Decisions for you

1. **YAML** (recommended) or typed JS modules for the level files?
2. **Override-v1:** a real playable level, or only a hidden test level?
3. **Choosing a level:** a menu, a fixed unlock order, or assignment for research? This decides how much of Phase 3 you need.
4. **Cast:** monkeys only for now, or a shared pool of characters across levels?
5. **Chapter model** (recommended) or clues found in any order? This sets the size of Phase 5.
