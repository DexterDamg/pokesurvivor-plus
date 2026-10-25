# Hidden KARMA: consequences for killing innocent Pokémon

> **Design proposal.** KARMA is a hidden, run-scoped system for the Shady Forest. It is separate from the Odd Keystone and Spiritomb's existing innocent-defeat counter.

## Design intent

The game should respond to deliberate cruelty without punishing ordinary combat. KARMA increases only when the player deliberately attacks and kills a peaceful, non-hostile Pokémon after enabling **Attack Anyone** in Wildlife Settings. Defending against aggressive Pokémon does not count. Choosing to leave, spare, or avoid an innocent Pokémon does not count.

KARMA is never shown on the HUD, inventory, status screen, settings, or menus. There is no number, meter, warning, or explicit message that explains the system. Its effects are communicated through the forest's behavior and atmosphere.

## Escalation

The thresholds should be tuned during playtesting. The stages below describe the intended progression, not player-facing labels.

### Uneasiness — low KARMA

The forest remains mostly normal, with small signs of discomfort:

- Friendly Pokémon hesitate before approaching; timid Pokémon retreat.
- Some Pokémon stop idling and watch the player.
- Cries become less frequent near places where killings occurred.
- A few Pokémon flee immediately.
- Overall spawn rates remain close to normal.

### Fear — moderate KARMA

Avoidance becomes clear, and once-lively areas grow quiet:

- Pokémon move away or scatter when the player arrives.
- Curious Pokémon run instead of approaching.
- Some species appear less often.
- Ambient cries and wildlife sounds become sparse.

### Avoidance — high KARMA

The ecosystem begins to withdraw from the player:

- Some species stop appearing; encounter rates fall substantially.
- Pokémon that remain try to escape at once.
- Familiar areas become deserted.
- Forest music develops subtle distortion, with long interruptions in ambient sound.

No dialogue or warning explains the change. The forest is abandoning the player.

### Total abandonment — maximum KARMA

Maximum KARMA irreversibly changes the current run:

- All normal wild Pokémon encounters in the Shady Forest stop. Nothing appears in the woods, grass, ponds, bushes, or paths.
- The forest soundtrack slows and distorts, then stops entirely.
- Wildlife cries, nearby movement, and rustling cease. Only wind and the player's footsteps remain.
- The player can search the forest, but the wildlife does not return during this run.
- The game does not announce that maximum KARMA has been reached.

## The 20-minute mansion event

At the normal 20-minute arrival, the mansion still appears in its designated location. At maximum KARMA, its gates remain locked. The player cannot enter or advance the story, and there is no alternate entrance.

The rejection should make clear through the scene's tone that the player has crossed a point of no return, without exposing a KARMA value or explaining the hidden mechanic in a system message.

## Judgment of the Legendary Beasts

Shortly after the locked gates reject the player, a cinematic begins in the silent forest. A distant rumble and faint electrical crackle precede heavy footsteps. Entei, Raikou, and Suicune emerge together and confront the player. Their arrival is deliberate, not a normal random encounter.

- **Entei — wrath:** furious, radiating heat, with a deep growl.
- **Raikou — condemnation:** circles the player, electricity crackling, watching with cold hostility.
- **Suicune — disappointment:** stands silently and looks at the player, distressed by the harm to the forest.

They do not attack immediately. A short silence lets the player face the three protectors before the battle begins.

## Scripted unwinnable battle

The game transitions into an interactive boss battle against all three beasts. The player can attack, defend, dodge, and use available abilities, but the encounter cannot be won, escaped, captured, or persuaded to end. The beasts are overwhelmingly strong, and the battle inevitably ends in the player's defeat.

Their attacks should express coordinated judgment: Entei overwhelms the field with fire, Raikou strikes with speed and electricity, and Suicune uses water and ice to restrict movement and prevent escape. The player should have time to struggle and understand that ordinary combat cannot save them.

## Forced restart

After defeat, the screen fades to black and battle music stops. Several seconds of silence follow. The current run then restarts from the beginning, with no revive, retry, or return to the emptied forest.

KARMA resets when the new run begins, restoring the forest. Repeating the same intentional killings can bring the consequences back.

## Implementation constraints

- KARMA is separate from Spiritomb's persistent count and must not reuse its HUD indicator or milestone messages.
- KARMA resets at the start of each run; reaching maximum is irreversible for that run.
- Only intentional player-caused kills of innocent Pokémon count. Self-defense, other actors' kills, bosses, legendaries, story encounters, and non-forest encounters must not add KARMA.
- The feature must be gated by the player's deliberate **Attack Anyone** permission choice.
- Early-stage effects should be gradual and subtle; maximum KARMA should affect normal Shady Forest wildlife spawns and its ambient audio.
- The mansion rejection, judgment scene, unwinnable fight, and forced restart only occur at maximum KARMA when the 20-minute event arrives.
