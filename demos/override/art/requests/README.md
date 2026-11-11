# Art requests: animation frames and backdrops

The factory, department and Castelvento figures now move, but only through code: still poses that breathe, bob and hop (`client/figure-motion.ts`). Castelvento's sheets also have drawn frames, but their walk row is one step, not a cycle, and their talk row holds props. These requests ask for drawn frames so every level can play real loops, plus the backdrops that are still placeholders.

Each request is **one sheet per generation**. Every prompt is self-contained.

- [factory.md](factory.md): Clocking Out (F1–F13)
- [department.md](department.md): After Hours, the IMADA game (D1–D7)
- [renaissance.md](renaissance.md): A Word Out of Time (R1–R8)

## How to make one

1. Open interactive Codex and use the built-in image tool.
2. Attach the files listed under **Attach** (absolute paths on this machine).
3. Paste the prompt block exactly as written.
4. Check the result against **Check before saving**. If a check fails, use the correction prompt below or generate again.
5. Save the PNG untouched (no cropping, resizing or retouching) at the **Save as** path.
   Everything goes in `/Users/williambrach/Developer/arbiter/assets/motion-v1/<level>/`.

You can deliver the sheets in any order and in batches; each one is wired in on its own.

## Order

| Priority | IDs | What | Why first |
|---|---|---|---|
| P1 | F1, D1, R1 | Walk cycles for the three player characters | The walk is what you see most. Today the factory and department detectives hop in a still pose, and the scout repeats one step. |
| P2 | R2, R3, R7 | Ottavio (wizard), Agnese (apothecary), the town square | These are still placeholders: recoloured sheets and a script-drawn square. |
| P3 | F2–F12, D2–D7, R4–R6 | Idle and talk sheets for everyone, and walks for the five factory workers | Real breathing, blinking and talking frames. Any worker can be the one who walks out of the exit door. |
| P4 | F13, R8 | Factory floor backdrop, Castelvento item icons | Optional polish: the factory floor is flat gray today, and the scroll, seal and quill icons are script-drawn. |

That is 28 images: 3 at P1, 3 at P2, 20 at P3 and 2 at P4.

## Sheet layout

Every character sheet is the same shape, so one cutter handles them all:

- **Canvas:** 1536 x 1024, 4 columns x 2 rows of 384 x 512 cells, one full-body figure per cell.
- **Walk sheets:** eight frames read left to right, row 1 then row 2. They form one looping cycle: contact, down, passing, up, then the same four phases with the other leg. The figure walks in place, so the head stays put and only the limbs move.
- **Idle and talk sheets:** row 1 is idle (neutral, breathe in, neutral, blink). Row 2 is talking (factory and department), or two talking frames and two thinking frames (Castelvento).

The prompts spell these out because of what went wrong with the first Castelvento sheets:

- The walk row came out as one contact frame and three near-identical passing frames, so the legs never alternated.
- The idle frames turned the head, which flickers when looped.
- The figures were drawn a few pixels apart in each cell.

The cutter fixes the last problem (it lines frames up on the feet and the head). The prompts prevent the first two.

## When a sheet comes out wrong

Attach the generated sheet and send:

```text
Technical correction ONLY to this existing sprite sheet. Preserve the exact art style, the character's identity, face, outfit, colours, proportions, poses and the 4-column by 2-row order. Fix only: <say what is wrong, e.g. "the boots in cells 3 and 7 are clipped at the bottom", "frames 5 to 8 lead with the same leg as frames 1 to 4; swap the legs in frames 5 to 8", "remove the checkerboard and make the background genuinely transparent">. Every figure fully inside its own cell with clear transparent margin. No ground, no shadow, no glow, no text, no labels.
```

## After delivery

For each delivered sheet I will:

- Cut and register it with a shared cutter, like `art/renaissance/cut.py`: frames lined up on the feet line and the head column, and scaled so the figure matches its current pose height.
- Write `<sprite>-idle-N`, `<sprite>-talk-N` and `<sprite>-walk-N` PNGs into `public/assets/<level>/characters/`.
- Turn on the world's `loops` and `walkFrames` and let workers use their walk when they escape.
- Re-measure the walk zones for a new backdrop.
- Keep the still listening, speaking and thinking poses: reduced motion and the portraits use them.
- Keep the code motion as the fallback for any sheet that has not arrived yet.

## Not needed

- **Grove and tower:** they already have 4-direction walk sheets and idle sheets.
- **Department:** the hall backdrop and the evidence props are done.
- **Factory:** the props are done.
- **Friends roundtable:** still waiting on its seated redraw, a separate request that already has a prompt: `/Users/williambrach/Developer/arbiter/assets/tabletop-v2/SEATED-REDRAW-PROMPT.txt`.
