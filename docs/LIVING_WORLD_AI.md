# Living World AI

Wild Pokémon in PokéSurvivor+ are no longer a single swarm that walks at you. Each one is an
individual with a temperament, quirks, moods, needs, friendships and grudges. A Psyduck clutches
its aching head by the river. A Snorlax naps in your path and only grumbles when it gets hit. A
Pikachu chases a Butterfree until it trips. A bullied Magikarp can one day rise out of the water
as a Gyarados that still remembers who pushed it around. Some of them will fight you. Most of
them have better things to do.

The whole system lives in `js/ai/` as readable modules layered on top of the original game. The
original bundle is untouched apart from one line that exposes its module registry (see
[Compatibility](#compatibility)).

---

## Controls

| Input | What it does |
| --- | --- |
| **1 – 4** (number row, numpad, or the gamepad slot buttons) | Stops that move slot's automatic attacks. Press again to resume. The HUD slot shows a red **OFF** pause overlay while it's stopped. |
| **Click / tap a HUD move slot** | Same toggle (for mobile). |
| **Click / tap a Pokémon** | Marks it as your target (red dashed reticle). Auto-attacks will lock onto it even if it's peaceful. Click it again to clear. |
| **F7**, or **🧠 Wild life** in the pause menu | Opens the Living World settings panel. |
| **F8** | Debug overlay: behavior, stance, emotions, LOD and combat role above each Pokémon, plus a perf HUD. |

By default auto-attacks only lock onto Pokémon that are **hostile**, already fighting you, or your
marked target. Peaceful Pokémon are never invulnerable: area moves, orbit moves and manual aim
still hit them, and they react to it. Switch auto-aim to *Prefer hostile* or *Anyone* in the panel
for vanilla-style targeting.

---

## How a Pokémon thinks

```
perception ──► emotions & needs ──► stance toward each "other" ──► behavior selection ──► executor
   ▲ sight / LOS / hearing / sleep        ▲ relationships & memory     ▲ priority tiers         │
   └─────────────── world events (hits, deaths, cries, booms, evolutions, legendary pulses) ◄─┘
```

### Temperament and personality (`10-species.js`)
Each spawn rolls a **temperament**: `friendly`, `neutral`, `timid`, `playful`, `territorial`,
`protective`, `opportunistic` or `aggressive`. The roll is weighted by species lore (about 120
hand-tuned species), types, archetype, power and run time, so it stays individual. Most
Magikarp are timid but a rare one is aggressive. Most Gyarados are aggressive but a rare one
is gentle. Hostility pressure slowly increases over a long run (`hostilityRamp`).

Individual **traits** (bravery, aggression, curiosity, sociability, protectiveness, grudge,
forgiveness, laziness, alertness, agility, intelligence, playfulness, clumsiness, greed…) and
**quirks** (`clumsy`, `lazy`, `glutton`, `shiny-collector`, `show-off`, `prankster`, `hothead`,
`dazed`, `hates-water`, `warmth-seeker`, `wannabe-flyer`, `singer`…) shape every decision.

### Emotions and bubbles (`20-mind.js`, `95-render.js`)
Thirteen emotions decay over time and directly drive behavior. The strongest one that is
actually steering a decision is shown as a hand-painted pixel bubble:

| Emotion | Bubble | Typical effect |
| --- | --- | --- |
| joy | 😊 happy | plays, dances, follows friends |
| curiosity | ❓ question | investigates sounds, sniffs at you, watches spectacles |
| anger | 💢 anger | retaliates, holds grudges, fights harder but sloppier |
| fear | 😱 scared | flees, hides behind stronger allies, freezes, cowers |
| sadness | 💧 tear | mourns fallen friends and recovers slowly |
| sleepy | 💤 zzz | naps, yawns, is harder to wake |
| confusion | 🌀 swirl | stumbles and hesitates (Psyduck headaches, Uxie's aura) |
| hunger | 🍖 food | forages, steals berries, shares food with friends |
| affection | 💕 love | follows, protects and comforts |
| embarrassment | 💦 sweat | after slipping or failing (witnesses may laugh) |
| surprise | ❗ surprise | first reaction to anything sudden |
| suspicion | 👀 eyes | keeps its distance and watches you |
| excitement | ✨ sparkle | races, shows off, evolves |

Bubbles are budgeted (`maxBubbles`) and prioritised by distance and importance so the screen
never turns into confetti. Emotions spread: panic, laughter and Mesprit's aura are contagious.

### Relationships, memory and reputation (`20-mind.js`, `30-perception.js`, `75-social.js`)
Every Pokémon keeps a small relationship record for you and for the Pokémon it has met:
attitude, fear, grudge, bond, rivalry and friendly-fire count. These change from what it
**perceives**, not from global knowledge. It can see you kill a harmless Pokémon, be rescued
by you, be hit by an ally's stray shot (three times and it counts as betrayal), share food,
or meet someone peacefully over and over. Witnesses gossip, so your reputation spreads
through the groups that saw it. Individuals that wander off-screen are remembered and come
back with the same personality and grudges.

### Priority tiers (`60-behaviors.js`, `70-brain.js`)
Behaviors are scored inside priority tiers, with commitment bonuses and cooldowns so Pokémon
don't flicker between actions:

1. **Survival**: flee, freeze, hide, cower
2. **Injury / hazard**: retreat, escape a liquid, Magikarp flopping on land
3. **Defend**: defend a friend, retaliate
4. **Combat**: fight, hunt prey, guard territory
5. **Events**: mourn, watch a spectacle, investigate, react to a Legendary
6. **Needs**: sleep, rest, forage, evolution sites
7. **Social**: follow / approach / seek attention from you, comfort, chase critters, steal shinies, group interactions
8. **Idle life**: wander, swim (and fail at it), climb (and slip), lift rocks, sit by the water,
   headaches, bask, seek warmth, dance, attempt to fly, mimic trees, perch, go home

Species-flavoured idle life includes: Snorlax sleeping anywhere, Pikachu chasing Butterfree,
Psyduck headaches, Slowpoke by the water, Magikarp flopping, Machop lifting rocks, Piplup
slipping, Charmander seeking warmth and avoiding water, Squirtle splashing, and Meowth
collecting shiny coins. Any of it is interrupted the moment something more important happens.

### Perception (`30-perception.js`)
Pokémon only know what they can sense. Sight range depends on species and alertness and is
blocked by walls. They hear battle noise, explosions and cries, and sleeping Pokémon hear much
less. They take a moment to react, and the delay depends on alertness, distraction and fatigue.
Threat assessment compares power (BST, level, bosses), numbers and allies nearby.

---

## Combat AI (`40-moves.js`, `50-combat.js`)

Only Pokémon that are actually fighting run the combat controller (`maxCombatAI` at a time;
the rest "menace" from a distance).

- **Four moves each.** Signature movesets for iconic species (Pikachu: Thunderbolt, Quick Attack,
  Spark, Iron Tail; Magikarp: Splash, Tackle, Flail, Bounce…) or a pool built from the
  species' types covering several ranges. Moves are chosen by range, cooldown, expected damage,
  type effectiveness, the target's behavior and the user's emotion.
- **Distance management.** Each Pokémon keeps a minimum, preferred and maximum range. Ranged
  Pokémon kite, melee Pokémon close in, and hybrids switch moves with distance.
- **Strategies.** aggressive, ranged, hit-and-run, flank, defensive and opportunistic. Pokémon
  re-evaluate and switch as HP, numbers and morale change.
- **Imperfect aim and dodging.** Predictive aim only works when the Pokémon has watched you long
  enough and is smart enough, and it still misses. Dodging needs line of sight, reaction time
  and skill, so heavy, lazy, tired or furious Pokémon dodge worse. Telegraphed danger zones are
  read better the longer the warning lasts. Sleeping Pokémon barely notice them.
- **No dog-piling.** Attackers take evenly spaced slots around a target, flank, and keep
  separation, so there are no perfect formations either.
- **Friendly fire matters.** NPC shots and hazards are tagged with their owner. Hitting an ally
  causes surprise, anger, forgiveness or a lasting rivalry depending on personality and history.
- **Retreat and mercy.** Injured Pokémon retreat instead of fighting to the death. If you stop
  hitting a beaten foe, it gradually softens.
- **Fairness.** No wallhacks, cooldowns are respected, and pursuit is limited before a Pokémon
  loses interest and goes home.

---

## Legendary presences (`80-legendary.js`)

Legendaries (as your partner, as bosses, or through events) project an aura that wild Pokémon
react to according to their personality: flee, hide, freeze, stare, gather, approach bravely,
lash out in panic, or stand in awe.

- **Giratina / Distortion World.** Fear, hiding and awe. Giratina finds the brave attempts
  amusing. Near the Distortion World the **Lake Trio** resonate: Mesprit amplifies and spreads
  emotions, Uxie makes Pokémon forget and get confused, and Azelf steels the brave and halves
  fear.
- **Groudon** hates water. It glares at puddles, evaporates them into cracked earth and scalds
  water-types nearby. It stays gentle with non-water types, and any Magikarp in range gets
  punted clean across the region.
- **Kyogre** delights water-types and unnerves fire, ground and rock. **Rayquaza** inspires awe.
  **Darkrai** brings nightmares to sleepers. **Cresselia** calms everyone and makes them sleepy.
  **Dialga** stutters time and **Palkia** folds space. Mew, Jirachi, Celebi, the Lati twins,
  the legendary birds and beasts, Mewtwo, Lugia, Ho-Oh, Arceus and others each have their own
  profile.

---

## Dynamic evolution (`85-evolution.js`)

Wild, hostile, friendly and allied Pokémon gain growth by living through things, and can
evolve in the moment:

- **Emotional triggers.** Rage (a bullied Magikarp becomes a Gyarados that goes after its
  tormentor), desperation mid-battle (a losing Machop becomes Machoke and keeps fighting),
  protecting a friend, friendship, and a cornered cocoon's escape.
- **Environment.** Ancient Moss Rocks and Ice Rocks (Eevee becomes Leafeon or Glaceon,
  for both wild Eevee and your own partner), plus weather, terrain and sparking ground that steer
  branched evolutions toward fitting types.
- **Rules.** A global cooldown keeps it rare. Evolved Pokémon keep their memories, grudges and
  friendships, with personality slightly matured. Movesets are rebuilt (no more Splash).

---

## Population and performance (`90-population.js`, `70-brain.js`)

- Global cap on wild Pokémon (`maxNpcs`), local density cap (`localCap` within `localRadius`),
  and a spawn token bucket (`spawnInterval`, `spawnBurst`) so surges can still burst. Bosses,
  legends, elites, shinies and thieves never count against the caps.
- Habitat-weighted spawning per biome. Fish and water lovers appear at the water's edge, just
  off-screen. Hordes become packs, migrations or mixed groups.
- **Level of detail.** Full-rate thinking near you (`nearLod`), slower in the middle, and
  simplified beyond `farLod`. Distant Pokémon cost about a tenth as much.
- Spatial queries for neighbors and projectiles, budgets for social interactions and combat
  controllers, and engaged Pokémon are never culled mid-fight.
- Typical cost: about 0.5–0.8 ms per frame for the whole AI with 35–40 Pokémon on screen.

---

## Settings

All settings are in the F7 panel and saved in your browser (`localStorage["psx.ai.cfg"]`).

| Key | Default | Meaning |
| --- | --- | --- |
| `maxNpcs` | 48 | global cap of wild Pokémon (the game's own hard cap of 64 still applies) |
| `localCap` / `localRadius` | 9 / 420 | max wild Pokémon around a spawn point |
| `spawnInterval` / `spawnBurst` | 0.32 s / 12 | ambient spawn pacing / burst budget |
| `hostility` / `hostilityRamp` | 1 / 600 s | weight on hostile temperaments / time for that pressure to double |
| `nearLod` / `farLod` | 640 / 1250 px | full-rate and simplified-simulation distances |
| `think` | [0.2, 0.55, 1.4] s | decision intervals per LOD |
| `maxCombatAI` | 16 | simultaneous advanced fighters |
| `maxSocial` | 6 | simultaneous NPC↔NPC interactions |
| `maxBubbles` / `bubbleScale` | 10 / 1 | emotion bubble budget and size |
| `evolution` / `evoRate` | on / 1 | dynamic evolution and its growth speed |
| `autoAim` | `hostile` | `hostile` (hostile + marked target), `prefer`, or `any` (vanilla) |
| `friendlyFire` | on | NPC attacks can hit other NPCs |
| `debug` | off | debug overlay (F8) |

The panel also has a master switch that hands everything back to the vanilla enemy logic.

---

## Compatibility

- `js/app.min.js` is otherwise untouched. The one change exposes the game's internal module
  registry: `var _0x4a5217={};` became `var _0x4a5217=window.__PSX_REG__={};`.
  The bundle is self-defending, so **do not reformat it**.
- `js/ai/99-install.js` waits for that registry and wraps the relevant vanilla methods
  (`Enemy.update/hurt/die/draw`, `Combat.tick/resolve`, `Hazards`, `Projectiles.spawn`,
  `EnemyMgr.add/update`, `Spawner.update/burst`, `HUD.draw`…). Bosses, legends, Arceus/Judge,
  training dummies, elites, thieves and remote co-op enemies keep their vanilla AI.
- NPC-on-NPC kills don't count toward your kill stats. The XP and loot they drop is yours if
  you pick it up.
- If a behavior throws, the AI logs a warning (`[PSXAI:…]`) and that Pokémon drops back to idle
  instead of breaking the run.

### Console helpers
`PSXAI.Debug` is available from the browser console:

```js
PSXAI.Debug.spawn(129, { temp: 'timid', dx: 200 }) // spawn a Magikarp near you
PSXAI.Debug.info(e)                                 // emotions, stance, behavior, relationships
PSXAI.Debug.bond(a, b)                              // make two Pokémon friends
PSXAI.Debug.freeze(true)                            // stop natural spawns
PSXAI.Debug.god(true)                               // invulnerable player
PSXAI.Debug.clear(true)                             // remove everything (bosses, events too)
```

---

## Tests

`tests/ai-scenarios.js` boots the real game in headless Chromium (Playwright) and checks 30
end-to-end scenarios: peaceful wandering, timid fleeing, emotional reactions, NPC↔NPC
interactions, friendly-fire retargeting, protective intervention, Giratina + Lake Trio
reactions, injured retreat, reactions to a kill, the move toggle, bubbles matching behavior, LOD
cost, vanilla combat and progression, ranged/melee/hybrid spacing, use of all four moves,
dodging with failures, no dog-piling, imperfect predictive aim, danger-zone escapes, no combat
math for peaceful Pokémon, mercy, combat performance, species-shaped temperaments and movesets,
Magikarp→Gyarados rage evolution, mid-battle Machop evolution, environmental Leafeon
evolution, population limits, and Groudon's war on puddles.

Requirements: Node 18+ and Playwright with Chromium, installed in the repo folder (`npm i --no-save playwright && npx playwright install chromium`).

```sh
npx http-server -p 8123 -s -c-1 .     # in one terminal
node tests/ai-scenarios.js            # all scenarios
node tests/ai-scenarios.js groudon    # only scenarios whose name matches
```

Tests stub `config.js` so they never touch a real backend.
