/* PokéSurvivor+ — Living World AI · the Shady Forest, rebuilt
 * The game paints its ground from 32 px tiles: floor variants of slightly different shades (a
 * faint grid you can see while moving), whole-tile dirt patches (blocky, stair-stepped edges),
 * and a "flowers" layer of little sparkle crosses. In the Shady Forest all of that is replaced by a
 * continuous ground drawn from noise fields: dark woodland greens, bare soil, moss, leaf litter,
 * mud and shorelines, blended with pixel dithering, so it reads as one natural surface.
 *
 * A seeded plan lays the forest out (the order matters: water, routes and reserved landmarks
 * first, trees and plants afterwards):
 *   · regions that blend into each other: the outer woodland, ancient groves, the wetwood
 *     lowlands around the water, the deep forest far from the start, and sunlit clearings
 *   · a great lake with an irregular shore, shallow margins and deep water, a winding stream and
 *     a few secluded ponds
 *   · natural forest paths
 *   · reserved, validated sites for the forest's mysteries (90-mysteries.js), kept apart
 * Trees are placed on a jittered grid (an even, natural spacing that never forms walls) whose
 * density follows the regions; undergrowth follows habitat.
 * Deep water blocks anything that can't swim, fly or float over it (by species, not by type),
 * with sliding along the shore so it never feels sticky; reflections, rain ripples, moonlight and
 * mist bring the water to life.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const TS = 32;
  const CH = 512; // ground chunk size (world px)
  const TEX = 2; // world px per ground texel (the game's pixel scale)

  function on() { try { return AI.enabled && AI.cfg.forestWorld !== false && AI.R && AI.R.World && AI.R.World.biome === 0 && !(AI.R.Rift && AI.R.Rift.inArena); } catch (e) { return false; } }

  // ---------------------------------------------------------------- noise
  function vn(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const a = U.hash(ix, iy, s), b = U.hash(ix + 1, iy, s), c = U.hash(ix, iy + 1, s), d = U.hash(ix + 1, iy + 1, s);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y, s, o) {
    let v = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < (o || 3); i++) { v += vn(x * f, y * f, s + i * 17) * a; n += a; a *= 0.5; f *= 2.03; }
    return v / n;
  }
  const sm = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------------- the plan
  let P = null;
  function plan() {
    const D = AI.Decor;
    const seed = D ? D.seed : 1;
    if (P && P.seed === seed) return P;
    P = makePlan(seed);
    return P;
  }
  function makePlan(seed) {
    const h = (i, j) => U.hash(seed, i, 7700 + (j || 0));
    const M = null; // (the mansion is placed later, by the journey, away from all of this)
    const feats = []; // [x, y, r] areas others must keep away from
    const nearPath = (x, y, r) => M && M.dense.some((q) => Math.abs(q[0] - x) < r && Math.abs(q[1] - y) < r && Math.hypot(q[0] - x, q[1] - y) < r);
    const inMansion = (x, y, r) => M && x > M.D[0] - M.SW - 200 - r && x < M.D[0] + M.SW + 200 + r && y > M.D[1] - 400 - r && y < M.G[1] + 160 + r;
    const free = (x, y, r, gap) => {
      if (Math.hypot(x, y) < 650 + r) return false; // the start stays open
      if (inMansion(x, y, r) || nearPath(x, y, r + 120)) return false;
      for (const f of feats) if (Math.hypot(f[0] - x, f[1] - y) < f[2] + r + (gap == null ? 180 : gap)) return false;
      return true;
    };
    // the great lake, away from the mansion
    const lake = { R: 440 + h(3) * 150, amps: [0.17, 0.11, 0.07, 0.04], ph: [h(4) * 6.28, h(5) * 6.28, h(6) * 6.28, h(7) * 6.28] };
    let la = (M ? M.a : -1.5) + Math.PI + (h(1) - 0.5) * 1.2, ld = 1900 + h(2) * 450;
    for (let i = 0; i < 24; i++) {
      lake.x = Math.cos(la) * ld; lake.y = Math.sin(la) * ld;
      if (free(lake.x, lake.y, lake.R * 1.3 + 100, 0)) break;
      la += 0.47; if (i % 6 === 5) ld += 300;
    }
    feats.push([lake.x, lake.y, lake.R * 1.3]);
    // a stream winding away from the lake
    const streams = [];
    {
      let ang = la + (h(8) < 0.5 ? 1 : -1) * (0.6 + h(9) * 0.6);
      let x = lake.x + Math.cos(ang) * lake.R * 0.9, y = lake.y + Math.sin(ang) * lake.R * 0.9;
      const pts = [[x, y]];
      for (let k = 0; k < 16; k++) {
        ang += (vn(k * 0.7, seed * 0.01, 31) - 0.5) * 1.1;
        x += Math.cos(ang) * 72; y += Math.sin(ang) * 72;
        if (!free(x, y, 30, 40) && k > 2) break;
        pts.push([x, y]);
      }
      if (pts.length > 4) { const bx = pts.map((q) => q[0]), by = pts.map((q) => q[1]); streams.push({ pts, w: 26 + h(10) * 10, cx: (Math.min(...bx) + Math.max(...bx)) / 2, cy: (Math.min(...by) + Math.max(...by)) / 2, ext: Math.max(Math.max(...bx) - Math.min(...bx), Math.max(...by) - Math.min(...by)) / 2 + 60 }); for (let k = 0; k < pts.length; k += 2) feats.push([pts[k][0], pts[k][1], 50]); }
    }
    // a few secluded ponds
    const ponds = [];
    for (let i = 0; i < 40 && ponds.length < 3; i++) {
      const a = h(20 + i) * 6.283, d = 1000 + h(60 + i) * 2400, r = 70 + h(100 + i) * 60;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (!free(x, y, r + 60)) continue;
      ponds.push({ x, y, R: r, amps: [0.1, 0.07, 0.04, 0.02], ph: [h(140 + i) * 6.28, h(141 + i) * 6.28, h(142 + i) * 6.28, h(143 + i) * 6.28] });
      feats.push([x, y, r + 30]);
    }
    // the mysteries' sites: reserved before any tree is planted (see 90-mysteries.js)
    const WANT = [
      ['celebi', 220, 1700, 3300], ['darkrai', 250, 3200, 4400], ['cresselia', 200, 1900, 3800], ['shaymin', 210, 1500, 3300],
      ['virizion', 190, 1700, 3700], ['zarude', 240, 2700, 4300], ['entei', 210, 2100, 4000], ['raikou', 170, 2300, 3900], ['spectrier', 150, 2400, 3600],
    ];
    const sites = {};
    for (const [id, r, d0, d1] of WANT) {
      let best = null;
      for (let i = 0; i < 90 && !best; i++) {
        const a = h(300 + i, id.length * 13) * 6.283, d = d0 + h(400 + i, id.length * 13) * (d1 - d0);
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (free(x, y, r + 80, i < 60 ? 600 : 300)) best = { id, x, y, r };
      }
      if (!best) continue; // (a site that doesn't fit stays undiscovered this world)
      sites[id] = best;
      feats.push([best.x, best.y, best.r + 60]);
    }
    // Spectrier's narrow, forgotten path, leading to its site from the forest
    if (sites.spectrier) {
      const s = sites.spectrier, a0 = Math.atan2(s.y, s.x) + Math.PI + 0.4;
      const pts = [];
      let x = s.x + Math.cos(a0) * 640, y = s.y + Math.sin(a0) * 640;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        pts.push([x + (s.x - x) * t + Math.sin(t * 7 + seed) * 30 * (1 - t), y + (s.y - y) * t + Math.cos(t * 6 + seed) * 30 * (1 - t)]);
      }
      s.path = pts;
    }
    // Suicune keeps to the quietest water: its own pond, or the lake's far shore
    if (ponds.length) sites.suicune = { id: 'suicune', x: ponds[0].x, y: ponds[0].y, r: ponds[0].R + 140, pond: ponds[0] };
    else sites.suicune = { id: 'suicune', x: lake.x, y: lake.y, r: lake.R + 120, lake: true };
    // Cresselia's refuge has a small moonlit pool at its heart
    if (sites.cresselia) { const c = sites.cresselia; ponds.push({ x: c.x + 30, y: c.y + 40, R: 48, amps: [0.08, 0.05, 0.03, 0.02], ph: [1, 2, 3, 4], refuge: true }); }
    // natural forest paths: from the start toward the lake and a few clearings
    const clearings = [];
    for (let i = 0; i < 40 && clearings.length < 9; i++) {
      const a = h(500 + i) * 6.283, d = 600 + h(560 + i) * 3200, r = 110 + h(620 + i) * 90;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (!free(x, y, r, 80)) continue;
      clearings.push({ x, y, r });
    }
    const paths = [];
    const trail = (x0, y0, x1, y1, salt) => {
      const pts = [];
      const n = Math.max(6, Math.round(Math.hypot(x1 - x0, y1 - y0) / 80));
      const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
      for (let k = 0; k <= n; k++) {
        const t = k / n, w = (vn(t * 4, salt, 41) - 0.5) * 160 * Math.sin(t * Math.PI);
        pts.push([x0 + (x1 - x0) * t + nx / l * w, y0 + (y1 - y0) * t + ny / l * w]);
      }
      paths.push({ pts, w: 20 });
    };
    const la2 = Math.atan2(-lake.y, -lake.x);
    trail(Math.cos(la2 + Math.PI) * 300, Math.sin(la2 + Math.PI) * 300, lake.x + Math.cos(la2) * (lake.R + 70), lake.y + Math.sin(la2) * (lake.R + 70), 1);
    clearings.slice(0, 3).forEach((c, i) => trail(Math.cos(i * 2.1) * 260, Math.sin(i * 2.1) * 260, c.x, c.y, 10 + i));
    return { seed, M, lake, streams, ponds, sites, clearings, paths };
  }

  // ---------------------------------------------------------------- fields
  function shoreR(o, a) { return o.R * (1 + o.amps[0] * Math.sin(2 * a + o.ph[0]) + o.amps[1] * Math.sin(3 * a + o.ph[1]) + o.amps[2] * Math.sin(5 * a + o.ph[2]) + o.amps[3] * Math.sin(7 * a + o.ph[3])); }
  function segDist(x, y, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = U.clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
    return Math.hypot(x - ax - dx * t, y - ay - dy * t);
  }
  function lineDist(x, y, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; }
  // water: e = how far inside the water a point is (px; negative outside); dk > 0 = past the shallows.
  // Shores wander with noise, so no lake or pond is ever a neat circle.
  const W0 = { e: -1e9, dk: -1e9, deep: false, kind: null };
  function body(o, x, y, s, big) {
    const d = Math.hypot(x - o.x, y - o.y);
    if (d > o.R * 1.75) return o.R * 1.45 - d;
    return shoreR(o, Math.atan2(y - o.y, x - o.x)) - d + (vn(x / 170, y / 170, s + 3) - 0.5) * o.R * (big ? 0.34 : 0.26) + (vn(x / 48, y / 48, s + 4) - 0.5) * (big ? 26 : 14);
  }
  function water(x, y) {
    const p = plan();
    const s = p.seed;
    let e = -1e9, dk = -1e9, kind = null;
    const el = body(p.lake, x, y, s, true);
    if (el > e) { e = el; dk = el - (92 + (vn(x / 210, y / 210, s + 5) - 0.5) * 70); kind = 'lake'; }
    for (const o of p.ponds) {
      const ep = body(o, x, y, s + 9, false);
      if (ep > e) { e = ep; dk = o.R > 100 ? ep - 52 : -1e9; kind = 'pond'; }
    }
    for (const st of p.streams) {
      if (Math.abs(x - st.cx) > st.ext || Math.abs(y - st.cy) > st.ext) continue;
      const es = st.w / 2 - lineDist(x, y, st.pts) + (vn(x / 40, y / 40, s + 6) - 0.5) * 8;
      if (es > e) { e = es; dk = -1e9; kind = 'stream'; }
    }
    W0.e = e; W0.dk = e > 0 ? dk : -1e9; W0.deep = e > 0 && dk > 0; W0.kind = e > 0 ? kind : null;
    return W0;
  }
  function depthClass(x, y) { const w = water(x, y); return w.e <= 0 ? 0 : w.deep ? 2 : 1; }
  function pathDist(x, y) {
    const p = plan();
    let d = 1e9;
    for (const q of p.paths) d = Math.min(d, lineDist(x, y, q.pts) - q.w / 2);
    if (p.sites.spectrier && p.sites.spectrier.path) d = Math.min(d, lineDist(x, y, p.sites.spectrier.path) - 13);
    return d;
  }
  // regions blend: 0…1 weights
  const R0 = { grove: 0, deep: 0, wet: 0, clear: 0, site: null, siteK: 0 };
  function region(x, y) {
    const p = plan();
    const s = p.seed;
    R0.grove = sm(0.56, 0.7, fbm(x / 1500, y / 1500, s + 11, 2));
    const d0 = Math.hypot(x, y);
    R0.deep = sm(2900, 4300, d0) * (0.55 + 0.45 * vn(x / 800, y / 800, s + 13));
    const L = p.lake;
    const near = U.clamp(1 - (Math.hypot(x - L.x, y - L.y) - L.R) / 520, 0, 1);
    let wet = Math.max(near, sm(0.6, 0.78, fbm(x / 1100, y / 1100, s + 23, 2)) * 0.8);
    for (const o of p.ponds) wet = Math.max(wet, U.clamp(1 - (Math.hypot(x - o.x, y - o.y) - o.R) / 220, 0, 1) * 0.9);
    R0.wet = wet;
    let cl = 0;
    // (clearings have ragged edges, not neat circles)
    for (const c of p.clearings) { let d = Math.hypot(x - c.x, y - c.y); if (d < c.r * 1.5) { d *= 1 + (vn(x / 70, y / 70, s + 29) - 0.5) * 0.7; if (d < c.r) cl = Math.max(cl, sm(c.r, c.r * 0.45, d)); } }
    R0.clear = cl;
    R0.site = null; R0.siteK = 0;
    for (const id in p.sites) {
      const st = p.sites[id];
      let d = Math.hypot(x - st.x, y - st.y);
      if (d < st.r * 1.6) { d *= 1 + (vn(x / 80, y / 80, s + 37) - 0.5) * 0.5; if (d < st.r * 1.25) { const k = sm(st.r * 1.25, st.r * 0.8, d); if (k > R0.siteK) { R0.siteK = k; R0.site = id; } } }
    }
    return R0;
  }

  // ---------------------------------------------------------------- generation hooks
  // what the game's terrain is at a tile: water where the plan has it, never its own ponds
  function terr(biome, tx, ty) {
    if (biome !== 0 || !AI.enabled) return -1;
    if (AI.Journey) AI.Journey.noteGen(tx, ty);
    if (AI.cfg.forestWorld === false || !AI.Decor) return -1;
    return depthClass((tx + 0.5) * TS, (ty + 0.5) * TS) > 0 ? 2 : 0;
  }
  // trees on a jittered grid: even, natural spacing; density by region; none in water, on paths or in sites
  function trees(biome, grove, tx, ty) {
    if (biome !== 0 || !AI.enabled || AI.cfg.forestWorld === false || !AI.Decor) return null;
    const x = (tx + 0.5) * TS, y = (ty + 0.5) * TS, by = (ty + 1) * TS - 4; // (the game stands the trunk at the tile's foot)
    const p = plan();
    if (water(x, y).e > -26 || water(x, by).e > -26) return -1;
    if (pathDist(x, y) < 18 || pathDist(x, by) < 18) return -1;
    const r = region(x, y);
    if (r.siteK > 0.2 || r.clear > 0.35) return -1;
    // one grid for the whole forest (so neighbouring regions never crowd each other); the region
    // decides how many of its cells grow a tree
    const c = 4;
    const cx = Math.floor(tx / c), cy = Math.floor(ty / c);
    const ox = Math.floor(U.hash(cx, cy, p.seed + 81) * (c - 1)), oy = Math.floor(U.hash(cx, cy, p.seed + 82) * (c - 1));
    if (((tx % c) + c) % c !== ox || ((ty % c) + c) % c !== oy) return -1;
    const dens = (0.4 + r.grove * 0.38 + r.deep * 0.42 - r.wet * 0.2 - r.clear * 0.6 + (vn(x / 400, y / 400, p.seed + 84) - 0.5) * 0.4) * (AI.cfg.treeDensity == null ? 1 : AI.cfg.treeDensity);
    return U.hash(cx, cy, p.seed + 83) < dens ? 2 : -1;
  }
  // the game's tall-grass props: only where they belong
  function grass(biome, tx, ty) {
    if (biome !== 0 || !AI.enabled || AI.cfg.forestWorld === false || !AI.Decor) return true;
    const x = (tx + 0.5) * TS, y = (ty + 0.5) * TS;
    if (water(x, y).e > -10 || pathDist(x, y) < 14) return false;
    const r = region(x, y);
    if (r.siteK > 0.4) return false;
    const bare = soilAt(x, y);
    return bare < 0.45 && U.hash(tx, ty, plan().seed + 91) < 0.55 + r.grove * 0.25 - r.clear * 0.3;
  }
  // how quiet a stretch of forest is (0 lively … 1 empty): roaming Pokémon rarely turn up there
  function quietAt(x, y) { return sm(0.42, 0.28, vn(x / 900, y / 900, plan().seed + 111)); }
  function soilAt(x, y) { const s = plan().seed; return sm(0.58, 0.72, fbm(x / 260, y / 260, s + 31, 3)) * (1 - region(x, y).wet * 0.5); }

  // ---------------------------------------------------------------- the ground: palettes
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const PAL = {
    grass: ['#22412a', '#2a4c2e', '#315832', '#3a6234'].map(rgb),
    grove: ['#18311f', '#1f3a24', '#264429', '#2d4d2c'].map(rgb),
    deep: ['#13261a', '#182d1e', '#1d3422', '#233b26'].map(rgb),
    clear: ['#2f5a2e', '#376432', '#416e36', '#4c793c'].map(rgb),
    wet: ['#26402a', '#2d4a2c', '#354f2c', '#3d572f'].map(rgb),
    soil: ['#352a1e', '#3e3122', '#473826', '#52412c'].map(rgb),
    mud: ['#251d16', '#2c231a', '#33291e', '#3b3022'].map(rgb),
    moss: ['#3b6a2e', '#457634', '#4f8038', '#5a8c3e'].map(rgb),
    litter: ['#5a4026', '#6a4a2a', '#4e3a24', '#7a5a30'].map(rgb),
    pebble: ['#5a5a60', '#6e6e74', '#4a4a50'].map(rgb),
    shallow: ['#2f5a5c', '#356464', '#3d6e6c', '#467872'].map(rgb),
    deepw: ['#14304a', '#183652', '#1c3c58', '#21445f'].map(rgb),
    foam: rgb('#9ec0b8'),
    gold: ['#4a7a30', '#5a8a34', '#6e9a3a', '#86aa40'].map(rgb),
    ash: ['#1a1a1c', '#222024', '#2a272c', '#33303a'].map(rgb),
    silver: ['#3a5a4c', '#4a6a5c', '#5a7a6e', '#6e8e82'].map(rgb),
    jungle: ['#16301a', '#1c3a1e', '#224422', '#2a4e28'].map(rgb),
    scorch: ['#2a1e16', '#33241a', '#3c2a1c', '#46301e'].map(rgb),
    violet: ['#1e1a26', '#24202e', '#2c2636', '#342c40'].map(rgb),
    haunt: ['#171d19', '#1c231e', '#222923', '#283028'].map(rgb),
  };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // ---------------------------------------------------------------- the ground: chunks
  const chunks = new Map();
  let chunkSeed = null;
  function chunkKey(cx, cy) { return cx + ',' + cy; }
  function buildChunk(cx, cy) {
    const p = plan();
    const s = p.seed;
    const N = CH / TEX; // 256 texels
    const G = 16; // field sample spacing (px)
    const GN = CH / G + 1;
    const x0 = cx * CH, y0 = cy * CH;
    const F = (n) => new Float32Array(GN * GN);
    const f = { e: F(), dk: F(), grove: F(), dp: F(), wet: F(), cl: F(), soil: F(), moss: F(), mud: F(), path: F(), sk: F(), tone: F(), site: new Array(GN * GN) };
    const J = AI.Journey;
    if (J && J.placed && J.fresh(x0 + CH / 2, y0 + CH / 2) && J.nearK(x0 + CH / 2, y0 + CH / 2) > 0.05) f.jk = F();
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x = x0 + i * G, y = y0 + j * G, k = j * GN + i;
      const w = water(x, y);
      f.e[k] = U.clamp(w.e, -300, 300); f.dk[k] = U.clamp(w.dk, -300, 300);
      const r = region(x, y);
      f.grove[k] = r.grove; f.dp[k] = r.deep; f.wet[k] = r.wet; f.cl[k] = r.clear; f.site[k] = r.site; f.sk[k] = r.siteK;
      f.soil[k] = soilAt(x, y);
      f.moss[k] = sm(0.6, 0.74, fbm(x / 170, y / 170, s + 41, 2)) * Math.max(r.grove, r.deep, r.wet * 0.6);
      f.mud[k] = sm(0.6, 0.74, fbm(x / 120, y / 120, s + 43, 2)) * sm(0.55, 0.85, r.wet);
      f.path[k] = U.clamp(1 - pathDist(x, y) / 10, 0, 1);
      f.tone[k] = fbm(x / 110, y / 110, s + 51, 3);
      if (f.jk) f.jk[k] = J.nearK(x, y);
    }
    // trees in and around the chunk shade the ground beneath them and drop their leaves
    const trunks = [];
    try { for (const pr of AI.Env.treesIn(x0 + CH / 2, y0 + CH / 2, CH * 0.8)) trunks.push(pr); } catch (e) { /* ignore */ }
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const g = cv.getContext('2d');
    const img = g.createImageData(N, N);
    const D32 = new Uint32Array(img.data.buffer);
    const put = (i, c) => { D32[i] = (255 << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0]); };
    const bil = (arr, gx, gy) => { const ix = Math.min(GN - 2, gx | 0), iy = Math.min(GN - 2, gy | 0), fx = gx - ix, fy = gy - iy, k = iy * GN + ix; return (arr[k] * (1 - fx) + arr[k + 1] * fx) * (1 - fy) + (arr[k + GN] * (1 - fx) + arr[k + GN + 1] * fx) * fy; };
    const lvl = (t) => (t <= 0 ? 0 : t >= 0.999 ? 3 : Math.floor(t * 4));
    const SITE = { celebi: PAL.gold, darkrai: PAL.ash, cresselia: PAL.silver, shaymin: PAL.clear, virizion: PAL.clear, zarude: PAL.jungle, raikou: PAL.grove, spectrier: PAL.violet, suicune: PAL.wet };
    const mask = new Uint8Array(N * N);
    let anyWater = false;
    const rowT = [];
    for (let ty = 0; ty < N; ty++) {
      // (only the trees whose shade reaches this row)
      rowT.length = 0;
      const wyr = y0 + ty * TEX;
      for (const tr of trunks) if (Math.abs(wyr - tr.y + 6) * 1.7 < 65) rowT.push(tr);
      for (let tx = 0; tx < N; tx++) {
      const gx = (tx * TEX) / G, gy = (ty * TEX) / G;
      const wx = x0 + tx * TEX, wy = wyr;
      const i = ty * N + tx;
      const hsh = U.hash(wx >> 1, wy >> 1, s + 61);
      // a clumpy threshold: blends between surfaces break up into natural tufts, not a dot pattern
      const cth = vn(wx / 14, wy / 14, s + 71) * 0.62 + hsh * 0.38;
      const e = bil(f.e, gx, gy);
      if (e > 0) {
        mask[i] = 1; anyWater = true;
        const dk = bil(f.dk, gx, gy);
        if (e < 3 && cth > 0.3) { put(i, PAL.foam); continue; }
        const deep = dk + (cth - 0.5) * 22 > 0;
        let t;
        if (deep) t = 1 - U.clamp(dk / 160, 0, 1);
        else t = 1 - U.clamp(e / 70, 0, 1);
        let c = (deep ? PAL.deepw : PAL.shallow)[lvl(t * 0.92 + (cth - 0.5) * 0.3)];
        // a few pale streaks where the surface catches the light
        if (U.hash(wx >> 3, wy >> 1, s + 63) > 0.988) c = lerp3(c, [190, 215, 220], 0.25);
        put(i, c);
        continue;
      }
      // ---- land: which kind of forest this is
      let base = PAL.grass;
      let best = 0;
      const pick = (pal, wgt) => { if (wgt > best && wgt > cth) { best = wgt; base = pal; } };
      pick(PAL.grove, bil(f.grove, gx, gy));
      pick(PAL.deep, bil(f.dp, gx, gy));
      const wet = bil(f.wet, gx, gy);
      pick(PAL.wet, wet * 0.9);
      pick(PAL.clear, bil(f.cl, gx, gy));
      if (f.jk) pick(PAL.haunt, bil(f.jk, gx, gy) * 0.9);
      const sk = bil(f.sk, gx, gy);
      if (sk > 0.05) { const sp = SITE[f.site[Math.round(gy) * GN + Math.round(gx)]]; if (sp) pick(sp, sk * 1.1); }
      // grass: soft shading with short vertical blades
      const hb = U.hash(wx >> 1, wy >> 2, s + 65);
      const tone = bil(f.tone, gx, gy);
      let col = base[lvl(tone * 1.15 - 0.08 + (hb - 0.5) * 0.4)];
      // bare soil and paths
      const soil = Math.max(bil(f.soil, gx, gy), bil(f.path, gx, gy) * 0.95);
      if (soil > cth * 0.85 + 0.08) {
        col = PAL.soil[lvl(tone + (hsh - 0.5) * 0.45)];
        if (hsh > 0.94) col = PAL.litter[(hsh * 37 | 0) % 4];
      }
      if (bil(f.moss, gx, gy) > cth + 0.05) col = PAL.moss[lvl(tone + (hb - 0.5) * 0.35)];
      // mud: in hollows of the wet lowlands, and along every shore
      if (bil(f.mud, gx, gy) > cth + 0.05) col = PAL.mud[lvl(0.35 + (hsh - 0.5) * 0.5)];
      const shore = -e;
      const band = 18 + wet * 26;
      if (shore < band * (0.5 + cth * 0.8)) {
        col = PAL.mud[lvl(0.15 + (shore / band) * 0.6 + (hsh - 0.5) * 0.25)];
        if (shore > 6 && shore < 20 && hsh > 0.86) col = PAL.pebble[(hsh * 53 | 0) % 3];
        if (shore < 4) col = lerp3(PAL.mud[0], [16, 24, 26], 0.4);
      }
      // under the canopy: darker, with fallen leaves
      for (const tr of rowT) {
        const dx = wx - tr.x, dy = (wy - tr.y + 6) * 1.7;
        const d2 = dx * dx + dy * dy;
        if (d2 < 4200) {
          const k2 = 1 - d2 / 4200;
          col = lerp3(col, [8, 16, 10], k2 * 0.32);
          if (k2 > 0.25 && hsh > 0.92 - k2 * 0.12) col = PAL.litter[(hsh * 91 | 0) % 4];
        }
      }
      if (hsh < 0.025) col = lerp3(col, [110, 150, 80], 0.22);
      put(i, col);
      }
    }
    g.putImageData(img, 0, 0);
    // a water mask (for reflections) at the same resolution
    let mk = null;
    if (anyWater) {
      mk = document.createElement('canvas');
      mk.width = N; mk.height = N;
      const mg = mk.getContext('2d');
      const mi = mg.createImageData(N, N);
      const M32 = new Uint32Array(mi.data.buffer);
      for (let k = 0; k < mask.length; k++) if (mask[k]) M32[k] = 0xffffffff;
      mg.putImageData(mi, 0, 0);
    }
    return { cv, mk, water: anyWater, t: AI.time };
  }
  function getChunk(cx, cy, allowBuild) {
    const k = chunkKey(cx, cy);
    let c = chunks.get(k);
    if (c) { c.used = AI.frame; return c; }
    if (!allowBuild) return null;
    c = buildChunk(cx, cy);
    c.used = AI.frame;
    chunks.set(k, c);
    if (chunks.size > 64) {
      let old = null, ou = Infinity;
      for (const [kk, v] of chunks) if (v.used < ou) { ou = v.used; old = kk; }
      if (old) chunks.delete(old);
    }
    return c;
  }

  // ---------------------------------------------------------------- drawing the ground (replaces the game's in the forest)
  let reflCv = null, reflG = null, maskCv = null, maskG = null;
  function drawGround(ctx) {
    const p = plan();
    if (chunkSeed !== p.seed) { chunks.clear(); chunkSeed = p.seed; }
    const cam = AI.R.Camera;
    const x0 = cam.left() - 4, y0 = cam.top() - 4, x1 = cam.left() + cam.w + 4, y1 = cam.top() + cam.h + 4;
    const c0 = Math.floor(x0 / CH), c1 = Math.floor(x1 / CH), r0 = Math.floor(y0 / CH), r1 = Math.floor(y1 / CH);
    let builds = 0;
    const vis = [];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      let c = getChunk(cx, cy, false);
      if (!c) { c = getChunk(cx, cy, true); builds++; }
      if (c) {
        // one world pixel of overlap: no hairline seams between chunks at any zoom
        ctx.drawImage(c.cv, cx * CH, cy * CH, CH + 1, CH + 1);
        vis.push([cx, cy, c]);
      } else { ctx.fillStyle = '#2a4c2e'; ctx.fillRect(cx * CH, cy * CH, CH + 1, CH + 1); }
    }
    ctx.restore();
    // paint one chunk just outside the view ahead of time, so walking never waits for one
    if (!builds && AI.frame % 6 === 0) {
      outer: for (let cy = r0 - 1; cy <= r1 + 1; cy++) for (let cx = c0 - 1; cx <= c1 + 1; cx++) if (!chunks.has(chunkKey(cx, cy))) { getChunk(cx, cy, true); break outer; }
    }
    if (vis.some((v) => v[2].water)) drawWater(ctx, vis, x0, y0, x1, y1);
  }
  /* The moon's reflection. It sits on whichever water is in view nearest to where the moon's image
   * would fall (up and to the left of the middle of the view), gliding with the camera like a real
   * reflection does, and shows tonight's phase: a thin crescent, a half moon, gibbous, full; a new
   * moon shows nothing but a faint grey disc. */
  const moonRef = { x: 0, y: 0, t: -9, ok: false };
  function moonSpot(cam) {
    if (AI.time - moonRef.t < 0.4 && moonRef.ok) return moonRef;
    moonRef.t = AI.time;
    const ax = cam.x - cam.w * 0.16, ay = cam.y - cam.h * 0.14;
    let best = null, bd = Infinity;
    for (let y = cam.top() + 24; y < cam.top() + cam.h; y += 40)
      for (let x = cam.left() + 24; x < cam.left() + cam.w; x += 40) {
        if (water(x, y).e < 26) continue; // well away from the shore, so the whole disc lies on the water
        const d = (x - ax) * (x - ax) + (y - ay) * (y - ay);
        if (d < bd) { bd = d; best = [x, y]; }
      }
    if (!best) { moonRef.ok = false; return moonRef; }
    if (!moonRef.ok || Math.hypot(best[0] - moonRef.x, best[1] - moonRef.y) > 160) { moonRef.x = best[0]; moonRef.y = best[1]; }
    else { moonRef.x += (best[0] - moonRef.x) * 0.25; moonRef.y += (best[1] - moonRef.y) * 0.25; }
    moonRef.ok = true;
    return moonRef;
  }
  function moonShape(g, x, y, R, ph) {
    // the lit part: the outer edge on the lit side, back along the terminator
    const waxing = ph < 0.5, s = waxing ? 1 : -1, k = Math.cos(ph * Math.PI * 2);
    g.beginPath();
    for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * Math.PI; g.lineTo(x + s * R * Math.cos(a), y + R * Math.sin(a)); }
    for (let i = 16; i >= 0; i--) { const a = -Math.PI / 2 + (i / 16) * Math.PI; g.lineTo(x + s * k * R * Math.cos(a), y + R * Math.sin(a)); }
    g.closePath();
  }
  // how visible the moon's reflection is right now (night, and a clear enough sky)
  function moonVis() {
    const Sky = AI.Sky;
    if (!on() || !Sky || (AI.Mansion && AI.Mansion.inside)) return 0;
    return U.clamp((Sky.darkness() - 0.5) * 3, 0, 1) * U.clamp(1 - Sky.cloud / 0.6, 0, 1) * (1 - Sky.fog * 0.8) * (1 - Sky.rain);
  }
  // drawn after the night has darkened everything, so it shines on the dark water like the real thing:
  // the disc broken into wavering strips by the ripples
  let moonCv = null, moonG = null;
  function drawMoonReflection(ctx, sx, sy, scale) {
    const vis = moonVis();
    if (vis <= 0.02) return;
    const cam = AI.R.Camera;
    const m = moonSpot(cam);
    if (!m.ok) return;
    const Sky = AI.Sky, ph = Sky.moonPhase(), lit = Sky.moonLight();
    const R = 9, S = 32;
    if (!moonCv) { moonCv = document.createElement('canvas'); moonCv.width = moonCv.height = S; moonG = moonCv.getContext('2d'); }
    const g = moonG;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(120,130,170,0.35)'; // the unlit part, barely there (earthshine)
    g.beginPath(); g.arc(S / 2, S / 2, R, 0, Math.PI * 2); g.fill();
    if (lit > 0.02) { g.fillStyle = 'rgb(236,242,255)'; moonShape(g, S / 2, S / 2, R, ph); g.fill(); }
    const x = sx(m.x), y = sy(m.y), k = scale;
    const rough = 0.6 + Sky.windNow() * 2 + Sky.rain * 3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = false;
    // a faint glow on the water around it, as bright as the moon is full
    const gr = ctx.createRadialGradient(x, y, 0, x, y, 44 * k);
    gr.addColorStop(0, 'rgba(150,165,210,' + (0.22 * lit * vis).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(150,165,210,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - 44 * k, y - 44 * k, 88 * k, 88 * k);
    ctx.globalAlpha = 0.75 * vis;
    for (let yy = 0; yy < S; yy += 2) {
      const off = Math.sin(yy * 0.5 + AI.time * 2.4) * rough * 0.9;
      ctx.drawImage(moonCv, 0, yy, S, 2, x + (off - S / 2) * k, y + (yy - S / 2) * k, S * k, 2 * k);
    }
    ctx.restore();
  }

  // the living water: reflections, a shimmer, moonlight, mist
  function drawWater(ctx, vis, x0, y0, x1, y1) {
    const R = AI.R;
    const cam = R.Camera;
    const Sky = AI.Sky;
    const w = Math.ceil((x1 - x0) / 2), h = Math.ceil((y1 - y0) / 2);
    if (!reflCv) { reflCv = document.createElement('canvas'); reflG = reflCv.getContext('2d'); }
    if (reflCv.width !== w || reflCv.height !== h) { reflCv.width = w; reflCv.height = h; }
    const g = reflG;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(0.5, 0, 0, 0.5, -x0 * 0.5, -y0 * 0.5);
    g.imageSmoothingEnabled = false;
    // sky colour, faintly
    const sc = Sky ? Sky.skyColor() : [140, 170, 200];
    g.fillStyle = 'rgba(' + sc[0] + ',' + sc[1] + ',' + sc[2] + ',0.35)';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    // trees and creatures standing by the water, upside down
    const A = AI.Art;
    for (const pr of R.World.visibleProps(cam)) {
      if (pr.type !== 'tree' || !pr._psxArt) continue;
      if (water(pr.x, pr.y + 30).e <= 0 && water(pr.x, pr.y + 90).e <= 0) continue;
      g.save(); g.translate(pr.x, pr.y + 4); g.scale(1, -0.9);
      A.draw(g, pr._psxArt, 0, 0, { scale: pr._psxScale || 1 });
      g.restore();
    }
    const ents = [R.Game.player, ...R.EnemyMgr.drawables(cam)];
    for (const e of ents) {
      if (!e || e.dead || !e.anim || water(e.x, e.y + 6).e <= 0) continue;
      g.save(); g.translate(e.x, e.y + 2); g.scale(1, -0.85);
      try { e.anim.draw(g, 0, 0, { alpha: 1 }); } catch (err) { /* ignore */ }
      g.restore();
    }
    // keep only what falls on water (the chunks' masks are combined first: 'destination-in' clears
    // everything outside the image drawn, so it must be applied once)
    if (!maskCv) { maskCv = document.createElement('canvas'); maskG = maskCv.getContext('2d'); }
    if (maskCv.width !== w || maskCv.height !== h) { maskCv.width = w; maskCv.height = h; }
    maskG.setTransform(1, 0, 0, 1, 0, 0);
    maskG.clearRect(0, 0, w, h);
    maskG.setTransform(0.5, 0, 0, 0.5, -x0 * 0.5, -y0 * 0.5);
    maskG.imageSmoothingEnabled = false;
    for (const [cx, cy, c] of vis) if (c.mk) maskG.drawImage(c.mk, cx * CH, cy * CH, CH + 1, CH + 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(maskCv, 0, 0);
    g.globalCompositeOperation = 'source-over';
    // lay it down in thin wavering strips: the wind and rain stir the surface
    const rough = 0.6 + (Sky ? Sky.windNow() * 2 + Sky.rain * 3 + Sky.storm * 2 : 0);
    const t = AI.time;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Sky && Sky.rain > 0.5 ? 0.22 : 0.34;
    for (let yy = 0; yy < h; yy += 2) {
      const off = Math.sin(yy * 0.35 + t * 2.2) * rough * 0.8;
      ctx.drawImage(reflCv, 0, yy, w, 2, x0 + off * 2, y0 + yy * 2, w * 2, 4);
    }
    ctx.restore();
    // a slow shimmer of light across the water
    ctx.save();
    ctx.fillStyle = 'rgba(200,225,235,0.18)';
    for (let yy = Math.floor(y0 / 20) * 20; yy < y1; yy += 20) for (let xx = Math.floor(x0 / 28) * 28; xx < x1; xx += 28) {
      const hh = U.hash(xx, yy, 5);
      const ph = (t * 0.6 + hh * 6.28) % 6.28;
      if (Math.sin(ph) < 0.75) continue;
      const wx2 = xx + hh * 20, wy2 = yy + (hh * 7 % 1) * 14;
      if (water(wx2, wy2).e < 6) continue;
      ctx.fillRect(Math.round(wx2), Math.round(wy2), 6, 1);
    }
    ctx.restore();
    // rain dimples the surface
    if (Sky && Sky.rain > 0.05 && AI.Decor) {
      const n = Sky.rain * 18 + Sky.storm * 10;
      for (let i = 0; i < n; i++) {
        if (Math.random() > 0.35) continue;
        const rx = x0 + Math.random() * (x1 - x0), ry = y0 + Math.random() * (y1 - y0);
        if (water(rx, ry).e > 4) AI.Decor.ripple(rx, ry, 3 + Math.random() * (4 + Sky.rain * 5));
      }
    }
  }
  // mist over the water and the wet lowlands (drawn above the ground, below the light)
  function drawMist(ctx) {
    if (!on() || !AI.Sky) return;
    const Sky = AI.Sky;
    const h = Sky.hour();
    const dawn = h >= 4.5 && h < 9 ? 1 - Math.abs(h - 6.5) / 2.5 : 0;
    const k = Math.max(Sky.fog * 0.8, dawn * 0.6, Sky.rain * 0.25);
    if (k < 0.05) return;
    const cam = AI.R.Camera;
    const t = AI.time;
    ctx.save();
    for (let yy = Math.floor(cam.top() / 90) * 90; yy < cam.top() + cam.h + 90; yy += 90) for (let xx = Math.floor(cam.left() / 120) * 120; xx < cam.left() + cam.w + 120; xx += 120) {
      const hh = U.hash(xx, yy, 77);
      const mx = xx + hh * 80 + Math.sin(t * 0.07 + hh * 9) * 40, my = yy + (hh * 13 % 1) * 60;
      const wv = water(mx, my);
      const wetK = wv.e > -60 ? 1 : region(mx, my).wet > 0.7 ? 0.5 : 0;
      if (!wetK) continue;
      const a = k * wetK * 0.22 * (0.6 + 0.4 * Math.sin(t * 0.2 + hh * 5));
      const gr = ctx.createRadialGradient(mx, my, 0, mx, my, 70);
      gr.addColorStop(0, 'rgba(210,220,225,' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(210,220,225,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(mx, my, 90, 40, 0, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- canopy shade & sunlit clearings (for the light map)
  const shadeCache = new Map();
  function shadeAt(x, y) {
    const k = (x >> 7) + ',' + (y >> 7);
    let v = shadeCache.get(k);
    if (v != null) return v;
    let n = 0;
    try { n = AI.Env.treesIn(x, y, 120).length; } catch (e) { /* ignore */ }
    const r = region(x, y);
    v = U.clamp(0.15 + n * 0.08 + r.grove * 0.25 + r.deep * 0.35 - r.clear * 0.6 - (water(x, y).e > 0 ? 0.4 : 0), 0, 0.85);
    if (AI.Journey) v = Math.min(0.9, v + AI.Journey.nearK(x, y) * 0.3);
    if (r.site === 'celebi') v *= 1 - r.siteK; // the sanctuary: open to the sky
    if (r.site === 'darkrai') v = Math.max(v, 0.6 + 0.35 * r.siteK);
    if (r.site === 'spectrier') v = Math.max(v, 0.45 + 0.4 * r.siteK);
    if (shadeCache.size > 3000) shadeCache.clear();
    shadeCache.set(k, v);
    return v;
  }
  // darkens the light map under heavy canopy (called by 94-light before the lights are added): a
  // tiny image of the shade, one pixel per 64 px of forest, stretched smoothly over the view
  let shCv = null, shG = null;
  function shadeLightMap(lg, sx, sy, k, scale) {
    if (!on()) return false;
    const cam = AI.R.Camera;
    // by day the canopy shades the floor; by night it's the moon's light the leaves hold back, so under
    // a bright clear moon the clearings stand out and under a new moon everything is equally dark
    const Sky = AI.Sky;
    const dk = Sky ? Sky.darkness() : 0;
    const day = Sky ? U.lerp(1, 0.35 + 0.6 * Sky.moonLight() * (1 - Sky.cloud), dk) : 1;
    const step = 64;
    const gx0 = Math.floor(cam.left() / step) - 1, gy0 = Math.floor(cam.top() / step) - 1;
    const cols = Math.ceil(cam.w / step) + 3, rows = Math.ceil(cam.h / step) + 3;
    if (!shCv) { shCv = document.createElement('canvas'); shG = shCv.getContext('2d'); }
    if (shCv.width !== cols || shCv.height !== rows) { shCv.width = cols; shCv.height = rows; }
    const img = shG.createImageData(cols, rows);
    let any = false;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const v = shadeAt((gx0 + i) * step + step / 2, (gy0 + j) * step + step / 2) * 0.42 * day;
      if (v > 0.02) any = true;
      img.data[(j * cols + i) * 4 + 3] = Math.round(v * 255);
    }
    if (!any) return false;
    shG.putImageData(img, 0, 0);
    lg.save();
    lg.globalCompositeOperation = 'source-over';
    lg.imageSmoothingEnabled = true;
    lg.drawImage(shCv, 0.5, 0.5, cols - 1, rows - 1, sx(gx0 * step + step / 2) * k, sy(gy0 * step + step / 2) * k, (cols - 1) * step * scale * k, (rows - 1) * step * scale * k);
    lg.restore();
    return true;
  }

  // ---------------------------------------------------------------- fireflies
  const flies = [];
  function tickFlies(dt) {
    if (!on() || !AI.Sky || AI.Sky.darkness() < 0.55 || AI.Sky.rain > 0.3) { if (flies.length) flies.length = 0; return; }
    const p = AI.R.Game.player;
    if (!p) return;
    if (flies.length < 26 && Math.random() < dt * 6) {
      const x = p.x + U.rand(-420, 420), y = p.y + U.rand(-260, 260);
      const r = region(x, y);
      if (r.wet > 0.4 || r.clear > 0.3 || r.site === 'celebi' || r.site === 'cresselia') flies.push({ x, y, t: 0, life: U.rand(5, 11), ph: Math.random() * 6.28, vx: U.rand(-8, 8), vy: U.rand(-6, 6) });
    }
    for (let i = flies.length - 1; i >= 0; i--) {
      const f = flies[i];
      f.t += dt; f.x += (f.vx + Math.sin(f.t * 1.3 + f.ph) * 10) * dt; f.y += (f.vy + Math.cos(f.t * 1.1 + f.ph) * 8) * dt;
      if (f.t > f.life || Math.hypot(f.x - p.x, f.y - p.y) > 700) flies.splice(i, 1);
    }
  }
  function flyGlow(f) { return Math.max(0, Math.sin(f.t * 2.4 + f.ph)) * Math.min(1, f.t, f.life - f.t); }
  function drawFlies(ctx) {
    for (const f of flies) {
      const a = flyGlow(f);
      if (a < 0.05) continue;
      ctx.fillStyle = 'rgba(220,255,140,' + a.toFixed(2) + ')';
      ctx.fillRect(Math.round(f.x), Math.round(f.y - 18), 2, 2);
    }
  }
  function lights(out) {
    for (const f of flies) { const a = flyGlow(f); if (a > 0.1) out.push({ x: f.x, y: f.y - 18, r: 16, c: [200, 255, 120], i: a * 0.7 }); }
    // moonlight on the water where the moon is reflected
    const mv = moonVis();
    if (mv > 0.02 && moonRef.ok && AI.time - moonRef.t < 1) out.push({ x: moonRef.x, y: moonRef.y, r: 70, c: [170, 185, 230], i: 0.45 * AI.Sky.moonLight() * mv });
  }

  // ---------------------------------------------------------------- water and Pokémon: who can go where
  /* By how a species moves, not by its type:
   *   fly     — winged or hovering: crosses water without touching it
   *   swim    — fish and other true swimmers: water is home; once in it, they stay in it
   *   amphi   — amphibious: walk on land, swim in water
   *   surface — skates on the water (Surskit)
   *   walk    — everything else: shallows are fine, deep water is not */
  const SWIM = new Set([7, 8, 9, 54, 55, 60, 61, 62, 72, 73, 79, 80, 86, 87, 90, 91, 98, 99, 116, 117, 118, 119, 120, 121, 129, 130, 131, 138, 139, 140, 141, 147, 148, 158, 159, 160, 170, 171, 183, 184, 186, 194, 195, 211, 222, 223, 224, 226, 230, 258, 259, 260, 270, 271, 272, 278, 279, 318, 319, 320, 321, 339, 340, 341, 342, 349, 350, 363, 364, 365, 366, 367, 368, 369, 370, 382, 393, 394, 395, 418, 419, 422, 423, 456, 457, 458, 489, 490, 501, 502, 503, 535, 536, 537, 550, 564, 565, 580, 581, 592, 593, 594, 656, 657, 658, 688, 689, 690, 691, 692, 693, 746, 747, 748, 751, 752, 767, 768, 771, 779, 833, 834, 845, 846, 847, 882, 883]);
  const FISH = new Set([118, 119, 129, 130, 170, 171, 211, 222, 223, 226, 318, 319, 320, 321, 339, 340, 349, 350, 366, 367, 368, 369, 370, 382, 456, 457, 458, 489, 490, 550, 592, 593, 594, 746, 779, 846, 847, 72, 73, 90, 91, 116, 117, 120, 121, 138, 139, 140, 141, 224, 230, 690, 691]);
  const SURFACE = new Set([283]);
  const locoCache = new Map();
  function locomotion(dex) {
    let l = locoCache.get(dex);
    if (l) return l;
    const R = AI.R;
    const types = (R.DEX_BY[dex] || {}).types || [];
    let hov = false;
    try { hov = !!R.Sprites.hovers(dex); } catch (e) { /* ignore */ }
    if (SURFACE.has(dex)) l = 'surface';
    else if (hov || types.includes('flying')) l = 'fly';
    else if (FISH.has(dex)) l = 'swim';
    else if (SWIM.has(dex) || types.includes('water')) l = 'amphi';
    else l = 'walk';
    locoCache.set(dex, l);
    return l;
  }
  function canDeep(dex) { return locomotion(dex) !== 'walk'; }
  // after the game moves something: keep it out of water it can't enter, sliding along the shore
  function collideWater(ent) {
    if (!on() || !ent || ent.dex == null) return false;
    const dex = ent.dex;
    const loco = locomotion(dex);
    const okAt = (x, y) => {
      const d = depthClass(x, y);
      if (d === 2 && loco === 'walk') return false;
      if (loco === 'swim' && d === 0 && ent._psxWet) return false;
      return true;
    };
    if (okAt(ent.x, ent.y)) {
      ent._psxOk = ent._psxOk || [0, 0];
      ent._psxOk[0] = ent.x; ent._psxOk[1] = ent.y;
      ent._psxWet = depthClass(ent.x, ent.y) > 0 ? true : loco === 'swim' ? ent._psxWet : false;
      return false;
    }
    const o = ent._psxOk;
    if (o) {
      // slide: keep whichever axis of the move is allowed
      if (okAt(ent.x, o[1])) ent.y = o[1];
      else if (okAt(o[0], ent.y)) ent.x = o[0];
      else { ent.x = o[0]; ent.y = o[1]; }
    } else {
      // dropped into deep water (spawned, knocked, teleported): to the nearest shore
      for (let r = 20; r < 600; r += 20) {
        let done = false;
        for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, x = ent.x + Math.cos(a) * r, y = ent.y + Math.sin(a) * r; if (okAt(x, y)) { ent.x = x; ent.y = y; done = true; break; } }
        if (done) break;
      }
    }
    if (ent.psx) ent.psx.waterBlockT = AI.time;
    return true;
  }
  // a wild Pokémon may not appear in water it couldn't be in: it's moved to the nearest place that
  // suits it (the shore for walkers, the water for fish), or doesn't appear at all
  function spawnOk(e) {
    if (!on() || !e || e.dex == null || e.psxPlaced) return true;
    const l = locomotion(e.dex);
    const fits = (x, y) => { const d = depthClass(x, y); return l === 'swim' ? d > 0 : l === 'walk' ? d < 2 : true; };
    if (fits(e.x, e.y)) return true;
    for (let r = 32; r <= 480; r += 32) for (let k = 0; k < 12; k++) {
      const a = (k / 12 + r * 0.013) * 6.283, x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
      if (fits(x, y) && (l === 'swim' || !AI.R.World.isWall(x, y))) { e.x = x; e.y = y; return true; }
    }
    return false;
  }
  // a random point in the water near (x, y), for swimmers' wandering
  function waterPointNear(x, y, r) {
    for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, d = Math.random() * r, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if (depthClass(px, py) > 0) return [px, py]; }
    return null;
  }

  // ---------------------------------------------------------------- trees: which kind grows where
  const KIND = {
    outer: ['oak_a', 'oak_b', 'oak_c', 'oak_d', 'ball_a', 'ball_b', 'puff_a', 'puff_b', 'puff_c', 'puff_d', 'cone_a', 'cone_b', 'cone_c', 'pine_c', 'pine_d', 'fir_b', 'fir_c', 'tree_round_01', 'tree_round_02', 'tree_tall_01', 'tree_tall_02', 'broad_a'],
    deep: ['fir_a', 'fir_b', 'fir_c', 'fir_d', 'fir_e', 'pine_c', 'pine_d', 'cone_c', 'cone_d', 'cone_f', 'gnarl_b', 'ball_b', 'fir_a', 'fir_d'],
    grove: ['oak_a', 'oak_c', 'oak_d', 'gnarl_a', 'gnarl_b', 'rootoak', 'ball_big_a', 'ball_big_b', 'broad_a', 'flat_b', 'oak_b'],
    wet: ['puff_a', 'puff_b', 'puff_c', 'puff_d', 'ball_a', 'flat_a', 'flat_b', 'tree_round_01', 'tree_round_02', 'tree_tall_01', 'tree_tall_02', 'spiky_a', 'spiky_b'],
    young: ['sapling_01', 'sapling_02', 'sapling2_01', 'pine_s1', 'pine_s2', 'cypress_a', 'cypress_b', 'cone_e'],
    giant: ['giant_a', 'giant_b', 'giant_vine_a', 'giant_vine_b'],
    twisted: ['gnarl_a', 'gnarl_b', 'rootoak', 'gnarl_a', 'gnarl_b', 'rootoak', 'oak_d', 'haunt_tree_a'],
  };
  function treeFor(prop, dmin, sizes) {
    const A = AI.Art;
    const x = (prop.tx + 0.5) * TS, y = (prop.ty + 0.5) * TS;
    const r = region(x, y);
    const h = U.hash(prop.tx, prop.ty, 4242);
    const pickL = (list, salt) => list[(U.hash(prop.tx, prop.ty, salt) * list.length) | 0];
    const hOf = (n) => (A.IDX[n] ? A.IDX[n][3] : 50);
    let list = r.deep > 0.55 ? KIND.deep : r.grove > 0.55 ? KIND.grove : r.wet > 0.6 ? KIND.wet : KIND.outer;
    const d = dmin == null ? 999 : dmin;
    // the last stretch before the haunted mansion: older, taller, twisted trees (ground first seen
    // after the mansion was placed only, so nothing you've already walked past changes)
    const jk = AI.Journey ? AI.Journey.nearK(x, y) : 0;
    if (jk > 0.25 && AI.Journey.fresh(x, y) && U.hash(prop.tx, prop.ty, 4249) < jk) {
      list = KIND.twisted;
      if (sizes && d > 80 && U.hash(prop.tx, prop.ty, 4250) < jk * 0.7) return { n: pickL(KIND.twisted, 4251), s: 1.5, stage: 'large' };
    }
    // ancient landmark trees: mostly in the old groves, very rarely anywhere else
    if (sizes && d > 175 && (r.grove > 0.6 ? h < 0.07 : h < 0.012)) return { n: pickL(KIND.giant, 4244), s: 1.5, stage: 'ancient' };
    if (sizes && h < 0.2 && d > 110) { const big = list.filter((n) => hOf(n) >= 48); return { n: pickL(big.length ? big : list, 4245), s: 1.5, stage: 'large' }; }
    // the spacing is even, so younger trees come by chance: a share of saplings and young trees
    // growing up between the mature ones
    const young = list.filter((n) => hOf(n) < 52);
    if (sizes && (d <= 38 || h > 0.9)) return { n: pickL(KIND.young, 4248), s: 1, stage: 'sapling' };
    if (sizes && (d <= 64 || h > 0.76)) return { n: pickL(young.length ? young : KIND.young, 4247), s: 1, stage: 'young' };
    return { n: pickL(list, 4246), s: 1, stage: 'mature' };
  }
  // the game's undergrowth props, in woodland greens
  const UNDER = ['tuft_1', 'tuft_5', 'tuftlow_1', 'w_fern_a', 'w_fern_b', 'w_bracken', 'fern', 'bushtiny_10', 'bushtiny_11', 'bushball_10', 'bushball_11', 'tuft_1', 'w_fern_c'];
  function underFor(prop) {
    const x = (prop.tx + 0.5) * TS, y = (prop.ty + 0.5) * TS;
    if (water(x, y).e > -50) return U.hash(prop.tx, prop.ty, 5152) < 0.5 ? 'tuft_1' : 'w_fern_b';
    return UNDER[(U.hash(prop.tx, prop.ty, 5151) * UNDER.length) | 0];
  }

  // ---------------------------------------------------------------- undergrowth by habitat
  /* Each 512 px chunk is sampled at a few dozen jittered points; what grows at a point depends on
   * where it is: reeds and lilies at the water, ferns, moss and fungi in the damp and the shade,
   * flowers only in sunlit clearings, leaf litter and fallen branches under the trees. Density
   * varies with the region, so some places are lush and others bare. */
  const FLOWERS = ['w_anemones', 'w_bluebells', 'flower_a1', 'flower_b4', 'flower_c0', 'w_anemones'];
  function decor(cx, cy, ch, R, push, ok) {
    const x0 = cx * ch, y0 = cy * ch;
    const N = 46;
    for (let n = 0; n < N; n++) {
      const x = x0 + ((n % 7) + R()) * (ch / 7), y = y0 + (((n / 7) | 0) + R()) * (ch / 7);
      // (copies: checking free space below can generate terrain, which reuses these scratch objects)
      const w = Object.assign({}, water(x, y));
      const r1 = R(), r2 = R(), f = R() < 0.5;
      if (w.e > 0) {
        // lily pads float in the calm shallows
        if (!w.deep && w.e > 10 && w.kind !== 'stream' && r1 < 0.35) push({ k: 'lily', n: r2 < 0.2 ? 'lily_flower' : 'lily', x, y, s: 0.8 + r2 * 0.3, f, flat: true, water: true });
        // reeds stand in the margins
        else if (w.e < 20 && r1 < 0.75) push({ k: 'plant', n: 'w_reeds', x, y, s: 0.55 + r2 * 0.2, f, water: true });
        continue;
      }
      if (pathDist(x, y) < 10) { if (r1 < 0.25) push({ k: 'litter', n: r2 < 0.5 ? 'w_litter_a' : 'w_litter_b', x, y, s: 0.8, f, flat: true }); continue; }
      const r = Object.assign({}, region(x, y));
      if (r.siteK > 0.3) continue; // the mysteries' sites dress themselves
      // toward the haunted mansion: things people left behind, dead saplings, pale fungi
      const jk = AI.Journey ? AI.Journey.nearK(x, y) : 0;
      if (jk > 0.25 && AI.Journey.fresh(x, y)) {
        if (r1 < jk * 0.45 && ok(x, y, 8)) {
          const q = R();
          if (q < 0.3) push({ k: 'plant', n: q < 0.15 ? 'deadsapling_a' : 'deadsapling_b', x, y, f, r: 8 });
          else if (q < 0.45) push({ k: 'mush', n: 'ghostshroom_s', x, y, s: 0.8, f, hab: 'mush', r: 8, light: { r: 36, c: [150, 200, 255], kind: 'glow' } });
          else if (q < 0.6) push({ k: 'grave', n: 'g_fence', x, y, s: 0.5, f, r: 0 });
          else if (q < 0.72) push({ k: 'litter', n: q < 0.66 ? 'stonepath' : 'steppingstone', x, y, f, flat: true });
          else if (q < 0.8) push({ k: 'stone', n: 'x_marker', x, y, f, r: 6 });
          else if (q < 0.88) push({ k: 'litter', n: 'w_litter_b', x, y, f, flat: true });
          else push({ k: 'grave', n: U.hash(x, y, 3) < 0.5 ? 'g_skull_a' : 'g_grave_pale', x, y, s: 0.5, f, r: 0 });
          continue;
        }
        if (r.clear > 0.4 && R() < jk) continue; // no flowers out here
      }
      const shore = -w.e;
      if (shore < 46) {
        if (!ok(x, y, 6)) continue;
        if (r1 < 0.55) push(r2 < 0.6 ? { k: 'plant', n: 'w_reeds', x, y, s: 0.6 + R() * 0.2, f, hab: 'grass', r: 6 } : { k: 'tuft', n: r2 < 0.8 ? 'tuft_1' : 'tuftlow_1', x, y, s: 0.9, f, flat: true });
        else if (r1 < 0.68) push({ k: 'stone', n: r2 < 0.5 ? 'w_moss_stone_a' : 'w_moss_stone_b', x, y, s: 0.8 + R() * 0.3, f, r: 9 });
        else if (r1 < 0.74) push({ k: 'litter', n: 'w_branch', x, y, s: 1, f, flat: true });
        continue;
      }
      const shade = Math.max(r.grove, r.deep);
      const dens = 0.55 + shade * 0.3 + r.wet * 0.2 - r.clear * 0.15 + (vn(x / 300, y / 300, plan().seed + 97) - 0.5) * 0.7;
      if (r1 > dens) continue;
      if (!ok(x, y, 8)) continue;
      const k = R();
      if (r.clear > 0.4) {
        // a sunlit clearing: grasses and a few wildflowers
        if (k < 0.3) push({ k: 'flower', n: FLOWERS[(r2 * FLOWERS.length) | 0], x, y, s: 0.8 + R() * 0.2, f, flat: true });
        else if (k < 0.75) push({ k: 'tuft', n: r2 < 0.5 ? 'tuft_1' : r2 < 0.8 ? 'tuft_5' : 'tuftlow_1', x, y, s: 0.9 + R() * 0.3, f, flat: true });
        else if (k < 0.85) push({ k: 'plant', n: 'sprout', x, y, f, hab: 'grass', r: 6 });
        else push({ k: 'bush', n: r2 < 0.5 ? 'bushtiny_10' : 'bushtiny_11', x, y, f, hab: 'bush', r: 10 });
      } else if (r.wet > 0.6) {
        // the wetwood: ferns, bracken, moss, fungi on rotting wood
        if (k < 0.3) push({ k: 'plant', n: ['w_fern_a', 'w_fern_b', 'w_fern_c', 'w_bracken'][(r2 * 4) | 0], x, y, s: 0.9 + R() * 0.3, f, hab: 'bush', r: 8 });
        else if (k < 0.45) push({ k: 'tuft', n: r2 < 0.5 ? 'tuftlow_1' : 'tuft_1', x, y, flat: true, f });
        else if (k < 0.57) push({ k: 'stone', n: r2 < 0.5 ? 'w_moss_stone_a' : 'w_moss_stone_b', x, y, s: 0.8 + R() * 0.3, f, r: 9 });
        else if (k < 0.67) push({ k: 'mush', n: ['mushroom_mid', 'mushroom_small', 'mushroom_big'][(r2 * 3) | 0], x, y, s: 0.8, f, hab: 'mush', r: 8 });
        else if (k < 0.77) push({ k: 'litter', n: r2 < 0.5 ? 'w_branch' : 'w_ivy', x, y, f, flat: true });
        else if (k < 0.87) push(w.e > -70 ? { k: 'plant', n: 'w_reeds', x, y, s: 0.6 + R() * 0.15, f, hab: 'grass', r: 6 } : { k: 'tuft', n: 'tuft_1', x, y, flat: true, f });
        else push({ k: 'bush', n: ['bushball_10', 'bushball_12', 'bushtiny_12'][(r2 * 3) | 0], x, y, f, hab: 'bush', r: 12 });
      } else if (shade > 0.5) {
        // under the old trees: ferns, moss stones, ivy, roots, fungi, fallen branches, saplings
        if (k < 0.28) push({ k: 'plant', n: ['w_fern_a', 'w_fern_b', 'w_fern_c', 'w_bracken', 'fern'][(r2 * 5) | 0], x, y, s: 0.9 + R() * 0.35, f, hab: 'bush', r: 8 });
        else if (k < 0.42) push({ k: 'litter', n: ['w_litter_a', 'w_litter_b', 'w_branch', 'w_ivy', 'w_branch'][(r2 * 5) | 0], x, y, s: 0.9 + R() * 0.2, f, flat: true });
        else if (k < 0.52) push({ k: 'stone', n: r2 < 0.5 ? 'w_moss_stone_a' : 'w_moss_stone_b', x, y, s: 0.8 + R() * 0.4, f, r: 9 });
        else if (k < 0.62) {
          const glow = r.deep > 0.5 && R() < 0.25;
          push({ k: 'mush', n: glow ? 'ghostshroom_s' : ['mushroom_mid', 'mushroom_small', 'mushroom_big'][(r2 * 3) | 0], x, y, s: 0.8, f, hab: 'mush', r: 8, light: glow ? { r: 40, c: [150, 220, 255], kind: 'glow' } : null });
        } else if (k < 0.72) push({ k: 'plant', n: ['sapling_10', 'sapling_11', 'sapling2_10', 'sapling2_11'][(r2 * 4) | 0], x, y, f, hab: 'bush', r: 8 });
        else if (k < 0.84) push({ k: 'bush', n: ['bushball_10', 'bushball_11', 'bushball_12', 'bushball_14', 'bushtiny_10'][(r2 * 5) | 0], x, y, f, hab: 'bush', r: 12 });
        else push({ k: 'tuft', n: 'tuftlow_1', x, y, flat: true, f });
      } else {
        // the outer woodland: grasses, small shrubs, ferns, a little litter
        if (k < 0.34) push({ k: 'tuft', n: r2 < 0.45 ? 'tuft_1' : r2 < 0.75 ? 'tuftlow_1' : 'tuft_5', x, y, s: 0.85 + R() * 0.3, f, flat: true });
        else if (k < 0.5) push({ k: 'plant', n: ['w_fern_a', 'w_fern_b', 'fern', 'w_bracken'][(r2 * 4) | 0], x, y, s: 0.85 + R() * 0.3, f, hab: 'bush', r: 8 });
        else if (k < 0.64) push({ k: 'bush', n: ['bushtiny_10', 'bushtiny_11', 'bushtiny_13', 'bushball_11', 'bushball_13'][(r2 * 5) | 0], x, y, f, hab: 'bush', r: 12 });
        else if (k < 0.74) push({ k: 'litter', n: ['w_litter_a', 'w_litter_b', 'w_branch'][(r2 * 3) | 0], x, y, f, flat: true });
        else if (k < 0.8) push({ k: 'plant', n: ['sapling_10', 'sapling_11', 'sprout'][(r2 * 3) | 0], x, y, f, hab: 'bush', r: 8 });
        else if (k < 0.84) push({ k: 'stone', n: 'w_moss_stone_b', x, y, s: 0.8, f, r: 8 });
        else if (k < 0.87) push({ k: 'mush', n: 'mushroom_small', x, y, s: 0.8, f, hab: 'mush', r: 8 });
      }
    }
  }

  // ---------------------------------------------------------------- per frame
  let lapT = 0;
  function tick(dt) {
    tickFlies(dt);
    // water laps at the shore when you're near it
    lapT -= dt;
    const p = on() && AI.R.Game.player;
    if (p && lapT <= 0) {
      lapT = U.rand(1.6, 3.4);
      const w = water(p.x, p.y);
      if (w.e > -120 && AI.Ambience && AI.Ambience.lap) AI.Ambience.lap(p.x + U.rand(-80, 80), p.y - 40);
    }
  }
  function reset() { P = null; chunks.clear(); shadeCache.clear(); flies.length = 0; chunkSeed = null; }
  // forget the painted ground in an area (it is painted again, e.g. around a newly placed mansion)
  function invalidate(x0, y0, x1, y1) {
    for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) chunks.delete(chunkKey(cx, cy));
    shadeCache.clear();
  }

  AI.define('Forest', {
    on, plan, water, depthClass, region, soilAt, pathDist, terr, trees, grass, drawGround, drawMist, drawFlies, lights, shadeAt, shadeLightMap, drawMoonReflection, moonVis,
    locomotion, canDeep, collideWater, spawnOk, waterPointNear, tick, reset, invalidate, quietAt, chunks, vn, fbm, treeFor, underFor, decor, KIND,
  });
})();
