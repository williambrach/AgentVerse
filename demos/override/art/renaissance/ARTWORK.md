# Renaissance artwork

## Provenance
Character sheets (1254x1254, 4x4 cells, generated with built-in imagegen) come from
`/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/` (hooded-scout, inventor, court-noble, city-guard, apothecary, plus `prompts.json`).
Ottavio (sprite `wizard`) has his own conversation sheet, art request R2:
`/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/wizard-conversation.png` (1536x1024, 4x2 cells of 384x512).
The backdrop prompt is `/Users/williambrach/Developer/arbiter/assets/renaissance-background-v1/prompt.txt`.

## Placeholders (stated plainly)
- **props/scroll.png, props/seal.png, props/quill.png** are drawn icons (quill: the Quotes button); art request R8 would replace them.
Ottavio, the apothecary and the town square are delivered art: R2, the apothecary sheet, and the painted market square (`--backdrop`).

## Frame map (row, col; 1-indexed; row 1 idle, row 2 right-walk, row 3 interaction)
Row 4 (suspicious action) is never used, and no glowing frame is used.
| sprite | idle loop | thinking | talk loop (speaking = its first frame) |
|---|---|---|---|
| inventor | r1c1..r1c4 | r1c3 | r3c1 |
| noble | r1c1..r1c4 | r1c3 | r3c3, r3c2 |
| apothecary | r1c1..r1c4 | r1c3 | r1c2 (r3 and r4 are the vial gesture, never talk) |
| guard | r1c1..r1c4 | r1c3 | r3c4 |
| scout | r1c1..r1c4 | r1c3 | r3c2 |
`listening` = the first idle frame. Scout walk: the game plays the R1 walk sheet (`scout-walk.png`, see art/requests/renaissance.md). `scout-walk-0..3` = r2c1..r2c4 are still cut but no longer loaded.
The scout's r3c3 opens the map wide and the guard's r3c2 and r3c3 walk, so neither loops as talk.

Cutting: cell edges round(i*1254/4). Registration: each frame is shifted so its feet line (alpha box bottom) and its head
(best match of the top 24% against the first idle frame) sit where the first idle frame has them; the head column is the
median centre of the widest opaque run per row in the top 22%. Cut at that anchor with margins 110 left and right, 308 up,
5 down (sheet px), scaled to 132x188 with LANCZOS: foot anchor (66, 185), head at the frame's centre so a flipped figure
turns on the spot. The game cycles the idle frames 0 1 2 3 2 1 at 520 ms each and alternates talk frames every 420 ms.

## Ottavio (R2 conversation sheet)
Frames 1-8, left to right, then top to bottom: 1-4 idle (neutral, breath, neutral, blink), 5-6 talk (open palm with the
mouth open, then the hand lower and the mouth closed), 7-8 think (stroking the beard, eyes open, then closed).
| file | frames |
|---|---|
| `wizard-idle-0..3` | 1, 2, 3, 4 |
| `wizard-talk-0..1` | 5, 6 |
| `wizard-think-0..1` | 7, 8 |
| `wizard-listening` / `-speaking` / `-thinking` | 1 / 5 / 7 |

The generator drew him on the same spot in every cell: feet line y 489 (the prompt asked for 472), shoes x 141..266, head
column x 182. All eight frames share that one pivot (measured on frame 1; the cut stops if any frame drifts over 2 px) and
one scale, 0.38 (`CONV_SCALE`: his beret top lands at y 9 like the cast's heads, the staff top at y 4), nearest-neighbour,
so no pose is resized to its own box. Each cell is cut on its own, so no neighbour bleeds in; alpha under 9 (the faint halo)
is cleared. In the game the idle ping-pong skips the blink (0 1 2 1); the blink shows for 160 ms every 4 to 6.5 s. Talk
alternates every 420 ms and think every 1300 ms, both from frame 0 when the pose begins. The face badge crops the 45 px
window at (40, 4) of the listening frame (`client/renaissance.css`).

## Backdrop layout contract (1536x1024)
Buildings only in y 0..330: apothecary (door x 120..240), clockmaker (door x 380..480), palazzo arches x 600..940 (sundial line on steps), guarded gateway x 1220..1360. Cobbles y 330..1024. Well only x 40..200, y 520..700. Bench and two crates only x 1300..1500, y 560..740.

## Re-run
From `demos/override`: `python3 -I art/renaissance/cut.py --src /Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1`
(needs Pillow and numpy; `--characters-only` leaves the square and the prop icons alone).
Ottavio alone: `python3 -I art/renaissance/cut.py --wizard /Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/wizard-conversation.png`;
add `--check` to verify the shipped frames are a fresh cut without writing anything (`tests/wizard-art.test.mjs` runs it).

## Prompts
### Wizard sheet
```
Use case: stylized-concept. Asset type: matching 2D RPG character sprite sheet for an Italian Renaissance time-travel mystery. Same visual family as a silver-bearded wizard in ivory scholar robes, burgundy mantle and brass astrolabe staff: detailed hand-painted pixel-art aesthetic, crisp edges, warm muted cloth colors, dark readable outlines, realistic stylized adult proportions around five heads tall, subtle rich cloth shading, compact full-body three-quarter side view facing right. Late medieval / Italian Renaissance atmosphere inspired by Assassin's Creed II, original character design. Create ONE character only, repeated consistently in exactly 16 frames in a 4 column by 4 row regular grid on a square canvas. Each cell occupies exactly one quarter of width and height. Each complete figure centered in its own cell with consistent scale and baseline, at least 10% empty padding on all four sides of each cell. Row 1: four subtly distinct idle breathing frames. Row 2: four clear consecutive right-facing walking frames with different leg positions. Row 3: four stages of the stated interaction. Row 4: four stages of the stated suspicious action. The last row should make the character a plausible suspect in a hidden-time-traveler mystery; do not conclusively reveal guilt. Same face, clothing, body proportions, accessories and lighting across all frames; keep all props and compact effects fully inside their cells. GENUINE TRANSPARENT ALPHA background. No background scenery, floor, ground shadows, drawn grid, text, numbers, labels or watermark. Nothing clipped. No recognizable existing franchise characters.
Character: An elderly man with fair skin, a long silver beard and silver hair, ivory scholar robes with a burgundy mantle and a tall brass astrolabe staff. Wise, calm and difficult to read. His interaction is consulting a small brass astrolabe held in one hand; his suspicious action is mildly and briefly angling the astrolabe away from view, with no glowing effects.
```

### Apothecary sheet (copied from prompts.json)
```
Use case: stylized-concept. Asset type: matching 2D RPG character sprite sheet for an Italian Renaissance time-travel mystery. Same visual family as a silver-bearded wizard in ivory scholar robes, burgundy mantle and brass astrolabe staff: detailed hand-painted pixel-art aesthetic, crisp edges, warm muted cloth colors, dark readable outlines, realistic stylized adult proportions around five heads tall, subtle rich cloth shading, compact full-body three-quarter side view facing right. Late medieval / Italian Renaissance atmosphere inspired by Assassin's Creed II, original character design. Create ONE character only, repeated consistently in exactly 16 frames in a 4 column by 4 row regular grid on a square canvas. Each cell occupies exactly one quarter of width and height. Each complete figure centered in its own cell with consistent scale and baseline, at least 10% empty padding on all four sides of each cell. Row 1: four subtly distinct idle breathing frames. Row 2: four clear consecutive right-facing walking frames with different leg positions. Row 3: four stages of the stated interaction. Row 4: four stages of the stated suspicious action. The last row should make the character a plausible suspect in a hidden-time-traveler mystery; do not conclusively reveal guilt. Same face, clothing, body proportions, accessories and lighting across all frames; keep all props and compact effects fully inside their cells. GENUINE TRANSPARENT ALPHA background. No background scenery, floor, ground shadows, drawn grid, text, numbers, labels or watermark. Nothing clipped. No recognizable existing franchise characters.
Character: An elderly woman with light olive skin, gray hair beneath a cream linen cap, sage-green Renaissance dress, brown shawl, leather satchel, apron with herb and glass-vial pockets, practical leather shoes. Kind, perceptive and difficult to read. Her interaction is inspecting a small glass vial; her suspicious action is hiding a faint violet-glowing vial behind her shawl.
```

### Background (copied from prompt.txt)
```
Use case: stylized-concept.
Asset type: a single wide 2D RPG game environment background / playable town-square map, landscape 3:2 composition.
Primary request: the place where characters can move in an Italian Renaissance time-travel mystery game. Match a cast of detailed hand-painted pixel-art characters: an ivory-and-burgundy wizard with brass astrolabe staff, a hooded scout, an ochre-clad inventor, a plum-gowned noble, a burgundy city guard and an elderly apothecary.
Scene: a believable late-15th-century Italian Renaissance town square, warm weathered ochre stone and terracotta roof architecture, evocative of Florence and Venice. A modest apothecary with herb bundles and green shutters on the left, a clockmaker/inventor workshop with a small brass clock and wooden door at upper left, a graceful civic palace entrance with arches along the upper center, and a narrow guarded stone gateway opening into a street at upper right. Architectural details and props mostly around the upper and side edges; faint intriguing astronomical motif worked into a stone doorway hints at the time-travel mystery. Original world, no recognizable existing game location.
Gameplay layout: expansive continuous unobstructed walkable cobblestone ground across the lower two thirds and through the middle; broad routes connect every doorway. Keep middle and lower center spacious and simple so sprites remain readable. A small dry stone well only near the far left edge, a wooden bench and two crates only near the far right edge. Clear playable ground, no obstacles across the main paths. No giant centerpiece, no central fountain. Building entrances visible and reachable, dark door openings meet the ground plane naturally. Continuous foreground paving reaches the bottom image edge without a blocking wall.
Camera and style: fixed elevated three-quarter front view for a 2D adventure RPG, shallow perspective, nearly parallel verticals, no dramatic vanishing point, no horizon or sky. This is a game environment plate to place separate character sprites over. Richly detailed hand-painted pixel-art aesthetic with crisp small edges and restrained warm muted colors, readable forms, slightly stylized realistic medieval/Renaissance architecture, consistent with finely shaded pixel-art character sprites. Fine detailing concentrated on architecture, quieter cobblestone surface for movement. Gentle late-afternoon light from upper left, warm stone and cool subdued archway shadows, welcoming yet subtly mysterious atmosphere. No film blur or depth of field.
Constraints: environment only, absolutely no people, no characters, no animals, no UI, no text, no lettering, no logos, no watermark, no drawn path markers or collision grid, no modern technology visible. Full opaque background, no transparency. High-detail polished game background with clear spatial continuity.
```
