# Natures and dialogue

Two systems that shape how Pokémon act and speak: Natures lean on every Pokémon's behaviour, and
the important ones talk in Mystery Dungeon dialogue boxes.

Everything here lives in `js/ai/` and can be switched off in the settings (**F7**).

---

## Natures shape behaviour (`15-natures.js`)

All 25 Natures now lean on how a Pokémon behaves, not just its stats (their stat effects are
unchanged). This applies to every Pokémon, wild ones included:

- its personality traits (bravery, curiosity, sociability… the ones every behaviour already reads);
- extra leanings: caution, impulsiveness, talkativeness, independence, patience, compassion,
  focus, distractibility;
- how easily fear, anger and joy come, and how fast they fade.

| Nature | Leans toward |
|---|---|
| Timid | hesitant around danger, careful, fear comes fast; seeks reassurance |
| Rash | impulsive, quick to anger, rushes in |
| Brave | faces threats, protective, hard to scare |
| Calm | composed under pressure, patient; fear and anger fade fast |
| Jolly | energetic, playful, sociable, talkative |
| Quiet | reserved, observant, says little |
| Bold | confident, explores the unfamiliar |
| Lonely | independent, reluctant to ask for help |
| Adamant | determined, persistent, sticks to decisions |
| Gentle | considerate, avoids needless harm |
| Hasty | acts fast, overlooks details |
| Careful | analytical, watches for risks |
| Modest | humble, avoids attention |
| Relaxed | patient, takes things slowly |
| Serious | focused, practical, hard to distract |
| Hardy, Docile, Naughty, Impish, Lax, Naive, Mild, Bashful, Sassy, Quirky | each with its own leanings (see the table in the file) |

A Nature leans; it doesn't override. *Nature + species + individual personality + experiences +
current emotion = behaviour.* A Timid Charmander gets nervous in the dark, and still steps in
when a friend is in danger; a Rash Froakie rushes at a sound.

---

## Dialogue boxes (`81-talk.js`)

Every Pokémon that matters speaks in a Mystery Dungeon box with its **PMD portrait**
(SpriteCollab), its name, and words typed out with a voice. The portrait's expression follows the
line (happy, worried, surprised, angry…).

- **Left: your party**, at most two boxes: you and the other players (their chat appears in their
  own box, with their Pokémon's portrait). A third speaker takes the place of the oldest.
- **Right: important NPCs**, at most two: Gengar, Dusknoir and the mansion's residents. The
  mansion's story uses these boxes now.
- **The Legendary box:** a larger, gold-framed box used only when a Legendary or Mythical Pokémon
  appears or speaks in its battle. Nobody else can use it. The forest's mysteries speak in it when
  you really see them, with "???" and a silhouette for a portrait until the mystery is confirmed;
  Legendary bosses speak when they arrive, as the battle turns, and near the end.
- Portraits for the playable Pokémon, the mansion's cast and the Legendaries ship with the game
  (`assets/portraits`); others are fetched from SpriteCollab when needed, and if that isn't
  possible the box shows the Pokémon's own sprite.

---

## Settings

| Setting | Default | What it does |
|---|---|---|
| `talkBoxes` | on | Mystery Dungeon dialogue boxes |

### Console helpers

```js
PSXAI.Talk.say('player', 'Hello!')       // say something in your own box
PSXAI.Natures.describe('timid')          // what a Nature leans toward
```

## Performance

Dialogue boxes are drawn only while someone is talking.
