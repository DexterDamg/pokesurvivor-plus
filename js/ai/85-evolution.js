/* PokéSurvivor+ — Living World AI · dynamic evolution
 * Evolution is a living phenomenon: wild, hostile, friendly and player Pokémon can evolve in
 * real time. Growth accumulates from time, fights, emotions and hardship; the actual moment
 * comes from rage, desperation, protecting a friend, friendship, fear — or the world itself
 * (an ancient Moss Rock, an Ice Rock, a magnetic field, a volcano…). Memories survive it.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const M = () => AI.Mind;

  const FRIENDSHIP = new Set([172, 173, 174, 175, 113, 42, 133, 447, 298, 446, 406, 427, 433, 438, 439, 440]);
  const COCOON = new Set([11, 14, 266, 268, 412, 588]);
  const RAGE = new Set([129, 56, 66, 67, 74, 75, 246, 247, 443, 444, 371, 372, 608, 610, 611, 633, 634]);
  const MOSS_BIOMES = new Set([0, 3, 6, 14, 20]);
  const ICE_BIOMES = new Set([1, 8]);
  let globalCd = 0;

  function evosOf(dex) {
    const R = AI.R;
    const list = (R.EVOS && R.EVOS[dex]) || [];
    return list.filter(([to]) => R.DEX_BY[to] && R.SPRITE_META[to]);
  }

  // ---------------------------------------------------------------- special sites
  function siteOf(prop) {
    if (!prop || prop.type !== 'rock') return null;
    const b = AI.Env.biome();
    const h = U.hash(prop.tx, prop.ty, 77);
    if (ICE_BIOMES.has(b) ? h < 0.12 : h < 0.015) return 'ice';
    if (MOSS_BIOMES.has(b) ? h > 0.88 : h > 0.97) return 'moss';
    return null;
  }
  function siteNear(x, y, r) {
    let best = null, bd = r * r;
    for (const p of AI.Env.props(x, y, Math.max(r, 200))) {
      const k = AI.Evolution.siteOf(p); // overridable: mods can consecrate their own stones
      if (!k) continue;
      const d = U.dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = { kind: k, prop: p, x: p.x, y: p.y, d: Math.sqrt(d) }; }
    }
    return best;
  }

  // environmental affinity for each evolution branch
  function envScore(x, y, toTypes, ctx) {
    const E = AI.Env;
    const wx = E.weather();
    const lk = E.liquidKind();
    let sc = 0;
    const site = ctx.site || siteNear(x, y, 90);
    const has = (t) => toTypes.includes(t);
    if (site && site.kind === 'moss' && has('grass')) sc += 4;
    if (site && site.kind === 'ice' && has('ice')) sc += 4;
    if ((lk === 'ice' || wx === 'snow' || wx === 'hail') && has('ice')) sc += 2;
    if ((lk === 'spark' || wx === 'storm' || wx === 'electric') && has('electric')) sc += 2.5;
    if ((lk === 'lava' || wx === 'sun' || wx === 'harsh') && has('fire')) sc += 2;
    if (E.SWIMMABLE.has(lk) && E.isLiquid(x, y) && has('water')) sc += 2;
    if (wx === 'rain' && has('water')) sc += 1;
    if ((wx === 'fog' || wx === 'curse') && (has('dark') || has('ghost'))) sc += 2;
    if ((wx === 'psychic' || wx === 'misty') && (has('psychic') || has('fairy'))) sc += 2;
    if (ctx.affection > 0.6 && has('fairy')) sc += 2.5;
    if (ctx.affection > 0.6 && (has('psychic') || has('dark'))) sc += 1;
    if (ctx.rage && (has('fighting') || has('dark') || has('dragon'))) sc += 1;
    return sc;
  }

  function pickBranch(e, s, ctx) {
    const list = evosOf(e.dex);
    if (!list.length) return null;
    if (list.length === 1) return list[0][0];
    let best = null, bv = -1;
    for (const [to] of list) {
      const d = AI.R.DEX_BY[to];
      const v = envScore(e.x, e.y, d.types || [], ctx) + Math.random() * 1.2;
      if (v > bv) { bv = v; best = to; }
    }
    return best;
  }

  function need(e) {
    const list = evosOf(e.dex);
    const lvl = list.length ? list[0][1] || 25 : 25;
    return 8 + lvl * 0.5;
  }

  // ---------------------------------------------------------------- growth & triggers (NPCs)
  function think(e, s, dt) {
    if (!AI.cfg.evolution || s.lock || e.dead) return;
    if (!evosOf(e.dex).length) return;
    const em = s.mind.emo;
    const gt = (AI.R.Game.st && AI.R.Game.st.time) || AI.time;
    let g = dt * 0.012 * (1 + gt / 600);
    if (s.inCombat) g += dt * 0.05;
    if (em.anger > 0.8) g += dt * 0.08;
    if (s.beh && s.beh.id === 'defend') g += dt * 0.06;
    if (em.affection > 0.5) g += dt * 0.02;
    s.exp += g * AI.cfg.evoRate;
    const n = need(e);
    if (s.exp < n * 0.6 || globalCd > AI.time) return;
    const hpf = e.hp / Math.max(1, e.maxHp);
    const ready = s.exp >= n;
    let reason = null, p = 0;
    if (em.anger > 0.85) { reason = 'rage'; p = RAGE.has(e.dex) ? 0.35 : 0.15; }
    else if (s.inCombat && hpf < 0.35 && s.mind.peak.determination > 0.45) { reason = 'desperation'; p = 0.22; }
    else if (s.beh && s.beh.id === 'defend' && em.anger > 0.5) { reason = 'protect'; p = 0.18; }
    else if (em.affection > 0.6 && FRIENDSHIP.has(e.dex)) { reason = 'friendship'; p = 0.15; }
    else if (em.fear > 0.8 && COCOON.has(e.dex)) { reason = 'escape'; p = 0.2; }
    else if (s.siteT > 2.5) { reason = 'environment'; p = 0.6; }
    else if (s.exp > n * 1.6 && !s.inCombat && s.ctx.threatV < 0.1) { reason = 'growth'; p = 0.04; }
    if (!reason) return;
    if (!ready && reason !== 'rage' && reason !== 'environment') return;
    if (Math.random() < p * AI.cfg.evoRate) start(e, s, reason);
  }

  // an emotional surge (e.g. humiliation) adds growth and may trigger right away
  function surge(e, s, kind, amt) {
    if (!AI.cfg.evolution || !evosOf(e.dex).length) return;
    s.exp += need(e) * amt;
    if (kind === 'rage') s.mind.peak.anger = Math.max(s.mind.peak.anger, 0.9);
  }

  function start(e, s, reason) {
    const to = pickBranch(e, s, { affection: s.mind.emo.affection, rage: reason === 'rage', site: s.site });
    if (!to) return false;
    globalCd = AI.time + 20;
    const R = AI.R;
    AI.R.Sprites.preload([to], 4000, !!e.shiny);
    const inWater = !e.flying && AI.Env.isWater(e.x, e.y);
    M().say(s, reason === 'rage' ? 'anger' : reason === 'friendship' ? 'love' : 'sparkle', 2.6, 4);
    AI.Bus.emit({ type: 'evolve', x: e.x, y: e.y, loud: 480, src: e, phase: 'start' });
    s.dmgTakenK = 0.4;
    s.lock = {
      t: 0, dur: 2.8, to, reason,
      update(e2, s2, dt, it) {
        this.t += dt;
        it.stay = true;
        s2.vis.glow = 0.5 + 0.5 * Math.sin(this.t * (6 + this.t * 6));
        s2.vis.shake = 0.6 + this.t * 0.4;
        if (R.Camera.sees(e2.x, e2.y, 40)) {
          if (Math.random() < dt * 25) R.FX.twinkle(e2.x + U.rand(-e2.r * 1.6, e2.r * 1.6), e2.y - U.rand(0, e2.bodyH * 1.4));
          if (inWater && Math.random() < dt * 12) R.FX.burst(e2.x + U.rand(-30, 30), e2.y - 4, '#7fc8ff', 4, 120);
        }
        if (this.t >= this.dur) {
          s2.vis.glow = 0; s2.vis.shake = 0;
          apply(e2, s2, this.to, this.reason, inWater);
          return false;
        }
        return true;
      },
    };
    return true;
  }

  function apply(e, s, to, reason, fromWater) {
    const R = AI.R;
    const d = R.DEX_BY[to];
    if (!d) return;
    const oldP = s.p;
    const oldDex = e.dex, oldName = e.name;
    const newP = AI.Species.profile(to);
    const k = U.clamp(newP.bst / Math.max(150, oldP.bst), 1.05, 2.4);
    const hpf = e.hp / Math.max(1, e.maxHp);
    const dir = e.anim.dir;
    e.dex = to;
    e.name = d.name;
    e.types = d.types && d.types.length ? d.types : ['normal'];
    e.atkType = e.types[0];
    e.anim = new R.Sprites.Animator(to, e.scale, !!e.shiny);
    e.anim.dir = dir;
    e.r = R.Sprites.bodyRadius(to, e.scale);
    e.bodyH = R.Sprites.bodyHeight(to, e.scale);
    if (AI.Scale) { e._psxR0 = null; e._psxKOn = false; AI.Scale.apply(e); } // the new body's size
    e.flying = R.Sprites.hovers(to);
    e.maxHp = Math.round(e.maxHp * k);
    e.hp = Math.min(e.maxHp, e.maxHp * Math.min(1, hpf + 0.25));
    e.dmg = (e._dmg || e.dmg) * Math.sqrt(k);
    s.baseSpd *= U.clamp((newP.spe || 60) / Math.max(20, oldP.spe || 60), 0.75, 1.45);
    e.spd = s.baseSpd;
    e.xp = Math.round(e.xp * k);
    s.p = newP;
    s.dmgTakenK = 1;
    // personality matures with the body
    const tr = s.pers.tr;
    const grow = (newP.bst - oldP.bst) / 600;
    tr.bravery = U.clamp(tr.bravery + 0.15 + grow * 0.5, 0, 1);
    tr.aggression = U.clamp(tr.aggression + grow * 0.4, 0, 1);
    tr.intelligence = U.clamp(Math.max(tr.intelligence, newP.intelligence) + 0.05, 0, 1);
    if (oldDex === 129) { tr.aggression = Math.max(tr.aggression, 0.8); tr.bravery = Math.max(tr.bravery, 0.85); tr.grudge = Math.max(tr.grudge, 0.85); s.pers.quirks.add('hothead'); }
    for (const q of newP.quirks) s.pers.quirks.add(q);
    s.pers.quirks.delete('fish');
    s.pers.quirks.delete('flopper');
    // moves: keep what still fits, learn what the new body can do
    const fresh = AI.NpcMoves.build(e);
    const keep = s.combat.moves.filter((m) => m.cls !== 'splash' && m.id !== 'flail' && (e.types.includes(m.type) || m.cls === 'role-heal' || m.cls === 'role-shield')).slice(0, 2);
    const ids = new Set(keep.map((m) => m.id));
    s.combat.moves = keep.concat(fresh.filter((m) => !ids.has(m.id))).slice(0, 4);
    s.combat.stratT = 0;
    s.evolvedFrom = oldDex;
    s.exp = 0;
    s.env = {};
    // it remembers exactly what happened — and who did it
    if (s.bulliedBy && s.bulliedBy.e && !s.bulliedBy.e.dead) {
      AI.Rel.adjust(s, s.bulliedBy.e.id, { g: 0.6, a: -0.6 });
      M().feel(s, 'anger', 0.9, s.bulliedBy.e.id);
      s.lastHurtBy = { key: s.bulliedBy.e.id, ent: s.bulliedBy.e, t: AI.time };
    }
    if (s.humiliated && s.mind.cause.anger === 'P') M().feel(s, 'anger', 0.9, 'P');
    // former kin are now under its protection
    for (const o of s.ctx.near) if (o.dex === oldDex && o.psx) { AI.Rel.adjust(s, o.id, { b: 0.35, a: 0.3 }); AI.Rel.adjust(o.psx, e.id, { a: 0.2, f: -0.1 }); }
    R.FX.burst(e.x, e.y - e.bodyH * 0.5, '#ffffff', 40, 260);
    R.FX.ring(e.x, e.y, 8, 120 + e.r * 2, '#ffffff', 0.7, 6);
    if (fromWater) R.FX.burst(e.x, e.y - 6, '#7fc8ff', 30, 240);
    if (R.Camera.sees(e.x, e.y, 40)) { R.Camera.kick(0.5); R.Audio.sfx && R.Audio.sfx('legend'); announce(oldName, d.name); }
    if (fromWater) s.vis.rise = 1;
    // a moment to get used to the new body
    M().feel(s, 'confusion', 0.6);
    M().say(s, 'swirl', 1.3, 4);
    s.mind.next = { icon: s.mind.emo.anger > 0.5 ? 'anger' : 'sparkle', at: AI.time + 1.4, dur: 2.2, prio: 4 };
    AI.Bus.emit({ type: 'evolve', x: e.x, y: e.y, loud: 520, src: e, phase: 'done', from: oldDex, to });
    s.forceThink = true;
  }

  function announce(a, b) {
    const R = AI.R;
    if (!R.Spawner || !R.Spawner.say) return;
    const lang = (navigator.language || 'es').slice(0, 2);
    const T = { es: '¡El {a} salvaje ha evolucionado en {b}!', en: 'The wild {a} evolved into {b}!', fr: '{a} sauvage a évolué en {b} !', zh: '野生的{a}進化成了{b}！' };
    R.Spawner.say((T[lang] || T.en).replace('{a}', a).replace('{b}', b), 3, true);
  }

  // ---------------------------------------------------------------- environmental discovery behavior
  AI.Behaviors.add({
    id: 'evo-site', tier: 7, emotion: (s) => (s.bs.phase === 'curl' ? 'joy' : 'curiosity'), minCommit: 4, cd: 30, distracting: true,
    score(e, s) {
      if (!AI.cfg.evolution || s.lod > 0 || evosOf(e.dex).length === 0) return 0;
      const site = AI.Behaviors.nearProp && evoSiteFor(e, s);
      if (!site) return 0;
      return 0.55 + s.pers.tr.curiosity * 0.4;
    },
    start(e, s) { s.bs.site = evoSiteFor(e, s); s.bs.phase = 'go'; s.bs.t = 0; s.site = s.bs.site; },
    update(e, s, dt, it) {
      const st = s.bs.site;
      if (!st) return false;
      const d = Math.hypot(st.x - e.x, st.y + 10 - e.y);
      if (s.bs.phase === 'go') {
        if (d > 30) { AI.Behaviors.go(it, st.x + 18, st.y + 12, 0.5); return true; }
        s.bs.phase = 'sniff'; s.bs.t = 0; AI.Mind.say(s, 'question', 1.6, 1);
      }
      s.bs.t += dt;
      if (s.bs.phase === 'sniff') {
        // circle the stone, sniffing
        const a = s.bs.t * 1.6;
        AI.Behaviors.go(it, st.x + Math.cos(a) * 34, st.y + 10 + Math.sin(a) * 24, 0.45);
        if (s.bs.t > 3.2) { s.bs.phase = 'curl'; s.bs.t = 0; e.anim.play('Faint', { hold: true, speed: 0.6 }); }
        return true;
      }
      // curled up beside it… the stone begins to glow
      AI.Behaviors.stay(it);
      s.siteT = s.bs.t;
      if (AI.R.Camera.sees(st.x, st.y, 0) && Math.random() < dt * 8) AI.R.FX.px(st.x + U.rand(-14, 14), st.y - U.rand(4, 26), st.kind === 'moss' ? '#7dff9a' : '#bff4ff', { vy: -30, life: 0.8 });
      if (s.bs.t > 3 && !s.lock) {
        AI.Behaviors.animReset(e);
        s.exp = Math.max(s.exp, need(e));
        if (start(e, s, 'environment')) return false;
      }
      return s.bs.t < 8;
    },
    end(e, s) { s.siteT = 0; AI.Behaviors.animReset(e); },
  });

  function evoSiteFor(e, s) {
    const c = s.env || (s.env = {});
    if (c.site && AI.time - c.site.t < 4) return c.site.v;
    let v = null;
    const site = siteNear(e.x, e.y, 320);
    if (site) {
      const list = evosOf(e.dex);
      const match = list.some(([to]) => { const t = AI.R.DEX_BY[to].types || []; return (site.kind === 'moss' && t.includes('grass')) || (site.kind === 'ice' && t.includes('ice')); });
      if (match) v = site;
    }
    c.site = { t: AI.time, v };
    return v;
  }

  // ---------------------------------------------------------------- the player evolves too
  let pT = 0, pCd = 0, pSite = 0;
  function playerTick(dt) {
    if (!AI.cfg.evolution) return;
    pT -= dt;
    if (pT > 0) return;
    pT = 0.5;
    const R = AI.R;
    const p = R.Game.player;
    if (!p || p.dead || p.evoT > 0 || p.evoNever || R.Game.state !== 'playing' || pCd > AI.time) return;
    const list = evosOf(p.dex);
    if (!list.length) return;
    const req = list[0][1] || 25;
    const lvlOk = (p.level || 1) >= Math.floor(req * 0.75);
    // environmental: standing at a matching sacred stone
    const site = siteNear(p.x, p.y, 70);
    let target = null, why = '';
    if (site) {
      const m = list.find(([to]) => { const t = R.DEX_BY[to].types || []; return (site.kind === 'moss' && t.includes('grass')) || (site.kind === 'ice' && t.includes('ice')); });
      if (m) { pSite += 0.5; if (pSite > 2.5 && (p.level || 1) >= Math.floor(req * 0.6)) { target = m[0]; why = 'environment'; } }
      else pSite = 0;
    } else pSite = 0;
    // emotional: a desperate fight that you refuse to lose
    if (!target && lvlOk) {
      const hpf = p.hp / Math.max(1, p.maxHp);
      const fighting = AI.Combat.attackersOf(p).length >= 2;
      if (hpf < 0.25 && fighting && Math.random() < 0.08) {
        target = list.length === 1 ? list[0][0] : list.map(([to]) => [to, envScore(p.x, p.y, R.DEX_BY[to].types || [], {}) + Math.random()]).sort((a, b) => b[1] - a[1])[0][0];
        why = 'desperation';
      }
    }
    if (!target) return;
    pCd = AI.time + 90;
    pSite = 0;
    try {
      R.Audio.sfx && R.Audio.sfx('legend');
      AI.playerBubble.icon = why === 'environment' ? 'sparkle' : 'anger';
      AI.playerBubble.t = 2.5;
      p.startEvo(target, (a, b) => {
        R.Spawner.say(R.I18n.f('¡{x} ha evolucionado en {x}!', a.name, b.name), 3, true);
        R.Audio.sfx && R.Audio.sfx('shinyGet');
        if (R.Coop && R.Coop.active && R.Coop.evolved) R.Coop.evolved(b.dex);
      });
      AI.Bus.emit({ type: 'evolve', x: p.x, y: p.y, loud: 500, src: p, phase: 'start' });
    } catch (err) { AI.warn('player-evo', err); }
  }

  function tick(dt) { playerTick(dt); }

  function resetCooldowns() { globalCd = 0; pCd = 0; }

  AI.define('Evolution', { think, surge, start, apply, tick, evosOf, siteOf, siteNear, need, pickBranch, resetCooldowns });
})();
