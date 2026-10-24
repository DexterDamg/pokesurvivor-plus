/* PokéSurvivor+ — Living World AI · light, fog & precipitation
 * Screen-space atmosphere, drawn where the game draws its weather:
 *  - a light map: the ambient colour of the hour (dawn pinks, midday white, orange-purple evenings,
 *    cool moonlit nights that depend on the moon phase and the clouds) multiplied over the scene,
 *    with local lights added in: lamp posts, swinging lanterns, glowing mushrooms, candles, fire- and
 *    electric-type Pokémon, fire moves, lightning, and your own lantern
 *  - fog from faint morning mist to a wall of white where you can barely see ahead
 *  - rain streaks and splashes, snowflakes, lightning flashes
 *  - sunbeams slanting through the canopy, falling leaves, drips from the branches after rain
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const lm = document.createElement('canvas');
  const lg = lm.getContext('2d');
  let fogTex = null;
  const drops = [], flakes = [], splashes = [], leaves = [];
  const HANDLED = new Set(['rain', 'storm', 'snow', 'fog', 'winds']);
  const GLOWERS = { 313: [255, 240, 120], 314: [255, 220, 150], 170: [140, 220, 255], 171: [150, 230, 255], 92: [190, 120, 255], 93: [190, 120, 255], 94: [190, 120, 255], 200: [200, 120, 255], 429: [200, 120, 255], 302: [180, 120, 255], 353: [170, 140, 255], 355: [255, 150, 90], 608: [255, 150, 90], 609: [170, 120, 255] };

  function on() { return AI.enabled && AI.cfg.atmosphere !== false && AI.Sky; }
  function quality() {
    const q = AI.cfg.lightQuality;
    if (q === 'high') return 2;
    if (q === 'medium') return 3;
    if (q === 'low') return 5;
    return (window.devicePixelRatio || 1) > 1.6 || innerWidth > 1700 ? 4 : 3;
  }
  function lanternOn() {
    const m = AI.cfg.lantern;
    if (m === 'on') return true;
    if (m === 'off') return false;
    if (AI.Player && AI.Player.lanternToggle != null) return AI.Player.lanternToggle;
    return AI.Sky.darkness() > 0.55 || AI.Sky.fog > 0.75;
  }

  // ---------------------------------------------------------------- light sources (world space)
  const L = [];
  function gather(cam) {
    L.length = 0;
    const R = AI.R;
    const Sky = AI.Sky;
    if (AI.Mansion && AI.Mansion.inside) {
      // inside the mansion: candles, chandeliers, moonlight through the windows
      AI.Mansion.lights(L);
      const pl = R.Game.player;
      if (pl && !pl.dead && lanternOn()) L.push({ x: pl.x, y: pl.y - (pl.bodyH || 40) * 0.5, r: 170, c: [255, 214, 150], i: 0.8, player: true });
      return L;
    }
    const x0 = cam.left() - 200, y0 = cam.top() - 200, x1 = cam.left() + cam.w + 200, y1 = cam.top() + cam.h + 260;
    if (AI.Decor && AI.cfg.newArt) {
      for (const it of AI.Decor.lights(x0, y0, x1, y1)) {
        const f = AI.Decor.flame(it);
        if (f <= 0.01) continue;
        let lx = it.x, ly = it.y - 20;
        if (it.k === 'lamp' && AI.Art) { const [w, h] = AI.Art.size(it.n); lx = it.x + (it.n === 'lamppost_r' ? -0.19 : 0.2) * w; ly = it.y - h * 0.67; }
        else if (it.k === 'gallows') { lx = it._lx || it.x; ly = it._ly || it.y - 60; }
        else if (it.k === 'gpillar') ly = it.y - AI.Art.size(it.n)[1] * (it.s || 1) * 0.8;
        else if (it.k === 'hanglamp') {
          // two lanterns hang from the beam
          const w = AI.Art.size(it.n)[0] * (it.s || 1), h = AI.Art.size(it.n)[1] * (it.s || 1);
          L.push({ x: it.x - w * 0.09, y: it.y - h * 0.55, r: it.light.r, c: it.light.c, i: f, src: it });
          lx = it.x + w * 0.09; ly = it.y - h * 0.55;
        } else if (it.k === 'mwin') ly = it.y;
        else if (it.k === 'mush') ly = it.y - 8;
        else if (it.k === 'candle') ly = it.y - 14;
        L.push({ x: lx, y: ly, r: it.light.r * (0.85 + f * 0.15), c: it.light.c, i: f, src: it });
      }
    }
    // lightning lights up everything around where it strikes
    for (const s of AI.Sky.st.strikes) L.push({ x: s.x, y: s.y - 40, r: 520, c: [220, 230, 255], i: Math.max(0, 1 - s.t / 0.5) * s.power * 1.4 });
    const p = R.Game.player;
    if (p && !p.dead) {
      if (lanternOn()) L.push({ x: p.x, y: p.y - (p.bodyH || 40) * 0.5, r: 190, c: [255, 214, 150], i: 0.9 + Math.sin(AI.time * 9) * 0.04, player: true });
      else if (Sky.darkness() > 0.4) L.push({ x: p.x, y: p.y - 20, r: 75, c: [150, 160, 190], i: 0.55 });
    }
    for (const e of R.EnemyMgr.queryCircle(cam.x, cam.y, Math.max(cam.w, cam.h) * 0.75)) {
      if (e.dead) continue;
      const t = e.types || [];
      const g = GLOWERS[e.dex];
      if (t.includes('fire')) L.push({ x: e.x, y: e.y - (e.bodyH || 30) * 0.5, r: 58 + (e.r || 14) * 1.2, c: [255, 150, 70], i: 0.75 + Math.sin(AI.time * 11 + e.id) * 0.12 });
      else if (g) L.push({ x: e.x, y: e.y - (e.bodyH || 30) * 0.5, r: 52, c: g, i: 0.6 + Math.sin(AI.time * 3 + e.id) * 0.2 });
      else if (t.includes('electric') && Math.random() < 0.6) L.push({ x: e.x, y: e.y - (e.bodyH || 30) * 0.5, r: 38, c: [255, 240, 120], i: 0.45 });
    }
    try {
      for (const q of R.Projectiles.all()) {
        const mt = q.mtype;
        if (mt === 'fire') L.push({ x: q.x, y: q.y, r: 64, c: [255, 150, 60], i: 0.85 });
        else if (mt === 'electric') L.push({ x: q.x, y: q.y, r: 46, c: [255, 245, 140], i: 0.7 });
        else if (mt === 'psychic' || mt === 'ghost' || mt === 'fairy') L.push({ x: q.x, y: q.y, r: 34, c: [220, 150, 255], i: 0.5 });
      }
    } catch (e) { /* ignore */ }
    return L;
  }

  // ---------------------------------------------------------------- main draw (screen space)
  function draw(ctx, w, h) {
    const R = AI.R;
    const Sky = AI.Sky;
    const cam = R.Camera;
    const sx = (x) => (x - cam.left()) * cam.scale, sy = (y) => (y - cam.top()) * cam.scale;
    const amb = Sky.ambient();
    const dark = Sky.darkness();
    const lights = gather(cam);
    const needMap = amb[0] < 250 || amb[1] < 250 || amb[2] < 250;
    if (needMap) {
      const q = quality();
      const lw = Math.ceil(w / q), lh = Math.ceil(h / q);
      if (lm.width !== lw || lm.height !== lh) { lm.width = lw; lm.height = lh; }
      lg.globalCompositeOperation = 'source-over';
      lg.fillStyle = 'rgb(' + amb[0] + ',' + amb[1] + ',' + amb[2] + ')';
      lg.fillRect(0, 0, lw, lh);
      lg.globalCompositeOperation = 'lighter';
      const k = 1 / q;
      const night = U.clamp(1 - (amb[0] + amb[1] + amb[2]) / 700, 0, 1);
      for (const l of lights) {
        const x = sx(l.x) * k, y = sy(l.y) * k, r = l.r * cam.scale * k;
        if (x < -r || y < -r || x > lw + r || y > lh + r) continue;
        const a = l.i * (0.35 + night * 0.75);
        const g = lg.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + l.c[0] + ',' + l.c[1] + ',' + l.c[2] + ',' + a.toFixed(3) + ')');
        g.addColorStop(0.45, 'rgba(' + l.c[0] + ',' + l.c[1] + ',' + l.c[2] + ',' + (a * 0.45).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + l.c[0] + ',' + l.c[1] + ',' + l.c[2] + ',0)');
        lg.fillStyle = g;
        lg.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(lm, 0, 0, w, h);
      ctx.restore();
      // glowing halos around the flames once it's dark
      if (dark > 0.2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const l of lights) {
          if (l.player && dark < 0.5) continue;
          const x = sx(l.x), y = sy(l.y), r = Math.min(46, l.r * 0.28) * cam.scale;
          if (x < -r || y < -r || x > w + r || y > h + r) continue;
          const a = l.i * dark * (l.player ? 0.12 : 0.32);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(' + l.c[0] + ',' + l.c[1] + ',' + l.c[2] + ',' + a.toFixed(3) + ')');
          g.addColorStop(1, 'rgba(' + l.c[0] + ',' + l.c[1] + ',' + l.c[2] + ',0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.restore();
      }
    }
    if (!Sky.indoor()) {
      rays(ctx, w, h);
      precipitation(ctx, w, h, cam);
      fog(ctx, w, h, cam, amb);
      strikes(ctx, w, h, cam);
      const fk = AI.cfg.flashIntensity == null ? 1 : AI.cfg.flashIntensity;
      if (Sky.flash > 0.02 && fk > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(220,230,255,' + (Math.min(1, Sky.flash) * 0.3 * fk).toFixed(3) + ')';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
  }

  // a bolt you can see: a jagged glowing channel down from the clouds, the strike frames from the
  // supplied lightning sheet where it touches down, and an impact burst
  function strikes(ctx, w, h, cam) {
    const list = AI.Sky.st.strikes;
    if (!list.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of list) {
      const x = (s.x - cam.left()) * cam.scale, y = (s.y - cam.top()) * cam.scale;
      const life = 1 - s.t / 0.7;
      const blink = s.t < 0.45 ? (Math.sin(s.t * 70) > -0.3 ? 1 : 0.35) : life;
      const rnd = U.rng(s.seed);
      // the channel
      const pts = [[x + (rnd() - 0.5) * 160, -20]];
      const steps = 10;
      for (let k = 1; k <= steps; k++) {
        const ty = -20 + (y + 20) * (k / steps);
        const tx = U.lerp(pts[0][0], x, k / steps) + (k < steps ? (rnd() - 0.5) * 46 : 0);
        pts.push([tx, ty]);
      }
      for (const [wd, a] of [[12, 0.16], [5, 0.45], [2, 0.95]]) {
        ctx.strokeStyle = 'rgba(235,240,255,' + (a * blink * s.power).toFixed(3) + ')';
        ctx.lineWidth = wd;
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
      }
      // a branch or two
      ctx.strokeStyle = 'rgba(220,230,255,' + (0.5 * blink * s.power).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      for (let b = 0; b < 2; b++) {
        const i0 = 2 + ((rnd() * 5) | 0);
        let [bx, by] = pts[i0];
        ctx.beginPath(); ctx.moveTo(bx, by);
        for (let k = 0; k < 3; k++) { bx += (rnd() - 0.5) * 60; by += 20 + rnd() * 30; ctx.lineTo(bx, by); }
        ctx.stroke();
      }
      // touchdown frames and the burst
      if (AI.Art && AI.Art.ready) {
        const sc = cam.scale * 2.4;
        const f = Math.min(5, Math.floor(s.t / 0.07));
        const strike = 'bolt_strike_' + f, burst = 'bolt_burst_' + (Math.floor(s.t / 0.09) % 4);
        ctx.globalAlpha = blink;
        const r1 = AI.Art.IDX[strike], r2 = AI.Art.IDX[burst];
        if (r1) ctx.drawImage(AI.Art.img, r1[0], r1[1], r1[2], r1[3], x - r1[2] * sc / 2, y - r1[3] * sc * 0.92, r1[2] * sc, r1[3] * sc);
        if (r2 && s.t < 0.4) ctx.drawImage(AI.Art.img, r2[0], r2[1], r2[2], r2[3], x - r2[2] * sc * 0.6, y - r2[3] * sc * 0.6, r2[2] * sc * 1.2, r2[3] * sc * 1.2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // sunbeams through the canopy (strongest at dawn/dusk and in thin mist)
  function rays(ctx, w, h) {
    const Sky = AI.Sky;
    const e = Sky.sunElev();
    if (e < 0.04 || Sky.cloud > 0.8 || Sky.rain > 0.3) return;
    const th = AI.Art && AI.Art.theme(AI.Env.biome());
    if (th !== 'forest' && th !== 'jungle') return;
    const mist = Sky.fog;
    const strength = (0.035 + (Sky.hour() < 9 || Sky.hour() > 16 ? 0.04 : 0) + Math.min(0.08, mist * 0.25)) * (1 - Sky.cloud) * Math.min(1, e * 3);
    if (strength < 0.01) return;
    const [dx] = Sky.shadowDir();
    const slant = -dx * 0.55;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const ph = AI.time * 0.02 + i * 1.7;
      const x = ((Math.sin(ph) * 0.5 + 0.5) * 1.3 - 0.15) * w;
      const bw = (60 + i * 30) * (0.8 + 0.2 * Math.sin(AI.time * 0.3 + i));
      const a = strength * (0.6 + 0.4 * Math.sin(AI.time * 0.5 + i * 2));
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,240,200,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + bw, 0); ctx.lineTo(x + bw + slant * h, h); ctx.lineTo(x + slant * h, h);
      ctx.fill();
    }
    ctx.restore();
  }

  function precipitation(ctx, w, h, cam) {
    const Sky = AI.Sky;
    const dt = 1 / 60;
    const [wx] = Sky.windVec();
    const q = quality() >= 4 ? 0.7 : 1;
    // rain
    const nRain = Math.round(Sky.rain * 380 * q);
    while (drops.length < nRain) drops.push({ x: Math.random() * (w + 200) - 100, y: Math.random() * h, v: U.rand(780, 1000), l: U.rand(10, 18) });
    if (drops.length > nRain) drops.length = nRain;
    if (drops.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(200,215,245,0.42)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const vx = wx * 520 - 60;
      for (const d of drops) {
        d.y += d.v * dt; d.x += vx * dt;
        if (d.y > h) { d.y = -20; d.x = Math.random() * (w + 200) - 100; if (Math.random() < 0.3) splashes.push({ x: Math.random() * w, y: h * (0.15 + Math.random() * 0.85), t: 0 }); }
        if (d.x > w + 120) d.x -= w + 220; else if (d.x < -120) d.x += w + 220;
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - vx * 0.016, d.y - d.l);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(210,225,250,0.5)';
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.t += dt;
        if (s.t > 0.3) { splashes.splice(i, 1); continue; }
        const r = 2 + s.t * 18;
        ctx.globalAlpha = 1 - s.t / 0.3;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.35, 0, 0, 6.283); ctx.stroke();
      }
      ctx.restore();
    } else splashes.length = 0;
    // snow
    const nSnow = Math.round(Sky.snow * 260 * q);
    while (flakes.length < nSnow) flakes.push({ x: Math.random() * w, y: Math.random() * h, v: U.rand(30, 70), s: U.rand(1.5, 3.2), p: Math.random() * 6 });
    if (flakes.length > nSnow) flakes.length = nSnow;
    if (flakes.length) {
      ctx.save();
      ctx.fillStyle = 'rgba(245,250,255,0.85)';
      for (const f of flakes) {
        f.y += f.v * dt; f.x += (wx * 120 + Math.sin(AI.time + f.p) * 20) * dt;
        if (f.y > h) { f.y = -4; f.x = Math.random() * w; }
        if (f.x > w) f.x -= w; else if (f.x < 0) f.x += w;
        ctx.fillRect(f.x, f.y, f.s, f.s);
      }
      ctx.restore();
    }
  }

  function getFogTex() {
    if (fogTex) return fogTex;
    fogTex = document.createElement('canvas');
    fogTex.width = fogTex.height = 128;
    const g = fogTex.getContext('2d');
    const img = g.createImageData(128, 128);
    const n = (x, y, s) => { // smooth value noise, tileable
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const h = (a, b) => U.hash(((a % s) + s) % s, ((b % s) + s) % s, 5);
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
    };
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const v = n(x / 32, y / 32, 4) * 0.6 + n(x / 16, y / 16, 8) * 0.3 + n(x / 8, y / 8, 16) * 0.1;
        const i = (y * 128 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(U.clamp((v - 0.3) * 1.6, 0, 1) * 255);
      }
    g.putImageData(img, 0, 0);
    return fogTex;
  }
  function fog(ctx, w, h, cam, amb) {
    const f = AI.Sky.fog;
    if (f < 0.02) return;
    const R = AI.R;
    const p = R.Game.player;
    const lum = (amb[0] + amb[1] + amb[2]) / 765;
    // fog takes the colour of the light around it: white at noon, amber at dusk, deep blue at night
    const fc = amb.map((v) => Math.round(U.clamp(v * 0.82 + 22, 0, 232)));
    const col = (a) => 'rgba(' + fc[0] + ',' + fc[1] + ',' + fc[2] + ',' + a.toFixed(3) + ')';
    ctx.save();
    // a wash over everything
    ctx.fillStyle = col(f * 0.28 * (0.6 + lum * 0.4));
    ctx.fillRect(0, 0, w, h);
    // drifting banks
    const tex = getFogTex();
    const [wx, wy] = AI.Sky.windVec();
    ctx.globalAlpha = Math.min(0.8, f * 0.75) * (0.5 + lum * 0.5);
    const S = 768 * cam.scale * 0.5;
    for (let layer = 0; layer < 2; layer++) {
      const spd = layer ? 14 : 7;
      const ox = -(((cam.left() * cam.scale * (0.8 + layer * 0.3) + AI.time * (spd + wx * 40)) % S) + S) % S;
      const oy = -(((cam.top() * cam.scale * (0.8 + layer * 0.3) + AI.time * (spd * 0.3 + wy * 20)) % S) + S) % S;
      for (let y = oy - S; y < h; y += S) for (let x = ox - S; x < w; x += S) ctx.drawImage(tex, x, y, S, S);
    }
    ctx.globalAlpha = 1;
    // visibility: heavy fog closes in around you until you can barely see ahead
    if (p) {
      const px = (p.x - cam.left()) * cam.scale, py = (p.y - 20 - cam.top()) * cam.scale;
      const inner = U.lerp(Math.max(w, h) * 0.7, 70 * cam.scale, Math.pow(f, 0.85));
      const outer = inner * (1.6 + (1 - f) * 1.4);
      const edge = U.clamp((f - 0.3) * 1.45, 0, 0.97);
      const g = ctx.createRadialGradient(px, py, inner, px, py, outer);
      g.addColorStop(0, col(0));
      g.addColorStop(1, col(edge));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- world-space air pass: leaves, drips
  function drawAir(ctx) {
    if (!on()) return;
    const R = AI.R;
    const Sky = AI.Sky;
    const cam = R.Camera;
    if (Sky.indoor()) { leaves.length = 0; return; }
    const autumn = Sky.season() === 'autumn';
    const wind = Sky.windNow();
    const rate = (autumn && (AI.Art && AI.Art.theme(AI.Env.biome())) !== 'forest' ? 2.2 : 0.25) + wind * 3;
    const th = AI.Art && AI.Art.theme(AI.Env.biome());
    if (th && Math.random() < rate / 60 && leaves.length < 90) {
      const props = R.World.visibleProps(cam).filter((p) => p.type === 'tree');
      const t = props[(Math.random() * props.length) | 0];
      if (t) {
        const green = th === 'forest';
        const cols = autumn && !green ? ['#d9822b', '#c4452a', '#e6b13a', '#9a5a2a'] : Sky.season() === 'winter' && !green ? ['#e8f2ff', '#cfe0f0'] : ['#4c9a3f', '#7cc45a', '#2f7535'];
        leaves.push({ x: t.x + U.rand(-30, 30), y: t.y - U.rand(60, 120), vx: 0, vy: 0, z: U.rand(50, 110), c: U.pick(cols), r: Math.random() * 6, t: 0, drip: false });
      }
    }
    // after the rain, branches keep dripping
    if (th && Sky.wet > 0.35 && Sky.rain < 0.15 && Math.random() < 0.35 && leaves.length < 120) {
      const props = R.World.visibleProps(cam).filter((p) => p.type === 'tree');
      const t = props[(Math.random() * props.length) | 0];
      if (t) leaves.push({ x: t.x + U.rand(-26, 26), y: t.y - U.rand(10, 40), vx: 0, vy: 0, z: U.rand(40, 90), c: '#cfe6ff', r: 0, t: 0, drip: true });
    }
    const [wx, wy] = Sky.windVec();
    const dt = 1 / 60;
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      l.t += dt;
      if (l.drip) l.z -= 220 * dt;
      else { l.z -= (22 + Math.sin(l.t * 3 + l.r) * 10) * dt; l.x += (wx * 120 + Math.sin(l.t * 2 + l.r) * 18) * dt; l.y += (wy * 60) * dt; }
      if (l.z <= 0) {
        if (l.drip && AI.Decor) AI.Decor.ripple(l.x, l.y, 4);
        leaves.splice(i, 1);
        continue;
      }
      ctx.fillStyle = l.c;
      if (l.drip) ctx.fillRect(Math.round(l.x), Math.round(l.y - l.z), 1, 3);
      else { const s = Math.sin(l.t * 6 + l.r) > 0 ? 3 : 2; ctx.fillRect(Math.round(l.x), Math.round(l.y - l.z), s, 2); }
    }
  }

  // ---------------------------------------------------------------- clock & weather pill (HUD)
  const WX = {
    clear: { es: 'Despejado', en: 'Clear', fr: 'Dégagé', zh: '晴朗' }, cloudy: { es: 'Nublado', en: 'Cloudy', fr: 'Nuageux', zh: '多雲' },
    drizzle: { es: 'Llovizna', en: 'Drizzle', fr: 'Bruine', zh: '毛毛雨' }, rain: { es: 'Lluvia', en: 'Rain', fr: 'Pluie', zh: '下雨' },
    storm: { es: 'Tormenta', en: 'Thunderstorm', fr: 'Orage', zh: '雷雨' }, snow: { es: 'Nieve', en: 'Snow', fr: 'Neige', zh: '下雪' },
    mist: { es: 'Neblina', en: 'Mist', fr: 'Brume', zh: '薄霧' }, fog: { es: 'Niebla', en: 'Fog', fr: 'Brouillard', zh: '起霧' },
    deepfog: { es: 'Niebla espesa', en: 'Dense fog', fr: 'Brouillard épais', zh: '濃霧' }, breezy: { es: 'Brisa', en: 'Breezy', fr: 'Venteux', zh: '有風' },
    gale: { es: 'Vendaval', en: 'Gale', fr: 'Tempête', zh: '強風' },
  };
  function wxKey() {
    const S = AI.Sky;
    if (S.storm > 0.5) return 'storm';
    if (S.snow > 0.3) return 'snow';
    if (S.rain > 0.5) return 'rain';
    if (S.rain > 0.12) return 'drizzle';
    if (S.fog > 0.85) return 'deepfog';
    if (S.fog > 0.5) return 'fog';
    if (S.fog > 0.18) return 'mist';
    if (S.windNow() > 0.8) return 'gale';
    if (S.windNow() > 0.5) return 'breezy';
    return S.cloud > 0.6 ? 'cloudy' : 'clear';
  }
  function drawClock(ctx) {
    if (!on() || AI.Sky.indoor()) return;
    const S = AI.Sky;
    const h = S.hour();
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const time = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    const lg = AI.lang ? AI.lang() : 'en';
    const w = WX[wxKey()];
    const label = time + ' · ' + (w[lg] || w.en);
    ctx.save();
    ctx.font = '700 12px Pixelify, "Segoe UI", sans-serif';
    const tw = ctx.measureText(label).width;
    const x = 12, y = 12, bw = tw + 36, bh = 22;
    ctx.fillStyle = 'rgba(10,14,28,0.62)';
    ctx.beginPath(); ctx.moveTo(x + 11, y); ctx.arcTo(x + bw, y, x + bw, y + bh, 11); ctx.arcTo(x + bw, y + bh, x, y + bh, 11); ctx.arcTo(x, y + bh, x, y, 11); ctx.arcTo(x, y, x + bw, y, 11); ctx.fill();
    // sun or moon (with its phase)
    const cx = x + 13, cy = y + 11;
    if (S.sunElev() > 0.05) {
      ctx.fillStyle = S.hour() < 8 || S.hour() > 17 ? '#ffb05a' : '#ffd84a';
      ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, 6.283); ctx.fill();
    } else {
      ctx.fillStyle = '#e8eeff';
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 6.283); ctx.fill();
      const ph = S.moonPhase();
      ctx.fillStyle = 'rgba(10,14,28,0.92)';
      const k = ph <= 0.5 ? ph * 2 : (1 - ph) * 2; // 0 new moon … 1 full moon
      ctx.beginPath(); ctx.arc(cx + (ph <= 0.5 ? -1 : 1) * 12.5 * k, cy, 6.2, 0, 6.283); ctx.fill();
    }
    ctx.fillStyle = '#eaf2ff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 25, cy + 1);
    ctx.restore();
  }

  // ---------------------------------------------------------------- hooks
  function wrapWeatherDraw(orig) {
    return function (ctx, w, h) {
      if (!on()) return orig.apply(this, arguments);
      const k = AI.Sky.weatherKind();
      if (k && !HANDLED.has(k) && !(AI.Mansion && AI.Mansion.inside)) { try { orig.apply(this, arguments); } catch (e) { /* ignore */ } }
      try { draw(ctx, w, h); } catch (e) { AI.warn('light', e); }
    };
  }
  // the game's grey fog vignette is replaced by the visibility model above
  function patchVignette(W) {
    const d = Object.getOwnPropertyDescriptor(W, 'vignette');
    if (!d || !d.get || !d.configurable) return;
    Object.defineProperty(W, 'vignette', { configurable: true, enumerable: true, get() { const v = d.get.call(W); return on() && AI.Sky.weatherKind() === 'fog' ? 0 : v; } });
  }

  AI.define('Light', { draw, drawAir, drawClock, wrapWeatherDraw, patchVignette, gather, lanternOn, lights: L });
})();
