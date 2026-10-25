/* PokéSurvivor+ — Living World AI · boats (the Tropical Ocean)
 * Three boats are moored at the harbour's pier (red, blue, yellow: assets/ocean/boats.png). Walk
 * into one and you're aboard; steer with the usual controls. A boat has weight: it speeds up and
 * slows down, turns wider when it's going fast, slides a little sideways, floats and bobs, and leaves
 * a wake. The sea pushes back: currents carry it, the wind leans on it, gusts make it skid, rough
 * water slows it and storm waves shove it about, but it always answers the helm.
 * It runs aground on coasts, rocks, reefs and wrecks (it never passes through anything). To step
 * off, sail up to a beach, the shallows or the pier and keep pushing toward them: you step onto
 * the land (never into deep water) and the boat stays where you left it, so it's always there to
 * take you back.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const O = () => AI.Ocean;
  const ART = window.PSXAI_OCEAN_ART || { boats: {} };
  const SC = 0.72; // sprite scale (179×82 → 129×59 px)
  const HL = 54, HW = 18; // hull half-length, half-width (collision)
  const MAX = 235, ACC = 165;
  const FACE = { red: -1, blue: 1, yellow: -1 }; // which way each boat's sprite faces (1 right, -1 left)

  const boats = [];
  let built = false;
  const st = { input: [0, 0], hint: 0, hinted: {}, exitT: 0, cool: 0, wakes: [] };

  function on() { return O() && O().on() && AI.cfg.boats !== false; }
  function player() { return AI.R.Game.player; }

  // ---------------------------------------------------------------- where a boat can be
  function hullPts(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [[x, y], [x + c * HL, y + s * HL * 0.7], [x - c * HL, y - s * HL * 0.7], [x - s * HW, y + c * HW * 0.7], [x + s * HW, y - c * HW * 0.7], [x + c * HL * 0.55 - s * HW, y + (s * HL * 0.55 + c * HW) * 0.7], [x - c * HL * 0.55 + s * HW, y - (s * HL * 0.55 + c * HW) * 0.7]];
  }
  function waterOk(x, y) {
    const sp = O().sample(x, y);
    if (sp.cls < 1 || sp.solid) return false;
    return !(AI.Decor && AI.Decor.blocked(x, y, 4));
  }
  function fits(b, x, y, a) {
    for (const q of hullPts(x, y, a)) if (!waterOk(q[0], q[1])) return false;
    for (const o of boats) if (o !== b && Math.hypot(o.x - x, o.y - y) < HL * 1.5 && Math.abs(o.y - y) < HW * 2.2 + Math.abs(Math.sin(a)) * HL) { fits.other = o; return false; }
    return true;
  }
  // the moorings: beside the harbour's pier
  function build() {
    if (built || !on()) return;
    built = true;
    boats.length = 0;
    const want = [[-130, 106, 'red'], [-60, 200, 'blue'], [-310, 112, 'yellow']];
    for (const [x0, y0, col] of want) {
      let at = null;
      for (let r = 0; r <= 240 && !at; r += 12) for (let k = 0; k < (r ? 12 : 1); k++) {
        const x = x0 + Math.cos(k / 12 * 6.283) * r, y = y0 + Math.sin(k / 12 * 6.283) * r * 0.6;
        if (fits(null, x, y, Math.PI) && Math.hypot(x, y) < 520) { at = [x, y]; break; }
      }
      if (at) boats.push({ id: col, col, x: at[0], y: at[1], ang: Math.PI, vx: 0, vy: 0, rider: null, bob: Math.random() * 6, home: at.slice() });
    }
  }

  // ---------------------------------------------------------------- aboard?
  function boatOf(ent) { return (ent && ent.psxBoat) || null; }
  // something a boat carries (its rider): the world doesn't push it around
  function riding(ent) { return !!(ent && ent.psxBoat && on()); }
  function board(b, p) {
    b.rider = p;
    p.psxBoat = b;
    st.exitT = 0;
    b.moored = false;
    try { AI.R.Audio.sfx('click'); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'boat', what: 'board', x: b.x, y: b.y, loud: 60, boat: b.id });
    if (!st.hinted.steer) { st.hinted.steer = true; st.hint = 5; st.hintText = AI.lang && AI.lang() === 'es' ? 'Navega con WASD · acércate a una playa o a la orilla y sigue empujando para bajar' : 'Steer with WASD · sail into a beach or the shallows and keep pushing to step off'; }
  }
  // the rider stands at the helm, toward the stern
  function helmPos(b) {
    const c = Math.cos(b.ang), s = Math.sin(b.ang);
    return [b.x - c * 24, b.y - s * 24 * 0.7 - 4];
  }
  function leave(b, at) {
    const p = b.rider;
    if (!p) return;
    p.x = at[0]; p.y = at[1];
    p.psxBoat = null;
    if (p._psxOk) { p._psxOk[0] = p.x; p._psxOk[1] = p.y; }
    b.rider = null; b.vx = b.vy = 0; b.moored = true;
    st.cool = 1.2;
    AI.Bus.emit({ type: 'boat', what: 'leave', x: at[0], y: at[1], loud: 60, boat: b.id });
  }
  // a spot on land or in the shallows next to the boat, in the direction you're pushing
  function landing(b, dx, dy) {
    const p = b.rider;
    const loco = O().locoOf(p);
    const a0 = Math.atan2(dy, dx);
    for (const da of [0, 0.35, -0.35, 0.7, -0.7]) for (const d of [44, 62, 82, 104]) {
      const x = b.x + Math.cos(a0 + da) * d, y = b.y + Math.sin(a0 + da) * d;
      const sp = O().sample(x, y);
      // (onto land, or the shallows right at the water's edge: never out into open water)
      if (sp.solid || sp.cls > 1 || (sp.cls === 1 && sp.e > 40) || !O().fits(loco, x, y, p)) continue;
      if (AI.Decor && AI.Decor.blocked(x, y, 10)) continue;
      return [x, y];
    }
    return null;
  }

  // ---------------------------------------------------------------- sailing
  // a turn that would swing the hull into the pier or a rock: shuffle the boat a little so it fits
  function unstick(b, a) {
    for (const r of [6, 12, 20]) for (let k = 0; k < 8; k++) {
      const x = b.x + Math.cos(k / 8 * 6.283) * r, y = b.y + Math.sin(k / 8 * 6.283) * r * 0.7;
      if (fits(b, x, y, a)) { b.x = x; b.y = y; return true; }
    }
    return false;
  }
  function sail(b, dt) {
    const Oc = O();
    const Sky = AI.Sky;
    const [ax, ay] = st.input;
    const want = Math.hypot(ax, ay) > 0.1;
    let sp = Math.hypot(b.vx, b.vy);
    const storm = Sky ? Sky.storm : 0, rain = Sky ? Sky.rain : 0, wind = Sky ? Sky.windNow() : 0.2;
    // the helm: the bow swings round toward where you're steering (quickly when slow, wider when
    // fast), and the boat pushes along its bow, harder the closer it points where you want to go;
    // steering the other way turns it around, it never backs off in reverse
    let da = 0, blocked = false;
    if (want) {
      const target = Math.atan2(ay, ax);
      da = Math.atan2(Math.sin(target - b.ang), Math.cos(target - b.ang));
      const turn = (3.6 - 1.7 * Math.min(1, sp / MAX)) * dt;
      const na = b.ang + U.clamp(da, -turn, turn);
      if (fits(b, b.x, b.y, na)) b.ang = na;
      else if (unstick(b, na)) b.ang = na;
      else blocked = true;
      b.ang = Math.atan2(Math.sin(b.ang), Math.cos(b.ang)); // (kept within ±π)
      da = Math.atan2(Math.sin(target - b.ang), Math.cos(target - b.ang));
      const along = Math.cos(da);
      const thrust = ACC * U.clamp((along + 0.25) / 1.25, 0.1, 1);
      b.vx += Math.cos(b.ang) * thrust * dt; b.vy += Math.sin(b.ang) * thrust * dt;
    }
    // the keel: sideways motion dies fast, forward motion slowly
    const c = Math.cos(b.ang), s = Math.sin(b.ang);
    let fwd = b.vx * c + b.vy * s, lat = -b.vx * s + b.vy * c;
    fwd *= Math.exp(-(want ? (Math.cos(da) < 0.2 ? 1.6 : 0.35) : 0.9) * dt); // (it slows as it swings round)
    lat *= Math.exp(-3.2 * dt);
    // rough water holds you back
    const max = MAX * (1 - 0.3 * storm - 0.12 * rain - 0.1 * Math.max(0, wind - 0.6));
    fwd = U.clamp(fwd, -max * 0.2, max);
    b.vx = fwd * c - lat * s; b.vy = fwd * s + lat * c;
    // getting going from rest, already pointing roughly the right way, or pinned where it can't swing
    // round (against the pier): it eases off the way you steer (never sideways or backward otherwise)
    if (want && sp < 70 && (blocked || Math.cos(da) > 0.5)) { const k = (1 - sp / 70) * 70 * dt; b.vx += ax * k; b.vy += ay * k; }
    // wind leans on the hull, gusts make it skid, storm waves shove it
    const wv = Sky ? Sky.windVec() : [0.1, 0];
    b.vx += wv[0] * (26 + storm * 50) * dt; b.vy += wv[1] * (26 + storm * 50) * dt;
    if (Sky && Sky.gust > 0.7) { b.vx += -s * (Sky.gust - 0.7) * 120 * dt * Math.sign(wv[0] * -s + wv[1] * c || 1); b.vy += c * (Sky.gust - 0.7) * 120 * dt * Math.sign(wv[0] * -s + wv[1] * c || 1); }
    if (storm > 0.2) {
      const w = Math.sin(AI.time * 1.25 + b.bob) * storm * 70;
      const wa = Math.atan2(wv[1], wv[0]) || 0;
      b.vx += Math.cos(wa) * w * dt; b.vy += Math.sin(wa) * w * dt;
    }
    // the current carries it (and the whirlpool turns it)
    const cu = Oc.currentAt(b.x, b.y);
    let nx = b.x + (b.vx + cu[0]) * dt, ny = b.y + (b.vy + cu[1] * 0.7) * dt;
    const wh = Oc.plan().whirl;
    if (Math.hypot(b.x - wh.x, b.y - wh.y) < wh.R * 1.4) { const na = b.ang + dt * 0.6 * (1 - Math.hypot(b.x - wh.x, b.y - wh.y) / (wh.R * 1.4)); if (fits(b, b.x, b.y, na)) b.ang = na; }
    // the coast, rocks, reefs and wrecks stop it (sliding along them if it can)
    let hit = false;
    fits.other = null;
    if (!fits(b, nx, ny, b.ang)) {
      hit = true;
      // (bumping a boat no one is sailing nudges it out of the way)
      const o = fits.other;
      if (o && !o.rider) { const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy) || 1; o.vx += dx / d * Math.max(40, sp) * 0.6; o.vy += dy / d * Math.max(40, sp) * 0.6; }
      if (fits(b, nx, b.y, b.ang)) { ny = b.y; b.vy *= -0.2; }
      else if (fits(b, b.x, ny, b.ang)) { nx = b.x; b.vx *= -0.2; }
      else {
        nx = b.x; ny = b.y;
        if (sp > 90) { try { AI.R.Camera.kick(Math.min(0.6, sp / 400)); AI.R.FX.burst(b.x + c * HL, b.y + s * HL * 0.7, '#f2fdff', 8, 90); } catch (e) { /* ignore */ } }
        b.vx *= -0.25; b.vy *= -0.25;
      }
    }
    if (fits(b, nx, ny, b.ang)) { b.x = nx; b.y = ny; }
    sp = Math.hypot(b.vx, b.vy);
    b.hit = hit;
    // stepping off: keep pushing toward the land you've run up against
    if (want && st.cool <= 0) {
      const at = hit ? landing(b, ax, ay) : null;
      if (at) { st.exitT += dt; if (st.exitT > 0.28) leave(b, at); }
      else st.exitT = Math.max(0, st.exitT - dt * 2);
    } else st.exitT = 0;
    // the wake
    if (sp > 45 && Math.random() < dt * 22) st.wakes.push({ x: b.x - c * HL * 0.9, y: b.y - s * HL * 0.6 + 6, t: 0, a: b.ang, k: Math.min(1, sp / MAX) });
  }
  // a boat no one is sailing drifts back to rest where it was left (never away)
  function rest(b, dt) {
    b.vx *= Math.exp(-2 * dt); b.vy *= Math.exp(-2 * dt);
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    if (fits(b, nx, ny, b.ang)) { b.x = nx; b.y = ny; }
  }

  // ---------------------------------------------------------------- per frame
  function tick(dt) {
    // (a rift, the Judgment: the boat lets go of you; you'll be put back aboard when you're back)
    if (!on()) { if (boats.length && !O().on()) { for (const b of boats) if (b.rider) { b.rider.psxBoat = null; b.rider = null; } } return; }
    build();
    const p = player();
    st.cool = Math.max(0, st.cool - dt);
    st.hint = Math.max(0, st.hint - dt);
    for (let i = st.wakes.length - 1; i >= 0; i--) { st.wakes[i].t += dt; if (st.wakes[i].t > 2.4) st.wakes.splice(i, 1); }
    if (st.wakes.length > 220) st.wakes.splice(0, st.wakes.length - 220);
    for (const b of boats) {
      b.bob += dt;
      if (b.rider && (b.rider.dead || b.rider !== p)) { if (b.rider.dead) { b.rider.psxBoat = null; b.rider = null; } }
      if (!b.rider) rest(b, dt);
    }
    if (!p || p.dead) return;
    const mine = boatOf(p);
    // somehow out on water you can't be in (back from a rift or the Judgment where you'd left a
    // boat, revived at sea…): the nearest boat comes for you
    if (!mine && !O().fitNear(O().locoOf(p), p.x, p.y, 200, p)) { rescue(p); return; }
    if (!mine) {
      // walk into a boat to board it
      // (or step aboard from the pier or the shore: push toward one moored right beside you)
      const ax = st.axis || [0, 0], pushing = Math.hypot(ax[0], ax[1]) > 0.1;
      let near = null;
      if (st.cool <= 0) for (const b of boats) {
        if (b.rider) continue;
        const c = Math.cos(b.ang), s = Math.sin(b.ang);
        const dx = p.x - b.x, dy = (p.y - b.y) / 0.7;
        const u = (dx * c + dy * s) / (HL + 10), v = (-dx * s + dy * c) / (HW + 16);
        if (u * u + v * v < 1) { board(b, p); break; }
        // (pressing against the pier's railing toward a boat moored just beyond it)
        const d = Math.hypot(b.x - p.x, b.y - p.y), al = d > 1 ? (ax[0] * (b.x - p.x) + ax[1] * (b.y - p.y)) / (d * Math.hypot(ax[0], ax[1])) : 1;
        const stuck = Math.hypot(p._vx || 0, p._vy || 0) < 30;
        if (pushing && al > 0.55 && (d < HL + 30 || (stuck && d < 140))) near = b;
        if (!st.hinted.board && Math.hypot(dx, dy) < 160) { st.hinted.board = true; st.hint = 4; st.hintText = AI.lang && AI.lang() === 'es' ? 'Camina hacia una barca para subir' : 'Walk into a boat to climb aboard'; }
      }
      if (near && !p.psxBoat) { st.stepT = (st.stepT || 0) + dt; if (st.stepT > 0.25) { st.stepT = 0; board(near, p); } } else st.stepT = 0;
    }
  }
  function rescue(p) {
    let best = null, bd = Infinity;
    for (const b of boats) { if (b.rider) continue; const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; best = b; } }
    if (!best) return;
    for (let r = 0; r <= 400; r += 20) for (let k = 0; k < (r ? 16 : 1); k++) {
      const x = p.x + Math.cos(k / 16 * 6.283) * r, y = p.y + Math.sin(k / 16 * 6.283) * r;
      if (!fits(best, x, y, best.ang)) continue;
      best.x = x; best.y = y; best.vx = best.vy = 0;
      board(best, p);
      return;
    }
  }
  // after the player has moved (it doesn't, while aboard): sail, and keep the rider at the helm
  function afterPlayer(p, dt) {
    const b = boatOf(p);
    if (!b || !on()) return;
    sail(b, dt);
    if (!p.psxBoat) return; // (stepped off)
    const q = helmPos(b);
    p.x = q[0]; p.y = q[1];
    if (Math.hypot(st.input[0], st.input[1]) > 0.1) p.moveAngle = Math.atan2(st.input[1], st.input[0]);
    p._vx = b.vx; p._vy = b.vy; // (others predict where you're going from this)
    if (p._psxOk) { p._psxOk[0] = p.x; p._psxOk[1] = p.y; }
  }

  // ---------------------------------------------------------------- drawing
  function orient(b) {
    const c = Math.cos(b.ang);
    if (c > 0.12) b.side = 1; else if (c < -0.12) b.side = -1; else if (!b.side) b.side = c >= 0 ? 1 : -1;
    const va = Math.atan2(Math.sin(b.ang) * 0.7, c);
    const rot = b.side > 0 ? va : Math.atan2(Math.sin(va - Math.PI), Math.cos(va - Math.PI));
    const flip = (FACE[b.col] || -1) !== b.side;
    // where the bow ends up on screen (the sprite's bow is at its FACE side, then flipped, then turned)
    const bx = (FACE[b.col] || -1) * (flip ? -1 : 1);
    return { rot, flip, bow: [bx * Math.cos(rot), bx * Math.sin(rot)] };
  }
  function drawBoat(ctx, b) {
    const im = AI.OceanDraw && AI.OceanDraw.IMG.boats;
    const r = ART.boats[b.col];
    const bob = Math.sin(b.bob * 2.1) * 1.6 + (AI.Sky ? Math.sin(b.bob * 1.3) * AI.Sky.storm * 4 : 0);
    const w = r ? r[2] * SC : 129, h = r ? r[3] * SC : 59;
    // the bow points where the boat is heading: the sprite is flipped toward that side and turned
    // to the heading as seen on screen (never upside down); a little hysteresis around straight up
    // and down so it doesn't flicker between sides
    const { rot, flip } = orient(b);
    ctx.save();
    // its shadow on the water
    ctx.fillStyle = 'rgba(0,25,45,0.28)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + 8, w * 0.46, h * 0.22, rot, 0, 6.283); ctx.fill();
    ctx.translate(Math.round(b.x), Math.round(b.y + bob - h * 0.3)); // (turned about the middle of the hull)
    ctx.rotate(U.clamp(rot, -1.45, 1.45) + (AI.Sky ? Math.sin(b.bob * 1.7) * AI.Sky.storm * 0.06 : 0));
    if (flip) ctx.scale(-1, 1);
    if (im && im.ok && r) { ctx.imageSmoothingEnabled = false; ctx.drawImage(im, r[0], r[1], r[2], r[3], Math.round(-w / 2), Math.round(-h * 0.42), Math.round(w), Math.round(h)); }
    else { ctx.fillStyle = b.col === 'blue' ? '#4a8ee0' : b.col === 'yellow' ? '#e0b040' : '#e05a4a'; ctx.fillRect(-w / 2, -h * 0.2, w, h * 0.6); }
    ctx.restore();
    // water breaking along the hull when it moves
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 40) {
      ctx.save(); ctx.globalAlpha = Math.min(0.8, sp / 260); ctx.strokeStyle = '#f2fdff'; ctx.lineWidth = 2;
      const c = Math.cos(b.ang), s = Math.sin(b.ang);
      ctx.beginPath(); ctx.ellipse(b.x + c * HL * 0.85, b.y + s * HL * 0.6 + 8, 10, 4, b.ang, -1.2, 1.2); ctx.stroke();
      ctx.restore();
    }
  }
  // the boats stand in the scene with everyone else (sorted by the game; drawn under their rider)
  const props = [];
  function addProps(list, cam) {
    if (!on()) return;
    props.length = 0;
    for (const b of boats) {
      if (!cam.sees(b.x, b.y, 120)) continue;
      const pr = b._prop || (b._prop = { psxDraw: (ctx) => drawBoat(ctx, b), x: 0, y: 0, flat: false, type: 'boat', r: 0 });
      pr.x = b.x; pr.y = b.y - 34;
      list.push(pr);
    }
    // a boat under any other player seen out on deep water (in co-op: theirs isn't simulated here)
    try {
      for (const q of AI.players) {
        if (!q || q === player() || q.dead || !q.remote) continue;
        const sp = O().sample(q.x, q.y);
        if (sp.cls < 2 || O().locoOf(q) !== 'walk') continue;
        const g = q._psxGhostBoat || (q._psxGhostBoat = { col: 'blue', x: q.x, y: q.y, ang: Math.PI, vx: 0, vy: 0, bob: 0 });
        const vx = q.x - g.x, vy = q.y - g.y;
        if (Math.hypot(vx, vy) > 2) g.ang = Math.atan2(vy, vx);
        g.x = q.x; g.y = q.y + 4; g.bob += 0.016;
        list.push({ psxDraw: (ctx) => drawBoat(ctx, g), x: g.x, y: g.y - 34, flat: false, type: 'boat', r: 0 });
      }
    } catch (e) { /* ignore */ }
  }
  function drawWakes(ctx) {
    if (!on() || !st.wakes.length) return;
    ctx.save();
    ctx.strokeStyle = '#f2fdff';
    for (const w of st.wakes) {
      const a = (1 - w.t / 2.4) * 0.55 * w.k;
      if (a < 0.02) continue;
      const sp = 6 + w.t * 22;
      ctx.globalAlpha = a; ctx.lineWidth = 2;
      const c = Math.cos(w.a + Math.PI / 2), s = Math.sin(w.a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(w.x + c * sp, w.y + s * sp * 0.6); ctx.lineTo(w.x + c * (sp + 6), w.y + s * (sp + 6) * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w.x - c * sp, w.y - s * sp * 0.6); ctx.lineTo(w.x - c * (sp + 6), w.y - s * (sp + 6) * 0.6); ctx.stroke();
    }
    ctx.restore();
  }
  function drawScreen(ctx, w, h) {
    if (!on() || st.hint <= 0 || !st.hintText) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, st.hint);
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(st.hintText).width + 24;
    ctx.fillStyle = 'rgba(8,24,40,0.75)';
    ctx.fillRect(w / 2 - tw / 2, h - 158, tw, 28);
    ctx.fillStyle = '#e8fbff';
    ctx.fillText(st.hintText, w / 2, h - 139);
    ctx.restore();
  }
  function lights(out) {
    if (!on() || !AI.Sky || AI.Sky.darkness() < 0.4) return;
    for (const b of boats) out.push({ x: b.x - Math.cos(b.ang) * 30, y: b.y - 30, r: 60, c: [255, 220, 150], i: 0.5 });
  }

  // ---------------------------------------------------------------- wiring
  function install() {
    const R = AI.R;
    // aboard, the controls steer the boat, not your feet
    const oAxis = R.Input.axis;
    R.Input.axis = function () {
      const a = oAxis.apply(this, arguments);
      st.axis = a;
      const p = player();
      if (!AI.enabled || !p || !p.psxBoat || !on()) return a;
      st.input = [a[0], a[1]];
      return [0, 0];
    };
    const oUp = R.Player.prototype.update;
    R.Player.prototype.update = function (dt) {
      const r = oUp.apply(this, arguments);
      if (AI.enabled && !this.remote && this.psxBoat) try { afterPlayer(this, dt); } catch (e) { AI.warn('boat', e); }
      return r;
    };
  }
  function reset() {
    for (const b of boats) if (b.rider) b.rider.psxBoat = null;
    boats.length = 0; built = false; st.wakes.length = 0; st.exitT = 0; st.cool = 0; st.hint = 0; st.hinted = {};
  }

  AI.define('Boats', { boats, st, orient, FACE, riding, boatOf, board, leave, landing, fits, tick, afterPlayer, addProps, drawWakes, drawScreen, lights, install, reset, build, HL, HW });
})();
