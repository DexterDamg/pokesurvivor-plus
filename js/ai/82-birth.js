/* PokéSurvivor+ — Living World AI · Birth Island (the Tropical Ocean)
 * In some worlds, far out to sea inside its own bank of fog, lies Birth Island, exactly as it was
 * on the Game Boy Advance (assets/ocean/birth.png): a stepped triangle of rock above red cliffs,
 * a wooden pier, the little house at its foot. No grinding: each world it isn't in makes it likelier
 * in the next, and when it's out there you'll see its signal, a red pulse at the edge of the screen
 * whenever you're anywhere near.
 * On the bare rock at the top sits a black triangle. Touch it and it jumps somewhere else; reach
 * it again before you've taken too many steps (the count starts over at each touch) or it slips
 * back to the middle and the sequence begins again. With every touch its colour burns brighter.
 * Touch it at the last place and it splits open: Deoxys. Win, and Deoxys is yours to keep.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const O = () => AI.Ocean;
  // where the triangle goes, in the painting's own pixels (it's drawn at twice its size)
  const SPOTS = [[248, 200], [200, 232], [296, 232], [248, 150], [184, 240], [312, 240], [232, 176], [264, 176], [216, 216], [280, 216], [248, 200]];
  const st = { i: 0, steps: 0, lastX: 0, lastY: 0, flash: 0, reset: 0, scene: null, battle: null, actor: null, seen: false, counted: false, cool: 0, sig: 0 };

  function on() { return O() && O().on() && AI.cfg.birthIsland !== false; }
  function player() { return AI.R.Game.player; }
  function T(en, es) { return (AI.lang && AI.lang() === 'es' && es) || en; }
  function isle() { const p = O().plan(); return p.birth ? { x: p.birth.x, y: p.birth.y, cx: p.birth.x + 480, cy: p.birth.y + 480 } : null; }
  function owned() { try { const sv = AI.R.DB.save; return !!(sv && sv.owned && sv.owned[386]) || !!(AI.Sea && AI.Sea.save.deoxys); } catch (e) { return false; } }
  function spot(i) { const b = isle(); const s = SPOTS[Math.min(i, SPOTS.length - 1)]; return [b.x + s[0] * 2, b.y + s[1] * 2 + 6]; }
  // how many steps (32 px each) it allows to reach the next spot
  function budget(i) { if (i <= 0) return 99; const a = spot(i - 1), b = spot(i); return Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 32) + 4; }
  function busy() { return !!st.scene; }

  function tick(dt) {
    if (!on()) return;
    const b = isle();
    const sv = AI.Sea && AI.Sea.save;
    // (a world without it makes the next one likelier: 34-ocean.js reads birthMiss)
    if (!st.counted && sv) { st.counted = true; if (!b) { sv.birthMiss = (sv.birthMiss || 0) + 1; AI.Sea.persist(); } }
    if (!b) return;
    const p = player();
    if (!p || p.dead) return;
    st.flash = Math.max(0, st.flash - dt);
    st.reset = Math.max(0, st.reset - dt);
    st.cool = Math.max(0, st.cool - dt);
    st.sig += dt;
    const d = Math.hypot(p.x - b.cx, p.y - b.cy);
    if (!st.seen && d < 1100) {
      st.seen = true;
      try { AI.say(T('Birth Island', 'Isla Origen'), 3.5, 1); } catch (e) { /* ignore */ }
      AI.Bus.emit({ type: 'sea', what: 'island', id: 'birth', x: p.x, y: p.y, loud: 0 });
      if (sv && !sv.birthSeen) { sv.birthSeen = Date.now(); sv.birthMiss = 0; AI.Sea.persist(); if (AI.Exp) AI.Exp.give(10, 'Birth Island', { key: 'birth-island' }); }
    }
    if (st.scene) return tickScene(dt);
    if (st.battle) return tickBattle(dt);
    if (owned() || st.cool > 0) return;
    // the puzzle: count your steps, touch the triangle
    const moved = Math.hypot(p.x - st.lastX, p.y - st.lastY);
    if (moved < 300) st.steps += moved / 32;
    st.lastX = p.x; st.lastY = p.y;
    if (d > 700) { st.steps = 0; return; }
    const q = spot(st.i);
    if (Math.hypot(p.x - q[0], p.y - q[1]) < 22) {
      st.i++;
      st.steps = 0;
      st.flash = 0.6;
      try { AI.R.Audio.sfx('click'); AI.R.FX.ring(q[0], q[1] - 8, 6, 50, '#ff5040', 0.5, 4); } catch (e) { /* ignore */ }
      if (st.i >= SPOTS.length) startScene(q);
      return;
    }
    if (st.i > 0 && st.steps > budget(st.i)) {
      // too many steps: back to the middle
      st.i = 0; st.steps = 0; st.reset = 1.2;
      try { AI.say(T('The triangle flickers and slips back to the centre…', 'El triángulo parpadea y vuelve al centro…'), 2.5, 1); } catch (e) { /* ignore */ }
    }
  }
  function startScene(at) {
    st.scene = { t: 0, at, step: 0, line: 0 };
    try { AI.Talk.clear && AI.Talk.clear(); AI.R.Camera.kick(0.6); AI.R.Audio.sfx('legend'); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'birth', what: 'scene', x: at[0], y: at[1], loud: 0 });
  }
  const LINES = [
    [T('· – – · – · · · – –', '· – – · – · · · – –'), 'Normal'],
    [T('…SIGNAL… RECEIVED. YOU. ARE THE SOURCE.', '…SEÑAL… RECIBIDA. TÚ. ERES EL ORIGEN.'), 'Normal'],
    [T('DATA INSUFFICIENT. COMBAT WILL PROVIDE.', 'DATOS INSUFICIENTES. EL COMBATE LOS PROPORCIONARÁ.'), 'Determined'],
  ];
  function tickScene(dt) {
    const sc = st.scene, R = AI.R, p = player();
    sc.t += dt;
    if (p) p.invuln = Math.max(p.invuln || 0, 0.4);
    if (sc.step === 0 && sc.t > 1.4) {
      sc.step = 1;
      try { const a = new R.Sprites.Animator(386, 1, false); a.loop('Idle'); R.Sprites.preload([386], 4000); st.actor = { a, x: sc.at[0], y: sc.at[1], alpha: 0 }; } catch (e) { /* ignore */ }
      try { R.FX.burst(sc.at[0], sc.at[1] - 10, '#ff5040', 40, 260); R.FX.ring(sc.at[0], sc.at[1], 10, 160, '#5ad0ff', 0.7, 6); R.Camera.kick(1); } catch (e) { /* ignore */ }
    }
    const A = st.actor;
    if (A) { A.alpha = Math.min(1, A.alpha + dt * 0.8); try { A.a.update(dt); if (p) A.a.dir = R.Sprites.dirFromAngle(Math.atan2(p.y - A.y, p.x - A.x)); } catch (e) { /* ignore */ } }
    if (sc.line < LINES.length && sc.t > 3 + sc.line * 3) { const [text, emo] = LINES[sc.line++]; if (AI.Talk) AI.Talk.legend(386, text, { emo, life: 3.2 }); }
    if (sc.t > 3 + LINES.length * 3 + 0.6) startBattle(sc);
  }
  function startBattle(sc) {
    const R = AI.R;
    const d = R.DEX_BY[386] || { name: 'Deoxys' };
    const A = st.actor;
    const x = A ? A.x : sc.at[0], y = A ? A.y : sc.at[1];
    let hp = 2600, dmg = 18;
    try { hp = Math.round(Math.max(6.5 * R.Stats.hpRef(), 1900)); } catch (e) { /* ignore */ }
    try { dmg = Math.round(R.Enemies.bossDmg(R.Game.st.time)); } catch (e) { /* ignore */ }
    const def = { dex: 386, name: d.name, hp, spd: 130, dmg, xp: 700, behavior: 'shooter', shotDmg: Math.round(dmg * 0.5), shotCd: 0.95, range: 320 };
    let e = null;
    try {
      e = new R.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 }, true);
      e.psxDeoxys = true; e.psxStory = true; e.psxPlaced = true; e.psxForceTemp = 'aggressive'; e.legend = true;
      R.EnemyMgr.add(e);
      if (AI.Talk && AI.Talk.legends) AI.Talk.legends.seen.set(e, { stage: 0 });
    } catch (err) { AI.warn('deoxys', err); }
    st.actor = null; st.scene = null;
    st.battle = e ? { e, t: 0, tele: 3.5 } : null;
    try { R.Audio.sfx('boss'); } catch (err) { /* ignore */ }
  }
  function tickBattle(dt) {
    const b = st.battle, R = AI.R, p = player();
    b.t += dt;
    if (b.e.dead) return victory(b);
    const gone = !R.EnemyMgr.all().includes(b.e);
    const bi = isle();
    if (gone || !p || p.dead || b.t > 300 || Math.hypot(p.x - bi.cx, p.y - bi.cy) > 1300) {
      try { if (!gone) { b.e.dead = true; b.e.hp = 0; R.FX.burst(b.e.x, b.e.y - 30, '#ff5040', 30, 240); } R.Spawner.say(T('Deoxys dissolves into light. The triangle waits at the centre again.', 'Deoxys se disuelve en luz. El triángulo vuelve a esperar en el centro.'), 3, 1); } catch (e) { /* ignore */ }
      st.battle = null; st.i = 0; st.steps = 0; st.cool = 30;
      return;
    }
    // it blinks from place to place
    b.tele -= dt;
    if (b.tele <= 0) {
      b.tele = U.rand(2.5, 4);
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * 6.283, x = p.x + Math.cos(a) * U.rand(130, 210), y = p.y + Math.sin(a) * U.rand(90, 150);
        if (O().fits('walk', x, y)) { try { R.FX.burst(b.e.x, b.e.y - 20, '#ff5040', 16, 140); } catch (e) { /* ignore */ } b.e.x = x; b.e.y = y; break; }
      }
    }
  }
  function victory(b) {
    const R = AI.R;
    try {
      R.DB.grant(386, 'birth-island');
      const sv = R.DB.save;
      sv.legends = sv.legends || {};
      if (!sv.legends[386]) sv.legends[386] = Date.now();
      R.DB.commit && R.DB.commit();
    } catch (e) { AI.warn('deoxys-grant', e); }
    if (AI.Sea) { AI.Sea.save.deoxys = Date.now(); AI.Sea.persist(); }
    if (AI.Talk) AI.Talk.legend(386, T('…DATA COMPLETE. I WILL TRAVEL WITH THE SOURCE.', '…DATOS COMPLETOS. VIAJARÉ CON EL ORIGEN.'), { emo: 'Normal', life: 5 });
    try { R.Spawner.say(T('Deoxys joined you! Choose it as your partner from the menu.', 'Deoxys se ha unido a ti. Elígelo como compañero desde el menú.'), 4.5, 1); R.Audio.sfx('legend'); R.Pickups.clear && R.Pickups.clear(); } catch (e) { /* ignore */ }
    if (AI.Exp) AI.Exp.give(12, 'Deoxys', { key: 'deoxys' });
    AI.Bus.emit({ type: 'birth', what: 'won', x: b.e.x, y: b.e.y, loud: 0 });
    st.battle = null;
  }

  // ---------------------------------------------------------------- drawing
  function drawUnder(ctx) {
    if (!on() || st.scene || st.battle || owned()) return;
    const b = isle();
    if (!b) return;
    const q = spot(st.i);
    if (!AI.R.Camera.sees(q[0], q[1], 40)) return;
    const im = AI.OceanDraw && AI.OceanDraw.IMG.tri;
    const k = st.i / SPOTS.length;
    const a = st.reset > 0 ? 1 - st.reset / 1.2 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    if (im && im.ok) { ctx.imageSmoothingEnabled = false; ctx.drawImage(im, Math.round(q[0] - 16), Math.round(q[1] - 30), 32, 32); }
    // its colour burns brighter with every touch
    if (k > 0 || st.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(q[0], q[1] - 14, 0, q[0], q[1] - 14, 30);
      const i2 = Math.min(1, k * 0.9 + st.flash) * (0.7 + 0.3 * Math.sin(AI.time * (3 + k * 6)));
      g.addColorStop(0, 'rgba(255,70,50,' + (0.75 * i2).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,70,50,0)');
      ctx.fillStyle = g; ctx.fillRect(q[0] - 30, q[1] - 44, 60, 60);
    }
    ctx.restore();
  }
  function drawAir(ctx) {
    const A = st.actor;
    if (!A || !on()) return;
    ctx.save();
    const g = ctx.createRadialGradient(A.x, A.y - 30, 0, A.x, A.y - 30, 90);
    g.addColorStop(0, 'rgba(255,80,60,' + (0.35 * A.alpha).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,80,60,0)');
    ctx.fillStyle = g; ctx.fillRect(A.x - 90, A.y - 120, 180, 180);
    try { A.a.draw(ctx, A.x, A.y, { alpha: A.alpha }); } catch (e) { /* ignore */ }
    ctx.restore();
  }
  // its signal: a red pulse at the edge of the screen, toward the island, whenever you're near enough
  function drawScreen(ctx, w, h) {
    if (!on()) return;
    const b = isle(), p = player();
    if (!b || !p || owned()) return;
    const cam = AI.R.Camera;
    const d = Math.hypot(b.cx - p.x, b.cy - p.y);
    if (d > 3600 || cam.sees(b.cx, b.cy, 200)) return;
    const pulse = Math.max(0, Math.sin(st.sig * 2.2)) ** 4;
    if (pulse < 0.02) return;
    const a = Math.atan2(b.cy - p.y, b.cx - p.x), k = Math.min(w, h) * 0.46;
    const x = U.clamp(w / 2 + Math.cos(a) * k * 1.6, 20, w - 20), y = U.clamp(h / 2 + Math.sin(a) * k, 20, h - 20);
    const al = pulse * U.clamp(1.3 - d / 3600, 0.25, 0.8);
    ctx.save();
    const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, 'rgba(255,70,60,' + al.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,70,60,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 26, y - 26, 52, 52);
    ctx.restore();
  }
  function lights(out) {
    if (!on() || owned()) return;
    const b = isle();
    if (!b) return;
    const q = spot(st.i);
    out.push({ x: q[0], y: q[1] - 14, r: 50 + st.i * 4, c: [255, 90, 70], i: 0.25 + st.i * 0.05 });
  }
  function reset() { st.i = 0; st.steps = 0; st.flash = 0; st.reset = 0; st.scene = null; st.battle = null; st.actor = null; st.seen = false; st.counted = false; st.cool = 0; }

  AI.define('Birth', { st, SPOTS, spot, budget, tick, busy, owned, drawUnder, drawAir, drawScreen, lights, reset, isle });
})();
