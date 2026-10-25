# The Tropical Ocean's art (Level 3)

Made from the pictures DexterDamg supplied (kept as sent in `src/`) by `tools/ocean_art.py`, which
also writes the collision grids and sprite rects to `js/ai/34-ocean-art.js`. Run it again after
changing anything here:

```
python3 tools/ocean_art.py /tmp
```

| File | What it is | Made from |
|---|---|---|
| `harbor.webp` | the harbour town with its pier, lighthouse and ferry, drawn at its own size; the sea is cut out (the game draws its own living sea beneath) | `src/harbor_town.webp` |
| `birth.png` | Birth Island as on the Game Boy Advance, drawn at twice its pixels; the sea is cut out and the triangle removed (the game moves its own) | `src/birth_island.png` |
| `triangle.png` | the Deoxys triangle, taken from Birth Island | `src/birth_island.png` |
| `props.png` | palms, pink blossom trees, red crystal and grey rocks, rafflesia, a shrine, tiki posts, a thatched hut; cut from the tileset column, background and drawn shadows removed, JPEG noise reduced to a small palette | `src/guardian_island_tiles.jpg` |
| `boats.png` | the red, blue and yellow boats | `src/boats.png` |
| `zone.webp` | the level's banner in the menu (a crop of the harbour) | `src/harbor_town.webp` |

`src/tropical_route.webp` was supplied but isn't used.

The collision grids have 8 px cells: water, walkable (grass, paving, sand, pier planks; Birth
Island's grass, bare rock, stairs and pier) and solid (everything else: buildings, cliffs, trees,
rocks, posts).
