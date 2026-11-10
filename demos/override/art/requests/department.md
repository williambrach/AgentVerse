# Department · After Hours (the IMADA game)

The current art is three still poses per person (192 x 384, feet at 96,376). The hall backdrop and the evidence props are done.

Only the detective walks here, so the colleagues need idle and talk frames only. All sheets are 1536 x 1024, 4 columns x 2 rows. Save them untouched.

## Detective (player)

### D1 · Detective (player) walk · P1

> **Status: delivered as a prototype and in the game (2026-11-10).** The sheet ships byte for byte as `public/assets/department/characters/player-walk.png` (a SHA-256 test pins it to the delivered file) and plays frames 1 to 8 at 100 ms of walking time each (`departmentWalk` in `client/worlds.ts`). One fixed pivot for all eight cells, (207, 477), puts the head and shoes where the still poses have them; the scale is 352/429 of the pose scale, so walking and standing are the same height on screen.
>
> Faults still in the art (measured at alpha >= 128; a regenerated sheet only needs the same 4 x 2 layout to drop in):
> - The legs barely alternate: row 2 repeats much of row 1's leg geometry, so the near and far legs do not clearly swap supporting roles. It reads as a walk at game size, but not a clean two-step cycle.
> - The bob is too big: head tops vary by 21 px (42..63) against the requested 2 art pixels. The game shows it as drawn.
> - Shoes end at y 470..476 instead of one line at 472. With the fixed pivot, frames 4 and 8 float up to 7 cell px (about 1 world unit, 3 canvas px).
> - The figure is drawn about 11 px right of the cell centre (head column x 198..204). The pivot is set to match the art, so this needs no fix, but a redraw should keep it.
> - About 90,000 background pixels have alpha 1..15. They are invisible over light and dark grounds, so they are left as delivered.
> - The correction prompt in the README fixes the first three; Codex's last attempt hit the image usage limit.

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/department/player-walk.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/main-character/exports/player-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/main-character/exports/player-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/main-character/exports/player-thinking.png`
- **Unlocks:** the detective's walk through the hall
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] the legs alternate: frames 1 and 5 lead with different legs
  - [ ] the head stays in the same spot in every cell (walking in place)

```text
Use case: identity-preserve.
Asset type: transparent walk-cycle sprite sheet for a contemporary Danish university murder mystery game (department hall, Nordic everyday styling).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use it as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A young adult woman detective: fair cool-toned complexion, softly waved ash-blonde chin-length bob, blue-gray eyes, alert approachable expression; beige detective coat, navy sweater, white shirt collar, charcoal trousers, brown shoes, a dark pocket notebook.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell. The eight figures form ONE looping walk cycle, read left to right along row 1 and then row 2.
Motion: walking toward the right in the reference's three-quarter front view, IN PLACE as on a treadmill: the head and torso stay at the same horizontal spot in every cell and never travel across the cell; the whole body bobs up and down by at most 2 art pixels. She keeps the dark notebook in the hand that holds it in the listening pose, so that arm swings only a little; the coat hem flaps a little with each step.
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

### D2 · Detective (player) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/department/player-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/main-character/exports/player-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/main-character/exports/player-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/main-character/exports/player-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for a contemporary Danish university murder mystery game (department hall, Nordic everyday styling).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A young adult woman detective: fair cool-toned complexion, softly waved ash-blonde chin-length bob, blue-gray eyes, alert approachable expression; beige detective coat, navy sweater, white shirt collar, charcoal trousers, brown shoes, a dark pocket notebook.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Freja (phd-01)

### D3 · Freja (phd-01) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/department/phd-01-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/phd-01-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/phd-01-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/phd-01-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for a contemporary Danish university murder mystery game (department hall, Nordic everyday styling).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A woman PhD student: fair complexion with subtle freckles, dark-blonde hair in a loose high ponytail, hazel eyes; mustard cardigan, cream top, dark trousers, white sneakers.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Mikkel (phd-02)

### D4 · Mikkel (phd-02) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/department/phd-02-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/phd-02-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/phd-02-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/phd-02-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for a contemporary Danish university murder mystery game (department hall, Nordic everyday styling).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A man PhD student: fair freckled complexion, naturally copper-red tousled hair, blue eyes, round glasses; burgundy hoodie, jeans, white sneakers.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Birgit (professor)

### D5 · Birgit (professor) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/department/professor-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/professor-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/professor-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/professor-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for a contemporary Danish university murder mystery game (department hall, Nordic everyday styling).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: An older woman professor: fair rosy complexion, silver-blonde shoulder-length hair, gray-blue eyes, narrow glasses; teal blazer, pale blouse, black trousers.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Jonas (it-admin)

### D6 · Jonas (it-admin) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/department/it-admin-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/it-admin-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/it-admin-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/it-admin-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for a contemporary Danish university murder mystery game (department hall, Nordic everyday styling).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A man IT administrator: fair complexion, short ash-brown hair, neatly trimmed sandy-brown beard, gray-green eyes; blue overshirt over a gray T-shirt, dark jeans, a plain lanyard with an ID card.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Signe (department-admin)

### D7 · Signe (department-admin) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/department/department-admin-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/department-admin-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/department-admin-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/murder-mystery-nordic-v2/exports/characters/department-admin-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for a contemporary Danish university murder mystery game (department hall, Nordic everyday styling).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A woman department administrator: fair complexion, light copper hair in a low bun, green eyes; sage blouse, charcoal trousers, brown shoes, a plain lanyard with an ID card.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```
