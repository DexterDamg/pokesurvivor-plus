/* PokéSurvivor+ — Living World AI · world generation parameters
 * The game's terrain generator asks these (via two one-expression hooks in js/app.min.js) how many
 * solid "wall" blocks and how many trees to lay down in each area. Forests get continuous, open
 * forest floor instead of big rectangular raised blocks, with a measured tree density; other
 * areas keep the original values. Rift arenas are untouched (they don't use these rules). A third
 * hook keeps trees, rocks and chests off the haunted mansion's grounds and path. Two more: the
 * run clock holds inside the mansion (like it does in rift arenas), and the Shady Forest no longer
 * hides poison/grass/fire traps in its floor.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;

  // per-biome overrides: wall = share of solid blocks (game default 0.27), trees = [grove, sparse]
  const GEN = {
    0: { wall: 0, trees: [0.05, 0.011] }, // Bosque Umbrío: open woodland, groves and clearings
    3: { wall: 0, trees: [0.035, 0.007] }, // Pradera Eterna: meadows with scattered trees
    14: { wall: 0, trees: [0.05, 0.01] }, // Bosque Colmena
    20: { wall: 0.06, trees: [0.05, 0.01] }, // Bosque Encantado: a few rocky outcrops
  };
  function on() { return AI.enabled && AI.cfg.naturalTerrain !== false; }

  window.PSXGEN = {
    wall(biome) {
      const g = on() && GEN[biome];
      return g ? g.wall : 0.27;
    },
    trees(biome, grove) {
      const g = on() && GEN[biome];
      const k = AI.cfg.treeDensity == null ? 1 : AI.cfg.treeDensity;
      if (!g) return grove ? 0.07 : 0.006;
      return (grove ? g.trees[0] : g.trees[1]) * k;
    },
    // the run clock holds while you're inside the haunted mansion (in co-op: while everyone is) or a story scene plays
    hold() {
      if (!AI.enabled || !AI.Mansion) return false;
      try {
        if (AI.Story && AI.Story.busy()) return true;
        if (!AI.Mansion.inside) return false;
        return AI.players.every((p) => p && AI.Mansion.inInterior(p.x, p.y));
      } catch (e) { return false; }
    },
    // no hidden poison/grass/fire floor traps in the Shady Forest
    noTrap(biome) { return AI.enabled && biome === 0 && AI.cfg.forestTraps !== true; },
    // nothing grows on the mansion grounds, along its path, or where the house's interior lies
    clear(tx, ty) {
      if (!AI.enabled || !AI.Mansion) return false;
      try { return AI.Mansion.clearAt((tx + 0.5) * 32, (ty + 0.5) * 32); } catch (e) { return false; }
    },
  };
  AI.define('Gen', { GEN, on });
})();
