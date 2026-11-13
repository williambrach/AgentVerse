# Spec: streaming interviews, client side (PR #4 remainder)

## Intent

Answers from a live model take 3 to 20 s. With the server already streaming NDJSON (PR #4, 53a7a15), the player should see the answer being typed as it arrives, the character's pose should be honest about it (thinking until the first word, speaking while words arrive), and Watch should let the player read the reasoning live while it streams. A guard retry must never leave the false start on screen.

## Done looks like

- S1 Streaming ask: every interview POST sends `stream: true`. The client reads `application/x-ndjson` line by line. A plain JSON reply (server refused streaming, `OVERRIDE_LLM_STREAM=0`, or an error before any line) still works exactly as today.
- S2 Typewriter: `delta` text appears in the waiting bubble as it arrives, without a full notebook re-render per token. A caret shows while text is still arriving. With `prefers-reduced-motion: reduce` the text appears per chunk, without a caret animation. A click on the streaming bubble shows everything received so far at once.
- S3 Scrub: a `scrub` line (or `start` with attempt > 1 for the same label) clears that label's text from the bubble. The false start is never visible after the scrub.
- S4 Poses: the character thinks until the first `delta`, then speaks (`station.speak`/`say` paced per chunk); after the committed view the normal speak path runs once, as today.
- S5 Live Watch: while an answer streams, the Inspect tool card reads Watch and is enabled when the case has Inspect and a charge is available. Clicking it POSTs `/api/inspect {sessionId, character, live: true, questionEventId}` with no `revision`, bypassing the client `busy` guard. `reasoning` lines then fill a live reasoning card in the chat; `reasoning_scrub` clears it. If the committed line holds no reasoning, the chat shows the no-thought note (no charge was made). Watch is not offered when `tools.inspect === false`.
- S6 End lines: `view` is received exactly like a normal action reply (`receive`, drafts cleared, speak). `fail` shows its `error` as the error message and runs the same recovery path as a failed action (refresh state).
- S7 Text: every new UI string is a key in `client/text/<area>.json`; `text-keys.test` stays green.
- S8 e2e: a new Playwright project proves typing reveal, Watch during stream, scrub on guard retry, and a fail line, against a live server over the mock LLM.
- S9 README: a streaming paragraph under Live interviews and an `OVERRIDE_LLM_STREAM` row in the env table. `npm run build` passes.

## Non-goals

Chatter (Let them talk) streaming; server changes beyond what the e2e harness needs.
