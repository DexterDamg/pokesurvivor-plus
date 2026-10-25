/* PokéSurvivor+ — hidden forest judgment
 * Innocent-player kills are counted only while auto-aim is deliberately set to Anyone.
 * No KARMA value or morality status is rendered in the normal HUD or menus.
 */
(function () {
  'use strict';
  const wait = setInterval(() => {
    const AI = window.PSXAI;
    if (!AI || !AI.installed || !AI.R || !AI.Bus || !AI.Population) return;
    clearInterval(wait);
    install(AI);
  }, 100);

  function install(AI) {
    const R = AI.R;
    const MAX = 25;
    const CUTS = [3, 8, 15, MAX];
    const KEY = 'psx.karma.v1';
    const st = {
      value: 0, seed: null, pulse: 0, phase: 'quiet', scene: 0, battle: 0,
      beasts: [], startedAt: 0, restartAt: 0, overlay: null, musicRate: 1,
    };
    const forest = () => !!(AI.Forest && AI.Forest.on() && R.World && R.World.biome === 0);
    const stage = () => CUTS.findIndex((n) => st.value < n) + 1;
    const maxed = () => st.value >= MAX;

    function save() {
      try { localStorage.setItem(KEY, JSON.stringify({ seed: st.seed, value: st.value })); } catch (e) { /* storage may be unavailable */ }
    }
    function reset(seed) {
      st.seed = seed == null ? null : seed;
      st.value = 0;
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved && saved.seed != null && saved.seed === st.seed) st.value = Math.max(0, Math.min(MAX, saved.value | 0));
      } catch (e) { /* ignore invalid saves */ }
      st.phase = 'quiet'; st.scene = st.battle = 0; st.beasts.length = 0; st.restartAt = 0;
      save();
    }

    // A killing blow is innocent only if the victim was not fighting back, and the player has
    // explicitly enabled the existing Wildlife Settings option, Auto-aim: Anyone.
    AI.Bus.on('death', (ev) => {
      if (!AI.enabled || !forest() || ev.killerKey !== 'P' || !ev.victimPeaceful || AI.cfg.autoAim !== 'any') return;
      st.value = Math.min(MAX, st.value + 1);
      save();
      AI.Bus.emit({ type: 'karma', what: 'remembered', x: ev.x, y: ev.y, loud: 0 });
    });

    // Let the existing flee behavior carry the emotion: peaceful Pokémon become increasingly
    // afraid of a nearby player as the hidden run total grows.
    let fearPulse = 0;
    function tick(dt) {
      if (!AI.enabled || !R || !R.Game) return;
      fearPulse -= dt;
      if (forest() && stage() > 0 && fearPulse <= 0) {
        fearPulse = stage() >= 3 ? 1.1 : 1.8;
        const p = R.Game.player;
        if (p) {
          const amount = [0, 0.08, 0.14, 0.2, 0.3][stage()] || 0.3;
          for (const e of R.EnemyMgr.all()) {
            const s = e.psx;
            if (!s || e.dead || s.stance === 'hostile' || (s.combat && s.combat.target === p)) continue;
            if (Math.hypot(e.x - p.x, e.y - p.y) > 620) continue;
            AI.Mind.feel(s, 'fear', amount, 'P');
          }
        }
      }

      if (forest() && maxed()) {
        // Spawn pressure rises naturally through the first three stages; the fourth empties the forest.
        if (AI.Music && AI.Music.st && AI.Music.st.els.forest) {
          const track = AI.Music.st.els.forest;
          track.playbackRate = Math.max(0.62, 1 - Math.max(0, st.value - 14) * 0.035);
          if (track.playbackRate <= 0.63) track.muted = true;
        }
        maybeRejectAtGates(dt);
      }
      if (st.scene > 0) {
        st.scene += dt;
        if (st.scene >= 6 && st.phase === 'judgment') startBattle();
      } else if (st.battle > 0) {
        st.battle += dt;
        keepBeastsUnbeatable();
        if (st.battle >= 34 && !st.restartAt) endRun();
      }
      if (st.restartAt && Date.now() >= st.restartAt) location.reload();
    }

    // Reduce roaming population at higher stages, and prevent every normal spawn at maximum.
    const oldAllow = AI.Population.allowAdd;
    AI.Population.allowAdd = function (e) {
      if (!oldAllow.apply(this, arguments)) return false;
      if (!forest() || !e || e.psxStory || e.boss || e.legend || e.judge || e.dummy || e.elite) return true;
      const k = stage();
      const keep = [1, 1, 1, 0.55, 0][k] || 0;
      if (Math.random() > keep) { AI.stats.spawnVetoed++; return false; }
      return true;
    };

    // Keep the decision hidden and reset it only when the game creates a new world/run.
    const oldWorldReset = R.World.reset;
    if (typeof oldWorldReset === 'function') R.World.reset = function (seed) {
      const out = oldWorldReset.apply(this, arguments);
      reset(seed == null ? (AI.Decor && AI.Decor.seed) : seed);
      return out;
    };
    reset(AI.Decor && AI.Decor.seed != null ? AI.Decor.seed : R.World.seed);

    function maybeRejectAtGates(dt) {
      if (st.phase === 'judgment' || st.phase === 'battle' || !AI.Journey || !AI.Journey.placed) return;
      if (AI.Journey.elapsed < AI.Journey.threshold()) return;
      const p = R.Game.player, g = AI.Mansion && AI.Mansion.geom();
      if (!p || !g || !g.G || Math.hypot(p.x - g.G[0], p.y - g.G[1]) > 180) return;
      st.phase = 'judgment';
      st.scene = 0.001;
      st.startedAt = Date.now();
      if (R.Audio && R.Audio.sfx) try { R.Audio.sfx('boss'); } catch (e) { /* optional */ }
    }

    // Draw the same iron gate closed over the mansion's usual open-gate art.
    const oldDrawItem = AI.Mansion && AI.Mansion.drawItem;
    if (oldDrawItem) AI.Mansion.drawItem = function (ctx, item) {
      oldDrawItem.apply(this, arguments);
      if (!maxed() || !forest() || !item || item.k !== 'mgate') return;
      const x = Math.round(item.x), y = Math.round(item.y) - 12, half = Math.max(58, item.w - 20);
      ctx.save();
      ctx.strokeStyle = '#17131b'; ctx.fillStyle = '#24202a'; ctx.lineWidth = 4;
      for (const side of [-1, 1]) {
        const gx = x + side * half * 0.48;
        ctx.fillRect(gx - 13, y - 126, 26, 146);
      }
      for (let i = -6; i <= 6; i++) {
        const gx = x + i * (half * 2 / 12);
        ctx.beginPath(); ctx.moveTo(gx, y - 122); ctx.lineTo(gx, y + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx - 4, y - 126); ctx.lineTo(gx, y - 136); ctx.lineTo(gx + 4, y - 126); ctx.closePath(); ctx.fill();
      }
      for (const gy of [y - 98, y - 56, y - 16]) { ctx.beginPath(); ctx.moveTo(x - half, gy); ctx.lineTo(x + half, gy); ctx.stroke(); }
      ctx.restore();
    };
    const oldEnter = AI.Mansion && AI.Mansion.enter;
    if (oldEnter) AI.Mansion.enter = function () { if (maxed() && forest()) return false; return oldEnter.apply(this, arguments); };

    // Prevent the player from crossing the center gap while KARMA is maximum.
    if (AI.Mansion && AI.Mansion.blockedExterior) {
      const oldBlocked = AI.Mansion.blockedExterior;
      AI.Mansion.blockedExterior = function (x, y, r) {
        const g = this.geom();
        if (maxed() && forest() && g && g.G && Math.abs(x - g.G[0]) < Math.max(48, g.GO || 0) && Math.abs(y - g.G[1]) < 26 + (r || 12)) return true;
        return oldBlocked.apply(this, arguments);
      };
    }

    function startBattle() {
      if (st.phase !== 'judgment') return;
      st.phase = 'battle'; st.scene = 0; st.battle = 0.001;
      const p = R.Game.player;
      const g = AI.Mansion.geom();
      const anchor = g && g.G ? g.G : [p.x, p.y - 70];
      const defs = [
        { dex: 244, name: 'Entei', spd: 110, behavior: 'chase', range: 230, color: '#ff8245' },
        { dex: 243, name: 'Raikou', spd: 128, behavior: 'shooter', range: 300, color: '#ffe45d' },
        { dex: 245, name: 'Suicune', spd: 96, behavior: 'shooter', range: 290, color: '#99e6ff' },
      ];
      for (let i = 0; i < defs.length; i++) {
        const q = defs[i], dex = R.DEX_BY[q.dex] || { name: q.name };
        let hp = 3000, dmg = 36;
        try { hp = Math.round(Math.max(7 * R.Stats.hpRef(), 2400)); } catch (e) { /* use fallback */ }
        try { dmg = Math.round(R.Enemies.bossDmg(R.Game.st.time)); } catch (e) { /* use fallback */ }
        try {
          const enemy = new R.Enemy({
            dex: q.dex, name: dex.name || q.name, hp, spd: q.spd, dmg, xp: 0, behavior: q.behavior,
            shotDmg: Math.round(dmg * 0.8), shotCd: 0.85, range: q.range,
          }, anchor[0] + (i - 1) * 96, anchor[1] - 130 + Math.abs(i - 1) * 22, { hp: 1, spd: 1, dmg: 1 }, true);
          enemy.psxStory = true; enemy.psxPlaced = true; enemy.psxForceTemp = 'aggressive'; enemy.legend = true; enemy.psxKarmaJudgment = true;
          R.EnemyMgr.add(enemy);
          st.beasts.push(enemy);
        } catch (e) { AI.warn('karma-beasts', e); }
      }
    }

    function keepBeastsUnbeatable() {
      for (const e of st.beasts) {
        if (!e || !R.EnemyMgr.get(e.id)) continue;
        if (e.dead || e.hp <= 0) { e.dead = false; e.hp = Math.max(1, e.maxHp); }
      }
    }

    function endRun() {
      st.phase = 'restart'; st.restartAt = Date.now() + 6500;
      for (const e of st.beasts) if (e) { e.dead = true; e.hp = 0; }
      const over = document.getElementById('scr-over');
      const title = document.getElementById('over-title');
      const stats = document.getElementById('over-stats');
      if (title) title.textContent = 'The forest is silent.';
      if (stats) stats.textContent = 'The Legendary Beasts have passed judgment.';
      if (over) over.classList.remove('hidden');
    }

    // No visible meter: only story text appears at the irreversible confrontation.
    function draw(ctx, w, h) {
      if (!(st.scene > 0) && !(st.battle > 0)) return;
      const t = st.scene || st.battle;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + (st.phase === 'judgment' ? Math.min(0.78, t * 0.12) : 0.22) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f1ece6'; ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
      ctx.font = 'bold ' + Math.max(18, Math.min(34, w * 0.035)) + 'px sans-serif';
      const lines = st.phase === 'judgment'
        ? ['The forest has not forgotten.', 'You are no longer considered a PLAYER.', 'You are a MURDERER.', 'Entei. Raikou. Suicune.']
        : st.phase === 'battle' ? ['Judgment.'] : ['The forest is silent.'];
      lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.38 + i * 42));
      if (st.phase === 'restart') { ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, (Date.now() - (st.restartAt - 6500)) / 1800) + ')'; ctx.fillRect(0, 0, w, h); }
      ctx.restore();
    }
    const oldHud = R.HUD && R.HUD.draw;
    if (oldHud) R.HUD.draw = function (ctx, w, h) { const out = oldHud.apply(this, arguments); try { draw(ctx, w, h); } catch (e) { AI.warn('karma-draw', e); } return out; };

    // Drive this late-loaded feature from the already installed frame loop.
    const oldEnemyUpdate = R.EnemyMgr.update;
    R.EnemyMgr.update = function (dt) {
      try { tick(dt); } catch (e) { AI.warn('karma-tick', e); }
      return oldEnemyUpdate.apply(this, arguments);
    };

    AI.Karma = { get stage() { return stage(); }, get hiddenValue() { return st.value; }, reset };
  }
})();
