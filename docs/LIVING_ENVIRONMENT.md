# Living Environment

The forest breathes now. Morning mist settles over the clearings while the
first Pidgey start chirping. By midday the sun is high, shadows shrink under the trees and the
bugs come out in force. In the evening the sky turns orange, then violet, the lanterns flicker
on and the Hoothoot wake up. At midnight the forest goes quiet and properly dark, broken
only by faint moonlight, crickets, and whatever light you bring: your lantern, or a Charmander's tail.

Rain darkens the grass, fills the hollows with puddles and turns the paths to mud if you keep
walking in circles. Fog can be a faint morning haze or a wall of white where you barely see
past your own feet, and then even the birds go quiet. A gale can send a startled Pidgey
tumbling across the sky. And somewhere deep in the starting woods there's an old trail that
nobody likes to talk about.

This builds on the [Living World AI](LIVING_WORLD_AI.md). Everything lives in `js/ai/` and can
be switched off in the settings panel (**F7**).

---

## Controls

| Input | What it does |
| --- | --- |
| **L** | Light or put out the lantern you carry. It hangs at your side and burns oil (shown under the clock once it's dark); chests, old campsites and grateful Pokémon give you more. |
| **F7** | Settings → *Environment*: day length, starting hour, season, weather frequency, light quality, ambient volume, and switches for each system. *World & encounters*: terrain, tree sizes, Pokémon sizes, attack warnings, earned bosses/rifts, hordes, weather duration, fog, lightning and flash strength. |

A small pill in the top-left corner shows the time of day, the sun or moon (with its phase) and
the current weather.

---

## Each area has its own Pokémon (`37-areas.js`)

The starting woodland (*Bosque Umbrío*) has a curated roster of beginner-friendly forest
dwellers instead of random picks:

| Run time | By day | By night |
| --- | --- | --- |
| start | Pidgey, Rattata, Sentret, Caterpie, Weedle, Wurmple, Zigzagoon, Ledyba, Starly | Hoothoot, Rattata, Oddish, Spinarak, Venonat, Kricketot |
| 1:10 | Metapod, Kakuna, Silcoon, Cascoon, Paras, Bellsprout, Nidoran, Shroomish, Budew, Combee, Spearow, *Pikachu (rare)* | + Zubat |
| 2:40 | Pidgeotto, Raticate, Furret, Butterfree, Beedrill, Beautifly, Linoone, Staravia, Ledian, Weepinbell, Teddiursa… | Noctowl, Ariados, Venomoth, Gloom, Murkrow, *Gastly (rare)* |
| 4:20 → | Breloom, Heracross, Pinsir, Ursaring, Staraptor, Victreebel, Vileplume, *Scyther (rare)*… | Haunter, Crobat, Honchkrow… |

- The game's own stat tiers still decide how strong a spawn is, so difficulty is unchanged. Only
  *who* shows up changes. Bosses become woodland "alphas" such as Furret, Victreebel, Pinsir,
  Staraptor and Yanmega, and hordes are made of the area's own Pokémon.
- Rare and powerful Pokémon stay rare, or stay away entirely. Finding them in later areas should
  feel meaningful.
- **Time of day, season and weather** decide who's out: night species at night, more bugs at
  midday and in spring, none in winter, ghosts in the fog. Far fewer Pokémon roam at night, in
  storms or in deep fog.
- **Habitats.** Rattata gather around fallen logs and burrows, Caterpie and Weedle in leafy
  bushes, Pidgey and Hoothoot in the trees, Paras by mushrooms, Sentret in open clearings.
- **Natural arrivals.** Pokémon arrive from beyond the edge of the screen near a fitting habitat,
  or visibly emerge: Pidgey flutter down from a branch, Caterpie wriggle out of a bush, Rattata
  pop out of a burrow, Oddish rise from the soil, others step out from behind a trunk.
- **Disturbance.** Linger next to a habitat, fight or knock Pokémon out around it, and it becomes
  disturbed for a few minutes. New Pokémon settle somewhere else.

## Day and night (`36-sky.js`, `94-light.js`)

- A full day lasts 10 minutes by default (configurable), and runs start in the early morning.
  The phases are dawn (mist, birds waking, night Pokémon slipping away), day (strongest sun,
  bugs everywhere, shade-seeking in the heat), evening (orange to purple skies, Pokémon heading
  home, Hoothoot waking) and night (dark, quiet, fewer Pokémon, harder to spot).
- **Daily rhythms.** Day Pokémon get drowsy at night and sleep in sheltered spots under trees, by
  logs and in bushes. Night Pokémon do the opposite, and at dawn the night crowd goes back into
  their trees and burrows.
- **Sleepers** breathe, twitch, shift and snore softly. They wake up, frightened or grumpy, if you
  run right past them or shine your lantern on them.
- **Nights are very dark, never black.** At midnight the scene sits at a fraction of daylight;
  under the trees it's darker still. You can tell it's night at a glance, and the light you carry
  matters. A *Night visibility* slider (accessibility) brightens nights for those who need it
  without making light sources pointless.
- **The moon** goes through 8 phases. On a clear night a bright moon makes the clearings stand out
  from the shadow of the canopy and sends the faintest pale shafts of moonlight through the leaves;
  a new moon leaves everything equally dark. **The moon is reflected in the water**: on the lake
  and ponds you see tonight's actual phase, a thin crescent, a half moon, gibbous or full, broken
  into wavering strips by the ripples (it's drawn after the night light, so it shines on the dark
  water like the real thing).
- **Seasons** follow the calendar by default and can be overridden. They bring spring blossoms and
  bugs, deep summer greens and midday heat, autumn gold and rust with falling leaves, and winter
  snow cover with frosted trees and hardly any bugs.

## Light and shadow (`93-ground.js`, `94-light.js`)

- A light map multiplies the colour of the hour over the scene: pink dawn, white midday, amber
  dusk, cool blue moonlight. Local lights are added into it: lamp posts, hanging lanterns that
  swing in the wind, glowing mushrooms, candles, lightning, the lantern you carry, and the Pokémon
  and moves that really give off light.
- **Only real light sources.** A Pokémon glows only for a reason, and the light sits on the part
  that glows: Charmander's tail flame (it flickers like a flame, harder when Charmander is
  nervous, and shrinks a little in the rain), Cyndaquil's back, Ponyta's mane, Litwick's wick,
  Chinchou's lures, Volbeat's tail, Ampharos's tail orb, Morelull's caps, Lumineon's fins, Rotom's
  plasma, Umbreon's rings (at night), Duskull's eye… Regirock's stone body doesn't glow, and
  neither does a Fire type without a flame (Vulpix). Electric Pokémon crackle with brief sparks
  when they're worked up. There is no automatic glow around you any more.
- **Moves light the world while they last**, each in its own way: Thunder Shock is a quick
  flash, Thunderbolt and Thunder light up where they strike, Discharge lights a wide circle around
  the user, Flamethrower is a stream of moving light, Will-o-Wisp's flames give a soft wavering
  glow, plus Ember, Fire Blast, Heat Wave, Flame Wheel, Spark, Thunder Punch, Dazzling Gleam,
  Flash Cannon and Aura Sphere. Your moves and wild Pokémon's moves alike.
- **Dynamic shadows.** Trees, bushes, rocks, decor and Pokémon cast shadows from the sun or moon.
  They turn and stretch through the day, sway with the wind, and fade under clouds and fog.
- **Cloud shadows** drift across the clearings, and sunbeams slant through the canopy (most of all
  at dawn, at dusk and in thin mist).
- **Ambient occlusion** darkens the ground under trunks, bushes, rocks and logs.

## Weather with consequences (`36-sky.js`, `39-decor.js`, `62-envbeh.js`)

The sky drifts between patterns (clear, fair, cloudy, drizzle, rain, storm, mist, fog, dense fog,
breezy, gale) through gradual transitions. The living sky is purely atmospheric: the game's own
weather and terrain events (type boosts such as Misty Terrain, their banners and the HUD pill) are
switched off (setting `gameWeather` turns them back on).

- **Weather is consistent and logical.** It moves on about once a minute (setting
  `weatherDuration` scales that), and every change blends in smoothly over half a minute or so,
  never abruptly. The weather only ever takes one step at a time along one of three chains:
  - dry ↔ wet: clear – fair – cloudy – drizzle – rain – storm
  - calm ↔ fog: fair / cloudy / drizzle – mist – fog – dense fog (needs calm, damp air: dawn, night
    or after rain; the daytime sun burns it off)
  - calm ↔ wind: fair – breezy – gale

  A front has momentum: once clouds start to gather they keep building toward rain or a storm and
  then clear the same way, and the weather doesn't turn straight back into what it just was. So
  fog never jumps to sunshine or wind, and a storm never comes out of a clear sky.

- **Rain.** The ground darkens, puddles form in low spots and reflect the sky, rain ripples the
  puddles, and walking through them splashes. Walk in circles on wet ground and it turns to mud
  that slows and slides you. Wet paving and snow are slippery too. Footprints show on wet ground,
  mud and snow. Pidgey shelter under trees, Caterpie hide under leaves, Rattata shake off the
  water afterwards, water-types splash in puddles, and fire-types hate it. The branches keep
  dripping after the rain stops.
- **Fog** ranges from faint mist to dense fog that closes in around you. In thick fog Pokémon stop
  roaming and huddle in shelter, sight ranges shrink, and the birdsong fades. Now and then a branch
  creaks somewhere unseen. Fog really thins out the wild Pokémon, in three tiers that feed the
  spawn chance and the population cap: light fog (about −5 to −15%), moderate fog (−15 to −50%)
  and dense fog (−50 to −80%). Setting: `fogSpawns`.
- **Wind** sways trees and grass in visible waves, swings lanterns and makes flames flicker.
  Unprotected lanterns can blow out (and fire-type Pokémon sometimes relight them). A strong gust
  can send a small flying Pokémon tumbling through the air, crying, until it escapes off-screen
  or lands dazed far away.
- **Thunderstorms.** The sky goes dark and the rain gets heavy and gusty, while the birds and
  insects fall quiet. Lightning comes at irregular intervals: sometimes a distant rumble builds the
  tension first, most flashes are small and far away, and now and then a close strike lights up
  the whole forest with a double flash or a nervous flicker. Close strikes are drawn as a glowing,
  branching bolt that touches down with a burst of sparks and leaves a scorch mark. Thunder follows
  later and quieter the farther away the strike was (about 3 s per km). Heavy rain can bring the
  occasional distant flash too. Setting `flashIntensity` tones the screen flashes down (0 = none)
  for comfort and accessibility; `lightningRate` makes strikes rarer or more frequent.
- **Reactions to thunder vary.** Some Pokémon freeze on the spot, some run for shelter, some stop
  wandering for a while, and others just flinch. Brave Pokémon are less affected, electric types
  aren't scared at all (some love it), and sleepers only wake for close, loud thunder or a strike
  right next to them. A long severe storm can bring down a tree, which you then have to clamber
  over.
- **Sleep is real.** A sleeping Pokémon doesn't move: no wandering, no gusts blowing it around, no
  weather shuffling it to shelter. It wakes up first (noise, being bumped, close thunder), then
  acts.

## The forest itself (`38-art.js`, `39-decor.js`, `93-ground.js`)

- **Natural terrain** (`33-gen.js`). The game used to fill forests with rectangular blocks of
  solid "wall" tiles. Forest biomes no longer generate them: the forest is open ground with trees
  spread at a measured density (setting `treeDensity`).
- Trees and undergrowth come from the supplied sprite sheets (`assets/env/atlas.png`): oaks,
  pines, firs, cypresses, gnarled and broad trees. The Shady Forest stays green all year (seasons
  show in flowers, light and snow, not in autumn-coloured trees). Haunted, jungle and icy areas
  get their own looks.
- **Trees grow in stages:** sapling → young → mature → large → ancient. A tree's stage depends on
  how much room it has and on rarity: crowded spots grow saplings and young trees, open ground
  mature ones, a few spacious spots large trees, and very rarely an ancient giant stands as a
  landmark with open ground around it. Large trees get small ferns at their base, shadows and
  ambient occlusion scale with the canopy, collision stays at the trunk, and sprites are only ever
  scaled by whole pixel multiples so they stay crisp. Setting: `treeSizes`.
- Each area is dressed with deterministic decor: fallen logs, stumps, bushes and berry bushes,
  ferns, saplings, wildflower clusters, grass tufts, mushrooms and burrows. Bushes keep clear of
  tree trunks. Lamp posts stand only along the old path to the haunted mansion, in neat pairs.
- Vegetation reacts. Grass and bushes part as Pokémon or you brush through, bushes shake and
  rustle (a rustling bush can give away a hiding Pokémon), and canopies fade when you walk
  behind them.
- **Memory.** Footprints, mud, ripples, nibbled leaves (Caterpie at work), freshly dug burrows
  (Rattata at work) and storm-felled trees stay for a while.

## Pokémon sizes (`14-scale.js`, `12-sizes.js`)

The game's sprites come in roughly standard sizes, so a Joltik, a Pikachu and a Snorlax could end
up about as big as each other. Each species is now scaled toward its real size, using its Pokédex
height (stature) and weight (bulk):

- The difference is compressed: tiny Pokémon shrink gently so they stay visible, and enormous ones
  grow only so far so they don't swallow the screen. Evolutions grow consistently
  (Charmander < Charmeleon < Charizard), and an evolving Pokémon takes its new size.
- Individuals vary a little (about ±6%), bosses and Legendaries are a touch larger (×1.12), and
  your partner is scaled more gently (visual only).
- Collision grows moderately with size (between ×0.8 and ×1.35), so combat stays fair.
  Shadows, bubbles and name tags follow the scaled body (wild Pokémon no longer show health
  bars; see [SHADY_FOREST.md](SHADY_FOREST.md)).
- Setting: `speciesScale`.

## Encounters you earn (`91-progress.js`)

- The game's timed "Pokémon surge" hordes are switched off (setting `hordes`).
- Bosses come once you've defeated enough Pokémon (setting `bossKills`, default 35, 90, 160, 250,
  360), one at a time, with a notice ("Something powerful is approaching…") a few seconds before.
- Rifts open at their own milestones (`riftKills`, default 50, 130, 230, 350, 480); golden rifts
  are much rarer (`goldenRiftKills`, default 280, 650). They open on open ground roughly 700–1150 px away
  from you, never on top of you or inside a wall. The game's own timed rifts are cancelled.
- Major encounters never overlap: no rift while a boss is out, no boss while a rift is open, and a
  pause (`eventCooldown`, 75 s) between them. Past the last milestone the gaps keep growing.
- Rewards and fights are the game's own; only *when* they happen changed.

## Attack warnings (`93-ground.js`)

Area attacks are announced with a soft glow that fills in as the attack approaches and a thin
rim that pulses briefly just before it lands, instead of blinking red dashed outlines. Warnings
from Pokémon that aren't after you are fainter still. Setting: `softTelegraphs`.

## The old mansion

*(The mansion itself, its hauntings and its story are described in
[HAUNTED_MANSION.md](HAUNTED_MANSION.md). This section covers the rumours and clues in the forest.)*
 (`86-lore.js`, `39-decor.js`)

Some Pokémon talk. In the evening and at night a sociable one gathers the others and tells them
about an old mansion hidden deep in the woods. Every storyteller has its own version: the clock
that still ticks, purple lights in the windows, a door that opens by itself, a music box in the
fog, parties on moonless nights, the master still waiting for guests… Listeners gasp, shiver or
scoff. The timid ones sleep with one eye open.

The mansion itself isn't reachable yet, but the starting woodland hides its clues:

- An overgrown trail of mossy paving stones that disappears into the trees.
- An old wooden sign covered in vines.
- A hanging lantern by the trail that flickers even when there's no wind, which Pokémon nearby
  notice.
- Rusty iron fences half swallowed by the undergrowth.
- Dark trees with faces at the end of the trail, whose eyes glow at night.
- On moonless or foggy nights a faint music box seems to drift through the trees near the trail.
- In thick fog Pokémon refuse to go anywhere near it.
- Once, on a wet night, a Hoothoot sits on the old sign staring down the abandoned road. When you
  approach it quietly tries to warn you. The lantern flickers, somewhere a door creaks open, and
  the Hoothoot turns away from you, frightened.

Pokémon who trust you (because you fed, rescued or protected them) sometimes share secrets: which
way the old stones start, a hidden berry patch behind the bushes (the first visit shakes
something useful loose), or a cave sealed with boulders that you can't enter yet. Friendly
Pokémon also warn you when rain, a storm, a gale or dense fog is on its way.

**Small wonders:** a flock of Pidgey bursting into the air when you run at them, a Rattata
family crossing the path in a little line, Charmander and friends relighting lanterns.

## Ambient sound (`97-audio.js`)

All synthesised, with no audio files:
- **Birds, insects and night calls:** a dawn chorus that thins out by midday and stops at night,
  crickets and Hoothoot calls at night, and a soft leaf-rustle bed by day.
- **Wind and rain:** wind that rises with the gusts, and rain that sounds different on leaves, on
  open ground and on stone, with plops in the puddles.
- **Thunder:** delayed and muffled by distance.
- **Close by:** rustling bushes, splashes, squelching mud, snoring Pokémon, a panicked cry when the
  wind takes a bird, and flapping wings.
- **The mansion:** a distant creaking door and the music box.
- **Fog:** thick fog swallows the forest's voice.

It follows the game's sound-effects volume and mute setting (plus its own ambient slider) and
fades out in menus.

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `atmosphere` | on | day/night, lighting, living weather, ambient sound |
| `dayLength` | 600 s | length of a full in-game day |
| `startHour` | 6.5 | time of day when a run starts |
| `season` | `auto` | `auto` (calendar), `spring`, `summer`, `autumn`, `winter` |
| `weatherFreq` | 1 | how often the weather turns (0 = always fair) |
| `lightQuality` | `auto` | light map resolution: `low`, `medium`, `high` |
| `lantern` | `manual` | `manual` (L lights it), `on` (kept lit while it has oil), `off` |
| `nightVisibility` | 0 | accessibility: brighter nights (0–1) |
| `ambientVol` | 0.7 | ambient sound volume |
| `newArt` | on | new trees, plants, decor and the trail |
| `areaSpawns` | on | curated area rosters, habitats, natural arrivals |
| `speech` | on | Pokémon speech bubbles |
| `naturalTerrain` | on | forests without rectangular wall blocks |
| `treeDensity` | 1 | forest tree density |
| `treeSizes` | on | trees in growth stages, from saplings to rare ancient giants |
| `speciesScale` | on | Pokémon sized by species |
| `softTelegraphs` | on | soft attack warnings |
| `earnedEvents` | on | bosses and rifts unlock through Pokémon defeated |
| `hordes` | off | the game's timed hordes |
| `bossKills` / `riftKills` / `goldenRiftKills` | see above | defeat milestones |
| `eventCooldown` | 75 s | pause between major encounters |
| `weatherDuration` | 1 | how long each kind of weather lasts |
| `fogSpawns` | 1 | how strongly fog thins out wild Pokémon (0 = not at all) |
| `lightningRate` | 1 | how often lightning strikes |
| `flashIntensity` | 1 | lightning screen flash strength (0 = no flashes) |

### Console helpers

```js
PSXAI.Sky.set({ hour: 22, rain: 1, storm: 1 })   // jump to a stormy night
PSXAI.Sky.set({ fog: 0.97 })                       // dense fog
PSXAI.Sky.set({ season: 'winter' })                // try another season
PSXAI.Sky.set({ release: true })                   // let the weather run free again
PSXAI.Sky.bolt(0.5)                                // lightning strike 0.5 km away
PSXAI.Decor.trail                                  // where the old trail is
```

## Performance

- The light map is drawn at a fraction of the screen resolution, and is skipped entirely in full
  daylight.
- Shadows are drawn once into a buffer.
- Decor is generated per chunk and cached.
- Particles are capped.
- All rendering is limited to what's on screen.

A scenario test checks the frame rate with the whole atmosphere running (night, storm, fog,
lanterns, 20 Pokémon).
