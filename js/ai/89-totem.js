/* PokéSurvivor+ — Living World AI · Totem Trials: where Z-Crystals come from
 * Once Level 3 (the Tropical Ocean) has been beaten, a Totem's shrine stands somewhere in the stage after it (Zona Cero
 * for now): a tall stone with a light of its type rising from it. Only for the Z-Crystal your own
 * Pokémon can use (the type of its Z-Move), and only until you have it. Stand at it for a moment and
 * its trial begins (step away to decline).
 * The trial is a maze of that type: Ghost and Dark ones are pitch black (your Z-Ring's faint glow and
 * whatever light you carry are all you have, and the ghosts drift through the walls), Fire floors
 * burn, water and ice slow you… Pokémon of the type come out of the dark in growing hordes. Survive
 * them and the Totem itself appears at the heart of the maze. Defeat it for its Z-Crystal.
 * The maze is built far away in its own pocket of the world, like the mansion's interior.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const TILE = 64, CW = 9, CH = 7; // cells across and down (the tile grid is 2·C+1 each way)
  const GW = CW * 2 + 1, GH = CH * 2 + 1;
  const ORIGIN = [520000, 520000];
  // the look and feel of each type's trial: floor, wall, ambient light, and what the floor does
  const THEME = {
    ghost: { floor: '#1c1826', wall: '#2c2440', top: '#463a62', amb: [9, 7, 16], hazard: null },
    dark: { floor: '#16141c', wall: '#26222e', top: '#3a3446', amb: [10, 9, 14], hazard: null },
    fire: { floor: '#3a1e14', wall: '#5a2a1a', top: '#8a3e22', amb: [96, 54, 40], hazard: 'burn' },
    water: { floor: '#16304a', wall: '#1e4466', top: '#2e6690', amb: [44, 62, 96], hazard: 'slow' },
    grass: { floor: '#1e3a1e', wall: '#2a5426', top: '#3e7a34', amb: [54, 80, 50], hazard: 'slow' },
    electric: { floor: '#2e2a16', wall: '#4a4220', top: '#7a6a2a', amb: [86, 80, 50], hazard: 'zap' },
    ice: { floor: '#2a3a4a', wall: '#4a6a84', top: '#8ab0cc', amb: [70, 84, 104], hazard: 'slow' },
    poison: { floor: '#2a1a34', wall: '#40264e', top: '#62387a', amb: [60, 44, 72], hazard: 'burn' },
    psychic: { floor: '#34182e', wall: '#542448', top: '#84386e', amb: [72, 48, 70], hazard: null },
    dragon: { floor: '#1e1a3a', wall: '#2e2a5a', top: '#48408a', amb: [48, 44, 84], hazard: null },
    default: { floor: '#2a2a30', wall: '#3e3e48', top: '#5c5c6a', amb: [58, 58, 70], hazard: null },
  };
  // the Totem of each type (from the games where there is one; otherwise a strong Pokémon of the type)
  const TOTEM = { normal: 735, fire: 758, water: 752, grass: 754, electric: 738, bug: 743, fairy: 743, ghost: 778, dragon: 784, rock: 745, ground: 105, steel: 777, dark: 20, psychic: 282, fighting: 784, ice: 362, poison: 758, flying: 741 };

  const st = { shrine: null, shrineDone: false, trial: null, fade: 0, fadeTo: 0, fadeCb: null, card: null, accept: 0 };
  function on() { return AI.enabled && AI.cfg.totemTrials !== false && AI.R && AI.R.Game; }
  function active() { return !!(st.trial && st.trial.inside); }
  function player() { return AI.R.Game.player; }
  function theme(t) { return THEME[t] || THEME.default; }

  // ---------------------------------------------------------------- the maze
  function build(seed) {
    const rnd = U.rng(seed >>> 0);
    const g = [];
    for (let y = 0; y < GH; y++) { g.push(new Array(GW).fill(1)); }
    // carve it (depth-first), then knock out a few more walls so it loops and confuses
    const seen = new Set();
    const stack = [[0, 0]];
    seen.add('0,0'); g[1][1] = 0;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < CW && y < CH && !seen.has(x + ',' + y));
      if (!nb.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = nb[Math.floor(rnd() * nb.length)];
      g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
      g[ny * 2 + 1][nx * 2 + 1] = 0;
      seen.add(nx + ',' + ny);
      stack.push([nx, ny]);
    }
    for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
      if (g[y][x] !== 1) continue;
      const hor = g[y][x - 1] === 0 && g[y][x + 1] === 0, ver = g[y - 1][x] === 0 && g[y + 1][x] === 0;
      if ((hor || ver) && rnd() < 0.12) g[y][x] = 0;
    }
    return g;
  }
  function tileOf(x, y) { const t = st.trial; return [Math.floor((x - t.o[0]) / TILE), Math.floor((y - t.o[1]) / TILE)]; }
  function centerOf(tx, ty) { const t = st.trial; return [t.o[0] + (tx + 0.5) * TILE, t.o[1] + (ty + 0.5) * TILE]; }
  function wall(tx, ty) { const t = st.trial; return tx < 0 || ty < 0 || tx >= GW || ty >= GH || t.g[ty][tx] === 1; }
  function inside(x, y) {
    const t = st.trial;
    if (!t || !t.inside) return false;
    return x > t.o[0] - 300 && y > t.o[1] - 300 && x < t.o[0] + GW * TILE + 300 && y < t.o[1] + GH * TILE + 300;
  }
  function passesWalls(ent) { return ent && ent !== player() && !ent.pp && (ent.types || []).includes('ghost'); }
  function collide(ent) {
    if (passesWalls(ent)) return false;
    const r = ent.r || 12;
    const [tx0, ty0] = tileOf(ent.x - r, ent.y - r), [tx1, ty1] = tileOf(ent.x + r, ent.y + r);
    let hit = false;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (!wall(tx, ty)) continue;
      const t = st.trial;
      const x0 = t.o[0] + tx * TILE, y0 = t.o[1] + ty * TILE;
      const cx = U.clamp(ent.x, x0, x0 + TILE), cy = U.clamp(ent.y, y0, y0 + TILE);
      const dx = ent.x - cx, dy = ent.y - cy, d = Math.hypot(dx, dy);
      if (d >= r) continue;
      hit = true;
      if (d < 0.001) { ent.y = y0 + TILE + r; continue; }
      ent.x = cx + (dx / d) * r; ent.y = cy + (dy / d) * r;
    }
    return hit;
  }
  function freeAt(x, y, r) {
    r = r || 12;
    const [tx0, ty0] = tileOf(x - r, y - r), [tx1, ty1] = tileOf(x + r, y + r);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (wall(tx, ty)) return false;
    return true;
  }

  // ---------------------------------------------------------------- the shrine
  function tickShrine(dt) {
    const R = AI.R, p = player(), W = AI.Power;
    if (st.trial || st.shrineDone || !W || !W.zStage()) return;
    const type = W.zTypeOf(p);
    if (!type || W.hasCrystal(type)) return;
    if (!st.shrine) {
      if ((R.Game.time || 0) < 60) return;
      for (let k = 0; k < 30; k++) {
        const a = Math.random() * 6.283, d = U.rand(1000, 1600);
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.85;
        if (!R.World.isFree(x, y, 30) || R.Camera.sees(x, y, 60)) continue;
        st.shrine = { x, y, type, t: 0 };
        return;
      }
      return;
    }
    const s = st.shrine;
    s.t += dt;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d < 70) {
      st.accept += dt;
      const left = Math.ceil(3 - st.accept);
      st.card = { text: 'A Totem\'s trial (' + cap(s.type) + '). Its reward: the ' + W.CRYSTAL[s.type] + '. Stay to begin… ' + Math.max(0, left), t: 0.5, life: 1 };
      if (st.accept >= 3) { st.accept = 0; start(s.type); }
    } else if (st.accept > 0) { st.accept = 0; st.card = null; }
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

  // ---------------------------------------------------------------- the trial
  function start(type, o) {
    o = o || {};
    const R = AI.R, p = player();
    if (st.trial) return false;
    const seed = (Math.random() * 4294967296) >>> 0;
    const t = { type, g: build(seed), o: [ORIGIN[0] + ((seed % 7) * 3000), ORIGIN[1]], inside: false, t: 0, phase: 'enter', wave: 0, waveT: 3, mons: [], totem: null, survive: o.survive || 70, quick: !!o.quick, ret: [p.x, p.y], hazT: 0 };
    st.trial = t;
    fadeTo(1, () => {
      t.stashed = !(R.Coop && R.Coop.active);
      if (t.stashed) try { R.EnemyMgr.stash(); } catch (e) { AI.warn('totem-stash', e); t.stashed = false; }
      try { R.Projectiles.clear(); R.Hazards.clear(); } catch (e) { /* ignore */ }
      t.inside = true;
      const [sx, sy] = centerOf(1, 1);
      p.x = sx; p.y = sy; p._vx = p._vy = 0;
      if (AI.Mansion) AI.Mansion.snapCamera(p);
      t.phase = 'survive';
      st.card = { text: theme(type) === THEME.ghost || type === 'dark' ? 'The light goes out behind you. Something is moving in the dark. Survive.' : 'The Totem\'s trial: survive what comes for you.', t: 0, life: 5 };
      AI.Bus.emit({ type: 'totem', what: 'start', t: type, x: p.x, y: p.y, loud: 0 });
      fadeTo(0, null, 1.2);
    });
    return true;
  }
  function floorTiles() {
    const t = st.trial, out = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (t.g[y][x] === 0) out.push([x, y]);
    return out;
  }
  // Pokémon of the trial's type, about as strong as the stage
  function pool(type) {
    const R = AI.R;
    if (st.poolFor === type && st.pool) return st.pool;
    const out = [];
    for (const k in R.DEX_BY) {
      const d = R.DEX_BY[k];
      if (!d || !d.types || !d.types.includes(type) || d.leg || d.rarity >= 5 || !R.SPRITE_META[d.dex]) continue;
      if (d.bst < 250 || d.bst > 560) continue;
      out.push(d);
    }
    st.pool = out; st.poolFor = type;
    return out;
  }
  function spawn(d, x, y, o) {
    const R = AI.R;
    const T = R.Enemies.TIERS, ti = Math.min(T.length - 1, 2);
    const def = AI.Areas.defFor(d, T[ti], ti);
    def.behavior = 'chase';
    let sc = { hp: 1, spd: 1, dmg: 1 };
    try { sc = R.Maps.sc(R.Enemies.scale(R.Game.time || 0)); } catch (e) { /* ignore */ }
    const e = new R.Enemy(def, x, y, sc);
    e.psxTrial = true; e.psxPlaced = true; e.psxForceTemp = 'aggressive';
    if (o && o.totem) { e.psxTotem = true; e.maxHp *= o.quick ? 2 : 6; e.hp = e.maxHp; e._dmg = (e._dmg || 8) * 1.4; }
    R.EnemyMgr.add(e);
    if (!R.EnemyMgr.all().includes(e)) return null;
    return e;
  }
  function tickTrial(dt) {
    const t = st.trial, R = AI.R, p = player();
    if (!t.inside) return;
    t.t += dt;
    // anything in here belongs to the trial (a horde member's summons, say)
    for (const e of R.EnemyMgr.all()) if (!e.dead && !e.psxTrial && inside(e.x, e.y)) { e.psxTrial = true; t.mons.push(e); }
    t.mons = t.mons.filter((m) => !m.dead && R.EnemyMgr.all().includes(m));
    if (t.phase === 'survive') {
      t.waveT -= dt;
      if (t.waveT <= 0) {
        t.wave++;
        t.waveT = t.quick ? 2 : U.rand(5.5, 8);
        const n = Math.min(7, 2 + Math.floor(t.t / 14));
        const tiles = floorTiles().filter(([x, y]) => { const [cx, cy] = centerOf(x, y); const dd = Math.hypot(cx - p.x, cy - p.y); return dd > 230 && dd < 700; });
        const list = pool(t.type);
        for (let i = 0; i < n && tiles.length && list.length && t.mons.length < 18; i++) {
          const [tx, ty] = tiles.splice(Math.floor(Math.random() * tiles.length), 1)[0];
          const [x, y] = centerOf(tx, ty);
          const m = spawn(U.pick(list), x, y);
          if (m) t.mons.push(m);
        }
      }
      if (t.t >= t.survive) {
        // the Totem itself, at the heart of the maze
        t.phase = 'totem';
        const R2 = AI.R;
        const dex = R2.SPRITE_META[TOTEM[t.type]] && R2.DEX_BY[TOTEM[t.type]] ? TOTEM[t.type] : (pool(t.type).slice().sort((a, b) => b.bst - a.bst)[0] || {}).dex;
        const [x, y] = centerOf(GW - 2, GH - 2);
        t.totem = dex ? spawn(R2.DEX_BY[dex], x, y, { totem: true, quick: t.quick }) : null;
        st.card = { text: 'The Totem ' + ((R2.DEX_BY[dex] || {}).name || '') + ' rises at the heart of the maze.', t: 0, life: 4 };
        try { R2.Audio.sfx('boss'); R2.Camera.kick(0.6); } catch (e) { /* ignore */ }
        if (!t.totem) { win(); return; }
      }
    } else if (t.phase === 'totem') {
      if (t.totem && (t.totem.dead || !R.EnemyMgr.all().includes(t.totem))) win();
    } else if (t.phase === 'won') {
      t.wonT += dt;
      if (t.wonT > 3.5) leave();
    }
    hazards(dt);
  }
  // what the floor does in this trial
  function hazards(dt) {
    const t = st.trial, p = player();
    const h = theme(t.type).hazard;
    if (!h) return;
    t.hazT -= dt;
    const [tx, ty] = tileOf(p.x, p.y);
    const on2 = ((tx * 7 + ty * 13 + (t.o[0] % 5)) % 9) === 0; // every ninth tile or so
    if (!on2 || t.hazT > 0) return;
    t.hazT = 1;
    try {
      if (h === 'burn' || h === 'zap') p.hurt(Math.max(1, p.maxHp * 0.04), h === 'zap' ? 'electric' : t.type, false, 'spec');
      else if (h === 'slow' && p.triStatus) p.triStatus(2);
    } catch (e) { /* ignore */ }
  }
  function win() {
    const t = st.trial;
    if (t.phase === 'won') return;
    t.phase = 'won'; t.wonT = 0;
    const W = AI.Power;
    const got = W.giveCrystal(t.type);
    st.card = { text: 'You obtained the ' + W.CRYSTAL[t.type] + '! Your Z-Move can be used now.', t: 0, life: 4 };
    try { AI.R.Audio.sfx('legend'); } catch (e) { /* ignore */ }
    if (AI.Exp) AI.Exp.give(6, 'totem trial', { key: 'totem:' + t.type });
    for (const m of t.mons) { m.dead = true; m.hp = 0; }
    st.shrineDone = true; st.shrine = null;
    AI.Bus.emit({ type: 'totem', what: 'won', t: t.type, got, x: player().x, y: player().y, loud: 0 });
  }
  function leave() {
    const t = st.trial, R = AI.R, p = player();
    fadeTo(1, () => {
      for (const m of R.EnemyMgr.all()) if (m.psxTrial) { m.dead = true; m.hp = 0; }
      t.inside = false;
      if (t.stashed) try { R.EnemyMgr.restore(); } catch (e) { AI.warn('totem-restore', e); }
      p.x = t.ret[0]; p.y = t.ret[1]; p._vx = p._vy = 0;
      if (AI.Mansion) AI.Mansion.snapCamera(p);
      st.trial = null;
      AI.Bus.emit({ type: 'totem', what: 'leave', x: p.x, y: p.y, loud: 0 });
      fadeTo(0, null, 1.2);
    });
  }
  function fadeTo(v, cb, speed) { st.fadeTo = v; st.fadeCb = cb || null; st.fadeSpeed = speed || 2.2; }

  function tick(dt) {
    if (st.fade !== st.fadeTo) { const s = (st.fadeSpeed || 2) * dt; st.fade = st.fadeTo > st.fade ? Math.min(st.fadeTo, st.fade + s) : Math.max(st.fadeTo, st.fade - s); }
    if (st.fade === st.fadeTo && st.fadeCb) { const cb = st.fadeCb; st.fadeCb = null; try { cb(); } catch (e) { AI.warn('totem-fade', e); } }
    if (st.card) { st.card.t += dt; if (st.card.t > st.card.life) st.card = null; }
    if (!on()) return;
    const p = player();
    if (!p || p.dead || AI.R.Game.state !== 'playing') return;
    if (st.trial) tickTrial(dt); else tickShrine(dt);
  }

  // ---------------------------------------------------------------- drawing
  function drawGround(ctx) {
    const t = st.trial, R = AI.R, cam = R.Camera;
    const th = theme(t.type);
    const [tx0, ty0] = tileOf(cam.left() - TILE, cam.top() - TILE), [tx1, ty1] = tileOf(cam.left() + cam.w + TILE, cam.top() + cam.h + TILE * 2);
    ctx.fillStyle = '#050407';
    ctx.fillRect(cam.left() - 10, cam.top() - 10, cam.w + 20, cam.h + 20);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const x = t.o[0] + tx * TILE, y = t.o[1] + ty * TILE;
      if (tx < -1 || ty < -1 || tx > GW || ty > GH) continue;
      if (!wall(tx, ty)) {
        ctx.fillStyle = th.floor; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; if ((tx + ty) & 1) ctx.fillRect(x, y, TILE, TILE);
        if (th.hazard && ((tx * 7 + ty * 13 + (t.o[0] % 5)) % 9) === 0) {
          ctx.fillStyle = th.hazard === 'burn' ? 'rgba(255,110,40,0.35)' : th.hazard === 'zap' ? 'rgba(255,240,120,' + (0.2 + 0.2 * Math.sin(AI.time * 9 + tx)).toFixed(2) + ')' : 'rgba(150,200,255,0.25)';
          ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);
        }
      } else {
        // a wall: its face, then its top
        ctx.fillStyle = th.wall; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = th.top; ctx.fillRect(x, y - 18, TILE, TILE - 4);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + TILE - 8, TILE, 8);
      }
    }
  }
  function drawAir(ctx) {
    const s = st.shrine, R = AI.R;
    if (s && !st.trial && R.Camera.sees(s.x, s.y, 300)) {
      const col = R.U.TYPE_COLOR[s.type] || '#c8b8ff';
      // a pale beam of light rising into the sky, and the stone
      const g = ctx.createLinearGradient(0, s.y - 520, 0, s.y - 40);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, hexA(col, 0.35 + 0.1 * Math.sin(AI.time * 2)));
      ctx.fillStyle = g; ctx.fillRect(s.x - 10, s.y - 520, 20, 480);
      try { AI.Art.draw(ctx, 'g_pillar', s.x, s.y, { scale: 1.3 }); } catch (e) { /* ignore */ }
      const oy = s.y - 72 + Math.sin(AI.time * 1.7) * 4;
      const og = ctx.createRadialGradient(s.x, oy, 0, s.x, oy, 16);
      og.addColorStop(0, '#ffffff'); og.addColorStop(0.4, col); og.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = og; ctx.fillRect(s.x - 16, oy - 16, 32, 32);
    }
    // the Totem's aura
    const t = st.trial;
    if (t && t.totem && !t.totem.dead) {
      const e = t.totem;
      const col = R.U.TYPE_COLOR[t.type] || '#ffffff';
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const ag = ctx.createRadialGradient(e.x, e.y - 30, 6, e.x, e.y - 30, 70);
      ag.addColorStop(0, hexA(col, 0.35)); ag.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = ag; ctx.fillRect(e.x - 70, e.y - 100, 140, 140);
      ctx.restore();
    }
  }
  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
    if (!m) return 'rgba(255,255,255,' + a + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a.toFixed(3) + ')';
  }
  function lights(out) {
    const s = st.shrine, t = st.trial;
    if (s && !t) {
      const c = AI.R.U.TYPE_COLOR[s.type] || '#c8b8ff';
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(c);
      out.push({ x: s.x, y: s.y - 70, r: 240, c: m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [200, 180, 255], i: 0.7 });
    }
    if (active()) {
      const p = player();
      // the Z-Ring on your wrist glows faintly; in the dark it's what lets you see at all
      if (!(AI.Light && AI.Light.carriesLight(p))) out.push({ x: p.x, y: p.y - 20, r: 105, c: [200, 220, 255], i: 0.75 });
      if (t.totem && !t.totem.dead) out.push({ x: t.totem.x, y: t.totem.y - 30, r: 140, c: [255, 255, 255], i: 0.5 });
    }
  }
  function ambient() { return theme(st.trial.type).amb.slice(); }
  function visibleProps() { return []; }
  function drawScreen(ctx, w, h) {
    if (st.fade > 0.01) { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,' + st.fade.toFixed(3) + ')'; ctx.fillRect(0, 0, w, h); ctx.restore(); }
    const c = st.card;
    if (c && on()) {
      const a = Math.min(1, c.t / 0.3, (c.life - c.t) / 0.4);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = '700 15px Pixelify, "Segoe UI", sans-serif';
      const tw = ctx.measureText(c.text).width;
      const bw = Math.min(w - 40, tw + 40), x = (w - bw) / 2, y = h * 0.2;
      ctx.fillStyle = 'rgba(12,10,22,0.85)'; ctx.strokeStyle = '#e8c060'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.arcTo(x + bw, y, x + bw, y + 34, 8); ctx.arcTo(x + bw, y + 34, x, y + 34, 8); ctx.arcTo(x, y + 34, x, y, 8); ctx.arcTo(x, y, x + bw, y, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff4d8'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.fillText(c.text, w / 2, y + 17);
      ctx.restore();
    }
    // the time left to hold out
    const t = st.trial;
    if (t && t.inside && t.phase === 'survive') {
      const left = Math.max(0, Math.ceil(t.survive - t.t));
      ctx.save(); ctx.font = '800 18px Pixelify, "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe7a0';
      ctx.fillText('Survive · ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'), w / 2, 64);
      ctx.restore();
    }
  }
  function reset() { st.shrine = null; st.shrineDone = false; st.trial = null; st.fade = st.fadeTo = 0; st.fadeCb = null; st.card = null; st.accept = 0; }

  AI.define('Totem', { st, THEME, TOTEM, start, tick, active, inside, collide, freeAt, drawGround, drawAir, drawScreen, lights, ambient, visibleProps, reset, win, leave, build, GW, GH, TILE, tileOf, centerOf, wall });
})();
