/* PokéSurvivor+ — Living World AI · social life
 * Groups (friends, families, packs, migrating herds) that form and dissolve, and a director
 * that starts spontaneous NPC↔NPC interactions within a concurrency budget: greetings, chase
 * games, resting together, rival sparring, bullying (and protectors stepping in), gossip that
 * spreads the player's reputation, races and crowds gathering around something interesting.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const M = () => AI.Mind;

  // ---------------------------------------------------------------- groups
  const groups = new Map();
  let gid = 1;
  function newGroup(leader, kind = 'friends') {
    const g = { id: gid++, kind, members: new Set([leader]), leader, formed: AI.time, target: null, goal: null, apart: 0 };
    groups.set(g.id, g);
    if (leader.psx) leader.psx.group = g.id;
    return g.id;
  }
  function join(e, id) {
    const g = groups.get(id);
    if (!g || !e.psx) return;
    if (e.psx.group && e.psx.group !== id) leave(e);
    g.members.add(e);
    e.psx.group = id;
  }
  function leave(e) {
    const s = e.psx;
    if (!s || !s.group) return;
    const g = groups.get(s.group);
    s.group = null;
    if (!g) return;
    g.members.delete(e);
    if (g.leader === e) g.leader = [...g.members][0] || null;
    if (g.members.size < 2) { for (const m of g.members) if (m.psx) m.psx.group = null; groups.delete(g.id); }
  }
  function leaderOf(e) {
    const g = groups.get(e.psx && e.psx.group);
    if (!g || !g.leader || g.leader === e || g.leader.dead) return null;
    return g.leader;
  }
  function groupTarget(id, e) {
    const g = groups.get(id);
    if (!g) return null;
    for (const m of g.members) {
      if (m === e || m.dead || !m.psx) continue;
      const t = m.psx.combat && m.psx.combat.target;
      if (t && AI.alive(t) && Math.hypot(m.x - e.x, m.y - e.y) < 450) return t;
    }
    return null;
  }

  // hordes (the original "Marea de Pokémon" surges) become packs or stampedes
  const hordes = new Map();
  let hid = 1;
  function markHorde(list) {
    if (!list.length) return;
    const id = hid++;
    const r = Math.random();
    const kind = r < 0.62 ? 'pack' : r < 0.85 ? 'migration' : 'mixed';
    const lead = list[0];
    const ang = Math.atan2((AI.players[0] ? AI.players[0].y : lead.y) - lead.y, (AI.players[0] ? AI.players[0].x : lead.x) - lead.x);
    hordes.set(id, { kind, t: AI.time, ang, gid: null, n: list.length });
    for (const e of list) e.psxHorde = id;
  }
  function hordeTemp(id) {
    const h = hordes.get(id);
    if (!h) return null;
    if (h.kind === 'pack') return 'aggressive';
    if (h.kind === 'migration') return Math.random() < 0.7 ? 'neutral' : 'timid';
    return null;
  }
  function joinHorde(e, id) {
    const h = hordes.get(id);
    if (!h) return;
    if (!h.gid || !groups.has(h.gid)) {
      h.gid = newGroup(e, h.kind === 'pack' ? 'pack' : h.kind === 'migration' ? 'migration' : 'friends');
      const g = groups.get(h.gid);
      if (h.kind === 'migration') g.goal = { x: e.x + Math.cos(h.ang) * 2200, y: e.y + Math.sin(h.ang) * 2200, until: AI.time + 45 };
    } else join(e, h.gid);
    const g = groups.get(h.gid);
    for (const m of g.members) if (m !== e && m.psx) { AI.Rel.adjust(e.psx, m.id, { b: 0.45, a: 0.3 }); AI.Rel.adjust(m.psx, e.id, { b: 0.45, a: 0.3 }); }
  }

  // ---------------------------------------------------------------- interactions
  const active = [];
  let dirT = 0;
  let iid = 1;

  function available(e) {
    const s = e && e.psx;
    if (!s || e.dead || s.social || s.lock || s.inCombat || s.lod > 1) return false;
    if (s.beh && s.beh.tier < 7 && s.beh.id !== 'rest') return false;
    if ((s.socialCd || 0) > AI.time) return false;
    return true;
  }

  function startI(type, a, b, data = {}) {
    const I = { id: iid++, type, a, b, t: 0, phase: 0, data };
    active.push(I);
    a.psx.social = I;
    const passive = type === 'gather'; // the sleeper being watched isn't a participant
    if (b && b.psx && !passive) { b.psx.social = I; b.psx.forceThink = true; }
    a.psx.forceThink = true;
    return I;
  }
  function endI(I, cdA = 12, cdB = 12) {
    const i = active.indexOf(I);
    if (i >= 0) active.splice(i, 1);
    for (const [e, cd] of [[I.a, cdA], [I.b, cdB]]) {
      if (e && e.psx && e.psx.social === I) { e.psx.social = null; e.psx.socialCd = AI.time + cd * U.rand(0.8, 1.4); e.psx.forceThink = true; }
    }
  }

  function pickType(a, b) {
    const sa = a.psx, sb = b.psx;
    const ta = sa.pers.tr, tb = sb.pers.tr;
    const ra = sa.rel.get(b.id);
    const innate = AI.Species.relationOf(sa.p, sb.p, sa.pers);
    const pa = AI.Species.power(a), pb = AI.Species.power(b);
    const bond = ra ? ra.b + Math.max(0, ra.a) * 0.5 : innate === 'friend' ? 0.4 : 0;
    const w = {};
    if (innate === 'rival' || (ra && ra.r > 0.35)) w.spar = 1.5 + ta.aggression;
    if (ta.aggression > 0.6 && pa > pb * 1.35 && tb.bravery < 0.55 && bond < 0.2 && sa.pers.temp !== 'friendly') w.bully = 0.6 + ta.aggression * 0.8;
    if (bond > 0.35) { w.rest = 0.6 + ta.sociability * 0.4; w.play = (ta.playfulness + tb.playfulness) * 0.6; w.gossip = 0.6; if (!sa.group || !sb.group) w.bandup = 0.5 + ta.sociability * 0.5; }
    else {
      w.greet = 0.6 + ta.sociability * 0.6 + (innate === 'kin' || innate === 'friend' ? 0.5 : 0);
      if (ta.playfulness > 0.55 && tb.playfulness > 0.45) w.play = 0.8;
    }
    if (ta.energy > 0.6 && tb.energy > 0.6 && ta.playfulness > 0.5) w.race = 0.35;
    if (sb.beh && sb.beh.id === 'sleep' && sb.p.size >= 1 && ta.curiosity > 0.5) w.gather = 1.2;
    return U.wpick(w);
  }

  function directorTick(dt) {
    dirT -= dt;
    if (dirT > 0) return;
    dirT = 0.5;
    // expire stale interactions
    for (let i = active.length - 1; i >= 0; i--) {
      const I = active[i];
      if (!I.a || I.a.dead || !I.a.psx || (I.b && (I.b.dead || !I.b.psx)) || I.t > (I.data.max || 16)) endI(I);
    }
    AI.stats.social = active.length;
    if (active.length >= AI.cfg.maxSocial) return;
    const all = AI.R.EnemyMgr.all();
    for (let k = 0; k < 6 && active.length < AI.cfg.maxSocial; k++) {
      const a = all[(Math.random() * all.length) | 0];
      if (!available(a) || a.psx.pers.tr.sociability < 0.2 && Math.random() < 0.7) continue;
      const near = a.psx.ctx.near;
      let b = null;
      for (const o of near) if (o._d2 < 240 * 240 && available(o)) { b = o; break; }
      if (!b) continue;
      const type = pickType(a, b);
      if (!type) continue;
      const I = startI(type, a, b, { max: { spar: 14, play: 11, race: 12, rest: 14, greet: 7, gossip: 7, bully: 8, bandup: 4, gather: 16 }[type] || 10 });
      if (type === 'race') {
        const ang = Math.random() * 6.283;
        I.data.gx = (a.x + b.x) / 2 + Math.cos(ang) * 320;
        I.data.gy = (a.y + b.y) / 2 + Math.sin(ang) * 260;
      }
      if (type === 'gather') {
        // others nearby come and look too
        for (const o of b.psx.ctx.near) {
          if (o === a || !available(o) || o.psx.pers.tr.curiosity < 0.45) continue;
          o.psx.poi = { x: b.x, y: b.y, t: AI.time, kind: 'curious' };
          M().feel(o.psx, 'curiosity', 0.5);
        }
      }
    }
  }

  // roles for each participant; returns false to end the interaction
  function step(e, s, dt, it) {
    const I = s.social;
    if (!I) return false;
    const other = I.a === e ? I.b : I.a;
    const isA = I.a === e;
    if (isA) I.t += dt;
    if (!other || other.dead || !other.psx) { endI(I); return false; }
    const os = other.psx;
    const d = Math.hypot(other.x - e.x, other.y - e.y);
    const face = Math.atan2(other.y - e.y, other.x - e.x);
    const B = AI.Behaviors;
    switch (I.type) {
      case 'greet': {
        if (d > e.r + other.r + 22) { B.go(it, other.x, other.y, 0.45); it.face = face; return true; }
        B.stay(it); it.face = face;
        if (!I.data['g' + e.id]) {
          I.data['g' + e.id] = true;
          M().say(s, 'question', 1.2, 1);
          const compat = (s.pers.temp === 'aggressive') === (os.pers.temp === 'aggressive') || s.pers.tr.sociability > 0.6;
          s.mind.next = { icon: compat ? 'happy' : 'eyes', at: AI.time + 1.1, dur: 1.4, prio: 1 };
          AI.Rel.adjust(s, other.id, compat ? { a: 0.15, b: 0.12 } : { a: -0.05 });
          if (!compat && s.pers.tr.bravery < 0.4) M().feel(s, 'fear', 0.25, other.id);
        }
        if (I.t > 3.5) { endI(I); return false; }
        return true;
      }
      case 'play': {
        // the chaser swaps every few seconds
        const chaserIsA = Math.floor(I.t / 3.2) % 2 === 0;
        const chasing = chaserIsA === isA;
        if (chasing) {
          B.go(it, other.x, other.y, 1.05);
          if (d < e.r + other.r + 4 && !I.data.tagged) {
            I.data.tagged = true;
            s.vis.hop = 0.3;
            // an accidental real hit turns play into a disagreement
            if (Math.random() < 0.12 + s.pers.tr.clumsiness * 0.1) {
              const m = s.combat.moves.find((x) => x.cls === 'melee' || x.cls === 'dash') || s.combat.moves[0];
              if (m) AI.NpcMoves.hit(e, Object.assign({}, m, { power: 0.25 }), other, other.x - e.x, other.y - e.y, 60, true);
              if (os.pers.tr.forgiveness < 0.5) { I.type = 'spar'; I.t = 0; I.data.max = 10; return true; }
            }
          }
        } else {
          const [ax, ay] = U.norm(e.x - other.x || 1, e.y - other.y);
          B.go(it, e.x + ax * 80 + (Math.random() - 0.5) * 40, e.y + ay * 70, 0.95);
        }
        if (Math.floor(I.t / 3.2) !== I.data.lastSwap) { I.data.lastSwap = Math.floor(I.t / 3.2); I.data.tagged = false; M().say(s, chasing ? 'note' : 'happy', 1, 0.8); }
        M().feel(s, 'joy', dt * 0.06);
        if (I.t > 10) { AI.Rel.adjust(s, other.id, { b: 0.18, a: 0.12 }); AI.Rel.adjust(os, e.id, { b: 0.18, a: 0.12 }); endI(I); return false; }
        return true;
      }
      case 'rest': {
        if (d > e.r + other.r + 14) { B.go(it, other.x, other.y, 0.45); return true; }
        B.stay(it); it.face = face; it.anim = 'Idle'; it.animSpeed = 0.4;
        if (Math.random() < dt * 0.15) M().say(s, 'love', 1.5, 0.6);
        s.mind.needs.energy = Math.min(1, s.mind.needs.energy + dt * 0.01);
        s.mind.needs.social = Math.max(0, s.mind.needs.social - dt * 0.05);
        if (I.t > 12) { AI.Rel.adjust(s, other.id, { b: 0.12 }); endI(I); return false; }
        return true;
      }
      case 'spar': {
        // posture, then a real (but non-lethal) bout
        if (I.t < 1.5) { B.stay(it); it.face = face; if (!I.data['p' + e.id]) { I.data['p' + e.id] = true; M().say(s, 'anger', 1.5, 2); s.vis.hop = 0.2; } return true; }
        if (s.combat.target !== other) AI.Combat.engage(e, s, other, 'spar');
        AI.Combat.update(e, s, dt, it);
        const hf = e.hp / Math.max(1, e.maxHp), of = other.hp / Math.max(1, other.maxHp);
        if (hf < 0.5 || of < 0.5 || I.t > 12) {
          const win = hf >= of;
          AI.Combat.disengage(e, s);
          AI.Combat.disengage(other, os);
          const W = win ? s : os, L = win ? os : s;
          M().feel(W, 'joy', 0.5); M().say(W, 'sparkle', 2, 2);
          M().feel(L, 'sadness', 0.4); M().feel(L, 'embarrassment', 0.4); M().say(L, 'tear', 2, 2);
          AI.Rel.adjust(s, other.id, { r: 0.2 }); AI.Rel.adjust(os, e.id, { r: 0.2 });
          endI(I, 20, 20);
          return false;
        }
        return true;
      }
      case 'bully': {
        if (isA) {
          if (d > e.r + other.r + 16) { B.go(it, other.x, other.y, 0.8); it.face = face; }
          else { B.stay(it); it.face = face; if (!I.data.shoved) { I.data.shoved = true; s.vis.hop = 0.25; M().say(s, 'anger', 1.4, 2); M().feel(os, 'fear', 0.45, e.id); M().feel(os, 'sadness', 0.3); AI.Rel.adjust(os, e.id, { g: 0.2, a: -0.2, f: 0.2 }); os.bulliedBy = { e, t: AI.time, n: (os.bulliedBy && os.bulliedBy.e === e ? os.bulliedBy.n : 0) + 1 }; AI.Bus.emit({ type: 'cry', kind: 'help', x: other.x, y: other.y, loud: 220, src: other, foe: e }); } }
          if (I.t > 6) { endI(I, 25, 15); return false; }
          return true;
        }
        // the bullied: flee… unless it has finally had enough
        if (os && s.mind.emo.anger > s.mind.emo.fear + 0.2 && s.pers.tr.bravery > 0.3) { endI(I); s.lastHurtBy = { key: other.id, ent: other, t: AI.time }; s.mind.cause.anger = other.id; return false; }
        const [ax, ay] = U.norm(e.x - other.x || 1, e.y - other.y);
        B.go(it, e.x + ax * 120, e.y + ay * 100, 1.1);
        return true;
      }
      case 'gossip': {
        if (d > e.r + other.r + 20) { B.go(it, other.x, other.y, 0.5); return true; }
        B.stay(it); it.face = face;
        if (!I.data['s' + e.id]) {
          I.data['s' + e.id] = true;
          M().say(s, 'dots', 1.8, 0.8);
          // reputation spreads through trust, not omniscience
          const mine = s.rel.get('P'), theirs = os.rel.get('P');
          const r = s.rel.get(other.id);
          const trust = r ? U.clamp(r.b + r.a * 0.5, 0, 1) : 0.2;
          if (mine && theirs) {
            const k = 0.3 * trust;
            mine.a += (theirs.a - mine.a) * k; mine.f += (theirs.f - mine.f) * k; mine.g += (theirs.g - mine.g) * k * 0.6;
          }
        }
        if (I.t > 3.5) { endI(I); return false; }
        return true;
      }
      case 'bandup': {
        if (!I.data.done) {
          I.data.done = true;
          const lead = I.a, mate = I.b;
          const g = lead.psx.group || newGroup(lead, 'friends');
          join(mate, g);
          M().say(lead.psx, 'love', 1.6, 1);
          M().say(mate.psx, 'happy', 1.6, 1);
        }
        endI(I, 6, 6);
        return false;
      }
      case 'race': {
        const gx = I.data.gx, gy = I.data.gy;
        if (I.t < 1) { B.stay(it); it.face = Math.atan2(gy - e.y, gx - e.x); if (!I.data['r' + e.id]) { I.data['r' + e.id] = true; M().say(s, 'sparkle', 1, 1); } return true; }
        B.go(it, gx, gy, 1.2);
        if (Math.hypot(gx - e.x, gy - e.y) < 24 && !I.data.winner) {
          I.data.winner = e;
          M().feel(s, 'joy', 0.6); M().say(s, 'sparkle', 2, 2); s.vis.hop = 0.35;
          M().feel(os, 'embarrassment', 0.35); M().say(os, 'sweat', 2, 2);
          AI.Rel.adjust(s, other.id, { b: 0.1, r: 0.08 }); AI.Rel.adjust(os, e.id, { b: 0.1, r: 0.12 });
          endI(I, 20, 20);
          return false;
        }
        return true;
      }
      case 'gather': {
        if (isA) {
          if (d > other.r + e.r + 40) { B.go(it, other.x, other.y, 0.5); it.face = face; return true; }
          B.stay(it); it.face = face;
          if (Math.random() < dt * 0.3) M().say(s, Math.random() < 0.6 ? 'question' : 'happy', 1.2, 0.6);
          if (!os.beh || os.beh.id !== 'sleep' || I.t > 15) { endI(I); return false; }
          return true;
        }
        // the sleeper keeps sleeping; it isn't an active participant
        endI(I);
        return false;
      }
      default:
        endI(I);
        return false;
    }
  }

  // the behavior wrapper the brain picks while an interaction is running
  AI.Behaviors.add({
    id: 'social', tier: 7, minCommit: 1, emotion: (s) => (s.social && (s.social.type === 'spar' || s.social.type === 'bully') ? 'anger' : s.social && s.social.type === 'greet' ? 'curiosity' : 'joy'),
    score(e, s) { return s.social ? 1.2 : 0; },
    update: step,
    end(e, s) { if (s.social) { const I = s.social; endI(I); } },
  });
  // migrating herds walk somewhere far together
  AI.Behaviors.add({
    id: 'migrate', tier: 8, minCommit: 4, emotion: null,
    score(e, s) {
      const g = groups.get(s.group);
      return g && g.kind === 'migration' && g.goal && AI.time < g.goal.until ? 0.9 : 0;
    },
    update(e, s, dt, it) {
      const g = groups.get(s.group);
      if (!g || !g.goal) return false;
      const lead = g.leader && !g.leader.dead ? g.leader : e;
      const tx = lead === e ? g.goal.x : lead.x + (e.id % 5 - 2) * 26, ty = lead === e ? g.goal.y : lead.y + ((e.id >> 2) % 5 - 2) * 22;
      AI.Behaviors.go(it, tx, ty, lead === e ? 0.7 : 0.8);
      if (AI.time > g.goal.until) { g.goal = null; g.kind = 'friends'; return false; }
      return true;
    },
  });

  function think(e, s) {
    // pack courage: a big enough group makes its members bolder
    const g = groups.get(s.group);
    if (g) {
      let near = 0;
      for (const m of g.members) if (m !== e && !m.dead && Math.abs(m.x - e.x) + Math.abs(m.y - e.y) < 420) near++;
      s.packBold = g.kind === 'pack' && near >= 2;
      if (g.leader === e || !g.leader || g.leader.dead) g.leader = e;
      g.apart = near === 0 ? g.apart + 1 : 0;
      if (g.apart > 40) leave(e); // drifted apart for good
      // betrayal: a groupmate that keeps hurting us
      if (s.betrayed) { const o = AI.R.EnemyMgr.get(s.betrayed.key); if (o && o.psx && o.psx.group === s.group) { leave(e); M().say(s, 'anger', 2, 3); } }
    }
    // social need satisfied by company
    if (s.mind.needs.social > 0.7 && !s.social && s.ctx.near.length) s.socialCd = Math.min(s.socialCd || 0, AI.time);
  }

  function tick(dt) {
    directorTick(dt);
    // drop dead members
    if (Math.random() < dt) for (const g of groups.values()) for (const m of g.members) if (m.dead || !AI.R.EnemyMgr.get(m.id)) { if (m.psx) leave(m); else g.members.delete(m); }
  }

  function clear() { groups.clear(); hordes.clear(); active.length = 0; }

  AI.define('Social', { groups, newGroup, join, leave, leaderOf, groupTarget, markHorde, hordeTemp, joinHorde, think, tick, clear, active, startI, endI });
})();
