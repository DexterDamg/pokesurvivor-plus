/* PokéSurvivor+ — Living World AI · the haunted mansion: grounds, house and interior
 * At the end of the shady dirt path through the starting woodland (39-decor.js) stand the iron gates
 * of an old mansion. The grounds are cleared of trees when the world is generated, the house and its
 * fence are solid, and the front door leads inside.
 * The interior is a separate space far from the forest: walking through the door fades to black,
 * the Pokémon outside are set aside (the game's own stash, like a rift) and the house is drawn
 * instead of the forest, room by room, from the supplied mansion sheet: a foyer with a barricaded
 * staircase, a gallery of portraits and armour, a dining hall, a locked ballroom, a study and a long
 * hallway that ends in a tall old mirror. No wild Pokémon ever come in here.
 * The hauntings (88-haunt.js) and the story (89-story.js) play out on top of this.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const TS = 32;
  const COLS = 46, ROWS = 36;
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

  // the grounds, the house and a corridor along the path are kept clear of trees and props
  let clearCache = null;
  function clearAt(x, y) {
    if (!on() || AI.cfg.newArt === false) return false;
    const D = AI.Decor;
    if (!D || !AI.R || !AI.R.World || AI.R.World.biome !== 0) return false;
    if (!clearCache || clearCache.seed !== D.seed) {
      const g0 = D.mansionGeom(D.seed);
      const xs = g0.dense.map((q) => q[0]), ys = g0.dense.map((q) => q[1]);
      clearCache = { seed: D.seed, g: g0, box: [Math.min(...xs, g0.D[0] - g0.SW) - 120, Math.min(...ys, g0.D[1] - 340) - 120, Math.max(...xs, g0.D[0] + g0.SW) + 120, Math.max(...ys, g0.G[1]) + 120] };
    }
    const g = clearCache.g, bx = clearCache.box;
    const ix = g.interior[0] - COLS * TS / 2, iy = g.interior[1];
    if (x > ix - 600 && x < ix + COLS * TS + 600 && y > iy - 600 && y < iy + ROWS * TS + 600) return true;
    if (x < bx[0] || y < bx[1] || x > bx[2] || y > bx[3]) return false;
    const [dx, dy] = g.D;
    if (x > dx - g.SW - 90 && x < dx + g.SW + 90 && y > dy - 330 && y < g.G[1] + 70) return true;
    for (const p of g.dense) if (Math.abs(p[0] - x) < 70 && Math.abs(p[1] - y) < 70 && Math.hypot(p[0] - x, p[1] - y) < 70) return true;
    return false;
  }

  // ---------------------------------------------------------------- exterior: solids and the front door
  function exteriorRects() {
    const g = geom();
    if (!g) return null;
    if (g._rects) return g._rects;
    const [dx, dy] = g.D, gy = g.G[1], SW = g.SW;
    const r = [];
    r.push([dx - SW - 4, dy - 270, dx + SW + 4, dy - 6]); // the house (and the wall pieces to the fence)
    for (const sd of [-1, 1]) {
      r.push(sd < 0 ? [dx - SW - 6, gy - 8, dx - 48, gy + 8] : [dx + 48, gy - 8, dx + SW + 6, gy + 8]); // gate fence
      r.push(sd < 0 ? [dx - SW - 8, dy - 6, dx - SW + 8, gy + 8] : [dx + SW - 8, dy - 6, dx + SW + 8, gy + 8]); // side fences
      r.push([dx + sd * 64 - 10, dy + 4, dx + sd * 64 + 10, dy + 16]); // gargoyles
    }
    g._rects = r;
    return r;
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
    if (Math.abs(ent.x - g.D[0]) > g.SW + 80 || ent.y < g.D[1] - 340 || ent.y > g.G[1] + 60) return false;
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
   * '.' floor  'd' doorway  'L' locked door  'S' staircase  'E' the front door (from inside) */
  const ROOMS = [
    { id: 'dining', x0: 2, y0: 6, x1: 13, y1: 16, floor: 'wood', wins: [1] },
    { id: 'ballroom', x0: 16, y0: 6, x1: 30, y1: 15, floor: 'pink', wins: [1, 2] },
    { id: 'hall', x0: 33, y0: 6, x1: 35, y1: 33, floor: 'wood', wins: [] },
    { id: 'study', x0: 38, y0: 12, x1: 44, y1: 21, floor: 'wood', wins: [] },
    { id: 'gallery', x0: 2, y0: 24, x1: 13, y1: 33, floor: 'wood', wins: [1] },
    { id: 'foyer', x0: 16, y0: 22, x1: 30, y1: 33, floor: 'pink', wins: [] },
  ];
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
    for (let y = 18; y <= 21; y++) for (let x = 19; x <= 26; x++) set(x, y, 'S'); // staircase
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
    P({ n: 'm_barricade', x: tx(23), y: ty(22) + 14, room: 'foyer', kind: 'barricade', solid: [104, 24] });
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
    I.chandeliers.push({ id: 'ballroom', x: tx(23.5), y: ty(10.2), lit: 0.25, sway: 0 }, { id: 'dining', x: tx(8), y: ty(9.6), lit: 0.5, sway: 0 }, { id: 'foyer', x: tx(23.5), y: ty(26.5), lit: 0.3, sway: 0 });
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
    if (c === ' ' || c === '#' || c === 'W' || c === 'S') return true;
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
    const isFloor = (ch) => ch === '.' || ch === 'd' || ch === 'L' || ch === 'E';
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
        const name = r.wins.includes(b) ? (b % 2 ? 'm_wall_win2' : 'm_wall_win') : 'm_wall';
        A.draw(g, name, (r.x0 + b * 4) * TS + 64, r.y0 * TS);
      }
      g.restore();
      // skirting shadow at the foot of the wall
      const grd = g.createLinearGradient(0, r.y0 * TS, 0, r.y0 * TS + 22);
      grd.addColorStop(0, 'rgba(8,4,12,0.55)'); grd.addColorStop(1, 'rgba(8,4,12,0)');
      g.fillStyle = grd; g.fillRect(r.x0 * TS, r.y0 * TS, (r.x1 - r.x0 + 1) * TS, 22);
    }
    // the staircase, rising into the dark
    const stairs = it.props.find((p) => p.kind === 'stairs');
    if (stairs) {
      A.draw(g, 'm_stairs', stairs.x - it.ox, stairs.y - it.oy);
      const grd = g.createLinearGradient(0, 18 * TS, 0, 21 * TS);
      grd.addColorStop(0, 'rgba(4,2,8,0.95)'); grd.addColorStop(1, 'rgba(4,2,8,0)');
      g.fillStyle = grd; g.fillRect(19 * TS, 18 * TS, 8 * TS, 3 * TS);
    }
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
      out.push({ x: p.x + p.ox, y: p.y + p.oy - h * p.s - 4, r: p.light.r, c: p.light.c, i: f * (st.dim == null ? 1 : st.dim), src: p });
    }
    for (const c of it.chandeliers) if (c.lit > 0.05) out.push({ x: c.x, y: c.y, r: 150 + 120 * c.lit, c: [255, 196, 120], i: c.lit * (0.8 + Math.sin(AI.time * 7 + c.x) * 0.05) * (st.dim == null ? 1 : st.dim) });
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
    if (!it || st.inside || st.fadeTo === 1) return false;
    if (R.Coop && R.Coop.active) { lockedMsg(); return false; }
    sfx('creak', 0, 0);
    fadeTo(1, () => {
      const p = R.Game.player;
      st.returnTo = [it.g.D[0], it.g.D[1] + 46];
      try { R.EnemyMgr.stash(); } catch (e) { AI.warn('mansion-stash', e); }
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
    if (!st.inside || st.fadeTo === 1) return false;
    sfx('creak', 0, 0);
    fadeTo(1, () => {
      const p = R.Game.player;
      st.inside = false;
      try { R.EnemyMgr.restore(); } catch (e) { AI.warn('mansion-restore', e); }
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
  const MSG = {
    locked: { es: 'La puerta no cede.', en: 'The door won\'t budge.', fr: 'La porte ne bouge pas.', zh: '門紋絲不動。' },
  };
  function lockedMsg() { if (AI.time - st.lockMsgT < 3) return; st.lockMsgT = AI.time; try { AI.R.Spawner.say(MSG.locked[AI.lang ? AI.lang() : 'en'] || MSG.locked.en, 2.4); } catch (e) { /* ignore */ } }

  function tick(dt) {
    // fades
    if (st.fade !== st.fadeTo) {
      const s = st.fadeSpeed * dt;
      st.fade = st.fadeTo > st.fade ? Math.min(st.fadeTo, st.fade + s) : Math.max(st.fadeTo, st.fade - s);
      if (st.fade === st.fadeTo && st.fadeCb) { const cb = st.fadeCb; st.fadeCb = null; try { cb(); } catch (e) { AI.warn('mansion-fade', e); } }
    }
    if (!on()) { if (st.inside) exit(); return; }
    const R = AI.R;
    const p = R.Game.player;
    if (!p || p.dead || R.Game.state !== 'playing') return;
    const g = geom();
    if (!g) return;
    if (!st.inside) {
      // the front door
      const [dx, dy] = g.D;
      const ay = (R.Input && R.Input._rawAxis) ? (R.Input._rawAxis() || [0, 0])[1] : -1;
      if (Math.abs(p.x - dx) < 34 && p.y > dy - 14 && p.y < dy + 22 && (ay < -0.3 || (p._vy || 0) < -20) && !(AI.Story && AI.Story.blockEntry && AI.Story.blockEntry())) enter();
      return;
    }
    const it = st.built;
    if (!it) return;
    // a wild Pokémon that somehow got in is gently shown out
    for (const e of R.EnemyMgr.all()) if (!e.dead && inInterior(e.x, e.y) && !e.psxStory) { try { if (AI.EnvBeh) AI.EnvBeh.removeNpc(e); else e.dead = true; } catch (err) { e.dead = true; } }
    // the way out
    if (tileAt(p.x, p.y + 14) === 'E' || p.y > it.oy + 33.9 * TS) {
      const ay = (R.Input && R.Input._rawAxis) ? (R.Input._rawAxis() || [0, 0])[1] : 1;
      if ((ay > 0.3 || (p._vy || 0) > 20) && !(AI.Story && AI.Story.blockExit && AI.Story.blockExit())) exit();
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
    if (st.inside) { st.inside = false; try { AI.R.EnemyMgr.restore(); } catch (e) { /* ignore */ } }
    st.built = null; st.cache = null; st.fade = 0; st.fadeTo = 0; st.fadeCb = null; clearCache = null;
  }

  AI.define('Mansion', {
    st, TS, COLS, ROWS, ROOMS, geom, on, clearAt, collideExterior, blockedExterior, exteriorRects,
    interior: I, inInterior, tileAt, roomAt, solidsNear, collide, freeAt, openDoor, closeDoor, propRect,
    drawInterior, visibleProps, drawProp, drawAir, lights, ambient, enter, exit, fadeTo, tick, drawScreen, reset, sfx, snapCamera,
    get inside() { return st.inside; },
  });
})();
