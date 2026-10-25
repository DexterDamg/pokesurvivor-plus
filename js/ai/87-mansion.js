/* PokéSurvivor+ — Living World AI · the haunted mansion: grounds, house and interior
 * At the end of the shady dirt path through the starting woodland (39-decor.js) stand the iron gates
 * of an old mansion. The grounds are cleared of trees when the world is generated, the house and its
 * fence are solid, and the front door leads inside.
 * The interior is a separate space far from the forest: walking through the door fades to black,
 * the Pokémon outside are set aside (the game's own stash, like a rift) and the house is drawn
 * instead of the forest, room by room, from the supplied mansion sheet: a foyer with a grand
 * staircase, a gallery of portraits and armour, a dining hall, a locked ballroom, a study and a long
 * hallway that ends in a tall old mirror. Up the stairs (the Old Chateau furniture sheet): a library,
 * an upper gallery, a guest room, a long corridor, the landing, the master bedroom and a nursery; and
 * up a narrow stair at the corridor's end, the attic. No wild Pokémon ever come in here.
 * The hauntings (88-haunt.js) and the story (89-story.js) play out on top of this.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const TS = 32;
  const COLS = 46, ROWS = 130;
  const FLOORS = [0, 50, 105]; // the first row of each floor (ground floor, upstairs, attic)
  function floorOfRow(r) { return r >= FLOORS[2] ? 2 : r >= FLOORS[1] ? 1 : 0; }
  const st = {
    inside: false,
    fade: 0, fadeTo: 0, fadeCb: null, fadeSpeed: 2.4,
    lockMsgT: 0,
    built: null, // interior built for this geometry
    cache: null, // pre-rendered static interior
    tension: 0,
  };

  // ---------------------------------------------------------------- geometry
  function geom() { const D = AI.Decor; if (!D) return null; D.ensure(); return D.trail ? D.trail.mansion : null; }
  function on() { return AI.enabled && AI.cfg.mansion !== false; }

  // the grounds, the house and a corridor along the path are kept clear of trees and props (only
  // once the journey has placed the mansion; until then the forest grows everywhere)
  function clearAt(x, y) {
    if (!on() || AI.cfg.newArt === false) return false;
    const D = AI.Decor;
    if (!D || !AI.R || !AI.R.World || AI.R.World.biome !== 0) return false;
    const g = D.trail ? D.trail.mansion : null;
    if (!g) return false;
    const bx = g._box || (g._box = D.mansionBox(g));
    const ix = g.interior[0] - COLS * TS / 2, iy = g.interior[1];
    if (x > ix - 600 && x < ix + COLS * TS + 600 && y > iy - 600 && y < iy + ROWS * TS + 600) return true;
    if (x < bx[0] || y < bx[1] || x > bx[2] || y > bx[3]) return false;
    const [dx] = g.D;
    if (x > dx - g.SW - 90 && x < dx + g.SW + 90 && y > g.top - 90 && y < g.G[1] + 70) return true;
    for (const p of g.dense) if (Math.abs(p[0] - x) < 70 && Math.abs(p[1] - y) < 70 && Math.hypot(p[0] - x, p[1] - y) < 70) return true;
    return false;
  }

  // ---------------------------------------------------------------- exterior: solids and the front door
  function exteriorRects() {
    const g = geom();
    if (!g) return null;
    if (g._rects) return g._rects;
    const [dx, dy] = g.D, gy = g.G[1], SW = g.SW, GO = g.GO, top = g.top;
    const r = [];
    r.push([dx - g.HW, dy - g.HH + 14, dx + g.HW, dy - 6]); // the house
    r.push([dx - SW - 6, top - 8, dx + SW + 6, top + 8]); // the back fence
    for (const sd of [-1, 1]) {
      r.push(sd < 0 ? [dx - SW - 6, gy - 8, dx - GO + 16, gy + 8] : [dx + GO - 16, gy - 8, dx + SW + 6, gy + 8]); // the fence either side of the gate
      r.push(sd < 0 ? [dx - SW - 8, top - 8, dx - SW + 8, gy + 8] : [dx + SW - 8, top - 8, dx + SW + 8, gy + 8]); // side fences
      r.push([dx + sd * 78 - 11, dy + 6, dx + sd * 78 + 11, dy + 18]); // gargoyles
    }
    r.push([g.F[0] - 90, g.F[1] - 54, g.F[0] + 90, g.F[1] + 30]); // the fountain
    r.push([g.shed[0] - 98, g.shed[1] - 74, g.shed[0] + 98, g.shed[1] - 2]); // the shed
    g._rects = r;
    return r;
  }
  // the grounds and a wide band around them are silent: no wild Pokémon appear there at all
  function silentAt(x, y) {
    if (!on() || st.inside) return false;
    const g = geom();
    if (!g) return false;
    return x > g.D[0] - g.SW - 520 && x < g.D[0] + g.SW + 520 && y > g.top - 520 && y < g.G[1] + 420;
  }

  // ---------------------------------------------------------------- exterior: drawing the house and its grounds
  const ART = window.PSXAI_MANSION_ART || { mansion: { w: 466, h: 170, wins: [] }, shed: { w: 61, h: 60 } };
  // the Old Chateau furniture sheet: its sprites are drawn like any other ('c_bed', 'c_sofa'…)
  if (AI.Art && AI.Art.addSheet && ART.chateau) AI.Art.addSheet('assets/mansion/chateau.png', ART.chateau);
  const img = (src) => { const i = new Image(); i.src = src; return i; };
  const IMG = { house: img('assets/env/mansion_big.png'), shed: img('assets/env/shed.png') };
  const ok = (i) => i.complete && i.naturalWidth > 0;
  // how far each big piece reaches from its anchor, so it isn't culled while any of it is on screen
  const EXT = { mansion: [-470, -350, 470, 0], mgate: [-240, -330, 240, 10], fountain: [-110, -150, 110, 40], shed: [-110, -200, 110, 6] };
  function drawItem(ctx, it) {
    switch (it.k) {
      case 'mansion': {
        const A = ART.mansion;
        if (ok(IMG.house)) ctx.drawImage(IMG.house, Math.round(it.x - A.w), Math.round(it.y - A.h * 2), A.w * 2, A.h * 2);
        // worn stone steps up to the door
        ctx.fillStyle = '#4a4450'; ctx.fillRect(Math.round(it.x - 46), Math.round(it.y - 4), 92, 8);
        ctx.fillStyle = '#5c5662'; ctx.fillRect(Math.round(it.x - 40), Math.round(it.y + 4), 80, 6);
        break;
      }
      case 'mgate': drawGate(ctx, it); break;
      case 'fountain': drawFountain(ctx, it); break;
      case 'shed': drawShed(ctx, it); break;
      case 'mcandle': drawCandle(ctx, it); break;
    }
  }
  // tall gate leaves standing open under a wrought-iron arch
  function drawGate(ctx, it) {
    const x = Math.round(it.x), y = Math.round(it.y) - 10, w = it.w;
    const H = 156; // the pillars' height
    ctx.save();
    ctx.strokeStyle = '#1e1a22'; ctx.fillStyle = '#1e1a22';
    // the open leaves, swung back against the inside of the fence
    for (const sd of [-1, 1]) {
      const x0 = x + sd * (w - 18), x1 = x + sd * (w - 84);
      for (let k = 0; k <= 7; k++) {
        const t = k / 7, bx = x0 + (x1 - x0) * t, by = y - 6 - t * 34;
        ctx.fillRect(Math.round(bx) - 1, Math.round(by - 104), 3, 104);
        ctx.fillRect(Math.round(bx) - 2, Math.round(by - 112), 5, 6); // spear tips
      }
      ctx.lineWidth = 3;
      for (const hy of [92, 54, 14]) { ctx.beginPath(); ctx.moveTo(x0, y - 6 - hy); ctx.lineTo(x1, y - 40 - hy); ctx.stroke(); }
    }
    // the arch: two bands of iron between the pillar tops, scrollwork and spikes along the top
    ctx.lineWidth = 4;
    for (const off of [0, 16]) {
      ctx.beginPath(); ctx.moveTo(x - w, y - H + 4 + off);
      ctx.quadraticCurveTo(x, y - H - 120 + off, x + w, y - H + 4 + off); ctx.stroke();
    }
    ctx.lineWidth = 2;
    for (let k = -5; k <= 5; k++) {
      const t = (k + 5) / 10, ax = x - w + 2 * w * t, ay = (1 - t) * (1 - t) * (y - H + 4) + 2 * (1 - t) * t * (y - H - 120) + t * t * (y - H + 4);
      ctx.beginPath(); ctx.moveTo(ax, ay + 4); ctx.lineTo(ax, ay + 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay - 10); ctx.stroke();
      ctx.beginPath(); ctx.arc(ax, ay + 8, 3, 0, 6.283); ctx.stroke();
    }
    // a crest in the middle, its letters long rusted away
    ctx.fillStyle = '#2c2630'; ctx.beginPath(); ctx.arc(x, y - H - 54, 15, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#5a4c5e'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#7a3e8a'; ctx.fillRect(x - 3, y - H - 60, 6, 10);
    ctx.restore();
  }
  // a fountain that stopped working long ago: a dry basin, cracked tiers, moss and dead leaves
  function drawFountain(ctx, it) {
    ctx.save();
    ctx.translate(Math.round(it.x), Math.round(it.y)); ctx.scale(1.4, 1.4);
    const x = 0, y = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 10, 72, 26, 0, 0, 6.283); ctx.fill();
    // the basin
    ctx.fillStyle = '#5d5862'; ctx.beginPath(); ctx.ellipse(x, y - 6, 66, 30, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#4a4550'; ctx.fillRect(x - 66, y - 6, 132, 14); ctx.beginPath(); ctx.ellipse(x, y + 8, 66, 30, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#2a2530'; ctx.beginPath(); ctx.ellipse(x, y - 8, 56, 22, 0, 0, 6.283); ctx.fill(); // dry, dark inside
    ctx.fillStyle = '#3a4a2c'; for (const [mx, my, mw] of [[-38, -10, 14], [20, -2, 10], [-6, -18, 8], [30, -14, 12]]) ctx.fillRect(x + mx, y + my, mw, 3); // moss
    ctx.fillStyle = '#6b4a2a'; for (const [lx, ly] of [[-24, -4], [12, -14], [34, -6], [-44, -14], [4, 0]]) ctx.fillRect(x + lx, y + ly, 4, 2); // dead leaves
    ctx.strokeStyle = '#1c1820'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 46, y - 18); ctx.lineTo(x + 38, y - 4); ctx.lineTo(x + 44, y + 10); ctx.stroke(); // a crack in the rim
    // the pedestal and its tiers
    ctx.fillStyle = '#6a6470'; ctx.fillRect(x - 9, y - 58, 18, 52);
    ctx.fillStyle = '#7a7480'; ctx.fillRect(x - 9, y - 58, 4, 52);
    ctx.fillStyle = '#5d5862'; ctx.beginPath(); ctx.ellipse(x, y - 58, 32, 10, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#2a2530'; ctx.beginPath(); ctx.ellipse(x, y - 60, 24, 6, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#6a6470'; ctx.fillRect(x - 5, y - 86, 10, 26);
    ctx.fillStyle = '#5d5862'; ctx.beginPath(); ctx.ellipse(x, y - 86, 16, 6, 0, 0, 6.283); ctx.fill();
    // what's left of the figure on top: a broken stump
    ctx.fillStyle = '#7a7480'; ctx.fillRect(x - 4, y - 100, 8, 14); ctx.fillStyle = '#4a4550'; ctx.fillRect(x - 4, y - 102, 3, 4); ctx.fillRect(x + 1, y - 100, 3, 2);
    // a stain where the water used to run
    ctx.fillStyle = 'rgba(30,50,40,0.5)'; ctx.fillRect(x - 3, y - 56, 2, 50); ctx.fillRect(x + 4, y - 84, 2, 24);
    ctx.restore();
  }
  // the shed: its double doors bang open and shut on their own (shedDoor in tick)
  function drawShed(ctx, it) {
    ctx.save();
    ctx.translate(Math.round(it.x), Math.round(it.y)); ctx.scale(1.6, 1.6);
    const A = ART.shed, x = 0, y = 0;
    if (ok(IMG.shed)) ctx.drawImage(IMG.shed, x - A.w, y - A.h * 2, A.w * 2, A.h * 2);
    const open = st.shedOpen || 0;
    ctx.fillStyle = '#0a070c'; ctx.fillRect(x - 22, y - 50, 44, 48); // the dark inside
    for (const sd of [-1, 1]) {
      const k = sd < 0 ? open : open * 0.6;
      const w = Math.max(3, Math.round(22 * (1 - k)));
      const dx = sd < 0 ? x - 22 : x + 22 - w;
      ctx.fillStyle = '#4a3428'; ctx.fillRect(dx, y - 50, w, 48);
      ctx.fillStyle = '#2e2018'; ctx.fillRect(dx + (sd < 0 ? w - 2 : 0), y - 50, 2, 48);
      if (w > 10) { ctx.fillStyle = '#6a5040'; ctx.fillRect(dx + 2, y - 40, w - 4, 2); ctx.fillRect(dx + 2, y - 16, w - 4, 2); }
    }
    ctx.restore();
  }
  // a small candle; now and then its flame turns purple for a moment
  function drawCandle(ctx, it) {
    const x = Math.round(it.x), y = Math.round(it.y);
    ctx.fillStyle = '#2a2228'; ctx.fillRect(x - 4, y - 2, 8, 3);
    ctx.fillStyle = '#e8dcc4'; ctx.fillRect(x - 2, y - 11, 4, 9);
    ctx.fillStyle = '#c8b898'; ctx.fillRect(x + 1, y - 11, 1, 9);
    if (!it.lit) return;
    const purple = AI.Decor.ghostly(it);
    const fl = Math.sin(AI.time * 13 + it.id) > 0 ? 1 : 0;
    ctx.fillStyle = purple ? '#b070ff' : '#ffb040'; ctx.fillRect(x - 1, y - 16 - fl, 3, 5);
    ctx.fillStyle = purple ? '#e8d0ff' : '#fff0b0'; ctx.fillRect(x, y - 14 - fl, 1, 2);
  }
  // the shed's doors bang now and then while you're anywhere near
  function shedDoor(dt) {
    const g = geom(), p = AI.R.Game.player;
    if (!g || !p) return;
    const d = Math.hypot(p.x - g.shed[0], p.y - g.shed[1]);
    if (st.shedT == null) st.shedT = 3;
    st.shedT -= dt;
    if (st.shedPh > 0) {
      st.shedPh -= dt;
      st.shedOpen = Math.sin(Math.min(1, 1 - st.shedPh / 0.5) * Math.PI) * 0.9;
      if (st.shedPh <= 0) { st.shedOpen = 0; if (d < 900) sfx('slam', g.shed[0], g.shed[1]); }
    } else if (st.shedT <= 0 && d < 1100) {
      st.shedT = U.rand(4, 11);
      st.shedPh = 0.5;
      if (Math.random() < 0.35) st.shedT = 0.8; // and sometimes twice in a row
    }
  }
  // any wild Pokémon still on or around the grounds slips away: the place is dead silent
  function hush() {
    const R = AI.R;
    if (R.Coop && R.Coop.active && !R.Coop.isHost) return;
    for (const e of R.EnemyMgr.all()) {
      if (e.dead || e.psxStory || e.boss || e.legend || e.judge || e.remote || !silentAt(e.x, e.y)) continue;
      try { if (AI.EnvBeh) AI.EnvBeh.removeNpc(e); else e.dead = true; } catch (err) { e.dead = true; }
    }
  }
  function pushOut(ent, rects) {
    const rr = ent.r || 12;
    let hit = false;
    for (const b of rects) {
      const cx = U.clamp(ent.x, b[0], b[2]), cy = U.clamp(ent.y, b[1], b[3]);
      const ddx = ent.x - cx, ddy = ent.y - cy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 >= rr * rr) continue;
      hit = true;
      if (d2 > 0.0001) { const d = Math.sqrt(d2); ent.x = cx + ddx / d * rr; ent.y = cy + ddy / d * rr; }
      else {
        // centre inside the box: leave by the nearest side
        const l = ent.x - b[0], ri = b[2] - ent.x, t = ent.y - b[1], bo = b[3] - ent.y;
        const m = Math.min(l, ri, t, bo);
        if (m === l) ent.x = b[0] - rr; else if (m === ri) ent.x = b[2] + rr; else if (m === t) ent.y = b[1] - rr; else ent.y = b[3] + rr;
      }
    }
    return hit;
  }
  function collideExterior(ent) {
    if (!on() || !ent) return false;
    const g = geom();
    if (!g) return false;
    if (Math.abs(ent.x - g.D[0]) > g.SW + 80 || ent.y < g.top - 40 || ent.y > g.G[1] + 60) return false;
    return pushOut(ent, exteriorRects());
  }
  function blockedExterior(x, y, r) {
    const rects = on() && exteriorRects();
    if (!rects) return false;
    for (const b of rects) if (x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3]) return true;
    return false;
  }

  // ---------------------------------------------------------------- the interior layout
  /* A grid of 32 px tiles:  ' ' void  '#' wall  'W' wall face (north walls seen from the front)
   * '.' floor  'd' doorway  'L' locked door  'S' staircase  'E' the front door (from inside)
   * 'U' stairs up  'D' stairs down (walk onto them to change floor) */
  const ROOMS = [
    { id: 'dining', x0: 2, y0: 6, x1: 13, y1: 16, floor: 'wood', wins: [1] },
    { id: 'ballroom', x0: 16, y0: 6, x1: 30, y1: 15, floor: 'pink', wins: [1, 2] },
    { id: 'hall', x0: 33, y0: 6, x1: 35, y1: 33, floor: 'wood', wins: [] },
    { id: 'study', x0: 38, y0: 12, x1: 44, y1: 21, floor: 'wood', wins: [] },
    { id: 'gallery', x0: 2, y0: 24, x1: 13, y1: 33, floor: 'wood', wins: [1] },
    { id: 'foyer', x0: 16, y0: 22, x1: 30, y1: 33, floor: 'pink', wins: [] },
    // upstairs
    { id: 'library', x0: 2, y0: 56, x1: 15, y1: 65, floor: 'wood', wins: [1], fl: 1 },
    { id: 'upgallery', x0: 18, y0: 56, x1: 28, y1: 64, floor: 'pink', wins: [1], fl: 1 },
    { id: 'bedroom', x0: 31, y0: 56, x1: 44, y1: 65, floor: 'wood', wins: [1, 2], fl: 1 },
    { id: 'corridor', x0: 2, y0: 70, x1: 44, y1: 73, floor: 'wood', wins: [2, 5, 8], fl: 1 },
    { id: 'landing', x0: 16, y0: 78, x1: 30, y1: 88, floor: 'pink', wins: [], fl: 1 },
    { id: 'master', x0: 2, y0: 78, x1: 13, y1: 88, floor: 'wood', wins: [1], fl: 1 },
    { id: 'nursery', x0: 33, y0: 78, x1: 44, y1: 88, floor: 'pink', wins: [1], fl: 1 },
    // the attic
    { id: 'attic', x0: 3, y0: 111, x1: 43, y1: 124, floor: 'wood', wins: [2, 6], fl: 2 },
  ];
  // where each staircase takes you: [tile x, tile y] you arrive at
  const ARRIVE = { up0: [23.5, 87.3], down1: [23.5, 23.4], up1: [40.6, 123.4], down2: [41, 72.6] };
  function build(g) {
    const grid = [];
    for (let y = 0; y < ROWS; y++) grid.push(new Array(COLS).fill(' '));
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) grid[y][x] = c; };
    const at = (x, y) => (x >= 0 && y >= 0 && x < COLS && y < ROWS ? grid[y][x] : ' ');
    for (const r of ROOMS) {
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) set(x, y, '.');
      for (let y = r.y0 - 4; y < r.y0; y++) for (let x = r.x0; x <= r.x1; x++) set(x, y, 'W');
    }
    // walls around everything
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (at(x, y) !== ' ') continue;
      let near = false;
      for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) { const c = at(x + i, y + j); if (c !== ' ' && c !== '#') { near = true; break; } }
      if (near) set(x, y, '#');
    }
    // fill the gaps between neighbouring walls
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (at(x, y) === ' ' && ((at(x - 1, y) === '#' && at(x + 1, y) === '#') || (at(x, y - 1) === '#' && at(x, y + 1) === '#'))) set(x, y, '#');
    // doors
    const door = (cells, c) => { for (const [x, y] of cells) set(x, y, c); };
    door([[14, 28], [15, 28], [14, 29], [15, 29]], 'd'); // gallery ↔ foyer
    door([[31, 28], [32, 28], [31, 29], [32, 29]], 'd'); // foyer ↔ hall
    door([[31, 9], [32, 9], [31, 10], [32, 10]], 'L'); // ballroom ↔ hall: locked
    door([[36, 16], [37, 16], [36, 17], [37, 17]], 'd'); // hall ↔ study
    for (let y = 17; y <= 23; y++) { set(7, y, 'd'); set(8, y, 'd'); } // gallery ↔ dining
    for (let y = 18; y <= 21; y++) for (let x = 19; x <= 26; x++) set(x, y, 'U'); // the grand staircase, up
    // upstairs: doors off the corridor and the landing
    const span = (x0, x1, y0, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
    span(8, 9, 66, 69, 'd'); span(23, 24, 65, 69, 'd'); span(37, 38, 66, 69, 'd'); // library, upper gallery, guest room
    span(22, 24, 74, 77, 'd'); span(7, 8, 74, 77, 'd'); span(38, 39, 74, 77, 'd'); // landing, master bedroom, nursery
    span(14, 15, 83, 84, 'd'); span(31, 32, 83, 84, 'd'); // the landing's side doors
    span(19, 26, 89, 90, 'D'); // the grand staircase, down
    span(42, 44, 70, 71, 'U'); // the narrow attic stair
    span(21, 25, 125, 126, 'D'); // and back down from the attic
    for (let x = 22; x <= 24; x++) set(x, 34, 'E'); // the front door
    const ox = g.interior[0] - COLS * TS / 2, oy = g.interior[1];
    const I = { g, grid, ox, oy, props: [], doors: [], faces: [], lights: [], chandeliers: [], windows: [], portraits: [], webs: [], key: g.interior.join(',') };
    I.at = at;
    I.wx = (tx) => ox + tx * TS;
    I.wy = (ty) => oy + ty * TS;
    I.rooms = ROOMS.map((r) => Object.assign({}, r, { x: ox + r.x0 * TS, y: oy + r.y0 * TS, w: (r.x1 - r.x0 + 1) * TS, h: (r.y1 - r.y0 + 1) * TS }));
    I.room = (id) => I.rooms.find((r) => r.id === id);
    I.entrance = [ox + 23.5 * TS, oy + 33.4 * TS];
    furnish(I);
    return I;
  }

  // ---------------------------------------------------------------- furniture
  function furnish(I) {
    let id = 1;
    const P = (o) => { o.id = id++; o.ox = 0; o.oy = 0; o.s = o.s || 1; I.props.push(o); return o; };
    const tx = (x) => I.ox + x * TS, ty = (y) => I.oy + y * TS;
    // foyer
    P({ n: 'm_stairs', x: tx(23), y: ty(22), room: 'foyer', flat: true, kind: 'stairs' });
    P({ n: 'm_rubble', x: tx(20.2), y: ty(22.6), room: 'foyer', flat: true });
    P({ n: 'm_rubble', x: tx(25.6), y: ty(22.5), room: 'foyer', flat: true, f: true });
    P({ n: 'm_column', x: tx(18.6), y: ty(22) + 2, room: 'foyer', s: 0.55, solid: [18, 12] });
    P({ n: 'm_column', x: tx(27.4), y: ty(22) + 2, room: 'foyer', s: 0.55, solid: [18, 12] });
    P({ n: 'm_clock', x: tx(17.2), y: ty(22) + 4, room: 'foyer', s: 0.65, solid: [40, 14], kind: 'clock' });
    P({ n: 'm_rug_torn', x: tx(23.5), y: ty(31), room: 'foyer', flat: true });
    for (const [x, y, lit] of [[16.6, 24.5, true], [29.6, 24.5, false], [16.6, 32.6, false], [29.6, 32.6, true]]) P({ n: 'm_candelabra', x: tx(x), y: ty(y), room: 'foyer', solid: [14, 8], kind: 'candles', lit, light: { r: 105, c: [255, 180, 100] } });
    P({ n: 'm_web_a', x: tx(16.5), y: ty(18.5), room: 'foyer', flat: true, wall: true });
    P({ n: 'm_web_b', x: tx(30.4), y: ty(18.5), room: 'foyer', flat: true, wall: true, f: true });
    // gallery: portraits, armour, swords
    P({ n: 'm_armor', x: tx(3.6), y: ty(24) + 6, room: 'gallery', solid: [26, 12], kind: 'armor' });
    P({ n: 'm_armor', x: tx(12.4), y: ty(24) + 6, room: 'gallery', solid: [26, 12], kind: 'armor', f: true });
    P({ n: 'm_rug_green', x: tx(8), y: ty(30.5), room: 'gallery', flat: true });
    P({ n: 'm_candelabra', x: tx(2.7), y: ty(33.3), room: 'gallery', solid: [14, 8], kind: 'candles', lit: false, light: { r: 110, c: [255, 180, 100] } });
    P({ n: 'm_candelabra', x: tx(13.3), y: ty(33.3), room: 'gallery', solid: [14, 8], kind: 'candles', lit: true, light: { r: 110, c: [255, 180, 100] } });
    P({ n: 'm_stool', x: tx(5), y: ty(31), room: 'gallery', s: 0.6, solid: [26, 14], kind: 'chair' });
    P({ n: 'm_web_b', x: tx(2.5), y: ty(20.5), room: 'gallery', flat: true, wall: true });
    // dining hall
    P({ n: 'm_table_blood', x: tx(8), y: ty(13.6), room: 'dining', s: 0.75, solid: [138, 70], kind: 'table' });
    P({ n: 'm_chair_r', x: tx(4.2), y: ty(12.6), room: 'dining', s: 0.7, solid: [30, 18], kind: 'chair' });
    P({ n: 'm_chair_l', x: tx(11.8), y: ty(12.6), room: 'dining', s: 0.7, solid: [30, 18], kind: 'chair' });
    P({ n: 'm_stool', x: tx(6.2), y: ty(15.6), room: 'dining', s: 0.6, solid: [26, 14], kind: 'chair' });
    P({ n: 'm_stool', x: tx(9.8), y: ty(15.6), room: 'dining', s: 0.6, solid: [26, 14], kind: 'chair' });
    P({ n: 'm_candelabra', x: tx(8), y: ty(10.4), room: 'dining', s: 0.8, kind: 'candles', lit: true, light: { r: 140, c: [255, 180, 100] }, onTable: true });
    P({ n: 'm_floor_hole', x: tx(3.4), y: ty(9.4), room: 'dining', flat: true, s: 0.5 });
    P({ n: 'm_web_a', x: tx(2.5), y: ty(2.5), room: 'dining', flat: true, wall: true });
    P({ n: 'm_web_b', x: tx(13.5), y: ty(2.5), room: 'dining', flat: true, wall: true, f: true });
    // ballroom (the pranksters' hideout)
    P({ n: 'm_rug_green', x: tx(23.5), y: ty(12.2), room: 'ballroom', flat: true, s: 1.2 });
    P({ n: 'm_column', x: tx(16.8), y: ty(6) + 2, room: 'ballroom', s: 0.55, solid: [18, 12] });
    P({ n: 'm_column', x: tx(30.2), y: ty(6) + 2, room: 'ballroom', s: 0.55, solid: [18, 12] });
    P({ n: 'm_chair_r', x: tx(18), y: ty(14.5), room: 'ballroom', s: 0.7, solid: [30, 18], kind: 'chair' });
    P({ n: 'm_chair_l', x: tx(29), y: ty(14.5), room: 'ballroom', s: 0.7, solid: [30, 18], kind: 'chair' });
    P({ n: 'm_stool', x: tx(20.5), y: ty(8.5), room: 'ballroom', s: 0.6, solid: [26, 14], kind: 'chair' });
    P({ n: 'm_web_a', x: tx(16.5), y: ty(2.5), room: 'ballroom', flat: true, wall: true });
    // the hall and its mirror
    P({ n: 'm_floor_hole', x: tx(34.2), y: ty(20), room: 'hall', flat: true, s: 0.5 });
    P({ n: 'm_floor_hole', x: tx(34.8), y: ty(12), room: 'hall', flat: true, s: 0.45, f: true });
    for (const [x, y, lit] of [[33.3, 30.5, true], [35.7, 24.5, false], [33.3, 18.5, true], [35.7, 12.5, false]]) P({ n: 'm_candelabra', x: tx(x), y: ty(y), room: 'hall', s: 0.85, solid: [12, 8], kind: 'candles', lit, light: { r: 100, c: [255, 180, 100] } });
    I.mirror = P({ n: 'm_mirror_frame', x: tx(34.5), y: ty(6) + 18, room: 'hall', solid: [88, 14], kind: 'mirror' });
    // study
    for (const x of [39.2, 41.4, 43.6]) P({ n: 'm_bookshelf', x: tx(x), y: ty(12) + 4, room: 'study', solid: [62, 14], kind: 'shelf' });
    P({ n: 'm_table', x: tx(41.5), y: ty(18.2), room: 'study', s: 0.5, solid: [90, 34], kind: 'table' });
    P({ n: 'm_stool', x: tx(41.5), y: ty(20), room: 'study', s: 0.55, solid: [24, 12], kind: 'chair' });
    P({ n: 'm_candelabra', x: tx(41.5), y: ty(16.4), room: 'study', s: 0.7, kind: 'candles', lit: true, light: { r: 110, c: [255, 180, 100] }, onTable: true });
    P({ n: 'm_rubble', x: tx(39), y: ty(20.6), room: 'study', flat: true });
    // chandeliers (Chandelure's ballroom, the dining hall, the foyer)
    I.chandeliers.push({ id: 'ballroom', x: tx(23.5), y: ty(8.2), lit: 0.25, sway: 0 }, { id: 'dining', x: tx(8), y: ty(9.6), lit: 0.5, sway: 0 }, { id: 'foyer', x: tx(23.5), y: ty(26.5), lit: 0.3, sway: 0 });
    // portraits and sword plaques on the walls (their faces can change)
    const face = (room, x, kind, extra) => Object.assign({ room, x: tx(x), y: ty(ROOMS.find((r) => r.id === room).y0) - 66, kind, mood: 'calm' }, extra || {});
    I.portraits.push(face('gallery', 5.2, 'lady'), face('gallery', 10.8, 'lord'), face('foyer', 28.6, 'child'), face('dining', 11.5, 'lord'), face('study', 38.6, 'lady', { y: ty(12) - 70 }));
    I.plaques = [{ room: 'gallery', x: tx(8), y: ty(24) - 64, shake: 0 }];
    // windows: moonlight falls through them
    for (const r of ROOMS) for (const b of r.wins) I.windows.push({ room: r.id, x: tx(r.x0 + b * 4 + 2), y: ty(r.y0) - 50 });
    // doors that can open and close
    I.doors.push({ id: 'ballroom', cells: [[31, 9], [32, 9], [31, 10], [32, 10]], side: true, open: false, locked: true, t: 0 });
    I.doors.push({ id: 'study', cells: [[36, 16], [37, 16], [36, 17], [37, 17]], side: true, open: true, locked: false, t: 0 });
    I.doors.push({ id: 'dining', cells: [[7, 23], [8, 23]], side: false, open: true, locked: false, t: 0 });
    furnishUpstairs(I, P, tx, ty, face);
  }
  // upstairs and the attic, furnished from the Old Chateau sheet
  function furnishUpstairs(I, P, tx, ty, face) {
    const C = (room, n, x, y, o) => P(Object.assign({ n, x: tx(x), y: ty(y), room }, o || {}));
    const candle = (room, x, y, lit, o) => C(room, 'c_candelabra', x, y, Object.assign({ s: 0.9, solid: [14, 8], kind: 'candles', lit, light: { r: 100, c: [255, 180, 100] } }, o || {}));
    // the library
    C('library', 'c_rug_torn', 8.5, 63.5, { flat: true });
    for (const x of [3.6, 6.4]) C('library', 'c_bookshelf', x, 56.2, { solid: [100, 14], kind: 'shelf' });
    for (const x of [11, 13.8]) C('library', 'm_bookshelf', x, 56.2, { solid: [62, 14], kind: 'shelf' });
    C('library', 'm_table', 8.5, 62.4, { s: 0.55, solid: [96, 36], kind: 'table' });
    candle('library', 8.5, 60.6, true, { onTable: true, solid: null });
    C('library', 'm_stool', 8.5, 64.2, { s: 0.55, solid: [24, 12], kind: 'chair' });
    C('library', 'c_plant_dead', 2.8, 65.4, { solid: [30, 10] });
    C('library', 'm_web_a', 2.5, 52.5, { flat: true, wall: true });
    // the upper gallery: busts, armour, a rug
    C('upgallery', 'm_rug_green', 23.5, 61.5, { flat: true });
    C('upgallery', 'c_bust', 19.2, 56.4, { solid: [36, 12], kind: 'bust' });
    C('upgallery', 'c_bust_small', 27.8, 56.4, { solid: [36, 12], kind: 'bust' });
    C('upgallery', 'm_armor', 21.2, 56.4, { solid: [26, 12], kind: 'armor' });
    C('upgallery', 'm_armor', 25.8, 56.4, { solid: [26, 12], kind: 'armor', f: true });
    candle('upgallery', 18.6, 64.4, false);
    candle('upgallery', 28.4, 64.4, true);
    // the guest room
    C('bedroom', 'c_rug_red', 37.5, 62, { flat: true, s: 0.9 });
    C('bedroom', 'c_bed', 34.6, 59.6, { solid: [150, 70], kind: 'bed' });
    C('bedroom', 'c_ottoman', 37.8, 63.4, { solid: [40, 16], kind: 'chair' });
    C('bedroom', 'c_pot_purple', 43.4, 56.8, { solid: [40, 12] });
    C('bedroom', 'c_plant_dead2', 31.8, 65.4, { solid: [30, 10] });
    C('bedroom', 'm_chair_r', 41.8, 61.6, { s: 0.65, solid: [28, 16], kind: 'chair' });
    candle('bedroom', 43.4, 65.3, true);
    C('bedroom', 'm_web_b', 44.5, 52.5, { flat: true, wall: true, f: true });
    // the corridor: pots and busts along the walls, a bust whose eyes glow
    for (const [n, x] of [['c_pot_red', 4.2], ['c_pot_red2', 13], ['c_pot_red', 28.5], ['c_pot_red2', 34.8]]) C('corridor', n, x, 70.6, { s: 0.8, solid: [34, 10] });
    C('corridor', 'c_bust_eyes', 19.5, 70.6, { solid: [36, 12], kind: 'bust', eyes: true });
    C('corridor', 'c_plant_dead', 40, 70.6, { s: 0.85, solid: [30, 10] });
    for (const [x, lit] of [[10.5, true], [17, false], [31.5, true], [38, false]]) candle('corridor', x, 73.6, lit, { s: 0.8 });
    // the landing: the top of the grand staircase, the clock, a bust
    C('landing', 'c_carpet', 23.5, 89.2, { flat: true });
    C('landing', 'c_clock', 17.4, 78.4, { solid: [40, 14], kind: 'clock2' });
    C('landing', 'c_bust', 29.4, 78.4, { solid: [36, 12], kind: 'bust' });
    C('landing', 'c_pot_purple2', 17, 88.4, { solid: [40, 12] });
    C('landing', 'c_pot_purple', 30, 88.4, { solid: [40, 12] });
    candle('landing', 20.4, 78.6, true);
    candle('landing', 26.6, 78.6, false);
    // the master bedroom
    C('master', 'c_rug_red', 7.5, 85, { flat: true });
    C('master', 'c_bed', 4.8, 81.6, { solid: [150, 70], kind: 'bed' });
    C('master', 'c_sofa', 10.4, 86.6, { solid: [110, 34], kind: 'chair' });
    C('master', 'c_table', 10.6, 81.4, { s: 0.7, solid: [70, 30], kind: 'table' });
    candle('master', 10.6, 80, true, { onTable: true, solid: null, s: 0.7 });
    C('master', 'c_shell', 2.8, 88.4, { solid: [30, 10] });
    C('master', 'm_web_a', 2.5, 74.5, { flat: true, wall: true });
    // the nursery: a little bed, teddy bears, toys on the floor
    C('nursery', 'c_rug_torn', 38.5, 84.5, { flat: true, s: 0.8 });
    C('nursery', 'c_bed', 41.8, 81, { s: 0.7, solid: [104, 48], kind: 'bed' });
    C('nursery', 'c_teddy', 36, 84.6, { kind: 'teddy' });
    C('nursery', 'c_teddy2', 43.4, 88.4, { kind: 'teddy' });
    C('nursery', 'c_rocks', 35, 87.6, { flat: true, s: 0.7 });
    C('nursery', 'm_stool', 39.2, 86.6, { s: 0.5, solid: [22, 10], kind: 'chair' });
    candle('nursery', 33.6, 78.6, false);
    // the attic: dust, clutter, a broken clock, one teddy bear sitting alone in the middle
    for (const [n, x, y, o] of [['barrel', 5, 112.5, { solid: [30, 12] }], ['barrel', 6.4, 112.8, { solid: [30, 12] }], ['c_sofa', 11, 113, { solid: [110, 30], kind: 'chair' }],
      ['m_clock', 17, 111.4, { s: 0.6, solid: [36, 12], kind: 'clock2' }], ['c_bust_eyes', 30, 111.4, { solid: [36, 12], kind: 'bust', eyes: true }], ['m_bookshelf', 36.5, 111.2, { solid: [62, 14], kind: 'shelf' }],
      ['barrel', 41.5, 112.6, { solid: [30, 12] }], ['c_pot_purple2', 42.4, 122.8, { solid: [40, 12] }], ['c_plant_dead2', 4.2, 123.6, { solid: [30, 10] }], ['m_table', 34, 119.4, { s: 0.45, solid: [80, 30], kind: 'table' }],
      ['c_teddy2', 23, 117.6, { kind: 'teddy', alone: true }], ['c_shell2', 9, 121.6, { solid: [30, 12] }]]) C('attic', n, x, y, o);
    for (const [x, y, f] of [[14, 118, false], [28, 121, true], [38.5, 115, false]]) C('attic', 'm_floor_hole', x, y, { flat: true, s: 0.4, f });
    for (const [x, y] of [[8, 117], [20, 123], [32, 114], [40, 120]]) C('attic', 'm_rubble', x, y, { flat: true });
    for (const [x, f] of [[3.5, false], [43.5, true], [23, false]]) C('attic', 'm_web_a', x, 107.5, { flat: true, wall: true, f });
    candle('attic', 34, 118, true, { onTable: true, solid: null, s: 0.7 });
    candle('attic', 12.5, 123.8, false);
    // chandeliers upstairs, portraits on the walls, doors that can open and close
    I.chandeliers.push({ id: 'landing', x: tx(23.5), y: ty(83), lit: 0.4, sway: 0 }, { id: 'master', x: tx(7.5), y: ty(83), lit: 0.2, sway: 0 });
    I.portraits.push(face('upgallery', 20.6, 'lord'), face('upgallery', 26.4, 'lady'), face('master', 9, 'lady'), face('nursery', 38.5, 'child'), face('corridor', 25, 'lord'));
    I.doors.push({ id: 'master', cells: [[14, 83], [15, 83], [14, 84], [15, 84]], side: true, open: true, locked: false, t: 0 });
    I.doors.push({ id: 'nursery', cells: [[31, 83], [32, 83], [31, 84], [32, 84]], side: true, open: false, locked: false, t: 0 });
  }

  // ---------------------------------------------------------------- queries
  function I() {
    const g = geom();
    if (!g) return null;
    if (!st.built || st.built.key !== g.interior.join(',')) { st.built = build(g); st.cache = null; }
    return st.built;
  }
  function inInterior(x, y) {
    const it = st.built;
    if (!it) return false;
    return x > it.ox - 500 && x < it.ox + COLS * TS + 500 && y > it.oy - 500 && y < it.oy + ROWS * TS + 500;
  }
  function tileAt(x, y) {
    const it = st.built;
    if (!it) return ' ';
    return it.at(Math.floor((x - it.ox) / TS), Math.floor((y - it.oy) / TS));
  }
  function doorAtCell(it, cx, cy) { return it.doors.find((d) => d.cells.some(([x, y]) => x === cx && y === cy)); }
  function solidCell(it, cx, cy) {
    const c = it.at(cx, cy);
    if (c === ' ' || c === '#' || c === 'W' || c === 'S') return true; // ('U' and 'D' stairs can be walked onto)
    if (c === 'L' || c === 'd') { const d = doorAtCell(it, cx, cy); return !!(d && !d.open); }
    return false;
  }
  function roomAt(x, y) {
    const it = st.built;
    if (!it) return null;
    for (const r of it.rooms) if (x >= r.x && x < r.x + r.w && y >= r.y - 8 && y < r.y + r.h) return r.id;
    return null;
  }
  function propRect(p) { if (!p.solid) return null; const [w, h] = p.solid; const x = p.x + p.ox, y = p.y + p.oy; return [x - w / 2, y - h, x + w / 2, y]; }

  // ---------------------------------------------------------------- collision inside
  const rectBuf = [];
  function solidsNear(x, y, r) {
    const it = st.built;
    rectBuf.length = 0;
    const c0 = Math.floor((x - r - it.ox) / TS), c1 = Math.floor((x + r - it.ox) / TS);
    const r0 = Math.floor((y - r - it.oy) / TS), r1 = Math.floor((y + r - it.oy) / TS);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) if (solidCell(it, cx, cy)) rectBuf.push([it.ox + cx * TS, it.oy + cy * TS, it.ox + (cx + 1) * TS, it.oy + (cy + 1) * TS]);
    for (const p of it.props) {
      const b = propRect(p);
      if (b && x + r > b[0] && x - r < b[2] && y + r > b[1] && y - r < b[3]) rectBuf.push(b);
    }
    return rectBuf;
  }
  function collide(ent) {
    if (!st.built) return false;
    const r = Math.min(ent.r || 12, 14);
    const tmp = { x: ent.x, y: ent.y, r };
    const hit = pushOut(tmp, solidsNear(tmp.x, tmp.y, r + 2));
    ent.x = tmp.x; ent.y = tmp.y;
    if (hit && ent === AI.R.Game.player) bumpDoors(ent);
    return hit;
  }
  function freeAt(x, y, r) { if (!st.built) return false; return solidsNear(x, y, r || 12).every((b) => !(x + (r || 12) > b[0] && x - (r || 12) < b[2] && y + (r || 12) > b[1] && y - (r || 12) < b[3])); }
  // walking into a closed door: it creaks open (or rattles, if it's locked)
  function bumpDoors(p) {
    const it = st.built;
    const cx = Math.floor((p.x - it.ox) / TS), cy = Math.floor((p.y - it.oy) / TS);
    for (const d of it.doors) {
      if (d.open) continue;
      const near = d.cells.some(([x, y]) => Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1);
      if (!near) continue;
      d.push = (d.push || 0) + 1 / 60;
      if (d.push < 0.35) continue;
      d.push = 0;
      if (d.locked) {
        if (AI.time - (d.rattle || -9) > 2.5) { d.rattle = AI.time; AI.Bus.emit({ type: 'mansion', what: 'locked', door: d.id, x: p.x, y: p.y, loud: 0 }); sfx('rattle', p.x, p.y); }
      } else openDoor(d, true);
    }
  }
  function openDoor(d, creak) { if (d.open) return; d.open = true; d.t = 0; if (creak) sfx('creak', 0, 0); }
  function closeDoor(d, slam) {
    const it = st.built;
    if (!d.open) return false;
    // never shut someone inside the doorway
    const p = AI.R.Game.player;
    for (const [x, y] of d.cells) { const wx = it.ox + (x + 0.5) * TS, wy = it.oy + (y + 0.5) * TS; if (Math.abs(p.x - wx) < 40 && Math.abs(p.y - wy) < 40) return false; }
    d.open = false; d.t = 0;
    sfx(slam ? 'slam' : 'creak', it.ox + d.cells[0][0] * TS, it.oy + d.cells[0][1] * TS);
    return true;
  }
  function sfx(name, x, y) { try { if (AI.Ambience && AI.Ambience.mansion) AI.Ambience.mansion(name, x, y); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------------- drawing the interior
  function buildCache(it) {
    const A = AI.Art;
    if (!A || !A.ready) return null;
    const c = document.createElement('canvas');
    c.width = COLS * TS; c.height = ROWS * TS;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#07050a';
    g.fillRect(0, 0, c.width, c.height);
    const atc = (x, y) => it.at(x, y);
    const isFloor = (ch) => ch === '.' || ch === 'd' || ch === 'L' || ch === 'E' || ch === 'U' || ch === 'D';
    // floors, tiled from the sheet, clipped to each room
    const tile = (name, x0, y0, w, h) => {
      const [tw, th] = A.size(name);
      g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
      for (let y = y0; y < y0 + h; y += th) for (let x = x0; x < x0 + w; x += tw) A.draw(g, name, x + tw / 2, y + th);
      g.restore();
    };
    for (const r of ROOMS) tile(r.floor === 'pink' ? 'm_floor_pink' : 'm_floor_wood', r.x0 * TS, r.y0 * TS, (r.x1 - r.x0 + 1) * TS, (r.y1 - r.y0 + 1) * TS);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (atc(x, y) === 'd' || atc(x, y) === 'L' || atc(x, y) === 'E') tile('m_floor_wood', x * TS, y * TS, TS, TS);
    // age and dust: a darker, uneven tone over the floors
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!isFloor(atc(x, y))) continue;
      const h = U.hash(x, y, 81);
      g.fillStyle = 'rgba(20,12,24,' + (0.12 + h * 0.18).toFixed(3) + ')';
      g.fillRect(x * TS, y * TS, TS, TS);
    }
    // flat decor baked into the floor: rugs, holes, rubble, the staircase
    for (const p of it.props) if (p.flat && !p.wall && p.kind !== 'stairs') A.draw(g, p.n, p.x - it.ox, p.y - it.oy, { scale: p.s, flip: p.f });
    // wall faces: panelled wood, with windows here and there
    for (const r of ROOMS) {
      const n = Math.ceil((r.x1 - r.x0 + 1) / 4);
      g.save(); g.beginPath(); g.rect(r.x0 * TS, (r.y0 - 4) * TS, (r.x1 - r.x0 + 1) * TS, 4 * TS); g.clip();
      for (let b = 0; b < n; b++) {
        const name = r.wins.includes(b) ? (b % 2 ? 'm_wall_win2' : 'm_wall_win') : r.fl ? (U.hash(b, r.x0, 41) < 0.3 ? 'c_wall_stain' : 'c_wall') : 'm_wall';
        A.draw(g, name, (r.x0 + b * 4) * TS + 64, r.y0 * TS);
      }
      g.restore();
      // skirting shadow at the foot of the wall
      const grd = g.createLinearGradient(0, r.y0 * TS, 0, r.y0 * TS + 22);
      grd.addColorStop(0, 'rgba(8,4,12,0.55)'); grd.addColorStop(1, 'rgba(8,4,12,0)');
      g.fillStyle = grd; g.fillRect(r.x0 * TS, r.y0 * TS, (r.x1 - r.x0 + 1) * TS, 22);
    }
    // the grand staircase, rising into the dark
    const stairs = it.props.find((p) => p.kind === 'stairs');
    if (stairs) {
      A.draw(g, 'm_stairs', stairs.x - it.ox, stairs.y - it.oy);
      const grd = g.createLinearGradient(0, 18 * TS, 0, 21 * TS);
      grd.addColorStop(0, 'rgba(4,2,8,0.95)'); grd.addColorStop(1, 'rgba(4,2,8,0)');
      g.fillStyle = grd; g.fillRect(19 * TS, 18 * TS, 8 * TS, 3 * TS);
    }
    // stairwells going down: steps fading into the dark, a carpet runner, and a rail either side
    for (const [x0, y0, w] of [[19, 89, 8], [21, 125, 5]]) {
      for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#3a2a30' : '#4a3640'; g.fillRect(x0 * TS, y0 * TS + k * 8, w * TS, 8); }
      g.fillStyle = 'rgba(120,40,60,0.55)'; g.fillRect((x0 + w / 2 - 1) * TS, y0 * TS, 2 * TS, 2 * TS);
      const gd = g.createLinearGradient(0, y0 * TS, 0, (y0 + 2) * TS); gd.addColorStop(0, 'rgba(4,2,8,0)'); gd.addColorStop(1, 'rgba(4,2,8,0.95)');
      g.fillStyle = gd; g.fillRect(x0 * TS, y0 * TS, w * TS, 2 * TS);
      g.fillStyle = '#6a4a3a'; g.fillRect(x0 * TS - 4, y0 * TS - 6, 4, 2 * TS + 6); g.fillRect((x0 + w) * TS, y0 * TS - 6, 4, 2 * TS + 6);
    }
    // the narrow attic stair at the corridor's end
    for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#4a3640' : '#5a4450'; g.fillRect(42 * TS, 70 * TS + k * 8, 3 * TS, 8); }
    { const gd = g.createLinearGradient(0, 72 * TS, 0, 70 * TS); gd.addColorStop(0, 'rgba(4,2,8,0)'); gd.addColorStop(1, 'rgba(4,2,8,0.9)'); g.fillStyle = gd; g.fillRect(42 * TS, 70 * TS, 3 * TS, 2 * TS); }
    // wall tops, with a lighter rim where they meet a room
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (atc(x, y) !== '#') continue;
      g.fillStyle = '#1d1520';
      g.fillRect(x * TS, y * TS, TS, TS);
      g.fillStyle = '#4e3f4c';
      const open = (ch) => ch !== '#' && ch !== ' ';
      if (open(atc(x, y + 1))) g.fillRect(x * TS, (y + 1) * TS - 4, TS, 4);
      if (open(atc(x, y - 1)) && atc(x, y - 1) !== 'W') g.fillRect(x * TS, y * TS, TS, 3);
      if (open(atc(x + 1, y))) g.fillRect((x + 1) * TS - 3, y * TS, 3, TS);
      if (open(atc(x - 1, y))) g.fillRect(x * TS, y * TS, 3, TS);
    }
    // doorways cut into the wall faces: a frame and a dark threshold
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (atc(x, y) !== 'd') continue;
      if (atc(x - 1, y) === 'W') { g.fillStyle = '#c8b8a0'; g.fillRect(x * TS, y * TS, 3, TS); }
      if (atc(x + 1, y) === 'W') { g.fillStyle = '#8a7a68'; g.fillRect((x + 1) * TS - 3, y * TS, 3, TS); }
    }
    // vertical walls cast a little shade onto the floor beside them
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!isFloor(atc(x, y))) continue;
      if (atc(x - 1, y) === '#') { const gr = g.createLinearGradient(x * TS, 0, x * TS + 12, 0); gr.addColorStop(0, 'rgba(8,4,12,0.45)'); gr.addColorStop(1, 'rgba(8,4,12,0)'); g.fillStyle = gr; g.fillRect(x * TS, y * TS, 12, TS); }
      if (atc(x + 1, y) === '#') { const gr = g.createLinearGradient((x + 1) * TS, 0, (x + 1) * TS - 12, 0); gr.addColorStop(0, 'rgba(8,4,12,0.45)'); gr.addColorStop(1, 'rgba(8,4,12,0)'); g.fillStyle = gr; g.fillRect((x + 1) * TS - 12, y * TS, 12, TS); }
    }
    // the front door, seen from inside: a dark doorway in the south wall and a worn mat
    g.fillStyle = '#0c080e'; g.fillRect(22 * TS, 34 * TS + 6, 3 * TS, TS - 6);
    g.fillStyle = '#5a3a34'; g.fillRect(22 * TS + 6, 33 * TS + 14, 3 * TS - 12, 16);
    g.fillStyle = '#7a5040'; g.fillRect(22 * TS + 10, 33 * TS + 17, 3 * TS - 20, 10);
    // cobwebs in the corners
    for (const p of it.props) if (p.wall) A.draw(g, p.n, p.x - it.ox, p.y - it.oy, { flip: p.f });
    return c;
  }

  function drawInterior(ctx) {
    const it = I();
    if (!it) return;
    if (!st.cache) st.cache = buildCache(it);
    const cam = AI.R.Camera;
    ctx.fillStyle = '#07050a';
    ctx.fillRect(cam.left() - 4, cam.top() - 4, cam.w + 8, cam.h + 8);
    if (st.cache) ctx.drawImage(st.cache, it.ox, it.oy);
    drawWallDecor(ctx, it);
    drawDoors(ctx, it);
    if (AI.Haunt && AI.Haunt.drawGround) AI.Haunt.drawGround(ctx, it);
  }
  function drawWallDecor(ctx, it) {
    const A = AI.Art;
    for (const pt of it.portraits) {
      const name = 'm_portrait_' + pt.kind + '_' + (pt.mood || 'calm');
      const sh = pt.shake > 0 ? Math.sin(AI.time * 50) * pt.shake * 2 : 0;
      A.draw(ctx, name, pt.x + sh, pt.y + 34);
    }
    for (const pl of it.plaques) {
      const sh = pl.shake > 0 ? Math.sin(AI.time * 60) * pl.shake * 3 : 0;
      A.draw(ctx, 'm_sword_plaque', pl.x + sh, pl.y + 28);
    }
  }
  function drawDoors(ctx, it) {
    for (const d of it.doors) {
      d.t += 1 / 60;
      const k = U.clamp(d.t / 0.35, 0, 1);
      const [cx, cy] = d.cells[0];
      if (d.side) {
        // a door in a side wall, seen edge-on from above
        const x = it.ox + (cx + 1) * TS - 6, y = it.oy + cy * TS;
        const openK = d.open ? k : 1 - k;
        ctx.fillStyle = '#3a2a24'; ctx.fillRect(x - 2, y - 4, 16, 2 * TS + 8);
        ctx.fillStyle = '#5c4234';
        if (openK < 0.95) ctx.fillRect(x, y + openK * 50, 10, 2 * TS - openK * 50);
        else ctx.fillRect(x + 8, y, 4, 2 * TS);
        if (openK < 0.5) { ctx.fillStyle = '#ecd27a'; ctx.fillRect(x + (cx < 33 ? 8 : 0), y + TS, 2, 3); }
      } else {
        // a door in a north wall: drawn over the doorway when shut
        const x = it.ox + cx * TS, y = it.oy + (cy + 1) * TS;
        const openK = d.open ? k : 1 - k;
        if (openK < 0.98) { ctx.save(); ctx.globalAlpha = 1 - openK; AI.Art.draw(ctx, 'm_door_closed', x + TS, y, { scale: 1.3 }); ctx.restore(); }
      }
    }
  }

  // things that get sorted by depth with the player: furniture, the mirror, NPCs
  const vis = [];
  function visibleProps(cam) {
    const it = I();
    vis.length = 0;
    if (!it) return vis;
    const x0 = cam.left() - 140, x1 = cam.left() + cam.w + 140, y0 = cam.top() - 60, y1 = cam.top() + cam.h + 260;
    for (const p of it.props) {
      if (p.flat || p.wall) continue;
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const pr = p._prop || (p._prop = { psxMansion: true, item: p, x: 0, y: 0, flat: false, type: 'psx-m', tx: 0, ty: 0, r: 0 });
      pr.x = p.x + p.ox; pr.y = p.y + p.oy;
      vis.push(pr);
    }
    for (const src of [AI.Story, AI.Haunt]) if (src && src.drawables) for (const d of src.drawables(cam)) vis.push(d);
    return vis;
  }
  function drawProp(ctx, pr) {
    if (pr.psxDraw) return pr.psxDraw(ctx);
    const p = pr.item;
    const x = p.x + p.ox, y = p.y + p.oy;
    if (p.kind === 'mirror') { if (AI.Haunt && AI.Haunt.drawMirror) AI.Haunt.drawMirror(ctx, p, x, y); else AI.Art.draw(ctx, p.n, x, y); return; }
    const sh = p.shake > 0 ? Math.sin(AI.time * 55 + p.id) * p.shake * 2.5 : 0;
    AI.Art.draw(ctx, p.n, x + sh, y, { scale: p.s, flip: p.f });
    if (p.kind === 'candles' && p.lit) {
      // little flames
      const [w, h] = AI.Art.size(p.n);
      const hh = h * p.s, ww = w * p.s;
      ctx.fillStyle = '#ffd27a';
      for (const fx of [-0.42, 0, 0.42]) {
        const fl = (Math.sin(AI.time * 12 + p.id + fx * 9) + 1) * 0.5;
        ctx.fillRect(Math.round(x + fx * ww - 1), Math.round(y - hh + 1 - fl * 2), 2, 3 + Math.round(fl));
      }
    }
  }
  function drawAir(ctx) {
    const it = st.built;
    if (!st.inside || !it) return;
    // chandeliers hang from the ceiling, above everything
    for (const c of it.chandeliers) {
      if (c.hidden) continue;
      const sw = c.sway ? Math.sin(AI.time * 1.6) * c.sway : 0;
      const top = c.y - 150;
      ctx.save();
      ctx.translate(Math.round(c.x), Math.round(top));
      ctx.rotate(sw * 0.12);
      ctx.fillStyle = '#5a4218';
      ctx.fillRect(-1, 0, 2, 120);
      AI.Art.draw(ctx, 'm_chandelier', 0, 176, {});
      if (c.lit > 0.05) {
        ctx.fillStyle = 'rgba(255,214,140,' + (0.6 + 0.4 * c.lit).toFixed(2) + ')';
        for (let k = 0; k < 6; k++) {
          const t = k / 6 * 6.283 + 0.3;
          const fx = Math.cos(t) * 44, fy = 120 + 12 + Math.sin(t) * 10 + 12;
          if ((k / 6) < c.lit + 0.05) ctx.fillRect(Math.round(fx), Math.round(fy - 14 - Math.random() * 2), 2, 3);
        }
      }
      ctx.restore();
    }
    if (AI.Haunt && AI.Haunt.drawAir) AI.Haunt.drawAir(ctx, it);
  }

  // ---------------------------------------------------------------- light inside
  function lights(out) {
    const it = st.built;
    if (!st.inside || !it) return;
    for (const p of it.props) {
      if (p.kind !== 'candles' || !p.lit) continue;
      const [, h] = AI.Art.size(p.n);
      const f = 0.82 + Math.sin(AI.time * 11 + p.id) * 0.06 + Math.sin(AI.time * 6.7 + p.id * 3) * 0.05;
      out.push({ x: p.x + p.ox, y: p.y + p.oy - h * p.s - 4, r: p.light.r, c: p.light.c, i: f * (st.dim == null ? 1 : st.dim) * (st.flick == null ? 1 : st.flick), src: p });
    }
    for (const c of it.chandeliers) if (c.lit > 0.05 && !c.hidden) out.push({ x: c.x, y: c.y, r: 150 + 120 * c.lit, c: [255, 196, 120], i: c.lit * (0.8 + Math.sin(AI.time * 7 + c.x) * 0.05) * (st.dim == null ? 1 : st.dim) * (st.flick == null ? 1 : st.flick) });
    const day = AI.Sky ? 1 - AI.Sky.darkness() : 0;
    for (const w of it.windows) out.push({ x: w.x, y: w.y + 90, r: 190, c: day > 0.5 ? [170, 180, 210] : [120, 140, 220], i: 0.35 + day * 0.35 });
    const p = AI.R.Game.player;
    if (p && !p.dead) out.push({ x: p.x, y: p.y - 24, r: 105, c: [190, 180, 220], i: 0.55, player: true });
    if (AI.Haunt && AI.Haunt.lights) AI.Haunt.lights(out, it);
    if (AI.Story && AI.Story.lights) AI.Story.lights(out, it);
  }
  function ambient() {
    const day = AI.Sky ? 1 - AI.Sky.darkness() : 0;
    const k = st.ambK == null ? 1 : st.ambK;
    return [Math.round((22 + day * 20) * k), Math.round((18 + day * 16) * k), Math.round((32 + day * 16) * k)];
  }

  // ---------------------------------------------------------------- in and out
  function fadeTo(v, cb, speed) { st.fadeTo = v; st.fadeCb = cb || null; st.fadeSpeed = speed || 2.4; }
  function snapCamera(p) { const cam = AI.R.Camera; cam.x = p.x; cam.y = p.y; }
  function enter() {
    const R = AI.R;
    const it = I();
    if (!it || st.inside || st.transit) return false;
    sfx('creak', 0, 0);
    st.transit = true;
    fadeTo(1, () => {
      st.transit = false;
      const p = R.Game.player;
      st.returnTo = [it.g.D[0], it.g.D[1] + 46];
      // solo: the Pokémon outside wait for you (the game's own stash, as rifts use); in co-op they
      // stay with whoever is still outside, and simply can't follow you in
      st.stashed = !(R.Coop && R.Coop.active);
      if (st.stashed) try { R.EnemyMgr.stash(); } catch (e) { AI.warn('mansion-stash', e); st.stashed = false; }
      try { R.Projectiles.clear(); R.Hazards.clear(); R.Combat.clearFields && R.Combat.clearFields(); } catch (e) { /* ignore */ }
      st.inside = true;
      p.x = it.entrance[0]; p.y = it.entrance[1] - 20;
      p._vx = p._vy = 0;
      snapCamera(p);
      AI.Bus.emit({ type: 'mansion', what: 'enter', x: p.x, y: p.y, loud: 0 });
      fadeTo(0, null, 1.4);
    }, 2.2);
    return true;
  }
  function exit(cb) {
    const R = AI.R;
    if (!st.inside || st.transit) return false;
    sfx('creak', 0, 0);
    st.transit = true;
    fadeTo(1, () => {
      st.transit = false;
      const p = R.Game.player;
      st.inside = false;
      if (st.stashed) try { R.EnemyMgr.restore(); } catch (e) { AI.warn('mansion-restore', e); }
      st.stashed = false;
      const g = geom();
      const back = st.returnTo || (g ? [g.D[0], g.D[1] + 46] : [0, 0]);
      p.x = back[0]; p.y = back[1];
      p._vx = p._vy = 0;
      snapCamera(p);
      AI.Bus.emit({ type: 'mansion', what: 'exit', x: p.x, y: p.y, loud: 0 });
      if (cb) cb();
      fadeTo(0, null, 1.2);
    }, 2.2);
    return true;
  }

  // which floor you're on (0 ground floor, 1 upstairs, 2 the attic)
  function floor() { const it = st.built, p = AI.R && AI.R.Game.player; return it && p && st.inside ? floorOfRow(Math.floor((p.y - it.oy) / TS)) : 0; }
  function goFloor(fl, dir) {
    const it = st.built, a = ARRIVE[dir + fl];
    if (!it || !a) return false;
    st.transit = true;
    sfx('creak', 0, 0);
    fadeTo(1, () => {
      const p = AI.R.Game.player;
      p.x = it.wx(a[0]); p.y = it.wy(a[1]); p._vx = p._vy = 0;
      snapCamera(p);
      st.transit = false;
      st.stairT = AI.time + 0.9;
      AI.Bus.emit({ type: 'mansion', what: 'floor', floor: floor(), x: p.x, y: p.y, loud: 0 });
      fadeTo(0, null, 3.2);
    }, 5);
    return true;
  }

  function tick(dt) {
    // fades
    if (st.fade !== st.fadeTo) {
      const s = st.fadeSpeed * dt;
      st.fade = st.fadeTo > st.fade ? Math.min(st.fadeTo, st.fade + s) : Math.max(st.fadeTo, st.fade - s);
    }
    if (st.fade === st.fadeTo && st.fadeCb) { const cb = st.fadeCb; st.fadeCb = null; try { cb(); } catch (e) { AI.warn('mansion-fade', e); } }
    if (!on()) { if (st.inside) exit(); return; }
    const R = AI.R;
    const p = R.Game.player;
    if (!p || p.dead || R.Game.state !== 'playing') return;
    const g = geom();
    if (!g) return;
    if (!st.inside) {
      shedDoor(dt);
      st.hushT = (st.hushT || 0) - dt;
      if (st.hushT <= 0) { st.hushT = 0.5; hush(); }
      // the front door
      const [dx, dy] = g.D;
      const ay = (R.Input && R.Input._rawAxis) ? (R.Input._rawAxis() || [0, 0])[1] : -1;
      if (Math.abs(p.x - dx) < 34 && p.y > dy - 14 && p.y < dy + 22 && (ay < -0.3 || (p._vy || 0) < -20) && !(AI.Story && AI.Story.blockEntry && AI.Story.blockEntry())) enter();
      return;
    }
    const it = st.built;
    if (!it) return;
    // the weather outside doesn't reach in here
    try { if (R.Weather.current && R.Weather.clear) R.Weather.clear(); } catch (e) { /* ignore */ }
    // a wild Pokémon that somehow got in is gently shown out (the host decides, in co-op)
    if (!(R.Coop && R.Coop.active && !R.Coop.isHost)) for (const e of R.EnemyMgr.all()) if (!e.dead && inInterior(e.x, e.y) && !e.psxStory) { try { if (AI.EnvBeh) AI.EnvBeh.removeNpc(e); else e.dead = true; } catch (err) { e.dead = true; } }
    // the way out
    if (tileAt(p.x, p.y + 14) === 'E' || (floor() === 0 && p.y > it.oy + 33.9 * TS)) {
      const ay = (R.Input && R.Input._rawAxis) ? (R.Input._rawAxis() || [0, 0])[1] : 1;
      if ((ay > 0.3 || (p._vy || 0) > 20) && !(AI.Story && AI.Story.blockExit && AI.Story.blockExit())) exit();
    }
    // the stairs: walk onto them (heading their way) to go up or down a floor
    if (!st.transit && (st.stairT || 0) <= AI.time) {
      const c = tileAt(p.x, p.y - 4);
      const ay = (R.Input && R.Input._rawAxis) ? (R.Input._rawAxis() || [0, 0])[1] : 0;
      const fl = floor();
      if (c === 'U' && (ay < -0.3 || (p._vy || 0) < -20)) goFloor(fl, 'up');
      else if (c === 'D' && (ay > 0.3 || (p._vy || 0) > 20)) goFloor(fl, 'down');
    }
    // decay of shakes
    for (const q of it.props) if (q.shake > 0) q.shake = Math.max(0, q.shake - dt * 1.5);
    for (const q of it.portraits) if (q.shake > 0) q.shake = Math.max(0, q.shake - dt * 1.5);
    for (const q of it.plaques) if (q.shake > 0) q.shake = Math.max(0, q.shake - dt * 1.5);
    for (const c of it.chandeliers) if (c.sway > 0) c.sway = Math.max(0, c.sway - dt * 0.12);
  }

  // screen-space: the fade to black
  function drawScreen(ctx, w, h) {
    if (st.fade <= 0.001) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, st.fade).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function reset() {
    if (st.inside) { st.inside = false; if (st.stashed) try { AI.R.EnemyMgr.restore(); } catch (e) { /* ignore */ } st.stashed = false; }
    st.built = null; st.cache = null; st.fade = 0; st.fadeTo = 0; st.fadeCb = null; st.transit = false; st.dim = 1;
  }

  AI.define('Mansion', {
    st, TS, COLS, ROWS, ROOMS, FLOORS, ARRIVE, EXT, floor, goFloor, geom, on, clearAt, silentAt, drawItem, collideExterior, blockedExterior, exteriorRects,
    interior: I, inInterior, tileAt, roomAt, solidsNear, collide, freeAt, openDoor, closeDoor, propRect,
    drawInterior, visibleProps, drawProp, drawAir, lights, ambient, enter, exit, fadeTo, tick, drawScreen, reset, sfx, snapCamera,
    get inside() { return st.inside; },
  });
})();
