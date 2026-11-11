# Castelvento · A Word Out of Time

The four sheets in `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1` (scout, inventor, noble, guard) are used today: their idle row loops, the scout's walk row walks. Two problems remain:

- **The walk is one step, not a cycle.** Row 2 of the scout sheet is one contact frame and three near-identical passing frames, so the legs never alternate. R1 asks for a real 8-frame cycle.
- **The talk frames hold props.** Row 3 is a prop interaction (a map, a letter, a warrant, a clockwork device), so the townsfolk "talk" by reading paper. The conversation sheets ask for open-hand talking and a proper thinking pose.

The wizard, the apothecary and the town square are still placeholders (recolours and a script-drawn square). All character sheets are 1536 x 1024, 4 columns x 2 rows. Save them untouched; the cutter registers every frame on the feet and the head, as it does today.

## Scout (player)

### R1 · Scout walk · P1

> **Status: delivered and in the game (2026-11-11).** The accepted sheet (`scout-walk.png`) ships byte for byte as `public/assets/renaissance/characters/scout-walk.png` (SHA-256 pinned) and plays frames 1 to 8 at 100 ms of walking time each (`scoutWalk` in `client/worlds.ts`). It replaces the four frames that `cut.py` cut from the old character sheet (`scout-walk-0..3.png`, which the game no longer loads). One pivot, (210, 473), for all eight cells. The scale is 180/448 of the pose scale.
>
> - **Bob:** the head tops are drawn at 24 35 24 12 24 36 24 12, a 24 px bob. Per-frame offsets (0 -7 0 8 0 -8 0 8) hold the head within 4 px of y 24. The cost is that the shoes leave the floor line by up to 8 px (about 1 world unit, 3 canvas px): frames 2 and 6 hover slightly and frames 4 and 8 sink slightly.
> - **Gait:** row 2 repeats row 1, so the cycle is one step drawn twice and the same leg always leads. It reads as a walk at game size.
> - **v2 candidate (`scout-walk-v2.png`, not used):** its row 2 has different leg poses, but frames 3 and 7 are drawn 32 px left of the others, and frame 8 is a second contact pose straight into frame 1, which stutters at the seam. Mixing R1 frames 1-4 with v2 frames 5-8 has the same seam fault. Kept untouched in the motion folder.
> - A redraw only needs row 2 to mirror the legs of row 1 (the far leg leading) and the same 4 x 2 layout.

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/scout-walk.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/hooded-scout.png`
- **Unlocks:** a real alternating walk cycle for the scout (replaces the current one-step row)
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] the legs alternate: frames 1 and 5 lead with different legs
  - [ ] the head stays in the same spot in every cell (walking in place)

```text
Use case: identity-preserve.
Asset type: transparent walk-cycle sprite sheet for an Italian Renaissance time-travel mystery game (late-15th-century Italian town, original character design).
Input images: the attached sprite sheet shows this exact character (row 1 standing, row 2 an earlier walk attempt to IMPROVE on, not copy). Use it as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the detailed hand-painted pixel-art aesthetic exactly: crisp small edges, warm muted cloth colours, dark readable outlines, subtle rich cloth shading, realistic stylized adult proportions about five heads tall. Do not redesign, restyle or simplify.
Character: An agile young adult woman with olive skin, short dark hair visible under a charcoal hood, muted teal Renaissance doublet, fitted leather armour, cream undersleeves, weathered boots, small belt pouches and a sheathed dagger. Friendly but observant.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 420 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. Compact full-body three-quarter side view facing right in every cell. The eight figures form ONE looping walk cycle, read left to right along row 1 and then row 2.
Motion: walking toward the right in that view, IN PLACE as on a treadmill: the head and torso stay at the same horizontal spot in every cell and never travel across the cell; the whole body bobs up and down by at most 2 art pixels. Her hands are empty: no map, no compass. Her burgundy cloak trails behind her and sways a little with each step.
Frame by frame (near leg = the leg closer to the viewer, far leg = the other one):
1 CONTACT: near leg stepped forward with the heel just touching the ground, far leg stretched behind on its toes, far arm swung forward, near arm back.
2 DOWN: weight lands on the near leg, knee bent, body at its lowest; far foot lifting off behind.
3 PASSING: near leg straight under the body; far leg bent with its foot raised, passing beside the near leg; arms close to the body.
4 UP: near leg pushing off behind on its toes; far leg swinging forward; body at its highest.
5 CONTACT: far leg stepped forward with the heel just touching the ground, near leg stretched behind on its toes, near arm swung forward, far arm back.
6 DOWN: weight lands on the far leg, knee bent, body at its lowest; near foot lifting off behind.
7 PASSING: far leg straight under the body; near leg bent with its foot raised, passing beside the far leg.
8 UP: far leg pushing off behind on its toes; near leg swinging forward; body at its highest. Frame 8 flows back into frame 1.
Consistency: the same face, calm closed-mouth expression, outfit, colours, outline weight and scale in all eight cells; only the legs, the arms, loose cloth and a slight bob change.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Ottavio · wizard (new art)

### R2 · Ottavio · wizard idle, talk and think · P2

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/wizard-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/inventor.png`
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/court-noble.png`
- **Unlocks:** real art for Ottavio instead of the recoloured inventor
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] cells 5-6 talk with an open hand, cells 7-8 think, hands hold nothing new

```text
Use case: stylized-concept.
Asset type: transparent idle, talking and thinking sprite sheet for an Italian Renaissance time-travel mystery game (late-15th-century Italian town, original character design, no existing franchise characters).
Input images: the attached sheets are STYLE REFERENCES ONLY: do not copy their people. Draw a new, original person in the same visual family as the attached sheets: the detailed hand-painted pixel-art aesthetic exactly: crisp small edges, warm muted cloth colours, dark readable outlines, subtle rich cloth shading, realistic stylized adult proportions about five heads tall.
Character: An elderly man with fair skin, a long silver beard and long silver hair, ivory scholar robes with a burgundy mantle, and a tall brass astrolabe staff. Wise, calm and difficult to read.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 420 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. Compact full-body three-quarter side view facing right in every cell.
Row 1, IDLE, loops 1-2-3-4: standing calmly, hands at rest. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, nothing in the hands changes, the feet never move.
Row 2, cells 1 and 2 TALKING, cells 3 and 4 THINKING. Cell 1: mouth slightly open, one hand raised in a modest open-palm explanatory gesture. Cell 2: mouth closed, the same hand a little lower, as if mid-sentence. Cell 3: mouth closed, one hand stroking his beard, eyes looking slightly up and away. Cell 4: the same thinking pose with the eyes closed. The tall brass staff stays upright in his far hand in every cell; its top stays inside the cell.
Consistency: the same face, clothing, accessories, colours, lighting and scale in all eight cells; between neighbouring frames only the stated details change.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark. No letters, maps, vials, devices, medallions or tokens in the hands; nothing suspicious.
```

## Agnese · apothecary (new art)

### R3 · Agnese · apothecary idle, talk and think · P2

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/apothecary-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/court-noble.png`
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/inventor.png`
- **Unlocks:** real art for Agnese instead of the recoloured noble
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] cells 5-6 talk with an open hand, cells 7-8 think, hands hold nothing new

```text
Use case: stylized-concept.
Asset type: transparent idle, talking and thinking sprite sheet for an Italian Renaissance time-travel mystery game (late-15th-century Italian town, original character design, no existing franchise characters).
Input images: the attached sheets are STYLE REFERENCES ONLY: do not copy their people. Draw a new, original person in the same visual family as the attached sheets: the detailed hand-painted pixel-art aesthetic exactly: crisp small edges, warm muted cloth colours, dark readable outlines, subtle rich cloth shading, realistic stylized adult proportions about five heads tall.
Character: An elderly woman with light olive skin, gray hair beneath a cream linen cap, sage-green Renaissance dress, brown shawl, leather satchel at her hip, an apron with herb and small glass-vial pockets, practical leather shoes. Kind, perceptive and difficult to read.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 420 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. Compact full-body three-quarter side view facing right in every cell.
Row 1, IDLE, loops 1-2-3-4: standing calmly, hands at rest. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, nothing in the hands changes, the feet never move.
Row 2, cells 1 and 2 TALKING, cells 3 and 4 THINKING. Cell 1: mouth slightly open, one hand raised in a modest open-palm explanatory gesture. Cell 2: mouth closed, the same hand a little lower, as if mid-sentence. Cell 3: mouth closed, one hand at her chin, eyes looking slightly up and away. Cell 4: the same thinking pose with the eyes closed. Her satchel stays at her hip; the vials stay in their apron pockets.
Consistency: the same face, clothing, accessories, colours, lighting and scale in all eight cells; between neighbouring frames only the stated details change.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark. No letters, maps, vials, devices, medallions or tokens in the hands; nothing suspicious.
```

## Matteo · inventor

### R4 · Matteo · inventor idle, talk and think · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/inventor-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/inventor.png`
- **Unlocks:** open-hand talking and a thinking pose (today he talks while holding a clockwork device)
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] cells 5-6 talk with an open hand, cells 7-8 think, hands hold nothing new

```text
Use case: identity-preserve.
Asset type: transparent idle, talking and thinking sprite sheet for an Italian Renaissance time-travel mystery game (late-15th-century Italian town, original character design, no existing franchise characters).
Input images: the attached sprite sheet shows this exact character. It is the IDENTITY AND STYLE REFERENCE: match the face, hair, skin tone, clothing, proportions, colours and the detailed hand-painted pixel-art aesthetic exactly: crisp small edges, warm muted cloth colours, dark readable outlines, subtle rich cloth shading, realistic stylized adult proportions about five heads tall. Do not redesign, restyle or simplify.
Character: A wiry middle-aged man with warm brown skin, curly graying hair, round brass spectacles, ochre Renaissance tunic, rolled ivory sleeves, dark leather apron, tool belt, trousers and practical boots. Curious, eccentric, sympathetic.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 420 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. Compact full-body three-quarter side view facing right in every cell.
Row 1, IDLE, loops 1-2-3-4: standing calmly, hands at rest. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, nothing in the hands changes, the feet never move.
Row 2, cells 1 and 2 TALKING, cells 3 and 4 THINKING. Cell 1: mouth slightly open, one hand raised in a modest open-palm explanatory gesture. Cell 2: mouth closed, the same hand a little lower, as if mid-sentence. Cell 3: mouth closed, one hand at his chin, the other arm folded under it, eyes looking slightly up and away. Cell 4: the same thinking pose with the eyes closed. His tools stay on his belt; no clockwork device in his hands.
Consistency: the same face, clothing, accessories, colours, lighting and scale in all eight cells; between neighbouring frames only the stated details change.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark. No letters, maps, vials, devices, medallions or tokens in the hands; nothing suspicious.
```

## Beatrice · noble

### R5 · Beatrice · noble idle, talk and think · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/noble-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/court-noble.png`
- **Unlocks:** open-hand talking and a thinking pose (today she talks while holding a letter)
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] cells 5-6 talk with an open hand, cells 7-8 think, hands hold nothing new

```text
Use case: identity-preserve.
Asset type: transparent idle, talking and thinking sprite sheet for an Italian Renaissance time-travel mystery game (late-15th-century Italian town, original character design, no existing franchise characters).
Input images: the attached sprite sheet shows this exact character. It is the IDENTITY AND STYLE REFERENCE: match the face, hair, skin tone, clothing, proportions, colours and the detailed hand-painted pixel-art aesthetic exactly: crisp small edges, warm muted cloth colours, dark readable outlines, subtle rich cloth shading, realistic stylized adult proportions about five heads tall. Do not redesign, restyle or simplify.
Character: A poised adult woman with pale skin, auburn hair in a braided Renaissance updo, an elegant plum and ivory brocade gown, fitted bodice, gold chain and decorative belt. Clever and socially confident.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 420 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. Compact full-body three-quarter side view facing right in every cell.
Row 1, IDLE, loops 1-2-3-4: standing calmly, hands at rest. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, nothing in the hands changes, the feet never move.
Row 2, cells 1 and 2 TALKING, cells 3 and 4 THINKING. Cell 1: mouth slightly open, one hand raised in a modest open-palm explanatory gesture. Cell 2: mouth closed, the same hand a little lower, as if mid-sentence. Cell 3: mouth closed, one finger resting on her chin, the other hand at her waist, eyes looking slightly up and away. Cell 4: the same thinking pose with the eyes closed. No letter in her hands.
Consistency: the same face, clothing, accessories, colours, lighting and scale in all eight cells; between neighbouring frames only the stated details change.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark. No letters, maps, vials, devices, medallions or tokens in the hands; nothing suspicious.
```

## Bruno · city guard

### R6 · Bruno · city guard idle, talk and think · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/guard-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/city-guard.png`
- **Unlocks:** open-hand talking and a thinking pose (today he talks while reading a warrant)
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] cells 5-6 talk with an open hand, cells 7-8 think, hands hold nothing new

```text
Use case: identity-preserve.
Asset type: transparent idle, talking and thinking sprite sheet for an Italian Renaissance time-travel mystery game (late-15th-century Italian town, original character design, no existing franchise characters).
Input images: the attached sprite sheet shows this exact character. It is the IDENTITY AND STYLE REFERENCE: match the face, hair, skin tone, clothing, armour, proportions, colours and the detailed hand-painted pixel-art aesthetic exactly: crisp small edges, warm muted cloth colours, dark readable outlines, subtle rich cloth shading, realistic stylized adult proportions about five heads tall. Do not redesign, restyle or simplify.
Character: A broad-shouldered adult man with dark brown skin, close-cropped hair and a short beard, in a late-15th-century Italian city-watch outfit: dark-red tabard over a steel breastplate and mail sleeves, brown leather belt, dark trousers and boots, simple burgonet helmet, short upright polearm. Alert yet approachable.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 420 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. Compact full-body three-quarter side view facing right in every cell.
Row 1, IDLE, loops 1-2-3-4: standing calmly, hands at rest. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, nothing in the hands changes, the feet never move.
Row 2, cells 1 and 2 TALKING, cells 3 and 4 THINKING. Cell 1: mouth slightly open, one hand raised in a modest open-palm explanatory gesture. Cell 2: mouth closed, the same hand a little lower, as if mid-sentence. Cell 3: mouth closed, his free hand rubbing his beard, eyes looking slightly up and away. Cell 4: the same thinking pose with the eyes closed. The polearm stays upright in the hand that holds it in the reference, in every cell; no parchment.
Consistency: the same face, clothing, accessories, colours, lighting and scale in all eight cells; between neighbouring frames only the stated details change.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark. No letters, maps, vials, devices, medallions or tokens in the hands; nothing suspicious.
```

## Town square

### R7 · Castelvento town square backdrop · P2

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/town-square.png`
- **Canvas:** 1536 x 1024 (3:2), opaque
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/hooded-scout.png`
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/city-guard.png`
- **Unlocks:** the painted square instead of the script-drawn placeholder. Keep the layout contract in `art/renaissance/ARTWORK.md` (buildings only in y 0..330, well x 40..200 / y 520..700, bench and crates x 1300..1500 / y 560..740); the walk zones get re-measured after


```text
Use case: stylized-concept.
Input images: the attached character sheets are a STYLE REFERENCE for the rendering only; draw no people.
Asset type: a single wide 2D RPG game environment background / playable town-square map, landscape 3:2 composition.
Primary request: the place where characters can move in an Italian Renaissance time-travel mystery game. Match a cast of detailed hand-painted pixel-art characters: an ivory-and-burgundy wizard with brass astrolabe staff, a hooded scout, an ochre-clad inventor, a plum-gowned noble, a burgundy city guard and an elderly apothecary.
Scene: a believable late-15th-century Italian Renaissance town square, warm weathered ochre stone and terracotta roof architecture, evocative of Florence and Venice. A modest apothecary with herb bundles and green shutters on the left, a clockmaker/inventor workshop with a small brass clock and wooden door at upper left, a graceful civic palace entrance with arches along the upper center, and a narrow guarded stone gateway opening into a street at upper right. Architectural details and props mostly around the upper and side edges; faint intriguing astronomical motif worked into a stone doorway hints at the time-travel mystery. Original world, no recognizable existing game location.
Gameplay layout: expansive continuous unobstructed walkable cobblestone ground across the lower two thirds and through the middle; broad routes connect every doorway. Keep middle and lower center spacious and simple so sprites remain readable. A small dry stone well only near the far left edge, a wooden bench and two crates only near the far right edge. Clear playable ground, no obstacles across the main paths. No giant centerpiece, no central fountain. Building entrances visible and reachable, dark door openings meet the ground plane naturally. Continuous foreground paving reaches the bottom image edge without a blocking wall.
Camera and style: fixed elevated three-quarter front view for a 2D adventure RPG, shallow perspective, nearly parallel verticals, no dramatic vanishing point, no horizon or sky. This is a game environment plate to place separate character sprites over. Richly detailed hand-painted pixel-art aesthetic with crisp small edges and restrained warm muted colors, readable forms, slightly stylized realistic medieval/Renaissance architecture, consistent with finely shaded pixel-art character sprites. Fine detailing concentrated on architecture, quieter cobblestone surface for movement. Gentle late-afternoon light from upper left, warm stone and cool subdued archway shadows, welcoming yet subtly mysterious atmosphere. No film blur or depth of field.
Constraints: environment only, absolutely no people, no characters, no animals, no UI, no text, no lettering, no logos, no watermark, no drawn path markers or collision grid, no modern technology visible. Full opaque background, no transparency. High-detail polished game background with clear spatial continuity.
Layout contract (exact, in image pixels of a 1536x1024 plate): buildings and doorways only in y 0..330 (apothecary door x 120..240, clockmaker door x 380..480, palazzo arches x 600..940 with a sundial line on the steps, guarded gateway x 1220..1360); cobbles from y 330 to the bottom edge; the well only inside x 40..200, y 520..700; the bench and two crates only inside x 1300..1500, y 560..740.
```

## Item icons

### R8 · Scroll, seal and quill icons · P4 (optional)

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/icons.png`
- **Canvas:** 1536 x 512, 3 x 1 cells of 512 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1/court-noble.png`
- **Unlocks:** painted icons for the START HERE scroll, the YOUR GUESS seal and the Quotes button (today they are script-drawn)


```text
Use case: stylized-concept.
Asset type: three transparent item icons for an Italian Renaissance time-travel mystery game.
Input images: the attached sprite sheet is a STYLE REFERENCE ONLY. Match its detailed hand-painted pixel-art aesthetic: crisp small edges, warm muted colours, dark readable outlines, subtle rich shading.
Composition: one landscape 1536x512 canvas, EXACTLY 3 equal square cells of 512x512 in one row, one item centred in each cell, each about 380 pixels across, three-quarter top view.
Cell 1: a rolled parchment scroll, partly open, with a few faint unreadable ink lines and wooden end rods.
Cell 2: a round red wax seal with a simple stamped star-and-compass emblem and a short loop of cord.
Cell 3: a white feather quill leaning in a small dark glass inkpot.
Constraints: genuine transparent alpha background, every item fully inside its cell with clear margin, no ground, no shadow, no glow, no checkerboard, no grid lines, no text, letters, numbers, labels or watermark.
```
