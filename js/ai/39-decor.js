/* PokéSurvivor+ — Living World AI · forest decor & environmental memory
 * Fills each area with deterministic, varied decor (fallen logs, stumps, bushes, berry bushes,
 * ferns, wildflowers, grass tufts, mushrooms, burrows, old lanterns) that doubles as Pokémon
 * habitat. In the starting woodland it also lays out the clues of the abandoned trail to the
 * rumoured mansion. And the world remembers, for a while: footprints, mud where you keep walking
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
  function ok(x, y, r) { return floorAt(x, y) && free(x, y, r) && Math.hypot(x, y) > 230; }
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

  function chunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = chunks.get(key);
    if (!c) {
      c = genChunk(cx, cy);
      if (chunks.size > 260) chunks.delete(chunks.keys().next().value);
      chunks.set(key, c);
    }
    return c;
  }

  // ---------------------------------------------------------------- the abandoned trail (starting woodland)
  function buildTrail() {
    trail = null; cave = null;
    if (AI.Env.biome() !== 0 || !AI.cfg.newArt) return;
    const a = U.hash(seed, 7, 1) * Math.PI * 2;
    const pts = [];
    let x = Math.cos(a) * 1450, y = Math.sin(a) * 1450, dir = a;
    for (let k = 0; k < 10; k++) {
      pts.push([x, y]);
      dir += (U.hash(seed, k, 2) - 0.5) * 0.7;
      x += Math.cos(dir) * 120; y += Math.sin(dir) * 120;
    }
    const items = [];
    const side = (p, q, d) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * d, p[1] + dx / l * d]; };
    // mossy paving stones, more and more overgrown, then gone
    for (let k = 0; k < pts.length - 1; k++) {
      const p = pts[k], q = pts[k + 1];
      for (let s = 0; s < 3; s++) {
        const t = s / 3;
        const px = p[0] + (q[0] - p[0]) * t, py = p[1] + (q[1] - p[1]) * t;
        items.push(item({ k: 'path', x: px, y: py, flat: true, over: Math.min(1, k / 7 + U.hash(k, s, 3) * 0.25), ang: Math.atan2(q[1] - p[1], q[0] - p[0]) }));
      }
    }
    const ent = side(pts[0], pts[1], -40);
    items.push(item({ k: 'lamp', n: 'lamppost', x: ent[0] - 30, y: ent[1] + 10, r: 8, light: { r: 150, c: [255, 196, 120], kind: 'lamp' }, lit: true, protected: true }));
    const sgn = side(pts[0], pts[1], 46);
    items.push(item({ k: 'sign', n: 'sign', x: sgn[0], y: sgn[1], r: 8, vines: true, lore: 'sign' }));
    const lan = side(pts[1], pts[2], -54);
    items.push(item({ k: 'gallows', n: 'gallows', x: lan[0], y: lan[1], r: 8, light: { r: 130, c: [255, 186, 110], kind: 'lantern' }, lit: true, haunt: true, lore: 'lantern' }));
    for (let k = 3; k < 7; k++) {
      const d = side(pts[k], pts[k + 1], (k % 2 ? 1 : -1) * (60 + U.hash(k, 9, 4) * 40));
      items.push(item({ k: 'plant', n: k % 2 ? 'deadsapling_a' : 'deadsapling_b', x: d[0], y: d[1], r: 8 }));
    }
    for (let k = 6; k < 9; k++) for (const sd of [-1, 1]) {
      const d = side(pts[k], pts[k + 1], sd * 70);
      items.push(item({ k: 'fence', x: d[0], y: d[1], r: 10, ang: Math.atan2(pts[k + 1][1] - pts[k][1], pts[k + 1][0] - pts[k][0]), broken: U.hash(k, sd, 5) }));
    }
    const end = pts[pts.length - 1];
    for (let k = 0; k < 3; k++) {
      const aa = dir + (k - 1) * 0.9;
      items.push(item({ k: 'wraith', x: end[0] + Math.cos(aa) * 90, y: end[1] + Math.sin(aa) * 90, r: 16, frame: k * 2 }));
    }
    trail = { pts, items, start: pts[0], end, dir };
    // a cave sealed by boulders, for later
    const ca = a + Math.PI * (0.7 + U.hash(seed, 3, 3) * 0.6);
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
        for (const it of chunk(cx, cy)) if (it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1) out.push(it);
    if (trail) for (const it of trail.items) if (it.x >= x0 && it.x <= x1 && it.y >= y0 && it.y <= y1) out.push(it);
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
    chunks.clear(); dyn.length = 0; prints.length = 0; mud.clear(); ripples.length = 0;
    nibbled.clear(); shake.clear(); visitedPatches.clear();
    nextId = 1;
    trail = null; cave = null;
    built = false;
  }
  let built = false;
  function ensure() { if (!built && AI.R && AI.R.World) { built = true; buildTrail(); } }

  AI.define('Decor', {
    reset, ensure, tick, chunk, inRect, near, lights, trailZone, footprint, mudAt, trample, puddleAmt, puddlesIn, puddleAt,
    ripple, ripples, prints, rustle, shakeOf, shakeProp, nibble, isNibbled, addDyn, removeDyn, flame, checkPatch,
    get trail() { return trail; }, get cave() { return cave; }, get seed() { return seed; },
  });
})();
