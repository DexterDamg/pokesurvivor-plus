/* PokéSurvivor+ — Living World AI · light, fog & precipitation
 * Screen-space atmosphere, drawn where the game draws its weather:
 *  - a light map: the ambient colour of the hour (dawn pinks, midday white, orange-purple evenings,
 *    cool moonlit nights that depend on the moon phase and the clouds) multiplied over the scene,
 *    with local lights added in: lamp posts, swinging lanterns, glowing mushrooms, candles, lightning,
 *    the Pokémon that really give off light (a flame, a glowing organ, a charged body part), the moves
 *    that light the world while they last, and the lantern you can carry
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

  /* Who gives off light, and from where. Only Pokémon with a real reason to: a flame (Charmander's
   * tail, Cyndaquil's back, Ponyta's mane, Litwick's wick), a bioluminescent organ (Chinchou's lures,
   * Volbeat's tail, Morelull's caps, Lumineon's fins), a charged body part (Ampharos's tail orb, Rotom's
   * plasma) or markings known to glow (Umbreon's rings, at night). Nothing else glows: Regirock's
   * stone body is lit by the world around it like any other stone.
   *   p: where on the body · c: colour · r: reach (px) · i: strength · f: a flame (flickers, rain dims it)
   *   night: only glows after dark · fight: only while battling (Blaziken's wrists) */
  const FIRE = [255, 150, 60], WICK = [180, 140, 255], BIO = [190, 240, 210], ZAP = [255, 240, 150];
  const BODY = {
    4: { p: 'tail', c: FIRE, r: 105, i: 0.95, f: 1 }, 5: { p: 'tail', c: FIRE, r: 125, i: 1, f: 1 }, 6: { p: 'tail', c: FIRE, r: 150, i: 1, f: 1 },
    77: { p: 'mane', c: FIRE, r: 120, i: 0.95, f: 1 }, 78: { p: 'mane', c: FIRE, r: 140, i: 1, f: 1 },
    126: { p: 'body', c: FIRE, r: 120, i: 0.9, f: 1 }, 240: { p: 'body', c: FIRE, r: 80, i: 0.8, f: 1 }, 467: { p: 'hand', c: FIRE, r: 130, i: 0.95, f: 1 },
    146: { p: 'body', c: [255, 170, 80], r: 200, i: 1.1, f: 1 }, 250: { p: 'body', c: [255, 200, 120], r: 180, i: 1, f: 1 },
    155: { p: 'back', c: FIRE, r: 85, i: 0.85, f: 1 }, 156: { p: 'back', c: FIRE, r: 110, i: 0.95, f: 1 }, 157: { p: 'back', c: FIRE, r: 135, i: 1, f: 1 },
    218: { p: 'body', c: [255, 130, 60], r: 90, i: 0.85, f: 1 }, 219: { p: 'body', c: [255, 130, 60], r: 110, i: 0.9, f: 1 },
    257: { p: 'hand', c: FIRE, r: 100, i: 0.9, f: 1, fight: 1 },
    390: { p: 'tail', c: FIRE, r: 85, i: 0.85, f: 1 }, 391: { p: 'tail', c: FIRE, r: 100, i: 0.9, f: 1 }, 392: { p: 'head', c: FIRE, r: 120, i: 0.95, f: 1 },
    485: { p: 'body', c: [255, 140, 60], r: 130, i: 0.9, f: 1 }, 500: { p: 'mane', c: FIRE, r: 110, i: 0.9, f: 1 },
    607: { p: 'head', c: WICK, r: 75, i: 0.85, f: 1 }, 608: { p: 'body', c: WICK, r: 110, i: 0.95, f: 1 }, 609: { p: 'body', c: WICK, r: 150, i: 1, f: 1 },
    637: { p: 'body', c: [255, 190, 110], r: 150, i: 1, f: 1 }, 654: { p: 'hand', c: FIRE, r: 80, i: 0.8, f: 1 }, 655: { p: 'hand', c: FIRE, r: 100, i: 0.9, f: 1 },
    837: { p: 'body', c: [255, 120, 50], r: 60, i: 0.7, f: 1 }, 838: { p: 'body', c: [255, 120, 50], r: 90, i: 0.8, f: 1 }, 839: { p: 'body', c: [255, 120, 50], r: 130, i: 0.9, f: 1 },
    850: { p: 'body', c: FIRE, r: 70, i: 0.75, f: 1 }, 851: { p: 'body', c: FIRE, r: 110, i: 0.9, f: 1 },
    170: { p: 'lure', c: [170, 225, 255], r: 75, i: 0.75 }, 171: { p: 'lure', c: [255, 240, 160], r: 105, i: 0.85 },
    313: { p: 'tail', c: [255, 240, 120], r: 60, i: 0.7 }, 180: { p: 'tail', c: ZAP, r: 85, i: 0.75 }, 181: { p: 'tail', c: ZAP, r: 170, i: 1 },
    197: { p: 'body', c: [255, 225, 120], r: 55, i: 0.55, night: 1 }, 337: { p: 'body', c: [255, 240, 190], r: 80, i: 0.6 }, 338: { p: 'body', c: [255, 200, 120], r: 90, i: 0.65 },
    120: { p: 'body', c: [255, 100, 90], r: 50, i: 0.55 }, 121: { p: 'body', c: [220, 120, 255], r: 60, i: 0.6 },
    456: { p: 'tail', c: [180, 220, 255], r: 45, i: 0.55 }, 457: { p: 'tail', c: [180, 220, 255], r: 70, i: 0.65 },
    479: { p: 'body', c: [190, 225, 255], r: 75, i: 0.7, zap: 1 }, 145: { p: 'body', c: ZAP, r: 130, i: 0.8, zap: 1 },
    755: { p: 'body', c: BIO, r: 55, i: 0.55 }, 756: { p: 'body', c: BIO, r: 80, i: 0.65 }, 686: { p: 'body', c: [255, 240, 170], r: 40, i: 0.45 }, 687: { p: 'body', c: [255, 240, 170], r: 50, i: 0.5 },
    849: { p: 'body', c: [220, 140, 255], r: 70, i: 0.65, zap: 1 }, 442: { p: 'body', c: [150, 255, 180], r: 55, i: 0.55 },
    355: { p: 'eye', c: [255, 80, 60], r: 22, i: 0.5 }, 356: { p: 'eye', c: [255, 80, 60], r: 28, i: 0.55 }, 477: { p: 'eye', c: [255, 80, 60], r: 34, i: 0.6 }, 302: { p: 'eye', c: [180, 230, 255], r: 22, i: 0.45 },
    488: { p: 'body', c: [255, 205, 240], r: 100, i: 0.6 },
  };
  // where that part sits for a body of radius r and height h facing (fx, fy)
  function partAt(part, x, y, r, h, fx, fy) {
    switch (part) {
      case 'tail': return [x - fx * r * 0.95, y - h * 0.42 - fy * r * 0.35];
      case 'head': return [x + fx * r * 0.3, y - h * 0.95];
      case 'back': return [x - fx * r * 0.45, y - h * 0.72];
      case 'mane': return [x + fx * r * 0.2, y - h * 0.8];
      case 'eye': return [x + fx * r * 0.4, y - h * 0.7];
      case 'lure': return [x + fx * r * 0.6, y - h];
      case 'hand': return [x + fx * r * 0.7, y - h * 0.55];
      default: return [x, y - h * 0.5];
    }
  }
  function facing(ent) {
    const d = ent.anim && ent.anim.dir != null ? ent.anim.dir : 0;
    const a = Math.PI / 2 - d * Math.PI / 4;
    return [Math.cos(a), Math.sin(a)];
  }
  function bodyOf(ent) {
    const b = BODY[ent.dex];
    if (!b) return null;
    if (b.night && AI.Sky && AI.Sky.darkness() < 0.5) return null;
    if (b.fight && !(ent.psx ? ent.psx.inCombat : AI.R && ent === AI.R.Game.player && fighting(ent))) return null;
    return b;
  }
  function fighting(p) { return (p.moves || []).some((m) => m.castAt && performance.now() - m.castAt < 3000); }
  function bodyLight(ent, out) {
    const b = bodyOf(ent);
    if (!b) return;
    const [fx, fy] = facing(ent);
    const lift = (ent.psx && ent.psx.vis && ent.psx.vis.perch) || 0;
    const [x, y] = partAt(b.p, ent.x, ent.y - lift, ent.r || 14, ent.bodyH || 30, fx, fy);
    const t = AI.time, id = ent.id || 0;
    let i = b.i, r = b.r;
    if (b.f) {
      // a living flame: it flickers (harder when its owner is nervous), and rain makes it shrink
      const nerves = ent.psx && ent.psx.mind ? ent.psx.mind.emo.fear : 0;
      const fl = 1 + nerves * 2.5;
      i *= (0.86 + Math.sin(t * 13 + id) * 0.08 * fl + Math.sin(t * 31 + id * 3) * 0.05 * fl) * (1 - (AI.Sky ? AI.Sky.rain : 0) * 0.25);
      r *= 0.96 + Math.sin(t * 7 + id) * 0.04;
    } else if (b.zap) i *= Math.random() < 0.08 ? 1.35 : 0.9 + Math.sin(t * 9 + id) * 0.06;
    else i *= 0.88 + Math.sin(t * 1.6 + id) * 0.12; // a slow living glow
    out.push({ x, y, r, c: b.c, i, body: ent, halo: b.f ? 1 : 0.7 });
  }

  // Electric Pokémon crackle when they're worked up: brief sparks from their cheeks, fur or fins
  function sparks(ent, out) {
    const s = ent.psx;
    const t = ent.types || (AI.R.DEX_BY[ent.dex] || {}).types || [];
    if (!t.includes('electric')) return;
    const agitated = s ? s.inCombat || (s.ctx && s.ctx.threatV > 0.45) : fighting(ent);
    if (!agitated || Math.random() > 0.12) return;
    const [fx, fy] = facing(ent);
    const [x, y] = partAt('head', ent.x, ent.y, ent.r || 14, ent.bodyH || 30, fx, fy);
    out.push({ x: x + U.rand(-6, 6), y: y + (ent.bodyH || 30) * 0.3, r: U.rand(30, 46), c: ZAP, i: U.rand(0.5, 0.8) });
  }

  // ---------------------------------------------------------------- moves that light the world
  /* The strength, colour, reach and length of the light depend on the move: Thunder Shock is a quick
   * flash, Flamethrower a stream of moving light for as long as it lasts, Discharge lights a wide
   * circle around the user, Will-o-Wisp's flames give a soft wavering glow. */
  const PINK = [255, 200, 235], WISPC = [150, 150, 255], WHITE = [235, 240, 255], STEEL = [220, 230, 245], AURA = [130, 180, 255];
  const MOVE_LIGHT = {
    'thunder-shock': { c: ZAP, r: 120, i: 1.1, dur: 0.16, at: 'aim', reach: 50 },
    thunderbolt: { c: ZAP, r: 160, i: 1.2, dur: 0.22, at: 'target' },
    thunder: { c: WHITE, r: 280, i: 1.4, dur: 0.3, at: 'target' },
    discharge: { c: ZAP, r: 'radius', i: 0.8, dur: 0.3, at: 'self', fl: 1 },
    'electro-ball': { c: ZAP, r: 110, i: 0.9, dur: 0.18, at: 'self' },
    spark: { c: ZAP, r: 95, i: 0.9, dur: 0.4, at: 'self', follow: 1, fl: 1 },
    'thunder-punch': { c: ZAP, r: 100, i: 1, dur: 0.18, at: 'aim', reach: 40 },
    ember: { c: FIRE, r: 70, i: 0.7, dur: 0.14, at: 'aim', reach: 22 },
    flamethrower: { c: FIRE, r: 130, i: 1, dur: 0.6, at: 'aim', reach: 50, follow: 1, fl: 1 },
    'fire-blast': { c: FIRE, r: 220, i: 1.3, dur: 0.5, at: 'aim', reach: 110 },
    'heat-wave': { c: FIRE, r: 200, i: 1, dur: 0.45, at: 'self', fl: 1 },
    'flame-wheel': { c: FIRE, r: 120, i: 1, dur: 1.2, at: 'self', follow: 1, fl: 1 },
    'will-o-wisp': { c: WISPC, r: 70, i: 0.6, dur: 'dur', at: 'behind', fl: 1 },
    'dazzling-gleam': { c: PINK, r: 'radius', i: 0.9, dur: 0.3, at: 'self' },
    flash: { c: WHITE, r: 340, i: 1.5, dur: 0.6, at: 'self' },
    'flash-cannon': { c: STEEL, r: 110, i: 1, dur: 0.3, at: 'beam' },
    'aura-sphere': { c: AURA, r: 80, i: 0.7, dur: 0.15, at: 'self' },
  };
  const FL = []; // lights that last a moment: {x, y, r, c, i, t, dur, ent, ox, oy, fl}
  function flash(x, y, r, c, i, dur, o) {
    if (FL.length > 40) FL.shift();
    FL.push(Object.assign({ x, y, r, c, i, t: 0, dur }, o || {}));
  }
  function moveProfile(m) {
    const id = m.id || (m.def && m.def.id);
    const pr = MOVE_LIGHT[id];
    if (pr) return pr;
    const ty = m.type || (m.def && m.def.type);
    if (ty === 'fire') return { c: FIRE, r: 90, i: 0.8, dur: 0.25, at: 'aim', reach: 30, fl: 1 };
    if (ty === 'electric') return { c: ZAP, r: 100, i: 0.9, dur: 0.16, at: 'aim', reach: 30 };
    return null;
  }
  // someone used a move: light up what it lights up
  function moveLight(e, m, ang, target) {
    const pr = moveProfile(m);
    if (!pr || !e) return;
    const d = m.def || m;
    const r = pr.r === 'radius' ? (d.radius || m.range || 120) + 30 : pr.r;
    const dur = pr.dur === 'dur' ? (d.dur || 6) : pr.dur;
    const h = (e.bodyH || 30) * 0.5;
    if (ang == null) ang = e.aim != null ? e.aim : 0;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    switch (pr.at) {
      case 'aim': {
        const ox = ca * pr.reach, oy = sa * pr.reach - h;
        flash(e.x + ox, e.y + oy, r, pr.c, pr.i, dur, pr.follow ? { ent: e, ox, oy, fl: pr.fl } : { fl: pr.fl });
        break;
      }
      case 'target': {
        flash(e.x, e.y - h, r * 0.7, pr.c, pr.i, dur);
        const tg = target || nearestFoe(e, 300);
        if (tg) flash(tg.x, tg.y - (tg.bodyH || 30) * 0.5, r, pr.c, pr.i, dur);
        break;
      }
      case 'behind': flash(e.x - ca * 26, e.y - sa * 20 - h, r, pr.c, pr.i, dur, { fl: pr.fl, soft: 1 }); break;
      case 'beam': for (let k = 1; k <= 3; k++) flash(e.x + ca * k * 70, e.y + sa * k * 70 - h, r, pr.c, pr.i * (1.1 - k * 0.2), dur); break;
      default: flash(e.x, e.y - h, r, pr.c, pr.i, dur, pr.follow ? { ent: e, ox: 0, oy: -h, fl: pr.fl } : { fl: pr.fl });
    }
  }
  function nearestFoe(e, r) {
    let best = null, bd = r * r;
    for (const v of AI.R.EnemyMgr.queryCircle(e.x, e.y, r)) { if (v === e || v.dead) continue; const d = U.dist2(e.x, e.y, v.x, v.y); if (d < bd) { bd = d; best = v; } }
    return best;
  }
  // the player's moves: each cast stamps the move with castAt
  function watchMoves(p) {
    for (const m of p.moves || []) {
      if (m.castAt && m.castAt !== m._psxLit) { m._psxLit = m.castAt; moveLight(p, m, p.aim, p.target); }
    }
  }
  function tick(dt) {
    for (let k = FL.length - 1; k >= 0; k--) { FL[k].t += dt; if (FL[k].t >= FL[k].dur) FL.splice(k, 1); }
    const p = AI.R && AI.R.Game.player;
    if (p && !p.dead) watchMoves(p);
    tickLantern(dt);
  }

  // ---------------------------------------------------------------- the lantern you can carry
  /* Real equipment: it hangs at your side, you light it with L, and it burns oil. A run starts with
   * a few minutes' worth; chests and old campsites have more. */
  const lamp = { lit: false, oil: 240, max: 480 };
  function tickLantern(dt) {
    if (lanternOn()) {
      lamp.oil = Math.max(0, lamp.oil - dt);
      if (lamp.oil <= 0) {
        lamp.lit = false;
        const p = AI.R.Game.player;
        try { if (p) AI.R.FX.dmgText(p.x, p.y - (p.bodyH || 40) - 24, 'out of oil', '#9aa6c0', true); } catch (e) { /* ignore */ }
      }
    }
  }
  function toggleLantern() {
    if (!(lamp.oil > 0)) return false;
    lamp.lit = !lamp.lit;
    return lamp.lit;
  }
  function addOil(sec) { lamp.oil = Math.min(lamp.max, lamp.oil + sec); }
  // does this Pokémon bring its own light (a lantern, a flame, a glowing organ)?
  function carriesLight(ent) {
    if (!ent) return false;
    if (AI.R && ent === AI.R.Game.player && lanternOn()) return true;
    return !!bodyOf(ent);
  }

  function on() { return AI.enabled && AI.cfg.atmosphere !== false && AI.Sky; }
  function quality() {
    const q = AI.cfg.lightQuality;
    if (q === 'high') return 2;
    if (q === 'medium') return 3;
    if (q === 'low') return 5;
    return (window.devicePixelRatio || 1) > 1.6 || innerWidth > 1700 ? 4 : 3;
  }
  // the lantern only burns when you light it (or keep it lit, from the settings), and while it has oil
  function lanternOn() {
    const m = AI.cfg.lantern;
    if (m === 'off' || !(lamp.oil > 0)) return false;
    return m === 'on' || lamp.lit;
  }

  // ---------------------------------------------------------------- light sources (world space)
  const L = [];
  function gather(cam) {
    L.length = 0;
    const R = AI.R;
    const Sky = AI.Sky;
    if (AI.Totem && AI.Totem.active()) {
      // a Totem's maze: only what light you bring (and its Totem)
      AI.Totem.lights(L);
      creatures(cam, L);
      return L;
    }
    if (AI.Mansion && AI.Mansion.inside) {
      // inside the mansion: candles, chandeliers, moonlight through the windows
      AI.Mansion.lights(L);
      creatures(cam, L);
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
    if (AI.Forest) AI.Forest.lights(L);
    if (AI.OceanDraw) AI.OceanDraw.lights(L);
    if (AI.Boats) AI.Boats.lights(L);
    if (AI.Sea) { AI.Sea.lights(L); AI.Guardians.lights(L); AI.Birth.lights(L); }
    if (AI.Mysteries) AI.Mysteries.lights(L);
    if (AI.Events) AI.Events.lights(L);
    if (AI.Power) AI.Power.lights(L);
    if (AI.Totem) AI.Totem.lights(L);
    if (AI.Trio) AI.Trio.lights(L);
    // lightning lights up everything around where it strikes
    for (const s of AI.Sky.st.strikes) L.push({ x: s.x, y: s.y - 40, r: 520, c: [220, 230, 255], i: Math.max(0, 1 - s.t / 0.5) * s.power * 1.4 });
    creatures(cam, L);
    return L;
  }
  // the lantern, the Pokémon that glow, moves in progress and the shots in the air
  function creatures(cam, out) {
    const R = AI.R;
    const p = R.Game.player;
    if (p && !p.dead) {
      if (lanternOn()) { const [lx, ly] = lanternPos(p); out.push({ x: lx, y: ly, r: 175, c: [255, 214, 150], i: 0.9 + Math.sin(AI.time * 9) * 0.04, halo: 1 }); }
      bodyLight(p, out);
      sparks(p, out);
    }
    if (R.Coop && R.Coop.active) try { for (const q of R.Coop.puppets()) if (q && !q.dead) bodyLight(q, out); } catch (e) { /* ignore */ }
    if (AI.Companions) try { for (const c of AI.Companions.list()) if (!c.dead) { bodyLight(c, out); sparks(c, out); } } catch (e) { /* ignore */ }
    for (const e of R.EnemyMgr.queryCircle(cam.x, cam.y, Math.max(cam.w, cam.h) * 0.75)) {
      if (e.dead) continue;
      bodyLight(e, out);
      sparks(e, out);
    }
    for (const f of FL) {
      const k = f.t / f.dur;
      let i = f.i * (f.ent ? Math.min(1, (f.dur - f.t) / 0.2) : Math.pow(1 - k, 1.4));
      if (f.fl) i *= 0.82 + Math.random() * 0.3;
      if (f.soft) i *= 0.8 + Math.sin(AI.time * 4 + f.x) * 0.2;
      const x = f.ent ? f.ent.x + f.ox : f.x, y = f.ent ? f.ent.y + f.oy : f.y;
      out.push({ x, y, r: f.r, c: f.c, i });
    }
    try {
      for (const q of R.Projectiles.all()) {
        const m = q.m || q.psxMove;
        const id = m && (m.id || (m.def && m.def.id));
        const mt = q.mtype;
        if (id === 'will-o-wisp') out.push({ x: q.x, y: q.y, r: 42, c: WISPC, i: 0.55 + Math.sin(AI.time * 6 + q.id) * 0.1 });
        else if (id === 'aura-sphere') out.push({ x: q.x, y: q.y, r: 46, c: AURA, i: 0.6 });
        else if (mt === 'fire') out.push({ x: q.x, y: q.y, r: id === 'ember' ? 55 : 64, c: FIRE, i: 0.8 + Math.random() * 0.1 });
        else if (mt === 'electric') out.push({ x: q.x, y: q.y, r: 50, c: ZAP, i: 0.6 + Math.random() * 0.25 });
      }
    } catch (e) { /* ignore */ }
  }
  // the lantern hangs at your side, away from where you're facing
  function lanternPos(p) {
    const [fx] = facing(p);
    const side = fx > 0.2 ? -1 : 1;
    return [p.x + side * ((p.r || 14) + 6), p.y - (p.bodyH || 40) * 0.42];
  }
  function drawLantern(ctx) {
    const p = AI.R.Game.player;
    if (!p || p.dead || !lanternOn() || !AI.Art || !AI.Art.ready) return;
    const [x, y] = lanternPos(p);
    const sw = Math.sin(AI.time * 3.2) * 0.12 + (p.walking ? Math.sin(AI.time * 9) * 0.1 : 0);
    ctx.save();
    ctx.translate(x, y - 7);
    ctx.rotate(sw);
    AI.Art.draw(ctx, 'lantern', 0, 15, { scale: 0.45 });
    ctx.restore();
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
    const shady = AI.Forest && AI.Forest.on() && !(AI.Mansion && AI.Mansion.inside);
    const needMap = amb[0] < 250 || amb[1] < 250 || amb[2] < 250 || shady;
    if (needMap) {
      const q = quality();
      const lw = Math.ceil(w / q), lh = Math.ceil(h / q);
      if (lm.width !== lw || lm.height !== lh) { lm.width = lw; lm.height = lh; }
      lg.globalCompositeOperation = 'source-over';
      lg.fillStyle = 'rgb(' + amb[0] + ',' + amb[1] + ',' + amb[2] + ')';
      lg.fillRect(0, 0, lw, lh);
      const k = 1 / q;
      // the forest canopy shades the ground; clearings stay sunlit
      if (shady) try { AI.Forest.shadeLightMap(lg, sx, sy, k, cam.scale); } catch (e) { AI.warn('canopy', e); }
      lg.globalCompositeOperation = 'lighter';
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
          if (l.body && !l.halo) continue;
          const x = sx(l.x), y = sy(l.y), r = Math.min(46, l.r * (l.body ? 0.2 : 0.28)) * cam.scale;
          if (x < -r || y < -r || x > w + r || y > h + r) continue;
          const a = l.i * dark * (l.body ? 0.3 * l.halo : 0.32);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(' + l.c[0] + ',' + l.c[1] + ',' + l.c[2] + ',' + a.toFixed(3) + ')');
          g.addColorStop(1, 'rgba(' + l.c[0] + ',' + l.c[1] + ',' + l.c[2] + ',0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.restore();
      }
      // tonight's moon, mirrored in the water
      if (shady) try { AI.Forest.drawMoonReflection(ctx, sx, sy, cam.scale); } catch (e) { AI.warn('moon', e); }
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
    const th = AI.Art && AI.Art.theme(AI.Env.biome());
    if (th !== 'forest' && th !== 'jungle') return;
    // at night, under a bright moon and a clear sky, the faintest pale shafts of moonlight
    const moonlit = e < 0.04 && Sky.darkness() > 0.75 && Sky.moonLight() > 0.45 && Sky.cloud < 0.45 && Sky.rain < 0.05;
    if (!moonlit && (e < 0.04 || Sky.cloud > 0.8 || Sky.rain > 0.3)) return;
    const mist = Sky.fog;
    const strength = moonlit
      ? (0.012 + Math.min(0.02, mist * 0.06)) * Sky.moonLight() * (1 - Sky.cloud)
      : (0.035 + (Sky.hour() < 9 || Sky.hour() > 16 ? 0.04 : 0) + Math.min(0.08, mist * 0.25)) * (1 - Sky.cloud) * Math.min(1, e * 3);
    if (strength < (moonlit ? 0.004 : 0.01)) return;
    const tint = moonlit ? '190,205,255' : '255,240,200';
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
      g.addColorStop(0, 'rgba(' + tint + ',' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + tint + ',0)');
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
    try { drawLantern(ctx); } catch (e) { AI.warn('lantern', e); }
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
    let label = time + ' · ' + (w[lg] || w.en);
    // at sea, the tide too (34-ocean.js)
    if (AI.Ocean && AI.Ocean.on()) { const tn = AI.Ocean.tideName(); label += ' · ' + ({ high: ['High tide', 'Marea alta'], low: ['Low tide', 'Marea baja'], rising: ['Tide rising', 'Marea subiendo'], falling: ['Tide falling', 'Marea bajando'] }[tn][lg === 'es' ? 1 : 0]); }
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
    // the lantern's oil, once it's dark enough to matter (or while it burns)
    const lit = lanternOn();
    if (AI.cfg.lantern !== 'off' && (lit || S.darkness() > 0.35)) {
      const sec = Math.ceil(lamp.oil), txt = '🏮 ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + (lit ? '' : '  (L)');
      const w2 = ctx.measureText(txt).width + 18, y2 = y + bh + 4;
      ctx.fillStyle = 'rgba(10,14,28,0.55)';
      ctx.beginPath(); ctx.moveTo(x + 9, y2); ctx.arcTo(x + w2, y2, x + w2, y2 + 18, 9); ctx.arcTo(x + w2, y2 + 18, x, y2 + 18, 9); ctx.arcTo(x, y2 + 18, x, y2, 9); ctx.arcTo(x, y2, x + w2, y2, 9); ctx.fill();
      ctx.fillStyle = lit ? '#ffd27a' : lamp.oil > 0 ? '#9aa6c0' : '#6a7080';
      ctx.fillText(txt, x + 9, y2 + 9.5);
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- hooks
  function wrapWeatherDraw(orig) {
    return function (ctx, w, h) {
      if (!on()) return orig.apply(this, arguments);
      const k = AI.Sky.weatherKind();
      if (k && !HANDLED.has(k) && !(AI.Mansion && AI.Mansion.inside)) { try { orig.apply(this, arguments); } catch (e) { /* ignore */ } }
      try { draw(ctx, w, h); } catch (e) { AI.warn('light', e); }
      if (AI.Haunt) try { AI.Haunt.drawPost(ctx, w, h); } catch (e) { AI.warn('haunt-post', e); }
    };
  }
  // the game's grey fog vignette is replaced by the visibility model above
  function patchVignette(W) {
    const d = Object.getOwnPropertyDescriptor(W, 'vignette');
    if (!d || !d.get || !d.configurable) return;
    Object.defineProperty(W, 'vignette', { configurable: true, enumerable: true, get() { const v = d.get.call(W); return on() && AI.Sky.weatherKind() === 'fog' ? 0 : v; } });
  }

  AI.define('Light', {
    draw, drawAir, drawClock, wrapWeatherDraw, patchVignette, gather, lanternOn, lights: L, tick,
    BODY, MOVE_LIGHT, bodyOf, carriesLight, moveLight, flash, flashes: FL, lamp, toggleLantern, addOil,
    reset() { FL.length = 0; lamp.lit = false; lamp.oil = 240; },
  });
})();
