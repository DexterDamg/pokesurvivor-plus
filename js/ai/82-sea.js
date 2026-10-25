/* PokéSurvivor+ — Living World AI · the sea's stories (the Tropical Ocean)
 *   · Key items that stay with you between runs: the Red Orb and the Blue Orb (Tapu Fini's
 *     challenge, 82-guardians.js) and the Strong Silver Feather (Manaphy). They're listed in the
 *     journal (J) and saved with your game.
 *   · Discovery: each island's name the first time you set foot on it, the wrecks, the lighthouse
 *     in the fog.
 *   · The weather and the sea's Pokémon: in a storm Carvanha and Sharpedo turn vicious, Magikarp
 *     thrash and leap, Wingull and Pelipper make for land, Seel crowd into their grotto, Tentacool
 *     drift in close to shore; Slowpoke doesn't notice anything at all.
 *   · Now and then: an enormous shadow passing under your boat (sometimes a Wailord surfaces far
 *     off to blow; sometimes nothing ever does), a school of Magikarp leaping, a faint blue glow
 *     deep in the trench at night.
 *   · Manaphy and Phione: rarely, in calm, clear water, a few of them play at the surface. They
 *     can't be caught: come close and they dive and are gone. Manaphy sometimes leaves something
 *     behind on the water: the Strong Silver Feather (you can pick it up from a boat).
 *   · Lugia's shrine: sunk off Whirl Islet. At low tide the sea draws back from an old stone path
 *     and the shrine's floor; Water types can swim there at any time. Its inscriptions (and others
 *     on the guardian islands) tell the sea's history: the guardian, the orbs, the one beneath the
 *     trench. Stand at its heart carrying the feather and something enormous passes overhead.
 *     Lugia can't be caught; Kyogre is only ever spoken of.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const O = () => AI.Ocean;
  const KEY = 'psx.ocean';

  // ---------------------------------------------------------------- what stays with you
  function blank() { return { orbs: {}, feather: 0, tapus: {}, deoxys: 0, birthSeen: 0, shrine: 0, lore: {}, isles: {} }; }
  function load() { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return blank(); } }
  let save = load();
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
    try { const sv = AI.R.DB.save; if (sv) { sv.psxOcean = JSON.parse(JSON.stringify(save)); AI.R.DB.commit && AI.R.DB.commit(); } } catch (e) { /* ignore */ }
  }
  // (a save from another device carries its own copy)
  function sync() { try { const sv = AI.R.DB.save; if (sv && sv.psxOcean) { const o = sv.psxOcean; save.orbs = Object.assign({}, o.orbs, save.orbs); save.tapus = Object.assign({}, o.tapus, save.tapus); save.feather = save.feather || o.feather || 0; save.deoxys = save.deoxys || o.deoxys || 0; save.shrine = save.shrine || o.shrine || 0; save.lore = Object.assign({}, o.lore, save.lore); } } catch (e) { /* ignore */ } }
  const ITEMS = {
    red: { name: 'Red Orb', icon: 'assets/items/red_orb.png', desc: 'A crimson orb, warm to the touch. It glows like magma. Tapu Fini kept it on the Summit of Two Orbs.' },
    blue: { name: 'Blue Orb', icon: 'assets/items/blue_orb.png', desc: 'A deep blue orb, cold as the trench. Something far below stirs when it glows.' },
    feather: { name: 'Strong Silver Feather', icon: 'assets/items/silver_wing.png', desc: 'A silver feather that shimmers with the colours of the sea. Manaphy left it on the water.' },
  };
  const icons = {};
  function icon(id) {
    if (icons[id]) return icons[id];
    const im = new Image(); im.onload = () => { im.ok = true; }; im.src = ITEMS[id].icon;
    icons[id] = im;
    return im;
  }
  function has(id) { return id === 'red' || id === 'blue' ? !!save.orbs[id] : !!save[id]; }
  function give(id) {
    if (has(id)) return false;
    if (id === 'red' || id === 'blue') save.orbs[id] = Date.now(); else save[id] = Date.now();
    persist();
    st.toasts.push({ id, t: 0 });
    try { AI.R.Audio.sfx('legend'); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'sea', what: 'item', item: id, x: 0, y: 0, loud: 0 });
    return true;
  }
  function keyItems() { return Object.keys(ITEMS).filter(has).map((id) => Object.assign({ id }, ITEMS[id])); }

  const st = { toasts: [], seen: {}, near: {}, shadow: null, shadowT: 70, karp: [], karpT: 40, glowT: 30, apps: null, appT: 50, feather: null, tablet: null, scene: null, react: 0, cool: {} };
  function on() { return O() && O().on() && AI.cfg.seaStories !== false; }
  function player() { return AI.R.Game.player; }
  function T(en, es) { return (AI.lang && AI.lang() === 'es' && es) || en; }

  // ---------------------------------------------------------------- inscriptions
  /* The sea's history, told in fragments on old stones. Read them in any order. */
  const TABLETS = [
    { id: 'shrine1', at: 'shrine', ang: 0.6, text: 'When the sea and the land made war, the waters rose until no shore remained. Then the guardian came down from the storm, and where its wings passed, the waves lay still.' },
    { id: 'shrine2', at: 'shrine', ang: 2.7, text: 'We built this place where the guardian rested. When the tide is low it rests here still. Do not call it. It comes to those the sea has already chosen.' },
    { id: 'shrine3', at: 'shrine', ang: 4.6, text: 'Its feather falls only to the children of the sea. Whoever carries one, the guardian will know.' },
    { id: 'whirl1', at: 'lugia', ang: 1.2, text: 'Two orbs were made to quiet the two who warred: one red as the burning earth, one blue as the deepest water. They were given to the island spirits to keep apart.' },
    { id: 'whirl2', at: 'lugia', ang: 4.0, text: 'Beneath the trench, one sleeps who raised the seas. Its markings glow like lines of light in the dark. Let it sleep. Let it sleep.' },
    { id: 'fini1', at: 'fini', ang: 2.2, text: 'The spirit of this isle keeps the two orbs in the fog, where the dead keep watch. It will test those who come for them, once and only once.' },
    { id: 'bulu1', at: 'bulu', ang: 3.6, text: 'Four spirits guard these islands: thunder, blossom, forest and mist. They fight for the joy of it. They respect only strength.' },
    { id: 'lele1', at: 'lele', ang: 5.2, text: 'Do not trust the laughter in the petals. The spirit here plays, and its games have no rules.' },
  ];
  function tabletPos(tb) {
    const p = O().plan();
    if (tb.at === 'shrine') return [p.shrine.x + Math.cos(tb.ang) * p.shrine.r * 0.66, p.shrine.y + Math.sin(tb.ang) * p.shrine.r * 0.42];
    const o = p.byId[tb.at];
    const r = tb.at === 'lugia' ? o.R * 0.45 : (o.arenaR || 120) + 70;
    return [o.x + Math.cos(tb.ang) * r, o.y + Math.sin(tb.ang) * r * 0.75];
  }
  function tabletsNear(x, y, r) { return TABLETS.filter((tb) => { const q = tabletPos(tb); return Math.hypot(q[0] - x, q[1] - y) < r; }); }

  // ---------------------------------------------------------------- per frame
  let slow = 0;
  function tick(dt) {
    for (let i = st.toasts.length - 1; i >= 0; i--) { st.toasts[i].t += dt; if (st.toasts[i].t > 5) st.toasts.splice(i, 1); }
    if (!on()) return;
    const R = AI.R, p = player();
    if (!p || p.dead) return;
    const Oc = O();
    slow -= dt;
    // Wingull about the pier when you arrive
    if (!st.gulls && AI.time > 1) {
      st.gulls = true;
      for (const [x, y] of [[-250, -70], [210, -60], [40, 160]]) try { const e = AI.Debug.spawn(278, { x, y, temp: 'friendly', natural: true }); if (e) { e.psxResident = true; e.psxPlaced = true; } } catch (e) { /* ignore */ }
    }
    if (slow <= 0) {
      slow = 0.5;
      sync();
      discover(p);
      weatherReactions();
    }
    // reading: stand by a tablet
    const tb = tabletsNear(p.x, p.y, 46)[0];
    if (tb && (!st.tablet || st.tablet.id !== tb.id)) { st.tablet = { id: tb.id, text: tb.text, t: 0 }; if (!save.lore[tb.id]) { save.lore[tb.id] = Date.now(); persist(); if (AI.Exp) AI.Exp.give(3, 'an inscription', { key: 'sea-lore:' + tb.id }); } }
    if (st.tablet) { st.tablet.t += dt; if (!tb && st.tablet.t > 0.3) st.tablet = null; }
    tickShadow(dt, p);
    tickKarp(dt, p);
    tickApps(dt, p);
    tickShrine(dt, p);
    st.glowT -= dt;
  }
  // first sight of each island, wreck and the lighthouse in the fog
  function discover(p) {
    const Oc = O();
    const z = Oc.zoneAt(p.x, p.y);
    const s = Oc.sample(p.x, p.y);
    if (z.isl && z.isl.name && !st.seen[z.id] && s.cls === 0) {
      st.seen[z.id] = true;
      try { AI.say(z.isl.name, 3.2, 1); } catch (e) { /* ignore */ }
      AI.Bus.emit({ type: 'sea', what: 'island', id: z.id, x: p.x, y: p.y, loud: 0 });
      if (!save.isles[z.id]) { save.isles[z.id] = Date.now(); persist(); if (AI.Exp) AI.Exp.give(6, 'a new island', { key: 'isle:' + z.id }); }
    }
    for (const w of Oc.plan().wrecks) {
      const d = Math.hypot(w.x - p.x, w.y - p.y);
      const id = w.ghost ? 'ghostwreck' : 'wreck';
      if (d < 520 && !st.seen[id]) { st.seen[id] = true; AI.Bus.emit({ type: 'sea', what: id, x: w.x, y: w.y, loud: 0 }); }
    }
    const Sky = AI.Sky;
    if (!st.seen.lighthouse && Sky && Sky.fog > 0.5 && s.cls >= 2 && AI.OceanDraw.beamVis() > 0.4) { st.seen.lighthouse = true; AI.Bus.emit({ type: 'sea', what: 'lighthouse', x: p.x, y: p.y, loud: 0 }); }
  }
  // how the sea's Pokémon take the weather
  function weatherReactions() {
    const Sky = AI.Sky;
    if (!Sky) return;
    const R = AI.R, p = player(), Oc = O();
    const storm = Sky.storm, rough = Math.max(storm, Sky.windNow() - 0.6);
    for (const e of R.EnemyMgr.queryCircle(p.x, p.y, 1100)) {
      if (e.dead || e.boss || e.legend || !e.psx || e.psxStory) continue;
      const d = e.dex;
      if (d === 318 || d === 319) {
        // Carvanha and Sharpedo: blood in the water when the sea turns
        if (storm > 0.45) { if (!e._psxStormMad) { e._psxStormMad = e.psxForceTemp || 'none'; e.psxForceTemp = 'aggressive'; } }
        else if (e._psxStormMad) { e.psxForceTemp = e._psxStormMad === 'none' ? undefined : e._psxStormMad; e._psxStormMad = null; }
      } else if (d === 129 && rough > 0.4 && Math.random() < 0.35) {
        // Magikarp thrash and flop about
        const a = Math.random() * 6.283, nx = e.x + Math.cos(a) * 26, ny = e.y + Math.sin(a) * 18;
        if (Oc.fits('swim', nx, ny)) { e.x = nx; e.y = ny; try { R.FX.burst(e.x, e.y, '#d8f6ff', 6, 70); } catch (er) { /* ignore */ } }
      } else if ((d === 278 || d === 279) && storm > 0.4) {
        // Wingull and Pelipper make for land
        const t = nearestLand(e.x, e.y, 2400);
        if (t) { const dx = t[0] - e.x, dy = t[1] - e.y, l = Math.hypot(dx, dy) || 1; e.x += dx / l * 28; e.y += dy / l * 28; }
      } else if ((d === 86 || d === 87) && storm > 0.4) {
        // Seel shelter in their grotto
        const g = Oc.plan().grotto;
        const dx = g.x - e.x, dy = g.y - e.y, l = Math.hypot(dx, dy);
        if (l > 60 && l < 900) { e.x += dx / l * 22; e.y += dy / l * 22; }
      } else if ((d === 79 || d === 80 || d === 199) && storm > 0.3 && e.psx.mind) {
        // Slowpoke: entirely unbothered (thunder or not)
        e.psx.mind.emo.fear = 0;
      }
    }
  }
  function nearestLand(x, y, r) {
    for (let d = 60; d <= r; d += 60) for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283, qx = x + Math.cos(a) * d, qy = y + Math.sin(a) * d; const s = O().sample(qx, qy); if (s.cls === 0 && !s.solid) return [qx, qy]; }
    return null;
  }

  // ---------------------------------------------------------------- the shadow under the boat
  function tickShadow(dt, p) {
    const sh = st.shadow;
    if (sh) {
      sh.t += dt;
      const k = sh.t / sh.life;
      sh.x = sh.x0 + (sh.x1 - sh.x0) * k; sh.y = sh.y0 + (sh.y1 - sh.y0) * k;
      if (k >= 1) {
        if (sh.wailord) { st.spout = { x: sh.x1 + Math.cos(sh.a) * 200, y: sh.y1 + Math.sin(sh.a) * 140, t: 0 }; try { AI.R.Audio.sfx('splash'); } catch (e) { /* ignore */ } }
        st.shadow = null;
      }
      return;
    }
    if (st.spout) { st.spout.t += dt; if (st.spout.t > 3) st.spout = null; }
    st.shadowT -= dt;
    if (st.shadowT > 0) return;
    st.shadowT = U.rand(60, 120);
    if (!(AI.Boats && AI.Boats.riding(p)) || O().sample(p.x, p.y).cls < 3 || Math.random() > 0.4) return;
    const a = Math.random() * 6.283;
    st.shadow = { a, x0: p.x - Math.cos(a) * 520, y0: p.y - Math.sin(a) * 360, x1: p.x + Math.cos(a) * 520, y1: p.y + Math.sin(a) * 360, t: 0, life: 7, wailord: Math.random() < 0.35 };
    st.shadow.x = st.shadow.x0; st.shadow.y = st.shadow.y0;
    AI.Bus.emit({ type: 'sea', what: 'shadow', x: p.x, y: p.y, loud: 0 });
    try { AI.Ambience && AI.Ambience.rumble && AI.Ambience.rumble(); } catch (e) { /* ignore */ }
  }
  // a school of Magikarp, leaping
  function tickKarp(dt, p) {
    for (let i = st.karp.length - 1; i >= 0; i--) { const f = st.karp[i]; f.t += dt; if (f.t > f.life) st.karp.splice(i, 1); }
    st.karpT -= dt;
    if (st.karpT > 0) return;
    st.karpT = U.rand(35, 80);
    if (Math.random() > 0.5 || (AI.Sky && AI.Sky.darkness() > 0.7)) return;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.283, d = U.rand(220, 420), x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.7;
      const s = O().sample(x, y);
      if (s.cls < 1 || s.cls > 2) continue;
      const n = 4 + ((Math.random() * 4) | 0);
      for (let k = 0; k < n; k++) st.karp.push({ x: x + U.rand(-50, 50), y: y + U.rand(-24, 24), t: -k * 0.35 - Math.random() * 0.3, life: 1.1, dir: Math.random() < 0.5 ? -1 : 1 });
      break;
    }
  }

  // ---------------------------------------------------------------- Manaphy and Phione
  function calmDay() { const S = AI.Sky; return !S || (S.darkness() < 0.35 && S.storm < 0.15 && S.fog < 0.45 && S.rain < 0.3); }
  function tickApps(dt, p) {
    const R = AI.R;
    const ap = st.apps;
    if (st.feather) {
      const f = st.feather;
      f.t += dt;
      const bx = (AI.Boats && AI.Boats.boatOf(p)) ? AI.Boats.boatOf(p) : null;
      const reach = Math.hypot(f.x - p.x, f.y - p.y) < 64 || (bx && Math.hypot(f.x - bx.x, f.y - bx.y) < 80);
      if (reach) { if (give('feather')) { try { AI.say(T('You found the Strong Silver Feather!', '¡Has encontrado la Pluma Plateada!'), 4, 1); } catch (e) { /* ignore */ } } st.feather = null; }
      else if (f.t > 90) st.feather = null; // (it sinks)
    }
    if (ap) {
      ap.t += dt;
      for (const m of ap.mons) {
        m.ph += dt * m.sp;
        m.x = ap.x + Math.cos(m.ph) * m.r; m.y = ap.y + Math.sin(m.ph * 1.3) * m.r * 0.5;
        try { m.a.update(dt); m.a.dir = R.Sprites.dirFromAngle(m.ph + Math.PI / 2); } catch (e) { /* ignore */ }
        if (!ap.diving) m.alpha = Math.min(1, m.alpha + dt * 0.8);
      }
      const d = Math.hypot(ap.x - p.x, ap.y - p.y);
      // too close (or it's time): they dive and are gone
      if (!ap.diving && (d < 210 || ap.t > 30 || !calmDay())) {
        ap.diving = true;
        for (const m of ap.mons) try { R.FX.burst(m.x, m.y, '#bff4ff', 10, 90); } catch (e) { /* ignore */ }
        try { R.Audio.sfx('splash'); } catch (e) { /* ignore */ }
        if (ap.manaphy && !has('feather') && Math.random() < 0.6) { const m = ap.mons[0]; st.feather = { x: m.x, y: m.y, t: 0 }; }
      }
      if (ap.diving) { for (const m of ap.mons) m.alpha -= dt * 1.5; if (ap.mons.every((m) => m.alpha <= 0)) st.apps = null; }
      return;
    }
    st.appT -= dt;
    if (st.appT > 0) return;
    st.appT = U.rand(25, 45);
    if (!calmDay() || Math.random() > (AI.cfg.manaphyChance == null ? 0.12 : AI.cfg.manaphyChance)) return;
    const Oc = O();
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 6.283, dd = U.rand(320, 440), x = p.x + Math.cos(a) * dd, y = p.y + Math.sin(a) * dd * 0.7;
      const s = Oc.sample(x, y);
      if (s.cls < 1 || s.cls > 2 || s.solid) continue;
      const manaphy = Math.random() < 0.35;
      const mons = [];
      const n = manaphy ? 1 + (Math.random() < 0.5 ? 1 : 0) : 2 + ((Math.random() * 2) | 0);
      for (let k = 0; k < n; k++) {
        const dex = manaphy && k === 0 ? 490 : 489;
        try { const an = new R.Sprites.Animator(dex, 1, false); an.loop('Walk'); R.Sprites.preload([dex], 4000); mons.push({ dex, a: an, x, y, ph: k * 2.1, r: 30 + k * 16, sp: 1.2 + Math.random() * 0.5, alpha: 0 }); } catch (e) { /* ignore */ }
      }
      if (!mons.length) return;
      st.apps = { x, y, t: 0, mons, manaphy, diving: false };
      AI.Bus.emit({ type: 'sea', what: manaphy ? 'manaphy' : 'phione', x, y, loud: 0 });
      return;
    }
  }

  // ---------------------------------------------------------------- Lugia's shrine
  function tickShrine(dt, p) {
    const sc = st.scene;
    const Oc = O();
    const sh = Oc.plan().shrine;
    if (sc) {
      sc.t += dt;
      if (p) { p.invuln = Math.max(p.invuln || 0, 0.4); }
      const L = [
        [T('…', '…'), 'Normal'],
        [T('You carry a feather of the sea\'s children. Then the sea has chosen you already.', 'Llevas una pluma de los hijos del mar. Entonces el mar ya te ha elegido.'), 'Normal'],
        [has('red') && has('blue') ? T('And you hold both orbs. Keep them apart. What sleeps beneath the trench must not wake.', 'Y tienes ambos orbes. Mantenlos separados. Lo que duerme bajo la fosa no debe despertar.') : T('Keep it. When the waters rise again, I will know you.', 'Guárdala. Cuando las aguas vuelvan a subir, te reconoceré.'), 'Determined'],
      ];
      if (sc.line < L.length && sc.t > 2.2 + sc.line * 3.4) { const [text, emo] = L[sc.line++]; if (AI.Talk) AI.Talk.legend(249, text, { emo, life: 3.6 }); }
      try { if (sc.a) sc.a.update(dt); } catch (e) { /* ignore */ }
      if (sc.t > 2.2 + L.length * 3.4 + 2) {
        st.scene = null;
        if (!save.shrine) { save.shrine = Date.now(); persist(); if (AI.Exp) AI.Exp.give(12, 'the guardian of the sea', { key: 'lugia-shrine' }); }
      }
      return;
    }
    if (!p || !has('feather') || st.cool.shrine > AI.time) return;
    const d = Math.hypot(p.x - sh.x, p.y - sh.y);
    if (d > 48) return;
    const s = Oc.sample(p.x, p.y);
    if (s.cls >= 2 && Oc.locoOf(p) === 'walk') return;
    st.cool.shrine = AI.time + 240;
    let a = null;
    try { a = new AI.R.Sprites.Animator(249, 1, false); a.loop('Walk'); AI.R.Sprites.preload([249], 4000); } catch (e) { /* ignore */ }
    st.scene = { t: 0, line: 0, a, x0: p.x - 700, y0: p.y - 380 };
    try { AI.R.Camera.kick(0.5); AI.Ambience && AI.Ambience.rumble && AI.Ambience.rumble(); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'sea', what: 'lugia', x: sh.x, y: sh.y, loud: 0 });
  }
  function busy() { return !!st.scene; }

  // ---------------------------------------------------------------- drawing
  // under the water's surface (drawn with the ground): the great shadow, the glow in the trench
  function drawUnder(ctx) {
    if (!on()) return;
    const sh = st.shadow;
    if (sh) {
      const k = sh.t / sh.life, a = Math.sin(k * Math.PI) * 0.42;
      ctx.save();
      ctx.translate(sh.x, sh.y); ctx.rotate(sh.a);
      ctx.fillStyle = 'rgba(2,10,22,' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(0, 0, 230, 70, 0, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-210, 0, 60, 26, 0, 0, 6.283); ctx.fill(); // (a tail? fins?)
      ctx.restore();
    }
    // the trench at night: lines of light, very deep and very faint
    const Sky = AI.Sky, p = player();
    if (Sky && p && Sky.darkness() > 0.6) {
      const s = O().sample(p.x, p.y + 200);
      if (s.trench || s.cls >= 4) {
        const pulse = 0.5 + 0.5 * Math.sin(AI.time * 0.4);
        const strong = has('blue') ? 1.6 : 1;
        const cx = p.x + Math.sin(AI.time * 0.05) * 300, cy = p.y + 260;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 260);
        g.addColorStop(0, 'rgba(40,120,255,' + (0.1 * pulse * strong).toFixed(3) + ')'); g.addColorStop(1, 'rgba(40,120,255,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - 260, cy - 260, 520, 520);
        ctx.strokeStyle = 'rgba(255,90,90,' + (0.08 * pulse * strong).toFixed(3) + ')'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 140, cy - 10); ctx.quadraticCurveTo(cx - 40, cy - 60, cx + 60, cy - 12); ctx.quadraticCurveTo(cx + 130, cy + 20, cx + 170, cy - 30); ctx.stroke();
        ctx.restore();
      }
    }
    // the shrine's floor, under the water or bared by the tide
    const Oc = O();
    const sr = Oc.plan().shrine, cam = AI.R.Camera;
    if (cam.sees(sr.x, sr.y, sr.r + 80)) drawShrine(ctx, sr);
    // inscribed stones
    for (const tb of TABLETS) {
      const q = tabletPos(tb);
      if (!cam.sees(q[0], q[1], 40)) continue;
      drawTablet(ctx, q[0], q[1], !!save.lore[tb.id]);
    }
  }
  function drawShrine(ctx, sr) {
    const sp = O().sample(sr.x, sr.y);
    const sub = sp.cls >= 1 ? (sp.cls >= 2 ? 0.45 : 0.75) : 1;
    ctx.save();
    ctx.globalAlpha = sub;
    ctx.fillStyle = '#bdb6a2';
    ctx.beginPath(); ctx.ellipse(sr.x, sr.y, sr.r, sr.r * 0.62, 0, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#8f8875'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(sr.x, sr.y, sr.r - 10, sr.r * 0.62 - 7, 0, 0, 6.283); ctx.stroke();
    // the emblem: wings over waves
    ctx.strokeStyle = '#7a8fa8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sr.x - 40, sr.y - 4); ctx.quadraticCurveTo(sr.x - 18, sr.y - 30, sr.x, sr.y - 8); ctx.quadraticCurveTo(sr.x + 18, sr.y - 30, sr.x + 40, sr.y - 4); ctx.stroke();
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(sr.x - 34, sr.y + 10 + i * 8); ctx.quadraticCurveTo(sr.x, sr.y + 2 + i * 8, sr.x + 34, sr.y + 10 + i * 8); ctx.stroke(); }
    // its heart glows when the feather comes near
    const p = player();
    const near = p && has('feather') ? U.clamp(1 - Math.hypot(p.x - sr.x, p.y - sr.y) / 400, 0, 1) : 0;
    if (near > 0 || st.scene) {
      ctx.globalCompositeOperation = 'lighter';
      const k = st.scene ? 1 : near * (0.6 + 0.4 * Math.sin(AI.time * 2));
      const g = ctx.createRadialGradient(sr.x, sr.y, 0, sr.x, sr.y, sr.r);
      g.addColorStop(0, 'rgba(190,230,255,' + (0.5 * k).toFixed(3) + ')'); g.addColorStop(1, 'rgba(190,230,255,0)');
      ctx.fillStyle = g; ctx.fillRect(sr.x - sr.r, sr.y - sr.r, sr.r * 2, sr.r * 2);
    }
    ctx.restore();
    // a ring of old pillars, some broken
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.283 + 0.2, x = sr.x + Math.cos(a) * sr.r * 0.92, y = sr.y + Math.sin(a) * sr.r * 0.58;
      if (i % 3 === 2) { ctx.fillStyle = 'rgba(150,145,130,' + sub + ')'; ctx.fillRect(x - 6, y - 8, 12, 8); continue; }
      if (AI.Art) AI.Art.draw(ctx, 'g_pillar', x, y, { scale: 0.7, alpha: sub });
    }
  }
  function drawTablet(ctx, x, y, read) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 12, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#8a8676'; ctx.fillRect(x - 9, y - 22, 18, 22);
    ctx.fillStyle = '#a19c8a'; ctx.fillRect(x - 9, y - 22, 18, 3);
    ctx.fillStyle = read ? 'rgba(60,58,50,0.6)' : 'rgba(120,200,255,' + (0.5 + 0.3 * Math.sin(AI.time * 2)).toFixed(2) + ')';
    for (let i = 0; i < 3; i++) ctx.fillRect(x - 5, y - 17 + i * 5, 10, 1);
  }
  // in the air: leaping Magikarp, a Wailord's spout, Manaphy and Phione, the feather, Lugia overhead
  function drawAir(ctx) {
    if (!on()) return;
    const R = AI.R;
    for (const f of st.karp) {
      if (f.t < 0) continue;
      const k = f.t / f.life;
      const x = f.x + f.dir * (k - 0.5) * 40, y = f.y - Math.sin(k * Math.PI) * 34;
      ctx.save(); ctx.translate(x, y); ctx.rotate(f.dir * (k - 0.5) * 2);
      ctx.fillStyle = '#ff7a3a'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 4, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#ffd66a'; ctx.fillRect(-1, -5, 3, 2); ctx.fillStyle = '#fff'; ctx.fillRect(3, -1, 2, 2);
      ctx.restore();
      if (k < 0.08 || k > 0.92) { try { R.FX.burst(f.x + f.dir * (k - 0.5) * 40, f.y, '#d8f6ff', 2, 40); } catch (e) { /* ignore */ } }
    }
    if (st.spout) {
      const s = st.spout, a = Math.max(0, 1 - s.t / 3);
      ctx.fillStyle = 'rgba(230,248,255,' + (0.7 * a).toFixed(3) + ')';
      for (let i = 0; i < 10; i++) { const h = Math.sin(Math.min(1, s.t) * Math.PI / 2) * 80; ctx.fillRect(Math.round(s.x + (i - 5) * 3 + Math.sin(i + s.t * 4) * 3), Math.round(s.y - h + i * 4), 3, 6); }
    }
    const ap = st.apps;
    if (ap) for (const m of ap.mons) if (m.alpha > 0.01) try { m.a.draw(ctx, m.x, m.y + 6, { alpha: Math.max(0, m.alpha) * 0.92 }); } catch (e) { /* ignore */ }
    if (st.feather) {
      const f = st.feather, b = Math.sin(AI.time * 2) * 2;
      const im = icon('feather');
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(f.x, f.y - 6, 0, f.x, f.y - 6, 26);
      g.addColorStop(0, 'rgba(210,235,255,0.7)'); g.addColorStop(1, 'rgba(210,235,255,0)');
      ctx.fillStyle = g; ctx.fillRect(f.x - 26, f.y - 32, 52, 52);
      ctx.restore();
      if (im.ok) { ctx.imageSmoothingEnabled = false; ctx.drawImage(im, Math.round(f.x - im.width), Math.round(f.y - 10 + b - im.height), im.width * 2, im.height * 2); }
    }
    const sc = st.scene;
    if (sc) {
      // Lugia passes overhead: its shadow sweeps the water, it crosses high above
      const p = player();
      const k = U.clamp((sc.t - 0.8) / 9, 0, 1);
      const x = sc.x0 + k * 1400, y = sc.y0 + k * 420;
      ctx.save();
      ctx.fillStyle = 'rgba(0,10,20,0.3)';
      ctx.beginPath(); ctx.ellipse(x + 60, y + 330, 120, 36, 0.2, 0, 6.283); ctx.fill();
      ctx.restore();
      if (sc.a) try { ctx.save(); ctx.translate(x, y); ctx.scale(2.2, 2.2); sc.a.dir = R.Sprites.dirFromAngle(0.3); sc.a.draw(ctx, 0, 0, { alpha: 0.9 }); ctx.restore(); } catch (e) { ctx.restore(); }
      if (p && Math.random() < 0.3) try { R.FX.burst(p.x + U.rand(-200, 200), p.y + U.rand(-120, 120), '#e8f6ff', 2, 80); } catch (e) { /* ignore */ }
    }
  }
  function drawScreen(ctx, w, h) {
    // a key item found
    for (const t of st.toasts) {
      const a = Math.min(1, t.t * 2, (5 - t.t) * 1.5);
      if (a <= 0) continue;
      const it = ITEMS[t.id], im = icon(t.id);
      ctx.save();
      ctx.globalAlpha = a;
      const bw = 420, bx = (w - bw) / 2, by = h * 0.18;
      ctx.fillStyle = 'rgba(14,20,36,0.88)'; ctx.fillRect(bx, by, bw, 78);
      ctx.strokeStyle = '#d8b04a'; ctx.lineWidth = 2; ctx.strokeRect(bx + 1, by + 1, bw - 2, 76);
      if (im.ok) { ctx.imageSmoothingEnabled = false; const s = Math.floor(52 / Math.max(im.width, im.height)); ctx.drawImage(im, bx + 14 + (52 - im.width * s) / 2, by + 13 + (52 - im.height * s) / 2, im.width * s, im.height * s); }
      ctx.fillStyle = '#ffe9a8'; ctx.font = '700 17px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(T('Key item: ', 'Objeto clave: ') + it.name, bx + 80, by + 30);
      ctx.fillStyle = '#d8e4f0'; ctx.font = '12px system-ui, sans-serif';
      wrapText(ctx, it.desc, bw - 96).slice(0, 3).forEach((l, i) => ctx.fillText(l, bx + 80, by + 48 + i * 14));
      ctx.restore();
    }
    // an inscription being read
    const tb = st.tablet;
    if (tb && on()) {
      const a = Math.min(1, tb.t * 3);
      ctx.save(); ctx.globalAlpha = a;
      const bw = Math.min(560, w - 40), lines = wrapText(ctx, tb.text, bw - 48, 'italic 16px Georgia, serif');
      const bh = 36 + lines.length * 22, bx = (w - bw) / 2, by = h * 0.62 - bh;
      ctx.fillStyle = '#6f6b5c'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#86826f'; ctx.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
      ctx.strokeStyle = '#4a473c'; ctx.lineWidth = 2; ctx.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
      ctx.fillStyle = '#1e1c16'; ctx.font = 'italic 16px Georgia, serif'; ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, w / 2, by + 26 + i * 22));
      ctx.restore();
    }
  }
  function wrapText(ctx, text, maxW, font) {
    if (font) ctx.font = font;
    const out = [];
    let line = '';
    for (const word of text.split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t; }
    if (line) out.push(line);
    return out;
  }
  // the journal lists your key items (82-mysteries.js asks)
  function drawKeyItems(ctx, cx, y) {
    const list = keyItems();
    if (!list.length) return;
    ctx.save();
    ctx.font = 'italic 12px Georgia, serif'; ctx.fillStyle = 'rgba(70,50,25,0.75)'; ctx.textAlign = 'center';
    ctx.fillText(T('Kept between journeys:', 'Guardado entre viajes:'), cx, y - 30);
    const n = list.length, sp = 64;
    list.forEach((it, i) => {
      const im = icon(it.id), x = cx + (i - (n - 1) / 2) * sp;
      if (im.ok) { ctx.imageSmoothingEnabled = false; const s = Math.max(1, Math.floor(28 / Math.max(im.width, im.height))); ctx.drawImage(im, Math.round(x - im.width * s / 2), Math.round(y - 22 - im.height * s / 2), im.width * s, im.height * s); }
      ctx.font = '10px Georgia, serif'; ctx.fillStyle = 'rgba(58,42,20,0.85)'; ctx.fillText(it.name, x, y + 2);
    });
    ctx.restore();
  }
  function lights(out) {
    if (!on()) return;
    const Sky = AI.Sky;
    const sr = O().plan().shrine;
    if (Sky && Sky.darkness() > 0.5) out.push({ x: sr.x, y: sr.y, r: 90, c: [150, 200, 255], i: 0.35 + (has('feather') ? 0.25 : 0) });
    for (const tb of TABLETS) { if (save.lore[tb.id]) continue; const q = tabletPos(tb); out.push({ x: q[0], y: q[1] - 12, r: 26, c: [130, 200, 255], i: 0.4 }); }
    if (st.feather) out.push({ x: st.feather.x, y: st.feather.y - 6, r: 50, c: [210, 235, 255], i: 0.7 });
    // Chinchou and Lanturn light up the night water
    if (Sky && Sky.darkness() > 0.45) for (const e of AI.R.EnemyMgr.queryCircle(player().x, player().y, 700)) if (!e.dead && (e.dex === 170 || e.dex === 171)) out.push({ x: e.x, y: e.y - 10, r: e.dex === 171 ? 80 : 54, c: [255, 240, 140], i: 0.7 });
  }
  function reset() {
    st.toasts.length = 0; st.seen = {}; st.gulls = false; st.shadow = null; st.shadowT = 70; st.karp.length = 0; st.karpT = 40; st.apps = null; st.appT = 50; st.feather = null; st.tablet = null; st.scene = null; st.spout = null; st.cool = {};
  }
  function forget() { save = blank(); persist(); }

  AI.define('Sea', {
    st, ITEMS, TABLETS, has, give, keyItems, tick, busy, drawUnder, drawAir, drawScreen, drawKeyItems, lights, reset, forget, tabletPos, tabletsNear,
    get save() { return save; }, persist,
  });
})();
