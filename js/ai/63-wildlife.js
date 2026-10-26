/* PokéSurvivor+ — Living World AI · wildlife: Pokémon that live in the trees
 * The Shady Forest's bug and bird Pokémon live where their biology says they should:
 *
 *   cocoons    Metapod, Kakuna, Silcoon, Cascoon: fixed to a tree trunk or hanging among the
 *              leaves, completely still. They twitch now and then, Harden when something comes
 *              too close or hits them, and never walk anywhere (and never hurt you by touch).
 *   crawlers   Caterpie, Weedle, Wurmple: crawl slowly to a tree, pause at its foot, climb the
 *              trunk (you can watch them go up), feed among the leaves, rest, sometimes move
 *              along the branch, and eventually climb down and crawl to another tree. Something
 *              coming close makes them freeze and watch; timid ones climb higher out of reach.
 *   perchers   Pidgey, Hoothoot, Starly, Murkrow and kin: sit up in the canopy, look around, drop
 *              down to forage and fly back up, and take off when disturbed.
 *   web        Spinarak rests motionless on a trunk by its web in the day and hunts at night.
 *   hidden     Oddish settles half-buried among the grass in daylight.
 *
 * Trees are homes: whether a tree has residents depends only on the world's seed, so a tree that
 * had a Metapod when you passed has it again when you come back (unless you defeated it). Residents
 * appear just out of sight and leave the same way, never in front of you; the game's habit of
 * moving far-away Pokémon ahead of the player doesn't apply to them.
 *
 * Height: a Pokémon up a tree keeps its place on the ground (at the trunk's foot, so it sorts in
 * front of the tree) and is drawn lifted up the trunk or into the canopy, without a ground shadow.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const COCOON = new Set([11, 14, 266, 268]);
  const CRAWLER = new Set([10, 13, 265]);
  const PERCHER = new Set([16, 17, 163, 164, 396, 397, 21, 198, 165]);
  const WEB = new Set([167]);
  const HIDDEN = new Set([43]);
  function kindOf(dex) {
    return COCOON.has(dex) ? 'cocoon' : CRAWLER.has(dex) ? 'crawler' : PERCHER.has(dex) ? 'percher' : WEB.has(dex) ? 'web' : HIDDEN.has(dex) ? 'hidden' : null;
  }
  function on() { try { return AI.enabled && AI.cfg.wildlife !== false && AI.cfg.newArt !== false && AI.R.World.biome === 0 && !(AI.Mansion && AI.Mansion.inside); } catch (e) { return false; } }
  const B = () => AI.Behaviors;
  const M = () => AI.Mind;
  const Sky = () => AI.Sky;
  const day = () => !Sky() || Sky().darkness() < 0.5;

  // ---------------------------------------------------------------- trees
  function treeH(t) {
    const n = t._psxArt;
    if (n && AI.Art && AI.Art.ready) return AI.Art.size(n)[1] * (t._psxScale || 1);
    return 90;
  }
  // heights on a tree: the trunk (climbing, clinging) and the canopy (feeding, perching, hanging)
  const trunkTop = (t) => Math.max(18, treeH(t) * 0.36);
  const canopyLow = (t) => Math.max(30, treeH(t) * 0.48);
  const canopyHigh = (t) => Math.max(40, treeH(t) * 0.7);
  function treesNear(x, y, r) {
    try { return AI.Env.treesIn(x, y, r); } catch (e) { return []; }
  }
  const treeKey = (t) => t.tx + ',' + t.ty;
  function occupied(t) { return residents.has(treeKey(t)) || claims.has(treeKey(t)); }
  const claims = new Map(); // tree → the roaming crawler/percher using it

  // the anchor point of a Pokémon on a tree (on the ground, at the foot of the trunk)
  function anchorOn(t, e) {
    const side = U.hash(t.tx, t.ty, 77) < 0.5 ? -1 : 1;
    return [t.x + side * 3, t.y + 2];
  }

  // ---------------------------------------------------------------- the behaviours
  function perchOf(s) { return s.vis.perch || 0; }
  function setPerch(s, v) { s.vis.perch = Math.max(0, v); }
  function face(e, it, ang) { it.face = ang; }

  // cocoons: still. Always. (top priority: nothing makes them walk)
  B().add({
    id: 'cocoon', tier: 0, emotion: null, minCommit: 9999,
    score(e, s) { return s.eco && s.eco.kind === 'cocoon' ? 1 : 0; },
    start(e, s) { s.bs.twitch = U.rand(4, 12); s.bs.harden = 0; },
    update(e, s, dt, it) {
      const eco = s.eco;
      B().stay(it);
      e.touchCd = Math.max(e.touchCd || 0, 0.5);
      if (eco.anchor) { e.x = eco.anchor[0]; e.y = eco.anchor[1]; }
      setPerch(s, eco.lift);
      s.vis.alpha = eco.hidden ? 0.88 : 1;
      // a twitch now and then
      s.bs.twitch -= dt;
      if (s.bs.twitch <= 0) { s.bs.twitch = U.rand(5, 14); s.vis.rot = U.rand(-0.08, 0.08); s.vis.rotT = 0.25; }
      // Harden: when something comes close, or hits it
      const hurt = s.bs.hp0 != null && e.hp < s.bs.hp0 - 0.5;
      s.bs.hp0 = e.hp;
      const near = s.ctx.pd < 90 || (s.ctx.threat && Math.hypot(s.ctx.threat.x - e.x, s.ctx.threat.y - e.y) < 90);
      s.bs.harden -= dt;
      if ((hurt || near) && s.bs.harden <= 0) {
        s.bs.harden = 4;
        s.buff = { until: AI.time + 4, atk: 1, spd: 1, def: 0.55 };
        try { AI.R.FX.ring(e.x, e.y - eco.lift - e.bodyH * 0.5, e.r * 0.6, e.r * 1.6, '#d8e0ea', 0.3, 2); } catch (err) { /* ignore */ }
        s.vis.shake = 1.2;
        setTimeout(() => { s.vis.shake = 0; }, 260);
        AI.Bus.emit({ type: 'wildlife', what: 'harden', x: e.x, y: e.y, loud: 0, e });
      }
      return true;
    },
  });

  // crawlers: to a tree, up the trunk, into the leaves to feed, rest, and down again
  B().add({
    id: 'climb', tier: 6, emotion: null, minCommit: 6,
    score(e, s, c) {
      if (!s.eco || s.eco.kind !== 'crawler' || s.inCombat || c.threatV > 0.35) return 0;
      return 0.9;
    },
    start(e, s) {
      const eco = s.eco;
      let t = eco.tree;
      if (!t || eco.leaveTree) {
        const list = treesNear(e.x, e.y, 320).filter((q) => !occupied(q) || claims.get(treeKey(q)) === e).sort((a, b) => U.dist2(a.x, a.y, e.x, e.y) - U.dist2(b.x, b.y, e.x, e.y));
        t = list[eco.leaveTree ? Math.min(list.length - 1, 1 + ((Math.random() * 2) | 0)) : 0] || null;
        eco.leaveTree = false;
      }
      if (!t) return false;
      if (eco.tree && eco.tree !== t) claims.delete(treeKey(eco.tree));
      eco.tree = t; claims.set(treeKey(t), e);
      eco.anchor = anchorOn(t, e);
      s.bs.phase = perchOf(s) > 4 ? 'feed' : 'approach';
      s.bs.t = 0;
      s.bs.feed = U.rand(14, 40);
    },
    update(e, s, dt, it) {
      const eco = s.eco, t = eco.tree, bs = s.bs;
      bs.t += dt;
      const [ax, ay] = eco.anchor;
      const watcher = s.ctx.pd < 150 && s.ctx.pSeen;
      if (bs.phase === 'approach') {
        const d = Math.hypot(ax - e.x, ay - e.y);
        if (d > Math.max(34, (t.r || 14) + (e.r || 12) + 6)) { B().go(it, ax, ay, 0.32); return true; } // (a colossal trunk is wider: the bark starts further out)
        // the last stretch is onto the bark itself, so the trunk doesn't hold it back
        if (d > 2) {
          s.vis.trunk = true; B().stay(it);
          const k = Math.min(1, (e.spd || 60) * 0.32 * dt / d);
          e.x += (ax - e.x) * k; e.y += (ay - e.y) * k;
          e.anim.loop('Walk', 0.6);
          return true;
        }
        bs.phase = 'pause'; bs.t = 0;
        AI.Bus.emit({ type: 'wildlife', what: 'climb', x: e.x, y: e.y, loud: 0, e });
      }
      if (bs.phase !== 'approach') { e.x = ax; e.y = ay; B().stay(it); }
      if (bs.phase === 'pause') {
        face(e, it, -Math.PI / 2);
        if (bs.t > 1.1) { bs.phase = 'up'; bs.t = 0; }
        return true;
      }
      // something's coming: freeze and watch (timid ones climb on, higher, out of reach)
      if (watcher && bs.phase !== 'down') {
        if (!bs.froze) { bs.froze = true; M().say(s, s.pers.temp === 'timid' ? 'scared' : 'eyes', 1.3, 1); }
        if (s.pers.temp !== 'timid' || perchOf(s) >= canopyHigh(t)) { face(e, it, Math.atan2(s.ctx.player.y - e.y, s.ctx.player.x - e.x)); return true; }
      } else bs.froze = false;
      const climbV = 11 + s.pers.tr.energy * 6;
      if (bs.phase === 'up') {
        face(e, it, -Math.PI / 2);
        setPerch(s, perchOf(s) + climbV * dt);
        e.anim.loop('Walk', 0.6);
        if (perchOf(s) >= canopyLow(t)) { bs.phase = 'feed'; bs.t = 0; AI.Bus.emit({ type: 'wildlife', what: 'treetop', x: e.x, y: e.y, loud: 0, e }); }
        return true;
      }
      if (bs.phase === 'feed') {
        // nibbling the leaves; moving a little along the branch now and then
        if (Math.random() < dt * 0.35) { it.face = Math.random() < 0.5 ? 0 : Math.PI; }
        if (Math.random() < dt * 1.2) { try { AI.R.FX.px(e.x + U.rand(-8, 8), e.y - perchOf(s) - 6, '#4c9a3f', { vy: 18, life: 0.7 }); } catch (err) { /* ignore */ } }
        if (bs.t > 2 && !bs.fed) { bs.fed = true; AI.Bus.emit({ type: 'wildlife', what: 'feed', x: e.x, y: e.y, loud: 0, e }); }
        s.vis.alpha = 0.92;
        if (!day() || s.mind.needs.energy < 0.2) { bs.phase = 'rest'; bs.t = 0; }
        else if (bs.t > bs.feed) { bs.phase = Math.random() < 0.6 ? 'rest' : 'down'; bs.t = 0; }
        return true;
      }
      if (bs.phase === 'rest') {
        s.vis.alpha = 0.85; // tucked in under the leaves
        if (day() && bs.t > U.rand(18, 50)) { bs.phase = Math.random() < 0.5 ? 'feed' : 'down'; bs.t = 0; }
        return true;
      }
      if (bs.phase === 'down') {
        face(e, it, Math.PI / 2);
        setPerch(s, perchOf(s) - climbV * 1.2 * dt);
        e.anim.loop('Walk', 0.6);
        if (perchOf(s) <= 0) { eco.leaveTree = true; claims.delete(treeKey(t)); s.vis.trunk = false; return false; }
        return true;
      }
      return true;
    },
    end(e, s) { s.vis.alpha = null; if (perchOf(s) <= 0) s.vis.trunk = false; },
  });

  // perchers: up in the canopy; down to forage; back up
  B().add({
    id: 'perch', tier: 6, emotion: null, minCommit: 5,
    score(e, s, c) {
      if (!s.eco || s.eco.kind !== 'percher' || s.inCombat || c.threatV > 0.4) return 0;
      const active = AI.Areas ? AI.Areas.active(e.dex) : 'any';
      return active === 'night' && day() ? 1.1 : 0.85;
    },
    start(e, s) {
      const eco = s.eco;
      if (!eco.tree) {
        const t = treesNear(e.x, e.y, 360).filter((q) => !occupied(q)).sort((a, b) => U.dist2(a.x, a.y, e.x, e.y) - U.dist2(b.x, b.y, e.x, e.y))[0];
        if (!t) return false;
        eco.tree = t; claims.set(treeKey(t), e);
        eco.anchor = anchorOn(t, e);
        eco.lift = U.rand(canopyLow(t), canopyHigh(t));
      }
      s.bs.phase = perchOf(s) >= eco.lift - 2 ? 'sit' : 'fly-up';
      s.bs.t = 0;
    },
    update(e, s, dt, it) {
      const eco = s.eco, bs = s.bs;
      bs.t += dt;
      const [ax, ay] = eco.anchor;
      if (bs.phase === 'fly-up') {
        if (Math.hypot(ax - e.x, ay - e.y) > 8) { B().go(it, ax, ay, 0.8); setPerch(s, perchOf(s) + 40 * dt); return true; }
        e.x = ax; e.y = ay; B().stay(it);
        setPerch(s, Math.min(eco.lift, perchOf(s) + 70 * dt));
        if (perchOf(s) >= eco.lift) { bs.phase = 'sit'; bs.t = 0; AI.Bus.emit({ type: 'wildlife', what: 'perch', x: e.x, y: e.y, loud: 0, e }); }
        return true;
      }
      if (bs.phase === 'sit') {
        e.x = ax; e.y = ay; B().stay(it);
        setPerch(s, eco.lift);
        if (bs.look == null || bs.t > bs.look) { bs.look = bs.t + U.rand(1.5, 4); it.face = Math.random() * 6.283; bs.face = it.face; } else it.face = bs.face;
        // the party below gets a look
        if (s.ctx.pd < 220 && s.ctx.pSeen && Math.random() < dt * 0.5) it.face = Math.atan2(s.ctx.player.y - e.y, s.ctx.player.x - e.x);
        const active = AI.Areas ? AI.Areas.active(e.dex) : 'any';
        const awakeNow = active === 'night' ? !day() : active === 'day' ? day() : true;
        if (awakeNow && bs.t > U.rand(20, 45) && Math.random() < dt * 0.2) { bs.phase = 'forage'; bs.t = 0; bs.spot = B().pointNear(e, ax, ay + 40, 40, 140); }
        return true;
      }
      if (bs.phase === 'forage') {
        // down to the ground for a while
        setPerch(s, perchOf(s) - 60 * dt);
        if (bs.spot && perchOf(s) <= 0) {
          if (Math.hypot(bs.spot[0] - e.x, bs.spot[1] - e.y) > 8) B().go(it, bs.spot[0], bs.spot[1], 0.45);
          else { B().stay(it); if (Math.random() < dt * 0.8) s.vis.hop = 0.3; }
        } else B().stay(it);
        if (bs.t > U.rand(8, 16)) { bs.phase = 'fly-up'; bs.t = 0; }
        return true;
      }
      return true;
    },
  });

  // Spinarak by its web: still on the trunk by day, off hunting at night
  B().add({
    id: 'web', tier: 6, emotion: null, minCommit: 8,
    score(e, s, c) { return s.eco && s.eco.kind === 'web' && day() && !s.inCombat && c.threatV < 0.4 ? 0.95 : 0; },
    update(e, s, dt, it) {
      const eco = s.eco;
      if (!eco.anchor) return false;
      if (perchOf(s) <= 0 && Math.hypot(eco.anchor[0] - e.x, eco.anchor[1] - e.y) > 8) { B().go(it, eco.anchor[0], eco.anchor[1], 0.4); return true; }
      e.x = eco.anchor[0]; e.y = eco.anchor[1]; B().stay(it);
      setPerch(s, Math.min(eco.lift, perchOf(s) + 12 * dt));
      it.face = Math.PI / 2;
      return true;
    },
  });

  // Oddish: half-buried among the grass in daylight
  B().add({
    id: 'nestle', tier: 6, emotion: null, minCommit: 10,
    score(e, s, c) { return s.eco && s.eco.kind === 'hidden' && day() && !s.inCombat && c.threatV < 0.3 ? 0.9 : 0; },
    start(e, s) { s.bs.k = 0; },
    update(e, s, dt, it) {
      B().stay(it);
      s.bs.k = Math.min(0.5, s.bs.k + dt * 0.4);
      s.vis.subNow = s.bs.k;
      if (s.ctx.pd < 110 && s.ctx.pSeen) { it.face = Math.atan2(s.ctx.player.y - e.y, s.ctx.player.x - e.x); if (Math.random() < dt) M().say(s, 'eyes', 1, 1); }
      return true;
    },
    end(e, s) { s.vis.subNow = 0; },
  });

  // ---------------------------------------------------------------- when a tree-dweller stops climbing
  // (it doesn't snap to the ground: it climbs down, or a bird flies off)
  function settle(e, s, dt) {
    if (s.eco && s.eco.kind === 'cocoon') return; // cocoons stay exactly where they are
    const p = perchOf(s);
    const id = s.beh && s.beh.id;
    if (p <= 0) { if (s.descending) { s.lock = null; s.descending = false; } if (id !== 'climb') s.vis.trunk = false; return; }
    if (id === 'cocoon' || id === 'climb' || id === 'perch' || id === 'web') return;
    const flyer = s.eco ? s.eco.kind === 'percher' : !!e.flying;
    if (flyer) { setPerch(s, p - 45 * dt); return; } // flying off and down
    // climbing down first, then whatever it was going to do
    setPerch(s, p - (s.inCombat || s.ctx.threatV > 0.35 ? 70 : 20) * dt);
    if (!s.lock && s.eco && s.eco.anchor) {
      s.descending = true;
      const a = s.eco.anchor;
      s.lock = { update(e2, s2, dt2, it) { e2.x = a[0]; e2.y = a[1]; B().stay(it); return perchOf(s2) > 0; } };
    }
  }

  // ---------------------------------------------------------------- residents: who lives in which tree
  const residents = new Map(); // tree key → enemy
  const gone = new Set(); // tree keys whose resident was defeated this run
  let scanT = 0;
  function residentFor(t) {
    const sd = AI.Decor ? AI.Decor.seed : 1;
    const h = U.hash(t.tx * 7 + sd, t.ty * 13 - sd, 6363);
    const r = AI.Forest ? AI.Forest.region(t.x, t.y) : { grove: 0, deep: 0, clear: 0, wet: 0 };
    if (AI.Journey && AI.Journey.nearK(t.x, t.y) > 0.4) return null; // the woods near the mansion are empty
    const lush = 0.5 + r.grove * 0.6 + r.deep * 0.3 - r.clear * 0.3;
    const pick = (list, salt) => list[(U.hash(t.tx, t.ty, salt) * list.length) | 0];
    if (h < 0.022 * lush) return { dex: pick([11, 14, 266, 268, 11, 14], 6364), kind: 'cocoon' };
    if (h < 0.04 * lush) return { dex: pick([10, 13, 265], 6365), kind: 'crawler' };
    if (h < 0.058) return { dex: day() ? pick([16, 16, 396, 165], 6366) : pick([163, 163, 198], 6367), kind: 'percher' };
    if (h < 0.064 && r.grove + r.deep > 0.4) return { dex: 167, kind: 'web' };
    return null;
  }
  function tierIndex() { const t = AI.R.Game.time || 0; return [0, 70, 160, 260, 380, 500].filter((s) => t >= s).length - 1; }
  function spawnResident(t, spec) {
    const R = AI.R;
    const d = R.DEX_BY[spec.dex];
    if (!d || !R.SPRITE_META[spec.dex] || !AI.Areas || !AI.Areas.defFor) return null;
    const T = R.Enemies.TIERS, ti = Math.max(0, Math.min(tierIndex(), T.length - 1));
    const def = AI.Areas.defFor(d, T[ti], ti);
    if (spec.kind === 'cocoon') { def.behavior = 'chase'; def.dmg = 1; def.spd = Math.round(def.spd * 0.2); }
    const a = anchorOn(t);
    let sc = { hp: 1, spd: 1, dmg: 1 };
    try { sc = R.Maps.sc(R.Enemies.scale(R.Game.time || 0)); } catch (e) { /* ignore */ }
    const e = new R.Enemy(def, a[0], a[1], sc);
    e.psxResident = treeKey(t);
    e.psxEco = { kind: spec.kind, tree: t, anchor: a };
    R.EnemyMgr.add(e);
    if (!R.EnemyMgr.all().includes(e)) return null;
    residents.set(treeKey(t), e);
    return e;
  }
  function residentCount() { let n = 0; for (const e of residents.values()) if (!e.dead) n++; return n; }
  function scan(dt) {
    scanT -= dt;
    if (scanT > 0) return;
    scanT = 0.6;
    const R = AI.R;
    const p = R.Game.player, cam = R.Camera;
    if (!p) return;
    // the ones that left or were defeated
    for (const [k, e] of residents) {
      const alive = R.EnemyMgr.get(e.id) === e && !e.dead;
      if (!alive) { if (e.dead || e.hp <= 0) gone.add(k); residents.delete(k); continue; }
      // far away and out of sight: back home, out of the simulation
      const far = !AI.players.some((q) => Math.hypot(q.x - e.x, q.y - e.y) < 1500);
      if (far && !cam.sees(e.x, e.y, 120) && !(e.psx && e.psx.inCombat)) { try { AI.EnvBeh.removeNpc(e); } catch (err) { e.dead = true; } residents.delete(k); }
    }
    if (residentCount() >= (AI.cfg.maxResidents || 10)) return;
    // trees just out of sight that have residents
    const ring = Math.max(cam.w, cam.h) * 0.62;
    for (const t of treesNear(p.x, p.y, ring + 420)) {
      const k = treeKey(t);
      if (residents.has(k) || gone.has(k) || claims.has(k)) continue;
      if (cam.sees(t.x, t.y - 40, 60)) continue; // never in front of you
      const spec = residentFor(t);
      if (!spec) continue;
      if (spec.kind === 'crawler' && !day() && Math.random() < 0.5) spec.kind = 'crawler'; // (they sleep up there at night)
      spawnResident(t, spec);
      if (residentCount() >= (AI.cfg.maxResidents || 10)) break;
    }
  }

  // ---------------------------------------------------------------- hooks
  // a new wild Pokémon: what kind of tree-dweller is it, and where does it start?
  function onInit(e, s) {
    const kind = kindOf(e.dex);
    if (!kind || !on()) return;
    const eco = e.psxEco || { kind };
    s.eco = eco;
    if (kind === 'cocoon') {
      // a roaming cocoon makes no sense: fix it to the nearest free tree, or it doesn't stay
      if (!eco.tree) {
        const t = treesNear(e.x, e.y, 500).filter((q) => !occupied(q)).sort((a, b) => U.dist2(a.x, a.y, e.x, e.y) - U.dist2(b.x, b.y, e.x, e.y))[0];
        if (t) { eco.tree = t; claims.set(treeKey(t), e); }
      }
      if (eco.tree) {
        const t = eco.tree;
        eco.anchor = anchorOn(t);
        const onTrunk = U.hash(t.tx, t.ty, 81) < 0.45;
        eco.lift = onTrunk ? U.rand(trunkTop(t) * 0.45, trunkTop(t)) : U.rand(canopyLow(t), canopyHigh(t));
        eco.hidden = !onTrunk;
        e.x = eco.anchor[0]; e.y = eco.anchor[1];
        setPerch(s, eco.lift);
      }
    } else if (kind === 'crawler' && eco.tree) {
      // a resident crawler starts up in its tree
      const t = eco.tree;
      claims.set(treeKey(t), e);
      setPerch(s, U.rand(canopyLow(t), canopyHigh(t)));
    } else if (kind === 'percher' && eco.tree) {
      const t = eco.tree;
      claims.set(treeKey(t), e);
      eco.lift = U.rand(canopyLow(t), canopyHigh(t));
      setPerch(s, eco.lift);
    } else if (kind === 'web') {
      const t = eco.tree || treesNear(e.x, e.y, 400).filter((q) => !occupied(q))[0];
      if (t) {
        eco.tree = t; claims.set(treeKey(t), e);
        eco.anchor = anchorOn(t);
        eco.lift = U.rand(12, trunkTop(t));
        if (AI.Decor && !eco.web) { eco.web = true; AI.Decor.addDyn({ k: 'litter', n: U.hash(t.tx, t.ty, 5) < 0.5 ? 'm_web_a' : 'm_web_b', x: t.x + 14, y: t.y + 3, s: 0.5, flat: true }); }
        setPerch(s, eco.lift);
      }
    }
    // straight into its own way of life (not a moment of generic idling first)
    const beh = { cocoon: 'cocoon', crawler: 'climb', percher: 'perch', web: 'web', hidden: 'nestle' }[kind];
    if (beh && AI.Behaviors.BY[beh] && AI.Brain && AI.Brain.switchTo) {
      if (kind !== 'web' && kind !== 'hidden' || day()) AI.Brain.switchTo(e, s, AI.Behaviors.BY[beh]);
    }
  }
  // a cocoon with nowhere to cling doesn't spawn at all
  function spawnOk(e) {
    if (!on() || !COCOON.has(e.dex) || e.psxResident || e.psxPlaced || e.psxStory) return true;
    return treesNear(e.x, e.y, 500).some((q) => !occupied(q));
  }
  // evolving changes what it is: a Caterpie that evolves up a tree becomes a Metapod clinging right
  // there; a Metapod that evolves into Butterfree flies off
  function onEvolve(e, s) {
    const kind = kindOf(e.dex);
    const p = perchOf(s);
    if (kind === 'cocoon') {
      const t = s.eco && s.eco.tree;
      s.eco = { kind, tree: t, anchor: [e.x, e.y], lift: p, hidden: t ? p > trunkTop(t) : false };
    } else if (!kind) {
      if (s.eco && s.eco.tree) claims.delete(treeKey(s.eco.tree));
      s.eco = null;
    } else if (s.eco) s.eco.kind = kind;
    s.thinkT = 0;
  }
  function tick(dt) {
    if (!on()) return;
    scan(dt);
    for (const e of AI.R.EnemyMgr.all()) { const s = e.psx; if (s && (s.eco || s.vis.perch > 0)) settle(e, s, dt); }
    for (const [k, e] of claims) if (e.dead || AI.R.EnemyMgr.get(e.id) !== e) claims.delete(k);
  }
  function perched(e) { return !!(e && e.psx && e.psx.vis.perch > 2); }
  function reset() { residents.clear(); gone.clear(); claims.clear(); scanT = 0; }

  AI.define('Wildlife', { COCOON, CRAWLER, PERCHER, kindOf, onInit, onEvolve, spawnOk, tick, reset, perched, residents, gone, claims, treesNear, residentFor, spawnResident });
})();
