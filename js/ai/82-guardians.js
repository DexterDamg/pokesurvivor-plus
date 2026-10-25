/* PokéSurvivor+ — Living World AI · the four guardians (the Tropical Ocean)
 * Each island spirit waits at the heart of its own island; step into its arena and it comes for
 * you, each in its own way:
 *   · Tapu Koko, Thundercrest Island: black volcanic rock under a storm that never leaves, Electric
 *     Pokémon, an arena up on the cliff-top (one ramp climbs to it). It drops in with a thunderbolt
 *     and fights fast and furious: lightning keeps striking around you.
 *   · Tapu Lele, Blossomveil Island: pink trees, flowers, petals on the wind, a ring of standing
 *     stones, Psychic and Fairy Pokémon. It giggles, plays, vanishes and reappears behind you;
 *     its games hurt.
 *   · Tapu Bulu, Verdant Crown Island: dense jungle, giant trees, ruins and a waterfall, Grass
 *     Pokémon. It rises from the ruined plaza, slow and immensely strong; the ground erupts.
 *   · Tapu Fini, the Isle of Lost Souls: permanent fog that thickens toward the summit, graves,
 *     ruins, dead trees and ghosts. On the Summit of Two Orbs the Red and Blue Orbs rest on their
 *     pedestals; reach for them and Fini rises from the mist. It tests you once and only once: win,
 *     and both orbs are yours to keep (82-sea.js, kept between runs). Kyogre and Groudon stay
 *     legends.
 * Beat Koko, Lele or Bulu and it joins you (choose it as your partner from the menu), like the
 * legendary beasts of the Shady Forest. Lose (or leave) and it goes back to wait for you.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const O = () => AI.Ocean;
  const DEX = { koko: 785, lele: 786, bulu: 787, fini: 788 };
  const ISLE = { koko: 'koko', lele: 'lele', bulu: 'bulu', fini: 'fini' };
  const COL = { koko: '#ffe14d', lele: '#ff9cd2', bulu: '#9be05a', fini: '#8fd8ff' };
  const st = { scene: null, battle: null, actor: null, cool: {}, dim: 0, fx: [] };

  function on() { return O() && O().on() && AI.cfg.guardians !== false; }
  function player() { return AI.R.Game.player; }
  function T(en, es) { return (AI.lang && AI.lang() === 'es' && es) || en; }
  function sea() { return AI.Sea; }
  function won(id) { const s = sea(); return !!(s && s.save.tapus[id]); }
  function owned(dex) { try { const sv = AI.R.DB.save; return !!(sv && sv.owned && sv.owned[dex]); } catch (e) { return false; } }
  function done(id) { return id === 'fini' ? won('fini') || (sea() && sea().has('red') && sea().has('blue')) : won(id) || owned(DEX[id]); }
  function busy() { return !!st.scene; }
  function isle(id) { return O().islandById(ISLE[id]); }
  // where its arena is: the island's heart (Fini's summit holds the two pedestals)
  function arena(id) { const o = isle(id); return o ? { x: o.x, y: o.y, r: o.arenaR || 190, o } : null; }
  function pedestals() { const a = arena('fini'); return a ? [[a.x - 46, a.y - 14], [a.x + 46, a.y - 14]] : []; }

  const LINES = {
    koko: [[T('Kokooo! Someone climbed MY cliff in MY storm!', '¡Kokooo! ¡Alguien ha subido a MI acantilado en MI tormenta!'), 'Surprised'], [T('You want a fight? Then keep up! Too slow and you\'re done!', '¿Quieres pelea? ¡Pues sigue el ritmo! ¡Si eres lento, se acabó!'), 'Determined']],
    lele: [[T('Hehe~ you found my garden. Did you come to play?', 'Jiji~ has encontrado mi jardín. ¿Has venido a jugar?'), 'Happy'], [T('Let\'s play a game! If you lose… well, don\'t cry~', '¡Juguemos! Si pierdes… bueno, no llores~'), 'Joyous']],
    bulu: [[T('…You walk in the Crown as if it were yours.', '…Caminas por la Corona como si fuera tuya.'), 'Normal'], [T('Prove you belong among these trees. Or be buried beneath them.', 'Demuestra que perteneces a estos árboles. O quedarás bajo ellos.'), 'Determined']],
    fini: [[T('You climbed through the fog of the dead… for the orbs.', 'Has subido entre la niebla de los muertos… por los orbes.'), 'Normal'], [T('I will test you once. Only once. Win, and they are yours to keep apart.', 'Te pondré a prueba una vez. Solo una. Gana, y serán tuyos para mantenerlos separados.'), 'Determined']],
    kokoWon: T('Hah… hahaha! That was FUN! I\'m coming with you, got it?', '¡Ja… jajaja! ¡Eso fue DIVERTIDO! Me voy contigo, ¿entendido?'),
    leleWon: T('Aww, you won~ Fine, fine. I\'ll come along. It\'ll be fun!', 'Ooh, has ganado~ Vale, vale. Iré contigo. ¡Será divertido!'),
    buluWon: T('…Strong. The Crown accepts you. So do I.', '…Fuerte. La Corona te acepta. Y yo también.'),
    finiWon: T('Then take them. Keep the red from the blue, always. What sleeps must stay asleep.', 'Entonces tómalos. Mantén el rojo lejos del azul, siempre. Lo que duerme debe seguir dormido.'),
    lost: { koko: T('Tapu Koko streaks back into the storm, laughing.', 'Tapu Koko vuelve a la tormenta como un rayo, riendo.'), lele: T('Tapu Lele giggles and vanishes in a swirl of petals.', 'Tapu Lele se ríe y desaparece entre pétalos.'), bulu: T('Tapu Bulu sinks back among the ruins.', 'Tapu Bulu se hunde de nuevo entre las ruinas.'), fini: T('Tapu Fini dissolves into the fog. The orbs remain on their pedestals.', 'Tapu Fini se disuelve en la niebla. Los orbes siguen en sus pedestales.') },
  };

  // ---------------------------------------------------------------- per frame
  function tick(dt) {
    st.dim = Math.max(0, st.dim - dt * 0.3);
    for (let i = st.fx.length - 1; i >= 0; i--) { st.fx[i].t += dt; if (st.fx[i].t > st.fx[i].life) st.fx.splice(i, 1); }
    if (!on()) return;
    if (st.scene) return tickScene(dt);
    if (st.battle) return tickBattle(dt);
    const p = player();
    if (!p || p.dead) return;
    if (AI.R.EnemyMgr.bossAlive && AI.R.EnemyMgr.bossAlive()) return;
    if ((AI.Story && AI.Story.busy()) || (AI.Sea && AI.Sea.busy())) return;
    for (const id of Object.keys(DEX)) {
      if (done(id) || (st.cool[id] || 0) > AI.time) continue;
      const a = arena(id);
      if (!a) continue;
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      const reach = id === 'fini' ? pedestals().some((q) => Math.hypot(p.x - q[0], p.y - q[1]) < 70) : d < a.r * 0.7;
      if (reach && O().sample(p.x, p.y).cls === 0) { startScene(id); break; }
    }
  }
  function actor(dex, x, y) {
    try { const a = new AI.R.Sprites.Animator(dex, 1, false); a.loop('Idle'); AI.R.Sprites.preload([dex], 4000); return { dex, a, x, y, alpha: 0, z: 0 }; } catch (e) { return null; }
  }
  function startScene(id) {
    const a = arena(id), p = player();
    const ang = Math.atan2(a.y - p.y, a.x - p.x);
    const at = id === 'fini' ? [a.x, a.y - 40] : [p.x + Math.cos(ang) * 130, p.y + Math.sin(ang) * 100];
    st.scene = { id, t: 0, at, step: 0, line: 0 };
    try { AI.Talk.clear && AI.Talk.clear(); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'guardian', what: 'scene', id, x: at[0], y: at[1], loud: 0 });
    if (id === 'fini' && AI.Sky) AI.Sky.st.forced = Object.assign({}, AI.Sky.st.forced || {}, { fog: 0.95 });
  }
  function tickScene(dt) {
    const sc = st.scene, R = AI.R, p = player();
    sc.t += dt;
    if (p) p.invuln = Math.max(p.invuln || 0, 0.4);
    const [ax, ay] = sc.at;
    const dex = DEX[sc.id];
    st.dim = Math.min(0.45, st.dim + dt * 0.5);
    if (sc.step === 0 && sc.t > 1.2) {
      sc.step = 1;
      st.actor = actor(dex, ax, ay);
      const A = st.actor;
      if (sc.id === 'koko') {
        // down with the lightning
        if (AI.Sky) { AI.Sky.st.strikes.push({ x: ax, y: ay, t: 0, seed: (Math.random() * 1e9) | 0, power: 1 }); AI.Sky.st.flash = 1.1; }
        try { R.Camera.kick(1); R.Audio.sfx('ultBolt'); R.FX.burst(ax, ay - 10, '#fff7a0', 40, 300); R.FX.ring(ax, ay, 10, 150, '#ffe14d', 0.7, 6); } catch (e) { /* ignore */ }
        if (A) A.alpha = 1;
      } else if (sc.id === 'lele') {
        // out of a swirl of petals
        for (let i = 0; i < 40; i++) st.fx.push({ kind: 'petal', x: ax + U.rand(-60, 60), y: ay + U.rand(-70, 10), vx: U.rand(-40, 40), vy: U.rand(-50, 10), t: 0, life: U.rand(1.5, 3) });
        try { R.Audio.sfx('legend'); } catch (e) { /* ignore */ }
      } else if (sc.id === 'bulu') {
        // the ground heaves
        try { R.Camera.kick(1.1); R.FX.ring(ax, ay, 12, 170, '#7fd05a', 0.7, 6); R.FX.burst(ax, ay, '#6a5232', 30, 200); R.Audio.sfx('boss'); } catch (e) { /* ignore */ }
        if (A) A.z = -60;
      } else if (sc.id === 'fini') {
        try { AI.Ambience && AI.Ambience.myst && AI.Ambience.myst('shimmer', ax, ay); } catch (e) { /* ignore */ }
      }
    }
    const A = st.actor;
    if (A) {
      try { A.a.update(dt); if (p) A.a.dir = R.Sprites.dirFromAngle(Math.atan2(p.y - A.y, p.x - A.x)); } catch (e) { /* ignore */ }
      if (sc.id === 'lele' || sc.id === 'fini') A.alpha = Math.min(1, A.alpha + dt * 0.7);
      if (sc.id === 'bulu') { A.z = Math.min(0, A.z + dt * 50); A.alpha = Math.min(1, A.alpha + dt); }
      if (Math.random() < dt * 8) try { R.FX.burst(A.x + U.rand(-24, 24), A.y - U.rand(10, 60), COL[sc.id], 2, 60); } catch (e) { /* ignore */ }
    }
    const L = LINES[sc.id];
    if (sc.line < L.length && sc.t > 2.4 + sc.line * 3.2) { const [text, emo] = L[sc.line++]; if (AI.Talk) AI.Talk.legend(dex, text, { emo, life: 3.4 }); }
    if (sc.t > 2.4 + L.length * 3.2 + 0.6) startBattle(sc);
  }
  function startBattle(sc) {
    const R = AI.R;
    const dex = DEX[sc.id];
    const d = R.DEX_BY[dex] || { name: sc.id };
    const A = st.actor;
    const x = A ? A.x : sc.at[0], y = A ? A.y : sc.at[1];
    let hp = 2600, dmg = 18;
    try { hp = Math.round(Math.max(6.5 * R.Stats.hpRef(), 1900)); } catch (e) { /* ignore */ }
    try { dmg = Math.round(R.Enemies.bossDmg(R.Game.st.time)); } catch (e) { /* ignore */ }
    const K = {
      koko: { spd: 160, behavior: 'shooter', range: 300, shotCd: 0.85, hp: 0.9, dmg: 1 },
      lele: { spd: 115, behavior: 'shooter', range: 320, shotCd: 1.1, hp: 0.95, dmg: 1 },
      bulu: { spd: 72, behavior: 'chase', range: 220, shotCd: 1.6, hp: 1.55, dmg: 1.25 },
      fini: { spd: 96, behavior: 'shooter', range: 310, shotCd: 1.25, hp: 1.15, dmg: 1 },
    }[sc.id];
    const def = { dex, name: d.name, hp: Math.round(hp * K.hp), spd: K.spd, dmg: Math.round(dmg * K.dmg), xp: 650, behavior: K.behavior, shotDmg: Math.round(dmg * 0.46), shotCd: K.shotCd, range: K.range };
    let e = null;
    try {
      e = new R.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 }, true);
      e.psxGuardian = sc.id; e.psxStory = true; e.psxPlaced = true; e.psxForceTemp = 'aggressive'; e.legend = true;
      R.EnemyMgr.add(e);
      if (AI.Talk && AI.Talk.legends) AI.Talk.legends.seen.set(e, { stage: 0 });
    } catch (err) { AI.warn('guardian-battle', err); }
    st.actor = null;
    st.scene = null;
    st.battle = e ? { id: sc.id, e, t: 0, haz: 1.5, tele: 4 } : null;
    try { R.Audio.sfx('boss'); } catch (err) { /* ignore */ }
    AI.Bus.emit({ type: 'guardian', what: 'battle', id: sc.id, x, y, loud: 0 });
  }
  // each fights its own way
  function tickBattle(dt) {
    const b = st.battle;
    const R = AI.R, p = player();
    b.t += dt;
    if (b.e.dead) return victory(b);
    const a = arena(b.id);
    const gone = !R.EnemyMgr.all().includes(b.e);
    const far = p && Math.hypot(p.x - a.x, p.y - a.y) > a.o.R * 1.8 + 400;
    if (gone || far || b.t > 300 || !p || p.dead) return lost(b, gone);
    b.haz -= dt;
    const zone = (x, y, r, delay, k, type, col) => { try { const prev = AI.curEnemy; AI.curEnemy = b.e; R.Hazards.add({ kind: 'zone', x, y, r, delay, dmg: Math.round((b.e.dmg || 18) * k), type, color: col }); AI.curEnemy = prev; } catch (e) { /* ignore */ } };
    if (b.id === 'koko' && b.haz <= 0) {
      // lightning keeps striking around you
      b.haz = U.rand(0.9, 1.5);
      const n = b.e.hp < b.e.maxHp * 0.5 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const x = p.x + U.rand(-110, 110), y = p.y + U.rand(-80, 80);
        zone(x, y, 40, 0.8, 0.7, 'electric', '#ffe14d');
        setTimeout(() => { if (AI.Sky && st.battle) { AI.Sky.st.strikes.push({ x, y, t: 0, seed: (Math.random() * 1e9) | 0, power: 0.7 }); AI.Sky.st.flash = Math.max(AI.Sky.st.flash, 0.5); } }, 780);
      }
    } else if (b.id === 'lele') {
      // it plays: vanishes, reappears somewhere else
      b.tele -= dt;
      if (b.tele <= 0) {
        b.tele = U.rand(3, 5);
        try { R.FX.burst(b.e.x, b.e.y - 20, '#ff9cd2', 20, 160); } catch (e) { /* ignore */ }
        for (let i = 0; i < 10; i++) {
          const ang = Math.random() * 6.283, x = p.x + Math.cos(ang) * U.rand(140, 220), y = p.y + Math.sin(ang) * U.rand(100, 160);
          if (O().fits('walk', x, y)) { b.e.x = x; b.e.y = y; break; }
        }
        try { R.FX.burst(b.e.x, b.e.y - 20, '#ffd2ec', 20, 160); } catch (e) { /* ignore */ }
      }
      if (b.haz <= 0) { b.haz = U.rand(1.6, 2.4); for (let i = 0; i < 3; i++) { const ang = i / 3 * 6.283 + Math.random(); zone(p.x + Math.cos(ang) * 70, p.y + Math.sin(ang) * 50, 34, 1, 0.6, 'psychic', '#ff7ad0'); } }
    } else if (b.id === 'bulu' && b.haz <= 0) {
      // the ground erupts where you stand
      b.haz = U.rand(1.8, 2.6);
      zone(p.x, p.y, 54, 1.05, 1, 'grass', '#7fd05a');
      try { R.Camera.kick(0.3); } catch (e) { /* ignore */ }
    } else if (b.id === 'fini' && b.haz <= 0) {
      // the mist gathers into rings of water
      b.haz = U.rand(1.4, 2.2);
      zone(p.x + U.rand(-50, 50), p.y + U.rand(-40, 40), 46, 1, 0.75, 'water', '#8fd8ff');
    }
  }
  function victory(b) {
    const R = AI.R;
    const dex = DEX[b.id];
    const s = sea();
    if (s) { s.save.tapus[b.id] = Date.now(); s.persist(); }
    if (b.id === 'fini') {
      // both orbs, to keep (not repeatable)
      if (s) { s.give('red'); setTimeout(() => s.give('blue'), 900); }
      if (AI.Talk) AI.Talk.legend(dex, LINES.finiWon, { emo: 'Normal', life: 5.5 });
    } else {
      try {
        R.DB.grant(dex, 'tropical-ocean');
        const sv = R.DB.save;
        sv.legends = sv.legends || {};
        if (!sv.legends[dex]) sv.legends[dex] = Date.now();
        R.DB.commit && R.DB.commit();
      } catch (e) { AI.warn('guardian-grant', e); }
      if (AI.Talk) AI.Talk.legend(dex, LINES[b.id + 'Won'], { emo: 'Happy', life: 5 });
      try { R.Spawner.say(((R.DEX_BY[dex] || {}).name || b.id) + T(' joined you! Choose it as your partner from the menu.', ' se ha unido a ti. Elígelo como compañero desde el menú.'), 4.5, 1); R.Audio.sfx('legend'); } catch (e) { /* ignore */ }
    }
    if (AI.Exp) AI.Exp.give(10, 'a guardian', { key: 'tapu:' + b.id });
    AI.Bus.emit({ type: 'guardian', what: 'won', id: b.id, dex, x: b.e.x, y: b.e.y, loud: 0 });
    try { R.Pickups.clear && R.Pickups.clear(); } catch (e) { /* ignore */ }
    end(b.id);
  }
  function lost(b, gone) {
    const R = AI.R;
    try { if (!gone) { b.e.dead = true; b.e.hp = 0; R.FX.burst(b.e.x, b.e.y - 30, COL[b.id], 30, 240); } } catch (e) { /* ignore */ }
    try { R.Spawner.say(LINES.lost[b.id], 3, 1); } catch (e) { /* ignore */ }
    st.cool[b.id] = AI.time + 45;
    end(b.id);
  }
  function end(id) {
    st.battle = null;
    if (id === 'fini' && AI.Sky && AI.Sky.st.forced) { delete AI.Sky.st.forced.fog; if (!Object.keys(AI.Sky.st.forced).length) AI.Sky.st.forced = null; }
  }

  // ---------------------------------------------------------------- the arenas, dressed
  function drawUnder(ctx) {
    if (!on()) return;
    const cam = AI.R.Camera;
    for (const id of Object.keys(DEX)) {
      const a = arena(id);
      if (!a || !cam.sees(a.x, a.y, a.r + 120)) continue;
      ctx.save();
      if (id === 'koko') {
        // the cliff-top: a scorched, cracked plateau
        ctx.fillStyle = 'rgba(20,18,24,0.35)'; ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r, a.r * 0.8, 0, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(255,225,80,0.35)'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const t0 = i / 6 * 6.283; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + Math.cos(t0) * a.r * 0.5, a.y + Math.sin(t0) * a.r * 0.4); ctx.lineTo(a.x + Math.cos(t0 + 0.3) * a.r * 0.8, a.y + Math.sin(t0 + 0.3) * a.r * 0.64); ctx.stroke(); }
        // the cliff's edge, and the ramp
        const rg = a.o.ring;
        if (rg) {
          ctx.strokeStyle = '#2a2830'; ctx.lineWidth = rg.r1 - rg.r0;
          ctx.beginPath(); ctx.ellipse(a.x, a.y, (rg.r0 + rg.r1) / 2, (rg.r0 + rg.r1) / 2 * 0.98, 0, rg.gap + rg.gapW, rg.gap - rg.gapW + 6.283); ctx.stroke();
          ctx.strokeStyle = '#5a5862'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(a.x, a.y, rg.r0 + 2, rg.r0 + 2, 0, rg.gap + rg.gapW, rg.gap - rg.gapW + 6.283); ctx.stroke();
        }
      } else if (id === 'lele') {
        ctx.fillStyle = 'rgba(255,190,220,0.25)'; ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r * 0.8, a.r * 0.6, 0, 0, 6.283); ctx.fill();
        for (let i = 0; i < 9; i++) { const t0 = i / 9 * 6.283; if (AI.Art) AI.Art.draw(ctx, 'x_runestone', a.x + Math.cos(t0) * a.r * 0.82, a.y + Math.sin(t0) * a.r * 0.62, { scale: 0.8 }); }
      } else if (id === 'bulu') {
        ctx.fillStyle = 'rgba(180,170,140,0.5)'; ctx.fillRect(a.x - a.r * 0.6, a.y - a.r * 0.45, a.r * 1.2, a.r * 0.9);
        ctx.strokeStyle = 'rgba(120,110,90,0.6)'; ctx.lineWidth = 1;
        for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(a.x - a.r * 0.6, a.y + k * a.r * 0.13); ctx.lineTo(a.x + a.r * 0.6, a.y + k * a.r * 0.13); ctx.stroke(); }
        for (const [dx, dy] of [[-0.55, -0.4], [0.55, -0.4], [-0.55, 0.4], [0.55, 0.4], [0, -0.45]]) if (AI.Art) AI.Art.draw(ctx, dy < 0 && dx === 0 ? 'g_statue' : 'g_pillar', a.x + dx * a.r, a.y + dy * a.r, { scale: 0.9 });
      } else if (id === 'fini') {
        // the Summit of Two Orbs
        ctx.fillStyle = 'rgba(160,170,180,0.35)'; ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r * 0.7, a.r * 0.5, 0, 0, 6.283); ctx.fill();
        const s = sea();
        pedestals().forEach((q, i) => {
          const id2 = i === 0 ? 'red' : 'blue';
          ctx.fillStyle = '#6f6c66'; ctx.fillRect(q[0] - 12, q[1] - 26, 24, 26);
          ctx.fillStyle = '#8d8a83'; ctx.fillRect(q[0] - 15, q[1] - 30, 30, 6);
          if (s && s.has(id2) && won('fini')) return; // (taken)
          const g = ctx.createRadialGradient(q[0], q[1] - 38, 0, q[0], q[1] - 38, 22);
          const c = i === 0 ? '255,80,60' : '70,140,255';
          g.addColorStop(0, 'rgba(' + c + ',0.9)'); g.addColorStop(1, 'rgba(' + c + ',0)');
          ctx.fillStyle = g; ctx.fillRect(q[0] - 22, q[1] - 60, 44, 44);
          ctx.fillStyle = i === 0 ? '#e0402e' : '#2f6fe0'; ctx.beginPath(); ctx.arc(q[0], q[1] - 38 + Math.sin(AI.time * 2 + i) * 2, 7, 0, 6.283); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(q[0] - 3, q[1] - 42 + Math.sin(AI.time * 2 + i) * 2, 2, 2);
        });
      }
      ctx.restore();
    }
  }
  function drawAir(ctx) {
    if (!on()) return;
    for (const f of st.fx) {
      if (f.kind !== 'petal') continue;
      f.x += f.vx * 0.016; f.y += f.vy * 0.016; f.vy += 0.3;
      ctx.fillStyle = 'rgba(255,170,210,' + Math.min(1, f.life - f.t).toFixed(2) + ')';
      ctx.fillRect(Math.round(f.x), Math.round(f.y), 3, 2);
    }
    const A = st.actor;
    if (A && A.alpha > 0.01) {
      ctx.save();
      const y = A.y - (A.z || 0);
      const c = COL[st.scene ? st.scene.id : 'koko'];
      const g = ctx.createRadialGradient(A.x, y - 30, 0, A.x, y - 30, 80);
      g.addColorStop(0, c + '55'); g.addColorStop(1, c + '00');
      ctx.fillStyle = g; ctx.fillRect(A.x - 80, y - 110, 160, 160);
      try { A.a.draw(ctx, A.x, y, { alpha: A.alpha }); } catch (e) { /* ignore */ }
      ctx.restore();
    }
  }
  function drawScreen(ctx, w, h) {
    if (!on() || st.dim <= 0.01) return;
    ctx.save();
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(4,6,14,0)'); g.addColorStop(1, 'rgba(4,6,14,' + st.dim.toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  function lights(out) {
    if (!on()) return;
    const A = st.actor;
    if (A && st.scene) out.push({ x: A.x, y: A.y - 30, r: 150, c: st.scene.id === 'koko' ? [255, 236, 120] : st.scene.id === 'lele' ? [255, 170, 220] : st.scene.id === 'bulu' ? [170, 240, 120] : [150, 220, 255], i: 0.8 });
    const b = st.battle;
    if (b && !b.e.dead) out.push({ x: b.e.x, y: b.e.y - 30, r: 110, c: b.id === 'koko' ? [255, 236, 120] : b.id === 'lele' ? [255, 170, 220] : b.id === 'bulu' ? [170, 240, 120] : [150, 220, 255], i: 0.45 });
    const a = arena('fini');
    if (a && !won('fini')) pedestals().forEach((q, i) => out.push({ x: q[0], y: q[1] - 38, r: 60, c: i === 0 ? [255, 90, 70] : [80, 150, 255], i: 0.6 }));
  }
  function reset() { st.scene = null; st.battle = null; st.actor = null; st.cool = {}; st.dim = 0; st.fx.length = 0; }

  AI.define('Guardians', { st, DEX, tick, busy, done, won, arena, pedestals, startScene, drawUnder, drawAir, drawScreen, lights, reset });
})();
