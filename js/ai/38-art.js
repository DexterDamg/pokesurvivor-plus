/* PokéSurvivor+ — Living World AI · environment art
 * Loads the forest sprite atlas (assets/env/atlas.png, index in 38-atlas.js) and draws its sprites
 * at the game's pixel scale. Also builds black silhouettes (for cast shadows) and picks the tree
 * and plant palettes for each area and season, so no two stretches of forest look the same.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const IDX = window.PSXAI_ATLAS || {};

  const img = new Image();
  let ready = false;
  img.onload = () => { ready = true; };
  img.onerror = () => AI.warn('art', 'atlas failed to load');
  try {
    const tag = document.querySelector('script[src*="js/ai/38-art.js"]');
    const v = tag && (tag.getAttribute('src').match(/v=([0-9a-f]+)/) || [])[1];
    img.src = 'assets/env/atlas.png' + (v ? '?v=' + v : '');
  } catch (e) { img.src = 'assets/env/atlas.png'; }

  const PX = 2; // the game's pixel scale
  function has(name) { return !!IDX[name]; }
  function size(name) { const r = IDX[name]; return r ? [r[2] * PX, r[3] * PX] : [0, 0]; }

  // draw a sprite with its bottom-centre at (x, y)
  function draw(ctx, name, x, y, o) {
    const r = IDX[name];
    if (!ready || !r) return false;
    const s = (o && o.scale) || 1;
    const w = r[2] * PX * s, h = r[3] * PX * s;
    const sway = (o && o.sway) || 0;
    if (o && (o.flip || sway || o.alpha != null)) {
      ctx.save();
      if (o.alpha != null) ctx.globalAlpha *= o.alpha;
      ctx.translate(Math.round(x), Math.round(y));
      if (sway) ctx.transform(1, 0, sway, 1, 0, 0); // lean from the base, like wind on a trunk
      if (o.flip) ctx.scale(-1, 1);
      ctx.drawImage(img, r[0], r[1], r[2], r[3], Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h));
      ctx.restore();
    } else {
      ctx.drawImage(img, r[0], r[1], r[2], r[3], Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
    }
    return true;
  }

  // black silhouette of a sprite (atlas name or any canvas), cached — used for cast shadows
  const sil = new Map();
  const silCanvas = new WeakMap();
  function silhouette(src) {
    if (typeof src === 'string') {
      if (!ready || !IDX[src]) return null;
      let c = sil.get(src);
      if (c) return c;
      const r = IDX[src];
      c = document.createElement('canvas');
      c.width = r[2]; c.height = r[3];
      const g = c.getContext('2d');
      g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#000';
      g.fillRect(0, 0, r[2], r[3]);
      sil.set(src, c);
      return c;
    }
    if (!src || !src.width) return null;
    let c = silCanvas.get(src);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    silCanvas.set(src, c);
    return c;
  }

  // ---------------------------------------------------------------- palettes per area & season
  const R1 = (set, cols) => cols.flatMap((c) => ['tree_round_' + set + c, 'tree_tall_' + set + c]);
  const EVERGREEN = ['pine_a', 'pine_b', 'pine_c', 'pine_d', 'fir_a', 'fir_b', 'fir_c', 'fir_d', 'fir_e', 'cypress_a', 'cypress_b', 'cone_e', 'cone_f'];
  const BROADLEAF = ['oak_a', 'oak_b', 'oak_c', 'oak_d', 'ball_a', 'ball_b', 'ball_big_a', 'ball_big_b', 'cone_a', 'cone_b', 'cone_c', 'cone_d',
    'gnarl_a', 'gnarl_b', 'rootoak', 'broad_a', 'puff_a', 'puff_b', 'puff_c', 'puff_d', 'flat_a', 'flat_b', 'spiky_a', 'spiky_b', 'tree_slim', 'tree_skinny'];
  const TREES = {
    forest: {
      spring: [...BROADLEAF, ...EVERGREEN, ...R1(0, [1, 2]), ...R1(1, [0, 3]), 'tree_round_18', 'tree_tall_18', 'tree_round_18'],
      summer: [...BROADLEAF, ...BROADLEAF, ...EVERGREEN, ...R1(0, [0, 1, 2]), ...R1(1, [0, 1, 3])],
      autumn: [...R1(0, [3, 4, 5, 3, 5]), ...R1(1, [2, 4, 5, 6, 7, 5, 6]), ...EVERGREEN.slice(0, 6), 'oak_a', 'gnarl_a'],
      winter: [...R1(0, [8, 8, 8, 7]), ...EVERGREEN, ...R1(1, [1])],
    },
    jungle: { all: ['giant_vine_a', 'giant_vine_b', 'giant_a', 'giant_b', 'gnarl_a', 'gnarl_b', 'broad_a', 'spiky_a', 'spiky_b', 'oak_c', 'oak_d', 'flat_a', 'flat_b', 'rootoak'] },
    haunted: { all: ['haunt_tree_a', 'haunt_tree_b', 'haunt_tree_a', 'haunt_tree_b', 'deadsapling_a', 'gnarl_b', ...R1(1, [1, 7])] },
    ice: { all: [...R1(0, [7, 8, 8]), 'fir_b', 'pine_c'] },
  };
  const GIANTS = ['giant_a', 'giant_b', 'giant_vine_a', 'giant_vine_b'];
  // 'grass' props (destructible undergrowth)
  const UNDER = {
    spring: ['tallgrass_big', 'tuft_5', 'fern', 'bushball_01', 'bushball_02', 'bushtiny_01', 'sapling_01', 'cone_02', 'bush_wide', 'shrub', 'tuft_1', 'tuft_5'],
    summer: ['tallgrass_big', 'tuft_5', 'fern', 'bushball_00', 'bushball_01', 'bushball_11', 'bushtiny_10', 'sapling_00', 'cone_01', 'bush_wide', 'shrub', 'tuft_1', 'tuft_5'],
    autumn: ['tuft_3', 'tuft_0', 'tuftlow_3', 'bushball_03', 'bushball_05', 'bushball_15', 'bushtiny_14', 'cone_05', 'sapling_13', 'fern', 'tuft_0'],
    winter: ['tuft_4', 'tuft_7', 'bushball_08', 'bushtiny_08', 'cone_08', 'sapling_07', 'tuft_2'],
  };
  const HAUNT_UNDER = ['haunt_weed_a', 'haunt_weed_b', 'haunt_reed', 'deadsapling_b', 'tuft_7'];

  // which look an area gets (null: keep the game's own art)
  function theme(biome) {
    if (biome === 0 || biome === 3 || biome === 14) return 'forest';
    if (biome === 6) return 'jungle';
    if (biome === 16 || biome === 20) return 'haunted';
    if (biome === 8) return 'ice';
    return null;
  }
  function treeFor(prop, biome, season) {
    const th = theme(biome);
    if (!th) return null;
    const h = U.hash(prop.tx, prop.ty, 4242);
    if (th === 'forest' && h > 0.985) return GIANTS[(h * 1000 | 0) % 2]; // a rare ancient tree
    const T = TREES[th];
    const list = T.all || T[season] || T.summer;
    return list[(U.hash(prop.tx, prop.ty, 4243) * list.length) | 0];
  }
  function underFor(prop, biome, season) {
    const th = theme(biome);
    if (!th || th === 'jungle' && false) return null;
    const list = th === 'haunted' ? HAUNT_UNDER : th === 'ice' ? UNDER.winter : UNDER[season] || UNDER.summer;
    return list[(U.hash(prop.tx, prop.ty, 5151) * list.length) | 0];
  }

  AI.define('Art', {
    PX, img, IDX, has, size, draw, silhouette, theme, treeFor, underFor, TREES, UNDER, EVERGREEN, BROADLEAF,
    get ready() { return ready; },
  });
})();
