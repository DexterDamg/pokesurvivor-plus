/* PokéSurvivor+ — Living World AI · the mansion's hauntings, and something else
 * A director keeps the house unsettling without wearing it out: one strange thing at a time, never
 * the same trick twice in a row, long stretches of silence in between, and it gets bolder as you
 * explore. Knocking behind the locked ballroom door, banging upstairs, doors that slam or creak open,
 * footsteps in empty halls, furniture that has moved when you look back, a chandelier swaying in
 * still air, candles going out and lighting themselves, a shape darting past the edge of the screen,
 * whispers from an empty room, portraits whose faces change, a reflection in a window that lags
 * behind you, cold drafts, something scratching inside the walls, rattling armour, and a Duskull
 * that follows you down the hall but is never there when you turn around.
 * (They're pranks, as you'll find out. 89-story.js.)
 *
 * Not all of it is. The tall mirror at the end of the hall shows something no prankster put there.
 * Its influence is different from theirs, and used sparingly: a total stillness where even the
 * candle flames stop moving and the colour drains away, shadows stretching the wrong way, a hallway
 * that is longer than it should be, the room upside down in the glass, a drone too low to hear.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const M = () => AI.Mansion;

  const hs = {
    visitT: 0, tension: 0, nextT: 8, quietUntil: 0, inRow: 0, last: null,
    count: {}, cool: {}, done: new Set(), seen: 0, rooms: new Set(),
    actors: [], dust: [], smoke: [], texts: [], hist: [],
    duskull: null, reflect: 0,
    mirror: { phase: 'idle', t: 0, done: false, armed: false, flip: 0, vast: 0 },
    still: 0, stretch: 0, shadows: 0, drain: 0, jump: 0, jumpT: 0, flash: 0, turnT: 0,
  };
  function on() { return AI.enabled && AI.cfg.mansion !== false && M() && M().inside; }
  function rate() { return Math.max(0, AI.cfg.hauntRate == null ? 1 : AI.cfg.hauntRate); }
  function story() { return AI.Story; }
  function pranks() { const S = story(); return !S || !S.revealed || !S.revealed(); }
  function sfx(n, x, y, o) { if (AI.Ambience && AI.Ambience.mansion) AI.Ambience.mansion(n, x, y, o); }
  function player() { return AI.R.Game.player; }
  function sees(x, y, m) { return AI.R.Camera.sees(x, y, m == null ? 0 : m); }

  // ---------------------------------------------------------------- the jumpscare image
  const jumpImg = new Image();
  let jumpReady = false;
  jumpImg.onload = () => { jumpReady = true; };
  jumpImg.src = 'assets/env/jumpscare.png';

  // ---------------------------------------------------------------- ghost actors (glimpses, Duskull)
  const anims = new Map();
  function animFor(dex, key) {
    const k = key || dex;
    let a = anims.get(k);
    if (!a) { a = new AI.R.Sprites.Animator(dex, 1, false); a.loop('Idle'); anims.set(k, a); }
    return a;
  }
  function actor(o) {
    const a = Object.assign({ alpha: 0, t: 0, life: 1, vx: 0, vy: 0, bob: Math.random() * 6 }, o);
    a.anim = animFor(a.dex, a.key);
    hs.actors.push(a);
    return a;
  }
  function drawActor(ctx, a) {
    if (a.alpha <= 0.01) return;
    const lift = 10 + Math.sin(AI.time * 2.2 + a.bob) * 4;
    ctx.save();
    ctx.globalAlpha = a.alpha;
    try { a.anim.draw(ctx, a.x, a.y - lift, { alpha: 1 }); } catch (e) { /* sprite not loaded yet */ }
    ctx.restore();
  }

  // ---------------------------------------------------------------- the events
  const EVENTS = {
    knock: { w: 1.2, cap: 3, cool: 40, ok: (r) => r !== 'ballroom', run: knock },
    bang: { w: 0.9, cap: 2, cool: 70, ok: (r) => r === 'foyer' || r === 'hall' || r === 'gallery', run: bang },
    door: { w: 1, cap: 3, cool: 35, ok: () => true, run: doorTrick },
    steps: { w: 1.1, cap: 3, cool: 45, ok: (r) => r === 'hall' || r === 'foyer' || r === 'gallery', run: footsteps },
    furniture: { w: 1.2, cap: 4, cool: 30, ok: () => true, run: moveFurniture },
    chandelier: { w: 0.8, cap: 2, cool: 60, ok: (r) => r === 'foyer' || r === 'dining' || r === 'ballroom', run: swayChandelier },
    candles: { w: 1.3, cap: 6, cool: 18, ok: () => true, run: candles },
    glimpse: { w: 1, cap: 3, cool: 40, ok: () => true, run: glimpse },
    whisper: { w: 0.9, cap: 3, cool: 45, ok: () => true, run: whisper },
    portrait: { w: 1.1, cap: 4, cool: 30, ok: (r) => r === 'gallery' || r === 'foyer' || r === 'dining' || r === 'study', run: portrait },
    reflection: { w: 0.8, cap: 1, cool: 120, ok: (r) => r === 'dining' || r === 'gallery' || r === 'ballroom', run: reflection },
    draft: { w: 0.8, cap: 3, cool: 50, ok: () => true, run: draft },
    walls: { w: 0.8, cap: 2, cool: 60, ok: () => true, run: walls },
    armour: { w: 1, cap: 2, cool: 50, ok: (r) => r === 'gallery', run: armour },
    clock: { w: 0.6, cap: 1, cool: 200, ok: (r) => r === 'foyer', run: clock },
    duskull: { w: 0.9, cap: 2, cool: 80, ok: (r) => r === 'hall' || r === 'foyer', run: startDuskull },
  };
  function happened(k) { return hs.done.has(k); }
  function note(k) { hs.done.add(k); hs.count[k] = (hs.count[k] || 0) + 1; hs.cool[k] = AI.time; hs.seen++; hs.last = k; AI.Bus.emit({ type: 'mansion', what: 'haunt', kind: k, x: 0, y: 0, loud: 0 }); }

  function knock() {
    const it = M().st.built;
    const d = it.doors.find((q) => q.id === 'ballroom');
    if (!d || !d.locked) return false;
    const x = it.ox + 32.5 * M().TS, y = it.oy + 10 * M().TS;
    sfx('knock', x, y, U.pick([3, 3, 4, 2]));
    return true;
  }
  function bang() {
    sfx('bang', 0, 0, U.pick([2, 3]));
    const p = player();
    for (let i = 0; i < 3; i++) setTimeout(() => { try { AI.R.Camera.kick(0.25); dustFall(p.x + U.rand(-220, 220), p.y + U.rand(-160, 80), 14); } catch (e) { /* ignore */ } }, i * 550);
    const it = M().st.built;
    for (const c of it.chandeliers) if (Math.hypot(c.x - p.x, c.y - p.y) < 500) c.sway = Math.max(c.sway, 0.5);
    return true;
  }
  function dustFall(x, y, n) { for (let i = 0; i < n; i++) hs.dust.push({ x: x + U.rand(-30, 30), y, z: U.rand(120, 220), vz: U.rand(30, 70), t: 0 }); }
  function doorTrick() {
    const it = M().st.built;
    const p = player();
    const cands = it.doors.filter((d) => !d.locked);
    if (!cands.length) return false;
    const d = U.pick(cands);
    if (d.open) {
      if (!closeIfAway(d, p)) return false;
      // it creaks back open a little later
      setTimeout(() => { try { if (M().inside && !d.open) M().openDoor(d, true); } catch (e) { /* ignore */ } }, U.rand(7000, 14000));
    } else M().openDoor(d, true);
    return true;
  }
  function closeIfAway(d, p) {
    const it = M().st.built;
    const [cx, cy] = d.cells[0];
    const wx = it.ox + cx * M().TS, wy = it.oy + cy * M().TS;
    if (Math.hypot(p.x - wx, p.y - wy) < 90) return false;
    return M().closeDoor(d, true);
  }
  function footsteps() {
    const p = player();
    const a = Math.random() * 6.283;
    let x = p.x + Math.cos(a) * 420, y = p.y + Math.sin(a) * 300;
    const dir = a + Math.PI + U.rand(-0.6, 0.6);
    const n = 6 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const sx = x + Math.cos(dir) * i * 42, sy = y + Math.sin(dir) * i * 30;
      setTimeout(() => sfx('step', sx, sy), i * U.rand(430, 560));
    }
    return true;
  }
  function moveFurniture() {
    const it = M().st.built;
    const p = player();
    const room = M().roomAt(p.x, p.y);
    // only something you aren't looking at, in this room or the one you just left
    const cands = it.props.filter((q) => ['chair', 'armor', 'candles'].includes(q.kind) && !q.onTable && !sees(q.x + q.ox, q.y + q.oy, -10) && (q.room === room || q.room === hs.lastRoom));
    if (!cands.length) return false;
    const q = U.pick(cands);
    const a = Math.random() * 6.283;
    const nx = q.ox + Math.cos(a) * U.rand(8, 16), ny = q.oy + Math.sin(a) * U.rand(5, 10);
    // never into a wall or onto the player
    const b = M().propRect(Object.assign({}, q, { ox: nx, oy: ny }));
    if (b && !M().freeAt((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, 2)) return false;
    q.ox = U.clamp(nx, -20, 20); q.oy = U.clamp(ny, -14, 14);
    if (q.kind === 'chair' && Math.random() < 0.4) q.f = !q.f;
    sfx('creak', q.x, q.y);
    return true;
  }
  function swayChandelier() {
    const it = M().st.built;
    const p = player();
    const c = it.chandeliers.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 520)[0];
    if (!c) return false;
    c.sway = 1;
    sfx('chandelier', c.x, c.y);
    return true;
  }
  function candles() {
    const it = M().st.built;
    const p = player();
    const near = it.props.filter((q) => q.kind === 'candles' && Math.hypot(q.x - p.x, q.y - p.y) < 420);
    if (!near.length) return false;
    const q = U.pick(near);
    q.lit = !q.lit;
    if (!q.lit) { for (let i = 0; i < 6; i++) hs.smoke.push({ x: q.x + U.rand(-10, 10), y: q.y - AI.Art.size(q.n)[1] * q.s, t: 0, vx: U.rand(-6, 6) }); sfx('snuff', q.x, q.y); }
    else { q.blue = AI.time + 1.2; sfx('ignite', q.x, q.y); }
    return true;
  }
  function glimpse() {
    const cam = AI.R.Camera;
    const left = Math.random() < 0.5;
    const y = cam.top() + cam.h * U.rand(0.25, 0.75);
    const x = left ? cam.left() + 14 : cam.left() + cam.w - 14;
    const dex = U.pick([92, 93, 355, 200]);
    actor({ kind: 'glimpse', dex, key: 'g' + dex, x, y, vx: left ? 170 : -170, vy: U.rand(-30, 30), life: 0.45, alpha: 0 });
    sfx('swish', x, y);
    return true;
  }
  function whisper() {
    const it = M().st.built;
    const p = player();
    const others = it.rooms.filter((r) => !(p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h));
    const r = U.pick(others);
    const x = r.x + r.w / 2, y = r.y + r.h / 2;
    sfx('whisper', x, y);
    // the faintest hint of words, at the edge of the screen in that direction
    const a = Math.atan2(y - p.y, x - p.x);
    hs.texts.push({ a, t: 0, text: U.pick(['…shh…', '…hehe…', '…look…', '…behind…', '…psst…', '…here…']) });
    return true;
  }
  function portrait() {
    const it = M().st.built;
    const p = player();
    const room = M().roomAt(p.x, p.y);
    const mine = it.portraits.filter((q) => q.room === room);
    if (!mine.length) return false;
    const q = U.pick(mine);
    if (!sees(q.x, q.y, -20)) { q.mood = U.pick(['grin', 'look', 'weep', 'hollow']); q.changedAt = AI.time; }
    else {
      // while you watch: its eyes follow you for a moment, then it's calm again — if you blinked
      q.mood = 'look';
      setTimeout(() => { q.mood = Math.random() < 0.7 ? 'calm' : 'grin'; }, 700);
    }
    return true;
  }
  function reflection() { hs.reflect = AI.time + 9; return true; }
  function draft() {
    sfx('draft', 0, 0);
    hs.drain = Math.max(hs.drain, 0.35);
    hs.draftT = AI.time + 2.2;
    const it = M().st.built;
    for (const q of it.props) if (q.kind === 'candles' && q.lit && Math.random() < 0.25 && Math.hypot(q.x - player().x, q.y - player().y) < 380) { q.lit = false; sfx('snuff', q.x, q.y); }
    return true;
  }
  function walls() {
    const p = player();
    const side = Math.random() < 0.5 ? -1 : 1;
    sfx('scratch', p.x + side * 220, p.y - 60);
    for (let i = 0; i < 4; i++) setTimeout(() => dustFall(p.x + side * U.rand(120, 220), p.y + U.rand(-80, 40), 3), i * 350);
    return true;
  }
  function armour() {
    const it = M().st.built;
    const q = U.pick(it.props.filter((o) => o.kind === 'armor'));
    if (!q) return false;
    q.shake = 1;
    for (const pl of it.plaques) pl.shake = 0.8;
    sfx('clank', q.x, q.y);
    setTimeout(() => sfx('swish', q.x, q.y), 300);
    return true;
  }
  function clock() {
    const it = M().st.built;
    const q = it.props.find((o) => o.kind === 'clock');
    if (!q) return false;
    sfx('chime', q.x, q.y, 3);
    q.shake = 0.4;
    return true;
  }
  function startDuskull() {
    if (hs.duskull) return false;
    const p = player();
    hs.duskull = actor({ kind: 'duskull', dex: 355, key: 'duskull', x: p.x, y: p.y + 200, alpha: 0, life: 22, state: 'hidden', seen: 0 });
    return true;
  }
  // Duskull keeps its distance behind you, and is never there when you turn around
  function tickDuskull(a, dt) {
    const p = player();
    const face = facing();
    const dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy) || 1;
    const looking = (face[0] * dx + face[1] * dy) / d > 0.25 && d < 360;
    if (looking) {
      if (a.alpha > 0.2) { sfx('swish', a.x, a.y); a.seen++; }
      a.alpha = Math.max(0, a.alpha - dt * 6);
      a.state = 'hidden';
      return;
    }
    const moving = Math.hypot(p._vx || 0, p._vy || 0) > 30;
    if (a.state === 'hidden') {
      if (!moving) return;
      // reappear behind you, out of the corner of your eye
      const bx = p.x - face[0] * 170, by = p.y - face[1] * 130;
      if (!M().freeAt(bx, by, 10)) return;
      a.x = bx; a.y = by; a.state = 'follow';
    }
    a.alpha = Math.min(0.75, a.alpha + dt * 1.2);
    const tx = p.x - face[0] * 160, ty = p.y - face[1] * 120;
    a.x += (tx - a.x) * Math.min(1, dt * 1.6); a.y += (ty - a.y) * Math.min(1, dt * 1.6);
    a.anim.dir = AI.R.Sprites.dirFromAngle(Math.atan2(p.y - a.y, p.x - a.x));
  }
  function facing() {
    const p = player();
    const sp = Math.hypot(p._vx || 0, p._vy || 0);
    if (sp > 20) return [p._vx / sp, p._vy / sp];
    const a = p.moveAngle != null ? p.moveAngle : Math.PI / 2;
    return [Math.cos(a), Math.sin(a)];
  }

  // ---------------------------------------------------------------- the mirror
  // where the eyes are in the shadow sprite: fraction of its height from the bottom, offsets of its width
  const EYE_Y = 0.49, EYE_X = [-0.05, 0.06];
  /* Phases: idle → (you stand before it, after the house has had time to get under your skin)
   * dread → shadow → scare → turn → after. Then never again in that form. */
  function mirrorTick(dt) {
    const it = M().st.built;
    const mi = it.mirror;
    const p = player();
    const m = hs.mirror;
    m.t += dt;
    const dx = p.x - mi.x, dy = p.y - mi.y;
    const close = Math.abs(dx) < 70 && dy > 0 && dy < 190;
    const up = facing()[1] < -0.35 || Math.abs(dx) < 50;
    const S = story();
    const ready = !m.done && (!S || (S.canMirror() && !S.busy())) && (hs.seen >= 4 || hs.visitT > 70);
    if (m.phase === 'idle') {
      if (close && up && ready) { m.phase = 'look'; m.t = 0; }
      return;
    }
    if (m.phase === 'look') {
      if (!close) { m.phase = 'idle'; return; }
      if (m.t > 1.4) { m.phase = 'dread'; m.t = 0; sfx('silence', 0, 0, 0); sfx('drone', 0, 0, 0.5); M().st.dim = 1; hs.still = 1; }
      return;
    }
    if (m.phase === 'dread') {
      M().st.dim = U.lerp(1, 0.35, Math.min(1, m.t / 1.2));
      if (m.t > 1.3) { m.phase = 'shadow'; m.t = 0; }
      return;
    }
    if (m.phase === 'shadow') {
      if (m.t > 1.0) {
        m.phase = 'scare'; m.t = 0;
        hs.jumpT = 0; hs.jump = 1;
        sfx('sting', 0, 0);
        try { AI.R.Camera.kick(1); } catch (e) { /* ignore */ }
        AI.Bus.emit({ type: 'mansion', what: 'mirror', x: mi.x, y: mi.y, loud: 0 });
      }
      return;
    }
    if (m.phase === 'scare') {
      if (m.t > 0.8) { m.phase = 'turn'; m.t = 0; hs.jump = 0; hs.turnT = 1.6; if (p.anim) p.anim.dir = 0; }
      return;
    }
    if (m.phase === 'turn') {
      // you spin around: nothing there
      if (p.anim) p.anim.dir = 0;
      if (m.t > 1.6) { m.phase = 'after'; m.t = 0; AI.playerBubble.icon = 'scared'; AI.playerBubble.t = 2.4; }
      return;
    }
    if (m.phase === 'after') {
      M().st.dim = U.lerp(0.35, 1, Math.min(1, m.t / 3));
      if (m.t > 0.5 && hs.still > 0) { hs.still = 0; sfx('drone', 0, 0, 0); }
      if (m.t > 3) { m.phase = 'idle'; m.done = true; M().st.dim = 1; sfx('silence', 0, 0, 1); if (S && S.onMirror) S.onMirror(); }
    }
  }
  // the vast shape in the glass, from far down the hall (the story's ending)
  function mirrorGlimpse(dur) { hs.mirror.vast = AI.time + (dur || 0.9); }
  function stillness(dur, drone) { hs.still = 1; hs.stillUntil = AI.time + (dur || 4); sfx('silence', 0, 0, 0); if (drone !== false) sfx('drone', 0, 0, 0.6); }
  function endStillness() { hs.still = 0; hs.stillUntil = 0; sfx('silence', 0, 0, 1); sfx('drone', 0, 0, 0); }

  function drawMirror(ctx, prop, x, y) {
    const A = AI.Art;
    const gl = x - 32, gt = y - 110, gw = 64, gh = 96;
    ctx.save();
    // the glass: an arched pane
    ctx.beginPath();
    ctx.moveTo(gl, gt + 12); ctx.quadraticCurveTo(gl + gw / 2, gt - 12, gl + gw, gt + 12);
    ctx.lineTo(gl + gw, gt + gh); ctx.lineTo(gl, gt + gh); ctx.closePath();
    ctx.clip();
    // a cold sheen comes over the glass when something is about to show in it
    const m0 = hs.mirror;
    const cold = (m0.phase === 'dread' ? Math.min(1, m0.t / 1.2) : m0.phase === 'shadow' || m0.phase === 'scare' ? 1 : 0) || (m0.vast > AI.time ? 1 : 0);
    const grd = ctx.createLinearGradient(0, gt, 0, gt + gh);
    const mix = (a, b) => 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * cold)).join(',') + ')';
    grd.addColorStop(0, mix([26, 22, 38], [138, 140, 170])); grd.addColorStop(1, mix([46, 40, 64], [84, 84, 110]));
    ctx.fillStyle = grd; ctx.fillRect(gl, gt - 14, gw, gh + 14);
    // the hallway behind you, reflected: two dim candle glows, receding floorboards
    ctx.fillStyle = 'rgba(120,96,80,0.18)';
    for (let i = 0; i < 6; i++) ctx.fillRect(gl, gt + gh - 8 - i * i * 2.4, gw, 1);
    const m = hs.mirror;
    const flip = m.flip > AI.time;
    const p = player();
    const d = p.y - y;
    const showSelf = d > 0 && d < 300 && Math.abs(p.x - x) < 120;
    if (flip) { ctx.translate(0, gt * 2 + gh); ctx.scale(1, -1); }
    // the shadow behind you
    let shadowA = 0;
    if (m.phase === 'shadow') shadowA = Math.min(1, m.t / 0.5);
    if (m.phase === 'scare') shadowA = 1;
    if (m.vast > AI.time) shadowA = 0.95;
    if (shadowA > 0 && A.has('giratina_shadow')) {
      const [sw0, sh0] = A.size('giratina_shadow');
      const big = m.vast > AI.time;
      // sized so its eyes sit near the top of the glass and its wings don't fit in it
      const base = gt + gh + 18;
      const ky = (gh + 18 - (big ? 40 : 24)) / (sh0 * EYE_Y);
      const kx = ky / 1.5 * (big ? 2.2 : 1.15);
      const sx = (big ? x : U.clamp(p.x, x - 16, x + 16)) + Math.sin(AI.time * 1.3) * 2;
      ctx.save();
      ctx.globalAlpha = shadowA;
      ctx.translate(sx, base);
      ctx.scale(kx, ky); // impossibly tall
      A.draw(ctx, 'giratina_shadow', 0, 0, {});
      ctx.restore();
      // the eyes catch the light
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ey = base - sh0 * ky * EYE_Y;
      for (const ex of EYE_X) {
        const exx = sx + ex * sw0 * kx;
        const g = ctx.createRadialGradient(exx, ey, 0, exx, ey, big ? 9 : 6);
        g.addColorStop(0, 'rgba(255,50,70,' + (0.95 * shadowA).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,40,60,0)');
        ctx.fillStyle = g; ctx.fillRect(exx - 10, ey - 10, 20, 20);
      }
      ctx.restore();
    }
    // you, in the glass (the reflection keeps still while the shadow rises)
    if (showSelf) {
      const a = reflAnim(p);
      const k = U.clamp(0.95 - d / 650, 0.5, 0.9);
      const rx = U.clamp(x + (p.x - x) * 0.55, gl + 14, gl + gw - 14);
      const ry = gt + gh - 6 - d * 0.12;
      ctx.save();
      ctx.globalAlpha = 0.78;
      ctx.translate(rx, ry); ctx.scale(k, k);
      try { a.draw(ctx, 0, 0, { alpha: 1 }); } catch (e) { /* ignore */ }
      ctx.restore();
    }
    ctx.restore();
    // grime and a sheen across the glass
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(gl + 8, gt + gh); ctx.lineTo(gl + 22, gt + gh); ctx.lineTo(gl + gw - 6, gt + 10); ctx.lineTo(gl + gw - 18, gt + 6); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#0a0810';
    for (let i = 0; i < 18; i++) ctx.fillRect(gl + U.hash(i, 1, 3) * gw, gt + U.hash(i, 2, 3) * gh, 1, 1);
    ctx.restore();
    A.draw(ctx, prop.n, x, y, {});
  }
  let refl = null;
  function reflAnim(p) {
    if (!refl || refl.dex !== p.dex) refl = new AI.R.Sprites.Animator(p.dex, 1, !!p.shiny);
    const m = hs.mirror;
    // a mirror on the north wall faces you: what faces up in the room faces down in the glass
    const a = p.moveAngle != null ? p.moveAngle : Math.PI / 2;
    if (m.phase !== 'shadow' && m.phase !== 'scare') refl.dir = AI.R.Sprites.dirFromAngle(-a);
    refl.loop(p.walking && m.phase !== 'shadow' ? 'Walk' : 'Idle');
    refl.update && refl.update(1 / 60);
    return refl;
  }

  // ---------------------------------------------------------------- per frame
  function tick(dt) {
    if (!on()) return;
    const p = player();
    if (!p || p.dead) return;
    const it = M().st.built;
    if (!it) return;
    hs.visitT += dt;
    hs.hist.push([p.x, p.y, p.anim ? p.anim.dir : 0]);
    if (hs.hist.length > 60) hs.hist.shift();
    const room = M().roomAt(p.x, p.y);
    if (room) { if (room !== hs.room) { hs.lastRoom = hs.room; hs.room = room; } hs.rooms.add(room); }
    // actors
    for (let i = hs.actors.length - 1; i >= 0; i--) {
      const a = hs.actors[i];
      a.t += dt;
      try { a.anim.update && a.anim.update(dt); } catch (e) { /* ignore */ }
      if (a.kind === 'glimpse') { a.x += a.vx * dt; a.y += a.vy * dt; a.alpha = Math.sin(Math.min(1, a.t / a.life) * Math.PI) * 0.45; }
      else if (a.kind === 'duskull') { if (pranks() && hs.mirror.phase === 'idle' && !hs.still) tickDuskull(a, dt); else a.alpha = Math.max(0, a.alpha - dt * 3); }
      if (a.t > a.life) { hs.actors.splice(i, 1); if (a === hs.duskull) hs.duskull = null; }
    }
    for (let i = hs.dust.length - 1; i >= 0; i--) { const d = hs.dust[i]; d.t += dt; d.z -= d.vz * dt; if (d.z <= 0) hs.dust.splice(i, 1); }
    for (let i = hs.smoke.length - 1; i >= 0; i--) { const s = hs.smoke[i]; s.t += dt; if (s.t > 2) hs.smoke.splice(i, 1); }
    for (let i = hs.texts.length - 1; i >= 0; i--) { hs.texts[i].t += dt; if (hs.texts[i].t > 2.6) hs.texts.splice(i, 1); }
    if (hs.stillUntil && AI.time > hs.stillUntil) endStillness();
    if (hs.drain > 0 && !(hs.draftT > AI.time)) hs.drain = Math.max(0, hs.drain - dt * 0.4);
    if (hs.jump) hs.jumpT += dt;
    mirrorTick(dt);
    const S = story();
    if (S && S.busy()) return; // a scene is playing: the house holds its breath
    if (hs.mirror.phase !== 'idle' || hs.still) return;
    // the director
    if (!pranks()) return;
    hs.tension = U.clamp(hs.visitT / 150 + hs.seen * 0.06, 0, 1);
    if (AI.time < hs.quietUntil) return;
    hs.nextT -= dt * rate() * (0.7 + hs.tension * 0.6);
    if (hs.nextT > 0) return;
    hs.nextT = U.rand(7, 15);
    const opts = {};
    for (const k in EVENTS) {
      const e = EVENTS[k];
      if ((hs.count[k] || 0) >= e.cap || k === hs.last) continue;
      if (AI.time - (hs.cool[k] == null ? -1e9 : hs.cool[k]) < e.cool) continue;
      if (!e.ok(room)) continue;
      opts[k] = e.w;
    }
    const k = U.wpick(opts);
    if (!k) return;
    if (EVENTS[k].run()) {
      note(k);
      // after two or three things, a long silence
      if (++hs.inRow >= 2 + ((Math.random() * 2) | 0)) { hs.inRow = 0; hs.quietUntil = AI.time + U.rand(15, 28); }
    }
  }

  // ---------------------------------------------------------------- drawing
  function drawables() {
    const out = [];
    for (const a of hs.actors) {
      if (a.alpha <= 0.01) continue;
      out.push(a._pr || (a._pr = { psxDraw: (ctx) => drawActor(ctx, a), get x() { return a.x; }, get y() { return a.y; }, flat: false, type: 'psx-m', tx: 0, ty: 0, r: 0 }));
    }
    return out;
  }
  function drawGround(ctx, it) {
    // shadows stretching the wrong way, toward the mirror
    if (hs.shadows > AI.time) {
      const k = Math.min(1, (hs.shadows - AI.time) / 0.6);
      ctx.save();
      ctx.globalAlpha = 0.45 * k;
      ctx.fillStyle = '#05030a';
      for (const q of it.props) {
        if (q.flat || q.wall || !AI.R.Camera.sees(q.x, q.y, 40)) continue;
        const ang = Math.atan2(it.mirror.y - q.y, it.mirror.x - q.x);
        const len = 180 + (U.hash(q.id, 4, 4) * 120);
        ctx.beginPath();
        ctx.moveTo(q.x - 10, q.y); ctx.lineTo(q.x + 10, q.y);
        ctx.lineTo(q.x + Math.cos(ang) * len + 3, q.y + Math.sin(ang) * len);
        ctx.lineTo(q.x + Math.cos(ang) * len - 3, q.y + Math.sin(ang) * len);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // a reflection in the window glass that doesn't quite keep up with you
    if (hs.reflect > AI.time) {
      const p = player();
      const lag = hs.hist[Math.max(0, hs.hist.length - 40)];
      for (const w of it.windows) {
        if (Math.abs(p.x - w.x) > 120 || p.y - w.y > 260 || p.y < w.y) continue;
        const a = reflAnim(p);
        ctx.save();
        ctx.beginPath(); ctx.rect(w.x - 40, w.y - 34, 80, 56); ctx.clip();
        ctx.globalAlpha = 0.22;
        ctx.translate(U.clamp(lag ? lag[0] : p.x, w.x - 30, w.x + 30), w.y + 14);
        ctx.scale(0.55, 0.55);
        try { a.draw(ctx, 0, 0, { alpha: 1 }); } catch (e) { /* ignore */ }
        ctx.restore();
      }
    }
  }
  function drawAir(ctx) {
    ctx.fillStyle = 'rgba(200,190,180,0.7)';
    for (const d of hs.dust) ctx.fillRect(Math.round(d.x), Math.round(d.y - d.z), 1, 2);
    for (const s of hs.smoke) {
      ctx.fillStyle = 'rgba(180,180,200,' + (0.35 * (1 - s.t / 2)).toFixed(3) + ')';
      ctx.fillRect(Math.round(s.x + s.vx * s.t + Math.sin(s.t * 3) * 3), Math.round(s.y - s.t * 22), 2, 2);
    }
    // a candle that relit itself burns blue for a moment
    const it = M().st.built;
    for (const q of it.props) if (q.blue > AI.time) {
      ctx.fillStyle = 'rgba(120,170,255,0.9)';
      const h = AI.Art.size(q.n)[1] * q.s;
      ctx.fillRect(Math.round(q.x - 1), Math.round(q.y - h - 2), 2, 4);
    }
  }
  function lights(out, it) {
    for (const a of hs.actors) if (a.alpha > 0.2) out.push({ x: a.x, y: a.y - 20, r: 60, c: [170, 120, 255], i: a.alpha * 0.6 });
    // the stillness: every flame holds perfectly still
    if (hs.still) for (const l of out) if (l.src) l.i = 0.8 * (M().st.dim == null ? 1 : M().st.dim);
  }
  // screen space, before the HUD: colour draining away, a hallway that stretches
  function drawPost(ctx, w, h) {
    if (!on()) return;
    const drain = Math.max(hs.drain, hs.still ? 0.75 : 0);
    if (drain > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,' + drain.toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(150,140,190,' + (drain * 0.5).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (hs.stretch > AI.time) {
      const k = Math.min(1, (hs.stretch - AI.time) / 0.8) * Math.min(1, (AI.time - (hs.stretchStart || 0)) / 0.6);
      ctx.save();
      ctx.globalAlpha = 0.28 * k;
      for (let i = 1; i <= 3; i++) {
        const s = 1 + 0.06 * i * k;
        ctx.drawImage(ctx.canvas, 0, 0, w, h, w / 2 - (w * (2 - s)) / 2, -h * (s - 1) * 1.3, w * (2 - s), h * s);
      }
      ctx.restore();
    }
  }
  function drawScreen(ctx, w, h) {
    if (!AI.enabled) return;
    // whispered words drift at the edge of the screen
    if (hs.texts.length) {
      ctx.save();
      ctx.font = 'italic 700 13px Pixelify, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      for (const t of hs.texts) {
        const a = Math.sin(Math.min(1, t.t / 2.6) * Math.PI) * 0.55;
        const x = w / 2 + Math.cos(t.a) * w * 0.4, y = h / 2 + Math.sin(t.a) * h * 0.36 - t.t * 6;
        ctx.fillStyle = 'rgba(200,190,230,' + a.toFixed(3) + ')';
        ctx.fillText(t.text, x, y);
      }
      ctx.restore();
    }
    if (!hs.jump) return;
    // the jumpscare
    const t = hs.jumpT;
    const full = AI.cfg.jumpscare !== false;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (full && jumpReady && t < 0.62) {
      const iw = jumpImg.width, ih = jumpImg.height;
      const z = 1.12 + t * 0.6;
      const scale = Math.max(w / iw, h / ih) * z;
      const jx = (Math.random() - 0.5) * 26 * (1 - t), jy = (Math.random() - 0.5) * 20 * (1 - t);
      const dw = iw * scale, dh = ih * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(jumpImg, w / 2 - dw / 2 + jx, h / 2 - dh * 0.46 + jy, dw, dh);
      // drown the edges in black and the whole in red
      const vg = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.18, w / 2, h * 0.45, h * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.92)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(255,120,130,1)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      const fk = (AI.cfg.flashIntensity == null ? 1 : AI.cfg.flashIntensity);
      if (t < 0.08 && fk > 0) { ctx.fillStyle = 'rgba(255,230,230,' + (0.55 * fk).toFixed(2) + ')'; ctx.fillRect(0, 0, w, h); }
    } else if (!full && t < 0.6) {
      // the gentle version: two red eyes in the dark
      for (const ex of [-0.04, 0.04]) {
        const g = ctx.createRadialGradient(w / 2 + ex * w, h * 0.42, 0, w / 2 + ex * w, h * 0.42, 18);
        g.addColorStop(0, 'rgba(255,40,60,' + (0.9 * (1 - t / 0.6)).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,40,60,0)');
        ctx.fillStyle = g; ctx.fillRect(w / 2 + ex * w - 20, h * 0.42 - 20, 40, 40);
      }
    }
    ctx.restore();
  }

  function onVisit() {
    hs.visitT = 0; hs.nextT = U.rand(6, 10); hs.quietUntil = AI.time + U.rand(3, 6); hs.inRow = 0; hs.last = null;
    hs.count = {}; hs.cool = {}; hs.rooms.clear(); hs.actors.length = 0; hs.duskull = null; hs.dust.length = 0; hs.smoke.length = 0; hs.texts.length = 0;
    hs.still = 0; hs.stillUntil = 0; hs.drain = 0; hs.jump = 0; hs.stretch = 0; hs.shadows = 0;
    if (hs.mirror.phase !== 'idle') hs.mirror.phase = 'idle';
    try { if (AI.R.Sprites.preload) AI.R.Sprites.preload([92, 93, 94, 200, 355, 477, 429, 679, 680, 681, 607, 609, AI.R.Game.player.dex]); } catch (e) { /* ignore */ }
  }
  AI.Bus.on('mansion', (ev) => {
    if (ev.what === 'enter') onVisit();
    if (ev.what === 'exit') { endStillness(); hs.actors.length = 0; hs.duskull = null; if (M()) M().st.dim = 1; }
  });
  function reset() {
    hs.done.clear(); hs.seen = 0; hs.mirror = { phase: 'idle', t: 0, done: false, armed: false, flip: 0, vast: 0 };
    onVisit();
  }

  AI.define('Haunt', {
    hs, EVENTS, tick, reset, drawables, drawGround, drawAir, drawMirror, drawPost, drawScreen, lights, happened,
    mirrorGlimpse, stillness, endStillness,
    stretch(dur) { hs.stretchStart = AI.time; hs.stretch = AI.time + (dur || 2.6); if (AI.Ambience) AI.Ambience.mansion('drone', 0, 0, 0.5); },
    shadows(dur) { hs.shadows = AI.time + (dur || 3); },
    flipMirror(dur) { hs.mirror.flip = AI.time + (dur || 2); },
    run(k) { const e = EVENTS[k]; if (e && e.run()) { note(k); return true; } return false; },
  });
})();
