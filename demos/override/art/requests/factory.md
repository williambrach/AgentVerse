# Factory · Clocking Out

Brightwell Snow Globe Works. The current art is three still poses per person (`/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/<sprite>-listening|speaking|thinking.png`, 192 x 384, feet at 96,376). Today the game moves them in code (breathing, hop-walk). These sheets replace that with drawn frames.

Every worker needs a walk too: any of them can be the one who walks out of the exit door when time runs out.

All sheets are 1536 x 1024, 4 columns x 2 rows. Save them untouched (no cropping or resizing); the cutter registers and scales them to the existing poses.

## Detective (player)

### F1 · Detective (player) walk · P1

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/detective-walk.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/detective-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/detective-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/detective-thinking.png`
- **Unlocks:** the detective's walk across the floor
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] the legs alternate: frames 1 and 5 lead with different legs
  - [ ] the head stays in the same spot in every cell (walking in place)

```text
Use case: identity-preserve.
Asset type: transparent walk-cycle sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use it as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: An adult woman detective about thirty-five: medium olive skin, dark wavy chin-length bob with a side part, alert eyebrows, warm determined face; open knee-length tan trench coat, muted deep-teal turtleneck, charcoal trousers, dark-brown ankle boots, small brass badge on the belt, brown crossbody satchel at one hip, small cream evidence notebook.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell. The eight figures form ONE looping walk cycle, read left to right along row 1 and then row 2.
Motion: walking toward the right in the reference's three-quarter front view, IN PLACE as on a treadmill: the head and torso stay at the same horizontal spot in every cell and never travel across the cell; the whole body bobs up and down by at most 2 art pixels. She keeps the small cream notebook in the hand that holds it in the listening pose, close to her waist, so that arm swings only a little; the satchel hangs at her hip and sways slightly; the coat hem flaps a little with each step.
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

### F2 · Detective (player) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/detective-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/detective-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/detective-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/detective-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: An adult woman detective about thirty-five: medium olive skin, dark wavy chin-length bob with a side part, alert eyebrows, warm determined face; open knee-length tan trench coat, muted deep-teal turtleneck, charcoal trousers, dark-brown ankle boots, small brass badge on the belt, brown crossbody satchel at one hip, small cream evidence notebook.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Marta (worker-01)

### F3 · Marta (worker-01) walk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/worker-01-walk.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-01-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-01-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-01-thinking.png`
- **Unlocks:** a drawn walk when this worker escapes through the exit door
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] the legs alternate: frames 1 and 5 lead with different legs
  - [ ] the head stays in the same spot in every cell (walking in place)

```text
Use case: identity-preserve.
Asset type: transparent walk-cycle sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use it as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A woman about sixty: pale freckled skin, short silver-gray hair under an orange hard hat, round face with smile lines, short stocky build, teal-blue boiler suit, brown safety boots.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell. The eight figures form ONE looping walk cycle, read left to right along row 1 and then row 2.
Motion: walking toward the right in the reference's three-quarter front view, IN PLACE as on a treadmill: the head and torso stay at the same horizontal spot in every cell and never travel across the cell; the whole body bobs up and down by at most 2 art pixels. Her hands are empty and her arms swing naturally.
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

### F4 · Marta (worker-01) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/worker-01-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-01-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-01-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-01-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A woman about sixty: pale freckled skin, short silver-gray hair under an orange hard hat, round face with smile lines, short stocky build, teal-blue boiler suit, brown safety boots.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Ama (worker-02)

### F5 · Ama (worker-02) walk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/worker-02-walk.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-02-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-02-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-02-thinking.png`
- **Unlocks:** a drawn walk when this worker escapes through the exit door
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] the legs alternate: frames 1 and 5 lead with different legs
  - [ ] the head stays in the same spot in every cell (walking in place)

```text
Use case: identity-preserve.
Asset type: transparent walk-cycle sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use it as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A woman about thirty-five: deep dark-brown skin, very short tightly curled black hair under a white hard hat, tall broad-shouldered sturdy build, lime high-visibility vest over charcoal work clothes, light protective gloves, black boots.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell. The eight figures form ONE looping walk cycle, read left to right along row 1 and then row 2.
Motion: walking toward the right in the reference's three-quarter front view, IN PLACE as on a treadmill: the head and torso stay at the same horizontal spot in every cell and never travel across the cell; the whole body bobs up and down by at most 2 art pixels. Her gloved hands are empty and her arms swing naturally.
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

### F6 · Ama (worker-02) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/worker-02-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-02-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-02-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-02-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A woman about thirty-five: deep dark-brown skin, very short tightly curled black hair under a white hard hat, tall broad-shouldered sturdy build, lime high-visibility vest over charcoal work clothes, light protective gloves, black boots.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Vera (worker-03)

### F7 · Vera (worker-03) walk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/worker-03-walk.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-03-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-03-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-03-thinking.png`
- **Unlocks:** a drawn walk when this worker escapes through the exit door
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] the legs alternate: frames 1 and 5 lead with different legs
  - [ ] the head stays in the same spot in every cell (walking in place)

```text
Use case: identity-preserve.
Asset type: transparent walk-cycle sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use it as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A woman about twenty-five: warm medium-tan skin, dark maroon cropped pixie with shaved sides, rounded cheeks, short curvy build, safety goggles resting on her forehead, burgundy mechanic coveralls with gray reinforced knees, black boots.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell. The eight figures form ONE looping walk cycle, read left to right along row 1 and then row 2.
Motion: walking toward the right in the reference's three-quarter front view, IN PLACE as on a treadmill: the head and torso stay at the same horizontal spot in every cell and never travel across the cell; the whole body bobs up and down by at most 2 art pixels. Her hands are empty and her arms swing naturally.
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

### F8 · Vera (worker-03) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/worker-03-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-03-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-03-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-03-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A woman about twenty-five: warm medium-tan skin, dark maroon cropped pixie with shaved sides, rounded cheeks, short curvy build, safety goggles resting on her forehead, burgundy mechanic coveralls with gray reinforced knees, black boots.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Theo (worker-04)

### F9 · Theo (worker-04) walk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/worker-04-walk.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-04-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-04-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-04-thinking.png`
- **Unlocks:** a drawn walk when this worker escapes through the exit door
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] the legs alternate: frames 1 and 5 lead with different legs
  - [ ] the head stays in the same spot in every cell (walking in place)

```text
Use case: identity-preserve.
Asset type: transparent walk-cycle sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use it as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A man about twenty-five: fair skin, shaved head, narrow long face, tall lanky build, bulky gray ear defenders, pale blue industrial smock over navy trousers, gray boots, clean shaven.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell. The eight figures form ONE looping walk cycle, read left to right along row 1 and then row 2.
Motion: walking toward the right in the reference's three-quarter front view, IN PLACE as on a treadmill: the head and torso stay at the same horizontal spot in every cell and never travel across the cell; the whole body bobs up and down by at most 2 art pixels. His hands are empty and his long arms swing naturally.
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

### F10 · Theo (worker-04) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/worker-04-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-04-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-04-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-04-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A man about twenty-five: fair skin, shaved head, narrow long face, tall lanky build, bulky gray ear defenders, pale blue industrial smock over navy trousers, gray boots, clean shaven.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Bruno (worker-05)

### F11 · Bruno (worker-05) walk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/worker-05-walk.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-05-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-05-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-05-thinking.png`
- **Unlocks:** a drawn walk when this worker escapes through the exit door
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] the legs alternate: frames 1 and 5 lead with different legs
  - [ ] the head stays in the same spot in every cell (walking in place)

```text
Use case: identity-preserve.
Asset type: transparent walk-cycle sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use it as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A man about forty-five: deep warm-brown skin, dark hair under a yellow hard hat, thick black moustache, broad square face, broad heavyset build, cream welding jacket with a brown leather apron, charcoal trousers, heavy boots.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell. The eight figures form ONE looping walk cycle, read left to right along row 1 and then row 2.
Motion: walking toward the right in the reference's three-quarter front view, IN PLACE as on a treadmill: the head and torso stay at the same horizontal spot in every cell and never travel across the cell; the whole body bobs up and down by at most 2 art pixels. His hands are empty and his arms swing naturally; the apron sways slightly.
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

### F12 · Bruno (worker-05) idle and talk · P3

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/worker-05-conversation.png`
- **Canvas:** 1536 x 1024, 4 x 2 cells of 384 x 512
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-05-listening.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-05-speaking.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/worker-05-thinking.png`
- **Unlocks:** breathing, blinking and talking frames instead of the code bob
- **Check before saving:**
  - [ ] 8 figures in a 4 x 2 grid, one per cell, none clipped
  - [ ] transparent background (no checkerboard baked in)
  - [ ] the same person, outfit and colours in every cell
  - [ ] row 1 is four near-identical standing frames (no head turns)
  - [ ] row 2 changes only the mouth and the gesturing hand

```text
Use case: identity-preserve.
Asset type: transparent idle and talking animation sprite sheet for the Arbiter factory mystery game (a small snow-globe factory).
Input images: the three attached PNGs show this exact character in their existing listening, speaking and thinking poses. Use them as the IDENTITY AND STYLE REFERENCE. Match the face, hair, skin tone, outfit, props, body proportions, colours and the chunky retro 2D pixel-art rendering exactly: enlarged expressive head, bold dark stepped outlines, simple pixel eyes, broad flat clustered shading, compact adult proportions about four heads tall. Do not redesign, restyle, slim down or make it realistic.
Character: A man about forty-five: deep warm-brown skin, dark hair under a yellow hard hat, thick black moustache, broad square face, broad heavyset build, cream welding jacket with a brown leather apron, charcoal trousers, heavy boots.
Composition: one landscape 1536x1024 canvas, EXACTLY 4 columns and 2 rows of equal 384x512 cells, eight separate full-body figures of the SAME character. Every figure is the same size, about 400 pixels tall, with the head and torso horizontally centred in its cell and the feet on one shared ground line 40 pixels above the bottom of each cell. The same three-quarter front view facing slightly right as the reference in every cell.
Row 1, IDLE, loops 1-2-3-4: the reference LISTENING pose, standing still. 1 neutral. 2 breathing in: shoulders and chest raised by one art pixel. 3 neutral, identical to 1. 4 blink: eyes closed, everything else identical to 1. The head does not turn, the hands and props do not move, the feet never move.
Row 2, TALKING, loops 1-2-3-4: the reference SPEAKING pose. 1 mouth closed, gesturing hand lowered a little. 2 mouth open, gesturing hand in the open-palm gesture of the reference. 3 mouth half open, gesturing hand slightly higher and turned. 4 mouth open, gesturing hand as in 2. Only the mouth and the gesturing hand and forearm change; the head position, the body and the feet stay exactly in place.
Consistency: the same face, outfit, colours, outline weight and scale in all eight cells.
Constraints: genuine transparent alpha background. Every part of every figure, including hat, hair, hands, props and feet, entirely inside its own cell with clear transparent margin; nothing touches a neighbouring cell. No ground, no shadow, no motion lines, no dust, no glow, no magic effects, no coloured fringe, no checkerboard, no drawn grid lines, no text, numbers, labels or watermark.
```

## Factory floor

### F13 · Factory floor backdrop · P4 (optional)

- **Save as:** `/Users/williambrach/Developer/arbiter/assets/motion-v1/factory/factory-floor.png`
- **Canvas:** 1536 x 1024, opaque
- **Attach:**
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/source/props-atlas.png`
  - `/Users/williambrach/Developer/arbiter/assets/factory-sprites-v3/exports/characters/detective-listening.png`
- **Unlocks:** a painted floor and back wall under the existing props, like the department hall and the square (today the floor is flat gray)


```text
Use case: stylized-concept.
Asset type: a single 2D game environment background plate for the Arbiter factory mystery game, landscape 1536x1024, fully opaque.
Input images: the attached prop sheet and character poses are a STYLE REFERENCE ONLY. Match their chunky retro 2D pixel-art rendering: bold dark stepped outlines, broad flat clustered shading, desaturated teal machinery colours, charcoal steel, brass and safety-yellow accents, warm muted light.
Scene: the empty production floor of Brightwell Snow Globe Works, a small, slightly cosy factory in the last minutes of the day shift.
Layout contract (exact, in image pixels):
- Back wall across the full width from y=0 down to a straight horizontal wall base at y=210: plastered and painted lower wall, a row of tall factory windows with late-afternoon light, a few overhead pipes and cable trays, a high wall shelf with a row of small snow globes, and one large round wall clock near the centre with tick marks and hands but no numerals.
- From y=210 to the bottom edge: an open, smooth concrete floor seen from an elevated three-quarter front view with shallow perspective, faint painted safety-yellow walkway lines, a few subtle stains. Keep the floor flat, quiet and EMPTY so sprites read clearly.
- Nothing stands on the floor or against the wall base: no machines, no conveyor, no doors, no lockers, no crates, no benches, no robots, no barriers. Those are separate sprites placed on top of this plate.
Camera: fixed elevated three-quarter front view for a 2D adventure game, shallow perspective, nearly parallel verticals, no vanishing-point drama, no ceiling-to-floor fisheye.
Constraints: environment only. No people, no characters, no animals, no UI, no text, no lettering, no numerals, no logos, no watermark, no drawn grid or collision marks. Full opaque image, no transparency.
```
