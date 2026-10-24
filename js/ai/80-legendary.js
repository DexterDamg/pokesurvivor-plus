/* PokéSurvivor+ — Living World AI · Legendary presence & world events
 * Legendary Pokémon (played by you, met as bosses, or appearing through crystal events) bend
 * the behavior of everything around them. Each one has its own lore-driven aura. Giratina's
 * Distortion World wakes the Lake Trio's resonance; Groudon cannot stand even a puddle.
 * Weather and crystal events (Jigglypuff's lullaby, Plusle & Minun, Celebi, Jirachi) too.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const M = () => AI.Mind;

  // aura profiles: r = radius, fear/awe/calm/curious base strengths, special hooks
  const L = {
    487: { name: 'Giratina', r: 520, fear: 0.85, awe: 0.3, amused: true, likes: ['ghost', 'dark'] },
    383: { name: 'Groudon', r: 420, fear: 0.15, awe: 0.35, hates: ['water'], heat: true, gentle: true },
    382: { name: 'Kyogre', r: 460, fear: 0.3, awe: 0.35, likes: ['water'], scares: ['fire', 'ground', 'rock'] },
    384: { name: 'Rayquaza', r: 500, fear: 0.5, awe: 0.9, likes: ['dragon', 'flying'] },
    491: { name: 'Darkrai', r: 380, fear: 0.6, uneasy: true, nightmare: true, likes: ['dark', 'ghost'] },
    488: { name: 'Cresselia', r: 380, fear: 0, calm: 0.9, sleepy: true, likes: ['psychic', 'fairy'] },
    483: { name: 'Dialga', r: 440, fear: 0.45, awe: 0.6, time: true, likes: ['steel', 'dragon'] },
    484: { name: 'Palkia', r: 440, fear: 0.45, awe: 0.6, space: true, likes: ['water', 'dragon'] },
    493: { name: 'Arceus', r: 700, fear: 0.5, awe: 1 },
    150: { name: 'Mewtwo', r: 420, fear: 0.7, awe: 0.4, likes: ['psychic'] },
    151: { name: 'Mew', r: 320, fear: 0, curious: 0.8, playful: true },
    249: { name: 'Lugia', r: 460, fear: 0.35, awe: 0.8, likes: ['water', 'flying', 'psychic'] },
    250: { name: 'Ho-Oh', r: 460, fear: 0.3, awe: 0.85, likes: ['fire', 'flying'] },
    385: { name: 'Jirachi', r: 300, fear: 0, curious: 0.7, wonder: true },
    251: { name: 'Celebi', r: 320, fear: 0, calm: 0.6, curious: 0.6, likes: ['grass', 'bug'] },
    480: { name: 'Uxie', r: 300, fear: 0.1, awe: 0.4, lake: 'uxie' },
    481: { name: 'Mesprit', r: 300, fear: 0.05, awe: 0.4, lake: 'mesprit' },
    482: { name: 'Azelf', r: 300, fear: 0.1, awe: 0.4, lake: 'azelf' },
    380: { name: 'Latias', r: 320, fear: 0, curious: 0.6, likes: ['dragon', 'psychic'] },
    381: { name: 'Latios', r: 320, fear: 0.1, curious: 0.5, likes: ['dragon', 'psychic'] },
    243: { name: 'Raikou', r: 380, fear: 0.55, awe: 0.5, likes: ['electric'] }, 244: { name: 'Entei', r: 380, fear: 0.55, awe: 0.5, likes: ['fire'] }, 245: { name: 'Suicune', r: 380, fear: 0.4, awe: 0.6, calm: 0.3, likes: ['water'] },
    144: { name: 'Articuno', r: 380, fear: 0.45, awe: 0.5, likes: ['ice'] }, 145: { name: 'Zapdos', r: 380, fear: 0.55, awe: 0.5, likes: ['electric'] }, 146: { name: 'Moltres', r: 380, fear: 0.5, awe: 0.5, likes: ['fire'] },
    386: { name: 'Deoxys', r: 400, fear: 0.65, awe: 0.3 }, 800: { name: 'Necrozma', r: 420, fear: 0.7, awe: 0.3 },
  };
  const GENERIC = { r: 360, fear: 0.45, awe: 0.45 };
  const prof = (dex) => L[dex] || GENERIC;

  // ---------------------------------------------------------------- presences (refreshed ~4×/s)
  let pres = [];
  let presT = 0;
  const seenEvents = new Set();
  let lake = null; // active Lake Trio resonance {x, y, r, until}
  AI.playerBubble = { icon: null, t: 0 };

  function isLegendDex(dex) { const d = AI.R.DEX_BY[dex]; return !!(d && (d.leg || d.rarity >= 5)); }

  function refresh(dt) {
    presT -= dt;
    if (presT > 0) return;
    presT = 0.25;
    const R = AI.R;
    const out = [];
    for (const p of AI.players) if (!p.dead && isLegendDex(p.dex)) out.push({ x: p.x, y: p.y, dex: p.dex, kind: 'player', ent: p, key: 'P', ...scale(prof(p.dex), 1) });
    for (const e of R.EnemyMgr.all()) {
      if (e.dead || !(e.boss || e.legend || e.judge)) continue;
      const pr = isLegendDex(e.dex) ? prof(e.dex) : { r: 380, fear: 0.6, awe: 0.3 };
      out.push({ x: e.x, y: e.y, dex: e.dex, kind: 'boss', ent: e, key: e.id, ...scale(pr, 1) });
    }
    // crystal events
    let dist = null;
    try {
      const evs = (R.Crystal._dbg && R.Crystal._dbg().evs) || [];
      for (const ev of evs) {
        const k = ev.id + '@' + Math.round(ev.x) + ',' + Math.round(ev.y);
        if (ev.id === 'dist' && ev.t < 11.5) { out.push({ x: ev.x, y: ev.y, dex: 487, kind: 'event', key: 'ev:dist', ...scale(prof(487), 1.6) }); dist = ev; }
        else if (ev.id === 'sing') out.push({ x: ev.x, y: ev.y, dex: 39, kind: 'sing', key: 'ev:sing', r: 380, fear: 0, sleepy: true });
        else if (ev.id === 'duo') out.push({ x: ev.x, y: ev.y, dex: 311, kind: 'duo', key: 'ev:duo', r: 360, fear: 0, curious: 0.5, likes: ['electric'] });
        else if (ev.id === 'celebi') out.push({ x: ev.x, y: ev.y, dex: 251, kind: 'event', key: 'ev:celebi', ...scale(prof(251), 1) });
        else if (ev.id === 'star') out.push({ x: ev.x, y: ev.y, dex: 385, kind: 'event', key: 'ev:star', ...scale(prof(385), 1) });
        else if (ev.id === 'egg') out.push({ x: ev.x, y: ev.y, dex: 0, kind: 'egg', key: 'ev:egg', r: 300, fear: 0, curious: 0.6 });
        if (!seenEvents.has(k)) {
          seenEvents.add(k);
          if (seenEvents.size > 50) seenEvents.delete(seenEvents.values().next().value);
          // a tear in reality is LOUD
          AI.Bus.emit({ type: 'legend', x: ev.x, y: ev.y, loud: ev.id === 'dist' ? 1100 : 500, dex: ev.id === 'dist' ? 487 : 0, kind: ev.id, power: ev.id === 'dist' ? 1.5 : 0.5 });
          if (ev.id === 'dist') startLake(ev.x, ev.y);
        }
      }
    } catch (e) { AI.warn('crystal', e); }
    // Arceus' judgment
    if (R.Judgment && R.Judgment.active) {
      const j = R.Judgment.drawable && R.Judgment.drawable();
      const p = R.Game.player;
      out.push({ x: j ? j.x : p.x, y: j ? j.y : p.y - 200, dex: 493, kind: 'event', key: 'ev:arceus', ...scale(prof(493), 1.5) });
    }
    // Lake Trio as players carry their own resonance
    for (const p of AI.players) if (!p.dead && (p.dex === 480 || p.dex === 481 || p.dex === 482)) lakeFromPlayer(p);
    if (lake && (AI.time > lake.until && !(lake.player && !lake.player.dead && [480, 481, 482].includes(lake.player.dex)))) lake = null;
    if (lake && lake.player) { lake.x = lake.player.x; lake.y = lake.player.y; }
    if (dist && lake && !lake.player) { lake.x = dist.x; lake.y = dist.y; }
    pres = out;
  }
  function scale(p, k) { return Object.assign({}, p, { r: (p.r || 360) * k }); }

  // ---------------------------------------------------------------- Lake Trio resonance
  function startLake(x, y) {
    lake = { x, y, r: 620, until: AI.time + 12, t0: AI.time, uxT: 1.5, trio: ['uxie', 'mesprit', 'azelf'] };
    if (AI.say) AI.say(lakeText(), 3, true);
  }
  function lakeFromPlayer(p) {
    const which = { 480: ['uxie'], 481: ['mesprit'], 482: ['azelf'] }[p.dex];
    if (!lake || lake.player !== p) lake = { x: p.x, y: p.y, r: 300, until: AI.time + 1, t0: AI.time, uxT: 3, trio: which, player: p };
    else lake.until = AI.time + 1;
  }
  function lakeText() {
    const lang = (AI.R.I18n && AI.R.I18n.lang) || (navigator.language || 'es').slice(0, 2);
    const T = {
      es: 'Uxie, Mesprit y Azelf resuenan con el Mundo Distorsión…',
      en: 'Uxie, Mesprit and Azelf resonate with the Distortion World…',
      fr: 'Créhelf, Créfollet et Créfadet résonnent avec le Monde Distorsion…',
      zh: '由克希、艾姆利多與亞克諾姆與毀壞世界共鳴……',
    };
    return T[typeof lang === 'string' ? lang.slice(0, 2) : 'es'] || T.en;
  }
  function inLake(e, which) {
    if (!lake || !lake.trio.includes(which)) return false;
    return Math.abs(e.x - lake.x) + Math.abs(e.y - lake.y) < lake.r * 1.3 && U.dist2(e.x, e.y, lake.x, lake.y) < lake.r * lake.r;
  }

  // Mesprit (emotion) amplifies feelings; Azelf (willpower) dulls fear for the brave
  function emotionAmp(s, key) {
    const e = s.e;
    let k = 1;
    if (inLake(e, 'mesprit')) k *= 1.6;
    if (key === 'fear') {
      if (inLake(e, 'azelf') && s.pers.tr.bravery > 0.45) k *= 0.5;
      for (const p of pres) if (p.calm && U.dist2(e.x, e.y, p.x, p.y) < p.r * p.r) k *= 1 - p.calm * 0.4;
    }
    return k;
  }
  function contagionAmp(e) { return inLake(e, 'mesprit') ? 2 : 1; }

  function calmness(s, dt) {
    const e = s.e;
    for (const p of pres) {
      if (U.dist2(e.x, e.y, p.x, p.y) > p.r * p.r) continue;
      if (p.calm) { const em = s.mind.emo; em.fear = Math.max(0, em.fear - dt * 0.08 * p.calm); em.anger = Math.max(0, em.anger - dt * 0.06 * p.calm); }
      if (p.sleepy) s.mind.needs.energy = Math.max(0, s.mind.needs.energy - dt * (p.kind === 'sing' ? 0.25 : 0.03));
      if (p.nightmare && s.beh && s.beh.id === 'sleep') { s.nightmare = (s.nightmare || 0) + dt; }
    }
  }

  // how threatening a legendary player is to this NPC
  function playerAura(e, s) {
    const p = s.ctx.player;
    if (!p || !isLegendDex(p.dex)) return 0;
    const pr = prof(p.dex);
    const types = s.p.types;
    let f = pr.fear || 0;
    if (pr.hates && types.some((t) => pr.hates.includes(t))) f = 0.95; // Groudon vs water types
    else if (pr.gentle) f *= 0.35; // …but surprisingly gentle with everyone else
    if (pr.scares && types.some((t) => pr.scares.includes(t))) f = Math.max(f, 0.55);
    if (pr.likes && types.some((t) => pr.likes.includes(t))) f *= 0.4;
    return f * (1.2 - s.pers.tr.bravery * 0.7);
  }

  // ---------------------------------------------------------------- per-NPC reactions
  function think(e, s) {
    const tr = s.pers.tr;
    const types = s.p.types;
    // weather & environment moods
    const wx = AI.Env.weather();
    if (wx) {
      if ((wx === 'storm' || wx === 'electric') && types.includes('electric')) M().feel(s, 'excitement', 0.08);
      if ((wx === 'sun' || wx === 'harsh') && types.includes('ice')) { M().feel(s, 'sadness', 0.04); if (Math.random() < 0.05) M().say(s, 'sweat', 1.4, 0.5); }
      if ((wx === 'rain' || wx === 'storm') && types.includes('water')) M().feel(s, 'joy', 0.05);
      if ((wx === 'rain' || wx === 'storm') && types.includes('fire') && !types.includes('water')) M().feel(s, 'sadness', 0.05);
      if ((wx === 'snow' || wx === 'hail') && types.includes('ice')) M().feel(s, 'joy', 0.05);
      if ((wx === 'fog' || wx === 'curse') && (types.includes('ghost') || types.includes('dark'))) M().feel(s, 'excitement', 0.05);
      else if (wx === 'fog' || wx === 'curse') M().feel(s, 'suspicion', 0.03);
    }
    // nightmares under Darkrai: tossing, then waking up crying
    if (s.nightmare > 3 && s.beh && s.beh.id === 'sleep') {
      s.nightmare = 0;
      s.wokeAt = AI.time;
      M().feel(s, 'fear', 0.6, 'nightmare');
      M().feel(s, 'sadness', 0.4);
      M().say(s, 'scared', 2, 3);
      s.vis.tears = 2;
    }
    if (!pres.length) return;
    let best = null, bd = Infinity;
    for (const p of pres) {
      if (p.ent === e) continue;
      const d2 = U.dist2(e.x, e.y, p.x, p.y);
      if (d2 < p.r * p.r && d2 < bd) { bd = d2; best = p; }
    }
    if (!best) return;
    const d = Math.sqrt(bd);
    const near = 1 - d / best.r;
    // a rampaging titan is everyone's problem: grudges against the player are put on hold
    if (best.kind === 'boss' && near > 0.2) s.truce = Math.max(s.truce || 0, AI.time + 8);
    // continuous mood under the aura
    const pr = best;
    const liked = pr.likes && types.some((t) => pr.likes.includes(t));
    const hated = pr.hates && types.some((t) => pr.hates.includes(t));
    let fearK = (pr.fear || 0) * near;
    if (hated) fearK = Math.max(fearK, 0.9 * near);
    if (pr.gentle && !hated) fearK *= 0.3;
    if (pr.scares && types.some((t) => pr.scares.includes(t))) fearK = Math.max(fearK, 0.5 * near);
    if (liked) fearK *= 0.35;
    if (fearK > 0.05) M().feel(s, 'fear', fearK * 0.35, best.key);
    if (pr.awe) M().feel(s, 'surprise', pr.awe * near * 0.15);
    if (pr.curious || liked) M().feel(s, 'curiosity', (pr.curious || 0.3) * near * 0.3);
    if (pr.calm) M().feel(s, 'joy', pr.calm * near * 0.08);
    if (pr.kind === 'duo' && types.includes('electric')) { M().feel(s, 'excitement', 0.3 * near); }
    if (pr.time && Math.random() < 0.08 * near) timeStutter(e, s);
    if (pr.space && Math.random() < 0.06 * near) spaceHop(e, s);
    if (pr.uneasy) M().feel(s, 'suspicion', 0.15 * near, best.key);
    // Uxie (knowledge) occasionally makes a Pokémon forget what upset it
    if (inLake(e, 'uxie') && Math.random() < 0.07) uxieForget(e, s);
    // choose a discrete reaction plan now and then
    if ((s.legendCd || 0) > AI.time) return;
    if (best.kind === 'player' && near < 0.35 && !hated) return;
    if (best.kind === 'sing' || best.kind === 'egg') return;
    s.legendCd = AI.time + U.rand(7, 12);
    const w = {
      flee: fearK * (1.25 - tr.bravery) * 1.5,
      hide: fearK * (1 - tr.bravery) * 0.7,
      freeze: fearK * ((s.pers.temp === 'timid' ? 0.6 : 0.2) + (s.pers.quirks.has('skittish') ? 0.4 : 0)),
      look: 0.35 + tr.curiosity * 0.35,
      gather: fearK * tr.sociability * 0.8 * (s.ctx.friendNear || s.ctx.near.some((o) => o.dex === e.dex) ? 1 : 0),
      approach: (tr.curiosity * tr.bravery + (liked ? 0.4 : 0) + (pr.curious || 0) * 0.6) * (fearK > 0.6 ? 0.3 : 1),
      panic: fearK * tr.aggression * 0.45,
      stand: tr.bravery * 0.7 * (fearK > 0.2 ? 1 : 0.3) + (inLake(e, 'azelf') && tr.bravery > 0.45 ? 0.9 : 0),
      awe: (pr.awe || 0) * near * 0.9,
    };
    if (hated) { w.flee += 1; w.approach = 0; w.look *= 0.3; }
    if (pr.calm && !hated) { w.flee *= 0.2; w.hide *= 0.2; w.panic = 0; w.freeze *= 0.3; }
    const plan = U.wpick(w) || 'look';
    s.legendReact = { plan, src: best, until: AI.time + U.rand(3, 7), t0: AI.time };
    if (best.amused && (plan === 'flee' || plan === 'freeze' || plan === 'hide' || plan === 'panic')) amuse(best);
    s.forceThink = true;
  }

  function amuse(src) {
    // Giratina finds these attempts amusing
    if (src.kind === 'player') { if (AI.playerBubble.t <= 0) { AI.playerBubble.icon = 'smirk'; AI.playerBubble.t = 2.2; } }
    else if (src.kind === 'event') { eventBubble.icon = 'smirk'; eventBubble.t = 2.2; eventBubble.x = src.x; eventBubble.y = src.y; }
  }
  const eventBubble = { icon: null, t: 0, x: 0, y: 0 };

  function timeStutter(e, s) {
    s.lock = { t: 0.45, update(e2, s2, dt, it) { this.t -= dt; it.stay = true; s2.vis.shake = 0.6; return this.t > 0; } };
    M().feel(s, 'confusion', 0.4);
    M().say(s, 'swirl', 1.2, 1);
  }
  function spaceHop(e, s) {
    const a = Math.random() * 6.283;
    const nx = e.x + Math.cos(a) * 46, ny = e.y + Math.sin(a) * 40;
    if (!AI.Behaviors.walkable(e, nx, ny)) return;
    AI.R.FX.ring(e.x, e.y, 4, 22, '#c8a0ff', 0.25, 2);
    e.x = nx; e.y = ny; s.px = nx; s.py = ny;
    AI.R.FX.ring(e.x, e.y, 4, 22, '#c8a0ff', 0.25, 2);
    M().feel(s, 'confusion', 0.5);
    M().say(s, 'swirl', 1.4, 1);
  }
  function uxieForget(e, s) {
    const em = s.mind.emo;
    if (em.fear + em.anger + em.suspicion < 0.4) return;
    em.fear *= 0.2; em.anger *= 0.2; em.suspicion *= 0.2;
    const rp = s.rel.get('P');
    if (rp) { rp.g *= 0.5; rp.f *= 0.5; }
    s.lastHurtBy = null;
    M().feel(s, 'confusion', 0.7);
    M().say(s, 'swirl', 1.8, 2);
    AI.R.FX.twinkle(e.x, e.y - e.bodyH - 8);
    s.forceThink = true;
  }

  function reactPulse(e, s, ev, near) {
    const tr = s.pers.tr;
    if (ev.dex === 487 || ev.power > 1) {
      if (s.beh && s.beh.id === 'sleep') { s.wokeAt = AI.time; }
      M().feel(s, 'surprise', 0.9);
      M().feel(s, 'fear', 0.55 * (1.2 - tr.bravery), 'ev:' + (ev.kind || 'legend'));
      M().say(s, 'surprise', 1.2, 3);
      s.mind.next = { icon: tr.bravery > 0.7 ? 'eyes' : 'scared', at: AI.time + 1, dur: 2, prio: 3 };
      s.legendCd = 0; // re-plan right away
      s.forceThink = true;
    } else {
      M().feel(s, 'curiosity', 0.4 * near);
      M().feel(s, 'surprise', 0.3 * near);
    }
  }

  // the behavior that executes a reaction plan
  AI.Behaviors.add({
    id: 'legend-react', tier: 5, minCommit: 2,
    emotion: (s) => { const p = s.legendReact && s.legendReact.plan; return p === 'look' || p === 'approach' ? 'curiosity' : p === 'awe' ? 'excitement' : p === 'stand' || p === 'panic' ? 'anger' : 'fear'; },
    score(e, s) {
      const r = s.legendReact;
      if (!r || AI.time > r.until) return 0;
      return 0.6 + (r.plan === 'flee' ? 0.5 : 0) + s.mind.emo.fear * 0.3;
    },
    start(e, s) { s.bs.panicT = 0; },
    update(e, s, dt, it) {
      const r = s.legendReact;
      if (!r || AI.time > r.until) return false;
      const src = r.src;
      const sx = src.ent && !src.ent.dead ? src.ent.x : src.x, sy = src.ent && !src.ent.dead ? src.ent.y : src.y;
      const face = Math.atan2(sy - e.y, sx - e.x);
      const d = Math.hypot(sx - e.x, sy - e.y);
      const B = AI.Behaviors;
      switch (r.plan) {
        case 'flee': {
          if (!s.bs.pt || Math.random() < dt) s.bs.pt = B.escapePoint(e, s, sx, sy, 260);
          if (s.bs.pt) B.go(it, s.bs.pt[0], s.bs.pt[1], 1.2);
          if (d > src.r * 1.1) return false;
          return true;
        }
        case 'hide': {
          const cover = B.nearProp(e, s, 'grass', 260) || B.nearProp(e, s, 'tree', 260);
          if (!cover) { r.plan = 'flee'; return true; }
          if (Math.hypot(cover.x - e.x, cover.y - e.y) > 14) B.go(it, cover.x, cover.y + 6, 1.05); else { B.stay(it); s.vis.alpha = 0.6; s.vis.sy = 0.9; }
          return true;
        }
        case 'freeze': B.stay(it); it.face = face; s.vis.shake = 1.4; it.anim = 'Idle'; it.animSpeed = 0.15; return true;
        case 'look': B.stay(it); it.face = face; return true;
        case 'awe': B.stay(it); it.face = face; s.vis.sy = 0.9; if (Math.random() < dt * 0.6) AI.R.FX.twinkle(e.x + U.rand(-8, 8), e.y - e.bodyH); return true;
        case 'gather': {
          const f = s.ctx.friendNear || s.ctx.near.find((o) => o.dex === e.dex);
          if (!f || f.dead) { r.plan = 'flee'; return true; }
          if (Math.hypot(f.x - e.x, f.y - e.y) > e.r + f.r + 8) B.go(it, f.x, f.y, 1); else { B.stay(it); it.face = face; s.vis.shake = 0.6; }
          return true;
        }
        case 'approach': {
          if (d > 150) B.go(it, sx, sy, 0.55); else { B.stay(it); it.face = face; }
          return true;
        }
        case 'stand': B.stay(it); it.face = face; if (Math.random() < dt * 0.8) s.vis.hop = 0.2; return true;
        case 'panic': {
          // lashing out at whoever is closest
          const o = s.ctx.near[0];
          if (!o || o.dead) { r.plan = 'flee'; return true; }
          if (s.combat.target !== o) AI.Combat.engage(e, s, o, 'panic');
          return AI.Combat.update(e, s, dt, it);
        }
        default: return false;
      }
    },
    end(e, s) { s.vis.shake = 0; s.vis.alpha = 1; s.vis.sy = 1; if (s.inCombat && s.combat.reason === 'panic') AI.Combat.disengage(e, s); },
  });

  // ---------------------------------------------------------------- Groudon & water
  let gT = 0, stompT = 0, rageT = 0;
  function groudonTick(dt) {
    const R = AI.R;
    for (const p of AI.players) {
      if (p.dead || p.dex !== 383) continue;
      gT -= dt; stompT -= dt;
      if (gT > 0) continue;
      gT = 0.35;
      const kind = AI.Env.liquidKind();
      const water = AI.Env.SWIMMABLE.has(kind) ? AI.Env.liquidTilesIn(p.x, p.y, 150).filter((t) => !AI.Env.isDried(t.tx, t.ty)) : [];
      if (water.length) {
        if (rageT <= 0) {
          // notices the puddle… stares at it…
          rageT = 1.1;
          AI.playerBubble.icon = 'anger'; AI.playerBubble.t = 2.6;
        }
      }
      if (rageT > 0) {
        rageT -= 0.35;
        if (rageT <= 0 && water.length) evaporate(p, water);
      }
    }
    // Magikarp happens to be Kyogre-adjacent. Groudon does not care for that.
    for (const p of AI.players) {
      if (p.dead || p.dex !== 383) continue;
      for (const e of R.EnemyMgr.queryCircle(p.x, p.y, p.r + 34)) {
        if (e.dead || !e.psx || e.psx.lock) continue;
        if (e.dex === 129 || (e.dex === 382)) kick(p, e);
      }
    }
    if (AI.playerBubble.t > 0) AI.playerBubble.t -= dt;
    if (eventBubble.t > 0) eventBubble.t -= dt;
  }

  function evaporate(p, tiles) {
    const R = AI.R;
    // DROUGHT: every drop of water nearby boils away
    for (const t of tiles) {
      AI.Env.dry(t.tx, t.ty, 75);
      if (R.Camera.sees(t.x, t.y, 20)) { R.FX.burst(t.x, t.y - 6, '#f4f4f4', 5, 70); R.FX.px(t.x, t.y - 10, '#ffffff', { vy: -50, life: 0.9 }); }
    }
    R.FX.ring(p.x, p.y, 10, 220, '#ff8a3d', 0.55, 6);
    R.FX.ring(p.x, p.y, 6, 150, '#ffd23f', 0.4, 4);
    R.Camera.kick(0.45);
    R.Audio.sfx && R.Audio.sfx('break');
    AI.playerBubble.icon = 'anger'; AI.playerBubble.t = 1.8;
    AI.Bus.emit({ type: 'boom', x: p.x, y: p.y, loud: 520, power: 0.9, src: p, srcKey: 'P' });
    // nearby water types get scalded and terrified; everyone else is just startled
    for (const e of R.EnemyMgr.queryCircle(p.x, p.y, 230)) {
      if (e.dead || !e.psx) continue;
      const s = e.psx;
      if (s.p.types.includes('water')) {
        const m = { id: 'drought', type: 'fire', cls: 'pulse', power: 0.8, def: {}, ranged: false };
        AI.hurtNpc(e, AI.NpcMoves.npcVsNpc({ psx: null, dex: p.dex, boss: false, legend: true }, m, e), p, '#ff8a3d', e.x - p.x, e.y - p.y, 160, false);
        M().feel(s, 'fear', 0.8, 'P');
        AI.Rel.adjust(s, 'P', { f: 0.4 });
        M().say(s, 'scared', 2, 3);
      } else {
        M().feel(s, 'surprise', 0.6);
        M().say(s, 'surprise', 1.2, 2);
      }
    }
  }

  function kick(p, e) {
    const s = e.psx;
    const R = AI.R;
    const ang = Math.atan2(e.y - p.y, e.x - p.x) + U.rand(-0.3, 0.3);
    const dist = U.rand(700, 1000);
    AI.playerBubble.icon = 'anger'; AI.playerBubble.t = 2;
    R.FX.ring(e.x, e.y, 6, 60, '#ffd23f', 0.3, 4);
    R.FX.burst(e.x, e.y - 10, '#ffe9a0', 18, 220);
    R.Camera.kick(0.6);
    R.Audio.sfx && R.Audio.sfx('hit');
    e.hurt(Math.max(1, e.maxHp * 0.12), '#ffd23f', Math.cos(ang), Math.sin(ang), 0);
    M().feel(s, 'surprise', 1);
    M().say(s, 'surprise', 2.5, 3);
    const sx = e.x, sy = e.y;
    const tx = e.x + Math.cos(ang) * dist, ty = e.y + Math.sin(ang) * dist * 0.85;
    s.lock = {
      t: 0, dur: 1.6,
      update(e2, s2, dt, it) {
        this.t += dt;
        const k = Math.min(1, this.t / this.dur);
        it.custom = { x: sx + (tx - sx) * k, y: sy + (ty - sy) * k };
        s2.vis.lift = 260 * Math.sin(k * Math.PI);
        s2.vis.rot = this.t * 14;
        if (k >= 1) {
          s2.vis.lift = 0; s2.vis.rot = 0;
          if (!AI.Behaviors.walkable(e2, e2.x, e2.y)) { const pt = AI.Behaviors.pointNear(e2, e2.x, e2.y, 20, 200, 20); if (pt) { e2.x = pt[0]; e2.y = pt[1]; } }
          R.FX.burst(e2.x, e2.y, '#9fd8ff', 10, 120);
          // dazed… and absolutely furious (or terrified)
          M().feel(s2, 'confusion', 0.8);
          if (s2.pers.tr.bravery > 0.3 || Math.random() < 0.5) { M().feel(s2, 'anger', 0.95, 'P'); AI.Rel.adjust(s2, 'P', { g: 0.6, a: -0.5 }); s2.mind.next = { icon: 'anger', at: AI.time + 1.2, dur: 2.5, prio: 3 }; }
          else { M().feel(s2, 'fear', 0.8, 'P'); AI.Rel.adjust(s2, 'P', { f: 0.6 }); }
          M().say(s2, 'swirl', 1.2, 3);
          s2.humiliated = (s2.humiliated || 0) + 1;
          if (AI.Evolution) AI.Evolution.surge(e2, s2, 'rage', 0.6);
          return false;
        }
        return true;
      },
    };
    AI.Bus.emit({ type: 'boom', x: sx, y: sy, loud: 420, power: 0.6, src: p, srcKey: 'P' });
  }

  function tick(dt) {
    refresh(dt);
    groudonTick(dt);
    if (lake && lake.uxT != null) lake.uxT -= dt;
  }

  function clear() { pres = []; lake = null; seenEvents.clear(); AI.playerBubble.t = 0; eventBubble.t = 0; }

  AI.define('Legend', {
    L, prof, isLegendDex, tick, think, reactPulse, emotionAmp, contagionAmp, calmness, playerAura, clear,
    get presences() { return pres; }, get lake() { return lake; }, eventBubble, startLake, kick, evaporate,
  });
})();
