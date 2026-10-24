/* PokéSurvivor+ — Living World AI · population
 * Keeps the ecosystem readable and fast: a configurable global cap, local density limits,
 * a spawn-rate token bucket (surges can still burst), habitat-weighted spawning per biome,
 * aquatic species placed near water, packs/migrations for hordes, and memory of the
 * individuals that wander off-screen.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  let tokens = 12;
  let inSpawner = false;
  let batch = [];
  const managed = new Set();
  const npcKills = new Set();

  let bursting = false;
  function beginSpawner(dt, burst = false) {
    tokens = Math.min(AI.cfg.spawnBurst, tokens + dt / Math.max(0.05, AI.cfg.spawnInterval));
    inSpawner = true;
    bursting = burst;
    batch = [];
  }
  function endSpawner() {
    inSpawner = false;
    bursting = false;
    if (batch.length >= 4 && AI.Social) AI.Social.markHorde(batch);
    batch = [];
  }

  // special arrivals (bosses, legends, elites, shinies, thieves…) never count against the caps
  function exempt(e) { return !!(e.boss || e.legend || e.judge || e.dummy || e.elite || e.shiny || e.behavior === 'thief'); }
  function aliveWild() {
    let n = 0;
    for (const e of AI.R.EnemyMgr.all()) if (!e.dead && !e.remote && !exempt(e)) n++;
    return n;
  }

  // return false to veto a spawn
  function allowAdd(e) {
    // nothing wild ever comes into the haunted mansion
    if (AI.Mansion && AI.Mansion.inInterior(e.x, e.y) && !e.psxStory) { AI.stats.spawnVetoed++; return false; }
    // nobody appears in water they couldn't be in (34-forest.js moves them to a spot that suits them)
    if (AI.Forest && !e.psxStory && !AI.Forest.spawnOk(e)) { AI.stats.spawnVetoed++; return false; }
    // and nothing hostile appears in the Evergold Sanctuary (82-mysteries.js)
    if (AI.Mysteries && !AI.Mysteries.spawnOk(e)) { AI.stats.spawnVetoed++; return false; }
    // cocoons only exist clinging to a tree (63-wildlife.js)
    if (AI.Wildlife && !AI.Wildlife.spawnOk(e)) { AI.stats.spawnVetoed++; return false; }
    // tree residents have their own small budget, apart from the roaming wildlife
    if (e.psxResident || e.psxEvent) return true;
    if (exempt(e)) return true;
    // the global cap applies to every source of wild Pokémon (spawner, event bursts, summoned allies…)
    if (aliveWild() >= AI.cfg.maxNpcs) { AI.stats.spawnVetoed++; return false; }
    // fog and night keep the population down (only for ambient spawns)
    if (inSpawner && AI.Areas && aliveWild() >= AI.cfg.maxNpcs * AI.Areas.popScale()) { AI.stats.spawnVetoed++; return false; }
    if (!inSpawner || AI.summoning) return true;
    if (AI.R.EnemyMgr.queryCircle(e.x, e.y, AI.cfg.localRadius).length >= AI.cfg.localCap) { AI.stats.spawnVetoed++; return false; }
    if (!bursting) {
      if (tokens < 1) { AI.stats.spawnVetoed++; return false; }
      // the time of day and the weather thin out who's around
      if (AI.Areas && Math.random() > AI.Areas.spawnRate()) { AI.stats.spawnVetoed++; return false; }
      // some stretches of forest are simply quiet
      if (AI.Forest && AI.Forest.on() && Math.random() < AI.Forest.quietAt(e.x, e.y)) { AI.stats.spawnVetoed++; return false; }
      tokens -= 1;
    }
    batch.push(e);
    placeByHabitat(e);
    if (AI.Areas) AI.Areas.place(e);
    return true;
  }

  // fish & water lovers appear at the water's edge when there's water just off-screen
  function placeByHabitat(e) {
    const p = AI.Species.profile(e.dex);
    if (!(p.fish || (p.lovesWater && Math.random() < 0.5)) || e.flying) return;
    const w = AI.Env.nearestWater(e.x, e.y, 360);
    if (!w || AI.R.Camera.sees(w.x, w.y, 30)) return;
    e.x = w.x; e.y = w.y;
  }

  // habitat-weighted spawn pool
  let bagCache = { key: '', bag: null, t: -99 };
  function weightBag(bag) {
    const biome = AI.Env.biome();
    const key = biome + ':' + bag.length + ':' + (bag[0] && bag[0].dex);
    if (bagCache.key === key && AI.time - bagCache.t < 6) return bagCache.bag;
    const out = [];
    const S = AI.Species;
    for (const d of bag) {
      const dx = AI.R.DEX_BY[d.dex];
      const w = S.biomeWeight((dx && dx.types) || ['normal'], biome);
      const n = w >= 1 ? 1 + (Math.random() < (w - 1) ? 1 : 0) + (w > 2 ? 1 : 0) : Math.random() < w ? 1 : 0;
      for (let i = 0; i < n; i++) out.push(d);
    }
    const res = out.length >= 4 ? out : bag;
    bagCache = { key, bag: res, t: AI.time };
    return res;
  }

  // called after each EnemyMgr.update: who left without dying? (remember those who matter)
  function afterUpdate() {
    const R = AI.R;
    for (const e of managed) {
      if (R.EnemyMgr.get(e.id) === e) continue;
      managed.delete(e);
      if (!e.dead && e.psx) { AI.Memory.store(e); if (AI.Social) AI.Social.leave(e); }
    }
    for (const e of R.EnemyMgr.all()) if (e.psx && !managed.has(e)) managed.add(e);
    // kills made by other Pokémon are not the player's kills
    const p = R.Game.player;
    for (const e of npcKills) if (R.EnemyMgr.get(e.id) !== e) { npcKills.delete(e); if (p && p.kills > 0) p.kills--; }
  }

  function noteNpcKill(e) { npcKills.add(e); }
  function full() { return aliveWild() >= AI.cfg.maxNpcs; }
  function clear() { managed.clear(); npcKills.clear(); tokens = AI.cfg.spawnBurst; }

  AI.define('Population', { beginSpawner, endSpawner, allowAdd, weightBag, afterUpdate, noteNpcKill, clear, aliveWild, full, managed, inSpawner: () => inSpawner });
})();
