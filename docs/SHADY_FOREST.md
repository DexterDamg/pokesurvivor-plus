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
- **Music:** the forest plays *Viridian Forest* (Pokémon FireRed and LeafGreen) instead of the
  level's own track, looped at your music volume. Bosses, rifts and the Judgment still bring their
  own music in, and the haunted mansion has its own (`97-music.js`, setting `forestMusic`).
- Weather keeps working as before (rain, fog, storms, wind). The game's own weather and terrain
  events (type boosts such as Misty Terrain, their banners and the HUD pill) stay switched off.

## The journey to the mansion (`84-journey.js`)

The Haunted Mansion is the Shady Forest's end stage and the only way to complete it.

- **For the first 20 minutes of active play there is no mansion and no path.** Time inside story
  scenes and the house doesn't count.
- **Then it is placed once:** ahead of the party, on ground nobody has seen yet (the area is
  regenerated cleanly around it), far enough away that you never see it appear, with a clear dirt
  path leading to its gates. Its location never changes after that; saving and resuming keeps it.
- **The forest points the way, wherever you wander:** old unlit lamp posts, lengths of broken
  fence, worn paving stones and leaning signs appear ahead of you, out of sight, always toward the
  path.
- **The final stretch grows stranger:** twisted dark trees, dead saplings and grave-pale stones,
  thicker fog, fewer ordinary Pokémon and more Ghosts, faint sounds (a music box, a door, a
  laugh), silhouettes between the trees, footprints that lead nowhere.
- The game's own 20-minute finale waits until the mansion's story is done.
- **Co-op:** the host decides when and where it is placed and shares it; everyone gets the same
  mansion and path.

## The old well (`86-well.js`)

Some runs (about three in five), an old stone well stands somewhere in the forest: mossy stones, a
rotten little roof, a rope that ends in nothing, a bucket on its side in the weeds. It's placed out
of sight and never announced; finding it is worth a little EXP.

- Up close the air goes still and a cold mist breathes out of the shaft. At night something drips
  far, far down, now and then something whispers, and once in a while two red points look up.
- **Stand at the rim** for a moment to look down. If you have 10 coins, you toss one in, and it hits
  water much later than it should. Then, sometimes the bucket comes up with a held item, sometimes
  you feel a little wiser (EXP), sometimes nothing, and sometimes something climbs out of the dark,
  giggling (more often at night).
- It's solid, and stays where it is for the rest of the run.

## Wildlife that lives by its biology (`63-wildlife.js`)

Fewer Pokémon, living where they belong, doing what they do. *No forest full of randomly walking
Pokémon.*

- **Smaller numbers:** lower caps for roaming Pokémon, a separate small budget for tree
  residents, and quiet stretches of forest where nothing spawns at all.
- **Nights belong to the night Pokémon.** After dark, day Pokémon and the ones that are about at
  any hour barely turn up at all; Hoothoot, Murkrow, Spinarak, Joltik, Gastly, Venonat, Oddish and
  Zubat come out instead.
- **Metapod, Kakuna, Silcoon and Cascoon never walk.** They live on trees, perfectly still, up on
  the trunk or in the canopy. They twitch now and then and Harden when something comes close or
  hits them. A loose one that turns up anywhere else goes to a tree, or doesn't appear.
- **Caterpie, Weedle and Wurmple** crawl to a tree, climb the trunk where you can see it, feed in
  the leaves, rest, and climb back down. They freeze and watch you when you come close (timid ones
  climb higher instead).
- **Birds perch in the canopy** and come down to forage; Spinarak hangs in its webs; Oddish
  nestles in the ground by day.
- **Residents belong to their tree:** which tree holds which Pokémon comes from the run's seed,
  so you find the same Pokémon in the same trees when you come back. They're never pulled ahead
  of you by the game's spawner, never float, and leave no shadow on the ground while up a tree.
- Watching wildlife go about its life is worth a little EXP (see below), the first time per
  species and habit.

## Events and the forest's history (`86-events.js`)

Now and then, ahead of the party and out of sight (never in a fight, never in the house, never
the same thing twice in a row, most of them once a run), something happens:

| | |
|---|---|
| **A lost Pokémon** | crying under a tree. Stay with it until it calms and its parent comes running to thank you (with something for your journey). Or walk on |
| **Strange tracks** | a trail of large prints that leads somewhere and stops at something buried |
| **Lights between the trees** | at night: Volbeat, or candle flames that giggle and go out |
| **A sudden silence** | the forest's sounds really stop; something passes, or doesn't |
| **A fallen tree** | it crashes down across the way. Go around, or a Fire-type player burns it clear |
| **Distant voices** | a call for help from nowhere, from the direction of the old house; walk toward it and it stops |
| **A campsite** | other explorers were here: a smouldering fire, a barrel, a note, supplies (lantern oil, a berry, coins) |

The forest also keeps its history where you can find it: **stone markers, symbols cut into
bark, broken signposts, overgrown statues and letters**. Stand at one for a moment to read it (a
short note appears above the bar). The fragments speak of the family who lived in the house, the
child, the clock, the mirror and the tall one, and some only make sense once you've been inside.

## EXP for more than fighting (`91-exp.js`)

Battles still pay as before; now discovery and kindness level you up too. Rewards are measured in
*a common wild Pokémon's worth at your level*, so they stay in proportion as you grow.

- **Exploring:** new ground reached on foot (never twice; standing still, walking in circles or
  being teleported earns nothing), distance milestones, each kind of place the first time (a
  sunlit clearing, an ancient grove, the wetwood, the deep forest, the lake shore), special
  places, the mansion's route and its door. Distance milestones and new kinds of place pay
  quietly, with just the small "+EXP" over you and no message.
- **Treasure:** chests by rarity (a big chest more than a small one), half again for a chest
  hidden off the beaten path; each chest pays once. (The chests' own EXP drop is unchanged.)
- **Pokémon:** befriending a wild Pokémon, sparing a beaten one, watching wildlife.
- **The world:** journal clues, sightings, confirmed mysteries, the old lanterns and fences on the
  way, forest events, the forest's history.
- **No farming:** past a rolling limit (about 40 battles' worth in 5 minutes) every reward shrinks
  to a quarter.

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
| **Raikou** | the Thunder Ridge | night thunderstorms | in a lightning flash a silhouette stands on the ridge; by the next strike it's gone (it can be earned: see below) |
| **Suicune** | the Clear Pool | fog, or misty dawns | something stands on the water and walks away across it into the mist (it can be earned: see below) |
| **Entei** | the Scorched Clearing: burnt paw prints, warm glowing stones, drifting embers | rarely | a roar shakes the trees; a great beast watches from across the clearing, then is gone in a gust of heat (it can be earned: see below) |
| **Spectrier** | the Forgotten Path: a narrow dark trail with an old marker | night, only on the path | a horse further along the path, toward its end, turns its head, looks at you and gallops off without a sound, leaving a violet trail. It never fights |
| **Shaymin** | the Gratitude Meadow | sunny days | peeks out of the flowers, then burrows away |
| **Cresselia** | the Moonlit Refuge: a small pool and moon-facing bluebells | clear nights with a bright moon | glides over the pool trailing moonlight, then rises into the sky |
| **Virizion** | the Emerald Glade | daytime | stands in the glade, then leaps away |
| **Zarude** | the Vine Hollow: knotted vines, ivy, a berry pantry | rarely | only heard and half-seen: the canopy shakes in a line overhead, vines creak, a call |

Zarude has no sprite in the game, so it is never seen clearly and is never confirmed: it stays a
mystery on purpose.

### Raikou, Suicune and Entei can be earned (`82-trio.js`)

The legendary beasts are the only Pokémon of the forest you can win. Beat one and it joins you:
choose it as your partner from the menu, like any Pokémon you own.

| | When | What happens |
|---|---|---|
| **Raikou** | a harsh thunderstorm, at night | its shadow appears near you in the lightning, gone by the next strike. The **fourth** time, the storm goes still, a bolt strikes right in front of you, and Raikou is standing in it. It has had its eye on you. *"Show me the spark in you — WE SHALL BATTLE!!"* |
| **Suicune** | daytime, in the thickest fog | its shadow drifts past in the white. The **fourth** time, the fog parts and Suicune walks out of it, straight up to you. *"Let us see whether your heart is as clear as the water. Face me!"* |
| **Entei** | daytime, clear weather (no rain, fog or storm), once **both** Raikou and Suicune are yours | by chance, it comes: the ground shakes, it lands in a burst of flame and challenges you. *"Burn bright — or burn out! COME!"* |

- During the scene you can't move and nothing can hurt you; the words come in the Legendary box.
- The battle is a real boss fight. Lose, run, or take too long, and it leaves to wait for the next
  time the weather is right (the shadows you've seen are kept, so it shows itself again then).
- How many shadows you've seen is kept between runs; each one is written in its journal.
- Light rain, a storm by day, thin fog or fog at night don't count.

### The journal

The journal is a single page about a single mystery: the one you most recently learned something
about. It reads like someone's notes on a thing that shouldn't exist. It has no title, never names
what it's about, never says "legendary", and never shows that other pages exist.

- A mystery's notes start when you first come near its place or find one of its signs: the
  hearsay.
- Every sign you find adds a paragraph. A sighting adds what was seen (after a crossed-out false
  start). Once you've found every sign and seen it, a closing note is added, and Darkrai's notes
  get one more after the fight.
- The last line says roughly where the place was in your last journey, since the forest is
  different every run.
- When something new is written, a short notice says so, without saying what.
- What you've learned about every mystery is kept between runs; the page simply shows whichever
  one you learned about last.

**Reading:** press **J** (or use **📖 Journal** in F7, which also works from the pause menu on
touch screens). **↑ ↓** or the mouse wheel scroll; **J**, **Esc** or a tap closes it. The game
pauses while you read. In co-op it can't pause the world for everyone, so it stays an overlay.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `forestWorld` | on | the rebuilt Shady Forest (off: the game's own forest floor and water) |
| `mysteries` | on | the Forest Mysteries and the journal |
| `enemyBars` | off | health bars over wild Pokémon |
| `announce` | off | banners for wild events (evolutions, shinies, arrivals) |
| `forestTraps` | off | the game's hidden floor traps in the Shady Forest |
| `mansionAfter` | 1200 s | active forest time before the mansion is placed |
| `forestEvents` | on | the forest's events and its history |
| `exploreExp` | on | EXP for exploring, treasure and kindness |
| `forestMusic` | on | Viridian Forest instead of the level's own track |
| `maxNpcs` / `maxResidents` | 24 / 10 | roaming Pokémon / tree residents at once |
| `treeDensity` | 1 | how many trees grow |
| `legendTrio` | on | Raikou, Suicune and Entei can be earned |
| `enteiChance` | 0.12 | the chance, every 30 s of a clear day, that Entei comes (once the other two are yours) |
| `oldWell` / `wellChance` | on / 0.6 | the old well, and how often a run has one |

### Console helpers

```js
PSXAI.Forest.plan()                  // the lake, ponds, stream, paths, clearings and sites
PSXAI.Forest.water(x, y)             // { e: px inside the water (negative outside), deep, kind }
PSXAI.Forest.locomotion(dex)         // 'fly' | 'swim' | 'amphi' | 'surface' | 'walk'
PSXAI.Mysteries.run.sites            // where each mystery is this run
PSXAI.Mysteries.toggle()             // open / close the journal
PSXAI.Mysteries.resetJournal()       // forget everything written in them
PSXAI.Journey.establishNow()         // skip the 20 minutes: place the mansion now
PSXAI.Journey.st                     // phase, elapsed time, where it stands
PSXAI.Events.start('lost')           // lost | tracks | lights | silence | fallen | voices | campsite
PSXAI.Exp.st.log                     // what you were rewarded for, and how much
PSXAI.Trio.save                      // shadows seen and beasts won
PSXAI.Trio.startScene('raikou')      // play a beast's scene now (then its battle)
PSXAI.Well.st.well                   // where the old well stands this run, if it does
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
the water effects and frame rate, the journal (no names or titles, game paused), Darkrai, Raikou, Spectrier and the sanctuary.

## What's not here

- Mystery texts are in English only; the rest of the interface keeps its languages.
- Fish only appear if the area's roster has them; the forest doesn't add new species.
