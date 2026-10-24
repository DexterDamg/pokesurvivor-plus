# Living Environment

The forest breathes now. Morning mist settles over the clearings while the dew sparkles and the
first Pidgey start chirping. By midday the sun is high, shadows shrink under the trees and the
bugs come out in force. In the evening the sky turns orange, then violet, the lanterns flicker
on and the Hoothoot wake up. At midnight the forest goes quiet and dark, broken only by
moonlight, crickets and the warm circle of your lantern.

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
| **L** | Turn your lantern on or off. By default it lights itself at night and in thick fog. |
| **F7** | Settings → *Environment*: day length, starting hour, season, weather frequency, light quality, ambient volume, and switches for each system. |

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
  The phases are dawn (mist, dew, birds waking, night Pokémon slipping away), day (strongest sun,
  bugs everywhere, shade-seeking in the heat), evening (orange to purple skies, Pokémon heading
  home, Hoothoot waking) and night (dark, quiet, fewer Pokémon, harder to spot).
- **Daily rhythms.** Day Pokémon get drowsy at night and sleep in sheltered spots under trees, by
  logs and in bushes. Night Pokémon do the opposite, and at dawn the night crowd goes back into
  their trees and burrows.
- **Sleepers** breathe, twitch, shift and snore softly. They wake up, frightened or grumpy, if you
  run right past them or shine your lantern on them.
- **The moon** goes through 8 phases. A full moon makes the night noticeably brighter, a new moon
  very dark.
- **Seasons** follow the calendar by default and can be overridden. They bring spring blossoms and
  bugs, deep summer greens and midday heat, autumn gold and rust with falling leaves, and winter
  snow cover with frosted trees and hardly any bugs.

## Light and shadow (`93-ground.js`, `94-light.js`)

- A light map multiplies the colour of the hour over the scene: pink dawn, white midday, amber
  dusk, cool blue moonlight. Local lights are added into it: lamp posts, hanging lanterns that
  swing in the wind, glowing mushrooms, candles, fire- and electric-type Pokémon (Charmander's
  tail lights the path), fire moves, lightning, and your lantern.
- **Dynamic shadows.** Trees, bushes, rocks, decor and Pokémon cast shadows from the sun or moon.
  They turn and stretch through the day, sway with the wind, and fade under clouds and fog.
- **Cloud shadows** drift across the clearings, and sunbeams slant through the canopy (most of all
  at dawn, at dusk and in thin mist).
- **Ambient occlusion** darkens the ground under trunks, bushes, rocks and logs.

## Weather with consequences (`36-sky.js`, `39-decor.js`, `62-envbeh.js`)

The sky drifts between patterns (clear, fair, cloudy, drizzle, rain, storm, mist, fog, dense fog,
breezy, gale) through gradual transitions, and it follows the game's own weather events so the
gameplay effects and the look agree.

- **Rain.** The ground darkens, puddles form in low spots and reflect the sky, rain ripples the
  puddles, and walking through them splashes. Walk in circles on wet ground and it turns to mud
  that slows and slides you. Wet paving and snow are slippery too. Footprints show on wet ground,
  mud and snow. Pidgey shelter under trees, Caterpie hide under leaves, Rattata shake off the
  water afterwards, water-types splash in puddles, and fire-types hate it. The branches keep
  dripping after the rain stops.
- **Fog** ranges from faint mist to dense fog that closes in around you. In thick fog Pokémon stop
  roaming and huddle in shelter, few new ones appear, sight ranges shrink, and the birdsong fades.
  Now and then a branch creaks somewhere unseen.
- **Wind** sways trees and grass in visible waves, swings lanterns and makes flames flicker.
  Unprotected lanterns can blow out (and fire-type Pokémon sometimes relight them). A strong gust
  can send a small flying Pokémon tumbling through the air, crying, until it escapes off-screen
  or lands dazed far away.
- **Thunderstorms.** Lightning lights up the whole forest, thunder follows later and quieter the
  farther away the strike was, and frightened Pokémon dive for cover. A long severe storm can
  bring down a tree, which you then have to clamber over.

## The forest itself (`38-art.js`, `39-decor.js`, `93-ground.js`)

- Trees and undergrowth come from the supplied sprite sheets (`assets/env/atlas.png`): dozens of
  shapes and sizes (oaks, pines, firs, cypresses, gnarled and broad trees, rare huge ancient
  trees) with palettes per season. Haunted, jungle and icy areas get their own looks.
- Each area is dressed with deterministic decor: fallen logs, stumps, bushes and berry bushes,
  ferns, saplings, wildflower clusters, grass tufts, mushrooms, burrows and the occasional old
  lamp post.
- Vegetation reacts. Grass and bushes part as Pokémon or you brush through, bushes shake and
  rustle (a rustling bush can give away a hiding Pokémon), and canopies fade when you walk
  behind them.
- **Memory.** Footprints, mud, ripples, nibbled leaves (Caterpie at work), freshly dug burrows
  (Rattata at work) and storm-felled trees stay for a while.

## The old mansion (`86-lore.js`, `39-decor.js`)

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
| `lantern` | `auto` | `auto` (on at night/fog), `on`, `off` |
| `ambientVol` | 0.7 | ambient sound volume |
| `newArt` | on | new trees, plants, decor and the trail |
| `areaSpawns` | on | curated area rosters, habitats, natural arrivals |
| `speech` | on | Pokémon speech bubbles |

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
