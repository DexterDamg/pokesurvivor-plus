/* PokéSurvivor+ — Living World AI · brain
 * Per-NPC state, think scheduling (level-of-detail), stance toward the player, fight-target
 * selection, territory, priority-tiered behavior selection with commitment & cooldowns, and
 * the executor that drives the original enemy physics (collisions, liquids, status effects,
 * knockback, animation) with a virtual steering target.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const COMBAT_BEH = new Set(['fight', 'defend', 'retaliate', 'hunt', 'territory', 'retreat']);
  const INIT_A = { friendly: 0.45, playful: 0.3, neutral: 0, timid: -0.05, territorial: 0, protective: 0.1, opportunistic: -0.1, aggressive: -0.55 };

  function eligible(e) {
    return !(e.remote || e.boss || e.legend || e.judge || e.arceus || e.dummy || e.elite || e.behavior === 'thief' || e.behavior === 'remote');
  }

  // ---------------------------------------------------------------- init
  function init(e) {
    const S = AI.Species;
    const parent = e.psxParent && e.psxParent.psx ? e.psxParent : null;
    const memo = !parent && !e.psxHorde ? AI.Memory.recall(e.dex) : null;
    const seed = memo ? memo.seed : (Math.random() * 4294967296) >>> 0;
    let forceTemp = memo ? memo.temp : null;
    if (parent) forceTemp = parent.psx.pers.temp;
    if (e.psxHorde && AI.Social) forceTemp = AI.Social.hordeTemp(e.psxHorde) || forceTemp;
    if (e.psxForceTemp) forceTemp = e.psxForceTemp;
    const s = {
      e, p: S.profile(e.dex),
      pers: S.roll(e, seed, forceTemp),
      rel: new Map(),
      home: { x: e.x, y: e.y, r: 300 },
      ctx: { near: [], player: null, pd: Infinity, pSeen: false, pLastSeen: -99, pLastX: 0, pLastY: 0, losT: -9, losOk: true, threat: null, threatV: 0 },
      vis: { lift: 0, rot: 0, rotT: 0, sx: 1, sy: 1, shake: 0, sub: 0, hop: 0, alpha: 1, tears: 0, carry: null, glow: 0, yawn: 0 },
      it: {}, cd: {}, bs: {}, beh: null, behT: 0, commit: 0,
      baseSpd: e.spd, thinkT: Math.random() * 0.3, acc: 0, lod: 1, lastEv: AI.Bus.head,
      stance: 'neutral', px: e.x, py: e.y, vx: 0, vy: 0, born: AI.time, exp: 0,
    };
    e.psx = s;
    s.mind = AI.Mind.create(s.pers);
    s.home.r = s.pers.temp === 'territorial' ? U.rand(150, 230) : U.rand(260, 420);
    if (s.pers.temp === 'territorial') s.territory = { intruder: null, intr: 0, habit: 0 };
    const rp = AI.Rel.get(s, 'P');
    rp.a = INIT_A[s.pers.temp] || 0;
    if (s.pers.temp === 'aggressive') rp.g = 0.2;
    if (s.pers.temp === 'timid') rp.f = 0.25;
    if (memo && memo.rp) { Object.assign(rp, memo.rp); s.returning = true; s.nick = memo.nick; s.evolvedFrom = memo.evolvedFrom; }
    if (parent) {
      s.group = parent.psx.group || (AI.Social ? AI.Social.newGroup(parent) : null);
      AI.Rel.adjust(s, parent.id, { b: 0.8, a: 0.6 });
      AI.Rel.adjust(parent.psx, e.id, { b: 0.6, a: 0.5 });
      Object.assign(rp, parent.psx.rel.get('P') || {});
    }
    if (e.psxHorde && AI.Social) AI.Social.joinHorde(e, e.psxHorde);
    AI.Combat.init(e, s);
    switchTo(e, s, AI.Behaviors.BY.idle);
    if (s.returning) AI.Mind.say(s, rp.a > 0.3 ? 'love' : rp.g > 0.3 ? 'anger' : 'surprise', 2.2, 2);
    return s;
  }

  // ---------------------------------------------------------------- think
  function computeLod(e, s) {
    const p = s.ctx.player || AI.nearestPlayer(e.x, e.y);
    if (!p) return 2;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < AI.cfg.nearLod || AI.R.Camera.sees(e.x, e.y, 60) || (s.inCombat && d < AI.cfg.farLod)) return 0;
    if (d < AI.cfg.farLod) return 1;
    return 2;
  }

  function think(e, s, dt) {
    const t0 = performance.now();
    s.lod = computeLod(e, s);
    AI.Perception.sense(e, s);
    AI.Perception.process(e, s);
    AI.Rel.tick(s, dt);
    if (s.territory) territoryTick(e, s, dt);
    mercy(e, s, dt);
    updateStance(e, s);
    selectFightTarget(e, s);
    if (AI.Social) AI.Social.think(e, s);
    if (AI.Legend) AI.Legend.think(e, s);
    if (AI.Evolution) AI.Evolution.think(e, s, dt);
    choose(e, s);
    const ms = performance.now() - t0;
    AI.stats.thinkMs[s.lod] += ms;
    AI.stats.thinks[s.lod]++;
  }

  function updateStance(e, s) {
    const c = s.ctx;
    const tr = s.pers.tr;
    const em = s.mind.emo;
    const rp = AI.Rel.get(s, 'P');
    const angerP = s.mind.cause.anger === 'P' ? em.anger : 0;
    const fearP = Math.max(rp.f, s.mind.cause.fear === 'P' ? em.fear : 0);
    let host = AI.Rel.hostility(rp) + angerP * 0.7;
    if (s.territory && s.territory.intruder && AI.isPlayer(s.territory.intruder)) host += s.territory.intr * 0.55;
    if (s.pers.temp === 'opportunistic' && c.player && (c.pSeen || AI.time - c.pLastSeen < 2)) {
      const weak = c.player.hp < c.player.maxHp * 0.4;
      const busy = AI.Combat.attackersOf(c.player).length >= 2;
      if (weak) host += 0.5; else if (busy) host += 0.25;
    }
    if (s.truce && s.truce > AI.time) host *= 0.25;
    const warm = AI.Rel.warmth(rp) + (s.mind.cause.affection === 'P' ? em.affection * 0.3 : 0);
    const ratio = AI.Species.power(e) / Math.max(60, c.player ? AI.playerPower(c.player) : 400);
    const reckless = tr.bravery > 0.85 || em.anger > 0.75 || s.packBold || (s.cornered && AI.time - s.cornered < 3);
    const prev = s.stance;
    let st;
    if (host > (prev === 'hostile' ? 0.4 : 0.55)) st = ratio > 0.3 || reckless ? 'hostile' : 'wary';
    else if (fearP > 0.38) st = 'wary';
    else if (warm > (prev === 'friendly' ? 0.32 : 0.42)) st = 'friendly';
    else if (host > 0.28) st = 'wary';
    else st = 'neutral';
    if (st !== prev) {
      s.stanceAt = AI.time;
      if (st === 'hostile' && prev === 'friendly') AI.Mind.say(s, 'anger', 1.8, 2);
      if (st === 'friendly' && prev === 'hostile') AI.Mind.say(s, 'love', 2, 2);
    }
    s.stance = st;
  }

  // Mercy: a beaten Pokémon the player chooses not to finish off slowly stops seeing them as an enemy.
  // Calm, peaceful time near the player (no attacks) also wears hostility down for forgiving natures.
  function mercy(e, s, dt) {
    const c = s.ctx;
    const rp = s.rel.get('P');
    if (!rp || !c.player || AI.time - c.pLastSeen > 3) return;
    const since = AI.time - (s.lastPlayerHitAt || -999);
    const hpf = e.hp / Math.max(1, e.maxHp);
    const tr = s.pers.tr;
    if (s.lastPlayerHitAt != null && since > 6 && hpf < 0.5 && (rp.g > 0.05 || rp.a < 0) && c.pd < 600) {
      const k = dt * (0.03 + tr.forgiveness * 0.05) * (AI.time - AI.playerNoise.t > 2 ? 1.6 : 1);
      AI.Rel.adjust(s, 'P', { a: k, g: -k * 0.8, f: -k * 0.3 });
      if (!s.mercyShown && rp.a > -0.1 && rp.g < 0.2) { s.mercyShown = true; AI.Mind.say(s, 'question', 1.8, 2); }
    } else if (since > 20 && c.pd < 300 && s.stance !== 'hostile' && rp.a < 0.15) {
      AI.Rel.adjust(s, 'P', { a: dt * 0.004 * tr.forgiveness, f: -dt * 0.005 });
    }
  }

  function selectFightTarget(e, s) {
    const c = s.ctx;
    const tr = s.pers.tr;
    let best = null, bv = 0.3, reason = '';
    const consider = (o, v, why) => { if (o && o !== e && v > bv && AI.alive(o)) { best = o; bv = v; reason = why; } };
    if (s.stance === 'hostile' && c.player && !c.player.dead) {
      const memory = 3 + tr.grudge * 4;
      if (c.pSeen || AI.time - c.pLastSeen < memory) {
        const host = AI.Rel.hostility(s.rel.get('P'));
        consider(c.player, 0.55 + host * 0.5 + (c.pd < 300 ? 0.2 : 0) - (c.pd > 700 ? 0.3 : 0), 'player');
      }
    }
    const look = (o, extra, why) => {
      if (!o || o.dead || !o.psx && !(o.boss || o.legend)) return;
      const r = s.rel.get(o.id);
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d > 520) return;
      let v = AI.Rel.hostility(r) * 0.9 + extra - d / 1000;
      if (o.psx && o.psx.combat && o.psx.combat.target === e) v += 0.55; // it's attacking me
      if (r && r.r > 0.4 && s.mind.emo.anger > 0.3) v += 0.3;
      if ((o.boss || o.legend) && !(r && r.g > 0.3)) v -= 0.6; // don't pick fights with titans for no reason
      consider(o, v, why);
    };
    for (const o of c.near) look(o, 0, 'npc');
    if (s.lastHurtBy && s.lastHurtBy.ent && !AI.isPlayer(s.lastHurtBy.ent) && AI.time - s.lastHurtBy.t < 6) look(s.lastHurtBy.ent, 0.25, 'revenge');
    if (s.assist && AI.time - s.assist.t < 8) look(s.assist.foe, 0.35, 'assist');
    if (s.opportunity && AI.time - s.opportunity.t < 5) look(s.opportunity.target, 0.4 * tr.greed, 'opportunity');
    if (s.betrayed && AI.time - s.betrayed.t < 30) { const o = AI.R.EnemyMgr.get(s.betrayed.key); look(o, 0.5, 'betrayal'); }
    if (c.rival && s.mind.emo.anger > 0.25) look(c.rival, 0.2, 'rival');
    // pack behavior: join groupmates' fights
    if (s.group && AI.Social) { const gt = AI.Social.groupTarget(s.group, e); if (gt) { if (AI.isPlayer(gt)) { if (s.stance !== 'friendly') consider(gt, 0.55, 'pack'); } else look(gt, 0.35, 'pack'); } }
    // summoned minions fight for their summoner
    if (e.psxParent && e.psxParent.psx && e.psxParent.psx.combat.target) { const pt = e.psxParent.psx.combat.target; if (!AI.isPlayer(pt) || s.stance !== 'friendly') consider(pt, 0.7, 'summoner'); }
    s.fightTarget = best;
    s.fightScore = best ? Math.min(1.4, bv) : 0;
    s.fightReason = reason;
  }

  function territoryTick(e, s, dt) {
    const T = s.territory;
    const c = s.ctx;
    const h = s.home;
    let intr = null;
    if (c.player && c.pSeen && Math.hypot(c.player.x - h.x, c.player.y - h.y) < h.r && s.stance !== 'friendly') intr = c.player;
    else if (s.pers.tr.territoriality > 0.7) {
      for (const o of c.near) {
        if (!o.psx || o.dex === e.dex) continue;
        if (Math.hypot(o.x - h.x, o.y - h.y) > h.r * 0.8) continue;
        const r = s.rel.get(o.id);
        if (r && (r.b > 0.3 || r.a > 0.3)) continue;
        if (AI.Species.power(o) > AI.Species.power(e) * 1.8) continue;
        intr = o;
        break;
      }
    }
    if (intr) {
      if (T.intruder !== intr) T.intr = Math.min(T.intr, 0.3);
      T.intruder = intr;
      T.intr = Math.min(1.2, T.intr + dt * (0.1 + s.pers.tr.aggression * 0.22) * (1 - T.habit));
    } else {
      // the intruder left without a fight: it becomes a little more familiar
      if (T.intruder && AI.isPlayer(T.intruder) && T.intr > 0.1 && T.intr < 1) T.habit = Math.min(0.8, T.habit + 0.07);
      T.intruder = null;
      T.intr = Math.max(0, T.intr - dt * 0.15);
    }
  }

  function choose(e, s) {
    const c = s.ctx;
    const B = AI.Behaviors;
    const cur = s.beh;
    let best = null, bv = -1;
    for (const b of B.LIST) {
      if (s.lod === 2 && b.tier >= 7 && b.id !== 'wander' && b.id !== 'idle') continue; // far away: simplified life
      if (b !== cur && s.cd[b.id] > AI.time) continue;
      let sc;
      try { sc = b.score(e, s, c); } catch (err) { AI.warn('score:' + b.id, err); sc = 0; }
      if (!(sc > 0.12)) continue;
      let v = B.TIER_BASE[b.tier] + Math.min(1.6, sc);
      if (b === cur) v += AI.time < s.commit ? 0.75 : 0.2;
      if (v > bv) { bv = v; best = b; }
    }
    if (!best) best = B.BY.idle;
    if (best !== cur) switchTo(e, s, best);
  }

  function switchTo(e, s, b) {
    const old = s.beh;
    if (old) {
      if (old.end) { try { old.end(e, s); } catch (err) { AI.warn('end:' + old.id, err); } }
      if (old.cd) s.cd[old.id] = AI.time + old.cd * U.rand(0.8, 1.3);
    }
    if (s.inCombat && !COMBAT_BEH.has(b.id)) AI.Combat.disengage(e, s);
    const v = s.vis;
    v.lift = 0; v.rot = 0; v.sx = 1; v.sy = 1; v.shake = 0; v.alpha = 1; v.carry = null; v.breath = false;
    s.beh = b;
    s.bs = {};
    s.behT = 0;
    s.commit = AI.time + b.minCommit * U.rand(0.8, 1.3);
    s.engaged = false;
    if (b.start) {
      let ok;
      try { ok = b.start(e, s, s.ctx); } catch (err) { AI.warn('start:' + b.id, err); ok = false; }
      if (ok === false && b !== AI.Behaviors.BY.idle) return switchTo(e, s, AI.Behaviors.BY.idle);
    }
    s.behAt = AI.time;
  }

  // ---------------------------------------------------------------- per-frame update
  const VT = { x: 0, y: 0, r: 1, _vx: 0, _vy: 0, bodyH: 20, dead: false };

  function resetIntent(it, e) {
    it.x = e.x; it.y = e.y; it.speed = 0; it.stay = false; it.face = null; it.anim = null; it.animSpeed = 1; it.custom = null; it.realTarget = null;
    return it;
  }

  function update(e, dt, vtgt, orig) {
    let s = e.psx;
    if (!s) {
      if (e.psxSkip || !eligible(e) || !AI.enabled) { e.psxSkip = true; return orig.call(e, dt, vtgt); }
      s = init(e);
    }
    if (AI.R.Rift && AI.R.Rift.inArena) return orig.call(e, dt, vtgt);
    // relocated by the spawner (recycled ahead of the player): it's somewhere new now
    if (Math.abs(e.x - s.px) + Math.abs(e.y - s.py) > 260) onTeleport(e, s);
    AI.Mind.tick(e, s, dt);
    s.lure = vtgt && !AI.isPlayer(vtgt) ? vtgt : null;
    s.thinkT -= dt;
    s.acc += dt;
    if (s.forceThink && AI.time >= (s.reactT || 0)) { s.thinkT = 0; s.forceThink = false; }
    if (s.thinkT <= 0 && !s.lock) {
      think(e, s, s.acc);
      s.acc = 0;
      s.thinkT = AI.cfg.think[s.lod] * U.rand(0.8, 1.2);
    }
    // anyone near the action (not just fighters) steps out of telegraphed blasts
    if (!s.lock && !s.inCombat && s.lod < 2 && AI.R.Hazards.count) {
      s.hzT = (s.hzT || 0) - dt;
      if (s.hzT <= 0) {
        s.hzT = 0.15;
        const dg = AI.Combat.hazardEscape(e, s);
        if (dg) {
          AI.Mind.feel(s, 'surprise', AI.Perception.asleep(s) ? 0.7 : 0.3);
          if (AI.Perception.asleep(s)) switchTo(e, s, AI.Behaviors.BY.idle); // jolted awake
          // run out, then wait for it to go off rather than wandering straight back in
          s.lock = {
            t: 1.6,
            update(e2, s2, dt2, it2) {
              this.t -= dt2;
              if (AI.Combat.inDanger(e2.x, e2.y, e2.r + 14, e2)) { it2.x = e2.x + dg.dx * 80; it2.y = e2.y + dg.dy * 80; it2.speed = dg.sp; return this.t > 0; }
              it2.stay = true;
              return this.t > 0 && !!AI.Combat.inDanger(e2.x + dg.dx * -40, e2.y + dg.dy * -40, 40, e2);
            },
          };
        }
      }
    }
    const it = resetIntent(s.it, e);
    let ok;
    if (s.lock) {
      try { ok = s.lock.update(e, s, dt, it); } catch (err) { AI.warn('lock', err); ok = false; }
      if (ok === false) s.lock = null;
    } else {
      try { ok = s.beh.update(e, s, dt, it); } catch (err) { AI.warn('beh:' + s.beh.id, err); ok = false; }
      s.behT += dt;
      if (ok === false) { switchTo(e, s, AI.Behaviors.BY.idle); s.thinkT = Math.min(s.thinkT, 0.05); }
    }
    // lures (Crystal egg, Ult summons) still pull hostile Pokémon like in the original game
    if (s.lure && !s.lock && (s.stance === 'hostile' || s.pers.temp === 'aggressive') && (!s.beh || s.beh.tier >= 4)) { it.realTarget = s.lure; it.speed = 1; it.custom = null; it.stay = false; }
    exec(e, s, dt, it, orig);
    post(e, s, dt);
  }

  function onTeleport(e, s) {
    s.home.x = e.x; s.home.y = e.y;
    s.ctx.near.length = 0;
    if (s.beh && s.beh.tier >= 5) switchTo(e, s, AI.Behaviors.BY.wander);
    s.thinkT = 0;
  }

  function exec(e, s, dt, it, orig) {
    const R = AI.R;
    const v = s.vis;
    const buff = s.buff && s.buff.until > AI.time ? s.buff.spd : 1;
    const tired = s.mind.needs.energy < 0.15 ? 0.75 : 1;
    const prevDir = e.anim.dir;
    const savedB = e.behavior;
    let tgt;
    let spd = 0;
    if (it.realTarget) { tgt = it.realTarget; spd = it.speed || 1; }
    else if (it.custom || it.stay) { VT.x = e.x + 0.01; VT.y = e.y; tgt = VT; spd = 0; } // never a zero-length steering vector
    else {
      const d = Math.hypot(it.x - e.x, it.y - e.y);
      VT.x = d < 0.01 ? it.x + 0.01 : it.x; VT.y = it.y; tgt = VT;
      spd = d < 3 ? 0 : it.speed;
      // slow down on arrival instead of jittering around the point
      if (d < 18 && spd > 0) spd *= d / 18;
    }
    if (e.phase !== 'fuse') e.behavior = 'chase';
    e.spd = s.baseSpd * spd * buff * tired;
    const x0 = e.x, y0 = e.y;
    AI.curEnemy = e;
    const tv = performance.now();
    try { orig.call(e, dt, tgt); } finally { AI.curEnemy = null; e.behavior = savedB; e.spd = s.baseSpd; AI.vanillaMs = (AI.vanillaMs || 0) + performance.now() - tv; }
    if (e.dead) return;
    if (it.custom) {
      if (it.custom.x != null) { e.x = it.custom.x; e.y = it.custom.y; }
      else { e.x += it.custom.dx || 0; e.y += it.custom.dy || 0; }
      if (!e.flying && !s.lock) R.World.collide(e);
    }
    const moved = Math.hypot(e.x - x0, e.y - y0);
    s.moving = moved > 0.4;
    // facing & animation overrides
    if (it.face != null && !(e.anim.busy() && e.anim.cur !== 'Walk')) e.anim.dir = R.Sprites.dirFromAngle(it.face);
    else if (!s.moving && !it.realTarget) e.anim.dir = prevDir;
    if (it.anim && !e.anim.busy()) e.anim.loop(it.anim, it.animSpeed);
    // swimming / wading look
    if (!e.flying && R.World.isLiquid(e.x, e.y)) {
      const goal = s.p.fish ? 0.55 : s.p.lovesWater ? 0.45 : Math.max(v.sub, 0.3);
      v.subNow = U.lerp(v.subNow || 0, goal, Math.min(1, dt * 6));
    } else v.subNow = U.lerp(v.subNow || 0, 0, Math.min(1, dt * 8));
  }

  function post(e, s, dt) {
    // velocity estimate (used by other NPCs' predictive aiming)
    const k = Math.min(1, dt * 6);
    if (dt > 0) { s.vx += ((e.x - s.px) / dt - s.vx) * k; s.vy += ((e.y - s.py) / dt - s.vy) * k; }
    s.px = e.x; s.py = e.y;
    // only Pokémon actually hostile to you hurt you on contact
    const touchOk = s.stance === 'hostile' && (!s.inCombat || AI.isPlayer(s.combat.target)) && !s.lock;
    if (!touchOk) e.touchCd = Math.max(e.touchCd, 0.25);
    // don't recycle Pokémon you're interacting with
    if (s.engaged || (s.inCombat && s.combat.target && AI.isPlayer(s.combat.target))) e.lagT = 0;
    // visual timers
    const v = s.vis;
    if (v.hop > 0) { v.hop -= dt; v.hopLift = Math.sin(Math.max(0, v.hop) / 0.4 * Math.PI) * 14; } else v.hopLift = 0;
    if (v.rotT > 0) { v.rotT -= dt; if (v.rotT <= 0) v.rot = 0; }
    if (v.tears > 0) v.tears -= dt;
    if (v.yawn > 0) v.yawn -= dt;
  }

  // ---------------------------------------------------------------- NPC → NPC damage entry point
  AI.hurtNpc = function (victim, dmg, attacker, color, kx, ky, knock, accidental) {
    const prevA = AI.curAttacker, prevAcc = AI.curAccidental;
    AI.curAttacker = attacker;
    AI.curAccidental = !!accidental;
    const env = victim._env, dot = victim._dot;
    victim._env = true; // keep it out of the player's DPS meter
    victim._dot = true; // …and don't credit the player with the hit
    AI.npcKilling = true;
    try { victim.hurt(dmg, color, kx || 0, ky || 0, knock || 0, null); }
    finally { victim._env = env; victim._dot = dot; AI.curAttacker = prevA; AI.curAccidental = prevAcc; AI.npcKilling = false; }
  };

  AI.define('Brain', { eligible, init, update, think, switchTo, choose, updateStance, selectFightTarget, COMBAT_BEH });
})();
