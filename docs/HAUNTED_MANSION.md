# The Haunted Mansion

Somewhere north of where a run starts in the **Shady Forest** (Bosque Umbrío), a shady dirt path
leaves the woods. Old lamp posts stand along it in neat pairs, and it ends at the iron gates of an
old mansion. Everyone in the forest has heard a rumour about it, and they all tell a different one.

The mansion is an atmospheric horror location with environmental scares, scripted events and
character-driven dialogue. It is also where something very old first takes an interest in you.

> Fear → suspense → discovery → humour → comfort → confusion → genuine dread.

## Getting there (`39-decor.js`, `87-mansion.js`)

- **When and where.** The mansion is the Shady Forest's end stage. It doesn't exist for the first
  20 minutes of active play; then it is placed once, ahead of the party on ground nobody has seen
  yet, and never moves again. Old lamp posts, broken fences and signs out in the woods point the
  way, and the last stretch grows stranger. The details are in
  [SHADY_FOREST.md](SHADY_FOREST.md#the-journey-to-the-mansion-84-journeyjs).
- **The path.** A dirt path curves through the last of the woods to the gates. Pairs of lamp posts
  line it at even intervals, one on each side, and they light up at night. The old sign and the
  creaking hanging lantern (with its Hoothoot) mark where it begins. The woods thin and die off as
  you get closer.
- **The gates.** Stone pillars with lanterns on top flank an iron fence. The fence wraps around the
  grounds; only the gate is open.
- **The grounds.** The path continues through a courtyard with a small family plot (graves,
  candles, a skull) and a statue nobody remembers. A gallows-style frame holds two hanging
  lanterns, and two gargoyles flank the front steps.
- **The house.** It is a two-storey manor with end towers and a central gable. One warm candle
  burns up in the gable, a few windows glow violet, the rest are dark, broken or boarded up, and
  it is covered in ivy and cobwebs.
- **Clearing.** The grounds, the path and the land around them are kept free of trees, rocks,
  chests and ponds at generation time (three one-expression hooks in `js/app.min.js` ask
  `PSXGEN.clear`). The house, the fence and the gates are solid.
- **Way in.** Walk up into the front door. The screen fades to black and you step inside.

## Inside (`87-mansion.js`)

The interior is a separate space, drawn from the supplied mansion sheet:

| Room | What's there |
|---|---|
| **Foyer** | A barricaded staircase rising into the dark, a grandfather clock that ticks, candelabras, a torn rug, a chandelier, a portrait |
| **Gallery** | Portraits, suits of armour, crossed swords on a shield |
| **Dining hall** | A long table with a stained cloth, tall chairs, a candelabra, moonlit windows, a chandelier |
| **Ballroom** | Locked. Something knocks from the other side. |
| **Study** | Bookshelves, a desk, scattered rubble |
| **Hall** | A long, dark corridor with holes in the floorboards. At its far end stands a tall old mirror. |

- **No wild Pokémon, ever.** While you're inside, the Pokémon outside are set aside (the
  game's own stash, as rifts use) and come back when you leave. Nothing spawns indoors, and
  anything that somehow gets in is shown out. (In co-op the outside keeps running for whoever
  is still out there.)
- **Co-op.** Everyone can go in; it is no longer locked in co-op.
- **The run clock stops** while you're inside (in co-op: while everyone is inside) and while a
  story scene plays, the way it does in rift arenas.
- **It's dark.** Candles, chandeliers and moonlight through the windows are the only light. The
  forest's sounds fall away. The house settles and creaks, the clock ticks in the foyer, and
  outside weather doesn't reach in.
- **Nothing interrupts it.** Bosses, rifts and hordes don't trigger while you're inside or while a
  story scene plays. You're also safe from damage during scenes.
- **Doors.** Interior doors swing open when you push against them. The ballroom door rattles:
  it's locked.

## The hauntings (`88-haunt.js`)

A director keeps the house unsettling without wearing it out. It plays one strange thing at a
time, never the same trick twice in a row, with long silences after every two or three. It gets
bolder the longer you explore:

- knocking from behind the locked ballroom door
- heavy banging upstairs (dust falls, the chandeliers sway, the floor shakes)
- doors slamming shut, or creaking open on their own
- footsteps echoing across empty rooms
- furniture that has moved when you look back (only things you weren't looking at)
- a chandelier swaying in still air
- candles going out, and lighting themselves again (with a blue flame)
- a shape darting past the edge of the screen
- whispers from an empty room, with half-heard words drifting at the screen's edge
- portraits whose faces change: a grin, eyes that follow you, black tears, hollow eyes
- your reflection in a dark window, lagging behind you
- a cold draft that drains the colour and snuffs candles
- something scratching inside the walls
- rattling armour and swords
- the grandfather clock chiming at the wrong time
- a Duskull that follows you down the hall but is never there when you turn around

The haunting frequency can be set in **F7 → The haunted mansion**.

## The mirror

The tall mirror at the end of the hall shows your reflection. Once the house has had time to get
under your skin, standing before it goes differently:

1. The candles dim. Every sound stops. A drone too low to hear.
2. Behind your reflection, something impossibly tall rises. It is too big for the glass, it has
   wings, and its red eyes burn through the drained colour.
3. **Jumpscare.** The supplied frame fills the screen, shaking and red, with a shrieking sting.
4. You spin around. Nothing is there. When you look back, the mirror is normal.

It happens once. The full-screen jumpscare can be swapped for a gentler version (two red eyes in
the dark) in **F7 → Full-screen mirror jumpscare**, and its white flash follows the lightning
flash setting.

## The story (`89-story.js`)

Pokémon speak in proper dialogue, Mystery Dungeon style, never by repeating their names. Each
speaker gets a box with their PMD portrait, their name and a text that types out with a
per-character voice: you and your party on the left, the residents on the right, at most two a
side (see [NATURES_AND_DIALOGUE.md](NATURES_AND_DIALOGUE.md#dialogue-boxes-81-talkjs)). The narration keeps the box at the
bottom.
Advance with **Space**, **Enter**, **E**, **Z** or a click or tap. You can't move while a scene
plays.

1. **Arrival.** "Hello…? Is anyone home?" The door slams behind you.
2. **The mirror** (above).
3. **Laughter** from behind the locked ballroom door. It creaks open.
4. **The pranksters.** You catch them mid-celebration: Haunter is re-enacting how high you jumped.
   They each want credit for their pranks, and some lines change depending on which pranks you
   actually saw:
   - **Gengar** – sarcastic, mischievous, extremely proud of his performances
   - **Haunter** – energetic, chaotic, laughing at his own jokes ("I don't even HAVE feet!")
   - **Gastly** – a dramatic trickster ("I've been practising for a century!")
   - **Dusknoir** – calm, eloquent, quietly amused
   - **Duskull** – the shy one who followed you down the hall
   - **Misdreavus** – playful and curious, desperate to know whether you screamed
   - **Mismagius** – mysterious, theatrical, speaks in riddles
   - **Honedge** – eager to impress Aegislash
   - **Doublade** – two blades, one sentence, said twice
   - **Aegislash** – formal, dignified, tired of everyone's childishness
   - **Three Litwick** – Wick (shy and apologetic), Flicker (giggly) and Ember (dry: "It's a living.")
   - **Chandelure** – the ballroom's chandelier all along; elegant, a little unsettling, and very
     proud of the lighting
5. **The twist.** "Especially with that really tall shadow figure." … "What shadow figure?"
   For the first time, nobody laughs. The house goes completely still, even the flames.
6. **The glass is cold.** Dusknoir examines the mirror and finds nothing; Mismagius finds no
   illusion; Gengar can't come up with a joke. Dusknoir tells you to leave.
7. **On the way out.** The house falls silent, the Litwick flicker, Chandelure dims, and the camera
   looks back down the hall. For a moment the mirror shows something vast. Then it's gone.
8. **Somewhere else.** Floating islands, inverted pillars, water falling upward and endless void.
   A massive silhouette watches a distorted reflection of you. *"How… peculiar."*

**The watcher** has no name, no fight and no way to catch it. It is not a boss. The story is
the beginning of something taking a personal interest in you.

**Returning later**, the residents are home. They chat as you pass, and they're a lot less
cheerful than they were.

**Progress is saved** in the browser. **F7 → The haunted mansion** lists every scene you've seen
with a **Replay** button, and can reset the story.

Story text is written in English and Spanish; French and Chinese fall back to English.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `mansion` | on | the mansion, its hauntings and its story |
| `jumpscare` | on | the mirror's full-screen jumpscare (off: a gentler fade) |
| `hauntRate` | 1 | how often hauntings happen |

### Console helpers

```js
PSXAI.Mansion.geom()                 // where the path, gates and house are this run
PSXAI.Mansion.enter() / .exit()      // step inside / out
PSXAI.Haunt.run('knock')             // play one haunting (see PSXAI.Haunt.EVENTS)
PSXAI.Story.stage()                  // unvisited, exploring, mirror, unlocked, revealed, warned, done
PSXAI.Story.replay('reveal')         // replay a scene you've seen
PSXAI.Story.resetProgress()          // start the story over
```

## Performance

- The interior's static parts are drawn once into a cached image.
- Furniture, residents and effects are only drawn when on screen.
- Hauntings are scheduled events, not per-frame work.

A scenario test checks the frame rate inside with hauntings running.
