#!/usr/bin/env python3
"""Builds the Tropical Ocean's art islands from the supplied sheets (assets/ocean/src):
keys out the sheets' own sea (the game draws its living ocean beneath), and writes a coarse
collision grid per island (0 water, 1 walkable, 2 solid) into js/ai/34-ocean-art.js."""
import json, sys
from PIL import Image

CELL = 8  # world px per grid cell

def lum(c): return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
def is_water(c):
    r, g, b = c[:3]
    return b > 150 and b > r + 60 and b > g + 30
WALK = [(150, 203, 125, 15), (213, 215, 217, 17), (200, 202, 204, 12), (239, 224, 190, 13),
        (198, 169, 124, 15), (170, 140, 101, 12)]   # grass, paving (2 tones), sand, pier planks (2 tones)
def is_walk(c):
    r, g, b = c[:3]
    for (R, G, B, k) in WALK:
        if abs(r - R) <= k and abs(g - G) <= k and abs(b - B) <= k: return True
    return False

BIRTH_WALK = [(112, 200, 160, 8), (136, 216, 184, 8), (160, 224, 192, 8), (64, 176, 136, 8),   # grass
              (144, 136, 136, 8), (168, 160, 152, 8), (120, 112, 112, 8), (184, 176, 160, 8), (104, 96, 104, 6), (80, 80, 80, 6),  # the bare rock top
              (120, 120, 128, 6), (240, 240, 248, 6), (200, 216, 232, 6), (144, 160, 176, 6), (168, 184, 200, 6),  # stairs
              (208, 192, 128, 8), (168, 144, 72, 8), (192, 168, 104, 8), (224, 216, 160, 8)]  # the pier

def build(name, src, crop=None, cell=CELL, walk=None, world=1, overrides=(), prep=None):
    """cell: grid cell size in source pixels; world: world px per source pixel"""
    global WALK
    walk0 = WALK
    if walk: WALK = walk
    im = Image.open(src).convert('RGBA')
    if crop: im = im.crop(crop)
    if prep: prep(im)
    px = im.load()
    W, H = im.size
    # key out the sea
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if is_water(c): px[x, y] = (0, 0, 0, 0)
    CELL = cell
    gw, gh = (W + CELL - 1) // CELL, (H + CELL - 1) // CELL
    grid = []
    for gy in range(gh):
        row = []
        for gx in range(gw):
            n = wat = walk = 0
            for y in range(gy * CELL, min(H, gy * CELL + CELL)):
                for x in range(gx * CELL, min(W, gx * CELL + CELL)):
                    c = px[x, y]; n += 1
                    if c[3] == 0: wat += 1
                    elif is_walk(c): walk += 1
            if wat > n * 0.5: row.append(0)
            elif walk >= (n - wat) * 0.6: row.append(1)
            else: row.append(2)
        grid.append(row)
    for (x0, y0, x1, y1, v) in overrides:
        for gy in range(max(0, y0 // CELL), min(gh, (y1 + CELL - 1) // CELL)):
            for gx in range(max(0, x0 // CELL), min(gw, (x1 + CELL - 1) // CELL)):
                grid[gy][gx] = v
    im.save('assets/ocean/%s.png' % name)
    # preview
    pv = im.copy()
    pp = pv.load()
    for gy in range(gh):
        for gx in range(gw):
            col = {0: (40, 90, 200, 120), 1: (0, 255, 0, 60), 2: (255, 0, 0, 110)}[grid[gy][gx]]
            for y in range(gy * CELL, min(H, gy * CELL + CELL)):
                for x in range(gx * CELL, min(W, gx * CELL + CELL)):
                    a = pp[x, y]
                    k = col[3] / 255
                    pp[x, y] = (int(a[0] * (1 - k) + col[0] * k), int(a[1] * (1 - k) + col[1] * k), int(a[2] * (1 - k) + col[2] * k), 255)
    pv.save(sys.argv[1] + '/preview_%s.png' % name)
    rle = []
    for row in grid:
        s, prev, run = '', row[0], 0
        for v in row + [None]:
            if v == prev: run += 1
            else: s += '%d%s' % (run, 'wls'[prev]); prev, run = v, 1
        rle.append(s)
    WALK = walk0
    return {'w': W * world, 'h': H * world, 'cell': CELL * world, 'gw': gw, 'gh': gh, 'rows': rle}



# ---------------------------------------------------------------- props cut from the guardian-island tileset
PROPS = {  # name: crop box in assets/ocean/src/guardian_island_tiles.jpg (incl. the drawn shadow)
    'palm_a': (8, 22, 50, 80), 'palm_b': (110, 22, 143, 80),
    'pink_a': (0, 459, 72, 528), 'pink_b': (78, 450, 142, 524),
    'rock_red': (86, 222, 116, 254), 'rock_grey': (116, 222, 143, 254),
    'rafflesia': (84, 262, 106, 281), 'shrine': (106, 316, 139, 350),
    'tiki_a': (92, 366, 110, 404), 'tiki_b': (122, 366, 141, 404), 'hut': (42, 368, 86, 446),
}
SOLID_GREY = {'rock_red', 'rock_grey', 'shrine', 'tiki_a', 'tiki_b', 'hut'}  # grey is part of these, not a shadow
def cut_prop(im, box, solid_grey=False):
    c = im.crop(box).convert('RGBA'); p = c.load()
    for y in range(c.height):
        for x in range(c.width):
            r, g, b, a = p[x, y]
            mx, mn = max(r, g, b), min(r, g, b)
            if mn > 222: p[x, y] = (0, 0, 0, 0)
            elif not solid_grey and mx - mn < 22 and mn > 150: p[x, y] = (0, 0, 0, 0)   # the drawn shadow
    # pale JPEG fringe next to the cut-out: gone
    for _ in range(2):
        kill = []
        for y in range(c.height):
            for x in range(c.width):
                r, g, b, a = p[x, y]
                if a == 255 and min(r, g, b) > 185:
                    if any(0 <= x + dx < c.width and 0 <= y + dy < c.height and p[x + dx, y + dy][3] < 255 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        kill.append((x, y))
        for (x, y) in kill: p[x, y] = (0, 0, 0, 0)
    # fewer colours: JPEG noise down to a pixel-art palette
    rgb = c.convert('RGB').quantize(colors=24, method=Image.Quantize.MEDIANCUT).convert('RGB')
    q = rgb.load()
    for y in range(c.height):
        for x in range(c.width):
            if p[x, y][3] == 255: p[x, y] = q[x, y] + (255,)
    return c

def build_props():
    im = Image.open('assets/ocean/src/guardian_island_tiles.jpg').convert('RGB')
    # (the sheet's drawn shadows are blocky and clipped by the crops: the game draws its own soft ones)
    cuts = {k: cut_prop(im, b, k in SOLID_GREY) for k, b in PROPS.items()}
    pa = cuts['pink_a'].load()  # (the stairs tile above it)
    for y in range(5):
        for x in range(33): pa[x, y] = (0, 0, 0, 0)
    W = sum(c.width + 2 for c in cuts.values()); H = max(c.height for c in cuts.values())
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    idx, x = {}, 0
    for k, c in cuts.items():
        sheet.alpha_composite(c, (x, 0)); idx[k] = [x, 0, c.width, c.height]; x += c.width + 2
    sheet.save('assets/ocean/props.png')
    return idx


TRI = (240, 192, 256, 208)  # the Deoxys triangle's tile on Birth Island
def birth_prep(im):
    # the triangle becomes a sprite the game moves around; its tile gets the bare rock beside it
    tri = im.crop(TRI); p = tri.load()
    for y in range(tri.height):
        for x in range(tri.width):
            if p[x, y][:3] not in ((32, 32, 32), (80, 80, 80), (136, 136, 136)): p[x, y] = (0, 0, 0, 0)
    tri.save('assets/ocean/triangle.png')
    im.paste(im.crop((TRI[0] - 16, TRI[1], TRI[2] - 16, TRI[3])), (TRI[0], TRI[1]))

if __name__ == '__main__':
    out = {}
    out['harbor'] = build('harbor', 'assets/ocean/src/harbor_town.webp')
    out['birth'] = build('birth', 'assets/ocean/src/birth_island.png', cell=4, walk=BIRTH_WALK, world=2, prep=birth_prep)
    # (the harbor is a big painting: lossy webp with alpha, ~280 KB instead of 2.5 MB)
    import os
    Image.open('assets/ocean/harbor.png').save('assets/ocean/harbor.webp', 'WEBP', quality=88, method=6)
    os.remove('assets/ocean/harbor.png')
    # the level's banner in the menu (same size as the game's own zone banners)
    Image.open('assets/ocean/src/harbor_town.webp').convert('RGB').crop((260, 720, 1360, 1218)).save('assets/ocean/zone.webp', 'WEBP', quality=86, method=6)
    props = build_props()
    Image.open('assets/ocean/src/boats.png').convert('RGBA').save('assets/ocean/boats.png')
    boats = {'red': [1, 1, 179, 82], 'blue': [1, 112, 179, 82], 'yellow': [1, 223, 179, 82]}
    with open('js/ai/34-ocean-art.js', 'w') as f:
        f.write('/* PokéSurvivor+ — Living World AI · the Tropical Ocean\'s art islands (generated by tools/ocean_art.py; do not edit)\n')
        f.write(' * Collision grids, run-length encoded per row: w water, l walkable land, s solid. Prop and boat sprite rects. */\n')
        f.write('window.PSXAI_OCEAN_ART = ' + json.dumps({'islands': out, 'props': props, 'boats': boats}, separators=(',', ':')) + ';\n')
    for k, v in out.items(): print(k, v['gw'], v['gh'], v['w'], v['h'])
