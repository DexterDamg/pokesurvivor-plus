/* PokéSurvivor+ — Living World AI · debug & test helpers
 * Console API used by the scenario tests (tests/ai-scenarios.js) and handy for modding:
 *   PSXAI.Debug.spawn(129, { temp: 'timid', dx: 120 })   → spawn a Magikarp next to you
 *   PSXAI.Debug.info(e)  ·  PSXAI.Debug.freeze(true)  ·  PSXAI.Debug.god(true)
 */
(function () {
  'use strict';
  const AI = window.PSXAI;

  const Debug = {
    noSpawns: false,
    freeze(on = true) { Debug.noSpawns = !!on; },
    god(on = true) { const p = AI.R.Game.player; if (p) p.god = !!on; },
    clear(everything = false) {
      const R = AI.R;
      for (const e of R.EnemyMgr.all().slice()) { if (e.boss && !everything) continue; e.psxSkip = true; e.dead = true; e.fade = 0; }
      // remove immediately so the next frame starts clean
      const all = R.EnemyMgr.all();
      for (let i = all.length - 1; i >= 0; i--) if (all[i].dead && (everything || !all[i].boss)) all.splice(i, 1);
      if (everything) { try { R.Crystal.reset(); R.Weather.clear && R.Weather.clear(); } catch (err) { /* ignore */ } AI.Legend.clear(); AI.Social.clear(); AI.Evolution.resetCooldowns(); }
    },
    spawn(dex, o = {}) {
      const R = AI.R;
      const p = R.Game.player;
      const d = R.DEX_BY[dex] || { name: '?', types: ['normal'] };
      const def = {
        dex, name: d.name,
        hp: o.hp || 120, spd: o.spd || 70, dmg: o.dmg || 9, xp: o.xp || 6,
        behavior: o.behavior || 'chase',
        shotDmg: o.shotDmg || 6, shotCd: 2, range: 220,
      };
      const e = new R.Enemy(def, (o.x != null ? o.x : p.x + (o.dx != null ? o.dx : 160)), (o.y != null ? o.y : p.y + (o.dy || 0)), { hp: 1, spd: 1, dmg: 1 });
      if (o.temp) e.psxForceTemp = o.temp;
      e.psxPlaced = !o.natural; // (placed by hand: not moved out of water it couldn't be in)
      R.EnemyMgr.add(e);
      AI.Brain.init(e);
      const s = e.psx;
      if (o.moves) { s.combat.moves = o.moves.map((id) => AI.NpcMoves.slot(id)).filter(Boolean); }
      if (o.rel) Object.assign(AI.Rel.get(s, 'P'), o.rel);
      if (o.energy != null) s.mind.needs.energy = o.energy;
      if (o.hunger != null) s.mind.needs.hunger = o.hunger;
      if (o.trait) Object.assign(s.pers.tr, o.trait);
      if (o.quirks) for (const q of o.quirks) s.pers.quirks.add(q);
      s.thinkT = 0;
      return e;
    },
    bond(a, b, k = 0.8) {
      AI.Rel.adjust(a.psx, b.id, { b: k, a: k * 0.8 });
      AI.Rel.adjust(b.psx, a.id, { b: k, a: k * 0.8 });
    },
    info(e) {
      const s = e && e.psx;
      if (!s) return null;
      const em = {};
      for (const k in s.mind.emo) if (s.mind.emo[k] > 0.05) em[k] = +s.mind.emo[k].toFixed(2);
      const rp = s.rel.get('P');
      return {
        id: e.id, name: e.name, dex: e.dex, hp: Math.round(e.hp) + '/' + Math.round(e.maxHp), temp: s.pers.temp, stance: s.stance,
        beh: s.lock ? 'LOCK' : s.beh.id, lod: s.lod, emo: em, bubble: (AI.Mind.bubbleFor(s) || {}).icon || null,
        relP: rp ? { a: +rp.a.toFixed(2), f: +rp.f.toFixed(2), g: +rp.g.toFixed(2), b: +rp.b.toFixed(2) } : null,
        combat: s.combat.target ? { target: AI.keyOf(s.combat.target), strat: s.combat.strat, role: s.combat.role } : null,
        moves: s.combat.moves.map((m) => m.id + (m.uses ? '×' + m.uses : '')),
        quirks: [...s.pers.quirks],
      };
    },
  };

  // controlled tests can switch ambient spawning off
  const origAllow = AI.Population.allowAdd;
  AI.Population.allowAdd = function (e) {
    if (Debug.noSpawns && AI.Population.inSpawner() && !e.boss && !e.legend) return false;
    return origAllow(e);
  };

  AI.define('Debug', Debug);
})();
