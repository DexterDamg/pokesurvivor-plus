/* PokéSurvivor+ — Living World AI · areas: who lives where, and when
 * Each area has its own Pokémon. The starting woodland (Bosque Umbrío) gets a curated roster of
 * beginner-friendly forest dwellers: Pidgey, Rattata, Sentret, Caterpie, Weedle, Kakuna, Hoothoot…
 * whose evolutions appear as the run goes on, while rare and powerful Pokémon stay rare (or away).
 * Stats still come from the game's own tiers, so difficulty is unchanged; only who shows up does.
 *
 * Time of day, season and weather decide who is out: Hoothoot and Oddish come out at night, bugs
 * swarm at midday, few Pokémon roam at night or in deep fog. Pokémon prefer habitats (Rattata
 * around fallen logs and burrows, Caterpie in leafy bushes, Pidgey up in the trees) and arrive
 * naturally: from beyond the edge of the screen, or stepping out from behind a tree, down from a
 * branch, out of a bush or a burrow. Disturb a habitat too often and its Pokémon move elsewhere.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  // ---------------------------------------------------------------- species ecology
  // when each species is out and about ('day' | 'night' | 'dusk' | 'any')
  const ACTIVE = {
    16: 'day', 17: 'day', 18: 'day', 21: 'day', 22: 'day', 10: 'day', 11: 'day', 12: 'day', 13: 'day', 14: 'day', 15: 'day',
    161: 'day', 162: 'day', 165: 'day', 166: 'day', 265: 'day', 266: 'day', 267: 'day', 268: 'day', 269: 'night', 396: 'day', 397: 'day', 398: 'day',
    415: 'day', 406: 'day', 25: 'day', 214: 'day', 127: 'day', 123: 'day', 216: 'day', 469: 'day',
    163: 'night', 164: 'night', 43: 'night', 44: 'night', 45: 'night', 182: 'day', 167: 'night', 168: 'night', 48: 'night', 49: 'night',
    41: 'night', 42: 'night', 169: 'night', 92: 'night', 93: 'night', 94: 'night', 198: 'night', 430: 'night', 200: 'night', 302: 'night',
    401: 'dusk', 402: 'dusk', 313: 'night', 314: 'night', 19: 'any', 20: 'any', 263: 'any', 264: 'any', 399: 'any', 400: 'any',
    46: 'any', 47: 'any', 69: 'any', 70: 'any', 71: 'any', 29: 'any', 30: 'any', 32: 'any', 33: 'any', 285: 'any', 286: 'any',
    114: 'any', 465: 'any', 217: 'any', 275: 'night', 274: 'any', 273: 'day',
  };
  // favourite places: 'log' (fallen logs, stumps), 'bush' (leafy bushes, undergrowth), 'berry',
  // 'tree' (trunks and branches), 'burrow', 'grass' (open clearings), 'mush' (mushrooms)
  const HABITAT = {
    19: ['log', 'burrow'], 20: ['log', 'burrow'], 161: ['grass', 'burrow'], 162: ['grass', 'burrow'], 263: ['log', 'grass'], 264: ['log', 'grass'],
    399: ['log', 'grass'], 400: ['log'], 29: ['grass', 'burrow'], 32: ['grass', 'burrow'], 30: ['grass'], 33: ['grass'],
    10: ['bush'], 11: ['bush'], 12: ['bush', 'grass'], 13: ['bush'], 14: ['bush', 'tree'], 15: ['bush', 'tree'], 265: ['bush'], 266: ['bush', 'tree'],
    267: ['grass', 'bush'], 268: ['bush', 'tree'], 269: ['bush'], 43: ['grass', 'bush'], 44: ['grass'], 45: ['grass'], 182: ['grass'],
    69: ['grass', 'bush'], 70: ['bush'], 71: ['bush'], 406: ['grass'], 167: ['bush', 'tree'], 168: ['tree'], 48: ['bush', 'grass'], 49: ['bush'],
    16: ['tree'], 17: ['tree'], 18: ['tree'], 21: ['tree'], 22: ['tree'], 163: ['tree'], 164: ['tree'], 165: ['tree', 'bush'], 166: ['tree'],
    396: ['tree'], 397: ['tree'], 398: ['tree'], 415: ['tree', 'berry'], 214: ['tree'], 127: ['tree', 'log'], 123: ['grass'], 198: ['tree'],
    46: ['mush', 'log'], 47: ['mush', 'log'], 285: ['mush', 'log'], 286: ['mush'], 25: ['tree', 'grass'], 401: ['grass'], 402: ['grass'],
    216: ['berry', 'log'], 217: ['log'], 114: ['bush'], 465: ['bush'], 92: ['log'], 93: ['log'], 41: ['tree'], 42: ['tree'],
  };
  const RARE = { 25: 0.25, 92: 0.35, 93: 0.4, 123: 0.3, 214: 0.6, 127: 0.6, 198: 0.5, 465: 0.5, 469: 0.5, 182: 0.5 };

  // the starting woodland, tier by tier (tiers start at 0, 70, 160, 260, 380, 500 s)
  const ROSTERS = {
    0: {
      tiers: [
        [16, 19, 161, 10, 13, 265, 263, 165, 396, 163, 43, 167, 48, 401],
        [16, 19, 161, 11, 14, 266, 268, 46, 69, 29, 32, 25, 285, 406, 415, 21, 163, 43, 167, 48, 41, 401],
        [17, 20, 162, 12, 15, 267, 269, 264, 397, 400, 166, 402, 70, 47, 30, 33, 22, 216, 164, 168, 49, 44, 198, 92],
        [22, 286, 214, 127, 71, 45, 182, 398, 114, 217, 20, 162, 164, 93, 168, 49],
        [217, 214, 123, 127, 286, 18, 398, 45, 71, 164, 93, 169, 15, 12],
        [217, 123, 214, 127, 18, 398, 465, 469, 286, 164, 93, 169, 430],
      ],
      bosses: [[20, 162, 15, 12, 164], [18, 217, 47, 71], [123, 214, 127, 286], [217, 398, 45, 465], [469, 465, 275]],
    },
  };

  function enabled() { return AI.enabled && AI.cfg.areaSpawns !== false; }
  function roster() { return enabled() ? ROSTERS[AI.Env.biome()] || null : null; }
  function active(dex) {
    if (ACTIVE[dex]) return ACTIVE[dex];
    const d = AI.R && AI.R.DEX_BY[dex];
    const t = (d && d.types) || [];
    return t.includes('ghost') || t.includes('dark') ? 'night' : 'any';
  }
  function habitat(dex) {
    if (HABITAT[dex]) return HABITAT[dex];
    const p = AI.Species.profile(dex);
    if (p.flying) return ['tree'];
    if (p.types.includes('bug')) return ['bush', 'tree'];
    if (p.types.includes('grass')) return ['grass', 'bush'];
    if (p.types.includes('ground') || p.types.includes('rock')) return ['burrow', 'log'];
    return ['grass', 'log'];
  }
  // is this species awake at this hour? (0 asleep … 1 fully active)
  function activity(dex) {
    const Sky = AI.Sky;
    if (!Sky || AI.cfg.atmosphere === false || Sky.indoor()) return 1;
    const a = active(dex), d = Sky.darkness(), ph = Sky.phase();
    if (a === 'night') return U.clamp(d * 1.2 - 0.1, 0.05, 1);
    if (a === 'day') return U.clamp(1.1 - d * 1.15, 0.04, 1);
    if (a === 'dusk') return ph === 'dusk' || ph === 'dawn' ? 1 : d > 0.5 ? 0.7 : 0.3;
    return 1 - d * 0.35;
  }

  // ---------------------------------------------------------------- roster → spawn definitions
  const HEALER = new Set([35, 36, 113, 173, 183, 184, 242, 301, 440, 531, 594, 700, 764, 858]);
  const SHIELDER = new Set([95, 122, 208, 213, 227, 306, 375, 410, 411, 436, 437, 439, 476, 703]);
  const BOMBER = new Set([74, 75, 76, 100, 101, 102, 109, 110, 337, 338, 343, 344]);
  const MINION = { 15: 13, 18: 16, 24: 23, 28: 27, 31: 29, 34: 32, 42: 41, 51: 50, 53: 52, 57: 56, 59: 58, 62: 60, 68: 66, 73: 72, 78: 77, 82: 81, 85: 84, 91: 90, 117: 116, 130: 129, 168: 167, 169: 41, 199: 79, 230: 116, 262: 261, 334: 333, 405: 403, 416: 415, 462: 81, 466: 239, 553: 551, 637: 636 };
  const hpStat = (d) => (d.hp - 70) / 0.45, spdStat = (d) => (d.spd - 78) / 0.42;
  // the game's own role assignment, so area Pokémon fight like everyone else
  function classify(d) {
    const R = AI.R;
    const t = d.types || [];
    const h = R.U.hash(d.dex, 7, 11);
    const has = (...k) => k.some((x) => t.includes(x));
    if (HEALER.has(d.dex)) return 'healer';
    if (SHIELDER.has(d.dex)) return 'shielder';
    if (BOMBER.has(d.dex)) return 'bomber';
    if ((MINION[d.dex] && R.SPRITE_META[MINION[d.dex]]) || (has('bug') && h >= 0.6 && h < 0.78)) return 'summoner';
    if (has('electric', 'psychic', 'dragon', 'ice') && h < 0.18) return 'beamer';
    if (has('fire', 'ground', 'poison') && h < 0.18) return 'zoner';
    if (has('water', 'grass', 'bug', 'fairy') && h >= 0.18 && h < 0.32) return 'fan';
    if (has('fighting', 'ground', 'normal', 'rock') && h >= 0.42 && h < 0.56) return 'jumper';
    if ((has('psychic', 'electric', 'ghost', 'fairy') && h < 0.4) || (has('fire', 'water', 'poison', 'ice') && h < 0.22)) return 'ranged';
    if (has('fighting', 'normal', 'ground', 'rock', 'dragon', 'steel', 'dark') && h < 0.4) return 'charger';
    if (hpStat(d) > 95 && spdStat(d) < 50) return 'tank';
    return 'chase';
  }
  function defFor(d, T, i) {
    const hpK = U.clamp(hpStat(d) / 65, 0.7, 1.6), spdK = U.clamp(0.75 + spdStat(d) / 260, 0.75, 1.2);
    const beh = classify(d);
    const tank = beh === 'tank';
    const o = {
      dex: d.dex, name: d.name, behavior: beh,
      hp: Math.round(T.hp * hpK * (tank ? 1.5 : 1)), spd: Math.round(T.spd * spdK * (tank ? 0.7 : 1)),
      dmg: Math.round(T.dmg * (tank ? 1.2 : 1)), xp: Math.max(3, Math.round(T.xp * (tank ? 1.3 : 1))),
      psxArea: true,
    };
    const cd = { ranged: 2.6 - 0.05 * i, fan: 3.6 - 0.05 * i, beamer: 4.4 - 0.2 * i, zoner: 4.6 - 0.2 * i, healer: 3.5, summoner: 7 }[beh];
    if (cd) {
      o.shotDmg = Math.round(T.dmg * (beh === 'fan' ? 0.5 : beh === 'ranged' ? 0.6 : 0.8));
      o.shotCd = +cd.toFixed(2);
      o.range = (beh === 'beamer' ? 260 : beh === 'healer' || beh === 'summoner' ? 230 : 190) + 6 * i;
    }
    if (beh === 'summoner') o.minion = MINION[d.dex];
    if (beh === 'fan') o.fanN = 3;
    if (beh === 'zoner') o.zones = i < 2 ? 1 : i < 4 ? 2 : 3;
    if (beh === 'bomber') { o.spd = Math.round(o.spd * 1.25); o.hp = Math.round(o.hp * 0.8); }
    return o;
  }

  let rewritten = null; // the cast object we last rewrote
  function rewriteCast() {
    const R = AI.R;
    const ro = roster();
    if (!ro) return false;
    let cast;
    try { cast = R.Enemies.cast; } catch (e) { return false; }
    if (!cast || cast === rewritten) return !!cast;
    const T = R.Enemies.TIERS;
    cast.forEach((tier, i) => {
      const ids = ro.tiers[Math.min(i, ro.tiers.length - 1)].filter((dex) => R.DEX_BY[dex] && R.SPRITE_META[dex]);
      if (!ids.length) return;
      const list = ids.map((dex) => defFor(R.DEX_BY[dex], T[i], i));
      const run = list.filter((d) => d.behavior === 'chase' || d.behavior === 'charger' || d.behavior === 'tank').sort((a, b) => b.spd - a.spd)[0];
      if (run) { run.behavior = 'runner'; run.spd = Math.round(run.spd * 1.6); run.hp = Math.round(run.hp * 0.7); }
      tier.list = list;
    });
    // woodland "alphas" as bosses (stats untouched)
    try {
      R.Enemies.BOSSES.forEach((b, k) => {
        const pool = ro.bosses[Math.min(k, ro.bosses.length - 1)].filter((dex) => R.DEX_BY[dex] && R.SPRITE_META[dex]);
        if (!pool.length) return;
        const d = R.DEX_BY[pool[(R.U.hash(k, AI.Decor ? AI.Decor.seed : 1, 3) * pool.length) | 0]];
        b.dex = d.dex; b.name = d.name;
        b.spd = Math.round(U.clamp(40 + 0.5 * spdStat(d), 40, 100));
        b.behavior = classify(d) === 'ranged' ? 'ranged' : spdStat(d) > 90 ? 'charger' : 'chase';
      });
    } catch (e) { AI.warn('areas-boss', e); }
    rewritten = cast;
    return true;
  }

  // weigh the spawn bag by time of day, season, weather and rarity
  // near the haunted mansion the ordinary Pokémon thin out and Ghost types gather (84-journey.js)
  const GHOSTS = [92, 355, 200, 353, 607, 708];
  function weightBag(bag) {
    if (!roster() || !bag || !bag.length) return null;
    const Sky = AI.Sky;
    const jk = AI.Journey ? AI.Journey.partyK() : 0;
    if (jk > 0.15) {
      const R = AI.R, T = R.Enemies.TIERS;
      const t = R.Game.time || 0, ti = [0, 70, 160, 260, 380, 500].filter((s) => t >= s).length - 1;
      for (const g of GHOSTS) {
        if (!R.DEX_BY[g] || !R.SPRITE_META[g] || bag.some((d) => d.dex === g)) continue;
        const n = Math.round(jk * 2.5);
        for (let i = 0; i < n; i++) bag = bag.concat([defFor(R.DEX_BY[g], T[Math.max(0, Math.min(ti, T.length - 1))], ti)]);
      }
    }
    const se = Sky ? Sky.season() : 'summer';
    const out = [];
    for (const d of bag) {
      const types = (AI.R.DEX_BY[d.dex] || {}).types || [];
      let w = activity(d.dex) * (RARE[d.dex] || 1);
      if (types.includes('bug')) w *= se === 'winter' ? 0.25 : se === 'spring' ? 1.5 : 1;
      if (Sky && types.includes('bug') && Sky.midday() && Sky.cloud < 0.5) w *= 1.4;
      if (Sky && Sky.rain > 0.4 && (types.includes('bug') || types.includes('fire'))) w *= 0.5;
      if (Sky && Sky.fog > 0.5 && (types.includes('ghost') || types.includes('dark'))) w *= 2.2;
      if (jk > 0.15) w *= types.includes('ghost') ? 1 + jk * 4 : 1 - jk * 0.75;
      // tree-dwellers mostly live in their trees (63-wildlife.js): cocoons never roam, few caterpillars do
      if (AI.Wildlife && AI.cfg.wildlife !== false) { if (AI.Wildlife.COCOON.has(d.dex)) w = 0; else if (AI.Wildlife.CRAWLER.has(d.dex)) w *= 0.35; }
      const n = Math.floor(w) + (Math.random() < w - Math.floor(w) ? 1 : 0);
      for (let i = 0; i < n; i++) out.push(d);
    }
    return out.length >= 3 ? out : bag;
  }

  // fog keeps Pokémon in cover: light fog barely matters, moderate fog thins encounters out,
  // dense fog makes the forest strangely quiet (some species still wander)
  function fogFactor(base) {
    const Sky = AI.Sky;
    const f = Sky ? Sky.fog : 0;
    const k = AI.cfg.fogSpawns == null ? 1 : AI.cfg.fogSpawns;
    let m = 1;
    if (f > 0.75) m = U.lerp(0.5, 0.18, U.clamp((f - 0.75) / 0.25, 0, 1));
    else if (f > 0.45) m = U.lerp(0.85, 0.5, (f - 0.45) / 0.3);
    else if (f > 0.2) m = U.lerp(1, 0.85, (f - 0.2) / 0.25);
    return base * (1 - (1 - m) * k);
  }
  // how many wild Pokémon the area holds right now (a share of the configured cap)
  function popScale() {
    const Sky = AI.Sky;
    if (!enabled() || !Sky || AI.cfg.atmosphere === false || Sky.indoor()) return 1;
    return U.clamp(fogFactor(1) * 0.6 + 0.4, 0.45, 1) * (1 - Sky.darkness() * 0.25);
  }
  // fewer Pokémon roam at night, in deep fog or in a storm
  function spawnRate() {
    const Sky = AI.Sky;
    if (!enabled() || !Sky || AI.cfg.atmosphere === false || Sky.indoor()) return 1;
    let r = 1 - Sky.darkness() * 0.55;
    r *= fogFactor(1);
    r *= 1 - Sky.storm * 0.4 - Math.max(0, Sky.rain - 0.5) * 0.4;
    if (Sky.windNow() > 0.85) r *= 0.7;
    if (AI.Journey) r *= 1 - AI.Journey.partyK() * 0.5; // the forest goes quiet near the mansion
    return U.clamp(r, 0.12, 1);
  }

  // ---------------------------------------------------------------- habitats, emergence, disturbance
  const disturb = new Map(); // anchor key → level
  function keyOf(a) { return a.kind + ':' + Math.round(a.x) + ',' + Math.round(a.y); }
  function disturbed(a) { return (disturb.get(keyOf(a)) || 0) > 1.2; }
  function anchors(x, y, r, kinds) {
    const out = [];
    const want = new Set(kinds);
    if (AI.Decor) for (const it of AI.Decor.inRect(x - r, y - r, x + r, y + r, [])) {
      if (!it.hab) continue;
      const k = it.hab === 'berry' ? 'bush' : it.hab;
      if (want.has(k) || want.has(it.hab)) out.push({ kind: k, x: it.x, y: it.y, item: it });
    }
    for (const p of AI.Env.props(x, y, r)) {
      if (p.type === 'tree' && want.has('tree')) out.push({ kind: 'tree', x: p.x, y: p.y, prop: p });
      else if (p.type === 'grass' && (want.has('bush') || want.has('grass'))) out.push({ kind: want.has('bush') ? 'bush' : 'grass', x: p.x, y: p.y, prop: p });
    }
    if (want.has('grass') && !out.length) out.push({ kind: 'grass', x, y });
    return out.filter((a) => U.dist2(x, y, a.x, a.y) <= r * r && !disturbed(a));
  }
  function occupied(a) { return AI.R.EnemyMgr.queryCircle(a.x, a.y, 36).some((e) => !e.dead); }

  // called by the population manager for each new spawn from the spawner
  function place(e) {
    if (!enabled() || e.boss || e.legend) return;
    e.psxNative = true; // lives here: goes home at the end of its day
    const R = AI.R;
    const p = R.Game.player;
    const cam = R.Camera;
    if (!p) return;
    const kinds = habitat(e.dex);
    const prof = AI.Species.profile(e.dex);
    // now and then, let it emerge in view: from a tree, a bush, a burrow, behind a log
    if (Math.random() < 0.3 && AI.cfg.newArt) {
      const list = anchors(p.x, p.y, 560, kinds).filter((a) => {
        const d = Math.hypot(a.x - p.x, a.y - p.y);
        return d > 240 && cam.sees(a.x, a.y, -50) && !occupied(a);
      });
      const a = list.length ? list[(Math.random() * list.length) | 0] : null;
      if (a) {
        let kind = a.kind === 'tree' ? (prof.flying || prof.types.includes('flying') ? 'branch' : 'trunk') : a.kind === 'grass' ? (e.dex === 43 || e.dex === 69 ? 'ground' : 'edge') : a.kind === 'mush' ? 'ground' : a.kind;
        if (kind !== 'edge') {
          let x = a.x, y = a.y;
          if (kind === 'trunk') { x += (Math.random() < 0.5 ? -1 : 1) * 24; y += 4; }
          if (kind === 'branch') y += 8;
          if (kind === 'log') y -= 4;
          if (R.World.isFree(x, y, Math.min(e.r || 12, 12)) || kind === 'branch') {
            e.x = x; e.y = y;
            e.psxEmerge = { kind, ax: a.x, ay: a.y, anchor: a };
            e.psxHome = a;
            return;
          }
        }
      }
    }
    // otherwise arrive from just beyond the screen, near a fitting habitat
    const list = anchors(e.x, e.y, 240, kinds).filter((a) => !cam.sees(a.x, a.y, 30) && R.World.isFree(a.x, a.y + 10, 12));
    if (list.length) {
      const a = list[(Math.random() * list.length) | 0];
      e.x = a.x + U.rand(-16, 16); e.y = a.y + 12;
      e.psxHome = a;
    }
  }

  let tickT = 0;
  function tick(dt) {
    tickT -= dt;
    if (tickT > 0) return;
    tickT = 0.5;
    for (const [k, v] of disturb) { const nv = v - 0.006; if (nv <= 0) disturb.delete(k); else disturb.set(k, nv); }
    const p = AI.R.Game.player;
    if (!p || !enabled()) return;
    // lingering right next to a habitat unsettles it
    for (const a of anchors(p.x, p.y, 70, ['log', 'bush', 'burrow', 'tree', 'mush'])) bump(a, 0.06);
  }
  function bump(a, amt) {
    const k = keyOf(a);
    const v = Math.min(3, (disturb.get(k) || 0) + amt);
    disturb.set(k, v);
    if (v > 1.2) AI.Bus.emit({ type: 'disturbed', x: a.x, y: a.y, loud: 0, anchor: a });
  }
  // fights and deaths around a habitat drive its residents away
  function onEvent(ev) {
    if (!enabled()) return;
    if ((ev.type === 'hit' && ev.actorKey === 'P') || ev.type === 'death' || (ev.type === 'boom' && !ev.thunder)) {
      const amt = ev.type === 'death' ? 0.7 : ev.type === 'boom' ? 0.5 : 0.25;
      for (const a of anchors(ev.x, ev.y, 110, ['log', 'bush', 'burrow', 'tree', 'mush'])) bump(a, amt);
    }
  }
  AI.Bus.on('hit', onEvent);
  AI.Bus.on('death', onEvent);
  AI.Bus.on('boom', onEvent);

  function reset() { disturb.clear(); rewritten = null; }

  AI.define('Areas', {
    ROSTERS, ACTIVE, HABITAT, fogFactor, popScale, roster, active, habitat, activity, rewriteCast, weightBag, spawnRate, anchors, place, disturbed, bump, tick, reset, defFor, classify,
  });
})();
