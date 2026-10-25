/* PokéSurvivor+ — Living World AI · forest decor & environmental memory
 * Fills each area with deterministic, varied decor (fallen logs, stumps, bushes, berry bushes,
 * ferns, wildflowers, grass tufts, mushrooms, burrows, old lanterns) that doubles as Pokémon
 * habitat. At the end of the Shady Forest it lays out the old dirt path, lined with lamp posts, that
 * leads to the gates of the haunted mansion. And the world remembers, for a while: footprints, mud where you keep walking
 * in the rain, puddles in the low spots, shaking bushes, nibbled leaves, freshly dug burrows.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  let seed = 1;
  const chunks = new Map(); // "cx,cy" → items
  const dyn = []; // items added while playing (dug burrows, storm-felled trees…)
  let nextId = 1;
  let trail = null;
  let cave = null;
  const nibbled = new Set();
  const shake = new Map(); // item/prop key → seconds of shaking left
  const visitedPatches = new Set();

  // ---------------------------------------------------------------- helpers
  const W = () => AI.R.World;
  function TS() { return W().TS; }
  function CH() { return TS() * 16; }
  function floorAt(x, y) { try { return W().kindAt(x, y) === 'floor'; } catch (e) { return false; } }
  function free(x, y, r) { try { return W().isFree(x, y, r); } catch (e) { return false; } }
  function ok(x, y, r) { return floorAt(x, y) && free(x, y, r) && Math.hypot(x, y) > 230 && !(AI.Mansion && AI.Mansion.clearAt(x, y)); }
  function rnd(cx, cy, i) { return U.hash(cx * 73 + seed, cy * 151 - seed, i); }
  function themeNow() { return AI.Art ? AI.Art.theme(AI.Env.biome()) : null; }
  function season() { return AI.Sky ? AI.Sky.season() : 'summer'; }
  function item(o) { o.id = nextId++; if (o.s == null) o.s = 1; return o; }

  // ---------------------------------------------------------------- chunk generation
  const FLOWER_COLS = { spring: [0, 1, 2, 3, 4, 5], summer: [0, 1, 2, 3, 4, 5], autumn: [3, 5, 2], winter: [] };
  const FLOWER_N = { spring: 16, summer: 10, autumn: 4, winter: 0 };
  const TUFTS = { spring: [1, 2, 5], summer: [1, 5, 0], autumn: [3, 0, 3], winter: [4, 7] };
  const BUSHES = {
    spring: ['bushball_01', 'bushball_02', 'cone_01', 'cone_12', 'bush_wide', 'shrub', 'bushtiny_02'],
    summer: ['bushball_00', 'bushball_11', 'cone_00', 'cone_10', 'bush_wide', 'shrub', 'bushtiny_13'],
    autumn: ['bushball_03', 'bushball_05', 'bushball_15', 'cone_05', 'cone_14', 'bushtiny_04', 'shrub'],
    winter: ['bushball_08', 'bushtiny_08', 'cone_08', 'bushball_07'],
  };
  const BERRY = { spring: 'berrycone_01', summer: 'berrycone_00', autumn: 'berrycone_05', winter: 'berrycone_08' };
  const LOGS = ['log_fallen', 'leaflog_00', 'log_dark', 'leaflog_11', 'log_fallen'];

  function genChunk(cx, cy) {
    const out = [];
    // the Tropical Ocean dresses its islands, beaches and reefs itself (34-ocean-draw.js)
    if (AI.Ocean && AI.Ocean.on() && AI.OceanDraw && AI.cfg.newArt) {
      const ch = CH();
      let i = 0;
      const R = () => rnd(cx, cy, i++);
      const roomy = (x, y, r) => free(x, y, r) && Math.hypot(x, y) > 120 && !out.some((o) => !o.flat && o.r && Math.hypot(o.x - x, o.y - y) < o.r + r);
      AI.OceanDraw.decor(cx, cy, ch, R, (o) => out.push(item(o)), roomy);
      return out;
    }
    const th = themeNow();
    if (!th || !AI.cfg.newArt) return out;
    const ch = CH(), x0 = cx * ch, y0 = cy * ch;
    const sea = season();
    // forests keep their greenery all year; the season shows in the flowers
    const veg = th === 'forest' && (sea === 'autumn' || sea === 'winter') ? 'summer' : sea;
    let i = 0;
    const R = () => rnd(cx, cy, i++);
    const spot = (r, tries = 6) => {
      for (let k = 0; k < tries; k++) {
        const x = x0 + 30 + R() * (ch - 60), y = y0 + 30 + R() * (ch - 60);
        if (ok(x, y, r)) return [x, y];
      }
      return null;
    };
    const push = (o) => out.push(item(o));
    // the Shady Forest grows its undergrowth by habitat (34-forest.js)
    if (AI.Env.biome() === 0 && AI.Forest && AI.cfg.forestWorld !== false) {
      // (nothing grows into anything else placed in this chunk)
      const roomy = (x, y, r) => ok(x, y, r) && !out.some((o) => !o.flat && (o.r || o.k === 'log') && Math.abs(o.x - x) < 70 && Math.abs(o.y - y) < 40 && (o.k === 'log' ? Math.abs(o.x - x) < 44 + r && Math.abs(o.y - y) < 16 + r : Math.hypot(o.x - x, o.y - y) < (o.r || 8) + r));
      const spot2 = (r) => { for (let k = 0; k < 6; k++) { const x = x0 + 30 + R() * (ch - 60), y = y0 + 30 + R() * (ch - 60); if (roomy(x, y, r) && AI.Forest.water(x, y).e < -30) return [x, y]; } return null; };
      if (R() < 0.45) { const c = spot2(30); if (c) push({ k: 'log', n: LOGS[(R() * LOGS.length) | 0], x: c[0], y: c[1], f: R() < 0.5, hab: 'log', r: 22 }); }
      if (R() < 0.5) { const c = spot2(16); if (c) push({ k: 'stump', n: R() < 0.6 ? 'stump_small' : R() < 0.5 ? 'stump_dark' : 'stump_big', x: c[0], y: c[1], f: R() < 0.5, hab: 'log', r: 14 }); }
      if (R() < 0.4) { const c = spot2(14); if (c) push({ k: 'bush', n: BERRY.summer, x: c[0], y: c[1], f: R() < 0.5, hab: 'berry', r: 12, berries: 3 }); }
      if (R() < 0.45) { const c = spot2(14); if (c) push({ k: 'burrow', x: c[0], y: c[1], hab: 'burrow', r: 12, flat: true }); }
      AI.Forest.decor(cx, cy, ch, R, push, roomy);
      return out;
    }
    if (th === 'forest' || th === 'jungle') {
      // wildflower clusters
      const cols = FLOWER_COLS[sea];
      const nF = th === 'jungle' ? 3 : FLOWER_N[sea];
      for (let n = 0; n < nF && cols.length; n++) {
        const c = spot(8);
        if (!c) continue;
        const col = cols[(R() * cols.length) | 0];
        const k = 2 + ((R() * 4) | 0);
        for (let m = 0; m < k; m++) {
          const fx = c[0] + (R() - 0.5) * 50, fy = c[1] + (R() - 0.5) * 30;
          if (!floorAt(fx, fy)) continue;
          const kind = ['flower_a', 'flower_b', 'flower_c', 'flower_s', 'flower_s'][(R() * 5) | 0];
          push({ k: 'flower', n: kind + col, x: fx, y: fy, s: 0.7 + R() * 0.25, f: R() < 0.5, flat: true });
        }
      }
      // grass tufts and low tufts
      const tc = TUFTS[veg];
      for (let n = 0; n < 16; n++) {
        const c = spot(6, 3);
        if (!c) continue;
        push({ k: 'tuft', n: (R() < 0.5 ? 'tuft_' : 'tuftlow_') + tc[(R() * tc.length) | 0], x: c[0], y: c[1], s: 0.85 + R() * 0.3, f: R() < 0.5, flat: true });
      }
      // ferns, sprouts, saplings
      for (let n = 0; n < 3; n++) {
        const c = spot(10);
        if (c) push({ k: 'plant', n: ['fern', 'sprout', veg === 'autumn' ? 'sapling_13' : veg === 'winter' ? 'sapling_07' : 'sapling_01'][(R() * 3) | 0], x: c[0], y: c[1], f: R() < 0.5, hab: 'bush', r: 8 });
      }
      // bushes (Caterpie, Weedle and friends live here)
      const bl = BUSHES[veg];
      for (let n = 0; n < 5; n++) {
        const c = spot(14);
        if (c) push({ k: 'bush', n: bl[(R() * bl.length) | 0], x: c[0], y: c[1], f: R() < 0.5, hab: 'bush', r: 14 });
      }
      if (R() < 0.6) { const c = spot(14); if (c) push({ k: 'bush', n: BERRY[veg], x: c[0], y: c[1], f: R() < 0.5, hab: 'berry', r: 12, berries: 3 }); }
      // fallen logs and stumps (Rattata hangouts)
      for (let n = 0; n < (R() < 0.35 ? 2 : 1); n++) {
        if (R() > 0.75) continue;
        const c = spot(26);
        if (c) push({ k: 'log', n: LOGS[(R() * LOGS.length) | 0], x: c[0], y: c[1], f: R() < 0.5, hab: 'log', r: 22 });
      }
      if (R() < 0.65) { const c = spot(14); if (c) push({ k: 'stump', n: R() < 0.6 ? 'stump_small' : R() < 0.5 ? 'stump_dark' : 'stump_big', x: c[0], y: c[1], f: R() < 0.5, hab: 'log', r: 14 }); }
      // mushrooms: a few glow at night
      for (let n = 0; n < 2; n++) {
        const c = spot(8);
        if (!c) continue;
        const glow = R() < 0.14;
        push({ k: 'mush', n: glow ? (R() < 0.5 ? 'ghostshroom' : 'ghostshroom_s') : ['mushroom_mid', 'mushroom_small', 'mushroom_big'][(R() * 3) | 0], x: c[0], y: c[1], s: 0.8, f: R() < 0.5, hab: 'mush', r: 8,
          light: glow ? { r: 46, c: [255, 160, 70], kind: 'glow' } : null });
      }
      // burrows
      if (R() < 0.55) { const c = spot(14); if (c) push({ k: 'burrow', x: c[0], y: c[1], hab: 'burrow', r: 12, flat: true }); }
    } else if (th === 'haunted') {
      for (let n = 0; n < 4; n++) { const c = spot(8); if (c) push({ k: 'mush', n: R() < 0.5 ? 'ghostshroom' : 'ghostshroom_big', x: c[0], y: c[1], s: 0.8, hab: 'mush', r: 8, light: { r: 50, c: [255, 150, 70], kind: 'glow' } }); }
      for (let n = 0; n < 6; n++) { const c = spot(8); if (c) push({ k: 'plant', n: ['haunt_weed_a', 'haunt_weed_b', 'haunt_reed', 'deadsapling_b'][(R() * 4) | 0], x: c[0], y: c[1], f: R() < 0.5, hab: 'bush', r: 8 }); }
      if (R() < 0.5) { const c = spot(14); if (c) push({ k: 'grave', n: ['haunt_grave_a', 'haunt_grave_b', 'grave_a', 'grave_b', 'cross'][(R() * 5) | 0], x: c[0], y: c[1], r: 10 }); }
      if (R() < 0.35) { const c = spot(10); if (c) push({ k: 'candle', n: R() < 0.5 ? 'candles' : 'candle_one', x: c[0], y: c[1], r: 6, light: { r: 70, c: [255, 190, 110], kind: 'candle' }, lit: true }); }
    } else if (th === 'ice') {
      for (let n = 0; n < 8; n++) { const c = spot(6, 3); if (c) push({ k: 'tuft', n: 'tuft_' + (R() < 0.5 ? 4 : 7), x: c[0], y: c[1], flat: true, f: R() < 0.5 }); }
    }
    return out;
  }

  // (generation checks free space, which looks at decor: while a chunk is being generated, that
  // look only sees chunks that already exist, so generating never sets off more generating)
  let generating = 0;
  const NONE = [];
  function chunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = chunks.get(key);
    if (!c) {
      if (generating) return NONE;
      generating++;
      try { c = genChunk(cx, cy); } finally { generating--; }
      if (chunks.size > 260) chunks.delete(chunks.keys().next().value);
      chunks.set(key, c);
    }
    return c;
  }

  // ---------------------------------------------------------------- the old trail and the mansion (end of the Shady Forest)
  /* The haunted mansion is the end of the Shady Forest. It doesn't exist when a run starts: once
   * the party has spent long enough in the forest, the journey (84-journey.js) chooses where it
   * stands, ahead of the party and out of sight, and hands its geometry here. A shady dirt path,
   * lined with small candles, runs from S to the tall iron gates under their arch; behind the gates:
   * a long courtyard with a fountain that stopped working long ago, an abandoned shed on the far left,
   * gargoyles by the door, the three-storey house itself (door at D, always facing south) and,
   * behind it, a walled backyard. If the path starts behind the house it swings around the side. */
  function mansionGeom(S, D) {
    D = [Math.round(D[0]), Math.round(D[1])];
    S = [S[0], S[1]];
    const G = [D[0], D[1] + 640]; // the gates
    const C = [G[0], G[1] + 420];
    const SW = 600; // the grounds' half width
    const HW = 466, HH = 340; // the house's half width and height
    const BY = 520; // the backyard's depth, behind the house
    const top = D[1] - HH - BY;
    const way = [S];
    if (S[1] < G[1] + 260) { const sd = S[0] < D[0] ? -1 : 1; way.push([D[0] + sd * (SW + 430), G[1] + 160]); }
    way.push(C, G);
    // a smooth curve through the waypoints (Catmull-Rom), then sampled evenly
    const P = [way[0], ...way, way[way.length - 1]];
    const fine = [];
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      for (let k = 0; k < 80; k++) {
        const t = k / 80, t2 = t * t, t3 = t2 * t;
        fine.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
      }
    }
    fine.push(G.slice());
    const even = (step) => {
      const out = [fine[0]];
      let acc = 0;
      for (let i = 1; i < fine.length; i++) {
        acc += Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]);
        if (acc >= step) { out.push(fine[i]); acc = 0; }
      }
      if (out[out.length - 1] !== fine[fine.length - 1]) out.push(fine[fine.length - 1]);
      return out;
    };
    const a = Math.atan2(D[1] - S[1], D[0] - S[0]);
    return { a, S, D, G, C, SW, HW, HH, BY, top, GO: 160, F: [D[0], D[1] + 330], shed: [D[0] - 470, D[1] + 250], pts: even(110), dense: even(16), interior: [D[0], D[1] + 60000] };
  }
  // the area the mansion and its path take up (for clearing, choosing a site and regenerating)
  function mansionBox(g) {
    const xs = g.dense.map((q) => q[0]), ys = g.dense.map((q) => q[1]);
    return [Math.min(...xs, g.D[0] - g.SW) - 120, Math.min(...ys, g.top) - 120, Math.max(...xs, g.D[0] + g.SW) + 120, Math.max(...ys, g.G[1]) + 120];
  }
  // the journey hands over the mansion once it has chosen where it stands
  function setTrail(g) { trail = null; if (g) buildTrail(g); }
  function buildTrail(g) {
    trail = null;
    if (AI.Env.biome() !== 0 || !AI.cfg.newArt || !g) return;
    const { pts, dense, D, G, SW } = g;
    const items = [];
    const side = (p, q, d) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * d, p[1] + dx / l * d]; };
    // the dirt path: overlapping patches of trodden earth, ragged at the edges
    const dirtAlong = (list, from) => {
      for (let k = from; k < list.length; k++) {
        const p = list[k], q = list[Math.min(list.length - 1, k + 1)];
        const j = U.hash(k, seed, 11), jj = U.hash(k, seed, 12);
        const nx = q === p ? list[k - 1] : q;
        for (const off of [-13, 13]) {
          const o = side(p, nx, off + (j - 0.5) * 10);
          items.push(item({ k: 'dirt', n: (jj + off) % 2 < 1 ? 'g_dirt_s1' : 'g_dirt_s2', x: o[0], y: o[1] + 15, s: 0.5 + j * 0.12, f: jj > 0.5, flat: true }));
        }
        if (k % 4 === 0) {
          const e = side(p, nx, (jj < 0.5 ? -1 : 1) * (52 + j * 10));
          items.push(item({ k: 'tuft', n: jj < 0.3 ? 'tuft_1' : jj < 0.6 ? 'tuft_5' : 'tuftlow_1', x: e[0], y: e[1] + 4, s: 0.9, f: j < 0.5, flat: true }));
        }
      }
    };
    dirtAlong(dense, 0);
    // into the courtyard: up to the fountain, around it, and on to the door
    const { F, GO, HW, HH, top } = g;
    const court = [];
    for (let y = G[1]; y >= F[1] + 110; y -= 16) court.push([D[0], y]);
    dirtAlong(court, 0);
    const ring = [];
    for (let k = 0; k <= 40; k++) { const t = k / 40 * Math.PI * 2; ring.push([F[0] + Math.cos(t) * 150, F[1] + Math.sin(t) * 100]); }
    dirtAlong(ring, 0);
    const up = [];
    for (let y = F[1] - 110; y >= D[1] + 6; y -= 16) up.push([D[0], y]);
    dirtAlong(up, 0);
    // small candles along the path, in pairs (now and then one burns purple for a moment)
    for (let k = 1; k < pts.length - 1; k += 2) {
      const p = pts[k], q = pts[k + 1];
      if (Math.hypot(p[0] - G[0], p[1] - G[1]) < 170) continue;
      for (const sd of [-1, 1]) { const o = side(p, q, sd * 46); items.push(item({ k: 'mcandle', x: o[0], y: o[1], r: 0, light: { r: 60, c: [255, 190, 110], kind: 'candle' }, lit: true, protected: true, ghost: true })); }
    }
    // the old sign and the hanging lantern where the path leaves the woods
    const sgn = side(pts[0], pts[1], 70);
    items.push(item({ k: 'sign', n: 'sign', x: sgn[0], y: sgn[1], r: 8, vines: true, lore: 'sign' }));
    const lan = side(pts[1], pts[2], -78);
    items.push(item({ k: 'gallows', n: 'gallows', x: lan[0], y: lan[1], r: 8, light: { r: 130, c: [255, 186, 110], kind: 'lantern' }, lit: true, haunt: true, lore: 'lantern' }));
    // the woods die off as you near the house
    for (let k = pts.length - 6; k < pts.length - 1; k++) {
      if (k < 3) continue;
      const d = side(pts[k], pts[k + 1], (k % 2 ? 1 : -1) * (100 + U.hash(k, 9, 4) * 50));
      items.push(item({ k: 'plant', n: k % 2 ? 'deadsapling_a' : 'deadsapling_b', x: d[0], y: d[1], r: 8 }));
    }
    for (const sd of [-1, 1]) items.push(item({ k: 'wraith', x: G[0] + sd * (SW + 110), y: G[1] + 70, r: 16, frame: sd > 0 ? 3 : 0 }));
    // the gates: tall pillars under a wrought-iron arch, the gate leaves standing open; an iron fence
    // all the way around the grounds, backyard included
    items.push(item({ k: 'mgate', x: G[0], y: G[1] + 10, r: 0, w: GO }));
    for (const sd of [-1, 1]) {
      items.push(item({ k: 'gpillar', n: 'g_pillar_lamp', x: G[0] + sd * GO, y: G[1] + 8, r: 16, s: 1.3, light: { r: 90, c: [255, 190, 110], kind: 'lamp' }, lit: true, protected: true, ghost: true }));
      for (let x = GO + 80; x < SW - 50; x += 120) items.push(item({ k: 'fence_h', n: 'g_fence', x: G[0] + sd * x, y: G[1] + 4, r: 0, s: 0.8 }));
      items.push(item({ k: 'gpillar', n: 'g_pillar', x: G[0] + sd * SW, y: G[1] + 8, r: 12, s: 0.9 }));
      items.push(item({ k: 'gpillar', n: 'g_pillar', x: G[0] + sd * SW, y: top + 6, r: 12, s: 0.9 }));
      for (let y = G[1] - 60; y > top + 30; y -= 96) items.push(item({ k: 'fence_v', n: 'g_fence_v', x: G[0] + sd * SW, y, r: 0, s: 0.8 }));
      for (let x = 80; x < SW - 50; x += 120) items.push(item({ k: 'fence_h', n: 'g_fence', x: G[0] + sd * x, y: top + 4, r: 0, s: 0.8 }));
      items.push(item({ k: 'gargoyle', n: 'g_gargoyle', x: D[0] + sd * 78, y: D[1] + 16, r: 10, s: 0.6 }));
      // dead hedges and statues lining the courtyard
      for (let y = D[1] + 90; y < G[1] - 80; y += 130) items.push(item({ k: 'plant', n: (y / 130 | 0) % 2 ? 'deadsapling_a' : 'deadsapling_b', x: D[0] + sd * 210, y, r: 8 }));
    }
    // the fountain, long dry, in the middle of the courtyard
    items.push(item({ k: 'fountain', x: F[0], y: F[1], r: 0 }));
    // the shed on the far left, its doors banging in a wind that isn't there
    items.push(item({ k: 'shed', x: g.shed[0], y: g.shed[1], r: 0 }));
    items.push(item({ k: 'grave', n: 'g_statue', x: D[0] + 420, y: D[1] + 300, r: 12, s: 0.7 }));
    items.push(item({ k: 'grave', n: 'g_skull_b', x: D[0] + 380, y: D[1] + 420, r: 0, s: 0.5 }));
    items.push(item({ k: 'plant', n: 'deadsapling_a', x: D[0] + 500, y: D[1] + 140, r: 8 }));
    // the backyard: the family plot, a dead garden, the old gallows lamp, a few candles
    const by = top + 80;
    const plot = [['g_grave_tall', -260, 60], ['g_grave_cross', -200, 30], ['g_grave_emb', -320, 120], ['g_grave_a', -230, 150], ['g_grave_pale', -150, 100], ['g_grave_tall', 180, 70], ['g_grave_a', 250, 40], ['g_grave_cross', 300, 130], ['haunt_grave_a', 220, 170]];
    for (const [n, dx, dy] of plot) items.push(item({ k: 'grave', n, x: D[0] + dx, y: by + dy, r: 8, s: 0.5 }));
    for (const [dx, dy] of [[-205, 100], [255, 110], [-40, 230]]) items.push(item({ k: 'mcandle', x: D[0] + dx, y: by + dy, r: 0, light: { r: 55, c: [255, 190, 110], kind: 'candle' }, lit: true, protected: true, ghost: true }));
    items.push(item({ k: 'grave', n: 'g_statue', x: D[0], y: by + 120, r: 12, s: 0.7 }));
    items.push(item({ k: 'hanglamp', n: 'g_gallows2', x: D[0] + 470, y: by + 260, r: 8, s: 0.6, light: { r: 80, c: [255, 186, 110], kind: 'lantern' }, lit: true, haunt: true, ghost: true }));
    for (const [n, dx, dy] of [['deadsapling_a', -480, 40], ['deadsapling_b', -420, 250], ['haunt_tree_b', 470, 60], ['haunt_tree_a', -520, 330], ['deadsapling_b', 100, 300]]) items.push(item({ k: 'plant', n, x: D[0] + dx, y: by + dy, r: 8 }));
    for (const [dx, dy] of [[-120, 290], [60, 40], [380, 280]]) items.push(item({ k: 'grave', n: 'g_skull_a', x: D[0] + dx, y: by + dy, r: 0, s: 0.45 }));
    // what was once a garden: rows of dead shrubs, a crumbled wall, weeds, a broken fence inside
    for (let k = 0; k < 6; k++) for (const sd of [-1, 1]) items.push(item({ k: 'plant', n: k % 2 ? 'haunt_weed_a' : 'haunt_weed_b', x: D[0] + sd * (90 + k * 34), y: by + 330 + (k % 2) * 12, r: 0, flat: k % 2 === 0 }));
    for (const [dx, dy] of [[-400, 160], [400, 200]]) items.push(item({ k: 'grave', n: 'g_wall_grey', x: D[0] + dx, y: by + dy, r: 0, s: 0.6 }));
    for (const [dx, dy, ang] of [[-110, 210, 0.2], [130, 250, -0.3]]) items.push(item({ k: 'fence', x: D[0] + dx, y: by + dy, r: 0, ang, broken: 0.7 }));
    for (const [dx, dy] of [[-330, 280], [330, 330], [-60, 120], [140, 180]]) items.push(item({ k: 'grave', n: 'm_rubble', x: D[0] + dx, y: by + dy, r: 0, s: 0.8 }));
    for (const [n, dx, dy] of [['haunt_grave_b', -360, 60], ['g_grave_pale', 360, 50], ['haunt_reed', -470, 180], ['haunt_reed', 460, 150]]) items.push(item({ k: 'grave', n, x: D[0] + dx, y: by + dy, r: n.startsWith('haunt_reed') ? 0 : 8, s: 0.6 }));
    // the house: dark windows, a few glowing violet, some warm
    items.push(item({ k: 'mansion', x: D[0], y: D[1], r: 0 }));
    const art = window.PSXAI_MANSION_ART;
    if (art) for (const [dx, dy, c] of art.mansion.wins) items.push(item({ k: 'mwin', x: D[0] + dx, y: D[1] - dy + 12, r: 0, flat: true, light: { r: 60, c: c === 'w' ? [255, 200, 120] : [190, 120, 255], kind: 'glow' } }));
    void HW; void HH;
    trail = { pts, items, start: pts[0], end: G.slice(), dir: -Math.PI / 2, mansion: g };
  }
  // a cave sealed by boulders, for later
  function buildCave() {
    cave = null;
    if (AI.Env.biome() !== 0 || !AI.cfg.newArt) return;
    const ca = U.hash(seed, 3, 3) * Math.PI * 2;
    cave = item({ k: 'cave', x: Math.cos(ca) * 1900, y: Math.sin(ca) * 1900, r: 30 });
  }
  // how deep inside the trail's haunted stretch a point is (0 outside … 1 at the end)
  function trailZone(x, y) {
    if (!trail) return 0;
    let best = 0;
    for (let k = 3; k < trail.pts.length; k++) {
      const p = trail.pts[k];
      const d = Math.hypot(x - p[0], y - p[1]);
      if (d < 190) best = Math.max(best, (k - 2) / (trail.pts.length - 2) * (1 - d / 190 * 0.5));
    }
    return best;
  }

  // ---------------------------------------------------------------- queries
  const tmp = [];
  function inRect(x0, y0, x1, y1, out = tmp) {
    out.length = 0;
    const ch = CH();
    for (let cy = Math.floor(y0 / ch); cy <= Math.floor(y1 / ch); cy++)
      for (let cx = Math.floor(x0 / ch); cx <= Math.floor(x1 / ch); cx++)
      {
        for (const it of chunk(cx, cy)) if (it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1) out.push(it);
        const fx = fixed.get(cx + ',' + cy);
        if (fx) for (const it of fx) if (it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1) out.push(it);
      }
    if (trail) {
      const EXT = AI.Mansion ? AI.Mansion.EXT : {};
      for (const it of trail.items) {
        const e = EXT[it.k];
        if (e ? it.x + e[2] >= x0 && it.x + e[0] <= x1 && it.y + e[3] >= y0 && it.y + e[1] <= y1 : it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1) out.push(it);
      }
    }
    if (cave && cave.x >= x0 && cave.x <= x1 && cave.y >= y0 && cave.y <= y1) out.push(cave);
    for (const it of dyn) if (it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1) out.push(it);
    return out;
  }
  function near(x, y, r, filter) {
    const list = inRect(x - r, y - r, x + r, y + r, []);
    let best = null, bd = r * r;
    for (const it of list) {
      if (filter && !filter(it)) continue;
      const d = U.dist2(x, y, it.x, it.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  // ---------------------------------------------------------------- weight: things you can't walk through
  /* Fallen logs, stumps, gravestones, statues, gargoyles, gate pillars, lamp and sign posts and the
   * sealed cave are solid. Bushes, ferns, grass and flowers aren't: they part as you brush through. */
  function solidOf(it) {
    if (it._solid !== undefined) return it._solid;
    let sh = null;
    const s = it.s || 1;
    switch (it.k) {
      case 'ocean': sh = AI.OceanDraw ? AI.OceanDraw.solidOf(it) : null; break;
      case 'tree': sh = it.r ? { r: it.r * 0.6 * s } : null; break;
      case 'log': {
        const w = AI.Art && AI.Art.ready ? AI.Art.size(it.n)[0] * s : 60 * s;
        sh = { rect: [it.x - w * 0.42, it.y - 12 * Math.min(1.4, s), it.x + w * 0.42, it.y + 2] };
        break;
      }
      case 'stump': sh = { r: 11 * s }; break;
      case 'stone': sh = { r: (it.r || 8) * s }; break;
      case 'ridge': { const w = AI.Art && AI.Art.ready ? AI.Art.size(it.n)[0] * s : 200; sh = { rect: [it.x - w * 0.45, it.y - 30, it.x + w * 0.45, it.y + 2] }; break; }
      case 'grave': case 'gargoyle': case 'gpillar': sh = it.r ? { r: Math.max(7, it.r) } : null; break;
      case 'cave': sh = { r: 30 }; break;
      case 'lamp': case 'sign': sh = { r: 6 }; break;
      case 'well': sh = { r: it.r || 30 }; break;
      default: sh = null;
    }
    if (sh && sh.r) sh.c = [it.x, it.y - 2];
    if (AI.Art && AI.Art.ready) it._solid = sh; // sizes are only known once the art has loaded
    return sh;
  }
  const solidBuf = [];
  function solidsIn(x0, y0, x1, y1) {
    solidBuf.length = 0;
    for (const it of inRect(x0 - 60, y0 - 30, x1 + 60, y1 + 30, [])) { const sh = solidOf(it); if (sh) solidBuf.push(sh); }
    return solidBuf;
  }
  function collide(ent) {
    if (!AI.cfg.newArt || !ent) return false;
    const r = ent.r || 12;
    let hit = false;
    for (const sh of solidsIn(ent.x - r, ent.y - r, ent.x + r, ent.y + r)) {
      if (sh.rect) {
        const b = sh.rect;
        const cx = U.clamp(ent.x, b[0], b[2]), cy = U.clamp(ent.y, b[1], b[3]);
        const dx = ent.x - cx, dy = ent.y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-4) { const d = Math.sqrt(d2); ent.x = cx + dx / d * r; ent.y = cy + dy / d * r; }
        else { const up = ent.y - b[1], dn = b[3] - ent.y; if (up < dn) ent.y = b[1] - r; else ent.y = b[3] + r; }
      } else {
        const dx = ent.x - sh.c[0], dy = ent.y - sh.c[1], d = Math.hypot(dx, dy), m = r + sh.r;
        if (d >= m) continue;
        hit = true;
        if (d > 1e-4) { ent.x = sh.c[0] + dx / d * m; ent.y = sh.c[1] + dy / d * m; } else ent.y = sh.c[1] + m;
      }
    }
    return hit;
  }
  function blocked(x, y, r) {
    if (!AI.cfg.newArt) return false;
    for (const sh of solidsIn(x - r, y - r, x + r, y + r)) {
      if (sh.rect) { const b = sh.rect; if (x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3]) return true; }
      else if (Math.hypot(x - sh.c[0], y - sh.c[1]) < r + sh.r) return true;
    }
    return false;
  }

  function lights(x0, y0, x1, y1) { return inRect(x0, y0, x1, y1, []).filter((it) => it.light); }

  // ---------------------------------------------------------------- environmental memory
  const prints = [];
  const MAX_PRINTS = 520;
  function footprint(x, y, ang, kind, size) {
    const Sky = AI.Sky;
    const m = mudAt(x, y);
    const strength = Math.max(Sky ? Math.min(1, Sky.wet * 1.4) : 0, m, Sky ? Sky.snowCover : 0);
    if (strength < 0.12) return;
    if (prints.length >= MAX_PRINTS) prints.shift();
    prints.push({ x, y, a: ang, t: AI.time, k: kind, w: size || 1, s: strength, side: (prints.length & 1) ? 1 : -1, mud: m > 0.3 });
  }
  // a footprint regardless of the ground (strange prints that lead somewhere, then stop)
  function printAt(x, y, ang, kind, size, strength) {
    if (prints.length >= MAX_PRINTS) prints.shift();
    prints.push({ x, y, a: ang, t: AI.time, k: kind, w: size || 1, s: strength || 0.7, side: (prints.length & 1) ? 1 : -1, mud: false });
  }
  const mud = new Map();
  const MUD_CELL = 22;
  function mudKey(x, y) { return Math.floor(x / MUD_CELL) + ',' + Math.floor(y / MUD_CELL); }
  function mudAt(x, y) { return mud.get(mudKey(x, y)) || 0; }
  function trample(x, y, amt) {
    if (!AI.Sky || AI.Sky.wet < 0.3 || !floorAt(x, y)) return;
    const k = mudKey(x, y);
    const v = Math.min(1, (mud.get(k) || 0) + amt * AI.Sky.wet);
    mud.set(k, v);
    if (mud.size > 1600) mud.delete(mud.keys().next().value);
  }
  // puddles collect in low spots once the ground is soaked
  function puddleAmt() { return AI.Sky ? U.clamp((AI.Sky.wet - 0.22) / 0.6, 0, 1) * (AI.Sky.snowCover > 0.5 ? 0 : 1) : 0; }
  function puddlesIn(x0, y0, x1, y1, out) {
    out.length = 0;
    const amt = puddleAmt();
    if (amt <= 0) return out;
    const ts = TS();
    for (let ty = Math.floor(y0 / ts); ty <= Math.floor(y1 / ts); ty++)
      for (let tx = Math.floor(x0 / ts); tx <= Math.floor(x1 / ts); tx++) {
        const h = U.hash(tx, ty, seed + 31);
        if (h > 0.05) continue;
        const x = tx * ts + ts * (0.25 + U.hash(tx, ty, 32) * 0.5), y = ty * ts + ts * (0.25 + U.hash(tx, ty, 33) * 0.5);
        if (!floorAt(x, y) || AI.Env.isDried && AI.Env.isDried(tx, ty)) continue;
        const r = (9 + U.hash(tx, ty, 34) * 15) * amt;
        if (r > 3) out.push({ x, y, r, tx, ty });
      }
    return out;
  }
  const pud = [];
  function puddleAt(x, y) {
    for (const p of puddlesIn(x - 40, y - 40, x + 40, y + 40, pud)) if (U.dist2(x, y, p.x, p.y) < p.r * p.r * 0.8) return p;
    return null;
  }
  const ripples = [];
  function ripple(x, y, r) { if (ripples.length < 140) ripples.push({ x, y, r: r || 14, t: 0 }); }

  function rustle(x, y, r) {
    const it = near(x, y, r || 30, (o) => o.hab === 'bush' || o.hab === 'berry');
    if (it) { shake.set('d' + it.id, 0.6); return it; }
    return null;
  }
  function shakeOf(key) { return shake.get(key) || 0; }
  function shakeProp(p) { shake.set('p' + p.tx + ',' + p.ty, 0.5); }
  function nibble(it) { nibbled.add(it.id); }
  function isNibbled(it) { return nibbled.has(it.id); }
  function addDyn(o) { const it = item(o); dyn.push(it); if (dyn.length > 60) dyn.shift(); return it; }
  // permanent additions for this run (the forest's mysteries dress their sites with these)
  const fixed = new Map();
  function addFixed(o) { const it = item(o); const ch = CH(), k = Math.floor(it.x / ch) + ',' + Math.floor(it.y / ch); (fixed.get(k) || fixed.set(k, []).get(k)).push(it); return it; }
  function removeDyn(it) { const i = dyn.indexOf(it); if (i >= 0) dyn.splice(i, 1); }

  // ---------------------------------------------------------------- lanterns & upkeep
  let lastPhase = null;
  function tick(dt) {
    for (const [k, v] of shake) { if (v - dt <= 0) shake.delete(k); else shake.set(k, v - dt); }
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 0.9) ripples.splice(i, 1); }
    // mud slowly dries; prints fade
    if (AI.Sky && AI.Sky.wet < 0.2 && mud.size) for (const [k, v] of mud) { const nv = v - dt * 0.004; if (nv <= 0) mud.delete(k); else mud.set(k, nv); }
    const life = AI.Sky && AI.Sky.snowCover > 0.3 ? 90 : 45;
    while (prints.length && AI.time - prints[0].t > life) prints.shift();
    // lanterns near the player: wind and rain test the flames
    const p = AI.R.Game.player;
    if (!p) return;
    const Sky = AI.Sky;
    const ph = Sky && Sky.phase();
    const relight = ph === 'dusk' && lastPhase !== 'dusk';
    lastPhase = ph;
    for (const it of inRect(p.x - 900, p.y - 700, p.x + 900, p.y + 700, [])) {
      if (!it.light || it.light.kind === 'glow') continue;
      if (relight && !it.lit) { it.lit = true; it.relitAt = AI.time; }
      if (!it.lit || !Sky) continue;
      const wind = Sky.windNow();
      if (!it.protected) {
        if (wind > 0.85 && Math.random() < dt * 0.05 * (wind - 0.7) * 4) { it.lit = false; it.outAt = AI.time; AI.Bus.emit({ type: 'lantern-out', x: it.x, y: it.y, loud: 60, item: it }); }
        else if (Sky.rain > 0.75 && Math.random() < dt * 0.02) { it.lit = false; it.outAt = AI.time; AI.Bus.emit({ type: 'lantern-out', x: it.x, y: it.y, loud: 60, item: it }); }
      }
    }
  }
  // current brightness of a light (flicker, wind, rain, haunting)
  function flame(it) {
    if (!it.light) return 0;
    if (it.light.kind === 'glow') return AI.Sky ? 0.55 + 0.45 * AI.Sky.darkness() : 1;
    if (!it.lit) return 0;
    const t = AI.time;
    const Sky = AI.Sky;
    const wind = Sky ? Sky.windNow() : 0;
    let f = 0.86 + Math.sin(t * 13 + it.id) * 0.05 + Math.sin(t * 7.3 + it.id * 2) * 0.05;
    if (!it.protected) f -= wind * (0.2 + 0.25 * Math.abs(Math.sin(t * 23 + it.id)));
    if (Sky && Sky.rain > 0.4 && !it.protected) f -= Sky.rain * 0.18 * Math.abs(Math.sin(t * 5 + it.id));
    // the lantern by the old trail flickers even when the air is still
    if (it.haunt) { const g = Math.sin(t * 1.7) + Math.sin(t * 2.9 + 1) + Math.sin(t * 0.6); if (g > 1.6) f *= 0.15 + Math.random() * 0.4; }
    if (it.forceFlicker > t) f *= Math.random() < 0.5 ? 0.08 : 0.5 + Math.random() * 0.4;
    return U.clamp(f, 0, 1);
  }

  // the mansion's candles and lamps: now and then one burns purple for a moment, then orange again
  function ghostly(it) {
    if (!it.ghost) return false;
    const P = 14 + U.hash(it.id, 5, 31) * 14, ph = (AI.time + it.id * 7.3) % P;
    return ph < 1.1 && Math.sin(AI.time * 40) > -0.6;
  }
  function flameColor(it) { return ghostly(it) ? [175, 95, 255] : it.light.c; }

  // hidden berry patches: the first visit shakes loose something useful
  function checkPatch(p) {
    const it = near(p.x, p.y, 34, (o) => o.hab === 'berry' && o.berries > 0);
    if (!it || visitedPatches.has(it.id)) return;
    visitedPatches.add(it.id);
    it.berries = Math.max(0, it.berries - 1);
    shake.set('d' + it.id, 0.8);
    try { AI.R.Pickups.drop('heal', it.x + 14, it.y + 6, 0); } catch (e) { /* ignore */ }
  }

  function reset(s) {
    seed = (s | 0) || ((Math.random() * 1e9) | 0);
    chunks.clear(); dyn.length = 0; fixed.clear(); prints.length = 0; mud.clear(); ripples.length = 0;
    nibbled.clear(); shake.clear(); visitedPatches.clear();
    nextId = 1;
    trail = null; cave = null;
    built = false;
  }
  let built = false;
  function ensure() { if (!built && AI.R && AI.R.World) { built = true; buildCave(); if (AI.Journey) { AI.Journey.restoreTrail(); AI.Journey.restoreCrumbs(); } } }
  // which decor chunks exist (the journey only places the mansion where nothing has been seen yet)
  function hasChunk(cx, cy) { return chunks.has(cx + ',' + cy); }
  // forget the decor generated in an area, so it is generated again (around a newly placed mansion)
  function invalidate(x0, y0, x1, y1) {
    const ch = CH();
    for (let cy = Math.floor(y0 / ch); cy <= Math.floor(y1 / ch); cy++) for (let cx = Math.floor(x0 / ch); cx <= Math.floor(x1 / ch); cx++) chunks.delete(cx + ',' + cy);
  }

  AI.define('Decor', {
    reset, ensure, tick, chunk, inRect, near, lights, trailZone, footprint, mudAt, trample, puddleAmt, puddlesIn, puddleAt,
    ripple, ripples, prints, printAt, rustle, shakeOf, shakeProp, nibble, isNibbled, addDyn, addFixed, removeDyn, flame, checkPatch,
    ghostly, flameColor, mansionGeom, mansionBox, setTrail, hasChunk, invalidate, solidOf, solidsIn, collide, blocked, get trail() { return trail; }, get cave() { return cave; }, get seed() { return seed; },
  });
})();
