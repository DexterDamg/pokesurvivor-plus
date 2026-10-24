/* PokéSurvivor+ — Living World AI · tactical combat
 * When a Pokémon decides to fight it runs this controller: strategy selection, engagement
 * rings (no more piling onto the player), move scoring across its four moves, predictive
 * aim with honest error, reaction-time-limited dodging, hazard/aura avoidance, and the
 * friendly-fire resolver that lets NPC attacks land on other NPCs.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const NM = () => AI.NpcMoves;

  const CLOSE = new Set(['melee', 'dash', 'pulse', 'leap', 'role-fuse']);

  function init(e, s) {
    s.combat = {
      target: null, key: null, since: 0, seenT: -99, lx: 0, ly: 0, strat: 'aggressive', stratT: 0,
      moves: NM().build(e), gcd: U.rand(0.4, 1.2), cast: null, dash: null, leap: null, dodge: null,
      dodged: new WeakSet(), slotAng: Math.random() * 6.283, strafe: Math.random() < 0.5 ? -1 : 1,
      hitrun: 0, missStreak: 0, scanT: 0, role: 'active', reason: '', dealt: 0, closeHurt: 0, farHurt: 0,
      touchT: 0, losT: -9, losOk: true, seenFor: 0,
    };
  }

  function engage(e, s, target, reason) {
    const c = s.combat;
    if (c.target !== target) {
      c.target = target;
      c.key = AI.keyOf(target);
      c.since = AI.time;
      c.seenT = AI.time;
      c.lx = target.x; c.ly = target.y;
      c.stratT = 0;
      c.missStreak = 0;
      c.seenFor = 0;
      c.reason = reason || '';
      if (!s.inCombat) AI.Bus.emit({ type: 'cry', kind: 'challenge', x: e.x, y: e.y, loud: 180, src: e, foe: target });
    }
    s.inCombat = true;
  }

  function disengage(e, s) {
    const c = s.combat;
    c.target = null; c.key = null; c.cast = null; c.dash = null; c.leap = null; c.dodge = null;
    c.dodged = new WeakSet(); // an interrupted dodge must be re-evaluated by the out-of-combat check
    s.inCombat = false;
  }

  // ---------------------------------------------------------------- engagement rings
  let engageNow = new Map();
  let engageNext = new Map();
  let engageT = 0;
  function register(target, e) {
    let l = engageNext.get(target);
    if (!l) engageNext.set(target, (l = new Set()));
    l.add(e); // once per cycle, however many frames it fights
  }
  function attackersOf(target) { const l = engageNow.get(target); return l ? [...l] : []; }

  function globalTick(dt) {
    engageT -= dt;
    if (engageT > 0) return;
    engageT = 0.4;
    engageNow = engageNext;
    engageNext = new Map();
    let active = 0;
    const all = [];
    for (const [target, set] of engageNow) {
      // evenly distribute attackers around the target, keeping their current angular order
      const ranged = [], close = [];
      const list = [...set].filter((e) => !e.dead && e.psx && e.psx.combat.target === target);
      for (const e of list) {
        const c = e.psx.combat;
        c.curAng = Math.atan2(e.y - target.y, e.x - target.x);
        (c.prefersRange ? ranged : close).push(e);
        all.push(e);
      }
      for (const grp of [close, ranged]) {
        if (!grp.length) continue;
        grp.sort((a, b) => a.psx.combat.curAng - b.psx.combat.curAng);
        const base = grp[0].psx.combat.curAng;
        const step = (Math.PI * 2) / grp.length;
        grp.forEach((e, i) => { e.psx.combat.slotAng = base + i * step; e.psx.combat.crowd = list.length; });
      }
    }
    // concurrency cap for the advanced controller — the rest wait their turn at a distance
    all.sort((a, b) => U.dist2(a.x, a.y, a.psx.combat.target.x, a.psx.combat.target.y) - U.dist2(b.x, b.y, b.psx.combat.target.x, b.psx.combat.target.y));
    for (const e of all) {
      const c = e.psx.combat;
      c.role = active < AI.cfg.maxCombatAI ? 'active' : 'menace';
      if (c.role === 'active') active++;
    }
    AI.stats.combat = active;
  }

  // ---------------------------------------------------------------- projectiles grid (for dodging)
  let gridFrame = -1;
  const grid = new Map();
  const CELL = 128;
  function projGrid() {
    if (gridFrame === AI.frame) return grid;
    gridFrame = AI.frame;
    grid.clear();
    for (const p of AI.R.Projectiles.all()) {
      if (p.orb && !p.vx) continue;
      const k = Math.floor(p.x / CELL) * 73856093 ^ Math.floor(p.y / CELL) * 19349663;
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      l.push(p);
    }
    return grid;
  }

  // ---------------------------------------------------------------- strategy
  function chooseStrategy(e, s) {
    const c = s.combat;
    const tr = s.pers.tr;
    const em = s.mind.emo;
    const hasRanged = c.moves.some((m) => m.ranged);
    const hasClose = c.moves.some((m) => CLOSE.has(m.cls));
    const hpf = e.hp / Math.max(1, e.maxHp);
    const w = { aggressive: 0.05, ranged: 0, hitrun: 0, flank: 0, defensive: 0, opportunistic: 0 };
    if (hasClose) {
      w.aggressive += 0.6 + tr.aggression * 0.6 + em.anger * 0.8;
      w.flank += tr.intelligence * 0.6 + tr.agility * 0.5 - (s.p.size === 2 ? 0.3 : 0);
      w.hitrun += tr.agility * 0.6 + tr.intelligence * 0.3;
    }
    if (hasRanged) {
      w.ranged += 0.6 + tr.intelligence * 0.4 + (1 - tr.bravery) * 0.4;
      w.defensive += (1 - hpf) * 0.8 + em.fear * 0.8;
    }
    if (s.pers.temp === 'opportunistic') w.opportunistic += 0.9;
    if (hpf < 0.4) { w.aggressive *= 0.5; w.defensive += 0.6; w.hitrun += 0.3; }
    if ((c.crowd || 0) >= 3) { w.aggressive *= 0.6; w.ranged += 0.45; w.flank += 0.3; }
    if (c.missStreak >= 3) { w.aggressive += 0.5; w.flank += 0.35; w.ranged *= 0.6; }
    if (c.closeHurt > c.farHurt + 0.25 && hasRanged) { w.ranged += 0.6; w.hitrun += 0.4; w.aggressive *= 0.6; }
    if (s.pers.quirks.has('lazy') || s.p.agility < 0.25) { w.flank *= 0.3; w.hitrun *= 0.3; }
    // temperature: smart Pokémon commit to the best plan, others improvise
    const temp = 1.4 - tr.intelligence;
    const ww = {};
    for (const k in w) ww[k] = Math.pow(Math.max(0, w[k]), 1 / Math.max(0.35, temp));
    const pick = U.wpick(ww) || 'aggressive';
    if (pick !== c.strat) {
      c.strat = pick;
      c.hitrun = 0;
    }
    c.stratT = 2.2 + Math.random() * 2;
    const rangedMoves = c.moves.filter((m) => m.ranged);
    c.prefersRange = pick === 'ranged' || pick === 'defensive' || (pick === 'opportunistic' && hasRanged);
    c.rangedIdeal = rangedMoves.length ? rangedMoves.reduce((a, m) => a + m.ideal, 0) / rangedMoves.length : 200;
    const closeMoves = c.moves.filter((m) => CLOSE.has(m.cls));
    // get within reach of the shortest melee move (so every close-range move can land); flankers keep a little more room
    const reaches = closeMoves.map((m) => Math.min(m.range, 110));
    c.closeR = closeMoves.length ? (pick === 'flank' || pick === 'hitrun' ? Math.max(...reaches) * 0.8 : Math.min(...reaches)) : 45;
  }

  // ---------------------------------------------------------------- move scoring
  function targetSpeed(t) {
    if (t._vx != null) return Math.hypot(t._vx, t._vy);
    if (t.psx) return Math.hypot(t.psx.vx || 0, t.psx.vy || 0);
    return 0;
  }
  function targetVel(t) {
    if (t._vx != null) return [t._vx, t._vy];
    if (t.psx) return [t.psx.vx || 0, t.psx.vy || 0];
    return [0, 0];
  }
  function isSlowed(t) { return AI.isPlayer(t) ? t.slowT > 0 || t.sleepT > 0 : t.slow > 0 || t.stunT > 0; }

  function scoreMove(e, s, m, t, dist) {
    if (m.cdLeft > 0) return -1;
    const tr = s.pers.tr;
    const em = s.mind.emo;
    const hpf = e.hp / Math.max(1, e.maxHp);
    if (m.cls === 'buff') {
      if (s.buff && s.buff.until > AI.time) return -1;
      // set up when there's a window: out of reach, or nobody has landed a hit for a while (anger skips it)
      const calm = !s.lastHurtBy || AI.time - s.lastHurtBy.t > 2.5;
      return (dist > 160 ? 0.35 : 0.1) + (calm ? 0.3 : 0) + tr.intelligence * 0.3 - em.anger * 0.25;
    }
    if (m.cls === 'role-heal') {
      const hurt = s.ctx.near.filter((o) => o.hp < o.maxHp * 0.7 && (!o.psx || o.psx.stance === s.stance)).length + (hpf < 0.7 ? 1 : 0);
      return hurt ? 0.4 + hurt * 0.2 : -1;
    }
    if (m.cls === 'role-shield') return s.ctx.near.length ? 0.45 : 0.2;
    if (m.cls === 'role-summon') return (e.minions || []).filter((x) => !x.dead).length < 3 && !AI.Population.full() ? 0.55 : -1;
    if (m.cls === 'role-fuse') return dist < 50 && (tr.aggression > 0.5 || hpf < 0.3) ? 1.4 : -1;
    if (m.cls === 'splash') return 0.3 + Math.random() * 0.4;
    if (dist > m.range + (t.r || 12)) return -1;
    if (m.min && dist < m.min * 0.6 && m.cls !== 'melee') return -1;
    const tm = AI.R.Types.mult(m.type, AI.isPlayer(t) ? (t.mon && t.mon.types) || ['normal'] : t.types || ['normal']);
    const fit = 1 - Math.min(1, Math.abs(dist - m.ideal) / Math.max(80, m.range));
    // chance to land: fast targets dodge slow projectiles & telegraphs
    const ts = targetSpeed(t);
    let hitP = 1;
    if (m.cls === 'shot') hitP = U.clamp(1 - (ts * (dist / m.speed)) / 140 * (1 - tr.intelligence * 0.5), 0.2, 1);
    else if (m.cls === 'beam' || m.cls === 'rain' || m.cls === 'zap') hitP = isSlowed(t) ? 1 : U.clamp(1 - ts / 260, 0.25, 1);
    else if (m.cls === 'melee' || m.cls === 'pulse') hitP = dist < m.range * 0.9 ? 0.95 : 0.5;
    let v = Math.max(0.3, m.power) * tm * (0.45 + fit * 0.55) * hitP;
    if (m.status && !isSlowed(t)) v += 0.25 * tr.intelligence; // set up the combo
    if ((m.cls === 'beam' || m.cls === 'rain') && isSlowed(t)) v += 0.4 * tr.intelligence; // …then cash it in
    if (m.ranged && dist < m.ideal * 0.55) v *= 1 - tr.intelligence * 0.25; // point-blank: a smart fighter reaches for something quicker
    if (m.uses && m.miss > m.hit + 2) v *= 0.6; // this isn't working, try something else
    if (em.anger > 0.6 && (m.cls === 'melee' || m.cls === 'dash')) v *= 1.3;
    if (em.fear > 0.5 && !m.ranged) v *= 0.6;
    if (s.combat.lastMove === m && c_rep(s)) v *= 0.75;
    // panic: worse decisions
    const noise = (1.2 - tr.intelligence) * 0.35 + (em.fear > 0.75 ? 0.4 : 0);
    return v + (Math.random() - 0.5) * noise;
  }
  const c_rep = (s) => s.combat.repeat > 1;

  function allyRisk(e, s, m, ax, ay, t) {
    const tr = s.pers.tr;
    if (tr.intelligence < 0.22) return 0; // doesn't think about it
    let risk = 0;
    const area = m.cls === 'pulse' ? m.range : m.cls === 'melee' ? m.range : 0;
    const check = (o) => {
      if (o === t || o === e || o.dead) return;
      const isPl = AI.isPlayer(o);
      let ally = false;
      if (isPl) ally = s.stance !== 'hostile';
      else {
        const r = s.rel.get(o.id);
        ally = (r && (r.b > 0.3 || r.a > 0.35)) || (s.group && o.psx && o.psx.group === s.group) || (o.psx && o.psx.combat && o.psx.combat.target === t);
      }
      if (!ally) return;
      if (area) {
        if (U.dist2(e.x, e.y, o.x, o.y) < (area + o.r) * (area + o.r)) risk = Math.max(risk, 1);
      } else if (m.ranged) {
        // distance from o to segment e→aim
        const dx = ax - e.x, dy = ay - e.y;
        const L2 = dx * dx + dy * dy || 1;
        const u = U.clamp(((o.x - e.x) * dx + (o.y - e.y) * dy) / L2, 0, 1);
        const px = e.x + dx * u, py = e.y + dy * u;
        if (U.dist2(px, py, o.x, o.y) < (o.r + 14) * (o.r + 14) && u < 0.95) risk = Math.max(risk, 1);
      }
    };
    for (const o of s.ctx.near) check(o);
    for (const p of AI.players) check(p);
    return risk * tr.intelligence * 1.2;
  }

  function aimAt(e, s, t, speed, delay = 0) {
    const tr = s.pers.tr;
    const [vx, vy] = targetVel(t);
    const dist = Math.hypot(t.x - e.x, t.y - e.y);
    // smart Pokémon that have watched you move for a moment lead their shots; others shoot where you are
    const reads = s.combat.seenFor > 0.6 && Math.random() < 0.2 + tr.intelligence * 0.7;
    let lead = reads ? U.rand(0.8, 1.08) : U.rand(0, 0.25);
    if (s.mind.emo.fear > 0.7) lead *= 0.5;
    // time until impact = windup before the shot leaves + flight time
    let tt = delay + dist / Math.max(60, speed);
    let ax = t.x + vx * tt * lead, ay = t.y + vy * tt * lead;
    tt = delay + Math.hypot(ax - e.x, ay - e.y) / Math.max(60, speed);
    ax = t.x + vx * tt * lead; ay = t.y + vy * tt * lead;
    // honest aim error, worse when panicking
    const err = (0.26 - 0.2 * tr.intelligence) * (s.mind.emo.fear > 0.75 ? 1.8 : 1) * (s.mind.needs.energy < 0.2 ? 1.4 : 1);
    const a = Math.atan2(ay - e.y, ax - e.x) + (Math.random() + Math.random() - 1) * err;
    const r = Math.hypot(ax - e.x, ay - e.y);
    return [e.x + Math.cos(a) * r, e.y + Math.sin(a) * r];
  }

  // ---------------------------------------------------------------- threats: dodge projectiles & hazards
  function dodgeSkill(e, s) {
    const tr = s.pers.tr;
    let k = 0.12 + tr.agility * 0.45 + tr.intelligence * 0.22 + s.mind.emo.fear * 0.12 - s.mind.emo.anger * 0.12;
    if (s.mind.needs.energy < 0.2) k -= 0.2;
    if (s.p.size === 2) k -= 0.12;
    if (s.pers.quirks.has('lazy')) k -= 0.15;
    return U.clamp(k, 0.03, 0.82);
  }

  // is (x, y) inside a pending (telegraphed, not yet triggered) hazard someone else placed?
  function inDanger(x, y, r, e) {
    const H = AI.R.Hazards;
    if (!H.count) return null;
    for (const h of H.all) if (!h.hit && h.t < h.delay && h.psxOwner !== e && H.inside(h, x, y, r + 6)) return h;
    return null;
  }

  // telegraphed ground hazards (red warning zones/beams): step out if there's time and the skill to do so
  function hazardEscape(e, s) {
    const c = s.combat;
    const H = AI.R.Hazards;
    for (const h of H.all) {
      if (h.hit || h.t >= h.delay || h.psxOwner === e) continue;
      if (!H.inside(h, e.x, e.y, e.r)) continue;
      if (c.dodged.has(h)) continue;
      c.dodged.add(h);
      const left = h.delay - h.t;
      // a distracted Pokémon reacts a bit worse, a sleeping one barely notices; a long telegraph is easier to read
      const aware = Perception().asleep(s) ? 0.2 : s.inCombat ? 1 : 0.85;
      const warned = U.clamp((left - 0.5) * 0.3, 0, 0.3);
      if (left < Perception().reactionDelay(s) * 0.6 || Math.random() > (dodgeSkill(e, s) + 0.25 + warned) * aware) continue;
      let dx, dy;
      if (h.kind === 'zone') [dx, dy] = U.norm(e.x - h.x || 1, e.y - h.y);
      else { const ca = Math.cos(h.angle), sa = Math.sin(h.angle); const side = -(e.x - h.x) * sa + (e.y - h.y) * ca >= 0 ? 1 : -1; dx = -sa * side; dy = ca * side; }
      return { t: U.clamp(left, 0.25, 0.6), dx, dy, sp: 1.9 };
    }
    return null;
  }

  function scanThreats(e, s, dt) {
    const c = s.combat;
    c.scanT -= dt;
    if (c.scanT > 0) return null;
    c.scanT = s.lod === 0 ? 0.08 : 0.22;
    const hz = hazardEscape(e, s);
    if (hz) return hz;
    // incoming projectiles
    const g = projGrid();
    const cx = Math.floor(e.x / CELL), cy = Math.floor(e.y / CELL);
    for (let j = -2; j <= 2; j++)
      for (let i = -2; i <= 2; i++) {
        const l = g.get((cx + i) * 73856093 ^ (cy + j) * 19349663);
        if (!l) continue;
        for (const p of l) {
          if (p.psxOwner === e || c.dodged.has(p)) continue;
          // shots from allies aimed elsewhere aren't threats to react to (they might still hit!)
          if (!p.friendly && p.psxTarget && p.psxTarget !== e) continue;
          const vx = p.vx || 0, vy = p.vy || 0;
          const v2 = vx * vx + vy * vy;
          if (v2 < 100) continue;
          const tox = e.x - p.x, toy = e.y - p.y;
          const tca = (tox * vx + toy * vy) / v2;
          if (tca < 0 || tca > 0.85) continue;
          const mx = p.x + vx * tca - e.x, my = p.y + vy * tca - e.y;
          const rr = e.r + (p.r || 6) + 6;
          if (mx * mx + my * my > rr * rr) continue;
          c.dodged.add(p);
          // needs time to see it coming, and the skill to react
          if (tca < Perception().reactionDelay(s) * 0.55) continue;
          if (Math.random() > dodgeSkill(e, s)) continue;
          const len = Math.sqrt(v2);
          let px = -vy / len, py = vx / len;
          if (px * tox + py * toy < 0) { px = -px; py = -py; } // step away from the line it's on
          if (!e.flying && !AI.Env.free(e.x + px * 42, e.y + py * 42, e.r * 0.8)) { px = -px; py = -py; }
          return { t: U.rand(0.2, 0.34), dx: px, dy: py, sp: 2 + s.pers.tr.agility * 0.8 };
        }
      }
    // standing inside a player's aura while not committed to melee is dumb (smart ones step out)
    const pl = c.target && AI.isPlayer(c.target) ? c.target : null;
    if (pl && s.pers.tr.intelligence > 0.45 && c.strat !== 'aggressive') {
      const aR = playerAuraR(pl);
      const d = Math.hypot(pl.x - e.x, pl.y - e.y);
      if (aR && d < aR + e.r + 8) {
        const [dx, dy] = U.norm(e.x - pl.x || 1, e.y - pl.y);
        return { t: 0.3, dx, dy, sp: 1.5 };
      }
    }
    return null;
  }
  const Perception = () => AI.Perception;

  let auraCache = { p: null, t: -1, r: 0 };
  function playerAuraR(p) {
    if (auraCache.p === p && AI.time - auraCache.t < 1) return auraCache.r;
    let r = 0;
    try {
      for (const m of p.activeGroup()) if ((m.kind === 'aura' || m.kind === 'orbit') && !(m.def && m.def.passive) && !(AI.Player && AI.Player.isOff(p, m))) r = Math.max(r, m.radius || 0);
    } catch (err) { r = 0; }
    auraCache = { p, t: AI.time, r };
    return r;
  }

  // ---------------------------------------------------------------- per-frame controller
  function update(e, s, dt, it) {
    const c = s.combat;
    const t = c.target;
    const R = AI.R;
    for (const m of c.moves) if (m.cdLeft > 0) m.cdLeft -= dt;
    c.gcd -= dt;
    AI.stats.combatUpdates = (AI.stats.combatUpdates || 0) + 1;
    if (!t || !AI.alive(t)) { disengage(e, s); return false; }
    register(t, e);
    // what do we know about the target right now?
    let seen;
    if (AI.isPlayer(t)) seen = s.ctx.pSeen || AI.time - s.ctx.pLastSeen < 0.6;
    else {
      if (AI.time - c.losT > 0.4) { c.losT = AI.time; c.losOk = Math.hypot(t.x - e.x, t.y - e.y) < 520 && Perception().los(e.x, e.y, t.x, t.y); }
      seen = c.losOk;
    }
    if (seen) { c.seenT = AI.time; c.lx = t.x; c.ly = t.y; c.seenFor += dt; } else c.seenFor = 0;
    const tx = seen ? t.x : c.lx, ty = seen ? t.y : c.ly;
    const dist = Math.hypot(tx - e.x, ty - e.y);
    it.face = Math.atan2(ty - e.y, tx - e.x);

    // committed actions first
    if (c.dash) return runDash(e, s, dt, it);
    if (c.leap) return runLeap(e, s, dt, it);
    if (c.cast) {
      c.cast.t += dt;
      const m = c.cast.m;
      if (!c.cast.fired && c.cast.t >= m.windup) { c.cast.fired = true; NM().fire(e, s, c.cast); }
      it.face = c.cast.ang;
      if (c.cast.rooted || m.cls === 'melee' || m.cls === 'pulse' || m.cls === 'buff') it.stay = true;
      else { it.x = e.x; it.y = e.y; it.speed = 0; }
      if (c.cast.t >= m.windup + 0.18) { c.lastMove === m ? (c.repeat = (c.repeat || 0) + 1) : (c.repeat = 0); c.lastMove = m; c.cast = null; c.gcd = gcdFor(s); }
      return true;
    }
    if (c.dodge) {
      c.dodge.t -= dt;
      it.x = e.x + c.dodge.dx * 80; it.y = e.y + c.dodge.dy * 80; it.speed = c.dodge.sp;
      if (c.dodge.t <= 0) c.dodge = null;
      return true;
    }
    const dg = scanThreats(e, s, dt);
    if (dg) { c.dodge = dg; s.vis.hop = Math.max(s.vis.hop || 0, 0.12); AI.stats.dodges = (AI.stats.dodges || 0) + 1; return true; }

    // strategy upkeep
    c.stratT -= dt;
    if (c.stratT <= 0) chooseStrategy(e, s);

    // pick a move
    if (c.gcd <= 0 && seen && c.role === 'active') {
      let best = null, bv = 0.22;
      for (const m of c.moves) {
        const v = scoreMove(e, s, m, t, dist);
        if (v > bv) { bv = v; best = m; }
      }
      if (best) {
        const [ax, ay] = best.ranged ? aimAt(e, s, t, best.cls === 'shot' ? best.speed : 1e4, best.cls === 'shot' ? best.windup : best.windup + 0.1) : [t.x, t.y];
        const risk = allyRisk(e, s, best, ax, ay, t);
        // thinking fighters see the tree in the way and find a better angle; dimmer ones waste the shot
        const blocked = (best.cls === 'shot' || best.cls === 'beam') && s.pers.tr.intelligence > 0.3 && !Perception().clearShot(e.x, e.y, ax, ay);
        if (blocked) { c.gcd = 0.3; c.slotAng += c.strafe * 0.9; c.blockedN = (c.blockedN || 0) + 1; }
        else if (risk < 0.5) {
          NM().begin(e, s, best, t, ax, ay);
          trackShot(e, s, best, t);
          return true;
        }
        c.gcd = 0.35; // hold fire, reposition for a clean angle
        c.slotAng += c.strafe * 0.8;
      } else c.gcd = 0.25;
    }

    // NPC↔NPC body contact
    if (!AI.isPlayer(t) && dist < e.r + (t.r || 12) + 6) {
      c.touchT -= dt;
      if (c.touchT <= 0) {
        c.touchT = 0.75;
        e.strike(t);
        const tackle = c.moves.find((m) => m.cls === 'melee' || m.cls === 'dash') || c.moves[0];
        if (tackle) NM().hit(e, Object.assign({}, tackle, { power: Math.max(0.35, tackle.power * 0.45) }), t, t.x - e.x, t.y - e.y, 80, false);
      }
    }

    position(e, s, dt, it, t, tx, ty, dist, seen);
    return true;
  }

  function gcdFor(s) {
    const tr = s.pers.tr;
    return U.clamp(1.15 - tr.agility * 0.35 - tr.aggression * 0.2 + (s.mind.needs.energy < 0.2 ? 0.4 : 0) + Math.random() * 0.3, 0.45, 1.6);
  }

  // hit/miss bookkeeping for strategy adaptation (shots resolve later; others are judged by distance now)
  function trackShot(e, s, m, t) {
    if (m.cls !== 'shot') return;
    s.combat.pendingShots = (s.combat.pendingShots || 0) + 1;
  }
  function noteShotResult(e, m, hitIt) {
    const s = e.psx;
    if (!s || !s.combat) return;
    if (hitIt) { m.hit++; s.combat.missStreak = 0; } else { m.miss++; s.combat.missStreak++; }
  }

  function position(e, s, dt, it, t, tx, ty, dist, seen) {
    const c = s.combat;
    const tr = s.pers.tr;
    let pref;
    const closeR = c.closeR || 45;
    switch (c.role === 'menace' ? 'menace' : c.strat) {
      case 'aggressive': pref = closeR * 0.7 + (t.r || 14); break;
      case 'flank': {
        pref = closeR * 0.8 + (t.r || 14);
        // come at it from behind / the side it isn't facing
        const face = AI.isPlayer(t) ? t.aim : Math.atan2(t.psx ? t.psx.vy || 0 : 0, t.psx ? t.psx.vx || 1 : 1);
        if (face != null && dist > pref * 1.5) c.slotAng = face + Math.PI + c.strafe * 0.5;
        break;
      }
      case 'hitrun':
        if (c.hitrun > 0) { c.hitrun -= dt; pref = 230; } else pref = closeR * 0.7 + (t.r || 14);
        if (c.lastMove && (c.lastMove.cls === 'melee' || c.lastMove.cls === 'dash') && c.gcd > 0 && c.hitrun <= 0) c.hitrun = U.rand(1, 1.8);
        break;
      case 'ranged': pref = c.rangedIdeal; break;
      case 'defensive': pref = Math.max(c.rangedIdeal, 230); break;
      case 'opportunistic': {
        const vulnerable = isSlowed(t) || t.hp < t.maxHp * 0.45 || (AI.isPlayer(t) && distracted(t, e));
        pref = vulnerable ? closeR * 0.75 + (t.r || 14) : Math.max(c.rangedIdeal || 0, 210);
        break;
      }
      default: pref = 270 + (e.id % 4) * 15; // menace: circle and wait
    }
    if (!seen) { it.x = tx; it.y = ty; it.speed = 0.9; it.realTarget = AI.isPlayer(t) ? t : null; return; }
    // strafing around the target keeps ranged attackers moving and spreads the group out
    if (c.prefersRange || c.role === 'menace') c.slotAng += c.strafe * dt * (0.35 + tr.agility * 0.4);
    if (Math.random() < dt * 0.15) c.strafe = -c.strafe;
    let gx = tx + Math.cos(c.slotAng) * pref;
    let gy = ty + Math.sin(c.slotAng) * pref * 0.85;
    // too close for a ranged fighter → back off directly away
    if ((c.strat === 'ranged' || c.strat === 'defensive') && dist < pref * 0.55) {
      const [ax, ay] = U.norm(e.x - tx || 1, e.y - ty);
      gx = e.x + ax * 120; gy = e.y + ay * 120;
      // don't back into walls, water or hazards — slide sideways instead
      if (!e.flying && (!AI.Env.free(gx, gy, e.r) || AI.Env.isLiquid(gx, gy))) { gx = e.x - ay * 120 * c.strafe; gy = e.y + ax * 120 * c.strafe; }
    }
    if (!e.flying && AI.Env.isLiquid(gx, gy) && AI.Env.hurtsIn(e.types)) { c.slotAng += 1; }
    // don't walk back into a warning zone that's about to go off
    if (inDanger(gx, gy, e.r, e) && s.pers.tr.intelligence > 0.25) { c.slotAng += c.strafe * 1.2; gx = e.x; gy = e.y; }
    // far from the ring point → approach along the flow field when hunting the player
    const dg = Math.hypot(gx - e.x, gy - e.y);
    it.x = gx; it.y = gy;
    it.speed = dg < 10 ? 0 : U.clamp(dg / 90, 0.45, 1.15) * (c.role === 'menace' ? 0.7 : 1);
    if (AI.isPlayer(t) && dist > 260 && !c.prefersRange) it.realTarget = t;
  }

  function distracted(p, e) {
    if (p.target === e) return false;
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    return Math.abs(U.angDiff(p.aim || 0, a)) > 1.3;
  }

  function runDash(e, s, dt, it) {
    const c = s.combat;
    const d = c.dash;
    const step = Math.min(d.left, d.sp * dt);
    d.left -= step;
    it.custom = { dx: d.dx * step, dy: d.dy * step };
    it.face = Math.atan2(d.dy, d.dx);
    it.anim = 'Walk'; it.animSpeed = 2;
    if (Math.random() < 0.5 && AI.R.Camera.sees(e.x, e.y, 0)) AI.R.FX.px(e.x - d.dx * 8, e.y, '#e8dcc0', { vy: -14, life: 0.3 });
    NM().forEachIn(e, e.x + d.dx * 10, e.y + d.dy * 10, e.r + 6, (v, isTarget) => {
      if (d.hit.has(v)) return;
      d.hit.add(v);
      NM().hit(e, d.m, v, d.dx, d.dy, (d.m.def.knock || 60) + 60, !isTarget);
    }, d.target);
    if (d.left <= 0 || (!e.flying && !AI.Env.free(e.x + d.dx * (e.r + 6), e.y + d.dy * (e.r + 6), e.r * 0.7))) { c.dash = null; c.gcd = gcdFor(s); c.lastMove = d.m; }
    return true;
  }

  function runLeap(e, s, dt, it) {
    const c = s.combat;
    const L = c.leap;
    L.t += dt;
    const k = Math.min(1, L.t / L.dur);
    it.custom = { x: L.sx + (L.tx - L.sx) * k, y: L.sy + (L.ty - L.sy) * k };
    s.vis.lift = 40 * Math.sin(k * Math.PI);
    it.face = Math.atan2(L.ty - L.sy, L.tx - L.sx);
    if (k >= 1) {
      s.vis.lift = 0;
      c.leap = null; c.gcd = gcdFor(s);
      const col = AI.R.U.TYPE_COLOR[L.m.type] || '#fff';
      AI.R.FX.ring(e.x, e.y, 4, L.m.def.radius || 44, col, 0.3, 3);
      AI.R.FX.burst(e.x, e.y - 4, col, 8, 110);
      NM().forEachIn(e, e.x, e.y, L.m.def.radius || 44, (v, isTarget) => NM().hit(e, L.m, v, v.x - e.x, v.y - e.y, 90, !isTarget), L.target);
      e.anim.play('Attack', { speed: 1.4 });
    }
    return true;
  }

  // ---------------------------------------------------------------- friendly fire: NPC shots & hazards vs NPCs
  const BOSS_MOVE = { id: 'boss', type: 'normal', cls: 'shot', ranged: true, power: 1, def: {} };

  function resolveNpcShots() {
    const R = AI.R;
    const arr = R.Projectiles.all();
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      const owner = p.psxOwner;
      if (p.friendly || !owner) continue;
      let consumed = false;
      for (const v of R.EnemyMgr.queryCircle(p.x, p.y, (p.r || 6) + 4)) {
        if (v === owner || v.dead || v.remote) continue;
        if (U.dist2(p.x, p.y, v.x, v.y) > ((p.r || 6) + v.r) ** 2) continue;
        if (!p.hits) p.hits = new Set();
        if (p.hits.has(v.id)) continue;
        p.hits.add(v.id);
        const isTarget = v === p.psxTarget;
        if (!isTarget) {
          if (!AI.cfg.friendlyFire) continue;
          // crowded fights: stray shots don't connect every time
          if (Math.random() > 0.55) continue;
        }
        const m = p.psxMove || Object.assign({}, BOSS_MOVE, { type: owner.atkType || 'normal' });
        NM().hit(owner, m, v, p.vx || 0, p.vy || 0, 40, !isTarget);
        if (owner.psx && isTarget && p.psxMove) noteShotResult(owner, p.psxMove, true);
        consumed = !(p.pierce > 0);
        if (!consumed) p.pierce--;
        break;
      }
      if (consumed) { R.FX.burst(p.x, p.y - R.LIFT, p.color || '#fff', 6, 90); arr.splice(i, 1); }
    }
  }

  // hazards that went off this frame
  function resolveHazards(triggered) {
    const R = AI.R;
    if (AI.Companions) try { AI.Companions.hazards(triggered); } catch (e) { AI.warn('party-hazards', e); }
    for (const h of triggered) {
      const owner = h.psxOwner;
      if (h.psxZapFrom && !h.psxZapFrom.dead) {
        const z = h.psxZapFrom;
        const ang = Math.atan2(h.y - z.y, h.x - z.x);
        R.FX.beam(z.x, z.y - R.LIFT, ang, Math.hypot(h.x - z.x, h.y - z.y), 8, h.color || '#ffe14d', R.VFX.forType(h.type || 'electric'));
      }
      if (!owner) continue;
      const m = h.psxMove || Object.assign({}, BOSS_MOVE, { type: h.type || owner.atkType || 'normal', cls: 'rain' });
      const reach = h.kind === 'zone' ? h.r + 30 : (h.len || 300) / 2 + (h.w || 30);
      const cx = h.kind === 'zone' ? h.x : h.x + Math.cos(h.angle) * (h.len || 0) / 2;
      const cy = h.kind === 'zone' ? h.y : h.y + Math.sin(h.angle) * (h.len || 0) / 2;
      for (const v of R.EnemyMgr.queryCircle(cx, cy, reach)) {
        if (v === owner || v.dead || v.remote) continue;
        if (!R.Hazards.inside(h, v.x, v.y, v.r)) continue;
        const isTarget = v === h.psxTarget;
        if (!isTarget && !AI.cfg.friendlyFire) continue;
        NM().hit(owner, m, v, v.x - h.x, v.y - h.y, 60, !isTarget);
      }
      // status riders on the player for NPC moves
      const pl = R.Game.player;
      if (pl && !pl.dead && h.psxMove && R.Hazards.inside(h, pl.x, pl.y, pl.r)) {
        const d = h.psxMove.def || {};
        if (d.stun && Math.random() < 0.3) pl.triStatus(3);
        else if (d.slow && Math.random() < 0.35) pl.triStatus(2);
        else if (d.burn && Math.random() < 0.25) pl.triStatus(1);
      }
    }
  }

  AI.define('Combat', {
    CLOSE, init, engage, disengage, update, globalTick, attackersOf, chooseStrategy, hazardEscape, inDanger,
    resolveNpcShots, resolveHazards, noteShotResult, aimAt, scoreMove, dodgeSkill, playerAuraR,
  });
})();
