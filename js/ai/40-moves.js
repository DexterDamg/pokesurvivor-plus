/* PokéSurvivor+ — Living World AI · NPC movesets
 * Every combat-capable wild Pokémon carries four moves built from the game's real move pool
 * (species typing, physical/special bias, range coverage), plus vanilla role abilities
 * (healer / shielder / summoner / bomber) and a few lore-only moves (Splash, Flail, Bounce…).
 * This file knows how to wind up and fire each move kind against the player or another NPC.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  // signature movesets (by species) — only ids that exist in the game are kept
  const SIG = {
    25: ['thunderbolt', 'quick-attack', 'spark', 'iron-tail'], 26: ['thunderbolt', 'thunder-punch', 'discharge', 'iron-tail'], 172: ['thunder-shock', 'quick-attack', 'spark', 'tackle'],
    129: ['splash', 'tackle', 'flail', 'bounce'], 130: ['hydro-pump', 'bite', 'dragon-dance', 'dragon-tail'],
    66: ['karate-chop', 'rock-tomb', 'dynamic-punch', 'harden'], 67: ['karate-chop', 'rock-tomb', 'dynamic-punch', 'body-slam'], 68: ['dynamic-punch', 'karate-chop', 'rock-slide', 'body-slam'],
    280: ['confusion', 'disarming-voice', 'calm-mind', 'psybeam'], 281: ['confusion', 'psybeam', 'disarming-voice', 'calm-mind'], 282: ['psychic', 'psybeam', 'dazzling-gleam', 'calm-mind'],
    658: ['aqua-jet', 'water-gun', 'razor-shell', 'bite'], 656: ['bubble', 'quick-attack', 'water-gun', 'aqua-jet'], 657: ['water-gun', 'aqua-jet', 'razor-shell', 'bite'],
    143: ['body-slam', 'hyper-voice', 'harden', 'bulldoze'], 446: ['body-slam', 'tackle', 'harden', 'hyper-voice'],
    92: ['lick', 'night-shade', 'shadow-ball', 'hex'], 93: ['lick', 'shadow-ball', 'hex', 'shadow-sneak'], 94: ['shadow-ball', 'hex', 'lick', 'shadow-sneak'],
    447: ['aura-sphere', 'quick-attack', 'karate-chop', 'metal-claw'], 448: ['aura-sphere', 'dynamic-punch', 'metal-claw', 'quick-attack'],
    443: ['dragon-rage', 'bite', 'bulldoze', 'dragon-claw'], 444: ['dragon-claw', 'dragon-rage', 'bulldoze', 'bite'], 445: ['dragon-claw', 'dragon-rage', 'bulldoze', 'dragon-tail'],
    63: ['confusion', 'calm-mind', 'psybeam', 'psycho-cut'], 64: ['psybeam', 'confusion', 'psycho-cut', 'calm-mind'], 65: ['psychic', 'psybeam', 'confusion', 'calm-mind'],
    4: ['ember', 'metal-claw', 'flamethrower', 'dragon-rage'], 5: ['flamethrower', 'metal-claw', 'ember', 'dragon-rage'], 6: ['flamethrower', 'heat-wave', 'dragon-claw', 'aerial-ace'],
    7: ['water-gun', 'bubble', 'aqua-jet', 'harden'], 8: ['water-gun', 'bubble-beam', 'aqua-jet', 'bite'], 9: ['hydro-pump', 'bubble-beam', 'bite', 'harden'],
    393: ['bubble', 'water-gun', 'aqua-jet', 'ice-shard'], 52: ['bite', 'metal-claw', 'quick-attack', 'nasty-plot'], 53: ['bite', 'metal-claw', 'dark-pulse', 'nasty-plot'],
    54: ['water-gun', 'confusion', 'headache', 'bubble'], 55: ['water-gun', 'confusion', 'psybeam', 'razor-shell'], 79: ['water-gun', 'confusion', 'harden', 'psybeam'], 80: ['water-gun', 'psychic', 'harden', 'body-slam'],
    335: ['metal-claw', 'quick-attack', 'bite', 'swords-dance'], 336: ['bite', 'poison-sting', 'sludge', 'toxic-spikes'],
    133: ['tackle', 'quick-attack', 'bite', 'hyper-voice'], 39: ['hyper-voice', 'disarming-voice', 'body-slam', 'tackle'], 56: ['karate-chop', 'quick-attack', 'bite', 'dynamic-punch'], 57: ['dynamic-punch', 'karate-chop', 'bite', 'quick-attack'],
  };

  // lore-only / role pseudo moves (not in the player's pool)
  const PSEUDO = {
    splash: { id: 'splash', name: 'Splash', type: 'water', kind: 'splash', cd: 1.2 },
    flail: { id: 'flail', name: 'Flail', type: 'normal', kind: 'melee', cd: 0.7, dmg: 16, radius: 50, arc: 2.6, knock: 60 },
    bounce: { id: 'bounce', name: 'Bounce', type: 'flying', kind: 'leap', cd: 1.6, dmg: 22, radius: 44 },
    headache: { id: 'headache', name: 'Psychic headache', type: 'psychic', kind: 'aura', cd: 2.5, dmg: 18, radius: 120 },
    'role-heal': { id: 'role-heal', name: 'Heal Pulse', type: 'fairy', kind: 'role-heal', cd: 1.2 },
    'role-shield': { id: 'role-shield', name: 'Protect', type: 'steel', kind: 'role-shield', cd: 2.6 },
    'role-summon': { id: 'role-summon', name: 'Call', type: 'bug', kind: 'role-summon', cd: 2.4 },
    'role-fuse': { id: 'role-fuse', name: 'Self-Destruct', type: 'normal', kind: 'role-fuse', cd: 9 },
  };

  // NPC kind classes
  const SHOT = new Set(['projectile', 'cone', 'nova', 'boomerang', 'turret']);
  const PULSE = new Set(['aura', 'orbit', 'trail']);
  const RAIN = new Set(['meteor', 'mine']);

  function def(id) { return PSEUDO[id] || (AI.R.Moves.BY_ID && AI.R.Moves.BY_ID[id]) || null; }

  // turn a move definition into an NPC move slot with range data
  function slot(id) {
    const d = def(id);
    if (!d) return null;
    const k = d.kind;
    const m = { id, name: d.name || id, type: d.type || 'normal', kind: k, def: d, cdLeft: 0, uses: 0, miss: 0, hit: 0 };
    const sp = U.clamp((d.speed || 300) * 0.6, 160, 300);
    m.speed = sp;
    if (SHOT.has(k)) {
      const raw = d.speed && d.life ? d.speed * d.life : 300;
      m.cls = 'shot';
      m.range = U.clamp(k === 'cone' ? 150 : k === 'nova' ? Math.min(220, raw) : raw * 0.85, 120, 380);
      m.ideal = m.range * 0.7; m.min = k === 'nova' || k === 'cone' ? 0 : 70;
      m.windup = 0.22;
      m.power = (d.dmg || 12) * (k === 'cone' ? 3.2 : k === 'nova' ? 2.2 : Math.min(2.5, 1 + ((d.count || 1) - 1) * 0.55)) / 18;
      m.ranged = true;
    } else if (k === 'beam') {
      m.cls = 'beam'; m.range = U.clamp(d.radius || 220, 160, 300); m.ideal = m.range * 0.65; m.min = 40; m.windup = 0.75; m.power = (d.dmg || 20) / 16; m.ranged = true;
    } else if (k === 'chain') {
      m.cls = 'zap'; m.range = U.clamp((d.radius || 140) * 1.5, 160, 250); m.ideal = m.range * 0.7; m.min = 0; m.windup = 0.45; m.power = (d.dmg || 18) * 1.4 / 18; m.ranged = true;
    } else if (RAIN.has(k)) {
      m.cls = 'rain'; m.range = U.clamp(d.reach || 260, 180, 300); m.ideal = 200; m.min = 60; m.windup = 0.35; m.power = (d.dmg || 18) * Math.min(2, 0.6 + (d.count || 1) * 0.35) / 18; m.ranged = true;
    } else if (k === 'melee') {
      m.cls = 'melee'; m.range = U.clamp(d.radius || 60, 45, 110); m.ideal = m.range * 0.6; m.min = 0; m.windup = 0.28; m.power = (d.dmg || 18) * (d.hits || 1) / 18; m.arc = Math.min(d.arc || 2, 3.2);
    } else if (k === 'dash') {
      m.cls = 'dash'; m.range = U.clamp(d.radius || 120, 90, 180); m.ideal = m.range * 0.75; m.min = 40; m.windup = 0.35; m.power = (d.dmg || 18) / 16;
    } else if (PULSE.has(k)) {
      m.cls = 'pulse'; m.range = U.clamp(d.radius || 75, 60, 130); m.ideal = m.range * 0.6; m.min = 0; m.windup = 0.4; m.power = (d.dmg || 9) * 1.6 / 14;
    } else if (k === 'buff') {
      m.cls = 'buff'; m.range = 9999; m.ideal = 0; m.min = 0; m.windup = 0.45; m.power = 0;
    } else if (k === 'leap') {
      m.cls = 'leap'; m.range = 210; m.ideal = 150; m.min = 60; m.windup = 0.4; m.power = (d.dmg || 20) / 16;
    } else if (k === 'splash') {
      m.cls = 'splash'; m.range = 9999; m.ideal = 0; m.min = 0; m.windup = 0.3; m.power = 0;
    } else if (k.startsWith('role-')) {
      m.cls = k; m.range = k === 'role-fuse' ? 60 : 9999; m.ideal = k === 'role-fuse' ? 30 : 180; m.min = 0; m.windup = 0.4; m.power = k === 'role-fuse' ? 2.2 : 0;
    } else return null;
    m.cd = U.clamp((d.cd || 0.8) * 3.3, 1.1, 6);
    if (m.cls === 'buff') m.cd = 9;
    m.status = !!(d.slow || d.stun || d.burn || d.poison || d.weak);
    return m;
  }

  function build(e) {
    const s = e.psx;
    const p = s.p;
    const R = AI.R;
    const rnd = U.rng((s.pers.seed ^ 0x51ed) >>> 0);
    const roleSlot = { healer: 'role-heal', shielder: 'role-shield', summoner: 'role-summon', bomber: 'role-fuse' }[e.behavior];
    let ids = [];
    if (SIG[e.dex]) ids = SIG[e.dex].filter((id) => def(id));
    if (ids.length < 4) {
      const pool = new Set(R.Moves.POOL.normal || []);
      for (const t of p.types) for (const id of R.Moves.POOL[t] || []) pool.add(id);
      const phys = p.atk / Math.max(1, p.atk + p.spa);
      const scored = [];
      for (const id of pool) {
        if (ids.includes(id)) continue;
        const m = slot(id);
        if (!m) continue;
        const cat = R.Moves.CAT && R.Moves.CAT[id] != null ? R.Moves.CAT[id] : m.cls === 'melee' || m.cls === 'dash' ? 1 : 0;
        let sc = (p.types.includes(m.type) ? 1.2 : m.type === 'normal' ? 0.25 : 0) + (cat * phys + (1 - cat) * (1 - phys)) + m.power * 0.4 + rnd() * 0.7;
        if (m.cls === 'buff') sc -= 0.6;
        scored.push([sc, id, m]);
      }
      scored.sort((a, b) => b[0] - a[0]);
      // range coverage: try to carry something for far and something for close
      const has = (f) => ids.some((id) => { const m = slot(id); return m && f(m); });
      const far = scored.find((x) => x[2].ranged);
      const close = scored.find((x) => x[2].cls === 'melee' || x[2].cls === 'dash' || x[2].cls === 'pulse');
      if (far && !has((m) => m.ranged)) ids.push(far[1]);
      if (close && !has((m) => !m.ranged && m.cls !== 'buff') && ids.length < 4) ids.push(close[1]);
      for (const [, id, m] of scored) {
        if (ids.length >= 4) break;
        if (ids.includes(id)) continue;
        if (m.cls === 'buff' && has((x) => x.cls === 'buff')) continue;
        ids.push(id);
      }
    }
    if (roleSlot) { ids = ids.filter((id) => id !== roleSlot); ids.splice(Math.min(1, ids.length), 0, roleSlot); }
    while (ids.length < 4 && def('tackle')) ids.push(ids.includes('tackle') ? 'quick-attack' : 'tackle');
    const out = [];
    for (const id of ids.slice(0, 4)) { const m = slot(id); if (m) out.push(m); }
    return out;
  }

  // ---------------------------------------------------------------- damage
  function npcVsNpc(e, m, victim) {
    const S = AI.Species;
    const tm = AI.R.Types.mult(m.type, victim.types || ['normal']);
    const ratio = U.clamp(Math.pow(S.power(e) / Math.max(60, S.power(victim)), 0.45), 0.4, 2.4);
    const buff = (e.psx && e.psx.buff && e.psx.buff.until > AI.time ? e.psx.buff.atk : 1);
    const pct = U.clamp(0.1 * Math.max(0.3, m.power) * tm * ratio * buff, 0.02, 0.5);
    let dmg = (victim.pctBase ? victim.pctBase() : victim.maxHp) * pct;
    if (victim.boss || victim.legend) dmg *= 0.25;
    return dmg;
  }
  function vsPlayer(e, m) {
    const ranged = m.ranged;
    const base = ranged ? (e.def.shotDmg ? e.shotDmg() : e.dmg * 0.6) : e.dmg * 0.85;
    const buff = (e.psx && e.psx.buff && e.psx.buff.until > AI.time ? e.psx.buff.atk : 1);
    return base * U.clamp(m.power, 0.45, 2.2) * buff;
  }

  // apply a hit from NPC e (move m) to victim (player or NPC)
  function hit(e, m, victim, kx, ky, knock, accidental, mult = 1) {
    if (!victim || victim.dead) return 0;
    const R = AI.R;
    if (AI.isPlayer(victim)) {
      const before = victim.hp;
      victim.hurt(vsPlayer(e, m) * mult, m.type, false, m.cls === 'melee' || m.cls === 'dash' || m.cls === 'leap' ? 'phys' : 'spec');
      const d = m.def;
      if (victim.hp < before && victim.triStatus) {
        if (d.stun && Math.random() < 0.35) victim.triStatus(3);
        else if (d.slow && Math.random() < 0.4) victim.triStatus(2);
        else if (d.burn && Math.random() < 0.3) victim.triStatus(1);
      }
      if (e.psx) e.psx.combat && (e.psx.combat.dealt = (e.psx.combat.dealt || 0) + (before - victim.hp));
      return before - victim.hp;
    }
    if (!AI.cfg.friendlyFire && accidental) return 0;
    const dmg = npcVsNpc(e, m, victim) * mult;
    const d = m.def;
    AI.hurtNpc(victim, dmg, e, R.U.TYPE_COLOR[m.type] || '#fff', kx, ky, knock || d.knock || 30, accidental);
    if (!victim.dead) {
      if (d.slow) victim.applySlow(Math.min(0.6, d.slow), 1.4);
      if (d.burn && Math.random() < 0.4) victim.applyBurn(1);
      if (d.poison && Math.random() < 0.4) victim.applyPoison(1);
      if (d.stun && Math.random() < 0.35) victim.applyStun(Math.min(0.6, d.stun));
    }
    return dmg;
  }

  // ---------------------------------------------------------------- firing
  function typeVis(m) {
    const V = AI.R.VFX;
    try { return m.def && m.def.kind && V.forMove && AI.R.Moves.BY_ID[m.id] ? V.forMove(m.def) : V.forType(m.type); } catch (e) { return V.forType(m.type); }
  }

  // start a windup; the combat controller calls update each frame until it fires
  function begin(e, s, m, target, aimX, aimY) {
    const c = s.combat;
    c.cast = { m, t: 0, target, ax: aimX, ay: aimY, ang: Math.atan2(aimY - e.y, aimX - e.x), fired: false };
    m.cdLeft = m.cd * (1 + (Math.random() - 0.5) * 0.2);
    m.uses++;
    const anim = { shot: 'Shoot', beam: 'Charge', zap: 'Charge', rain: 'Charge', melee: 'Attack', dash: 'Charge', pulse: 'Charge', buff: 'Charge', leap: 'Charge', splash: 'Hurt' }[m.cls] || 'Charge';
    e.anim.play(anim, { speed: anim === 'Attack' ? 1.6 : 1.2 });
    e.anim.dir = AI.R.Sprites.dirFromAngle(c.cast.ang);
    if (m.cls === 'beam') {
      const len = m.range;
      const h = AI.R.Hazards.add({ kind: 'beam', x: e.x, y: e.y, angle: c.cast.ang, len, w: U.clamp(m.def.width || 26, 18, 40), delay: m.windup, dmg: vsPlayer(e, m), type: m.type, color: AI.R.U.TYPE_COLOR[m.type] || '#ff7a9e' });
      tagHazard(h, e, m, target);
      c.cast.rooted = true;
    } else if (m.cls === 'rain') {
      const n = Math.min(3, m.def.count || 2);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, r = i ? U.rand(30, 70) : 0;
        const h = AI.R.Hazards.add({ kind: 'zone', x: aimX + Math.cos(a) * r, y: aimY + Math.sin(a) * r * 0.8, r: U.clamp(m.def.radius || 44, 34, 60), delay: 0.85 + i * 0.12, dmg: vsPlayer(e, m) * 0.8, type: m.type, color: AI.R.U.TYPE_COLOR[m.type] || '#ff7a9e' });
        tagHazard(h, e, m, target);
      }
      c.cast.fired = true;
    } else if (m.cls === 'zap') {
      const h = AI.R.Hazards.add({ kind: 'zone', x: aimX, y: aimY, r: 34, delay: m.windup + 0.1, dmg: vsPlayer(e, m), type: m.type, color: AI.R.U.TYPE_COLOR[m.type] || '#ffe14d' });
      tagHazard(h, e, m, target);
      h.psxZapFrom = e;
      c.cast.fired = true;
    } else if (m.cls === 'pulse' || m.cls === 'role-fuse') {
      AI.R.FX.ring(e.x, e.y, e.r, m.range || 60, AI.R.U.TYPE_COLOR[m.type] || '#fff', m.windup, 2);
    }
  }

  function tagHazard(h, e, m, target) {
    if (!h) return;
    h.psxOwner = e;
    h.psxMove = m;
    h.psxTarget = target;
    h.psxSafe = !(target && AI.isPlayer(target)) && !(e.psx && e.psx.stance === 'hostile');
  }

  function fire(e, s, cast) {
    const R = AI.R;
    const m = cast.m;
    const col = R.U.TYPE_COLOR[m.type] || '#ff7a9e';
    const target = cast.target;
    const ang = cast.ang;
    const d = m.def;
    if (AI.Light) try { AI.Light.moveLight(e, m, ang, target); } catch (err) { /* ignore */ }
    switch (m.cls) {
      case 'shot': {
        const k = d.kind;
        const n = k === 'cone' ? 5 : k === 'nova' ? 8 : Math.min(3, d.count || 1);
        const spread = k === 'cone' ? (d.arc || 0.9) : k === 'nova' ? Math.PI * 2 * (n - 1) / n : (d.spread || 0.12) * n;
        const life = U.clamp(m.range / m.speed, 0.35, 2.6);
        const vis = typeVis(m);
        const safe = !(target && AI.isPlayer(target)) && s.stance !== 'hostile';
        for (let i = 0; i < n; i++) {
          const a = ang + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
          const p = R.Projectiles.spawn({
            x: e.x, y: e.y, vx: Math.cos(a) * m.speed, vy: Math.sin(a) * m.speed,
            dmg: vsPlayer(e, m) * (n > 1 ? 1 / Math.sqrt(n) : 1), r: U.clamp(d.size || 7, 5, 10), life, friendly: false,
            color: col, mtype: m.type, vis,
            tri: d.burn ? 1 : d.slow ? 2 : d.stun ? 3 : 0, triP: 0.3,
          });
          if (p) {
            p.psxOwner = e; p.psxMove = m; p.psxTarget = target; p.psxSafe = safe; p.hits = p.hits || new Set();
            if (R.Coop && R.Coop.isHost) try { R.Coop.enemyShot(p, m.type); } catch (err) { /* ignore */ }
          }
        }
        R.FX.ring(e.x, e.y - R.LIFT, 4, 14, col, 0.2, 2);
        break;
      }
      case 'melee': {
        const reach = m.range + 10;
        const half = m.arc / 2;
        const mult = m.id === 'flail' ? 1 + 2 * (1 - e.hp / Math.max(1, e.maxHp)) : 1;
        R.FX.slash(e.x, e.y - 0.5 * R.LIFT, ang, m.range, m.arc, col, typeVis(m));
        forEachIn(e, e.x, e.y, reach, (v, isTarget) => {
          const a = Math.atan2(v.y - e.y, v.x - e.x);
          if (Math.abs(U.angDiff(ang, a)) > half + 0.3) return;
          hit(e, m, v, v.x - e.x, v.y - e.y, (d.knock || 50) + 40, !isTarget, mult);
        }, target);
        break;
      }
      case 'pulse': {
        R.FX.ring(e.x, e.y, 0.4 * m.range, m.range, col, 0.3, 3);
        R.FX.burst(e.x, e.y - 10, col, 10, 120);
        if (m.id === 'headache') { R.Camera.sees(e.x, e.y, 0) && R.Camera.kick(0.15); AI.Bus.emit({ type: 'boom', x: e.x, y: e.y, loud: 260, power: 0.5, src: e, srcKey: e.id }); }
        forEachIn(e, e.x, e.y, m.range, (v, isTarget) => {
          hit(e, m, v, v.x - e.x, v.y - e.y, 40, !isTarget);
          if (m.id === 'headache' && v.psx) AI.Mind.feel(v.psx, 'confusion', 0.5);
        }, target);
        break;
      }
      case 'dash': {
        const sp = (e.spd || 80) * 3.6 + 120;
        s.combat.dash = { dx: Math.cos(ang), dy: Math.sin(ang), left: m.range, sp, m, hit: new Set(), target };
        R.FX.ring(e.x, e.y, e.r, 2.4 * e.r, col, 0.25, 2);
        e.anim.play('Attack', { speed: 1.5 });
        break;
      }
      case 'leap': {
        const tx = cast.ax, ty = cast.ay;
        s.combat.leap = { sx: e.x, sy: e.y, tx, ty, t: 0, dur: 0.55, m, target };
        break;
      }
      case 'buff': {
        const st = (d.passive && Object.keys(d.passive)) || ['atk'];
        const b = { until: AI.time + 7, atk: 1, spd: 1, def: 1 };
        if (st.includes('atk') || st.includes('spa')) b.atk = 1.3;
        if (st.includes('spe')) b.spd = 1.25;
        if (st.includes('def') || st.includes('sdf')) b.def = 0.7;
        if (st.includes('regen') || d.cleanse) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.18);
        s.buff = b;
        R.FX.ring(e.x, e.y, 2.4 * e.r, 1.1 * e.r, col, 0.35, 2.5);
        R.FX.burst(e.x, e.y - e.bodyH * 0.5, col, 8, 70);
        break;
      }
      case 'splash': {
        R.FX.burst(e.x, e.y - 6, '#9fd8ff', 12, 90);
        s.vis.hop = 0.35;
        if (Math.random() < 0.5) AI.Mind.say(s, 'dots', 1.4, 1);
        break;
      }
      case 'role-heal': try { e.healAround(); } catch (err) { AI.warn('heal', err); } break;
      case 'role-shield': try { e.castShields(); } catch (err) { AI.warn('shield', err); } break;
      case 'role-summon':
        AI.summoning = true;
        try { e.summon(); for (const mi of e.minions || []) if (mi.psx == null) mi.psxParent = e; } catch (err) { AI.warn('summon', err); } finally { AI.summoning = false; }
        break;
      case 'role-fuse': try { e.startFuse(); tagLastHazard(e, m, target); } catch (err) { AI.warn('fuse', err); } break;
      default: break;
    }
  }

  function tagLastHazard(e, m, target) {
    const all = AI.R.Hazards.all;
    if (all && all.length) tagHazard(all[all.length - 1], e, m, target);
  }

  // visit everything that can be hit around (x, y): players and NPCs, excluding the attacker
  function forEachIn(e, x, y, r, fn, target) {
    for (const p of AI.players) {
      if (p.dead) continue;
      if (U.dist2(x, y, p.x, p.y) > (r + p.r) * (r + p.r)) continue;
      // a Pokémon that isn't hostile to you pulls its punches when you stand in its swing
      if (p !== target && e.psx && e.psx.stance !== 'hostile') continue;
      fn(p, p === target);
    }
    for (const v of AI.R.EnemyMgr.queryCircle(x, y, r)) {
      if (v === e || v.dead || v.remote) continue;
      fn(v, v === target);
    }
  }

  AI.define('NpcMoves', { SIG, PSEUDO, def, slot, build, begin, fire, hit, forEachIn, vsPlayer, npcVsNpc, tagHazard });
})();
