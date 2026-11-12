"""Cut the renaissance sprite sheets into game assets and copy the market-square backdrop.

Run from demos/override:
  python3 -I art/renaissance/cut.py --src /Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1 \
      --backdrop /Users/williambrach/Developer/arbiter/assets/renaissance-background-v1/market-square.png
--characters-only re-cuts the cast alone. Ottavio has his own conversation sheet (art request R2) and is cut alone:
  python3 -I art/renaissance/cut.py --wizard /Users/williambrach/Developer/arbiter/assets/motion-v1/renaissance/wizard-conversation.png
"""
import argparse, math, os, shutil


def _need_pillow():
    """Import Pillow and numpy lazily so the module imports with the standard library only."""
    global Image, ImageDraw, np
    try:
        from PIL import Image, ImageDraw
        import numpy as np
    except ModuleNotFoundError:
        raise SystemExit("cut.py needs Pillow and numpy: pip install Pillow numpy")

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "assets", "renaissance"))

# Frame map: (row, col), 0-indexed. Row 0 is the idle breathing loop, row 1 the walk (the scout
# only), row 2 the interaction. Row index 3 (suspicious action) and glowing frames are never used.
IDLE = [(0, 0), (0, 1), (0, 2), (0, 3)]
# Talk loops: the first frame is also the still speaking pose. Only pairs that differ by a gesture
# loop; the scout's map opens wide and the guard's other paper frames walk, so they hold one frame.
TALK = {
    "inventor": [(2, 0)],
    "noble": [(2, 2), (2, 1)],
    "guard": [(2, 3)],
    "scout": [(2, 1)],
    # The apothecary's row 3 is the vial, an object interaction, never speech: she talks in an idle stance.
    "apothecary": [(0, 1)],
}
THINKING = (0, 2)
SCOUT_WALK = [(1, 0), (1, 1), (1, 2), (1, 3)]
SHEET_FILES = {"inventor": "inventor.png", "noble": "court-noble.png",
               "guard": "city-guard.png", "scout": "hooded-scout.png", "apothecary": "apothecary.png"}

# The apothecary sheet (1254 x 1254) does not split into equal integer cells, so its cells are explicit
# source rectangles (x0, y0, x1, y1), each edge in the transparent gutter between two poses. Measured on
# the art (alpha > 8): columns 63..235, 384..559, 706..847, 1016..1163; rows 7..306, 323..615, 634..933,
# 949..1245. tests/renaissance-assets.test.mjs checks every pose stays inside its rectangle.
APOTHECARY_COLS = [(0, 310), (310, 632), (632, 940), (940, 1254)]
APOTHECARY_ROWS = [(0, 314), (314, 624), (624, 941), (941, 1254)]
RECTS = {"apothecary": {(r, c): (x0, y0, x1, y1) for r, (y0, y1) in enumerate(APOTHECARY_ROWS)
                        for c, (x0, x1) in enumerate(APOTHECARY_COLS)}}
# The apothecary's vial gesture, played once when she answers about her work: row 3 takes the amber vial
# out and inspects it (frames 0..3), row 4 hides it under her shawl (frames 4..7). Never a talk or idle loop.
APOTHECARY_VIAL = [(2, 0), (2, 1), (2, 2), (2, 3), (3, 0), (3, 1), (3, 2), (3, 3)]

# Registration: every frame is shifted so its head column and its feet line sit where they are in
# the character's first idle frame, then cut at that anchor with these margins (sheet pixels).
# Without it the figures jump between frames: the generator drew each cell a few pixels apart.
# LEFT == RIGHT puts the head column at the frame's centre: Phaser mirrors a flipped image inside
# its frame, so the figure turns on the spot.
LEFT, RIGHT, TOP, BOTTOM = 110, 110, 308, 5
OUT_W, OUT_H = 132, 188  # 0.6 of the window; the anchor lands at (66, 185)
SEARCH = 60  # widest horizontal shift tried, sheet pixels
ANCHOR = (66, 185)  # the foot point in every game frame (client/worlds.ts figures.anchor)

# Conversation sheets (art request R2, Ottavio): 1536 x 1024, 4 columns x 2 rows of 384 x 512 cells. Frames are
# numbered 1-8 left to right, then top to bottom: 1-4 idle (neutral, breath, neutral, blink), 5-6 talk (open palm
# and open mouth, then the hand lower and the mouth closed), 7-8 think (stroking the beard, eyes open, then closed).
CONV_CELL = (384, 512)
CONV_IDLE, CONV_TALK, CONV_THINK = [1, 2, 3, 4], [5, 6], [7, 8]
# The generator drew Ottavio on the same spot in every cell (feet line y 489, not the requested 472; shoes x
# 141..266; head column x 182), so all eight frames share one pivot measured on frame 1 and one scale; no frame is
# shifted or resized to its own box. 0.38 frame px per sheet px puts his hat top (y 26) at y 9 like the cast's heads
# and the staff top (y 14) at y 4. Nearest-neighbour keeps the painted pixels crisp.
CONV_SCALE = 0.38
CONV_DRIFT = 2  # largest feet-line or head-column difference from frame 1 a sheet may have, sheet pixels


def cell_of(sheet, row, col, rects=None):
    """One grid cell as its own image: a crop window past its edge reads transparent, never a neighbour.
    rects: explicit (x0, y0, x1, y1) source rectangles by (row, col); absent: the sheet split in four."""
    if rects:
        return sheet.crop(rects[(row, col)])
    xs = [round(i * sheet.width / 4) for i in range(5)]
    ys = [round(i * sheet.height / 4) for i in range(5)]
    return sheet.crop((xs[col], ys[row], xs[col + 1], ys[row + 1]))


def _alpha_box(a):
    """(x0, y0, x1, y1) of alpha > 8 in an HxWx4 array."""
    m = a[..., 3] > 8
    ys, xs = np.where(m.any(1))[0], np.where(m.any(0))[0]
    return xs[0], ys[0], xs[-1] + 1, ys[-1] + 1


def head_column(a):
    """Centre of the widest opaque run in each row of the top 22% of the figure, median over rows:
    a staff or a halberd beside the head does not pull it."""
    x0, y0, x1, y1 = _alpha_box(a)
    centres = []
    for row in a[y0:y0 + int((y1 - y0) * 0.22), :, 3] > 8:
        xs = np.where(row)[0]
        if len(xs):
            run = max(np.split(xs, np.where(np.diff(xs) > 1)[0] + 1), key=len)
            centres.append((run[0] + run[-1]) / 2)
    return int(round(float(np.median(centres)))), int(y1)


def _shifted(a, dx, dy):
    out = np.zeros_like(a)
    h, w = a.shape[:2]
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = a[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def _match(ref, img, band):
    """Head-band overlap of img against ref: shared opaque pixels of a similar colour, minus alpha mismatch."""
    ra, ia = ref[band, :, 3] / 255, img[band, :, 3] / 255
    colour = np.abs(ref[band, :, :3] - img[band, :, :3]).sum(-1) / 765
    return float((ra * ia * (1 - colour)).sum() - 0.5 * np.abs(ra - ia).sum())


def offsets(cells):
    """(dx, dy) per cell that puts its feet on the reference's feet line and its head over the reference's head."""
    h = max(v.height for v in cells.values())
    w = max(v.width for v in cells.values())
    # Cells differ by a pixel (1254 / 4); pad right and bottom so every array has one shape.
    arr = {k: np.pad(np.asarray(v.convert("RGBA")).astype(np.float32), ((0, h - v.height), (0, w - v.width), (0, 0))) for k, v in cells.items()}
    ref = arr[IDLE[0]]
    rx0, ry0, rx1, ry1 = _alpha_box(ref)
    band = slice(ry0, ry0 + int((ry1 - ry0) * 0.24))
    out = {}
    for k, a in arr.items():
        dy = int(ry1 - _alpha_box(a)[3])
        lifted = _shifted(a, 0, dy)
        out[k] = (max(range(-SEARCH, SEARCH + 1), key=lambda dx: _match(ref, _shifted(lifted, dx, 0), band)), dy)
    return out


def registered(cell, anchor, shift):
    """The cell moved by shift and cut around anchor, at game size."""
    (ax, ay), (dx, dy) = anchor, shift
    c = cell.crop((ax - dx - LEFT, ay - dy - TOP, ax - dx + RIGHT, ay - dy + BOTTOM))
    return c.resize((OUT_W, OUT_H), Image.LANCZOS)


def load(path):
    return Image.open(path).convert("RGBA")


def save(img, *parts):
    p = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p)


def characters(src):
    sheets = {k: load(os.path.join(src, f)) for k, f in SHEET_FILES.items()}
    for name, sheet in sheets.items():
        used = IDLE + TALK[name] + [THINKING] + (SCOUT_WALK if name == "scout" else []) + (APOTHECARY_VIAL if name == "apothecary" else [])
        cells = {rc: cell_of(sheet, *rc, RECTS.get(name)) for rc in used}
        shift = offsets(cells)
        anchor = head_column(np.asarray(cells[IDLE[0]]).astype(np.float32))
        frame = lambda rc: registered(cells[rc], anchor, shift[rc])
        for i, rc in enumerate(IDLE):
            save(frame(rc), "characters", f"{name}-idle-{i}.png")
        for i, rc in enumerate(TALK[name]):
            save(frame(rc), "characters", f"{name}-talk-{i}.png")
        save(frame(IDLE[0]), "characters", f"{name}-listening.png")
        save(frame(TALK[name][0]), "characters", f"{name}-speaking.png")
        save(frame(THINKING), "characters", f"{name}-thinking.png")
        if name == "apothecary":
            for i, rc in enumerate(APOTHECARY_VIAL):
                save(frame(rc), "characters", f"apothecary-vial-{i}.png")
        if name == "scout":
            for i, rc in enumerate(SCOUT_WALK):
                save(frame(rc), "characters", f"scout-walk-{i}.png")


def conversation_cell(sheet, n):
    """Frame n (1-based) of a conversation sheet as its own image, so a crop never reads a neighbouring cell."""
    w, h = CONV_CELL
    if sheet.size != (4 * w, 2 * h):
        raise SystemExit(f"a conversation sheet is {4 * w} x {2 * h}, this one is {sheet.width} x {sheet.height}")
    r, c = divmod(n - 1, 4)
    return sheet.crop((c * w, r * h, (c + 1) * w, (r + 1) * h))


def conversation_pivot(cell):
    """(head column, feet line) of one cell: the feet line is the row under the lowest solid pixel (alpha > 128)."""
    a = np.asarray(cell).astype(np.float32)
    feet = int(np.where((a[..., 3] > 128).any(1))[0][-1]) + 1
    return head_column(a)[0], feet


def conversation_frame(cell, pivot, scale):
    """The cell cut around pivot at one fixed scale, nearest-neighbour, the pivot landing on ANCHOR.
    Specks under alpha 9 (the generator's faint halo) are cleared, and nothing under alpha 0 keeps a colour."""
    (px, py), (ax, ay) = pivot, ANCHOR
    box = (px - ax / scale, py - ay / scale, px + (OUT_W - ax) / scale, py + (OUT_H - ay) / scale)
    if box[0] < 0 or box[1] < 0 or box[2] > cell.width or box[3] > cell.height:
        raise SystemExit(f"the frame window {tuple(round(v, 1) for v in box)} leaves the {cell.width} x {cell.height} cell")
    a = np.asarray(cell.resize((OUT_W, OUT_H), Image.NEAREST, box=box)).copy()
    a[a[..., 3] <= 8] = 0
    edge = np.concatenate([a[0, :, 3], a[:, 0, 3], a[:, -1, 3]])
    if (edge > 8).any():
        raise SystemExit("the figure touches the frame's top or side edge: lower CONV_SCALE")
    return Image.fromarray(a, "RGBA")


def conversation(name, path, scale, check=False):
    """Cut one conversation sheet into <name>-idle-0..3, -talk-0..1, -think-0..1 and the still poses
    (listening = frame 1, speaking = frame 5, thinking = frame 7). check: write nothing, and exit 1 unless every
    shipped file has exactly the pixels a fresh cut gives."""
    sheet = load(path)
    cells = {n: conversation_cell(sheet, n) for n in range(1, 9)}
    pivot = conversation_pivot(cells[1])
    for n, cell in cells.items():
        hx, feet = conversation_pivot(cell)
        if abs(hx - pivot[0]) > CONV_DRIFT or abs(feet - pivot[1]) > CONV_DRIFT:
            raise SystemExit(f"frame {n} stands at {(hx, feet)}, frame 1 at {pivot}: the sheet is not registered")
    files = {f"{name}-{kind}-{i}.png": n for kind, frames in (("idle", CONV_IDLE), ("talk", CONV_TALK), ("think", CONV_THINK))
             for i, n in enumerate(frames)}
    files.update({f"{name}-listening.png": CONV_IDLE[0], f"{name}-speaking.png": CONV_TALK[0], f"{name}-thinking.png": CONV_THINK[0]})
    stale = []
    for file, n in files.items():
        img = conversation_frame(cells[n], pivot, scale)
        if not check:
            save(img, "characters", file)
            continue
        shipped = os.path.join(OUT, "characters", file)
        if not os.path.exists(shipped) or not np.array_equal(np.asarray(load(shipped)), np.asarray(img)):
            stale.append(file)
    if stale:
        raise SystemExit(f"not a fresh cut of {path}: {', '.join(stale)}")
    print(f"{name}: {len(files)} frames {'match the sheet' if check else 'cut'}; pivot {pivot} in every cell, scale {scale}")


def icon_scroll():
    im = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((22, 14, 74, 82), 4, fill=(232, 215, 170, 255), outline=(90, 60, 30, 255), width=3)
    for y in (30, 42, 54, 66):
        d.line((32, y, 64, y), fill=(140, 100, 60, 255), width=2)
    for y in (12, 76):
        d.rounded_rectangle((16, y, 80, y + 10), 5, fill=(200, 160, 100, 255), outline=(90, 60, 30, 255), width=3)
    return im


def icon_seal():
    im = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pts = [(48 + (36 + 4 * (i % 2)) * math.cos(i * math.pi / 12), 48 + (36 + 4 * (i % 2)) * math.sin(i * math.pi / 12)) for i in range(24)]
    d.polygon(pts, fill=(140, 28, 36, 255), outline=(70, 10, 18, 255))
    d.ellipse((20, 20, 76, 76), outline=(190, 70, 70, 255), width=3)
    d.ellipse((34, 34, 62, 62), fill=(170, 45, 50, 255), outline=(70, 10, 18, 255), width=2)
    return im


def icon_quill():
    """A feather quill leaning into an inkpot. No text."""
    im = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    edge = (60, 36, 20, 255)
    d.polygon([(70, 8), (84, 14), (62, 56), (46, 66), (40, 62), (52, 46)], fill=(238, 228, 205, 255), outline=edge)
    d.line((46, 62, 74, 14), fill=(150, 110, 70, 255), width=2)
    d.polygon([(40, 62), (46, 66), (38, 78)], fill=(40, 26, 16, 255))
    d.rounded_rectangle((16, 62, 54, 88), 6, fill=(40, 34, 52, 255), outline=edge, width=3)
    d.rectangle((26, 56, 44, 64), fill=(70, 58, 90, 255), outline=edge, width=2)
    d.ellipse((22, 64, 34, 70), fill=(255, 255, 255, 70))
    return im



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="the cast's 4 x 4 character sheets (inventor, noble, guard, scout, apothecary)")
    ap.add_argument("--wizard", help="Ottavio's 1536 x 1024 conversation sheet (art request R2); cut alone")
    ap.add_argument("--backdrop", help="the painted market square, 1536 x 1024; copied byte for byte")
    ap.add_argument("--characters-only", action="store_true", help="leave the square and the prop icons as they are")
    ap.add_argument("--check", action="store_true", help="with --wizard alone: write nothing, exit 1 unless the shipped frames are a fresh cut")
    a = ap.parse_args()
    if not a.src and not a.wizard:
        raise SystemExit("give --src (the cast), --wizard (Ottavio) or both")
    if a.check and a.src:
        raise SystemExit("--check verifies the --wizard cut only; leave out --src")
    _need_pillow()
    if a.wizard:
        conversation("wizard", a.wizard, CONV_SCALE, check=a.check)
    if not a.src:
        return
    characters(a.src)
    if a.characters_only:
        return
    if not a.backdrop:
        raise SystemExit("--backdrop is required unless --characters-only")
    if Image.open(a.backdrop).size != (1536, 1024):
        raise SystemExit("the backdrop must be 1536 x 1024")
    shutil.copyfile(a.backdrop, os.path.join(OUT, "town-square.png"))
    save(icon_scroll(), "props", "scroll.png")
    save(icon_seal(), "props", "seal.png")
    save(icon_quill(), "props", "quill.png")


if __name__ == "__main__":
    main()
