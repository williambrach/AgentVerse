# Friends sprite assets

Source: the pack at `/Users/williambrach/Developer/arbiter/assets/animated-sprites-v1` (animated-sprites-v1), from its `exports` folder. Files were copied unchanged with plain byte copies. Nothing was re-encoded or edited.

## Layout

- `animations.json` and the 18 character strips at the top level.
- `room/` holds `animations.json` and the room art: the roundtable, fireplace and sconce loops, and the static room pieces.

## Character strips

- Each strip is six 192x288 frames, so each sheet is 1152x288.
- Anchor: x 0.5 and y 282/288 of the cell.
- Per-frame durations are in `animations.json`.

## Room loops

- Each room loop is six 256x256 frames (`room/animations.json`).
- The roundtable image is 1672x941.

## Missing art

- Alex, Nora and Sam have no walk cycles and no newly drawn seated rows. They have only standing pose loops (idle, talk, think), with procedural breathing.
- Ken's seated-think loop is an upper-body pose substitute that keeps his glasses. It is not a newly drawn seated sequence.
- The fireplace and lamp loops use procedural flicker. They are not hand-drawn flame cycles.

## How the game uses these files (unchanged on disk)

- Each state shows one frame of its strip; the other frames are not cycled, because they are separately drawn and do not register.
- Ken keeps `ken-seated-idle.png` while thinking (the think substitute has another head scale).
- Sam's seat is a temporary rig composed at runtime (`client/sam-rig.ts`): his standing frame above the hem over the player's seated legs, recoloured to his trousers and shoes. It is not seated art for Sam.
- Blinks and closed mouths are painted at runtime from each frame's own pixels (`client/face-paint.ts`). No patch is cut from another frame.
