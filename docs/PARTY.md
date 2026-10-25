# Your party: Pseudo Players, Natures and dialogue

Playing alone shouldn't feel like an empty world. A party has four places, and every place no
human fills is taken by a **Pseudo Player**: an AI companion that explores, fights, helps and
talks like another player would. They're marked as AI everywhere they appear.

Everything here lives in `js/ai/` and can be switched off in the settings (**F7**).

---

## Who travels with you (`83-party.js`)

| Humans in the party | Pseudo Players |
|---|---|
| 1 | 3 |
| 2 | 2 |
| 3 | 1 |
| 4 | 0 |

- In the Shady Forest they are **Charmander, Froakie and Sprigatito**. With fewer places free,
  the ones that round out the party best come along: types the humans don't have, and a light if
  nobody carries one.
- If you already play one of them, a kindred Pokémon takes that place: **Chimchar** for
  Charmander, **Piplup** for Froakie, **Rowlet** for Sprigatito.
- Their level and health scale with yours; they're as strong as a player of their level.
- **Marked as AI:** a small tag over each, and a party panel under the clock with their portrait,
  Nature and health.
- **Co-op:** the host runs them and everyone sees them. When a human joins, the companion who fits
  least says goodbye and walks off; when one leaves, a companion comes back. Nobody is ever
  duplicated, and they share nothing that could be duplicated (no inventory; your EXP is yours).
- Resuming a saved run brings back the same companions, with what they remember.

### How they behave

They run on the same brain as every other Pokémon in the world (perception, emotions, four moves,
dodging, spacing) plus their own party behaviours. None of them is ever needed to get through
anything.

- **Keeping up, loosely:** each has its own loose place around you, never a marching line, never
  on top of each other. Further when it's calm and they're independent, closer in danger, in the
  dark (unless they bring their own light) and near the old house.
- **Exploring:** they wander off to look at something and come back. Froakie scouts ahead of where
  you're heading; the curious ones go wherever something catches their eye. Near the mansion a
  curious one goes to look at the gate.
- **What each species notices** (abilities outside combat):
  - *anyone* spots treasure: "Over here! A chest!", and waits by it for you;
  - *Froakie* reads the ground: fresh tracks, and Pokémon hiding up in the trees;
  - *Sprigatito* has a nose for plants: berries, odd plants, a mystery's leafy clue;
  - *Charmander* lights the dark: at night it keeps close to whoever can't see;
  - a *Fire-type* offers to burn a fallen tree clear;
  - companions standing around a big chest open it faster, as other players would.
- **Fighting:** they fight what threatens the party, or what you're clearly fighting. They leave
  peaceful Pokémon alone and don't stir one up while the party is sneaking past it (a Rash or
  Hasty one sometimes jumps the gun, and hears about it). Their attacks never hurt you.
- **Helping:** a hurt ally gets a berry from someone's pouch; a fallen companion gets helped up
  (stand next to it for a moment, anyone can). Left alone long enough, it gets back up by itself.
  Nobody is ever lost for good.
- **Fear and courage:** a scared companion shelters behind the teammate it trusts most rather than
  running off alone; a timid one hesitates in the dark, at the mansion gate, when a ghost appears,
  and then goes on. When a friend is in real danger, it steps in anyway.
- **Mistakes, on purpose:** hesitating, wandering a little far, jumping into a fight, missing what
  a teammate noticed. Character, not broken AI.
- **Never lost:** stuck behind something or too far behind, a companion catches up from somewhere
  you're not looking.

### Playing like a player (`83-partyplus.js`)

- **Loot.** They pick up what's lying around. **EXP goes to the whole party** (it counts for
  you, as if you'd picked it up), and so do coins and tickets. **Items they keep**: a companion
  holds one held item (shown on its panel) and carries up to three more; berries go in its pouch,
  to eat when it's hurt or to hand to you when you're low. TMs, bottle caps and Mega Stones are left
  for you: a companion can't use them. And they never race you: anything lying nearer you than
  them is yours, and a held item is only fair game once it's been left lying a while (or came out
  of a chest they opened).
- **What a held item does for them**: much the same as for you. Life Orb and the Power items hit
  harder, Choice Scarf and Quick Claw make them faster or quicker to recover, Assault Vest
  toughens them, Leftovers and Sitrus Berry heal, Focus Sash saves them once, Rocky Helmet bites
  back, the Orbs and King's Rock can burn, poison, slow or stun what they hit, Lucky Egg and Amulet
  Coin add to what they pick up for the party.
- **Chests.** They open small chests themselves and stand at big ones until they pop; whatever
  falls out is theirs to pick up first.
- **Power crystals.** They touch them too. A white crystal starts its event, as if you had; the
  others empower that companion for 25 s (Fury: double damage; Bolt: faster; Magnet: picks things
  up from much further away; Haste: moves recover sooner), shown as a coloured ring around it.
- **Roaming.** Off on their own for a while (the independent ones further), then back, and they
  drop an errand to catch up when you move on.
- **Battle.** They dodge shots and telegraphed blasts aimed at anyone in the party, in a fight or
  not (your own attacks aren't threats to them), keep their distance or close in as their moves
  need, lead their shots, and step in for each other.
- **Evolution.** They evolve at the level their species does: Charmander at 16 and Charmeleon at
  36, Froakie and Sprigatito at 16 and 36, Rowlet at 17 and 34, Chimchar at 14, Piplup at 16. They
  glow, change, and have something to say about it. Each stage (and every level) sharpens them:
  better dodging, faster reactions, steadier aim.

### Relationships

Between each of them, and with you, the run keeps: **trust, friendship, confidence, irritation,
respect, fear, loyalty and shared experiences**. They grow slowly from what happens: being helped
up, saved from an attacker, given a berry, reassured, teased; a teammate's reckless move; being
left behind. They change where a companion stands, whom it protects first, whom it shelters
behind, how far it strays, and how it talks.

They remember **what you do**, and react now and then (never constantly): helping a lost Pokémon
or walking past it, coming back for a fallen companion or leaving it behind, fighting on at low
health, a brave win against a boss.

### Talking

Conversations come from what actually happens: nightfall, rain, fog, thunder, a chest, tracks, an
old fence ("Huh? What's a fence doing all the way out here?" "Looks old. Whatever it was
protecting has probably been abandoned for years." "Maybe… maybe we should turn around?"), the
mansion, a teammate going down, being helped up. The one whose senses or Nature make it notice
first speaks first; others may answer. Never every few seconds, never the same exchange twice in a
short while, and in the most unsettling moments nobody says anything at all.

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
current emotion = behaviour.* A Timid Charmander gets nervous in the dark (its flame flickers
harder) and asks if everyone is still nearby, and still steps in when a friend is in danger. A
Rash Froakie rushes at a sound, and still notices the tracks first.

---

## Dialogue boxes (`81-talk.js`)

Every Pokémon that matters speaks in a Mystery Dungeon box with its **PMD portrait**
(SpriteCollab), its name, and words typed out with a voice. The portrait's expression follows the
line (happy, worried, surprised, angry…).

- **Left: your party**, at most two boxes: you, the other players (their chat appears in their
  own box, with their Pokémon's portrait) and the Pseudo Players. A third speaker takes the place
  of the oldest.
- **Right: important NPCs**, at most two: Gengar, Dusknoir and the mansion's residents. The
  mansion's story uses these boxes now.
- **The Legendary box:** a larger, gold-framed box used only when a Legendary or Mythical Pokémon
  appears or speaks in its battle. Nobody else can use it. The forest's mysteries speak in it when
  you really see them, with "???" and a silhouette for a portrait until the mystery is confirmed;
  Legendary bosses speak when they arrive, as the battle turns, and near the end.
- Portraits for the companions, the mansion's cast and the forest's Legendaries ship with the game
  (`assets/portraits`); others are fetched from SpriteCollab when needed, and if that isn't
  possible the box shows the Pokémon's own sprite.

---

## Settings

| Setting | Default | What it does |
|---|---|---|
| `pseudoPlayers` | on | AI companions fill the party's empty places |
| `partyTalk` | on | they talk among themselves and to you |
| `talkBoxes` | on | Mystery Dungeon dialogue boxes |
| `companionLoot` | on | companions pick things up, open chests and touch power crystals |
| `companionCrystals` | on | …including power crystals |

### Console helpers

```js
PSXAI.Companions.list()                  // who's in the party
PSXAI.Companions.rel('char', 'P')        // what Charmander thinks of you
PSXAI.Companions.mem                     // what the party remembers about you
PSXAI.Talk.say('player', 'Hello!')       // say something in your own box
PSXAI.Natures.describe('timid')          // what a Nature leans toward
PSXAI.PartyPlus.st                       // what they've picked up, opened and dodged
PSXAI.PartyPlus.evolve(c, 5)             // evolve a companion now
```

## Performance

Companions think on the same schedule as other nearby Pokémon (a few times a second), and their
noticing scans run every second or two. Dialogue boxes are drawn only while someone is talking.

## What's not here

- Party lines are in English.
- In co-op the companions are run by the host; a guest sees them but they can't be hit by things
  only the guest's game knows about.
