/* PokéSurvivor+ — Living World AI · ghosts that appear out of nowhere, and vanish
 * In the Shady Forest, now and then a ghost Pokémon is simply there: Gastly, Haunter, Misdreavus,
 * Shuppet, Duskull, Drifloon, Litwick, Phantump, Sableye, and once in a long while Gengar or a
 * Dusknoir. It fades in where there was nothing a moment ago, often at the edge of your sight or
 * right behind you, watches you, giggles or whispers, drifts a little, and fades away again. Come
 * too close, or hit it, and it's gone in a puff of purple.
 *   - They're apparitions, not wild Pokémon: they don't fight and can't be defeated or caught.
 *   - More at night and in the fog, fewer by day; never inside the mansion (it has its own ghosts).
 *   - Wild Pokémon that see one are frightened by it.
 * Setting: apparitions.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const GHOSTS = [[92, 6], [93, 3], [200, 4], [353, 4], [355, 3], [425, 3], [607, 3], [708, 3], [302, 2], [94, 1], [477, 0.5]];
  const st = { list: [], nextT: 25, seen: 0, vanished: 0 };

  function on() { return AI.enabled && AI.cfg.apparitions !== false && AI.Forest && AI.Forest.on(); }
  function player() { return AI.R.Game.player; }
  function pickDex() {
    const R = AI.R;
    const pool = GHOSTS.filter(([d]) => R.SPRITE_META[d] && R.Sprites && R.Sprites.Animator);
    let tot = 0;
    for (const [, w] of pool) tot += w;
    let r = Math.random() * tot;
    for (const [d, w] of pool) { if ((r -= w) <= 0) return d; }
    return pool.length ? pool[0][0] : null;
  }
  // how often one turns up: more at night and in the fog
  function gap() {
    const S = AI.Sky, night = S ? S.darkness() : 0, fog = S ? S.fog : 0;
    const k = 1 + night * 1.8 + fog * 1.4;
    return U.rand(55, 110) / k;
  }

  // ---------------------------------------------------------------- appearing
  function appear(dex, at) {
    const R = AI.R, p = player();
    dex = dex || pickDex();
    if (!dex || !p) return null;
    let x, y;
    if (at) { x = at[0]; y = at[1]; }
    else {
      // at the edge of your sight, or right behind you
      const behind = Math.random() < 0.35;
      for (let k = 0; k < 20; k++) {
        const ma = p.moveAngle != null ? p.moveAngle : Math.random() * 6.283;
        const a = behind ? ma + Math.PI + U.rand(-0.6, 0.6) : Math.random() * 6.283;
        const d = behind ? U.rand(130, 210) : U.rand(220, 330);
        x = p.x + Math.cos(a) * d; y = p.y + Math.sin(a) * d * 0.75;
        if (AI.Forest.water(x, y).e < -20 && R.World.isFree(x, y, 10)) break;
      }
    }
    let anim;
    try { anim = new R.Sprites.Animator(dex, 1, false); } catch (e) { return null; }
    const g = { dex, x, y, x0: x, y0: y, t: 0, life: U.rand(2.6, 6), fade: 0, anim, gone: false, puff: false, look: Math.random() < 0.7, drift: U.rand(-1, 1), voiced: false, id: (Math.random() * 1e9) | 0 };
    st.list.push(g);
    st.seen++;
    try { if (AI.Ambience) AI.Ambience.myst(Math.random() < 0.5 ? 'whisper' : 'shimmer', x, y); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'apparition', what: 'appear', dex, x, y, loud: 0 });
    // wild Pokémon nearby that see it get a fright
    try {
      for (const e of R.EnemyMgr.queryCircle(x, y, 280)) if (e.psx && !e.dead && AI.Mind) AI.Mind.feel(e.psx, 'fear', 0.45);
    } catch (e) { /* ignore */ }
    return g;
  }
  function vanish(g, puff) {
    if (g.gone) return;
    g.gone = true; g.puff = !!puff;
    st.vanished++;
    if (puff) {
      try { AI.R.FX.burst(g.x, g.y - 20, '#9a7bd0', 16, 110); if (AI.Ambience) AI.Ambience.myst('whisper', g.x, g.y); } catch (e) { /* ignore */ }
    }
    AI.Bus.emit({ type: 'apparition', what: 'vanish', dex: g.dex, x: g.x, y: g.y, loud: 0 });
  }

  // ---------------------------------------------------------------- per frame
  function hook() {
    const W = AI.R && AI.R.World;
    if (st.hooked || !W || typeof W.propsInCircle !== 'function') return;
    st.hooked = true;
    const o = W.propsInCircle;
    W.propsInCircle = function (x, y, r) { if (st.list.length) try { hitAt(x, y, r || 0); } catch (e) { /* ignore */ } return o.apply(this, arguments); };
  }
  function tick(dt) {
    const R = AI.R;
    hook();
    for (let i = st.list.length - 1; i >= 0; i--) {
      const g = st.list[i];
      g.t += dt;
      try { g.anim.update(dt); } catch (e) { /* ignore */ }
      if (g.gone) { g.fade -= dt * (g.puff ? 6 : 1.4); if (g.fade <= 0) st.list.splice(i, 1); continue; }
      g.fade = Math.min(1, g.fade + dt * 1.2);
      // a slow drift and a bob, face the player if it's watching
      g.x = g.x0 + Math.sin(g.t * 0.7 + g.id) * 14 + g.drift * g.t * 6;
      g.y = g.y0 + Math.cos(g.t * 0.9 + g.id) * 6;
      const p = player();
      if (p) {
        if (g.look) try { g.anim.dir = R.Sprites.dirFromAngle(Math.atan2(p.y - g.y, p.x - g.x)); } catch (e) { /* ignore */ }
        if (!g.voiced && g.t > 1) { g.voiced = true; try { if (AI.Ambience && Math.random() < 0.6) AI.Ambience.myst(Math.random() < 0.5 ? 'whisper' : 'note', g.x, g.y); } catch (e) { /* ignore */ } }
        // come too close and it's gone
        if (Math.hypot(p.x - g.x, p.y - g.y) < 80) { vanish(g, true); continue; }
      }
      if (g.t > g.life) vanish(g, false);
    }
    if (!on() || !R.Game || R.Game.state !== 'playing') return;
    const p = player();
    if (!p || p.dead || (AI.Mansion && AI.Mansion.inside) || (AI.Story && AI.Story.busy && AI.Story.busy())) return;
    st.nextT -= dt;
    if (st.nextT <= 0) { st.nextT = gap(); if (st.list.length < 2) appear(); }
  }
  // an attack landing on it: it's gone (the game's attacks ask what props are in the way)
  function hitAt(x, y, r) {
    for (const g of st.list) if (!g.gone && Math.hypot(g.x - x, g.y - 20 - y) < r + 20) vanish(g, true);
  }

  // ---------------------------------------------------------------- drawing (above everything, see-through)
  function drawAir(ctx) {
    if (!st.list.length) return;
    ctx.save();
    for (const g of st.list) {
      const flick = 0.75 + 0.25 * Math.sin(g.t * 13 + g.id) * Math.sin(g.t * 3.1);
      const a = Math.max(0, Math.min(1, g.fade)) * 0.88 * flick;
      if (a <= 0.01) continue;
      const k = AI.Scale ? AI.Scale.species(g.dex) : 1;
      ctx.save();
      ctx.translate(g.x, g.y); ctx.scale(k, k); ctx.translate(-g.x, -g.y);
      // a cold glow under it
      ctx.globalAlpha = a * 0.35;
      ctx.fillStyle = '#7a5ad0';
      ctx.beginPath(); ctx.ellipse(g.x, g.y, 18, 6, 0, 0, 6.283); ctx.fill();
      try { g.anim.draw(ctx, g.x, g.y - 10, { alpha: a }); } catch (e) { /* ignore */ }
      ctx.restore();
    }
    ctx.restore();
  }

  // above the night's darkness too: a ghost shows through it, pale and faint
  function drawScreen(ctx) {
    if (!st.list.length || !AI.Sky || AI.Sky.darkness() < 0.3) return;
    const cam = AI.R.Camera;
    if (!cam) return;
    const dk = AI.Sky.darkness();
    ctx.save();
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.left(), -cam.top());
    for (const g of st.list) {
      const a = Math.max(0, Math.min(1, g.fade)) * 0.42 * dk * (0.7 + 0.3 * Math.sin(g.t * 11 + g.id));
      if (a <= 0.02) continue;
      const k = AI.Scale ? AI.Scale.species(g.dex) : 1;
      ctx.save();
      ctx.translate(g.x, g.y); ctx.scale(k, k); ctx.translate(-g.x, -g.y);
      try { g.anim.draw(ctx, g.x, g.y - 10, { alpha: a }); } catch (e) { /* ignore */ }
      ctx.restore();
    }
    ctx.restore();
  }
  // a faint cold glow, so they can be seen in the dark (94-light.js)
  function lights(out) {
    for (const g of st.list) { const a = Math.max(0, Math.min(1, g.fade)); if (a > 0.05) out.push({ x: g.x, y: g.y - 24, r: 95, c: [180, 140, 255], i: 0.9 * a }); }
  }
  function reset() { st.list.length = 0; st.nextT = 25; }

  AI.define('Apparitions', { st, GHOSTS, tick, appear, vanish, hitAt, drawAir, drawScreen, lights, reset });
})();
