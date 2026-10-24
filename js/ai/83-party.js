/* PokéSurvivor+ — Living World AI · Pseudo Players: AI companions that play like people
 * A party has four places. Every place no human fills is taken by a Pseudo Player: alone you travel
 * with three, with a friend two, with two friends one, with three friends none. In the Shady Forest
 * they are Charmander, Froakie and Sprigatito (when fewer places are free, the ones that round out
 * the party best: types the humans don't have, a light if nobody carries one).
 *
 * They are not followers on a string. Each runs on the same brain as every other Pokémon in the
 * world (perception, emotions, combat with four moves, dodging) plus its own party behaviours:
 * keeping up without marching in line, wandering off to look at things and coming back, noticing
 * what its species would notice (Froakie: movement and tracks; Sprigatito: plants and smells;
 * Charmander: it lights the dark for the others), helping a hurt teammate, reviving a fallen one,
 * hesitating where its Nature says it would, sheltering behind a friend when scared, and talking.
 *   Behaviour = Nature + species + individual personality + what has happened + how it feels now.
 * They remember the run: trust, friendship, confidence, irritation, respect, fear, loyalty and shared
 * experiences between each of them and with you, and react (now and then, never constantly) to what
 * you do. They're marked as AI everywhere they appear. Nothing about the dungeon needs them.
 * In co-op the host runs them and everyone sees them; when a human joins, one says goodbye and
 * leaves; when a human leaves, one comes back.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const B = () => AI.Behaviors;
  const M = () => AI.Mind;

  // ---------------------------------------------------------------- who they are
  const ROSTER = [4, 656, 906];
  // if a human already plays one of them, a kindred Pokémon takes its place (same role, its own species)
  const SUBST = { 4: 390, 656: 393, 906: 722 };
  const KEY = { 4: 'char', 656: 'froa', 906: 'spri', 390: 'char', 393: 'froa', 722: 'spri' };
  /* species foundations (a Nature, experiences and moods shape how they show):
   * Charmander — expressive, warm, protective; its tail flame lights the dark
   * Froakie    — observant, agile, perceptive; quiet; notices danger and tracks first
   * Sprigatito — curious, affectionate, a little independent; notices plants and smells */
  const BASE = {
    4: { role: 'light', tr: { protectiveness: 0.2, sociability: 0.1 }, x: { talk: 0.1 }, sense: { light: 1 }, col: '#e0703a' },
    656: { role: 'scout', tr: { alertness: 0.3, agility: 0.2, curiosity: 0.05 }, x: { talk: -0.15 }, sense: { tracks: 1.5, danger: 1.4 }, col: '#4a8fd8' },
    906: { role: 'nature', tr: { curiosity: 0.3, playfulness: 0.15 }, x: { independence: 0.15, talk: 0.05 }, sense: { plants: 1.6, smell: 1.3 }, col: '#4aa860' },
  };
  BASE[390] = Object.assign({}, BASE[4], { col: '#e08a3a' });
  BASE[393] = Object.assign({}, BASE[656], { col: '#5a8ad8' });
  BASE[722] = Object.assign({}, BASE[906], { col: '#9a8a5a' });
  // the roster for this party: anyone a human already plays is swapped for its kindred substitute
  function roster() {
    const taken = new Set(AI.players.filter((p) => !p.pp).map((p) => p.dex));
    return ROSTER.map((d) => (taken.has(d) && SUBST[d] ? SUBST[d] : d));
  }
  const MAX_PARTY = 4;

  const st = { list: [], seed: 0, rel: {}, mem: mem0(), startT: 0, saveT: 0, syncT: 0, allocT: 0, talk: null, guests: new Map(), dismissing: [] };
  function on() { return AI.enabled && AI.cfg.pseudoPlayers !== false && AI.R && AI.R.Game && AI.R.Game.player; }
  function isGuest() { const R = AI.R; return !!(R.Coop && R.Coop.active && !R.Coop.isHost); }
  function humans() { if (st.humansOverride) return st.humansOverride; const R = AI.R; let n = 1; try { if (R.Coop && R.Coop.active) n += R.Coop.puppets().length; } catch (e) { /* ignore */ } return Math.min(MAX_PARTY, n); }
  function list() { return st.list; }
  function alive() { return st.list.filter((c) => !c.dead && !c.pp.leaving); }
  function lead() { return AI.R.Game.player; }

  // ---------------------------------------------------------------- relationships (session-level)
  const REL0 = () => ({ trust: 0.35, friend: 0.3, conf: 0.4, irr: 0, resp: 0.3, fear: 0, loyal: 0.3, shared: 0 });
  function rel(a, b) {
    const A = st.rel[a] || (st.rel[a] = {});
    return A[b] || (A[b] = REL0());
  }
  function bump(a, b, d) {
    const r = rel(a, b);
    for (const k in d) r[k] = k === 'shared' ? r[k] + d[k] : U.clamp(r[k] + d[k], 0, 1);
    return r;
  }
  function keyOf(ent) { return !ent ? null : ent === lead() ? 'P' : ent.pp ? ent.pp.key : null; }

  // ---------------------------------------------------------------- the run's memory of you
  function mem0() { return { protected: 0, abandoned: 0, risky: 0, brave: 0, helped: 0, ignored: 0, chests: 0, events: [] }; }
  function remember(what, o) { const m = st.mem; m.events.push({ what, t: AI.time, o }); if (m.events.length > 40) m.events.shift(); }

  // ---------------------------------------------------------------- allocation
  // the best companions for `n` places, given the humans in the party
  function choose(n) {
    const ros = roster();
    if (n >= ros.length) return ros.slice();
    const R = AI.R;
    const ht = new Set();
    let light = false;
    for (const p of AI.players) { if (p.pp) continue; for (const t of (R.DEX_BY[p.dex] || {}).types || []) ht.add(t); if (AI.Light && AI.Light.bodyOf(p)) light = true; }
    const score = (dex) => {
      let v = 0;
      for (const t of (R.DEX_BY[dex] || {}).types || []) if (!ht.has(t)) v += 1;
      if (BASE[dex].role === 'light' && !light) v += 0.8;
      if (st.list.some((c) => c.dex === dex && !c.pp.leaving)) v += 0.6; // keep who's already here
      if (BASE[dex].role === 'scout') v += 0.3;
      return v;
    };
    return ros.slice().sort((a, b) => score(b) - score(a)).slice(0, Math.max(0, n));
  }
  function allocate(force) {
    if (isGuest()) return;
    const want = on() && AI.cfg.pseudoPlayers !== false ? Math.max(0, MAX_PARTY - humans()) : 0;
    const keep = choose(want);
    // a human joined: the companion who fits least says goodbye and heads off
    for (const c of st.list.slice()) if (!keep.includes(c.dex) && !c.pp.leaving) dismiss(c, force);
    // a place opened up (or the run started): someone joins
    for (const dex of keep) if (!st.list.some((c) => c.dex === dex && !c.pp.leaving)) spawn(dex);
  }

  // ---------------------------------------------------------------- the companions themselves
  function natureFor(dex) {
    const rnd = U.rng((st.seed ^ (dex * 2654435761)) >>> 0);
    const N = AI.Natures;
    let id = N.pick(rnd);
    // three different Natures in the party
    for (let i = 0; i < 6 && st.list.some((c) => c.pp.nature === id); i++) id = N.pick(rnd);
    return id;
  }
  function spotNear(x, y, i) {
    const W = AI.R.World;
    for (let k = 0; k < 24; k++) {
      const a = (i || 0) * 2.1 + k * 0.9, d = 46 + k * 9;
      const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d * 0.8;
      if (W.isFree(sx, sy, 12) && !(AI.Forest && AI.Forest.on() && AI.Forest.water(sx, sy).e > 0)) return [sx, sy];
    }
    return [x + 30, y + 30];
  }
  function spawn(dex, saved) {
    const R = AI.R, p = lead();
    const d = R.DEX_BY[dex] || { name: '?' };
    const [x, y] = saved && saved.x != null ? [saved.x, saved.y] : spotNear(p.x, p.y, st.list.length);
    const e = new R.Enemy({ dex, name: d.name, hp: 100, spd: 100, dmg: 10, xp: 0, behavior: 'chase', shotDmg: 6, shotCd: 2, range: 220 }, x, y, { hp: 1, spd: 1, dmg: 1 });
    const key = KEY[dex] || 'c' + dex;
    const nature = (saved && saved.nature) || natureFor(dex);
    e.pp = { key, dex, nature, base: BASE[dex] || BASE[4], downed: null, revive: 0, leaving: 0, said: {}, notice: null, claims: null, slot: st.list.length, hurtAt: -99, berryT: 0, lost: 0, stuckT: 0, lastX: x, lastY: y, born: AI.time, shaken: 0 };
    e.psxCompanion = true;
    e.psxPlaced = true;
    e.psxForceTemp = 'friendly';
    e.psxNature = nature;
    e.kind = 'party';
    e.talkName = d.name;
    e.col = e.pp.base.col;
    e.walking = false; e.invuln = 0; e.moves = []; e.aim = 0; e._vx = 0; e._vy = 0;
    e.hurt = companionHurt;
    syncStats(e, true);
    AI.Brain.init(e);
    const s = e.psx;
    s.companion = e.pp;
    s.stance = 'friendly';
    // species foundations on top of the rolled personality and its Nature
    const b = e.pp.base;
    for (const k in b.tr) if (s.pers.tr[k] != null) s.pers.tr[k] = U.clamp(s.pers.tr[k] + b.tr[k], 0, 1);
    for (const k in b.x) if (s.pers.nx && s.pers.nx[k] != null) s.pers.nx[k] = U.clamp(s.pers.nx[k] + b.x[k], 0, 1);
    s.pers.quirks.delete('glutton'); s.pers.quirks.delete('lazy');
    AI.Rel.get(s, 'P').a = 0.6;
    if (saved) { e.hp = Math.max(1, Math.min(e.maxHp, saved.hp || e.maxHp)); }
    st.list.push(e);
    if (!saved && st.list.length && AI.time - st.startT > 5) {
      // joining mid-run: a word on arrival
      say(e, 'join');
    }
    return e;
  }
  function dismiss(c, quick) {
    c.pp.leaving = quick ? 0.01 : 2.5;
    if (!quick) say(c, 'leave', null, true);
  }
  function remove(c) {
    const i = st.list.indexOf(c);
    if (i >= 0) st.list.splice(i, 1);
    if (AI.Talk) AI.Talk.clear((b) => b.who && b.who.key === 'cp:' + c.pp.key);
  }
  // the human's level, HP scale and speed carry over: a Pseudo Player is as strong as a player
  function syncStats(e, fresh) {
    const p = lead();
    const k = 0.92;
    const mh = Math.max(10, Math.round(p.maxHp * k));
    if (fresh) { e.maxHp = mh; e.hp = mh; }
    else if (mh !== e.maxHp) { const f = e.hp / Math.max(1, e.maxHp); e.maxHp = mh; e.hp = Math.max(1, Math.round(mh * f)); }
    e.level = p.level || 1;
    const spd = (p.baseSpd || 116) * (p.spdMul || 1);
    e.spd = spd;
    if (e.psx) e.psx.baseSpd = spd;
    e._dmg = 6 + e.level * 0.9;
  }

  // ---------------------------------------------------------------- damage, falling, getting back up
  // takes a player-style hit (dmg, type, crit, cat) or an enemy-style one (dmg, color, kx, ky, knock)
  function companionHurt(amount, a2, a3, a4, a5) {
    if (this.dead || this.pp.downed || this.invuln > 0 || !(amount > 0)) return;
    const R = AI.R;
    const enemyStyle = typeof a2 === 'string' && a2[0] === '#';
    let dmg = amount;
    if (this.psx && this.psx.buff && this.psx.buff.until > AI.time && this.psx.buff.def < 1) dmg *= this.psx.buff.def;
    if (!enemyStyle && typeof a2 === 'string') dmg *= R.Types && R.Types.mult ? U.clamp(R.Types.mult(a2, this.types || ['normal']), 0.5, 2) : 1;
    this.hp -= dmg;
    this.invuln = 0.3;
    this.pp.hurtAt = AI.time;
    try { R.FX.dmgText(this.x, this.y - (this.bodyH || 40), String(Math.max(1, Math.round(dmg))), '#ff9a9a', false); } catch (e) { /* ignore */ }
    try { if (!this.anim.busy() || this.anim.cur === 'Walk') this.anim.play('Hurt', { speed: 1.4 }); } catch (e) { /* ignore */ }
    if (enemyStyle && (a3 || a4)) { const l = Math.hypot(a3, a4) || 1; this.x += (a3 / l) * Math.min(18, (a5 || 30) * 0.2); this.y += (a4 / l) * Math.min(18, (a5 || 30) * 0.2); R.World.collide(this); }
    const s = this.psx;
    const attacker = AI.curAttacker || AI.shooter || AI.curEnemy || null;
    if (s) {
      try { AI.Perception.onHurt(this, s, attacker, attacker ? AI.keyOf(attacker) : null, dmg, false); } catch (e) { /* ignore */ }
      if (attacker && attacker !== this && !AI.isPlayer(attacker)) s.lastFoe = { ent: attacker, t: AI.time };
    }
    AI.Bus.emit({ type: 'party-hurt', x: this.x, y: this.y, loud: 120, victim: this, by: attacker, dmg });
    if (this.hp <= 0) down(this);
    else if (this.hp < this.maxHp * 0.3 && !this.pp.lowSaid) { this.pp.lowSaid = true; say(this, 'low'); }
  }
  function down(c) {
    c.hp = 0;
    c.dead = true; // (out of the fight: nothing targets it until it's back up)
    c.pp.downed = { t: 0, by: null };
    c.pp.revive = 0;
    c.pp.lowSaid = false;
    try { c.anim.play('Faint', { hold: true, speed: 0.8 }); } catch (e) { /* ignore */ }
    if (c.psx && c.psx.inCombat) AI.Combat.disengage(c, c.psx);
    AI.Bus.emit({ type: 'party-down', x: c.x, y: c.y, loud: 300, victim: c });
    remember('down', { key: c.pp.key });
    for (const o of alive()) {
      const r = rel(o.pp.key, c.pp.key);
      // fear, anger or resolve, by Nature and friendship
      const nx = o.psx.pers.nx || {};
      if ((nx.caution || 0.5) > 0.7 && r.friend < 0.6) M().feel(o.psx, 'fear', 0.5, 'down'); else M().feel(o.psx, 'anger', 0.4 + r.friend * 0.4, 'down');
    }
    convo('down', { who: c });
  }
  function getUp(c, by) {
    c.dead = false;
    c.pp.downed = null;
    c.hp = Math.max(1, Math.round(c.maxHp * (by ? 0.4 : 0.22)));
    c.invuln = 1.5;
    try { c.anim.once = false; c.anim.done = false; c.anim._start ? c.anim._start('Idle', false) : c.anim.loop('Idle'); } catch (e) { /* ignore */ }
    c.pp.shaken = AI.time + 25; // shaken for a while after
    M().feel(c.psx, 'fear', 0.25, 'down');
    const k = keyOf(by);
    if (k) AI.Bus.emit({ type: 'party-support', what: 'revive', byYou: k === 'P', x: c.x, y: c.y, loud: 0 });
    if (k) {
      bump(c.pp.key, k, { trust: 0.15, friend: 0.1, loyal: 0.12, resp: 0.08, shared: 1 });
      if (k === 'P') { st.mem.protected++; remember('revivedByYou', { key: c.pp.key }); }
    }
    say(c, by ? (k === 'P' ? 'revivedByYou' : 'revived') : 'gotUp', { by });
  }
  function tickDowned(c, dt) {
    const d = c.pp.downed;
    d.t += dt;
    try { c.anim.update(dt); } catch (e) { /* ignore */ }
    // anyone in the party standing over it helps it up
    let helper = null;
    for (const p of [...AI.players, ...alive()]) {
      if (p === c || p.dead) continue;
      if (Math.hypot(p.x - c.x, p.y - c.y) < 46) { helper = p; break; }
    }
    if (helper) { c.pp.revive += dt; d.by = helper; } else c.pp.revive = Math.max(0, c.pp.revive - dt * 0.5);
    if (c.pp.revive >= 2.4) return getUp(c, d.by);
    // left alone long enough, it gets up by itself (no one is ever lost for good)
    if (d.t > 30 && !foesNear(c.x, c.y, 260)) return getUp(c, null);
    // you walked away from a fallen companion
    const p = lead();
    if (p && Math.hypot(p.x - c.x, p.y - c.y) > 520 && d.t > 14 && !d.abandoned) { d.abandoned = true; st.mem.abandoned++; bump(c.pp.key, 'P', { trust: -0.08, loyal: -0.05 }); remember('abandoned', { key: c.pp.key }); }
  }

  // ---------------------------------------------------------------- what's around
  function hostileToParty(e) {
    if (!e || e.dead || e.pp) return false;
    if (e.remote) return false;
    const s = e.psx;
    if (!s) return true; // (bosses, elites and the game's own enemies are always out for the party)
    if (s.stance === 'hostile') return true;
    if (s.inCombat && s.combat.target && (AI.isPlayer(s.combat.target) || s.combat.target.pp)) return true;
    return false;
  }
  function foesNear(x, y, r) {
    for (const e of AI.R.EnemyMgr.queryCircle(x, y, r)) if (hostileToParty(e) && !(e.psx && e.psx.eco && e.psx.eco.kind === 'cocoon')) return true;
    return false;
  }
  function darkness() { return AI.Sky && !(AI.Mansion && AI.Mansion.inside) ? AI.Sky.darkness() : AI.Mansion && AI.Mansion.inside ? 0.7 : 0; }
  function hasLight(ent) { return !!(AI.Light && AI.Light.carriesLight(ent)); }
  function nearLight(ent, r) {
    if (hasLight(ent)) return true;
    for (const o of [...AI.players, ...alive()]) if (o !== ent && !o.dead && hasLight(o) && Math.hypot(o.x - ent.x, o.y - ent.y) < r) return true;
    try { for (const l of AI.Light.lights) if (!l.body && Math.hypot(l.x - ent.x, l.y - ent.y) < l.r * 0.7) return true; } catch (e) { /* ignore */ }
    return false;
  }
  function mansionK() { try { return AI.Journey ? AI.Journey.nearK(lead().x, lead().y) : 0; } catch (e) { return 0; } }
  const GHOST = new Set(['ghost']);
  function ghostsNear(x, y, r) {
    let n = 0;
    for (const e of AI.R.EnemyMgr.queryCircle(x, y, r)) if (!e.dead && ((e.types || []).some((t) => GHOST.has(t)))) n++;
    return n;
  }

  // ---------------------------------------------------------------- thinking (instead of the wild stance & target)
  function think(e, s, dt) {
    s.stance = 'friendly';
    const p = lead();
    const nx = s.pers.nx || {};
    const tr = s.pers.tr;
    // feelings from the surroundings: the dark, the house, ghosts, storms
    const dark = darkness();
    if (dark > 0.55 && !nearLight(e, 130)) M().feel(s, 'fear', dt * 0.05 * (nx.caution || 0.5) * (1.3 - tr.bravery), 'dark');
    else if (dark > 0.55 && nearLight(e, 130) && s.mind.emo.fear > 0.2) s.mind.emo.fear = Math.max(0, s.mind.emo.fear - dt * 0.04);
    const mk = mansionK();
    if (mk > 0.3) { M().feel(s, 'suspicion', dt * 0.04 * mk, 'mansion'); if ((nx.caution || 0.5) > 0.6) M().feel(s, 'fear', dt * 0.03 * mk, 'mansion'); }
    const gn = ghostsNear(e.x, e.y, 320);
    if (gn) M().feel(s, tr.bravery > 0.6 ? 'anger' : 'fear', dt * 0.06 * gn, 'ghost');
    if (AI.Sky && AI.Sky.storm > 0.5) M().feel(s, 'fear', dt * 0.02 * (nx.caution || 0.5), 'storm');
    if (e.pp.shaken > AI.time) M().feel(s, 'fear', dt * 0.01, 'down');
    // who to fight
    selectTarget(e, s);
    // what it notices that its species would
    e.pp.scanT = (e.pp.scanT || 0) - dt;
    if (e.pp.scanT <= 0) { e.pp.scanT = U.rand(1.2, 2); scan(e, s); }
  }
  // fights only what threatens the party, or what you're clearly fighting; never stirs up a Pokémon
  // the party is sneaking past (unless its Nature gets the better of it)
  function selectTarget(e, s) {
    const p = lead();
    const R = AI.R;
    const nx = s.pers.nx || {};
    const tr = s.pers.tr;
    let best = null, bv = 0.3, why = '';
    const playerFighting = (p.moves || []).some((m) => m.castAt && performance.now() - m.castAt < 2500);
    for (const o of R.EnemyMgr.queryCircle(e.x, e.y, 420)) {
      if (o.dead || o.remote || o.pp) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      const dl = Math.hypot(o.x - p.x, o.y - p.y);
      if (dl > 520) continue;
      const os = o.psx;
      let v = 0;
      if (hostileToParty(o)) {
        v = 0.6 - d / 1200;
        if (os && os.combat && os.combat.target) {
          const t = os.combat.target;
          if (t === e) v += 0.35;
          else if (t.pp) v += 0.25 + rel(e.pp.key, t.pp.key).friend * 0.3;
          else if (t === p) v += 0.25 + rel(e.pp.key, 'P').loyal * 0.25;
          if (t.hp < t.maxHp * 0.35) v += 0.2;
        }
        if (o.boss || o.legend) v += tr.bravery > 0.6 ? 0.1 : -0.25;
      } else if (playerFighting && (p.target === o || p.psxFocus === o)) {
        v = 0.5 - d / 1200; // helping with your fight
      } else if (os && os.stance === 'wary' && !os.eco && d < 160 && (nx.impulsive || 0.5) > 0.75 && Math.random() < 0.04) {
        // a Rash or Hasty one sometimes jumps the gun on a wary Pokémon
        v = 0.7; why = 'rash';
      }
      if (v > bv) { bv = v; best = o; if (why !== 'rash') why = 'party'; }
    }
    // low on HP: it hangs back unless a friend is in trouble or its Nature won't let it
    if (best && e.hp < e.maxHp * 0.3 && why !== 'rash' && tr.bravery < 0.75) bv -= 0.3;
    if (best && why === 'rash' && s.fightTarget !== best) {
      AI.Bus.emit({ type: 'party-rash', x: e.x, y: e.y, loud: 0, actor: e, target: best });
      setTimeout(() => react('rash', e), 1600);
    }
    s.fightTarget = bv > 0.3 ? best : null;
    s.fightScore = best ? Math.min(1.4, bv) : 0;
    s.fightReason = why || 'party';
  }

  // ---------------------------------------------------------------- noticing things (abilities outside combat)
  const noticed = new Set(); // ids of things someone already pointed out
  function scan(e, s) {
    if (e.pp.notice || s.inCombat) return;
    const R = AI.R, p = lead();
    const sense = e.pp.base.sense || {};
    const nx = s.pers.nx || {};
    // treasure: anyone can spot a chest
    const r0 = 260 * (sense.danger ? 1.15 : 1) * (1 - (nx.distract || 0.5) * 0.2);
    const cam = { _x: e.x - r0, _y: e.y - r0, w: r0 * 2, h: r0 * 2, left() { return this._x; }, top() { return this._y; }, sees(x, y, m) { m = m || 0; return x >= this._x - m && x <= this._x + this.w + m && y >= this._y - m && y <= this._y + this.h + m; } };
    let props = [];
    try { props = R.World.visibleProps(cam); } catch (err) { /* ignore */ }
    for (const pr of props) {
      if ((pr.type === 'chest' || pr.type === 'bigchest') && !pr.used && !pr.opened && !(pr.hp <= 0)) {
        const id = 'c' + Math.round(pr.x) + ',' + Math.round(pr.y);
        if (noticed.has(id) || Math.hypot(pr.x - p.x, pr.y - p.y) < 90) continue;
        if (Math.hypot(pr.x - e.x, pr.y - e.y) > r0) continue;
        return point(e, { id, x: pr.x, y: pr.y, kind: pr.type === 'bigchest' ? 'bigchest' : 'chest' });
      }
      // Sprigatito's nose and eye for plants: berries, odd plants, a mystery's leafy clue
      if (sense.plants && pr.type === 'psx' && pr.item) {
        const k = pr.item.k, n = pr.item.n || '';
        const plant = k === 'clue' || /berry|mushroom|flower|shroom|vines/.test(n);
        const id = 'p' + Math.round(pr.x) + ',' + Math.round(pr.y);
        if (plant && !noticed.has(id) && Math.random() < 0.35) return point(e, { id, x: pr.x, y: pr.y, kind: k === 'clue' ? 'clue' : 'plant' });
      }
    }
    // Froakie reads the ground: fresh tracks, and Pokémon hiding up in the trees
    if (sense.tracks && AI.Decor && AI.Decor.prints) {
      for (const pt of AI.Decor.prints) {
        if (pt.k === 0 || AI.time - pt.t > 60) continue; // (not the party's own)
        const id = 't' + Math.round(pt.x / 80) + ',' + Math.round(pt.y / 80);
        if (noticed.has(id) || Math.hypot(pt.x - e.x, pt.y - e.y) > 300 * sense.tracks) continue;
        if ((pt.s || 1) < 0.4) continue;
        return point(e, { id, x: pt.x, y: pt.y, kind: 'tracks' });
      }
    }
    if (sense.tracks && AI.Wildlife) {
      for (const [k, w] of AI.Wildlife.residents) {
        if (!w || w.dead || noticed.has('w' + k) || Math.hypot(w.x - e.x, w.y - e.y) > 280) continue;
        if (!(w.psx && w.psx.vis.perch > 10)) continue;
        return point(e, { id: 'w' + k, x: w.x, y: w.y - w.psx.vis.perch, kind: 'treeMon', ent: w });
      }
    }
  }
  function point(e, thing) {
    noticed.add(thing.id);
    e.pp.notice = Object.assign({ t: 0, by: e }, thing);
    if (thing.kind === 'chest' || thing.kind === 'bigchest') st.mem.chests++;
    return thing;
  }

  // ---------------------------------------------------------------- party behaviours
  const PARTY_OK = new Set(['fight', 'defend', 'retaliate', 'retreat', 'idle']);
  function okFor(s, b) { return !s.companion || b.party || PARTY_OK.has(b.id); }
  function leash(e, s) {
    const nx = s.pers.nx || {};
    const tr = s.pers.tr;
    let L = 150 + (nx.independence || 0.5) * 170 + tr.curiosity * 50 - rel(e.pp.key, 'P').trust * 40;
    if (foesNear(lead().x, lead().y, 420)) L = Math.min(L, 150);
    if (darkness() > 0.55 && !hasLight(e)) L = Math.min(L, 120);
    const mk = mansionK();
    if (mk > 0.4) L = Math.min(L, 150 - mk * 40 * (nx.caution || 0.5));
    if (s.mind.emo.fear > 0.45) L = Math.min(L, 95);
    return Math.max(70, L);
  }
  // a loose place around you: never a rigid formation, never on top of each other
  function slotPos(e, s, L) {
    const p = lead();
    const fa = Math.atan2(p._vy || 0, p._vx || 0);
    const moving = Math.hypot(p._vx || 0, p._vy || 0) > 20;
    const base = moving ? fa + Math.PI : (e.pp.slot * 2.1 + 0.6);
    const a = base + [-0.7, 0.7, 0, 1.6][e.pp.slot % 4] + Math.sin(AI.time * 0.13 + e.pp.slot * 2) * 0.35;
    const d = L * 0.55;
    let x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.75;
    for (const o of alive()) if (o !== e && Math.hypot(o.x - x, o.y - y) < 34) { x += (x - o.x) * 0.6; y += (y - o.y) * 0.6; }
    return [x, y];
  }

  function addBehaviors() {
    const BH = B();
    // keeping up with the party
    BH.add({
      id: 'party-follow', tier: 5, party: true, emotion: null, minCommit: 0.8,
      score(e, s) {
        if (!s.companion) return 0;
        const p = lead();
        const d = Math.hypot(p.x - e.x, p.y - e.y), L = leash(e, s);
        if (s.beh && s.beh.id === 'party-follow') return d > L * 0.5 ? 0.7 : 0;
        return d > L ? 0.55 + Math.min(0.8, (d - L) / 300) : 0;
      },
      update(e, s, dt, it) {
        const p = lead();
        const L = leash(e, s);
        const [tx, ty] = slotPos(e, s, L);
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        B().go(it, tx, ty, d > 420 ? 1.35 : d > L ? 1.08 : 0.8);
        return d > L * 0.45;
      },
    });
    // off to look at something, then back
    BH.add({
      id: 'party-explore', tier: 7, party: true, emotion: 'curiosity', minCommit: 4, cd: 6,
      score(e, s) {
        if (!s.companion || foesNear(e.x, e.y, 380) || s.mind.emo.fear > 0.4) return 0;
        const nx = s.pers.nx || {};
        return 0.25 + s.pers.tr.curiosity * 0.4 + (nx.distract || 0.5) * 0.25 + (nx.independence || 0.5) * 0.2 - (darkness() > 0.6 && !hasLight(e) ? 0.3 : 0);
      },
      start(e, s) {
        const p = lead();
        const L = leash(e, s);
        // scouts go ahead of where you're heading; the curious go to whatever is interesting
        const fa = Math.atan2(p._vy || 0, p._vx || 0), moving = Math.hypot(p._vx || 0, p._vy || 0) > 20;
        const scout = e.pp.base.role === 'scout';
        const a = moving && scout ? fa + U.rand(-0.5, 0.5) : Math.random() * 6.28;
        const d = U.rand(L * 0.6, L * 1.15);
        const pt = B().pointNear(e, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.8, 0, 60);
        s.bs.to = pt || [p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.8];
        // near the old house, the curious one goes to look at the gate
        try {
          const g = AI.Journey && AI.Journey.st.geo;
          if (g && mansionK() > 0.6 && s.pers.tr.curiosity > 0.6 && (s.pers.nx.caution || 0.5) < 0.6) { const G = AI.Decor.mansionGeom(g.S, g.D).G; s.bs.to = [G[0] + U.rand(-40, 40), G[1] + 50]; }
        } catch (err) { /* ignore */ }
        s.bs.look = 0; s.bs.t = 0;
      },
      update(e, s, dt, it) {
        s.bs.t += dt;
        const [tx, ty] = s.bs.to;
        const d = Math.hypot(tx - e.x, ty - e.y);
        if (d > 14 && s.bs.t < 7) { B().go(it, tx, ty, 0.6); return true; }
        // look around a little
        B().stay(it);
        s.bs.look -= dt;
        if (s.bs.look <= 0) { s.bs.look = U.rand(0.8, 1.6); s.bs.face = Math.random() * 6.28; if (Math.random() < 0.25) M().say(s, 'question', 1, 0.3); }
        it.face = s.bs.face;
        return s.bs.t < 7 + U.rand(1, 3);
      },
    });
    // "Over here!": going to something it noticed and waiting for you
    BH.add({
      id: 'party-notice', tier: 6, party: true, emotion: 'excitement', minCommit: 2,
      score(e, s) { return s.companion && e.pp.notice && !foesNear(e.x, e.y, 300) ? 0.9 : 0; },
      start(e, s) { const n = e.pp.notice; if (n && n.kind !== 'open' && n.kind !== 'burn') { M().say(s, 'surprise', 1.4, 2); setTimeout(() => announce(e, n), 500); } },
      update(e, s, dt, it) {
        const n = e.pp.notice;
        if (!n) return false;
        n.t += dt;
        const p = lead();
        const d = Math.hypot(n.x - e.x, n.y - e.y);
        if (n.kind === 'burn') {
          // a Fire-type burning a fallen tree clear
          const ev = AI.Events && AI.Events.st.cur;
          if (!ev || ev.id !== 'fallen' || n.t > 10) { e.pp.notice = null; return false; }
          if (d > 30) { B().go(it, n.x, n.y, 1); return true; }
          B().stay(it); it.face = -Math.PI / 2; it.anim = 'Shoot';
          return true;
        }
        if (n.kind === 'open') {
          // helping open a big chest: stand by it until it pops
          if (!(n.prop && n.prop.open > 0) || n.t > 8) { e.pp.notice = null; return false; }
          if (d > 50) { B().go(it, n.x + (e.pp.slot - 1) * 34, n.y + 30, 1); return true; }
          B().stay(it); it.face = Math.atan2(n.y - e.y, n.x - e.x);
          return true;
        }
        if (d > 38 && n.t < 8) { B().go(it, n.x, n.y + 22, 0.85); return true; }
        B().stay(it);
        it.face = Math.atan2(n.y - e.y, n.x - e.x);
        // wait for you (not forever)
        if (Math.hypot(p.x - n.x, p.y - n.y) < 110 || n.t > 16) { e.pp.notice = null; return false; }
        if (n.t > 6 && !n.waved) { n.waved = true; M().say(s, 'happy', 1.2, 1); }
        return true;
      },
      end(e) { if (e.pp.notice && e.pp.notice.t > 16) e.pp.notice = null; },
    });
    // a fallen teammate: get to it and help it up
    BH.add({
      id: 'party-revive', tier: 2, party: true, emotion: 'fear', minCommit: 1,
      score(e, s) {
        if (!s.companion) return 0;
        const t = st.list.find((c) => c !== e && c.pp.downed && Math.hypot(c.x - e.x, c.y - e.y) < 800);
        if (!t) return 0;
        s.bs.downT = t;
        return 0.9 + rel(e.pp.key, t.pp.key).friend * 0.4;
      },
      start(e, s) { s.bs.who = st.list.find((c) => c !== e && c.pp.downed) || null; },
      update(e, s, dt, it) {
        const t = s.bs.who;
        if (!t || !t.pp.downed) return false;
        const d = Math.hypot(t.x - e.x, t.y - e.y);
        if (d > 30) { B().go(it, t.x + 18, t.y + 6, 1.2); return true; }
        B().stay(it); it.face = Math.atan2(t.y - e.y, t.x - e.x);
        return true;
      },
    });
    // scared: behind a trusted friend rather than running off alone
    BH.add({
      id: 'party-shelter', tier: 2, party: true, emotion: 'fear', minCommit: 1.5, cd: 4,
      score(e, s) {
        if (!s.companion) return 0;
        const f = s.mind.emo.fear;
        if (f < 0.55 || !s.ctx.threat) return 0;
        // a friend in real danger outweighs its own fear
        if (st.list.some((c) => c !== e && !c.dead && c.hp < c.maxHp * 0.3 && rel(e.pp.key, c.pp.key).friend > 0.45)) return 0;
        return 0.5 + f * 0.6;
      },
      start(e, s) {
        let best = null, bv = -1;
        for (const o of [lead(), ...alive()]) { if (o === e || o.dead) continue; const v = (o === lead() ? rel(e.pp.key, 'P').trust : rel(e.pp.key, o.pp.key).trust) + (o.psx && o.psx.pers.tr.bravery || 0.5) * 0.3; if (v > bv) { bv = v; best = o; } }
        s.bs.behind = best;
        if (best && best !== lead()) { bump(e.pp.key, best.pp.key, { trust: 0.02 }); if (Math.random() < 0.5) react('reassure', best, { scared: e }); }
        M().say(s, 'scared', 1.5, 2);
      },
      update(e, s, dt, it) {
        const b = s.bs.behind, t = s.ctx.threat;
        if (!b || b.dead || !t || t.dead || s.mind.emo.fear < 0.3) return false;
        const a = Math.atan2(b.y - t.y, b.x - t.x);
        B().go(it, b.x + Math.cos(a) * 32, b.y + Math.sin(a) * 26, 1.1);
        s.vis.shake = s.mind.emo.fear > 0.7 ? 0.6 : 0;
        return true;
      },
      end(e, s) { s.vis.shake = 0; },
    });
    // hesitating where its Nature would: the dark, the house, a ghost
    BH.add({
      id: 'party-hesitate', tier: 4, party: true, emotion: 'fear', minCommit: 1.5, cd: 45,
      score(e, s) {
        if (!s.companion || s.inCombat) return 0;
        const nx = s.pers.nx || {};
        const c = (nx.caution || 0.5) * (1.2 - s.pers.tr.bravery);
        const mk = mansionK();
        const dark = darkness() > 0.6 && !nearLight(e, 120);
        if (c < 0.45 || !(mk > 0.55 || dark || ghostsNear(e.x, e.y, 300))) return 0;
        return 0.5 + c * 0.5;
      },
      start(e, s) { s.bs.t = U.rand(1.4, 2.8); s.bs.why = mansionK() > 0.55 ? 'mansion' : ghostsNear(e.x, e.y, 300) ? 'ghost' : 'dark'; say(e, 'hesitate_' + s.bs.why); },
      update(e, s, dt, it) {
        B().stay(it);
        const p = lead();
        it.face = Math.atan2(p.y - e.y, p.x - e.x);
        s.vis.shake = 0.4;
        s.bs.t -= dt;
        // it does go on (catching up if it has to)
        return s.bs.t > 0 && Math.hypot(p.x - e.x, p.y - e.y) < 260;
      },
      end(e, s) { s.vis.shake = 0; },
    });
    // with a light of its own in the dark, it keeps close to whoever can't see
    BH.add({
      id: 'party-light', tier: 5, party: true, emotion: null, minCommit: 3,
      score(e, s) {
        if (!s.companion || !hasLight(e) || darkness() < 0.55 || s.inCombat) return 0;
        const need = [lead(), ...alive()].filter((o) => o !== e && !o.dead && !hasLight(o) && !nearLight(o, 120));
        if (!need.length) return 0;
        s.bs.need = need;
        return 0.6 + darkness() * 0.3 + s.pers.tr.protectiveness * 0.2;
      },
      start(e, s) {
        const need = [lead(), ...alive()].filter((o) => o !== e && !o.dead && !hasLight(o));
        // the one most in the dark (you first, if it's a tie)
        s.bs.who = need.sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0] || lead();
        if (!st.lightSaid || AI.time - st.lightSaid > 240) { st.lightSaid = AI.time; say(e, 'light'); }
      },
      update(e, s, dt, it) {
        const w = s.bs.who;
        if (!w || w.dead || darkness() < 0.5) return false;
        const d = Math.hypot(w.x - e.x, w.y - e.y);
        if (d > 48) B().go(it, w.x + 26, w.y + 12, d > 200 ? 1.2 : 0.85); else { B().stay(it); it.face = Math.atan2(w.y - e.y, w.x - e.x); }
        return Math.hypot(lead().x - e.x, lead().y - e.y) < 500;
      },
    });
    // a hurt ally: get close, share a berry when it can
    BH.add({
      id: 'party-support', tier: 3, party: true, emotion: null, minCommit: 1.5,
      score(e, s) {
        if (!s.companion || e.pp.berryT > AI.time) return 0;
        const hurt = [lead(), ...alive()].filter((o) => o !== e && !o.dead && o.hp < o.maxHp * 0.35);
        if (!hurt.length) return 0;
        s.bs.hurt = hurt[0];
        return 0.55 + ((s.pers.nx && s.pers.nx.compassion) || 0.5) * 0.5;
      },
      start(e, s) { s.bs.who = [lead(), ...alive()].filter((o) => o !== e && !o.dead && o.hp < o.maxHp * 0.35)[0]; s.bs.t = 0; },
      update(e, s, dt, it) {
        const w = s.bs.who;
        s.bs.t += dt;
        if (!w || w.dead || s.bs.t > 6) return false;
        const d = Math.hypot(w.x - e.x, w.y - e.y);
        if (d > 40) { B().go(it, w.x, w.y, 1.15); return true; }
        // an Oran Berry from its pouch
        const amt = Math.round(w.maxHp * 0.2);
        if (w === lead()) { try { w.heal ? w.heal(amt) : (w.hp = Math.min(w.maxHp, w.hp + amt)); } catch (err) { w.hp = Math.min(w.maxHp, w.hp + amt); } } else w.hp = Math.min(w.maxHp, w.hp + amt);
        try { AI.R.FX.dmgText(w.x, w.y - (w.bodyH || 40) - 10, '+' + amt, '#7ee08a', true); AI.R.FX.ring(w.x, w.y, 6, 26, '#7ee08a', 0.4, 2); } catch (err) { /* ignore */ }
        e.pp.berryT = AI.time + 75;
        AI.Bus.emit({ type: 'party-support', what: 'berry', byYou: false, x: w.x, y: w.y, loud: 0 });
        const k = keyOf(w);
        if (k && k !== 'P') bump(k, e.pp.key, { trust: 0.06, friend: 0.06, shared: 1 });
        if (k === 'P') bump('P', e.pp.key, { shared: 1 });
        say(e, 'berry', { to: w });
        return false;
      },
    });
    // nothing going on: near you, looking around, now and then a little something
    BH.add({
      id: 'party-idle', tier: 8, party: true, emotion: null, minCommit: 2,
      score(e, s) { return s.companion ? 0.6 : 0; },
      start(e, s) { s.bs.t = U.rand(2, 5); s.bs.look = 0; },
      update(e, s, dt, it) {
        B().stay(it);
        const p = lead();
        s.bs.look -= dt;
        if (s.bs.look <= 0) {
          s.bs.look = U.rand(1, 2.6);
          // mostly where you're looking or toward the last noise, sometimes just around
          const n = s.lastNoise && AI.time - s.lastNoise.t < 4 ? s.lastNoise : null;
          s.bs.face = n ? Math.atan2(n.y - e.y, n.x - e.x) : Math.random() < 0.5 ? Math.atan2(p.y - e.y, p.x - e.x) : Math.random() * 6.28;
        }
        it.face = s.bs.face;
        s.bs.t -= dt;
        return s.bs.t > 0;
      },
    });
    // story scenes and menus: stand by
    BH.add({
      id: 'party-hold', tier: 0, party: true, emotion: null, minCommit: 0.5,
      score(e, s) { return s.companion && ((AI.Story && AI.Story.busy()) || AI.R.Game.state !== 'playing') ? 1 : 0; },
      update(e, s, dt, it) { B().stay(it); const p = lead(); it.face = Math.atan2(p.y - e.y, p.x - e.x); return (AI.Story && AI.Story.busy()) || AI.R.Game.state !== 'playing'; },
    });
  }

  // ---------------------------------------------------------------- per frame
  let netOn = false;
  function tick(dt) {
    if (!AI.R || !AI.R.Game || !AI.R.Game.player) return;
    if (!netOn && AI.R.Net && AI.R.Net.on) { netOn = true; AI.R.Net.on(onNet); }
    if (isGuest()) { tickGuest(dt); return; }
    if (!on()) { if (st.list.length) for (const c of st.list.slice()) remove(c); return; }
    if (st.pending) restorePending();
    const R = AI.R, p = lead();
    st.allocT -= dt;
    if (st.allocT <= 0) { st.allocT = 2; allocate(); }
    for (const c of st.list.slice()) {
      if (c.pp.leaving) { tickLeaving(c, dt); continue; }
      if (c.invuln > 0) c.invuln -= dt;
      if (c.pp.downed) { tickDowned(c, dt); continue; }
      if (st.statT == null || st.statT <= 0) syncStats(c);
      keepNear(c, dt);
      try { AI.Brain.update(c, dt, null, AI.vanillaEnemyUpdate); } catch (err) { AI.warn('party-brain', err); }
      contact(c);
      regen(c, dt);
    }
    st.statT = (st.statT == null || st.statT <= 0) ? 1 : st.statT - dt;
    helpOpen(dt);
    shots();
    tickTalk(dt);
    watch(dt);
    st.saveT -= dt;
    if (st.saveT <= 0) { st.saveT = 5; save(); }
    st.syncT -= dt;
    if (st.syncT <= 0 && R.Coop && R.Coop.active && R.Coop.isHost) { st.syncT = 0.1; broadcast(); }
  }
  function tickLeaving(c, dt) {
    c.pp.leaving -= dt;
    // walking off, fading away
    const p = lead();
    const a = Math.atan2(c.y - p.y, c.x - p.x);
    c.x += Math.cos(a) * 60 * dt; c.y += Math.sin(a) * 60 * dt;
    try { c.anim.loop('Walk', 1); c.anim.dir = AI.R.Sprites.dirFromAngle(a); c.anim.update(dt); } catch (e) { /* ignore */ }
    c.psxFade = U.clamp(c.pp.leaving / 1.2, 0, 1);
    if (c.pp.leaving <= 0) remove(c);
  }
  // never lost: too far behind or stuck, it catches up from somewhere you're not looking
  function keepNear(c, dt) {
    const R = AI.R, p = lead();
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    const moved = Math.hypot(c.x - c.pp.lastX, c.y - c.pp.lastY);
    c.pp.lastX = c.x; c.pp.lastY = c.y;
    const wantsToMove = c.psx && c.psx.beh && (c.psx.beh.id === 'party-follow' || c.psx.beh.id === 'party-revive');
    if (wantsToMove && moved < 0.3 && d > 120) c.pp.stuckT += dt; else c.pp.stuckT = Math.max(0, c.pp.stuckT - dt);
    const inside = AI.Mansion && AI.Mansion.inside;
    const farOff = d > (inside ? 700 : 1100);
    if (farOff || c.pp.stuckT > 3.5) {
      const ang = Math.atan2(p._vy || 0, p._vx || 0) + Math.PI + U.rand(-0.6, 0.6);
      let placed = false;
      for (let k = 0; k < 12 && !placed; k++) {
        const r = (inside ? 70 : 300) + k * 12;
        const x = p.x + Math.cos(ang + k * 0.5) * r, y = p.y + Math.sin(ang + k * 0.5) * r * 0.8;
        if (R.World.isFree(x, y, 12) && (inside || !R.Camera.sees(x, y, 20)) && !(AI.Forest && AI.Forest.on() && !inside && AI.Forest.water(x, y).e > 0)) { c.x = x; c.y = y; placed = true; }
      }
      if (!placed) { const [x, y] = spotNear(p.x, p.y, c.pp.slot); c.x = x; c.y = y; }
      c.pp.stuckT = 0;
      if (c.psx) { c.psx.px = c.x; c.psx.py = c.y; c.psx.thinkT = 0; }
    }
  }
  // hostile Pokémon that touch a companion hurt it, as they would you
  function contact(c) {
    for (const e of AI.R.EnemyMgr.queryCircle(c.x, c.y, (c.r || 14) + 30)) {
      if (e.dead || e.touchCd > 0 || !hostileToParty(e)) continue;
      if (e.psx && e.psx.combat && e.psx.combat.target && e.psx.combat.target !== c) continue;
      if (Math.hypot(e.x - c.x, e.y - c.y) > (e.r || 14) + (c.r || 14)) continue;
      e.touchCd = 0.8;
      const prev = AI.curAttacker; AI.curAttacker = e;
      try { c.hurt(e.dmg || e._dmg || 8, '#ff6a6a', c.x - e.x, c.y - e.y, 40); } finally { AI.curAttacker = prev; }
    }
  }
  // a big chest opens faster with friends around it, as it does with other players
  function helpOpen(dt) {
    const R = AI.R, p = lead();
    st.chestT = (st.chestT || 0) - dt;
    if (st.chestT <= 0) {
      st.chestT = 0.5;
      try { st.chests = (R.World.specialsNear ? R.World.specialsNear(p.x, p.y, 220) : []).filter((q) => q.type === 'bigchest'); } catch (e) { st.chests = []; }
    }
    for (const pr of st.chests || []) {
      if (!(pr.open > 0)) continue;
      const near = alive().filter((c) => Math.hypot(c.x - pr.x, c.y - pr.y) < 80).length;
      if (near) pr.open += dt * 0.2 * near;
      // the others come over to help
      for (const c of alive()) if (!c.pp.notice && !c.psx.inCombat && Math.hypot(c.x - pr.x, c.y - pr.y) > 80) c.pp.notice = { id: 'open', x: pr.x, y: pr.y, kind: 'open', prop: pr, t: 0, by: c };
    }
  }
  function regen(c, dt) {
    if (AI.time - c.pp.hurtAt > 6 && c.hp < c.maxHp && !c.psx.inCombat) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.012 * dt);
    if (c.hp > c.maxHp * 0.5) c.pp.lowSaid = false;
  }
  // shots and blasts meant for the party can hit companions; the companions' own shots never hit you
  function shots() {
    const R = AI.R;
    const live = alive();
    if (!live.length) return;
    const arr = R.Projectiles.all();
    for (let i = arr.length - 1; i >= 0; i--) {
      const q = arr[i];
      if (q.friendly || q.psxSafe || (q.psxOwner && q.psxOwner.pp)) continue;
      for (const c of live) {
        if (c.dead || U.dist2(q.x, q.y, c.x, c.y) > ((q.r || 6) + (c.r || 14)) ** 2) continue;
        if (!q.hits) q.hits = new Set();
        if (q.hits.has('cp' + c.pp.key)) continue;
        q.hits.add('cp' + c.pp.key);
        const owner = q.psxOwner || null;
        const prev = AI.curAttacker; AI.curAttacker = owner;
        try {
          if (q.psxMove && owner) AI.NpcMoves.hit(owner, q.psxMove, c, q.vx || 0, q.vy || 0, 40, false);
          else c.hurt(q.dmg || 6, q.mtype || 'normal', false, 'spec');
        } finally { AI.curAttacker = prev; }
        if (!(q.pierce > 0)) { arr.splice(i, 1); try { R.FX.burst(q.x, q.y - R.LIFT, q.color || '#fff', 6, 90); } catch (e) { /* ignore */ } }
        break;
      }
    }
  }
  function hazards(triggered) {
    const R = AI.R;
    for (const h of triggered) {
      const owner = h.psxOwner;
      if (owner && owner.pp) continue;
      if (h.psxSafe) continue;
      for (const c of alive()) {
        if (!R.Hazards.inside(h, c.x, c.y, c.r || 14)) continue;
        const prev = AI.curAttacker; AI.curAttacker = owner || null;
        try {
          if (h.psxMove && owner) AI.NpcMoves.hit(owner, h.psxMove, c, c.x - h.x, c.y - h.y, 60, false);
          else c.hurt(h.dmg || 10, h.type || 'normal', false, 'spec');
        } finally { AI.curAttacker = prev; }
      }
    }
  }
  // a companion's hit on a wild Pokémon counts like a party member's (the kill is the party's)
  function hurtFoe(victim, dmg, attacker, color, kx, ky, knock) {
    const prevA = AI.curAttacker;
    AI.curAttacker = attacker;
    const env = victim._env;
    victim._env = true; // (kept out of your damage meter)
    try { victim.hurt(dmg, color, kx || 0, ky || 0, knock || 0, null); } finally { victim._env = env; AI.curAttacker = prevA; }
    if (victim.dead) {
      M().feel(attacker.psx, 'joy', 0.3);
      // who was it protecting?
      const vs = victim.psx;
      const t = vs && vs.combat && vs.combat.target;
      if (t && t.pp && t !== attacker) bump(t.pp.key, attacker.pp.key, { trust: 0.05, friend: 0.04, resp: 0.04, shared: 1 });
      if (t === lead()) bump('P', attacker.pp.key, { shared: 1 });
    }
  }

  // ---------------------------------------------------------------- watching what you do
  function watch(dt) {
    const p = lead();
    // you fight on at low health
    if (p.hp < p.maxHp * 0.25 && foesNear(p.x, p.y, 300)) {
      st.riskyT = (st.riskyT || 0) + dt;
      if (st.riskyT > 4 && !st.riskyNoted) { st.riskyNoted = true; st.mem.risky++; react('risky'); }
    } else if (p.hp > p.maxHp * 0.6) { st.riskyT = 0; st.riskyNoted = false; }
  }
  function onBus(ev) {
    if (!st.list.length) return;
    if (ev.type === 'death' && ev.killer === lead()) {
      // you saved a companion from whatever was attacking it
      const t = ev.victim && ev.victim.psx && ev.victim.psx.combat && ev.victim.psx.combat.target;
      if (t && t.pp) {
        st.mem.protected++; bump(t.pp.key, 'P', { trust: 0.07, loyal: 0.05, resp: 0.04, shared: 1 });
        if (t.hp < t.maxHp * 0.35) AI.Bus.emit({ type: 'party-support', what: 'saved', byYou: true, x: t.x, y: t.y, loud: 0 });
        if (Math.random() < 0.5) say(t, 'thanks', { by: lead() });
      }
      if (ev.victim && (ev.victim.boss || ev.victim.legend)) { st.mem.brave++; react('brave'); }
    }
    if (ev.type === 'death' && ev.killer && ev.killer.pp && (ev.victim.boss || ev.victim.elite)) say(ev.killer, 'bigWin');
    // a noise: heads turn toward it
    if (ev.loud >= 150 && ev.x != null) for (const c of alive()) if (Math.hypot(ev.x - c.x, ev.y - c.y) < ev.loud * 1.4 && c.psx) c.psx.lastNoise = { x: ev.x, y: ev.y, t: AI.time };
    if (ev.type === 'journey' && ev.what === 'sound') convo('sound');
    if (ev.type === 'journey' && ev.what === 'silhouette') convo('silhouette');
    if (ev.type === 'journey' && ev.what === 'found') convo('mansion');
    if (ev.type === 'journey' && ev.what === 'crumb') convo('crumb_' + (ev.kind || 'lantern'));
    if (ev.type === 'mansion' && ev.what === 'enter') { setTimeout(() => { followInside(); convo('inside'); }, 600); }
    if (ev.type === 'mansion' && ev.what === 'exit') setTimeout(followOutside, 300);
    if (ev.type === 'wildlife' && ev.what === 'harden' && Math.random() < 0.2) convo('cocoon');
    if (ev.type === 'clue') convo('clue');
    if (ev.type === 'lightning' || (ev.type === 'boom' && ev.thunder)) convo('thunder');
  }
  function followInside() {
    const p = lead();
    alive().forEach((c, i) => { const [x, y] = spotNear(p.x, p.y + 20, i); c.x = x; c.y = y; if (c.psx) { c.psx.px = x; c.psx.py = y; } });
  }
  function followOutside() { followInside(); }

  // ---------------------------------------------------------------- talking
  /* Conversations come from what is actually happening, never every few seconds, never the same
   * exchange twice in a short while, and some moments are left silent on purpose. Lines are written
   * per species and lean on Nature: {mood} picks a variant (scared / bold / warm / dry). */
  const LN = {
    start: {
      char: [['Okay, team! Stay close. My tail will keep us warm.', 'warm'], ['W-wow, this forest is big… let\'s stick together, okay?', 'scared'], ['Let\'s go! Anything that wants a fight, I\'m ready!', 'bold']],
      froa: [['…Lots of tracks around here. Watch your step.', 'dry'], ['I\'ll keep an eye out ahead.', 'warm']],
      spri: [['Mrrr… everything smells so green here.', 'warm'], ['Don\'t expect me to carry anybody.', 'dry'], ['Ooh, what\'s over there? And there?', 'bold']],
    },
    night: {
      char: [['It\'s getting dark… everyone stay near my tail.', 'warm'], ['Is… is everyone still here? Just checking.', 'scared'], ['Night\'s no problem. I\'ve got a light!', 'bold']],
      froa: [['It\'s harder to see. Listen instead.', 'dry'], ['Night Pokémon will be out now.', 'warm']],
      spri: [['My eyes are fine in the dark. Mostly.', 'dry'], ['It\'s so quiet at night… I don\'t love it.', 'scared']],
    },
    rain: {
      char: [['Ugh, rain… don\'t worry, my flame won\'t go out. Probably.', 'warm'], ['R-rain! Stay away from my tail!', 'scared']],
      froa: [['Rain. Finally.', 'dry'], ['Mm. I like this weather.', 'warm']],
      spri: [['My fur is getting wet… this is the worst.', 'dry'], ['The plants love this. I guess that\'s nice.', 'warm']],
    },
    thunder: {
      char: [['Eek! That was close!', 'scared'], ['Whoa! Did you see that?!', 'bold']],
      froa: [['Counting the seconds… it\'s moving away.', 'dry']],
      spri: [['I wasn\'t scared. That was a sneeze.', 'dry'], ['Mrrow! Make it stop!', 'scared']],
    },
    fog: {
      froa: [['Can\'t see much. Stay where I can hear you.', 'dry']],
      char: [['I can barely see my own tail…', 'scared']],
      spri: [['The fog smells… old. Like a cellar.', 'warm']],
    },
    chest: {
      char: [['Hey! Over here! A treasure chest!', 'warm'], ['Look, look! A chest! Let\'s open it!', 'bold']],
      froa: [['Chest over here. Unopened.', 'dry'], ['Found something. You\'ll want this.', 'warm']],
      spri: [['Mine! …I mean, ours. Look, a chest!', 'bold'], ['Something shiny over here. You can open it.', 'dry']],
    },
    bigchest: {
      char: [['Whoa, that one\'s HUGE! Come look!', 'bold']],
      froa: [['That\'s a big one. Careful, could be guarded.', 'dry']],
      spri: [['Now THAT is a chest worth finding.', 'warm']],
    },
    tracks: {
      froa: [['Tracks. Fresh ones. Something passed here not long ago.', 'dry'], ['Footprints… they lead that way.', 'warm']],
    },
    treeMon: {
      froa: [['Up in that tree. Something\'s watching us.', 'dry'], ['Don\'t look now, but there\'s a Pokémon up there.', 'warm']],
    },
    plant: {
      spri: [['This smells nice! Can I keep it?', 'warm'], ['Hm. That plant shouldn\'t grow here.', 'dry'], ['Ooh, berries! Look!', 'bold']],
    },
    clue: {
      spri: [['Wait. Something\'s strange about this spot.', 'dry'], ['Smell that? Something was here. Something big.', 'warm']],
      froa: [['That\'s not natural. Someone, or something, did that.', 'dry']],
      char: [['Um… what IS that?', 'scared']],
    },
    sound: {
      char: [['D-did you hear that?', 'scared'], ['What was that? Show yourself!', 'bold']],
      froa: [['Quiet. Something\'s out there.', 'dry']],
      spri: [['My ears don\'t like that sound.', 'scared'], ['That came from over there.', 'warm']],
    },
    silhouette: {
      char: [['There was someone between the trees… wasn\'t there?', 'scared']],
      froa: [['Saw it too. It was watching us.', 'dry']],
      spri: [['Mrrow… it vanished. Things don\'t just vanish.', 'warm']],
    },
    crumb_lantern: {
      spri: [['An old lantern. Who would put a lantern out here?', 'warm']],
      froa: [['That lantern\'s been here a long time. Someone used to walk this way.', 'dry']],
      char: [['A lantern! Maybe there\'s a house nearby?', 'warm']],
    },
    crumb_fence: {
      spri: [['Huh? What\'s a fence doing all the way out here?', 'warm']],
      froa: [['Looks old. Whatever it was protecting has probably been abandoned for years.', 'dry']],
      char: [['Maybe… maybe we should turn around?', 'scared'], ['A fence? Let\'s find out what\'s behind it.', 'bold']],
    },
    crumb_sign: {
      froa: [['The sign\'s too worn to read. It points that way.', 'dry']],
      spri: [['A sign to nowhere. Creepy.', 'warm']],
      char: [['Should we follow it?', 'scared']],
    },
    mansion: {
      char: [['Th-that\'s a house. In the middle of the forest. That\'s… fine. Totally fine.', 'scared'], ['A mansion! Bet there\'s treasure inside!', 'bold']],
      froa: [['The forest went quiet. Notice that?', 'dry']],
      spri: [['Ooh. I want to see the gate up close.', 'bold'], ['I don\'t like how that house is looking at us.', 'scared']],
    },
    inside: {
      char: [['It\'s so cold in here… my flame\'s flickering.', 'scared'], ['Stay behind me, everyone.', 'bold']],
      froa: [['Dust everywhere. But the floor is clear. Someone walks here.', 'dry']],
      spri: [['This place smells like old books and… something else.', 'warm']],
    },
    cocoon: {
      spri: [['That Kakuna just glared at me. I swear.', 'warm']],
      char: [['Shh, let it sleep. It\'s about to evolve, I think.', 'warm']],
    },
    down: {
      char: [['NO! {who}! Hang on, I\'m coming!', 'bold'], ['{who}?! Somebody help!', 'scared']],
      froa: [['{who} is down. Cover me.', 'dry']],
      spri: [['{who}! Get up, you big dummy!', 'warm'], ['Mrrow… {who}…', 'scared']],
    },
    revived: {
      char: [['Thanks, {by}. I owe you one.', 'warm']],
      froa: [['…Thanks, {by}.', 'dry']],
      spri: [['I wasn\'t really out. But… thanks, {by}.', 'dry']],
    },
    revivedByYou: {
      char: [['You came back for me! Thank you!', 'warm']],
      froa: [['You came back. I won\'t forget that.', 'dry']],
      spri: [['…You didn\'t have to do that. But I\'m glad you did.', 'warm']],
    },
    gotUp: {
      char: [['Ow… okay. I\'m okay. I\'m okay!', 'scared']],
      froa: [['Back on my feet.', 'dry']],
      spri: [['Nobody saw that. Right?', 'dry']],
    },
    low: {
      char: [['I\'m hurt… I need a second!', 'scared'], ['I can still fight!', 'bold']],
      froa: [['Taking a lot of hits here.', 'dry']],
      spri: [['Ow, ow, ow! Help!', 'scared']],
    },
    berry: {
      char: [['Here, eat this! It\'ll help!', 'warm']],
      froa: [['Berry. Eat.', 'dry']],
      spri: [['Fine, you can have my berry. Just this once.', 'dry']],
    },
    thanks: {
      char: [['Phew! Thanks for the save!', 'warm']],
      froa: [['Good timing.', 'dry']],
      spri: [['I had it handled. …Thanks.', 'dry']],
    },
    light: {
      char: [['Stay close to me, it\'s dark. My tail will light the way.', 'warm'], ['I-I\'ll go first with the light… right behind you.', 'scared']],
    },
    hesitate_dark: {
      char: [['It\'s really dark up there… is everyone still nearby?', 'scared']],
      froa: [['Wait. Let my eyes adjust.', 'dry']],
      spri: [['I\'m not going first. You go first.', 'scared']],
    },
    hesitate_mansion: {
      char: [['Do we really have to go in there?', 'scared']],
      froa: [['Hold on. Something about this place is wrong.', 'dry']],
      spri: [['I\'m just… looking at the gate. From here.', 'scared']],
    },
    hesitate_ghost: {
      char: [['G-g-ghost!', 'scared']],
      froa: [['Ghost-type. Don\'t let it get behind you.', 'dry']],
      spri: [['Mrrow! It went right through the tree!', 'scared']],
    },
    reassure: {
      char: [['It\'s okay, {scared}. I\'m right here.', 'warm'], ['Stay behind me, {scared}. I\'ve got this.', 'bold']],
      froa: [['Breathe, {scared}. I\'m watching your back.', 'dry']],
      spri: [['Calm down, {scared}. It\'s fine. Probably.', 'dry']],
    },
    rash: {
      froa: [['Seriously, {who}? We were sneaking past that one.', 'dry']],
      spri: [['Great, {who}. Now it\'s mad. Thanks a lot.', 'dry']],
      char: [['{who}, wait! We didn\'t have to fight that!', 'warm']],
    },
    risky: {
      char: [['You\'re hurt! Fall back, we\'ll cover you!', 'warm']],
      froa: [['You\'re pushing too hard. Pull back.', 'dry']],
      spri: [['You\'re going to get us all knocked out! Back off!', 'dry']],
    },
    brave: {
      char: [['That was AMAZING! You were so brave!', 'warm']],
      froa: [['…Well fought.', 'dry']],
      spri: [['Okay, fine. That was impressive.', 'warm']],
    },
    bigWin: {
      char: [['Yes! Did you see that?!', 'bold']],
      froa: [['Done.', 'dry']],
      spri: [['Too easy. Mrrrr.', 'bold']],
    },
    abandoned: {
      char: [['You… left me back there.', 'scared']],
      froa: [['Remind me not to fall behind again.', 'dry']],
      spri: [['Nice of you to wait. Oh wait, you didn\'t.', 'dry']],
    },
    burnLog: {
      char: [['Stand back! I\'ll burn it clear!', 'bold'], ['Leave it to me… Ember!', 'warm'], ['I-I think I can burn through it…', 'scared']],
    },
    tease: {
      spri: [['Taking your time there, {who}? Should I bring you a snack?', 'warm']],
    },
    join: {
      char: [['Hi! Mind if I tag along?', 'warm']],
      froa: [['I\'m with you.', 'dry']],
      spri: [['I suppose I\'ll come along.', 'dry']],
    },
    leave: {
      char: [['Looks like you\'ve got a full team now! Good luck, everyone!', 'warm']],
      froa: [['You\'ve got company. I\'ll scout elsewhere.', 'dry']],
      spri: [['More friends? Fine. I was getting tired anyway.', 'dry']],
    },
    lost: {
      spri: [['Did you hear that? Someone\'s crying… over there!', 'warm']],
      char: [['Someone\'s calling for help! We have to go!', 'bold']],
      froa: [['A call for help. Could be a trap. Could be real.', 'dry']],
    },
    helpedLost: {
      char: [['We helped them! That felt good.', 'warm']],
      froa: [['Good call, helping out.', 'dry']],
      spri: [['…That was nice of you. Don\'t let it go to your head.', 'warm']],
    },
    ignoredLost: {
      char: [['Shouldn\'t we have helped them…?', 'scared']],
      froa: [['We walked right past someone who needed help.', 'dry']],
      spri: [['Cold. Even for you.', 'dry']],
    },
    silence: {
      froa: [['…The birds stopped singing.', 'dry']],
      spri: [['Why is it so quiet all of a sudden?', 'scared']],
      char: [['Guys… I don\'t like this.', 'scared']],
    },
    campsite: {
      froa: [['Someone camped here. The ashes are still warm.', 'dry']],
      spri: [['Ooh, someone left their stuff! Finders keepers?', 'bold']],
      char: [['Other explorers came through here… I wonder where they went.', 'warm']],
    },
    voices: {
      char: [['Hello?! Is somebody there?!', 'bold']],
      spri: [['That voice… it\'s coming from everywhere at once.', 'scared']],
      froa: [['Don\'t answer it.', 'dry']],
    },
    lights: {
      spri: [['Pretty lights! Can we follow them?', 'bold']],
      froa: [['Those lights are moving against the wind.', 'dry']],
      char: [['Are those… Pokémon? Or something else?', 'scared']],
    },
    fallen: {
      froa: [['Tree came down. We\'ll go around.', 'dry']],
      char: [['Whoa! That tree almost fell on us!', 'scared']],
      spri: [['I could climb over that. You probably can\'t.', 'dry']],
    },
    marker: {
      froa: [['Carved stone. Old. Older than the trees here.', 'dry']],
      spri: [['Someone scratched symbols into this tree. They look like eyes.', 'warm']],
      char: [['Do you think someone left these for us?', 'scared']],
    },
    letter: {
      spri: [['A letter! "…the house lets you in, but it never lets you leave the same." Creepy.', 'warm']],
      froa: [['Water-stained. Most of it is gone.', 'dry']],
      char: [['Who wrote this? Are they… okay?', 'scared']],
    },
    statue: {
      froa: [['A statue of a Gengar. Overgrown. Its grin is still there though.', 'dry']],
      char: [['I swear its eyes followed me.', 'scared']],
      spri: [['Somebody made a statue of a ghost. In the woods. Normal.', 'warm']],
    },
  };
  // which variant suits this companion right now (its Nature and its mood)
  function moodOf(c) {
    const s = c.psx, nx = (s && s.pers.nx) || {};
    const fear = s ? s.mind.emo.fear : 0;
    if (fear > 0.45 || (nx.caution > 0.72 && s.pers.tr.bravery < 0.45)) return 'scared';
    if (s && s.pers.tr.bravery > 0.68 && fear < 0.3) return 'bold';
    if ((nx.talk || 0.5) < 0.35 || c.pp.key === 'froa') return 'dry';
    return 'warm';
  }
  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (m, k) => {
      const v = vars && vars[k];
      if (!v) return '';
      return typeof v === 'string' ? v : v === lead() ? 'you' : v.talkName || v.name || (AI.R.DEX_BY[v.dex] || {}).name || '';
    }).replace(/\s+([,.!?])/g, '$1');
  }
  function lineFor(c, ctx, vars) {
    const set = LN[ctx] && LN[ctx][c.pp.key];
    if (!set || !set.length) return null;
    const mood = moodOf(c);
    const pool = set.filter((l) => l[1] === mood);
    const pick = (pool.length ? pool : set);
    const used = c.pp.said[ctx] || 0;
    let text = fill(pick[used % pick.length][0], vars);
    // (a substitute speaks in its own voice: no cat noises from a Rowlet)
    if (c.dex !== 906) text = text.replace(/\bM+r+o*w*r*[!…,.]*\s*/gi, '').replace(/^\s*(\.\.\.|…)\s*$/, '…');
    if (c.dex !== 4 && c.dex !== 390) text = text.replace(/my tail/gi, 'my flame');
    return text || null;
  }
  function quiet() {
    // unsettling moments are left silent: deep in the house's shadow, during a haunting
    const mk = mansionK();
    return (AI.Haunt && AI.Haunt.hs && AI.Haunt.hs.jump) || (AI.Story && AI.Story.busy()) || mk > 0.92;
  }
  function say(c, ctx, vars, force) {
    if (!c || !c.pp || !AI.Talk || AI.cfg.partyTalk === false) return false;
    if (!force && (quiet() || (c.pp.said[ctx + 'T'] || -99) > AI.time - 45)) return false;
    // a quiet Nature says less
    const talk = (c.psx && c.psx.pers.nx && c.psx.pers.nx.talk) || 0.5;
    if (!force && Math.random() > 0.45 + talk * 0.7) return false;
    const text = lineFor(c, ctx, vars);
    if (!text) return false;
    c.pp.said[ctx] = (c.pp.said[ctx] || 0) + 1;
    c.pp.said[ctx + 'T'] = AI.time;
    AI.Talk.party(speakerOf(c), text, { emo: emoFor(c, ctx) });
    if (c.psx) M().say(c.psx, ctx === 'chest' || ctx === 'bigchest' ? 'surprise' : moodOf(c) === 'scared' ? 'scared' : 'dots', 1.2, 0.5);
    st.lastTalk = AI.time;
    return true;
  }
  function speakerOf(c) { return { dex: c.dex, name: c.talkName, key: 'cp:' + c.pp.key, col: c.col, voice: U.clamp(640 - (c.bodyH || 40) * 4, 200, 620), bodyH: c.bodyH, kind: 'party', id: c.id }; }
  function emoFor(c, ctx) {
    const m = moodOf(c);
    if (/^(down|low|hesitate|silhouette|sound|ignoredLost|abandoned)/.test(ctx)) return m === 'bold' ? 'Determined' : 'Worried';
    if (/^(chest|bigchest|brave|bigWin|revived|helpedLost)/.test(ctx)) return 'Happy';
    if (ctx === 'rash' || ctx === 'risky') return 'Angry';
    if (m === 'scared') return 'Worried';
    return null;
  }
  // a short exchange: whoever has the most reason to speak first, then maybe a reply or two
  const CONVO_CD = { start: 9999, night: 400, rain: 300, thunder: 90, fog: 300, sound: 60, silhouette: 120, mansion: 9999, inside: 9999, cocoon: 200, down: 20, clue: 60 };
  function convo(ctx, vars) {
    if (!AI.Talk || AI.cfg.partyTalk === false || !alive().length) return;
    st.convoAt = st.convoAt || {};
    const cd = CONVO_CD[ctx] != null ? CONVO_CD[ctx] : 90;
    if (st.convoAt[ctx] && AI.time - st.convoAt[ctx] < cd) return;
    if (ctx !== 'down' && st.lastConvo && AI.time - st.lastConvo < 14) return;
    if (quiet() && ctx !== 'down') return;
    st.convoAt[ctx] = AI.time;
    st.lastConvo = AI.time;
    const who = alive().filter((c) => LN[ctx] && LN[ctx][c.pp.key] && c !== (vars && vars.who));
    if (!who.length) return;
    // the one whose senses or Nature make it speak first
    who.sort((a, b) => first(b, ctx) - first(a, ctx));
    const n = Math.min(who.length, ctx === 'down' ? 2 : Math.random() < 0.55 ? 2 : Math.random() < 0.5 ? 3 : 1);
    who.slice(0, n).forEach((c, i) => setTimeout(() => say(c, ctx, vars, i === 0), 400 + i * 2600));
  }
  function first(c, ctx) {
    const s = c.psx, nx = (s && s.pers.nx) || {};
    let v = (nx.talk || 0.5) + Math.random() * 0.4;
    if ((ctx === 'sound' || ctx === 'tracks' || ctx === 'silence' || ctx === 'mansion') && c.pp.key === 'froa') v += 0.6;
    if ((ctx === 'plant' || ctx === 'crumb_fence' || ctx === 'crumb_lantern') && c.pp.key === 'spri') v += 0.6;
    if ((ctx === 'night' || ctx === 'light') && c.pp.key === 'char') v += 0.6;
    return v;
  }
  // a reaction from whoever it concerns
  function react(kind, who, vars) {
    if (kind === 'rash') {
      const others = alive().filter((c) => c !== who);
      for (const o of others) bump(o.pp.key, who.pp.key, { irr: 0.1, trust: -0.02 });
      const o = others.sort((a, b) => rel(b.pp.key, who.pp.key).irr - rel(a.pp.key, who.pp.key).irr)[0];
      if (o) say(o, 'rash', { who });
      return;
    }
    if (kind === 'reassure') { say(who, 'reassure', vars); if (vars && vars.scared) bump(vars.scared.pp.key, who.pp.key, { friend: 0.08, trust: 0.05 }); return; }
    if (kind === 'risky' || kind === 'brave') {
      st.reactAt = st.reactAt || {};
      if (st.reactAt[kind] && AI.time - st.reactAt[kind] < 150) return;
      st.reactAt[kind] = AI.time;
      const c = alive().sort((a, b) => rel(b.pp.key, 'P').friend - rel(a.pp.key, 'P').friend)[0];
      if (c) { say(c, kind, null, true); bump(c.pp.key, 'P', kind === 'brave' ? { resp: 0.08, conf: 0.05 } : { fear: 0.04 }); }
    }
  }
  // timed remarks: the weather, nightfall, a teammate that keeps lagging behind
  function tickTalk(dt) {
    st.talkT = (st.talkT || 0) - dt;
    if (st.talkT > 0) return;
    st.talkT = 4;
    if (!st.started && AI.time - st.startT > 3) { st.started = true; convo('start'); return; }
    const S = AI.Sky;
    if (!S || (AI.Mansion && AI.Mansion.inside)) return;
    const night = S.darkness() > 0.7;
    if (night && !st.wasNight) convo('night');
    st.wasNight = night;
    const raining = S.rain > 0.45;
    if (raining && !st.wasRain) convo('rain');
    st.wasRain = raining;
    const fog = S.fog > 0.6;
    if (fog && !st.wasFog) convo('fog');
    st.wasFog = fog;
    // the abandoned one remembers
    if (st.mem.abandoned > (st.abandonSaid || 0)) {
      const ev = [...st.mem.events].reverse().find((x) => x.what === 'abandoned');
      const c = ev && st.list.find((q) => q.pp.key === ev.o.key && !q.dead);
      if (c) { st.abandonSaid = st.mem.abandoned; setTimeout(() => say(c, 'abandoned', null, true), 1500); }
    }
    // banter: someone dawdling gets teased by Sprigatito (if they get along well enough)
    const sp = st.list.find((c) => c.pp.key === 'spri' && !c.dead);
    if (sp && Math.random() < 0.08) {
      const slow = alive().find((c) => c !== sp && c.psx && c.psx.beh && c.psx.beh.id === 'party-explore' && c.psx.behT > 6);
      if (slow && rel('spri', slow.pp.key).friend > 0.25) { say(sp, 'tease', { who: slow }); bump(slow.pp.key, 'spri', { irr: 0.03, friend: 0.02 }); }
    }
  }
  function announce(e, n) {
    if (!n) return;
    const ctx = n.kind;
    if (!say(e, ctx, null, ctx === 'chest' || ctx === 'bigchest') && (ctx === 'chest' || ctx === 'bigchest')) M().say(e.psx, 'surprise', 1.6, 2);
  }

  // ---------------------------------------------------------------- drawing
  function drawables(list, cam) {
    for (const c of st.list) if (cam.sees(c.x, c.y, 80)) list.push(c);
    for (const g of st.guests.values()) if (cam.sees(g.x, g.y, 80)) list.push(g);
    return list;
  }
  // over each companion: its name, an "AI" tag, and its health when hurt; a ring while being revived
  function drawAir(ctx) {
    if (!AI.enabled) return;
    const all = [...st.list, ...st.guests.values()];
    for (const c of all) {
      if (!AI.R.Camera.sees(c.x, c.y, 60)) continue;
      const lift = (c.psx && c.psx.vis && (c.psx.vis.hopLift || 0)) || 0;
      const y = c.y - (c.bodyH || 40) - 16 - lift;
      ctx.save();
      ctx.globalAlpha = c.psxFade != null ? c.psxFade : 1;
      ctx.font = '700 8px Pixelify, "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';
      const name = c.talkName || c.name;
      const tw = ctx.measureText(name).width;
      const w = tw + 20;
      ctx.fillStyle = 'rgba(10,14,28,0.6)';
      ctx.fillRect(Math.round(c.x - w / 2), Math.round(y - 5), Math.round(w), 10);
      ctx.fillStyle = c.col || '#9ab0ff';
      ctx.fillText(name, Math.round(c.x - w / 2 + 2), Math.round(y));
      ctx.fillStyle = '#b8c0d8';
      ctx.fillRect(Math.round(c.x + w / 2 - 15), Math.round(y - 3.5), 13, 7);
      ctx.fillStyle = '#1a2038';
      ctx.font = '700 6px Pixelify, "Segoe UI", sans-serif';
      ctx.fillText('AI', Math.round(c.x + w / 2 - 12.5), Math.round(y + 0.5));
      const hp = c.pp && c.pp.downed ? 0 : c.hp / Math.max(1, c.maxHp);
      if (hp < 0.999 || (c.pp && c.pp.downed)) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(Math.round(c.x - 14), Math.round(y + 6), 28, 3);
        ctx.fillStyle = hp > 0.5 ? '#6fdc78' : hp > 0.25 ? '#ffd24a' : '#ff6a5a';
        ctx.fillRect(Math.round(c.x - 14), Math.round(y + 6), Math.round(28 * hp), 3);
      }
      if (c.pp && c.pp.downed) {
        const k = c.pp.revive / 2.4;
        ctx.strokeStyle = 'rgba(126,224,138,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y - 10, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
        if (k <= 0 && Math.sin(AI.time * 4) > 0) { ctx.fillStyle = '#ffe28a'; ctx.font = '700 8px Pixelify, "Segoe UI", sans-serif'; ctx.fillText('!', c.x - 2, c.y - 34); }
      }
      ctx.restore();
    }
  }
  // the party panel under the clock: portrait, name, Nature, health, and that it's AI
  function drawHud(ctx, w, h) {
    if (!AI.enabled || AI.cfg.pseudoPlayers === false) return;
    const all = st.list.length ? st.list : [...st.guests.values()];
    if (!all.length) return;
    const x = 12;
    let y = 64;
    ctx.save();
    for (const c of all) {
      const bw = 150, bh = 30;
      ctx.globalAlpha = c.psxFade != null ? c.psxFade : 1;
      ctx.fillStyle = 'rgba(10,14,28,0.62)';
      ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.arcTo(x + bw, y, x + bw, y + bh, 8); ctx.arcTo(x + bw, y + bh, x, y + bh, 8); ctx.arcTo(x, y + bh, x, y, 8); ctx.arcTo(x, y, x + bw, y, 8); ctx.fill();
      const img = AI.Talk && AI.Talk.portrait(c.dex, c.pp && c.pp.downed ? 'Pain' : c.psx && c.psx.mind.emo.fear > 0.5 ? 'Worried' : 'Normal');
      ctx.fillStyle = '#22264a'; ctx.fillRect(x + 4, y + 3, 24, 24);
      if (img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, x + 4, y + 3, 24, 24); }
      if (c.pp && c.pp.downed) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 4, y + 3, 24, 24); }
      ctx.font = '700 10px Pixelify, "Segoe UI", sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillStyle = c.col || '#eaf2ff';
      ctx.fillText(c.talkName || c.name, x + 33, y + 3);
      const nat = c.pp ? AI.Natures.nameOf(c.pp.nature) : '';
      ctx.fillStyle = '#9aa6c0';
      ctx.font = '600 8px Pixelify, "Segoe UI", sans-serif';
      ctx.fillText(nat, x + 33 + ctx.measureText(c.talkName || c.name).width * 1.25 + 4, y + 5);
      // AI badge
      ctx.fillStyle = '#b8c0d8'; ctx.fillRect(x + bw - 20, y + 4, 15, 9);
      ctx.fillStyle = '#1a2038'; ctx.font = '700 7px Pixelify, "Segoe UI", sans-serif'; ctx.fillText('AI', x + bw - 17, y + 5);
      const hp = c.pp && c.pp.downed ? 0 : c.hp / Math.max(1, c.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x + 33, y + 17, bw - 40, 7);
      ctx.fillStyle = hp > 0.5 ? '#6fdc78' : hp > 0.25 ? '#ffd24a' : '#ff6a5a';
      ctx.fillRect(x + 33, y + 17, Math.round((bw - 40) * hp), 7);
      if (c.pp && c.pp.downed) { ctx.fillStyle = '#ffe28a'; ctx.font = '700 7px Pixelify, "Segoe UI", sans-serif'; ctx.fillText('DOWN · stand next to it', x + 35, y + 17); }
      y += bh + 4;
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- co-op: the host runs them, everyone sees them
  function broadcast() {
    const R = AI.R;
    try {
      R.Net.broadcast({ k: 'psx', t: 'party', l: st.list.map((c) => ({ k: c.pp.key, d: c.dex, x: Math.round(c.x), y: Math.round(c.y), r: c.anim ? c.anim.dir : 0, a: c.pp.downed ? 'Faint' : c.anim && c.anim.cur || 'Idle', h: Math.round(c.hp), m: Math.round(c.maxHp), n: c.pp.nature, dn: c.pp.downed ? 1 : 0 })) });
    } catch (e) { /* ignore */ }
  }
  function onNet(from, msg) {
    if (!msg || msg.k !== 'psx' || msg.t !== 'party' || !isGuest()) return;
    const R = AI.R;
    const seen = new Set();
    for (const o of msg.l || []) {
      seen.add(o.k);
      let g = st.guests.get(o.k);
      if (!g) {
        const d = R.DEX_BY[o.d] || { name: '?' };
        g = new R.Enemy({ dex: o.d, name: d.name, hp: 100, spd: 100, dmg: 0, xp: 0, behavior: 'chase' }, o.x, o.y, { hp: 1, spd: 1, dmg: 1 });
        g.psxSkip = true; g.talkName = d.name; g.col = (BASE[o.d] || BASE[4]).col; g.pp = { key: o.k, dex: o.d, nature: o.n, downed: null, revive: 0 };
        st.guests.set(o.k, g);
      }
      g.tx = o.x; g.ty = o.y; g.hp = o.h; g.maxHp = o.m; g.pp.downed = o.dn ? { t: 0 } : null; g.pp.nature = o.n;
      try { if (g.anim.cur !== o.a) (o.a === 'Faint' ? g.anim.play('Faint', { hold: true }) : g.anim.loop(o.a)); g.anim.dir = o.r; } catch (e) { /* ignore */ }
      g.seenAt = AI.time;
    }
    for (const k of [...st.guests.keys()]) if (!seen.has(k)) st.guests.delete(k);
  }
  function tickGuest(dt) {
    for (const g of st.guests.values()) {
      if (g.tx != null) { g.x += (g.tx - g.x) * Math.min(1, dt * 10); g.y += (g.ty - g.y) * Math.min(1, dt * 10); }
      try { g.anim.update(dt); } catch (e) { /* ignore */ }
      if (AI.time - (g.seenAt || 0) > 3) st.guests.delete(g.pp.key);
    }
  }

  // ---------------------------------------------------------------- the run: start, save, resume
  const SAVE = 'psx.party.v1';
  function save() {
    try { localStorage.setItem(SAVE, JSON.stringify({ seed: st.seed, rel: st.rel, mem: st.mem, list: st.list.map((c) => ({ dex: c.dex, nature: c.pp.nature, hp: c.hp, x: c.x, y: c.y })) })); } catch (e) { /* ignore */ }
  }
  function reset(seed) {
    for (const c of st.list.slice()) remove(c);
    st.list.length = 0; st.guests.clear(); noticed.clear();
    st.seed = seed >>> 0; st.rel = {}; st.mem = mem0(); st.startT = AI.time; st.started = false; st.allocT = 0.5;
    st.lastConvo = 0; st.convoAt = {}; st.reactAt = {}; st.wasNight = st.wasRain = st.wasFog = false; st.abandonSaid = 0;
    // resuming the same run: the same companions, with what they remember
    try {
      const sv = JSON.parse(localStorage.getItem(SAVE) || 'null');
      if (sv && sv.seed === st.seed && AI.R && AI.R.Game && AI.R.Game.player) {
        st.rel = sv.rel || {}; st.mem = Object.assign(mem0(), sv.mem || {}); st.started = true;
        st.pending = sv.list || null;
      } else st.pending = null;
    } catch (e) { st.pending = null; }
  }
  // (called once the player exists after a reset)
  function restorePending() {
    if (!st.pending || isGuest()) return;
    const p = lead();
    for (const o of st.pending) if (BASE[o.dex]) spawn(o.dex, Object.assign({}, o, { x: null, y: null }));
    st.pending = null;
    void p;
  }

  AI.Bus.on('*', onBus);
  addBehaviors();

  AI.define('Companions', {
    st, ROSTER, SUBST, BASE, KEY, LN, roster, list, alive, tick, reset, think, okFor, hurtFoe, hazards, drawables, drawAir, drawHud, onNet,
    rel, bump, allocate, choose, spawn, dismiss, say, convo, react, restorePending, humans, isGuest, moodOf, lineFor, leash, down, getUp,
    get mem() { return st.mem; },
  });
})();
