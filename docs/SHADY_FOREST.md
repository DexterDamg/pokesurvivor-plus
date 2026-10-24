# The Shady Forest, rebuilt

The Shady Forest (Bosque Umbrío) is where every run starts. This overhaul rebuilds it as one
natural, navigable woodland: a continuous forest floor, regions that blend into each other, a
great lake, undergrowth that follows habitat, and Legendary and Mythical Pokémon that are part of
the forest instead of boss events.

## Why the ground showed lines

The game paints the ground from 32 px tiles. The floor tiles come in several slightly different
shades, so the tile grid shows through while you move. Dirt patches are whole tiles, which gives
them blocky, stair-stepped edges. A separate "flowers" tile layer scatters little sparkle crosses
everywhere.

In the Shady Forest none of this is used any more (`34-forest.js`). The ground is painted per
512 px chunk from continuous noise fields at the game's own pixel scale, so:

- there is no tile grid and nothing repeats per tile;
- neighbouring chunks overlap by one world pixel, so no hairline seams appear at any zoom or
  window size;
- edges between surfaces (grass, soil, moss, mud, shore) break up into clumps instead of
  straight or dotted lines;
- the sparkle layer is gone.

The other areas keep the game's own ground.

## The plan

Every world is laid out from its seed, in a fixed order: the water, the routes and the reserved
places come first, the trees and plants after. The same seed always gives the same forest.

| What | Where |
|---|---|
| **Outer woodland** | around the start: mixed broadleaf and conifers, grasses, small shrubs |
| **Ancient groves** | old oaks, gnarled trees, rare ancient giants as landmarks, ferns and moss stones |
| **Wetwood lowlands** | around the lake and ponds: softer trees, ferns, bracken, mud hollows, reeds |
| **Deep forest** | far from the start: dark firs and pines, heavy shade, fungi (a few glow) |
| **Clearings** | sunlit openings with grasses and the only wildflowers in the forest |
| **The great lake** | far from the mansion: irregular shore, muddy banks, pebbles, reeds, lilies, shallows and deep water |
| **A stream and ponds** | a stream winds away from the lake; a few secluded ponds |
| **Paths** | natural trails from the start toward the lake and some clearings |
| **Mystery sites** | reserved before any tree grows, kept apart from each other, the start, the water and the mansion |

Regions blend: there are no hard borders between them, only gradual changes in palette, tree
species and undergrowth. The forest floor is darker than before, shaded more heavily under the
canopy, with leaf litter under the trees.

## Trees

Trees grow on a jittered grid: one possible tree per cell, at a random spot in the cell. That
gives an even, natural spacing with no straight rows and no walls of trunks, and there is always a
way through. Cell size and density follow the region (closer in groves and the deep forest, wider
in the wetwood, none in clearings). Trees never grow in water, on paths or in mystery sites.
Species follow the region; size still follows how much room a tree has, from saplings to the rare
ancient giant.

## Undergrowth

Each chunk is sampled at a few dozen jittered points, and what grows there depends on the habitat:

- **at the water**: reeds standing in the margins, lily pads on calm shallows, reeds, grasses and
  moss stones on the banks
- **in the shade**: ferns, bracken, moss stones, ivy, fallen branches, leaf litter, mushrooms,
  saplings and dark shrubs
- **in the wetwood**: ferns, mud, fungi on rotting wood, reeds
- **in clearings**: grasses and a few wildflowers (anemones, bluebells)
- **outer woodland**: grasses, ferns, small shrubs, a little litter

Density varies across the forest, so some places are lush and others bare. Nothing grows inside
a trunk or a log.

**Things have weight:** fallen logs, stumps, moss stones, the shrine and the ridge are solid. You
can't walk through them; you slide along them.

**No floor traps:** the forest no longer hides poison, grass or fire traps in its floor.

## Water

The lake has shallow margins and deep water. Water is drawn in depth bands with a pale lip at the
edge, then a muddy bank with pebbles.

- **Deep water** can't be entered by the player. It's checked after every movement, so speed,
  diagonal movement, dashes and knockback can't get you in; you slide along the shore. If you end
  up in it anyway (a teleport), you're put on the nearest shore.
- **Shallows** slow you down, as the game's water always has.

### Pokémon in the water

What a Pokémon can do in water depends on how it moves, not on its type:

| Class | Who | Water |
|---|---|---|
| fly | winged and floating Pokémon (Pidgey, Gastly…) | cross it without touching it |
| swim | fish and true swimmers (Magikarp, Goldeen…) | water is home; they don't leave it |
| amphibious | swimmers that also walk (Squirtle, Psyduck…) | anywhere |
| surface | Surskit | skates across it |
| walk | everyone else | shallows only |

Wild Pokémon never appear in water they couldn't be in (a walker is moved to the shore, a fish
into the water, or the spawn doesn't happen). A wandering Pokémon never picks a spot in deep water
as a destination, and one held back at the shore for a moment goes somewhere else instead of
pushing at it.

### A living surface

- **Reflections:** trees and Pokémon standing by the water are mirrored in it, along with the sky
  colour and, on clear nights, the moon. The reflection is drawn at half resolution into a single
  buffer, masked to the water and laid down in wavering strips (stronger with wind and rain).
- **Shimmer:** slow glints of light drift across the surface.
- **Rain:** raindrops ripple every pond, the lake and the stream.
- **Mist** gathers over the water and the wet lowlands at dawn and in fog.
- **Sound:** water laps at the shore.

## Atmosphere

- **Canopy shade:** the light map is darkened under dense trees, so groves and the deep forest are
  dim even at noon, and clearings stay sunlit.
- **Fireflies** drift over the wetwood, clearings and two of the sanctuaries on dry nights, each
  one a tiny light.
- Weather keeps working as before (rain, fog, storms, wind). The game's own weather and terrain
  events (type boosts such as Misty Terrain, their banners and the HUD pill) stay switched off.

## Quiet wilds

Wild and NPC Pokémon keep their HP, but no health bars float over them. Wild evolutions, shinies,
event Pokémon arriving and similar banners still happen, just without an announcement. Your own
messages, such as your evolution, still show.

## Forest Mysteries (`82-mysteries.js`)

The forest's Legendary and Mythical Pokémon are not spawns and not boss events. Each has a place,
a rumour, clues you can find there, and conditions under which you might glimpse it. Pressing
toward one ends the sighting. Nothing ever starts a legendary fight on its own.

| | Place | When | What happens |
|---|---|---|---|
| **Darkrai** | the Hollow of Unending Night: grey ground, withered saplings | night | the world darkens as you near it; a shadow rises out of the dark and dissolves if you rush it. Once you've found its three clues and seen it, it waits for you, and walking up to it starts the fight |
| **Celebi** | the Evergold Sanctuary: a golden clearing with a mossy shrine and wildflowers | day, no fighting nearby, after staying a while | something small circles the shrine, chimes and vanishes in a flash. No hostile Pokémon appear in the sanctuary, and any that wander in turn back |
| **Raikou** | the Thunder Ridge | night thunderstorms | in a lightning flash a silhouette stands on the ridge; by the next strike it's gone |
| **Suicune** | the Clear Pool | fog, or misty dawns | something stands on the water and walks away across it into the mist |
| **Entei** | the Scorched Clearing: burnt paw prints, warm glowing stones, drifting embers | rarely | a roar shakes the trees; a great beast watches from across the clearing, then is gone in a gust of heat |
| **Spectrier** | the Forgotten Path: a narrow dark trail with an old marker | night, only on the path | a horse at the path's end turns its head, looks at you and gallops off without a sound, leaving a violet trail. It never fights |
| **Shaymin** | the Gratitude Meadow | sunny days | peeks out of the flowers, then burrows away |
| **Cresselia** | the Moonlit Refuge: a small pool and moon-facing bluebells | clear nights with a bright moon | glides over the pool trailing moonlight, then rises into the sky |
| **Virizion** | the Emerald Glade | daytime | stands in the glade, then leaps away |
| **Zarude** | the Vine Hollow: knotted vines, ivy, a berry pantry | rarely | only heard and half-seen: the canopy shakes in a line overhead, vines creak, a call |

Zarude has no sprite in the game, so it is never seen clearly and is never confirmed: it stays a
mystery on purpose.

### The journal

Press **J** (or use the button in **F7**) to open **Forest Mysteries — Legendary Sightings
Journal** (J, Esc or a tap to close; the mouse wheel or arrow keys scroll). Entries appear only once you've discovered something:

- **Rumour:** you came near the place, or found a clue
- **Clues n/m:** what you found, in your own words
- **Sighted:** what you saw
- **Confirmed:** with every clue found and a sighting, the Pokémon's name is revealed
- **Confirmed · faced:** Darkrai, after the fight

Each entry notes roughly where the place was in your last journey (the forest is different every
run). New entries show a short notice once. Nothing is spoiled: unknown mysteries are only
counted, never named. The journal is kept between runs in the browser.

The game keeps running while the journal is open.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `forestWorld` | on | the rebuilt Shady Forest (off: the game's own forest floor and water) |
| `mysteries` | on | the Forest Mysteries |
| `enemyBars` | off | health bars over wild Pokémon |
| `announce` | off | banners for wild events (evolutions, shinies, arrivals) |
| `forestTraps` | off | the game's hidden floor traps in the Shady Forest |
| `treeDensity` | 1 | how many trees grow |

### Console helpers

```js
PSXAI.Forest.plan()                  // the lake, ponds, stream, paths, clearings and sites
PSXAI.Forest.water(x, y)             // { e: px inside the water (negative outside), deep, kind }
PSXAI.Forest.locomotion(dex)         // 'fly' | 'swim' | 'amphi' | 'surface' | 'walk'
PSXAI.Mysteries.run.sites            // where each mystery is this run
PSXAI.Mysteries.toggle()             // open / close the journal
PSXAI.Mysteries.resetJournal()       // forget everything
```

## Performance

- Ground chunks are painted once and cached (at most 64; the least recently used are dropped).
  One chunk just outside the view is painted ahead of time whenever nothing else needs painting,
  so walking into new ground doesn't wait for it.
- The fields behind a chunk are sampled every 16 px and interpolated, not computed per pixel.
- Reflections use one half-resolution buffer and one mask pass per frame, and only when water is
  on screen.
- Canopy shade is a tiny image (one pixel per 64 px of forest) stretched over the light map.
- Mystery sites are only checked when you're near them; sightings are a handful of sprites.

Scenario tests cover the floor (no tile painting, chunked), the plan across seeds, tree spacing,
undergrowth habitats, deep water from every direction and through knockback, Pokémon locomotion,
the water effects and frame rate, the journal, Darkrai, Raikou, Spectrier and the sanctuary.

## What's not here

- Mystery texts are in English only; the rest of the interface keeps its languages.
- On touch screens the journal opens from the settings panel (pause menu → Wild life → Mysteries journal).
- Fish only appear if the area's roster has them; the forest doesn't add new species.
