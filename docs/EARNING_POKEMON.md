# Earning Pokémon, things that break, Spiritomb and the dev console

There's no gacha anymore: every Pokémon you own, you earned by playing. Your attacks can now knock
down trees and smash a few other things, and the Shady Forest hides one of its cruellest secrets:
the Odd Keystone, the Creepy Well and Spiritomb. And for testing, a dev console unlocks everything.

Everything here lives in `js/ai/` and can be switched off in the settings (**F7**).

---

## No gacha: Pokémon join you when you defeat them (`65-catch.js`)

The gacha is gone. Its menu entry, the ticket counter and its screen are hidden, and the tickets
Pokémon used to drop are PokéCoins instead (a ticket is 15 coins, a ×10 ticket 120). The Pokémon you
already own stay yours.

Instead, **each Pokémon you defeat may join you.**

- The first one of a species has a small chance: about 4% for a weak, common Pokémon like Rattata,
  far less for strong, rare ones like Dragonite.
- Every one of that species you defeat makes the next more likely.
- After enough of them, one is sure to join: 25 of a common species, 35, 50, 75, or 120 of the rarest.
- How many of each species you've defeated is kept between runs.
- Shiny Pokémon you defeat still join you as shinies (the game's own rule).

What never joins this way: **Legendary and Mythical Pokémon** (they have their own stories: the
legendary beasts, the Tapus, Deoxys…), **Spiritomb** (see below), bosses, rift Pokémon and the ones
in a story. Pokémon defeated by someone else don't count, and nothing joins in Training.

When one joins you, it says so on screen; choose it as your partner from the menu like any other.

---

## Things your attacks break (`64-breakables.js`)

Your moves now hit more than Pokémon:

| What | Hits it takes | What's left |
|---|---|---|
| Saplings | a couple (30 HP) | a small stump |
| Young trees | a few (70 HP) | a small stump |
| Mature trees | several (140 HP) | a dark stump |
| Large trees | many (260 HP) | a big stump |
| Bushes | one or two (20 HP) | nothing |
| Dead saplings and young plants | a couple (30 HP) | nothing |
| Stumps | a few (60 HP) | nothing |
| Fallen logs | several (90 HP) | nothing |

(Tall grass, rocks and chests already broke: the game's own.) Things get a little tougher as your
level goes up.

- A tree shudders and flashes as it's struck, creaks, and comes down in a burst of leaves and
  splinters with a thump of the camera. Now and then a berry or a few coins fall out.
- **Not everything breaks:** the ancient giants stand forever, and so do gravestones, statues,
  fences, signs, lamps, the well, the mansion and its grounds.
- **Your Pokémon never chops a tree on its own.** Trees only come down when your attacks hit them on
  the way to something else, or when you aim at them. When there's nothing to fight, your Pokémon
  still goes for rocks and the like, as before.
- What's broken stays broken for the rest of the run.

---

## The Odd Keystone and Spiritomb (`86-spiritomb.js`)

> *"One hundred who never raised a claw against you. We heard every one of them fall."*

Spiritomb is earned in the Shady Forest, and the way to it isn't kind.

1. **Find the Odd Keystone.** It lies somewhere in one of the forest's sunlit clearings, out of
   sight: a cracked little stone with a faint purple glint and a shimmer of sound when you're close.
   Walk over it to pick it up. Once it's yours you keep it, run after run.
2. **Defeat 100 innocent Pokémon** in the Shady Forest: ones that were minding their own business
   and never turned on you. Pokémon that attack you, bosses and legendaries don't count. The count
   is kept between runs, and while you carry the keystone it's shown on the left of the screen. The
   keystone grows colder at 25, 50 and 75; at 100 it's as cold as ice, and now and then it tugs
   toward the well.
3. **Find the Creepy Well.** While you carry the keystone, the old well (`86-well.js`) is always
   somewhere in the forest. **Click it** with the keystone and 100 innocent defeats.
4. **The well answers.** The forest goes dark and purple, the keystone rises off the rim, and 108
   spirits pour out of the shaft, whispering. Then Spiritomb rises to fight you: a mini-boss that
   keeps calling Gastly up out of the well to fight beside it.
5. **Beat it and it joins you,** bound to the keystone. Lose, wander off, or take more than five
   minutes, and it sinks back into the well to wait for you (your keystone and your count stay).

Clicking the well without the keystone shows you an odd hollow carved into its rim; with the
keystone but too few defeats, it tells you how many it's still waiting for.

---

## The dev console (`98-devconsole.js`)

Press **F9** (or **`**) anywhere, in the menus or in a run. Buttons for the common things, and a
command line for everything (↑/↓ for history):

| Command | What it does |
|---|---|
| `unlock all` | every level open, every Pokémon and every shiny owned |
| `unlock stages` / `lock stages` | every level open (remembered) / back to normal |
| `unlock pokemon` · `unlock shiny` | own every Pokémon · and every shiny |
| `spawn <name\|dex> [n] [boss\|peaceful]` | Pokémon next to you: `spawn gastly 5`, `spawn mewtwo boss` |
| `catch <name\|dex>` | that Pokémon joins you |
| `spawns off` · `spawns on` | wild Pokémon stop / keep appearing |
| `keystone` · `innocents <n>` | the Odd Keystone · set the innocent count |
| `spiritomb` · `well` | fight Spiritomb now · put the old well next to you |
| `mansion` | open the path to the haunted mansion now |
| `karma` · `karma max` · `karma clear` · `karma <0-25>` · `karma judge` | the hidden KARMA (`100-karma.js`): see where it stands, max it (the forest empties, the mansion gates shut), clear it, set it, or call the Legendary Beasts' judgment now (in the Shady Forest; the run ends after it) |
| `god` · `heal` · `level <n>` · `coins <n>` · `kill` | the usual |
| `time <hour>` · `weather clear\|rain\|storm\|fog\|snow\|auto` | the sky |

Unlocking the levels uses the game's own developer switch (`R.DevMenu`), so it's remembered and can
be switched back off with `lock stages`.

---

## Settings

| Setting | Default | What it does |
|---|---|---|
| `noGacha` | on | no gacha: Pokémon you defeat may join you |
| `catchRate` | 1 | multiplier on the chance a defeated Pokémon joins you |
| `breakables` | on | your attacks break trees, bushes, logs, stumps and saplings |
| `spiritomb` | on | the Odd Keystone, the Creepy Well and Spiritomb |

### Console helpers

```js
PSXAI.Catch.chance(19)            // the chance the next Rattata you defeat joins you
PSXAI.Catch.kills(19)             // how many you've defeated
PSXAI.Spiritomb.save              // { keystone, innocents, won, tries }
PSXAI.Dev.run('spawn gastly 3')   // any dev console command
```

## Performance

Trees near you are made breakable twice a second (only the ones whose size is known); breakable
decor is only looked up where an attack lands. Spiritomb's spirits are drawn only during its scene.
