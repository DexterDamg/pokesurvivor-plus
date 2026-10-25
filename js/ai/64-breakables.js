/* PokéSurvivor+ — Living World AI · things your attacks can break
 * Your moves can knock down trees and break bushes, dead saplings, fallen logs and stumps (tall
 * grass and rocks already break: the game's own). Not everything: the ancient giants stand, and so
 * do gravestones, statues, fences, signs, lamps, the well, the mansion and its grounds' stonework.
 *   - A tree takes several hits (more the bigger it is), shudders and flashes as it's struck, and
 *     comes down in a burst of leaves and splinters, leaving a stump. Now and then a berry or a few
 *     coins fall out.
 *   - Your Pokémon never aims at a tree on its own: only attacks meant for something else, or aimed
 *     by you, bring one down.
 *   - What's broken stays broken for the rest of the run.
 * The game's own attacks look for destructible props near where they land (World.propsInCircle) and
 * damage them (World.damageProp): trees are made destructible once they've been drawn (their size is
 * known then), and breakable decor is offered to those attacks as stand-ins, never as solid props.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const TREE_HP = { sapling: 30, young: 70, mature: 140, large: 260 }; // (the ancient giants: unbreakable)
  const DECOR_HP = { bush: 20, plant: 30, log: 90, stump: 60 };
  const st = { trees: 0, decor: 0, markT: 0, hooked: false, chopT: 0 };

  function on() { return AI.enabled && AI.cfg.breakables !== false; }
  function level() { try { return AI.R.Game.player.level || 1; } catch (e) { return 1; } }
  function decorBreaks(it) {
    if (!it || it._gone || it.flat || it.protected) return false;
    if (it.k === 'bush' || it.k === 'log' || it.k === 'stump') return true;
    return it.k === 'plant' && /^(deadsapling|sapling)/.test(it.n || '');
  }

  // ---------------------------------------------------------------- trees near you become breakable
  const cam = { _x: 0, _y: 0, w: 0, h: 0, left() { return this._x; }, top() { return this._y; }, sees(x, y, m) { m = m || 0; return x >= this._x - m && x <= this._x + this.w + m && y >= this._y - m && y <= this._y + this.h + m; } };
  function markTrees() {
    const R = AI.R, p = R.Game.player;
    if (!p) return;
    cam._x = p.x - 700; cam._y = p.y - 520; cam.w = 1400; cam.h = 1040;
    let list = [];
    try { list = R.World.visibleProps(cam); } catch (e) { return; }
    const k = 1 + (level() - 1) * 0.05;
    for (const pr of list) {
      if (pr.type !== 'tree' || pr._psxB !== undefined || !pr._psxStage) continue;
      const hp = TREE_HP[pr._psxStage];
      if (!hp) { pr._psxB = false; continue; }
      pr._psxB = true;
      pr.destructible = true;
      pr.hp = pr.maxHp = Math.round(hp * k);
    }
  }

  // ---------------------------------------------------------------- hooks into the game's own breaking
  function hook() {
    const W = AI.R && AI.R.World;
    if (st.hooked || !W || typeof W.damageProp !== 'function') return;
    st.hooked = true;
    const oDamage = W.damageProp, oProps = W.propsInCircle, oNearest = W.nearestBreakable;
    W.damageProp = function (pr, dmg) {
      if (pr && pr.psxBreak) return hitDecor(pr, dmg);
      const tree = pr && pr.type === 'tree' && pr._psxB;
      const broke = oDamage.apply(this, arguments);
      if (tree) try { onTree(pr, broke); } catch (e) { AI.warn('break-tree', e); }
      return broke;
    };
    // breakable decor, offered to attacks as stand-ins (never solid, so nothing walks into them)
    W.propsInCircle = function (x, y, r) {
      const out = oProps.apply(this, arguments);
      if (!on() || !AI.Decor || !Array.isArray(out) || (AI.Mansion && AI.Mansion.inside) || (AI.Totem && AI.Totem.active())) return out;
      for (const it of AI.Decor.inRect(x - r - 30, y - r - 30, x + r + 30, y + r + 30, [])) {
        if (!decorBreaks(it)) continue;
        const ir = it.r || 10;
        if ((it.x - x) * (it.x - x) + (it.y - y) * (it.y - y) > (r + ir) * (r + ir)) continue;
        const pr = it._break || (it._break = { psxBreak: true, item: it, x: it.x, y: it.y, r: ir, type: 'psx-break', solid: false, destructible: true, flash: 0, hp: Math.round((DECOR_HP[it.k] || 30) * (1 + (level() - 1) * 0.05)) });
        if (pr.hp > 0) out.push(pr);
      }
      return out;
    };
    // your Pokémon never picks a tree as its own target (rocks and the like, as before)
    if (typeof oNearest === 'function') W.nearestBreakable = function (x, y, r) {
      const best = oNearest.apply(this, arguments);
      if (!best || best.type !== 'tree') return best;
      let alt = null, bd = r * r;
      for (const pr of oProps.call(W, x, y, r)) {
        if (pr.type === 'tree' || !pr.solid || !(pr.hp > 0) || !isFinite(pr.hp)) continue;
        const d = (pr.x - x) * (pr.x - x) + (pr.y - y) * (pr.y - y);
        if (d < bd) { bd = d; alt = pr; }
      }
      return alt;
    };
  }

  // ---------------------------------------------------------------- what it looks like
  function onTree(pr, broke) {
    const R = AI.R, D = AI.Decor;
    const top = pr.y - (pr._psxStage === 'large' ? 110 : pr._psxStage === 'sapling' ? 34 : 70);
    if (D) D.shakeProp(pr);
    try { R.FX.burst(pr.x, top, '#4f7a34', 3, 50); } catch (e) { /* ignore */ }
    if (st.chopT < AI.time) { st.chopT = AI.time + 0.25; try { if (AI.Ambience) AI.Ambience.branch(pr.x, pr.y); } catch (e) { /* ignore */ } }
    if (!broke) return;
    st.trees++;
    try {
      R.FX.burst(pr.x, top, '#4f7a34', 28, 170); R.FX.burst(pr.x, top + 20, '#6f9a44', 14, 120);
      R.FX.burst(pr.x, pr.y - 10, '#7a5634', 12, 120); R.Camera.kick(pr._psxStage === 'large' ? 0.35 : 0.2);
    } catch (e) { /* ignore */ }
    if (D) D.addDyn({ k: 'stump', n: pr._psxStage === 'large' ? 'stump_big' : pr._psxStage === 'mature' ? 'stump_dark' : 'stump_small', x: pr.x, y: pr.y + 2, r: pr._psxStage === 'large' ? 14 : 10, s: 1 });
    drops(pr.x, pr.y, 0.12, 0.25);
    AI.Bus.emit({ type: 'broke', what: 'tree', stage: pr._psxStage, x: pr.x, y: pr.y, loud: 260 });
  }
  function hitDecor(pr, dmg) {
    const R = AI.R, D = AI.Decor, it = pr.item;
    if (!(pr.hp > 0) || it._gone) return false;
    pr.hp -= dmg;
    const wood = it.k === 'log' || it.k === 'stump';
    if (D) D.shakeItem(it, 0.5);
    try { R.FX.burst(it.x, it.y - 10, wood ? '#a07850' : '#6f9a44', 3, 60); } catch (e) { /* ignore */ }
    if (pr.hp > 0) return false;
    if (D) D.breakItem(it);
    st.decor++;
    try { R.FX.burst(it.x, it.y - 12, wood ? '#7a5634' : '#5a8a3a', wood ? 16 : 12, 120); R.Audio.sfx(wood ? 'break' : 'grass'); } catch (e) { /* ignore */ }
    drops(it.x, it.y, it.k === 'bush' ? 0.15 : 0.04, wood ? 0.2 : 0.06);
    AI.Bus.emit({ type: 'broke', what: it.k, x: it.x, y: it.y, loud: 120 });
    return true;
  }
  function drops(x, y, berry, coin) {
    const R = AI.R, r = Math.random();
    try {
      if (r < berry) R.Pickups.drop('berry', x + U.rand(-8, 8), y, 'oran');
      else if (r < berry + coin) R.Pickups.drop('coin', x + U.rand(-8, 8), y, 2);
    } catch (e) { /* ignore */ }
  }

  function tick(dt) {
    hook();
    if (!on() || !AI.R || !AI.R.Game || AI.R.Game.state !== 'playing') return;
    st.markT -= dt;
    if (st.markT <= 0) { st.markT = 0.5; markTrees(); }
  }
  function reset() { st.trees = 0; st.decor = 0; st.markT = 0; }

  AI.define('Breakables', { st, TREE_HP, DECOR_HP, tick, reset, decorBreaks, markTrees });
})();
