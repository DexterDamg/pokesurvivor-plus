/* PokéSurvivor+ — Living World AI · the Odd Keystone, the Creepy Well and Spiritomb
 * Spiritomb is earned in the Shady Forest, and the way to it is not a kind one.
 *   1. The Odd Keystone lies somewhere in one of the forest's clearings, out of sight, a faint
 *      purple glint in the grass (assets/items/odd_keystone.png). Walk over it to pick it up. Once
 *      it's yours you keep it, run after run.
 *   2. Defeat 100 innocent Pokémon in the Shady Forest: ones minding their own business, that never
 *      turned on you (Pokémon that attack you, bosses and legendaries don't count). The count is
 *      kept between runs; while you carry the keystone it's shown on screen, and the keystone grows
 *      colder as the count climbs.
 *   3. Find the old well (86-well.js): while you carry the keystone, it is always somewhere in the
 *      forest. Click it with the keystone and 100 innocent defeats, and the well answers: the forest
 *      goes dark and purple, 108 spirits pour out, and Spiritomb rises to fight you.
 *   4. Beat it and it joins you, bound to the keystone. Lose, or run, and it sinks back into the
 *      well to wait for you.
 * Clicking the well without the keystone, or with too few defeats, tells you something's missing.
 * Setting: spiritomb.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const KEY = 'psx.spiritomb.v1';
  const DEX = 442;
  const NEED = 100;
  const ICON = 'assets/items/odd_keystone.png';
  let save = load();
  const st = { stone: null, placeT: 60, scene: null, battle: null, dark: 0, wisps: [], text: null, tugT: 30, nearT: 0, minionT: 0, minions: [], hooked: false };

  function load() { try { return Object.assign({ keystone: 0, innocents: 0, won: 0, tries: 0 }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { keystone: 0, innocents: 0, won: 0, tries: 0 }; } }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
    try { const sv = AI.R.DB.save; if (sv) { sv.psxSpiritomb = Object.assign({}, save); } } catch (e) { /* ignore */ }
  }
  function sync() {
    try {
      const o = AI.R.DB.save && AI.R.DB.save.psxSpiritomb;
      if (o) { save.keystone = save.keystone || o.keystone || 0; save.innocents = Math.max(save.innocents, o.innocents || 0); save.won = save.won || o.won || 0; }
    } catch (e) { /* ignore */ }
  }
  function T(en, es) { return (AI.lang && AI.lang() === 'es' && es) || en; }
  function on() { return AI.enabled && AI.cfg.spiritomb !== false; }
  function forest() { return !!(AI.Forest && AI.Forest.on()); }
  function player() { return AI.R.Game.player; }
  function owned() { try { return !!AI.R.DB.owns(DEX); } catch (e) { return false; } }
  function won() { return !!save.won || owned(); }
  function hasKey() { return !!save.keystone; }
  function ready() { return hasKey() && save.innocents >= NEED; }
  function busy() { return !!st.scene; }
  // the well is always in the forest while you carry the keystone (86-well.js)
  function wantsWell() { return on() && hasKey() && !won(); }
  const img = new Image();
  img.onload = () => { img.ok = true; };
  img.src = ICON;

  // ---------------------------------------------------------------- innocent Pokémon
  function onDeath(ev) {
    if (!on() || !forest() || ev.killerKey !== 'P' || !ev.victimPeaceful) return;
    const e = ev.victim;
    if (!e || e.boss || e.legend || e.psxStory || e.psxSpiritomb) return;
    if (AI.Mansion && AI.Mansion.inside) return;
    save.innocents++;
    persist();
    if (!hasKey() || won()) return;
    const n = save.innocents;
    if (n === 25 || n === 50 || n === 75) say(T('The Odd Keystone grows colder in your bag… (' + n + '/' + NEED + ')', 'La Piedra Espíritu se enfría en tu bolsa… (' + n + '/' + NEED + ')'), 4);
    if (n === NEED) {
      say(T('The keystone is cold as ice. Somewhere in this forest, a well is waiting for you.', 'La piedra está helada. En algún lugar del bosque, un pozo te espera.'), 5);
      try { if (AI.Ambience) AI.Ambience.myst('whisper'); } catch (err) { /* ignore */ }
      st.tugT = 20;
    }
  }
  function say(text, life) { st.text = { text, t: 0, life: life || 4 }; }

  // ---------------------------------------------------------------- the Odd Keystone, in a clearing
  function placeStone() {
    const p = player(), R = AI.R, F = AI.Forest;
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * 6.283, d = U.rand(900, 2200);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.85;
      if (R.Camera.sees(x, y, 160)) continue;
      if (F.region(x, y).clear < 0.55 || F.water(x, y).e > -60 || !R.World.isFree(x, y, 14)) continue;
      st.stone = { x, y, t: 0 };
      AI.Bus.emit({ type: 'keystone', what: 'placed', x, y, loud: 0 });
      return true;
    }
    return false;
  }
  function pickUp() {
    const s = st.stone, R = AI.R;
    st.stone = null;
    save.keystone = Date.now();
    persist();
    try { R.FX.burst(s.x, s.y - 6, '#b48cff', 18, 90); R.FX.ring(s.x, s.y - 6, '#7a4ad0', 30); R.Audio.sfx('levelup'); if (AI.Ambience) AI.Ambience.myst('whisper', s.x, s.y); } catch (e) { /* ignore */ }
    try { R.Spawner.say(T('You found the Odd Keystone!', '¡Has encontrado la Piedra Espíritu!'), 3.5, 1); } catch (e) { /* ignore */ }
    say(T('An odd stone with a crack running through it. It feels like something inside is watching you.', 'Una piedra extraña, con una grieta. Parece que algo dentro te observa.'), 5.5);
    if (AI.Exp) AI.Exp.give(3, 'the Odd Keystone', { key: 'keystone' });
    AI.Bus.emit({ type: 'keystone', what: 'found', x: s.x, y: s.y, loud: 0 });
  }

  // ---------------------------------------------------------------- clicking the well
  function install(R) {
    if (st.hooked) return;
    st.hooked = true;
    sync();
    AI.Bus.on('death', (ev) => { try { onDeath(ev); } catch (e) { AI.warn('spiritomb-death', e); } });
    addEventListener('click', (ev) => {
      if (!on() || !R.Game || R.Game.state !== 'playing' || !(ev.target instanceof HTMLCanvasElement)) return;
      const W = AI.Well && AI.Well.st.well, cam = R.Camera;
      if (!W || !cam) return;
      const b = ev.target.getBoundingClientRect();
      const k = (cam._cw || b.width) / Math.max(1, b.width);
      const wx = cam.left() + ((ev.clientX - b.left) * k) / cam.scale, wy = cam.top() + ((ev.clientY - b.top) * k) / cam.scale;
      if (Math.abs(wx - W.x) > 48 || wy < W.y - 90 || wy > W.y + 16) return;
      ev.stopPropagation();
      clickWell(W);
    }, true);
  }
  function clickWell(W) {
    const p = player();
    if (!p || st.scene || st.battle) return false;
    if (Math.hypot(p.x - W.x, p.y - W.y) > 220) { say(T('The well is too far away. Get closer.', 'El pozo está demasiado lejos. Acércate.'), 2.5); return false; }
    if (won()) { say(T('The well is quiet now. Whatever lived in it travels with you.', 'El pozo está en calma. Lo que vivía en él viaja contigo.'), 3.5); return false; }
    if (!hasKey()) { say(T('A hollow is carved into the rim in an odd shape, as if a stone belongs there.', 'Hay un hueco tallado en el brocal, con una forma extraña, como si ahí fuera una piedra.'), 4.5); return false; }
    if (save.innocents < NEED) {
      say(T('You hold the Odd Keystone over the well. Nothing. Something down there wants more… (' + save.innocents + '/' + NEED + ' innocent Pokémon)', 'Sostienes la Piedra Espíritu sobre el pozo. Nada. Algo ahí abajo quiere más… (' + save.innocents + '/' + NEED + ' Pokémon inocentes)'), 5);
      try { if (AI.Ambience) AI.Ambience.myst('drip', W.x, W.y); } catch (e) { /* ignore */ }
      return false;
    }
    startScene(W);
    return true;
  }

  // ---------------------------------------------------------------- the scene
  const LINES = [
    [1.2, null, T('You set the Odd Keystone on the rim of the well…', 'Colocas la Piedra Espíritu en el brocal del pozo…')],
    [3.2, 'Sad', T('…one hundred…', '…cien…')],
    [5.6, 'Angry', T('One hundred who never raised a claw against you. We heard every one of them fall.', 'Cien que nunca alzaron una garra contra ti. Oímos caer a cada uno.')],
    [8.6, 'Determined', T('Now we are one hundred and eight. Now you will hear us.', 'Ahora somos ciento ocho. Ahora nos oirás.')],
  ];
  function startScene(W) {
    const R = AI.R;
    st.scene = { t: 0, x: W.x, y: W.y, i: 0 };
    save.tries++;
    persist();
    st.wisps.length = 0;
    try { R.Audio.sfx('boss'); if (AI.Ambience) { AI.Ambience.myst('drone', W.x, W.y); AI.Ambience.myst('whisper', W.x, W.y); } } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'spiritomb', what: 'scene', x: W.x, y: W.y, loud: 0 });
  }
  function tickScene(dt) {
    const sc = st.scene, R = AI.R;
    sc.t += dt;
    st.dark = Math.min(0.72, st.dark + dt * 0.25);
    // the spirits pour out of the well
    if (st.wisps.length < 108 && sc.t > 1.8) for (let k = 0; k < 3 && st.wisps.length < 108; k++) st.wisps.push({ a: Math.random() * 6.283, r: 4, h: 0, sp: U.rand(0.8, 1.8), rise: U.rand(20, 70), t: 0 });
    while (sc.i < LINES.length && sc.t >= LINES[sc.i][0]) {
      const [, emo, text] = LINES[sc.i++];
      if (!emo) say(text, 3);
      else if (AI.Talk) AI.Talk.npc({ dex: DEX, name: 'Spiritomb', key: 'spiritomb', col: '#7a4ad0', voice: 140 }, text, { emo, life: 3 });
      try { if (AI.Ambience) AI.Ambience.myst('whisper', sc.x, sc.y); R.Camera.kick(0.15); } catch (e) { /* ignore */ }
    }
    if (sc.t > 11.5) startBattle(sc);
  }
  function startBattle(sc) {
    const R = AI.R;
    const d = R.DEX_BY[DEX] || { name: 'Spiritomb' };
    let hp = 1600, dmg = 16;
    try { hp = Math.round(Math.max(4 * R.Stats.hpRef(), 1400)); } catch (e) { /* ignore */ }
    try { dmg = Math.round(R.Enemies.bossDmg(R.Game.st.time) * 0.8); } catch (e) { /* ignore */ }
    const def = { dex: DEX, name: d.name, hp, spd: 70, dmg, xp: 400, behavior: 'shooter', shotDmg: Math.round(dmg * 0.45), shotCd: 1.4, range: 290 };
    let e = null;
    try {
      e = new R.Enemy(def, sc.x, sc.y + 40, { hp: 1, spd: 1, dmg: 1 }, true);
      e.psxSpiritomb = true; e.psxStory = true; e.psxPlaced = true; e.psxForceTemp = 'aggressive';
      R.EnemyMgr.add(e);
      R.FX.burst(sc.x, sc.y - 10, '#7a4ad0', 40, 220); R.FX.ring(sc.x, sc.y, '#b48cff', 90); R.Camera.kick(0.5);
    } catch (err) { AI.warn('spiritomb-battle', err); }
    st.scene = null;
    st.battle = e ? { e, t: 0, x: sc.x, y: sc.y } : null;
    st.minionT = 8;
    AI.Bus.emit({ type: 'spiritomb', what: 'battle', x: sc.x, y: sc.y, loud: 0 });
  }
  // it calls a few of its spirits out of the well to fight beside it
  function minion(b) {
    const R = AI.R;
    st.minions = st.minions.filter((m) => !m.dead && R.EnemyMgr.all().includes(m));
    if (st.minions.length >= 4 || !AI.Areas) return;
    const dd = R.DEX_BY[92];
    if (!dd || !R.SPRITE_META[92]) return;
    try {
      const T0 = R.Enemies.TIERS, ti = Math.min(T0.length - 1, 1);
      const m = new R.Enemy(AI.Areas.defFor(dd, T0[ti], ti), b.e.x + U.rand(-40, 40), b.e.y + U.rand(-20, 20), R.Maps.sc({ hp: 1, spd: 1, dmg: 1 }));
      m.psxSpiritomb = true; m.psxPlaced = true; m.psxForceTemp = 'aggressive';
      R.EnemyMgr.add(m);
      st.minions.push(m);
      R.FX.burst(m.x, m.y - 10, '#9a7bd0', 14, 120);
    } catch (e) { /* ignore */ }
  }
  function tickBattle(dt) {
    const b = st.battle, R = AI.R, p = player();
    b.t += dt;
    st.dark = U.clamp(st.dark + (0.45 - st.dark) * dt, 0, 0.72);
    if (b.e.dead) return victory(b);
    st.minionT -= dt;
    if (st.minionT <= 0) { st.minionT = U.rand(9, 13); minion(b); }
    const gone = !R.EnemyMgr.all().includes(b.e);
    const far = p && Math.hypot(b.e.x - p.x, b.e.y - p.y) > 1500;
    if (gone || far || b.t > 300 || !p || p.dead) {
      // it sinks back into the well, and waits
      try { if (!gone) { b.e.dead = true; b.e.hp = 0; R.FX.burst(b.e.x, b.e.y - 20, '#7a4ad0', 30, 200); } } catch (e) { /* ignore */ }
      say(T('Spiritomb sinks back into the well. The keystone is still cold: it is waiting for you.', 'Spiritomb se hunde de nuevo en el pozo. La piedra sigue fría: te está esperando.'), 4.5);
      end();
    }
  }
  function victory(b) {
    const R = AI.R;
    save.won = Date.now();
    persist();
    try { R.DB.grant(DEX, 'creepy-well'); if (R.DB.commit) R.DB.commit(); } catch (e) { AI.warn('spiritomb-grant', e); }
    if (AI.Talk) AI.Talk.npc({ dex: DEX, name: 'Spiritomb', key: 'spiritomb', col: '#7a4ad0', voice: 140 }, T('…bound to the stone… then we go where the stone goes.', '…atados a la piedra… iremos a donde vaya la piedra.'), { emo: 'Sad', life: 5 });
    try { R.Spawner.say(T('Spiritomb joined you! Choose it as your partner from the menu.', 'Spiritomb se ha unido a ti. Elígelo como compañero desde el menú.'), 4.5, 1); R.Audio.sfx('legend'); } catch (e) { /* ignore */ }
    if (AI.Exp) AI.Exp.give(10, 'Spiritomb', { key: 'spiritomb' });
    for (const m of st.minions) if (!m.dead) { m.dead = true; m.hp = 0; try { R.FX.burst(m.x, m.y - 10, '#9a7bd0', 10, 100); } catch (e) { /* ignore */ } }
    AI.Bus.emit({ type: 'spiritomb', what: 'won', dex: DEX, x: b.e.x, y: b.e.y, loud: 0 });
    end();
  }
  function end() { st.battle = null; st.minions.length = 0; }

  // ---------------------------------------------------------------- per frame
  function tick(dt) {
    if (st.text) { st.text.t += dt; if (st.text.t > st.text.life) st.text = null; }
    if (!st.scene && !st.battle) st.dark = Math.max(0, st.dark - dt * 0.3);
    for (let i = st.wisps.length - 1; i >= 0; i--) {
      const w = st.wisps[i];
      w.t += dt; w.a += dt * w.sp; w.r = Math.min(150, w.r + dt * 40); w.h = Math.min(w.rise, w.h + dt * 30);
      if (!st.scene && w.t > 4) st.wisps.splice(i, 1);
    }
    if (!on() || !AI.R || AI.R.Game.state !== 'playing') return;
    if (st.scene) return tickScene(dt);
    if (st.battle) return tickBattle(dt);
    if (!forest()) return;
    const p = player();
    if (!p || p.dead || (AI.Mansion && AI.Mansion.inside)) return;
    // the keystone, waiting in a clearing (until it's yours)
    if (!hasKey() && !st.stone) { st.placeT -= dt; if (st.placeT <= 0) { st.placeT = 5; placeStone(); } }
    const s = st.stone;
    if (s) {
      s.t += dt;
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d < 26) pickUp();
      else if (d < 320) { st.nearT -= dt; if (st.nearT <= 0) { st.nearT = U.rand(5, 9); try { if (AI.Ambience) AI.Ambience.myst('shimmer', s.x, s.y); } catch (e) { /* ignore */ } } }
    }
    // with the keystone and its hundred: it tugs toward the well
    const W = AI.Well && AI.Well.st.well;
    if (ready() && !won() && W) {
      const d = Math.hypot(p.x - W.x, p.y - W.y);
      if (d < 500) AI.Well.st.eyes = Math.max(AI.Well.st.eyes, 1.2);
      st.tugT -= dt;
      if (st.tugT <= 0 && d > 500) {
        st.tugT = 60;
        const dir = compass(W.x - p.x, W.y - p.y);
        say(T('The keystone tugs faintly toward the ' + dir[0] + '.', 'La piedra tira débilmente hacia el ' + dir[1] + '.'), 3.5);
      }
    }
  }
  function compass(dx, dy) {
    const a = Math.atan2(dy, dx), i = (Math.round(a / (Math.PI / 4)) + 8) % 8;
    return [['east', 'este'], ['south-east', 'sureste'], ['south', 'sur'], ['south-west', 'suroeste'], ['west', 'oeste'], ['north-west', 'noroeste'], ['north', 'norte'], ['north-east', 'noreste']][i];
  }

  // ---------------------------------------------------------------- drawing
  function drawAir(ctx) {
    if (!on()) return;
    const s = st.stone;
    if (s && img.ok) {
      const bob = Math.sin(s.t * 2) * 1.5, glow = 0.35 + 0.25 * Math.sin(s.t * 3);
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,14,0.35)';
      ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, 9, 3, 0, 0, 6.283); ctx.fill();
      const g = ctx.createRadialGradient(s.x, s.y - 8, 1, s.x, s.y - 8, 22);
      g.addColorStop(0, 'rgba(180,140,255,' + glow.toFixed(3) + ')'); g.addColorStop(1, 'rgba(120,70,220,0)');
      ctx.fillStyle = g; ctx.fillRect(s.x - 22, s.y - 30, 44, 44);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, Math.round(s.x - 9), Math.round(s.y - 18 + bob), 18, 18);
      ctx.restore();
    }
    const sc = st.scene || st.battle;
    if (st.wisps.length && sc) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const w of st.wisps) {
        const x = sc.x + Math.cos(w.a) * w.r, y = sc.y - 14 + Math.sin(w.a) * w.r * 0.45 - w.h;
        const a = Math.min(1, w.t) * (st.scene ? 0.7 : Math.max(0, 1 - (w.t - 2) / 2) * 0.7);
        ctx.fillStyle = 'rgba(150,100,255,' + (a * 0.35).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x, y, 6, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(220,200,255,' + a.toFixed(3) + ')';
        ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
      }
      ctx.restore();
    }
    // the keystone on the rim, glowing, during the scene
    if (st.scene && img.ok) {
      const x = st.scene.x, y = st.scene.y - 30 - Math.min(20, st.scene.t * 3);
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(st.scene.t * 8);
      ctx.drawImage(img, Math.round(x - 9), Math.round(y - 9), 18, 18);
      ctx.restore();
    }
  }
  function drawScreen(ctx, w, h) {
    if (!on()) return;
    if (st.dark > 0.01) {
      ctx.save();
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(30,8,50,' + (st.dark * 0.45).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(12,2,24,' + st.dark.toFixed(3) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    // the keystone and its count, while you carry it
    if (hasKey() && !won() && forest() && img.ok) {
      ctx.save();
      const x = 14, y = Math.round(h * 0.42);
      ctx.fillStyle = 'rgba(12,8,20,0.6)'; ctx.fillRect(x - 4, y - 4, 92, 26);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(img, x, y, 18, 18);
      ctx.font = '600 12px Pixelify, "Segoe UI", sans-serif'; ctx.textBaseline = 'middle';
      ctx.fillStyle = save.innocents >= NEED ? '#d0b0ff' : '#b8b0c8';
      ctx.fillText(Math.min(save.innocents, NEED) + ' / ' + NEED, x + 24, y + 9);
      ctx.restore();
    }
    const t = st.text;
    if (t) {
      const a = Math.min(1, t.t / 0.4, (t.life - t.t) / 0.6);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = 'italic 600 13px Pixelify, "Segoe UI", sans-serif';
      const tw = Math.min(w - 60, ctx.measureText(t.text).width + 36);
      const x = (w - tw) / 2, y = Math.round(h * 0.26);
      ctx.fillStyle = 'rgba(14,8,24,0.82)'; ctx.fillRect(x, y, tw, 30);
      ctx.fillStyle = '#d6c8ee'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.text, w / 2, y + 15, tw - 20);
      ctx.restore();
    }
  }

  function reset() {
    if (st.battle) end();
    Object.assign(st, { stone: null, placeT: 60, scene: null, battle: null, dark: 0, text: null, tugT: 30, nearT: 0, minionT: 0 });
    st.wisps.length = 0; st.minions.length = 0;
  }
  // (the dev console and tests)
  function give() { save.keystone = save.keystone || Date.now(); persist(); }
  function setInnocents(n) { save.innocents = Math.max(0, n | 0); persist(); }
  function forget() { save = { keystone: 0, innocents: 0, won: 0, tries: 0 }; persist(); }

  AI.define('Spiritomb', { st, NEED, DEX, install, tick, reset, drawAir, drawScreen, busy, ready, hasKey, won, wantsWell, clickWell, startScene, placeStone, pickUp, give, setInnocents, forget, onDeath, get save() { return save; } });
})();
