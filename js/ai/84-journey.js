/* PokéSurvivor+ — Living World AI · the journey through the Shady Forest
 * The haunted mansion is the end of the Shady Forest, and the forest is the journey to it.
 *
 *   forest  — the run starts; a clock counts active play in the forest (not menus, pauses or
 *             loading, not time spent inside the mansion). For the first 20 minutes the forest
 *             is just the forest: no mansion, no path to it.
 *   route   — after 20 minutes the mansion is placed, once, for the whole party: ahead of where
 *             the party is heading, out of sight, on ground nobody has seen yet, away from water
 *             and the forest's mysteries. The game's own terrain cache is cleared there (the way
 *             rift arenas do it), so the grounds and the path are always open and reachable.
 *             From then on the forest leads there: old lanterns, broken fences and signs, fading
 *             footprints toward the path; the final stretch grows darker and stranger.
 *   found   — someone in the party has seen the gates.
 *   inside  — the party has gone in.
 *   done    — the mansion's story has been told; the game's own finale (Judgment) may now begin.
 *             Until then it doesn't: the mansion is the only way to complete the Shady Forest.
 *
 * In co-op the host's journey is the only one: its clock and the mansion's place are sent to
 * everyone (and guests clear the same ground). The journey is saved with a saved run.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const KEY = 'psx.journey.v1';
  const TS = 32, CH = 512;

  const st = {
    seed: null, phase: 'forest', elapsed: 0, geo: null, found: false, entered: false, done: false,
    fresh: null, // decor/terrain chunks that didn't exist yet when the mansion was placed
    tryT: 0, saveT: 0, syncT: 0, heading: [0, -1], lastPos: null, crumbs: [], crumbT: 20,
    soundT: 12, silT: 30, sils: [], printT: 0, prints: [],
  };
  const gen = new Set(); // terrain chunks the game has generated this run
  let lastGen = null;

  function on() { return AI.enabled && AI.cfg.journey !== false && AI.cfg.mansion !== false && AI.cfg.newArt !== false; }
  function forest() { try { return AI.R.World.biome === 0 && !(AI.R.Rift && AI.R.Rift.inArena); } catch (e) { return false; } }
  function threshold() { return AI.cfg.mansionAfter == null ? 1200 : AI.cfg.mansionAfter; }
  function coopGuest() { const C = AI.R && AI.R.Coop; return !!(C && C.active && !C.isHost); }

  // ---------------------------------------------------------------- generated ground
  // (called for every tile the game generates in the forest)
  function noteGen(tx, ty) {
    const k = (tx >> 4) * 65536 + (ty >> 4);
    if (k === lastGen) return;
    lastGen = k;
    gen.add(k);
  }
  const ckey = (cx, cy) => cx * 65536 + cy;
  function seen(cx, cy) {
    if (gen.has(ckey(cx, cy))) return true;
    if (AI.Decor && AI.Decor.hasChunk(cx, cy)) return true;
    if (AI.Forest && AI.Forest.chunks && AI.Forest.chunks.has(cx + ',' + cy)) return true;
    return false;
  }
  // a chunk that was still unseen when the mansion was placed: free to look strange
  function fresh(x, y) { return !!(st.fresh && !st.fresh.has(ckey(Math.floor(x / CH), Math.floor(y / CH)))); }

  // ---------------------------------------------------------------- placing the mansion
  function boxChunks(b, out) {
    for (let cy = Math.floor(b[1] / CH); cy <= Math.floor(b[3] / CH); cy++) for (let cx = Math.floor(b[0] / CH); cx <= Math.floor(b[2] / CH); cx++) out.push([cx, cy]);
    return out;
  }
  function corridorChunks(g) {
    const set = new Map();
    const add = (x, y) => { const cx = Math.floor(x / CH), cy = Math.floor(y / CH); set.set(cx + ',' + cy, [cx, cy]); };
    for (const p of g.dense) { add(p[0] - 80, p[1] - 80); add(p[0] + 80, p[1] + 80); add(p[0] - 80, p[1] + 80); add(p[0] + 80, p[1] - 80); }
    for (const c of boxChunks([g.D[0] - g.SW - 120, g.top - 120, g.D[0] + g.SW + 120, g.G[1] + 120], [])) set.set(c.join(','), c);
    return [...set.values()];
  }
  // is this a good place for the mansion? (unseen ground, dry, no mystery site, nobody nearby)
  function siteOk(g, party, strict) {
    const F = AI.Forest;
    for (const [cx, cy] of corridorChunks(g)) if (strict && seen(cx, cy)) return false;
    for (const p of party) {
      if (Math.hypot(g.D[0] - p.x, g.D[1] - p.y) < 1700) return false;
      for (const q of g.pts) if (Math.hypot(q[0] - p.x, q[1] - p.y) < 650) return false;
    }
    if (Math.hypot(g.S[0], g.S[1]) < 900) return false; // not on top of where the run started
    if (F) {
      const pts = g.dense.filter((q, i) => i % 3 === 0).concat([[g.D[0], g.D[1] - 150], [g.D[0] - g.SW, g.D[1]], [g.D[0] + g.SW, g.D[1]], [g.D[0] - g.SW, g.G[1]], [g.D[0] + g.SW, g.G[1]], g.G, [g.D[0], g.top], [g.D[0] - g.SW, g.top], [g.D[0] + g.SW, g.top], g.F]);
      for (const q of pts) {
        if (F.water(q[0], q[1]).e > -90) return false;
        if (F.region(q[0], q[1]).siteK > 0.02) return false;
      }
    }
    return true;
  }
  function party() {
    const out = [];
    for (const p of AI.players) if (p && !p.dead && !p.psxParty) out.push(p);
    return out.length ? out : [AI.R.Game.player].filter(Boolean);
  }
  function establish() {
    const D = AI.Decor;
    if (!D || st.geo) return false; // (placed once per run, and it stays where it is)
    const pl = party();
    if (!pl.length) return false;
    const cx = pl.reduce((a, p) => a + p.x, 0) / pl.length, cy = pl.reduce((a, p) => a + p.y, 0) / pl.length;
    const head = Math.atan2(st.heading[1], st.heading[0]);
    const h = (i) => U.hash(st.seed | 0, i, 8811);
    // ahead first (within about 50°, at any distance), then wider and wider around; nearer first, then farther
    for (const strict of [true, false]) {
      for (const [k0, k1] of [[0, 5], [5, 13]]) for (let ring = 0; ring < 6; ring++) {
        const lead = 1250 + ring * 450; // where the path starts, ahead of the party
        for (let k = k0; k < k1; k++) {
          const off = (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.42) + (h(ring * 13 + k) - 0.5) * 0.15;
          const a = head + off;
          const S = [cx + Math.cos(a) * lead, cy + Math.sin(a) * lead];
          const len = 1000 + h(100 + ring * 13 + k) * 350;
          const Dp = [S[0] + Math.cos(a) * len, S[1] + Math.sin(a) * len - 250];
          const g = D.mansionGeom(S, Dp);
          if (siteOk(g, pl, strict)) return place(g, true);
        }
      }
    }
    return false;
  }
  // put the mansion there: hand it to the decor, clear the ground (terrain, decor, painted floor)
  function place(g, announce) {
    const D = AI.Decor;
    st.geo = { S: g.S.slice(), D: g.D.slice() };
    if (!st.fresh) st.fresh = new Set(gen);
    D.setTrail(g);
    regenerate(g);
    if (st.phase === 'forest') st.phase = 'route';
    AI.Bus.emit({ type: 'journey', what: 'route', x: g.S[0], y: g.S[1], loud: 0 });
    if (announce) sync(true);
    save();
    return true;
  }
  // forget anything already generated where the grounds and path now are, so it grows again around them
  function regenerate(g) {
    const R = AI.R;
    const b = AI.Decor.mansionBox(g);
    try {
      // the game's own terrain cache: World.setArena clears the chunks around a point (rift arenas use it)
      const W = R.World;
      if (W.setArena && !(R.Rift && R.Rift.inArena) && !W.arena) {
        const pts = g.dense.filter((q, i) => i % 6 === 0).concat([g.D, [g.D[0] - g.SW, g.D[1]], [g.D[0] + g.SW, g.D[1]], g.G, g.F, [g.D[0], g.D[1] - 300], [g.D[0], g.top + 200], [g.D[0] - g.SW, g.top + 200], [g.D[0] + g.SW, g.top + 200]]);
        for (const q of pts) W.setArena({ tx: Math.round(q[0] / TS), ty: Math.round(q[1] / TS), r: 1, type: 'normal' });
        W.setArena(null);
      }
    } catch (e) { AI.warn('journey-regen', e); try { R.World.setArena(null); } catch (e2) { /* ignore */ } }
    AI.Decor.invalidate(b[0], b[1], b[2], b[3]);
    if (AI.Forest && AI.Forest.invalidate) AI.Forest.invalidate(b[0], b[1], b[2], b[3]);
  }
  function restoreTrail() {
    if (!st.geo || !AI.Decor) return;
    AI.Decor.setTrail(AI.Decor.mansionGeom(st.geo.S, st.geo.D));
  }

  // ---------------------------------------------------------------- the approach: how close to the end
  // 0 far away … 1 at the gates (only once the mansion exists)
  function nearK(x, y) {
    const g = st.geo;
    if (!g) return 0;
    const d = Math.hypot(x - g.D[0], y - (g.D[1] + 200));
    return U.clamp(1 - (d - 650) / 2000, 0, 1);
  }
  function partyK() { const p = AI.R && AI.R.Game.player; return p ? nearK(p.x, p.y) : 0; }

  // ---------------------------------------------------------------- per frame
  function tick(dt) {
    if (!on() || !AI.R) return;
    const R = AI.R;
    if (!forest()) return;
    const p = R.Game.player;
    if (!p || R.Game.state !== 'playing') return;
    // which way the party is heading (for where the path should start)
    if (st.lastPos) {
      const vx = p.x - st.lastPos[0], vy = p.y - st.lastPos[1];
      const v = Math.hypot(vx, vy);
      if (v > 0.5 && v < 400) { const k = 1 - Math.exp(-dt / 2); st.heading[0] += (vx / v - st.heading[0]) * k; st.heading[1] += (vy / v - st.heading[1]) * k; } // (the last few seconds of travel)
    }
    st.lastPos = [p.x, p.y];
    const inside = AI.Mansion && AI.Mansion.inside;
    const story = AI.Story && AI.Story.busy && AI.Story.busy();
    // the forest clock: active play in the forest only (the host's clock is everyone's)
    if (!coopGuest() && !inside && !story) st.elapsed += dt;
    if (!st.geo && !coopGuest() && st.elapsed >= threshold()) {
      st.tryT -= dt;
      if (st.tryT <= 0) { st.tryT = 1; establish(); }
    }
    if (st.geo) approach(dt, p, inside);
    // progress
    if (st.geo && !st.found) {
      const G = (AI.Mansion && AI.Mansion.geom() || AI.Decor.mansionGeom(st.geo.S, st.geo.D)).G; // (at the gates)
      if (Math.hypot(p.x - G[0], p.y - G[1]) < 420 || (R.Camera.sees && R.Camera.sees(G[0], G[1], 0))) {
        st.found = true;
        if (st.phase === 'route') st.phase = 'found';
        AI.Bus.emit({ type: 'journey', what: 'found', x: G[0], y: G[1], loud: 0 });
        save(); sync(true);
      }
    }
    if (inside && !st.entered) { st.entered = true; st.phase = 'inside'; save(); sync(true); }
    if (!st.done && st.entered && !inside && AI.Story && AI.Story.stage && AI.Story.stage() === 'done') {
      st.done = true; st.phase = 'done';
      AI.Bus.emit({ type: 'journey', what: 'done', x: p.x, y: p.y, loud: 0 });
      save(); sync(true);
    }
    st.saveT -= dt;
    if (st.saveT <= 0) { st.saveT = 5; save(); }
    st.syncT -= dt;
    if (st.syncT <= 0) { st.syncT = 3; sync(false); }
  }

  // ---------------------------------------------------------------- foreshadowing and guidance
  const GHOST_SIL = [355, 92, 200, 356, 353, 477];
  function approach(dt, p, inside) {
    if (inside) { st.sils.length = 0; return; }
    const R = AI.R;
    const k = nearK(p.x, p.y);
    const g = st.geo;
    // distant sounds from the house: creaking floors, a door closing, footsteps
    st.soundT -= dt * (0.3 + k * 1.6);
    if (k > 0.15 && st.soundT <= 0) {
      st.soundT = U.rand(14, 30);
      const a = Math.atan2(g.D[1] - p.y, g.D[0] - p.x);
      const x = p.x + Math.cos(a) * 380, y = p.y + Math.sin(a) * 380;
      try { AI.Ambience.mansion(U.pick(k > 0.5 ? ['creak', 'slam', 'step', 'creak', 'knock'] : ['creak', 'step']), x, y, k > 0.6 ? 2 : 1); } catch (e) { /* ignore */ }
      AI.Bus.emit({ type: 'journey', what: 'sound', x, y, loud: 0 });
    }
    // strange silhouettes between the trees, for a moment
    st.silT -= dt * k;
    if (k > 0.3 && st.silT <= 0 && st.sils.length === 0) {
      st.silT = U.rand(25, 45);
      const side = Math.random() < 0.5 ? -1 : 1;
      const a = Math.atan2(g.D[1] - p.y, g.D[0] - p.x) + side * U.rand(0.6, 1.2);
      const cam = R.Camera;
      const r = Math.min(cam.w, cam.h) * 0.42;
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * 0.9;
      try {
        const an = new R.Sprites.Animator(U.pick(GHOST_SIL), 1, false);
        an.loop('Idle');
        st.sils.push({ x, y, a: an, t: 0, life: U.rand(1.2, 2.2) });
        AI.Bus.emit({ type: 'journey', what: 'silhouette', x, y, loud: 0 });
      } catch (e) { /* ignore */ }
    }
    for (let i = st.sils.length - 1; i >= 0; i--) {
      const s = st.sils[i];
      s.t += dt; s.a.update(dt);
      if (s.t > s.life || Math.hypot(s.x - p.x, s.y - p.y) < 120) st.sils.splice(i, 1);
    }
    // footprints that lead toward the path, then simply stop
    st.printT -= dt;
    if (k > 0.05 && k < 0.85 && st.printT <= 0 && AI.Decor && AI.Decor.printAt) {
      st.printT = U.rand(35, 70);
      const q = nearestPath(p.x, p.y);
      const a = Math.atan2(q[1] - p.y, q[0] - p.x);
      let x = p.x + Math.cos(a + 0.5) * 260, y = p.y + Math.sin(a + 0.5) * 200;
      const n = 9 + ((Math.random() * 6) | 0);
      for (let i = 0; i < n; i++) {
        AI.Decor.printAt(x, y, a, 0, 0.9, 0.75);
        x += Math.cos(a) * 26; y += Math.sin(a) * 26;
      }
    }
    guide(dt, p);
  }
  function nearestPath(x, y) {
    const g = AI.Decor.trail;
    if (!g) return st.geo ? st.geo.S : [x, y];
    let best = g.pts[0], bd = Infinity;
    for (const q of g.pts) { const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < bd) { bd = d; best = q; } }
    return best;
  }
  /* Wherever the party wanders, the forest keeps pointing the way: now and then an old lantern
   * post, a broken length of fence, a leaning signpost or a few worn paving stones appear ahead,
   * out of sight, on the line toward the path. They stay where they are (part of the world, not
   * markers that follow you), and they stop once the party is on the path. */
  const CRUMBS = [['lamp', 'lamppost'], ['lamp', 'lamppost_r'], ['fence', 'g_fence'], ['sign', 'sign'], ['stones', 'stonepath'], ['stones', 'steppingstone']];
  function guide(dt, p) {
    st.crumbT -= dt;
    if (st.crumbT > 0 || !AI.Decor) return;
    st.crumbT = U.rand(18, 30);
    const q = nearestPath(p.x, p.y);
    const d = Math.hypot(q[0] - p.x, q[1] - p.y);
    if (d < 700) return;
    const a = Math.atan2(q[1] - p.y, q[0] - p.x);
    const cam = AI.R.Camera;
    const far = Math.max(cam.w, cam.h) * 0.62 + 140;
    const x = p.x + Math.cos(a) * far + U.rand(-60, 60), y = p.y + Math.sin(a) * far + U.rand(-60, 60);
    if (st.crumbs.some((c) => Math.hypot(c.x - x, c.y - y) < 500)) return;
    if (AI.Forest && AI.Forest.water(x, y).e > -40) return;
    try { if (!AI.R.World.isFree(x, y, 14)) return; } catch (e) { return; }
    const [kind, n] = CRUMBS[(Math.random() * CRUMBS.length) | 0];
    const it = crumbItem(kind, n, x, y);
    st.crumbs.push({ x, y, kind, n });
    AI.Decor.addFixed(it);
    AI.Bus.emit({ type: 'journey', what: 'crumb', x, y, loud: 0, kind });
  }
  // an old unlit lamp post, a length of broken fence, a leaning sign, worn paving stones
  function crumbItem(kind, n, x, y) {
    if (kind === 'lamp') return { k: 'stone', n: n || 'lamppost', x, y, r: 6, crumb: true };
    if (kind === 'fence') return { k: 'grave', n: n || 'g_fence', x, y, s: 0.5, r: 0, crumb: true };
    if (kind === 'sign') return { k: 'sign', n: 'sign', x, y, r: 6, vines: true, crumb: true };
    return { k: 'litter', n: n || 'stonepath', x, y, flat: true, crumb: true };
  }
  function drawSils(ctx) {
    for (const s of st.sils) {
      const a = Math.min(1, s.t * 3, (s.life - s.t) * 3) * 0.55;
      if (a <= 0.02) continue;
      silG.setTransform(1, 0, 0, 1, 0, 0);
      silG.clearRect(0, 0, 256, 256);
      silG.globalCompositeOperation = 'source-over';
      s.a.draw(silG, 128, 200, { alpha: 1 });
      silG.globalCompositeOperation = 'source-in';
      silG.fillStyle = '#07060c';
      silG.fillRect(0, 0, 256, 256);
      silG.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(silCv, Math.round(s.x - 128), Math.round(s.y - 200));
      ctx.restore();
    }
  }
  const silCv = document.createElement('canvas');
  silCv.width = 256; silCv.height = 256;
  const silG = silCv.getContext('2d');
  // fog that collects around roots and paths on the final stretch
  function drawFog(ctx) {
    if (!on() || !st.geo || (AI.Mansion && AI.Mansion.inside) || !forest()) return;
    const k = partyK();
    if (k < 0.12) return;
    const cam = AI.R.Camera;
    const t = AI.time;
    ctx.save();
    for (let yy = Math.floor(cam.top() / 80) * 80; yy < cam.top() + cam.h + 80; yy += 80) for (let xx = Math.floor(cam.left() / 110) * 110; xx < cam.left() + cam.w + 110; xx += 110) {
      const hh = U.hash(xx, yy, 1717);
      const kk = nearK(xx, yy);
      if (kk < 0.15) continue;
      const mx = xx + hh * 70 + Math.sin(t * 0.05 + hh * 7) * 30, my = yy + (hh * 11 % 1) * 50;
      const a = kk * 0.2 * (0.6 + 0.4 * Math.sin(t * 0.17 + hh * 4));
      const gr = ctx.createRadialGradient(mx, my, 0, mx, my, 70);
      gr.addColorStop(0, 'rgba(190,196,210,' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(190,196,210,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.ellipse(mx, my, 95, 30, 0, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- the game's own finale waits for the mansion
  function blocksFinale() {
    if (!on()) return false;
    try { if (AI.R.World.biome !== 0 || AI.R.Maps.endless) return false; } catch (e) { return false; }
    return !st.done;
  }

  // ---------------------------------------------------------------- co-op: the host's journey is everyone's
  function sync(now) {
    const R = AI.R;
    const C = R && R.Coop, N = R && R.Net;
    if (!C || !C.active || !C.isHost || !N || !N.broadcast) return;
    try { N.broadcast({ k: 'psx', t: 'journey', e: Math.round(st.elapsed), geo: st.geo, ph: st.phase, f: st.found ? 1 : 0, d: st.done ? 1 : 0, now: !!now }); } catch (e) { /* ignore */ }
  }
  function onNet(from, msg) {
    if (!msg || msg.k !== 'psx' || msg.t !== 'journey' || !coopGuest()) return;
    st.elapsed = Math.max(st.elapsed, msg.e || 0);
    if (msg.geo && !st.geo && AI.Decor) place(AI.Decor.mansionGeom(msg.geo.S, msg.geo.D), false);
    if (msg.f) st.found = true;
    if (msg.d) { st.done = true; st.phase = 'done'; }
    else if (msg.ph && st.phase !== 'done') st.phase = msg.ph;
  }
  let netOn = false;
  function installNet() {
    const N = AI.R && AI.R.Net;
    if (netOn || !N || !N.on) return;
    netOn = true;
    N.on(onNet);
  }

  // ---------------------------------------------------------------- saved runs
  function save() {
    if (st.seed == null) return;
    try { localStorage.setItem(KEY, JSON.stringify({ seed: st.seed, at: Date.now(), e: st.elapsed, ph: st.phase, geo: st.geo, f: st.found, en: st.entered, d: st.done, fresh: st.fresh ? [...st.fresh] : null, crumbs: st.crumbs })); } catch (e) { /* ignore */ }
  }
  function reset(seed) {
    gen.clear(); lastGen = null;
    Object.assign(st, { seed, phase: 'forest', elapsed: 0, geo: null, found: false, entered: false, done: false, fresh: null, tryT: 0, saveT: 0, syncT: 0, heading: [0, -1], lastPos: null, crumbs: [], crumbT: 20, soundT: 12, silT: 30, sils: [], printT: 0, prints: [] });
    installNet();
    // a resumed run (same world seed) picks the journey up where it was saved
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (o && o.seed === seed && seed != null && Date.now() - o.at < 30 * 86400000) {
        st.elapsed = o.e || 0; st.phase = o.ph || 'forest'; st.geo = o.geo || null; st.found = !!o.f; st.entered = !!o.en; st.done = !!o.d;
        st.fresh = o.fresh ? new Set(o.fresh) : null; st.crumbs = o.crumbs || [];
        st.restored = true;
      }
    } catch (e) { /* ignore */ }
  }
  // crumbs that were placed before a save come back with the run
  function restoreCrumbs() {
    if (!st.restored || !AI.Decor) return;
    st.restored = false;
    for (const c of st.crumbs) AI.Decor.addFixed(crumbItem(c.kind, c.n, c.x, c.y));
  }

  // ---------------------------------------------------------------- debugging & tests
  function debugElapse(sec) { st.elapsed += sec; }
  function establishNow() { if (!st.geo) { st.elapsed = Math.max(st.elapsed, threshold()); establish(); } return st.geo; }
  function finish() { st.found = st.entered = st.done = true; st.phase = 'done'; save(); }

  AI.define('Journey', {
    st, tick, reset, noteGen, seen, fresh, nearK, partyK, blocksFinale, drawSils, drawFog, restoreTrail, restoreCrumbs,
    establish, establishNow, debugElapse, finish, threshold, onNet, gen,
    get phase() { return st.phase; }, get elapsed() { return st.elapsed; }, get placed() { return !!st.geo; },
  });
})();
