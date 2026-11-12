#!/usr/bin/env python3
"""Repaint Ottavio (wizard-*) from the matching inventor-* frames: silver hair, no spectacles,
long silver beard, ivory robe, burgundy mantle. Frame size and alpha stay as in the source.
Usage: python3 -I art/renaissance/wizard_repaint.py [--check]"""
import colorsys, math, os, random, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'renaissance', 'characters')
FRAMES = ['listening', 'speaking', 'thinking', 'idle-0', 'idle-1', 'idle-2', 'idle-3', 'talk-0']
# beard geometry in the listening frame (132 x 188); other frames are shifted by head alignment
CHIN = (74, 34)
SKIN = (196, 140, 104)
SILVER = (214, 210, 200)


def load(name):
    from PIL import Image
    return Image.open(os.path.join(ROOT, name + '.png')).convert('RGBA')


def head_shift(img, ref):
    """Integer (dx, dy) that best aligns img's head (rows 0..70) with ref's."""
    best, arg = None, (0, 0)
    a, b = img.load(), ref.load()
    for dy in range(-6, 7):
        for dx in range(-8, 9):
            err = 0
            for y in range(8, 60, 2):
                for x in range(40, 100, 2):
                    p, q = a[x, y], b[x - dx, y - dy] if 0 <= x - dx < 132 and 0 <= y - dy < 188 else (0, 0, 0, 0)
                    err += abs(p[0] - q[0]) + abs(p[1] - q[1]) + abs(p[2] - q[2])
            if best is None or err < best:
                best, arg = err, (dx, dy)
    return arg


def is_skin(r, g, b):
    return r > 150 and b > 0.42 * r and g > 0.55 * r and r - b < 130


def silver(v, lift=0.0):
    t = max(0.3, min(1.08, 0.38 + v * 0.8 + lift))
    return (min(255, int(SILVER[0] * t)), min(255, int(SILVER[1] * t)), min(255, int(SILVER[2] * t)))


def smooth(x, lo, hi):
    t = max(0.0, min(1.0, (x - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


def lerp(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))


# robe: source lightness (0.35 dark fold .. 0.85 lit cloth) maps to warm grey-beige shadow .. ivory highlight
ROBE_SHADOW, ROBE_MID, ROBE_LIGHT = (134, 114, 96), (212, 199, 172), (246, 240, 220)
BEARD_TONES = [(244, 241, 232), (218, 214, 204), (178, 174, 168), (134, 130, 128)]
OUTLINE = (58, 44, 40)
EYE = (70, 44, 34)


def robe_colour(v):
    t = smooth(v, 0.34, 0.88)
    return lerp(ROBE_SHADOW, ROBE_MID, t / 0.5) if t < 0.5 else lerp(ROBE_MID, ROBE_LIGHT, (t - 0.5) / 0.5)


def inpaint(px, cells, solid):
    """Fill cells from neighbouring solid skin pixels, ring by ring, so no dark remnant survives."""
    todo = set(cells)
    got = {c: px[c][:3] for c in solid}
    for _ in range(12):
        if not todo:
            break
        new = {}
        for (x, y) in todo:
            near = [got[(x + i, y + j)] for i in (-1, 0, 1) for j in (-1, 0, 1) if (x + i, y + j) in got]
            if near:
                new[(x, y)] = tuple(sum(c[k] for c in near) // len(near) for k in range(3))
        for c, col in new.items():
            got[c] = col
            todo.discard(c)
            px[c] = col + (px[c][3],)


def repaint(src, ref, shift):
    dx, dy = shift
    out = src.copy()
    px = out.load()
    rnd = random.Random(7)
    W, H = out.size
    zone = []
    solid = []
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            xs, ys = x - dx, y - dy  # coordinates in the listening frame
            hair = ys < 42 and not is_skin(r, g, b) and (xs < (68 if ys < 28 else 65) or ys < 18 or (xs >= 80 and ys < 31))
            if hair:
                px[x, y] = silver(v) + (a,)
            elif 68 <= xs <= 84 and 18 <= ys <= 29:
                zone.append((x, y))
            elif 52 <= ys < 150:  # ochre tunic family -> ivory, one soft hue/saturation map so folds survive
                w = smooth(s, 0.58, 0.67) * smooth(0.44 - b / max(r, 1), 0, 0.07) * smooth(v, 0.3, 0.42) * (1 - smooth(h * 360, 36, 46))
                if w > 0:
                    col = lerp((r, g, b), robe_colour(v), w)
                    px[x, y] = tuple(int(c) for c in col) + (a,)
    # spectacles: every non-skin pixel in the eye zone is refilled from the skin around it, then eyes and brows are redrawn
    for c in zone:
        r, g, b, a = px[c]
        if a >= 8 and is_skin(r, g, b) and r > 175 and colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)[2] > 0.6:
            solid.append(c)
    ring = [(x, y) for x in range(66 + dx, 87 + dx) for y in range(16 + dy, 32 + dy) if (x, y) not in set(zone) and 0 <= x < W and px[x, y][3] >= 8 and is_skin(*px[x, y][:3]) and px[x, y][0] > 150]
    inpaint(px, [c for c in zone if c not in set(solid)], solid + ring)
    for (ex, ey) in [(74, 24), (75, 24), (80, 24), (81, 24)]:
        px[ex + dx, ey + dy] = EYE + (255,)
    for ex in list(range(72, 77)) + list(range(78, 83)):
        px[ex + dx, 21 + dy] = silver(0.55, 0.05) + (255,)
    # long beard: moustache, jaw, then a tapering strand-shaded fall to a point on the chest
    cx, cy = CHIN[0] + dx, CHIN[1] + dy
    length = 44
    mask = {}
    for k in range(-2, length):
        if k < 0:
            lo, hi = -1.0, 5.0 - abs(k + 1)  # moustache
        elif k < 3:
            lo, hi = -8.0, -0.5  # jaw only, mouth stays open to the right
        else:
            t = (k - 3) / (length - 3)
            hw = 9.5 * (1 - t ** 1.8) ** 0.55
            lo, hi = -hw - 0.5, hw - 1.0 + (3.0 if k < 14 else 0.0)
        for x in range(int(cx + lo) - 1, int(cx + hi) + 2):
            d = x - cx
            if lo <= d <= hi and 0 <= x < W and px[x, cy + k][3] >= 8:
                mask[(x, cy + k)] = (d, k, lo, hi)
    for (x, y), (d, k, lo, hi) in mask.items():
        nb = [(x + i, y + j) in mask for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1))]
        a = px[x, y][3]
        if not all(nb) and k > 2 or (k >= 0 and not (nb[0] and nb[1] and nb[3]) and k > 2):
            px[x, y] = OUTLINE + (a,)
            continue
        mid = (lo + hi) / 2
        span = max(1.0, (hi - lo) / 2)
        light = 0.45 + 0.4 * (1 - abs(d - mid) / span)  # lit core, darker flanks
        light -= 0.18 * max(0, (d - mid) / span)  # light from the left
        strand = math.sin((d - mid) * 1.55 + 0.9 * math.sin(k * 0.22 + d * 0.3)) * 0.22
        light += strand + (0.06 if k < 0 else 0) - k * 0.004 + rnd.uniform(-0.07, 0.07)
        idx = 0 if light > 0.72 else 1 if light > 0.5 else 2 if light > 0.3 else 3
        px[x, y] = BEARD_TONES[idx] + (a,)
    return out


def build():
    ref = load('inventor-listening')
    for f in FRAMES:
        src = load('inventor-' + f)
        out = repaint(src, ref, head_shift(src, ref))
        out.save(os.path.join(ROOT, 'wizard-' + f + '.png'))


def mean_diff(a, b):
    pa, pb = a.load(), b.load()
    tot = n = 0
    for y in range(70):  # head crop; only pixels where either figure is drawn
        for x in range(a.size[0]):
            if pa[x, y][3] < 8 and pb[x, y][3] < 8:
                continue
            tot += sum(abs(pa[x, y][c] - pb[x, y][c]) for c in range(3))
            n += 3
    return tot / n


def check():
    bad = 0
    for f in FRAMES:
        d = mean_diff(load('wizard-' + f), load('inventor-' + f))
        print(f, round(d, 1))
        bad += d <= 25
    return 0 if not bad else 1


if __name__ == '__main__':
    if '--check' in sys.argv:
        sys.exit(check())
    build()
    sys.exit(check())
