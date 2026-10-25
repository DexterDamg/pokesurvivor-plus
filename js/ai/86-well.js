/* PokéSurvivor+ — Living World AI · the old well
 * Some runs, somewhere in the Shady Forest, an old stone well stands where no one has drawn water
 * for a very long time: blood-streaked stones furred with moss, cobwebs, a rotten roof, a rope that
 * ends in nothing (assets/env/creepy_well.png).
 * It's placed out of sight, never announced. Up close the air goes cold; at night something drips
 * far, far down, and now and then something whispers back. Stand at its rim to look down, and toss
 * in a coin if you have one. Sometimes the bucket comes up with something. Sometimes something else
 * comes up instead. While you carry the Odd Keystone it's always somewhere in the forest, and it's
 * where Spiritomb waits (86-spiritomb.js).
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const st = { well: null, item: null, rolled: false, at: null, standT: 0, lookT: -99, whisperT: 20, eyes: 0, text: null, uses: 0, found: false, ghost: null };

  function on() { return AI.enabled && (AI.cfg.oldWell !== false || spiritomb()) && AI.Forest && AI.Forest.on() && AI.Decor; }
  function spiritomb() { return !!(AI.Spiritomb && AI.Spiritomb.wantsWell()); } // (while you carry the Odd Keystone, it's always there: 86-spiritomb.js)
  function player() { return AI.R.Game.player; }
  function T(en, es) { return (AI.lang && AI.lang() === 'es' && es) || en; }

  // ---------------------------------------------------------------- where it stands (once a run, sometimes)
  function siteOk(x, y) {
    const F = AI.Forest, R = AI.R;
    if (F.water(x, y).e > -60) return false;
    if (F.pathDist(x, y) < 70) return false;
    const r = F.region(x, y);
    if (r.siteK > 0.05 || r.clear > 0.6) return false;
    for (let a = 0; a < 6.28; a += 0.8) if (!R.World.isFree(x + Math.cos(a) * 40, y + Math.sin(a) * 30, 16)) return false;
    if (AI.Decor.blocked && AI.Decor.blocked(x, y, 40)) return false;
    try { const g = AI.Journey && AI.Journey.st.geo; if (g && Math.hypot(x - g.D[0], y - g.D[1]) < 900) return false; } catch (e) { /* ignore */ }
    return Math.hypot(x, y) > 1100; // (not where the run starts)
  }
  function place() {
    const p = player(), R = AI.R;
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * 6.283, d = U.rand(950, 1500);
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.85;
      if (R.Camera.sees(x, y, 200) || !siteOk(x, y)) continue;
      st.well = { x, y, seed: (Math.random() * 1e9) | 0, born: AI.time };
      st.item = AI.Decor.addFixed({ k: 'well', n: null, x, y, s: 1, r: 30, well: true });
      AI.Bus.emit({ type: 'well', what: 'placed', x, y, loud: 0 });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- per frame
  function tick(dt) {
    if (!on() || !AI.R || AI.R.Game.state !== 'playing') return;
    const p = player();
    if (!p || p.dead || (AI.Mansion && AI.Mansion.inside) || (AI.Totem && AI.Totem.active())) return;
    if (!st.rolled) {
      if ((AI.R.Game.time || 0) < (AI.cfg.wellAfter == null ? 120 : AI.cfg.wellAfter)) return;
      st.rolled = true;
      st.wanted = Math.random() < (AI.cfg.wellChance == null ? 0.6 : AI.cfg.wellChance);
    }
    if (!st.wanted && spiritomb()) st.wanted = true;
    if (st.wanted && !st.well) { st.tryT = (st.tryT || 0) - dt; if (st.tryT <= 0) { st.tryT = 3; place(); } }
    const w = st.well;
    if (!w) return;
    const d = Math.hypot(p.x - w.x, p.y - w.y);
    // found it
    if (!st.found && d < 260 && AI.R.Camera.sees(w.x, w.y, 0)) {
      st.found = true;
      if (AI.Exp) AI.Exp.give(2.5, 'the old well', { key: 'well' });
      AI.Bus.emit({ type: 'well', what: 'found', x: w.x, y: w.y, loud: 0 });
    }
    // the cold, and the sounds from below
    const night = AI.Sky && AI.Sky.darkness() > 0.6;
    st.whisperT -= dt;
    if (d < 420 && st.whisperT <= 0) {
      st.whisperT = U.rand(night ? 9 : 18, night ? 20 : 40);
      try { if (AI.Ambience) AI.Ambience.myst(night && Math.random() < 0.5 ? 'whisper' : 'drip', w.x, w.y); } catch (e) { /* ignore */ }
      if (night && Math.random() < 0.35) st.eyes = 2.2; // two points of light, deep down
      AI.Bus.emit({ type: 'well', what: 'sound', x: w.x, y: w.y, loud: 0 });
    }
    st.eyes = Math.max(0, st.eyes - dt);
    if (d < 360 && AI.Sky) AI.Sky.st.gustPow = Math.max(AI.Sky.st.gustPow, 0); // (a stillness around it)
    // looking down: stand at the rim for a moment
    if (d < 62 && Math.hypot(p._vx || 0, p._vy || 0) < 20) st.standT += dt; else st.standT = 0;
    if (st.standT > 1.4 && AI.time - st.lookT > 45) { st.standT = 0; look(w); }
    if (st.text) { st.text.t += dt; if (st.text.t > st.text.life) st.text = null; }
  }
  // what happens when you look in (and toss a coin, if you have one)
  const LOOK = [
    T('You lean over the rim. The dark goes down much further than a well should.', 'Te asomas al brocal. La oscuridad baja mucho más de lo que debería.'),
    T('Cold air breathes up from below, smelling of stone and old water.', 'Un aire frío sube desde abajo, con olor a piedra y agua vieja.'),
    T('Scratched into the inner stones, very small: "the key is down here".', 'Grabado en las piedras de dentro, muy pequeño: «la llave está aquí abajo».'),
    T('For a moment your reflection looks up at you. Then the water goes still and black.', 'Por un momento tu reflejo te mira desde abajo. Luego el agua se queda quieta y negra.'),
  ];
  function look(w) {
    const R = AI.R, p = player();
    st.lookT = AI.time;
    st.uses++;
    let text = LOOK[(st.uses - 1) % LOOK.length];
    const coin = (p.coins || 0) >= 10;
    if (coin) { p.coins -= 10; text += ' ' + T('You toss in a coin… it hits water much, much later than it should.', 'Lanzas una moneda… toca el agua mucho, mucho más tarde de lo que debería.'); }
    st.text = { text, t: 0, life: 6 };
    try { if (AI.Ambience) AI.Ambience.myst('drip', w.x, w.y); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'well', what: 'look', coin, x: w.x, y: w.y, loud: 0 });
    if (!coin) return;
    // what comes back up
    const night = AI.Sky && AI.Sky.darkness() > 0.6;
    const r = Math.random();
    setTimeout(() => {
      try {
        if (r < 0.3) {
          // the bucket comes up with something
          const pick = U.pick(['leftovers', 'shellbell', 'kingsrock', 'scopelens', 'sitrusberry', 'focussash']);
          if (R.Items && R.Items.BY && R.Items.BY[pick]) R.Pickups.drop('item', w.x, w.y + 40, pick);
          else R.Pickups.drop('coin', w.x, w.y + 40, 40);
          st.text = { text: T('The rope creaks. The bucket comes up with something in it.', 'La cuerda cruje. El cubo sube con algo dentro.'), t: 0, life: 4 };
        } else if (r < 0.5) {
          if (AI.Exp) AI.Exp.give(3, 'a wish', { kind: 'wellwish', max: 3 });
          st.text = { text: T('A warm feeling, as if something down there was pleased.', 'Una sensación cálida, como si algo de ahí abajo se alegrara.'), t: 0, life: 4 };
        } else if (r < (night ? 0.75 : 0.62)) {
          rise(w, night);
        } else {
          st.text = { text: T('Nothing. Only the dripping, very far below.', 'Nada. Solo el goteo, muy abajo.'), t: 0, life: 3.5 };
        }
      } catch (e) { AI.warn('well', e); }
    }, 2200);
  }
  // something climbs out
  function rise(w, night) {
    const R = AI.R;
    const dex = night ? U.pick([200, 92, 353]) : U.pick([92, 353]);
    const d = R.DEX_BY[dex];
    if (!d || !R.SPRITE_META[dex] || !AI.Areas) return;
    const T0 = R.Enemies.TIERS, ti = Math.min(T0.length - 1, 1);
    const def = AI.Areas.defFor(d, T0[ti], ti);
    const e = new R.Enemy(def, w.x, w.y + 10, R.Maps.sc({ hp: 1, spd: 1, dmg: 1 }));
    e.psxEvent = true; e.psxPlaced = true; e.psxForceTemp = Math.random() < 0.5 ? 'playful' : 'aggressive';
    R.EnemyMgr.add(e);
    try { R.FX.burst(w.x, w.y - 10, '#9a7bd0', 24, 160); } catch (err) { /* ignore */ }
    st.ghost = e;
    st.text = { text: T('Something climbs out of the dark, giggling.', 'Algo sale trepando de la oscuridad, riéndose.'), t: 0, life: 4 };
    AI.Bus.emit({ type: 'well', what: 'rise', dex, x: w.x, y: w.y, loud: 300 });
  }

  // ---------------------------------------------------------------- drawing
  // the Creepy Well (assets/env/creepy_well.png, cut from DexterDamg's art at its pixel grid): blood on
  // the stones, moss, cobwebs, a rotten roof. The cold mist and the eyes deep down are drawn over it.
  const IMG = new Image();
  IMG.onload = () => { IMG.ok = true; };
  IMG.src = 'assets/env/creepy_well.png';
  const S = 0.9, AX = 53, BOT = 161, SHAFT = [52, 110]; // (scale, anchor column, bottom row, shaft centre in the art)
  function draw(ctx, it) {
    if (!IMG.ok) return drawPlain(ctx, it);
    const x = Math.round(it.x), y = Math.round(it.y);
    const night = AI.Sky ? AI.Sky.darkness() : 0;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,8,0.4)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 44, 14, 0, 0, 6.283); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(IMG, Math.round(x - AX * S), Math.round(y + 8 - BOT * S), Math.round(IMG.width * S), Math.round(IMG.height * S));
    const sx = x + (SHAFT[0] - AX) * S, sy = y + 8 - (BOT - SHAFT[1]) * S;
    // eyes, deep down, at night
    if (st.eyes > 0 && it === st.item) {
      const a = Math.min(1, st.eyes, (2.2 - st.eyes) * 3) * (0.5 + night * 0.5);
      ctx.fillStyle = 'rgba(255,60,60,' + a.toFixed(3) + ')';
      ctx.fillRect(Math.round(sx - 5), Math.round(sy), 2, 1); ctx.fillRect(Math.round(sx + 3), Math.round(sy), 2, 1);
    }
    // a breath of cold mist from the shaft
    const mist = 0.08 + night * 0.12;
    for (let k = 0; k < 3; k++) {
      const t = (AI.time * 0.25 + k / 3) % 1;
      ctx.fillStyle = 'rgba(200,210,225,' + (mist * (1 - t)).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(sx + Math.sin(AI.time + k) * 4, sy - 2 - t * 26, 10 + t * 12, 4 + t * 3, 0, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }
  // (until the art has loaded: drawn by hand, in the forest's palette)
  function drawPlain(ctx, it) {
    const x = Math.round(it.x), y = Math.round(it.y);
    const night = AI.Sky ? AI.Sky.darkness() : 0;
    ctx.save();
    // ground shadow and a ring of trampled dead grass
    ctx.fillStyle = 'rgba(10,12,8,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 46, 16, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(70,62,40,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y + 4, 56, 20, 0, 0, 6.283); ctx.fill();
    // the posts (behind)
    const wood = '#4a3626', woodD = '#2c2018', woodL = '#6a4e36';
    ctx.fillStyle = woodD; ctx.fillRect(x - 31, y - 62, 6, 52); ctx.fillRect(x + 25, y - 62, 6, 52);
    ctx.fillStyle = wood; ctx.fillRect(x - 30, y - 62, 4, 52); ctx.fillRect(x + 26, y - 62, 4, 52);
    // the shaft: dark inside, deeper in the middle
    ctx.fillStyle = '#0a0a0e';
    ctx.beginPath(); ctx.ellipse(x, y - 14, 26, 9, 0, 0, 6.283); ctx.fill();
    const g = ctx.createRadialGradient(x, y - 14, 1, x, y - 14, 24);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(24,26,30,0.9)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 14, 24, 8, 0, 0, 6.283); ctx.fill();
    // eyes, deep down, at night
    if (st.eyes > 0 && it === st.item) {
      const a = Math.min(1, st.eyes, (2.2 - st.eyes) * 3) * (0.5 + night * 0.5);
      ctx.fillStyle = 'rgba(255,60,60,' + a.toFixed(3) + ')';
      ctx.fillRect(x - 5, y - 15, 2, 1); ctx.fillRect(x + 3, y - 15, 2, 1);
    }
    // the stone ring: front stones, with mortar gaps, moss and cracks
    const rnd = U.rng(it.id * 7919 + 13);
    for (let row = 0; row < 3; row++) {
      const yy = y - 12 + row * 6;
      for (let i = -4; i <= 4; i++) {
        const sx = x + i * 6.4 + (row % 2) * 3.2;
        if (Math.abs(sx - x) > 30 - row) continue;
        const shade = 92 + Math.floor(rnd() * 26) - row * 10;
        ctx.fillStyle = 'rgb(' + shade + ',' + (shade + 2) + ',' + (shade - 4) + ')';
        ctx.fillRect(Math.round(sx - 3), yy, 6, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round(sx - 3), yy + 4, 6, 1);
        if (rnd() < 0.3) { ctx.fillStyle = 'rgba(70,104,52,0.85)'; ctx.fillRect(Math.round(sx - 3), yy, 3 + Math.floor(rnd() * 3), 2); }
      }
    }
    // rim stones on top
    ctx.fillStyle = '#7c7c74';
    ctx.beginPath(); ctx.ellipse(x, y - 14, 30, 11, 0, Math.PI, 0); ctx.lineWidth = 4; ctx.strokeStyle = '#6e6e66'; ctx.stroke();
    ctx.lineWidth = 1;
    // the crossbeam, crank and rope
    ctx.fillStyle = woodD; ctx.fillRect(x - 32, y - 64, 64, 5);
    ctx.fillStyle = woodL; ctx.fillRect(x - 32, y - 64, 64, 2);
    ctx.fillStyle = '#5a5a5a'; ctx.fillRect(x + 31, y - 63, 6, 2); ctx.fillRect(x + 35, y - 63, 2, 7);
    const sway = Math.sin(AI.time * 0.9 + it.id) * 1.5;
    ctx.strokeStyle = '#8a7656'; ctx.beginPath(); ctx.moveTo(x, y - 60); ctx.lineTo(x + sway, y - 30); ctx.stroke();
    ctx.fillStyle = '#8a7656'; ctx.fillRect(Math.round(x + sway - 1), y - 31, 3, 2); // (frayed: it ends in nothing)
    // the little roof, rotten and missing shingles
    ctx.fillStyle = '#3a2a1e';
    ctx.beginPath(); ctx.moveTo(x - 40, y - 62); ctx.lineTo(x, y - 84); ctx.lineTo(x + 40, y - 62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4e3a2a';
    for (let i = 0; i < 7; i++) { if (i === 2 || i === 5) continue; const sx = x - 34 + i * 10; ctx.fillRect(sx, y - 66 - Math.max(0, 16 - Math.abs(sx - x) * 0.55), 8, 3); }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 6, y - 76, 3, 10); // (a hole)
    // ivy on the left post and a cobweb on the right
    ctx.fillStyle = 'rgba(60,96,46,0.9)';
    for (let k = 0; k < 6; k++) ctx.fillRect(x - 32 + (k % 2) * 3, y - 58 + k * 8, 4, 3);
    ctx.strokeStyle = 'rgba(220,220,230,0.35)';
    ctx.beginPath(); ctx.moveTo(x + 26, y - 58); ctx.lineTo(x + 18, y - 58); ctx.moveTo(x + 26, y - 58); ctx.lineTo(x + 26, y - 50); ctx.moveTo(x + 26, y - 58); ctx.lineTo(x + 20, y - 52); ctx.stroke();
    // an old bucket, on its side in the weeds
    ctx.fillStyle = '#4a3a2a'; ctx.fillRect(x + 34, y - 4, 9, 7);
    ctx.fillStyle = '#6a6a6a'; ctx.fillRect(x + 34, y - 3, 9, 1); ctx.fillRect(x + 34, y + 1, 9, 1);
    // a breath of cold mist from the shaft
    const mist = 0.08 + night * 0.12;
    for (let k = 0; k < 3; k++) {
      const t = (AI.time * 0.25 + k / 3) % 1;
      ctx.fillStyle = 'rgba(200,210,225,' + (mist * (1 - t)).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(x + Math.sin(AI.time + k) * 4, y - 16 - t * 26, 10 + t * 12, 4 + t * 3, 0, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }
  function drawScreen(ctx, w, h) {
    const t = st.text;
    if (!t || !on()) return;
    const a = Math.min(1, t.t / 0.4, (t.life - t.t) / 0.6);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = 'italic 600 13px Pixelify, "Segoe UI", sans-serif';
    const tw = Math.min(w - 60, ctx.measureText(t.text).width + 36);
    const x = (w - tw) / 2, y = Math.round(h * 0.2); // (clear of the dialogue boxes)
    ctx.fillStyle = 'rgba(8,10,16,0.78)'; ctx.fillRect(x, y, tw, 30);
    ctx.fillStyle = '#c8d0e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t.text, w / 2, y + 15, tw - 20);
    ctx.restore();
  }

  function reset() { Object.assign(st, { well: null, item: null, rolled: false, standT: 0, lookT: -99, whisperT: 20, eyes: 0, text: null, uses: 0, found: false, ghost: null, wanted: false, tryT: 0 }); }

  AI.define('Well', { st, tick, place, siteOk, look, draw, drawScreen, reset });
})();
