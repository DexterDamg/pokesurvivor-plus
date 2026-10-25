/* PokéSurvivor+ — Living World AI · companions that play like players
 * The Pseudo Players (83-party.js) do what a person in the party would do:
 *   loot      they pick up EXP (it goes to the whole party), coins and tickets (the party's purse),
 *             berries (kept: eaten when hurt, or handed to you when you need one) and held items
 *             (kept: a companion holds one and carries the rest). TMs, bottle caps and Mega Stones are
 *             left for you: a companion can't use them.
 *   chests    they open small chests themselves, and big ones by standing at them
 *   crystals  they touch power crystals: a white one starts its event, the others empower that companion
 *   roaming   they wander off on their own to explore and come back, sometimes with something to show
 *   battle    they dodge shots and blasts aimed at anyone in the party, in a fight or not, and sharpen
 *             their aim and timing as they grow
 *   growing   they evolve at the level their species does (Charmander at 16, Charmeleon at 36…)
 * Whatever lies closer to you than to them is yours: they never race you for it.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const C = () => AI.Companions;
  const B = () => AI.Behaviors;
  function on() { return AI.enabled && AI.cfg.pseudoPlayers !== false && AI.cfg.companionLoot !== false; }
  function lead() { return AI.R.Game.player; }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---------------------------------------------------------------- what a held item does for a companion
  const ITEM = {
    lifeorb: { dmg: 1.3 }, choicescarf: { spd: 1.3, cd: 0.9 }, quickclaw: { cd: 0.8 }, assaultvest: { def: 0.8 },
    leftovers: { regen: 0.03 }, shellbell: { steal: 0.04 }, rockyhelmet: { thorns: 0.2 }, scopelens: { crit: 0.2 },
    luckyegg: { xp: 1.3 }, amuletcoin: { coin: 1.5 }, focussash: { sash: true }, sitrusberry: { sitrus: true },
    flameorb: { burn: 0.3 }, toxicorb: { poison: 0.3 }, nevermeltice: { slow: 0.3 }, kingsrock: { stun: 0.2 },
    ejectbutton: { eject: true }, liechiberry: { liechi: true }, apicotberry: { apicot: true }, lansatberry: { dmg: 1.1 },
    powerweight: { spd: 0.7, def: 0.85 }, powerbracer: { spd: 0.7, dmg: 1.2 }, powerbelt: { spd: 0.7, def: 0.8 },
    powerlens: { spd: 0.7, dmg: 1.2 }, powerband: { spd: 0.7, def: 0.85 },
  };
  // the game's power crystals, as they work on a companion (25 s)
  const POWER = [
    { id: 'dmg', name: 'Fury', color: '#ff5f6d', say: 'my attacks hit twice as hard' },
    { id: 'spd', name: 'Bolt', color: '#7f8cff', say: 'I feel so fast' },
    { id: 'mag', name: 'Magnet', color: '#ffd23f', say: 'I can pull in everything from here' },
    { id: 'cd', name: 'Haste', color: '#5fe08a', say: 'my moves are coming back so quick' },
  ];
  function power(c) { const pw = c.pp.power; return pw && pw.until > AI.time ? pw : null; }
  function mods(c) {
    const m = (c.pp.item && ITEM[c.pp.item]) || {};
    const pw = power(c);
    return {
      dmg: (m.dmg || 1) * (pw && pw.id === 'dmg' ? 2 : 1), spd: (m.spd || 1) * (pw && pw.id === 'spd' ? 1.45 : 1),
      cd: (m.cd || 1) * (pw && pw.id === 'cd' ? 0.6 : 1), reach: pw && pw.id === 'mag' ? 3 : 1, item: m,
    };
  }
  function spdK(c) { return c && c.pp ? mods(c).spd : 1; }
  // its hits: held item and power crystal
  function outgoing(c, victim, dmg) {
    if (!c || !c.pp) return dmg;
    const m = mods(c);
    let d = dmg * m.dmg;
    const it = m.item;
    if (it.crit && Math.random() < it.crit) d *= 1.5;
    if (c.pp.liechiT > AI.time) d *= 1.3;
    try {
      if (it.poison && Math.random() < it.poison && victim.applyPoison) victim.applyPoison(4);
      if (it.burn && Math.random() < it.burn) { if (victim.applyBurn) victim.applyBurn(4); else if (victim.applyPoison) victim.applyPoison(4); }
      if (it.slow && Math.random() < it.slow && victim.applySlow) victim.applySlow(0.7, 1.5);
      if (it.stun && Math.random() < it.stun && !victim.boss && victim.psx) victim.psx.stunT = AI.time + 1;
    } catch (e) { /* ignore */ }
    if (it.steal) c.hp = Math.min(c.maxHp, c.hp + Math.min(d * 0.01, c.maxHp * it.steal));
    return d;
  }
  // hits it takes
  function incoming(c, dmg) {
    const it = mods(c).item;
    let d = dmg * (it.def || 1) * (c.pp.apicotT > AI.time ? 0.7 : 1);
    if (it.sash && c.hp - d <= 0 && (c.pp.sashT || -99) < AI.time - 30 && c.hp > 1) { d = c.hp - 1; c.pp.sashT = AI.time; c.invuln = 3; fx(c, 'Focus Sash!', '#ffe28a'); }
    if (it.thorns) {
      const a = AI.curAttacker;
      if (a && !a.dead && !a.pp && a.hurt && (a.pp_thornT || -99) < AI.time - 2.5 && Math.hypot(a.x - c.x, a.y - c.y) < 70) {
        a.pp_thornT = AI.time;
        try { a.hurt(a.maxHp * (a.boss ? 0.05 : it.thorns), '#c9b28a', 0, 0, 0); } catch (e) { /* ignore */ }
      }
    }
    return d;
  }
  function fx(c, text, col) { try { AI.R.FX.dmgText(c.x, c.y - (c.bodyH || 40) - 18, text, col || '#eaf2ff', true); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- picking things up
  const KINDS = new Set(['xp', 'xpBig', 'coin', 'heal', 'berry', 'item', 'ticket', 'ticket10', 'magnet', 'bomb']);
  const SHARED = new Set(['xp', 'xpBig', 'coin', 'ticket', 'ticket10', 'magnet', 'bomb']);
  let collectCb = null;
  function wrapPickups() {
    const P = AI.R && AI.R.Pickups;
    if (!P || P._psxWrapped) return;
    const o = P.update;
    P.update = function (dt, players, cb) { if (typeof cb === 'function') collectCb = cb; return o.apply(this, arguments); };
    P._psxWrapped = true;
  }
  function leaveForYou(pk) { return pk.kind === 'tm' || pk.kind === 'cap' || (pk.kind === 'item' && /^mstone_/.test(String(pk.value || ''))); }
  function wants(c, pk) {
    if (!KINDS.has(pk.kind) || leaveForYou(pk)) return false;
    if (pk.psxClaim && pk.psxClaim !== c && !pk.psxClaim.dead && C().list().includes(pk.psxClaim)) return false;
    const p = lead();
    const dc = dist(c, pk), dp = dist(p, pk);
    if (dp < 110 || dp < dc * 0.8) return false; // it's yours: they never race you for it
    if (pk.kind === 'item' || pk.kind === 'berry') {
      if (pk.psxFor && pk.psxFor !== c.pp.key) return false;
      pk.psxSeen = pk.psxSeen || AI.time;
      if (!pk.psxFor && AI.time - pk.psxSeen < 8) return false; // left lying a while: fair game
    }
    if (pk.kind === 'heal' && c.hp > c.maxHp * 0.9 && bag(c).berries.length >= 4) return false;
    // (not out on water it can't go into: 34-ocean.js)
    if (AI.Ocean && AI.Ocean.on() && !AI.Ocean.canBe(c, pk.x, pk.y)) return false;
    return true;
  }
  function bag(c) { return c.pp.bag || (c.pp.bag = { berries: [], items: [] }); }
  function collect(c, pk) {
    const R = AI.R;
    const arr = R.Pickups.all();
    const i = arr.indexOf(pk);
    if (i < 0) return false;
    arr.splice(i, 1);
    try { if (R.Coop && R.Coop.active && R.Coop.isHost && R.Coop.pickupGone) R.Coop.pickupGone(pk.id); } catch (e) { /* ignore */ }
    const m = mods(c).item;
    st.got++;
    if (SHARED.has(pk.kind) || (pk.kind === 'berry' && pk.value === 'enigma')) {
      // EXP, coins and tickets go to the whole party
      if (pk.kind === 'xp' || pk.kind === 'xpBig') { if (m.xp) pk.value = Math.round(pk.value * m.xp); st.xp += pk.value || 0; }
      if (pk.kind === 'coin' && m.coin) pk.value = Math.round(pk.value * m.coin);
      const p = lead();
      if (collectCb) { try { collectCb(pk, p); } catch (e) { AI.warn('party-collect', e); } }
      else if ((pk.kind === 'xp' || pk.kind === 'xpBig') && p.gainXp) p.gainXp(pk.value || 1);
      if (pk.kind === 'xp' || pk.kind === 'xpBig') fx(c, '+' + Math.round(pk.value || 1) + ' EXP · party', '#9fe8ff');
      AI.Bus.emit({ type: 'party-loot', what: pk.kind, who: c, x: c.x, y: c.y, loud: 0 });
      return true;
    }
    if (pk.kind === 'heal') {
      if (c.hp < c.maxHp * 0.9) { const a = Math.round(c.maxHp * 0.3); c.hp = Math.min(c.maxHp, c.hp + a); fx(c, '+' + a, '#7ee08a'); }
      else bag(c).berries.push('oran');
    } else if (pk.kind === 'berry') {
      bag(c).berries.push(pk.value || 'oran');
      if (bag(c).berries.length > 4) bag(c).berries.shift();
      fx(c, (pk.value || 'oran') + ' berry', '#ff9be0');
    } else if (pk.kind === 'item') {
      const id = String(pk.value);
      const name = itemName(id);
      if (!c.pp.item) { c.pp.item = id; C().say(c, 'gotItem', { item: name }, true); }
      else { bag(c).items.push(id); if (bag(c).items.length > 3) bag(c).items.shift(); C().say(c, 'gotItem', { item: name }); }
      fx(c, name, '#ffe14d');
      C().st.mem.chests = (C().st.mem.chests || 0);
    }
    AI.Bus.emit({ type: 'party-loot', what: pk.kind, value: pk.value, who: c, x: c.x, y: c.y, loud: 0 });
    return true;
  }
  function itemName(id) { const it = AI.R.Items && AI.R.Items.BY && AI.R.Items.BY[id]; return (it && it.name) || id; }
  // berries it carries: eaten when it's hurt, handed to you when you need one
  function useBerries(c) {
    const b = bag(c);
    if (!b.berries.length || (c.pp.berryUseT || -99) > AI.time - 6) return;
    const p = lead();
    if (p && !p.dead && p.hp < p.maxHp * 0.3 && dist(c, p) < 90) {
      b.berries.shift();
      const a = Math.round(p.maxHp * 0.25);
      try { p.heal ? p.heal(a) : (p.hp = Math.min(p.maxHp, p.hp + a)); } catch (e) { p.hp = Math.min(p.maxHp, p.hp + a); }
      try { AI.R.FX.dmgText(p.x, p.y - (p.bodyH || 40) - 10, '+' + a, '#7ee08a', true); } catch (e) { /* ignore */ }
      c.pp.berryUseT = AI.time;
      C().say(c, 'berry', { to: p }, true);
      AI.Bus.emit({ type: 'party-support', what: 'berry', byYou: false, x: p.x, y: p.y, loud: 0 });
      return;
    }
    if (c.hp < c.maxHp * 0.4) {
      b.berries.shift();
      const a = Math.round(c.maxHp * 0.35);
      c.hp = Math.min(c.maxHp, c.hp + a);
      fx(c, '+' + a, '#7ee08a');
      c.pp.berryUseT = AI.time;
    }
  }

  // ---------------------------------------------------------------- chests and power crystals
  function propsNear(x, y, r) {
    const R = AI.R;
    const cam = { _x: x - r, _y: y - r, w: r * 2, h: r * 2, left() { return this._x; }, top() { return this._y; }, sees(px, py, m) { m = m || 0; return px >= this._x - m && px <= this._x + this.w + m && py >= this._y - m && py <= this._y + this.h + m; } };
    let out = [];
    try { out = R.World.visibleProps(cam).slice(); } catch (e) { /* ignore */ }
    try { for (const sp of R.World.specialsNear(x, y, r)) if (!out.includes(sp)) out.push(sp); } catch (e) { /* ignore */ }
    return out;
  }
  function claimed(o, c) { return o.psxClaim && o.psxClaim !== c && !o.psxClaim.dead && C().list().includes(o.psxClaim); }
  // break it open, and mark what falls out as its own
  function openProp(c, pr) {
    const R = AI.R;
    const before = new Set(R.Pickups.all());
    try { R.World.breakProp(pr); } catch (e) { AI.warn('party-open', e); return; }
    for (const pk of R.Pickups.all()) if (!before.has(pk)) { pk.psxFor = c.pp.key; pk.psxSeen = AI.time; }
    st.chests++;
    AI.Bus.emit({ type: 'party-chest', who: c, kind: pr.type, x: pr.x, y: pr.y, loud: 0 });
    C().say(c, 'opened', null);
  }
  function touchAltar(c, alt) {
    const R = AI.R;
    if (alt.used) return;
    alt.used = true;
    try { R.World.useAltarAt(alt.tx, alt.ty); } catch (e) { /* ignore */ }
    if (alt.kind === 4) {
      // a white crystal: its event begins, as if you had touched it
      try { R.FX.ring(alt.x, alt.y - 20, 8, 90, '#eef4ff', 0.6, 5); if (!(R.Coop && R.Coop.active && !R.Coop.isHost)) R.Crystal.trigger(alt.x, alt.y, ''); } catch (e) { AI.warn('party-crystal', e); }
      C().say(c, 'crystalWhite', null, true);
    } else {
      const pw = POWER[alt.kind] || POWER[0];
      c.pp.power = { id: pw.id, name: pw.name, color: pw.color, until: AI.time + 25 };
      try { R.FX.burst(c.x, c.y - (c.bodyH || 40) * 0.5, pw.color, 24, 200); R.FX.ring(alt.x, alt.y - 20, 8, 90, pw.color, 0.6, 5); R.Audio.sfx('legend'); } catch (e) { /* ignore */ }
      C().say(c, 'crystal', { power: pw.name, what: pw.say }, true);
    }
    st.crystals++;
    AI.Bus.emit({ type: 'party-crystal', who: c, kind: alt.kind, x: alt.x, y: alt.y, loud: 0 });
  }

  // ---------------------------------------------------------------- what's worth going for
  function foes(x, y, r) {
    for (const e of AI.R.EnemyMgr.queryCircle(x, y, r)) if (!e.dead && !e.pp && e.psx && (e.psx.stance === 'hostile' || e.psx.inCombat)) return true;
    return false;
  }
  function pickGoal(c) {
    const R = AI.R, p = lead(), s = c.psx;
    if (c.pp.downed || c.pp.leaving || s.inCombat || s.lock) return null;
    const m = mods(c);
    const exploring = s.beh && s.beh.id === 'party-explore';
    const r = (exploring ? 420 : 300) * (m.reach > 1 ? 1.5 : 1);
    let best = null, bv = 0;
    const consider = (g, v) => { if (v > bv) { bv = v; best = g; } };
    // pickups
    for (const pk of R.Pickups.all()) {
      const d = dist(c, pk);
      if (d > r * (pk.kind === 'xp' || pk.kind === 'xpBig' ? 0.8 : 1) || !wants(c, pk)) continue;
      const v = (pk.kind === 'item' ? 1.6 : pk.kind === 'berry' || pk.kind === 'heal' ? 1.1 : pk.kind === 'xpBig' ? 1.2 : 0.8) - d / 900;
      consider({ kind: 'pickup', ref: pk, x: pk.x, y: pk.y }, v);
    }
    for (const pr of propsNear(c.x, c.y, r)) {
      if (claimed(pr, c)) continue;
      const d = dist(c, pr), dp = dist(p, pr);
      if (dp < 90 || dp < d * 0.7) continue; // you're on it
      if (pr.type === 'chest' && !(pr.hp <= 0) && !pr.opened) consider({ kind: 'chest', ref: pr, x: pr.x, y: pr.y }, 1.3 - d / 900);
      else if (pr.type === 'bigchest' && !(pr.hp <= 0)) consider({ kind: 'big', ref: pr, x: pr.x, y: pr.y }, 1.5 - d / 900);
      else if (pr.type === 'altar' && !pr.used && AI.cfg.companionCrystals !== false) consider({ kind: 'altar', ref: pr, x: pr.x, y: pr.y }, 1.4 - d / 900);
    }
    // not with enemies all over it, and never so far it gets left behind (less still while you're on the move)
    if (best && foes(best.x, best.y, 220)) return null;
    const moving = Math.hypot(p._vx || 0, p._vy || 0) > 60;
    if (best && dist(p, best) > (moving ? 300 : exploring ? 650 : 450)) return null;
    return best;
  }

  // ---------------------------------------------------------------- the behaviour: go and get it
  function addBehaviors() {
    B().add({
      id: 'party-loot', tier: 5, party: true, emotion: 'excitement', minCommit: 0.8,
      score(e, s) {
        if (!s.companion || !on()) return 0;
        const g = e.pp.goal;
        if (!g) return 0;
        return 1.4 + ((s.pers.nx && s.pers.nx.independence) || 0.5) * 0.2; // (it finishes the errand before running back to you)
      },
      start(e, s) { s.bs.t = 0; const g = e.pp.goal; if (g && g.ref) g.ref.psxClaim = e; },
      update(e, s, dt, it) {
        const g = e.pp.goal;
        s.bs.t += dt;
        if (!g || s.bs.t > 14) { e.pp.goal = null; return false; }
        const R = AI.R, p = lead();
        // you've moved on: it drops the errand and catches up
        if (Math.hypot(g.x - p.x, g.y - p.y) > 600 || Math.hypot(e.x - p.x, e.y - p.y) > 650) { e.pp.goal = null; return false; }
        const d = Math.hypot(g.x - e.x, g.y - e.y);
        if (g.kind === 'pickup') {
          const pk = g.ref;
          if (!R.Pickups.all().includes(pk)) { e.pp.goal = null; return false; }
          g.x = pk.x; g.y = pk.y;
          const reach = 20 * (mods(e).reach > 1 ? 4 : 1);
          if (d <= reach) { collect(e, pk); e.pp.goal = null; return false; }
          B().go(it, pk.x, pk.y, 1.1);
          return true;
        }
        if (g.kind === 'altar') {
          if (g.ref.used) { e.pp.goal = null; return false; }
          if (d > 26) { B().go(it, g.x, g.y + 4, 1.1); return true; }
          touchAltar(e, g.ref); e.pp.goal = null; return false;
        }
        const pr = g.ref;
        if (pr.hp <= 0 || pr.opened || (pr.type === 'chest' && !propsNear(pr.x, pr.y, 20).includes(pr))) { e.pp.goal = null; return false; }
        if (d > (g.kind === 'big' ? 46 : 30)) { B().go(it, g.x, g.y + 22, 1); return true; }
        B().stay(it); it.face = Math.atan2(g.y - e.y, g.x - e.x); it.anim = 'Attack';
        if (g.kind === 'chest') {
          g.work = (g.work || 0) + dt;
          if (g.work > 0.9) { openProp(e, pr); e.pp.goal = null; return false; }
        } else {
          // a big chest opens as it does with a player standing at it
          pr.open = (pr.open || 0) + dt;
          if (pr.open >= 3.5) { pr.open = 0; openProp(e, pr); e.pp.goal = null; return false; }
        }
        return true;
      },
      end(e) { const g = e.pp.goal; if (g && g.ref && g.ref.psxClaim === e) g.ref.psxClaim = null; },
    });
  }

  // ---------------------------------------------------------------- growing up: evolution and skill
  function stageOf(dex) {
    const R = AI.R;
    let n = 0, cur = dex;
    for (let k = 0; k < 3; k++) {
      let prev = null;
      for (const from in R.EVOS || {}) if ((R.EVOS[from] || []).some(([to]) => to === cur)) { prev = +from; break; }
      if (prev == null) break;
      n++; cur = prev;
    }
    return n;
  }
  function nextEvo(c) {
    const R = AI.R;
    const list = (R.EVOS && R.EVOS[c.dex]) || [];
    for (const [to, lv] of list) if (lv && (c.level || 1) >= lv && R.DEX_BY[to] && R.SPRITE_META[to]) return to;
    return null;
  }
  function skillUpdate(c) {
    c.pp.stage = stageOf(c.dex);
    c.pp.skill = U.clamp(0.22 + c.pp.stage * 0.2 + Math.min(0.2, (c.level || 1) * 0.004), 0, 0.85);
  }
  function evolve(c, to, instant) {
    const R = AI.R, s = c.psx;
    const old = { dex: c.dex, name: c.talkName || c.name };
    const done = () => {
      try { AI.Evolution.apply(c, s, to, 'level', false); } catch (e) { AI.warn('party-evolve', e); return; }
      c.talkName = (R.DEX_BY[to] || {}).name || c.name;
      c.name = c.talkName;
      skillUpdate(c);
      try { C().syncStats && C().syncStats(c); } catch (e) { /* ignore */ }
      if (!instant) {
        try { R.Audio.sfx('evolve'); } catch (e) { /* ignore */ }
        if (AI.Talk) AI.Talk.party({ dex: to, name: c.talkName, key: 'cp:' + c.pp.key, col: c.col, kind: 'party', bodyH: c.bodyH }, evoLine(c, old.name), { emo: 'Joyous' });
        AI.Bus.emit({ type: 'party-evolve', who: c, from: old.dex, to, x: c.x, y: c.y, loud: 0 });
        try { R.Spawner.say(old.name + ' evolved into ' + c.talkName + '!', 2.6, 1); } catch (e) { /* ignore */ }
      }
    };
    if (instant) { done(); return; }
    try { R.Sprites.preload([to], 4000, !!c.shiny); } catch (e) { /* ignore */ }
    AI.Mind.say(s, 'sparkle', 2.6, 4);
    s.lock = {
      t: 0, dur: 3,
      update(e2, s2, dt, it) {
        this.t += dt;
        it.stay = true;
        s2.vis.glow = 0.5 + 0.5 * Math.sin(this.t * (6 + this.t * 6));
        s2.vis.shake = 0.6 + this.t * 0.4;
        if (R.Camera.sees(e2.x, e2.y, 40) && Math.random() < dt * 25) try { R.FX.twinkle(e2.x + U.rand(-e2.r * 1.6, e2.r * 1.6), e2.y - U.rand(0, e2.bodyH * 1.4)); } catch (err) { /* ignore */ }
        if (this.t >= this.dur) { s2.vis.glow = 0; s2.vis.shake = 0; done(); return false; }
        return true;
      },
    };
    c.invuln = Math.max(c.invuln || 0, 3.2);
  }
  function evoLine(c, oldName) {
    const L = {
      char: ['I can feel it — my flame\'s burning hotter than ever!', 'Whoa… look at me now! Nothing\'s scaring me off!'],
      froa: ['…Faster. Sharper. Good.', 'I won\'t miss a single track now.'],
      spri: ['Mrrow… finally, a look that suits me.', 'Don\'t stare. …Okay, you can stare a little.'],
    };
    const set = L[c.pp.key] || ['I feel stronger than ever!'];
    return set[(c.pp.stage || 1) % set.length] || ('From ' + oldName + ' to this!');
  }

  // ---------------------------------------------------------------- dodging, outside a fight too
  function dodge(c, dt) {
    const s = c.psx;
    if (!s || !s.combat || s.lock || c.pp.downed) return;
    const dg = c.pp.dodge;
    if (dg) {
      dg.t -= dt;
      const v = 125 * dg.sp;
      const nx = c.x + dg.dx * v * dt, ny = c.y + dg.dy * v * dt;
      if (c.flying || AI.Env.free(nx, ny, (c.r || 14) * 0.8)) { c.x = nx; c.y = ny; }
      if (dg.t <= 0) c.pp.dodge = null;
      return;
    }
    if (s.inCombat) return; // (in a fight the combat controller dodges for it)
    const d2 = AI.Combat.scanThreats(c, s, dt);
    if (d2) { c.pp.dodge = { t: d2.t, dx: d2.dx, dy: d2.dy, sp: d2.sp }; s.vis.hop = Math.max(s.vis.hop || 0, 0.12); st.dodges++; AI.stats.dodges = (AI.stats.dodges || 0) + 1; }
  }

  // ---------------------------------------------------------------- per frame
  const st = { got: 0, xp: 0, chests: 0, crystals: 0, dodges: 0, slowT: 0 };
  function tick(dt) {
    if (!AI.R || !C()) return;
    wrapPickups();
    const list = C().list();
    st.slowT -= dt;
    const slow = st.slowT <= 0;
    if (slow) st.slowT = 0.5;
    for (const c of list) {
      if (!c.pp || c.pp.leaving || !c.psx) continue;
      dodge(c, dt);
      const m = mods(c);
      c.pp.cdMul = m.cd;
      if (!slow) continue;
      if (c.pp.skill == null || c.pp.skillLv !== c.level) { skillUpdate(c); c.pp.skillLv = c.level; }
      // evolution at the right level
      if (!c.pp.downed && !c.psx.lock) { const to = nextEvo(c); if (to) evolve(c, to, false); }
      if (c.pp.downed) continue;
      // held items that act over time
      const it = m.item;
      if (it.regen && AI.time - c.pp.hurtAt > 1) c.hp = Math.min(c.maxHp, c.hp + (c.maxHp - c.hp) * it.regen * 0.5);
      if (it.sitrus && c.hp < c.maxHp * 0.5 && (c.pp.sitrusT || -99) < AI.time - 30) { c.pp.sitrusT = AI.time; const a = Math.round(c.maxHp * 0.25); c.hp = Math.min(c.maxHp, c.hp + a); fx(c, '+' + a, '#7ee08a'); }
      if (it.liechi && c.hp < c.maxHp * 0.33 && (c.pp.liechiUse || -99) < AI.time - 60) { c.pp.liechiUse = AI.time; c.pp.liechiT = AI.time + 8; }
      if (it.apicot && c.hp < c.maxHp * 0.33 && (c.pp.apicotUse || -99) < AI.time - 60) { c.pp.apicotUse = AI.time; c.pp.apicotT = AI.time + 8; }
      useBerries(c);
      // what's worth going for
      if (on() && !c.pp.goal) c.pp.goal = pickGoal(c);
      else if (c.pp.goal && c.pp.goal.ref && c.pp.goal.ref.psxClaim && c.pp.goal.ref.psxClaim !== c) c.pp.goal = null;
      if (c.pp.goal && c.psx.inCombat) c.pp.goal = null;
    }
  }
  function onSpawn(c, saved) {
    c.pp.bag = (saved && saved.bag) || { berries: [], items: [] };
    c.pp.item = (saved && saved.item) || null;
    // a resumed run: the evolved form it had
    if (saved && saved.form && saved.form !== c.dex) {
      for (let k = 0; k < 3 && c.dex !== saved.form; k++) {
        const list = (AI.R.EVOS && AI.R.EVOS[c.dex]) || [];
        const nx = list.find(([to]) => to === saved.form) || list.find(([to]) => ((AI.R.EVOS[to] || []).some(([t2]) => t2 === saved.form)));
        if (!nx) break;
        evolve(c, nx[0], true);
      }
    }
    skillUpdate(c);
  }

  // ---------------------------------------------------------------- drawing: power aura, panel badges
  function drawAir(ctx) {
    if (!AI.enabled || !C()) return;
    for (const c of C().list()) {
      const pw = c.pp && power(c);
      if (!pw || !AI.R.Camera.sees(c.x, c.y, 40)) continue;
      const left = pw.until - AI.time;
      ctx.save();
      ctx.globalAlpha = Math.min(1, left / 2) * (0.35 + Math.sin(AI.time * 6) * 0.12);
      ctx.strokeStyle = pw.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, (c.r || 14) + 10, ((c.r || 14) + 10) * 0.42, 0, 0, 6.283); ctx.stroke();
      ctx.restore();
    }
  }
  function drawBadges(ctx, c, x, y, bw) {
    const R = AI.R;
    let bx = x + bw - 24;
    if (c.pp.item) {
      bx -= 14;
      try { R.Icons.draw(ctx, c.pp.item, bx, y + 2, 12); } catch (e) { ctx.fillStyle = '#ffe14d'; ctx.fillRect(bx + 3, y + 5, 6, 6); }
    }
    const pw = power(c);
    if (pw) {
      bx -= 10;
      ctx.fillStyle = pw.color; ctx.beginPath(); ctx.arc(bx + 4, y + 8, 3.5, 0, 6.283); ctx.fill();
    }
    const b = c.pp.bag;
    if (b && b.berries.length) {
      ctx.fillStyle = '#ff9be0'; ctx.font = '700 7px Pixelify, "Segoe UI", sans-serif';
      ctx.fillText('●' + b.berries.length, x + bw - 40 - (c.pp.item ? 14 : 0) - (pw ? 10 : 0), y + 5);
    }
  }

  // ---------------------------------------------------------------- what they say about it
  function addLines() {
    const LN = C() && C().LN;
    if (!LN) return;
    Object.assign(LN, {
      gotItem: {
        char: [['Ooh, {item}! I\'ll hang on to this!', 'bold'], ['A-a {item}? I\'ll keep it safe.', 'scared'], ['{item}! Finders keepers!', 'warm']],
        froa: [['{item}. Useful.', 'dry'], ['Picked up {item}. I\'ll carry it.', 'warm']],
        spri: [['Mrrow. {item}. Mine now.', 'dry'], ['Ooh, shiny! {item}!', 'bold'], ['{item}… fine, I\'ll take it.', 'warm']],
      },
      opened: {
        char: [['Got it open! Look!', 'bold'], ['Heh, I opened it myself!', 'warm']],
        froa: [['Opened. Let\'s see.', 'dry']],
        spri: [['Mrr. Easy.', 'dry'], ['Treasure! For me, mostly.', 'bold']],
      },
      crystal: {
        char: [['A power crystal! {power} — {what}!', 'bold'], ['{power}! Whoa — {what}!', 'warm']],
        froa: [['{power}. {what}.', 'dry']],
        spri: [['{power}… {what}. I could get used to this.', 'dry'], ['Mrrow! {power}!', 'bold']],
      },
      well: {
        char: [['A well…? Out here? Who would dig a well in the middle of the woods?', 'warm'], ['I-I don\'t like that well. Something\'s breathing down there.', 'scared'], ['Bet I could see the bottom with my flame. …Bet I won\'t try.', 'bold']],
        froa: [['No tracks to it. Nobody\'s used this in years.', 'dry'], ['Listen. It drips. Far down.', 'warm']],
        spri: [['Mrr. Cold air coming out of it. I\'m not going near that.', 'dry'], ['Ooh, a wishing well? …Is it?', 'bold']],
      },
      crystalWhite: {
        char: [['I touched the white crystal — something\'s happening!', 'bold'], ['Uh-oh… the crystal did something!', 'scared']],
        froa: [['White crystal. Brace yourselves.', 'dry']],
        spri: [['Oops. …Did I do that?', 'dry']],
      },
    });
  }

  addBehaviors();
  setTimeout(addLines, 0);
  AI.define('PartyPlus', { st, ITEM, POWER, tick, onSpawn, outgoing, incoming, spdK, mods, power, collect, wants, pickGoal, openProp, touchAltar, evolve, nextEvo, stageOf, skillUpdate, drawAir, drawBadges, bag, addLines });
})();
