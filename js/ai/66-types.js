/* PokéSurvivor+ — Living World AI · types matter, as in the Pokémon games
 * The game's own type chart already knows every matchup, but softens it: super effective was ×1.6,
 * not very effective ×0.6, and "no effect" still did 30% (with at least 1 damage). Now the real
 * multipliers apply, to your attacks, to wild Pokémon's attacks on you, and to Pokémon fighting each
 * other:
 *   - super effective ×2, not very effective ×½, and both types count (×4, ×¼)
 *   - no effect means NO effect: no damage, no burn, poison, slow or stun, just "No effect"
 *     (Ground → Flying, Normal and Fighting → Ghost, Ghost → Normal, Electric → Ground,
 *     Psychic → Dark, Dragon → Fairy, Poison → Steel)
 * Strong winds still take away Flying's weaknesses (the game's own rule). With the setting off,
 * the game's softer chart comes back. Setting: realTypes.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;

  const st = { hooked: false, immune: 0 };
  function on() { return AI.enabled && AI.cfg.realTypes !== false; }

  // the real multiplier of an attack type against a Pokémon's types
  function real(type, types) {
    const R = AI.R, row = R.Types.CHART[type];
    if (!row || !types) return 1;
    const winds = R.Weather && R.Weather.windsOn;
    let k = 1;
    for (const t of types) {
      const v = row[t];
      if (v == null) continue;
      if (winds && t === 'flying' && v > 1) continue;
      k *= v;
    }
    return Math.min(4, k);
  }
  function immune(type, types) { return on() && !!type && real(type, types) === 0; }

  // "No effect", over its head (not every frame for the same Pokémon)
  function noEffect(ent) {
    const now = performance.now();
    ent._psxImmuneT = now;
    st.immune++;
    if (now - (ent._psxNoFxT || 0) < 600) return;
    ent._psxNoFxT = now;
    try { AI.R.FX.dmgText(ent.x, ent.y - (AI.Scale ? AI.Scale.top(ent) : ent.bodyH || 30) - 8, AI.lang && AI.lang() === 'es' ? 'No afecta' : 'No effect', '#b8c2d0'); } catch (e) { /* ignore */ }
  }

  function install(R) {
    if (st.hooked || !R.Types || typeof R.Types.mult !== 'function') return;
    st.hooked = true;
    const T = R.Types;
    const oMult = T.mult, oLabel = T.label;
    T.mult = function (type, types) { return on() ? real(type, types) : oMult.apply(this, arguments); };
    T.label = function (k) { return on() && k === 0 ? 'weak' : oLabel.apply(this, arguments); };

    // a hit the target is immune to does nothing (the game passes the move's type label along: a
    // zero multiplier leaves the damage at 0)
    const EP = R.Enemy.prototype;
    const oHurt = EP.hurt;
    EP.hurt = function (amt) {
      if (on() && !(amt > 0) && !this.dead) { noEffect(this); return; }
      return oHurt.apply(this, arguments);
    };
    // …and no burn, poison, slow or stun comes with it
    for (const k of ['applyBurn', 'applyPoison', 'applySlow', 'applyStun']) {
      const o = EP[k];
      if (typeof o !== 'function') continue;
      EP[k] = function () { if (on() && this._psxImmuneT && performance.now() - this._psxImmuneT < 40) return; return o.apply(this, arguments); };
    }
    // you, hit by a type your Pokémon is immune to
    const PP = R.Player.prototype;
    const oPHurt = PP.hurt;
    PP.hurt = function (amt, type) {
      if (type && this.mon && immune(type, this.mon.types) && !this.dead) { noEffect(this); return; }
      return oPHurt.apply(this, arguments);
    };
    const oTri = PP.triStatus;
    if (typeof oTri === 'function') PP.triStatus = function () { if (on() && this._psxImmuneT && performance.now() - this._psxImmuneT < 40) return; return oTri.apply(this, arguments); };
  }

  AI.define('Types', { st, install, real, immune, noEffect });
})();
