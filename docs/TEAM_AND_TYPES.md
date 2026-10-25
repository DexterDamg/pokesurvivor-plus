# A team of six, and types that matter

Like in the Pokémon games, you now play with a team of up to six Pokémon and switch them in and
out, and types decide who can hurt whom.

Everything here lives in `js/ai/` and can be switched off in the settings (**F7**).

---

## Your team (`67-team.js`)

**Choosing it:** in the main menu, open **Team**. Click any of your Pokémon to add it (up to six).
The first is your **lead**, the one a run starts with (it's also your partner). Click a team member
to take it out, or **Make lead** to lead with it. Your team is kept on your save.

**In a run** your team sits at the bottom left of the screen, each with its HP bar.

- **Switch** with **Z** (the previous one) or **X** (the next one), or click a portrait. A switch
  takes a moment (you can't spam it), and the Pokémon coming in gets a breath of invulnerability.
- **Each team member keeps its own HP and its own moves.** The moves it learns are its own. A
  Pokémon sent out for the first time starts with its species' first move.
- **Shared by the team:** the run's level, upgrades, items and coins.
- **Fainting:** when the one out faints, the next healthy one is sent out at once ("Charmander
  fainted! Go, Squirtle!"). The run ends only when the whole team has fainted.
- **Resting on the bench:** every level-up, each benched Pokémon heals a little (20% of its HP), and
  a fainted one comes round with a little HP.

The whole point: switch to the Pokémon the wild ones can't touch.

---

## Types matter (`66-types.js`)

The game's type chart already knew every matchup but softened it: super effective was ×1.6, not
very effective ×0.6, and even "no effect" did 30% (with at least 1 damage). Now the real
multipliers apply: to your attacks, to wild Pokémon's attacks on you, and to Pokémon fighting each
other.

| | Multiplier |
|---|---|
| Super effective | ×2 (×4 if both types are weak) |
| Not very effective | ×½ (×¼ if both resist) |
| **No effect** | **×0: no damage, and no burn, poison, slow or stun.** "No effect" shows over the target |

The immunities:

| Attack | No effect on |
|---|---|
| Ground | Flying |
| Normal, Fighting | Ghost |
| Ghost | Normal |
| Electric | Ground |
| Psychic | Dark |
| Dragon | Fairy |
| Poison | Steel |

Strong winds still take away Flying's weaknesses (the game's own rule). Wild Pokémon pick their
moves knowing all this, so they avoid moves that can't hurt you.

---

## Settings

| Setting | Default | What it does |
|---|---|---|
| `team` | on | the team of six, switched with Z / X |
| `realTypes` | on | the real type multipliers and immunities; off = the game's softer chart |

### Console helpers

```js
PSXAI.Team.chosen()              // your team (lead first)
PSXAI.Team.setTeam([25, 7, 4])   // choose it
PSXAI.Team.step(1)               // switch to the next one
__PSX_REG__.Types.mult('ground', ['flying'])   // 0
```
