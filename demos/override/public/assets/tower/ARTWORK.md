# Wizard tower artwork

The tower scene uses four PNGs in this folder. Every file may be any pixel size; the client measures the frames from the image itself.

| File | Layout |
| --- | --- |
| `apprentices.png` | 4x4. Columns: wren, basil, juniper, inspector. Rows: down, up, left, right. |
| `apprentice-idle.png` | 4 poses (neutral, blink, gesture start, gesture) by 3 rows (wren, basil, juniper). |
| `inspector-walk.png` | 4x4. Rows: down, up, left, right. Columns: the four steps of the walk. |
| `tower-props.png` | 2x2. Top row: bookshelf, potion cabinet. Bottom row: noticeboard, bell. |

Each `*.prompt.txt` file beside this one gives the generation order, the reference images to attach and the path to save the result to. Follow those files; this page only describes what the client expects.

## Replacing a file

Frames are measured automatically from the transparent gaps in the PNG, so no coordinates need editing. Overwrite the PNG and reload the page.

## When a file is missing

If a PNG is missing or cannot be decoded, the client draws a code-made placeholder with the same layout in its place, so the tower is playable before any art exists. Each file falls back on its own. The placeholder is used until a good file is present and the page is reloaded.
