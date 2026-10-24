/* PokéSurvivor+ — Living World AI · living with the weather and the hours
 * How wild Pokémon react to their environment:
 *  - daily rhythm: day species get drowsy at night and sleep in sheltered spots, night species
 *    (Hoothoot, Oddish, Spinarak…) do the opposite; at dawn the night crowd slips away
 *  - sleepers breathe, twitch, shift and snore, and wake if you run past or shine a lantern at them
 *  - rain sends Pidgey under the trees and Caterpie under the leaves; Rattata shake off the water
 *  - deep fog makes everyone stay put; a gale can send a small bird tumbling away, crying
 *  - midday heat sends Pokémon into the shade; caterpillars nibble leaves, Rattata dig burrows
 *  - new arrivals emerge: down from a branch, out of a bush or a burrow, from behind a trunk
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const B = () => AI.Behaviors;
  const M = () => AI.Mind;

  const DIGGERS = new Set([19, 20, 161, 162, 263, 264, 29, 32, 399, 400, 50, 216]);
  const SHAKERS = new Set([19, 20, 161, 162, 263, 264, 399, 400, 216, 217, 52, 133, 25, 29, 32, 58]);
  const NIBBLERS = new Set([10, 13, 265, 266, 268, 11, 14, 401, 46, 43]);
  const SCRATCHERS = new Set([16, 17, 21, 396, 397, 163]);

  function sky() { return AI.cfg.atmosphere !== false && AI.Sky && !AI.Sky.indoor() ? AI.Sky : null; }
  function lovesRain(s) { return s.p.types.includes('water') || s.p.lovesWater || s.p.types.includes('grass') && s.pers.tr.playfulness > 0.6; }
  function small(s) { return s.p.size === 0 || s.p.bst < 330; }
  function flyer(s) { return s.p.flying || s.p.types.includes('flying'); }
  function removeNpc(e) {
    e.psxSkip = true; e.dead = true; e.fade = 0;
    const all = AI.R.EnemyMgr.all();
    const i = all.indexOf(e);
    if (i >= 0) all.splice(i, 1);
  }
  function shelterFor(e, s, maxR) {
    const hab = AI.Areas.habitat(e.dex);
    const kinds = flyer(s) || hab[0] === 'tree' ? ['tree', 'bush'] : s.p.types.includes('bug') ? ['bush', 'tree'] : ['tree', 'log', 'bush', 'burrow'];
    let list = AI.Areas.anchors(e.x, e.y, maxR || 300, kinds);
    // birds and tree-dwellers go for a tree whenever one is in reach
    if (kinds[0] === 'tree' && kinds[1] === 'bush') { const trees = list.filter((a) => a.kind === 'tree'); if (trees.length) list = trees; }
    let best = null, bd = Infinity;
    for (const a of list) {
      const d = U.dist2(e.x, e.y, a.x, a.y) * (a.kind === kinds[0] ? 1 : 4);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  function spotAt(a) {
    if (!a) return null;
    if (a.kind === 'tree') return [a.x + (U.hash(Math.round(a.x), Math.round(a.y), 3) < 0.5 ? -18 : 18), a.y + 10];
    if (a.kind === 'log') return [a.x + U.rand(-10, 10), a.y + 10];
    return [a.x, a.y + 3];
  }

  // ---------------------------------------------------------------- arrivals
  function onInit(e, s) {
    if (e.psxHome) {
      const a = e.psxHome;
      s.home.x = a.x; s.home.y = a.y;
      s.homeAnchor = a;
    }
    s.native = !!e.psxNative;
    const em = e.psxEmerge;
    if (em) { e.psxEmerge = null; emerge(e, s, em); }
  }
  function emerge(e, s, em) {
    const v = s.vis;
    const dur = em.kind === 'branch' ? 1.6 : em.kind === 'burrow' || em.kind === 'ground' ? 1.4 : 1.1;
    const side = em.kind === 'trunk' ? Math.sign(e.x - em.ax) || 1 : 0;
    if (em.kind === 'trunk') { e.x = em.ax + side * 6; }
    if (em.kind === 'log') e.y = em.ay - 10;
    const tx = em.kind === 'trunk' ? em.ax + side * 34 : em.kind === 'log' ? em.ax + U.rand(-10, 10) : e.x;
    const ty = em.kind === 'log' ? em.ay + 18 : em.kind === 'trunk' ? em.ay + 8 : e.y + (em.kind === 'bush' ? 16 : 0);
    s.lock = {
      t: 0,
      update(e2, s2, dt, it) {
        this.t += dt;
        const k = Math.min(1, this.t / dur);
        if (em.kind === 'branch') { v.lift = (1 - k) * 80; v.rot = Math.sin(this.t * 18) * 0.12 * (1 - k); if (this.t < 0.1 && AI.Decor) AI.Decor.rustle(em.ax, em.ay, 40); }
        else if (em.kind === 'burrow' || em.kind === 'ground') { v.subNow = 1 - k; if (Math.random() < 0.3) AI.R.FX.px(e2.x + U.rand(-10, 10), e2.y, '#8a6a46', { vy: -30, life: 0.4 }); }
        else if (em.kind === 'bush') { v.alpha = 0.25 + k * 0.75; if (this.t < dt * 1.5 && AI.Decor) AI.Decor.rustle(em.ax, em.ay, 30); if (Math.random() < 0.15) AI.R.FX.px(e2.x + U.rand(-12, 12), e2.y - 10, '#4c9a3f', { vy: -20, life: 0.5 }); }
        else v.alpha = Math.min(1, 0.2 + k * 1.3);
        if (k > 0.35 || em.kind === 'branch') B().go(it, tx, ty, em.kind === 'branch' ? 0.25 : 0.4); else B().stay(it);
        if (k >= 1) { v.lift = 0; v.subNow = 0; v.alpha = null; v.rot = 0; if (Math.random() < 0.5) M().say(s2, s2.pers.temp === 'timid' ? 'eyes' : 'question', 1.4, 1); return false; }
        return true;
      },
    };
  }

  // ---------------------------------------------------------------- behaviors
  const add = (b) => B().add(b);

  add({
    id: 'shelter', tier: 5, emotion: 'fear', minCommit: 4, cd: 6,
    score(e, s, c) {
      const S = sky();
      if (!S || s.inCombat || c.threatV > 0.3 || s.stance === 'hostile' && s.combat.target) return 0;
      let need = 0;
      if (S.rain > 0.45 && !lovesRain(s)) need = Math.max(need, (S.rain - 0.35) * (s.p.types.includes('fire') ? 2.2 : 1.1));
      if (S.storm > 0.4) need = Math.max(need, S.storm * (small(s) ? 1.1 : 0.7));
      if (S.windNow() > 0.8 && small(s)) need = Math.max(need, (S.windNow() - 0.6) * 1.2);
      if (S.fog > 0.82) need = Math.max(need, (S.fog - 0.7) * 2.2 * (1 - s.pers.tr.bravery * 0.5));
      if (S.snow > 0.5 && !s.p.types.includes('ice')) need = Math.max(need, S.snow * 0.5);
      if (s.shelterUntil > AI.time) need = Math.max(need, 0.7);
      return need > 0.15 ? 0.25 + need : 0;
    },
    start(e, s) {
      const S = sky();
      const fogOnly = S && S.fog > 0.82 && S.rain < 0.45 && S.storm < 0.4 && S.windNow() < 0.8;
      s.bs.a = shelterFor(e, s, fogOnly ? 140 : 300);
      s.bs.spot = spotAt(s.bs.a); s.bs.there = false; s.bs.t = 0;
    },
    update(e, s, dt, it) {
      const S = sky();
      s.bs.t += dt;
      const calm = (!S || (S.rain < 0.25 && S.storm < 0.2 && S.windNow() < 0.65 && S.fog < 0.7 && S.snow < 0.3)) && !(s.shelterUntil > AI.time);
      if (calm && s.bs.t > 3) return false;
      if (s.bs.spot && !s.bs.there) {
        const d = Math.hypot(s.bs.spot[0] - e.x, s.bs.spot[1] - e.y);
        if (d > 10) { B().go(it, s.bs.spot[0], s.bs.spot[1], S && S.storm > 0.5 ? 0.85 : 0.6); return true; }
        s.bs.there = true;
      }
      B().stay(it);
      if (s.bs.a && s.bs.a.kind === 'bush') { s.vis.alpha = 0.6; if (Math.random() < dt * 0.4 && AI.Decor) AI.Decor.rustle(s.bs.a.x, s.bs.a.y, 30); }
      if (S && S.storm > 0.4 && Math.random() < dt * 0.3) M().say(s, small(s) ? 'scared' : 'sweat', 1.4, 1);
      if (S && S.fog > 0.82 && Math.random() < dt * 0.15) { M().say(s, 'eyes', 1.4, 1); it.face = Math.random() * 6.283; }
      return true;
    },
    end(e, s) { s.vis.alpha = null; if (s.wetFur > 0.3 && SHAKERS.has(e.dex)) s.wantShake = true; },
  });

  add({
    id: 'shake-off', tier: 7, emotion: null, minCommit: 0.8, cd: 10,
    score(e, s, c) {
      const S = sky();
      if (!S || s.inCombat || c.threatV > 0.2 || !SHAKERS.has(e.dex)) return 0;
      if (!s.wantShake && !(s.wetFur > 0.6 && S.rain < 0.2)) return 0;
      return 0.9;
    },
    start(e, s) { s.bs.t = 0; s.wantShake = false; },
    update(e, s, dt, it) {
      s.bs.t += dt;
      B().stay(it);
      s.vis.rot = Math.sin(s.bs.t * 40) * 0.22;
      if (Math.random() < 0.6) AI.R.FX.px(e.x + U.rand(-14, 14), e.y - e.bodyH * 0.6, '#bfe0ff', { vx: U.rand(-60, 60), vy: U.rand(-60, -10), life: 0.4 });
      if (s.bs.t > 0.8) { s.vis.rot = 0; s.wetFur = 0; M().say(s, 'happy', 1, 1); return false; }
      return true;
    },
    end(e, s) { s.vis.rot = 0; },
  });

  add({
    id: 'huddle', tier: 6, emotion: 'suspicion', minCommit: 4, cd: 3,
    // deep fog: nobody roams; strangely quiet
    score(e, s, c) {
      const S = sky();
      if (!S || s.inCombat || s.stance === 'hostile') return 0;
      if (s.huddleUntil > AI.time) return 0.6;
      if (S.fog < 0.78) return 0;
      return 0.35 + (S.fog - 0.78) * 3;
    },
    start(e, s) { s.bs.t = 0; },
    update(e, s, dt, it) {
      const S = sky();
      if (!S || (S.fog < 0.7 && !(s.huddleUntil > AI.time))) return false;
      B().stay(it);
      if (Math.random() < dt * 0.12) it.face = Math.random() * 6.283;
      return true;
    },
  });

  add({
    id: 'seek-shade', tier: 6, emotion: null, minCommit: 6, cd: 15,
    score(e, s, c) {
      const S = sky();
      if (!S || !S.hot() || s.inCombat || s.p.sunLover || s.p.types.includes('fire') || c.threatV > 0.1) return 0;
      return 0.3 + (1 - s.mind.needs.energy) * 0.4;
    },
    start(e, s) {
      const t = AI.Behaviors.nearProp(e, s, 'tree', 260);
      const S = AI.Sky;
      if (t) { const [dx, dy] = S.shadowDir(); const L = S.shadowLen(); s.bs.spot = [t.x + dx * L * 40, t.y + dy * L * 40 + 6]; }
      else s.bs.spot = null;
      s.bs.t = U.rand(8, 16);
    },
    update(e, s, dt, it) {
      if (!s.bs.spot) return false;
      s.bs.t -= dt;
      if (s.bs.t <= 0 || !AI.Sky.hot()) return false;
      const d = Math.hypot(s.bs.spot[0] - e.x, s.bs.spot[1] - e.y);
      if (d > 10) { B().go(it, s.bs.spot[0], s.bs.spot[1], 0.35); return true; }
      B().stay(it);
      s.vis.breath = true;
      if (Math.random() < dt * 0.1) M().say(s, 'sweat', 1.2, 0);
      return true;
    },
    end(e, s) { s.vis.breath = false; },
  });

  add({
    id: 'nibble', tier: 6, emotion: 'hunger', minCommit: 3, cd: 20,
    score(e, s, c) {
      if (!NIBBLERS.has(e.dex) || s.inCombat || c.threatV > 0.15 || !AI.Decor) return 0;
      const h = s.mind.needs.hunger;
      return h > 0.4 ? 0.2 + h * 0.6 : 0;
    },
    start(e, s) { s.bs.it = AI.Decor.near(e.x, e.y, 260, (o) => o.hab === 'bush' || o.hab === 'berry'); s.bs.t = 0; },
    update(e, s, dt, it) {
      const b = s.bs.it;
      if (!b) return false;
      const d = Math.hypot(b.x - e.x, b.y + 8 - e.y);
      if (d > 12) { B().go(it, b.x + 6, b.y + 8, 0.35); return true; }
      B().stay(it);
      s.bs.t += dt;
      s.vis.sy = 1 + Math.sin(s.bs.t * 12) * 0.05;
      if (Math.random() < dt * 2) { AI.R.FX.px(b.x + U.rand(-8, 8), b.y - 10, '#5aa64a', { vy: -15, life: 0.5 }); AI.Decor.rustle(b.x, b.y, 20); }
      if (s.bs.t > 3.2) { AI.Decor.nibble(b); s.mind.needs.hunger = Math.max(0, s.mind.needs.hunger - 0.5); M().say(s, 'happy', 1.2, 1); return false; }
      return true;
    },
    end(e, s) { s.vis.sy = 1; },
  });

  add({
    id: 'dig', tier: 8, emotion: null, minCommit: 2.5, cd: 90,
    score(e, s, c) {
      if (!DIGGERS.has(e.dex) || s.inCombat || c.threatV > 0.1 || !AI.Decor || s.lod > 0 || AI.Env.biome() !== 0 && !AI.Art.theme(AI.Env.biome())) return 0;
      return 0.18 + s.pers.tr.energy * 0.12;
    },
    start(e, s) { s.bs.t = 0; },
    update(e, s, dt, it) {
      B().stay(it);
      s.bs.t += dt;
      s.vis.rot = Math.sin(s.bs.t * 22) * 0.1;
      if (Math.random() < 0.5) AI.R.FX.px(e.x + U.rand(-10, 10), e.y, '#8a6a46', { vx: U.rand(-80, 80), vy: U.rand(-90, -30), life: 0.45 });
      if (s.bs.t > 2.4) {
        if (AI.R.World.kindAt(e.x, e.y + 8) === 'floor') AI.Decor.addDyn({ k: 'burrow', x: e.x, y: e.y + 8, hab: 'burrow', r: 12, flat: true });
        s.home.x = e.x; s.home.y = e.y;
        M().say(s, 'happy', 1.2, 1);
        return false;
      }
      return true;
    },
    end(e, s) { s.vis.rot = 0; },
  });

  add({
    id: 'scratch', tier: 8, emotion: 'hunger', minCommit: 2, cd: 25,
    // Pidgey & co. turning over dry leaves looking for food
    score(e, s, c) {
      if (!SCRATCHERS.has(e.dex) || s.inCombat || c.threatV > 0.1) return 0;
      return 0.12 + s.mind.needs.hunger * 0.4;
    },
    start(e, s) { s.bs.t = 0; },
    update(e, s, dt, it) {
      B().stay(it);
      s.bs.t += dt;
      s.vis.hopLift = Math.abs(Math.sin(s.bs.t * 10)) * 3;
      const col = AI.Sky && AI.Sky.season() === 'autumn' ? '#c97a2b' : '#7b9a4a';
      if (Math.random() < 0.35) AI.R.FX.px(e.x + U.rand(-12, 12), e.y, col, { vx: U.rand(-50, 50), vy: U.rand(-60, -20), life: 0.5 });
      if (s.bs.t > 2) { s.mind.needs.hunger = Math.max(0, s.mind.needs.hunger - 0.15); s.vis.hopLift = 0; return false; }
      return true;
    },
    end(e, s) { s.vis.hopLift = 0; },
  });

  add({
    id: 'puddle-play', tier: 7, emotion: 'joy', minCommit: 3, cd: 20,
    score(e, s, c) {
      const S = sky();
      if (!S || !AI.Decor || S.wet < 0.4 || !lovesRain(s) || s.inCombat || c.threatV > 0.1) return 0;
      return 0.3 + s.pers.tr.playfulness * 0.3;
    },
    start(e, s) {
      const list = AI.Decor.puddlesIn(e.x - 240, e.y - 200, e.x + 240, e.y + 200, []);
      s.bs.p = list.length ? list[(Math.random() * list.length) | 0] : null;
      s.bs.t = 0;
    },
    update(e, s, dt, it) {
      const p = s.bs.p;
      if (!p) return false;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d > 10 && s.bs.t === 0) { B().go(it, p.x, p.y, 0.55); return true; }
      s.bs.t += dt;
      B().stay(it);
      s.vis.hopLift = Math.abs(Math.sin(s.bs.t * 7)) * 10;
      if (s.vis.hopLift < 1 && Math.random() < 0.5) { AI.Decor.ripple(e.x, e.y, 16); AI.R.FX.burst(e.x, e.y - 2, '#bfe0ff', 4, 60); }
      if (Math.random() < dt * 0.6) M().say(s, 'happy', 1, 1);
      if (s.bs.t > 4) { s.vis.hopLift = 0; return false; }
      return true;
    },
    end(e, s) { s.vis.hopLift = 0; },
  });

  add({
    id: 'retreat-home', tier: 6, emotion: 'sleepy', minCommit: 5, cd: 4,
    // dawn: night Pokémon slip back into their trees and burrows
    score(e, s, c) {
      const S = sky();
      if (!S || !s.native || s.inCombat || c.threatV > 0.15 || s.stance === 'hostile' || !AI.cfg.areaSpawns) return 0;
      if (AI.Areas.active(e.dex) !== 'night' || AI.Areas.activity(e.dex) > 0.25) return 0;
      return 0.55;
    },
    start(e, s) {
      s.bs.a = s.homeAnchor || shelterFor(e, s);
      s.bs.spot = s.bs.a ? [s.bs.a.x, s.bs.a.y + (s.bs.a.kind === 'tree' ? 6 : 0)] : null;
      s.bs.fade = 0;
    },
    update(e, s, dt, it) {
      const cam = AI.R.Camera;
      if (!cam.sees(e.x, e.y, 60)) { removeNpc(e); return false; } // gone home out of sight
      if (s.bs.spot) {
        const d = Math.hypot(s.bs.spot[0] - e.x, s.bs.spot[1] - e.y);
        if (d > 12) { B().go(it, s.bs.spot[0], s.bs.spot[1], 0.45); return true; }
      }
      B().stay(it);
      s.bs.fade += dt;
      const k = s.bs.fade / 1.4;
      if (s.bs.a && (s.bs.a.kind === 'burrow')) s.vis.subNow = k; else { s.vis.alpha = 1 - k; if (s.p.flying) s.vis.lift = k * 60; }
      if (k >= 1) { removeNpc(e); return false; }
      return true;
    },
    end(e, s) { s.vis.alpha = null; s.vis.subNow = 0; s.vis.lift = 0; },
  });

  // ---------------------------------------------------------------- a gale catches a small flyer
  function blowAway(e, s, power) {
    if (s.lock || s.inCombat) return;
    const S = AI.Sky;
    const [wx, wy] = U.norm(Math.cos(S.st.windAng), Math.sin(S.st.windAng) * 0.5);
    const dur = U.rand(1.6, 2.6);
    M().feel(s, 'fear', 0.9, 'wind');
    M().say(s, 'scared', 2.4, 4);
    AI.Bus.emit({ type: 'cry', kind: 'panic', x: e.x, y: e.y, loud: 260, src: e });
    if (AI.Ambience) AI.Ambience.cry(e.x, e.y, 1.4);
    s.lock = {
      t: 0, spin: Math.random() < 0.5 ? -1 : 1,
      update(e2, s2, dt, it) {
        this.t += dt;
        const k = this.t / dur;
        const sp = 260 * power * (1 - k * 0.4);
        const nx = e2.x + wx * sp * dt, ny = e2.y + wy * sp * dt;
        e2.x = nx; e2.y = ny; // airborne: walls don't stop the wind
        s2.vis.lift = 40 + Math.sin(k * Math.PI) * 60 + Math.sin(this.t * 9) * 8;
        s2.vis.rot = this.t * 9 * this.spin;
        B().stay(it);
        if (Math.random() < dt * 3) AI.R.FX.px(e2.x, e2.y - s2.vis.lift - 10, '#e8f0e0', { vx: wx * 80, vy: -20, life: 0.4 });
        if (k >= 1) {
          s2.vis.rot = 0;
          if (!AI.R.Camera.sees(e2.x, e2.y, 40)) { removeNpc(e2); return false; }
          s2.vis.lift = 0;
          if (!AI.R.World.isFree(e2.x, e2.y, 10)) { const pt = B().pointNear(e2, e2.x, e2.y, 20, 120, 12); if (pt) { e2.x = pt[0]; e2.y = pt[1]; } }
          M().feel(s2, 'confusion', 0.6);
          M().say(s2, 'swirl', 2, 3);
          return false;
        }
        return true;
      },
    };
  }

  // ---------------------------------------------------------------- global upkeep (every half second)
  let tickT = 0;
  function tick(dt) {
    tickT -= dt;
    if (tickT > 0) return;
    const step = 0.5 - tickT;
    tickT = 0.5;
    const R = AI.R;
    const S = sky();
    const p = R.Game.player;
    const pv = p ? Math.hypot(p._vx || 0, p._vy || 0) : 0;
    const lantern = AI.Light && S && AI.Light.lanternOn();
    for (const e of R.EnemyMgr.all()) {
      const s = e.psx;
      if (!s || e.dead || s.lod > 1) continue;
      // daily rhythm
      if (S && AI.cfg.areaSpawns !== false) {
        const a = AI.Areas.activity(e.dex);
        const n = s.mind.needs;
        if (a < 0.35 && !s.inCombat && s.stance !== 'hostile') n.energy = Math.max(0, Math.min(n.energy, 0.9) - step * 0.05 * (1 - a));
        else if (a > 0.8 && s.beh && s.beh.id === 'sleep' && n.energy < 0.9) n.energy = Math.min(1, n.energy + step * 0.04);
      }
      // getting soaked
      if (S && S.rain > 0.3 && !(s.beh && s.beh.id === 'shelter' && s.bs.there)) s.wetFur = Math.min(1, (s.wetFur || 0) + step * S.rain * 0.08);
      // sleepers: twitch, shift, snore — and wake if you run past or shine a light on them
      if (s.beh && s.beh.id === 'sleep' && s.bs.down) {
        if (Math.random() < step * 0.15) { s.vis.rot = U.rand(-0.12, 0.12); setTimeout(() => { if (s.vis) s.vis.rot = 0; }, 180); }
        if (p && AI.Ambience && Math.random() < step * 0.25) AI.Ambience.snore(e.x, e.y);
        if (p) {
          const d = Math.hypot(p.x - e.x, p.y - e.y);
          let wake = 0;
          if (d < 110 && pv > 80) wake += (d < 70 ? 0.7 : 0.3) * (1 - s.pers.tr.laziness * 0.5);
          if (lantern && d < 140) wake += 0.12 * (1 - d / 140);
          if (Math.random() < wake * step * 2) {
            s.wokeAt = AI.time;
            const t = s.pers.temp;
            if (t === 'timid' || t === 'friendly' && s.pers.tr.bravery < 0.4) { M().feel(s, 'fear', 0.6, 'P'); M().say(s, 'surprise', 1.6, 3); }
            else { M().feel(s, 'anger', 0.35, 'P'); M().feel(s, 'surprise', 0.4); M().say(s, 'anger', 1.6, 3); }
            AI.Rel.adjust(s, 'P', { a: -0.05 });
          }
        }
      }
      // the haunted stretch of the old trail: in fog, nobody goes near
      if (S && S.fog > 0.6 && AI.Decor && AI.Decor.trailZone(e.x, e.y) > 0.1 && !s.inCombat) {
        const tr = AI.Decor.trail;
        M().feel(s, 'fear', 0.4, 'trail');
        s.poi = { kind: 'danger', x: tr.end[0], y: tr.end[1], t: AI.time };
      }
    }
  }
  AI.Bus.on('gust', (ev) => {
    const S = sky();
    if (!S || ev.power < 0.85) return;
    const R = AI.R;
    const cam = R.Camera;
    for (const e of R.EnemyMgr.all()) {
      const s = e.psx;
      if (!s || e.dead || !flyer(s) || !small(s) || !cam.sees(e.x, e.y, 80)) continue;
      if (s.beh && s.beh.id === 'sleep' && s.bs.down) continue; // tucked in on the ground
      if (Math.random() < 0.45 * (ev.power - 0.6)) blowAway(e, s, ev.power);
    }
  });
  // a close strike scorches the ground and terrifies whoever was standing next to it
  AI.Bus.on('lightning', (ev) => {
    if (!ev.near || !AI.Decor) return;
    AI.Decor.addDyn({ k: 'scorch', x: ev.x, y: ev.y, flat: true, t: AI.time });
    for (const e of AI.R.EnemyMgr.queryCircle(ev.x, ev.y, 240)) {
      const s = e.psx;
      if (!s || e.dead) continue;
      if (s.p.types.includes('electric')) { M().feel(s, 'excitement', 0.6); M().say(s, 'sparkle', 1.6, 3); continue; }
      if (s.beh && s.beh.id === 'sleep') s.wokeAt = AI.time;
      M().feel(s, 'fear', 0.8, 'thunder'); M().feel(s, 'surprise', 0.9);
      M().say(s, 'scared', 1.8, 4);
    }
  });
  // thunder: reactions vary with distance, species, personality and what they were doing
  AI.Bus.on('boom', (ev) => {
    if (!ev.thunder) return;
    const R = AI.R;
    const cam = R.Camera;
    for (const e of R.EnemyMgr.all()) {
      const s = e.psx;
      if (!s || e.dead || s.lod > 1 || !cam.sees(e.x, e.y, 300)) continue;
      const loud = U.clamp(1.4 - ev.dist * 0.35, 0, 1.2); // close thunder is a physical shock
      if (loud < 0.15) continue;
      // electric types shrug it off (some even love it)
      if (s.p.types.includes('electric')) { if (Math.random() < 0.4) { M().feel(s, 'excitement', 0.4); M().say(s, 'sparkle', 1.2, 2); } continue; }
      // sleepers only stir for close, loud thunder
      if (s.beh && s.beh.id === 'sleep' && s.bs.down) {
        if (Math.random() < (loud - 0.6) * 0.8) { s.wokeAt = AI.time; M().feel(s, 'surprise', 0.8); M().feel(s, 'fear', 0.4, 'thunder'); M().say(s, 'surprise', 1.4, 3); }
        continue;
      }
      const brave = s.pers.tr.bravery;
      if (brave < 0.8) M().feel(s, 'fear', loud * 0.35 * (1 - brave), 'thunder'); // a jolt of fright, the timid most of all
      if (s.inCombat || brave > 0.8 || Math.random() > 0.35 + loud * 0.45) continue; // not everyone reacts every time
      const r = Math.random() * (1 - brave * 0.4);
      if (r < 0.3 && !s.lock) {
        // freezes on the spot for a heartbeat
        M().feel(s, 'surprise', 0.7); M().feel(s, 'fear', 0.25 + loud * 0.2, 'thunder'); M().say(s, 'surprise', 1.2, 3);
        const dur = U.rand(0.6, 1.3);
        s.lock = { t: 0, update(e2, s2, dt, it) { this.t += dt; it.stay = true; s2.vis.shake = this.t < 0.25 ? 1.5 : 0; return this.t < dur; } };
      } else if (r < 0.55) {
        // runs for shelter
        M().feel(s, 'fear', 0.5 + loud * 0.3, 'thunder'); M().say(s, small(s) ? 'scared' : 'sweat', 1.4, 3);
        s.shelterUntil = AI.time + U.rand(15, 30);
      } else if (r < 0.75) {
        // stops wandering for a while
        M().feel(s, 'suspicion', 0.4); s.huddleUntil = AI.time + U.rand(6, 12);
      } else { M().feel(s, 'surprise', 0.4); if (Math.random() < 0.5) M().say(s, 'surprise', 1, 2); }
    }
  });

  AI.define('EnvBeh', { onInit, emerge, blowAway, tick, removeNpc, shelterFor });
})();
