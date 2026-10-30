# Wizard tower artwork

The tower scene uses four PNGs in this folder. Every file may be any pixel size; the client measures the frames from the image itself.

| File | Layout |
| --- | --- |
| `apprentices.png` | 4x4. Columns: wren, basil, juniper, inspector. Rows: down, up, left, right. |
| `apprentice-idle.png` | 4 poses (neutral, blink, gesture start, gesture) by 3 rows (wren, basil, juniper). |
| `inspector-walk.png` | 4x4. Rows: down, up, left, right. Columns: the four steps of the walk. |
| `tower-props.png` | 2x2. Top row: bookshelf, potion cabinet. Bottom row: noticeboard, bell. |

Each `*.prompt.txt` file beside this one gives the generation order, the reference images to attach and the path to save the result to. Follow those files; this page only describes what the client expects.

The committed files were generated in interactive Codex from those prompts on 2026-10-29: `apprentices.png`, `inspector-walk.png` and `tower-props.png` are 1254 × 1254, `apprentice-idle.png` is 1448 × 1086, all RGBA. Their pixels are used unchanged.

## How the client uses them

- **Frames:** each cell is cut at the real transparent gutter nearest the even split (the 4×4 sheets have fractional 313.5 px cells and some gutters sit off that line), then trimmed to its sprite. The anchor is the head's centre and the lowest opaque row, so feet stay planted.
- **Scale:** one scale per sheet, so the cast keeps its drawn proportions. Juniper, the tallest with her hat, is 47 px on the map and the inspector 45 px. `heights` in `client/worlds.ts` sets both.
- **Walk:** `inspector-walk.png` was corrected on 2026-10-29 using the built-in image generator. The front and back strides alternate boots, and the side rows have distinct leg silhouettes. The tower uses the PNG directly, and the stride fix was removed from the code, so no runtime splice seam is introduced. The correction prompt is saved as `inspector-walk-fix.prompt.txt`.
- **Portraits:** row 0 of `apprentices.png` (Wren, Basil, Juniper) supplies the nav, interview, suspect and case-board faces.

## Replacing a file

Frames are measured automatically from the transparent gaps in the PNG, so no coordinates need editing. Overwrite the PNG and reload the page.

## When a file is missing

If a PNG is missing or cannot be decoded, the client draws a code-made placeholder with the same layout in its place, so the tower is playable before any art exists. Each file falls back on its own. The placeholder is used until a good file is present and the page is reloaded.
