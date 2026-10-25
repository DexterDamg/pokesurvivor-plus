/* PokéSurvivor+ — Living World AI · the Tropical Ocean, drawn
 * The sea is painted in 512 px chunks (like the Shady Forest's ground): turquoise shallows over sand,
 * deep blue, navy, and the near-black trench, with coral showing through on the reefs, wet sand and
 * foam at every shore, and each island's own ground (black volcanic rock, blossom meadows, jungle,
 * ash). Over it, every frame: waves that run with the wind (bigger, darker and whiter in a storm),
 * pulsing surf, glints of sun, rain rings, the streaks of currents. Then the painted harbour and
 * Birth Island, and the decor: palms, pink blossom trees, coral heads, sea stacks, kelp, buoys,
 * wrecks, ruins, graves. The lighthouse sweeps its beam at night and in fog, and when you can't see
 * it, a faint glow at the edge of the screen shows the way home.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const O = () => AI.Ocean;
  const ART = window.PSXAI_OCEAN_ART || { islands: {}, props: {}, boats: {} };
  const CH = 512, TEX = 2;

  // ---------------------------------------------------------------- images
  function ver() { try { const t = document.querySelector('script[src*="js/ai/34-ocean-draw.js"]'); return (t && (t.getAttribute('src').match(/v=([0-9a-f]+)/) || [])[1]) || ''; } catch (e) { return ''; } }
  const V = ver();
  function img(src) { const i = new Image(); i.onload = () => { i.ok = true; }; i.onerror = () => AI.warn('ocean-art', src); i.src = src + (V ? '?v=' + V : ''); return i; }
  const IMG = { harbor: img('assets/ocean/harbor.webp'), birth: img('assets/ocean/birth.png'), props: img('assets/ocean/props.png'), boats: img('assets/ocean/boats.png'), tri: img('assets/ocean/triangle.png') };
  const PX = 2;
  // a prop from the tropical sheet, bottom-centre at (x, y)
  function drawProp(ctx, name, x, y, o) {
    const r = ART.props[name];
    if (!r || !IMG.props.ok) return false;
    const s = (o && o.scale) || 1;
    const w = r[2] * PX * s, h = r[3] * PX * s;
    ctx.save();
    if (o && o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (o && o.sway) ctx.transform(1, 0, o.sway, 1, 0, 0);
    if (o && o.flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(IMG.props, r[0], r[1], r[2], r[3], Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h));
    ctx.restore();
    return true;
  }
  function propSize(name) { const r = ART.props[name]; return r ? [r[2] * PX, r[3] * PX] : [0, 0]; }

  // ---------------------------------------------------------------- palettes
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const PAL = {
    shallow: ['#86e6d6', '#62d6cf', '#45c3c8', '#33aec0'].map(rgb),
    medium: ['#2a98c9', '#2486bd', '#1f76b0', '#1b67a3'].map(rgb),
    deep: ['#175891', '#134c84', '#104077', '#0d356a'].map(rgb),
    abyss: ['#0a2a4e', '#082242', '#061a35', '#04122a'].map(rgb),
    foam: rgb('#f2fdff'), wetsand: ['#d6c08a', '#cbb47e', '#c1a873'].map(rgb),
    sand: ['#f1e2b4', '#ead9a6', '#e3cf99', '#dbc58c'].map(rgb),
    black: ['#5c5853', '#524e4a', '#47443f', '#3d3a36'].map(rgb), // volcanic sand
    grass: ['#8ec97b', '#96cf82', '#9fd58a', '#86c072'].map(rgb), // (the harbour painting's own greens)
    basalt: ['#3b3a41', '#45444b', '#4f4d55', '#5a5860'].map(rgb),
    scrub: ['#8a8a4a', '#9a9650', '#a8a458'].map(rgb),
    bloom: ['#a6d48e', '#b0da95', '#bce09f', '#c8e6aa'].map(rgb),
    petal: ['#ffc2dc', '#ff9cc6', '#ffe0ee'].map(rgb),
    jungle: ['#3f8d3b', '#47973f', '#51a246', '#5aac4c'].map(rgb),
    junglek: ['#2a6a30', '#307535', '#378039', '#2a5f2c'].map(rgb), // (the dense canopy no one walks through)
    ash: ['#5e5e5b', '#666662', '#6e6d69', '#545452'].map(rgb),
    deadgrass: ['#6e6b52', '#77735a', '#625f48'].map(rgb),
    rock: ['#8a8780', '#95928a', '#7f7c75', '#a29f97'].map(rgb),
    stone: ['#c9c2b0', '#bfb8a6', '#d3ccba'].map(rgb),
    coral: ['#ff8fa3', '#ffb074', '#b78cff', '#ffe27a', '#ff6f8f'].map(rgb),
  };
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const KINDS = ['sea', 'harbor', 'thunder', 'blossom', 'jungle', 'souls', 'rock', 'beach', 'rocky', 'pools', 'shrine', 'crag', 'birth'];
  function kindIdx(x, y) {
    const z = O().zoneAt(x, y);
    if (z.id === 'harbor') return 1;
    if (z.id === 'birth') return 12;
    if (z.isl) return Math.max(0, KINDS.indexOf(z.isl.kind));
    return 0;
  }

  // ---------------------------------------------------------------- the sea, in chunks
  const chunks = new Map();
  let chunkKey0 = null;
  function tideLvl() { return Math.round((O().tide() + 1) * 2); } // 0…4: the painted shallows follow the tide in five steps
  function buildChunk(cx, cy) {
    const Oc = O();
    const p = Oc.plan();
    const s = p.seed;
    const N = CH / TEX, G = 16, GN = CH / G + 1;
    const x0 = cx * CH, y0 = cy * CH;
    const FA = () => new Float32Array(GN * GN);
    const f = { dv: FA(), e: FA(), reef: FA(), kind: new Uint8Array(GN * GN), solid: new Uint8Array(GN * GN) };
    let anyWater = false, anyLand = false;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x = x0 + i * G, y = y0 + j * G, k = j * GN + i;
      const sp = Oc.sample(x, y);
      f.dv[k] = sp.dv; f.e[k] = U.clamp(sp.e, -400, 400); f.reef[k] = sp.reef; f.solid[k] = sp.solid ? 1 : 0;
      if (sp.dv > 0) anyWater = true; else { anyLand = true; f.kind[k] = kindIdx(x, y); }
    }
    const art = Oc.artOf(x0 + CH / 2, y0 + CH / 2, CH) ? true : false;
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d');
    const im = g.createImageData(N, N);
    const D32 = new Uint32Array(im.data.buffer);
    const put = (i, c) => { D32[i] = (255 << 24) | (Math.round(c[2]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[0]); };
    const bil = (arr, gx, gy) => { const ix = Math.min(GN - 2, gx | 0), iy = Math.min(GN - 2, gy | 0), fx = gx - ix, fy = gy - iy, k = iy * GN + ix; return (arr[k] * (1 - fx) + arr[k + 1] * fx) * (1 - fy) + (arr[k + GN] * (1 - fx) + arr[k + GN + 1] * fx) * fy; };
    const lvl = (t) => (t <= 0 ? 0 : t >= 0.999 ? 3 : Math.floor(t * 4));
    const mask = anyWater ? new Uint8Array(N * N) : null; // 1 water
    const foam = anyWater && anyLand ? new Uint8Array(N * N) : null; // 1 surf line, 2 the wash behind it
    const vn = Oc.vn;
    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      const wx = x0 + tx * TEX, wy = y0 + ty * TEX, i = ty * N + tx;
      const gx = (tx * TEX) / G, gy = (ty * TEX) / G;
      const hsh = U.hash(wx >> 1, wy >> 1, s + 9401);
      const cth = vn(wx / 14, wy / 14, s + 9402) * 0.62 + hsh * 0.38;
      let dv = bil(f.dv, gx, gy), e = bil(f.e, gx, gy);
      // (the paintings' own coast is exact)
      if (art) { const a = Oc.artAt(wx, wy); if (a === 0) { dv = Math.max(dv, 0.08); e = Math.max(e, 2); } else if (a > 0) { dv = Math.min(dv, -0.05); } }
      if (dv > 0) {
        mask[i] = 1;
        if (foam && e < 5 + cth * 3) { foam[i] = 1; put(i, PAL.foam); continue; }
        if (foam && e < 16 + cth * 6) foam[i] = 2;
        let c;
        const step = dv - Math.floor(dv), cl = Math.floor(dv);
        const t = step * 0.92 + (cth - 0.5) * 0.3;
        if (cl <= 0) {
          c = PAL.shallow[lvl(t)];
          // sand ripples under the clear water
          if (vn(wx / 9, wy / 30, s + 9403) > 0.68) c = lerp3(c, [200, 240, 220], 0.18);
        } else if (cl === 1) c = PAL.medium[lvl(t)];
        else if (cl === 2) c = PAL.deep[lvl(t)];
        else c = PAL.abyss[lvl(t)];
        // coral and dark rock show through on the reefs
        const rf = bil(f.reef, gx, gy);
        if (rf > 0.12) {
          const n = vn(wx / 12, wy / 12, s + 9404);
          if (n > 0.74 - rf * 0.1 && cth > 0.4) c = lerp3(c, PAL.coral[(U.hash(wx >> 5, wy >> 5, s + 9405) * 5) | 0], 0.3 - Math.min(0.18, dv * 0.12));
          else if (n < 0.16) c = lerp3(c, [40, 80, 90], 0.25);
        }
        if (U.hash(wx >> 3, wy >> 1, s + 9406) > 0.992) c = lerp3(c, [220, 245, 255], 0.3);
        put(i, c);
        continue;
      }
      // ---- land
      const kind = f.kind[Math.round(gy) * GN + Math.round(gx)];
      const tone = vn(wx / 90, wy / 90, s + 9407);
      const shore = -e;
      const beachW = kind === 6 || kind === 8 || kind === 11 ? 10 : kind === 5 ? 26 : 40 + vn(wx / 120, wy / 120, s + 9408) * 34;
      let col;
      if (shore < beachW * (0.7 + cth * 0.5)) {
        const sandP = kind === 2 ? PAL.black : kind === 6 || kind === 8 || kind === 11 ? PAL.rock : kind === 5 ? PAL.ash : PAL.sand;
        col = shore < 9 && sandP === PAL.sand ? PAL.wetsand[lvl(shore / 9 + (hsh - 0.5) * 0.4) % 3] : sandP[lvl(tone + (hsh - 0.5) * 0.4)];
        if (sandP === PAL.sand && hsh > 0.985) col = [255, 250, 240]; // (shells)
        put(i, col);
        continue;
      }
      switch (kind) {
        case 1: col = PAL.junglek[lvl(tone + (cth - 0.5) * 0.5)]; if (vn(wx / 26, wy / 26, s + 9409) > 0.7) col = lerp3(col, [80, 150, 70], 0.4); break;
        case 2: col = PAL.basalt[lvl(tone + (hsh - 0.5) * 0.35)]; if (vn(wx / 16, wy / 16, s + 9410) > 0.8 && cth > 0.45) col = lerp3(col, PAL.scrub[lvl(cth) % 3], 0.55); if (hsh > 0.996) col = [255, 220, 90]; break;
        case 3: col = PAL.bloom[lvl(tone + (hsh - 0.5) * 0.35)]; if (hsh > 0.975) col = PAL.petal[(hsh * 300 | 0) % 3]; break;
        case 4: col = PAL.jungle[lvl(tone + (cth - 0.5) * 0.45)]; if (vn(wx / 40, wy / 40, s + 9411) > 0.7) col = lerp3(col, [20, 50, 22], 0.35); break;
        case 5: col = PAL.ash[lvl(tone + (hsh - 0.5) * 0.35)]; if (vn(wx / 34, wy / 34, s + 9412) > 0.66) col = PAL.deadgrass[lvl(cth) % 3]; break;
        case 6: case 8: case 11: col = PAL.rock[lvl(tone + (hsh - 0.5) * 0.4)]; if (vn(wx / 20, wy / 20, s + 9413) > 0.74) col = lerp3(col, [60, 58, 54], 0.4); break;
        case 9: col = PAL.rock[lvl(tone + (hsh - 0.5) * 0.4)]; if (vn(wx / 28, wy / 28, s + 9414) > 0.66) col = PAL.shallow[1]; break; // (little pools in the rock)
        case 10: col = PAL.stone[lvl(tone) % 3]; if (vn(wx / 30, wy / 30, s + 9415) > 0.6) col = PAL.grass[lvl(cth)]; break;
        default: col = PAL.grass[lvl(tone + (hsh - 0.5) * 0.35)];
      }
      if (f.solid[Math.round(gy) * GN + Math.round(gx)] && kind !== 1) col = lerp3(col, [30, 26, 22], 0.45); // (cliffs)
      put(i, col);
    }
    g.putImageData(im, 0, 0);
    const maskCv = (arr, v, colr) => {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const mg = c.getContext('2d'), mi = mg.createImageData(N, N), M = new Uint32Array(mi.data.buffer);
      for (let k = 0; k < arr.length; k++) if (v(arr[k])) M[k] = colr;
      mg.putImageData(mi, 0, 0);
      return c;
    };
    const mk = mask ? maskCv(mask, (v) => v === 1, 0xffffffff) : null;
    const fm1 = foam ? maskCv(foam, (v) => v === 1, 0xfff8fdff) : null;
    const fm2 = foam ? maskCv(foam, (v) => v === 2, 0xfff8fdff) : null;
    return { cv, mk, fm1, fm2, water: anyWater, tide: tideLvl() };
  }
  function getChunk(cx, cy, allowBuild) {
    const k = cx + ',' + cy;
    let c = chunks.get(k);
    if (c) { c.used = AI.frame; return c; }
    if (!allowBuild) return null;
    c = buildChunk(cx, cy);
    c.used = AI.frame;
    chunks.set(k, c);
    if (chunks.size > 56) { let old = null, ou = Infinity; for (const [kk, v] of chunks) if (v.used < ou) { ou = v.used; old = kk; } if (old) chunks.delete(old); }
    return c;
  }

  // ---------------------------------------------------------------- drawing the sea (replaces the game's ground here)
  let fxCv = null, fxG = null, mkCv = null, mkG = null, waveTile = null;
  function waves() {
    if (waveTile) return waveTile;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < 70; i++) {
      const x = (U.hash(i, 1, 9420) * 128) | 0, y = (U.hash(i, 2, 9420) * 128) | 0, l = 4 + ((U.hash(i, 3, 9420) * 9) | 0);
      g.fillStyle = 'rgba(235,252,255,0.9)'; g.fillRect(x, y, l, 1);
      g.fillStyle = 'rgba(10,40,80,0.5)'; g.fillRect(x + 1, y + 1, l - 1, 1);
      if (x + l > 128) { g.fillStyle = 'rgba(235,252,255,0.9)'; g.fillRect(x - 128, y, l, 1); }
    }
    waveTile = c;
    return c;
  }
  function drawGround(ctx) {
    const Oc = O();
    const p = Oc.plan();
    const key = p.seed;
    if (chunkKey0 !== key) { chunks.clear(); chunkKey0 = key; }
    const cam = AI.R.Camera;
    const x0 = cam.left() - 4, y0 = cam.top() - 4, x1 = cam.left() + cam.w + 4, y1 = cam.top() + cam.h + 4;
    const c0 = Math.floor(x0 / CH), c1 = Math.floor(x1 / CH), r0 = Math.floor(y0 / CH), r1 = Math.floor(y1 / CH);
    const tl = tideLvl();
    let builds = 0;
    const vis = [];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      let c = getChunk(cx, cy, false);
      if (!c) { c = getChunk(cx, cy, true); builds++; }
      // (as the tide turns, the painted shallows follow, one chunk at a time)
      else if (c.tide !== tl && !builds) { chunks.delete(cx + ',' + cy); c = getChunk(cx, cy, true); builds++; }
      ctx.drawImage(c.cv, cx * CH, cy * CH, CH + 1, CH + 1);
      vis.push([cx, cy, c]);
    }
    ctx.restore();
    if (!builds && AI.frame % 5 === 0) {
      outer: for (let cy = r0 - 1; cy <= r1 + 1; cy++) for (let cx = c0 - 1; cx <= c1 + 1; cx++) if (!chunks.has(cx + ',' + cy)) { getChunk(cx, cy, true); break outer; }
    }
    if (vis.some((v) => v[2].water)) drawWaterFx(ctx, vis, x0, y0, x1, y1);
    drawArt(ctx, x0, y0, x1, y1);
  }
  function drawWaterFx(ctx, vis, x0, y0, x1, y1) {
    const Sky = AI.Sky;
    const t = AI.time;
    const w = Math.ceil((x1 - x0) / 2), h = Math.ceil((y1 - y0) / 2);
    if (!fxCv) { fxCv = document.createElement('canvas'); fxG = fxCv.getContext('2d'); mkCv = document.createElement('canvas'); mkG = mkCv.getContext('2d'); }
    if (fxCv.width !== w || fxCv.height !== h) { fxCv.width = mkCv.width = w; fxCv.height = mkCv.height = h; }
    const storm = Sky ? Sky.storm : 0, rain = Sky ? Sky.rain : 0, wind = Sky ? Sky.windNow() : 0.2;
    const g = fxG;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(0.5, 0, 0, 0.5, -x0 * 0.5, -y0 * 0.5);
    g.imageSmoothingEnabled = false;
    // a storm turns the sea dark navy, almost black
    const dark = storm * 0.55 + rain * 0.12 + (Sky ? Sky.cloud * 0.08 : 0);
    if (dark > 0.02) { g.fillStyle = 'rgba(3,10,28,' + dark.toFixed(3) + ')'; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
    // waves running with the wind, two layers at different speeds
    const wv = Sky ? Sky.windVec() : [0.2, 0.05];
    const rough = 0.3 + wind * 0.55 + storm * 0.7;
    const tile = waves();
    const lay = (sc, sp, a) => {
      const S = 128 * sc;
      const ox = ((t * (12 + wv[0] * 60 * sp)) % S + S) % S, oy = ((t * (5 + wv[1] * 60 * sp)) % S + S) % S;
      g.globalAlpha = a;
      for (let yy = Math.floor((y0 - oy) / S) * S + oy; yy < y1; yy += S) for (let xx = Math.floor((x0 - ox) / S) * S + ox; xx < x1; xx += S) g.drawImage(tile, xx, yy, S, S);
    };
    lay(2, 1, Math.min(0.6, 0.16 + rough * 0.22));
    lay(3, 1.6, Math.min(0.5, 0.06 + rough * 0.18));
    g.globalAlpha = 1;
    // whitecaps in strong wind
    if (wind + storm > 0.6) {
      const n = (wind + storm - 0.6) * 60;
      g.fillStyle = 'rgba(245,252,255,0.85)';
      for (let i = 0; i < n; i++) {
        const hh = U.hash(i, Math.floor(t * 0.8 + i * 0.37), 9430);
        const xx = x0 + hh * (x1 - x0), yy = y0 + ((hh * 7.31) % 1) * (y1 - y0);
        const life = (t * 0.8 + i * 0.37) % 1;
        g.globalAlpha = Math.sin(life * Math.PI) * 0.8;
        g.fillRect(Math.round(xx), Math.round(yy), 10 + (hh * 8 | 0), 2);
      }
      g.globalAlpha = 1;
    }
    // keep it on the water
    mkG.setTransform(1, 0, 0, 1, 0, 0);
    mkG.clearRect(0, 0, w, h);
    mkG.setTransform(0.5, 0, 0, 0.5, -x0 * 0.5, -y0 * 0.5);
    mkG.imageSmoothingEnabled = false;
    for (const [cx, cy, c] of vis) if (c.mk) mkG.drawImage(c.mk, cx * CH, cy * CH, CH + 1, CH + 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mkCv, 0, 0);
    g.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fxCv, x0, y0, w * 2, h * 2);
    // the surf: a line of foam that comes and goes, and its wash
    for (const [cx, cy, c] of vis) {
      if (!c.fm1) continue;
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 1.7 + cx * 1.3 + cy * 0.7) + storm * 0.2;
      ctx.drawImage(c.fm1, cx * CH, cy * CH, CH + 1, CH + 1);
      ctx.globalAlpha = Math.max(0, 0.32 * Math.sin(t * 1.7 + cx * 1.3 + cy * 0.7 - 1.4)) + storm * 0.15;
      ctx.drawImage(c.fm2, cx * CH, cy * CH, CH + 1, CH + 1);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    const Oc = O();
    // glints of sun on calm water
    const sun = Sky ? Math.max(0, Sky.sunElev()) * (1 - Sky.cloud * 0.8) : 0.6;
    if (sun > 0.05) {
      ctx.fillStyle = 'rgba(255,255,240,' + (0.55 * sun).toFixed(3) + ')';
      for (let yy = Math.floor(y0 / 28) * 28; yy < y1; yy += 28) for (let xx = Math.floor(x0 / 40) * 40; xx < x1; xx += 40) {
        const hh = U.hash(xx, yy, 9431);
        if (Math.sin(t * 1.1 + hh * 6.28) < 0.86) continue;
        const gx = xx + hh * 22, gy = yy + (hh * 9 % 1) * 16;
        if (Oc.sample(gx, gy).cls < 1) continue;
        ctx.fillRect(Math.round(gx), Math.round(gy), 4, 1); ctx.fillRect(Math.round(gx) + 1, Math.round(gy) - 1, 2, 3);
      }
    }
    // at night the waves glow faintly where they break (plankton)
    const night = Sky ? Sky.darkness() : 0;
    if (night > 0.5) {
      ctx.fillStyle = 'rgba(120,255,230,' + ((night - 0.5) * 0.7).toFixed(3) + ')';
      for (let i = 0; i < 24; i++) {
        const hh = U.hash(i, Math.floor(t * 0.5 + i * 0.13), 9432);
        const gx = x0 + hh * (x1 - x0), gy = y0 + ((hh * 5.7) % 1) * (y1 - y0);
        const sp = Oc.sample(gx, gy);
        if (sp.cls < 1 || sp.e > 60) continue;
        ctx.fillRect(Math.round(gx), Math.round(gy), 2, 2);
      }
    }
    // currents: drifting streaks
    ctx.fillStyle = 'rgba(225,248,255,0.35)';
    for (let yy = Math.floor(y0 / 70) * 70; yy < y1; yy += 70) for (let xx = Math.floor(x0 / 70) * 70; xx < x1; xx += 70) {
      const cu = Oc.currentAt(xx, yy);
      const sp2 = Math.hypot(cu[0], cu[1]);
      if (sp2 < 25 || Oc.sample(xx, yy).cls < 1) continue;
      const hh = U.hash(xx, yy, 9433), ph = (t * 0.35 + hh) % 1;
      const px = xx + cu[0] / sp2 * ph * 60 + hh * 30, py = yy + cu[1] / sp2 * ph * 60;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * Math.min(1, sp2 / 80);
      ctx.save(); ctx.translate(Math.round(px), Math.round(py)); ctx.rotate(Math.atan2(cu[1], cu[0])); ctx.fillRect(-7, 0, 14, 1); ctx.restore();
    }
    ctx.globalAlpha = 1;
    // fish schools in the clear water (they scatter from you)
    const pl = AI.R.Game.player;
    ctx.fillStyle = 'rgba(8,36,56,0.32)';
    for (let yy = Math.floor(y0 / 300) * 300; yy < y1 + 300; yy += 300) for (let xx = Math.floor(x0 / 300) * 300; xx < x1 + 300; xx += 300) {
      const hh = U.hash(xx, yy, 9434);
      if (hh > 0.3) continue;
      let cx = xx + 150 + Math.cos(t * 0.3 + hh * 20) * 70, cy = yy + 150 + Math.sin(t * 0.3 + hh * 20) * 40;
      const sp = Oc.sample(cx, cy);
      if (sp.cls < 1 || sp.cls > 2) continue;
      if (pl) { const d = Math.hypot(cx - pl.x, cy - pl.y); if (d < 140) { cx += (cx - pl.x) / (d || 1) * (140 - d); cy += (cy - pl.y) / (d || 1) * (140 - d); } }
      const ang = t * 0.3 + hh * 20 + Math.PI / 2;
      for (let k = 0; k < 7; k++) {
        const fx = cx + Math.cos(k * 2.4 + hh) * 14 + Math.sin(t * 2 + k) * 2, fy = cy + Math.sin(k * 1.7 + hh) * 9;
        ctx.save(); ctx.translate(Math.round(fx), Math.round(fy)); ctx.rotate(ang); ctx.fillRect(-3, -1, 6, 2); ctx.fillRect(-5, -1, 1, 2); ctx.restore();
      }
    }
    // the whirlpool
    const wh = Oc.plan().whirl;
    if (AI.R.Camera.sees(wh.x, wh.y, wh.R + 40)) {
      ctx.save();
      const g = ctx.createRadialGradient(wh.x, wh.y, 0, wh.x, wh.y, wh.R);
      g.addColorStop(0, 'rgba(2,12,30,0.75)'); g.addColorStop(1, 'rgba(2,12,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(wh.x, wh.y, wh.R, wh.R * 0.7, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = 'rgba(235,252,255,0.6)'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const r = wh.R * (0.18 + i * 0.15), a0 = t * (2.6 - i * 0.3) + i * 1.1;
        ctx.beginPath(); ctx.ellipse(wh.x, wh.y, r, r * 0.7, 0, a0, a0 + 2.1); ctx.stroke();
      }
      ctx.restore();
    }
    // rain rings
    if (Sky && rain > 0.05 && AI.Decor) {
      const n = rain * 22 + storm * 12;
      for (let i = 0; i < n; i++) {
        if (Math.random() > 0.35) continue;
        const rx = x0 + Math.random() * (x1 - x0), ry = y0 + Math.random() * (y1 - y0);
        if (Oc.sample(rx, ry).cls >= 1) AI.Decor.ripple(rx, ry, 3 + Math.random() * (4 + rain * 5));
      }
    }
  }
  // the paintings: the harbour at its own size, Birth Island at twice its pixels
  function drawArt(ctx, x0, y0, x1, y1) {
    const Oc = O();
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const k in Oc.art) {
      const a = Oc.art[k];
      if (!a.on || a.x > x1 || a.y > y1 || a.x + a.w < x0 || a.y + a.h < y0) continue;
      const im = IMG[k === 'harbor' ? 'harbor' : 'birth'];
      if (!im.ok) continue;
      ctx.drawImage(im, a.x, a.y, a.w, a.h);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- the lighthouse
  const LH = { x: -320, y: -474, foot: -332 };
  function beamVis() {
    const Sky = AI.Sky;
    if (!Sky) return 0;
    return U.clamp(Math.max((Sky.darkness() - 0.25) * 1.6, Sky.fog * 1.3, Sky.storm * 0.9, Sky.rain * 0.5), 0, 1);
  }
  function beamAng() { return AI.time * 0.85; }
  function drawBeam(ctx) {
    const v = beamVis();
    if (v < 0.03) return;
    const a = beamAng(), L = 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of [1, -1]) { // (a lamp turns with two lenses, opposite each other)
      const aa = a + (s < 0 ? Math.PI : 0);
      const ex = LH.x + Math.cos(aa) * L, ey = LH.y + Math.sin(aa) * L * 0.7;
      const gr = ctx.createLinearGradient(LH.x, LH.y, ex, ey);
      gr.addColorStop(0, 'rgba(255,246,200,' + (0.42 * v).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,246,200,0)');
      ctx.fillStyle = gr;
      const pa = aa + Math.PI / 2, sp = 0.07;
      ctx.beginPath();
      ctx.moveTo(LH.x + Math.cos(pa) * 4, LH.y + Math.sin(pa) * 4);
      ctx.lineTo(LH.x + Math.cos(aa - sp) * L, LH.y + Math.sin(aa - sp) * L * 0.7);
      ctx.lineTo(LH.x + Math.cos(aa + sp) * L, LH.y + Math.sin(aa + sp) * L * 0.7);
      ctx.lineTo(LH.x - Math.cos(pa) * 4, LH.y - Math.sin(pa) * 4);
      ctx.fill();
    }
    const gl = ctx.createRadialGradient(LH.x, LH.y, 0, LH.x, LH.y, 46);
    gl.addColorStop(0, 'rgba(255,250,215,' + (0.9 * v).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(255,250,215,0)');
    ctx.fillStyle = gl; ctx.fillRect(LH.x - 46, LH.y - 46, 92, 92);
    ctx.restore();
  }
  // when you can't see the lighthouse but its light would carry, a glow at the edge of the screen shows where it is
  function drawBeacon(ctx, w, h) {
    const v = beamVis();
    const R = AI.R, cam = R.Camera, p = R.Game.player;
    if (v < 0.25 || !p || cam.sees(LH.x, LH.y, 40)) return;
    const d = Math.hypot(LH.x - p.x, LH.y - p.y);
    if (d > 9000) return;
    const a = Math.atan2(LH.y - p.y, LH.x - p.x);
    const flash = Math.max(0, Math.cos(beamAng() - a)) ** 6 + Math.max(0, Math.cos(beamAng() + Math.PI - a)) ** 6; // (brighter as the beam swings your way)
    const k = Math.min(w, h) * 0.46;
    let x = w / 2 + Math.cos(a) * k * 1.6, y = h / 2 + Math.sin(a) * k;
    x = U.clamp(x, 22, w - 22); y = U.clamp(y, 22, h - 22);
    ctx.save();
    const al = (0.25 + 0.55 * flash) * v * U.clamp(1.4 - d / 7000, 0.35, 1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
    g.addColorStop(0, 'rgba(255,244,190,' + al.toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,244,190,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 30, y - 30, 60, 60);
    ctx.restore();
  }

  // ---------------------------------------------------------------- decor: what grows and lies where
  const BIG_TREES = ['giant_vine_a', 'giant_vine_b', 'broad_a', 'tree_round_01', 'tree_round_02', 'puff_a', 'puff_b', 'ball_big_a', 'tree_tall_01'];
  function decor(cx, cy, ch, R, push, ok) {
    const Oc = O();
    const p = Oc.plan();
    const x0 = cx * ch, y0 = cy * ch;
    // fixed things: the harbour's beach, the wrecks, buoys along the channel
    fixed(cx, cy, ch, push);
    const N = 40;
    for (let n = 0; n < N; n++) {
      const x = x0 + ((n % 7) + R()) * (ch / 7), y = y0 + (((n / 7) | 0) + R()) * (ch / 7);
      const s = Object.assign({}, Oc.sample(x, y));
      const r1 = R(), r2 = R(), f = R() < 0.5;
      if (s.art >= 0 || s.solid || s.tidal) continue; // (nothing on ground the tide covers and bares)
      if (s.cls >= 1) {
        // at sea: coral heads on the reefs, kelp at the edges of the shallows, the odd sea stack
        if (s.reef > 0.3 && r1 < 0.5) push({ k: 'ocean', n: 'coral', x, y, s: 0.8 + r2 * 0.6, f, water: true, r: s.cls === 1 ? 9 : 0, col: (r2 * 5) | 0 });
        else if (s.cls <= 2 && s.e > 30 && s.e < 200 && r1 < 0.12) push({ k: 'ocean', n: 'kelp', x, y, s: 0.8 + r2 * 0.5, f, water: true, flat: true });
        else if (s.cls === 2 && r1 > 0.995) push({ k: 'ocean', n: 'stack', x, y, s: 1.2 + r2 * 0.6, f, r: 16 });
        continue;
      }
      const z = Object.assign({}, Oc.zoneAt(x, y));
      const shore = -s.e;
      if (z.id === 'harbor') {
        // the mainland: palms along its beaches; nothing walks into the jungle behind
        if (shore > 30 && shore < 70 && r1 < 0.5 && ok(x, y, 10)) push({ k: 'ocean', n: r2 < 0.5 ? 'palm_a' : 'palm_b', x, y, f, r: 8, sway: true });
        continue;
      }
      const o = z.isl;
      if (!o) continue;
      const dc = Math.hypot(x - o.x, y - o.y);
      if (dc < (o.arenaR || 0) + 26) continue; // (the arena dresses itself: 82-guardians.js)
      if (!ok(x, y, 8)) continue;
      const beach = shore < 60;
      switch (o.kind) {
        case 'thunder':
          if (beach) { if (r1 < 0.12) push({ k: 'ocean', n: 'rock_grey', x, y, s: 0.8 + r2 * 0.4, f, r: 12 }); break; }
          if (r1 < 0.16) push({ k: 'ocean', n: 'rock_red', x, y, s: 0.9 + r2 * 0.5, f, r: 13 });
          else if (r1 < 0.3) push({ k: 'ocean', n: 'rock_grey', x, y, s: 0.9 + r2 * 0.6, f, r: 13 });
          else if (r1 < 0.4) push({ k: 'ocean', n: 'shard', x, y, s: 0.8 + r2 * 0.6, f, r: 7, light: { r: 34, c: [255, 230, 90], kind: 'glow' } });
          else if (r1 < 0.5) push({ k: 'plant', n: r2 < 0.5 ? 'deadsapling_a' : 'deadsapling_b', x, y, f, r: 6 });
          else if (r1 < 0.62) push({ k: 'tuft', n: 'tuft_3', x, y, f, flat: true });
          break;
        case 'blossom':
          if (beach) { if (r1 < 0.2) push({ k: 'ocean', n: r2 < 0.5 ? 'palm_a' : 'palm_b', x, y, f, r: 8, sway: true }); break; }
          if (r1 < 0.14) push({ k: 'ocean', n: r2 < 0.5 ? 'pink_a' : 'pink_b', x, y, f, r: 12, sway: true });
          else if (r1 < 0.24) push({ k: 'ocean', n: 'rafflesia', x, y, f, r: 0 });
          else if (r1 < 0.5) push({ k: 'flower', n: ['flower_a1', 'flower_b4', 'flower_c0', 'flower_s2', 'flower_a3'][(r2 * 5) | 0], x, y, s: 0.8, f, flat: true });
          else if (r1 < 0.58) push({ k: 'stone', n: 'x_runestone', x, y, s: 0.6 + r2 * 0.3, f, r: 8 });
          else if (r1 < 0.7) push({ k: 'tuft', n: 'tuft_1', x, y, f, flat: true });
          break;
        case 'jungle':
          if (beach) { if (r1 < 0.3) push({ k: 'ocean', n: r2 < 0.5 ? 'palm_a' : 'palm_b', x, y, f, r: 8, sway: true }); break; }
          if (r1 < 0.2) push({ k: 'ocean', n: r2 < 0.5 ? 'palm_a' : 'palm_b', x, y, f, s: 1.15, r: 8, sway: true });
          else if (r1 < 0.32) push({ k: 'tree', n: BIG_TREES[(r2 * BIG_TREES.length) | 0], x, y, f, r: 14, sway: true, s: 1.1 });
          else if (r1 < 0.52) push({ k: 'plant', n: ['w_fern_a', 'w_fern_b', 'w_fern_c', 'fern', 'w_bracken'][(r2 * 5) | 0], x, y, s: 1.1, f, hab: 'bush', r: 0 });
          else if (r1 < 0.6) push({ k: 'bush', n: ['bushball_00', 'bushball_11', 'bush_wide', 'bushtiny_13'][(r2 * 4) | 0], x, y, f, hab: 'bush', r: 0 });
          else if (r1 < 0.64) push({ k: 'stone', n: r2 < 0.5 ? 'g_pillar' : 'x_shrine', x, y, f, r: 12 });
          else if (r1 < 0.66) push({ k: 'ocean', n: r2 < 0.5 ? 'tiki_a' : 'tiki_b', x, y, f, r: 7 });
          else if (r1 < 0.7) push({ k: 'plant', n: 'vines', x, y, f, r: 0 });
          break;
        case 'souls':
          if (beach) { if (r1 < 0.08) push({ k: 'litter', n: 'w_branch', x, y, f, flat: true }); break; }
          if (r1 < 0.14) push({ k: 'tree', n: r2 < 0.5 ? 'haunt_tree_a' : 'haunt_tree_b', x, y, f, r: 12 });
          else if (r1 < 0.3) push({ k: 'grave', n: ['g_grave_a', 'g_grave_cross', 'g_grave_tall', 'g_grave_pale', 'grave_a', 'grave_b', 'cross'][(r2 * 7) | 0], x, y, s: 0.8, f, r: 9 });
          else if (r1 < 0.36) push({ k: 'stone', n: r2 < 0.5 ? 'g_pillar' : 'g_wall_grey', x, y, f, r: 12 });
          else if (r1 < 0.42) push({ k: 'plant', n: r2 < 0.5 ? 'deadsapling_a' : 'haunt_weed_a', x, y, f, r: 0 });
          else if (r1 < 0.46) push({ k: 'mush', n: 'ghostshroom_s', x, y, s: 0.8, f, r: 0, light: { r: 40, c: [150, 210, 255], kind: 'glow' } });
          else if (r1 < 0.5) push({ k: 'grave', n: r2 < 0.5 ? 'g_skull_a' : 'g_skull_b', x, y, s: 0.6, f, r: 0 });
          break;
        case 'rock': case 'crag': case 'rocky':
          if (r1 < 0.22) push({ k: 'ocean', n: 'rock_grey', x, y, s: 0.9 + r2 * 0.7, f, r: 14 });
          else if (r1 < 0.32) push({ k: 'stone', n: r2 < 0.5 ? 'w_moss_stone_a' : 'w_moss_stone_b', x, y, f, r: 9 });
          else if (o.kind === 'rock' && r1 < 0.4) push({ k: 'ocean', n: 'nest', x, y, f, flat: true });
          break;
        case 'beach':
          if (r1 < 0.16 && shore > 30) push({ k: 'ocean', n: r2 < 0.5 ? 'palm_a' : 'palm_b', x, y, f, r: 8, sway: true });
          else if (r1 < 0.22) push({ k: 'ocean', n: 'shells', x, y, f, flat: true });
          else if (r1 < 0.26) push({ k: 'log', n: 'log_fallen', x, y, f, r: 18 });
          break;
        case 'pools':
          if (r1 < 0.3) push({ k: 'ocean', n: 'pool', x, y, s: 0.8 + r2 * 0.7, f, flat: true });
          else if (r1 < 0.4) push({ k: 'ocean', n: 'rock_grey', x, y, s: 0.7 + r2 * 0.4, f, r: 10 });
          else if (r1 < 0.46) push({ k: 'ocean', n: 'shells', x, y, f, flat: true });
          break;
        case 'shrine':
          if (r1 < 0.14) push({ k: 'stone', n: r2 < 0.6 ? 'g_pillar' : 'x_runestone', x, y, f, r: 11 });
          else if (r1 < 0.24) push({ k: 'litter', n: r2 < 0.5 ? 'stonepath' : 'steppingstone', x, y, f, flat: true });
          else if (r1 < 0.3) push({ k: 'ocean', n: 'rock_grey', x, y, s: 0.8, f, r: 10 });
          break;
      }
    }
  }
  // things with a fixed place
  function fixed(cx, cy, ch, push) {
    const Oc = O();
    const p = Oc.plan();
    const inC = (x, y) => Math.floor(x / ch) === cx && Math.floor(y / ch) === cy;
    const H = Oc.HARBOR;
    // the harbour's east beach: palms, a few crates and barrels (the painting's beach is bare)
    const beach = [[380, -430, 'palm_a'], [470, -300, 'palm_b'], [520, -190, 'palm_a'], [420, -150, 'palm_b'], [355, -260, 'palm_b']];
    for (const [x, y, n] of beach) if (inC(x, y)) push({ k: 'ocean', n, x, y, r: 8, sway: true, f: x % 2 === 0 });
    for (const [x, y, n] of [[-250, -112, 'barrel'], [-228, -104, 'barrel'], [150, -112, 'crate'], [172, -110, 'crate'], [160, -132, 'crate']]) if (inC(x, y)) push({ k: n === 'barrel' ? 'stone' : 'ocean', n, x, y, r: 9, s: n === 'barrel' ? 0.8 : 1 });
    // buoys mark the way out of the harbour
    for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
      const x = 40 + side * 170 + i * 30, y = 260 + i * 220;
      if (inC(x, y)) push({ k: 'ocean', n: 'buoy', x, y, col: side < 0 ? 0 : 1, r: 8, light: { r: 30, c: side < 0 ? [255, 90, 80] : [110, 255, 140], kind: 'glow' } });
    }
    for (const w of p.wrecks) if (inC(w.x, w.y)) push({ k: 'ocean', n: 'wreck', x: w.x, y: w.y, ang: w.ang, ghost: w.ghost, rect: true, light: w.ghost ? { r: 60, c: [130, 255, 190], kind: 'glow' } : null });
    // the Seel colony's grotto
    const gc = p.grotto.cave;
    if (inC(gc[0], gc[1])) push({ k: 'cave', x: gc[0], y: gc[1], r: 30 });
  }

  // ---------------------------------------------------------------- drawing decor
  function drawItem(ctx, it) {
    const t = AI.time;
    const G = AI.Ground;
    switch (it.n) {
      case 'coral': drawCoral(ctx, it); return;
      case 'kelp': drawKelp(ctx, it); return;
      case 'stack': drawStack(ctx, it); return;
      case 'buoy': drawBuoy(ctx, it); return;
      case 'wreck': drawWreck(ctx, it); return;
      case 'shard': drawShard(ctx, it); return;
      case 'nest': ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.ellipse(it.x, it.y, 12, 6, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = '#f4f1e6'; ctx.fillRect(it.x - 3, it.y - 3, 3, 3); ctx.fillRect(it.x + 1, it.y - 2, 3, 3); return;
      case 'shells': for (let i = 0; i < 4; i++) { const a = U.hash(it.id, i, 1); ctx.fillStyle = ['#fff2e6', '#ffd7c2', '#f4e3ff'][i % 3]; ctx.fillRect(Math.round(it.x + (a - 0.5) * 30), Math.round(it.y + ((a * 7) % 1 - 0.5) * 14), 3, 2); } return;
      case 'pool': { const s = it.s || 1; ctx.fillStyle = '#5e5b55'; ctx.beginPath(); ctx.ellipse(it.x, it.y, 20 * s, 9 * s, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = '#55c8cb'; ctx.beginPath(); ctx.ellipse(it.x, it.y, 16 * s, 6.5 * s, 0, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(Math.round(it.x - 6 * s), Math.round(it.y - 2), 5, 1); return; }
      case 'crate': ctx.fillStyle = '#7a5530'; ctx.fillRect(it.x - 10, it.y - 18, 20, 18); ctx.fillStyle = '#9a7040'; ctx.fillRect(it.x - 9, it.y - 17, 18, 3); ctx.strokeStyle = '#5a3d20'; ctx.lineWidth = 2; ctx.strokeRect(it.x - 10, it.y - 18, 20, 18); ctx.beginPath(); ctx.moveTo(it.x - 9, it.y - 1); ctx.lineTo(it.x + 9, it.y - 17); ctx.stroke(); return;
    }
    const sway = it.sway && G ? G.swayAt(it.x, 0.06) + Math.sin(t * 0.9 + it.id) * 0.01 : 0;
    // a soft shadow at its foot (the sheet's own drawn shadows are left out)
    const [w] = propSize(it.n);
    const sk = AI.Sky ? 0.12 + 0.16 * AI.Sky.shadowStrength() : 0.22;
    ctx.fillStyle = 'rgba(10,20,10,' + sk.toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(it.x, it.y + 1, w * (it.s || 1) * (/palm|pink/.test(it.n) ? 0.3 : 0.42), 5 * (it.s || 1) + w * 0.04, 0, 0, 6.283); ctx.fill();
    drawProp(ctx, it.n, it.x, it.y + 2, { flip: it.f, scale: it.s, sway });
  }
  function drawCoral(ctx, it) {
    const s = it.s || 1;
    const col = ['#ff8fa3', '#ffb074', '#b78cff', '#ffe27a', '#ff6f8f'][it.col || 0];
    const sp = O().sample(it.x, it.y);
    ctx.save();
    ctx.globalAlpha = sp.cls <= 1 ? 0.95 : 0.55; // (deeper water dims it)
    ctx.strokeStyle = col; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42 + Math.sin(AI.time * 0.8 + i + it.id) * 0.04;
      const l = (8 + U.hash(it.id, i, 3) * 10) * s;
      ctx.beginPath(); ctx.moveTo(it.x, it.y); ctx.lineTo(it.x + Math.cos(a) * l, it.y + Math.sin(a) * l); ctx.stroke();
      ctx.beginPath(); ctx.arc(it.x + Math.cos(a) * l, it.y + Math.sin(a) * l, 1.6 * s, 0, 6.283); ctx.fillStyle = col; ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,30,40,0.25)'; ctx.beginPath(); ctx.ellipse(it.x, it.y + 1, 7 * s, 2.5 * s, 0, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function drawKelp(ctx, it) {
    const s = it.s || 1;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#2f7a4a'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      let x = it.x + (i - 1) * 5, y = it.y;
      ctx.moveTo(x, y);
      for (let k = 1; k <= 5; k++) { x += Math.sin(AI.time * 1.2 + k * 0.8 + i + it.id) * 2.2; y -= 5 * s; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawStack(ctx, it) {
    const s = it.s || 1;
    drawProp(ctx, 'rock_grey', it.x, it.y + 4, { scale: s * 1.3, flip: it.f });
    // the sea breaks around its foot
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(AI.time * 2 + it.id);
    ctx.strokeStyle = '#f2fdff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(it.x, it.y + 2, 26 * s, 8 * s, 0, 0, 6.283); ctx.stroke();
    ctx.restore();
  }
  function drawBuoy(ctx, it) {
    const bob = Math.sin(AI.time * 2.2 + it.id) * 2;
    const c = it.col ? '#2fbf5a' : '#e0453a';
    ctx.fillStyle = 'rgba(0,30,50,0.3)'; ctx.beginPath(); ctx.ellipse(it.x, it.y + 2, 10, 4, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = c; ctx.fillRect(it.x - 6, it.y - 14 + bob, 12, 12);
    ctx.fillStyle = '#f4f4f0'; ctx.fillRect(it.x - 6, it.y - 9 + bob, 12, 3);
    ctx.fillStyle = '#333'; ctx.fillRect(it.x - 1, it.y - 22 + bob, 2, 8);
    const night = AI.Sky ? AI.Sky.darkness() : 0;
    const blink = Math.sin(AI.time * 3 + it.id) > 0.3;
    if (blink) { ctx.fillStyle = it.col ? '#b6ffc6' : '#ffb0a8'; ctx.globalAlpha = 0.5 + night * 0.5; ctx.fillRect(it.x - 2, it.y - 25 + bob, 4, 4); ctx.globalAlpha = 1; }
  }
  function drawShard(ctx, it) {
    const s = it.s || 1;
    const p = 0.6 + 0.4 * Math.sin(AI.time * 3 + it.id);
    ctx.fillStyle = '#c9a42a';
    ctx.beginPath(); ctx.moveTo(it.x - 5 * s, it.y); ctx.lineTo(it.x - 1 * s, it.y - 16 * s); ctx.lineTo(it.x + 3 * s, it.y); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,140,' + p.toFixed(2) + ')';
    ctx.beginPath(); ctx.moveTo(it.x - 2 * s, it.y); ctx.lineTo(it.x + 2 * s, it.y - 11 * s); ctx.lineTo(it.x + 6 * s, it.y); ctx.fill();
    if (Math.random() < 0.02) try { AI.R.FX.burst(it.x, it.y - 10, '#fff07a', 2, 40); } catch (e) { /* ignore */ }
  }
  // a broken hull lying in the water, its mast snapped; the one in the fog has ghost lights around it
  function drawWreck(ctx, it) {
    ctx.save();
    ctx.translate(Math.round(it.x), Math.round(it.y));
    ctx.rotate(it.ang || 0);
    const dark = it.ghost ? '#3b3a3e' : '#5b4128', mid = it.ghost ? '#4c4a50' : '#7a5734', light = it.ghost ? '#615e66' : '#9a7244';
    ctx.fillStyle = 'rgba(0,20,40,0.35)'; ctx.beginPath(); ctx.ellipse(0, 6, 92, 22, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(-86, 0); ctx.quadraticCurveTo(-60, -26, 40, -24); ctx.lineTo(70, -12); ctx.lineTo(58, 8); ctx.quadraticCurveTo(-30, 16, -86, 0); ctx.fill();
    ctx.fillStyle = mid; for (let i = -70; i < 50; i += 14) ctx.fillRect(i, -20, 9, 3);
    ctx.fillStyle = light; ctx.fillRect(-62, -14, 100, 3);
    // the hole in its side, and the broken ribs
    ctx.fillStyle = '#120e0c'; ctx.beginPath(); ctx.ellipse(-12, -6, 16, 7, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = mid; for (let i = -24; i <= 0; i += 8) ctx.fillRect(i, -14, 2, 12);
    // the mast, snapped, with a rag of sail
    ctx.fillStyle = dark; ctx.save(); ctx.translate(-4, -20); ctx.rotate(-0.25); ctx.fillRect(-2, -70, 5, 70); ctx.restore();
    const flap = Math.sin(AI.time * (it.ghost ? 1.1 : 2.2)) * 3;
    ctx.fillStyle = it.ghost ? 'rgba(200,220,210,0.55)' : 'rgba(230,220,190,0.8)';
    ctx.beginPath(); ctx.moveTo(-14, -78); ctx.lineTo(10 + flap, -70); ctx.lineTo(4 + flap, -48); ctx.lineTo(-8, -52); ctx.fill();
    ctx.restore();
    // surf along the hull
    ctx.save(); ctx.globalAlpha = 0.4 + 0.25 * Math.sin(AI.time * 1.8); ctx.strokeStyle = '#f2fdff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(it.x, it.y + 2, 90, 18, it.ang || 0, 0.2, 2.9); ctx.stroke(); ctx.restore();
    if (it.ghost) {
      // will-o'-wisps drifting over it
      for (let i = 0; i < 4; i++) {
        const a = AI.time * 0.4 + i * 1.7;
        const x = it.x + Math.cos(a) * 60, y = it.y - 50 + Math.sin(a * 1.3) * 18;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
        g.addColorStop(0, 'rgba(150,255,200,0.85)'); g.addColorStop(1, 'rgba(150,255,200,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 12, y - 12, 24, 24);
      }
    }
  }
  // solid shapes for decor (39-decor.js asks)
  function solidOf(it) {
    if (it.n === 'wreck') {
      const c = Math.cos(it.ang || 0), s = Math.sin(it.ang || 0);
      const hw = Math.abs(c) * 80 + Math.abs(s) * 14, hh = Math.abs(s) * 80 + Math.abs(c) * 14;
      return { rect: [it.x - hw, it.y - hh - 6, it.x + hw, it.y + hh] };
    }
    return it.r ? { r: it.r * (it.s || 1) } : null;
  }

  // ---------------------------------------------------------------- the air: petals over Blossomveil, sea spray in a storm
  const petals = [];
  function tick(dt) {
    if (!O().on()) { if (petals.length) petals.length = 0; return; }
    const R = AI.R, p = R.Game.player;
    if (!p) return;
    const z = O().zoneAt(p.x, p.y);
    if (z.id === 'lele' && petals.length < 40 && Math.random() < dt * 10) petals.push({ x: p.x + U.rand(-500, 500), y: p.y + U.rand(-320, 200), t: 0, life: U.rand(4, 8), ph: Math.random() * 6.28 });
    const wv = AI.Sky ? AI.Sky.windVec() : [0.2, 0];
    for (let i = petals.length - 1; i >= 0; i--) {
      const q = petals[i];
      q.t += dt; q.x += (wv[0] * 60 + Math.sin(q.t * 2 + q.ph) * 14) * dt; q.y += (14 + wv[1] * 30) * dt;
      if (q.t > q.life) petals.splice(i, 1);
    }
  }
  function drawAir(ctx) {
    if (!O().on()) return;
    drawBeam(ctx);
    for (const q of petals) {
      ctx.fillStyle = 'rgba(255,170,205,' + Math.min(1, q.t, q.life - q.t).toFixed(2) + ')';
      const s = Math.sin(q.t * 4 + q.ph);
      ctx.fillRect(Math.round(q.x), Math.round(q.y), 3, 1 + (s > 0 ? 1 : 0));
    }
    // spray blowing off the waves in a storm
    const Sky = AI.Sky;
    if (Sky && Sky.storm > 0.3) {
      const cam = AI.R.Camera, wv = Sky.windVec();
      ctx.fillStyle = 'rgba(230,245,255,' + (0.25 * Sky.storm).toFixed(3) + ')';
      for (let i = 0; i < 30; i++) {
        const ph = (AI.time * 0.9 + i * 0.137) % 1, hh = U.hash(i, Math.floor(AI.time * 0.9 + i * 0.137), 9450);
        const x = cam.left() + hh * cam.w + wv[0] * ph * 160, y = cam.top() + ((hh * 3.3) % 1) * cam.h - ph * 20;
        ctx.fillRect(Math.round(x), Math.round(y), 6, 1);
      }
    }
  }
  function drawScreen(ctx, w, h) { if (O().on()) drawBeacon(ctx, w, h); }
  function lights(out) {
    if (!O().on()) return;
    const v = beamVis();
    if (v > 0.03) {
      out.push({ x: LH.x, y: LH.y, r: 110, c: [255, 246, 205], i: 0.9 * v });
      const a = beamAng();
      for (const s of [0, Math.PI]) for (const d of [160, 340, 560]) out.push({ x: LH.x + Math.cos(a + s) * d, y: LH.y + Math.sin(a + s) * d * 0.7, r: 50 + d * 0.12, c: [255, 246, 205], i: 0.45 * v * (1 - d / 900) });
    }
  }
  function reset() { chunks.clear(); chunkKey0 = null; petals.length = 0; }

  AI.define('OceanDraw', { IMG, drawProp, propSize, drawGround, drawItem, solidOf, decor, tick, drawAir, drawScreen, lights, reset, chunks, LH, beamVis });
})();
