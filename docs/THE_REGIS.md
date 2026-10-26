# The Sealed Chamber, the Regis and Regigigas

As in Ruby, Sapphire and Emerald, the legendary golems are earned with your **team** (see
[TEAM_AND_TYPES.md](TEAM_AND_TYPES.md)). It all lives in `js/ai/69-regi.js`, and it can be switched
off in the settings (**F7**, `regi`).

---

## 1. The Sealed Chamber (Tropical Ocean)

Somewhere out on the Tropical Ocean, south-east of the harbour and north-east of the whirlpool, a
lone rock rises from the sea: the **Sealed Chamber**. Sail there, step ashore, and you find an
ancient altar ringed by six standing stones, each carved with one Braille letter.

- The altar reads, in Braille: **"FIRST RELICANTH · LAST WAILORD"**. Without that setup nothing
  stirs.
- Put **Relicanth (369) in your team's first slot** (it leads the run) and **Wailord (321) in its
  last slot** (anything you like in between). Both live in the deep sea, and can join you when you
  defeat them.
- With that team the stones wake and glow. The altar shows which Braille cell is which letter, and
  asks you to **spell the name of the three giants**.
- **Step on the stones that spell R-E-G-I, in order.** Two of the six stones (A and L) are decoys.
  A wrong stone and they all go dark: start again. The order of the stones around the altar changes
  from world to world.
- Spell it and the chamber shakes. Far away, doors of rock and steel grind open. **The Regis are
  unlocked for good** (kept on your save).

The chamber is not where the Regis are: it only opens their doors.

## 2. The caves of Registeel and Regirock

Once the chamber is solved, **every** run has its cave, somewhere out of sight (1000–1700 px away
when it appears, about 45 seconds into the run):

| Golem | Where | Its cave |
|---|---|---|
| **Registeel** | the Shady Forest (Level 1) | a grey crag glinting with metal |
| **Regirock** | the Crystal Caves (Level 2) | a mound of red-brown boulders |
| Regice | (still to come) | |

The door is sealed with Braille, which glows as you come near. Walk up to it and the golem wakes,
steps out and fights you (a boss, about six times a normal Pokémon's HP).

- **Win** and it joins you (it can then lead a run or go on your team).
- Already have it? Beat it again for coins and EXP. **It's repeatable**, once each run.
- Run away or fall, and it goes back into the dark; its door stays open, so come back in a minute.

## 3. Regigigas

With **Regirock, Regice and Registeel all on your team** (any slots, in any order), a temple stands
somewhere in the **Crystal Caves**, with the giant's seven dots carved over its door. Walk up and
the ancient Pokémon that pulled the continents wakes to test you (a tougher boss). Win and it
joins you; it's repeatable like the others.

Regice isn't in the game yet, so for now Regigigas can only be reached from the dev console.

---

## Settings and the dev console

| Setting | Default | What it does |
|---|---|---|
| `regi` | on | the Sealed Chamber, the Regis' caves and Regigigas |

In the dev console (**F9**):

| Command | What it does |
|---|---|
| `regi` | shows whether the chamber is solved, whether your team is set up, and which golems you've beaten |
| `regi solve` / `regi reset` | marks the chamber solved / seals it again and forgets the golems beaten |
| `regi team` | gives you Relicanth and Wailord and makes them your first and last team slots |
| `regi chamber` | (in a Tropical Ocean run) takes you to the Sealed Chamber |
| `regi steel` / `regi rock` / `regi gigas` | opens that golem's door next to you and starts its fight now |

```js
PSXAI.Regi.setupOk()     // Relicanth first and Wailord last?
PSXAI.Regi.gigasOk()     // all three Regis on your team?
PSXAI.Regi.solved()      // the chamber solved?
```
