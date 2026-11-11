"""Cut the renaissance sprite sheets into game assets and draw the placeholder backdrop.

Run from demos/override:
  python3 -I art/renaissance/cut.py --src /Users/williambrach/Developer/arbiter/assets/renaissance-characters-v1
Optional real art: --wizard SHEET --apothecary SHEET --backdrop PNG; --characters-only re-cuts the cast alone
"""
import argparse, math, os, random


def _need_pillow():
    """Import Pillow and numpy lazily so the module imports with the standard library only."""
    global Image, ImageChops, ImageDraw, ImageFilter, np
    try:
        from PIL import Image, ImageChops, ImageDraw, ImageFilter
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
}
THINKING = (0, 2)
SCOUT_WALK = [(1, 0), (1, 1), (1, 2), (1, 3)]
SHEET_FILES = {"inventor": "inventor.png", "noble": "court-noble.png",
               "guard": "city-guard.png", "scout": "hooded-scout.png"}
# the wizard reuses the inventor frames, the apothecary the noble frames
TALK["wizard"] = TALK["inventor"]
TALK["apothecary"] = TALK["noble"]

# Registration: every frame is shifted so its head column and its feet line sit where they are in
# the character's first idle frame, then cut at that anchor with these margins (sheet pixels).
# Without it the figures jump between frames: the generator drew each cell a few pixels apart.
# LEFT == RIGHT puts the head column at the frame's centre: Phaser mirrors a flipped image inside
# its frame, so the figure turns on the spot.
LEFT, RIGHT, TOP, BOTTOM = 110, 110, 308, 5
OUT_W, OUT_H = 132, 188  # 0.6 of the window; the anchor lands at (66, 185)
SEARCH = 60  # widest horizontal shift tried, sheet pixels


def cell_of(sheet, row, col):
    """One grid cell as its own image: a crop window past its edge reads transparent, never a neighbour."""
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


def registered(cell, anchor, shift, fix=None):
    """The cell moved by shift and cut around anchor, recoloured by fix, at game size."""
    (ax, ay), (dx, dy) = anchor, shift
    c = cell.crop((ax - dx - LEFT, ay - dy - TOP, ax - dx + RIGHT, ay - dy + BOTTOM))
    if fix:
        c = fix(c)
    return c.resize((OUT_W, OUT_H), Image.LANCZOS)


def recolour(sheet, lo, hi, fn, vmin=0, head=0.0, skin=False):
    """Apply fn(h, s, v) on pixels with hue in [lo,hi] degrees, sat >= 0.3, value >= vmin.
    head: fraction of the alpha bounding box (from the top) left untouched.
    skin: also leave skin-like pixels (hue 8-32, sat 0.25-0.65, value 0.30-0.85) alone."""
    a = sheet.getchannel("A")
    hsv = sheet.convert("RGB").convert("HSV")
    h, s, v = hsv.split()

    def band(ch, l, u, k=255):
        return ch.point(lambda x: 255 if l * k <= x <= u * k else 0)
    mask = ImageChops.multiply(band(h, lo / 360, hi / 360), band(s, 0.3, 1))
    mask = ImageChops.multiply(mask, band(v, vmin, 1))
    if skin:
        sk = ImageChops.multiply(ImageChops.multiply(band(h, 8 / 360, 26 / 360), band(s, 0.25, 0.60)), band(v, 0.40, 0.85))
        sk = sk.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))  # close pinholes
        mask = ImageChops.subtract(mask, sk)
    box = a.point(lambda x: 255 if x > 8 else 0).getbbox()
    if head and box:
        cut = box[1] + int((box[3] - box[1]) * head)
        ImageDraw.Draw(mask).rectangle((0, 0, sheet.width, cut), fill=0)
    h2, s2, v2 = fn(h, s, v)
    h = Image.composite(h2, h, mask)
    s = Image.composite(s2, s, mask)
    v = Image.composite(v2, v, mask)
    out = Image.merge("HSV", (h, s, v)).convert("RGB")
    out.putalpha(a)
    return out


def ivory(h, s, v):
    return h, s.point(lambda x: int(0.14 * 255)), v.point(lambda x: min(235, int(x * 0.95 + 60)))


def sage(h, s, v):
    return h.point(lambda x: int(95 * 255 / 360)), s.point(lambda x: int(x * 0.7)), v


def load(path):
    return Image.open(path).convert("RGBA")


def save(img, *parts):
    p = os.path.join(OUT, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p)


def characters(src, wizard, apothecary):
    sheets = {k: load(os.path.join(src, f)) for k, f in SHEET_FILES.items()}
    fixes = {}
    if wizard:
        sheets["wizard"] = load(wizard)
    else:
        sheets["wizard"] = sheets["inventor"]
        fixes["wizard"] = lambda c: recolour(c, 14, 60, ivory, 0.45, head=0.26, skin=True)
    if apothecary:
        sheets["apothecary"] = load(apothecary)
    else:
        sheets["apothecary"] = sheets["noble"]
        fixes["apothecary"] = lambda c: recolour(c, 270, 350, sage)
    for name, sheet in sheets.items():
        used = IDLE + TALK[name] + [THINKING] + (SCOUT_WALK if name == "scout" else [])
        cells = {rc: cell_of(sheet, *rc) for rc in used}
        shift = offsets(cells)
        anchor = head_column(np.asarray(cells[IDLE[0]]).astype(np.float32))
        frame = lambda rc: registered(cells[rc], anchor, shift[rc], fixes.get(name))
        for i, rc in enumerate(IDLE):
            save(frame(rc), "characters", f"{name}-idle-{i}.png")
        for i, rc in enumerate(TALK[name]):
            save(frame(rc), "characters", f"{name}-talk-{i}.png")
        save(frame(IDLE[0]), "characters", f"{name}-listening.png")
        save(frame(TALK[name][0]), "characters", f"{name}-speaking.png")
        save(frame(THINKING), "characters", f"{name}-thinking.png")
        if name == "scout":
            for i, rc in enumerate(SCOUT_WALK):
                save(frame(rc), "characters", f"scout-walk-{i}.png")


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


def backdrop():
    W, H = 1536, 1024
    rnd = random.Random(7)
    im = Image.new("RGB", (W, H), (176, 150, 112))
    d = ImageDraw.Draw(im)
    # cobblestones y 330..1024: quiet texture
    d.rectangle((0, 330, W, H), fill=(178, 152, 114))
    y = 330
    row = 0
    while y < H:
        h = 22 + (y - 330) // 40
        x = -(row % 2) * 30
        while x < W:
            w = 40 + rnd.randint(0, 22) + (y - 330) // 30
            t = rnd.randint(-7, 7)
            d.rounded_rectangle((x + 1, y + 1, x + w - 1, y + h - 1), 5, fill=(178 + t, 152 + t, 114 + t), outline=(160, 135, 100))
            x += w
        y += h
        row += 1
    # warm light wash from upper left
    wash = Image.new("L", (W, H))
    wd = ImageDraw.Draw(wash)
    for i in range(0, 120):
        wd.rectangle((0, 330 + i * 6, W, 336 + i * 6), fill=min(60, i // 2))
    im = Image.composite(Image.new("RGB", (W, H), (120, 95, 70)), im, wash.point(lambda v: v // 2))
    d = ImageDraw.Draw(im)

    def facade(x0, x1, base, roof, trim):
        d.rectangle((x0, 40, x1, 330), fill=base, outline=trim, width=3)
        d.polygon([(x0 - 12, 56), (x1 + 12, 56), (x1 + 4, 20), (x0 - 4, 20)], fill=roof, outline=(90, 45, 30))
        for i in range(x0 - 8, x1 + 8, 14):
            d.line((i, 22, i + 6, 54), fill=(150, 80, 55))
        d.line((x0, 300, x1, 300), fill=trim, width=2)

    def window(x, y, w=26, h=44):
        d.rounded_rectangle((x, y, x + w, y + h), 4, fill=(60, 48, 40), outline=(110, 85, 60), width=3)
        d.line((x + w // 2, y, x + w // 2, y + h), fill=(110, 85, 60), width=2)

    def door(x0, x1, top=222):
        d.rectangle((x0, top, x1, 330), fill=(52, 36, 28), outline=(95, 70, 50), width=3)
        d.rectangle((x0 + 4, 322, x1 - 4, 330), fill=(40, 28, 22))
    # continuous row of facades: filler houses and shopfronts between the landmark buildings
    d.rectangle((0, 24, W, 330), fill=(168, 140, 104))
    fillers = [(0, 100, (190, 156, 112), (146, 70, 48), "shop"), (260, 350, (200, 168, 122), (156, 76, 50), "house"),
               (510, 590, (186, 152, 108), (140, 68, 46), "shop"), (950, 1090, (204, 172, 126), (158, 78, 52), "house"),
               (1090, 1200, (184, 150, 108), (138, 66, 44), "shop"), (1380, 1536, (196, 162, 116), (150, 72, 48), "house")]
    for i, (x0, x1, base, roof, kind) in enumerate(fillers):
        top = 70 + (i % 3) * 14
        d.rectangle((x0, top, x1, 330), fill=base, outline=(124, 96, 68), width=2)
        d.polygon([(x0 - 4, top + 8), (x1 + 4, top + 8), (x1 - 4, top - 16), (x0 + 4, top - 16)], fill=roof, outline=(90, 45, 30))
        d.line((x0, top + 8, x1, top + 8), fill=(110, 56, 38), width=3)  # eave shadow
        for yy in range(top - 12, top + 6, 6):
            d.line((x0 + 6, yy, x1 - 6, yy), fill=tuple(c - 14 for c in roof))
        for wx in range(x0 + 14, x1 - 36, 44):
            window(wx, top + 40, 22, 38)
            d.rectangle((wx - 3, top + 78, wx + 25, top + 84), fill=(150, 126, 96))  # stone sill
        if kind == "shop":
            d.rectangle((x0 + 12, 226, x1 - 12, 330), fill=(58, 42, 32), outline=(98, 72, 50), width=3)
            for k in range(x0 + 12, x1 - 12, 14):
                d.polygon([(k, 214), (k + 14, 214), (k + 14, 232), (k, 232)], fill=((150, 52, 48) if (k // 14) % 2 else (226, 206, 168)))
            d.rectangle((x0 + 12, 232, x1 - 12, 238), fill=(70, 40, 30))
        else:
            door(x0 + (x1 - x0) // 2 - 18, x0 + (x1 - x0) // 2 + 18, 252)
            d.rectangle((x0 + (x1 - x0) // 2 - 24, 326, x0 + (x1 - x0) // 2 + 24, 330), fill=(150, 126, 96))
    d.rectangle((1380, 296, 1536, 330), fill=(150, 130, 108), outline=(112, 96, 80), width=2)  # low wall
    for xx in range(1384, 1536, 26):
        d.line((xx, 296, xx, 330), fill=(122, 104, 86))
    # apothecary: x 100..260, door 120..240
    facade(100, 260, (206, 170, 120), (160, 78, 52), (130, 100, 70))
    for x in (110, 220):
        window(x, 90)
        d.rectangle((x - 6, 90, x - 1, 134), fill=(82, 128, 84))
        d.rectangle((x + 27, 90, x + 32, 134), fill=(82, 128, 84))
    door(120, 240, 210)
    for x in range(135, 225, 16):
        d.line((x, 200, x, 214), fill=(90, 130, 70), width=3)  # herb bundles
    # clockmaker: x 350..510, door 380..480
    facade(350, 510, (196, 160, 112), (150, 72, 48), (120, 92, 64))
    d.ellipse((410, 80, 450, 120), fill=(228, 214, 170), outline=(150, 110, 50), width=4)
    d.line((430, 100, 430, 87), fill=(60, 40, 30), width=2)
    d.line((430, 100, 441, 104), fill=(60, 40, 30), width=2)
    window(364, 150, 22, 36)
    window(474, 150, 22, 36)
    door(380, 480, 230)
    # palazzo: x 590..950 with arches 600..940
    facade(590, 950, (214, 182, 134), (168, 84, 56), (140, 108, 78))
    for i in range(6):
        ax = 600 + i * 57
        d.rectangle((ax, 210, ax + 50, 330), fill=(64, 52, 56))
        d.pieslice((ax, 186, ax + 50, 236), 180, 360, fill=(64, 52, 56))
        d.arc((ax, 186, ax + 50, 236), 180, 360, fill=(120, 92, 66), width=3)
    for x in range(620, 930, 52):
        window(x, 90, 24, 40)
    d.line((640, 325, 900, 308), fill=(95, 70, 50), width=2)  # sundial line on the steps
    d.line((770, 308, 770, 328), fill=(95, 70, 50), width=2)
    for s in range(3):
        d.rectangle((596 + s * 8, 322 + s * 2, 944 - s * 8, 330), outline=(150, 125, 95))
    # gateway: x 1220..1360
    d.rectangle((1200, 70, 1380, 330), fill=(166, 148, 128), outline=(110, 96, 82), width=3)
    d.rectangle((1220, 150, 1360, 330), fill=(40, 34, 38))
    d.pieslice((1220, 110, 1360, 190), 180, 360, fill=(40, 34, 38))
    d.arc((1220, 110, 1360, 190), 180, 360, fill=(120, 106, 90), width=5)
    for x in range(1210, 1370, 20):
        d.rectangle((x, 70, x + 10, 90), fill=(140, 124, 106))
    d.rectangle((1200, 322, 1380, 330), fill=(120, 106, 90))
    # well x 40..200, y 520..700 (dry stone)
    d.ellipse((40, 640, 200, 700), fill=(120, 106, 92))
    d.rectangle((40, 560, 200, 670), fill=(150, 136, 118), outline=(95, 84, 72), width=3)
    d.ellipse((40, 520, 200, 600), fill=(110, 98, 84), outline=(90, 80, 68), width=3)
    d.ellipse((68, 536, 172, 584), fill=(30, 26, 26))
    for yy in range(572, 668, 24):
        off = (yy // 24 % 2) * 14
        for xx in range(40 - off, 196, 34):
            d.rectangle((max(41, xx), yy, min(199, xx + 30), yy + 20), outline=(100, 90, 78))
    # bench and two crates x 1300..1500, y 560..740
    d.rectangle((1300, 600, 1500, 622), fill=(130, 88, 52), outline=(70, 44, 26), width=2)
    d.rectangle((1308, 622, 1318, 680), fill=(96, 64, 38))
    d.rectangle((1482, 622, 1492, 680), fill=(96, 64, 38))
    d.rectangle((1300, 560, 1500, 590), fill=(122, 82, 48), outline=(70, 44, 26), width=2)
    for (x0, y0, x1, y1) in ((1310, 690, 1390, 740), (1410, 676, 1490, 740)):
        d.rectangle((x0, y0, x1, y1), fill=(146, 104, 62), outline=(76, 50, 30), width=3)
        d.line((x0, y0, x1, y1), fill=(100, 68, 40), width=2)
        d.line((x0, y1, x1, y0), fill=(100, 68, 40), width=2)
    # depth: lintel shadows over the landmark doors, stone sills, planters on the ground edge
    for (x0, x1, top) in ((120, 240, 210), (380, 480, 230)):
        d.rectangle((x0 - 6, top - 8, x1 + 6, top), fill=(128, 104, 76), outline=(96, 76, 56))
        d.rectangle((x0, top, x1, top + 10), fill=(34, 24, 20))
        d.rectangle((x0 - 8, 326, x1 + 8, 332), fill=(150, 126, 96))
    for px in (100, 254, 350, 500, 1190, 1380):
        d.rectangle((px, 314, px + 22, 334), fill=(140, 80, 52), outline=(84, 46, 30))
        d.ellipse((px - 2, 300, px + 24, 318), fill=(86, 124, 70))
    # darker band where facades meet the cobbles
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(band)
    for k in range(26):
        bd.rectangle((0, 318 + k, W, 319 + k), fill=(50, 34, 22, int(70 * (1 - abs(k - 12) / 14))))
    im = Image.alpha_composite(im.convert("RGBA"), band).convert("RGB")
    d = ImageDraw.Draw(im)
    # soft shadows under objects
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for box in ((36, 690, 210, 712), (1300, 735, 1500, 745), (100, 326, 260, 340), (350, 326, 510, 340), (590, 326, 950, 342)):
        sd.ellipse(box, fill=(40, 25, 15, 60))
    sh = sh.filter(ImageFilter.GaussianBlur(6))
    im = Image.alpha_composite(im.convert("RGBA"), sh).convert("RGB")
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--wizard")
    ap.add_argument("--apothecary")
    ap.add_argument("--backdrop")
    ap.add_argument("--characters-only", action="store_true", help="leave the square and the prop icons as they are")
    a = ap.parse_args()
    _need_pillow()
    characters(a.src, a.wizard, a.apothecary)
    if a.characters_only:
        return
    bd = Image.open(a.backdrop).convert("RGB").resize((1536, 1024), Image.LANCZOS) if a.backdrop else backdrop()
    save(bd, "town-square.png")
    save(icon_scroll(), "props", "scroll.png")
    save(icon_seal(), "props", "seal.png")
    save(icon_quill(), "props", "quill.png")


if __name__ == "__main__":
    main()
