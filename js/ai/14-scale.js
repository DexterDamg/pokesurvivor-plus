/* PokéSurvivor+ — Living World AI · species-appropriate Pokémon sizes
 * The game's sprites come in roughly standardised sizes, so a Joltik, a Pikachu and a Snorlax can
 * end up about as big as each other. Each species is now scaled toward a believable size, starting
 * from its Pokédex height and weight (12-sizes.js): height for stature, the cube root of weight for
 * bulk. The difference to the sprite's current size is compressed, so tiny Pokémon stay visible and
 * enormous ones don't swallow the screen. Individuals vary a little (about ±6%), bosses are a touch
 * larger, and your partner is scaled more gently (visual only). Collision grows moderately with
 * size; everything is drawn at whole-transform scale, so sprites stay crisp.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const SZ = window.PSXAI_SIZES || { h: [], w: [] };

  const cache = new Map(); // dex → species factor
  function on() { return AI.enabled && AI.cfg.speciesScale !== false; }
  // how big the species really is (≈1 for a 1.2 m, 50 kg Pokémon)
  function metric(dex) {
    const h = (SZ.h[dex] || 10) / 10, w = (SZ.w[dex] || 300) / 10;
    return Math.sqrt(h) * 0.65 + (Math.cbrt(Math.max(0.1, w)) / 3.9) * 0.35;
  }
  function species(dex) {
    let k = cache.get(dex);
    if (k != null) return k;
    const R = AI.R;
    let cur = 14;
    try { cur = R.Sprites.bodyRadius(dex, 1) || 14; } catch (e) { /* ignore */ }
    const want = 15 * metric(dex);
    k = Math.pow(want / cur, 0.7);
    if (k < 0.8) k = 0.8 - (0.8 - k) * 0.6; // small ones shrink gently, so the tiniest stay visible
    k = U.clamp(k, 0.6, 1.8);
    cache.set(dex, k);
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
    e.r = e.r * U.clamp(0.55 + 0.45 * k, 0.8, 1.35);
  }
  function top(e) { return (e.bodyH || 30) * (e.psxK || 1); }

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
  // the partner: same idea, gentler, and only how it looks
  const wrapPlayerDraw = (orig) => scaledDraw(orig, (p) => {
    if (!on() || !p.mon) return 1;
    const dex = p.mon.dex != null ? p.mon.dex : p.dex;
    if (dex == null) return 1;
    return U.clamp(Math.pow(species(dex), 0.6), 0.8, 1.35);
  });

  AI.define('Scale', { metric, species, of, apply, top, wrapEnemyDraw, wrapPlayerDraw, cache });
})();
