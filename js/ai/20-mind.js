/* PokéSurvivor+ — Living World AI · minds
 * Emotions (continuous, decaying, personality-scaled), needs, transient expression bubbles,
 * relationships with the player and other Pokémon, and a memory bank that lets important
 * individuals (and their opinion of you) come back after they wander off-screen.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const EMO = ['joy', 'fear', 'anger', 'sadness', 'curiosity', 'affection', 'embarrassment', 'surprise', 'suspicion', 'excitement', 'confusion'];
  const DECAY = { joy: 0.07, fear: 0.05, anger: 0.045, sadness: 0.028, curiosity: 0.1, affection: 0.03, embarrassment: 0.15, surprise: 0.9, suspicion: 0.055, excitement: 0.12, confusion: 0.09 };
  const BASE = { joy: 0.12, curiosity: 0.1 };
  // emotion → bubble icon (see 95-render.js for the painters)
  const ICON = { joy: 'happy', fear: 'scared', anger: 'anger', sadness: 'tear', curiosity: 'question', affection: 'love', embarrassment: 'sweat', surprise: 'surprise', suspicion: 'eyes', excitement: 'sparkle', confusion: 'swirl', sleepy: 'zzz', hunger: 'food' };

  function create(pers) {
    const emo = {};
    for (const k of EMO) emo[k] = BASE[k] || 0;
    if (pers.temp === 'playful') emo.joy = 0.3;
    if (pers.temp === 'timid') emo.suspicion = 0.15;
    return {
      emo,
      cause: {}, // emotion → entity/event key that caused it (fear of X, anger at Y)
      needs: { energy: U.rand(0.6, 1), hunger: U.rand(0, 0.45), social: U.rand(0, 0.4) },
      bubble: { icon: null, t: 0, prio: 0, hold: 0 },
      peak: { anger: 0, fear: 0, joy: 0, affection: 0, determination: 0 },
    };
  }

  // add emotion with personality scaling; returns the new value
  function feel(s, key, amt, cause) {
    const m = s.mind;
    if (!m || !(key in m.emo)) return 0;
    const tr = s.pers.tr;
    let k = 1;
    if (amt > 0) {
      if (key === 'fear') k = 1.35 - tr.bravery * 0.9;
      else if (key === 'anger') k = 0.45 + tr.aggression * 0.8 + (s.pers.quirks.has('hothead') ? 0.35 : 0);
      else if (key === 'joy' || key === 'excitement') k = 0.6 + tr.playfulness * 0.6;
      else if (key === 'curiosity') k = 0.4 + tr.curiosity * 0.9;
      else if (key === 'affection') k = 0.5 + tr.sociability * 0.7;
      else if (key === 'embarrassment') k = s.pers.quirks.has('proud') ? 1.5 : 1;
      else if (key === 'surprise') k = 0.6 + tr.alertness * 0.6;
      k *= AI.Legend ? AI.Legend.emotionAmp(s, key) : 1;
      k *= AI.Natures ? AI.Natures.feelK(s, key) : 1;
    }
    const v = U.clamp(m.emo[key] + amt * k, 0, 1);
    m.emo[key] = v;
    if (cause != null && amt > 0) m.cause[key] = cause;
    if (m.peak[key] != null && v > m.peak[key]) m.peak[key] = v;
    return v;
  }

  function tick(e, s, dt) {
    const m = s.mind;
    const tr = s.pers.tr;
    for (const k of EMO) {
      let r = DECAY[k];
      if (k === 'fear') r *= 0.55 + tr.bravery * 0.9;
      else if (k === 'anger') r *= 0.4 + tr.forgiveness * 1.1 - tr.grudge * 0.2;
      else if (k === 'sadness') r *= 0.6 + tr.sociability * 0.5;
      if (AI.Natures) r *= AI.Natures.decayK(s, k);
      const b = BASE[k] || 0;
      const v = m.emo[k];
      m.emo[k] = v > b ? Math.max(b, v - r * dt) : Math.min(b, v + r * dt * 0.5);
    }
    if (AI.Legend) AI.Legend.calmness(s, dt);
    // needs
    const n = m.needs;
    const asleep = s.beh && s.beh.id === 'sleep';
    const active = s.moving ? 1 : 0.35;
    if (asleep) n.energy = Math.min(1, n.energy + dt * (0.03 + (1 - tr.laziness) * 0.02));
    else n.energy = Math.max(0, n.energy - dt * (0.004 + tr.laziness * 0.006) * active * (s.inCombat ? 3 : 1));
    n.hunger = Math.min(1, n.hunger + dt * (0.0035 + (s.pers.quirks.has('glutton') ? 0.006 : 0)));
    n.social = U.clamp(n.social + dt * (s.alone ? 0.006 * tr.sociability : -0.02), 0, 1);
    // determination: hurt but still fighting, or protecting someone
    const hpf = e.hp / Math.max(1, e.maxHp);
    const det = s.inCombat ? (1 - hpf) * (0.4 + tr.bravery * 0.6) + m.emo.anger * 0.4 : 0;
    m.peak.determination = Math.max(m.peak.determination * (1 - dt * 0.05), det);
    // bubble timers
    const bb = m.bubble;
    if (bb.t > 0) bb.t -= dt;
    if (bb.hold > 0) bb.hold -= dt;
    // queued follow-up bubble (e.g. ‼ then 💢 after friendly fire)
    if (m.next && AI.time >= m.next.at) {
      const nx = m.next;
      m.next = null;
      bb.hold = 0;
      say(s, nx.icon, nx.dur, nx.prio);
    }
  }

  function dominant(s, min = 0.35) {
    const em = s.mind.emo;
    let best = null, bv = min;
    for (const k of EMO) {
      if (k === 'curiosity' && em[k] < 0.5) continue;
      const v = em[k] * (k === 'surprise' ? 1.2 : 1);
      if (v > bv) { bv = v; best = k; }
    }
    if (s.mind.needs.energy < 0.12 && bv < 0.6) return 'sleepy';
    if (s.mind.needs.hunger > 0.88 && bv < 0.6) return 'hunger';
    return best;
  }

  // Transient bubble (e.g. ‼ when surprised). prio decides what wins when several fire at once.
  function say(s, icon, dur = 1.6, prio = 1) {
    const bb = s.mind.bubble;
    if (bb.hold > 0 && prio < bb.prio) return;
    bb.icon = icon; bb.t = dur; bb.prio = prio; bb.hold = Math.min(dur, 0.6);
    s.bubbleAt = AI.time;
  }

  // The bubble shown for an NPC: a fresh transient one, else the emotion driving its current behavior.
  function bubbleFor(s) {
    const bb = s.mind.bubble;
    if (bb.t > 0 && bb.icon) return { icon: bb.icon, prio: 2 + bb.prio, fresh: true };
    let emo = s.beh && s.beh.emotion ? (typeof s.beh.emotion === 'function' ? s.beh.emotion(s) : s.beh.emotion) : null;
    if (!emo) emo = dominant(s, 0.55);
    if (!emo) return null;
    const v = emo === 'sleepy' ? 0.8 : emo === 'hunger' ? 0.7 : s.mind.emo[emo] || 0.5;
    // "zzz" only once it's actually lying down asleep; on the way there it just looks drowsy
    if (emo === 'sleepy' && !(s.beh && s.beh.id === 'sleep' && s.bs.down)) return { icon: 'dots', prio: v * 0.6, fresh: false, emo };
    return { icon: ICON[emo] || emo, prio: v, fresh: false, emo };
  }

  // ---------------------------------------------------------------- relationships
  const REL_CAP = 22;
  function rel(s, key, create = true) {
    let r = s.rel.get(key);
    if (!r && create) {
      r = { a: 0, f: 0, g: 0, b: 0, r: 0, ff: 0, t: AI.time, met: AI.time, seen: AI.time };
      if (s.rel.size >= REL_CAP) evict(s);
      s.rel.set(key, r);
    }
    if (r) r.t = AI.time;
    return r;
  }
  function evict(s) {
    let worst = null, wv = Infinity;
    for (const [k, r] of s.rel) {
      if (k === 'P') continue;
      const v = Math.abs(r.a) + r.b + r.g + r.r + r.f - (AI.time - r.t) * 0.01;
      if (v < wv) { wv = v; worst = k; }
    }
    if (worst != null) s.rel.delete(worst);
  }
  function adjust(s, key, d) {
    const r = rel(s, key);
    if (d.a) r.a = U.clamp(r.a + d.a, -1, 1);
    if (d.f) r.f = U.clamp(r.f + d.f, 0, 1);
    if (d.g) r.g = U.clamp(r.g + d.g, 0, 1);
    if (d.b) r.b = U.clamp(r.b + d.b, 0, 1);
    if (d.r) r.r = U.clamp(r.r + d.r, 0, 1);
    return r;
  }
  // slow forgetting: grudges fade with forgiveness, fear fades, bonds persist much longer
  function relTick(s, dt) {
    const tr = s.pers.tr;
    for (const [k, r] of s.rel) {
      if (r.g > 0) r.g = Math.max(0, r.g - dt * 0.004 * (0.3 + tr.forgiveness * 1.4));
      if (r.f > 0) r.f = Math.max(0, r.f - dt * 0.006 * (0.5 + tr.bravery));
      if (r.r > 0) r.r = Math.max(0, r.r - dt * 0.0015);
      if (r.b > 0 && AI.time - r.seen > 120) r.b = Math.max(0, r.b - dt * 0.001);
      if (k !== 'P' && typeof k === 'number' && AI.time - r.t > 90 && Math.abs(r.a) < 0.15 && r.b < 0.1 && r.g < 0.1) s.rel.delete(k);
    }
  }
  const hostility = (r) => (r ? U.clamp(-r.a * 0.9 + r.g * 0.75 + r.r * 0.35, 0, 1.6) : 0);
  const warmth = (r) => (r ? U.clamp(r.a + r.b * 0.6 - r.g * 0.5, -1, 1.6) : 0);

  // ---------------------------------------------------------------- memory bank
  // Individuals that matter (strong opinion of the player, friendships, grudges) are remembered when they
  // despawn. A new Pokémon of the same species near the player may turn out to be the same individual.
  const bank = new Map();
  const Memory = {
    bank,
    store(e) {
      const s = e.psx;
      if (!s) return;
      const rp = s.rel.get('P');
      const matters = (rp && (Math.abs(rp.a) > 0.3 || rp.g > 0.3 || rp.b > 0.3)) || s.evolvedFrom;
      if (!matters) return;
      const list = bank.get(e.dex) || [];
      list.push({ seed: s.pers.seed, temp: s.pers.temp, rp: rp ? { a: rp.a, f: rp.f, g: rp.g, b: rp.b } : null, t: AI.time, nick: s.nick, evolvedFrom: s.evolvedFrom });
      while (list.length > 6) list.shift();
      bank.set(e.dex, list);
    },
    recall(dex) {
      const list = bank.get(dex);
      if (!list || !list.length) return null;
      // the fresher the memory, the likelier the reunion
      const m = list[list.length - 1];
      const age = AI.time - m.t;
      if (age < 8 || Math.random() > U.clamp(0.55 - age / 600, 0.1, 0.55)) return null;
      list.pop();
      return m;
    },
    clear() { bank.clear(); },
  };

  AI.define('Mind', { EMO, ICON, create, feel, tick, dominant, say, bubbleFor });
  AI.define('Rel', { get: rel, adjust, tick: relTick, hostility, warmth });
  AI.define('Memory', Memory);
})();
