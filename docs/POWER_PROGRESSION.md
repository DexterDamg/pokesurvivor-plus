# Mega Evolution and Z-Moves: how they're earned

This replaces the game's own unlocks entirely. Before: any Pokémon with a Mega form could Mega
Evolve from level 50, and Z-Moves unlocked at level 10 (with a locked slot on the bar until then).
Now each is a milestone you earn by beating a stage, and the items that enable them are earned
too.

| Stage | Mega Evolution | Z-Moves | Dynamax |
|---|---|---|---|
| Level 1, Shady Forest | — | — | — |
| Level 2, Crystal Cave | — (boss fight included) | — | — |
| Level 3, Tropical Ocean | after Crystal Cave is beaten | — | — |
| Zona Cero | yes | after the Tropical Ocean is beaten | — |

---

## Mega Evolution (`92-power.js`)

- **Unlocked by beating Level 2 (Crystal Cave)**, and usable from Level 3 on.
- **Only with that Pokémon's own Mega Stone**, and only if its species has a Mega form in the
  game. Lucario needs Lucarionite; a Gengarite does nothing for it.
- **Mega Stones are held items.** A stone takes the one held-item slot like anything else: Lucario
  holding Lucarionite holds no Assault Vest. Picking up a stone while holding another item brings
  up the game's usual choice of which to keep. Swapping a stone out ends an active Mega Evolution.
- The stone you hold decides the form when there's more than one (Charizardite X → Mega Charizard
  X).
- **Stones only ever come for the Pokémon you're playing**, in four ways:

| Source | Chance |
|---|---|
| Level-up | **1%** per level gained (offered right after the level-up screen, through the held-item choice) |
| Normal chest | **5%** |
| Big chest | **10%** |
| On the map | one chance per run: at a random moment, a glowing stone is placed somewhere out of sight |

  Exact chances, no pity, nothing guaranteed. The game's random item drops never hand out a stone.
- **The stone on the map is never announced:** no message, no marker, no arrow. It glows; you
  notice it or you don't. (Picking it up shows the game's usual "you're holding…" line.)
- Forms that need no item in the games (Rayquaza's Dragon Ascent, Darmanitan's Zen Mode, Palafin's
  Hero form) follow the same milestone without a stone. Special forms that do use an item in the
  games use that item (Blue Orb, Red Orb, Rusted Sword, Rusted Shield, Prison Bottle, DNA Splicers,
  Ultranecrozium Z).

## Z-Moves

- **Unlocked by beating Level 3 (the Tropical Ocean)**, usable in the stage after it. The game has no
  Tropical Beach stage, so for now that's **Zona Cero**.
- **Each Z-Move needs its Z-Crystal**: the crystal of your Pokémon's own Z-Move type (the type the
  game picks for it, or the one you chose among its types). Crystals are kept for good once earned.
- **Until a Z-Move can actually be used, its slot doesn't exist on the bar.** No grey slot, no
  padlock, no level number.
- **Z-Crystals come only from Totem Trials**, never from chests or level-ups.

### Totem Trials (`89-totem.js`)

- Once the Tropical Ocean is beaten, a **Totem's shrine** stands somewhere in Zona Cero: a tall stone with a
  light of its type rising from it. It's only ever for the crystal your current Pokémon can use,
  and only until you have it.
- **Stand at it for a moment** to begin (step away to decline).
- The trial is a **maze of that type**, in its own pocket of the world:
  - **Ghost and Dark** trials are pitch black. Your Z-Ring's faint glow and whatever light you
    carry are all you have, and ghosts drift straight through the walls.
  - Fire and Poison floors burn, Electric floors spark, Water, Ice, Grass and Ground slow you.
- Pokémon of the type come out of the dark in **growing hordes**. Hold out until the timer runs
  down, and **the Totem** itself rises at the heart of the maze (Totem Mimikyu for Ghost, Lurantis
  for Grass, Vikavolt for Electric…).
- **Defeat it for its Z-Crystal.** You're brought back to where you stood.
- No outside Pokémon, bosses or rifts reach you in the maze. Your companions come along.

## Dynamax

The game has no Eternal Doom stage and no Eternatus to defeat yet, so nothing unlocks Dynamax and
no Dynamax Band exists. When that stage exists, the Band can follow the same rules as Mega Stones.

---

## Decisions this needed

The request left a few things open; these are the choices made, so they can be changed:

1. **Stages after unlocking.** Mega Evolution is usable only on Level 3 and beyond, and Z-Moves
   only in the stage after the Tropical Ocean, even after the milestone (the progression table marks them
   unavailable on earlier stages).
2. **Level-up 1%.** The game's level-up screen has no item cards, so the 1% is rolled on each level
   gained and the stone is offered right after the screen through the usual held-item choice.
3. **The stone on the map.** No rate was given (and the chest chances shouldn't be reused), so it's
   one chance per run at a random moment between minutes 3 and 15.
4. **Z-Crystals are not held items.** The request only asks that for Mega Stones and Dynamax
   Bands; crystals are kept once earned and don't take the slot.
5. **Type crystals only.** The game's Z-Moves are type-based; there are no species-specific
   Z-Moves to give species crystals for.
6. **Totem Trials in Zona Cero**, since Tropical Beach doesn't exist (as agreed).

## Settings

| Setting | Default | What it does |
|---|---|---|
| `powerRework` | on | these rules (off: the game's own level-based unlocks) |
| `totemTrials` | on | Totem shrines and their trials |

### Console helpers

```js
PSXAI.Power.megaStage()            // is Mega Evolution available here?
PSXAI.Power.stonesFor(448)         // the stones Lucario can use
PSXAI.Power.crystals               // the Z-Crystals you've earned
PSXAI.Totem.start('ghost')         // try a trial
```

The game asks these rules through three one-expression hooks in `js/app.min.js`
(`PSXGEN.mega`, `PSXGEN.zmove`, `PSXGEN.noZslot`).
