/* PokéSurvivor+ — Living World AI · player controls & presence
 * - Press a move's number key (1–4, numpad, or the gamepad slot buttons) to stop that slot's
 *   automatic attacks; press again to resume. Clicking/tapping the slot on the HUD works too.
 * - Auto-aim locks onto Pokémon that are actually hostile, or the one you clicked/tapped to mark
 *   as your target (configurable: 'hostile' | 'prefer' | 'any').
 * - Battle noise: your attacks are audible, so Pokémon nearby hear fights and react.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  AI.playerNoise = { t: -99, x: 0, y: 0 };
  const rects = []; // slot rects captured from the HUD this frame: {x, y, w, h, move}
  let rectsFrame = -1;
  let lastPlayingFrame = -10;

  // A Pokémon counts as a valid automatic target when it's hostile, fighting you, your chosen focus,
  // or right in your manual aim. Peaceful ones are never invulnerable — area attacks still hit them.
  function autoTargetable(p, e) {
    if (e.dead) return false;
    const s = e.psx;
    if (!s) return true; // bosses, legends, vanilla enemies
    if (s.stance === 'hostile' || (s.inCombat && s.combat.target === p) || p.psxFocus === e) return true;
    if (p.manualAim) {
      const a = Math.atan2(e.y - p.y, e.x - p.x);
      if (Math.abs(U.angDiff(p.aim || 0, a)) < 0.35) return true;
    }
    return false;
  }

  function offSet(p) { return p.psxOff || (p.psxOff = new Set()); }
  function isOff(p, m) { return !!(p && p.psxOff && p.psxOff.has(m)); }

  function toggleSlot(p, idx) {
    const slot = p.slots && p.slots[idx];
    if (!slot || !slot.length) return;
    const off = offSet(p);
    const allOff = slot.every((m) => off.has(m));
    for (const m of slot) { if (allOff) off.delete(m); else off.add(m); }
    const R = AI.R;
    if (!allOff) {
      if (slot.some((m) => m.kind === 'orbit')) try { R.Projectiles.clearOrbs(p); } catch (e) { /* ignore */ }
      try { R.Combat.clearFields && slot.some((m) => m.kind === 'trail') && R.Combat.clearFields(p); } catch (e) { /* ignore */ }
    } else for (const m of slot) m.t = Math.min(m.t || 0, 0.15); // resume promptly
    const label = (idx + 1) + ' · ' + (slot[0].name || slot[0].id) + (allOff ? ' ▶' : ' ❚❚');
    try { R.FX.dmgText(p.x, p.y - p.bodyH - 30, label, allOff ? '#7dffb0' : '#ff9a9a', true); } catch (e) { /* ignore */ }
    try { R.Audio.sfx && R.Audio.sfx(allOff ? 'select' : 'back'); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'player-toggle', x: p.x, y: p.y, loud: 0, slot: idx, on: allOff });
  }

  const BLOCKING = ['scr-bond', 'scr-stone', 'scr-item', 'scr-levelup', 'scr-pause', 'scr-evo'];
  function frame() {
    const R = AI.R;
    const p = R.Game.player;
    const playing = R.Game.state === 'playing' && p && !p.dead;
    const prevPlaying = lastPlayingFrame === AI.frame - 1;
    if (playing) lastPlayingFrame = AI.frame;
    if (!playing || !prevPlaying) return; // ignore the key that just closed a menu
    if (BLOCKING.some((id) => document.getElementById(id) && R.UI.isOpen(id))) return;
    if (R.Loot && (R.Loot.open || R.Loot.busy)) return;
    for (let i = 0; i < 4; i++) {
      let hit = false;
      try { hit = R.Input.act('slot' + (i + 1)); } catch (e) { hit = false; }
      if (hit) toggleSlot(p, i);
    }
  }

  // Combat.tick wrapper: skip disabled moves, record battle noise, apply auto-aim mode
  function wrapTick(orig) {
    return function (dt, p, t) {
      if (!p || !AI.enabled) return orig.call(this, dt, p, t);
      const off = p.psxOff;
      const R = AI.R;
      const before = [];
      let group = null;
      try { group = p.activeGroup(); } catch (e) { group = []; }
      for (const m of group) before.push(m.castAt || 0);
      const own = Object.prototype.hasOwnProperty.call(p, 'activeGroup');
      const prevAG = p.activeGroup;
      let restoreAll = null;
      if (off && off.size) {
        const filtered = group.filter((m) => !off.has(m));
        p.activeGroup = function () { return filtered; };
        // a disabled orbit's orbs must not linger
        if (group.some((m) => m.kind === 'orbit' && off.has(m)) && !filtered.some((m) => m.kind === 'orbit')) {
          try { if (R.Projectiles.all().some((q) => q.orb && q.owner === p)) R.Projectiles.clearOrbs(p); } catch (e) { /* ignore */ }
        }
      }
      if (AI.cfg.autoAim === 'hostile') {
        const EM = R.EnemyMgr;
        const origAll = EM.all;
        const hostile = origAll.call(EM).filter((e) => autoTargetable(p, e));
        EM.all = function () { return hostile; };
        restoreAll = () => { EM.all = origAll; };
        if (p.psxFocus && (p.psxFocus.dead || R.EnemyMgr.get(p.psxFocus.id) !== p.psxFocus)) p.psxFocus = null;
      }
      try { return orig.call(this, dt, p, t); }
      finally {
        if (restoreAll) restoreAll();
        if (off && off.size) { if (own) p.activeGroup = prevAG; else delete p.activeGroup; }
        let cast = false;
        group.forEach((m, i) => { if ((m.castAt || 0) !== before[i]) cast = true; });
        if (cast) { AI.playerNoise.t = AI.time; AI.playerNoise.x = p.x; AI.playerNoise.y = p.y; }
      }
    };
  }

  // Player.update wrapper: prefer hostile targets over friendly/neutral Pokémon
  function wrapPlayerUpdate(orig) {
    return function (dt) {
      const r = orig.call(this, dt);
      if (!AI.enabled || AI.cfg.autoAim === 'any' || this.remote || this.manualAim) return r;
      const t = this.target;
      if (!t || !t.psx || t.dead || autoTargetable(this, t)) return r;
      const R = AI.R;
      let best = null, bd = 520 * 520;
      for (const e of R.EnemyMgr.queryCircle(this.x, this.y, 520)) {
        if (!autoTargetable(this, e)) continue;
        if (!R.Camera.sees(e.x, e.y, 0)) continue;
        const d = U.dist2(this.x, this.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        this.target = best;
        this.aim = Math.atan2(best.y - this.y, best.x - this.x);
      } else if (AI.cfg.autoAim === 'hostile') this.target = null;
      return r;
    };
  }

  // HUD: remember where each slot is drawn (MoveTip.zone is called with the exact rect). Like the
  // vanilla tooltip, map it through the context transform to page coordinates for hit-testing.
  let pageBox = null;
  let hudCanvas = null;
  function wrapZone(orig) {
    return function (ctx, x, y, w, h, move) {
      if (rectsFrame !== AI.frame) { rects.length = 0; rectsFrame = AI.frame; pageBox = null; }
      try {
        const T = ctx.getTransform();
        const cv = (hudCanvas = ctx.canvas);
        const b = pageBox || (pageBox = cv.getBoundingClientRect());
        const sx = b.width / cv.width, sy = b.height / cv.height;
        const map = (px, py) => [(T.a * px + T.c * py + T.e) * sx + b.left, (T.b * px + T.d * py + T.f) * sy + b.top];
        const [x0, y0] = map(x, y), [x1, y1] = map(x + w, y + h);
        rects.push({ x, y, w, h, move, T, px0: Math.min(x0, x1), py0: Math.min(y0, y1), px1: Math.max(x0, x1), py1: Math.max(y0, y1) });
      } catch (e) { /* ignore */ }
      return orig.apply(this, arguments);
    };
  }

  function drawHud(ctx) {
    const p = AI.R.Game.player;
    if (!p || !p.psxOff || !p.psxOff.size || rectsFrame !== AI.frame) return;
    for (const r of rects) {
      if (!p.psxOff.has(r.move)) continue;
      ctx.save();
      ctx.setTransform(r.T); // same space the slot was drawn in
      ctx.fillStyle = 'rgba(8,10,18,.62)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.fill();
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      roundRect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 11);
      ctx.stroke();
      ctx.setLineDash([]);
      // pause glyph
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      ctx.fillStyle = '#ffdada';
      ctx.fillRect(cx - 8, cy - 9, 5, 18);
      ctx.fillRect(cx + 3, cy - 9, 5, 18);
      ctx.font = '800 9px Pixelify, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff9a9a';
      ctx.fillText('OFF', cx, r.y + r.h - 4);
      ctx.restore();
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // click / tap on a HUD slot toggles it as well (mobile has no number keys)
  function installPointer() {
    addEventListener('click', (ev) => {
      const R = AI.R;
      if (!R || !AI.enabled || R.Game.state !== 'playing' || rectsFrame < AI.frame - 2) return;
      const cv = ev.target;
      if (!hudCanvas || cv !== hudCanvas) return; // buttons and menus over the game keep their clicks
      const p = R.Game.player;
      if (!p) return;
      for (const r of rects) {
        if (ev.clientX < r.px0 || ev.clientY < r.py0 || ev.clientX > r.px1 || ev.clientY > r.py1) continue;
        const idx = p.slots.findIndex((sl) => sl.includes(r.move));
        if (idx >= 0) { toggleSlot(p, idx); ev.stopPropagation(); }
        return;
      }
      // clicking/tapping a Pokémon marks it as your focus target (click it again to clear)
      const cam = R.Camera;
      const b = cv.getBoundingClientRect();
      const k = (cam._cw || b.width) / Math.max(1, b.width); // page px → camera px
      const wx = cam.left() + ((ev.clientX - b.left) * k) / cam.scale, wy = cam.top() + ((ev.clientY - b.top) * k) / cam.scale;
      let best = null, bd = Infinity;
      for (const e of R.EnemyMgr.queryCircle(wx, wy, 60)) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - wx, e.y - e.bodyH * 0.5 - wy);
        if (d < Math.max(e.r, 18) + 12 && d < bd) { bd = d; best = e; }
      }
      if (best) setFocus(p, p.psxFocus === best ? null : best);
    }, true);
  }

  function setFocus(p, e) {
    p.psxFocus = e;
    try { if (e) AI.R.FX.ring(e.x, e.y, 4, e.r * 2.2, '#ff5f6d', 0.35, 2); } catch (err) { /* ignore */ }
  }

  // red reticle under the focus target (world space)
  function drawFocus(ctx) {
    const p = AI.R.Game.player;
    const e = p && p.psxFocus;
    if (!e || e.dead) return;
    const t = AI.time;
    ctx.save();
    ctx.strokeStyle = '#ff5f6d';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -t * 20;
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, e.r * 1.5, e.r * 0.6, 0, 0, 6.283);
    ctx.stroke();
    ctx.restore();
  }

  AI.define('Player', { isOff, toggleSlot, frame, wrapTick, wrapPlayerUpdate, wrapZone, drawHud, installPointer, rects, autoTargetable, setFocus, drawFocus });
})();
