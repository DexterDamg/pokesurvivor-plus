/* PokéSurvivor+ — Living World AI · Forest Mysteries
 * The Shady Forest's legendary and mythical Pokémon are not spawns and not boss events. Each one
 * has a place (reserved by the forest's plan, 34-forest.js), a rumour, clues you can find there,
 * and conditions under which it might be glimpsed: a distant sighting that ends the moment you
 * press too close. Only Darkrai can be fought, and only after you've learned enough about it and
 * come back to its hollow on a dark night.
 *
 *   Darkrai    — the Hollow of Unending Night: the world darkens as you near it; it rises out of
 *                the shadows and dissolves if you rush it; with its clues found, it waits for you
 *   Celebi     — the Evergold Sanctuary: a golden clearing with a mossy shrine; no hostile
 *                Pokémon enter it; in the quiet of the day, something small circles the shrine
 *   Raikou     — the Thunder Ridge: night storms only; seen on the ridge in a lightning flash,
 *                gone by the next strike
 *   Suicune    — the Clear Pool: morning fog on still water; it walks away across the surface
 *   Entei      — the Scorched Clearing: burnt grass, warm stones, embers; a roar, a rare glimpse
 *   Spectrier  — the Forgotten Path: a narrow dark trail; at its end a horse turns its head,
 *                looks at you, and gallops off without a sound, leaving a violet trail
 *   Shaymin    — the Gratitude Meadow · Cresselia — the Moonlit Refuge · Virizion — the Emerald
 *                Glade · Zarude — the Vine Hollow (only ever heard and half-seen in the canopy)
 *
 * Everything you learn goes into the Forest Mysteries journal (J), which is kept between runs.
 * It never spoils: unknown entries stay hidden, names are only revealed once confirmed.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const KEY = 'psx.mysteries.v1';

  // ---------------------------------------------------------------- the mysteries
  const MY = {
    darkrai: {
      dex: 491, name: 'Darkrai', title: 'The Hollow of Unending Night',
      rumor: 'Travellers tell of a hollow deep in the woods where night never quite lifts. Those who sleep near it all wake from the same dream.',
      clues: [
        ['x_runestone', 'A black stone, cold as deep water. Someone, or something, has scratched a crescent of eyes into it.'],
        ['deadsapling_b', 'This sapling withered overnight. The grass around it has gone grey.'],
        ['ghostshroom_s', 'A ring of pale mushrooms. Pokémon found sleeping inside it at dawn will not wake.'],
      ],
      sight: 'A shadow rose out of the dark and looked at you. When you came closer, there was nothing there.',
      conf: 'Darkrai waits in the hollow on dark nights. It no longer vanishes when you approach.',
      won: 'You stood your ground against Darkrai, and the night lifted from the hollow.',
    },
    celebi: {
      dex: 251, name: 'Celebi', title: 'The Evergold Sanctuary',
      rumor: 'Somewhere a clearing glows gold even at dusk. The old folk say the shrine there was never built by anyone.',
      clues: [
        ['x_shrine', 'The shrine is thick with moss, but the offering bowl holds fresh berries. Time feels slow here.'],
        ['sapling_02', 'A sapling no taller than your knee, with bark as gnarled as an ancient oak.'],
      ],
      sight: 'Something small and green circled the shrine, chimed once, and was gone in a flash of light.',
      conf: 'Celebi visits the shrine in the quiet hours of the day, when no one is fighting nearby.',
    },
    raikou: {
      dex: 243, name: 'Raikou', title: 'The Thunder Ridge',
      rumor: 'When storms roll over the forest at night, some say a beast stands on the ridge between the lightning strikes.',
      clues: [
        ['stump_dark', 'A tree split clean by lightning. Its scorch marks look like claw marks.'],
        ['w_moss_stone_a', 'Paw prints pressed into the stone, still prickling with static.'],
      ],
      sight: 'In the flash of lightning a great beast stood on the ridge. By the next strike it was gone.',
      conf: 'Raikou watches the storm from the ridge, and runs with the thunder.',
    },
    suicune: {
      dex: 245, name: 'Suicune', title: 'The Clear Pool',
      rumor: 'In the morning fog the water of a quiet pond turns clear as glass, as if something purified it in the night.',
      clues: [
        ['lily_flower', 'The water here is perfectly clear, though the pond is fed by mud.'],
        ['w_moss_stone_b', 'Frost-like crystals on a stone by the water, though it isn\'t cold.'],
      ],
      sight: 'Something stood on the water in the mist. It turned and walked away across the surface, into the fog.',
      conf: 'Suicune comes to the clear pool when the fog lies on the water.',
    },
    entei: {
      dex: 244, name: 'Entei', title: 'The Scorched Clearing',
      rumor: 'Woodcutters found grass burnt in perfect paw prints, and stones still warm long after sundown.',
      clues: [
        ['x_scorch', 'Grass burnt black in the shape of a great paw.'],
        ['w_moss_stone_a', 'These stones are warm to the touch. Something large rested here.'],
        ['stump_small', 'Embers drift up from the soil around this stump, though nothing is burning.'],
      ],
      sight: 'A roar shook the trees. Across the clearing a great beast watched you, then was gone in a gust of heat.',
      conf: 'Entei rests in the scorched clearing. It does not stay to be seen.',
    },
    spectrier: {
      dex: 897, name: 'Spectrier', title: 'The Forgotten Path',
      rumor: 'There is a path that only some can find, narrow and dark, where hoofbeats make no sound.',
      clues: [
        ['x_marker', 'An old marker, its words scratched away. The path behind it is barely there.'],
        ['w_litter_b', 'Hoofprints in the leaves that end mid-stride.'],
      ],
      sight: 'A dark horse stood at the end of the path. It turned its head, looked at you, and galloped away without a sound.',
      conf: 'Spectrier keeps to the forgotten path at night.',
    },
    shaymin: {
      dex: 492, name: 'Shaymin', title: 'The Gratitude Meadow',
      rumor: 'Children say there is a meadow of pink flowers that moves when no wind blows.',
      clues: [
        ['flower_c0', 'Pink flowers that are said to bloom only where someone is grateful.'],
        ['tuftlow_1', 'A tiny hollow pressed into the flowers, still warm.'],
      ],
      sight: 'A little hedgehog of flowers peeked out of the meadow, then burrowed away.',
      conf: 'Shaymin hides in the flower meadow on sunny days.',
    },
    cresselia: {
      dex: 488, name: 'Cresselia', title: 'The Moonlit Refuge',
      rumor: 'Those troubled by bad dreams sometimes find a pool where the moon seems brighter, and sleep soundly after.',
      clues: [
        ['w_bluebells', 'Bluebells that turn toward the moon instead of the sun.'],
        ['lily', 'Feather-like shimmers of light on the pool, each shaped like a crescent.'],
      ],
      sight: 'On a clear night something glided over the pool trailing moonlight, then rose into the sky.',
      conf: 'Cresselia visits the refuge on clear, moonlit nights.',
    },
    virizion: {
      dex: 640, name: 'Virizion', title: 'The Emerald Glade',
      rumor: 'Hunters speak of a glade where the grass is cut clean, as if by a sword. No one hunts there.',
      clues: [
        ['w_fern_c', 'Leaves sliced clean through, as if by a blade.'],
        ['tuft_1', 'Hoofprints, light and quick, circling the glade.'],
      ],
      sight: 'A slender green figure stood in the glade. It looked at you, then leapt away through the trees.',
      conf: 'Virizion guards the emerald glade.',
    },
    zarude: {
      dex: null, name: null, title: 'The Vine Hollow',
      rumor: 'Deep in the forest vines have been knotted into ropes, and berries go missing from every bush.',
      clues: [
        ['berrycone_00', 'A pile of berries stacked with care. Something keeps a pantry here.'],
        ['x_vines', 'Vines knotted like ropes, high in the branches.'],
        ['w_branch', 'Branches snapped high up, in a line through the canopy.'],
      ],
      sight: 'Something swung through the canopy overhead, crashing through the vines, and was gone.',
      conf: null, // never seen clearly
    },
  };
  const ORDER = ['celebi', 'darkrai', 'suicune', 'raikou', 'entei', 'spectrier', 'shaymin', 'cresselia', 'virizion', 'zarude'];

  // ---------------------------------------------------------------- the journal (kept between runs)
  let J = load();
  function load() {
    try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1 && o.m) return o; } catch (e) { /* ignore */ }
    return { v: 1, m: {} };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(J)); } catch (e) { /* ignore */ } }
  function entry(id) { return J.m[id] || (J.m[id] = { r: 0, c: [], s: 0, conf: 0, won: 0, where: '' }); }
  function cluesFound(id) { const e = J.m[id]; return e ? e.c.filter(Boolean).length : 0; }
  function allClues(id) { return cluesFound(id) >= MY[id].clues.length; }
  function confirmed(id) { const e = J.m[id]; return !!(e && e.conf); }
  function toast(text) { try { (AI.say || AI.R.Spawner.say)(text, 3.4, 2); } catch (e) { /* ignore */ } }
  function note(id, what, i) {
    const e = entry(id);
    const m = MY[id];
    let news = null;
    if (!e.r) { e.r = 1; news = 'rumour'; }
    if (what === 'clue' && !e.c[i]) { e.c[i] = 1; news = 'clue'; }
    if (what === 'sight') { e.s++; if (e.s === 1) news = 'sight'; }
    if (what === 'won' && !e.won) { e.won = 1; news = 'won'; }
    if (m.conf && !e.conf && e.s > 0 && allClues(id)) { e.conf = 1; news = 'conf'; }
    const st = run.sites[id];
    if (st) e.where = whereText(st);
    save();
    if (news) {
      const label = e.conf ? m.name : m.title;
      toast('📖 Forest Mysteries · ' + label + (news === 'clue' ? ' — clue found' : news === 'sight' ? ' — sighting' : news === 'conf' ? ' — confirmed' : news === 'won' ? ' — the night lifts' : ' — a rumour') + '  (J)');
    }
  }
  function whereText(st) {
    const d = Math.hypot(st.x, st.y);
    const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
    const dir = dirs[((Math.round(Math.atan2(st.y, st.x) / (Math.PI / 4)) % 8) + 8) % 8];
    return (d > 3200 ? 'deep in the forest' : d > 2000 ? 'far into the woods' : 'in the woods') + ', to the ' + dir + ' of where you start';
  }

  // ---------------------------------------------------------------- this run
  const run = { seed: null, sites: {}, dressed: false, apps: [], cool: {}, battle: null, dark: 0, flashPrev: 0, raikouUp: null, near: null, seenT: {} };
  function on() { return AI.enabled && AI.cfg.mysteries !== false && AI.Forest && AI.Forest.on() && !(AI.Mansion && AI.Mansion.inside); }

  // dress each site with its landmarks and clues (once per run, as decor the world remembers)
  function dress() {
    const P = AI.Forest.plan();
    run.seed = P.seed;
    run.sites = P.sites;
    const D = AI.Decor;
    const add = (o) => D.addFixed(Object.assign({ myst: true }, o));
    const h = (id, i) => U.hash(P.seed, id.length * 31 + i, 9100);
    for (const id of ORDER) {
      const st = P.sites[id];
      if (!st) continue;
      const m = MY[id];
      const ring = (k, n, r0, r1, fn) => { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + h(id, k + i) * 0.6, r = r0 + h(id, k + 50 + i) * (r1 - r0); fn(st.x + Math.cos(a) * r, st.y + Math.sin(a) * r * 0.8, i); } };
      // landmarks
      if (id === 'celebi') {
        add({ k: 'stone', n: 'x_shrine', x: st.x, y: st.y, r: 20, s: 1, landmark: true });
        ring(1, 22, st.r * 0.35, st.r * 0.75, (x, y, i) => add({ k: 'flower', n: ['w_anemones', 'flower_a1', 'flower_c0', 'w_anemones', 'flower_b4'][i % 5], x, y, flat: true, s: 0.85 }));
        ring(40, 6, st.r * 0.9, st.r * 1.05, (x, y) => add({ k: 'stone', n: 'w_moss_stone_b', x, y, r: 8, s: 0.9 }));
      } else if (id === 'darkrai') {
        ring(1, 7, st.r * 0.5, st.r * 0.95, (x, y, i) => add({ k: 'plant', n: i % 2 ? 'deadsapling_a' : 'deadsapling_b', x, y, r: 8 }));
        ring(20, 8, st.r * 0.2, st.r * 0.6, (x, y) => add({ k: 'litter', n: 'w_litter_b', x, y, flat: true }));
      } else if (id === 'raikou') {
        add({ k: 'ridge', n: 'x_ridge', x: st.x, y: st.y + 40, r: 0, s: 1, landmark: true });
      } else if (id === 'entei') {
        ring(1, 6, st.r * 0.15, st.r * 0.7, (x, y) => add({ k: 'litter', n: 'x_scorch', x, y, flat: true }));
        ring(20, 4, st.r * 0.3, st.r * 0.8, (x, y) => add({ k: 'stone', n: 'w_moss_stone_a', x, y, r: 8, s: 1, light: { r: 40, c: [255, 140, 60], kind: 'glow' }, lit: true }));
      } else if (id === 'shaymin') {
        ring(1, 34, 20, st.r * 0.85, (x, y, i) => add({ k: 'flower', n: ['flower_c0', 'flower_c0', 'w_anemones', 'flower_a1'][i % 4], x, y, flat: true, s: 0.85 }));
      } else if (id === 'cresselia') {
        ring(1, 14, st.r * 0.5, st.r * 0.85, (x, y, i) => add({ k: 'flower', n: i % 3 ? 'w_bluebells' : 'w_anemones', x, y, flat: true, s: 0.85 }));
      } else if (id === 'virizion') {
        ring(1, 12, st.r * 0.6, st.r * 0.95, (x, y, i) => add({ k: 'plant', n: i % 2 ? 'w_fern_a' : 'w_fern_c', x, y, r: 8, s: 1.1 }));
      } else if (id === 'zarude') {
        ring(1, 7, st.r * 0.4, st.r * 0.95, (x, y) => add({ k: 'plant', n: 'x_vines', x, y, r: 0, s: 0.8 }));
        ring(20, 6, st.r * 0.2, st.r * 0.8, (x, y) => add({ k: 'litter', n: 'w_ivy', x, y, flat: true }));
      } else if (id === 'spectrier' && st.path) {
        const q = st.path[0];
        add({ k: 'stone', n: 'x_marker', x: q[0] + 16, y: q[1], r: 6, s: 1, landmark: true });
      }
      // clues: findable things around the site
      m.clues.forEach(([n], i) => {
        let x, y;
        if (id === 'celebi' && i === 0) { x = st.x; y = st.y + 2; }
        else if (id === 'spectrier' && st.path) { const q = st.path[i === 0 ? 0 : 6]; x = q[0] + (i === 0 ? 16 : 0); y = q[1]; }
        else if (id === 'suicune' && st.pond) { const a = h(id, 200 + i) * 6.283; x = st.pond.x + Math.cos(a) * (st.pond.R + 30); y = st.pond.y + Math.sin(a) * (st.pond.R + 30); }
        else { const a = (i / m.clues.length) * 6.283 + h(id, 300 + i), r = st.r * (0.45 + h(id, 400 + i) * 0.4); x = st.x + Math.cos(a) * r; y = st.y + Math.sin(a) * r * 0.8; }
        const it = { k: n.startsWith('x_scorch') || n.startsWith('w_litter') || n.startsWith('tuftlow') || n === 'tuft_1' ? 'litter' : n.startsWith('flower') || n.startsWith('w_blue') || n.startsWith('lily') ? 'flower' : n.startsWith('w_moss') || n.startsWith('x_') ? 'stone' : n.startsWith('stump') ? 'stump' : n.startsWith('berry') ? 'bush' : n === 'ghostshroom_s' ? 'mush' : 'plant',
          n, x, y, s: 1, clue: { id, i }, myst: true };
        if (it.k === 'litter' || it.k === 'flower') it.flat = true;
        if (it.k === 'stone' || it.k === 'stump') it.r = n === 'x_shrine' ? 20 : 8;
        if (n === 'ghostshroom_s') it.light = { r: 40, c: [170, 140, 255], kind: 'glow' };
        if (id === 'celebi' && i === 0) { it.k = 'clue'; it.flat = true; it.n = null; it.r = 0; } // the shrine itself is the clue
        add(it);
      });
    }
    run.dressed = true;
  }

  // ---------------------------------------------------------------- apparitions (no combat, no HP: things seen)
  function anim(dex, scale) { try { const a = new AI.R.Sprites.Animator(dex, scale || 1, false); a.loop('Idle'); return a; } catch (e) { return null; } }
  function spawnApp(id, x, y, o) {
    const m = MY[id];
    const a = m.dex ? anim(m.dex, (o && o.scale) || 1) : null;
    if (m.dex && !a) return null;
    const ap = Object.assign({ id, dex: m.dex, x, y, z: 0, a, alpha: 0, fade: 1.2, state: 'in', t: 0, vis: 0, vx: 0, vy: 0, life: 40, flee: 200, leave: 'fade', sil: false, trail: [] }, o || {});
    run.apps.push(ap);
    return ap;
  }
  function onScreen(x, y, pad) { const c = AI.R.Camera; pad = pad || 0; return x > c.left() - pad && x < c.left() + c.w + pad && y > c.top() - pad && y < c.top() + c.h + pad; }
  function leave(ap, p) {
    if (ap.state === 'out') return;
    ap.state = 'out'; ap.t = 0;
    const a = Math.atan2(ap.y - p.y, ap.x - p.x);
    if (ap.leave === 'run') { ap.vx = Math.cos(a) * ap.speed; ap.vy = Math.sin(a) * ap.speed; if (ap.a) { ap.a.loop('Walk'); ap.a.dir = AI.R.Sprites.dirFromAngle(a); } }
    if (ap.leave === 'rise') ap.vz = 60;
    if (ap.onLeave) ap.onLeave(ap);
  }
  function tickApps(dt, p) {
    for (let i = run.apps.length - 1; i >= 0; i--) {
      const ap = run.apps[i];
      ap.t += dt;
      if (ap.a) ap.a.update(dt);
      const d = Math.hypot(ap.x - p.x, ap.y - p.y);
      // gone while no one was looking
      if (d > 1500) { if (ap.vis > 0.5 && !ap.noSight) note(ap.id, 'sight'); run.apps.splice(i, 1); continue; }
      if (ap.state === 'in') {
        ap.alpha = Math.min(ap.maxAlpha || 1, ap.alpha + dt / ap.fade);
        if (ap.alpha >= (ap.maxAlpha || 1) * 0.98) { ap.state = 'stay'; ap.t = 0; }
      }
      if (ap.state === 'in' || ap.state === 'stay') {
        if (ap.face && ap.a) ap.a.dir = AI.R.Sprites.dirFromAngle(Math.atan2(p.y - ap.y, p.x - ap.x));
        if (onScreen(ap.x, ap.y - 30, -10) && ap.alpha > 0.4) ap.vis += dt;
        if (ap.custom) ap.custom(ap, dt, p, d);
        if (ap.state !== 'out' && (d < ap.flee || (ap.state === 'stay' && ap.t > ap.life))) leave(ap, p);
      } else if (ap.state === 'out') {
        ap.x += ap.vx * dt; ap.y += ap.vy * dt; ap.z += (ap.vz || 0) * dt;
        if (ap.trailCol) { ap.trail.push({ x: ap.x, y: ap.y - 20, t: 0 }); }
        ap.alpha -= dt / (ap.outFade || 0.9);
        if (ap.alpha <= 0) {
          // seen properly? then it counts as a sighting
          if (ap.vis > 0.5 && !ap.noSight) note(ap.id, 'sight');
          run.apps.splice(i, 1);
          continue;
        }
      }
      for (let k = ap.trail.length - 1; k >= 0; k--) { ap.trail[k].t += dt; if (ap.trail[k].t > 1.6) ap.trail.splice(k, 1); }
    }
  }
  const silCv = document.createElement('canvas');
  silCv.width = 320; silCv.height = 320;
  const silG = silCv.getContext('2d');
  function drawApp(ctx, ap) {
    if (ap.trail.length) {
      for (const q of ap.trail) {
        const a = (1 - q.t / 1.6) * 0.5;
        ctx.fillStyle = 'rgba(' + ap.trailCol + ',' + a.toFixed(3) + ')';
        ctx.fillRect(Math.round(q.x - 3), Math.round(q.y - 2 - q.t * 8), 6, 3);
      }
    }
    if (!ap.a || ap.alpha <= 0.01) return;
    const y = ap.y - ap.z;
    if (ap.sil) {
      // a silhouette, black against the storm, with only the eyes catching the light
      silG.setTransform(1, 0, 0, 1, 0, 0);
      silG.clearRect(0, 0, 320, 320);
      silG.globalCompositeOperation = 'source-over';
      ap.a.draw(silG, 160, 260, { alpha: 1 });
      silG.globalCompositeOperation = 'source-in';
      const lit = ap.lit || 0;
      silG.fillStyle = 'rgba(' + Math.round(10 + lit * 60) + ',' + Math.round(10 + lit * 60) + ',' + Math.round(18 + lit * 70) + ',1)';
      silG.fillRect(0, 0, 320, 320);
      silG.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalAlpha = ap.alpha;
      ctx.drawImage(silCv, Math.round(ap.x - 160), Math.round(y - 260));
      ctx.restore();
      return;
    }
    ctx.save();
    if (ap.glow) {
      const g = ctx.createRadialGradient(ap.x, y - 24, 0, ap.x, y - 24, 46);
      g.addColorStop(0, 'rgba(' + ap.glow + ',' + (0.35 * ap.alpha).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + ap.glow + ',0)');
      ctx.fillStyle = g; ctx.fillRect(ap.x - 46, y - 70, 92, 92);
    }
    try { ap.a.draw(ctx, ap.x, y, { alpha: ap.alpha }); } catch (e) { /* ignore */ }
    ctx.restore();
  }
  // y-sorted with the world (added to the visible props, drawn through World.drawProp)
  function addProps(list) {
    if (!on()) return;
    for (const ap of run.apps) {
      const pr = ap._prop || (ap._prop = { psxDraw: (ctx) => drawApp(ctx, ap), type: 'psx', item: { k: 'apparition', r: 0, x: 0, y: 0 }, x: 0, y: 0, tx: 0, ty: 0, r: 0, flat: false });
      pr.x = ap.x; pr.y = ap.y + (ap.sortBias || 0);
      list.push(pr);
    }
  }

  // ---------------------------------------------------------------- per mystery
  const Sky = () => AI.Sky;
  const cool = (id, s) => { run.cool[id] = AI.time + s; };
  const ready = (id) => !(run.cool[id] > AI.time) && !run.apps.some((a) => a.id === id);
  function fightingNear(p, r) {
    for (const e of AI.R.EnemyMgr.queryCircle(p.x, p.y, r)) if (!e.dead && e.psx && e.psx.stance === 'hostile') return true;
    return false;
  }
  const BEH = {
    celebi(st, p, d, dt) {
      if (d > st.r * 1.1 || !ready('celebi')) return;
      const h = Sky().hour();
      if (h < 7 || h > 18.5 || Sky().rain > 0.4 || fightingNear(p, 500)) return;
      run.seenT.celebi = (run.seenT.celebi || 0) + dt;
      if (run.seenT.celebi < 4) return; // you have to stay a while, quietly
      run.seenT.celebi = 0;
      cool('celebi', 120);
      let ang = 0;
      spawnApp('celebi', st.x + 50, st.y - 10, { z: 34, flee: 70, life: 9, leave: 'fade', outFade: 0.25, glow: '170,255,150', fade: 1.6,
        custom(ap, dt) { ang += dt * 1.4; ap.x = st.x + Math.cos(ang) * 50; ap.y = st.y + 4 + Math.sin(ang) * 22; ap.z = 34 + Math.sin(ang * 2.3) * 5; if (ap.a) ap.a.dir = AI.R.Sprites.dirFromAngle(ang + Math.PI / 2); },
        onLeave(ap) { if (AI.Ambience) AI.Ambience.myst('chime', ap.x, ap.y); try { AI.R.FX.burst(ap.x, ap.y - ap.z - 20, '#b8ff9a', 18, 140); } catch (e) { /* ignore */ } } });
      if (AI.Ambience) AI.Ambience.myst('chime', st.x, st.y);
    },
    darkrai(st, p, d, dt) {
      const night = Sky().darkness() > 0.6;
      const e = entry('darkrai');
      const ready2 = allClues('darkrai') && e.s > 0 && !e.won && night;
      // the world darkens as you near the hollow at night
      const tgt = night && d < st.r * 2.6 ? U.clamp(1 - (d - st.r * 0.6) / (st.r * 2), 0, 1) : 0;
      run.dark += (tgt - run.dark) * Math.min(1, dt * 1.5);
      if (!night || d > st.r * 1.9 || !ready('darkrai') || run.battle) return;
      const a0 = Math.atan2(p.y - st.y, p.x - st.x);
      const k0 = U.clamp(d - 210, 0, st.r * 0.6);
      const x = st.x + Math.cos(a0) * k0, y = st.y + Math.sin(a0) * k0;
      if (!onScreen(x, y - 30, -30)) return;
      cool('darkrai', ready2 ? 6 : 50);
      spawnApp('darkrai', x, y, { flee: ready2 ? 0 : 150, life: ready2 ? 999 : 14, leave: 'fade', outFade: 0.8, fade: 3, face: true, maxAlpha: 0.92, sortBias: 0,
        custom(ap, dt, pl, dd) {
          // with what you now know, it lets you come close, and then it fights
          if (ready2 && dd < 150 && !run.battle && ap.alpha > 0.85) { startBattle(ap); ap.noSight = true; ap.state = 'out'; ap.alpha = 0; }
        },
        onLeave(ap) { if (AI.Ambience) AI.Ambience.myst('drone', ap.x, ap.y); } });
      if (AI.Ambience) AI.Ambience.myst('drone', x, y);
    },
    raikou(st, p, d) {
      const S = Sky();
      const night = S.darkness() > 0.55;
      const fl = S.flash;
      const strike = fl > run.flashPrev + 0.18;
      run.flashPrev = fl;
      const ap = run.apps.find((a) => a.id === 'raikou');
      if (ap) { ap.lit = Math.max(0, fl); if (strike && ap.t > 0.6) leave(ap, p); return; }
      if (!strike || !night || S.storm < 0.4 || d < 60 || !onScreen(st.x, st.y - 90, -10) || !ready('raikou')) return;
      cool('raikou', 25);
      spawnApp('raikou', st.x, st.y + 4, { sil: true, z: 34, flee: 0, life: 30, fade: 0.05, leave: 'fade', outFade: 0.08, sortBias: 60, scale: 1 });
    },
    suicune(st, p, d) {
      const S = Sky();
      const h = S.hour();
      const misty = S.fog > 0.35 || (h > 4.5 && h < 8 && S.rain < 0.3);
      if (!misty || d > st.r + 520 || !ready('suicune')) return;
      // out on the water, as far from you as you can still see
      const w = st.pond || AI.Forest.plan().lake;
      const a0 = Math.atan2(w.y - p.y, w.x - p.x);
      let sx = null, sy = null;
      for (let k = 360; k >= 160; k -= 20) { const x = p.x + Math.cos(a0) * k, y = p.y + Math.sin(a0) * k; if (AI.Forest.water(x, y).e > 14 && onScreen(x, y - 30, -30)) { sx = x; sy = y; break; } }
      if (sx == null) return;
      cool('suicune', 140);
      spawnApp('suicune', sx, sy, { flee: 230, life: 30, fade: 2.5, leave: 'run', speed: 70, outFade: 2.6, face: true, maxAlpha: 0.9,
        onLeave() { if (AI.Ambience) AI.Ambience.myst('shimmer', w.x, w.y); } });
    },
    entei(st, p, d) {
      // embers drift up from the scorched ground
      if (d < 900 && Math.random() < 0.08) try { AI.R.FX.burst(st.x + U.rand(-st.r, st.r) * 0.6, st.y + U.rand(-st.r, st.r) * 0.5, '#ff9a4a', 1, 30); } catch (e) { /* ignore */ }
      if (d > st.r * 2.6 || d < 150 || !onScreen(st.x, st.y - 30, -30) || !ready('entei') || Math.random() > 0.006) return;
      cool('entei', 240);
      if (AI.Ambience) AI.Ambience.myst('roar', st.x, st.y);
      try { AI.R.Camera.kick(0.4); } catch (e) { /* ignore */ }
      spawnApp('entei', st.x, st.y, { flee: st.r * 0.9, life: 4.5, fade: 0.6, leave: 'run', speed: 300, outFade: 0.5, face: true, glow: '255,140,60',
        onLeave(ap) { try { AI.R.FX.burst(ap.x, ap.y - 20, '#ff8a3d', 22, 160); } catch (e) { /* ignore */ } } });
    },
    spectrier(st, p, d) {
      if (!st.path || Sky().darkness() < 0.5 || !ready('spectrier')) return;
      const end = st.path[st.path.length - 1];
      if (AI.Forest.pathDist(p.x, p.y) > 30 || d > 420 || d < 150 || !onScreen(end[0], end[1] - 30, -30)) return; // only on the path itself
      cool('spectrier', 180);
      spawnApp('spectrier', end[0], end[1], { flee: 120, life: 2.6, fade: 1.4, face: true, maxAlpha: 0.95, leave: 'run', speed: 340, outFade: 1.4, trailCol: '170,110,255',
        custom(ap) { if (ap.state === 'stay' && ap.t > 2.2 && ap.a) ap.a.play && ap.a.play('Idle'); } });
    },
    shaymin(st, p, d) {
      const S = Sky();
      if (S.darkness() > 0.3 || S.rain > 0.2 || d > st.r * 1.2 || d < 90 || !ready('shaymin')) return;
      cool('shaymin', 90);
      const a = Math.random() * 6.283;
      spawnApp('shaymin', st.x + Math.cos(a) * st.r * 0.4, st.y + Math.sin(a) * st.r * 0.3, { flee: 110, life: 7, fade: 0.8, leave: 'fade', outFade: 0.4, face: true,
        onLeave(ap) { if (AI.Ambience) AI.Ambience.myst('leaves', ap.x, ap.y); } });
    },
    cresselia(st, p, d) {
      const S = Sky();
      if (S.darkness() < 0.6 || S.cloud > 0.5 || S.rain > 0.1 || S.moonLight() < 0.35 || d > st.r * 2 || d < 170 || !onScreen(st.x, st.y - 40, -30) || !ready('cresselia')) return;
      cool('cresselia', 160);
      let t0 = 0;
      spawnApp('cresselia', st.x - 60, st.y + 30, { z: 40, flee: 160, life: 14, fade: 2.5, leave: 'rise', outFade: 2.5, glow: '200,180,255', maxAlpha: 0.95,
        custom(ap, dt) { t0 += dt; ap.x = st.x + Math.sin(t0 * 0.4) * 70; ap.z = 40 + Math.sin(t0 * 1.2) * 6; },
        onLeave(ap) { if (AI.Ambience) AI.Ambience.myst('shimmer', ap.x, ap.y); } });
    },
    virizion(st, p, d) {
      const S = Sky();
      const h = S.hour();
      if (h < 5 || h > 17 || d > st.r * 1.8 || d < 210 || !onScreen(st.x, st.y - 30, -30) || !ready('virizion')) return;
      cool('virizion', 150);
      spawnApp('virizion', st.x, st.y, { flee: 200, life: 10, fade: 1, face: true, leave: 'run', speed: 320, outFade: 0.6 });
    },
    zarude(st, p, d) {
      if (d > st.r * 1.3 || !ready('zarude') || Math.random() > 0.01) return;
      cool('zarude', 100);
      // never seen clearly: the canopy shakes in a line overhead, vines creak, a call
      if (AI.Ambience) { AI.Ambience.myst('leaves', p.x + 120, p.y - 60); AI.Ambience.myst('call', p.x + 200, p.y - 80); }
      try {
        const props = AI.R.World.propsInCircle(p.x, p.y, 320).filter((q) => q.type === 'tree');
        props.sort((a, b) => a.x - b.x);
        props.forEach((q, i) => setTimeout(() => { try { AI.Decor.shakeProp(q, 0.8); } catch (e) { /* ignore */ } }, i * 140));
      } catch (e) { /* ignore */ }
      note('zarude', 'sight');
    },
  };

  // ---------------------------------------------------------------- Darkrai: the only one that fights
  function startBattle(ap) {
    const R = AI.R;
    const d = R.DEX_BY[491];
    let hp = 2200, dmg = 18;
    try { hp = Math.round(Math.max(5 * R.Stats.hpRef(), 1400)); } catch (e) { /* ignore */ }
    try { dmg = Math.round(R.Enemies.bossDmg(R.Game.st.time)); } catch (e) { /* ignore */ }
    const def = { dex: 491, name: d ? d.name : 'Darkrai', hp, spd: 80, dmg, xp: 400, behavior: 'shooter', shotDmg: Math.round(dmg * 0.46), shotCd: 1.6, range: 300 };
    const e = new R.Enemy(def, ap.x, ap.y, { hp: 1, spd: 1, dmg: 1 }, true);
    e.psxMystery = 'darkrai';
    e.psxStory = true; // (allowed past the population rules)
    R.EnemyMgr.add(e);
    run.battle = { e, t: 0 };
    toast('The shadow does not fade this time.');
    try { R.Camera.kick(0.8); R.Audio.sfx('boss'); } catch (err) { /* ignore */ }
  }
  function tickBattle(dt) {
    const b = run.battle;
    if (!b) return;
    b.t += dt;
    if (b.e.dead) {
      note('darkrai', 'won');
      run.battle = null;
      run.dark = 0;
    } else if (b.t > 600 || !AI.R.EnemyMgr.all().includes(b.e)) run.battle = null;
  }

  // ---------------------------------------------------------------- clues, rumours, the sanctuary
  function tickClues(p) {
    if (!AI.Decor) return;
    for (const it of AI.Decor.inRect(p.x - 60, p.y - 60, p.x + 60, p.y + 60, [])) {
      if (!it.clue || it._found) continue;
      if (Math.hypot(it.x - p.x, it.y - p.y) > 44) continue;
      it._found = true;
      const { id, i } = it.clue;
      const fresh = !(J.m[id] && J.m[id].c[i]);
      note(id, 'clue', i);
      if (fresh && AI.Lore && AI.Lore.say) { /* the journal toast is enough */ }
      try { AI.R.FX.dmgText(it.x, it.y - 40, '…', '#d8e0ff', true); } catch (e) { /* ignore */ }
      showClue(MY[id].clues[i][1]);
    }
  }
  let clueText = null;
  function showClue(text) { clueText = { text, t: 0 }; }
  function tickSites(dt, p) {
    for (const id of ORDER) {
      const st = run.sites[id];
      if (!st) continue;
      const d = Math.hypot(st.x - p.x, st.y - p.y);
      if (d < st.r * 1.6 && !(J.m[id] && J.m[id].r)) note(id, 'rumor');
      try { BEH[id](st, p, d, dt); } catch (e) { AI.warn('myst-' + id, e); }
    }
  }
  // no hostile Pokémon in the Evergold Sanctuary: none appear there, and any that wander in turn back
  function sanctuary(x, y) { const st = run.sites.celebi; return !!(st && Math.hypot(x - st.x, y - st.y) < st.r); }
  function spawnOk(e) {
    if (!on() || e.psxStory || e.psxMystery) return true;
    return !sanctuary(e.x, e.y);
  }
  function tickSanctuary() {
    const st = run.sites.celebi;
    if (!st) return;
    for (const e of AI.R.EnemyMgr.queryCircle(st.x, st.y, st.r)) {
      if (e.dead || e.boss || e.psxStory) continue;
      const a = Math.atan2(e.y - st.y, e.x - st.x), d = Math.hypot(e.x - st.x, e.y - st.y);
      if (e.psx && e.psx.stance === 'hostile') { e.x = st.x + Math.cos(a) * Math.max(d, st.r); e.y = st.y + Math.sin(a) * Math.max(d, st.r); }
    }
  }

  // ---------------------------------------------------------------- per frame
  function tick(dt) {
    if (!on()) { if (run.dark > 0) run.dark = Math.max(0, run.dark - dt); return; }
    const P = AI.Forest.plan();
    if (!run.dressed || run.seed !== P.seed) { run.apps.length = 0; run.cool = {}; run.battle = null; dress(); }
    const p = AI.R.Game.player;
    if (!p || p.dead) return;
    tickSites(dt, p);
    tickApps(dt, p);
    tickClues(p);
    tickBattle(dt);
    tickSanctuary();
    if (clueText) { clueText.t += dt; if (clueText.t > 7) clueText = null; }
  }
  function reset() { run.dressed = false; run.apps.length = 0; run.cool = {}; run.battle = null; run.dark = 0; run.seenT = {}; clueText = null; }

  // ---------------------------------------------------------------- screen: darkness, clue text, the journal
  let open = false;
  function drawScreen(ctx, w, h) {
    if (run.dark > 0.01 && on()) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * (0.5 - run.dark * 0.32), w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(4,2,10,' + (run.dark * 0.25).toFixed(3) + ')'); g.addColorStop(1, 'rgba(4,2,10,' + (run.dark * 0.85).toFixed(3) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    if (clueText && !open) {
      const a = Math.min(1, clueText.t * 3, (7 - clueText.t) * 1.5);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = 'italic 15px system-ui, sans-serif';
      const lines = wrap(ctx, clueText.text, Math.min(560, w - 60));
      const bh = 18 + lines.length * 20, bw = Math.min(600, w - 40);
      const bx = (w - bw) / 2, by = h * 0.68;
      ctx.fillStyle = 'rgba(14,16,24,0.82)'; ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(200,190,150,0.6)'; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.fillStyle = '#ece4cc'; ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, w / 2, by + 24 + i * 20));
      ctx.restore();
    }
    if (open) drawJournal(ctx, w, h);
  }
  function wrap(ctx, text, maxW) {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t; }
    if (line) out.push(line);
    return out;
  }
  function status(id) {
    const e = J.m[id];
    if (!e || !e.r) return null;
    if (e.won) return 'Confirmed · faced';
    if (e.conf) return 'Confirmed';
    if (e.s > 0) return 'Sighted';
    if (cluesFound(id)) return 'Clues ' + cluesFound(id) + '/' + MY[id].clues.length;
    return 'Rumour';
  }
  function drawJournal(ctx, w, h) {
    const known = ORDER.filter((id) => J.m[id] && J.m[id].r);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, w, h);
    const bw = Math.min(760, w - 32), bh = Math.min(h - 40, 620), bx = (w - bw) / 2, by = (h - bh) / 2;
    ctx.fillStyle = '#e9dfc3'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#6b5532'; ctx.lineWidth = 3; ctx.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
    ctx.fillStyle = '#3b2d18'; ctx.textAlign = 'left';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('Forest Mysteries — Legendary Sightings Journal', bx + 20, by + 34);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#6b5532';
    const unknown = ORDER.length - known.length;
    ctx.fillText(known.length ? (unknown ? unknown + ' more mysteries remain unknown.' : 'Every mystery of the forest is in this journal.') : 'Nothing written yet. Explore the Shady Forest: listen to rumours, look for signs.', bx + 20, by + 54);
    ctx.textAlign = 'right'; ctx.fillText('J / Esc to close', bx + bw - 20, by + 34); ctx.textAlign = 'left';
    // (scrolls with the mouse wheel or the arrow keys)
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by + 64, bw, bh - 70); ctx.clip();
    let y = by + 82 - scroll;
    const y0 = y;
    const colW = bw - 40;
    for (const id of known) {
      const m = MY[id], e = J.m[id];
      ctx.font = 'bold 15px system-ui, sans-serif'; ctx.fillStyle = '#3b2d18';
      ctx.fillText((e.conf && m.name ? m.name + ' — ' : '') + m.title, bx + 20, y);
      ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillStyle = e.conf ? '#2f6b2a' : e.s ? '#7a5a12' : '#7a6a52';
      ctx.textAlign = 'right'; ctx.fillText(status(id), bx + bw - 20, y); ctx.textAlign = 'left';
      y += 17;
      ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#4a3a22';
      const parts = [m.rumor];
      m.clues.forEach(([, t], i) => { if (e.c[i]) parts.push('• ' + t); });
      if (e.s) parts.push('Seen: ' + m.sight);
      if (e.conf && m.conf) parts.push(m.conf);
      if (e.won && m.won) parts.push(m.won);
      if (e.where) parts.push('Where: ' + e.where + ' (the forest changes with every journey).');
      for (const part of parts) for (const l of wrap(ctx, part, colW)) { ctx.fillText(l, bx + 20, y); y += 15; }
      y += 10;
    }
    ctx.restore();
    maxScroll = Math.max(0, y - y0 - (bh - 90));
    scroll = Math.min(scroll, maxScroll);
    if (maxScroll > 0) { ctx.fillStyle = 'rgba(107,85,50,0.5)'; const sh = (bh - 90) * (bh - 90) / (bh - 90 + maxScroll); ctx.fillRect(bx + bw - 8, by + 70 + (bh - 90 - sh) * (scroll / maxScroll), 4, sh); }
    ctx.restore();
  }
  let scroll = 0, maxScroll = 0;
  let openedAt = 0;
  function toggle(v) { open = v == null ? !open : !!v; scroll = 0; openedAt = performance.now(); }
  // (a tap or click closes it, for touch screens)
  addEventListener('pointerdown', (ev) => { if (open && performance.now() - openedAt > 300) { open = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
  addEventListener('wheel', (ev) => { if (open) { scroll = U.clamp(scroll + ev.deltaY * 0.6, 0, maxScroll); ev.preventDefault(); } }, { passive: false });
  addEventListener('keydown', (ev) => {
    const R = AI.R;
    if (!R || !AI.enabled || ev.repeat) return;
    const el = document.activeElement;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (ev.code === 'KeyJ' && R.Game.state === 'playing') { toggle(); ev.preventDefault(); }
    else if (ev.code === 'Escape' && open) { open = false; ev.stopPropagation(); }
    else if (open && (ev.code === 'ArrowDown' || ev.code === 'ArrowUp')) { scroll = U.clamp(scroll + (ev.code === 'ArrowDown' ? 60 : -60), 0, maxScroll); ev.preventDefault(); }
  }, true);

  // ---------------------------------------------------------------- for the sky's light map
  function lights(out) {
    if (!on()) return;
    for (const ap of run.apps) if (ap.glow && ap.alpha > 0.1) { const c = ap.glow.split(',').map(Number); out.push({ x: ap.x, y: ap.y - ap.z - 20, r: 90, c, i: ap.alpha * 0.8 }); }
    const st = run.sites.celebi;
    if (st) out.push({ x: st.x, y: st.y - 10, r: st.r * 1.1, c: [255, 220, 130], i: 0.45 });
    const cr = run.sites.cresselia;
    if (cr && AI.Sky && AI.Sky.darkness() > 0.5) out.push({ x: cr.x, y: cr.y, r: cr.r, c: [200, 210, 255], i: 0.35 * AI.Sky.moonLight() });
  }

  AI.define('Mysteries', {
    MY, ORDER, tick, reset, drawScreen, addProps, lights, spawnOk, toggle, note, status, entry, sanctuary,
    get journal() { return J; }, get open() { return open; }, run,
    resetJournal() { J = { v: 1, m: {} }; save(); },
    // debugging: summon a mystery's appearance at its site regardless of the hour
    test(id) { const st = run.sites[id]; const p = AI.R.Game.player; if (!st || !p) return null; run.cool[id] = 0; run.seenT[id] = 99; return st; },
  });
})();
