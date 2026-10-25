/* PokéSurvivor+ — Living World AI · Raikou, Suicune and Entei can be earned in the Shady Forest
 *   Raikou   in a harsh thunderstorm at night, its shadow shows up near you in the lightning. The
 *            fourth time, a bolt strikes right in front of you and Raikou is standing in it. It has
 *            had its eye on you: it battles you.
 *   Suicune  by day, in the thickest fog, its shadow drifts past in the white. The fourth time, the
 *            fog parts and Suicune walks up to you. It battles you.
 *   Entei    by day, in clear weather, once you have both Raikou and Suicune: by chance, it comes
 *            to challenge you.
 * Beat it and it joins you: it can be chosen as your partner from the menu, like any Pokémon you
 * own. Lose or run, and it waits for the next time the weather is right. How many shadows you've
 * seen is kept between runs.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const KEY = 'psx.trio.v1';
  const DEX = { raikou: 243, suicune: 245, entei: 244 };
  const NEED = 4; // shadows before it shows itself
  let save = load();
  function load() { try { return Object.assign({ raikou: { seen: 0 }, suicune: { seen: 0 }, entei: { seen: 0 } }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { raikou: { seen: 0 }, suicune: { seen: 0 }, entei: { seen: 0 } }; } }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
  const st = { scene: null, battle: null, shadows: [], nextShadow: 0, enteiT: 30, dim: 0, scorch: [], actor: null, cool: 0 };

  function on() { return AI.enabled && AI.cfg.legendTrio !== false; }
  function S() { return AI.Sky; }
  function player() { return AI.R.Game.player; }
  function owned(dex) { try { const sv = AI.R.DB.save; return !!(sv && sv.owned && sv.owned[dex]); } catch (e) { return false; } }
  function won(id) { return !!(save[id] && save[id].won) || owned(DEX[id]); }
  function T(en, es) { return (AI.lang && AI.lang() === 'es' && es) || en; }
  function busy() { return !!st.scene; }

  // ---------------------------------------------------------------- the conditions
  function harshNightStorm() { const s = S(); return s.darkness() > 0.7 && s.storm >= 0.75; }
  function thickDayFog() { const s = S(); return s.darkness() < 0.3 && s.fog >= 0.85; }
  function clearDay() { const s = S(); return s.darkness() < 0.3 && s.rain < 0.05 && s.storm < 0.05 && s.fog < 0.15 && s.st.cur.cloud < 0.45; }
  function free() {
    const R = AI.R;
    if (!AI.Forest || !AI.Forest.on()) return false;
    if ((AI.Mansion && AI.Mansion.inside) || (AI.Totem && AI.Totem.active()) || (AI.Story && AI.Story.busy())) return false;
    if (R.Game.state !== 'playing' || (R.Rift && R.Rift.inArena)) return false;
    try { if (R.EnemyMgr.bossAlive()) return false; } catch (e) { /* ignore */ }
    return true;
  }

  // ---------------------------------------------------------------- shadows
  function spotNear(p, rMin, rMax) {
    const R = AI.R;
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * 6.283, r = U.rand(rMin, rMax);
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * 0.75;
      if (!R.Camera.sees(x, y - 40, -30)) continue;
      if (!R.World.isFree(x, y, 18) || (AI.Forest && AI.Forest.water(x, y).e > -20)) continue;
      return [x, y];
    }
    return null;
  }
  function shadow(id) {
    const M = AI.Mysteries;
    const p = player();
    if (!M || !M.spawnApp) return null;
    const at = spotNear(p, id === 'raikou' ? 240 : 200, id === 'raikou' ? 380 : 320);
    if (!at) return null;
    const ap = id === 'raikou'
      ? M.spawnApp('raikou', at[0], at[1], { sil: true, flee: 150, life: 2.4, fade: 0.08, leave: 'run', speed: 420, outFade: 0.25, face: true, trio: true })
      : M.spawnApp('suicune', at[0], at[1], { sil: true, lit: 0.85, flee: 150, life: 3.2, fade: 1.2, leave: 'fade', outFade: 1.4, face: true, maxAlpha: 0.75, trio: true });
    if (!ap) return null;
    if (id === 'suicune') { ap.vx = U.rand(-30, 30); }
    st.shadows.push({ id, ap, counted: false });
    return ap;
  }
  function countShadows() {
    const M = AI.Mysteries;
    for (let i = st.shadows.length - 1; i >= 0; i--) {
      const sh = st.shadows[i];
      if (!sh.counted && sh.ap.vis >= 0.35) {
        sh.counted = true;
        save[sh.id].seen = (save[sh.id].seen || 0) + 1;
        persist();
        try { M.note(sh.id, 'sight'); } catch (e) { /* ignore */ }
        AI.Bus.emit({ type: 'trio', what: 'shadow', id: sh.id, n: save[sh.id].seen, x: sh.ap.x, y: sh.ap.y, loud: 0 });
      }
      if (!M.run.apps.includes(sh.ap)) st.shadows.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------- per frame
  function tick(dt) {
    if (!on() || !AI.R || !AI.Sky) return;
    if (st.scene) { tickScene(dt); return; }
    tickBattle(dt);
    if (st.battle) return;
    countShadows();
    if (!free()) return;
    st.cool -= dt;
    // Raikou: shadows in the lightning of a harsh night storm
    if (!won('raikou') && harshNightStorm()) {
      if (save.raikou.seen >= NEED && st.cool <= 0 && !st.shadows.length) return startScene('raikou');
      const fl = S().st.flash;
      const strike = fl > (st.flashPrev || 0) + 0.18;
      st.flashPrev = fl;
      if (strike && !st.shadows.some((s) => s.id === 'raikou') && AI.time > st.nextShadow && Math.random() < 0.6) { if (shadow('raikou')) st.nextShadow = AI.time + 5; }
    } else st.flashPrev = S().st.flash;
    // Suicune: shadows in the thickest daytime fog
    if (!won('suicune') && thickDayFog()) {
      if (save.suicune.seen >= NEED && st.cool <= 0 && !st.shadows.length) return startScene('suicune');
      if (!st.shadows.some((s) => s.id === 'suicune') && AI.time > st.nextShadow) {
        st.nextShadow = AI.time + U.rand(6, 11);
        if (Math.random() < 0.75) shadow('suicune');
      }
    }
    // Entei: a clear day, once the other two are yours, by chance
    if (!won('entei') && won('raikou') && won('suicune') && clearDay()) {
      st.enteiT -= dt;
      if (st.enteiT <= 0) { st.enteiT = 30; if (st.cool <= 0 && Math.random() < (AI.cfg.enteiChance == null ? 0.12 : AI.cfg.enteiChance)) return startScene('entei'); }
    }
  }

  // ---------------------------------------------------------------- the scenes
  const LINES = {
    raikou: [
      [T('…So you\'re the one who keeps finding me in the storm.', '…Así que eres tú quien me encuentra una y otra vez en la tormenta.'), 'Determined'],
      [T('I\'ve had my eye on you. Few stand their ground where the lightning falls.', 'Te he estado observando. Pocos aguantan donde cae el rayo.'), 'Normal'],
      [T('Show me the spark in you — WE SHALL BATTLE!!', 'Muéstrame la chispa que llevas dentro: ¡¡LUCHEMOS!!'), 'Shouting'],
    ],
    suicune: [
      [T('The mist parts only for those it chooses.', 'La niebla solo se aparta para quienes elige.'), 'Normal'],
      [T('Four times you looked into the fog and found me. Four times you did not turn away.', 'Cuatro veces miraste a la niebla y me encontraste. Cuatro veces no te diste la vuelta.'), 'Normal'],
      [T('Let us see whether your heart is as clear as the water. Face me!', 'Veamos si tu corazón es tan claro como el agua. ¡Enfréntate a mí!'), 'Determined'],
    ],
    entei: [
      [T('Raikou… Suicune… they have both chosen you.', 'Raikou… Suicune… ambos te han elegido.'), 'Normal'],
      [T('I had to see it with my own eyes.', 'Tenía que verlo con mis propios ojos.'), 'Determined'],
      [T('Burn bright — or burn out! COME!', '¡Arde con fuerza, o apágate! ¡VEN!'), 'Shouting'],
    ],
    raikouWon: T('…Your spark is real. From now on, I run with you.', '…Tu chispa es real. A partir de ahora, corro contigo.'),
    suicuneWon: T('Your heart is clear. I will walk beside you.', 'Tu corazón es claro. Caminaré a tu lado.'),
    enteiWon: T('Ha! The fire in you is real. Lead on — I\'ll follow.', '¡Ja! El fuego que llevas dentro es real. Adelante, te seguiré.'),
    raikouLost: T('Raikou vanishes into the storm. It will be watching.', 'Raikou desaparece en la tormenta. Seguirá observando.'),
    suicuneLost: T('Suicune slips back into the fog.', 'Suicune se desliza de vuelta a la niebla.'),
    enteiLost: T('Entei leaps away in a burst of flame.', 'Entei se aleja de un salto entre llamas.'),
  };
  function startScene(id) {
    const R = AI.R, p = player();
    const face = p._lastAng != null ? p._lastAng : -Math.PI / 2;
    // the spot in front of you where it will stand
    let at = null;
    for (const a of [face, -Math.PI / 2, Math.PI / 2, 0, Math.PI]) {
      const d = id === 'suicune' ? 150 : 120;
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.8;
      if (R.World.isFree(x, y, 22) && !(AI.Forest && AI.Forest.water(x, y).e > -20)) { at = [x, y]; break; }
    }
    if (!at) at = [p.x, p.y - 120];
    st.scene = { id, t: 0, at, step: 0, line: 0 };
    st.dim = 0;
    try { AI.Talk.clear && AI.Talk.clear(); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'trio', what: 'scene', id, x: at[0], y: at[1], loud: 0 });
    if (id === 'suicune') { S().st.forced = Object.assign({}, S().st.forced || {}, { fog: 0.18 }); try { AI.Ambience && AI.Ambience.myst('shimmer', at[0], at[1]); } catch (e) { /* ignore */ } }
    if (id === 'raikou') { try { AI.Ambience && AI.Ambience.rumble(); } catch (e) { /* ignore */ } }
    if (id === 'entei') { try { AI.Ambience && AI.Ambience.myst('roar', at[0], at[1]); R.Camera.kick(0.7); } catch (e) { /* ignore */ } }
  }
  function actor(dex, x, y) {
    try { const a = new AI.R.Sprites.Animator(dex, 1, false); a.loop('Idle'); AI.R.Sprites.preload([dex], 4000); return { dex, a, x, y, alpha: 0 }; } catch (e) { return null; }
  }
  function tickScene(dt) {
    const sc = st.scene, R = AI.R, p = player();
    sc.t += dt;
    if (p) { p.invuln = Math.max(p.invuln || 0, 0.4); p._vx = p._vy = 0; }
    const [ax, ay] = sc.at;
    const dex = DEX[sc.id];
    if (sc.id === 'raikou') {
      st.dim = Math.min(0.55, sc.t * 0.5);
      if (sc.step === 0 && sc.t > 1.6) {
        // the bolt, right in front of you
        sc.step = 1;
        S().st.strikes.push({ x: ax, y: ay, t: 0, seed: (Math.random() * 1e9) | 0, power: 1 });
        S().st.flash = 1.2;
        st.scorch.push({ x: ax, y: ay, t: 0 });
        try { R.Camera.kick(1); R.Audio.sfx('ultBolt'); R.FX.burst(ax, ay - 10, '#fff7a0', 40, 300); R.FX.ring(ax, ay, 10, 140, '#ffe14d', 0.7, 6); } catch (e) { /* ignore */ }
        AI.Bus.emit({ type: 'lightning', x: ax, y: ay, loud: 600, dist: 0.05, near: true });
        st.actor = actor(dex, ax, ay);
        if (st.actor) st.actor.alpha = 1;
      }
    } else if (sc.id === 'suicune') {
      if (sc.step === 0 && sc.t > 1) {
        sc.step = 1;
        // it walks out of the parting fog toward you
        const a = Math.atan2(ay - p.y, ax - p.x);
        st.actor = actor(dex, p.x + Math.cos(a) * 430, p.y + Math.sin(a) * 430 * 0.8);
        if (st.actor) { st.actor.walkTo = [ax, ay]; st.actor.a.loop('Walk'); }
      }
    } else if (sc.id === 'entei') {
      if (sc.step === 0 && sc.t > 1.2) {
        sc.step = 1;
        st.actor = actor(dex, ax, ay);
        if (st.actor) { st.actor.alpha = 1; st.actor.z = 120; }
        st.scorch.push({ x: ax, y: ay, t: 0, fire: true });
        try { R.FX.ring(ax, ay, 12, 160, '#ff8a3d', 0.7, 6); R.FX.burst(ax, ay - 10, '#ffb05a', 40, 280); R.Camera.kick(0.9); R.Audio.sfx('boss'); } catch (e) { /* ignore */ }
      }
    }
    // the actor
    const A = st.actor;
    if (A) {
      try { A.a.update(dt); A.a.dir = R.Sprites.dirFromAngle(Math.atan2(p.y - A.y, p.x - A.x)); } catch (e) { /* ignore */ }
      if (A.z) A.z = Math.max(0, A.z - dt * 420);
      if (A.walkTo) {
        A.alpha = Math.min(1, A.alpha + dt * 0.6);
        const dx = A.walkTo[0] - A.x, dy = A.walkTo[1] - A.y, d = Math.hypot(dx, dy);
        if (d > 3) { A.x += dx / d * Math.min(d, 60 * dt); A.y += dy / d * Math.min(d, 60 * dt); } else if (A.walkTo) { A.walkTo = null; A.a.loop('Idle'); }
      }
      if (Math.random() < dt * 8 && R.Camera.sees(A.x, A.y, 30)) {
        try { R.FX.burst(A.x + U.rand(-20, 20), A.y - U.rand(10, 50), sc.id === 'raikou' ? '#ffe14d' : sc.id === 'suicune' ? '#9fe8ff' : '#ff8a3d', 2, 60); } catch (e) { /* ignore */ }
      }
    }
    // its words, in the Legendary box
    const t0 = sc.id === 'suicune' ? 6 : 3;
    const L = LINES[sc.id];
    if (sc.line < L.length && sc.t > t0 + sc.line * 3.2) {
      const [text, emo] = L[sc.line++];
      if (AI.Talk) AI.Talk.legend(dex, text, { emo, life: 3.4 });
    }
    if (sc.t > t0 + L.length * 3.2 + 0.6) startBattle(sc);
  }
  function startBattle(sc) {
    const R = AI.R;
    const dex = DEX[sc.id];
    const d = R.DEX_BY[dex] || { name: sc.id };
    const A = st.actor;
    const x = A ? A.x : sc.at[0], y = A ? A.y : sc.at[1];
    let hp = 2600, dmg = 18;
    try { hp = Math.round(Math.max(6 * R.Stats.hpRef(), 1800)); } catch (e) { /* ignore */ }
    try { dmg = Math.round(R.Enemies.bossDmg(R.Game.st.time)); } catch (e) { /* ignore */ }
    const kind = { raikou: { spd: 125, behavior: 'shooter', range: 320, shotCd: 1.3 }, suicune: { spd: 95, behavior: 'shooter', range: 300, shotCd: 1.5 }, entei: { spd: 110, behavior: 'chase', range: 240, shotCd: 1.4 } }[sc.id];
    const def = { dex, name: d.name, hp, spd: kind.spd, dmg, xp: 600, behavior: kind.behavior, shotDmg: Math.round(dmg * 0.46), shotCd: kind.shotCd, range: kind.range };
    let e = null;
    try {
      e = new R.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 }, true);
      e.psxTrio = sc.id; e.psxStory = true; e.psxPlaced = true; e.psxForceTemp = 'aggressive'; e.legend = true;
      R.EnemyMgr.add(e);
      if (AI.Talk && AI.Talk.legends) AI.Talk.legends.seen.set(e, { stage: 0 }); // (it has already spoken)
    } catch (err) { AI.warn('trio-battle', err); }
    st.actor = null;
    st.scene = null;
    st.battle = e ? { id: sc.id, e, t: 0 } : null;
    try { R.Audio.sfx('boss'); } catch (err) { /* ignore */ }
    AI.Bus.emit({ type: 'trio', what: 'battle', id: sc.id, x, y, loud: 0 });
  }
  function tickBattle(dt) {
    const b = st.battle;
    st.dim = Math.max(0, st.dim - dt * 0.4);
    for (let i = st.scorch.length - 1; i >= 0; i--) { st.scorch[i].t += dt; if (st.scorch[i].t > 90) st.scorch.splice(i, 1); }
    if (!b) return;
    const R = AI.R, p = player();
    b.t += dt;
    if (b.e.dead) return victory(b);
    const gone = !R.EnemyMgr.all().includes(b.e);
    const far = p && Math.hypot(b.e.x - p.x, b.e.y - p.y) > 1500;
    if (gone || far || b.t > 300 || !p || p.dead) {
      // it leaves, and waits for the next time the weather is right
      try { if (!gone) { b.e.dead = true; b.e.hp = 0; R.FX.burst(b.e.x, b.e.y - 30, b.id === 'entei' ? '#ff8a3d' : b.id === 'raikou' ? '#ffe14d' : '#9fe8ff', 30, 240); } } catch (e) { /* ignore */ }
      try { R.Spawner.say(LINES[b.id + 'Lost'], 3, 1); } catch (e) { /* ignore */ }
      end(b.id);
      st.cool = 60;
    }
  }
  function victory(b) {
    const R = AI.R;
    const dex = DEX[b.id];
    save[b.id].won = Date.now();
    persist();
    try {
      R.DB.grant(dex, 'shady-forest');
      const sv = R.DB.save;
      sv.legends = sv.legends || {};
      if (!sv.legends[dex]) sv.legends[dex] = Date.now();
      R.DB.commit && R.DB.commit();
    } catch (e) { AI.warn('trio-grant', e); }
    if (AI.Talk) AI.Talk.legend(dex, LINES[b.id + 'Won'], { emo: 'Happy', life: 5 });
    try { R.Spawner.say(((R.DEX_BY[dex] || {}).name || b.id) + T(' joined you! Choose it as your partner from the menu.', ' se ha unido a ti. Elígelo como compañero desde el menú.'), 4.5, 1); R.Audio.sfx('legend'); } catch (e) { /* ignore */ }
    if (AI.Exp) AI.Exp.give(10, 'a legendary', { key: 'trio:' + b.id });
    AI.Bus.emit({ type: 'trio', what: 'won', id: b.id, dex, x: b.e.x, y: b.e.y, loud: 0 });
    end(b.id);
  }
  function end(id) {
    st.battle = null;
    if (id === 'suicune' && S().st.forced) { delete S().st.forced.fog; if (!Object.keys(S().st.forced).length) S().st.forced = null; }
  }

  // ---------------------------------------------------------------- drawing
  function drawAir(ctx) {
    if (!on()) return;
    const R = AI.R;
    for (const sc of st.scorch) {
      if (!R.Camera.sees(sc.x, sc.y, 60)) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 0.6 - sc.t / 150);
      const g = ctx.createRadialGradient(sc.x, sc.y, 2, sc.x, sc.y, 46);
      g.addColorStop(0, sc.fire ? 'rgba(60,20,8,0.9)' : 'rgba(20,18,28,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sc.x, sc.y, 46, 20, 0, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    const A = st.actor;
    if (A && A.alpha > 0.01) {
      ctx.save();
      const y = A.y - (A.z || 0);
      const col = st.scene && st.scene.id === 'raikou' ? '255,230,90' : st.scene && st.scene.id === 'suicune' ? '150,230,255' : '255,140,60';
      const g = ctx.createRadialGradient(A.x, y - 30, 0, A.x, y - 30, 70);
      g.addColorStop(0, 'rgba(' + col + ',' + (0.3 * A.alpha).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g; ctx.fillRect(A.x - 70, y - 100, 140, 140);
      try { A.a.draw(ctx, A.x, y, { alpha: A.alpha }); } catch (e) { /* ignore */ }
      ctx.restore();
    }
  }
  function drawScreen(ctx, w, h) {
    if (!on() || st.dim <= 0.01) return;
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,14,' + st.dim.toFixed(3) + ')';
    // (the dark closes in from the edges; the middle stays readable)
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(4,6,14,0)'); g.addColorStop(1, 'rgba(4,6,14,' + st.dim.toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  function lights(out) {
    const A = st.actor;
    if (A && st.scene) out.push({ x: A.x, y: A.y - 30, r: 150, c: st.scene.id === 'raikou' ? [255, 236, 120] : st.scene.id === 'suicune' ? [160, 230, 255] : [255, 150, 70], i: 0.8 });
    const b = st.battle;
    if (b && b.id === 'raikou' && !b.e.dead) out.push({ x: b.e.x, y: b.e.y - 30, r: 110, c: [255, 236, 120], i: 0.45 });
    if (b && b.id === 'entei' && !b.e.dead) out.push({ x: b.e.x, y: b.e.y - 30, r: 120, c: [255, 150, 70], i: 0.5 });
  }

  function reset() { st.scene = null; st.battle = null; st.shadows.length = 0; st.actor = null; st.dim = 0; st.scorch.length = 0; st.cool = 0; st.enteiT = 30; st.nextShadow = 0; }
  function forget() { save = { raikou: { seen: 0 }, suicune: { seen: 0 }, entei: { seen: 0 } }; persist(); }

  AI.define('Trio', { st, DEX, NEED, tick, busy, reset, forget, startScene, shadow, drawAir, drawScreen, lights, harshNightStorm, thickDayFog, clearDay, won, get save() { return save; } });
})();
