/* PokéSurvivor+ — Living World AI · ground, shadows & foliage
 * Everything that lies on the ground or stands on it:
 *  - dynamic shadows: trees, bushes, rocks, decor and Pokémon cast shadows from the sun (or the
 *    moon) that turn and stretch through the day and sway with the wind; drifting cloud shadows;
 *    ambient occlusion under trunks, bushes and logs
 *  - wet ground that darkens in the rain, snow cover, puddles that reflect the sky, mud where you
 *    keep walking, footprints, ripples, the old trail's mossy paving stones, burrows, flowers
 *  - the forest itself: varied trees and undergrowth from the supplied art, swaying in the wind,
 *    parting as Pokémon brush through, fading when you walk behind a canopy
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const sc = document.createElement('canvas'); // shadow buffer (screen sized)
  const sg = sc.getContext('2d');
  let blob = null; // soft dark blob used for ambient occlusion / cloud shadows
  function getBlob() {
    if (blob) return blob;
    blob = document.createElement('canvas');
    blob.width = 64; blob.height = 64;
    const g = blob.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return blob;
  }

  function on() { return AI.enabled && AI.cfg.atmosphere !== false; }
  function artOn() { return AI.enabled && AI.cfg.newArt && AI.Art && AI.Art.ready; }
  function swayAt(x, k) {
    const Sky = AI.Sky;
    if (!Sky) return 0;
    const w = Sky.windNow();
    // a gust travels across the clearing as a visible wave
    const wave = Math.sin(AI.time * (1.1 + w) - x * 0.006) * (0.4 + w * 0.6);
    return (w * 0.55 + wave * w * 0.6 + Sky.gust * 0.35) * k * Math.sign(Math.cos(Sky.st.windAng) || 1);
  }

  // ---------------------------------------------------------------- props: art, sway, parting
  function artFor(prop) {
    const Sky = AI.Sky;
    const key = AI.Env.biome() + ':' + (Sky ? Sky.season() : '');
    if (prop._psxArtK === key) return prop._psxArt;
    prop._psxArtK = key;
    const b = AI.Env.biome(), se = Sky ? Sky.season() : 'summer';
    prop._psxArt = prop.type === 'tree' ? AI.Art.treeFor(prop, b, se) : prop.type === 'grass' ? AI.Art.underFor(prop, b, se) : null;
    return prop._psxArt;
  }
  // something brushing through: lean away from it
  function parting(x, y) {
    const R = AI.R;
    let best = 0;
    const p = R.Game.player;
    if (p && Math.abs(p.x - x) < 34 && Math.abs(p.y - y) < 20) best = (x - p.x) / 34;
    for (const e of R.EnemyMgr.queryCircle(x, y, 34)) {
      if (e.dead || Math.abs(e.y - y) > 20) continue;
      const v = (x - e.x) / 34;
      if (Math.abs(v) > Math.abs(best) || !best) best = v;
    }
    return best ? U.clamp(Math.sign(best) * (1 - Math.abs(best)) * 0.6, -0.6, 0.6) : 0;
  }
  function behindCanopy(x, y, w, h) {
    const p = AI.R.Game.player;
    if (!p) return false;
    return p.y < y - 6 && p.y > y - h * 0.92 && Math.abs(p.x - x) < w * 0.42;
  }

  function wrapDrawProp(orig) {
    return function (ctx, prop, t) {
      if (prop && prop.psxDecor) { try { drawItem(ctx, prop.item); } catch (e) { AI.warn('decor', e); } return; }
      if (!artOn() || !prop || AI.R.World.whiteFx) return orig.apply(this, arguments);
      if (prop.type !== 'tree' && prop.type !== 'grass') return orig.apply(this, arguments);
      const name = artFor(prop);
      if (!name || !AI.Art.has(name)) return orig.apply(this, arguments);
      const [w, h] = AI.Art.size(name);
      const flip = U.hash(prop.tx, prop.ty, 77) < 0.5;
      if (prop.type === 'tree') {
        const tall = h > 130 ? 0.45 : 1;
        const sway = swayAt(prop.x, 0.05 * tall) + Math.sin(AI.time * 0.9 + prop.wiggle) * 0.006;
        const fade = behindCanopy(prop.x, prop.y, w, h);
        AI.Art.draw(ctx, name, prop.x, prop.y + 2, { flip, sway, alpha: fade ? 0.55 : null });
      } else {
        const shakeK = AI.Decor ? AI.Decor.shakeOf('p' + prop.tx + ',' + prop.ty) : 0;
        const sway = swayAt(prop.x, 0.12) + parting(prop.x, prop.y) + (shakeK ? Math.sin(AI.time * 40) * shakeK * 0.3 : 0) + Math.sin(2.4 * t + prop.wiggle) * 0.02;
        AI.Art.draw(ctx, name, prop.x, prop.y + 3, { flip, sway });
        if (prop.flash > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, prop.flash * 4) * 0.6; ctx.globalCompositeOperation = 'lighter'; AI.Art.draw(ctx, name, prop.x, prop.y + 3, { flip, sway }); ctx.restore(); }
      }
    };
  }

  // decor that stands up gets sorted with Pokémon, like the game's own props
  const decorProps = [];
  function wrapVisibleProps(orig) {
    return function (cam) {
      const list = orig.apply(this, arguments);
      if (!artOn() || cam !== AI.R.Camera || !AI.Decor) return list;
      AI.Decor.ensure();
      decorProps.length = 0;
      const x0 = cam.left() - 80, y0 = cam.top() - 40, x1 = cam.left() + cam.w + 80, y1 = cam.top() + cam.h + 160;
      for (const it of AI.Decor.inRect(x0, y0, x1, y1)) {
        if (it.flat) continue;
        const pr = it._prop || (it._prop = { psxDecor: true, item: it, x: it.x, y: it.y, flat: false, type: 'psx', tx: 0, ty: 0, r: 0 });
        pr.x = it.x; pr.y = it.y;
        list.push(pr);
      }
      return list;
    };
  }

  // ---------------------------------------------------------------- decor drawing
  function drawItem(ctx, it) {
    const D = AI.Decor;
    const t = AI.time;
    switch (it.k) {
      case 'bush': case 'plant': case 'mush': {
        const k = D.shakeOf('d' + it.id);
        const sway = swayAt(it.x, it.k === 'mush' ? 0.02 : 0.1) + parting(it.x, it.y) * (it.k === 'mush' ? 0 : 1) + (k ? Math.sin(t * 42) * k * 0.35 : 0);
        AI.Art.draw(ctx, it.n, it.x, it.y, { flip: it.f, sway, scale: it.s });
        if (it.k === 'bush' && D.isNibbled(it)) { // bite marks along the edge
          const [w, h] = AI.Art.size(it.n);
          ctx.fillStyle = 'rgba(40,60,30,0.85)';
          for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(it.x - w * 0.35 + i * w * 0.2), Math.round(it.y - h * 0.82 + (i % 2) * 3), 3, 2);
        }
        break;
      }
      case 'log': case 'stump': case 'grave':
        AI.Art.draw(ctx, it.n, it.x, it.y, { flip: it.f, scale: it.s });
        break;
      case 'candle':
        AI.Art.draw(ctx, it.n, it.x, it.y, { scale: 0.8 });
        break;
      case 'lamp':
        AI.Art.draw(ctx, it.n, it.x, it.y, {});
        break;
      case 'gallows': {
        AI.Art.draw(ctx, 'gallows', it.x, it.y, {});
        const [gw, gh] = AI.Art.size('gallows');
        // the lantern hangs from the beam and swings in the wind
        const px = it.x + gw * 0.18, py = it.y - gh + 10;
        const sw = swayAt(it.x, 0.5) + Math.sin(t * 2.1 + it.id) * 0.05;
        ctx.save();
        ctx.translate(Math.round(px), Math.round(py));
        ctx.rotate(-sw * 0.6);
        AI.Art.draw(ctx, 'lantern', 0, AI.Art.size('lantern')[1], {});
        ctx.restore();
        it._lx = px - Math.sin(-sw * 0.6) * 30; it._ly = py + 30;
        break;
      }
      case 'sign':
        AI.Art.draw(ctx, 'sign', it.x, it.y, {});
        if (it.vines) { AI.Art.draw(ctx, 'vines', it.x - 6, it.y + 2, { alpha: 0.95 }); AI.Art.draw(ctx, 'vines', it.x + 10, it.y + 4, { flip: true, scale: 0.8 }); }
        break;
      case 'fence': drawFence(ctx, it); break;
      case 'wraith': {
        const night = AI.Sky ? AI.Sky.darkness() : 0;
        const f = night > 0.5 ? (Math.floor(t * 2.5 + it.frame) % 7) : 3;
        AI.Art.draw(ctx, 'wraith_tree_' + f, it.x, it.y, { alpha: 0.75 + night * 0.25 });
        break;
      }
      case 'cave': drawCave(ctx, it); break;
      default:
        if (it.n) AI.Art.draw(ctx, it.n, it.x, it.y, { flip: it.f, scale: it.s });
    }
  }
  function drawFence(ctx, it) {
    // a rusty iron fence, half swallowed by the undergrowth
    ctx.save();
    ctx.translate(Math.round(it.x), Math.round(it.y));
    const ca = Math.cos(it.ang), sa = Math.sin(it.ang) * 0.4;
    const n = 6;
    for (let i = 0; i < n; i++) {
      if ((it.broken * 7 + i) % 5 === 0) continue; // missing bar
      const ox = (i - n / 2) * 9 * ca, oy = (i - n / 2) * 9 * sa;
      const lean = ((it.broken * 13 + i) % 3 - 1) * 2;
      ctx.fillStyle = '#3d2a22';
      ctx.fillRect(Math.round(ox - 1), Math.round(oy - 34), 3, 34);
      ctx.fillStyle = '#8a5232';
      ctx.fillRect(Math.round(ox + lean * 0.5), Math.round(oy - 38), 2, 6);
      ctx.fillStyle = 'rgba(160,84,40,0.75)';
      ctx.fillRect(Math.round(ox), Math.round(oy - 20 - (i % 3) * 5), 2, 3);
    }
    ctx.strokeStyle = '#4a3026';
    ctx.lineWidth = 2;
    for (const yy of [-28, -12]) { ctx.beginPath(); ctx.moveTo(-n / 2 * 9 * ca, -n / 2 * 9 * sa + yy); ctx.lineTo(n / 2 * 9 * ca, n / 2 * 9 * sa + yy + (it.broken > 0.6 ? 5 : 0)); ctx.stroke(); }
    ctx.restore();
    AI.Art.draw(ctx, 'tuft_5', it.x - 14, it.y + 2, {});
    AI.Art.draw(ctx, 'vines', it.x + 8, it.y + 1, {});
  }
  function drawCave(ctx, it) {
    ctx.save();
    ctx.translate(Math.round(it.x), Math.round(it.y));
    ctx.fillStyle = '#4b4741';
    ctx.beginPath(); ctx.ellipse(0, -18, 46, 34, 0, Math.PI, 0); ctx.lineTo(46, 4); ctx.lineTo(-46, 4); ctx.fill();
    ctx.fillStyle = '#120f0d';
    ctx.beginPath(); ctx.ellipse(0, -6, 26, 22, 0, Math.PI, 0); ctx.lineTo(26, 4); ctx.lineTo(-26, 4); ctx.fill();
    const rocks = [[-16, 0, 13], [8, 2, 15], [-2, -12, 11], [20, -8, 9], [-24, -10, 8]];
    for (const [x, y, r] of rocks) {
      ctx.fillStyle = '#6f6b64'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#8f8a82'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.3, r * 0.45, r * 0.32, 0, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- ground pass
  const pudBuf = [];
  const flat = [];
  function drawGround(ctx) {
    if (!AI.enabled) return;
    const R = AI.R;
    const cam = R.Camera;
    const Sky = AI.Sky;
    const D = AI.Decor;
    const x0 = cam.left() - 60, y0 = cam.top() - 60, x1 = cam.left() + cam.w + 60, y1 = cam.top() + cam.h + 60;
    const atmo = on() && Sky && !Sky.indoor();
    if (D && artOn()) D.ensure();
    // wet ground darkens, snow settles
    if (atmo && Sky.wet > 0.02) { ctx.fillStyle = 'rgba(16,26,46,' + (Sky.wet * 0.2).toFixed(3) + ')'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
    if (atmo && Sky.snowCover > 0.02) {
      ctx.fillStyle = 'rgba(236,243,255,' + (Sky.snowCover * 0.5).toFixed(3) + ')';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    // flat decor: trail stones, burrows, flowers, tufts
    if (D && artOn()) {
      for (const it of D.inRect(x0, y0, x1, y1, flat)) {
        if (!it.flat) continue;
        if (it.k === 'path') drawPath(ctx, it);
        else if (it.k === 'burrow') drawBurrow(ctx, it);
        else AI.Art.draw(ctx, it.n, it.x, it.y, { flip: it.f, scale: it.s, sway: swayAt(it.x, 0.12) + parting(it.x, it.y) });
      }
    }
    if (D && atmo) {
      // mud
      for (let ty = Math.floor(y0 / 22); ty <= Math.floor(y1 / 22); ty++)
        for (let tx = Math.floor(x0 / 22); tx <= Math.floor(x1 / 22); tx++) {
          const m = D.mudAt(tx * 22 + 11, ty * 22 + 11);
          if (m < 0.06) continue;
          ctx.fillStyle = 'rgba(78,54,30,' + Math.min(0.8, m * 0.8).toFixed(3) + ')';
          ctx.beginPath(); ctx.ellipse(tx * 22 + 11, ty * 22 + 11, 15, 10, U.hash(tx, ty, 1) * 3, 0, 6.283); ctx.fill();
          if (Sky.wet > 0.4 && m > 0.4) { ctx.fillStyle = 'rgba(200,215,235,0.18)'; ctx.fillRect(tx * 22 + 6, ty * 22 + 7, 6, 2); }
        }
      // puddles reflect the sky
      const pc = Sky.skyColor();
      for (const p of D.puddlesIn(x0, y0, x1, y1, pudBuf)) {
        // dark wet hollow, irregular, with the sky faintly mirrored in it
        const o = (U.hash(p.tx, p.ty, 35) - 0.5) * p.r * 0.6;
        ctx.fillStyle = 'rgba(14,20,30,0.34)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r + 1, p.r * 0.48 + 1, 0, 0, 6.283); ctx.ellipse(p.x + o, p.y + p.r * 0.15, p.r * 0.7, p.r * 0.36, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(' + Math.round(pc[0] * 0.8) + ',' + Math.round(pc[1] * 0.85) + ',' + Math.round(pc[2] * 0.95) + ',0.3)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 1, p.r * 0.8, p.r * 0.34, 0, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(225,238,255,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.48, 0, 3.6, 5.6); ctx.stroke();
        if (Sky.rain > 0.1 && Math.random() < Sky.rain * 0.25) D.ripple(p.x + (Math.random() - 0.5) * p.r * 1.4, p.y + (Math.random() - 0.5) * p.r * 0.6, 4 + Math.random() * 5);
      }
      ctx.strokeStyle = 'rgba(220,235,255,0.5)';
      ctx.lineWidth = 1;
      for (const r of D.ripples) {
        const k = r.t / 0.9;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * (0.3 + k), r.r * (0.3 + k) * 0.45, 0, 0, 6.283); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // footprints
      const snow = Sky.snowCover > 0.3;
      for (const f of D.prints) {
        if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
        const age = AI.time - f.t;
        const a = U.clamp(1 - age / (snow ? 90 : 45), 0, 1) * f.s;
        if (a < 0.03) continue;
        ctx.fillStyle = snow ? 'rgba(140,160,196,' + (a * 0.55).toFixed(3) + ')' : f.mud ? 'rgba(52,34,18,' + (a * 0.7).toFixed(3) + ')' : 'rgba(18,24,34,' + (a * 0.35).toFixed(3) + ')';
        const ca = Math.cos(f.a), sa = Math.sin(f.a);
        const px = f.x - sa * 4 * f.side, py = f.y + ca * 2 * f.side;
        if (f.k === 0) { ctx.beginPath(); ctx.ellipse(px, py, 3.2 * f.w, 2 * f.w, f.a, 0, 6.283); ctx.fill(); }
        else for (let i = -1; i <= 1; i++) ctx.fillRect(Math.round(px + ca * 2 + i * sa * 2), Math.round(py + sa * 2 - i * ca * 1), 2, 2);
      }
    }
    if (atmo || artOn()) drawShadows(ctx, cam, x0, y0, x1, y1);
    // dawn dew sparkles on the grass
    if (atmo && Sky.hour() > 5 && Sky.hour() < 8.5 && Sky.rain < 0.1 && Math.random() < 0.35) {
      const props = R.World.visibleProps(cam);
      const g = props[(Math.random() * props.length) | 0];
      if (g && (g.type === 'grass' || g.type === 'psx')) R.FX.twinkle(g.x + U.rand(-10, 10), g.y - U.rand(2, 16));
    }
  }

  function drawPath(ctx, it) {
    const ca = Math.cos(it.ang + Math.PI / 2), sa = Math.sin(it.ang + Math.PI / 2);
    for (let i = -1; i <= 1; i++) {
      const h = U.hash(it.id, i, 9);
      if (h < it.over * 0.55) continue; // lost under the grass
      const x = it.x + ca * i * 13 + (h - 0.5) * 4, y = it.y + sa * i * 7 + (h - 0.5) * 3;
      ctx.fillStyle = '#6f6c62';
      ctx.fillRect(Math.round(x - 7), Math.round(y - 4), 14, 9);
      ctx.fillStyle = '#a9a596';
      ctx.fillRect(Math.round(x - 6), Math.round(y - 5), 12, 8);
      ctx.fillStyle = 'rgba(70,120,50,' + (0.25 + it.over * 0.6).toFixed(2) + ')';
      ctx.fillRect(Math.round(x - 6 + h * 6), Math.round(y - 5), 6, 4);
    }
    if (it.over > 0.4) AI.Art.draw(ctx, 'tuft_' + (U.hash(it.id, 1, 1) < 0.5 ? 1 : 5), it.x + 8, it.y + 4, { sway: swayAt(it.x, 0.1) });
  }
  function drawBurrow(ctx, it) {
    ctx.fillStyle = '#7d5c3a';
    ctx.beginPath(); ctx.ellipse(it.x, it.y, 15, 8, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#2a1d12';
    ctx.beginPath(); ctx.ellipse(it.x, it.y + 1, 10, 5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#9c7a52';
    ctx.fillRect(Math.round(it.x + 11), Math.round(it.y - 2), 3, 2);
    ctx.fillRect(Math.round(it.x - 14), Math.round(it.y + 3), 2, 2);
  }

  // ---------------------------------------------------------------- shadows
  function drawShadows(ctx, cam, x0, y0, x1, y1) {
    const R = AI.R;
    const Sky = AI.Sky;
    const atmo = on() && Sky && !Sky.indoor();
    const strength = atmo ? Sky.shadowStrength() : 0;
    const B = getBlob();
    // ambient occlusion: darker ground under trunks, bushes, rocks and logs
    const props = R.World.visibleProps(cam);
    ctx.save();
    ctx.globalAlpha = 0.22;
    for (const p of props) {
      if (p.flat) continue;
      const k = p.type === 'tree' ? 34 : p.type === 'psx' ? (p.item.r || 10) * 1.6 : 20;
      if (p.type === 'psx' && (p.item.k === 'lamp' || p.item.k === 'fence' || p.item.k === 'sign')) continue;
      ctx.drawImage(B, p.x - k, p.y - k * 0.42, k * 2, k * 0.84);
    }
    ctx.restore();
    if (strength < 0.02) return;
    // cast shadows, drawn opaque into a buffer and laid down once (so overlaps don't double up)
    const T = ctx.getTransform();
    const cv = ctx.canvas;
    if (sc.width !== cv.width || sc.height !== cv.height) { sc.width = cv.width; sc.height = cv.height; }
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, sc.width, sc.height);
    sg.setTransform(T);
    const [dx, dy] = Sky.shadowDir();
    const L = Sky.shadowLen();
    const PX = AI.Art ? AI.Art.PX : 2;
    const cast = (src, x, y, w, h, sway, flip) => {
      sg.save();
      sg.translate(x, y);
      sg.transform(1, 0, -dx * L * 0.62 + (sway || 0), -dy * L * 0.62, 0, 0);
      if (flip) sg.scale(-1, 1);
      sg.drawImage(src, -w / 2, -h, w, h);
      sg.restore();
    };
    for (const p of props) {
      if (p.flat) continue;
      if (p.type === 'psx') {
        const it = p.item;
        if (!it.n || !AI.Art.ready) continue;
        const s = AI.Art.silhouette(it.n);
        if (!s) continue;
        const sz = AI.Art.size(it.n);
        cast(s, it.x, it.y, sz[0] * (it.s || 1), sz[1] * (it.s || 1), swayAt(it.x, 0.08), it.f);
        continue;
      }
      let src = null, w = 0, h = 0, flip = false;
      const name = artOn() && (p.type === 'tree' || p.type === 'grass') ? artFor(p) : null;
      if (name && AI.Art.has(name)) { src = AI.Art.silhouette(name); [w, h] = AI.Art.size(name); flip = U.hash(p.tx, p.ty, 77) < 0.5; }
      else {
        try { const sp = R.Tiles.propSprite(AI.Env.biome(), p.type, 0); src = AI.Art.silhouette(sp); w = sp.width * PX; h = sp.height * PX; } catch (e) { src = null; }
      }
      if (src) cast(src, p.x, p.y + 2, w, h, p.type === 'tree' ? swayAt(p.x, 0.06) : swayAt(p.x, 0.12), flip);
    }
    // Pokémon and the player: soft elongated shadows
    sg.fillStyle = '#000';
    const ent = (e, bh) => {
      const lx = dx * L * bh * 0.32, ly = dy * L * bh * 0.32;
      sg.beginPath();
      sg.ellipse(e.x + lx, e.y + ly, (e.r || 14) * 0.85 + Math.abs(lx) * 0.6, (e.r || 14) * 0.38 + Math.abs(ly) * 0.5, Math.atan2(ly, lx || 0.001), 0, 6.283);
      sg.fill();
    };
    for (const e of R.EnemyMgr.drawables(cam)) if (!e.dead && !(e.psx && e.psx.vis && e.psx.vis.alpha < 0.3)) ent(e, e.bodyH || 30);
    const pl = R.Game.player;
    if (pl && !pl.dead) ent(pl, pl.bodyH || 40);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = strength;
    ctx.drawImage(sc, 0, 0);
    ctx.restore();
    // drifting cloud shadows dim whole clearings now and then
    if (Sky.sunElev() > 0.15 && Sky.cloud > 0.15 && Sky.cloud < 0.92) {
      const cell = 900;
      const [wx, wy] = Sky.windVec();
      const ox = AI.time * (20 + wx * 60), oy = AI.time * (6 + wy * 40);
      ctx.save();
      ctx.globalAlpha = 0.16 * Math.min(1, Sky.cloud * 2) * Sky.sunElev();
      for (let cy = Math.floor((y0 - oy) / cell) - 1; cy <= Math.floor((y1 - oy) / cell) + 1; cy++)
        for (let cx = Math.floor((x0 - ox) / cell) - 1; cx <= Math.floor((x1 - ox) / cell) + 1; cx++) {
          if (U.hash(cx, cy, 99) > Sky.cloud * 0.8) continue;
          const bx = cx * cell + ox + U.hash(cx, cy, 98) * cell * 0.5, by = cy * cell + oy + U.hash(cx, cy, 97) * cell * 0.5;
          const r = 260 + U.hash(cx, cy, 96) * 260;
          ctx.drawImage(B, bx - r, by - r * 0.6, r * 2, r * 1.2);
        }
      ctx.restore();
    }
  }

  AI.define('Ground', { drawGround, wrapDrawProp, wrapVisibleProps, drawItem, swayAt, parting });
})();
