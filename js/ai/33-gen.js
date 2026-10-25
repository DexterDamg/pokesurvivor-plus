/* PokéSurvivor+ — Living World AI · world generation parameters
 * The game's terrain generator asks these (via two one-expression hooks in js/app.min.js) how many
 * solid "wall" blocks and how many trees to lay down in each area. Forests get continuous, open
 * forest floor instead of big rectangular raised blocks, with a measured tree density; other
 * areas keep the original values. Rift arenas are untouched (they don't use these rules). A third
 * hook keeps trees, rocks and chests off the haunted mansion's grounds and path. Two more: the
 * run clock holds inside the mansion (like it does in rift arenas), and the Shady Forest no longer
 * hides poison/grass/fire traps in its floor. In the Shady Forest, water, trees and tall grass
 * follow the forest's own plan (34-forest.js). On the Tropical Ocean (Level 3) the sea, islands and
 * where the game may put its props come from the ocean's plan (34-ocean.js).
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
    trees(biome, grove, tx, ty) {
      // the Shady Forest plants its own trees, on an even, natural spacing (34-forest.js); the
      // Tropical Ocean's palms are decor (34-ocean-draw.js)
      if (tx != null && AI.Ocean) { const o = AI.Ocean.trees(biome); if (o != null) return o; }
      if (tx != null && AI.Forest) { const f = AI.Forest.trees(biome, grove, tx, ty); if (f != null) return f; }
      const g = on() && GEN[biome];
      const k = AI.cfg.treeDensity == null ? 1 : AI.cfg.treeDensity;
      if (!g) return grove ? 0.07 : 0.006;
      return (grove ? g.trees[0] : g.trees[1]) * k;
    },
    // the Shady Forest's water comes from its own plan (a great lake, a stream, ponds), not the game's noise
    terr(biome, tx, ty) {
      if (AI.Ocean) { const o = AI.Ocean.terr(biome, tx, ty); if (o >= 0) return o; } // (the Tropical Ocean's sea and islands: 34-ocean.js)
      return AI.Forest ? AI.Forest.terr(biome, tx, ty) : -1;
    },
    // its tall grass grows only where it belongs (not in water, on paths or in sanctuaries)
    grass(biome, tx, ty) {
      if (AI.Ocean) { const o = AI.Ocean.grass(biome, tx, ty); if (o != null) return o; }
      return AI.Forest ? AI.Forest.grass(biome, tx, ty) : true;
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
    // wild Pokémon keep their HP, but no health bars float over them
    noBars() { return AI.enabled && AI.cfg.enemyBars !== true; },
    // no hidden poison/grass/fire floor traps in the Shady Forest
    noTrap(biome) { return AI.enabled && biome === 0 && AI.cfg.forestTraps !== true; },
    // nothing grows on the mansion grounds, along its path, or where the house's interior lies
    clear(tx, ty) {
      if (AI.enabled && AI.Ocean && AI.Ocean.on()) { try { return AI.Ocean.clear(tx, ty); } catch (e) { return false; } }
      if (!AI.enabled || !AI.Mansion) return false;
      try { return AI.Mansion.clearAt((tx + 0.5) * 32, (ty + 0.5) * 32); } catch (e) { return false; }
    },
  };
  AI.define('Gen', { GEN, on });
})();
