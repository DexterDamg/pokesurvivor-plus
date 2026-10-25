/* PokéSurvivor+ — Living World AI · accurate Pokémon sizes
 * The game's sprites come in roughly standardised sizes, so a Joltik, a Pikachu and a Snorlax end up
 * about as big as each other. Each species is now drawn at its real Pokédex height (12-sizes.js),
 * measured against how tall its sprite really is (its opaque pixels, not the padded frame:
 * 12-spriteh.js):
 *   - true to scale up to 2 m: 55 world px per metre (Charmander 0.6 m ≈ 33 px, a 1 m Pokémon 55 px,
 *     Charizard 1.7 m ≈ 94 px, Snorlax 2.1 m ≈ 113 px)
 *   - the tiniest are lifted just enough to stay believable and visible (Pikachu 0.4 m ≈ 28 px;
 *     Joltik, Flabébé, Comfey 0.1 m ≈ 22 px: still the smallest by far)
 *   - giants keep growing, ever more gently, so they tower without swallowing the screen (the
 *     camera shows about 432 world px top to bottom): Lugia 5.2 m ≈ 163 px, Gyarados 6.5 m ≈ 175 px,
 *     and Onix, Steelix and Wailord top out at 180 px
 * Individuals vary a little (about ±6%), bosses are a touch larger, and your own Pokémon follows the
 * same rule (between 34 and 130 px, so it's always easy to see and never hides the field). Collision grows with the body, up
 * to a limit; sprites are drawn at whole-transform scale, so they stay crisp.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const SZ = window.PSXAI_SIZES || { h: [], w: [] };
  const SH = window.PSXAI_SPRITE_H || {};

  // (the camera shows about 768 × 432 world px: these keep a giant under ~40% of the view's height)
  const PPM = 55; // world px per metre, in the true-to-scale range
  const BIG = 2.0, SMALL_PX = 34, MIN_PX = 20, MAX_PX = 180, PLAYER_MIN = 34, PLAYER_MAX = 130;
  const cache = new Map(); // dex → species factor
  function on() { return AI.enabled && AI.cfg.speciesScale !== false; }
  function meters(dex) { return (SZ.h[dex] || 10) / 10; }
  // how tall it should stand on screen (px), from its real height (m)
  function target(m, cap, min) {
    let t;
    if (m <= BIG) t = m * PPM;
    else t = BIG * PPM + 55 * Math.log(m / BIG); // (giants: still growing, ever more gently)
    if (t < SMALL_PX) t = SMALL_PX - (SMALL_PX - t) * 0.45; // (the tiniest: lifted just enough to see)
    return U.clamp(t, min || MIN_PX, cap || MAX_PX);
  }
  // how tall its sprite is drawn now (the game draws sprites at twice their pixel size)
  function spriteH(dex) { return 2 * (SH[dex] || 26); }
  function metric(dex) { return target(meters(dex)) / (BIG * PPM / 2); } // (≈1 for a 1.1 m Pokémon)
  function species(dex, cap, min) {
    const key = cap ? dex + ':' + cap : dex;
    let k = cache.get(key);
    if (k != null) return k;
    k = U.clamp(target(meters(dex), cap, min) / spriteH(dex), 0.35, 8);
    cache.set(key, k);
    return k;
  }
  // the factor actually used for this individual
  function of(e) {
    if (!on() || !e || e.dex == null) return 1;
    if (e.psxK != null && e._psxKOn) return e.psxK;
    let k = species(e.dex);
    if (e.remote) k *= 1;
    else k *= 1 + (U.hash(e.id | 0, e.dex, 31) - 0.5) * 0.12; // natural variation
    if (e.boss || e.legend) k *= 1.12;
    e.psxK = k; e._psxKOn = true;
    return k;
  }
  // collision follows the body, moderately (combat balance stays close to the original)
  function apply(e) {
    if (!on() || !e || e._psxR0 != null || e.dummy) return;
    const k = of(e);
    e._psxR0 = e.r;
    // (the body's footprint grows with it, a little less than in proportion, and never past 48 px)
    e.r = Math.min(48, e.r * U.clamp(0.35 + 0.65 * k, 0.7, 2.6));
  }
  // how tall it stands on screen (px): for speech bubbles, wading depth…
  function top(e) { return e.dex != null && SH[e.dex] ? spriteH(e.dex) * (e.psxK || 1) : (e.bodyH || 30) * (e.psxK || 1); }

  function scaledDraw(orig, kOf) {
    return function (ctx) {
      const k = kOf(this);
      if (k === 1 || !(k > 0)) return orig.apply(this, arguments);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(k, k);
      ctx.translate(-this.x, -this.y);
      try { return orig.apply(this, arguments); } finally { ctx.restore(); }
    };
  }
  const wrapEnemyDraw = (orig) => scaledDraw(orig, of);
  // your own Pokémon: the same rule, capped a little lower (only how it looks)
  const wrapPlayerDraw = (orig) => scaledDraw(orig, (p) => {
    if (!on() || !p.mon) return 1;
    const dex = p.mon.dex != null ? p.mon.dex : p.dex;
    if (dex == null) return 1;
    return species(dex, PLAYER_MAX, PLAYER_MIN);
  });

  AI.define('Scale', { metric, species, target, meters, spriteH, of, apply, top, wrapEnemyDraw, wrapPlayerDraw, cache, PPM, MAX_PX });
})();
