# Seam report: override-cases (2026-10-26)

1. `node --test demos/override/tests/*.test.mjs`: tests 41, pass 41, fail 0.
2. `npm run build`: built OK (vite, "built in 5.76s").
3. `npx playwright test`: 23 passed (1.8m), 0 failed.
4. `npm run cases:prompt`: banana-control momo --chapter 1 contains "banana mix-up where the keeper changed the rule" (1 match), "the The" 0 matches. banana-mystery momo --chapter 1 --evidence bell: last message contains `"id":"bell"` (1 match).
5. Dockerfile line 14 `COPY server ./server` (server/cases ships); server/case.mjs deleted.
6. `git status --short`: only demos/override files, .gitignore and docs/plans; nothing under .superlite.

Failures: none.
