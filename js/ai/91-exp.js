/* PokéSurvivor+ — Living World AI · EXP for more than fighting
 * Discovery, travel, curiosity, kindness and teamwork level you up too, next to (not instead of)
 * battles. Rewards are measured in "a wild Pokémon's worth" (about what one common battle gives at
 * your level), so they stay in proportion as you grow:
 *   exploring  new ground reached on foot (never twice, never standing still, never by running in
 *              circles), distance milestones, each kind of place the first time (a clearing, an
 *              ancient grove, the wetwood, the deep forest, the lake shore), special places, the
 *              mansion's route and its door
 *   treasure   chests by rarity, more for a hidden one off the beaten path; each chest pays once
 *   Pokémon    befriending a wild Pokémon, sparing a beaten one, watching wildlife go about its life
 *   teamwork   helping a fallen companion up, saving a hurt one, the companions' own rescues
 *   the world  clues, confirmed mysteries, the old lanterns and fences on the way, forest events
 * A rolling limit keeps it from being farmed: past it, rewards shrink to a quarter.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const CELL = 400;
  const WINDOW = 300, CAP = 40; // units per 5 minutes before rewards shrink
  const st = { cells: new Set(), kinds: new Set(), places: new Set(), once: new Set(), counts: {}, cd: {}, recent: [], newGround: 0, nextMile: 3000, last: null, cellT: 0, total: 0, log: [] };

  function on() { return AI.enabled && AI.cfg.exploreExp !== false; }
  function player() { return AI.R && AI.R.Game && AI.R.Game.player; }
  // one unit ≈ what a common wild Pokémon is worth at your level
  function unit() { const p = player(); return Math.max(3, ((p && p.xpNext) || 60) * 0.06); }
  function windowUnits() {
    const t = AI.time;
    while (st.recent.length && t - st.recent[0].t > WINDOW) st.recent.shift();
    return st.recent.reduce((a, r) => a + r.u, 0);
  }
  // give `u` units for `why` (once per `key` if given; at most `max` times for its kind)
  function give(u, why, o) {
    o = o || {};
    if (!on() || !(u > 0)) return 0;
    const p = player();
    if (!p || p.dead) return 0;
    if (o.key) { if (st.once.has(o.key)) return 0; st.once.add(o.key); }
    if (o.kind && o.max != null) { const n = st.counts[o.kind] || 0; if (n >= o.max) return 0; st.counts[o.kind] = n + 1; }
    if (o.cd) { const k = o.kind || why; if ((st.cd[k] || -1e9) > AI.time) return 0; st.cd[k] = AI.time + o.cd; }
    const k = windowUnits() > CAP ? 0.25 : 1;
    const xp = Math.max(1, Math.round(u * unit() * k));
    st.recent.push({ t: AI.time, u: u * k });
    st.total += xp;
    st.log.push({ t: AI.time, why, xp });
    if (st.log.length > 60) st.log.shift();
    try { p.gainXp(xp); } catch (e) { AI.warn('exp', e); }
    try { AI.R.FX.dmgText(p.x, p.y - (p.bodyH || 40) - 30, '+' + xp + ' EXP', '#9fe8ff', true); } catch (e) { /* ignore */ }
    if (o.toast) try { (AI.say || AI.R.Spawner.say)(o.toast, 2.6, 1); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'exp', why, xp, x: p.x, y: p.y, loud: 0 });
    return xp;
  }

  // ---------------------------------------------------------------- exploring on foot
  const KIND_NAME = { clear: 'a sunlit clearing', grove: 'an ancient grove', wet: 'the wetwood', deep: 'the deep forest', lake: 'the lake shore' };
  function tick(dt) {
    if (!on()) return;
    const R = AI.R, p = player();
    if (!p || p.dead || R.Game.state !== 'playing') return;
    if (AI.Mansion && AI.Mansion.inside) { st.last = null; return; }
    // only real travel counts: no teleports, no standing still
    if (st.last) {
      const step = Math.hypot(p.x - st.last[0], p.y - st.last[1]);
      if (step > 200) st.last = null; // (a teleport)
    }
    if (!st.last) { st.last = [p.x, p.y]; return; }
    st.last = [p.x, p.y];
    const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.y / CELL);
    st.cellT -= dt;
    if (!st.cells.has(key)) {
      st.cells.add(key);
      if (st.cells.size > 1) {
        st.newGround += CELL;
        if (st.cellT <= 0) { st.cellT = 2.5; give(0.12, 'new ground'); }
        if (st.newGround >= st.nextMile) { give(1.5, 'distance', { toast: '🧭 ' + Math.round(st.nextMile / 100) / 10 + ' km of new ground explored' }); st.nextMile += 3000 + st.nextMile * 0.5; }
      }
    }
    // a new kind of place, the first time
    if (AI.Forest && AI.Forest.on()) {
      st.kindT = (st.kindT || 0) - dt;
      if (st.kindT <= 0) {
        st.kindT = 0.8;
        const r = AI.Forest.region(p.x, p.y);
        const k = r.clear > 0.7 ? 'clear' : r.grove > 0.75 ? 'grove' : r.wet > 0.75 ? 'wet' : r.deep > 0.8 ? 'deep' : null;
        if (k && !st.kinds.has(k)) { st.kinds.add(k); give(2, 'new place', { toast: '🌲 Discovered ' + KIND_NAME[k] }); }
        const w = AI.Forest.water(p.x, p.y + 40);
        if (w.kind === 'lake' && w.e > -30 && !st.kinds.has('lake')) { st.kinds.add('lake'); give(2, 'new place', { toast: '🌊 Discovered ' + KIND_NAME.lake }); }
        if (r.site && r.siteK > 0.5 && !st.places.has(r.site)) { st.places.add(r.site); give(3, 'special place', { key: 'site:' + r.site }); }
      }
    }
    // watching the wildlife you pass go about its life (once per species and habit)
  }

  // ---------------------------------------------------------------- treasure
  function onBreak(prop) {
    if (!prop || prop._psxXp || (prop.type !== 'chest' && prop.type !== 'bigchest')) return;
    prop._psxXp = true;
    let u = prop.type === 'bigchest' ? 4 : 1.5;
    // hidden away: deep forest, a quiet stretch, well off the paths
    let hidden = false;
    try {
      if (AI.Forest && AI.Forest.on()) {
        const r = AI.Forest.region(prop.x, prop.y);
        hidden = r.deep > 0.6 || AI.Forest.quietAt(prop.x, prop.y) > 0.8 || (AI.Forest.pathDist && AI.Forest.pathDist(prop.x, prop.y) > 600);
      }
    } catch (e) { /* ignore */ }
    if (hidden) u *= 1.5;
    give(u, hidden ? 'hidden chest' : prop.type, { key: 'chest:' + Math.round(prop.x) + ',' + Math.round(prop.y) });
  }

  // ---------------------------------------------------------------- what happens around you
  function onBus(ev) {
    if (!on()) return;
    const p = player();
    switch (ev.type) {
      case 'journey':
        if (ev.what === 'found') give(5, 'the mansion', { key: 'mansion-found', toast: '🏚️ Found the way to the old mansion' });
        if (ev.what === 'crumb' && p && Math.hypot(ev.x - p.x, ev.y - p.y) < 500) give(0.5, 'old trail', { kind: 'crumb', max: 10 });
        break;
      case 'mansion':
        if (ev.what === 'enter') give(6, 'the mansion', { key: 'mansion-entered' });
        break;
      case 'myst':
        if (ev.what === 'clue') give(2, 'a clue', { key: 'clue:' + ev.id + ':' + ev.i });
        if (ev.what === 'sight') give(2, 'a sighting', { key: 'sight:' + ev.id });
        if (ev.what === 'conf' || ev.what === 'won') give(4, 'a mystery', { key: ev.what + ':' + ev.id });
        break;
      case 'wildlife':
        if (ev.e && AI.R.Camera.sees(ev.x, ev.y, 0) && p && Math.hypot(ev.x - p.x, ev.y - p.y) < 420) give(0.5, 'wildlife', { key: 'wl:' + ev.e.dex + ':' + ev.what, kind: 'wildlife', max: 8 });
        break;
      case 'befriend':
        give(1, 'a new friend', { key: 'friend:' + ev.key, kind: 'friend', max: 8 });
        break;
      case 'mercy':
        give(0.6, 'mercy', { kind: 'mercy', max: 6, cd: 20 });
        break;
      case 'party-support':
        give(ev.byYou ? 2 : 0.6, 'teamwork', { kind: ev.byYou ? 'support-you' : 'support', cd: ev.byYou ? 8 : 20 });
        break;
      case 'forest-event':
        if (ev.what === 'done') give(ev.u || 3, 'forest event', { key: 'ev:' + ev.id, toast: ev.toast });
        break;
      case 'lore':
        if (ev.what === 'read') give(1.5, 'a story', { key: 'lore:' + ev.id, kind: 'lore', max: 12 });
        break;
      default: break;
    }
  }

  function reset() {
    st.cells.clear(); st.kinds.clear(); st.places.clear(); st.once.clear();
    st.counts = {}; st.cd = {}; st.recent.length = 0; st.newGround = 0; st.nextMile = 3000; st.last = null; st.total = 0; st.log.length = 0;
  }

  AI.Bus.on('*', onBus);
  AI.define('Exp', { st, tick, give, unit, onBreak, reset, windowUnits, CAP });
})();
