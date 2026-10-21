# Original Banana Mystery artwork

Generated with the built-in image_gen tool for this demo. These are newly generated assets, not reused Pokémon sprites. The transparent PNG source files are preserved unchanged.

- `monkeys.png`: Momo (coral scarf), Pip (blue overalls), Nori (round glasses), investigator (green hat), with four facing directions. Actual output: 1254 × 1254 RGBA. Used for portraits and navigation icons. Animated characters use the separate atlases below.
- `monkey-idle.png`: Momo, Pip, and Nori, with neutral, blink, and two gesture poses each. Original 1448 × 1086 RGBA output, generated with built-in imagegen. [Full generation prompt](monkey-idle.prompt.txt). Idle loops have different timing; approaching a monkey triggers a brief gesture. Runtime origins keep feet planted, while reduced motion and blocking dialogs show the neutral pose.
- `detective-walk.png`: matching investigator, four directions and four walking poses per direction. Original 1254 × 1254 RGBA output, generated with built-in imagegen. The full generation prompt is in [detective-walk.prompt.txt](detective-walk.prompt.txt). Runtime frame origins align the feet and head without changing the image. Steps follow distance traveled and return to a standing pose when stopped; reduced motion disables stepping.
- `jungle-props.png`: banana palm, picnic basket, blank noticeboard, and bell. Actual output: 1254 × 1254 RGBA. The ground, paths, blanket and labels are drawn in game code.

## Character atlas prompt

```text
Use case: stylized-concept
Asset type: original pixel-art game character sprite atlas, genuinely transparent background.
Primary request: Four friendly original monkey characters for a short detective game about stolen picnic bananas. Create ONE exact 4-column by 4-row sprite sheet, 1024 x 1024 pixels. Each cell is exactly 256 x 256, no gutters or visible grid. One full-body monkey in each cell. All sprites at consistent scale, centered at x=128 in their cell, feet baseline y=224, art contained in x=36..220 and y=32..224. Large transparent padding around each character, no ground shadows.
Columns left to right (same identity all four rows): Momo, cinnamon-brown monkey with a coral red neck bandana, confident tuft; Pip, golden-brown monkey with teal-blue short overalls, round ears; Nori, dark cocoa monkey with round pale-gold glasses and a small lavender vest; the investigator, tan monkey with sage-green explorer hat and cream safari shirt.
Rows top to bottom: front facing down toward viewer; back facing up away; left facing left; right facing right. Each row must show exactly these directions for all four columns. Full body and long curled monkey tail on every character.
Style: charming hand-placed chunky pixel art for an original 16-bit handheld RPG, crisp stepped edges, limited warm palette, expressive readable faces, simple three-tone shading, no outlines thinner than logical pixels. Each character should look like a 32 x 32 pixel sprite enlarged 8x with nearest-neighbor. Not smooth illustration. No antialiasing. No existing game characters, no Pokémon assets, no text, no labels, no ground, no scenery. Match body proportions and accessory colors across directions. True alpha transparency.
```

## Jungle props prompt

```text
Use case: stylized-concept
Asset type: original pixel-art tropical game prop atlas, genuine alpha transparency.
Primary request: ONE exact 2-column by 2-row grid sprite sheet, square 1024 x 1024. Each cell exactly 512 x 512, no visible grid, no gutters, each object centered within its own cell with at least 48 px transparent padding. Four full isolated overhead 3/4 view objects for a friendly monkey detective RPG in a jungle picnic clearing.
Top left: lush compact banana palm tree, broad layered green leaves, short brown trunk with a small cluster of golden bananas, visible trunk base at bottom.
Top right: open round woven picnic basket with a few bright golden bananas poking out, readable top-down 3/4 silhouette.
Bottom left: small rustic wood noticeboard on two short posts, blank cream paper pinned to board, no letters, a tiny yellow banana emblem at top.
Bottom right: small golden picnic bell hanging in a simple dark wooden arch, rope, little wooden base, readable silhouette.
Style: original warm 16-bit handheld RPG pixel art, chunky crisp square pixels, palette of forest greens, golden yellow, chestnut wood and cream. Each prop looks like a 64 x 64 pixel sprite enlarged 8x with nearest-neighbor. Simple three-tone shading, no gradients, no antialiasing. No text, no labels, no people, no characters, no background, no tile floor, no existing game artwork. Preserve alpha transparency.
```
