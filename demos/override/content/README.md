# Content edits

These files hold the text edits made on the admin page. Do not edit them by hand.

- `cases/<caseId>.json` holds the edits for one case: `{id, version, edits}`.
- `game.json` holds the game text: UI strings, prompt rules and world text.

Keys are sorted, so a diff shows only what changed. A file disappears when all its edits are reverted to the authored text. The server only writes here. Review with `git diff demos/override/content`, then commit and push by hand.
