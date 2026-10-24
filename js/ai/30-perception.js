/* PokéSurvivor+ — Living World AI · perception & reactions
 * What an NPC can sense (distance, line of sight, sound, sleep, species senses) and how it
 * interprets what it perceives: attacks, deaths, explosions, calls for help, panic, rescues.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  // ---------------------------------------------------------------- entity helpers
  AI.players = [];
  AI.refreshPlayers = function () {
    const R = AI.R;
    const out = AI.players;
    out.length = 0;
    if (R.Game.player) out.push(R.Game.player);
    if (R.Coop && R.Coop.active && R.Coop.puppets) for (const p of R.Coop.puppets()) out.push(p);
  };
  AI.isPlayer = (ent) => !!ent && AI.players.includes(ent);
  AI.keyOf = (ent) => (!ent ? null : AI.isPlayer(ent) ? 'P' : ent.psx || ent instanceof AI.R.Enemy ? ent.id : null);
  AI.nearestPlayer = function (x, y) {
    let best = null, bd = Infinity;
    for (const p of AI.players) {
      if (p.dead) continue;
      const d = U.dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  AI.alive = (ent) => !!ent && !ent.dead && (AI.isPlayer(ent) || (ent.hp > 0 && AI.R.EnemyMgr.get(ent.id) === ent));

  // ---------------------------------------------------------------- line of sight
  function los(x1, y1, x2, y2) {
    const W = AI.R.World;
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.min(40, Math.ceil(d / 26));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (W.isWall(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  }

  // would a projectile fired from (x1,y1) to (x2,y2) get through? (walls AND solid props like trees/rocks)
  function clearShot(x1, y1, x2, y2, r = 6) {
    const W = AI.R.World;
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.min(30, Math.ceil(d / 22));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (W.projectileBlock(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r)) return false;
    }
    return true;
  }

  function asleep(s) { return s.beh && s.beh.id === 'sleep'; }

  function sightRange(s) {
    if (asleep(s)) return 0;
    const tr = s.pers.tr;
    let r = 310 * s.p.sight * (0.8 + tr.alertness * 0.4);
    if (s.beh && s.beh.distracting) r *= 0.75;
    // fog, rain and darkness shorten sight (night species keep their night vision)
    if (AI.Sky) r *= AI.Sky.visibility(AI.Areas && AI.Areas.active(s.p.dex) === 'night');
    else { const w = AI.R.Weather && AI.R.Weather.current; if (w && w.kind === 'fog') r *= 0.6; }
    return r;
  }

  // ---------------------------------------------------------------- sensing pass (once per think)
  function sense(e, s) {
    const R = AI.R;
    const c = s.ctx;
    c.near.length = 0;
    const R2 = s.lod === 0 ? 330 : 240;
    const list = R.EnemyMgr.queryCircle(e.x, e.y, R2);
    for (const o of list) {
      if (o === e || o.dead) continue;
      o._d2 = U.dist2(e.x, e.y, o.x, o.y);
      c.near.push(o);
    }
    c.near.sort((a, b) => a._d2 - b._d2);
    if (c.near.length > 10) c.near.length = 10;
    s.alone = c.near.length === 0;

    const p = AI.nearestPlayer(e.x, e.y);
    c.player = p;
    c.pd = p ? Math.hypot(p.x - e.x, p.y - e.y) : Infinity;
    let seen = false;
    if (p) {
      if (asleep(s)) {
        // a light sleeper may notice someone right next to it
        seen = c.pd < 55 && Math.random() < s.pers.tr.alertness * 0.25;
      } else {
        // a lit lantern is easy to spot in the dark
        const lit = AI.Light && AI.Sky && AI.Sky.darkness() > 0.4 && AI.Light.lanternOn() ? 1.35 : 1;
        const range = (sightRange(s) + (p.walking ? 60 : 0)) * lit;
        if (c.pd < 85 * s.p.hearing) seen = true;
        else if (c.pd < range) {
          if (AI.time - c.losT > 0.35) { c.losT = AI.time; c.losOk = los(e.x, e.y, p.x, p.y); }
          seen = c.losOk;
        }
      }
    }
    c.pSeen = seen;
    c.pHeard = false;
    if (seen) { c.pLastSeen = AI.time; c.pLastX = p.x; c.pLastY = p.y; }
    else if (p && AI.playerNoise && AI.time - AI.playerNoise.t < 1.2) {
      // battle noise carries: hunters home in on it, the timid treat it as danger, the curious come look
      const tr = s.pers.tr;
      const hr = (280 + 420 * tr.aggression + (s.stance === 'hostile' ? 220 : 0)) * s.p.hearing * (asleep(s) ? 0.3 : 1);
      if (c.pd < hr) {
        c.pHeard = true;
        if (s.stance === 'hostile') { c.pLastSeen = AI.time; c.pLastX = p.x; c.pLastY = p.y; }
        else if (!s.poi || AI.time - s.poi.t > 6) {
          const timid = tr.bravery < 0.4;
          s.poi = { x: AI.playerNoise.x, y: AI.playerNoise.y, t: AI.time, kind: timid ? 'danger' : 'boom' };
          if (timid) AI.Mind.feel(s, 'fear', 0.12, 'battle');
          else if (tr.curiosity > 0.5 || tr.aggression > 0.6) AI.Mind.feel(s, 'curiosity', 0.2);
        }
      }
    }
    assessThreats(e, s);
  }

  // Threat & opportunity assessment from what is perceived right now.
  function assessThreats(e, s) {
    const c = s.ctx;
    const S = AI.Species;
    const myPow = S.power(e) * (0.4 + 0.6 * e.hp / Math.max(1, e.maxHp));
    c.threat = null; c.threatV = 0; c.prey = null; c.rival = null; c.friendNear = null; c.weakNear = null;
    let tv = 0;
    for (const o of c.near) {
      const os = o.psx;
      const d = Math.sqrt(o._d2);
      const r = s.rel.get(o.id);
      let hostile = 0;
      if (os && os.combat && os.combat.target === e) hostile = 1;
      else if (r) hostile = Math.max(hostile, AI.Rel.hostility(r) * 0.8);
      const innate = os ? S.relationOf(s.p, os.p, s.pers) : null;
      if (innate === 'predator') hostile = Math.max(hostile, 0.7);
      if (o.boss || o.legend) hostile = Math.max(hostile, 0.55);
      const ratio = S.power(o) / Math.max(60, myPow);
      const v = hostile * U.clamp(ratio, 0.3, 4) * (1 - d / 400);
      if (v > tv) { tv = v; c.threat = o; }
      if (innate === 'prey' && !c.prey && (!r || r.b < 0.3)) c.prey = o;
      if ((innate === 'rival' || (r && r.r > 0.45)) && !c.rival) c.rival = o;
      if (r && r.b > 0.4 && !c.friendNear) c.friendNear = o;
      if (o.hp < o.maxHp * 0.3 && !c.weakNear) c.weakNear = o;
    }
    // the player as a threat
    if (c.player && (c.pSeen || AI.time - c.pLastSeen < 2)) {
      const rp = s.rel.get('P');
      let hostile = rp ? Math.max(rp.f, AI.Rel.hostility(rp) * 0.6) : 0;
      if (s.lastHurtBy && s.lastHurtBy.key === 'P' && AI.time - s.lastHurtBy.t < 6) hostile = Math.max(hostile, 0.9);
      const pl = AI.Legend ? AI.Legend.playerAura(e, s) : 0;
      hostile = Math.max(hostile, pl);
      const ratio = AI.playerPower(c.player) / Math.max(60, myPow);
      const v = hostile * U.clamp(ratio, 0.3, 5) * (1 - Math.min(1, c.pd / 450));
      if (v > tv) { tv = v; c.threat = c.player; }
    }
    c.threatV = tv;
  }

  AI.playerPower = function (p) {
    const d = AI.R.DEX_BY[p.dex];
    const bst = (d && d.bst) || 400;
    return bst * (1 + Math.min(2.5, (p.level || 1) / 28)) * (0.5 + 0.5 * p.hp / Math.max(1, p.maxHp)) * (d && d.leg ? 1.4 : 1);
  };

  // ---------------------------------------------------------------- event perception
  function perceives(e, s, ev) {
    const d = Math.hypot(ev.x - e.x, ev.y - e.y);
    let hear = ev.loud * s.p.hearing;
    if (asleep(s)) hear *= ev.loud >= 380 ? 0.9 : 0.22 + s.pers.tr.alertness * 0.2;
    if (d <= hear) return d;
    if (!asleep(s) && d <= sightRange(s) && los(e.x, e.y, ev.x, ev.y)) return d;
    return -1;
  }

  function process(e, s) {
    AI.Bus.since(s.lastEv, 3, (ev) => {
      if (ev.src === e || ev.victim === e) return; // own events are handled at the source
      const d = perceives(e, s, ev);
      if (d < 0) return;
      try { react(e, s, ev, d); } catch (err) { AI.warn('react', err); }
    });
    s.lastEv = AI.Bus.head;
  }

  const M = () => AI.Mind;
  function wake(e, s, how) {
    if (!asleep(s)) return;
    s.wokeAt = AI.time;
    s.forceThink = true;
    M().feel(s, 'surprise', 0.8);
    M().say(s, 'surprise', 1.1, 3);
    if (how === 'startled') M().feel(s, 'fear', 0.25);
  }

  function react(e, s, ev, d) {
    const Mind = M();
    const tr = s.pers.tr;
    const near = 1 - Math.min(1, d / Math.max(1, ev.loud));
    switch (ev.type) {
      case 'hit': witnessHit(e, s, ev, near); break;
      case 'death': witnessDeath(e, s, ev, near); break;
      case 'boom': {
        if (ev.thunder) break; // thunder has its own, more varied reactions (62-envbeh)
        if (asleep(s) && ev.loud >= 300) wake(e, s, 'startled');
        const k = U.clamp(ev.power || 0.6, 0.2, 1.5) * near;
        Mind.feel(s, 'surprise', 0.6 * k);
        if (tr.bravery < 0.45 || (ev.power || 0) > 1) Mind.feel(s, 'fear', 0.5 * k, ev.srcKey);
        else if (tr.aggression > 0.6 || tr.curiosity > 0.6) { Mind.feel(s, 'curiosity', 0.4 * k); s.poi = { x: ev.x, y: ev.y, t: AI.time, kind: 'boom' }; }
        s.forceThink = true;
        break;
      }
      case 'cry': {
        const srcKey = AI.keyOf(ev.src);
        const r = srcKey != null ? s.rel.get(srcKey) : null;
        const bond = r ? r.b + Math.max(0, r.a) * 0.5 : 0;
        if (ev.kind === 'help') {
          if (asleep(s) && bond > 0.3) wake(e, s);
          if (bond > 0.25 || (tr.protectiveness > 0.7 && (!r || r.a > -0.2))) {
            s.defend = { victim: ev.src, attacker: ev.foe, t: AI.time };
            Mind.feel(s, 'anger', 0.25 + bond * 0.4, AI.keyOf(ev.foe));
            s.forceThink = true;
          } else Mind.feel(s, 'fear', 0.15 * near);
        } else if (ev.kind === 'panic' && !(ev.foeKey === 'thunder' && s.p.types.includes('electric'))) {
          // emotional contagion: a strong Pokémon running away is very convincing (thunder doesn't scare electric types)
          const ratio = ev.src ? AI.Species.power(ev.src) / Math.max(60, AI.Species.power(e)) : 1;
          const amp = AI.Legend ? AI.Legend.contagionAmp(e) : 1;
          Mind.feel(s, 'fear', (0.12 + 0.25 * U.clamp(ratio, 0.4, 3) * (1 - tr.bravery)) * near * amp, ev.foeKey);
          Mind.feel(s, 'surprise', 0.3 * near);
          if (ev.foeX != null) s.poi = { x: ev.foeX, y: ev.foeY, t: AI.time, kind: 'danger' };
          s.forceThink = true;
        } else if (ev.kind === 'warn') {
          Mind.feel(s, 'suspicion', 0.4 * near, ev.foeKey);
          if (bond > 0.2) Mind.feel(s, 'fear', 0.2);
        } else if (ev.kind === 'play' && tr.playfulness > 0.5 && !s.inCombat) {
          Mind.feel(s, 'excitement', 0.25 * near);
        } else if (ev.kind === 'challenge' && srcKey != null) {
          if (r && r.r > 0.3) { Mind.feel(s, 'anger', 0.3, srcKey); s.forceThink = true; }
        } else if (ev.kind === 'laugh' && ev.target === e) {
          Mind.feel(s, 'embarrassment', 0.5);
          Mind.say(s, 'sweat', 1.6, 2);
        }
        break;
      }
      case 'evolve': {
        Mind.feel(s, 'surprise', 0.7 * near);
        Mind.say(s, 'surprise', 1.2, 2);
        const r = s.rel.get(AI.keyOf(ev.src));
        if (r && r.b > 0.3) { Mind.feel(s, 'excitement', 0.6); Mind.feel(s, 'joy', 0.4); }
        else if (r && (r.r > 0.3 || r.g > 0.3)) Mind.feel(s, 'anger', 0.25, AI.keyOf(ev.src)); // jealousy
        else if (ev.src && AI.Species.power(ev.src) > AI.Species.power(e) * 1.6) Mind.feel(s, 'fear', 0.35 * (1 - tr.bravery), AI.keyOf(ev.src));
        else Mind.feel(s, 'curiosity', 0.5);
        s.poi = { x: ev.x, y: ev.y, t: AI.time, kind: 'evolve', src: ev.src };
        break;
      }
      case 'legend':
        if (AI.Legend) AI.Legend.reactPulse(e, s, ev, near);
        break;
      default:
        break;
    }
  }

  function victimWasPeaceful(victim, actor) {
    const vs = victim.psx;
    if (!vs) return !(victim.boss || victim.legend);
    if (vs.combat && vs.combat.target === actor) return false;
    if (actor && AI.isPlayer(actor) && vs.stance === 'hostile') return false;
    return true;
  }

  function witnessHit(e, s, ev, near) {
    const Mind = M();
    const tr = s.pers.tr;
    const victim = ev.victim;
    if (!victim) return;
    const vKey = AI.keyOf(victim);
    const rv = vKey != null ? s.rel.get(vKey) : null;
    const bond = rv ? rv.b + Math.max(0, rv.a) * 0.5 : 0;
    const kin = victim.dex === e.dex || (victim.psx && AI.Species.sameFamily(victim.dex, e.dex));
    const sev = U.clamp((ev.frac || 0.05) * 3, 0.08, 1);
    if (asleep(s) && ev.loud > 250 && near > 0.5) wake(e, s);
    Mind.feel(s, 'surprise', 0.25 * near * sev);
    if (ev.actorKey === 'P') {
      const vt = victim.psx && victim.psx.combat && victim.psx.combat.target;
      const vtKey = vt ? AI.keyOf(vt) : null;
      const rvt = vtKey != null && vtKey !== 'P' ? s.rel.get(vtKey) : null;
      if (vt === e) {
        // the player is hitting the one that was attacking ME — a rescue
        AI.Rel.adjust(s, 'P', { a: 0.12 + 0.25 * sev, g: -0.15, f: -0.1 });
        s.truce = AI.time + 20;
        Mind.feel(s, 'surprise', 0.4);
        if (!s.rescuedAt || AI.time - s.rescuedAt > 6) { s.rescuedAt = AI.time; Mind.say(s, s.rel.get('P').a > 0.3 ? 'love' : 'surprise', 1.6, 2); }
        return;
      }
      if (rvt && (rvt.b > 0.3 || rvt.a > 0.35)) {
        // …or attacking someone I care about
        AI.Rel.adjust(s, 'P', { a: 0.06 + 0.12 * sev, g: -0.08 });
        s.truce = AI.time + 12;
        return;
      }
      if (victimWasPeaceful(victim, ev.actor)) {
        // the player attacked someone who wasn't bothering anyone
        const k = sev * (1 + bond * 1.5 + (kin ? 0.5 : 0) + tr.protectiveness * 0.4);
        AI.Rel.adjust(s, 'P', { a: -0.08 * k, f: 0.07 * k * (1 - tr.bravery), g: 0.04 * k * tr.grudge });
        Mind.feel(s, 'suspicion', 0.3 * k, 'P');
        if (bond > 0.3 || (kin && tr.protectiveness > 0.6) || (tr.protectiveness > 0.85 && tr.bravery > 0.6)) {
          s.defend = { victim, attacker: ev.actor, t: AI.time };
          Mind.feel(s, 'anger', 0.35 + bond * 0.4, 'P');
          s.forceThink = true;
        } else if (tr.bravery < 0.4) {
          Mind.feel(s, 'fear', 0.3 * k, 'P');
          s.forceThink = true;
        }
      } else if (rv && (rv.g > 0.3 || rv.a < -0.3)) {
        // the player is fighting someone we dislike — a rescue
        AI.Rel.adjust(s, 'P', { a: 0.06 * sev, f: -0.03 });
        Mind.feel(s, 'joy', 0.1);
      }
      return;
    }
    if (ev.actor && ev.actorKey != null) {
      const actor = ev.actor;
      const ra = s.rel.get(ev.actorKey);
      if (bond > 0.25 && actor !== e) {
        AI.Rel.adjust(s, ev.actorKey, { a: -0.12 * sev, g: 0.12 * sev });
        Mind.feel(s, 'anger', 0.3 + bond * 0.3, ev.actorKey);
        s.defend = { victim, attacker: actor, t: AI.time };
        s.forceThink = true;
      } else if (ra && ra.b > 0.35 && rv && rv.g + Math.max(0, -rv.a) > 0.4) {
        s.assist = { ally: actor, foe: victim, t: AI.time }; // our friend is fighting our enemy
      } else if (tr.greed > 0.6 && victim.hp < victim.maxHp * 0.35 && victim !== e) {
        s.opportunity = { target: victim, t: AI.time };
      } else if (tr.bravery < 0.35) {
        Mind.feel(s, 'fear', 0.12 * near * sev, ev.actorKey);
      }
      if (ev.accidental && ra && ra.b > 0.2) Mind.feel(s, 'suspicion', 0.15);
    }
  }

  function witnessDeath(e, s, ev, near) {
    const Mind = M();
    const tr = s.pers.tr;
    const vKey = ev.victimKey;
    const rv = vKey != null ? s.rel.get(vKey) : null;
    const bond = rv ? rv.b + Math.max(0, rv.a) * 0.5 : 0;
    const kin = ev.victimDex === e.dex;
    if (asleep(s) && near > 0.4) wake(e, s);
    Mind.feel(s, 'surprise', 0.5 * near);
    Mind.say(s, 'surprise', 1, 2);
    if (bond > 0.25 || (kin && tr.sociability > 0.6)) {
      Mind.feel(s, 'sadness', 0.45 + bond * 0.5);
      s.mourn = { x: ev.x, y: ev.y, t: AI.time, who: vKey };
      if (ev.killerKey != null) {
        AI.Rel.adjust(s, ev.killerKey, { a: -0.35 * (bond + 0.3), g: 0.5 * (bond + 0.2) * (0.5 + tr.grudge) });
        Mind.feel(s, 'anger', (0.25 + bond * 0.5) * (0.4 + tr.aggression + tr.protectiveness * 0.4), ev.killerKey);
      }
    }
    if (ev.killerKey === 'P' && ev.victimPeaceful) {
      AI.Rel.adjust(s, 'P', { a: -0.14 * (1 + bond), f: 0.14 * (1 - tr.bravery) });
      Mind.feel(s, 'fear', 0.3 * (1 - tr.bravery) * near, 'P');
    } else if (ev.killerKey === 'P' && rv && rv.g > 0.3) {
      AI.Rel.adjust(s, 'P', { a: 0.15, f: -0.05 }); // our tormentor is gone
      Mind.feel(s, 'joy', 0.2);
    } else if (tr.bravery < 0.4) {
      Mind.feel(s, 'fear', 0.3 * near, ev.killerKey);
    }
    s.forceThink = true;
  }

  // ---------------------------------------------------------------- being hurt (immediate, no perception needed)
  function onHurt(e, s, attacker, key, dmg, accidental) {
    const Mind = M();
    const tr = s.pers.tr;
    const frac = dmg / Math.max(1, e.maxHp);
    s.lastHurtBy = { key, ent: attacker, t: AI.time, dmg };
    s.hurtRecent = (s.hurtRecent || 0) + frac;
    if (key === 'P') s.lastPlayerHitAt = AI.time;
    if (asleep(s)) wake(e, s, 'startled');
    Mind.feel(s, 'surprise', 0.7);
    if (frac > 0.04 || !s.hurtBubbleAt || AI.time - s.hurtBubbleAt > 2) { Mind.say(s, 'surprise', 0.7, 3); s.hurtBubbleAt = AI.time; }
    if (key == null) { Mind.feel(s, 'fear', 0.1); s.forceThink = true; return; }
    const r = AI.Rel.get(s, key);
    const wasFriend = r.a > 0.3 || r.b > 0.3;
    const k = U.clamp(frac * 4, 0.12, 1.2);
    if (accidental && wasFriend) {
      // friendly fire: forgiving natures shrug it off once, but it adds up
      r.ff++;
      const forgive = tr.forgiveness * (r.ff <= 1 ? 1 : 0.4);
      if (Math.random() < forgive) {
        Mind.feel(s, 'confusion', 0.3);
        AI.Rel.adjust(s, key, { a: -0.06 * k });
      } else {
        AI.Rel.adjust(s, key, { a: -0.25 * k - 0.1 * r.ff, g: 0.3 * k + 0.08 * r.ff, b: -0.15 * k });
        Mind.feel(s, 'anger', 0.45 + 0.15 * r.ff, key);
        s.mind.next = { icon: 'anger', at: AI.time + 0.45, dur: 1.8, prio: 3 };
        if (r.ff >= 3) s.betrayed = { key, t: AI.time };
      }
    } else {
      AI.Rel.adjust(s, key, { a: -(0.18 + 0.4 * k) * (wasFriend ? 1.6 : 1), g: (0.12 + 0.35 * k) * (0.5 + tr.grudge), b: wasFriend ? -0.35 : 0 });
      // fight-or-flight depends on temperament, power and how bad it hurt
      const atkPow = attacker ? (AI.isPlayer(attacker) ? AI.playerPower(attacker) : AI.Species.power(attacker)) : 300;
      const ratio = atkPow / Math.max(60, AI.Species.power(e));
      const hpf = e.hp / Math.max(1, e.maxHp);
      const fightiness = tr.aggression * 0.6 + tr.bravery * 0.5 - ratio * 0.25 + (s.pers.temp === 'aggressive' || s.pers.temp === 'territorial' ? 0.3 : 0) - (hpf < 0.35 ? 0.3 : 0);
      if (fightiness > 0.4) Mind.feel(s, 'anger', 0.35 + k * 0.5, key);
      else {
        Mind.feel(s, 'fear', 0.35 + k * 0.6, key);
        AI.Rel.adjust(s, key, { f: 0.25 + k * 0.4 });
        if (s.pers.temp === 'friendly' || s.pers.temp === 'timid' || s.pers.temp === 'playful') Mind.feel(s, 'sadness', 0.35 + k * 0.4, key);
      }
      if (wasFriend && key === 'P') Mind.feel(s, 'sadness', 0.5, key); // betrayed by a friend
    }
    s.forceThink = true;
    s.reactT = AI.time + reactionDelay(s) * 0.5;
  }

  function reactionDelay(s) {
    const tr = s.pers.tr;
    let r = 0.42 - tr.alertness * 0.18 - tr.agility * 0.12 + (s.beh && s.beh.distracting ? 0.25 : 0) + (s.mind.needs.energy < 0.2 ? 0.2 : 0);
    if (s.pers.quirks.has('dazed')) r += 0.6;
    return U.clamp(r, 0.08, 1.4);
  }

  AI.define('Perception', { los, clearShot, sense, process, perceives, onHurt, reactionDelay, sightRange, asleep, victimWasPeaceful });
})();
