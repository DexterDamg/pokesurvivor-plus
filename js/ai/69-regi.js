/* PokéSurvivor+ — Living World AI · the Sealed Chamber, the Regis and Regigigas
 * The legendary golems are earned through your team (67-team.js), as in Ruby, Sapphire and Emerald.
 *   1. The Sealed Chamber: a small rocky islet in the Tropical Ocean with an ancient altar ringed by
 *      six standing stones, each carved with one Braille letter. The altar reads (in Braille):
 *      "FIRST RELICANTH · LAST WAILORD". With Relicanth leading your team and Wailord in its last
 *      slot, the stones awaken: the altar shows the Braille letters and asks you to spell the name
 *      of the three giants. Step on the stones that spell R-E-G-I, in order (two of the six are
 *      decoys; a wrong stone and the sequence starts over). Then the chamber shakes, and far away,
 *      doors of rock and steel open. That unlocks the Regis, for good.
 *   2. Registeel's cave lies somewhere in the Shady Forest, Regirock's in the Crystal Caves (Regice
 *      is still to come). Once the puzzle is solved, every run there has its cave, out of sight:
 *      walk up to its sealed door and the golem wakes and comes out to fight. Beat it and it joins
 *      you; if it already has, it pays you in coins and EXP. It's repeatable: once each run.
 *   3. Regigigas: with Regirock, Regice and Registeel all on your team (any slots), its temple
 *      stirs in the Crystal Caves, and the ancient giant wakes to test you. (Regice isn't in the
 *      game yet, so for now this can only be tried from the dev console.)
 * Settings: regi.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const KEY = 'psx.regi.v1';
  const RELICANTH = 369, WAILORD = 321, ROCK = 377, ICE = 378, STEEL = 379, GIGAS = 486;
  const WORD = ['R', 'E', 'G', 'I'];
  const DECOYS = ['A', 'L'];
  // Braille cells (dots 1–6: 1 2 3 down the left, 4 5 6 down the right)
  const BRAILLE = { A: [1], E: [1, 5], G: [1, 2, 4, 5], I: [2, 4], L: [1, 2, 3], R: [1, 2, 3, 5] };
  const CAVES = { [STEEL]: { biome: 'forest', name: 'Registeel', col: '#8f98a8', dark: '#4a5060', glow: '#b8c8ff', light: [190, 205, 255] }, [ROCK]: { biome: 1, name: 'Regirock', col: '#a0684a', dark: '#5a3a2a', glow: '#ffb070', light: [255, 180, 120] }, [GIGAS]: { biome: 1, name: 'Regigigas', col: '#d8d0b8', dark: '#6a6250', glow: '#ffe8a0', light: [255, 235, 170], temple: true } };
  let save = load();
  const st = { stones: [], altar: null, seq: [], placedSeed: null, msg: null, hintT: 0, caves: [], caveTry: 0, scene: null, battle: null, beatenRun: {}, dark: 0, hooked: false };

  function load() { try { return Object.assign({ puzzle: 0, won: {} }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { puzzle: 0, won: {} }; } }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
    try { const sv = AI.R.DB.save; if (sv) { sv.psxRegi = JSON.parse(JSON.stringify(save)); if (AI.R.DB.commit) AI.R.DB.commit(); } } catch (e) { /* ignore */ }
  }
  function sync() { try { const o = AI.R.DB.save && AI.R.DB.save.psxRegi; if (o) { save.puzzle = save.puzzle || o.puzzle || 0; save.won = Object.assign({}, o.won, save.won); } } catch (e) { /* ignore */ } }
  function T(en, es) { return (AI.lang && AI.lang() === 'es' && es) || en; }
  function on() { return AI.enabled && AI.cfg.regi !== false; }
  function R() { return AI.R; }
  function player() { return R().Game.player; }
  function owned(dex) { try { return !!R().DB.owns(dex); } catch (e) { return false; } }
  function say(text, life) { st.msg = { text, t: 0, life: life || 4 }; }
  function solved() { return !!save.puzzle; }

  // ---------------------------------------------------------------- your team
  function team() {
    const Tm = AI.Team;
    if (!Tm) return [];
    if (Tm.run && Tm.run.members) return Tm.run.members.map((m) => m.dex);
    return Tm.chosen();
  }
  // Relicanth leading, Wailord last
  function setupOk() { const t = team(); return t.length >= 2 && t[0] === RELICANTH && t[t.length - 1] === WAILORD; }
  function gigasOk() { const t = team(); return t.includes(ROCK) && t.includes(ICE) && t.includes(STEEL); }

  // ---------------------------------------------------------------- the Sealed Chamber (Tropical Ocean)
  function chamber() { const O = AI.Ocean; return O && O.on() ? O.islandById('sealed') : null; }
  function placeChamber() {
    const isl = chamber(), D = AI.Decor;
    if (!isl || !D) return;
    const seed = AI.Ocean.plan().seed;
    if (st.placedSeed === seed && st.altar) return;
    st.placedSeed = seed;
    st.altar = D.addFixed({ k: 'regi', part: 'altar', x: isl.x, y: isl.y, s: 1, r: 34, solidR: 30 });
    // six stones in a ring, the letters in an order of this world's own
    const letters = WORD.concat(DECOYS);
    for (let i = letters.length - 1; i > 0; i--) { const j = (U.hash(seed, i, 6101) * (i + 1)) | 0; [letters[i], letters[j]] = [letters[j], letters[i]]; }
    st.stones = letters.map((ch, i) => {
      const a = (i / letters.length) * 6.283 + 0.4;
      return D.addFixed({ k: 'regi', part: 'stone', ch, x: isl.x + Math.cos(a) * 150, y: isl.y + Math.sin(a) * 108 + 10, s: 1, r: 24, lit: 0 });
    });
    st.seq.length = 0;
  }
  function tickChamber(dt) {
    const p = player(), A = st.altar;
    if (!A || !p) return;
    const dA = Math.hypot(p.x - A.x, p.y - A.y);
    const awake = setupOk();
    for (const s of st.stones) s.lit = Math.max(s.lit - dt * 0.8, awake ? 0.35 : 0);
    st.hintT -= dt;
    if (dA < 240 && st.hintT <= 0) {
      st.hintT = 9;
      if (solved()) say(T('The chamber is still. Far away, the doors of the giants stand open.', 'La cámara está en calma. Lejos, las puertas de los gigantes están abiertas.'), 4);
      else if (!awake) say(T('Braille is carved into the altar: "FIRST RELICANTH · LAST WAILORD". Nothing stirs.', 'Hay braille tallado en el altar: «PRIMERO RELICANTH · ÚLTIMO WAILORD». Nada se mueve.'), 5.5);
      else say(T('The stones wake! The altar asks: "Spell the name of the three giants." Step on the stones in order.', '¡Las piedras despiertan! El altar dice: «Escribe el nombre de los tres gigantes». Pisa las piedras en orden.'), 6);
    }
    if (solved() || !awake || p.psxBoat) return; // (on foot only)
    // stepping on a stone
    for (const s of st.stones) {
      const d = Math.hypot(p.x - s.x, p.y - s.y);
      if (d > 26) { s.pressed = false; continue; }
      if (s.pressed) continue;
      s.pressed = true;
      press(s);
    }
  }
  function press(s) {
    const want = WORD[st.seq.length];
    try { R().Audio.sfx('click'); } catch (e) { /* ignore */ }
    if (s.ch !== want) {
      st.seq.length = 0;
      for (const o of st.stones) o.lit = 0;
      try { R().Camera.kick(0.25); if (AI.Ambience) AI.Ambience.myst('drone', s.x, s.y); } catch (e) { /* ignore */ }
      say(T('The stones go dark. The sequence starts over.', 'Las piedras se apagan. Hay que empezar de nuevo.'), 3);
      AI.Bus.emit({ type: 'regi', what: 'wrong', ch: s.ch, x: s.x, y: s.y, loud: 0 });
      return;
    }
    st.seq.push(s.ch);
    s.lit = 2;
    try { R().FX.burst(s.x, s.y - 10, '#9fd8ff', 10, 80); if (AI.Ambience) AI.Ambience.myst('chime', s.x, s.y); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'regi', what: 'stone', ch: s.ch, n: st.seq.length, x: s.x, y: s.y, loud: 0 });
    if (st.seq.length === WORD.length) solve();
  }
  function solve() {
    save.puzzle = Date.now();
    persist();
    const A = st.altar;
    try { R().Camera.kick(0.9); R().FX.ring(A.x, A.y, '#9fd8ff', 220); R().FX.burst(A.x, A.y - 20, '#cfe8ff', 40, 200); R().Audio.sfx('legend'); if (AI.Ambience) AI.Ambience.myst('roar', A.x, A.y); } catch (e) { /* ignore */ }
    say(T('The chamber shakes! Far away, doors of rock and steel grind open… The Regis have awoken.', '¡La cámara tiembla! Lejos, se abren puertas de roca y de acero… Los Regi han despertado.'), 6.5);
    try { R().Spawner.say(T('Registeel waits in the Shady Forest; Regirock in the Crystal Caves.', 'Registeel espera en el Bosque Umbrío; Regirock, en la Cueva Cristal.'), 5, 1); } catch (e) { /* ignore */ }
    if (AI.Exp) AI.Exp.give(8, 'the Sealed Chamber', { key: 'sealed' });
    AI.Bus.emit({ type: 'regi', what: 'solved', x: A.x, y: A.y, loud: 0 });
  }

  // ---------------------------------------------------------------- the caves (once each run)
  // which doors this area hides: Registeel's in the Shady Forest; Regirock's in the Crystal Caves, and
  // there too Regigigas's temple, while Regirock, Regice and Registeel are all on your team
  function cavesHere() {
    const R0 = R();
    if (AI.Forest && AI.Forest.on()) return [STEEL];
    if (R0.World && R0.World.biome === 1 && !(AI.Ocean && AI.Ocean.on())) return gigasOk() ? [ROCK, GIGAS] : [ROCK];
    return [];
  }
  function caveOf(dex) { return st.caves.find((c) => c.dex === dex) || null; }
  // (not on the mansion's route, nor on top of another door)
  function nearRoute(x, y) {
    try { const g = AI.Journey && AI.Journey.st.geo; if (g && Math.hypot(x - g.D[0], y - g.D[1]) < 900) return true; } catch (e) { /* ignore */ }
    return Math.hypot(x, y) < 700;
  }
  function placeCave(dex, at) {
    const R0 = R(), p = player(), D = AI.Decor;
    if (!p || !D) return null;
    let x, y;
    if (at) { x = at[0]; y = at[1]; }
    else {
      let ok = false;
      for (let k = 0; k < 50 && !ok; k++) {
        const a = Math.random() * 6.283, d = U.rand(1000, 1700);
        x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d * 0.85;
        if (R0.Camera.sees(x, y, 200)) continue;
        ok = R0.World.isFree(x, y, 40) && R0.World.isFree(x, y - 40, 40) && !(AI.Forest && AI.Forest.on() && (AI.Forest.water(x, y).e > -80 || AI.Forest.pathDist(x, y) < 80)) && !(D.blocked && D.blocked(x, y, 70)) && !nearRoute(x, y);
      }
      if (!ok) return null;
    }
    if (st.caves.some((c) => Math.hypot(c.x - x, c.y - y) < 500) && !at) return null;
    const it = D.addFixed({ k: 'regi', part: 'cave', dex, x, y, s: 1, r: 80, solidR: 62, up: 60 });
    const c = { dex, it, x, y, born: AI.time };
    st.caves.push(c);
    AI.Bus.emit({ type: 'regi', what: 'cave', dex, x, y, loud: 0 });
    return c;
  }
  function tickCave(dt) {
    if (!solved()) return;
    const want = cavesHere().filter((d) => !caveOf(d));
    if (want.length && (R().Game.time || 0) > 45) { st.caveTry -= dt; if (st.caveTry <= 0) { st.caveTry = 4; placeCave(want[0]); } }
    const p = player();
    if (!p || st.scene || st.battle) return;
    for (const c of st.caves) {
      if (st.beatenRun[c.dex] || (c.coolT || 0) > AI.time) continue;
      if (c.dex === GIGAS && !gigasOk()) continue; // (it only wakes for the three)
      if (Math.hypot(p.x - c.x, p.y - c.y) < 115) return startScene(c);
    }
  }

  // ---------------------------------------------------------------- the golem wakes
  const LINES = {
    [STEEL]: [T('The sealed door is carved with Braille… it glows, and splits open with a scream of metal.', 'La puerta sellada lleva braille… brilla, y se abre con un chirrido de metal.'), T('Something hard as steel steps out of the dark: Registeel!', 'Algo duro como el acero sale de la oscuridad: ¡Registeel!')],
    [ROCK]: [T('The sealed door is carved with Braille… it glows, and the rock crumbles away.', 'La puerta sellada lleva braille… brilla, y la roca se desmorona.'), T('Stone grinds on stone. Regirock stands up from the rubble!', 'La piedra cruje. ¡Regirock se alza entre los escombros!')],
    [GIGAS]: [T('Regirock, Regice and Registeel turn toward the temple as one…', 'Regirock, Regice y Registeel se vuelven hacia el templo a la vez…'), T('The ancient giant who pulled the continents moves again: Regigigas!', 'El antiguo gigante que arrastró los continentes vuelve a moverse: ¡Regigigas!')],
  };
  function startScene(c) {
    st.scene = { c, t: 0, i: 0 };
    try { R().Audio.sfx('boss'); if (AI.Ambience) AI.Ambience.myst('drone', c.x, c.y); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'regi', what: 'wake', dex: c.dex, x: c.x, y: c.y, loud: 0 });
  }
  function tickScene(dt) {
    const sc = st.scene, c = sc.c;
    sc.t += dt;
    st.dark = Math.min(0.55, st.dark + dt * 0.3);
    const lines = LINES[c.dex];
    if (sc.i < lines.length && sc.t > 0.6 + sc.i * 2.4) { say(lines[sc.i], 3); sc.i++; try { R().Camera.kick(0.35); } catch (e) { /* ignore */ } }
    if (sc.t > 0.6 + lines.length * 2.4 + 0.4) startBattle(c);
  }
  function startBattle(c) {
    const R0 = R(), d = R0.DEX_BY[c.dex] || { name: CAVES[c.dex].name };
    let hp = 2200, dmg = 18;
    try { hp = Math.round(Math.max((c.dex === GIGAS ? 10 : 6) * R0.Stats.hpRef(), c.dex === GIGAS ? 3600 : 2000)); } catch (e) { /* ignore */ }
    try { dmg = Math.round(R0.Enemies.bossDmg(R0.Game.st.time) * (c.dex === GIGAS ? 1.2 : 1)); } catch (e) { /* ignore */ }
    const def = { dex: c.dex, name: d.name, hp, spd: c.dex === STEEL ? 58 : c.dex === GIGAS ? 50 : 54, dmg, xp: 500, behavior: c.dex === ROCK ? 'chase' : 'shooter', shotDmg: Math.round(dmg * 0.5), shotCd: 1.6, range: 260 };
    let e = null;
    try {
      e = new R0.Enemy(def, c.x, c.y + 70, { hp: 1, spd: 1, dmg: 1 }, true);
      e.psxRegi = c.dex; e.psxStory = true; e.psxPlaced = true; e.psxForceTemp = 'aggressive'; e.legend = true;
      R0.EnemyMgr.add(e);
      R0.FX.burst(c.x, c.y - 10, CAVES[c.dex].glow, 36, 200); R0.Camera.kick(0.6);
    } catch (err) { AI.warn('regi-battle', err); }
    st.scene = null;
    st.battle = e ? { e, c, t: 0 } : null;
  }
  function tickBattle(dt) {
    const b = st.battle, R0 = R(), p = player();
    b.t += dt;
    st.dark = U.clamp(st.dark + (0.3 - st.dark) * dt, 0, 0.55);
    if (b.e.dead) return victory(b);
    const gone = !R0.EnemyMgr.all().includes(b.e);
    if (gone || !p || p.dead || b.t > 300 || Math.hypot(b.e.x - p.x, b.e.y - p.y) > 1600) {
      try { if (!gone) { b.e.dead = true; b.e.hp = 0; } } catch (e) { /* ignore */ }
      say(T(CAVES[b.c.dex].name + ' goes back into the dark. Its door stays open: come back when you\'re ready.', CAVES[b.c.dex].name + ' vuelve a la oscuridad. Su puerta sigue abierta: vuelve cuando estés listo.'), 4);
      b.c.coolT = AI.time + 60;
      st.battle = null;
    }
  }
  function victory(b) {
    const R0 = R(), dex = b.c.dex, name = CAVES[dex].name;
    st.beatenRun[dex] = true;
    save.won[dex] = Date.now();
    persist();
    if (!owned(dex)) {
      try { R0.DB.grant(dex, 'regi'); const sv = R0.DB.save; sv.legends = sv.legends || {}; if (!sv.legends[dex]) sv.legends[dex] = Date.now(); if (R0.DB.commit) R0.DB.commit(); } catch (e) { AI.warn('regi-grant', e); }
      try { R0.Spawner.say(name + T(' joined you! Choose it as your partner, or put it on your team.', ' se ha unido a ti. Elígelo como compañero o ponlo en tu equipo.'), 4.5, 1); R0.Audio.sfx('legend'); } catch (e) { /* ignore */ }
    } else {
      try { for (let i = 0; i < 12; i++) R0.Pickups.drop('coin', b.e.x + U.rand(-30, 30), b.e.y + U.rand(-20, 20), 10); R0.Spawner.say(T(name + ' rumbles, satisfied, and sinks back to sleep.', name + ' retumba, satisfecho, y vuelve a dormir.'), 3.5, 1); } catch (e) { /* ignore */ }
    }
    if (AI.Exp) AI.Exp.give(10, name, { key: 'regi:' + dex + ':' + (R0.Game.st && R0.Game.st.seed || 0) });
    AI.Bus.emit({ type: 'regi', what: 'won', dex, x: b.e.x, y: b.e.y, loud: 0 });
    st.battle = null;
  }

  // ---------------------------------------------------------------- per frame
  function tick(dt) {
    if (st.msg) { st.msg.t += dt; if (st.msg.t > st.msg.life) st.msg = null; }
    if (!st.scene && !st.battle) st.dark = Math.max(0, st.dark - dt * 0.3);
    if (!on() || !R() || !R().Game || R().Game.state !== 'playing') return;
    if (st.scene) return tickScene(dt);
    if (st.battle) return tickBattle(dt);
    const p = player();
    if (!p || p.dead || (AI.Mansion && AI.Mansion.inside)) return;
    if (chamber()) { placeChamber(); tickChamber(dt); }
    tickCave(dt);
  }

  // ---------------------------------------------------------------- drawing
  function braille(ctx, ch, x, y, dot, gap, col) {
    const cells = BRAILLE[ch] || [];
    ctx.fillStyle = col;
    for (let n = 1; n <= 6; n++) {
      const cx = x + (n > 3 ? gap : 0), cy = y + ((n - 1) % 3) * gap;
      if (cells.includes(n)) { ctx.beginPath(); ctx.arc(cx, cy, dot, 0, 6.283); ctx.fill(); }
      else { ctx.globalAlpha *= 0.25; ctx.beginPath(); ctx.arc(cx, cy, dot * 0.6, 0, 6.283); ctx.fill(); ctx.globalAlpha /= 0.25; }
    }
  }
  function drawItem(ctx, it) {
    const x = Math.round(it.x), y = Math.round(it.y);
    ctx.save();
    // (drawn at the scale of the game's 2× sprites)
    const k = it.part === 'cave' ? 2 : 1.8;
    ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y);
    if (it.part === 'altar') {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 30, 10, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#6e6a62'; ctx.fillRect(x - 24, y - 16, 48, 18);
      ctx.fillStyle = '#8a857a'; ctx.fillRect(x - 28, y - 22, 56, 8);
      ctx.fillStyle = '#5a564e'; ctx.fillRect(x - 24, y - 2, 48, 3);
      // the inscription (Braille), and when the stones are awake the key to the six letters
      const awake = setupOk() || solved();
      ctx.globalAlpha = 0.9;
      const letters = awake ? WORD.concat(DECOYS) : ['R', 'E', 'L', 'I'];
      letters.forEach((ch, i) => braille(ctx, ch, x - 22 + i * (awake ? 8 : 11) + (awake && i >= 4 ? 4 : 0), y - 13, 1.1, 2.6, awake ? '#cfe8ff' : '#3a3630'));
      if (awake) { ctx.font = '6px monospace'; ctx.fillStyle = '#cfe8ff'; letters.forEach((ch, i) => ctx.fillText(ch, x - 23 + i * 8 + (i >= 4 ? 4 : 0), y + 0)); }
    } else if (it.part === 'stone') {
      const lit = Math.min(1, it.lit || 0);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 16, 6, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#7c776c'; ctx.beginPath(); ctx.moveTo(x - 11, y + 2); ctx.lineTo(x - 9, y - 28); ctx.lineTo(x + 9, y - 30); ctx.lineTo(x + 11, y + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#625e55'; ctx.fillRect(x + 4, y - 28, 6, 30);
      if (lit > 0.02) { const g = ctx.createRadialGradient(x, y - 16, 2, x, y - 16, 24); g.addColorStop(0, 'rgba(160,215,255,' + (lit * 0.55).toFixed(3) + ')'); g.addColorStop(1, 'rgba(160,215,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - 24, y - 40, 48, 48); }
      braille(ctx, it.ch, x - 3, y - 22, 1.5, 4, lit > 0.2 ? '#e8f6ff' : '#3e3a32');
    } else if (it.part === 'cave') drawCave(ctx, it, x, y);
    ctx.restore();
  }
  // a polygon from [dx, dy] points around (x, y)
  function poly(ctx, x, y, pts, col) { ctx.fillStyle = col; ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(x + a, y + b) : ctx.moveTo(x + a, y + b))); ctx.closePath(); ctx.fill(); }
  function shade(hex, k) { const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }
  function drawCave(ctx, it, x, y) {
    const C = CAVES[it.dex] || CAVES[ROCK];
    const open = st.beatenRun[it.dex] || (st.battle && st.battle.c.it === it) || (st.scene && st.scene.c.it === it);
    const p = player(), near = p && !open ? U.clamp(1 - Math.hypot(p.x - x, p.y - y) / 300, 0, 1) : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 66, 16, 0, 0, 6.283); ctx.fill();
    if (C.temple) {
      // Regigigas's temple: three steps, two columns, a pediment, the great door
      for (let i = 0; i < 3; i++) { poly(ctx, x, y, [[-62 + i * 6, -i * 5], [62 - i * 6, -i * 5], [62 - i * 6, -i * 5 - 5], [-62 + i * 6, -i * 5 - 5]], shade(C.col, 0.75 + i * 0.1)); ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x - 62 + i * 6, y - i * 5 - 1, 124 - i * 12, 1); }
      poly(ctx, x, y, [[-44, -15], [44, -15], [44, -66], [-44, -66]], shade(C.col, 0.6));
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = 'rgba(0,0,0,' + (0.06 + U.hash(r, c, 71) * 0.08) + ')'; ctx.fillRect(x - 44 + c * 22 + (r % 2) * 11, y - 64 + r * 10, 20, 9); }
      for (const cx of [-40, 30]) { poly(ctx, x, y, [[cx, -15], [cx + 10, -15], [cx + 10, -66], [cx, -66]], C.col); ctx.fillStyle = shade(C.col, 0.8); ctx.fillRect(x + cx + 7, y - 66, 3, 51); ctx.fillStyle = shade(C.col, 1.12); ctx.fillRect(x + cx - 2, y - 70, 14, 4); ctx.fillRect(x + cx - 2, y - 17, 14, 3); }
      poly(ctx, x, y, [[-52, -70], [52, -70], [0, -92]], shade(C.col, 1.05));
      poly(ctx, x, y, [[-42, -72], [42, -72], [0, -87]], shade(C.col, 0.78));
      // the giant's seven dots, over the door
      for (let i = 0; i < 7; i++) { ctx.fillStyle = near > 0.2 ? C.glow : shade(C.col, 0.5); ctx.beginPath(); ctx.arc(x - 9 + (i % 4) * 6 - (i >= 4 ? -3 : 0), y - 80 + (i >= 4 ? 4 : 0), 1.3, 0, 6.283); ctx.fill(); }
    } else {
      // a craggy mound of big boulders
      const H = (i) => U.hash(i, it.dex, 63);
      const rocks = [[-48, -16, 22, 18], [44, -14, 24, 16], [-30, -40, 30, 26], [30, -42, 30, 26], [0, -58, 32, 24], [-56, -2, 14, 10], [58, -2, 14, 10]];
      rocks.forEach(([cx, cy, rx, ry], i) => {
        const pts = [];
        for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI, w = 0.85 + H(i * 7 + k) * 0.25; pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]); }
        pts.push([cx + rx, cy + ry * 0.6], [cx - rx, cy + ry * 0.6]);
        poly(ctx, x, y, pts, shade(C.col, 0.78 + H(i + 40) * 0.2));
        // the light from the upper left, the shade on the right
        poly(ctx, x, y, [[cx - rx * 0.7, cy - ry * 0.55], [cx - rx * 0.1, cy - ry * 0.85], [cx + rx * 0.1, cy - ry * 0.55], [cx - rx * 0.5, cy - ry * 0.25]], shade(C.col, 1.2));
        poly(ctx, x, y, [[cx + rx * 0.45, cy - ry * 0.5], [cx + rx * 0.92, cy - ry * 0.05], [cx + rx, cy + ry * 0.6], [cx + rx * 0.5, cy + ry * 0.6]], shade(C.col, 0.6));
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + cx - rx * 0.4 + H(i + 9) * rx * 0.5, y + cy - ry * 0.1, 5, 1);
      });
      if (it.dex === STEEL) for (let i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(220,235,255,0.55)'; ctx.fillRect(x - 40 + H(i + 70) * 80, y - 60 + H(i + 80) * 40, 2, 2); } // (glints of metal in the rock)
      else for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(70,90,40,0.6)'; ctx.fillRect(x - 46 + H(i + 90) * 90, y - 50 + H(i + 95) * 34, 6, 2); } // (moss)
      // the doorway's frame: two standing stones and a lintel carved with Braille
      poly(ctx, x, y, [[-26, 0], [-17, 0], [-17, -38], [-26, -40]], shade(C.col, 0.95));
      poly(ctx, x, y, [[17, 0], [26, 0], [26, -40], [17, -38]], shade(C.col, 0.7));
      poly(ctx, x, y, [[-30, -38], [30, -38], [28, -48], [-28, -48]], shade(C.col, 1.08));
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 30, y - 38, 60, 2);
      ['R', 'E', 'G', 'I'].forEach((ch, i) => braille(ctx, ch, x - 14 + i * 8, y - 46, 0.9, 2.2, near > 0.25 ? C.glow : shade(C.col, 0.5)));
    }
    // the door: sealed stone, or the dark beyond it
    const dw = C.temple ? 16 : 17, dh = C.temple ? 48 : 38, dy = C.temple ? -15 : 0;
    ctx.fillStyle = open ? '#050407' : shade(C.dark, 1.1);
    ctx.fillRect(x - dw, y + dy - dh, dw * 2, dh);
    if (open) { const g = ctx.createLinearGradient(0, y + dy - dh, 0, y + dy); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, shade(C.dark, 0.6)); ctx.fillStyle = g; ctx.fillRect(x - dw, y + dy - dh, dw * 2, dh); }
    else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 0.5, y + dy - dh, 1, dh);
      // the seal glows as you come near
      if (near > 0) { ctx.globalAlpha = near * (0.55 + 0.25 * Math.sin(AI.time * 3)); ctx.fillStyle = C.glow; ctx.fillRect(x - dw, y + dy - dh, dw * 2, 1.5); ctx.fillRect(x - 0.5, y + dy - dh, 1, dh); ctx.globalAlpha = 1; }
    }
  }
  function drawScreen(ctx, w, h) {
    if (st.dark > 0.01) { ctx.save(); ctx.fillStyle = 'rgba(10,8,4,' + st.dark.toFixed(3) + ')'; ctx.fillRect(0, 0, w, h); ctx.restore(); }
    const t = st.msg;
    if (!t) return;
    const a = Math.min(1, t.t / 0.4, (t.life - t.t) / 0.6);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = 'italic 600 13px Pixelify, "Segoe UI", sans-serif';
    const tw = Math.min(w - 60, ctx.measureText(t.text).width + 36);
    const x = (w - tw) / 2, y = Math.round(h * 0.2);
    ctx.fillStyle = 'rgba(16,20,28,0.82)'; ctx.fillRect(x, y, tw, 30);
    ctx.fillStyle = '#dfe8f6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.text, w / 2, y + 15, tw - 20);
    ctx.restore();
  }
  function lights(out) {
    const p = player();
    if (!p) return;
    for (const c of st.caves) {
      if (st.beatenRun[c.dex]) continue;
      const near = U.clamp(1 - Math.hypot(p.x - c.x, p.y - c.y) / 300, 0, 1), g = CAVES[c.dex].light;
      if (near > 0) out.push({ x: c.x, y: c.y - 60, r: 140, c: g, i: 0.6 * near });
    }
    for (const s of st.stones) if (s.lit > 0.05) out.push({ x: s.x, y: s.y - 28, r: 70, c: [150, 210, 255], i: Math.min(1, s.lit) * 0.7 });
  }

  function busy() { return !!st.scene; }
  function install() { if (st.hooked) return; st.hooked = true; sync(); }
  function reset() {
    if (st.battle) st.battle = null;
    Object.assign(st, { stones: [], altar: null, seq: [], placedSeed: null, msg: null, hintT: 0, caves: [], caveTry: 0, scene: null, battle: null, beatenRun: {}, dark: 0 });
  }
  // (the dev console and tests)
  function forget() { save = { puzzle: 0, won: {} }; persist(); }
  function unlock() { if (!save.puzzle) { save.puzzle = Date.now(); persist(); } }

  AI.define('Regi', { st, BRAILLE, WORD, DECOYS, RELICANTH, WAILORD, ROCK, ICE, STEEL, GIGAS, install, tick, reset, drawItem, drawScreen, lights, setupOk, gigasOk, solved, solve, press, placeChamber, placeCave, startScene, startBattle, cavesHere, caveOf, busy, forget, unlock, team, get save() { return save; } });
})();
