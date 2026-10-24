/* PokéSurvivor+ — Living World AI · behavior library
 * Each behavior is a small, data-driven unit: a priority tier, a score from the NPC's state,
 * and a per-frame update that fills a movement/animation intent. Tiers follow the design:
 *   1 survival · 2 emergency · 3 defending/retaliating · 4 combat & territory
 *   5 major events · 6 needs · 7 social & curiosity · 8 idle activities
 * Species and personality change the scores, so the same priorities produce different choices.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const LIST = [];
  const BY = {};
  const TIER_BASE = { 0: 20, 1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 };

  function add(b) {
    b.minCommit = b.minCommit == null ? 1.5 : b.minCommit;
    b.cd = b.cd || 0;
    LIST.push(b);
    BY[b.id] = b;
    return b;
  }

  // ---------------------------------------------------------------- helpers
  const Env = () => AI.Env;
  const Mind = () => AI.Mind;
  const R = () => AI.R;

  function go(it, x, y, speed = 0.6) { it.x = x; it.y = y; it.speed = speed; }
  function stay(it) { it.stay = true; }
  function walkable(e, x, y) {
    const E = Env();
    // the Shady Forest's water: walkers keep out of the deep, fish keep to the water (34-forest.js)
    if (AI.Forest && AI.Forest.on() && e.dex != null) {
      const d = AI.Forest.depthClass(x, y), l = AI.Forest.locomotion(e.dex);
      if (l === 'swim' ? d === 0 : l === 'walk' && d === 2) return false;
    }
    if (e.flying) return true;
    if (!E.free(x, y, Math.max(8, e.r * 0.7))) return false;
    if (E.isLiquid(x, y) && (E.hurtsIn(e.types) || (e.psx && e.psx.p.hatesWater))) return false;
    return true;
  }
  function pointNear(e, x, y, rMin, rMax, tries = 8) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * 6.283, r = U.rand(rMin, rMax);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.85;
      if (walkable(e, px, py)) return [px, py];
    }
    return null;
  }
  // best escape direction away from (fx, fy): open ground, away from walls, toward friends
  function escapePoint(e, s, fx, fy, dist = 220) {
    let best = null, bv = -Infinity;
    const base = Math.atan2(e.y - fy, e.x - fx);
    for (let i = 0; i < 9; i++) {
      const a = base + (i - 4) * 0.42;
      const px = e.x + Math.cos(a) * dist, py = e.y + Math.sin(a) * dist * 0.85;
      let v = -Math.abs(i - 4) * 0.15;
      if (!walkable(e, px, py)) v -= 3;
      if (!walkable(e, e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 50)) v -= 2;
      if (s.ctx.friendNear) v += 0.6 * (1 - Math.min(1, U.dist(px, py, s.ctx.friendNear.x, s.ctx.friendNear.y) / 300));
      v += Math.random() * 0.4;
      if (v > bv) { bv = v; best = [px, py]; }
    }
    return best;
  }
  function envCache(s, key, ttl, fn) {
    const c = s.env || (s.env = {});
    const v = c[key];
    if (v && AI.time - v.t < ttl) return v.v;
    const nv = fn();
    c[key] = { t: AI.time, v: nv };
    return nv;
  }
  function nearWater(e, s, r = 380) { return envCache(s, 'water' + r, 3, () => Env().nearestWater(e.x, e.y, r)); }
  function nearProp(e, s, type, r = 260) { return envCache(s, 'p:' + type + r, 4, () => Env().nearestProp(e.x, e.y, r, type)); }
  function inWater(e) { return !e.flying && Env().isWater(e.x, e.y); }
  function threatPos(s) {
    const t = s.ctx.threat;
    if (t && AI.alive(t)) return [t.x, t.y];
    const fk = s.mind.cause.fear;
    if (fk === 'P' && s.ctx.player) return [s.ctx.player.x, s.ctx.player.y];
    if (typeof fk === 'number') { const o = R().EnemyMgr.get(fk); if (o && !o.dead) return [o.x, o.y]; }
    if (s.poi && s.poi.kind === 'danger' && AI.time - s.poi.t < 6) return [s.poi.x, s.poi.y];
    if (s.lastHurtBy && s.lastHurtBy.ent && AI.alive(s.lastHurtBy.ent)) return [s.lastHurtBy.ent.x, s.lastHurtBy.ent.y];
    return null;
  }
  function hpf(e) { return e.hp / Math.max(1, e.maxHp); }
  function animReset(e) {
    const a = e.anim;
    if (a.once && a.done) { a.once = false; a.done = false; a._start('Idle', false); }
  }
  function witnessesLaugh(e, s) {
    for (const o of s.ctx.near) {
      const os = o.psx;
      if (!os || os.beh && os.beh.tier <= 4) continue;
      if (o._d2 > 170 * 170) continue;
      if (os.pers.tr.playfulness > 0.55 || os.pers.quirks.has('mischievous')) {
        Mind().say(os, 'happy', 1.6, 1);
        Mind().feel(os, 'joy', 0.25);
        Mind().feel(s, 'embarrassment', 0.35);
        return true;
      }
    }
    return false;
  }
  function slip(e, s, how = 'slip') {
    s.vis.rot = (Math.random() < 0.5 ? -1 : 1) * 1.2;
    s.vis.rotT = 0.6;
    e.anim.play('Hurt', { speed: 1.2 });
    R().FX.burst(e.x, e.y - 2, '#d8c8a8', 6, 60);
    Mind().feel(s, 'embarrassment', 0.6);
    Mind().feel(s, 'surprise', 0.4);
    if (s.pers.quirks.has('hothead') || s.pers.quirks.has('stubborn')) { Mind().feel(s, 'anger', 0.25); Mind().say(s, 'anger', 1.4, 2); }
    else Mind().say(s, 'sweat', 1.8, 2);
    witnessesLaugh(e, s);
    AI.Bus.emit({ type: 'cry', kind: 'oops', x: e.x, y: e.y, loud: 120, src: e });
  }

  // ================================================================ TIER 1 — survival
  add({
    id: 'flee', tier: 1, emotion: 'fear', minCommit: 1.2,
    score(e, s, c) {
      const f = s.mind.emo.fear;
      if (f < 0.32) return 0;
      const tp = threatPos(s);
      if (!tp) return f > 0.7 ? 0.5 : 0;
      const d = Math.hypot(tp[0] - e.x, tp[1] - e.y);
      return f * (d < 380 ? 1.25 : 0.55) + (hpf(e) < 0.3 ? 0.3 : 0) + (s.pers.temp === 'timid' ? 0.2 : 0);
    },
    start(e, s) {
      s.bs.panic = s.mind.emo.fear > 0.75;
      s.bs.repick = 0;
      AI.Bus.emit({ type: 'cry', kind: 'panic', x: e.x, y: e.y, loud: s.bs.panic ? 260 : 170, src: e, foeKey: s.mind.cause.fear, foeX: (threatPos(s) || [])[0], foeY: (threatPos(s) || [])[1] });
      if (s.mind.emo.sadness > 0.4 || (s.pers.temp === 'friendly' && s.lastHurtBy && AI.time - s.lastHurtBy.t < 2)) { Mind().say(s, 'tear', 2, 2); s.vis.tears = 2.5; }
    },
    update(e, s, dt, it) {
      const tp = threatPos(s);
      s.bs.repick -= dt;
      if (tp && (s.bs.repick <= 0 || !s.bs.pt)) {
        s.bs.pt = escapePoint(e, s, tp[0], tp[1], s.bs.panic ? 260 : 200);
        s.bs.repick = s.bs.panic ? 0.35 : 0.8;
      }
      if (!s.bs.pt) return false;
      go(it, s.bs.pt[0], s.bs.pt[1], s.bs.panic ? 1.25 : 1.1);
      // panicked & clumsy: stumble
      if (s.bs.panic && Math.random() < dt * s.pers.tr.clumsiness * 0.25 && !s.vis.rotT) slip(e, s);
      const far = !tp || Math.hypot(tp[0] - e.x, tp[1] - e.y) > 420;
      return !(far && s.mind.emo.fear < 0.3);
    },
  });

  add({
    id: 'freeze', tier: 1, emotion: 'fear', minCommit: 1, cd: 6,
    score(e, s, c) {
      const f = s.mind.emo.fear;
      if (f < 0.55 || s.mind.emo.surprise < 0.35) return 0;
      const tr = s.pers.tr;
      return (tr.bravery < 0.3 ? 0.9 : 0.4) * f + (s.pers.quirks.has('skittish') ? 0.3 : 0) - (hpf(e) < 0.3 ? 0.4 : 0) + Math.random() * 0.2;
    },
    start(e, s) { s.bs.t = U.rand(0.8, 2.2); Mind().say(s, 'scared', s.bs.t, 2); },
    update(e, s, dt, it) {
      stay(it);
      const tp = threatPos(s);
      if (tp) it.face = Math.atan2(tp[1] - e.y, tp[0] - e.x);
      s.vis.shake = 1.3;
      it.anim = 'Idle'; it.animSpeed = 0.2;
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
    end(e, s) { s.vis.shake = 0; },
  });

  add({
    id: 'hide', tier: 1, emotion: 'fear', minCommit: 2, cd: 8,
    score(e, s, c) {
      const f = s.mind.emo.fear;
      if (f < 0.4 || s.pers.tr.bravery > 0.55) return 0;
      const cover = nearProp(e, s, 'grass', 220) || nearProp(e, s, 'tree', 220);
      return cover ? f * 1.05 + (s.pers.temp === 'timid' ? 0.15 : 0) - 0.1 : 0;
    },
    start(e, s) {
      const tp = threatPos(s);
      // prefer cover that isn't toward the threat
      const opts = [nearProp(e, s, 'grass', 220), nearProp(e, s, 'tree', 220)].filter(Boolean);
      s.bs.cover = opts.sort((a, b) => (tp ? U.dist2(b.x, b.y, tp[0], tp[1]) - U.dist2(a.x, a.y, tp[0], tp[1]) : 0))[0];
      s.bs.t = U.rand(4, 9);
    },
    update(e, s, dt, it) {
      const cv = s.bs.cover;
      if (!cv) return false;
      const tx = cv.type === 'tree' ? cv.x : cv.x, ty = cv.type === 'tree' ? cv.y + 10 : cv.y;
      const d = Math.hypot(tx - e.x, ty - e.y);
      if (d > 14) go(it, tx, ty, 1.05);
      else { stay(it); s.vis.alpha = cv.type === 'grass' ? 0.55 : 0.8; s.vis.sy = 0.9; s.bs.t -= dt; }
      return s.bs.t > 0 && s.mind.emo.fear > 0.15;
    },
    end(e, s) { s.vis.alpha = 1; s.vis.sy = 1; },
  });

  add({
    id: 'cower', tier: 1, emotion: 'fear', minCommit: 2, cd: 4,
    score(e, s, c) {
      const f = s.mind.emo.fear;
      const pr = c.friendNear;
      if (f < 0.4 || !pr || !pr.psx || !threatPos(s)) return 0;
      const strong = AI.Species.power(pr) > AI.Species.power(e) * 1.2 || pr.psx.pers.tr.protectiveness > 0.7;
      return strong ? f * 1.1 + 0.15 : 0;
    },
    update(e, s, dt, it) {
      const pr = s.ctx.friendNear;
      const tp = threatPos(s);
      if (!pr || pr.dead || !tp) return false;
      const [dx, dy] = U.norm(pr.x - tp[0], pr.y - tp[1]);
      go(it, pr.x + dx * (pr.r + e.r + 10), pr.y + dy * (pr.r + e.r + 10), 1.1);
      it.face = Math.atan2(tp[1] - e.y, tp[0] - e.x);
      if (pr.psx && pr.psx.pers.tr.protectiveness > 0.5) pr.psx.defend = { victim: e, attacker: s.ctx.threat || s.lastHurtBy && s.lastHurtBy.ent, t: AI.time };
      return s.mind.emo.fear > 0.2;
    },
  });

  // ================================================================ TIER 2 — emergencies
  add({
    id: 'retreat', tier: 2, emotion: (s) => (s.mind.emo.sadness > s.mind.emo.fear ? 'sadness' : 'fear'), minCommit: 2.5,
    score(e, s, c) {
      const h = hpf(e);
      const tr = s.pers.tr;
      const thresh = 0.18 + (1 - tr.bravery) * 0.25 - tr.aggression * 0.1 - (s.mind.emo.anger > 0.8 ? 0.15 : 0);
      if (h > thresh || !s.lastHurtBy || AI.time - s.lastHurtBy.t > 10) return 0;
      if (s.pers.quirks.has('stubborn') && Math.random() < 0.5) return 0;
      return 0.6 + (thresh - h) * 2;
    },
    start(e, s) {
      AI.Bus.emit({ type: 'cry', kind: 'help', x: e.x, y: e.y, loud: 300, src: e, foe: s.lastHurtBy && s.lastHurtBy.ent });
      Mind().say(s, s.mind.emo.sadness > 0.4 ? 'tear' : 'scared', 1.8, 2);
      s.bs.safe = 0;
    },
    update(e, s, dt, it) {
      const tp = threatPos(s);
      if (tp) {
        if (!s.bs.pt || Math.random() < dt * 1.5) s.bs.pt = escapePoint(e, s, tp[0], tp[1], 240);
        if (s.bs.pt) go(it, s.bs.pt[0], s.bs.pt[1], 1.1);
        // fighting retreat: take a parting shot if it has one ready
        const c = s.combat;
        if (c && c.target && c.gcd <= 0 && c.moves.some((m) => m.ranged && m.cdLeft <= 0) && Math.random() < dt * 2) AI.Combat.update(e, s, 0, it);
        s.bs.safe = Math.hypot(tp[0] - e.x, tp[1] - e.y) > 360 ? s.bs.safe + dt : 0;
      } else { stay(it); s.bs.safe += dt; }
      // licking wounds while safe
      if (s.bs.safe > 1.5) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025 * dt); stay(it); it.anim = 'Idle'; it.animSpeed = 0.5; }
      return hpf(e) < 0.6 && !(s.bs.safe > 10);
    },
  });

  add({
    id: 'flop', tier: 2, emotion: 'fear', minCommit: 3,
    score(e, s) { return s.p.fish && !e.flying && !inWater(e) ? 0.9 : 0; },
    start(e, s) { s.bs.hopT = 0; Mind().say(s, 'sweat', 1.5, 1); },
    update(e, s, dt, it) {
      if (inWater(e)) { Mind().feel(s, 'joy', 0.5); Mind().say(s, 'happy', 1.5, 1); return false; }
      const w = nearWater(e, s, 700);
      s.bs.hopT -= dt;
      if (s.bs.hopT <= 0) {
        s.bs.hopT = U.rand(0.45, 0.8);
        s.vis.hop = 0.4;
        e.anim.play('Hurt', { speed: 1.4 });
        if (R().Camera.sees(e.x, e.y, 0)) R().FX.burst(e.x, e.y - 2, '#9fd8ff', 3, 50);
        const a = w ? Math.atan2(w.y - e.y, w.x - e.x) + U.rand(-0.6, 0.6) : Math.random() * 6.283;
        s.bs.dx = Math.cos(a); s.bs.dy = Math.sin(a);
      }
      // only moves while airborne
      const k = s.vis.hop > 0 ? 1 : 0;
      it.custom = { dx: (s.bs.dx || 0) * 70 * dt * k, dy: (s.bs.dy || 0) * 60 * dt * k };
      if (!w && Math.random() < dt * 0.1) { Mind().feel(s, 'sadness', 0.2); Mind().say(s, 'tear', 1.5, 1); }
      return true;
    },
  });

  add({
    id: 'escape-liquid', tier: 2, emotion: 'fear', minCommit: 0.5,
    score(e, s) {
      if (e.flying || !Env().isLiquid(e.x, e.y)) return 0;
      if (Env().hurtsIn(e.types)) return 1.4;
      if (s.beh && (s.beh.id === 'swim' || s.beh.id === 'swim-fail')) return 0;
      return s.p.swim < 0.3 ? 0.8 : 0;
    },
    update(e, s, dt, it) {
      if (!s.bs.pt) s.bs.pt = pointNear(e, e.x, e.y, 50, 160, 14) || [e.x + 80, e.y];
      go(it, s.bs.pt[0], s.bs.pt[1], 1.2);
      if (Math.random() < dt * 3 && R().Camera.sees(e.x, e.y, 0)) R().FX.burst(e.x, e.y - 4, '#b3defa', 3, 60);
      return Env().isLiquid(e.x, e.y);
    },
  });

  // ================================================================ TIER 3 — defend / retaliate
  add({
    id: 'defend', tier: 3, emotion: 'anger', minCommit: 2,
    score(e, s) {
      const d = s.defend;
      if (!d || AI.time - d.t > 9 || !d.attacker || !AI.alive(d.attacker) || !d.victim || d.victim.dead) return 0;
      if (d.attacker === e) return 0;
      const tr = s.pers.tr;
      // a weak, timid friend may still try, but a reasonable one weighs the odds
      const atkPow = AI.isPlayer(d.attacker) ? AI.playerPower(d.attacker) : AI.Species.power(d.attacker);
      const ratio = AI.Species.power(e) / Math.max(60, atkPow);
      return 0.5 + tr.protectiveness * 0.6 + s.mind.emo.anger * 0.4 - (ratio < 0.3 ? 0.5 * (1 - tr.bravery) : 0);
    },
    start(e, s) {
      AI.Combat.engage(e, s, s.defend.attacker, 'defend');
      Mind().say(s, 'anger', 1.6, 2);
      s.bs.interpose = s.pers.tr.protectiveness > 0.7;
    },
    update(e, s, dt, it) {
      const d = s.defend;
      if (!d || !AI.alive(d.attacker)) return false;
      if (s.combat.target !== d.attacker) AI.Combat.engage(e, s, d.attacker, 'defend');
      // protective natures stand between the attacker and the victim first
      if (s.bs.interpose && d.victim && !d.victim.dead && Math.hypot(d.attacker.x - d.victim.x, d.attacker.y - d.victim.y) < 220) {
        const mx = (d.attacker.x + d.victim.x) / 2, my = (d.attacker.y + d.victim.y) / 2;
        AI.Combat.update(e, s, dt, it);
        if (!s.combat.cast && !s.combat.dash) go(it, mx, my, 1.1);
        return true;
      }
      return AI.Combat.update(e, s, dt, it);
    },
  });

  add({
    id: 'retaliate', tier: 3, emotion: 'anger', minCommit: 2.5,
    score(e, s) {
      const h = s.lastHurtBy;
      if (!h || !h.ent || AI.time - h.t > 5 || !AI.alive(h.ent) || h.ent === e) return 0;
      const anger = s.mind.cause.anger === h.key ? s.mind.emo.anger : 0;
      if (anger < 0.35) return 0;
      return anger * 1.1 + s.pers.tr.aggression * 0.3;
    },
    start(e, s) { AI.Combat.engage(e, s, s.lastHurtBy.ent, 'retaliate'); },
    update(e, s, dt, it) {
      if (!s.combat.target) return false;
      return AI.Combat.update(e, s, dt, it);
    },
  });

  // ================================================================ TIER 4 — combat & territory
  add({
    id: 'fight', tier: 4, emotion: (s) => (s.mind.emo.fear > s.mind.emo.anger + 0.2 ? 'fear' : 'anger'), minCommit: 2.5,
    score(e, s) {
      const t = s.fightTarget;
      if (!t) return 0;
      return 0.35 + s.fightScore;
    },
    start(e, s) { AI.Combat.engage(e, s, s.fightTarget, s.fightReason); if (s.mind.emo.anger < 0.3) Mind().feel(s, 'anger', 0.3, AI.keyOf(s.fightTarget)); },
    update(e, s, dt, it) {
      if (s.fightTarget && s.combat.target !== s.fightTarget) AI.Combat.engage(e, s, s.fightTarget, s.fightReason);
      return AI.Combat.update(e, s, dt, it);
    },
  });

  add({
    id: 'hunt', tier: 4, emotion: 'excitement', minCommit: 3, cd: 10,
    score(e, s, c) {
      const p = c.prey;
      if (!p || p.dead || s.mind.needs.energy < 0.2) return 0;
      return 0.3 + s.mind.needs.hunger * 0.8 + s.pers.tr.aggression * 0.3;
    },
    start(e, s) { s.bs.prey = s.ctx.prey; s.bs.t = 0; s.bs.stalk = true; },
    update(e, s, dt, it) {
      const p = s.bs.prey;
      if (!p || p.dead) { Mind().feel(s, 'joy', 0.3); s.mind.needs.hunger = Math.max(0, s.mind.needs.hunger - 0.6); return false; }
      s.bs.t += dt;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (s.bs.stalk && d > 140) { go(it, p.x, p.y, 0.45); it.anim = 'Walk'; it.animSpeed = 0.6; return d < 650; }
      s.bs.stalk = false;
      if (s.combat.target !== p) AI.Combat.engage(e, s, p, 'hunt');
      AI.Combat.update(e, s, dt, it);
      // predators tire and give up long chases
      if (s.bs.t > 14 || s.mind.needs.energy < 0.1 || d > 700) { Mind().say(s, 'dots', 1.5, 1); AI.Combat.disengage(e, s); return false; }
      return true;
    },
  });

  add({
    id: 'territory', tier: 4, emotion: 'anger', minCommit: 1.5,
    score(e, s) {
      const T = s.territory;
      if (!T || !T.intruder) return 0;
      return 0.35 + T.intr * 0.6;
    },
    start(e, s) { s.bs.hop = 0; s.bs.warnT = 0; },
    update(e, s, dt, it) {
      const T = s.territory;
      const t = T.intruder;
      if (!t || !AI.alive(t)) return false;
      const d = Math.hypot(t.x - e.x, t.y - e.y);
      it.face = Math.atan2(t.y - e.y, t.x - e.x);
      if (T.intr >= 1) {
        // warned enough — attack
        if (s.combat.target !== t) { AI.Combat.engage(e, s, t, 'territory'); Mind().say(s, 'anger', 1.8, 3); }
        AI.Combat.update(e, s, dt, it);
        if (Math.hypot(t.x - s.home.x, t.y - s.home.y) > s.home.r * 1.7) { T.intr = 0.4; AI.Combat.disengage(e, s); return false; }
        return true;
      }
      // posture: face the intruder, stamp, cry out
      go(it, U.lerp(s.home.x, t.x, 0.35), U.lerp(s.home.y, t.y, 0.35), 0.5);
      if (d < 140) stay(it);
      s.bs.warnT -= dt;
      if (s.bs.warnT <= 0) {
        s.bs.warnT = 1.4;
        s.vis.hop = 0.22;
        Mind().say(s, 'anger', 1.2, 2);
        AI.Bus.emit({ type: 'cry', kind: 'warn', x: e.x, y: e.y, loud: 220, src: e, foe: t, foeKey: AI.keyOf(t) });
      }
      return true;
    },
  });

  // ================================================================ TIER 5 — events
  add({
    id: 'mourn', tier: 5, emotion: 'sadness', minCommit: 4, cd: 30,
    score(e, s) {
      const m = s.mourn;
      if (!m || AI.time - m.t > 25) return 0;
      return 0.3 + s.mind.emo.sadness * 0.9;
    },
    start(e, s) { s.bs.t = U.rand(6, 14); s.vis.tears = 4; },
    update(e, s, dt, it) {
      const m = s.mourn;
      const d = Math.hypot(m.x - e.x, m.y - e.y);
      if (d > 40) go(it, m.x, m.y, 0.5); else { stay(it); it.anim = 'Idle'; it.animSpeed = 0.4; s.vis.sy = 0.94; s.bs.t -= dt; }
      if (Math.random() < dt * 0.3) s.vis.tears = 2;
      return s.bs.t > 0;
    },
    end(e, s) { s.mourn = null; s.vis.sy = 1; },
  });

  add({
    id: 'watch', tier: 5, emotion: 'suspicion', minCommit: 2,
    score(e, s, c) {
      const susp = s.mind.emo.suspicion;
      if (susp < 0.35 || s.stance === 'hostile') return 0;
      const cause = s.mind.cause.suspicion;
      if (cause !== 'P' || !c.pSeen) return 0;
      return susp * 0.9 + (s.pers.temp === 'timid' ? 0.1 : 0);
    },
    update(e, s, dt, it) {
      const p = s.ctx.player;
      if (!p) return false;
      const d = s.ctx.pd;
      it.face = Math.atan2(p.y - e.y, p.x - e.x);
      if (d < 180) { const [ax, ay] = U.norm(e.x - p.x || 1, e.y - p.y); go(it, e.x + ax * 90, e.y + ay * 90, 0.7); }
      else stay(it);
      return s.mind.emo.suspicion > 0.2;
    },
  });

  add({
    id: 'investigate', tier: 5, emotion: 'curiosity', minCommit: 2, cd: 6, distracting: true,
    score(e, s) {
      const p = s.poi;
      if (!p || AI.time - p.t > 12 || p.kind === 'danger') return 0;
      const tr = s.pers.tr;
      return (tr.curiosity * 0.7 + (p.kind === 'boom' ? tr.aggression * 0.4 : 0) + (p.kind === 'evolve' ? 0.3 : 0)) * (s.mind.emo.fear > 0.4 ? 0.3 : 1);
    },
    start(e, s) { s.bs.t = U.rand(3, 6); s.bs.stop = s.pers.tr.bravery < 0.4 ? 170 : 55; },
    update(e, s, dt, it) {
      const p = s.poi;
      if (!p) return false;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      it.face = Math.atan2(p.y - e.y, p.x - e.x);
      if (d > s.bs.stop) go(it, p.x, p.y, 0.6);
      else { stay(it); s.bs.t -= dt; if (Math.random() < dt * 0.6) it.face += U.rand(-1, 1); }
      return s.bs.t > 0;
    },
    end(e, s) { s.poi = null; },
  });

  // ================================================================ TIER 6 — needs
  add({
    id: 'sleep', tier: 6, emotion: 'sleepy', minCommit: 6, cd: 20, distracting: true,
    score(e, s, c) {
      const n = s.mind.needs;
      if (s.inCombat || c.threatV > 0.15 || s.mind.emo.fear > 0.25 || s.stance === 'hostile') return 0;
      // once asleep, stay asleep until rested (or woken)
      if (s.beh === this && s.bs.down) return n.energy < 0.95 ? 0.7 : 0;
      const sleepy = s.pers.quirks.has('sleepy');
      const th = sleepy ? 0.5 : 0.28 + s.pers.tr.laziness * 0.1;
      if (n.energy > th) return 0;
      return 0.3 + (th - n.energy) * 3 + (sleepy ? 0.2 : 0);
    },
    start(e, s) {
      const tree = nearProp(e, s, 'tree', 200);
      s.bs.spot = tree && s.lod === 0 ? [tree.x + U.rand(-14, 14), tree.y + 16] : [e.x, e.y];
      s.bs.down = false;
      s.bs.t0 = AI.time;
    },
    update(e, s, dt, it) {
      if (s.wokeAt && s.wokeAt >= s.bs.t0) { animReset(e); return false; }
      if (!s.bs.down) {
        const d = Math.hypot(s.bs.spot[0] - e.x, s.bs.spot[1] - e.y);
        if (d > 12 && Math.random() > dt * 0.1) { go(it, s.bs.spot[0], s.bs.spot[1], 0.4); return true; }
        s.bs.down = true;
        e.anim.play('Faint', { hold: true, speed: 0.6 });
      }
      stay(it);
      s.vis.sy = 0.96;
      s.vis.breath = true;
      if (s.mind.needs.energy > 0.97) {
        // natural wake-up with a yawn
        animReset(e);
        Mind().say(s, 'dots', 1.2, 1);
        return false;
      }
      return true;
    },
    end(e, s) { animReset(e); s.vis.sy = 1; s.vis.breath = false; },
  });

  add({
    id: 'rest', tier: 6, emotion: null, minCommit: 3, cd: 8,
    score(e, s, c) {
      const n = s.mind.needs;
      if (s.inCombat || c.threatV > 0.2) return 0;
      return n.energy < 0.4 ? 0.2 + (0.4 - n.energy) * 1.5 + s.pers.tr.laziness * 0.2 : 0;
    },
    start(e, s) { s.bs.t = U.rand(3, 8); },
    update(e, s, dt, it) {
      stay(it); it.anim = 'Idle'; it.animSpeed = 0.45;
      s.mind.needs.energy = Math.min(1, s.mind.needs.energy + dt * 0.02);
      if (Math.random() < dt * 0.15) Mind().say(s, 'dots', 1.2, 0.5);
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
  });

  add({
    id: 'forage', tier: 6, emotion: 'hunger', minCommit: 2, cd: 10, distracting: true,
    score(e, s, c) {
      const h = s.mind.needs.hunger;
      if (h < 0.65 || s.inCombat || c.threatV > 0.25) return 0;
      return 0.2 + (h - 0.65) * 2 + (s.pers.quirks.has('glutton') ? 0.2 : 0);
    },
    start(e, s) {
      s.bs.food = findFood(e, s);
      s.bs.eat = 0;
    },
    update(e, s, dt, it) {
      const f = s.bs.food;
      if (!f) { // nothing nearby: roam looking for food
        if (!s.bs.pt || Math.hypot(s.bs.pt[0] - e.x, s.bs.pt[1] - e.y) < 20) s.bs.pt = pointNear(e, e.x, e.y, 120, 260) || [e.x, e.y];
        go(it, s.bs.pt[0], s.bs.pt[1], 0.5);
        if (Math.random() < dt * 0.5) s.bs.food = findFood(e, s);
        return s.mind.needs.hunger > 0.3;
      }
      if (f.pickup && !R().Pickups.all().includes(f.pickup)) { s.bs.food = null; return true; }
      const d = Math.hypot(f.x - e.x, f.y - e.y);
      if (d > (f.pickup ? 14 : 26)) { go(it, f.x, f.y, 0.65); return true; }
      stay(it);
      it.face = Math.atan2(f.y - e.y, f.x - e.x);
      s.bs.eat += dt;
      if (Math.random() < dt * 2.5 && !e.anim.busy()) e.anim.play('Attack', { speed: 0.9 });
      if (s.bs.eat > (f.pickup ? 0.8 : 2.4)) {
        s.mind.needs.hunger = Math.max(0, s.mind.needs.hunger - (f.pickup ? 0.8 : 0.55));
        Mind().feel(s, 'joy', 0.35);
        Mind().say(s, 'happy', 1.4, 1);
        if (f.pickup) {
          try { R().Pickups.removeId(f.pickup.id); } catch (err) { /* ignore */ }
          // the player shared food: gratitude
          const p = s.ctx.player;
          if (p && s.ctx.pd < 320 && f.byPlayer) { AI.Rel.adjust(s, 'P', { a: 0.3, f: -0.2, g: -0.15 }); Mind().feel(s, 'affection', 0.6, 'P'); Mind().say(s, 'love', 2, 2); }
        }
        return false;
      }
      return true;
    },
  });

  function findFood(e, s) {
    const R0 = R();
    let best = null, bd = 260 * 260;
    for (const p of R0.Pickups.all()) {
      if (p.kind !== 'heal' && p.kind !== 'berry') continue;
      const d = U.dist2(e.x, e.y, p.x, p.y);
      if (d < bd) { bd = d; best = { x: p.x, y: p.y, pickup: p, byPlayer: !!(s.ctx.player && U.dist2(p.x, p.y, s.ctx.player.x, s.ctx.player.y) < 300 * 300) }; }
    }
    if (best) return best;
    const g = s.p.diet !== 'carnivore' && (nearProp(e, s, 'grass', 240) || nearProp(e, s, 'tree', 240));
    if (g) return { x: g.x, y: g.y + (g.type === 'tree' ? 14 : 0) };
    return null;
  }

  // ================================================================ TIER 7 — social & curiosity
  add({
    id: 'follow-player', tier: 7, emotion: 'affection', minCommit: 3,
    score(e, s, c) {
      if (s.stance !== 'friendly' || !c.player || c.player.dead) return 0;
      const w = AI.Rel.warmth(s.rel.get('P'));
      if (w < 0.55 || c.pd > 700) return 0;
      return 0.3 + w * 0.6 + s.pers.tr.sociability * 0.2;
    },
    start(e, s) { s.bs.offA = Math.random() * 6.283; s.bs.dist = U.rand(60, 120); Mind().say(s, 'love', 1.5, 1); },
    update(e, s, dt, it) {
      const p = s.ctx.player;
      if (!p || p.dead || s.stance !== 'friendly') return false;
      s.engaged = true;
      s.bs.offA += dt * 0.2;
      const tx = p.x + Math.cos(s.bs.offA) * s.bs.dist, ty = p.y + Math.sin(s.bs.offA) * s.bs.dist * 0.7;
      const d = Math.hypot(tx - e.x, ty - e.y);
      if (d > 24) go(it, tx, ty, U.clamp(d / 110, 0.4, 1.3)); else { stay(it); it.face = Math.atan2(p.y - e.y, p.x - e.x); }
      if (Math.random() < dt * 0.08) { s.vis.hop = 0.3; Mind().say(s, Math.random() < 0.5 ? 'happy' : 'love', 1.4, 0.8); }
      // spending peaceful time together deepens the bond
      AI.Rel.adjust(s, 'P', { b: dt * 0.004 });
      return s.ctx.pd < 800;
    },
  });

  add({
    id: 'approach-player', tier: 7, emotion: 'curiosity', minCommit: 2.5, cd: 15,
    score(e, s, c) {
      if (!c.pSeen || s.stance === 'hostile' || s.stance === 'wary') return 0;
      const w = AI.Rel.warmth(s.rel.get('P'));
      const tr = s.pers.tr;
      return (tr.curiosity * 0.5 + Math.max(0, w) * 0.5 + (s.pers.temp === 'friendly' ? 0.2 : 0)) * (c.pd < 500 ? 1 : 0.4) - 0.1;
    },
    start(e, s) { s.bs.t = U.rand(4, 8); Mind().say(s, 'question', 1.6, 1); s.bs.greeted = false; },
    update(e, s, dt, it) {
      const p = s.ctx.player;
      if (!p || p.dead) return false;
      const d = s.ctx.pd;
      it.face = Math.atan2(p.y - e.y, p.x - e.x);
      if (d > 105) go(it, p.x, p.y, 0.55);
      else {
        stay(it);
        s.bs.t -= dt;
        if (!s.bs.greeted) { s.bs.greeted = true; Mind().say(s, 'happy', 1.5, 1); s.vis.hop = 0.25; }
        // repeated peaceful encounters build familiarity
        AI.Rel.adjust(s, 'P', { a: dt * 0.025, f: -dt * 0.03 });
      }
      return s.bs.t > 0 && s.stance !== 'hostile';
    },
  });

  add({
    id: 'seek-attention', tier: 7, emotion: 'joy', minCommit: 3, cd: 18,
    score(e, s, c) {
      if (!c.pSeen || s.stance !== 'friendly' || s.pers.tr.playfulness < 0.55) return 0;
      return 0.25 + s.pers.tr.playfulness * 0.5 + s.mind.emo.joy * 0.2;
    },
    start(e, s) { s.bs.t = U.rand(4, 7); s.bs.a = Math.random() * 6.283; s.bs.dir = Math.random() < 0.5 ? 1 : -1; },
    update(e, s, dt, it) {
      const p = s.ctx.player;
      if (!p) return false;
      s.bs.a += s.bs.dir * dt * 1.7;
      go(it, p.x + Math.cos(s.bs.a) * 75, p.y + Math.sin(s.bs.a) * 55, 1.05);
      if (Math.random() < dt * 0.7) { s.vis.hop = 0.25; Mind().say(s, 'note', 1, 0.8); }
      s.engaged = true;
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
  });

  add({
    id: 'comfort', tier: 7, emotion: 'affection', minCommit: 3, cd: 12,
    score(e, s, c) {
      const tr = s.pers.tr;
      if (tr.sociability < 0.45 && tr.protectiveness < 0.6) return 0;
      for (const o of c.near) {
        const os = o.psx;
        if (!os) continue;
        const r = s.rel.get(o.id);
        if ((r && r.b > 0.25) || (o.dex === e.dex && tr.sociability > 0.7)) {
          const need = Math.max(os.mind.emo.sadness, os.mind.emo.fear * 0.8);
          if (need > 0.45 && os.ctx.threatV < 0.3) { s.bs_cand = o; return 0.35 + need * 0.6 + tr.sociability * 0.2; }
        }
      }
      return 0;
    },
    start(e, s) { s.bs.who = s.bs_cand; s.bs.t = 0; },
    update(e, s, dt, it) {
      const o = s.bs.who;
      if (!o || o.dead || !o.psx) return false;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d > e.r + o.r + 12) { go(it, o.x, o.y, 0.8); return true; }
      stay(it);
      it.face = Math.atan2(o.y - e.y, o.x - e.x);
      s.bs.t += dt;
      if (s.bs.t > 0.4 && !s.bs.said) { s.bs.said = true; Mind().say(s, 'love', 2.2, 2); Mind().say(o.psx, 'tear', 1, 1); }
      if (s.bs.t > 2.5) {
        const os = o.psx;
        os.mind.emo.sadness = Math.max(0, os.mind.emo.sadness - 0.45);
        os.mind.emo.fear = Math.max(0, os.mind.emo.fear - 0.35);
        Mind().feel(os, 'affection', 0.4, e.id);
        Mind().say(os, 'happy', 1.6, 2);
        AI.Rel.adjust(s, o.id, { b: 0.15, a: 0.1 });
        AI.Rel.adjust(os, e.id, { b: 0.2, a: 0.15 });
        return false;
      }
      return true;
    },
  });

  add({
    id: 'chase-critter', tier: 7, emotion: 'excitement', minCommit: 3, cd: 25, distracting: true,
    score(e, s, c) {
      if (!s.pers.quirks.has('chaser') && s.pers.tr.playfulness < 0.75) return 0;
      for (const o of c.near) {
        const op = o.psx && o.psx.p;
        if (op && (op.flying || op.types.includes('bug')) && op.size <= s.p.size && o.dex !== e.dex) { s.bs_cand = o; return 0.3 + s.pers.tr.playfulness * 0.4; }
      }
      return 0;
    },
    start(e, s) { s.bs.who = s.bs_cand; s.bs.t = U.rand(4, 9); s.vis.hop = 0.2; },
    update(e, s, dt, it) {
      const o = s.bs.who;
      if (!o || o.dead) return false;
      go(it, o.x, o.y, 1.05);
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d < e.r + o.r + 6 && !s.bs.pounced) {
        s.bs.pounced = true; s.vis.hop = 0.35;
        if (o.psx) { Mind().feel(o.psx, 'surprise', 0.7); Mind().feel(o.psx, 'fear', 0.2, e.id); Mind().say(o.psx, 'surprise', 1, 2); }
      }
      s.bs.t -= dt;
      if (s.bs.t <= 0) { Mind().say(s, 'dots', 1.4, 1); return false; } // lost interest
      return true;
    },
  });

  add({
    id: 'steal', tier: 7, emotion: 'excitement', minCommit: 2, cd: 8, distracting: true,
    score(e, s, c) {
      if (!s.pers.quirks.has('shiny-collector') && s.pers.tr.greed < 0.75) return 0;
      if (s.stance === 'friendly' && s.pers.tr.greed < 0.8) return 0;
      const pk = envCache(s, 'shiny', 1, () => {
        let best = null, bd = 230 * 230;
        for (const p of R().Pickups.all()) {
          if (p.kind !== 'coin' && p.kind !== 'item' && p.kind !== 'ticket') continue;
          const d = U.dist2(e.x, e.y, p.x, p.y);
          if (d < bd) { bd = d; best = p; }
        }
        return best;
      });
      if (!pk) return 0;
      s.bs_cand = pk;
      return 0.45 + s.pers.tr.greed * 0.5;
    },
    start(e, s) { s.bs.pk = s.bs_cand; Mind().say(s, 'sparkle', 1.4, 1); },
    update(e, s, dt, it) {
      const pk = s.bs.pk;
      if (!pk || !R().Pickups.all().includes(pk)) return false;
      const d = Math.hypot(pk.x - e.x, pk.y - e.y);
      if (d > 12) { go(it, pk.x, pk.y, 1.05); return true; }
      try { R().Pickups.removeId(pk.id); } catch (err) { return false; }
      s.loot = (s.loot || 0) + (pk.kind === 'coin' ? Math.max(1, pk.value || 1) : 5);
      s.lootItems = s.lootItems || [];
      if (pk.kind !== 'coin') s.lootItems.push({ kind: pk.kind, value: pk.value });
      Mind().feel(s, 'joy', 0.5);
      Mind().say(s, 'sparkle', 1.6, 2);
      s.vis.hop = 0.3;
      return false;
    },
  });

  // ================================================================ TIER 8 — idle activities
  add({
    id: 'wander', tier: 8, emotion: null, minCommit: 2,
    score(e, s) { return 0.32 + s.mind.needs.energy * 0.1 - s.pers.tr.laziness * 0.12; },
    start(e, s) { s.bs.pt = null; s.bs.pause = 0; },
    update(e, s, dt, it) {
      const lead = s.group && AI.Social ? AI.Social.leaderOf(e) : null;
      if (s.bs.pause > 0) { s.bs.pause -= dt; stay(it); if (Math.random() < dt * 0.5) it.face = Math.random() * 6.283; return true; }
      if (!s.bs.pt || Math.hypot(s.bs.pt[0] - e.x, s.bs.pt[1] - e.y) < 14 || Math.random() < dt * 0.05) {
        if (s.bs.pt && Math.random() < 0.45) { s.bs.pause = U.rand(0.8, 3); }
        const cx = lead ? lead.x : s.home.x, cy = lead ? lead.y : s.home.y;
        const rr = lead ? 90 : Math.max(80, s.home.r);
        s.bs.pt = pointNear(e, cx, cy, lead ? 30 : 30, rr) || [e.x, e.y];
      }
      go(it, s.bs.pt[0], s.bs.pt[1], (lead ? 0.6 : 0.42) * (0.8 + s.pers.tr.energy * 0.4));
      // clumsy waddlers sometimes slip on nothing
      if (s.lod === 0 && Math.random() < dt * s.pers.tr.clumsiness * 0.012 && !s.vis.rotT) slip(e, s);
      return true;
    },
  });

  add({
    id: 'idle', tier: 8, emotion: null, minCommit: 2,
    score(e, s) { return 0.2 + s.pers.tr.laziness * 0.35 + (s.pers.quirks.has('dazed') ? 0.3 : 0); },
    start(e, s) { s.bs.t = U.rand(2, 6); s.bs.look = 0; },
    update(e, s, dt, it) {
      stay(it);
      s.bs.look -= dt;
      if (s.bs.look <= 0) { s.bs.look = U.rand(1.2, 3); s.bs.face = Math.random() * 6.283; }
      it.face = s.bs.face;
      if (Math.random() < dt * 0.04) { s.vis.yawn = 0.8; Mind().say(s, 'dots', 1, 0.3); }
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
  });

  add({
    id: 'swim', tier: 8, emotion: 'joy', minCommit: 4, cd: 12,
    score(e, s) {
      if (!s.p.lovesWater || e.flying || s.p.fish) return 0;
      const w = nearWater(e, s);
      if (!w) return 0;
      const wx = AI.Env.weather();
      return 0.38 + s.pers.tr.playfulness * 0.2 + (wx === 'sun' || wx === 'harsh' ? 0.15 : 0) + (wx === 'rain' || wx === 'storm' ? 0.2 : 0);
    },
    start(e, s) { s.bs.t = U.rand(8, 20); s.bs.pt = null; s.bs.splT = U.rand(2, 5); },
    update(e, s, dt, it) {
      const iw = inWater(e);
      if (!iw) {
        const w = nearWater(e, s);
        if (!w) return false;
        go(it, w.x, w.y, 0.7);
        return true;
      }
      if (!s.bs.pt || Math.hypot(s.bs.pt[0] - e.x, s.bs.pt[1] - e.y) < 12) {
        const tiles = AI.Env.liquidTilesIn(e.x, e.y, 140).filter((t) => !AI.Env.isDried(t.tx, t.ty));
        const t = tiles.length ? U.pick(tiles) : null;
        s.bs.pt = t ? [t.x, t.y] : [e.x, e.y];
      }
      go(it, s.bs.pt[0], s.bs.pt[1], 0.75);
      s.bs.splT -= dt;
      if (s.bs.splT <= 0) {
        s.bs.splT = U.rand(2.5, 6);
        if (R().Camera.sees(e.x, e.y, 0)) R().FX.burst(e.x, e.y - 4, '#b3defa', 6, 80);
        // splashers soak whoever is close — fire types hate it
        if (s.pers.quirks.has('splasher') || s.pers.tr.playfulness > 0.6) {
          for (const o of s.ctx.near) {
            if (!o.psx || o._d2 > 110 * 110) continue;
            const op = o.psx;
            Mind().feel(op, 'surprise', 0.6); Mind().say(op, 'surprise', 0.8, 2);
            if (op.p.hatesWater) { Mind().feel(op, 'anger', 0.45, e.id); AI.Rel.adjust(op, e.id, { a: -0.15, r: 0.1 }); op.mind.next = { icon: 'anger', at: AI.time + 0.5, dur: 1.6, prio: 2 }; }
            else if (op.pers.tr.playfulness > 0.5) { Mind().feel(op, 'joy', 0.4); AI.Rel.adjust(op, e.id, { a: 0.1, b: 0.05 }); }
            Mind().say(s, 'happy', 1.2, 1);
            break;
          }
        }
      }
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
  });

  add({
    id: 'swim-fail', tier: 8, emotion: (s) => (s.bs.phase === 'panic' ? 'fear' : s.bs.phase === 'out' ? 'embarrassment' : 'curiosity'), minCommit: 4, cd: 90,
    score(e, s) {
      if (s.p.lovesWater || e.flying || s.p.swim > 0.45 || s.p.fish || s.lod > 0) return 0;
      if (s.p.hatesWater && !s.pers.quirks.has('stubborn')) return 0;
      const w = nearWater(e, s, 300);
      if (!w) return 0;
      const tr = s.pers.tr;
      return 0.05 + tr.curiosity * 0.18 + tr.clumsiness * 0.15 + tr.playfulness * 0.1;
    },
    start(e, s) { s.bs.phase = 'go'; s.bs.t = 0; },
    update(e, s, dt, it) {
      const w = nearWater(e, s, 320);
      if (s.bs.phase === 'go') {
        if (!w) return false;
        go(it, w.x, w.y, 0.55);
        if (inWater(e)) { s.bs.phase = 'wade'; s.bs.t = U.rand(0.8, 1.6); Mind().say(s, 'question', 1, 1); }
        return true;
      }
      if (s.bs.phase === 'wade') {
        stay(it); s.vis.sub = 0.35;
        s.bs.t -= dt;
        if (s.bs.t <= 0) { s.bs.phase = 'panic'; s.bs.t = U.rand(1.2, 2.2); Mind().feel(s, 'fear', 0.55); Mind().say(s, 'scared', 1.8, 2); AI.Bus.emit({ type: 'cry', kind: 'help', x: e.x, y: e.y, loud: 200, src: e }); }
        return true;
      }
      if (s.bs.phase === 'panic') {
        s.vis.shake = 2; s.vis.sub = 0.5;
        if (!e.anim.busy()) e.anim.play('Hurt', { speed: 1.6 });
        if (Math.random() < dt * 8 && R().Camera.sees(e.x, e.y, 0)) R().FX.burst(e.x + U.rand(-8, 8), e.y - 6, '#b3defa', 3, 90);
        if (!s.bs.out) s.bs.out = pointNear(e, e.x, e.y, 50, 140, 16);
        if (s.bs.out) go(it, s.bs.out[0], s.bs.out[1], 1.2); else stay(it);
        s.bs.t -= dt;
        if (!inWater(e) || s.bs.t <= -2) {
          s.vis.shake = 0;
          s.bs.phase = 'out'; s.bs.t = U.rand(1.5, 2.5);
          Mind().feel(s, 'embarrassment', 0.6);
          Mind().say(s, s.p.hatesWater ? 'anger' : 'sweat', 1.8, 2);
          if (s.p.hatesWater) Mind().feel(s, 'anger', 0.3);
          witnessesLaugh(e, s);
          // shake off the water
          if (R().Camera.sees(e.x, e.y, 0)) R().FX.burst(e.x, e.y - e.bodyH * 0.5, '#cfe8ff', 10, 110);
        }
        return true;
      }
      stay(it); s.vis.shake = s.bs.t > 1.6 ? 1.5 : 0;
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
    end(e, s) { s.vis.shake = 0; s.vis.sub = 0; },
  });

  add({
    id: 'climb', tier: 8, emotion: (s) => (s.bs.phase === 'fall' ? 'embarrassment' : s.bs.phase === 'perch' ? 'joy' : 'curiosity'), minCommit: 4, cd: 45,
    score(e, s) {
      if (!s.p.climber || s.lod > 0) return 0;
      const t = nearProp(e, s, 'tree', 260);
      if (!t) return 0;
      const tr = s.pers.tr;
      return 0.12 + tr.curiosity * 0.2 + tr.playfulness * 0.18 + (s.pers.quirks.has('climber') ? 0.25 : 0);
    },
    start(e, s) { s.bs.tree = nearProp(e, s, 'tree', 260); s.bs.phase = 'go'; s.bs.h = 0; },
    update(e, s, dt, it) {
      const t = s.bs.tree;
      if (!t) return false;
      if (s.bs.phase === 'go') {
        const tx = t.x, ty = t.y + 8;
        if (Math.hypot(tx - e.x, ty - e.y) > 10) { go(it, tx, ty, 0.6); return true; }
        s.bs.phase = 'up';
      }
      if (s.bs.phase === 'up') {
        stay(it); it.face = -Math.PI / 2; it.anim = 'Walk'; it.animSpeed = 1.3;
        s.bs.h = Math.min(26, s.bs.h + dt * 9);
        s.vis.lift = s.bs.h;
        // slip!
        const slipP = s.pers.tr.clumsiness * 0.45 + (s.p.size > 0 ? 0.2 : 0) - (s.pers.quirks.has('climber') ? 0.25 : 0);
        if (Math.random() < dt * U.clamp(slipP, 0.03, 0.9)) { s.bs.phase = 'fall'; s.bs.t = 0; return true; }
        if (s.bs.h >= 26) { s.bs.phase = 'perch'; s.bs.t = U.rand(3, 7); Mind().feel(s, 'joy', 0.5); Mind().say(s, 'happy', 1.6, 1); }
        return true;
      }
      if (s.bs.phase === 'perch') {
        stay(it); s.vis.lift = 26; it.face = Math.PI / 2;
        s.bs.t -= dt;
        if (s.bs.t <= 0) s.bs.phase = 'down';
        return true;
      }
      if (s.bs.phase === 'down') {
        stay(it);
        s.bs.h = Math.max(0, s.bs.h - dt * 30);
        s.vis.lift = s.bs.h;
        return s.bs.h > 0;
      }
      // falling
      stay(it);
      s.bs.h = Math.max(0, s.bs.h - dt * 90);
      s.vis.lift = s.bs.h;
      s.vis.rot = (s.bs.h > 0 ? 1 : 0.6) * 1.3;
      if (s.bs.h <= 0 && !s.bs.landed) { s.bs.landed = true; slip(e, s); s.bs.t = 1.8; }
      if (s.bs.landed) { s.bs.t -= dt; if (s.bs.t <= 0) return false; }
      return true;
    },
    end(e, s) { s.vis.lift = 0; },
  });

  add({
    id: 'lift-rock', tier: 8, emotion: (s) => (s.bs.ok ? 'excitement' : s.bs.phase === 'strain' ? 'anger' : 'embarrassment'), minCommit: 3, cd: 40,
    score(e, s) {
      const q = s.pers.quirks;
      if (s.lod > 0 || !(q.has('lifter') || q.has('show-off') || s.p.types.includes('fighting'))) return 0;
      return nearProp(e, s, 'rock', 260) ? 0.3 + (q.has('show-off') ? 0.2 : 0) : 0;
    },
    start(e, s) { s.bs.rock = nearProp(e, s, 'rock', 260); s.bs.phase = 'go'; s.bs.t = 0; },
    update(e, s, dt, it) {
      const r = s.bs.rock;
      if (!r || r.hp <= 0) return false;
      if (s.bs.phase === 'go') {
        const tx = r.x + (e.x < r.x ? -1 : 1) * (r.r + e.r * 0.6), ty = r.y + 4;
        if (Math.hypot(tx - e.x, ty - e.y) > 10) { go(it, tx, ty, 0.6); return true; }
        s.bs.phase = 'strain'; s.bs.t = U.rand(1.5, 2.6);
        Mind().say(s, 'anger', 1.4, 1);
      }
      stay(it);
      it.face = Math.atan2(r.y - e.y, r.x - e.x);
      if (s.bs.phase === 'strain') {
        s.vis.shake = 1.2; s.vis.sy = 0.93;
        if (!e.anim.busy()) e.anim.play('Charge', { speed: 0.8 });
        if (Math.random() < dt * 2) R().FX.px(e.x + U.rand(-8, 8), e.y - e.bodyH, '#cfe8ff', { vy: -20, life: 0.4 });
        s.bs.t -= dt;
        if (s.bs.t <= 0) {
          s.vis.shake = 0; s.vis.sy = 1;
          const strength = (s.p.atk || 60) / 140 + (s.pers.quirks.has('lifter') ? 0.15 : 0) + Math.random() * 0.35;
          s.bs.ok = strength > 0.75;
          s.bs.phase = 'done'; s.bs.t = 2.4;
          if (s.bs.ok) { s.vis.carry = 'rock'; Mind().feel(s, 'excitement', 0.6); Mind().say(s, 'sparkle', 2, 2); e.anim.play('Attack', { speed: 0.6 }); }
          else { Mind().feel(s, 'embarrassment', 0.5); Mind().say(s, 'sweat', 2, 2); witnessesLaugh(e, s); }
        }
        return true;
      }
      s.bs.t -= dt;
      if (s.bs.t <= 0 && s.vis.carry) { s.vis.carry = null; R().FX.burst(r.x, r.y - 6, '#a89880', 8, 90); }
      return s.bs.t > 0;
    },
    end(e, s) { s.vis.carry = null; s.vis.shake = 0; s.vis.sy = 1; },
  });

  add({
    id: 'sit-water', tier: 8, emotion: null, minCommit: 10, cd: 20,
    score(e, s) {
      if (!s.pers.quirks.has('water-sitter') && !(s.pers.quirks.has('dazed') && s.p.lovesWater)) return 0;
      return nearWater(e, s, 420) ? 0.55 : 0;
    },
    start(e, s) {
      const w = nearWater(e, s, 420);
      s.bs.w = w;
      s.bs.spot = w ? pointNear(e, w.x, w.y, 30, 60, 16) : null;
      s.bs.t = U.rand(20, 60);
    },
    update(e, s, dt, it) {
      if (!s.bs.spot) return false;
      if (Math.hypot(s.bs.spot[0] - e.x, s.bs.spot[1] - e.y) > 10) { go(it, s.bs.spot[0], s.bs.spot[1], 0.3); return true; }
      stay(it);
      it.face = Math.atan2(s.bs.w.y - e.y, s.bs.w.x - e.x);
      it.anim = 'Idle'; it.animSpeed = 0.3;
      if (Math.random() < dt * 0.05) Mind().say(s, Math.random() < 0.7 ? 'dots' : 'swirl', 2, 0.5);
      // "fishing" with its tail
      if (Math.random() < dt * 0.04 && R().Camera.sees(s.bs.w.x, s.bs.w.y, 0)) R().FX.burst(s.bs.w.x, s.bs.w.y - 2, '#b3defa', 5, 60);
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
  });

  add({
    id: 'headache', tier: 8, emotion: 'confusion', minCommit: 6, cd: 10,
    score(e, s) { return s.pers.quirks.has('headache') ? 0.5 : 0; },
    start(e, s) { s.bs.t = U.rand(8, 16); s.bs.ache = 0; s.bs.pt = null; },
    update(e, s, dt, it) {
      s.bs.ache += dt * U.rand(0.02, 0.09);
      if (!s.bs.pt || Math.random() < dt * 0.3) s.bs.pt = pointNear(e, e.x, e.y, 20, 80) || [e.x, e.y];
      go(it, s.bs.pt[0], s.bs.pt[1], 0.25);
      if (Math.random() < dt * 0.35) {
        // clutch head
        e.anim.play('Hurt', { speed: 0.7 });
        Mind().feel(s, 'confusion', 0.4);
        Mind().say(s, 'swirl', 1.6, 1);
        stay(it);
      }
      if (s.bs.ache > 1) {
        // the headache peaks: an involuntary psychic burst startles everyone around
        s.bs.ache = 0;
        const m = s.combat && s.combat.moves.find((x) => x.id === 'headache') || AI.NpcMoves.slot('headache');
        if (m) AI.NpcMoves.fire(e, s, { m, ang: 0, ax: e.x, ay: e.y, target: null });
        Mind().say(s, 'surprise', 1.2, 2);
      }
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
  });

  add({
    id: 'bask', tier: 8, emotion: 'joy', minCommit: 5, cd: 25,
    score(e, s) {
      const wx = AI.Env.weather();
      if (!s.p.sunLover) return 0;
      return wx === 'sun' || wx === 'harsh' ? 0.5 : s.p.types.includes('grass') ? 0.12 : 0;
    },
    start(e, s) { s.bs.t = U.rand(5, 12); s.bs.spot = pointNear(e, e.x, e.y, 20, 100) || [e.x, e.y]; },
    update(e, s, dt, it) {
      if (Math.hypot(s.bs.spot[0] - e.x, s.bs.spot[1] - e.y) > 10) { go(it, s.bs.spot[0], s.bs.spot[1], 0.4); return true; }
      stay(it); it.face = -Math.PI / 2; it.anim = 'Idle'; it.animSpeed = 0.6;
      if (Math.random() < dt * 0.4) R().FX.twinkle(e.x + U.rand(-e.r, e.r), e.y - U.rand(4, e.bodyH));
      Mind().feel(s, 'joy', dt * 0.05);
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
  });

  add({
    id: 'warmth', tier: 8, emotion: (s) => (s.bs.found ? 'joy' : 'sadness'), minCommit: 5, cd: 15,
    score(e, s) {
      if (!s.pers.quirks.has('warmth-seeker') && !s.p.types.includes('fire')) return 0;
      const wx = AI.Env.weather();
      const cold = wx === 'rain' || wx === 'storm' || wx === 'snow' || wx === 'hail' || AI.Env.liquidKind() === 'ice';
      return cold ? 0.65 : 0;
    },
    start(e, s) {
      // a fellow fire type or a tree canopy to shelter under
      let best = null;
      for (const o of s.ctx.near) if (o.psx && o.types && o.types.includes('fire')) { best = o; break; }
      const tree = nearProp(e, s, 'tree', 300);
      s.bs.to = best || tree;
      s.bs.t = U.rand(6, 14);
      Mind().say(s, 'tear', 1.4, 1);
    },
    update(e, s, dt, it) {
      const to = s.bs.to;
      if (!to || to.dead) { stay(it); s.vis.shake = 0.8; s.bs.t -= dt; return s.bs.t > 0; }
      const d = Math.hypot(to.x - e.x, to.y + (to.type === 'tree' ? 12 : 0) - e.y);
      if (d > 30) { go(it, to.x, to.y + (to.type === 'tree' ? 12 : 0), 0.6); s.vis.shake = 0.6; return true; }
      stay(it); s.vis.shake = 0;
      if (!s.bs.found) { s.bs.found = true; Mind().say(s, 'happy', 1.4, 1); }
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
    end(e, s) { s.vis.shake = 0; },
  });

  add({
    id: 'dance', tier: 8, emotion: 'excitement', minCommit: 3, cd: 20,
    score(e, s) {
      const em = s.mind.emo;
      return (em.joy > 0.55 || em.excitement > 0.5 || s.pers.quirks.has('dancer') || s.pers.quirks.has('singer') || s.pers.quirks.has('cheer')) ? 0.2 + em.joy * 0.4 + em.excitement * 0.4 : 0;
    },
    start(e, s) { s.bs.t = U.rand(2.5, 5); s.bs.hopT = 0; Mind().say(s, 'note', 1.8, 1); },
    update(e, s, dt, it) {
      stay(it);
      s.bs.hopT -= dt;
      if (s.bs.hopT <= 0) { s.bs.hopT = U.rand(0.35, 0.6); s.vis.hop = 0.28; it.face = Math.random() * 6.283; }
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
  });

  add({
    id: 'fly-attempt', tier: 8, emotion: (s) => (s.bs.phase === 'fall' ? 'embarrassment' : 'excitement'), minCommit: 4, cd: 35,
    score(e, s) { return s.pers.quirks.has('wannabe-flyer') && s.lod === 0 ? 0.45 : 0; },
    start(e, s) { s.bs.phase = 'run'; s.bs.t = 1.2; s.bs.a = Math.random() * 6.283; s.bs.h = 0; },
    update(e, s, dt, it) {
      if (s.bs.phase === 'run') {
        go(it, e.x + Math.cos(s.bs.a) * 80, e.y + Math.sin(s.bs.a) * 60, 1.25);
        s.bs.t -= dt;
        if (s.bs.t <= 0) { s.bs.phase = 'air'; s.bs.v = 120; Mind().say(s, 'sparkle', 1.2, 1); }
        return true;
      }
      if (s.bs.phase === 'air') {
        it.custom = { dx: Math.cos(s.bs.a) * 90 * dt, dy: Math.sin(s.bs.a) * 70 * dt };
        s.bs.v -= dt * 320;
        s.bs.h = Math.max(0, s.bs.h + s.bs.v * dt);
        s.vis.lift = s.bs.h;
        if (s.bs.h <= 0 && s.bs.v < 0) { s.bs.phase = 'fall'; s.bs.t = 2; slip(e, s); }
        return true;
      }
      stay(it);
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
    end(e, s) { s.vis.lift = 0; },
  });

  add({
    id: 'tree-mimic', tier: 8, emotion: null, minCommit: 8, cd: 10,
    score(e, s) { return s.pers.quirks.has('tree-mimic') && nearProp(e, s, 'tree', 300) ? 0.6 : 0; },
    start(e, s) { const t = nearProp(e, s, 'tree', 300); s.bs.spot = t ? [t.x + 26, t.y + 4] : [e.x, e.y]; s.bs.t = U.rand(15, 40); },
    update(e, s, dt, it) {
      if (Math.hypot(s.bs.spot[0] - e.x, s.bs.spot[1] - e.y) > 10) { go(it, s.bs.spot[0], s.bs.spot[1], 0.5); return true; }
      stay(it); it.face = Math.PI / 2; it.anim = 'Idle'; it.animSpeed = 0.01; // perfectly still… it's a tree. Definitely a tree.
      s.bs.t -= dt;
      return s.bs.t > 0 && s.ctx.pd > 60;
    },
  });

  add({
    id: 'perch', tier: 8, emotion: null, minCommit: 5, cd: 20,
    score(e, s) { return e.flying && s.lod === 0 && nearProp(e, s, 'tree', 300) ? 0.3 : 0; },
    start(e, s) { const t = nearProp(e, s, 'tree', 300); s.bs.t = U.rand(5, 12); s.bs.tree = t; },
    update(e, s, dt, it) {
      const t = s.bs.tree;
      if (!t) return false;
      if (Math.hypot(t.x - e.x, t.y - 2 - e.y) > 8) { go(it, t.x, t.y - 2, 0.6); return true; }
      stay(it); s.vis.lift = 30; it.face = Math.random() < dt ? Math.random() * 6.283 : it.face;
      s.bs.t -= dt;
      return s.bs.t > 0;
    },
    end(e, s) { s.vis.lift = 0; },
  });

  add({
    id: 'return-home', tier: 8, emotion: null, minCommit: 2,
    score(e, s) {
      if (s.pers.temp !== 'territorial' && s.pers.temp !== 'protective') return 0;
      const d = Math.hypot(s.home.x - e.x, s.home.y - e.y);
      return d > s.home.r * 1.4 ? 0.5 + Math.min(0.5, d / 1000) : 0;
    },
    update(e, s, dt, it) {
      go(it, s.home.x, s.home.y, 0.6);
      return Math.hypot(s.home.x - e.x, s.home.y - e.y) > s.home.r * 0.6;
    },
  });

  AI.define('Behaviors', { LIST, BY, TIER_BASE, add, go, stay, pointNear, escapePoint, walkable, slip, animReset, witnessesLaugh, nearWater, nearProp, inWater, threatPos });
})();
