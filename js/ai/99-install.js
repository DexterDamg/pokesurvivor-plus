/* PokéSurvivor+ — Living World AI · installer
 * Waits for the game's module registry (window.__PSX_REG__, exposed by a one-line hook in
 * app.min.js) and wraps the vanilla systems. The original game logic still runs; the AI
 * decides what each wild Pokémon wants and steers the original physics/combat with it.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  let installed = false;

  function ready() {
    const R = window.__PSX_REG__;
    return R && R.Enemy && R.EnemyMgr && R.Game && R.Combat && R.Spawner && R.HUD && R.Projectiles && R.Hazards && R.Training && R.Player && R.World ? R : null;
  }
  function boot() {
    const R = ready();
    if (!R) return false;
    try { install(R); } catch (e) { console.error('[PSXAI] install failed — running the original game', e); AI.enabled = false; }
    return true;
  }
  if (!boot()) { const iv = setInterval(() => { if (boot()) clearInterval(iv); }, 50); }

  function install(R) {
    if (installed) return;
    installed = true;
    AI.R = R;
    const P = R.Enemy.prototype;

    // ------------------------------------------------------------ enemies
    const oUpdate = P.update;
    P.update = function (dt, target) {
      if (!AI.enabled) return oUpdate.call(this, dt, target);
      if (!this.psx && (this.psxSkip || !AI.Brain.eligible(this))) {
        this.psxSkip = true;
        const prev = AI.curEnemy;
        AI.curEnemy = this; // lets boss hazards/shots be attributed (friendly fire, common enemies)
        try { return oUpdate.call(this, dt, target); } finally { AI.curEnemy = prev; }
      }
      return AI.Brain.update(this, dt, target, oUpdate);
    };

    const oHurt = P.hurt;
    P.hurt = function (amount, color, kx, ky, knock, label) {
      if (this.dead || !AI.enabled) return oHurt.apply(this, arguments);
      const s = this.psx;
      let attacker = AI.curAttacker || null;
      if (!attacker) {
        if (this._env) attacker = null; // lava, environment
        else if (this._dot) attacker = this.psxDotBy || R.Game.player;
        else attacker = R.Game.player; // every other source of damage in the game is a player's
      }
      const accidental = !!AI.curAccidental;
      if (s) {
        if (s.dmgTakenK && s.dmgTakenK !== 1) amount *= s.dmgTakenK;
        if (s.buff && s.buff.until > AI.time && s.buff.def < 1) amount *= s.buff.def;
      }
      const hp0 = this.hp, sh0 = this.shield || 0;
      this._psxLast = attacker;
      oHurt.call(this, amount, color, kx, ky, knock, label);
      const dmg = Math.max(0, hp0 - Math.max(0, this.hp)) + Math.max(0, sh0 - (this.shield || 0));
      if (dmg <= 0) return;
      const key = attacker ? AI.keyOf(attacker) : null;
      const frac = dmg / Math.max(1, this.maxHp);
      AI.Bus.emit({ type: 'hit', x: this.x, y: this.y, loud: 150 + Math.min(250, frac * 600), actor: attacker, actorKey: key, victim: this, victimKey: this.id, dmg, frac, accidental });
      if (s && !this.dead) {
        AI.Perception.onHurt(this, s, attacker, key, dmg, accidental);
        if (key === 'P' && s.territory) s.territory.habit = 0;
        if (attacker && s.combat) {
          const d = Math.hypot(attacker.x - this.x, attacker.y - this.y);
          if (d < 140) s.combat.closeHurt += frac; else s.combat.farHurt += frac;
        }
        if (AI.Evolution && s.inCombat) s.exp += frac * 3;
      }
      if (attacker && attacker.psx && !attacker.dead) attacker.psx.exp += frac * 2;
    };

    const oDie = P.die;
    P.die = function () {
      const was = this.dead;
      const r = oDie.apply(this, arguments);
      if (was || !this.dead || !AI.enabled) return r;
      const s = this.psx;
      const killer = this._psxLast || null;
      const killerKey = killer ? AI.keyOf(killer) : null;
      if (AI.npcKilling) { this.psxNpcKill = true; AI.Population.noteNpcKill(this); }
      if (s && s.loot) {
        // a thief's stash spills out
        const n = Math.min(12, Math.ceil(s.loot / 3));
        for (let i = 0; i < n; i++) R.Pickups.drop('coin', this.x + AI.U.rand(-20, 20), this.y + AI.U.rand(-14, 14), Math.max(1, Math.round(s.loot / n)));
      }
      AI.Bus.emit({ type: 'death', x: this.x, y: this.y, loud: 320, victim: this, victimKey: this.id, victimDex: this.dex, killer, killerKey, victimPeaceful: AI.Perception.victimWasPeaceful(this, killer) });
      if (s && AI.Social) AI.Social.leave(this);
      if (killer && killer.psx && !killer.dead) {
        AI.Mind.feel(killer.psx, 'joy', 0.25);
        killer.psx.exp += 3;
        killer.psx.mind.needs.hunger = Math.max(0, killer.psx.mind.needs.hunger - 0.3);
      }
      return r;
    };

    P.draw = AI.Render.wrapDraw(AI.Scale.wrapEnemyDraw(P.draw));
    if (R.Player.prototype.draw) R.Player.prototype.draw = AI.Scale.wrapPlayerDraw(R.Player.prototype.draw);

    for (const k of ['applyBurn', 'applyPoison']) {
      const o = P[k];
      P[k] = function () { this.psxDotBy = AI.curAttacker || R.Game.player; return o.apply(this, arguments); };
    }

    const oShoot = P.shoot;
    P.shoot = function () {
      const prev = AI.shooter;
      AI.shooter = this;
      try { return oShoot.apply(this, arguments); } finally { AI.shooter = prev; }
    };

    // ------------------------------------------------------------ projectiles & hazards
    const oSpawn = R.Projectiles.spawn;
    R.Projectiles.spawn = function (o) {
      const p = oSpawn.apply(this, arguments);
      if (p && AI.shooter && o && !o.friendly && !p.psxOwner) p.psxOwner = AI.shooter;
      return p;
    };

    const oHAdd = R.Hazards.add;
    R.Hazards.add = function () {
      const h = oHAdd.apply(this, arguments);
      if (h && AI.curEnemy && !h.psxOwner) h.psxOwner = AI.curEnemy;
      return h;
    };

    const oHUpd = R.Hazards.update;
    R.Hazards.update = function (dt) {
      const pending = [];
      if (AI.enabled) for (const h of R.Hazards.all) if (!h.hit && h.t + dt >= h.delay) pending.push(h);
      const r = oHUpd.apply(this, arguments);
      if (pending.length) {
        const trig = pending.filter((h) => h.hit);
        if (trig.length) try { AI.Combat.resolveHazards(trig); } catch (e) { AI.warn('hazards', e); }
      }
      return r;
    };

    const oHDraw = R.Hazards.draw;
    R.Hazards.draw = function (ctx) {
      if (AI.enabled) try { AI.Ground.drawGround(ctx); } catch (e) { AI.warn('env-ground', e); }
      if (AI.enabled) try { AI.Render.drawGround(ctx); } catch (e) { AI.warn('ground', e); }
      if (AI.enabled && AI.cfg.softTelegraphs !== false) { try { AI.Ground.drawHazards(ctx); return; } catch (e) { AI.warn('telegraph', e); } }
      return oHDraw.apply(this, arguments);
    };

    // ------------------------------------------------------------ living environment: art, light, weather
    R.World.drawProp = AI.Ground.wrapDrawProp(R.World.drawProp);
    R.World.visibleProps = AI.Ground.wrapVisibleProps(R.World.visibleProps);
    R.Weather.draw = AI.Light.wrapWeatherDraw(R.Weather.draw);
    AI.Light.patchVignette(R.Weather);

    // ------------------------------------------------------------ the haunted mansion
    /* Inside the house the forest's terrain doesn't apply: collision, ground and props come from
     * the mansion. Outside, its walls, fence and gates are solid. */
    const W = R.World;
    const insideAt = (x, y) => AI.enabled && AI.Mansion.inside && AI.Mansion.inInterior(x, y);
    const oCollide = W.collide;
    W.collide = function (ent) {
      if (ent && insideAt(ent.x, ent.y)) return AI.Mansion.collide(ent);
      const r = oCollide.apply(this, arguments);
      if (AI.enabled && ent) try { AI.Mansion.collideExterior(ent); } catch (e) { AI.warn('mansion-collide', e); }
      return r;
    };
    const oFree = W.isFree;
    W.isFree = function (x, y, r) {
      if (insideAt(x, y)) return AI.Mansion.freeAt(x, y, r);
      const f = oFree.apply(this, arguments);
      return f && !(AI.enabled && AI.Mansion.blockedExterior(x, y, r || 12));
    };
    const inHouse = {
      kindAt: (x, y) => (AI.Mansion.freeAt(x, y, 2) ? 'floor' : 'wall'), isWall: (x, y) => !AI.Mansion.freeAt(x, y, 2), isLiquid: () => false,
      walkable: (x, y) => AI.Mansion.freeAt(x, y, 2), projectileBlock: () => null, underCanopy: () => false, clearance: () => null,
      reachable: () => true, propsInCircle: () => [], specialsNear: () => [], nearestBreakable: () => null, obstacleNear: () => false,
      breakAt: () => undefined, useAltarAt: () => undefined, damageProp: () => false,
    };
    for (const k of Object.keys(inHouse)) {
      const o = W[k];
      if (typeof o !== 'function') continue;
      W[k] = function (x, y) { return insideAt(x, y) ? inHouse[k].apply(null, arguments) : o.apply(this, arguments); };
    }
    const oDG = W.drawGround;
    W.drawGround = function (ctx) {
      if (AI.enabled && AI.Mansion.inside) { try { AI.Mansion.drawInterior(ctx); } catch (e) { AI.warn('mansion-draw', e); } return; }
      return oDG.apply(this, arguments);
    };
    const oDL = W.drawLiquid;
    W.drawLiquid = function () { if (AI.enabled && AI.Mansion.inside) return; return oDL.apply(this, arguments); };
    const oVP = W.visibleProps;
    W.visibleProps = function (cam) { if (AI.enabled && AI.Mansion.inside && cam === R.Camera) return AI.Mansion.visibleProps(cam); return oVP.apply(this, arguments); };
    const oDP = W.drawProp;
    W.drawProp = function (ctx, prop) {
      if (prop && (prop.psxMansion || prop.psxDraw)) { try { AI.Mansion.drawProp(ctx, prop); } catch (e) { AI.warn('mansion-prop', e); } return; }
      return oDP.apply(this, arguments);
    };
    // story scenes can point the camera elsewhere
    const oFollow = R.Camera.follow;
    R.Camera.follow = function (x, y, dt) { const c = AI.enabled && AI.Story && AI.Story.cam; return c ? oFollow.call(this, c[0], c[1], dt * 0.35) : oFollow.apply(this, arguments); };
    // story scenes hold the player still
    const oAxis = R.Input.axis;
    R.Input.axis = function () { if (AI.enabled && AI.Story && AI.Story.lockInput()) return [0, 0]; return oAxis.apply(this, arguments); };

    // ------------------------------------------------------------ combat resolution
    const tracked = new Map(); // NPC shot → { move, target } for hit/miss learning
    const oRes = R.Combat.resolve;
    R.Combat.resolve = function (dt, player) {
      if (!AI.enabled) return oRes.apply(this, arguments);
      const arr = R.Projectiles.all();
      const safe = [];
      // stray shots from Pokémon that aren't hostile to you don't hurt you
      for (let i = arr.length - 1; i >= 0; i--) { const p = arr[i]; if (!p.friendly && p.psxSafe) { safe.push(p); arr.splice(i, 1); } }
      try { return oRes.apply(this, arguments); }
      finally {
        for (const p of safe) arr.push(p);
        try { AI.Combat.resolveNpcShots(); trackShots(arr, player); } catch (e) { AI.warn('ff', e); }
      }
    };
    function trackShots(arr, player) {
      const live = new Set(arr);
      for (const [p, info] of tracked) {
        if (live.has(p)) continue;
        tracked.delete(p);
        if (!info.owner.psx || !AI.isPlayer(info.target)) continue;
        const hitIt = player && Math.hypot(p.x - player.x, p.y - player.y) < (p.r || 6) + player.r + 14;
        AI.Combat.noteShotResult(info.owner, info.move, hitIt);
      }
      for (const p of arr) if (p.psxMove && p.psxOwner && p.psxOwner.psx && !tracked.has(p)) tracked.set(p, { owner: p.psxOwner, move: p.psxMove, target: p.psxTarget });
    }

    R.Combat.tick = AI.Player.wrapTick(R.Combat.tick);
    R.Player.prototype.update = AI.Player.wrapPlayerUpdate(R.Player.prototype.update);
    if (R.MoveTip && R.MoveTip.zone) R.MoveTip.zone = AI.Player.wrapZone(R.MoveTip.zone);

    const oHud = R.HUD.draw;
    R.HUD.draw = function (ctx, w, h) {
      const r = oHud.apply(this, arguments);
      if (AI.enabled) try { AI.Player.drawHud(ctx); AI.Light.drawClock(ctx); AI.Render.drawDebugHud(ctx, w, h); } catch (e) { AI.warn('hud', e); }
      if (AI.enabled) try { AI.Haunt.drawScreen(ctx, w, h); AI.Mansion.drawScreen(ctx, w, h); AI.Story.drawScreen(ctx, w, h); } catch (e) { AI.warn('mansion-hud', e); }
      return r;
    };

    const oAir = R.Training.drawAir;
    R.Training.drawAir = function (ctx) {
      const r = oAir.apply(this, arguments);
      if (AI.enabled) try { AI.Light.drawAir(ctx); } catch (e) { AI.warn('env-air', e); }
      if (AI.enabled) try { AI.Mansion.drawAir(ctx); } catch (e) { AI.warn('mansion-air', e); }
      if (AI.enabled) try { AI.Render.drawAir(ctx); } catch (e) { AI.warn('air', e); }
      if (AI.enabled) try { AI.Lore.drawSpeech(ctx); } catch (e) { AI.warn('speech', e); }
      return r;
    };

    // ------------------------------------------------------------ population
    const oAdd = R.EnemyMgr.add;
    R.EnemyMgr.add = function (e) {
      if (AI.enabled && !AI.Population.allowAdd(e)) return e;
      const r = oAdd.apply(this, arguments);
      if (AI.enabled) try { AI.Scale.apply(e); } catch (err) { AI.warn('scale', err); }
      if (AI.enabled && (e.boss || e.legend)) AI.Bus.emit({ type: 'legend', x: e.x, y: e.y, loud: 760, dex: e.dex, kind: 'boss', power: 1.1 });
      return r;
    };

    const oSU = R.Spawner.update;
    R.Spawner.update = function (dt) {
      if (!AI.enabled) return oSU.apply(this, arguments);
      AI.Population.beginSpawner(dt);
      try { return oSU.apply(this, arguments); } finally { AI.Population.endSpawner(); }
    };

    // event hordes spawn through burst(): same limits, and they arrive as a pack
    const oBurst = R.Spawner.burst;
    R.Spawner.burst = function () {
      if (!AI.enabled) return oBurst.apply(this, arguments);
      AI.Population.beginSpawner(0, true);
      try { return oBurst.apply(this, arguments); } finally { AI.Population.endSpawner(); }
    };

    const oBag = R.Enemies.bagAt;
    R.Enemies.bagAt = function () {
      if (AI.enabled) try { AI.Areas.rewriteCast(); } catch (e) { AI.warn('areas', e); }
      const b = oBag.apply(this, arguments);
      if (!AI.enabled || !b || !b.length) return b;
      // events (Jigglypuff, egg…) bring their own bags: leave those alone
      const ev = R.Events && R.Events.bag && R.Events.bag();
      if (!ev) { const w = AI.Areas.weightBag(b); if (w) return w; }
      return AI.Population.weightBag(b);
    };
    const oRoll = R.Enemies.rollRun;
    R.Enemies.rollRun = function () {
      const r = oRoll.apply(this, arguments);
      if (AI.enabled) try { AI.Areas.reset(); AI.Areas.rewriteCast(); } catch (e) { AI.warn('areas', e); }
      try { AI.Progress.onRoll(); } catch (e) { AI.warn('progress', e); }
      return r;
    };
    const oHorde = R.Enemies.hordeDefs;
    R.Enemies.hordeDefs = function (type, t) {
      const defs = oHorde.apply(this, arguments);
      const ro = AI.enabled && AI.Areas.roster();
      if (!ro || !defs || !defs.length) return defs;
      try {
        // hordes in an area are made of that area's Pokémon
        AI.Areas.rewriteCast();
        const tiers = R.Enemies.cast.filter((c) => t >= c.from);
        const pool = (tiers.length ? tiers[tiers.length - 1].list : []).filter((d) => ((R.DEX_BY[d.dex] || {}).types || []).includes(type) && !['healer', 'shielder', 'summoner', 'bomber'].includes(d.behavior));
        const all = tiers.length ? tiers[tiers.length - 1].list.filter((d) => !['healer', 'shielder', 'summoner', 'bomber'].includes(d.behavior)) : [];
        const src = pool.length >= 2 ? pool : all;
        if (!src.length) return defs;
        return defs.map((d) => { const n = src[(Math.random() * src.length) | 0]; return Object.assign({}, d, { dex: n.dex, name: n.name, behavior: n.behavior }); });
      } catch (e) { AI.warn('areas-horde', e); return defs; }
    };

    const oSK = R.Stats.kill;
    R.Stats.kill = function () { if (AI.npcKilling) return; return oSK.apply(this, arguments); };
    const oPK = R.Progress.kill;
    R.Progress.kill = function (e) { if (e && e.psxNpcKill) return; return oPK.apply(this, arguments); };

    // ------------------------------------------------------------ per-frame entry point
    const oEMU = R.EnemyMgr.update;
    R.EnemyMgr.update = function (dt) {
      if (!AI.enabled) return oEMU.apply(this, arguments);
      const t0 = performance.now();
      AI.time += dt;
      AI.frame++;
      AI.vanillaMs = 0;
      try {
        AI.refreshPlayers();
        AI.Sky.tick(dt);
        AI.Decor.tick(dt);
        AI.Areas.tick(dt);
        AI.EnvBeh.tick(dt);
        AI.Lore.tick(dt);
        AI.Ambience.tick(dt);
        AI.Progress.tick(dt);
        AI.Mansion.tick(dt);
        AI.Haunt.tick(dt);
        AI.Story.tick(dt);
        AI.Player.frame();
        AI.Legend.tick(dt);
        AI.Social.tick(dt);
        AI.Combat.globalTick(dt);
        AI.Evolution.tick(dt);
      } catch (e) { AI.warn('frame', e); }
      const r = oEMU.apply(this, arguments);
      try { AI.Population.afterUpdate(); lodStats(); } catch (e) { AI.warn('post', e); }
      const ms = performance.now() - t0 - (AI.vanillaMs || 0);
      AI.stats.aiMs += (ms - AI.stats.aiMs) * 0.05;
      return r;
    };
    function lodStats() {
      const st = AI.stats;
      st.lod[0] = st.lod[1] = st.lod[2] = 0;
      let n = 0;
      for (const e of R.EnemyMgr.all()) if (e.psx && !e.dead) { n++; st.lod[e.psx.lod]++; }
      st.npcs = n;
    }

    // ------------------------------------------------------------ new run → fresh world
    const oWR = R.World.reset;
    R.World.reset = function (seed) {
      try { resetWorld(); AI.Decor.reset(seed); AI.Sky.reset(); AI.Areas.reset(); AI.Lore.reset(); AI.Mansion.reset(); AI.Haunt.reset(); AI.Story.reset(); AI.Player.lanternToggle = null; } catch (e) { AI.warn('reset', e); }
      return oWR.apply(this, arguments);
    };
    function resetWorld() {
      AI.Bus.clear();
      AI.Memory.clear();
      AI.Social.clear();
      AI.Legend.clear();
      AI.Env.reset();
      AI.Population.clear();
      tracked.clear();
    }

    AI.Player.installPointer();
    AI.Panel.install();
    AI.installed = true;
    console.info('[PSXAI] Living World AI ' + AI.version + ' installed');
  }
})();
