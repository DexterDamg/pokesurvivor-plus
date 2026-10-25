/* PokéSurvivor+ — Living World AI · the Shady Forest's events and the stories it tells
 * Now and then, somewhere ahead of the party and out of sight, something happens (never in a
 * fight, never in the house, never the same thing twice in a row, most of them once a run):
 *   a lost Pokémon   crying under a tree; calm it and its parent comes for it (and thanks you), or walk on
 *   strange tracks   a trail of large prints that leads somewhere, then stops at something buried
 *   lights           at night, lights drifting between the trees: Volbeat, or giggling candle flames
 *   a sudden silence the birds and insects stop; something passes, or doesn't
 *   a fallen tree    it comes down across the way; go around, or a Fire-type burns it clear
 *   distant voices   a call for help from nowhere, from the direction of the old house
 *   a campsite       other explorers were here; their fire still smoulders; they left supplies, and a note
 * And the forest keeps its history where you can find it: stone markers, symbols cut into bark,
 * broken signposts, overgrown statues, letters. Stand by one for a moment to read it. The fragments
 * tie the forest to the mansion; some only make sense once you've been inside.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const M = () => AI.Mind;

  const st = { t: 70, loreT: 45, done: {}, last: null, cur: null, props: [], read: new Set(), card: null, silentUntil: 0, lights: [] };
  function on() { return AI.enabled && AI.cfg.forestEvents !== false && AI.Forest && AI.Forest.on() && !(AI.Mansion && AI.Mansion.inside) && !(AI.Totem && AI.Totem.active()); }
  function lead() { return AI.R.Game.player; }
  function lang() { return AI.lang ? AI.lang() : 'en'; }

  // somewhere ahead of you (where you're heading), out of sight, on open dry ground
  function ahead(dmin, dmax, visible) {
    const R = AI.R, p = lead();
    const fa = Math.hypot(p._vx || 0, p._vy || 0) > 20 ? Math.atan2(p._vy, p._vx) : Math.random() * 6.28;
    for (let k = 0; k < 24; k++) {
      const a = fa + U.rand(-0.9, 0.9), d = U.rand(dmin, dmax);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.85;
      if (!R.World.isFree(x, y, 26)) continue;
      if (AI.Forest.water(x, y).e > -20) continue;
      if (!visible && R.Camera.sees(x, y, 40)) continue;
      if (AI.Mysteries && AI.Mysteries.sanctuary && AI.Mysteries.sanctuary(x, y)) continue;
      return [x, y];
    }
    return null;
  }
  function near(x, y, r) { const p = lead(); return Math.hypot(p.x - x, p.y - y) < r; }
  function done(id, u, toast) {
    st.done[id] = (st.done[id] || 0) + 1;
    AI.Bus.emit({ type: 'forest-event', what: 'done', id: id + ':' + st.done[id], u, toast, x: lead().x, y: lead().y, loud: 0 });
  }

  // ---------------------------------------------------------------- the events
  const EVENTS = {
    // a frightened little one under a tree; its parent is out looking for it
    lost: {
      max: 1, ok: () => true,
      start() {
        const R = AI.R;
        const pair = U.pick([[161, 162], [263, 264], [396, 397], [401, 402]]);
        const at = ahead(450, 700);
        if (!at || !R.DEX_BY[pair[0]] || !R.SPRITE_META[pair[0]]) return null;
        const kid = spawnMon(pair[0], at[0], at[1], 'timid');
        if (!kid) return null;
        kid.psx.lock = { update(e, s, dt, it) { it.stay = true; return true; } };
        const ev = { id: 'lost', kid, parentDex: pair[1], x: at[0], y: at[1], t: 0, calm: 0, heard: false, phase: 'cry' };
        return ev;
      },
      tick(ev, dt) {
        const kid = ev.kid, p = lead();
        if (!kid || kid.dead) return false;
        ev.t += dt;
        const d = Math.hypot(p.x - kid.x, p.y - kid.y);
        if (ev.phase === 'cry') {
          if (Math.random() < dt * 0.4) { M().say(kid.psx, 'tear', 1.6, 2); if (AI.Ambience) AI.Ambience.myst('call', kid.x, kid.y); }
          if (!ev.heard && d < 900) { ev.heard = true; if (AI.Lore) AI.Lore.say(kid, lang() === 'es' ? '¿Mamá…?' : 'Mama…? Where are you…?', 4); }
          if (d < 70) ev.calm += dt; else ev.calm = Math.max(0, ev.calm - dt * 0.5);
          if (ev.calm > 1.5) {
            ev.phase = 'calm'; ev.t = 0;
            M().say(kid.psx, 'happy', 2, 2);
            if (AI.Lore) AI.Lore.say(kid, lang() === 'es' ? '…¿Me vas a ayudar?' : '…You\'ll stay with me?', 3.5);
            // its parent comes running
            const R = AI.R;
            const a = Math.atan2(kid.y - p.y, kid.x - p.x);
            const px = kid.x + Math.cos(a) * 300, py = kid.y + Math.sin(a) * 240;
            ev.parent = spawnMon(ev.parentDex, px, py, 'friendly');
            if (ev.parent) ev.parent.psx.lock = { update(e, s, dt2, it) { const dd = Math.hypot(kid.x - e.x, kid.y - e.y); if (dd > 30) { it.x = kid.x + 20; it.y = kid.y; it.speed = 1.1; } else it.stay = true; return true; } };
            void R;
          }
          // you walked on
          if (ev.heard && d > 1100) { ev.phase = 'gone'; return false; }
          return ev.t < 240;
        }
        if (ev.phase === 'calm') {
          ev.t += 0;
          const par = ev.parent;
          if (!par || par.dead) { finish(ev); return false; }
          if (Math.hypot(par.x - kid.x, par.y - kid.y) < 36 && !ev.reunited) {
            ev.reunited = true; ev.t = 0;
            M().say(kid.psx, 'love', 2.5, 3); M().say(par.psx, 'love', 2.5, 3);
            if (AI.Lore) AI.Lore.say(par, lang() === 'es' ? '¡Gracias! Toma, para tu viaje.' : 'Thank you! Please, take this for your journey.', 4);
            gift(par.x, par.y, 'family');
            done('lost', 4, '💛 You helped a lost Pokémon find its family');
          }
          if (ev.reunited && ev.t > 5) { finish(ev); return false; }
          return ev.t < 60;
        }
        return false;
      },
      end(ev) { finish(ev); },
    },
    // big prints that go somewhere, then stop at something buried
    tracks: {
      max: 1, ok: () => true,
      start() {
        const p = lead();
        const s0 = ahead(260, 380, true);
        if (!s0) return null;
        const a = Math.atan2(s0[1] - p.y, s0[0] - p.x) + U.rand(-0.6, 0.6);
        const n = 22;
        let x = s0[0], y = s0[1], ang = a;
        for (let i = 0; i < n; i++) {
          ang += U.rand(-0.18, 0.18);
          x += Math.cos(ang) * 30; y += Math.sin(ang) * 26;
          if (AI.Decor) AI.Decor.printAt(x + Math.cos(ang + 1.57) * (i % 2 ? 5 : -5), y + Math.sin(ang + 1.57) * (i % 2 ? 5 : -5), ang, 143, 1.6, 0.9);
        }
        const mark = AI.Decor.addDyn({ k: 'litter', n: 'x_marker', x, y, flat: false, evt: 'tracks' });
        return { id: 'tracks', x, y, mark, t: 0, dig: 0 };
      },
      tick(ev, dt) {
        ev.t += dt;
        if (near(ev.x, ev.y, 34)) ev.dig += dt; else ev.dig = Math.max(0, ev.dig - dt);
        if (ev.dig > 1.2) {
          try { AI.R.FX.burst(ev.x, ev.y - 4, '#8a6a3a', 16, 120); } catch (e) { /* ignore */ }
          gift(ev.x, ev.y, 'buried');
          done('tracks', 3, '🔍 The tracks led to something buried');
          return false;
        }
        return ev.t < 300;
      },
      end(ev) { if (ev.mark && AI.Decor.removeDyn) AI.Decor.removeDyn(ev.mark); },
    },
    // lights between the trees at night
    lights: {
      max: 2, ok: () => AI.Sky && AI.Sky.darkness() > 0.65 && AI.Sky.rain < 0.3,
      start() {
        const at = ahead(320, 520);
        if (!at) return null;
        const ghost = Math.random() < 0.5;
        const ls = [];
        for (let i = 0; i < 5; i++) ls.push({ x: at[0] + U.rand(-90, 90), y: at[1] + U.rand(-60, 60), z: U.rand(14, 40), ph: Math.random() * 6.28, a: 0 });
        st.lights = ls;
        return { id: 'lights', x: at[0], y: at[1], ghost, ls, t: 0 };
      },
      tick(ev, dt) {
        ev.t += dt;
        const p = lead();
        let alive = 0;
        for (const l of ev.ls) {
          const d = Math.hypot(p.x - l.x, p.y - l.y);
          l.ph += dt;
          if (d < 200) { const a = Math.atan2(l.y - p.y, l.x - p.x); l.x += Math.cos(a) * 50 * dt; l.y += Math.sin(a) * 40 * dt; }
          else { l.x += Math.sin(l.ph * 0.7) * 10 * dt; l.y += Math.cos(l.ph * 0.5) * 8 * dt; }
          if (d < 130) l.gone = true;
          l.a = l.gone ? Math.max(0, l.a - dt * 1.5) : Math.min(1, l.a + dt * 0.6);
          if (l.a > 0.02) alive++;
        }
        if (ev.ls.some((l) => l.gone) && !ev.revealed) {
          ev.revealed = true;
          if (ev.ghost) { if (AI.Ambience) AI.Ambience.mansion('laugh', ev.x, ev.y); }
          else if (AI.Ambience) AI.Ambience.myst('chime', ev.x, ev.y);
        }
        if (!alive && ev.revealed) { done('lights', 2, ev.ghost ? '🕯️ The lights giggled… and went out' : '✨ Only Volbeat, lighting the way'); st.lights = []; return false; }
        return ev.t < 120;
      },
      end() { st.lights = []; },
    },
    // the forest goes silent
    silence: {
      max: 2, ok: () => true,
      start() {
        st.silentUntil = AI.time + 18;
        return { id: 'silence', t: 0, x: lead().x, y: lead().y };
      },
      tick(ev, dt) {
        ev.t += dt;
        if (ev.t > 10 && !ev.passed) {
          ev.passed = true;
          // something passes: a shape between the trees, or only the wind
          if (Math.random() < 0.6 && AI.Ambience) { AI.Ambience.mansion('step', lead().x + 220, lead().y - 80); AI.Ambience.myst('leaves', lead().x + 240, lead().y - 60); }
        }
        if (ev.t > 18) { done('silence', 1); return false; }
        return true;
      },
      end() { st.silentUntil = 0; },
    },
    // a tree comes down across the way
    fallen: {
      max: 1, ok: () => true,
      start() {
        const p = lead();
        const at = ahead(220, 320, true);
        if (!at) return null;
        if (AI.Ambience) { AI.Ambience.creak && AI.Ambience.creak(at[0], at[1]); setTimeout(() => { try { AI.Ambience.branch && AI.Ambience.branch(at[0], at[1]); AI.R.Camera.kick(0.5); } catch (e) { /* ignore */ } }, 900); }
        const log = AI.Decor.addDyn({ k: 'log', n: 'log_fallen', x: at[0], y: at[1], s: 1.8, r: 40, felled: true, evt: 'fallen' });
        void p;
        return { id: 'fallen', x: at[0], y: at[1], log, t: 0, burn: 0 };
      },
      tick(ev, dt) {
        ev.t += dt;
        // a Fire-type player standing by it can burn it clear
        const fire = [...AI.players].find((q) => !q.dead && ((AI.R.DEX_BY[q.dex] || {}).types || []).includes('fire') && Math.hypot(q.x - ev.x, q.y - ev.y) < 80);
        if (fire) {
          ev.burn += dt;
          if (Math.random() < dt * 8) try { AI.R.FX.burst(ev.x + U.rand(-30, 30), ev.y - 8, '#ff9a3a', 3, 60); } catch (e) { /* ignore */ }
        }
        if (ev.burn > 3) {
          try { AI.R.FX.burst(ev.x, ev.y - 10, '#ffb04a', 30, 160); AI.Decor.addDyn({ k: 'scorch', n: 'x_scorch', x: ev.x, y: ev.y, flat: true }); } catch (e) { /* ignore */ }
          AI.Decor.removeDyn(ev.log);
          done('fallen', 2, '🔥 Burned the fallen tree clear');
          return false;
        }
        return ev.t < 400 && near(ev.x, ev.y, 1600);
      },
    },
    // a voice calling for help, from the direction of the house
    voices: {
      max: 1, ok: () => true,
      start() {
        const p = lead();
        let a = Math.random() * 6.28;
        try { const g = AI.Journey && AI.Journey.st.geo; if (g) a = Math.atan2(g.D[1] - p.y, g.D[0] - p.x); } catch (e) { /* ignore */ }
        const x = p.x + Math.cos(a) * 900, y = p.y + Math.sin(a) * 760;
        return { id: 'voices', x, y, a, t: 0, from: [p.x, p.y], n: 0 };
      },
      tick(ev, dt) {
        ev.t += dt;
        const p = lead();
        if (ev.t > ev.n * 6 && ev.n < 4) {
          ev.n++;
          if (AI.Ambience) AI.Ambience.mansion('whisper', ev.x, ev.y);
          st.card = { text: ['…help…', '…is someone… there…?', '…we\'re still… here…', '…don\'t… leave…'][ev.n - 1], t: 0, life: 3.5, faint: true };
        }
        // walk toward it and it stops, as if it was never there
        const went = (p.x - ev.from[0]) * Math.cos(ev.a) + (p.y - ev.from[1]) * Math.sin(ev.a);
        if (went > 320) { done('voices', 1); return false; }
        return ev.t < 40;
      },
    },
    // someone camped here
    campsite: {
      max: 1, ok: () => true,
      start() {
        const at = ahead(420, 620);
        if (!at) return null;
        const D = AI.Decor;
        const items = [
          D.addDyn({ k: 'scorch', n: 'x_scorch', x: at[0], y: at[1], flat: true, light: { r: 70, c: [255, 120, 50], kind: 'glow' }, lit: true, evt: 'camp' }),
          D.addDyn({ k: 'log', n: 'log_dark', x: at[0] - 4, y: at[1] + 34, s: 0.8, evt: 'camp' }),
          D.addDyn({ k: 'stone', n: 'barrel', x: at[0] + 42, y: at[1] - 6, r: 8, evt: 'camp' }),
          D.addDyn({ k: 'litter', n: 'haunt_plaque_a', x: at[0] - 36, y: at[1] + 6, flat: true, evt: 'camp' }),
        ];
        return { id: 'campsite', x: at[0], y: at[1], items, t: 0, look: 0 };
      },
      tick(ev, dt) {
        ev.t += dt;
        if (near(ev.x, ev.y, 70)) ev.look += dt; else ev.look = Math.max(0, ev.look - dt * 0.5);
        if (ev.look > 1.5) {
          gift(ev.x, ev.y, 'camp');
          readLore('camp');
          done('campsite', 3, '⛺ Supplies left at an old campsite');
          return false;
        }
        return ev.t < 400 && near(ev.x, ev.y, 1800);
      },
    },
  };
  // spawn a Pokémon for an event (it keeps to the event: never recycled or counted against the wild)
  function spawnMon(dex, x, y, temp) {
    const R = AI.R;
    const d = R.DEX_BY[dex];
    if (!d || !R.SPRITE_META[dex] || !AI.Areas || !AI.Areas.defFor) return null;
    const def = AI.Areas.defFor(d, R.Enemies.TIERS[0], 0);
    def.behavior = 'chase'; def.dmg = 1;
    const e = new R.Enemy(def, x, y, { hp: 1, spd: 1, dmg: 1 });
    e.psxEvent = true; e.psxPlaced = true; e.psxForceTemp = temp; e.psxNature = temp === 'timid' ? 'timid' : 'gentle';
    R.EnemyMgr.add(e);
    if (!R.EnemyMgr.all().includes(e)) return null;
    AI.Brain.init(e);
    return e;
  }
  function finish(ev) {
    for (const m of [ev.kid, ev.parent]) if (m && !m.dead) { m.psx.lock = { t: 0, update(e, s, dt, it) { this.t += dt; it.x = e.x + 200; it.y = e.y + 80; it.speed = 0.7; if (this.t > 3) { e.dead = true; e.hp = 0; } return true; } }; }
  }
  // what they leave you: oil for the lantern, a berry, coins
  function gift(x, y, kind) {
    const R = AI.R;
    try {
      if (AI.Light && (kind === 'camp' || Math.random() < 0.5)) { AI.Light.addOil(kind === 'camp' ? 150 : 90); R.FX.dmgText(x, y - 40, '+ lantern oil', '#ffd27a', true); }
      if (kind !== 'camp' || Math.random() < 0.7) R.Pickups.drop('berry', x + 8, y, 'oran');
      const n = kind === 'buried' ? 6 : 3;
      for (let i = 0; i < n; i++) R.Pickups.drop('coin', x + U.rand(-14, 14), y + U.rand(-10, 10), 2);
    } catch (e) { AI.warn('event-gift', e); }
  }

  // ---------------------------------------------------------------- the forest's history
  /* Markers, carvings, signposts, statues and letters. Each fragment is found once a run; together
   * they hint at the family who lived in the house, the child, the clock, and the tall shadow. */
  const LORE = [
    { id: 'stone1', kind: 'marker', en: 'A stone marker, older than the trees around it. Carved into it: a house, and three small figures holding hands. The fourth figure has been scratched out.' },
    { id: 'stone2', kind: 'marker', en: 'Worn letters on a mossy stone: "…AND THE CLOCK SHALL KEEP THEIR HOURS…" The rest is gone.' },
    { id: 'carve1', kind: 'carve', en: 'Cut into the bark: a closed eye. Someone went over it many times, very hard, as if to keep it shut.' },
    { id: 'carve2', kind: 'carve', en: 'Initials carved in a heart, and a date nobody alive would remember. Below, in a child\'s hand: "she is still waiting for us."' },
    { id: 'carve3', kind: 'carve', en: 'Tally marks in the bark, dozens of them. They stop halfway down, mid-line.' },
    { id: 'sign1', kind: 'sign', en: 'A broken signpost. One arm reads "VILLAGE". The other has been snapped off and turned to point at the trees. It reads "HOME".' },
    { id: 'sign2', kind: 'sign', en: '"PRIVATE GROUNDS — THE FAMILY ASKS THAT GUESTS DO NOT LINGER AFTER DARK." The paint is bubbled, like it was once wet for a long time.' },
    { id: 'statue1', kind: 'statue', en: 'An overgrown statue of a Gengar, grinning. Someone has left fresh berries at its feet.' },
    { id: 'statue2', kind: 'statue', en: 'A statue of a tall lady with her hands folded. Moss covers her face except the eyes, as if it won\'t grow there.' },
    { id: 'letter1', kind: 'letter', en: '"My dearest — the children love the new house. The mirror in the hall is the only thing I cannot warm to. It shows the room a moment too late." The rest is water-stained.' },
    { id: 'letter2', kind: 'letter', en: '"Day 4. We heard music at night. A music box, R. says. There is no music box. I checked the whole house twice."' },
    { id: 'letter3', kind: 'letter', en: '"If you find this, don\'t look at the tall one. Don\'t look at the tall one. Don\'t look at the"' },
    { id: 'camp', kind: 'letter', en: '"Day 3. Bree swears she saw purple lights in the windows. We go in at first light. If we\'re not back, the oil is yours. — R."', only: true },
  ];
  const LORE_ART = { marker: { k: 'stone', n: 'x_runestone', r: 8 }, carve: null, sign: { k: 'sign', n: 'sign', r: 6, vines: true }, statue: { k: 'stone', n: 'g_statue', r: 12, s: 0.8 }, letter: { k: 'litter', n: 'haunt_plaque_b', flat: true } };
  function placeLore() {
    const left = LORE.filter((l) => !l.only && !st.read.has(l.id) && !st.props.some((q) => q.lore === l));
    if (!left.length) return;
    const l = U.pick(left);
    let x, y, tree = null;
    if (l.kind === 'carve') {
      const p = lead();
      const trees = (AI.Env.treesIn(p.x, p.y, 700) || []).filter((t) => !AI.R.Camera.sees(t.x, t.y, 40) && Math.hypot(t.x - p.x, t.y - p.y) > 300);
      if (!trees.length) return;
      tree = U.pick(trees); x = tree.x; y = tree.y + 6;
    } else {
      const at = ahead(400, 700);
      if (!at) return;
      [x, y] = at;
    }
    const art = LORE_ART[l.kind];
    const it = art ? AI.Decor.addDyn(Object.assign({ x, y, evt: 'lore' }, art)) : null;
    st.props.push({ lore: l, x, y, it, tree, dwell: 0, t: 0 });
  }
  function tickLore(dt) {
    const p = lead();
    for (let i = st.props.length - 1; i >= 0; i--) {
      const q = st.props[i];
      q.t += dt;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < 46) q.dwell += dt; else q.dwell = Math.max(0, q.dwell - dt);
      if (q.dwell > 1) { readLore(q.lore.id); st.props.splice(i, 1); continue; }
      // forgotten far behind: it stays where it is, but stops being tracked
      if (d > 2600) { if (q.it) AI.Decor.removeDyn(q.it); st.props.splice(i, 1); }
    }
  }
  function readLore(id) {
    const l = LORE.find((q) => q.id === id);
    if (!l || st.read.has(id)) return;
    st.read.add(id);
    st.card = { text: l[lang()] || l.en, t: 0, life: Math.max(5, l.en.length * 0.055) };
    AI.Bus.emit({ type: 'lore', what: 'read', id, x: lead().x, y: lead().y, loud: 0 });
  }

  // ---------------------------------------------------------------- scheduling
  function busy() {
    const p = lead();
    if (!p || p.dead || AI.R.Game.state !== 'playing') return true;
    if (AI.Story && AI.Story.busy()) return true;
    for (const e of AI.R.EnemyMgr.queryCircle(p.x, p.y, 420)) if (!e.dead && (!e.psx || e.psx.stance === 'hostile')) return true;
    return false;
  }
  function tick(dt) {
    if (!on()) return;
    if (st.card) { st.card.t += dt; if (st.card.t > st.card.life) st.card = null; }
    tickLore(dt);
    if (st.cur) {
      let keep = false;
      try { keep = EVENTS[st.cur.id].tick(st.cur, dt); } catch (e) { AI.warn('event:' + st.cur.id, e); keep = false; }
      if (!keep) { const E = EVENTS[st.cur.id]; if (E.end) try { E.end(st.cur); } catch (e) { /* ignore */ } st.last = st.cur.id; st.cur = null; st.t = U.rand(80, 150); }
      return;
    }
    st.loreT -= dt;
    if (st.loreT <= 0) { st.loreT = U.rand(55, 110); if (!busy()) placeLore(); }
    st.t -= dt;
    if (st.t > 0 || busy()) return;
    start();
  }
  function start(id) {
    const ids = id ? [id] : Object.keys(EVENTS).filter((k) => k !== st.last && (st.done[k] || 0) < EVENTS[k].max && EVENTS[k].ok());
    if (!ids.length) { st.t = 60; return null; }
    const pick = id || U.pick(ids);
    let ev = null;
    try { ev = EVENTS[pick].start(); } catch (e) { AI.warn('event-start:' + pick, e); }
    if (!ev) { st.t = 20; return null; }
    st.cur = ev;
    AI.Bus.emit({ type: 'forest-event', what: 'start', id: pick, x: ev.x, y: ev.y, loud: 0 });
    return ev;
  }

  // ---------------------------------------------------------------- drawing
  function drawAir(ctx) {
    if (!on()) return;
    // lights between the trees
    for (const l of st.lights) {
      if (l.a <= 0.02) continue;
      const ghost = st.cur && st.cur.id === 'lights' && st.cur.ghost;
      const c = ghost ? '190,150,255' : '230,255,140';
      const y = l.y - l.z + Math.sin(l.ph * 2) * 4;
      const g = ctx.createRadialGradient(l.x, y, 0, l.x, y, 10);
      g.addColorStop(0, 'rgba(' + c + ',' + (0.9 * l.a).toFixed(2) + ')'); g.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g; ctx.fillRect(l.x - 10, y - 10, 20, 20);
    }
    // symbols cut into bark
    for (const q of st.props) {
      if (q.lore.kind !== 'carve') continue;
      const x = q.x, y = q.y - 16;
      ctx.save();
      ctx.strokeStyle = 'rgba(40,24,12,0.85)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y, 4, 2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.stroke();
      ctx.restore();
    }
  }
  function lights(out) {
    if (!on()) return;
    const ghost = st.cur && st.cur.id === 'lights' && st.cur.ghost;
    for (const l of st.lights) if (l.a > 0.05) out.push({ x: l.x, y: l.y - l.z, r: 46, c: ghost ? [180, 140, 255] : [210, 255, 130], i: 0.55 * l.a });
  }
  // what you read, on a small card above the bar
  function drawScreen(ctx, w, h) {
    const c = st.card;
    if (!c || !AI.enabled) return;
    const a = Math.min(1, c.t / 0.3, (c.life - c.t) / 0.5);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a * (c.faint ? 0.75 : 1);
    ctx.font = (c.faint ? 'italic ' : 'italic ') + '600 14px Pixelify, "Segoe UI", sans-serif';
    const maxW = Math.min(560, w - 60);
    const words = c.text.split(' ');
    const lines = [];
    let line = '';
    for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = wd; } else line = t; }
    if (line) lines.push(line);
    const bw = Math.min(maxW + 36, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 36), bh = lines.length * 19 + 20;
    const x = (w - bw) / 2, y = c.faint ? h * 0.22 : h - 112 - bh - 30;
    if (!c.faint) {
      ctx.fillStyle = 'rgba(232,218,184,0.94)'; ctx.strokeStyle = '#6a5434'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + bw - 6, y); ctx.quadraticCurveTo(x + bw, y, x + bw, y + 6); ctx.lineTo(x + bw, y + bh - 6); ctx.quadraticCurveTo(x + bw, y + bh, x + bw - 6, y + bh); ctx.lineTo(x + 6, y + bh); ctx.quadraticCurveTo(x, y + bh, x, y + bh - 6); ctx.lineTo(x, y + 6); ctx.quadraticCurveTo(x, y, x + 6, y); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = c.faint ? '#d8cff0' : '#3a2c18';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, x + 18, y + 10 + i * 19));
    ctx.restore();
  }
  function silent() { return AI.time < st.silentUntil; }
  function reset() {
    if (st.cur && EVENTS[st.cur.id].end) try { EVENTS[st.cur.id].end(st.cur); } catch (e) { /* ignore */ }
    st.t = 70; st.loreT = 45; st.done = {}; st.last = null; st.cur = null; st.props.length = 0; st.read.clear(); st.card = null; st.silentUntil = 0; st.lights = [];
  }

  AI.define('Events', { st, EVENTS, LORE, tick, start, reset, drawAir, drawScreen, lights, silent, readLore, placeLore });
})();
