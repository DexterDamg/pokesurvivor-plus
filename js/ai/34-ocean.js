/* PokéSurvivor+ — Living World AI · Level 3, the Tropical Ocean
 * Level 3 (it was the Ash Volcano) is now an ocean of islands. You start on the wooden pier of a
 * harbour town (painted art, assets/ocean/harbor.webp) with boats moored beside it and a lighthouse
 * on the rocky headland; beyond lies open sea, reefs, wrecks, tide flats, a whirlpool, a trench, and
 * islands: four guardian islands (82-guardians.js), small islands with their own residents, and,
 * very rarely, Birth Island (82-birth.js).
 *
 * How it's built (the Shady Forest's philosophy, 34-forest.js: a seeded plan first, then fields):
 *   · a seeded plan places every island, reef, wreck, current and tidal path
 *   · one raster (16 px cells) over the whole sea holds land and water; a distance transform turns it
 *     into "how far from the coast", which, with noise, gives the depth classes:
 *       0 land · 1 shallow (turquoise, anyone can wade) · 2 medium (deep blue: swimmers or a boat)
 *       3 deep (navy) · 4 abyssal (the trench, near black)
 *   · the painted islands (the harbour, Birth Island) carry their own 8 px collision grids, made by
 *     tools/ocean_art.py from the art: water, walkable land, solid (buildings, cliffs, trees)
 *   · tides (twice a day) widen and narrow the shallows, expose sandbars and tidal paths at low
 *     tide and drown them at high tide; nobody caught on one is ever trapped: you can always wade out
 * Who can go where depends on how a species moves (not just its type): fish never leave the water,
 * shore-dwellers (Shellder, Slowpoke, Krabby…) keep to the coast and the shallows, Seel and the
 * amphibious go anywhere, fliers cross everything. You can wade the shallows; deeper water needs a
 * boat (34-boats.js), unless your Pokémon is a Water type and swims.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const ART = window.PSXAI_OCEAN_ART || { islands: {}, props: {}, boats: {} };
  const TS = 32;
  let BIOME = -1; // the Tropical Ocean's index in the game's biome list (set at registration)

  function on() {
    try { return AI.enabled && AI.cfg.tropicalOcean !== false && BIOME >= 0 && AI.R && AI.R.World && AI.R.World.biome === BIOME && !(AI.R.Rift && AI.R.Rift.inArena); } catch (e) { return false; }
  }
  const F = () => AI.Forest; // (shared noise)
  const vn = (x, y, s) => F().vn(x, y, s);
  const fbm = (x, y, s, o) => F().fbm(x, y, s, o);
  const sm = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function segDist(x, y, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = U.clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
    return Math.hypot(x - ax - dx * t, y - ay - dy * t);
  }
  function lineDist(x, y, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; }
  // the direction along a polyline nearest to (x, y)
  function lineDir(x, y, pts) {
    let best = 1e9, dir = [1, 0];
    for (let i = 0; i < pts.length - 1; i++) {
      const d = segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (d < best) { best = d; const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dy) || 1; dir = [dx / l, dy / l]; }
    }
    return dir;
  }

  // ---------------------------------------------------------------- the painted islands
  /* The harbour sits so that the middle of its pier is the world's origin (where every run
   * starts). Birth Island is drawn at twice its pixel size (its art is Game Boy Advance scale). */
  const HARBOR = { x: -825, y: -1125 };
  const art = {};
  function decode(o) {
    const g = new Uint8Array(o.gw * o.gh);
    let k = 0;
    for (const row of o.rows) {
      const re = /(\d+)([wls])/g;
      let m;
      while ((m = re.exec(row))) { const n = +m[1]; g.fill(m[2] === 'w' ? 0 : m[2] === 'l' ? 1 : 2, k, k + n); k += n; }
    }
    return g;
  }
  function placeArt(name, x, y) {
    const o = ART.islands[name];
    if (!o) return null;
    const a = art[name] || (art[name] = { name, w: o.w, h: o.h, cell: o.cell, gw: o.gw, gh: o.gh, g: decode(o) });
    a.x = x; a.y = y; a.on = true;
    return a;
  }
  // -1 outside every painted island, else 0 water, 1 walkable, 2 solid
  function artAt(x, y) {
    for (const k in art) {
      const a = art[k];
      if (!a.on || x < a.x || y < a.y || x >= a.x + a.w || y >= a.y + a.h) continue;
      const gx = ((x - a.x) / a.cell) | 0, gy = ((y - a.y) / a.cell) | 0;
      return a.g[gy * a.gw + gx];
    }
    return -1;
  }
  function artOf(x, y, pad) {
    pad = pad || 0;
    for (const k in art) { const a = art[k]; if (a.on && x >= a.x - pad && y >= a.y - pad && x < a.x + a.w + pad && y < a.y + a.h + pad) return a; }
    return null;
  }

  // ---------------------------------------------------------------- the plan
  let P = null;
  function seedNow() { return AI.Decor ? AI.Decor.seed : 1; }
  function plan() {
    const s = seedNow();
    if (P && P.seed === s) return P;
    P = makePlan(s);
    buildRaster(P);
    return P;
  }
  function blob(id, kind, x, y, R, s, extra) {
    const h = (i) => U.hash(s, i, id.length * 31 + 7);
    return Object.assign({ id, kind, x, y, R, s: 9000 + id.length * 13 + Math.round(h(0) * 900), amps: [0.12 + h(1) * 0.08, 0.08 + h(2) * 0.05, 0.05 + h(3) * 0.03, 0.025], ph: [h(4) * 6.28, h(5) * 6.28, h(6) * 6.28, h(7) * 6.28] }, extra || {});
  }
  function makePlan(seed) {
    const h = (i) => U.hash(seed, i, 9100);
    const J = (i, r) => (h(i) - 0.5) * 2 * r;
    const isl = [];
    // the four guardian islands, one in each direction away from the harbour
    isl.push(blob('koko', 'thunder', -3300 + J(1, 260), 2750 + J(2, 220), 560, seed, { name: 'Thundercrest Island', tapu: 785, arenaR: 190 }));
    isl.push(blob('lele', 'blossom', 3500 + J(3, 260), 2450 + J(4, 220), 600, seed, { name: 'Blossomveil Island', tapu: 786, arenaR: 200 }));
    isl.push(blob('bulu', 'jungle', -4300 + J(5, 220), 650 + J(6, 260), 680, seed, { name: 'Verdant Crown Island', tapu: 787, arenaR: 210 }));
    isl.push(blob('fini', 'souls', 2650 + J(7, 260), 5350 + J(8, 220), 640, seed, { name: 'Isle of Lost Souls', tapu: 788, arenaR: 200 }));
    // Thundercrest's arena sits on a cliff-top; one ramp climbs up to it, on the side facing the harbour
    const kk = isl[0];
    kk.ring = { r0: kk.arenaR + 4, r1: kk.arenaR + 34, gap: Math.atan2(-kk.y, -kk.x), gapW: 0.3 };
    // small islands, each with its own residents
    isl.push(blob('wingull', 'rock', -1750 + J(9, 120), 1050 + J(10, 120), 170, seed, { name: 'Gull Rock' }));
    isl.push(blob('slowpoke', 'beach', 2250 + J(11, 160), 650 + J(12, 140), 250, seed, { name: 'Slowpoke Cay' }));
    isl.push(blob('seel', 'rocky', 4350 + J(13, 160), -650 + J(14, 160), 320, seed, { name: 'Seel Rocks' }));
    isl.push(blob('pools', 'pools', -900 + J(15, 100), 1750 + J(16, 120), 210, seed, { name: 'Tide-Pool Flats' }));
    isl.push(blob('lugia', 'shrine', 450 + J(17, 160), 4350 + J(18, 120), 210, seed, { name: 'Whirl Islet' }));
    isl.push(blob('whirlW', 'crag', 180 + J(19, 40), 3620, 120, seed));
    isl.push(blob('whirlE', 'crag', 760 + J(20, 40), 3640, 120, seed));
    // the Seel colony's grotto, at the foot of its rocks (dry at low tide)
    const seel = isl.find((o) => o.id === 'seel');
    const grotto = { x: seel.x - seel.R * 0.75, y: seel.y + seel.R * 0.55, r: 70 };
    grotto.cave = [grotto.x + 0.75 * 95, grotto.y - 0.55 * 95]; // (its mouth, at the foot of the rocks)
    // reefs (shallow flats with coral heads), lagoons (wide warm shallows)
    const reefs = [
      { id: 'reef', x: 700 + J(21, 200), y: 2350 + J(22, 160), R: 430 },
      { id: 'reef2', x: 3050 + J(23, 180), y: 1200 + J(24, 160), R: 300 },
      { id: 'reef3', x: -2600 + J(25, 180), y: 3700 + J(26, 160), R: 260 },
    ];
    const lagoons = [
      { x: 520, y: -80, R: 420 }, // the harbour's east beach
      { x: 2250 + J(11, 160), y: 650 + J(12, 140), R: 470 }, // around Slowpoke Cay
      { x: -900 + J(15, 100), y: 1750 + J(16, 120), R: 380 },
      { x: 3500 + J(3, 260) - 420, y: 2450 + J(4, 220) + 380, R: 380 }, // Blossomveil's lagoon
    ];
    // a sandbar off the harbour beach, joined to it by a tidal path: dry at low tide, drowned at high
    const sandbar = { x: 1250 + J(27, 120), y: 420 + J(28, 100), rx: 260, ry: 95, ang: -0.3 + J(29, 0.25) };
    const tidal = [
      { id: 'causeway', w: 80, pts: [[560, -140], [760, 20], [960, 210], [sandbar.x - 120, sandbar.y - 20]] },
      { id: 'grotto', w: 70, pts: [[grotto.x + 30, grotto.y - 50], [grotto.x - 20, grotto.y + 10], [grotto.x - 60, grotto.y + 40]] },
    ];
    const lugia = isl.find((o) => o.id === 'lugia');
    // the shrine lies just off Whirl Islet: at low tide a path of old stones leads down to it
    const shrine = { x: lugia.x + 300, y: lugia.y + 150, r: 120 };
    tidal.push({ id: 'shrine', w: 74, pts: [[lugia.x + lugia.R * 0.7, lugia.y + 40], [lugia.x + lugia.R + 60, lugia.y + 90], [shrine.x - 60, shrine.y - 10]] });
    // wrecks: an old trader on the open sea, and one more, somewhere in Fini's fog
    const fini = isl.find((o) => o.id === 'fini');
    const wrecks = [
      { id: 'wreck', x: -1500 + J(30, 200), y: 3700 + J(31, 160), ang: 0.4 + J(32, 0.6), ghost: false },
      { id: 'ghost', x: fini.x - 1050 + J(33, 120), y: fini.y + 600 + J(34, 120), ang: -0.5 + J(35, 0.4), ghost: true },
    ];
    // currents: Tentacool drift along them; they push boats
    const currents = [
      { id: 'east', w: 260, k: 70, pts: [[-2800, 1900], [-1200, 2050], [400, 1700], [1900, 1950], [3300, 1650]] },
      { id: 'south', w: 220, k: 60, pts: [[4600, 300], [4300, 1400], [4500, 3200], [3900, 4400]] },
    ];
    const whirl = { x: 470, y: 3640, R: 190 };
    // the trench, far below
    const trench = { w: 520, pts: [[-2400, 4900], [-900, 4650], [450, 4950], [1700, 4700], [3300, 4500], [4800, 4800]] };
    // fog banks: Fini's isle is never clear, nor is the wreck near it
    const fogs = [
      { id: 'fini', x: fini.x, y: fini.y, R: fini.R + 1300, k: 0.78 },
      { id: 'ghost', x: wrecks[1].x, y: wrecks[1].y, R: 700, k: 0.9 },
    ];
    // Birth Island: in some worlds only, far out, inside its own fog bank (82-birth.js)
    let birth = null;
    // (each world without it makes the next one likelier: no grinding)
    const miss = AI.Sea ? AI.Sea.save.birthMiss || 0 : 0;
    if (h(60) < (AI.cfg.birthIslandChance == null ? 0.35 : AI.cfg.birthIslandChance) + miss * 0.2) {
      const a = [-2.3, 2.6, 0.9, -0.6][(h(61) * 4) | 0] + J(62, 0.25), d = 6300 + h(63) * 600;
      birth = { x: Math.round(Math.cos(a) * d - 480), y: Math.round(Math.sin(a) * d - 480) };
      fogs.push({ id: 'birth', x: birth.x + 480, y: birth.y + 480, R: 1200, k: 0.75 });
    }
    // a storm that never quite leaves Thundercrest
    const storms = [{ id: 'koko', x: isl[0].x, y: isl[0].y, R: isl[0].R + 900 }];
    return { seed, isl, reefs, lagoons, sandbar, tidal, shrine, grotto, wrecks, currents, whirl, trench, fogs, storms, birth, byId: Object.fromEntries(isl.map((o) => [o.id, o])) };
  }

  // ---------------------------------------------------------------- land shapes
  function shoreR(o, a) { return o.R * (1 + o.amps[0] * Math.sin(2 * a + o.ph[0]) + o.amps[1] * Math.sin(3 * a + o.ph[1]) + o.amps[2] * Math.sin(5 * a + o.ph[2]) + o.amps[3] * Math.sin(7 * a + o.ph[3])); }
  // how far inside an island (px; negative outside)
  function islE(o, x, y) {
    const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
    if (d > o.R * 1.7) return o.R * 1.4 - d;
    return shoreR(o, Math.atan2(dy, dx)) - d + (vn(x / 190, y / 190, o.s) - 0.5) * o.R * 0.3 + (vn(x / 46, y / 46, o.s + 1) - 0.5) * 16;
  }
  /* The mainland around the harbour: its coast carries on from the painting's edges, north (all
   * jungle beyond) and west as far as a headland, past which the open sea begins. */
  function mainland(x, y) {
    const hx = HARBOR.x, hy = HARBOR.y;
    // (bays and headlands grow bigger away from the painting, whose own edges the coast must meet)
    const far = sm(250, 1600, Math.max(hx - x, hy - y, x - hx - 1500, 0));
    const n = (vn(x / 260, y / 260, 9301) - 0.5) * 160 + (vn(x / 70, y / 70, 9302) - 0.5) * 30 + (vn(x / 900, y / 900, 9304) - 0.5) * 900 * far;
    const bend = x < hx ? sm(hx, hx - 700, x) * ((vn(x / 1000, 3.7, 9303) - 0.5) * 1100 - 150) : 0;
    if (y < hy + 6 + bend && x < hx + 1262 + (hy - y) * 0.35 + n) return true;
    if (x < hx + 6 && x > -2350 + n * 1.5 && y < hy + 1050 + (hx - x) * 0.3 + n) return true;
    return false;
  }

  // ---------------------------------------------------------------- the raster: land, water, distance to the coast
  const RC = 16, RN = 1200, R0 = -9600;
  let LAND = null, E = null;
  function buildRaster(p) {
    const t0 = performance.now();
    LAND = new Uint8Array(RN * RN);
    // the painted islands
    for (const k in art) art[k].on = false;
    placeArt('harbor', HARBOR.x, HARBOR.y);
    if (p.birth) placeArt('birth', p.birth.x, p.birth.y);
    const cellOf = (x) => Math.floor((x - R0) / RC);
    const fill = (x0, y0, x1, y1, f) => {
      const i0 = Math.max(0, cellOf(x0)), i1 = Math.min(RN - 1, cellOf(x1)), j0 = Math.max(0, cellOf(y0)), j1 = Math.min(RN - 1, cellOf(y1));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = R0 + (i + 0.5) * RC, y = R0 + (j + 0.5) * RC; if (f(x, y)) LAND[j * RN + i] = 1; }
    };
    fill(R0, R0, HARBOR.x + 1262 + 4000, HARBOR.y + 800, (x, y) => mainland(x, y) && artAt(x, y) < 0);
    fill(-2700, R0, HARBOR.x + 8, HARBOR.y + 1050 + 900, (x, y) => mainland(x, y) && artAt(x, y) < 0);
    for (const k in art) { const a = art[k]; if (a.on) fill(a.x, a.y, a.x + a.w, a.y + a.h, (x, y) => artAt(x, y) > 0); }
    for (const o of p.isl) fill(o.x - o.R * 1.6, o.y - o.R * 1.6, o.x + o.R * 1.6, o.y + o.R * 1.6, (x, y) => islE(o, x, y) > 0);
    // signed distance to the coast (chamfer): + in the water, − on land
    E = new Int16Array(RN * RN);
    const D = new Float32Array(RN * RN);
    const a = RC, b = RC * 1.4142;
    const pass = (target) => {
      for (let i = 0; i < D.length; i++) D[i] = LAND[i] === target ? 0 : 1e9;
      for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
        const k = j * RN + i;
        let v = D[k];
        if (v === 0) continue;
        if (i > 0) v = Math.min(v, D[k - 1] + a);
        if (j > 0) { v = Math.min(v, D[k - RN] + a); if (i > 0) v = Math.min(v, D[k - RN - 1] + b); if (i < RN - 1) v = Math.min(v, D[k - RN + 1] + b); }
        D[k] = v;
      }
      for (let j = RN - 1; j >= 0; j--) for (let i = RN - 1; i >= 0; i--) {
        const k = j * RN + i;
        let v = D[k];
        if (v === 0) continue;
        if (i < RN - 1) v = Math.min(v, D[k + 1] + a);
        if (j < RN - 1) { v = Math.min(v, D[k + RN] + a); if (i < RN - 1) v = Math.min(v, D[k + RN + 1] + b); if (i > 0) v = Math.min(v, D[k + RN - 1] + b); }
        D[k] = v;
      }
    };
    pass(1); // water cells: distance to land
    for (let i = 0; i < E.length; i++) if (!LAND[i]) E[i] = Math.min(32000, Math.round(D[i] - RC / 2));
    pass(0); // land cells: distance to water
    for (let i = 0; i < E.length; i++) if (LAND[i]) E[i] = -Math.min(32000, Math.round(D[i] - RC / 2));
    AI.stats.oceanRasterMs = Math.round(performance.now() - t0);
  }
  function rasterE(x, y) {
    const fx = (x - R0) / RC - 0.5, fy = (y - R0) / RC - 0.5;
    const i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= RN - 1 || j >= RN - 1) return 3000;
    const tx = fx - i, ty = fy - j, k = j * RN + i;
    return (E[k] * (1 - tx) + E[k + 1] * tx) * (1 - ty) + (E[k + RN] * (1 - tx) + E[k + RN + 1] * tx) * ty;
  }

  // ---------------------------------------------------------------- tides
  /* Two tides a day: high at 3:00 and 15:00, low at 9:00 and 21:00 (the game's own clock). */
  function tide() {
    if (AI.cfg.oceanTide != null) return AI.cfg.oceanTide; // (fixed, for tests)
    const hh = AI.Sky ? AI.Sky.hour() : 12;
    return Math.cos(((hh - 3) / 12) * Math.PI * 2);
  }
  function tideName(t) { t = t == null ? tide() : t; return t > 0.45 ? 'high' : t < -0.45 ? 'low' : t > 0 ? 'rising' : 'falling'; }
  // the sandbar and tidal paths: 1 dry, 0.5 shallow, 0 under deeper water; null where there's none
  function tidalAt(x, y, t) {
    const p = plan();
    const sb = p.sandbar;
    let best = null;
    {
      const c = Math.cos(-sb.ang), s = Math.sin(-sb.ang), dx = x - sb.x, dy = y - sb.y;
      const u = (dx * c - dy * s) / sb.rx, v = (dx * s + dy * c) / sb.ry;
      const k = 1 - Math.sqrt(u * u + v * v) + (vn(x / 60, y / 60, 9311) - 0.5) * 0.3;
      if (k > -0.2) best = { k, id: 'sandbar' };
    }
    // the shrine's floor: bared by the tide like its path (82-sea.js)
    {
      const sh = p.shrine, d = Math.hypot(x - sh.x, (y - sh.y) / 0.62);
      if (d < sh.r * 1.2) { const k = 1 - d / sh.r + 0.15; if (!best || k > best.k) best = { k, id: 'shrine' }; }
    }
    for (const tp of p.tidal) {
      const d = lineDist(x, y, tp.pts);
      if (d > tp.w) continue;
      const k = 1 - d / (tp.w / 2) + (vn(x / 40, y / 40, 9313) - 0.5) * 0.25;
      if (!best || k > best.k) best = { k, id: tp.id };
    }
    if (!best) return null;
    const lv = (t + 1) / 2; // 0 low … 1 high
    best.dry = best.k > 0.3 + lv * 0.95;
    best.wet = best.k > -0.05 + lv * 1.2; // (shallow enough to wade; at high tide the paths are gone)
    best.flooded = !best.wet && best.k > -0.2;
    return best;
  }

  // ---------------------------------------------------------------- sampling the sea
  /* One scratch object, refilled by every call (copy what you keep). */
  /* dv: a continuous depth (0–1 shallow, 1–2 medium, 2–3 deep, 3–4 abyssal; ≤ 0 land), so the
   * painted sea and the collision agree. */
  const S0 = { e: 0, dv: 0, cls: 0, solid: false, art: -1, reef: 0, tidal: null, lagoon: 0, trench: false, ring: false };
  // a cliff ring around an arena (Thundercrest's cliff-top), open where its ramp climbs up
  function ringAt(x, y) {
    for (const o of plan().isl) {
      if (!o.ring) continue;
      const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
      if (d < o.ring.r0 || d > o.ring.r1) continue;
      let da = Math.atan2(dy, dx) - o.ring.gap;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) > o.ring.gapW;
    }
    return false;
  }
  function reefK(x, y) {
    let k = 0;
    for (const r of plan().reefs) {
      const d = Math.hypot(x - r.x, y - r.y);
      if (d > r.R * 1.4) continue;
      k = Math.max(k, sm(r.R * (1.15 + (vn(x / 110, y / 110, 9321) - 0.5) * 0.5), r.R * 0.5, d));
    }
    return k;
  }
  function lagoonK(x, y) {
    let k = 0;
    for (const l of plan().lagoons) { const d = Math.hypot(x - l.x, y - l.y); if (d < l.R * 1.2) k = Math.max(k, sm(l.R * 1.2, l.R * 0.55, d)); }
    return k;
  }
  function inTrench(x, y) { const tr = plan().trench; return lineDist(x, y, tr.pts) < tr.w / 2 + (vn(x / 300, y / 300, 9331) - 0.5) * 160; }
  function sample(x, y) {
    plan();
    const o = S0;
    let e = rasterE(x, y);
    o.solid = false; o.reef = 0; o.lagoon = 0; o.tidal = null; o.trench = false; o.ring = false;
    const a = artAt(x, y);
    o.art = a;
    if (a >= 0) { if (a === 0) e = Math.max(e, 5); else { e = Math.min(e, -4); if (a === 2) o.solid = true; } }
    else if (e < -70 && mainland(x, y)) o.solid = true; // (the jungle behind the beaches)
    const t = tide();
    let dv;
    if (e <= 0) dv = e / 100;
    else {
      o.lagoon = lagoonK(x, y);
      const sh = 82 + (vn(x / 230, y / 230, 9341) - 0.5) * 56 - t * 24 + o.lagoon * 240;
      const md = Math.max(sh + 60, 330 + (vn(x / 400, y / 400, 9342) - 0.5) * 160 + o.lagoon * 120);
      if (e < sh) dv = e / sh;
      else if (e < md) dv = 1 + (e - sh) / (md - sh);
      else {
        dv = 2 + Math.min(0.999, (e - md) / 1100);
        if (e > 1700) dv = 3 + Math.min(0.999, (e - 1700) / 1500);
        else if (e > 220 && (o.trench = inTrench(x, y))) dv = 3 + Math.min(0.999, (e - 220) / 900);
      }
      o.reef = reefK(x, y);
      if (o.reef > 0 && dv >= 1) dv = o.reef > 0.55 ? Math.min(dv, 0.6 + (1 - o.reef) * 0.6) : Math.min(dv, 1.95 - o.reef);
    }
    // tidal flats and paths
    if (dv > 0 || e > -40) {
      const td = tidalAt(x, y, t);
      if (td) {
        o.tidal = td;
        if (td.dry) { dv = Math.min(dv, -0.02); e = Math.min(e, -2); }
        else if (td.wet) { dv = U.clamp(dv, 0.2, 0.85); e = Math.max(e, 3); }
        else { dv = Math.max(dv, 1.15); e = Math.max(e, 3); }
      }
    }
    if (dv <= 0 && ringAt(x, y)) { o.solid = true; o.ring = true; }
    o.e = e; o.dv = dv;
    o.cls = dv <= 0 ? 0 : Math.min(4, 1 + Math.floor(dv));
    return o;
  }
  function cls(x, y) { return sample(x, y).cls; }
  // the Shady Forest's three classes (0 land, 1 shallow, 2 too deep to wade), for shared code
  function depthClass(x, y) { return Math.min(2, sample(x, y).cls); }
  function solidAt(x, y) { return sample(x, y).solid; }
  // the forest's water() shape, for code written against it: e (px into the water), deep, kind
  const W0 = { e: 0, dk: 0, deep: false, kind: null };
  function water(x, y) { const s = sample(x, y); W0.e = s.cls > 0 ? Math.max(1, s.e) : Math.min(-1, s.e); W0.dk = s.cls >= 2 ? s.e : -1e9; W0.deep = s.cls >= 2; W0.kind = s.cls > 0 ? 'sea' : null; return W0; }

  // where you are: an island (or the mainland), or the open sea, and what's around
  const Z0 = { isl: null, id: 'sea', d: 0, k: 0 };
  function zoneAt(x, y) {
    const p = plan();
    Z0.isl = null; Z0.id = 'sea'; Z0.d = 0; Z0.k = 0;
    if (artOf(x, y, 200) === art.harbor || mainland(x, y)) { Z0.id = 'harbor'; return Z0; }
    if (art.birth && art.birth.on && artOf(x, y, 300) === art.birth) { Z0.id = 'birth'; return Z0; }
    for (const o of p.isl) {
      const d = Math.hypot(x - o.x, y - o.y);
      if (d < o.R * 1.25 + 140) { Z0.isl = o; Z0.id = o.id; Z0.d = d; Z0.k = U.clamp(1 - d / (o.R * 1.25 + 140), 0, 1); return Z0; }
    }
    for (const w of p.wrecks) if (Math.hypot(x - w.x, y - w.y) < 420) { Z0.id = w.ghost ? 'ghostwreck' : 'wreck'; return Z0; }
    if (reefK(x, y) > 0.1) { Z0.id = 'reef'; return Z0; }
    return Z0;
  }
  function islandById(id) { return plan().byId[id] || null; }
  function insideIsland(o, x, y) { return islE(o, x, y) > 0; }

  // currents (and the whirlpool) at a point: px/s, for boats and drifting things
  const C0 = [0, 0];
  function currentAt(x, y) {
    const p = plan();
    C0[0] = C0[1] = 0;
    for (const c of p.currents) {
      const d = lineDist(x, y, c.pts);
      if (d > c.w) continue;
      const k = c.k * sm(c.w, c.w * 0.3, d);
      const dir = lineDir(x, y, c.pts);
      C0[0] += dir[0] * k; C0[1] += dir[1] * k;
    }
    const w = p.whirl, dx = x - w.x, dy = y - w.y, d = Math.hypot(dx, dy);
    if (d < w.R * 2.4 && d > 1) {
      const k = sm(w.R * 2.4, w.R * 0.35, d);
      C0[0] += (-dy / d * 140 - dx / d * 45) * k; C0[1] += (dx / d * 140 - dy / d * 45) * k; // (round and round, and in)
    }
    // a gentle drift everywhere, turning slowly
    const a = vn(x / 3000, y / 3000, 9351) * 6.28 + AI.time * 0.002;
    C0[0] += Math.cos(a) * 8; C0[1] += Math.sin(a) * 8;
    return C0;
  }
  // fog banks and the storm over Thundercrest (blended into the sky by 36-sky.js)
  function localSky(tgt) {
    if (!on()) return;
    const p = plan();
    const pl = AI.R.Game.player;
    if (!pl) return;
    // (no snow in the tropics; winter only brings more wind)
    tgt.snow = 0;
    if (AI.Sky && AI.Sky.season() === 'winter') { tgt.rain = AI.Sky.PATTERNS[AI.Sky.st.pattern] ? AI.Sky.PATTERNS[AI.Sky.st.pattern].rain : tgt.rain; tgt.wind = Math.min(1, tgt.wind * 1.2); }
    for (const f of p.fogs) {
      const d = Math.hypot(pl.x - f.x, pl.y - f.y);
      if (d > f.R) continue;
      let k = sm(f.R, f.R * 0.35, d) * f.k;
      if (f.id === 'fini') { const o = p.byId.fini; k = Math.max(k, sm(o.R * 1.6, o.R * 0.1, Math.hypot(pl.x - o.x, pl.y - o.y)) * 0.98); } // (thicker toward the summit)
      tgt.fog = Math.max(tgt.fog, k); tgt.wind = Math.min(tgt.wind, 0.08 + (1 - k) * 0.5); tgt.cloud = Math.max(tgt.cloud, k * 0.7);
    }
    for (const s of p.storms) {
      const d = Math.hypot(pl.x - s.x, pl.y - s.y);
      if (d > s.R) continue;
      const k = sm(s.R, s.R * 0.4, d);
      tgt.cloud = Math.max(tgt.cloud, k); tgt.rain = Math.max(tgt.rain, k * 0.8); tgt.storm = Math.max(tgt.storm, k * 0.85); tgt.wind = Math.max(tgt.wind, k * 0.6); tgt.fog = Math.min(tgt.fog, 0.1);
    }
  }

  // ---------------------------------------------------------------- who moves how
  /* Fish never leave the water; shore-dwellers keep to land and the shallows; amphibious ones go
   * anywhere wet or dry; fliers (and floaters) cross everything. */
  const SWIM = new Set([129, 130, 118, 119, 72, 73, 116, 117, 230, 170, 171, 222, 223, 224, 226, 211, 318, 319, 320, 321, 349, 350, 366, 367, 368, 369, 370, 456, 457, 458, 594, 690, 691, 746, 779, 781, 131, 489, 490, 382, 120, 121, 692, 693, 771, 147, 148, 138, 139]);
  const SHORE = new Set([90, 91, 98, 99, 79, 80, 199, 341, 342, 739, 740, 767, 768, 751, 752, 688, 689, 140, 141, 422, 423]);
  const AMPHI = new Set([86, 87, 54, 55, 60, 61, 62, 186, 183, 184, 298, 134, 7, 8, 9, 158, 159, 160, 258, 259, 260, 393, 394, 395, 501, 502, 503, 656, 657, 658, 728, 729, 730]);
  const locoCache = new Map();
  function locomotion(dex) {
    let l = locoCache.get(dex);
    if (l) return l;
    if (SWIM.has(dex)) l = 'swim';
    else if (SHORE.has(dex)) l = 'walk';
    else if (AMPHI.has(dex)) l = 'amphi';
    else { l = F().locomotion(dex); if (l === 'swim' || l === 'surface') l = 'swim'; }
    locoCache.set(dex, l);
    return l;
  }
  function isPlayerEnt(ent) { try { return !!ent && (ent === AI.R.Game.player || (AI.players && AI.players.includes(ent))); } catch (e) { return false; } }
  // the player: a Water type swims; everyone else wades the shallows and takes a boat beyond
  function playerLoco(p) {
    const types = (p && p.mon && p.mon.types) || (p && p.types) || [];
    return types.includes('water') ? 'amphi' : 'walk';
  }
  function locoOf(ent) {
    if (isPlayerEnt(ent)) return playerLoco(ent);
    return ent.dex != null ? locomotion(ent.dex) : 'walk'; // (a companion moves as its current form does)
  }
  // can something that moves like this be here?
  function fits(loco, x, y, ent) {
    const s = sample(x, y);
    if (loco === 'fly') return true;
    if (s.solid) return false;
    if (loco === 'swim') return s.cls >= 1;
    if (loco === 'amphi') return true;
    if (s.cls <= 1) return true;
    // caught on a tidal path as the tide came in: you can always wade back out
    if (ent && s.tidal && s.tidal.flooded && ent._psxTidal) return true;
    return false;
  }
  function canBe(ent, x, y) { return !on() || fits(locoOf(ent), x, y, ent); }

  // after the game moves something: keep it where it can be, sliding along coasts and walls
  function collide(ent) {
    if (!on() || !ent) return false;
    if (ent.psxBoat || (AI.Boats && AI.Boats.riding(ent))) return false; // (a boat carries it: 34-boats.js)
    if (ent.psx && (ent.psx.vis.perch > 2 || ent.psx.vis.trunk)) return false;
    const loco = locoOf(ent);
    if (loco === 'fly') return false;
    const okAt = (x, y) => fits(loco, x, y, ent);
    if (okAt(ent.x, ent.y)) {
      const o = ent._psxOk || (ent._psxOk = [0, 0]);
      o[0] = ent.x; o[1] = ent.y;
      const s = sample(ent.x, ent.y);
      ent._psxTidal = !!s.tidal; // (on ground the tide covers: allowed to wade out when it does)
      ent._psxWet = s.cls > 0;
      return false;
    }
    const o = ent._psxOk;
    if (o && Math.hypot(ent.x - o[0], ent.y - o[1]) < 120 && okAt(o[0], o[1])) {
      if (okAt(ent.x, o[1])) ent.y = o[1];
      else if (okAt(o[0], ent.y)) ent.x = o[0];
      else { ent.x = o[0]; ent.y = o[1]; }
    } else {
      // dropped somewhere it can't be (spawned, knocked, teleported): to the nearest place it can
      const q = fitNear(loco, ent.x, ent.y, 640, ent);
      if (q) { ent.x = q[0]; ent.y = q[1]; } else if (o) { ent.x = o[0]; ent.y = o[1]; }
    }
    if (ent.psx) ent.psx.waterBlockT = AI.time;
    return true;
  }
  function fitNear(loco, x, y, rMax, ent) {
    if (fits(loco, x, y, ent)) return [x, y];
    for (let r = 24; r <= rMax; r += 24) for (let k = 0; k < 16; k++) {
      const a = (k / 16 + r * 0.013) * 6.283, qx = x + Math.cos(a) * r, qy = y + Math.sin(a) * r;
      if (fits(loco, qx, qy, ent) && (loco === 'swim' || !(AI.Decor && AI.Decor.blocked(qx, qy, 10)))) return [qx, qy];
    }
    return null;
  }

  // ---------------------------------------------------------------- habitats
  /* Where each species lives at sea. Spawns are placed there (or don't happen), and the spawn bag
   * leans toward who lives around you: water Pokémon out at sea, shore-dwellers on beaches, each
   * guardian island's own Pokémon on its island. */
  const HAB = {
    129: 'lagoon', 349: 'lagoon', 350: 'lagoon', 183: 'lagoon', 184: 'lagoon', 298: 'lagoon', 60: 'lagoon', 61: 'lagoon', 186: 'lagoon',
    118: 'reef', 119: 'reef', 222: 'reef', 116: 'reef', 117: 'reef', 211: 'reef', 121: 'reef', 370: 'reef', 223: 'reef', 224: 'reef', 690: 'reef', 366: 'reef', 594: 'reef', 692: 'reef', 693: 'reef', 771: 'tidepool',
    72: 'current', 73: 'current', 458: 'current', 226: 'current',
    318: 'deep', 319: 'deep', 320: 'deep', 321: 'deep', 170: 'deep', 171: 'deep', 369: 'deep', 367: 'deep', 368: 'deep', 456: 'deep', 457: 'deep', 691: 'deep', 130: 'deep', 230: 'deep', 131: 'deep', 746: 'deep', 779: 'reef', 147: 'deep', 148: 'deep',
    781: 'wreck',
    90: 'tidepool', 91: 'tidepool', 120: 'tidepool', 751: 'tidepool', 752: 'tidepool', 688: 'tidepool', 689: 'tidepool', 138: 'tidepool', 139: 'tidepool', 140: 'tidepool', 141: 'tidepool',
    98: 'beach', 99: 'beach', 341: 'beach', 342: 'beach', 739: 'beach', 740: 'beach', 767: 'beach', 768: 'beach', 79: 'beach', 80: 'beach', 199: 'beach', 54: 'beach', 55: 'beach', 422: 'beach', 423: 'beach',
    86: 'rocks', 87: 'rocks',
    278: 'air', 279: 'air',
    // the guardian islands' own
    309: 'koko', 310: 'koko', 403: 'koko', 404: 'koko', 405: 'koko', 100: 'koko', 101: 'koko', 81: 'koko', 82: 'koko', 702: 'koko', 777: 'koko', 737: 'koko', 738: 'koko', 239: 'koko', 125: 'koko', 466: 'koko', 25: 'koko', 26: 'koko',
    280: 'lele', 281: 'lele', 282: 'lele', 475: 'lele', 742: 'lele', 743: 'lele', 764: 'lele', 546: 'lele', 547: 'lele',
    753: 'bulu', 754: 'bulu', 761: 'bulu', 762: 'bulu', 763: 'bulu', 548: 'bulu', 549: 'bulu', 406: 'bulu', 315: 'bulu', 407: 'bulu', 285: 'bulu', 286: 'bulu', 736: 'bulu', 191: 'bulu', 192: 'bulu',
    92: 'souls', 93: 'souls', 94: 'souls', 355: 'souls', 356: 'souls', 477: 'souls', 353: 'souls', 354: 'souls', 200: 'souls', 429: 'souls', 425: 'souls', 426: 'souls',
  };
  function habitat(dex) {
    if (HAB[dex]) return HAB[dex];
    const l = locomotion(dex);
    return l === 'swim' ? 'deep' : l === 'fly' ? 'air' : 'beach';
  }
  // does a point suit a habitat?
  function suits(hab, x, y) {
    const s = sample(x, y);
    if (s.solid) return false;
    const p = plan();
    switch (hab) {
      case 'lagoon': return s.cls === 1 || (s.cls === 2 && s.lagoon > 0.3);
      case 'reef': return s.cls >= 1 && (s.reef > 0.15 || (s.cls <= 2 && Math.random() < 0.15));
      case 'current': return s.cls >= 2 && (currentNear(x, y) || s.cls >= 3);
      case 'deep': return s.cls >= 3 || (s.cls === 2 && wreckNear(x, y, 500));
      case 'wreck': return s.cls >= 1 && wreckNear(x, y, 360);
      case 'tidepool': return (s.cls === 1 && s.e < 50) || (s.cls === 0 && s.e > -60); // (so Shellder rest wherever the tide has left the edge)
      case 'beach': return s.cls === 0 && s.e > -130 && zoneAt(x, y).id !== 'souls';
      case 'rocks': { const z = zoneAt(x, y); return (z.id === 'seel' || (s.cls === 0 && s.e > -90 && z.isl && (z.isl.kind === 'rocky' || z.isl.kind === 'rock'))) && s.cls <= 2; }
      case 'air': return true;
      case 'koko': case 'lele': case 'bulu': case 'souls': {
        const o = p.byId[hab === 'souls' ? 'fini' : hab];
        return s.cls === 0 && o && insideIsland(o, x, y) && Math.hypot(x - o.x, y - o.y) > (o.arenaR || 0) + 40;
      }
    }
    return true;
  }
  function wreckNear(x, y, r) { return plan().wrecks.some((w) => Math.hypot(x - w.x, y - w.y) < r); }
  function currentNear(x, y) { return plan().currents.some((c) => lineDist(x, y, c.pts) < c.w); }
  // around the player: which zone, the water underfoot, and how much land and deep water within reach
  const SV = { t: -9, x: 0, y: 0, z: null, s: null, land: 0, deepK: 0 };
  function survey(pl) {
    if (AI.time - SV.t < 0.5 && Math.abs(pl.x - SV.x) < 60 && Math.abs(pl.y - SV.y) < 60) return SV;
    SV.t = AI.time; SV.x = pl.x; SV.y = pl.y;
    SV.z = Object.assign({}, zoneAt(pl.x, pl.y));
    SV.s = Object.assign({}, sample(pl.x, pl.y));
    let land = 0, deepK = 0;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * 6.283, c = sample(pl.x + Math.cos(a) * 420, pl.y + Math.sin(a) * 420).cls;
      if (c === 0) land++; if (c >= 3) deepK++;
    }
    SV.land = land / 8; SV.deepK = deepK / 8;
    return SV;
  }
  // how likely a species is to turn up around the player right now (the spawn bag's lean)
  function weight(dex) {
    if (!on()) return 1;
    const pl = AI.R.Game.player;
    if (!pl) return 1;
    const hab = habitat(dex);
    // (what's around you is surveyed once every half second, not once per Pokémon in the bag)
    const sv = survey(pl);
    const z = sv.z, s = sv.s, land = sv.land, deepK = sv.deepK;
    const isle = ['koko', 'lele', 'bulu', 'souls'];
    if (isle.includes(hab) && !(hab === 'souls' && z.id === 'ghostwreck')) return (hab === 'souls' ? z.id === 'fini' : z.id === hab) ? 4 : 0;
    if (z.id === 'fini') return hab === 'air' ? 0.2 : 0.15; // (the dead isle belongs to its ghosts)
    if (z.id === 'ghostwreck') return hab === 'wreck' ? 6 : hab === 'souls' && locomotion(dex) === 'fly' ? 3 : hab === 'deep' ? 0.6 : 0.2; // (Dhelmise, and ghosts drifting over the water)
    if (z.id === 'birth') return hab === 'air' ? 0.5 : 0.1;
    switch (hab) {
      case 'lagoon': return s.lagoon > 0.2 || (s.cls <= 1 && land > 0.2) ? 2.5 : land > 0.1 ? 0.8 : 0.15;
      case 'reef': return z.id === 'reef' ? 3.5 : 0.35;
      // (in a storm, Tentacool drift in close to shore)
      case 'current': return AI.Sky && AI.Sky.storm > 0.4 && land > 0.15 ? 3 : currentNear(pl.x, pl.y) ? 3 : deepK > 0.4 ? 1 : 0.4;
      case 'deep': return deepK > 0.3 ? 1.8 + deepK : 0.2;
      case 'wreck': return z.id === 'wreck' ? 4 : 0.02;
      case 'tidepool': return land > 0.15 ? (z.id === 'pools' ? 4 : 1.4) : 0.05;
      case 'beach': return land > 0.25 ? (z.id === 'slowpoke' && [79, 80, 199].includes(dex) ? 5 : 1.6) : 0.03;
      case 'rocks': return z.id === 'seel' ? 6 : land > 0.2 ? 0.4 : 0.05;
      case 'air': return z.id === 'wingull' ? 5 : 1;
    }
    return 1;
  }
  // a fresh spawn goes to its kind of place near where the game put it (or doesn't appear)
  function place(e) {
    if (!on() || !e || e.dex == null || e.psxPlaced || e.boss || e.legend) return true;
    const hab = habitat(e.dex);
    const loco = locomotion(e.dex);
    const R = AI.R, pl = R.Game.player;
    const ok = (x, y) => suits(hab, x, y) && fits(loco, x, y, e);
    if (ok(e.x, e.y)) return true;
    const cx = e.x, cy = e.y;
    for (let r = 40; r <= 520; r += 40) for (let k = 0; k < 10; k++) {
      const a = Math.random() * 6.283, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!ok(x, y)) continue;
      if (pl && Math.hypot(x - pl.x, y - pl.y) < 260) continue; // (not right on top of you)
      e.x = x; e.y = y;
      return true;
    }
    // no fitting habitat around: at least somewhere it can be
    return spawnOk(e);
  }
  function spawnOk(e) {
    if (!on() || !e || e.dex == null || e.psxPlaced || e.psxStory) return true;
    const loco = locomotion(e.dex);
    if (fits(loco, e.x, e.y, e)) return true;
    const q = fitNear(loco, e.x, e.y, 480, e);
    if (!q) return false;
    e.x = q[0]; e.y = q[1];
    return true;
  }
  // a random point near (x, y) that suits something that moves like this (wandering)
  function pointFor(loco, x, y, r) {
    for (let i = 0; i < 12; i++) { const a = Math.random() * 6.283, d = Math.random() * r, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d; if (fits(loco, px, py)) return [px, py]; }
    return null;
  }

  // ---------------------------------------------------------------- the game's generator and world queries
  // (the game's own trees, rocks and chests stay off the water and out of the paintings)
  function terr(biome, tx, ty) {
    if (biome !== BIOME || !on()) return -1;
    const x = (tx + 0.5) * TS, y = (ty + 0.5) * TS;
    return sample(x, y).cls > 0 ? 2 : 0;
  }
  function trees(biome) { return biome === BIOME && on() ? -1 : null; }
  function grass(biome, tx, ty) {
    if (biome !== BIOME || !on()) return null;
    const x = (tx + 0.5) * TS, y = (ty + 0.5) * TS;
    const s = sample(x, y);
    if (s.cls > 0 || s.e > -90 || s.art >= 0 || s.solid) return false;
    const z = zoneAt(x, y);
    return !!z.isl && (z.isl.kind === 'jungle' || z.isl.kind === 'blossom') && U.hash(tx, ty, 9361) < (z.isl.kind === 'jungle' ? 0.16 : 0.08) && Math.hypot(x - z.isl.x, y - z.isl.y) > (z.isl.arenaR || 0) + 60;
  }
  // true: the game puts none of its props here
  function clear(tx, ty) {
    if (!on()) return false;
    const x = (tx + 0.5) * TS, y = (ty + 0.5) * TS;
    const s = sample(x, y);
    if (s.cls > 0 || s.solid || s.art >= 0 || s.e > -40 || s.tidal) return true;
    const z = zoneAt(x, y);
    if (z.isl && Math.hypot(x - z.isl.x, y - z.isl.y) < (z.isl.arenaR || 60) + 80) return true; // (the guardians' arenas stay open)
    return z.id === 'harbor';
  }
  function kindAt(x, y) { const s = sample(x, y); return s.solid ? 'wall' : s.cls > 0 ? 'liquid' : 'floor'; }
  function blocked(x, y, r) {
    if (!on()) return false;
    if (solidAt(x, y)) return true;
    if (r > 10) { const k = r * 0.7; return solidAt(x - k, y) || solidAt(x + k, y) || solidAt(x, y - k * 0.6); }
    return false;
  }

  // ---------------------------------------------------------------- registration: Level 3 becomes the ocean
  const NAME = 'Océano Tropical';
  const TYPES = ['water', 'flying', 'electric', 'psychic', 'fairy', 'grass', 'ghost', 'normal', 'bug', 'poison', 'ice', 'rock', 'dark', 'dragon', 'steel'];
  function register(R) {
    if (AI.cfg.tropicalOcean === false || BIOME >= 0) return;
    const T = R.Tiles;
    if (!T || !T.BIOMES || !R.Maps || !R.Maps.LIST) return;
    const base = T.BIOMES[3] || T.BIOMES[0];
    const pal = Object.assign({}, base, {
      name: NAME, liquid: 'water',
      floor: ['#e6d3a3', '#dfcb98', '#ecdaae'], dirt: ['#d2bb86', '#cbb27c', '#d8c28e'], speck: '#c9b07a', light: '#f4e6c0',
      flowers: ['#ff7aa8', '#ffd45e', '#ffffff'], liq: '#2aa9c9', liqDeep: '#16568f', foam: '#eafcff', shore: '#cdb985',
      prop: 'tree', leaf: ['#2f8a3c', '#3fa047', '#58b852', '#7acb5e'], trunk: ['#7a5a36', '#94703f'], rock: ['#7d7a72', '#9a968c', '#bcb7aa'], grass: ['#4f9a3c', '#6bb84a', '#8fd06a'],
      rainbow: false,
    });
    BIOME = T.BIOMES.length;
    T.BIOMES.push(pal);
    const m = R.Maps.LIST.find((x) => x.n === 3);
    if (m) {
      m.psxOld = { name: m.name, types: m.types, col: m.col, biome: m.biome };
      const NEW = { name: NAME, types: TYPES.slice(), col: '#3ec6e0', biome: BIOME };
      // (switching the setting off brings the Ash Volcano back)
      for (const k of Object.keys(NEW)) Object.defineProperty(m, k, { get() { return AI.cfg.tropicalOcean === false ? m.psxOld[k] : NEW[k]; }, configurable: true, enumerable: true });
    }
    if (AI.Gen && AI.Gen.GEN) AI.Gen.GEN[BIOME] = { wall: 0, trees: [0, 0] };
    // its name in every language the game speaks, and the level tab "3 · Volcán" → "3 · Océano"
    try {
      R.I18n.add({ [NAME]: 'Tropical Ocean', '3 · Océano': '3 · Ocean', 'Nivel 3 (Océano Tropical): Arceus y los legendarios que acuden a la Sentencia tienen bastante menos vida.': 'Level 3 (Tropical Ocean): Arceus and the legendaries joining the Judgment have quite a bit less HP.' }, 'en');
      R.I18n.add({ [NAME]: 'Océan Tropical', '3 · Océano': '3 · Océan' }, 'fr');
      R.I18n.add({ [NAME]: '熱帶海洋', '3 · Océano': '3 · 海洋' }, 'zh');
    } catch (e) { AI.warn('ocean-i18n', e); }
    const SWAP = { '3 · Volcán': '3 · Océano', 'Volcán Ceniza': NAME, 'Nivel 3 (Volcán Ceniza): Arceus y los legendarios que acuden a la Sentencia tienen bastante menos vida.': 'Nivel 3 (Océano Tropical): Arceus y los legendarios que acuden a la Sentencia tienen bastante menos vida.' };
    const wrapT = (o) => function (s) { if (AI.cfg.tropicalOcean !== false && typeof s === 'string' && SWAP[s]) s = SWAP[s]; return o.apply(this, [s].concat([].slice.call(arguments, 1))); };
    if (typeof R.T === 'function') R.T = wrapT(R.T);
    if (R.I18n && typeof R.I18n.t === 'function') R.I18n.t = wrapT(R.I18n.t);
    // the level's banner in the menu shows the harbour
    try {
      const swapBanner = () => { const el = document.getElementById('pp-banner'); if (el && /zone-3\.webp/.test(el.style.backgroundImage || '') && AI.cfg.tropicalOcean !== false) el.style.backgroundImage = 'url(assets/ocean/zone.webp)'; };
      new MutationObserver(swapBanner).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- per frame / new world
  function tick(dt) {
    if (!on()) return;
    plan();
    // splashing through the shallows
    const R = AI.R;
    const p = R.Game.player;
    if (p && !(AI.Boats && AI.Boats.riding(p)) && Math.hypot(p._vx || 0, p._vy || 0) > 30 && Math.random() < dt * 6) {
      const s = sample(p.x, p.y);
      if (s.cls >= 1) try { R.FX.burst(p.x, p.y, '#d8f6ff', 2, 40); } catch (e) { /* ignore */ }
    }
  }
  function reset() { P = null; LAND = null; E = null; locoCache.clear(); SV.t = -9; }

  AI.define('Ocean', {
    on, plan, register, get BIOME() { return BIOME; }, HARBOR, art, artAt, artOf, sample, cls, depthClass, water, solidAt, zoneAt, islandById, insideIsland, islE, mainland,
    tide, tideName, tidalAt, currentAt, localSky, reefK, lagoonK, inTrench,
    locomotion, playerLoco, locoOf, fits, canBe, collide, fitNear, pointFor, isPlayerEnt,
    HAB, habitat, suits, weight, place, spawnOk, terr, trees, grass, clear, kindAt, blocked, tick, reset, lineDist, segDist, vn, fbm, sm,
  });
})();
