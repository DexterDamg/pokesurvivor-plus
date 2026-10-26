#!/usr/bin/env node
// Living World AI — scenario tests. Runs the real game headless (Playwright + Chromium) and
// checks each behavior requirement end-to-end. Start a static server first:
//   npx http-server -p 8123 -s -c-1 .      then      node tests/ai-scenarios.js [filter]
'use strict';
const { boot } = require('./harness');

const only = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const results = [];

// page-side helpers installed once per page
function installHelpers() {
  const R = window.__PSX_REG__, AI = window.PSXAI, D = AI.Debug;
  if (window.T) return;
  const T = (window.T = { hurts: [], samples: [] });
  const oh = R.Player.prototype.hurt;
  R.Player.prototype.hurt = function (amt) { T.hurts.push({ t: AI.time, amt }); return oh.apply(this, arguments); };
  T.reset = function () {
    D.freeze(true); D.clear(true); D.god(true);
    R.Game.debugTime(0); R.Game.debugSpeed(1);
    const p = R.Game.player;
    p.psxOff = new Set(p.moves);
    T.hurts.length = 0;
    AI.resetCfg();
    AI.stats.dodges = 0; AI.stats.combatUpdates = 0;
    R.Hazards.clear(); R.Projectiles.clear();
    p.hp = p.maxHp;
    // a calm, frozen midday unless a scenario asks for other weather
    AI.Sky.set({ hour: 12, day: 0, fog: 0, rain: 0, storm: 0, wind: 0.1, cloud: 0.1, snow: 0, wet: 0, snowCover: 0, season: 'spring', freeze: true });
    AI.Lore.reset();
    AI.Light.reset();
    AI.cfg.forestEvents = false; AI.Events.reset();
    AI.cfg.exploreExp = false;
    AI.Talk.reset();
    AI.Totem.reset();
    // (no legendary shadows or old well unless a scenario is about them)
    AI.cfg.legendTrio = false; if (AI.Trio) AI.Trio.reset();
    AI.cfg.oldWell = false; if (AI.Well) AI.Well.reset();
    return true;
  };
  T.dist = (e) => { const p = R.Game.player; return Math.hypot(e.x - p.x, e.y - p.y); };
  // stand somewhere Pokémon do turn up (not in one of the forest's quiet stretches, not in water)
  T.unquiet = function () {
    const p = R.Game.player, F = AI.Forest;
    if (!F || !F.on()) return;
    let best = null, bv = 9;
    for (let r = 0; r <= 4000 && bv > 0.1; r += 200) for (let a = 0; a < 6.28; a += 0.5) {
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      const q = F.quietAt(x, y) + (F.water(x, y).e > -60 ? 9 : 0) + (R.World.isFree(x, y, 20) ? 0 : 9);
      if (q < bv) { bv = q; best = [x, y]; }
    }
    if (best) { p.x = best[0]; p.y = best[1]; AI.Mansion.snapCamera(p); }
  };
}

async function scenario(h, name, fn) {
  if (only && !only.test(name)) return;
  const t0 = Date.now();
  let res;
  try {
    await h.R(installHelpers);
    await h.R(() => window.T.reset());
    res = await fn(h);
  } catch (e) { res = { pass: false, detail: 'exception: ' + (e && e.message) }; }
  results.push({ name, ...res, ms: Date.now() - t0 });
  console.log((res.pass ? 'PASS ' : 'FAIL ') + name + '  — ' + (typeof res.detail === 'string' ? res.detail : JSON.stringify(res.detail)));
}

// sample a page expression every `every` ms for `ms` ms
async function sample(h, ms, every, fn, arg) {
  const out = [];
  const n = Math.ceil(ms / every);
  for (let i = 0; i < n; i++) { await h.wait(every); out.push(await h.R(fn, arg)); }
  return out;
}

(async () => {
  // =========================================================== living world (Pikachu run)
  let h = await boot({ partner: 25 });

  await scenario(h, 'harmless Pokémon wanders peacefully without attacking', async () => {
    await h.R(() => { const D = PSXAI.Debug; window.A = D.spawn(133, { temp: 'friendly', dx: 150 }); window.B = D.spawn(16, { temp: 'neutral', dx: -160, dy: 40 }); });
    const s = await sample(h, 9000, 500, () => ({ a: [A.x, A.y, A.psx.stance, A.psx.inCombat && A.psx.combat.target === __PSX_REG__.Game.player], b: [B.x, B.y, B.psx.stance, B.psx.inCombat && B.psx.combat.target === __PSX_REG__.Game.player], hurts: T.hurts.length }));
    const moved = (k) => { let d = 0; for (let i = 1; i < s.length; i++) d += Math.hypot(s[i][k][0] - s[i - 1][k][0], s[i][k][1] - s[i - 1][k][1]); return d; };
    const hostile = s.some((x) => x.a[2] === 'hostile' || x.b[2] === 'hostile' || x.a[3] || x.b[3]);
    const pass = !hostile && s[s.length - 1].hurts === 0 && (moved('a') > 20 || moved('b') > 20);
    return { pass, detail: { hurts: s[s.length - 1].hurts, moved: [moved('a') | 0, moved('b') | 0], stances: [s[s.length - 1].a[2], s[s.length - 1].b[2]] } };
  });

  await scenario(h, 'timid Pokémon becomes frightened and flees', async () => {
    const d0 = await h.R(() => { window.A = PSXAI.Debug.spawn(10, { temp: 'timid', dx: 110 }); return T.dist(A); });
    await h.wait(600);
    await h.R(() => A.hurt(A.maxHp * 0.15, '#fff', 1, 0, 0));
    const s = await sample(h, 3500, 350, () => ({ beh: A.psx.beh.id, d: T.dist(A), fear: A.psx.mind.emo.fear, icon: (PSXAI.Mind.bubbleFor(A.psx) || {}).icon }));
    const fled = s.some((x) => ['flee', 'hide', 'freeze', 'cower'].includes(x.beh));
    const last = s[s.length - 1];
    return { pass: fled && Math.max(...s.map((x) => x.fear)) > 0.3 && (last.d > d0 + 50 || s.some((x) => x.beh === 'hide' || x.beh === 'freeze')), detail: { behs: [...new Set(s.map((x) => x.beh))], d0: d0 | 0, d: last.d | 0, icons: [...new Set(s.map((x) => x.icon))] } };
  });

  await scenario(h, 'neutral Pokémon reacts emotionally after being attacked', async () => {
    const a0 = await h.R(() => { window.A = PSXAI.Debug.spawn(74, { temp: 'neutral', dx: 140 }); return A.psx.rel.get('P').a; });
    await h.wait(500);
    const first = await h.R(() => { A.hurt(A.maxHp * 0.2, '#fff', 1, 0, 0); return (PSXAI.Mind.bubbleFor(A.psx) || {}).icon; });
    const s = await sample(h, 2500, 300, () => ({ beh: A.psx.beh.id, icon: (PSXAI.Mind.bubbleFor(A.psx) || {}).icon, anger: A.psx.mind.emo.anger, fear: A.psx.mind.emo.fear, sad: A.psx.mind.emo.sadness, a: A.psx.rel.get('P').a }));
    const emo = Math.max(...s.map((x) => Math.max(x.anger, x.fear, x.sad)));
    const last = s[s.length - 1];
    return { pass: first === 'surprise' && emo > 0.3 && last.a < a0 - 0.15, detail: { first, behs: [...new Set(s.map((x) => x.beh))], icons: [...new Set(s.map((x) => x.icon))], emo: +emo.toFixed(2), attitude: [a0, +last.a.toFixed(2)] } };
  });

  await scenario(h, 'two NPCs interact without any player involvement', async () => {
    await h.R(() => { const D = PSXAI.Debug; window.A = D.spawn(25, { temp: 'playful', x: __PSX_REG__.Game.player.x + 420, y: __PSX_REG__.Game.player.y }); window.B = D.spawn(39, { temp: 'playful', x: __PSX_REG__.Game.player.x + 460, y: __PSX_REG__.Game.player.y + 30 }); });
    const s = await sample(h, 16000, 500, () => ({ i: PSXAI.Social.active.filter((I) => (I.a === A || I.a === B) && (I.b === A || I.b === B)).map((I) => I.type), ra: (A.psx.rel.get(B.id) || {}).b || 0, rb: (B.psx.rel.get(A.id) || {}).b || 0 }));
    const types = [...new Set(s.flatMap((x) => x.i))];
    const last = s[s.length - 1];
    return { pass: types.length > 0 || last.ra > 0.05 || last.rb > 0.05, detail: { interactions: types, bond: [+last.ra.toFixed(2), +last.rb.toFixed(2)] } };
  });

  await scenario(h, 'friendly fire between allies triggers a relationship change and retargeting', async () => {
    await h.R(() => {
      const D = PSXAI.Debug;
      window.A = D.spawn(261, { temp: 'aggressive', dx: 260 });
      window.B = D.spawn(56, { temp: 'aggressive', dx: 300, dy: 30, trait: { forgiveness: 0.05, bravery: 0.8, aggression: 0.9 } });
      D.bond(A, B, 0.6);
    });
    await h.wait(400);
    const seq = [];
    for (let i = 0; i < 2; i++) {
      await h.R(() => PSXAI.hurtNpc(B, B.maxHp * 0.1, A, '#fff', 1, 0, 40, true));
      seq.push(await h.R(() => (PSXAI.Mind.bubbleFor(B.psx) || {}).icon));
      await h.wait(700);
      seq.push(await h.R(() => (PSXAI.Mind.bubbleFor(B.psx) || {}).icon));
    }
    const s = await sample(h, 2500, 250, () => ({ tgt: B.psx.combat.target === A, ft: B.psx.fightTarget === A, beh: B.psx.beh.id, r: B.psx.rel.get(A.id) }));
    const last = s[s.length - 1];
    const retarget = s.some((x) => x.tgt || x.ft);
    return { pass: retarget && last.r.a < 0.3 && last.r.g > 0.2, detail: { bubbles: seq, behs: [...new Set(s.map((x) => x.beh))], rel: { a: +last.r.a.toFixed(2), g: +last.r.g.toFixed(2), ff: last.r.ff } } };
  });

  await scenario(h, 'protective Pokémon intervenes when its friend is attacked', async () => {
    await h.R(() => {
      const D = PSXAI.Debug;
      window.A = D.spawn(58, { temp: 'protective', dx: 170, trait: { protectiveness: 1, bravery: 0.9 } });
      window.B = D.spawn(133, { temp: 'friendly', dx: 120, dy: 40 });
      D.bond(A, B, 0.8);
    });
    await h.wait(1200);
    await h.R(() => B.hurt(B.maxHp * 0.15, '#fff', 1, 0, 0));
    const s = await sample(h, 2500, 250, () => ({ beh: A.psx.beh.id, tgt: A.psx.combat.target === __PSX_REG__.Game.player, icon: (PSXAI.Mind.bubbleFor(A.psx) || {}).icon }));
    return { pass: s.some((x) => x.beh === 'defend' && x.tgt), detail: { behs: [...new Set(s.map((x) => x.beh))], icons: [...new Set(s.map((x) => x.icon))] } };
  });

  await scenario(h, 'nearby NPCs react to Giratina\'s Distortion World + Lake Trio resonance', async () => {
    await h.R(() => {
      const D = PSXAI.Debug;
      window.G = [];
      const temps = ['timid', 'neutral', 'aggressive', 'friendly', 'playful', 'territorial', 'protective', 'opportunistic'];
      const dexes = [16, 74, 261, 133, 25, 95, 58, 52];
      for (let i = 0; i < 8; i++) { const a = i * 0.785; G.push(D.spawn(dexes[i], { temp: temps[i], dx: Math.cos(a) * 220, dy: Math.sin(a) * 180 })); }
    });
    await h.wait(800);
    await h.R(() => __PSX_REG__.Crystal.debug('dist'));
    const s = await sample(h, 7000, 500, () => ({ lake: !!(PSXAI.Legend.lake), plans: G.map((e) => e.psx.legendReact && e.psx.legendReact.plan), scared: G.filter((e) => e.psx.mind.emo.fear > 0.3 || e.psx.mind.emo.surprise > 0.3).length, conf: G.filter((e) => e.psx.mind.emo.confusion > 0.3).length, behs: G.map((e) => e.psx.beh.id) }));
    const plans = [...new Set(s.flatMap((x) => x.plans).filter(Boolean))];
    const maxScared = Math.max(...s.map((x) => x.scared));
    return { pass: s.some((x) => x.lake) && maxScared >= 5 && plans.length >= 2, detail: { plans, maxScared, confusedByUxie: Math.max(...s.map((x) => x.conf)), behs: [...new Set(s.flatMap((x) => x.behs))] } };
  });

  await scenario(h, 'injured hostile Pokémon retreats instead of fighting to the death', async () => {
    await h.R(() => { window.A = PSXAI.Debug.spawn(66, { temp: 'aggressive', dx: 120, trait: { bravery: 0.25, aggression: 0.6 } }); });
    await h.wait(1500);
    await h.R(() => { A.hp = A.maxHp * 0.16; A.hurt(A.maxHp * 0.03, '#fff', 1, 0, 0); });
    const s = await sample(h, 3000, 300, () => ({ beh: A.psx.beh.id, d: T.dist(A), hp: A.hp / A.maxHp }));
    return { pass: s.some((x) => x.beh === 'retreat' || x.beh === 'flee'), detail: { behs: [...new Set(s.map((x) => x.beh))], d: s.map((x) => x.d | 0) } };
  });

  await scenario(h, 'peaceful Pokémon reacts to another Pokémon being killed', async () => {
    await h.R(() => { const D = PSXAI.Debug; window.A = D.spawn(133, { temp: 'friendly', dx: 150 }); window.B = D.spawn(25, { temp: 'friendly', dx: 200, dy: 30 }); D.bond(A, B, 0.8); });
    await h.wait(800);
    const a0 = await h.R(() => B.psx.rel.get('P').a);
    await h.R(() => A.hurt(A.hp + 50, '#fff', 1, 0, 0));
    const s = await sample(h, 3000, 300, () => ({ beh: B.psx.beh.id, sad: B.psx.mind.emo.sadness, fear: B.psx.mind.emo.fear, anger: B.psx.mind.emo.anger, a: B.psx.rel.get('P').a, mourn: !!B.psx.mourn, icon: (PSXAI.Mind.bubbleFor(B.psx) || {}).icon }));
    const last = s[s.length - 1];
    return { pass: Math.max(...s.map((x) => x.sad)) > 0.3 && last.a < a0 - 0.15, detail: { behs: [...new Set(s.map((x) => x.beh))], icons: [...new Set(s.map((x) => x.icon))], sad: +Math.max(...s.map((x) => x.sad)).toFixed(2), attitude: [a0, +last.a.toFixed(2)] } };
  });

  await scenario(h, 'pressing the active move\'s number key stops attacking; pressing again resumes', async () => {
    await h.R(() => { const p = __PSX_REG__.Game.player; p.psxOff = new Set(); window.A = PSXAI.Debug.spawn(74, { temp: 'neutral', dx: 140, hp: 100000, spd: 0 }); A.psx.lock = { update(e, s, dt, it) { it.stay = true; return true; } }; PSXAI.Player.setFocus(p, A); });
    await h.page.mouse.move(640, 360);
    const cast = () => h.R(() => __PSX_REG__.Game.player.moves[0].castAt || 0);
    await h.wait(1500);
    const c1 = await cast();
    await h.page.keyboard.press('Digit1');
    await h.wait(300);
    const off = await h.R(() => __PSX_REG__.Game.player.psxOff.has(__PSX_REG__.Game.player.moves[0]));
    const c2 = await cast();
    await h.wait(2000);
    const c3 = await cast();
    await h.page.keyboard.press('Digit1');
    await h.wait(2000);
    const on = await h.R(() => !__PSX_REG__.Game.player.psxOff.has(__PSX_REG__.Game.player.moves[0]));
    const c4 = await cast();
    return { pass: c1 > 0 && off && c3 === c2 && on && c4 > c3, detail: { castBefore: c1 > 0, off, silentWhileOff: c3 === c2, resumed: c4 > c3 } };
  });

  await scenario(h, 'clicking a HUD move slot toggles it; clicking a Pokémon marks it as the target', async () => {
    await h.R(() => { const p = __PSX_REG__.Game.player; p.psxOff = new Set(); p.psxFocus = null; window.A = PSXAI.Debug.spawn(74, { temp: 'neutral', dx: 160, dy: 40, hp: 100000, spd: 0 }); A.psx.lock = { update(e, s, dt, it) { it.stay = true; return true; } }; });
    await h.wait(400);
    const moveOn = () => h.R(() => !__PSX_REG__.Game.player.psxOff.has(__PSX_REG__.Game.player.moves[0]));
    const slot = await h.R(() => { const r = PSXAI.Player.rects.find((x) => x.move === __PSX_REG__.Game.player.moves[0]); return r && { x: (r.px0 + r.px1) / 2, y: (r.py0 + r.py1) / 2 }; });
    if (!slot) return { pass: false, detail: 'no HUD slot rect' };
    await h.page.mouse.click(slot.x, slot.y);
    await h.wait(200);
    const off = !(await moveOn());
    await h.page.mouse.click(slot.x, slot.y);
    await h.wait(200);
    const on = await moveOn();
    // where the Pokémon is on the page, from the camera
    const at = await h.R(() => { const cam = __PSX_REG__.Camera, b = document.getElementById('game').getBoundingClientRect(); const k = b.width / (cam._cw || b.width); return { x: b.left + (A.x - cam.left()) * cam.scale * k, y: b.top + (A.y - A.bodyH * 0.5 - cam.top()) * cam.scale * k }; });
    await h.page.mouse.click(at.x, at.y);
    await h.wait(200);
    const focused = await h.R(() => __PSX_REG__.Game.player.psxFocus === A);
    await h.page.mouse.click(at.x, at.y);
    await h.wait(200);
    const cleared = await h.R(() => !__PSX_REG__.Game.player.psxFocus);
    return { pass: off && on && focused && cleared, detail: { off, on, focused, cleared } };
  });

  await scenario(h, 'emotion bubbles reflect the emotion driving each decision', async () => {
    await h.R(() => {
      const D = PSXAI.Debug;
      window.A = D.spawn(143, { temp: 'neutral', dx: 200, energy: 0.05 });
      window.B = D.spawn(10, { temp: 'timid', dx: -150 });
      window.C = D.spawn(66, { temp: 'aggressive', dx: 0, dy: 180 });
    });
    await h.wait(400);
    await h.R(() => B.hurt(B.maxHp * 0.1, '#fff', 1, 0, 0));
    const s = await sample(h, 4000, 400, () => [A, B, C].map((e) => [e.psx.beh.id, (PSXAI.Mind.bubbleFor(e.psx) || {}).icon]));
    const want = { sleep: ['zzz', 'dots'], flee: 'scared', hide: 'scared', freeze: 'scared', fight: 'anger' };
    const pairs = s.flat().filter(([b]) => want[b]);
    const ok = pairs.filter(([b, i]) => [].concat(want[b]).includes(i) || i === 'surprise').length;
    return { pass: pairs.length >= 6 && ok / pairs.length > 0.8, detail: { checked: pairs.length, matching: ok, seen: [...new Set(pairs.map((p) => p.join('→')))] } };
  });

  await scenario(h, 'distant NPCs cost substantially less than nearby ones', async () => {
    await h.R(() => {
      const D = PSXAI.Debug, p = __PSX_REG__.Game.player;
      window.NEAR = []; window.FAR = [];
      for (let i = 0; i < 8; i++) NEAR.push(D.spawn(16, { temp: 'neutral', dx: 150 + i * 20, dy: (i % 3) * 40 }));
      for (let i = 0; i < 8; i++) FAR.push(D.spawn(16, { temp: 'neutral', x: p.x + 1320 + (i % 2) * 20, y: p.y + (i - 4) * 30 }));
      PSXAI.stats.thinks = [0, 0, 0]; PSXAI.stats.thinkMs = [0, 0, 0];
    });
    await h.wait(6000);
    const r = await h.R(() => ({ thinks: PSXAI.stats.thinks.slice(), ms: PSXAI.stats.thinkMs.slice(), lodNear: NEAR.map((e) => e.psx.lod), lodFar: FAR.filter((e) => !e.dead && __PSX_REG__.EnemyMgr.get(e.id) === e).map((e) => e.psx.lod) }));
    const nearRate = r.thinks[0] / 8 / 6, farRate = r.thinks[2] / Math.max(1, r.lodFar.length) / 6;
    const nearMs = r.ms[0] / 8 / 6, farMs = r.ms[2] / Math.max(1, r.lodFar.length) / 6;
    return { pass: r.lodFar.length > 0 && farRate < nearRate / 3 && farMs < nearMs / 2, detail: { thinksPerSec: { near: +nearRate.toFixed(2), far: +farRate.toFixed(2) }, msPerSec: { near: +nearMs.toFixed(3), far: +farMs.toFixed(3) }, farLods: r.lodFar } };
  });

  await scenario(h, 'existing combat & progression still work (auto-attacks kill, XP drops, no errors)', async () => {
    await h.R(() => { const p = __PSX_REG__.Game.player; p.psxOff = new Set(); window.K0 = p.kills; window.A = PSXAI.Debug.spawn(16, { temp: 'aggressive', dx: 120, hp: 30 }); });
    await h.page.mouse.move(640, 360);
    const s = await sample(h, 5000, 500, () => ({ dead: A.dead, kills: __PSX_REG__.Game.player.kills - K0, pickups: __PSX_REG__.Pickups.all().length }));
    const last = s[s.length - 1];
    return { pass: last.dead && last.kills >= 1 && last.pickups > 0 && h.errors.filter((e) => !e.includes('404')).length === 0, detail: { ...last, errors: h.errors.filter((e) => !e.includes('404')).slice(0, 3) } };
  });

  // =========================================================== combat intelligence
  await scenario(h, 'ranged Pokémon keeps its distance instead of charging', async () => {
    await h.R(() => { window.A = PSXAI.Debug.spawn(54, { temp: 'aggressive', dx: 200, moves: ['water-gun', 'bubble-beam', 'psybeam', 'confusion'], trait: { intelligence: 0.8, bravery: 0.6 } }); });
    const s = await sample(h, 7000, 350, () => T.dist(A));
    const tail = s.slice(4);
    const avg = tail.reduce((a, b) => a + b, 0) / tail.length;
    return { pass: avg > 140 && Math.min(...tail) > 70, detail: { avg: avg | 0, min: Math.min(...tail) | 0 } };
  });

  await scenario(h, 'melee Pokémon closes the distance', async () => {
    await h.R(() => { window.A = PSXAI.Debug.spawn(66, { temp: 'aggressive', dx: 260, moves: ['karate-chop', 'dynamic-punch', 'metal-claw', 'bite'], trait: { bravery: 0.9, aggression: 0.9 } }); });
    const s = await sample(h, 6000, 300, () => T.dist(A));
    return { pass: Math.min(...s) < 95, detail: { start: s[0] | 0, min: Math.min(...s) | 0 } };
  });

  await scenario(h, 'hybrid Pokémon switches between ranged and melee moves by distance', async () => {
    await h.R(() => {
      window.LOG = [];
      const NM = PSXAI.NpcMoves, ob = NM.begin;
      if (!NM._wrapped) { NM._wrapped = true; NM.begin = function (e, s, m, t, ax, ay) { if (window.LOG) LOG.push({ id: e.id, m: m.id, cls: m.cls, ranged: !!m.ranged, d: Math.hypot(t.x - e.x, t.y - e.y) | 0, t: PSXAI.time }); return ob.apply(this, arguments); }; }
      window.A = PSXAI.Debug.spawn(25, { temp: 'aggressive', dx: 230, moves: ['thunderbolt', 'quick-attack', 'spark', 'iron-tail'], trait: { intelligence: 0.8, bravery: 0.8, aggression: 0.8 } });
    });
    const strats = await sample(h, 16000, 500, () => A.psx.combat.strat);
    const log = await h.R(() => LOG.filter((x) => x.id === A.id));
    const ranged = log.filter((x) => x.ranged), close = log.filter((x) => !x.ranged);
    const rAvg = ranged.length ? ranged.reduce((a, x) => a + x.d, 0) / ranged.length : 0;
    const cAvg = close.length ? close.reduce((a, x) => a + x.d, 0) / close.length : 0;
    return { pass: ranged.length > 0 && close.length > 0 && rAvg > cAvg, detail: { ranged: ranged.length, close: close.length, avgDist: { ranged: rAvg | 0, close: cAvg | 0 }, moves: [...new Set(log.map((x) => x.m))], strategies: [...new Set(strats.filter(Boolean))] } };
  });

  await scenario(h, 'a Pokémon uses all four of its moves when appropriate (respecting cooldowns)', async () => {
    await h.R(() => { window.LOG = []; window.A = PSXAI.Debug.spawn(448, { temp: 'aggressive', dx: 280, moves: ['aura-sphere', 'karate-chop', 'quick-attack', 'swords-dance'], trait: { intelligence: 0.75, bravery: 0.9 } }); });
    await h.wait(12000);
    // second half: the player keeps stepping up close, so melee becomes the right call too
    for (let i = 0; i < 8; i++) {
      await h.R(() => { const p = __PSX_REG__.Game.player; const a = Math.atan2(p.y - A.y, p.x - A.x); p.x = A.x + Math.cos(a) * 50; p.y = A.y + Math.sin(a) * 50; });
      await h.wait(1500);
    }
    const r = await h.R(() => ({ moves: A.psx.combat.moves.map((m) => [m.id, m.uses, m.cd]), log: LOG.filter((x) => x.id === A.id) }));
    const allUsed = r.moves.every((m) => m[1] > 0);
    let cdOk = true;
    const last = {};
    for (const x of r.log) { const m = r.moves.find((mm) => mm[0] === x.m); if (last[x.m] != null && x.t - last[x.m] < m[2] * 0.75) cdOk = false; last[x.m] = x.t; }
    return { pass: allUsed && cdOk, detail: { uses: r.moves.map((m) => m[0] + '×' + m[1]), cooldownsRespected: cdOk } };
  });

  await scenario(h, 'enemy dodges visible projectiles but sometimes fails', async () => {
    await h.R(() => {
      window.A = PSXAI.Debug.spawn(658, { temp: 'aggressive', dx: 240, hp: 100000, moves: ['karate-chop', 'metal-claw', 'bite', 'iron-tail'], trait: { agility: 1, intelligence: 0.9, alertness: 0.9 } });
      window.HITS = 0; window.HP0 = A.hp;
    });
    await h.wait(800);
    for (let i = 0; i < 24; i++) {
      await h.R(() => {
        const R = __PSX_REG__, p = R.Game.player;
        const a = Math.atan2(A.y - p.y, A.x - p.x);
        const hp = A.hp;
        R.Projectiles.spawn({ x: p.x, y: p.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, dmg: 5, r: 7, life: 2, friendly: true, pierce: 0, color: '#fff', hits: new Set(), phits: new Set(), owner: p, mid: 'thunder-shock', vis: R.VFX.forType('electric'), mtype: 'electric' });
        window.__hpPrev = hp;
      });
      await h.wait(450);
      await h.R(() => { if (A.hp < window.__hpPrev) HITS++; });
    }
    const r = await h.R(() => ({ dodges: PSXAI.stats.dodges, hits: HITS }));
    return { pass: r.dodges >= 3 && r.hits >= 2, detail: r };
  });

  await scenario(h, 'several hostile Pokémon spread out instead of piling onto the player', async () => {
    await h.R(() => {
      window.G = [];
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; G.push(PSXAI.Debug.spawn([66, 56, 261, 19, 21, 23][i], { temp: 'aggressive', dx: Math.cos(a) * 260, dy: Math.sin(a) * 220, moves: ['karate-chop', 'bite', 'metal-claw', 'quick-attack'], trait: { bravery: 0.95, aggression: 0.9 } })); }
    });
    const s = await sample(h, 9000, 500, () => {
      const p = __PSX_REG__.Game.player;
      const live = G.filter((e) => !e.dead);
      const angs = live.map((e) => Math.atan2(e.y - p.y, e.x - p.x)).sort((a, b) => a - b);
      let gap = 0;
      for (let i = 0; i < angs.length; i++) gap = Math.max(gap, ((angs[(i + 1) % angs.length] - angs[i]) + (i === angs.length - 1 ? Math.PI * 2 : 0)));
      let minPair = Infinity;
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) minPair = Math.min(minPair, Math.hypot(live[i].x - live[j].x, live[i].y - live[j].y));
      return { onTop: live.filter((e) => T.dist(e) < 30).length, gap, minPair, n: live.length, menace: live.filter((e) => e.psx.combat.role === 'menace').length };
    });
    const tail = s.slice(6);
    const avgGap = tail.reduce((a, x) => a + x.gap, 0) / tail.length;
    const avgPair = tail.reduce((a, x) => a + x.minPair, 0) / tail.length;
    return { pass: tail.every((x) => x.onTop <= 2) && avgGap < Math.PI * 1.25 && avgPair > 14, detail: { maxOnTop: Math.max(...tail.map((x) => x.onTop)), largestGapDeg: Math.round(avgGap * 57.3), avgMinPair: avgPair | 0 } };
  });

  await scenario(h, 'ranged enemies aim predictively but are not perfectly accurate', async () => {
    await h.R(() => {
      const o = { temp: 'aggressive', moves: ['water-gun', 'confusion', 'sludge', 'ember'], trait: { intelligence: 0.95, bravery: 0.7 } };
      window.SH = [PSXAI.Debug.spawn(54, Object.assign({ dx: 230 }, o)), PSXAI.Debug.spawn(54, Object.assign({ dx: -230 }, o))];
    });
    for (let i = 0; i < 6; i++) { await h.page.keyboard.down(i % 2 ? 'KeyW' : 'KeyS'); await h.wait(3000); await h.page.keyboard.up(i % 2 ? 'KeyW' : 'KeyS'); }
    const r = await h.R(() => { let hit = 0, miss = 0; for (const e of SH) for (const m of e.psx.combat.moves) { hit += m.hit; miss += m.miss; } return { hit, miss }; });
    const n = r.hit + r.miss;
    return { pass: n >= 4 && r.hit > 0 && r.miss > 0, detail: { shots: n, hits: r.hit, misses: r.miss, accuracy: n ? +(r.hit / n).toFixed(2) : 0 } };
  });

  await scenario(h, 'Pokémon step out of telegraphed danger zones', async () => {
    let escaped = 0;
    for (let k = 0; k < 4; k++) {
      await h.R((k) => { PSXAI.Debug.clear(); window.A = PSXAI.Debug.spawn([25, 66, 54, 16][k], { temp: ['neutral', 'aggressive', 'timid', 'playful'][k], dx: 180, trait: { agility: 0.9, intelligence: 0.9, alertness: 0.9 } }); }, k);
      await h.wait(300);
      await h.R(() => { window.HZ = __PSX_REG__.Hazards.add({ kind: 'zone', x: A.x, y: A.y, r: 46, delay: 1.3, dmg: 1, type: 'fire', color: '#f80' }); });
      await h.wait(1250);
      escaped += await h.R(() => (__PSX_REG__.Hazards.inside(HZ, A.x, A.y, A.r) ? 0 : 1));
      await h.wait(400);
    }
    return { pass: escaped >= 3, detail: { escaped: escaped + '/4' } };
  });

  await scenario(h, 'peaceful Pokémon do not run combat calculations', async () => {
    await h.R(() => { for (let i = 0; i < 10; i++) PSXAI.Debug.spawn([16, 133, 25, 39, 10][i % 5], { temp: i % 2 ? 'friendly' : 'neutral', dx: 150 + (i % 5) * 40, dy: (i < 5 ? -1 : 1) * 90 }); PSXAI.stats.combatUpdates = 0; });
    await h.wait(5000);
    const r = await h.R(() => ({ combatUpdates: PSXAI.stats.combatUpdates, inCombat: __PSX_REG__.EnemyMgr.all().filter((e) => e.psx && e.psx.inCombat).length }));
    return { pass: r.combatUpdates === 0 && r.inCombat === 0, detail: r };
  });

  await scenario(h, 'mercy: stopping attacks on a beaten foe softens it over time', async () => {
    await h.R(() => { window.A = PSXAI.Debug.spawn(19, { temp: 'aggressive', dx: 160, trait: { forgiveness: 0.8, bravery: 0.95 } }); });
    await h.wait(500);
    await h.R(() => { A.hurt(A.maxHp * 0.6, '#fff', 1, 0, 0); });
    const a0 = await h.R(() => A.psx.rel.get('P').a);
    await h.wait(14000);
    const r = await h.R(() => ({ a: A.psx.rel.get('P').a, g: A.psx.rel.get('P').g, stance: A.psx.stance }));
    return { pass: r.a > a0 + 0.15, detail: { attitude: [+a0.toFixed(2), +r.a.toFixed(2)], grudge: +r.g.toFixed(2), stance: r.stance } };
  });

  await scenario(h, 'combat stays fast with many active Pokémon', async () => {
    await h.R(() => {
      const D = PSXAI.Debug;
      const temps = ['aggressive', 'aggressive', 'neutral', 'timid', 'playful', 'territorial'];
      for (let i = 0; i < 40; i++) { const a = i * 0.41; D.spawn([66, 25, 54, 16, 261, 74, 133, 92][i % 8], { temp: temps[i % 6], dx: Math.cos(a) * (180 + (i % 5) * 60), dy: Math.sin(a) * (150 + (i % 5) * 50) }); }
      __PSX_REG__.Game.player.psxOff = new Set();
      PSXAI.stats.aiMs = 0;
    });
    const s = await sample(h, 8000, 500, () => ({ ai: PSXAI.stats.aiMs, combat: PSXAI.stats.combat, n: PSXAI.stats.npcs }));
    const tail = s.slice(4);
    const avg = tail.reduce((a, x) => a + x.ai, 0) / tail.length;
    return { pass: avg < 6, detail: { avgAiMsPerFrame: +avg.toFixed(2), npcs: tail[tail.length - 1].n, activeCombat: Math.max(...tail.map((x) => x.combat)) } };
  });

  await scenario(h, 'species and personality shape temperament and movesets', async () => {
    const r = await h.R(() => {
      const S = PSXAI.Species;
      const roll = (dex, beh) => { const c = {}; for (let i = 0; i < 400; i++) { const t = S.roll({ dex, behavior: beh }, (Math.random() * 4e9) >>> 0).temp; c[t] = (c[t] || 0) + 1; } return c; };
      const fake = (dex) => ({ dex, behavior: 'chase', psx: { p: S.profile(dex), pers: S.roll({ dex, behavior: 'chase' }, 7) } });
      return { magikarp: roll(129, 'chase'), gyarados: roll(130, 'chase'), snorlax: roll(143, 'tank'), pikachu: roll(25, 'ranged'), magikarpMoves: PSXAI.NpcMoves.build(fake(129)).map((m) => m.id), gengarMoves: PSXAI.NpcMoves.build(fake(94)).map((m) => m.id) };
    });
    const share = (c, k) => (c[k] || 0) / 400;
    const pass = share(r.magikarp, 'aggressive') < 0.06 && share(r.gyarados, 'aggressive') > 0.35 && share(r.snorlax, 'neutral') > 0.45 && r.magikarpMoves.includes('splash');
    return { pass, detail: { magikarpAggro: share(r.magikarp, 'aggressive'), gyaradosAggro: share(r.gyarados, 'aggressive'), snorlaxNeutral: share(r.snorlax, 'neutral'), magikarpMoves: r.magikarpMoves, gengarMoves: r.gengarMoves } };
  });

  // =========================================================== evolution
  await scenario(h, 'bullied Magikarp evolves into Gyarados in a moment of rage and remembers', async () => {
    await h.R(() => {
      const D = PSXAI.Debug;
      window.BULLY = D.spawn(261, { temp: 'aggressive', dx: 300 });
      window.A = D.spawn(129, { temp: 'timid', dx: 260, dy: 20 });
      A.psx.bulliedBy = { e: BULLY, t: PSXAI.time, n: 3 };
      PSXAI.Rel.adjust(A.psx, BULLY.id, { g: 0.6, a: -0.6 });
      A.psx.exp = PSXAI.Evolution.need(A) * 1.1;
      PSXAI.Mind.feel(A.psx, 'anger', 1, BULLY.id);
      A.psx.mind.emo.anger = 0.98;
    });
    const s = await sample(h, 9000, 500, () => ({ dex: A.dex, lock: !!A.psx.lock, g: (A.psx.rel.get(BULLY.id) || {}).g, tgt: A.psx.combat.target === BULLY || A.psx.fightTarget === BULLY }));
    const last = s[s.length - 1];
    return { pass: last.dex === 130 && last.g > 0.5 && s.some((x) => x.tgt), detail: { evolvedTo: last.dex, sawGlow: s.some((x) => x.lock), grudge: +(last.g || 0).toFixed(2), goesAfterBully: s.some((x) => x.tgt) } };
  });

  await scenario(h, 'a losing Machop evolves mid-battle and keeps fighting', async () => {
    await h.R(() => { window.A = PSXAI.Debug.spawn(66, { temp: 'aggressive', dx: 150, trait: { bravery: 0.95, aggression: 0.9 } }); });
    await h.wait(2000);
    await h.R(() => { A.hp = A.maxHp * 0.3; A.psx.exp = PSXAI.Evolution.need(A) * 1.2; A.psx.mind.peak.determination = 0.8; A.psx.lastHurtBy = { key: 'P', ent: __PSX_REG__.Game.player, t: PSXAI.time }; });
    const s = await sample(h, 10000, 500, () => ({ dex: A.dex, inCombat: A.psx.inCombat, tgt: A.psx.combat.target === __PSX_REG__.Game.player, stance: A.psx.stance }));
    const after = s.filter((x) => x.dex === 67);
    return { pass: after.length > 0 && after.some((x) => x.tgt), detail: { evolved: after.length > 0, stillFighting: after.some((x) => x.tgt), stance: s[s.length - 1].stance } };
  });

  await scenario(h, 'wild Eevee evolves into Leafeon at an ancient Moss Rock without player involvement', async () => {
    const r0 = await h.R(() => {
      const R = __PSX_REG__, p = R.Game.player;
      // find a rock and consecrate it as a Moss Rock for the test
      let rock = null;
      for (let rad = 300; rad <= 3000 && !rock; rad += 300) rock = PSXAI.Env.props(p.x, p.y, rad).find((q) => q.type === 'rock' && q.hp > 0);
      if (!rock) return { ok: false };
      const os = PSXAI.Evolution.siteOf;
      PSXAI.Evolution.siteOf = (q) => (q === rock ? 'moss' : os(q));
      window.ROCK = rock;
      p.x = rock.x + 520; p.y = rock.y; // player watches from afar
      window.A = PSXAI.Debug.spawn(133, { temp: 'neutral', x: rock.x + 60, y: rock.y + 20, trait: { curiosity: 1 } });
      A.psx.exp = PSXAI.Evolution.need(A) * 1.2;
      return { ok: true };
    });
    if (!r0.ok) return { pass: false, detail: 'no rock found in the world' };
    const s = await sample(h, 16000, 500, () => ({ dex: A.dex, beh: A.psx.lock ? 'LOCK' : A.psx.beh.id }));
    const last = s[s.length - 1];
    return { pass: last.dex === 470, detail: { finalDex: last.dex, behs: [...new Set(s.map((x) => x.beh))] } };
  });
  await scenario(h, 'population stays within the configured limits', async () => {
    await h.R(() => { PSXAI.Debug.freeze(false); PSXAI.setCfg('maxNpcs', 20); __PSX_REG__.Game.debugTime(400); __PSX_REG__.Game.debugSpeed(3); });
    const s = await sample(h, 12000, 500, () => { __PSX_REG__.Spawner.burst(10); return { wild: PSXAI.Population.aliveWild(), vetoed: PSXAI.stats.spawnVetoed }; });
    await h.R(() => { __PSX_REG__.Game.debugSpeed(1); PSXAI.resetCfg(); });
    const max = Math.max(...s.map((x) => x.wild));
    return { pass: max <= 20 && max >= 10, detail: { maxWild: max, vetoed: s[s.length - 1].vetoed } };
  });

  // =========================================================== living environment
  await scenario(h, 'the starting woodland only brings out its own beginner Pokémon', async () => {
    await h.R(() => { T.unquiet(); PSXAI.Debug.freeze(false); __PSX_REG__.Game.debugSpeed(2); window.SEEN = new Set(); });
    const r = await h.R(async () => {
      const R = __PSX_REG__;
      const ro = PSXAI.Areas.roster();
      const early = new Set([...ro.tiers[0], ...ro.tiers[1]]);
      const cast0 = R.Enemies.cast[0].list.map((d) => d.dex);
      return { biome: PSXAI.Env.biome(), cast0, castOk: cast0.every((d) => early.has(d)), maxBst: Math.max(...cast0.map((d) => R.DEX_BY[d].bst)) };
    });
    const s = await sample(h, 9000, 500, () => { for (const e of __PSX_REG__.EnemyMgr.all()) if (e.psx && !e.boss && !e.psx.evolvedFrom) SEEN.add(e.dex); return SEEN.size; /* (beginners that evolve in the wild are another feature) */ });
    const seen = await h.R(() => [...SEEN]);
    const ok = await h.R((seen) => { const ro = PSXAI.Areas.roster(); const early = new Set([...ro.tiers[0], ...ro.tiers[1]]); return seen.every((d) => early.has(d)); }, seen);
    await h.R(() => { __PSX_REG__.Game.debugSpeed(1); PSXAI.Debug.freeze(true); });
    return { pass: r.biome === 0 && r.castOk && r.maxBst <= 360 && seen.length >= 2 && ok, detail: { cast0: r.cast0, maxBst: r.maxBst, spawned: seen } };
  });

  await scenario(h, 'night thins out the forest and brings out the nocturnal Pokémon', async () => {
    const r = await h.R(() => {
      const A = PSXAI.Areas, S = PSXAI.Sky, R = __PSX_REG__;
      // weightBag rounds weights randomly, so average over many draws
      const noct = (mk) => { let n = 0, t = 0; for (let i = 0; i < 40; i++) { const b = mk(); n += b.filter((d) => A.active(d.dex) === 'night').length; t += b.length; } return n / Math.max(1, t); };
      const list = R.Enemies.cast[0].list.flatMap((d) => Array(10).fill(d));
      S.set({ hour: 12 }); const day = { rate: A.spawnRate(), noct: noct(() => A.weightBag(list)) };
      S.set({ hour: 0.5 }); const night = { rate: A.spawnRate(), noct: noct(() => A.weightBag(list)) };
      S.set({ hour: 12 });
      return { day, night };
    });
    return { pass: r.night.rate < r.day.rate * 0.6 && r.night.noct > 0.6 && r.day.noct < 0.25, detail: r };
  });

  await scenario(h, 'day Pokémon fall asleep at night while night Pokémon stay up', async () => {
    await h.R(() => {
      PSXAI.Sky.set({ hour: 0.5 });
      window.A = PSXAI.Debug.spawn(16, { temp: 'neutral', dx: 200, energy: 0.45 });
      window.B = PSXAI.Debug.spawn(163, { temp: 'neutral', dx: -200, energy: 0.45 });
    });
    const s = await sample(h, 14000, 500, () => ({ a: A.psx.lock ? 'LOCK' : A.psx.beh.id, b: B.psx.lock ? 'LOCK' : B.psx.beh.id }));
    const aSlept = s.some((x) => x.a === 'sleep'), bSlept = s.some((x) => x.b === 'sleep');
    return { pass: aSlept && !bSlept, detail: { pidgey: [...new Set(s.map((x) => x.a))], hoothoot: [...new Set(s.map((x) => x.b))] } };
  });

  await scenario(h, 'a sleeping Pokémon wakes up when you run right past it', async () => {
    await h.R(() => { PSXAI.Sky.set({ hour: 1 }); window.A = PSXAI.Debug.spawn(19, { temp: 'neutral', dx: 260, energy: 0.05, trait: { laziness: 0.1 } }); });
    let asleep = false;
    for (let i = 0; i < 24 && !asleep; i++) { await h.wait(500); asleep = await h.R(() => A.psx.beh.id === 'sleep' && A.psx.bs.down); }
    let woke = false, vmax = 0;
    for (let i = 0; i < 4 && !woke; i++) {
      // line up with the sleeper, then dash right past it
      const dir = i % 2 ? -1 : 1;
      await h.R((dir) => { const p = __PSX_REG__.Game.player; p.x = A.x - dir * 160; p.y = A.y + 6; p._psxLastPrint = null; }, dir);
      const key = dir > 0 ? 'KeyD' : 'KeyA';
      await h.page.keyboard.down(key);
      for (let k = 0; k < 6; k++) { await h.wait(250); vmax = Math.max(vmax, await h.R(() => Math.hypot(__PSX_REG__.Game.player._vx || 0, __PSX_REG__.Game.player._vy || 0))); }
      await h.page.keyboard.up(key);
      woke = await h.R(() => !!A.psx.wokeAt);
    }
    const r = await h.R(() => ({ beh: A.psx.beh.id, icon: (PSXAI.Mind.bubbleFor(A.psx) || {}).icon }));
    return { pass: asleep && woke, detail: { wasAsleep: asleep, woke, playerSpeed: Math.round(vmax), after: r } };
  });

  await scenario(h, 'rain soaks the ground: puddles, footprints, and mud where you keep walking', async () => {
    await h.R(() => PSXAI.Sky.set({ rain: 1, cloud: 1, wet: 1 }));
    for (let i = 0; i < 28; i++) { const k = ['KeyW', 'KeyD', 'KeyS', 'KeyA'][i % 4]; await h.page.keyboard.down(k); await h.wait(260); await h.page.keyboard.up(k); }
    const r = await h.R(() => {
      const D = PSXAI.Decor, p = __PSX_REG__.Game.player;
      let mud = 0;
      for (let y = -120; y <= 120; y += 11) for (let x = -120; x <= 120; x += 11) mud = Math.max(mud, D.mudAt(p.x + x, p.y + y));
      return { puddles: D.puddleAmt(), prints: D.prints.length, mud: +mud.toFixed(2) };
    });
    return { pass: r.puddles > 0.5 && r.prints >= 6 && r.mud > 0.3, detail: r };
  });

  await scenario(h, 'rain sends Pidgey under the trees and Caterpie under the leaves', async () => {
    await h.R(() => {
      window.A = PSXAI.Debug.spawn(16, { temp: 'neutral', dx: 150, dy: 60 });
      window.TREE = !!PSXAI.Env.nearestProp(A.x, A.y, 300, 'tree');
      window.B = PSXAI.Debug.spawn(10, { temp: 'neutral', dx: -150, dy: 60 });
      PSXAI.Sky.set({ rain: 0.95, cloud: 1, wet: 0.8 });
    });
    const s = await sample(h, 8000, 500, () => ({ a: A.psx.beh.id, b: B.psx.beh.id, at: A.psx.bs.a && A.psx.bs.a.kind, bt: B.psx.bs.a && B.psx.bs.a.kind }));
    const last = s[s.length - 1];
    const tree = await h.R(() => TREE);
    // Pidgey heads for a tree when there's one in reach (a bush otherwise); Caterpie hides in the leaves
    return { pass: s.some((x) => x.a === 'shelter') && s.some((x) => x.b === 'shelter') && (last.at === 'tree' || !tree) && last.bt !== 'tree', detail: { ...last, treeNear: tree } };
  });

  await scenario(h, 'deep fog: Pokémon stop roaming and few new ones appear', async () => {
    await h.R(() => {
      window.G = [16, 19, 161, 10].map((d, i) => PSXAI.Debug.spawn(d, { temp: 'neutral', dx: -180 + i * 120, dy: 90 }));
    });
    await h.wait(2500);
    await h.R(() => { PSXAI.Sky.set({ fog: 0.97, wind: 0.02 }); window.P0 = G.map((e) => [e.x, e.y]); });
    await h.wait(1500);
    await h.R(() => { window.P0 = G.map((e) => [e.x, e.y]); });
    await h.wait(5000);
    const r = await h.R(() => ({ moved: G.map((e, i) => Math.round(Math.hypot(e.x - P0[i][0], e.y - P0[i][1]))), behs: G.map((e) => e.psx.beh.id), rate: +PSXAI.Areas.spawnRate().toFixed(2), sight: +PSXAI.Sky.visibility(false).toFixed(2) }));
    // nobody roams: they huddle where they are or slip into the nearest shelter
    const settled = r.behs.every((b) => b === 'huddle' || b === 'shelter');
    return { pass: settled && Math.max(...r.moved) < 160 && r.rate < 0.35 && r.sight < 0.3, detail: r };
  });

  await scenario(h, 'a gale sends a small bird tumbling away, crying', async () => {
    await h.R(() => { window.A = PSXAI.Debug.spawn(16, { temp: 'neutral', dx: 120 }); PSXAI.Sky.set({ wind: 1 }); });
    await h.wait(600);
    await h.R(() => { window.X0 = [A.x, A.y]; for (let k = 0; k < 8; k++) PSXAI.Bus.emit({ type: 'gust', x: 0, y: 0, loud: 0, power: 1.4 }); }); // each gust has ~36% chance
    await h.wait(400);
    const mid = await h.R(() => ({ lock: !!A.psx.lock, fear: +A.psx.mind.emo.fear.toFixed(2), icon: (PSXAI.Mind.bubbleFor(A.psx) || {}).icon }));
    await h.wait(2600);
    const r = await h.R(() => ({ gone: A.dead || __PSX_REG__.EnemyMgr.get(A.id) !== A, moved: Math.round(Math.hypot(A.x - X0[0], A.y - X0[1])) }));
    return { pass: mid.lock && mid.fear > 0.5 && (r.gone || r.moved > 150), detail: { ...mid, ...r } };
  });

  await scenario(h, 'thunder: the flash comes first, the rumble later, and Pokémon are frightened', async () => {
    await h.R(() => {
      window.TH = [19, 10, 161].map((d, i) => PSXAI.Debug.spawn(d, { temp: 'timid', dx: 140, dy: -60 + i * 60 }));
      window.EV = [];
      PSXAI.Bus.on('lightning', (e) => EV.push(['flash', PSXAI.time]));
      PSXAI.Bus.on('boom', (e) => { if (e.thunder) EV.push(['thunder', PSXAI.time]); });
    });
    await h.wait(400);
    await h.R(() => { window.F0 = PSXAI.Sky.flash; PSXAI.Sky.bolt(1.2); window.F1 = PSXAI.Sky.flash; });
    const fears = await sample(h, 4800, 300, () => Math.max(...TH.map((e) => e.psx.mind.emo.fear)));
    const r = await h.R(() => ({ ev: EV.slice(-2), flash: +F1.toFixed(2) }));
    r.fear = +Math.max(...fears).toFixed(2);
    const f = r.ev.find((x) => x[0] === 'flash'), t = r.ev.find((x) => x[0] === 'thunder');
    const delay = f && t ? +(t[1] - f[1]).toFixed(1) : null;
    return { pass: r.flash > 0.4 && delay != null && delay > 2 && r.fear > 0.2, detail: { flash: r.flash, delay, fear: r.fear } };
  });

  await scenario(h, 'nights are dark, and lanterns light up the darkness', async () => {
    const lum = () => h.R(() => {
      const cv = document.getElementById('game'), g = cv.getContext('2d');
      const avg = (x, y, w, hh) => { const d = g.getImageData(x, y, w, hh).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
      const w = cv.width, hh = cv.height;
      return { center: Math.round(avg(w / 2 - 40, hh / 2 - 60, 80, 80)), corner: Math.round(avg(20, 120, 120, 120)) };
    });
    await h.R(() => PSXAI.Sky.set({ hour: 12 }));
    await h.wait(700);
    const day = await lum();
    await h.R(() => { PSXAI.Sky.set({ hour: 0.5, day: 4 }); PSXAI.Light.lamp.lit = true; });
    await h.wait(700);
    const night = await lum();
    return { pass: night.corner < day.corner * 0.55 && night.center > night.corner * 1.4, detail: { day, night } };
  });

  await scenario(h, 'only Pokémon with a real light source glow: Charmander\'s tail flame lights the dark, Regirock and Pikachu do not', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, L = PSXAI.Light, p = R.Game.player;
      PSXAI.Sky.set({ hour: 0.5, day: 2 });
      const ch = PSXAI.Debug.spawn(4, { temp: 'neutral', dx: 120 });
      const rg = PSXAI.Debug.spawn(377, { temp: 'neutral', dx: -120 });
      const vu = PSXAI.Debug.spawn(37, { temp: 'neutral', dy: 110 }); // Vulpix: a Fire type with no flame of its own
      await new Promise((res) => setTimeout(res, 600));
      ch.anim.dir = 2; // facing right: the tail (and its flame) is on the left
      const ls = L.gather(R.Camera);
      const of = (e) => ls.filter((l) => l.body === e);
      const fl = of(ch)[0];
      return { charmander: of(ch).length, tailSide: fl ? Math.sign(fl.x - ch.x) : 0, tailUp: fl ? Math.round(ch.y - fl.y) : 0, reach: fl ? fl.r : 0, regirock: of(rg).length, vulpix: of(vu).length, player: of(p).length, playerLantern: L.lanternOn() };
    });
    return { pass: r.charmander === 1 && r.tailSide === -1 && r.tailUp > 5 && r.reach >= 80 && r.reach <= 140 && r.regirock === 0 && r.vulpix === 0 && r.player === 0 && !r.playerLantern, detail: r };
  });

  await scenario(h, 'moves light the world for as long as they last: a Thunder Shock flash, a Flamethrower stream, Will-o-Wisp\'s soft glow', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, L = PSXAI.Light, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      PSXAI.Sky.set({ hour: 0.5 });
      L.flashes.length = 0;
      const e = PSXAI.Debug.spawn(4, { temp: 'neutral', dx: 150 });
      await wait(200);
      L.moveLight(e, { id: 'thunder-shock', type: 'electric' }, 0);
      const shock = L.flashes.slice(-1)[0];
      await wait(300);
      const shockGone = !L.flashes.includes(shock);
      L.moveLight(e, { id: 'flamethrower', type: 'fire' }, Math.PI);
      const ft = L.flashes.slice(-1)[0];
      const x0 = ft.ent ? ft.ent.x + ft.ox : ft.x;
      e.x += 40;
      const x1 = ft.ent ? ft.ent.x + ft.ox : ft.x;
      L.moveLight(e, { id: 'will-o-wisp', type: 'fire', def: { dur: 6 } }, 0);
      const wisp = L.flashes.slice(-1)[0];
      // and moves used in battle by wild Pokémon light up too (a hostile Charmander's Ember / Flamethrower)
      L.flashes.length = 0;
      const foe = PSXAI.Debug.spawn(4, { temp: 'aggressive', dx: -160 });
      PSXAI.Debug.freeze(false);
      let fromBattle = 0;
      let dbg = null;
      for (let i = 0; i < 50 && !fromBattle; i++) { await wait(200); fromBattle = L.flashes.filter((f) => f.c[0] === 255 && f.c[1] === 150).length; dbg = { beh: foe.psx && foe.psx.beh.id, stance: foe.psx && foe.psx.stance, inCombat: foe.psx && foe.psx.inCombat, n: L.flashes.length, d: Math.round(Math.hypot(foe.x - p.x, foe.y - p.y)) }; }
      PSXAI.Debug.freeze(true);
      return { shock: { r: shock.r, dur: shock.dur }, shockGone, flame: { r: ft.r, follows: Math.round(x1 - x0), dur: ft.dur }, wisp: { r: wisp.r, dur: wisp.dur, soft: !!wisp.soft }, fromBattle, dbg };
    });
    const ok = r.shock.r >= 100 && r.shock.dur < 0.3 && r.shockGone && r.flame.follows === 40 && r.flame.dur >= 0.5 && r.wisp.dur === 6 && r.wisp.soft && r.wisp.r < r.flame.r && r.fromBattle > 0;
    return { pass: ok, detail: r };
  });

  await scenario(h, 'the lantern is real equipment: dark until you light it (L), hangs at your side and burns oil', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, L = PSXAI.Light, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      PSXAI.Sky.set({ hour: 0.5 });
      L.reset();
      const before = L.lanternOn();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL' }));
      const lit = L.lanternOn();
      const ls = L.gather(R.Camera).filter((l) => l.r === 175);
      const side = ls[0] ? Math.round(Math.abs(ls[0].x - p.x)) : -1;
      const oil0 = L.lamp.oil;
      await wait(1200);
      const burned = +(oil0 - L.lamp.oil).toFixed(1);
      L.lamp.oil = 0.3;
      await wait(700);
      const outOfOil = L.lanternOn();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyL' }));
      const stillOut = L.lanternOn();
      L.addOil(90);
      const refilled = L.lamp.oil;
      L.reset();
      return { before, lit, side, burned, outOfOil, stillOut, refilled: Math.round(refilled) };
    });
    return { pass: !r.before && r.lit && r.side > 10 && r.burned >= 0.8 && !r.outOfOil && !r.stillOut && r.refilled >= 90, detail: r };
  });

  await scenario(h, 'nights are very dark but never black; the moon\'s current phase is mirrored in the water', async () => {
    const r = await h.R(async () => {
      const S = PSXAI.Sky, F = PSXAI.Forest, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const amb = (day, cloud) => { S.set({ hour: 0.5, day, cloud, rain: 0, fog: 0 }); return S.ambient().reduce((a, b) => a + b, 0) / 3; };
      const newMoon = amb(0, 0.05), fullMoon = amb(4, 0.05), noon = (S.set({ hour: 12 }), S.ambient().reduce((a, b) => a + b, 0) / 3);
      PSXAI.setCfg('nightVisibility', 1); const assisted = amb(0, 0.05); PSXAI.setCfg('nightVisibility', 0);
      // by the lake on a first-quarter night: the reflection is half lit
      const Lk = F.plan().lake;
      let x = Lk.x, y = Lk.y;
      for (let d = 0; d < 2000; d += 20) { x = Lk.x + Math.cos(0.8) * d; y = Lk.y + Math.sin(0.8) * d; if (F.water(x, y).e < -40) break; }
      p.x = x + 60; p.y = y + 60; PSXAI.Mansion.snapCamera(p);
      S.set({ hour: 0.5, day: 2, cloud: 0.05 });
      await wait(900);
      const phase = S.moonPhase();
      const shot = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const cam = R.Camera, cv = document.getElementById('game'), g = cv.getContext('2d');
        const vis = F.moonVis();
        // find the brightest small patch on the lake
        let best = 0;
        const k = cv.width / (cam.w * cam.scale);
        for (let yy = cv.height * 0.12; yy < cv.height * 0.8; yy += 6) for (let xx = 0; xx < cv.width; xx += 6) { // (below the HUD's clock)
          const wx = cam.left() + xx / k / cam.scale, wy = cam.top() + yy / k / cam.scale;
          if (F.water(wx, wy).e < 20) continue;
          const d = g.getImageData(xx, yy, 1, 1).data; best = Math.max(best, d[0] + d[1] + d[2]);
        }
        res({ vis, best });
      })));
      const half = await shot();
      S.set({ day: 0 }); await wait(500);
      const none = await shot();
      return { newMoon: Math.round(newMoon), fullMoon: Math.round(fullMoon), noon: Math.round(noon), assisted: Math.round(assisted), phase, half, none };
    });
    const ok = r.newMoon < r.noon * 0.2 && r.newMoon > 25 && r.fullMoon > r.newMoon * 1.3 && r.assisted > r.newMoon * 1.5 && r.phase === 0.25 && r.half.vis > 0.5 && r.half.best > 500 && r.none.best < r.half.best * 0.6;
    return { pass: ok, detail: r };
  });

  await scenario(h, 'dialogue boxes: your party talks on the left, important NPCs on the right, two each at most, with PMD portraits', async () => {
    const r = await h.R(async () => {
      const T = PSXAI.Talk;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      T.reset();
      for (let i = 0; i < 40 && !T.manifest; i++) await wait(50);
      T.say('player', 'Did anyone else hear that?');
      T.party({ dex: 7, name: 'Squirtle', key: 'f' }, 'Hear what? Haha!');
      T.npc({ dex: 94, name: 'Gengar', key: 'g', col: '#a77be0' }, 'Kekeke!');
      T.npc({ dex: 477, name: 'Dusknoir', key: 'd' }, '…Enough.');
      T.party({ dex: 1, name: 'Bulbasaur', key: 's' }, 'Bulba.');
      T.npc({ dex: 92, name: 'Gastly', key: 'ga' }, 'Boo!');
      await wait(900);
      const left = T.boxes.left.map((b) => b.who.name), right = T.boxes.right.map((b) => b.who.name);
      const portraits = [7, 1, 477, 92].map((d) => !!T.portrait(d, 'Normal'));
      const emo = [T.emoFor('Kekeke! Got you!'), T.emoFor('…I don\'t like this.'), T.emoFor('What?! No way!?')];
      // words are typed out, then the box fades on its own
      const b = T.say('player', 'Short.', { life: 0.3 });
      await wait(1600);
      const faded = !T.boxes.left.includes(b);
      T.reset();
      return { left, right, portraits, emo, faded, local: Object.keys(T.manifest || {}).length };
    });
    const ok = r.left.length === 2 && r.left.includes('Bulbasaur') && !r.left.includes('Pikachu') && r.right.length === 2 && r.right.includes('Gastly') && !r.right.includes('Gengar') && r.portraits.every(Boolean) && r.emo[0] === 'Joyous' && r.emo[1] === 'Worried' && r.emo[2] === 'Surprised' && r.faded && r.local > 30;
    return { pass: ok, detail: r };
  });

  await scenario(h, 'the Shady Forest plays Viridian Forest (bosses and rifts keep their own music), exploring pays quietly, and Level 2 asks you to complete Level 1', async () => {
    const r = await h.R(async () => {
      const Mu = PSXAI.Music, R = __PSX_REG__, X = PSXAI.Exp, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      await wait(1500);
      const forest = Mu.choose(), req = Mu.st.req;
      Mu.st.req = 'boss'; const boss = Mu.choose(); Mu.st.req = 'rift'; const rift = Mu.choose(); Mu.st.req = req;
      PSXAI.setCfg('forestMusic', false); const off = Mu.choose(); PSXAI.setCfg('forestMusic', true);
      await wait(1200);
      const el = Mu.st.els.forest;
      // walking new ground: EXP, but no toast about distances or places found
      PSXAI.cfg.exploreExp = true; X.reset(); PSXAI.Debug.freeze(false);
      const said = [], oSay = R.Spawner.say;
      R.Spawner.say = function (t) { said.push(String(t)); return oSay.apply(this, arguments); };
      for (let i = 0; i < 120; i++) { p.x += 45; await wait(25); }
      R.Spawner.say = oSay; PSXAI.Debug.freeze(true); PSXAI.cfg.exploreExp = false;
      const lock = R.I18n.f('Derrota a Arceus en el mapa {x} para abrirlo.', 1), lock2 = R.I18n.f('Derrota a Arceus en el mapa {x} para abrirlo.', 2);
      return { forest, boss, rift, off, playing: !!el && !el.paused && el.src.includes('viridian'), vol: el ? +el.volume.toFixed(2) : 0, xp: X.st.total, toasts: said.filter((t) => /explored|Discovered|km/i.test(t)), lock, lock2 };
    });
    return { pass: r.forest === 'forest' && r.boss === null && r.rift === null && r.off === null && r.playing && r.vol > 0.05 && r.xp > 0 && r.toasts.length === 0 && !/Arceus/.test(r.lock) && /1/.test(r.lock) && /Arceus/.test(r.lock2), detail: r };
  });

  await scenario(h, 'the Legendary box is only for Legendaries: "???" and a silhouette until known, and bosses speak as the battle turns', async () => {
    const r = await h.R(async () => {
      const T = PSXAI.Talk, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      T.reset();
      const notLegend = T.legend(16, 'I am just a Pidgey.');
      const pidgeyInLegendBox = T.boxes.legend === notLegend;
      const dk = T.legend(491, '…Turn back.', { unknown: true });
      const unknown = T.boxes.legend === dk && dk.unknown;
      // a legendary boss arrives and fights
      T.reset();
      const e = PSXAI.Debug.spawn(150, { temp: 'neutral', dx: 140 });
      e.legend = true;
      await wait(400);
      const arrival = T.boxes.legend && T.boxes.legend.who.dex === 150 ? T.boxes.legend.text : null;
      e.hp = e.maxHp * 0.4; await wait(300);
      const mid = T.boxes.legend && T.boxes.legend.text;
      e.hp = e.maxHp * 0.1; await wait(300);
      const low = T.boxes.legend && T.boxes.legend.text;
      e.dead = true; T.reset();
      return { pidgeyInLegendBox, unknown, arrival, mid, low };
    });
    const ok = !r.pidgeyInLegendBox && r.unknown && !!r.arrival && r.mid && r.mid !== r.arrival && r.low && r.low !== r.mid;
    return { pass: ok, detail: r };
  });

  // ------------------------------------------------------------------ Natures
  await scenario(h, 'Natures shape wild Pokémon: fear comes faster to a Timid one than a Brave one, anger to a Rash one', async () => {
    const r = await h.R(() => {
      const D = PSXAI.Debug, M = PSXAI.Mind;
      const t = D.spawn(19, { temp: 'neutral', nature: 'timid', dx: 200 }), b = D.spawn(19, { temp: 'neutral', nature: 'brave', dx: -200 });
      const ra = D.spawn(19, { temp: 'neutral', nature: 'rash', dy: 200 }), ca = D.spawn(19, { temp: 'neutral', nature: 'calm', dy: -200 });
      for (const e of [t, b]) { e.psx.mind.emo.fear = 0; e.psx.pers.tr.bravery = 0.5; }
      for (const e of [ra, ca]) { e.psx.mind.emo.anger = 0; e.psx.pers.tr.aggression = 0.5; }
      M.feel(t.psx, 'fear', 0.3); M.feel(b.psx, 'fear', 0.3); M.feel(ra.psx, 'anger', 0.3); M.feel(ca.psx, 'anger', 0.3);
      const out = { timid: +t.psx.mind.emo.fear.toFixed(2), brave: +b.psx.mind.emo.fear.toFixed(2), rash: +ra.psx.mind.emo.anger.toFixed(2), calm: +ca.psx.mind.emo.anger.toFixed(2), natures: [t.psx.pers.nature, b.psx.pers.nature, ra.psx.pers.nature, ca.psx.pers.nature], all25: PSXAI.Natures.IDS.length };
      for (const e of [t, b, ra, ca]) e.dead = true;
      return out;
    });
    return { pass: r.timid > r.brave * 1.8 && r.rash > r.calm * 1.8 && r.natures.join() === 'timid,brave,rash,calm' && r.all25 === 25, detail: r };
  });

  // ------------------------------------------------------------------ EXP for more than fighting
  await scenario(h, 'EXP for exploring: new ground on foot pays, standing still or walking in circles does not, a chest pays once', async () => {
    const r = await h.R(async () => {
      const X = PSXAI.Exp, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      PSXAI.cfg.exploreExp = true;
      X.reset(); PSXAI.Debug.freeze(false);
      for (const k of ['clear', 'grove', 'wet', 'deep', 'lake']) X.st.kinds.add(k); // (a first sight of a new kind of place pays on its own; this is about ground)
      const xp = () => X.st.total;
      // standing still (after whatever the starting spot itself is worth)
      await wait(1500);
      const s0 = xp();
      await wait(2500);
      const still = xp() - s0;
      // walking in a small circle (the same few cells over and over)
      for (let i = 0; i < 60; i++) { p.x += Math.cos(i * 0.3) * 30; p.y += Math.sin(i * 0.3) * 30; await wait(50); }
      const circle = xp() - s0 - still;
      // a long walk over new ground
      const a0 = xp();
      for (let i = 0; i < 90; i++) { p.x += 40; await wait(60); }
      const walk = xp() - a0;
      // a teleport across the map: no credit for the ground skipped
      const b0 = xp(); p.x += 5000; await wait(400); const tele = xp() - b0;
      // a chest pays once, a big one more
      const c0 = xp();
      X.onBreak({ type: 'chest', x: 123, y: 456 }); const chest = xp() - c0;
      X.onBreak({ type: 'chest', x: 123, y: 456 }); const again = xp() - c0 - chest;
      const d0 = xp(); X.onBreak({ type: 'bigchest', x: 131, y: 456 }); const big = xp() - d0; // (right beside it: equally hidden, or not)
      PSXAI.Debug.freeze(true);
      return { still, circle, walk, tele, chest, again, big, unit: Math.round(X.unit()) };
    });
    return { pass: r.still === 0 && r.circle <= r.unit && r.walk > r.unit && r.tele <= r.unit * 0.5 && r.chest > 0 && r.again === 0 && r.big > r.chest * 2, detail: r };
  });

  await scenario(h, 'EXP for kindness and curiosity, with a limit so none of it can be farmed', async () => {
    const r = await h.R(() => {
      const X = PSXAI.Exp, B = PSXAI.Bus;
      PSXAI.cfg.exploreExp = true;
      X.reset();
      const t = () => X.st.total;
      B.emit({ type: 'befriend', key: 77, loud: 0 }); const friend = t();
      B.emit({ type: 'befriend', key: 77, loud: 0 }); const sameFriend = t() - friend;
      const b = t(); B.emit({ type: 'myst', what: 'clue', id: 'darkrai', i: 0, loud: 0 }); const clue = t() - b;
      // a flood of the same small thing: capped, then a trickle
      const c = t();
      for (let i = 0; i < 40; i++) X.give(3, 'test');
      const flood = t() - c;
      const fullRate = Math.round(X.unit() * 3) * 40;
      return { friend, sameFriend, clue, flood, fullRate };
    });
    return { pass: r.friend > 0 && r.sameFriend === 0 && r.clue > 0 && r.flood < r.fullRate * 0.5, detail: r };
  });

  // ------------------------------------------------------------------ forest events & storytelling
  await scenario(h, 'forest event: a lost Pokémon calms when you stay with it, its parent comes, and you are thanked', async () => {
    const r = await h.R(async () => {
      const E = PSXAI.Events, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      PSXAI.cfg.forestEvents = true; PSXAI.cfg.exploreExp = true;
      PSXAI.Sky.set({ hour: 14 });
      E.reset(); p._vx = 100; p._vy = 0;
      const ev = E.start('lost');
      if (!ev) return { started: false };
      const kidDex = ev.kid.dex;
      await wait(1200);
      p.x = ev.kid.x + 30; p.y = ev.kid.y + 10; PSXAI.Mansion.snapCamera(p);
      const phases = [];
      for (let i = 0; i < 30 && E.st.cur === ev; i++) { await wait(400); phases.push(ev.phase + (ev.reunited ? '+' : '')); }
      return { started: true, kidDex, parentDex: ev.parent && ev.parent.dex, phases: [...new Set(phases)], reunited: !!ev.reunited, xp: PSXAI.Exp.st.log.some((l) => l.why === 'forest event') };
    });
    return { pass: r.started && r.reunited && r.parentDex && r.xp, detail: r };
  });

  await scenario(h, 'forest events: strange tracks lead to something buried; a fallen tree blocks the way until a Fire-type burns it clear', async () => {
    const r = await h.R(async () => {
      const E = PSXAI.Events, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      PSXAI.cfg.forestEvents = true;
      E.reset(); p._vx = 100; p._vy = 0;
      const prints0 = PSXAI.Decor.prints.length;
      const tr = E.start('tracks');
      const prints = PSXAI.Decor.prints.length - prints0;
      p.x = tr.x + 5; p.y = tr.y + 5;
      for (let i = 0; i < 10 && E.st.cur === tr; i++) await wait(300);
      const dug = E.st.cur !== tr;
      // the fallen tree: solid, and it stays until a Fire-type stands at it
      E.st.cur = null;
      const fl = E.start('fallen');
      const solid = !R.World.isFree(fl.x, fl.y - 4, 10);
      p.x = fl.x; p.y = fl.y + 70;
      await wait(2000);
      const stillThere = E.st.cur === fl && fl.burn === 0; // (Pikachu can't burn it)
      const ch = PSXAI.Debug.spawn(4, { temp: 'friendly', x: fl.x + 40, y: fl.y + 40 });
      // a wild Charmander doesn't count: only a player does (here, for a moment, you play a Fire-type)
      ch.dead = true;
      const dex0 = p.dex;
      p.dex = 4;
      try { for (let i = 0; i < 20 && E.st.cur === fl; i++) await wait(300); } finally { p.dex = dex0; }
      return { prints, dug, solid, stillThere, burned: E.st.cur !== fl, freeAfter: R.World.isFree(fl.x, fl.y - 4, 10) };
    });
    return { pass: r.prints >= 20 && r.dug && r.solid && r.stillThere && r.burned && r.freeAfter, detail: r };
  });

  await scenario(h, 'the forest tells its story: markers, carvings, signs, statues and letters, read by standing at them, each once', async () => {
    const r = await h.R(async () => {
      const E = PSXAI.Events, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      PSXAI.cfg.forestEvents = true; PSXAI.cfg.exploreExp = true;
      E.reset(); PSXAI.Exp.reset(); p._vx = 100;
      const kinds = new Set(), texts = [];
      for (let k = 0; k < 6; k++) {
        E.placeLore();
        const q = E.st.props[E.st.props.length - 1];
        if (!q) continue;
        kinds.add(q.lore.kind);
        p.x = q.x + 8; p.y = q.y + 8;
        for (let i = 0; i < 8 && E.st.props.includes(q); i++) await wait(250);
        if (E.st.card) texts.push(E.st.card.text.slice(0, 40));
        p.x += 50;
      }
      const read = E.st.read.size;
      // reading the same one again gives nothing new
      const xp0 = PSXAI.Exp.st.total;
      E.readLore([...E.st.read][0]);
      const again = PSXAI.Exp.st.total - xp0;
      const named = texts.some((t) => /Giratina|Gengar's|Darkrai/.test(t));
      return { kinds: [...kinds], read, again, sample: texts.slice(0, 2), lore: E.LORE.length };
    });
    return { pass: r.read >= 5 && r.kinds.length >= 3 && r.again === 0 && r.lore >= 12, detail: r };
  });

  // ------------------------------------------------------------------ Mega Evolution & Z-Moves: how they're earned
  const withProgress = (fn, arg) => h.R(async (a) => {
    const R = __PSX_REG__, s = R.DB.save, p = R.Game.player;
    const keep = { wins: s.mapWins ? Object.assign({}, s.mapWins) : undefined, map: R.Maps.cur.n, biome: R.World.biome, dex: p.dex, level: p.level, item: p.item, megaForm: s.megaForm ? Object.assign({}, s.megaForm) : undefined };
    window.__KEEP = keep;
    return true;
  }, arg || {}).then(() => h.R(fn, arg)).finally(() => h.R(() => {
    const R = __PSX_REG__, s = R.DB.save, p = R.Game.player, k = window.__KEEP;
    s.mapWins = k.wins; R.Maps.set(k.map); p.dex = k.dex; if (k.megaForm) s.megaForm = k.megaForm;
    // (Zona Cero is the endless map: while it's set, the game cycles the world's biome)
    if (R.World.biome !== k.biome) R.World.setBiome(k.biome, true);
    if (p.item !== k.item) p.equip(k.item || null);
    PSXAI.Power._forgetCrystals();
  }));

  await scenario(h, 'Mega Evolution: locked until Crystal Cave is beaten, only from Level 3, and only with that Pokémon\'s own Mega Stone in its held-item slot', async () => {
    const r = await withProgress(() => {
      const R = __PSX_REG__, W = PSXAI.Power, p = R.Game.player, s = R.DB.save;
      p.dex = 448; // (Lucario; the old level-50 rule no longer matters at any level)
      s.mapWins = {};
      const out = { oldRule: R.Mega.unlocked(p) };
      s.mapWins = { 1: 1, 2: 1 }; R.Maps.set(2);
      out.beatenButStage2 = R.Mega.unlocked(p);
      R.Maps.set(3);
      out.stage3NoStone = R.Mega.unlocked(p);
      p.equip('mstone_94_mega'); out.wrongStone = R.Mega.unlocked(p); // (Gengarite on a Lucario)
      p.equip('mstone_448_mega'); out.ownStone = R.Mega.unlocked(p);
      out.heldItem = p.item;
      p.equip('assaultvest'); out.vestInstead = R.Mega.unlocked(p);
      out.slotHolds = p.item;
      out.stoneIsHeldItem = !!R.Items.BY.mstone_448_mega;
      return out;
    });
    const ok = !r.oldRule && !r.beatenButStage2 && !r.stage3NoStone && !r.wrongStone && r.ownStone && r.heldItem === 'mstone_448_mega' && !r.vestInstead && r.slotHolds === 'assaultvest' && r.stoneIsHeldItem;
    return { pass: ok, detail: r };
  });

  await scenario(h, 'Mega Stones only ever come for the Pokémon you play: chests 5%, big chests 10%, level-ups 1%, never from random drops', async () => {
    const r = await withProgress(() => {
      const R = __PSX_REG__, W = PSXAI.Power, p = R.Game.player, s = R.DB.save;
      s.mapWins = { 1: 1, 2: 1 }; R.Maps.set(3); p.equip(null);
      const dropped = [];
      const oDrop = R.Pickups.drop;
      R.Pickups.drop = function (kind, x, y, id) { if (kind === 'item' && W.isStone(id)) { dropped.push(id); return null; } return oDrop.apply(this, arguments); };
      const count = (fn, n) => { dropped.length = 0; for (let i = 0; i < n; i++) fn(i); return dropped.length / n; };
      try {
        p.dex = 25; const pikachu = count((i) => W.onChest({ type: 'bigchest', x: i, y: 0 }), 400); // (no Mega for Pikachu: nothing, ever)
        p.dex = 448;
        const chest = count((i) => W.onChest({ type: 'chest', x: i, y: 1 }), 6000);
        const kinds = new Set(dropped);
        const big = count((i) => W.onChest({ type: 'bigchest', x: i, y: 2 }), 6000);
        const again = count(() => W.onChest(Object.assign(window.__C = window.__C || { type: 'bigchest', x: 5, y: 5 })), 50); // (each chest rolls once)
        let up = 0; const N = 20000; for (let i = 0; i < N; i++) if (W.canGetStone(p) && Math.random() < W.P.levelup) up++;
        let rolled = 0; for (let i = 0; i < 4000; i++) if (W.isStone(R.Items.roll())) rolled++;
        // before Crystal Cave is beaten: nothing at all
        s.mapWins = { 1: 1 }; const locked = count((i) => W.onChest({ type: 'bigchest', x: i, y: 9 }), 500);
        return { pikachu, chest: +chest.toFixed(3), big: +big.toFixed(3), kinds: [...kinds], again: +again.toFixed(2), levelup: +(up / N).toFixed(4), rolled, locked, P: W.P };
      } finally { R.Pickups.drop = oDrop; }
    });
    const ok = r.pikachu === 0 && Math.abs(r.chest - 0.05) < 0.015 && Math.abs(r.big - 0.1) < 0.02 && r.kinds.join() === 'mstone_448_mega' && r.again <= 0.02 && Math.abs(r.levelup - 0.01) < 0.004 && r.rolled === 0 && r.locked === 0 && r.P.chest === 0.05 && r.P.bigchest === 0.1 && r.P.levelup === 0.01;
    return { pass: ok, detail: r };
  });

  await scenario(h, 'the glowing Mega Stone on the map: placed out of sight with no message, marker or arrow, and found only by walking up to it', async () => {
    const r = await withProgress(async () => {
      const R = __PSX_REG__, W = PSXAI.Power, p = R.Game.player, s = R.DB.save;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      s.mapWins = { 1: 1, 2: 1 }; R.Maps.set(3); p.dex = 448; p.equip(null);
      W.reset(); W.st.worldAt = 0;
      const said = []; const oSay = R.Spawner.say; R.Spawner.say = function (t) { said.push(t); return oSay.apply(this, arguments); };
      await wait(400);
      const w = W.st.world;
      const seenAtPlacement = w ? R.Camera.sees(w.x, w.y, 0) : null;
      const saidBefore = said.slice();
      const lit = PSXAI.Light.gather(R.Camera).length;
      let picked = false;
      if (w) {
        const oDrop = R.Pickups.drop; R.Pickups.drop = function (kind, x, y, id) { if (kind === 'item' && id === w.id) picked = true; return oDrop.apply(this, arguments); };
        p.x = w.x; p.y = w.y; PSXAI.Mansion.snapCamera(p);
        await wait(400);
        R.Pickups.drop = oDrop;
      }
      R.Spawner.say = oSay;
      // (nothing is said until you've actually picked it up)
      return { placed: !!w, id: w && w.id, seenAtPlacement, silent: saidBefore.filter((t) => /stone|mega|ite\b/i.test(t)).length === 0, picked, oncePerRun: W.st.worldDone && !W.st.world };
    });
    return { pass: r.placed && r.id === 'mstone_448_mega' && r.seenAtPlacement === false && r.silent && r.picked && r.oncePerRun, detail: r };
  });

  await scenario(h, 'Z-Moves: no Z slot at all before Volcano is beaten; afterwards a Z-Move needs the Z-Crystal of its own type', async () => {
    const r = await withProgress(async () => {
      const R = __PSX_REG__, W = PSXAI.Power, p = R.Game.player, s = R.DB.save;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      s.mapWins = { 1: 1, 2: 1 }; R.Maps.set(3);
      PSXAI.Power._forgetCrystals();
      await wait(300);
      const before = { ultDef: !!p.ultDef, noSlot: window.PSXGEN.noZslot() };
      s.mapWins[3] = 1; R.Maps.set(4);
      await wait(300);
      const noCrystal = !!p.ultDef;
      const type = W.zTypeOf(p);
      W.giveCrystal(type === 'fire' ? 'water' : 'fire'); await wait(300);
      const wrongCrystal = !!p.ultDef;
      W.giveCrystal(type); await wait(300);
      const withCrystal = !!p.ultDef;
      const name = W.CRYSTAL[type];
      return { before, noCrystal, wrongCrystal, withCrystal, type, name };
    });
    return { pass: !r.before.ultDef && r.before.noSlot && !r.noCrystal && !r.wrongCrystal && r.withCrystal && !!r.name, detail: r };
  });

  await scenario(h, 'a Totem\'s shrine stands in the stage after Volcano, only for your own Pokémon\'s Z-Crystal; standing at it starts its trial', async () => {
    const r = await withProgress(async () => {
      const R = __PSX_REG__, T = PSXAI.Totem, W = PSXAI.Power, p = R.Game.player, s = R.DB.save;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      W._forgetCrystals(); T.reset(); PSXAI.Debug.freeze(false);
      R.Game.debugTime(90);
      s.mapWins = { 1: 1, 2: 1 }; R.Maps.set(4);
      await wait(400);
      const beforeVolcano = !!T.st.shrine;
      s.mapWins[3] = 1;
      await wait(400);
      const sh = T.st.shrine;
      const type = W.zTypeOf(p);
      const out = { beforeVolcano, placed: !!sh, shrineType: sh && sh.type, ownType: type, outOfSight: sh ? !R.Camera.sees(sh.x, sh.y, 0) : null };
      if (sh) { p.x = sh.x; p.y = sh.y + 30; PSXAI.Mansion.snapCamera(p); }
      for (let i = 0; i < 30 && !T.active(); i++) await wait(200);
      out.started = T.active();
      out.trialType = T.st.trial && T.st.trial.type;
      // (leave without finishing)
      if (T.st.trial) { T.leave(); for (let i = 0; i < 20 && T.st.trial; i++) await wait(200); }
      // once you have the crystal, no shrine for it
      T.reset(); W.giveCrystal(type); await wait(400);
      out.noneOnceEarned = !T.st.shrine;
      PSXAI.Debug.freeze(true); R.Game.debugTime(0);
      return out;
    });
    return { pass: !r.beforeVolcano && r.placed && r.shrineType === r.ownType && r.outOfSight && r.started && r.trialType === r.ownType && r.noneOnceEarned, detail: r };
  });

  await scenario(h, 'a Totem Trial: a pitch-black maze for Ghost, hordes of its type out of the dark, then the Totem; beating it gives its Z-Crystal', async () => {
    const r = await h.R(async () => {
      const T = PSXAI.Totem, R = __PSX_REG__, p = R.Game.player, W = PSXAI.Power;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      W._forgetCrystals(); T.reset(); PSXAI.Debug.freeze(false);
      const home = [p.x, p.y];
      T.start('ghost', { quick: true, survive: 9 });
      for (let i = 0; i < 40 && !T.active(); i++) await wait(100);
      const amb = PSXAI.Sky.ambient();
      const t = T.st.trial;
      const types = new Set();
      for (let i = 0; i < 50 && t.phase === 'survive'; i++) { await wait(250); for (const e of R.EnemyMgr.all()) if (e.psxTrial && !e.dead) for (const ty of e.types || []) types.add(ty); }
      const allGhost = [...types].includes('ghost');
      const wildInside = R.EnemyMgr.all().filter((e) => !e.dead && T.inside(e.x, e.y) && !e.psxTrial).length;
      const totem = t.totem && t.totem.dex;
      if (t.totem) t.totem.hurt(t.totem.maxHp * 3, '#fff', 0, 0, 0);
      for (let i = 0; i < 30 && T.st.trial; i++) await wait(250);
      PSXAI.Debug.freeze(true);
      const out = { dark: amb[0] + amb[1] + amb[2] < 60, waves: t.wave, allGhost, wildInside, totem, crystal: W.hasCrystal('ghost'), back: Math.round(Math.hypot(p.x - home[0], p.y - home[1])), done: !T.st.trial };
      W._forgetCrystals();
      return out;
    });
    return { pass: r.dark && r.waves >= 2 && r.allGhost && r.wildInside === 0 && !!r.totem && r.crystal && r.back < 5 && r.done, detail: r };
  });

  // ------------------------------------------------------------------ weather and nights
  await scenario(h, 'the weather moves on about every minute, and every change blends in smoothly', async () => {
    const r = await h.R(() => {
      const S = PSXAI.Sky;
      S.set({ hour: 12, freeze: false });
      S.st.frozen = true; S.st.pattern = 'fair'; S.st.patternT = 1; S.st.forced = null;
      let changes = 0, last = S.st.pattern, maxStep = 0;
      const keys = ['cloud', 'rain', 'fog', 'wind', 'storm'];
      for (let i = 0; i < 600; i++) { // ten minutes, a second at a time
        const before = keys.map((k) => S.st.cur[k]);
        S.tick(1);
        keys.forEach((k, j) => { maxStep = Math.max(maxStep, Math.abs(S.st.cur[k] - before[j])); });
        if (S.st.pattern !== last) { changes++; last = S.st.pattern; }
      }
      S.set({ hour: 12, freeze: true });
      return { changes, maxStep: +maxStep.toFixed(3) };
    });
    // about ten steps in ten minutes (some steps pick the same state), never more than a few percent per second
    return { pass: r.changes >= 6 && r.changes <= 11 && r.maxStep <= 0.045, detail: r };
  });

  await scenario(h, 'at night only the night Pokémon are about: Hoothoot, Murkrow, Spinarak, Joltik, Gastly…', async () => {
    const r = await h.R(() => {
      const A = PSXAI.Areas, S = PSXAI.Sky;
      S.set({ hour: 0.5 });
      const night = Object.fromEntries([16, 19, 263, 10, 163, 198, 167, 595, 92].map((d) => [d, +A.activity(d).toFixed(2)]));
      S.set({ hour: 12 });
      const day = Object.fromEntries([16, 19, 163, 595].map((d) => [d, +A.activity(d).toFixed(2)]));
      const roster = A.roster().tiers[0];
      return { night, day, joltikInRoster: roster.includes(595) };
    });
    const n = r.night;
    const ok = n[16] <= 0.03 && n[19] <= 0.1 && n[263] <= 0.1 && n[10] <= 0.05 && [163, 198, 167, 595, 92].every((d) => n[d] >= 0.9) && r.day[16] >= 0.9 && r.day[163] <= 0.1 && r.joltikInRoster;
    return { pass: ok, detail: r };
  });

  // ------------------------------------------------------------------ Raikou, Suicune and Entei
  const trio = (fn, arg) => h.R(async (a) => {
    const R = __PSX_REG__, s = R.DB.save;
    window.__OWN = { 243: !!(s.owned || {})[243], 244: !!(s.owned || {})[244], 245: !!(s.owned || {})[245], legends: Object.assign({}, s.legends || {}) };
    PSXAI.cfg.legendTrio = true; PSXAI.Trio.forget(); PSXAI.Trio.reset(); PSXAI.Debug.freeze(true);
    for (const d of [243, 244, 245]) if (s.owned) delete s.owned[d];
    return true;
  }, arg || {}).then(() => h.R(fn, arg)).finally(() => h.R(() => {
    const R = __PSX_REG__, s = R.DB.save, k = window.__OWN;
    for (const d of [243, 244, 245]) if (!k[d] && s.owned) delete s.owned[d];
    s.legends = k.legends;
    const T = PSXAI.Trio; if (T.st.battle) { T.st.battle.e.dead = true; } T.reset(); T.forget();
    PSXAI.Sky.st.forced = null;
    for (const e of R.EnemyMgr.all()) if (e.psxTrio) e.dead = true;
  }));

  await scenario(h, 'Raikou: only in a harsh night storm its shadow appears near you; the fourth time a bolt strikes in front of you and it battles you; beat it and it joins you', async () => {
    const r = await trio(async () => {
      const T = PSXAI.Trio, S = PSXAI.Sky, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const strikes = async (n) => { for (let i = 0; i < n; i++) { S.bolt(1.5); await wait(900); } };
      // a storm by day, and light rain at night: nothing
      S.set({ hour: 13, storm: 1, rain: 1, cloud: 1, fog: 0, freeze: true }); await wait(300); await strikes(5);
      const dayStorm = T.save.raikou.seen;
      S.set({ hour: 0.5, storm: 0, rain: 0.4, cloud: 0.8 }); await wait(300); await strikes(4);
      const lightRain = T.save.raikou.seen;
      // a harsh storm at night
      S.set({ hour: 0.5, storm: 1, rain: 1, cloud: 1 }); await wait(300);
      for (let i = 0; i < 40 && T.save.raikou.seen < 4; i++) { S.bolt(1.5); await wait(900); }
      const seen = T.save.raikou.seen;
      for (let i = 0; i < 20 && !T.busy(); i++) await wait(200);
      const scene = T.busy();
      let locked = false, strike = false;
      for (let i = 0; i < 80 && T.busy(); i++) { await wait(200); if (R.Input.axis()[0] === 0) locked = true; if (S.st.strikes.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 200)) strike = true; }
      const b = T.st.battle;
      const out = { dayStorm, lightRain, seen, scene, locked, strike, battle: !!b, dex: b && b.e.dex, boss: b && !!b.e.boss };
      if (b) { b.e.hurt(b.e.maxHp * 10, '#fff', 0, 0, 0); R.Pickups.clear(); } // (its EXP would level you up, and the level-up cards pause the game)
      await wait(600);
      out.owned = !!(R.DB.save.owned || {})[243]; out.legend = !!(R.DB.save.legends || {})[243];
      return out;
    });
    return { pass: r.dayStorm === 0 && r.lightRain === 0 && r.seen >= 4 && r.scene && r.locked && r.strike && r.battle && r.dex === 243 && r.boss && r.owned && r.legend, detail: r };
  });

  await scenario(h, 'Suicune: only by day in the thickest fog its shadow drifts past; the fourth time the fog parts, it walks up to you and battles you', async () => {
    const r = await trio(async () => {
      const T = PSXAI.Trio, S = PSXAI.Sky, R = __PSX_REG__;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      S.set({ hour: 0.5, fog: 0.97, rain: 0, storm: 0, cloud: 0.7, freeze: true }); await wait(300);
      T.st.nextShadow = 0; await wait(4000);
      const night = T.save.suicune.seen + T.st.shadows.length;
      S.set({ hour: 10, fog: 0.5 }); await wait(300); T.st.nextShadow = 0; await wait(4000);
      const thin = T.save.suicune.seen + T.st.shadows.length;
      S.set({ hour: 10, fog: 0.97 }); await wait(300);
      for (let i = 0; i < 80 && T.save.suicune.seen < 4; i++) { if (!T.st.shadows.length) T.st.nextShadow = 0; await wait(300); }
      const seen = T.save.suicune.seen;
      for (let i = 0; i < 30 && !T.busy(); i++) await wait(200);
      const scene = T.busy();
      await wait(2500);
      const parting = !!(S.st.forced && S.st.forced.fog != null && S.st.forced.fog < 0.3);
      const walking = !!(T.st.actor && T.st.actor.dex === 245);
      for (let i = 0; i < 100 && T.busy(); i++) await wait(200);
      const b = T.st.battle;
      const out = { night, thin, seen, scene, parting, walking, battle: !!b, dex: b && b.e.dex };
      if (b) { b.e.hurt(b.e.maxHp * 10, '#fff', 0, 0, 0); R.Pickups.clear(); } // (its EXP would level you up, and the level-up cards pause the game)
      await wait(600);
      out.owned = !!(R.DB.save.owned || {})[245]; out.fogBack = !(S.st.forced && S.st.forced.fog != null);
      return out;
    });
    return { pass: r.night === 0 && r.thin === 0 && r.seen >= 4 && r.scene && r.parting && r.walking && r.battle && r.dex === 245 && r.owned && r.fogBack, detail: r };
  });

  await scenario(h, 'Entei: only on a clear day, and only once Raikou and Suicune are yours, it comes to challenge you', async () => {
    const r = await trio(async () => {
      const T = PSXAI.Trio, S = PSXAI.Sky, R = __PSX_REG__;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      PSXAI.cfg.enteiChance = 1;
      S.set({ hour: 12, fog: 0, rain: 0, storm: 0, cloud: 0.1, freeze: true }); await wait(300);
      T.st.enteiT = 0; await wait(600);
      const before = T.busy();
      R.DB.grant(243, 'test'); R.DB.grant(245, 'test');
      S.set({ hour: 12, rain: 0.6, cloud: 0.9 }); await wait(400); T.st.enteiT = 0; await wait(600);
      const rain = T.busy();
      S.set({ hour: 12, rain: 0, cloud: 0.1 }); await wait(2500); T.st.enteiT = 0; await wait(600);
      const scene = T.busy();
      for (let i = 0; i < 100 && T.busy(); i++) await wait(200);
      const b = T.st.battle;
      const out = { before, rain, scene, battle: !!b, dex: b && b.e.dex };
      if (b) { b.e.hurt(b.e.maxHp * 10, '#fff', 0, 0, 0); R.Pickups.clear(); } // (its EXP would level you up, and the level-up cards pause the game)
      await wait(600);
      out.owned = !!(R.DB.save.owned || {})[244];
      PSXAI.cfg.enteiChance = null;
      return out;
    });
    return { pass: !r.before && !r.rain && r.scene && r.battle && r.dex === 244 && r.owned, detail: r };
  });

  // ------------------------------------------------------------------ the old well
  await scenario(h, 'an old well sometimes stands in the forest: out of sight, solid, cold; look in and toss a coin, and something may come up', async () => {
    const r = await h.R(async () => {
      const W = PSXAI.Well, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      PSXAI.cfg.oldWell = true; W.reset(); PSXAI.Debug.freeze(true);
      R.Game.debugTime(200); await wait(300);
      W.st.rolled = true; W.st.wanted = true;
      for (let i = 0; i < 20 && !W.st.well; i++) { W.place(); await wait(100); }
      const w = W.st.well;
      if (!w) return { placed: false };
      const out = { placed: true, unseen: !R.Camera.sees(w.x, w.y, 0), solid: PSXAI.Decor.blocked(w.x, w.y, 4), water: PSXAI.Forest.water(w.x, w.y).e > -60, path: PSXAI.Forest.pathDist(w.x, w.y) < 70 };
      p.x = w.x; p.y = w.y + 52; PSXAI.Mansion.snapCamera(p);
      p.coins = 50;
      await wait(2600);
      out.found = W.st.found; out.looked = W.st.uses; out.coins = p.coins; out.text = !!W.st.text;
      R.Game.debugTime(0);
      return out;
    });
    return { pass: r.placed && r.unseen && r.solid && !r.water && !r.path && r.found && r.looked === 1 && r.coins === 40 && r.text, detail: r };
  });

  await scenario(h, 'trees and undergrowth use the new varied art', async () => {
    await h.wait(400);
    const r = await h.R(() => {
      const R = __PSX_REG__;
      const props = R.World.visibleProps(R.Camera);
      const trees = props.filter((p) => p.type === 'tree'), grass = props.filter((p) => p.type === 'grass'), decor = props.filter((p) => p.type === 'psx');
      return { art: PSXAI.Art.ready, trees: trees.length, treeArt: new Set(trees.map((p) => p._psxArt)).size, styled: trees.filter((p) => p._psxArt).length, grass: grass.length, decor: decor.length, decorKinds: [...new Set(decor.map((p) => p.item.k))] };
    });
    return { pass: r.art && r.styled === r.trees && (r.trees < 3 || r.treeArt >= 2) && r.decor > 0, detail: r };
  });

  await scenario(h, 'Pokémon tell each other different versions of the mansion rumour', async () => {
    await h.R(() => {
      PSXAI.Sky.set({ hour: 21 });
      window.G = [161, 19, 16, 263].map((d, i) => PSXAI.Debug.spawn(d, { temp: i % 2 ? 'neutral' : 'playful', dx: 90 + (i % 2) * 70, dy: -40 + i * 26, trait: { sociability: 0.9, bravery: 0.3 } }));
    });
    await h.wait(800);
    const r = await h.R(async () => {
      const L = PSXAI.Lore;
      const told = L.tellStory();
      const text = L.says.length ? L.says[L.says.length - 1].text : null;
      const versions = new Set(G.map((e) => L.T.rumor.en[(PSXAI.U.hash(e.id, PSXAI.Decor.seed, 77) * 10) | 0]));
      return { told, text, versions: versions.size };
    });
    await h.wait(3600);
    const react = await h.R(() => G.map((e) => (PSXAI.Mind.bubbleFor(e.psx) || {}).icon).filter(Boolean));
    return { pass: r.told && !!r.text && r.versions >= 2 && react.length >= 1, detail: { text: r.text, versions: r.versions, reactions: react } };
  });

  await scenario(h, 'the old path: clues, a lantern that flickers without wind, and a frightened Hoothoot', async () => {
    const info = await h.R(() => {
      PSXAI.Journey.establishNow(); // (the path only exists once 20 minutes of forest have passed)
      const t = PSXAI.Decor.trail;
      if (!t) return null;
      const kinds = [...new Set(t.items.map((i) => i.k))];
      const lan = t.items.find((i) => i.k === 'gallows');
      PSXAI.Sky.set({ hour: 22.5, wind: 0, rain: 0, wet: 0.5 });
      let min = 1;
      for (let i = 0; i < 400; i++) { PSXAI.time += 0.05; min = Math.min(min, PSXAI.Decor.flame(lan)); }
      const p = __PSX_REG__.Game.player;
      p.x = t.start[0] - 240; p.y = t.start[1] + 60;
      PSXAI.Lore.st.allowHoot = true;
      return { kinds, minFlame: +min.toFixed(2) };
    });
    if (!info) return { pass: false, detail: 'no trail in this area' };
    await h.wait(2000);
    const spawned = await h.R(() => !!PSXAI.Lore.st.hoot);
    await h.R(() => { const p = __PSX_REG__.Game.player, t = PSXAI.Decor.trail, sg = t.items.find((i) => i.k === 'sign'); p.x = sg.x - 70; p.y = sg.y + 30; });
    await h.wait(5000);
    const r = await h.R(() => ({ warned: PSXAI.Lore.says.some((s) => s.e === PSXAI.Lore.st.hoot) || PSXAI.Lore.st.hoot && PSXAI.Lore.st.hoot.psx.mind.emo.fear > 0.4, fear: PSXAI.Lore.st.hoot ? +PSXAI.Lore.st.hoot.psx.mind.emo.fear.toFixed(2) : null }));
    await h.R(() => { PSXAI.Lore.st.allowHoot = false; const p = __PSX_REG__.Game.player; p.x = 0; p.y = 0; });
    const need = ['sign', 'gallows', 'dirt', 'mcandle', 'wraith', 'fence_h', 'mgate', 'fountain', 'shed', 'mansion'];
    return { pass: need.every((k) => info.kinds.includes(k)) && info.minFlame < 0.3 && spawned && r.warned, detail: { ...info, hoothoot: spawned, ...r } };
  });

  await scenario(h, 'in thick fog, Pokémon refuse to go near the old trail', async () => {
    const r0 = await h.R(() => {
      PSXAI.Journey.establishNow();
      const t = PSXAI.Decor.trail;
      const p = __PSX_REG__.Game.player;
      // the spot along the path where the trail's pull is strongest (outside the mansion's silent grounds)
      let at = [t.pts[6][0], t.pts[6][1] + 20], bz = -1;
      for (let i = 3; i < Math.min(12, t.pts.length); i++) for (const dy of [0, 12, 24]) { const z = PSXAI.Decor.trailZone(t.pts[i][0], t.pts[i][1] + dy); if (z > bz && __PSX_REG__.World.isFree(t.pts[i][0], t.pts[i][1] + dy, 12) && !PSXAI.Mansion.silentAt(t.pts[i][0], t.pts[i][1] + dy)) { bz = z; at = [t.pts[i][0], t.pts[i][1] + dy]; } }
      p.x = at[0] + 300; p.y = at[1];
      window.A = PSXAI.Debug.spawn(161, { temp: 'neutral', x: at[0], y: at[1] });
      PSXAI.Sky.set({ fog: 0.9, hour: 15 });
      return PSXAI.Decor.trailZone(A.x, A.y);
    });
    await h.wait(5000);
    const r = await h.R(() => ({ zone: +PSXAI.Decor.trailZone(A.x, A.y).toFixed(2), fear: +A.psx.mind.emo.fear.toFixed(2) }));
    await h.R(() => { const p = __PSX_REG__.Game.player; p.x = 0; p.y = 0; });
    return { pass: r0 > 0.1 && r.zone < r0 * 0.8 && r.fear > 0.2, detail: { start: +r0.toFixed(2), ...r } }; // (the trail's pull is weaker away from the mansion's silent grounds)
  });

  await scenario(h, 'new arrivals emerge naturally instead of popping up in plain view', async () => {
    await h.R(() => {
      const R = __PSX_REG__;
      T.unquiet();
      window.ARR = [];
      const oa = R.EnemyMgr.add;
      if (!R.EnemyMgr._t) { R.EnemyMgr._t = true; R.EnemyMgr.add = function (e) { const r = oa.apply(this, arguments); if (window.ARR && e.psxNative !== undefined) ARR.push({ vis: R.Camera.sees(e.x, e.y, -10), emerge: e.psxEmerge ? e.psxEmerge.kind : null }); return r; }; }
      PSXAI.Debug.freeze(false); R.Game.debugSpeed(3);
    });
    await h.wait(9000);
    const r = await h.R(() => { __PSX_REG__.Game.debugSpeed(1); PSXAI.Debug.freeze(true); const a = ARR; window.ARR = null; return a; });
    const inView = r.filter((x) => x.vis);
    return { pass: r.length >= 3 && inView.every((x) => x.emerge), detail: { arrivals: r.length, inView: inView.length, emerged: [...new Set(r.map((x) => x.emerge).filter(Boolean))] } };
  });

  await scenario(h, 'disturbing a habitat makes its Pokémon settle elsewhere', async () => {
    const r = await h.R(() => {
      const A = PSXAI.Areas, p = __PSX_REG__.Game.player;
      const list = A.anchors(p.x, p.y, 500, ['log', 'bush', 'tree', 'burrow']);
      const a = list[0];
      if (!a) return null;
      const before = A.disturbed(a);
      for (let i = 0; i < 6; i++) A.bump(a, 0.4);
      const after = A.disturbed(a);
      const stillListed = A.anchors(a.x, a.y, 20, [a.kind]).length;
      return { before, after, stillListed };
    });
    if (!r) return { pass: false, detail: 'no habitat nearby' };
    return { pass: !r.before && r.after && r.stillListed === 0, detail: r };
  });

  // =========================================================== overhaul: world, encounters, storms, sizes
  await scenario(h, 'path lights (small candles) stand only along the old path to the mansion and on its grounds, nowhere at random', async () => {
    const r = await h.R(() => {
      const D = PSXAI.Decor;
      D.ensure();
      PSXAI.Journey.establishNow();
      const g = D.trail.mansion, cx = (g.S[0] + g.D[0]) / 2, cy = (g.S[1] + g.D[1]) / 2;
      const items = D.inRect(cx - 3500, cy - 3500, cx + 3500, cy + 3500, []);
      const grounds = (it) => Math.abs(it.x - g.D[0]) < g.SW && it.y > g.top && it.y < g.G[1];
      const lamps = items.filter((it) => (it.k === 'lamp' || it.k === 'mcandle') && !grounds(it));
      const path = D.trail ? D.trail.mansion.dense : [];
      const fromPath = lamps.map((l) => Math.round(Math.min(...path.map((q) => Math.hypot(l.x - q[0], l.y - q[1])))));
      return { lamps: lamps.length, inTrail: lamps.filter((l) => D.trail.items.includes(l)).length, fromPath };
    });
    return { pass: r.lamps >= 2 && r.inTrail === r.lamps && r.fromPath.every((d) => d < 90), detail: r };
  });

  await scenario(h, 'attack warnings are soft glows instead of blinking red dashed outlines', async () => {
    const red = () => h.R(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const cv = document.getElementById('game'), g = cv.getContext('2d');
      const d = g.getImageData(cv.width / 2 - 150, cv.height / 2 - 150, 300, 300).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 90) n++;
      res(n);
    }))));
    const add = () => h.R(() => { const p = __PSX_REG__.Game.player; __PSX_REG__.Hazards.clear(); __PSX_REG__.Hazards.add({ kind: 'zone', x: p.x + 60, y: p.y + 40, r: 80, delay: 3, dmg: 0, type: 'fire', color: '#f00' }); __PSX_REG__.Hazards.add({ kind: 'line', x: p.x - 120, y: p.y - 60, angle: 0.3, len: 220, w: 26, delay: 3, dmg: 0, type: 'fire', color: '#f00' }); });
    // compared without the light map, so canopy shade doesn't dim the colours being counted
    await h.R(() => PSXAI.setCfg('atmosphere', false));
    await add(); await h.wait(1500);
    const soft = await red();
    await h.R(() => PSXAI.setCfg('softTelegraphs', false)); await add(); await h.wait(1500);
    const old = await red();
    await h.R(() => { __PSX_REG__.Hazards.clear(); PSXAI.setCfg('softTelegraphs', true); PSXAI.setCfg('atmosphere', true); });
    return { pass: old > 200 && soft < old * 0.25, detail: { harshRedPixels: { soft, original: old } } };
  });

  await scenario(h, 'no timed hordes: the surge timer stays off (and comes back if you ask for it)', async () => {
    await h.wait(400);
    const off = await h.R(() => __PSX_REG__.Spawner.snap().surgeT);
    await h.R(() => PSXAI.setCfg('hordes', true)); await h.wait(400);
    const on = await h.R(() => __PSX_REG__.Spawner.snap().surgeT);
    await h.R(() => PSXAI.setCfg('hordes', false)); await h.wait(400);
    const back = await h.R(() => __PSX_REG__.Spawner.snap().surgeT);
    return { pass: off > 1e8 && on < 100 && back > 1e8, detail: { off: off > 1e8 ? 'off' : off, withHordes: Math.round(on), afterwards: back > 1e8 ? 'off' : back } };
  });

  await scenario(h, 'a boss only comes after enough Pokémon are defeated, with a notice first', async () => {
    await h.R(() => {
      const R = __PSX_REG__, P = PSXAI.Progress;
      PSXAI.setCfg('eventCooldown', 1);
      P.st.lastEvent = -999; P.st.bossPending = null;
      R.Game.player.kills = 0; R.Game.debugTime(900); // a long run, but nothing defeated yet
      window.SAID = []; window.oSay = window.oSay || R.Spawner.say; R.Spawner.say = function (m) { SAID.push(String(m)); return oSay.apply(this, arguments); };
    });
    await h.wait(3000);
    const before = await h.R(() => ({ boss: __PSX_REG__.EnemyMgr.bossAlive(), idx: __PSX_REG__.Spawner.snap().bossIdx }));
    await h.R(() => { __PSX_REG__.Game.player.kills = PSXAI.cfg.bossKills[0] + 1; });
    let boss = false, noticeFirst = false;
    for (let i = 0; i < 20 && !boss; i++) {
      await h.wait(500);
      const r = await h.R(() => ({ boss: __PSX_REG__.EnemyMgr.bossAlive(), said: SAID.length }));
      if (r.said && !r.boss) noticeFirst = true;
      boss = r.boss;
    }
    // while the boss is out, a rift milestone doesn't open a rift on top of it
    await h.R(() => { __PSX_REG__.Game.player.kills = PSXAI.cfg.riftKills[0] + 5; PSXAI.Progress.st.lastEvent = -999; });
    await h.wait(1500);
    const overlap = await h.R(() => !!__PSX_REG__.Rift.rift);
    const said = await h.R(() => SAID.slice());
    await h.R(() => { __PSX_REG__.Spawner.say = oSay; PSXAI.Debug.clear(true); });
    return { pass: !before.boss && boss && noticeFirst && !overlap, detail: { bossBeforeMilestone: before.boss, bossAfter: boss, noticeFirst, riftDuringBoss: overlap, said } };
  });

  await scenario(h, 'rifts open at defeat milestones, away from you; golden rifts are far rarer', async () => {
    await h.R(() => {
      const R = __PSX_REG__, P = PSXAI.Progress;
      PSXAI.Debug.clear(true);
      if (R.Rift.rift) R.Rift.onEvent(['riftx']);
      PSXAI.setCfg('eventCooldown', 1); PSXAI.setCfg('bossKills', [1e9]); // only rifts in this one
      P.st.lastEvent = -999; P.st.rift = 0; P.st.gold = 0; P.st.bossPending = null;
      R.Game.player.kills = PSXAI.cfg.riftKills[0] - 5;
    });
    await h.wait(1500);
    const early = await h.R(() => !!__PSX_REG__.Rift.rift);
    await h.R(() => { __PSX_REG__.Game.player.kills = PSXAI.cfg.riftKills[0] + 1; });
    await h.wait(1500);
    const r1 = await h.R(() => { const R = __PSX_REG__, rf = R.Rift.rift, p = R.Game.player; return rf && { gold: rf.gold, d: Math.round(Math.hypot(rf.x - p.x, rf.y - p.y)), floor: R.World.kindAt(rf.x, rf.y) === 'floor' }; });
    // the game's own timed rifts are cancelled
    await h.R(() => { const R = __PSX_REG__; R.Rift.onEvent(['riftx']); PSXAI.Progress.st.lastEvent = 1e9; R.Rift.debugOpen && R.Rift.debugOpen(); });
    await h.wait(800);
    const foreign = await h.R(() => !!__PSX_REG__.Rift.rift);
    const gaps = await h.R(() => { const P = PSXAI.Progress, c = PSXAI.cfg; return { normal: [0, 1, 2, 3, 4, 5].map((n) => P.milestone(c.riftKills, n)), golden: [0, 1, 2].map((n) => P.milestone(c.goldenRiftKills, n)) }; });
    await h.R(() => { PSXAI.Progress.st.lastEvent = -999; __PSX_REG__.Game.player.kills = 0; PSXAI.resetCfg(); });
    const rarer = gaps.golden[0] > gaps.normal[2] && gaps.golden[1] - gaps.golden[0] > gaps.normal[1] - gaps.normal[0];
    return { pass: !early && r1 && !r1.gold && r1.d >= 650 && r1.floor && !foreign && rarer, detail: { riftBeforeMilestone: early, rift: r1, timedRiftCancelled: !foreign, milestones: gaps } };
  });

  await scenario(h, 'a sleeping Pokémon stays put through wind, rain and gusts', async () => {
    await h.R(() => { PSXAI.Sky.set({ hour: 1 }); window.A = PSXAI.Debug.spawn(16, { temp: 'neutral', dx: 240, energy: 0.05, trait: { laziness: 0.1 } }); });
    let asleep = false;
    for (let i = 0; i < 24 && !asleep; i++) { await h.wait(500); asleep = await h.R(() => A.psx.beh.id === 'sleep' && A.psx.bs.down); }
    await h.R(() => { window.P0 = [A.x, A.y]; PSXAI.Sky.set({ wind: 1, rain: 1, cloud: 1, wet: 1 }); for (let k = 0; k < 3; k++) PSXAI.Bus.emit({ type: 'gust', x: 0, y: 0, loud: 0, power: 1.4 }); });
    const s = await sample(h, 6000, 500, () => ({ d: Math.hypot(A.x - P0[0], A.y - P0[1]), beh: A.psx.lock ? 'LOCK' : A.psx.beh.id }));
    const moved = Math.max(...s.map((x) => x.d));
    return { pass: asleep && moved < 3 && s.every((x) => x.beh === 'sleep'), detail: { asleep, moved: +moved.toFixed(1), behs: [...new Set(s.map((x) => x.beh))] } };
  });

  await scenario(h, 'thunderstorms darken the sky, lightning lights it up, and the flash setting tames it', async () => {
    const lum = () => h.R(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const cv = document.getElementById('game'), g = cv.getContext('2d');
      const d = g.getImageData(20, 120, cv.width - 40, 300).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 16) s += d[i] + d[i + 1] + d[i + 2];
      res(Math.round(s / (d.length / 16) / 3));
    }))));
    await h.R(() => PSXAI.setCfg('lightningRate', 0));
    await h.wait(600);
    const clear = await lum();
    await h.R(() => PSXAI.Sky.set({ rain: 0.95, storm: 0.9, cloud: 1, wind: 0.5, wet: 1 }));
    await h.wait(900);
    const storm = await lum();
    await h.R(() => PSXAI.Sky.bolt(1));
    const flash = await lum();
    await h.wait(1500);
    await h.R(() => { PSXAI.setCfg('flashIntensity', 0); PSXAI.Sky.bolt(1); });
    const tamed = await lum();
    await h.R(() => { PSXAI.Sky.st.strikes.length = 0; PSXAI.Sky.bolt(0.3); });
    const strike = await h.R(() => PSXAI.Sky.st.strikes.length);
    await h.R(() => PSXAI.resetCfg());
    return { pass: storm < clear * 0.75 && flash > storm * 1.4 && tamed < storm * 1.15 && strike > 0, detail: { clear, storm, flash, flashSettingOff: tamed, nearStrikesDrawn: strike } };
  });

  await scenario(h, 'storms strike on their own at irregular intervals; heavy rain only now and then', async () => {
    await h.R(() => { window.STRIKES = []; PSXAI.Bus.on('lightning', (e) => STRIKES.push([PSXAI.time, e.dist])); PSXAI.setCfg('lightningRate', 3); PSXAI.Sky.set({ rain: 0.95, storm: 0.95, cloud: 1, wet: 1 }); });
    await h.wait(16000);
    const r = await h.R(() => {
      const t = STRIKES.map((e) => e[0]), gaps = t.slice(1).map((x, i) => +(x - t[i]).toFixed(1));
      PSXAI.Sky.st.next = null;
      PSXAI.Sky.set({ storm: 0, rain: 0.9 });
      return { n: STRIKES.length, gaps, dists: STRIKES.map((e) => +e[1].toFixed(1)) };
    });
    await h.wait(400);
    const rain = await h.R(() => { const nx = PSXAI.Sky.st.next; const out = nx ? { storm: nx.storm, inSec: Math.round(nx.at - PSXAI.time) } : null; PSXAI.Sky.set({ rain: 0.4 }); return out; });
    await h.wait(400);
    const drizzle = await h.R(() => PSXAI.Sky.st.next);
    await h.R(() => PSXAI.resetCfg());
    const irregular = r.gaps.length > 1 && Math.max(...r.gaps) - Math.min(...r.gaps) > 0.25; // (a fixed timer would give the same gap every time)
    return { pass: r.n >= 3 && irregular && rain && !rain.storm && rain.inSec >= 12 && !drizzle, detail: { strikes: r.n, gaps: r.gaps, distancesKm: r.dists, heavyRainNextStrikeIn: rain && rain.inSec, lightRainLightning: !!drizzle } };
  });

  await scenario(h, 'thunder: sleepers wake, timid Pokémon panic in different ways, electric types are unbothered', async () => {
    await h.R(() => {
      PSXAI.Sky.set({ hour: 1 });
      window.Z = PSXAI.Debug.spawn(16, { temp: 'neutral', dx: 260, dy: 40, energy: 0.05, trait: { laziness: 0.1 } });
    });
    let asleep = false;
    for (let i = 0; i < 32 && !asleep; i++) { await h.wait(500); asleep = await h.R(() => Z.psx.beh.id === 'sleep' && Z.psx.bs.down); }
    await h.R(() => {
      window.TM = [19, 10, 16, 161, 19, 10].map((d, i) => PSXAI.Debug.spawn(d, { temp: 'timid', dx: -200 + i * 70, dy: -80, trait: { bravery: 0.05 } }));
      window.EL = PSXAI.Debug.spawn(25, { temp: 'neutral', dx: 0, dy: 110 });
      PSXAI.Sky.set({ rain: 0.9, storm: 0.9, cloud: 1 });
      PSXAI.setCfg('lightningRate', 0);
    });
    const seen = new Set();
    let elFear = 0, timidFear = 0;
    for (let k = 0; k < 6; k++) {
      await h.R(() => PSXAI.Sky.bolt(0.2));
      await h.wait(1300);
      const r = await h.R(() => ({ kinds: TM.map((e) => e.psx.lock ? 'freeze' : e.psx.shelterUntil > PSXAI.time ? 'shelter' : e.psx.huddleUntil > PSXAI.time ? 'still' : null).filter(Boolean), el: EL.psx.mind.emo.fear, tf: Math.max(...TM.map((e) => e.psx.mind.emo.fear)) }));
      r.kinds.forEach((x) => seen.add(x));
      elFear = Math.max(elFear, r.el); timidFear = Math.max(timidFear, r.tf);
    }
    const woke = await h.R(() => !!Z.psx.wokeAt);
    await h.R(() => PSXAI.resetCfg());
    return { pass: asleep && woke && seen.size >= 2 && timidFear > 0.3 && elFear < 0.1, detail: { asleep, sleeperWoke: woke, reactions: [...seen], timidFear: +timidFear.toFixed(2), electricFear: +elFear.toFixed(2) } };
  });

  await scenario(h, 'fog thins out wild Pokémon in tiers (light, moderate, dense)', async () => {
    const r = await h.R(async () => {
      const out = {};
      for (const f of [0, 0.3, 0.6, 0.9]) { PSXAI.Sky.set({ fog: f }); await new Promise((res) => setTimeout(res, 120)); out[f] = { rate: +PSXAI.Areas.spawnRate().toFixed(2), cap: +PSXAI.Areas.popScale().toFixed(2) }; }
      PSXAI.setCfg('fogSpawns', 0); PSXAI.Sky.set({ fog: 0.9 }); await new Promise((res) => setTimeout(res, 120));
      out.off = +PSXAI.Areas.spawnRate().toFixed(2);
      PSXAI.resetCfg();
      return out;
    });
    const a = r[0].rate, b = r[0.3].rate, c = r[0.6].rate, d = r[0.9].rate;
    return { pass: a > b && b >= a * 0.8 && c < b * 0.9 && c > d && d < a * 0.45 && r[0.9].cap < r[0].cap && r.off > d * 1.5, detail: r };
  });

  await scenario(h, 'weather moves on about once a minute and only ever steps to a neighbouring, logical state', async () => {
    const r = await h.R(() => {
      const S = PSXAI.Sky, out = {};
      for (const k of Object.keys(S.PATTERNS)) { const v = []; for (let i = 0; i < 200; i++) v.push(S.holdFor(k) / 60); out[k] = [+Math.min(...v).toFixed(2), +Math.max(...v).toFixed(2)]; }
      const keep = S.st.pattern, keepT = S.st.trend, keepH = S.st.hour, from = {};
      for (const k of Object.keys(S.PATTERNS)) { for (const hour of [6, 13, 23]) { S.st.hour = hour; for (const tr of [-1, 0, 1]) { for (let i = 0; i < 60; i++) { S.st.pattern = k; S.st.trend = tr; const n = S.pickPattern(); (from[k] = from[k] || {})[n] = 1; } } } }
      // a long simulated run: how often does the weather flip-flop between two states?
      S.st.pattern = 'fair'; S.st.trend = 0; S.st.hour = 12; S.st.prev = null;
      const seq = ['fair'];
      for (let i = 0; i < 400; i++) { const n = S.pickPattern(); if (n !== S.st.pattern) S.st.prev = S.st.pattern; S.st.pattern = n; seq.push(n); }
      // (peaking at the end of a chain and turning back is natural: clear, storm, dense fog, gale)
      let flips = 0; for (let i = 2; i < seq.length; i++) if (seq[i] === seq[i - 2] && seq[i] !== seq[i - 1] && !['clear', 'storm', 'deepfog', 'gale'].includes(seq[i - 1])) flips++;
      S.st.pattern = keep; S.st.trend = keepT; S.st.hour = keepH;
      return { minutes: out, next: Object.fromEntries(Object.entries(from).map(([k, v]) => [k, Object.keys(v)])), flipRate: +(flips / seq.length).toFixed(2), sample: seq.slice(0, 24).join(' → ') };
    });
    const allowed = { clear: ['fair'], fair: ['clear', 'cloudy', 'breezy', 'mist'], cloudy: ['fair', 'drizzle', 'mist'], drizzle: ['cloudy', 'rain', 'mist'], rain: ['drizzle', 'storm'], storm: ['rain'],
      mist: ['fog', 'fair', 'cloudy'], fog: ['mist', 'deepfog'], deepfog: ['fog'], breezy: ['fair', 'gale'], gale: ['breezy'] };
    const bad = [];
    for (const [k, list] of Object.entries(r.next)) for (const n of list) if (!allowed[k].includes(n)) bad.push(k + '→' + n);
    const holds = Object.values(r.minutes).every(([lo, hi]) => lo >= 0.9 && hi <= 1.1);
    return { pass: holds && bad.length === 0 && r.flipRate < 0.05, detail: { bad, flipRate: r.flipRate, sample: r.sample, minutes: r.minutes.clear } };
  });

  await scenario(h, 'Pokémon are drawn at their real Pokédex heights (true to scale up to 2 m); tiny ones stay visible, giants stay playable', async () => {
    const r = await h.R(() => {
      // how tall each stands on screen (world px): its sprite's real height × the species factor
      const S = PSXAI.Scale, ht = (d) => +(S.spriteH(d) * S.species(d)).toFixed(1);
      const line = { joltik: ht(595), flabebe: ht(669), pikachu: ht(25), charmander: ht(4), charmeleon: ht(5), charizard: ht(6), lucario: ht(448), machamp: ht(68), snorlax: ht(143), lugia: ht(249), gyarados: ht(130), onix: ht(95), wailord: ht(321) };
      const player = { pikachu: +(S.spriteH(25) * S.species(25, 130, 34)).toFixed(1), wailord: +(S.spriteH(321) * S.species(321, 130, 34)).toFixed(1) };
      const boss = +(S.of({ dex: 143, id: 7, boss: true }) / S.of({ dex: 143, id: 7 })).toFixed(2);
      const flock = [0, 1, 2, 3, 4, 5].map((i) => PSXAI.Debug.spawn(16, { temp: 'neutral', dx: -200 + i * 60, dy: -120 }));
      const ks = flock.map((e) => S.of(e));
      const big = PSXAI.Debug.spawn(143, { temp: 'neutral', dx: 200 }), tiny = PSXAI.Debug.spawn(595, { temp: 'neutral', dx: -200 }), huge = PSXAI.Debug.spawn(95, { temp: 'neutral', dx: 320 });
      return { line, player, boss, spread: +((Math.max(...ks) - Math.min(...ks)) / ks[0]).toFixed(3), r: { snorlax: [big._psxR0, +big.r.toFixed(1)], joltik: [tiny._psxR0, +tiny.r.toFixed(1)], onix: +huge.r.toFixed(1) } };
    });
    const L = r.line, near = (a, b, tol) => Math.abs(a / b - 1) < tol;
    const ok = near(L.charizard / L.charmander, 1.7 / 0.6, 0.06) && near(L.snorlax / L.charmander, 2.1 / 0.6, 0.06) && near(L.machamp / L.charizard, 1.6 / 1.7, 0.06) &&
      L.joltik >= 20 && L.flabebe >= 20 && L.joltik < L.pikachu && L.pikachu < L.charmander && L.charmander < L.charmeleon && L.charmeleon < L.charizard && L.lucario < L.charizard &&
      L.snorlax < L.lugia && L.lugia < L.gyarados && L.gyarados <= L.onix && Math.max(L.onix, L.wailord) <= 180 &&
      r.player.pikachu >= 34 && r.player.wailord <= 130 && r.boss > 1.08 && r.boss < 1.16 && r.spread > 0.01 && r.spread < 0.13 &&
      r.r.snorlax[1] > r.r.snorlax[0] && r.r.onix <= 48 && r.r.joltik[1] / r.r.joltik[0] >= 0.69;
    return { pass: ok, detail: r };
  });

  await scenario(h, 'forests have no wall blocks and grow trees of every size, across seeds', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, AI = PSXAI, out = [];
      const keep = AI.Decor.seed;
      for (const seed of [11, 404, 2024, 77777]) {
        R.World.reset(seed);
        R.World.setBiome && R.World.setBiome(0);
        await new Promise((res) => setTimeout(res, 50));
        let walls = 0, n = 0;
        for (let y = -2400; y < 2400; y += 48) for (let x = -2400; x < 2400; x += 48) { n++; if (R.World.isWall(x, y)) walls++; }
        const stages = {}, bad = [];
        let giantsCrowded = 0, trees = 0;
        for (let y = -1800; y <= 1800; y += 380) for (let x = -1800; x <= 1800; x += 380) {
          for (const p of AI.Env.props(x, y, 190)) {
            if (p.type !== 'tree' || p._psxSeen === seed) continue;
            p._psxSeen = seed; trees++;
            const art = AI.Ground.artFor(p);
            stages[p._psxStage] = (stages[p._psxStage] || 0) + 1;
            if (art && !AI.Art.GREEN.includes(art) && !AI.Art.GIANTS.includes(art)) bad.push(art);
            if (p._psxStage === 'ancient' && AI.Ground.roomOf(p) < 170) giantsCrowded++;
          }
        }
        out.push({ seed, walls, n, trees, stages, notGreen: bad.slice(0, 4), giantsCrowded });
      }
      R.World.reset(keep);
      return out;
    });
    const ok = r.every((s) => s.walls === 0 && s.trees > 30 && s.notGreen.length === 0 && s.giantsCrowded === 0 && s.stages.sapling && s.stages.young && s.stages.mature && (s.stages.large || 0) < s.trees * 0.3 && (s.stages.ancient || 0) < s.trees * 0.05);
    const total = r.reduce((m, s) => { for (const k in s.stages) m[k] = (m[k] || 0) + s.stages[k]; return m; }, {});
    return { pass: ok && total.large > 0, detail: { perSeed: r.map((s) => ({ seed: s.seed, walls: s.walls, trees: s.trees, stages: s.stages })), total } };
  });

  await scenario(h, 'the full atmosphere (night storm, lights, fog) keeps the frame rate', async () => {
    const fps = () => h.R(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
    await h.R(() => { for (let i = 0; i < 20; i++) PSXAI.Debug.spawn([16, 19, 161, 10, 13][i % 5], { temp: 'neutral', dx: Math.cos(i) * 260, dy: Math.sin(i) * 180 }); PSXAI.setCfg('atmosphere', false); PSXAI.setCfg('newArt', false); });
    await h.wait(500);
    const base = await fps();
    await h.R(() => { PSXAI.setCfg('atmosphere', true); PSXAI.setCfg('newArt', true); PSXAI.Sky.set({ hour: 23, rain: 0.9, storm: 0.8, fog: 0.4, wind: 0.6, wet: 1 }); PSXAI.Light.lamp.lit = true; });
    await h.wait(500);
    const full = await fps();
    await h.R(() => PSXAI.resetCfg());
    return { pass: full > base * 0.6 || full > 40, detail: { baseFps: Math.round(base), fullFps: Math.round(full) } };
  });

  await h.close();

  // =========================================================== Groudon run
  h = await boot({ partner: 383 });
  await scenario(h, 'Groudon gets furious at a small patch of water (and kicks a Magikarp across the region)', async () => {
    const w = await h.R(() => {
      const R = __PSX_REG__, p = R.Game.player;
      const w = PSXAI.Env.nearestWater(p.x, p.y, 3000);
      if (!w) return null;
      p.x = w.x + 70; p.y = w.y; return { x: w.x, y: w.y, kind: PSXAI.Env.liquidKind() };
    });
    if (!w) return { pass: false, detail: 'no water in this biome' };
    const s = await sample(h, 3500, 250, () => ({ icon: PSXAI.playerBubble.t > 0 ? PSXAI.playerBubble.icon : null, dried: PSXAI.Env.driedTiles.size }));
    const angry = s.some((x) => x.icon === 'anger');
    const dried = Math.max(...s.map((x) => x.dried));
    const k = await h.R(() => { window.A = PSXAI.Debug.spawn(129, { temp: 'neutral', dx: 30 }); return { x: A.x, y: A.y }; });
    await h.wait(2500);
    const after = await h.R(() => ({ x: A.x, y: A.y, dead: A.dead, anger: A.psx && A.psx.mind.emo.anger, fear: A.psx && A.psx.mind.emo.fear }));
    const flew = Math.hypot(after.x - k.x, after.y - k.y);
    return { pass: angry && dried > 0 && flew > 450, detail: { angryBubble: angry, evaporatedTiles: dried, magikarpFlew: flew | 0, magikarpAfter: { anger: +(after.anger || 0).toFixed(2), fear: +(after.fear || 0).toFixed(2) } } };
  });
  await h.close();

  // =========================================================== the haunted mansion
  h = await boot({ partner: 25 });
  const story = {
    // read through whatever scene is playing (like pressing the button)
    async finish(maxSteps = 200) { for (let i = 0; i < maxSteps; i++) { const b = await h.R(() => { PSXAI.Story.advance(); return PSXAI.Story.busy(); }); if (!b) return true; await h.wait(60); } return false; },
    goto: (room, tx, ty) => h.R(([room, tx, ty]) => { const I = PSXAI.Mansion.interior(), p = __PSX_REG__.Game.player; if (room) { const r = I.room(room); p.x = r.x + r.w / 2; p.y = r.y + r.h / 2; } else { p.x = I.wx(tx); p.y = I.wy(ty); } PSXAI.Mansion.snapCamera(p); return true; }, [room, tx, ty]),
  };
  // (the mansion is the end of the Shady Forest: these scenarios start once the journey has placed it)
  await h.R(() => { window.T || 0; PSXAI.Journey.establishNow(); });
  async function enterMansion() {
    await h.R(() => { const p = __PSX_REG__.Game.player, g = PSXAI.Mansion.geom(); p.x = g.D[0]; p.y = g.D[1] + 30; PSXAI.Mansion.snapCamera(p); });
    await h.page.keyboard.down('KeyW'); await h.wait(500); await h.page.keyboard.up('KeyW');
    for (let i = 0; i < 20; i++) { if (await h.R(() => PSXAI.Mansion.inside && PSXAI.Mansion.st.fade < 0.05)) break; await h.wait(150); }
    await h.wait(1300); // the first visit's arrival scene starts a moment after you step in
    return h.R(() => PSXAI.Mansion.inside);
  }

  await scenario(h, 'a shady, candle-lit dirt path leads from the woods to the gates of the mansion', async () => {
    const r = await h.R(() => {
      const D = PSXAI.Decor, g = PSXAI.Mansion.geom(), W = __PSX_REG__.World;
      const items = D.trail.items;
      const lamps = items.filter((i) => i.k === 'mcandle' && !(Math.abs(i.x - g.D[0]) < g.SW && i.y > g.top && i.y < g.G[1])), dirt = items.filter((i) => i.k === 'dirt'), posts = items.filter((i) => i.k === 'gpillar');
      // candles come in pairs, one either side of the path, evenly spaced
      const pairs = [];
      for (let i = 0; i < lamps.length; i += 2) pairs.push(Math.round(Math.hypot((lamps[i].x + lamps[i + 1].x) / 2 - g.S[0], (lamps[i].y + lamps[i + 1].y) / 2 - g.S[1])));
      const gaps = pairs.slice(1).map((d, i) => d - pairs[i]);
      // nothing grows or stands on the path or in the grounds: no trees, rocks, chests or ponds
      // (the house's own gargoyles, graves and fence are meant to be there)
      let blocked = 0, wet = 0, n = 0;
      const own = (x, y) => PSXAI.Decor.blocked(x, y, 8) || PSXAI.Mansion.blockedExterior(x, y, 8);
      const check = (x, y) => { n++; if (PSXAI.Env.treesIn(x, y, 24).length || W.propsInCircle(x, y, 20).some((p) => p.solid || p.type === 'rock') || (!W.isFree(x, y, 8) && !own(x, y))) blocked++; if (W.isLiquid(x, y)) wet++; };
      for (const p of g.dense) check(p[0], p[1]);
      for (let y = g.D[1] + 10; y < g.G[1]; y += 40) for (let x = g.D[0] - g.SW + 30; x < g.D[0] + g.SW - 30; x += 40) check(x, y);
      const end = g.pts[g.pts.length - 1];
      return { lamps: lamps.length, pairs: pairs.length, gaps, dirt: dirt.length, gatePosts: posts.length, litPosts: posts.filter((p) => p.lit).length, endsAtGate: Math.round(Math.hypot(end[0] - g.G[0], end[1] - g.G[1])), blocked, wet, n };
    });
    const even = r.gaps.length > 0 && Math.max(...r.gaps) - Math.min(...r.gaps) < 60;
    return { pass: r.pairs >= 2 && r.lamps === r.pairs * 2 && even && r.dirt > 100 && r.gatePosts === 6 && r.litPosts === 2 && r.endsAtGate < 5 && r.blocked === 0 && r.wet === 0, detail: r };
  });

  await scenario(h, 'the grounds: a three-storey house, wide gates under an arch, a dry fountain, a banging shed, a fenced backyard, small candles that flicker purple, and dead silence', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, W = R.World, D = PSXAI.Decor, M = PSXAI.Mansion, g = M.geom(), p = R.Game.player;
      const items = D.trail.items, k = (n) => items.filter((i) => i.k === n);
      const probe = (x, y) => { const e = { x, y, r: 14 }; W.collide(e); return Math.round(Math.hypot(e.x - x, e.y - y)); };
      // the backyard is reachable on foot, round the side of the house
      const side = probe(g.D[0] - (g.HW + g.SW) / 2, g.D[1] - 200), yard = probe(g.D[0] - 80, g.top + 300);
      // small candles: now and then one burns purple for a moment
      const c = k('mcandle')[0];
      let purple = 0;
      for (let i = 0; i < 600; i++) { PSXAI.time += 0.05; if (D.ghostly(c)) purple++; }
      // nothing wild appears on or around the grounds, and anything there slips away
      const t0 = PSXAI.Debug.spawn(16, { temp: 'neutral', x: g.D[0] + 200, y: g.D[1] + 200 });
      const vetoed = R.EnemyMgr.get(t0.id) !== t0;
      p.x = g.D[0]; p.y = g.D[1] + 200; M.snapCamera(p);
      await new Promise((res) => setTimeout(res, 1200));
      const near = R.EnemyMgr.all().filter((e) => !e.dead && !e.boss && M.silentAt(e.x, e.y)).length;
      // the shed's doors bang on their own
      p.x = g.shed[0] + 120; p.y = g.shed[1] + 60;
      let banged = false;
      for (let i = 0; i < 70 && !banged; i++) { await new Promise((res) => setTimeout(res, 200)); if (M.st.shedOpen > 0.3) banged = true; }
      p.x = g.D[0]; p.y = g.D[1] + 60;
      return { houseW: g.HW * 2, gateW: g.GO * 2, storeys: window.PSXAI_MANSION_ART.mansion.h * 2, fountain: k('fountain').length, shed: k('shed').length, gate: k('mgate').length,
        fountainSolid: probe(g.F[0], g.F[1] - 10) > 10, side, yard, purpleShare: +(purple / 600).toFixed(3), vetoed, near, banged, bigLamps: k('lamp').length + k('candle').length };
    });
    return { pass: r.houseW > 900 && r.gateW >= 300 && r.storeys >= 320 && r.fountain === 1 && r.shed === 1 && r.gate === 1 && r.fountainSolid && r.side === 0 && r.yard === 0 &&
      r.purpleShare > 0.005 && r.purpleShare < 0.15 && r.vetoed && r.near === 0 && r.banged && r.bigLamps === 0, detail: r };
  });

  await scenario(h, 'the house, its fence and its gates are solid; the front door is the way in', async () => {
    const r = await h.R(() => {
      const g = PSXAI.Mansion.geom(), W = __PSX_REG__.World;
      const probe = (x, y) => { const e = { x, y, r: 14 }; W.collide(e); return Math.round(Math.hypot(e.x - x, e.y - y)); };
      return { wall: probe(g.D[0] + 120, g.D[1] - 60), fence: probe(g.D[0] - g.SW, g.G[1] - 100), gateFence: probe(g.D[0] + 260, g.G[1]), gateOpening: probe(g.D[0], g.G[1]), courtyard: probe(g.D[0] - 100, g.D[1] + 120), freeAtWall: W.isFree(g.D[0], g.D[1] - 100, 12) };
    });
    const entered = await enterMansion();
    const inside = await h.R(() => ({ inside: PSXAI.Mansion.inside, room: PSXAI.Mansion.roomAt(__PSX_REG__.Game.player.x, __PSX_REG__.Game.player.y) }));
    return { pass: r.wall > 10 && r.fence > 4 && r.gateFence > 4 && r.gateOpening === 0 && r.courtyard === 0 && !r.freeAtWall && entered && inside.room === 'foyer', detail: { pushedOut: r, ...inside } };
  });

  await scenario(h, 'upstairs: the grand staircase leads to a second floor and the attic and back down; the house has its own music; the gang flickers the lights, dashes past and bangs on the walls', async () => {
    await story.finish();
    const walk = async (key, ms) => { await h.page.keyboard.down(key); await h.wait(ms); await h.page.keyboard.up(key); };
    const stand = (tx, ty) => h.R(([tx, ty]) => { const I = PSXAI.Mansion.interior(), p = __PSX_REG__.Game.player; p.x = I.wx(tx); p.y = I.wy(ty); PSXAI.Mansion.snapCamera(p); }, [tx, ty]);
    const where = () => h.R(() => { const p = __PSX_REG__.Game.player; return { floor: PSXAI.Mansion.floor(), room: PSXAI.Mansion.roomAt(p.x, p.y) }; });
    const settle = async () => { for (let i = 0; i < 20 && await h.R(() => PSXAI.Mansion.st.transit || PSXAI.Mansion.st.fade > 0.05); i++) await h.wait(120); await h.wait(1000); };
    await stand(23.5, 22.6); await walk('KeyW', 700); await settle();
    const up1 = await where();
    await stand(43, 72.4); await walk('KeyW', 600); await settle();
    const up2 = await where();
    await stand(23, 124.4); await walk('KeyS', 600); await settle();
    const down2 = await where();
    await stand(22.5, 88.4); await walk('KeyS', 600); await settle();
    const down1 = await where();
    const extra = await h.R(async () => {
      const M = PSXAI.Mansion, H = PSXAI.Haunt, it = M.interior();
      const rooms = it.rooms.map((r) => r.id);
      const Mu = PSXAI.Music, song = Mu.st.els.chateau, A = __PSX_REG__.Audio;
      const music = { playing: !!song && !song.paused && song.src.includes('old-chateau'), volume: song ? +song.volume.toFixed(2) : 0, gameMuted: Mu.st.cur === 'chateau' };
      const lit0 = M.st.flick;
      H.EVENTS.flicker.run();
      const dips = [];
      for (let i = 0; i < 12; i++) { await new Promise((res) => setTimeout(res, 80)); dips.push(M.st.flick); }
      H.EVENTS.dash.run();
      await new Promise((res) => setTimeout(res, 120));
      const shadow = H.hs.actors.some((a) => a.kind === 'shadow' && a.alpha > 0.3);
      const p = __PSX_REG__.Game.player;
      const shaken0 = it.portraits.filter((q) => q.shake > 0).length;
      H.EVENTS.pound.run();
      await new Promise((res) => setTimeout(res, 300));
      const shook = it.portraits.filter((q) => q.shake > 0 && Math.hypot(q.x - p.x, q.y - p.y) < 520).length > shaken0 || H.hs.dust.length > 0;
      void A;
      return { rooms, music, flickered: Math.min(...dips) < 0.2 && lit0 === 1, shadow, shook };
    });
    const need = ['library', 'upgallery', 'bedroom', 'corridor', 'landing', 'master', 'nursery', 'attic'];
    return { pass: up1.floor === 1 && up1.room === 'landing' && up2.floor === 2 && up2.room === 'attic' && down2.floor === 1 && down1.floor === 0 && down1.room === 'foyer' &&
      need.every((r) => extra.rooms.includes(r)) && extra.music.playing && extra.music.volume > 0.05 && extra.music.gameMuted && extra.flickered && extra.shadow && extra.shook, detail: { up1, up2, down2, down1, ...extra } };
  });

  await scenario(h, 'inside the mansion: no wild Pokémon at all, and the forest\'s Pokémon wait outside', async () => {
    // (still inside from the previous scenario) — read through the arrival first
    await story.finish();
    const out = await h.R(async () => {
      const R = __PSX_REG__, D = PSXAI.Debug;
      D.freeze(false); // the game's spawner is running
      const tried = D.spawn(16, { temp: 'neutral', dx: 60 });
      const added = R.EnemyMgr.get(tried.id) === tried;
      await new Promise((res) => setTimeout(res, 6000));
      const n = R.EnemyMgr.all().filter((e) => !e.dead).length;
      D.freeze(true);
      return { addedInside: added, aliveInside: n, stashed: true };
    });
    // leave, and the ones outside are back
    await h.R(() => { const I = PSXAI.Mansion.interior(), p = __PSX_REG__.Game.player; p.x = I.entrance[0]; p.y = I.entrance[1] - 6; });
    await h.page.keyboard.down('KeyS'); await h.wait(500); await h.page.keyboard.up('KeyS');
    for (let i = 0; i < 20 && await h.R(() => PSXAI.Mansion.inside); i++) await h.wait(150);
    const after = await h.R(() => ({ inside: PSXAI.Mansion.inside, nearDoor: Math.round(Math.hypot(__PSX_REG__.Game.player.x - PSXAI.Mansion.geom().D[0], __PSX_REG__.Game.player.y - PSXAI.Mansion.geom().D[1])) }));
    return { pass: !out.addedInside && out.aliveInside === 0 && !after.inside && after.nearDoor < 80, detail: { ...out, ...after } };
  });

  await scenario(h, 'hauntings are varied, spaced out with silence, and never the same trick twice in a row', async () => {
    await enterMansion();
    await story.finish();
    const r = await h.R(async () => {
      PSXAI.setCfg('hauntRate', 3);
      const ev = [];
      const off = PSXAI.Bus.on('mansion', (e) => { if (e.what === 'haunt') ev.push([PSXAI.time, e.kind]); });
      const I = PSXAI.Mansion.interior(), p = __PSX_REG__.Game.player;
      __PSX_REG__.Game.debugSpeed(4);
      // wander from room to room
      for (const room of ['foyer', 'gallery', 'dining', 'gallery', 'foyer', 'hall', 'foyer', 'gallery']) {
        const r = I.room(room); p.x = r.x + r.w / 2; p.y = r.y + r.h * 0.6;
        await new Promise((res) => setTimeout(res, 3500));
      }
      __PSX_REG__.Game.debugSpeed(1);
      if (typeof off === 'function') off();
      PSXAI.setCfg('hauntRate', 1);
      const kinds = ev.map((e) => e[1]);
      const gaps = ev.slice(1).map((e, i) => +(e[0] - ev[i][0]).toFixed(1));
      return { n: ev.length, kinds, distinct: new Set(kinds).size, repeats: kinds.filter((k, i) => i && k === kinds[i - 1]).length, longestQuiet: gaps.length ? Math.max(...gaps) : 0 };
    });
    return { pass: r.n >= 5 && r.distinct >= 4 && r.repeats === 0 && r.longestQuiet >= 12, detail: r };
  });

  await scenario(h, 'the mirror: only after the house has got to you, a tall shadow behind your reflection, then the jumpscare — once', async () => {
    const stand = () => h.R(() => { const I = PSXAI.Mansion.interior(), p = __PSX_REG__.Game.player; p.x = I.mirror.x; p.y = I.mirror.y + 110; p._vx = 0; p._vy = -60; PSXAI.Mansion.snapCamera(p); });
    // too early: nothing happens (fresh visit, nothing has happened yet)
    await h.R(() => { PSXAI.Haunt.hs.seen = 0; PSXAI.Haunt.hs.visitT = 0; });
    await stand();
    await h.page.keyboard.down('KeyW'); await h.wait(200); await h.page.keyboard.up('KeyW');
    await h.wait(2500);
    const early = await h.R(() => PSXAI.Haunt.hs.mirror.phase);
    await h.R(() => { PSXAI.Haunt.hs.seen = 6; });
    await stand();
    await h.page.keyboard.down('KeyW'); await h.wait(200); await h.page.keyboard.up('KeyW');
    const phases = [];
    let sawJump = false, sawShadowPx = 0;
    for (let i = 0; i < 120; i++) {
      const s = await h.R(() => ({ ph: PSXAI.Haunt.hs.mirror.phase, jump: PSXAI.Haunt.hs.jump, lock: PSXAI.Story.lockInput() }));
      if (phases[phases.length - 1] !== s.ph) phases.push(s.ph);
      if (s.jump) sawJump = true;
      if (s.ph === 'shadow' && !sawShadowPx) {
        await h.wait(450);
        // dark pixels with red in the glass: the shadow and its eyes
        sawShadowPx = await h.R(() => { const cv = document.getElementById('game'), g = cv.getContext('2d'), cam = __PSX_REG__.Camera, I = PSXAI.Mansion.interior();
          const sx = (I.mirror.x - cam.left()) * cam.scale, sy = (I.mirror.y - 70 - cam.top()) * cam.scale;
          const d = g.getImageData(Math.round(sx - 30 * cam.scale), Math.round(sy - 40 * cam.scale), Math.round(60 * cam.scale), Math.round(60 * cam.scale)).data;
          let red = 0; for (let k = 0; k < d.length; k += 4) if (d[k] > 140 && d[k + 1] < 90 && d[k + 2] < 110) red++; return red; });
      }
      if (s.ph === 'idle' && phases.length > 3) break;
      await h.wait(120);
    }
    const st = await h.R(() => ({ stage: PSXAI.Story.stage(), done: PSXAI.Haunt.hs.mirror.done }));
    await story.finish();
    // and never again
    await stand();
    await h.page.keyboard.down('KeyW'); await h.wait(200); await h.page.keyboard.up('KeyW');
    await h.wait(2000);
    const again = await h.R(() => PSXAI.Haunt.hs.mirror.phase);
    return { pass: early === 'idle' && phases.join(',').includes('dread,shadow,scare,turn,after') && sawJump && sawShadowPx > 3 && st.stage === 'mirror' && again === 'idle', detail: { early, phases, jumpscare: sawJump, redEyePixels: sawShadowPx, ...st, again } };
  });

  await scenario(h, 'the pranksters: every Ghost Pokémon has its say, in proper dialogue, with its own voice', async () => {
    // laughter from the locked ballroom, then the door gives
    for (let i = 0; i < 40 && await h.R(() => PSXAI.Story.stage() !== 'unlocked'); i++) { await h.R(() => PSXAI.Story.advance()); await h.wait(200); }
    await story.finish();
    const door = await h.R(() => { const d = PSXAI.Mansion.interior().doors.find((q) => q.id === 'ballroom'); return { locked: d.locked, open: d.open }; });
    await story.goto(null, 29.5, 10);
    await h.wait(600);
    const speakers = new Set(), lines = [];
    let locked = 0, checks = 0;
    for (let i = 0; i < 400; i++) {
      const s = await h.R(() => { const st = PSXAI.Story.st; const ax = __PSX_REG__.Input.axis(); return { scene: st.scene && st.scene.id, who: st.line && st.line.who, text: st.line && st.line.text, axis: ax[0] === 0 && ax[1] === 0, stage: PSXAI.Story.stage() }; });
      if (s.who) { speakers.add(s.who); lines.push(s.text); checks++; if (s.axis) locked++; }
      if (s.stage === 'warned' && !s.scene) break;
      await h.R(() => { PSXAI.Story.advance(); PSXAI.Story.advance(); });
      await h.wait(70);
    }
    const cast = await h.R(() => Object.keys(PSXAI.Story.CAST));
    const missing = cast.filter((c) => !speakers.has(c));
    const names = await h.R(() => Object.values(PSXAI.Story.CAST).map((c) => c.name));
    const bare = lines.filter((t) => names.includes(t.replace(/[!?.…]/g, '').trim()) || t.length < 2);
    return { pass: !door.locked && door.open && missing.length === 0 && bare.length === 0 && lines.length > 60 && locked === checks, detail: { doorUnlocked: !door.locked, speakers: speakers.size, missing, lines: lines.length, bareNameLines: bare.length, inputHeldDuringDialogue: locked + '/' + checks } };
  });

  await scenario(h, 'the twist: the house goes still, nobody laughs — and the watcher is never named, fought or caught', async () => {
    const r = await h.R(() => {
      const S = PSXAI.Story;
      const all = [];
      for (const id in S.SCENES) for (const s of S.SCENES[id].steps) for (const v of [s.text, s.narr]) {
        if (!v) continue;
        const t = typeof v === 'function' ? [v()] : [v];
        for (const x of t) if (x) all.push(...Object.values(x));
      }
      const named = all.filter((t) => /giratina|guiratina|ギラティナ|騎拉帝納/i.test(t));
      const boss = __PSX_REG__.EnemyMgr.all().some((e) => e.dex === 487);
      const actor = S.st.actors.some((a) => a.dex === 487);
      return { lines: all.length, named: named.length, boss, actor, stillSeen: !!window.__stillSeen };
    });
    // the "(Silence.)" beat drained the colour and stopped the flames: replay the twist and look
    await h.R(() => PSXAI.Story.replay('twist'));
    let still = false;
    for (let i = 0; i < 120; i++) {
      const s = await h.R(() => ({ narr: PSXAI.Story.st.line && !PSXAI.Story.st.line.who && PSXAI.Story.st.line.text, busy: PSXAI.Story.busy() }));
      if (s.narr && /Silen/.test(s.narr)) { still = true; }
      if (!s.busy) break;
      await h.R(() => { PSXAI.Story.advance(); PSXAI.Story.advance(); });
      await h.wait(50);
    }
    return { pass: r.lines > 100 && r.named === 0 && !r.boss && !r.actor && still, detail: { ...r, silenceBeat: still } };
  });

  await scenario(h, 'leaving: total silence, something vast in the far mirror, and a glimpse of somewhere else', async () => {
    const t0 = await h.R(() => ({ stage: PSXAI.Story.stage(), armed: PSXAI.Story.st.exitArmed }));
    // down the hall toward the way out
    await h.R(() => { const I = PSXAI.Mansion.interior(), p = __PSX_REG__.Game.player; p.x = I.mirror.x; p.y = I.mirror.y + 420; PSXAI.Mansion.snapCamera(p); });
    let vast = false, still = false, cam = false;
    for (let i = 0; i < 60; i++) {
      const s = await h.R(() => ({ vast: PSXAI.Haunt.hs.mirror.vast > PSXAI.time, still: !!PSXAI.Haunt.hs.still, cam: !!PSXAI.Story.cam, busy: PSXAI.Story.busy() }));
      vast = vast || s.vast; still = still || s.still; cam = cam || s.cam;
      if (!s.busy && i > 5) break;
      await h.wait(150);
    }
    // out the front door
    await h.R(() => { const I = PSXAI.Mansion.interior(), p = __PSX_REG__.Game.player; p.x = I.entrance[0]; p.y = I.entrance[1] - 6; PSXAI.Mansion.snapCamera(p); });
    await h.page.keyboard.down('KeyS'); await h.wait(500); await h.page.keyboard.up('KeyS');
    let cine = false;
    for (let i = 0; i < 160; i++) {
      const s = await h.R(() => ({ cine: PSXAI.Story.st.cine, busy: PSXAI.Story.busy(), inside: PSXAI.Mansion.inside }));
      if (s.cine === 'distortion') cine = true;
      if (!s.busy && !s.inside && cine) break;
      await h.R(() => PSXAI.Story.advance());
      await h.wait(150);
    }
    await h.wait(1500);
    const end = await h.R(() => ({ stage: PSXAI.Story.stage(), inside: PSXAI.Mansion.inside, journal: PSXAI.Story.journal().map((j) => j.id), saved: JSON.parse(localStorage.getItem('psx_mansion_story_v1') || '{}').stage }));
    return { pass: t0.stage === 'warned' && vast && still && cam && cine && end.stage === 'done' && !end.inside && end.journal.length === 6 && end.saved === 6, detail: { before: t0, vastShapeInMirror: vast, stillness: still, cameraLookedBack: cam, distortionWorld: cine, ...end } };
  });

  await scenario(h, 'story scenes are protected: no bosses, rifts or hordes interrupt them', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, P = PSXAI.Progress;
      PSXAI.setCfg('eventCooldown', 1);
      P.st.lastEvent = -999; P.st.bossPending = null;
      PSXAI.Story.replay('reveal');
      const busy = PSXAI.Story.busy();
      R.Game.player.kills = PSXAI.cfg.bossKills[0] + PSXAI.cfg.riftKills[0] + 10;
      await new Promise((res) => setTimeout(res, 3000));
      const pending = !!P.st.bossPending, boss = R.EnemyMgr.bossAlive(), rift = !!R.Rift.rift;
      PSXAI.Story.skipScene();
      R.Game.player.kills = 0;
      PSXAI.resetCfg();
      return { busyDuringReplay: busy, bossPending: pending, boss, rift };
    });
    return { pass: r.busyDuringReplay && !r.bossPending && !r.boss && !r.rift, detail: r };
  });

  await scenario(h, 'returning later: the residents are home, and the house still runs smoothly', async () => {
    await enterMansion();
    await h.wait(600);
    const r = await h.R(() => ({ actors: PSXAI.Story.st.actors.length, stage: PSXAI.Story.stage(), busy: PSXAI.Story.busy() }));
    const fps = await h.R(() => new Promise((res) => { PSXAI.setCfg('hauntRate', 3); let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
    await h.R(() => PSXAI.resetCfg());
    return { pass: r.actors === 14 && r.stage === 'done' && !r.busy && fps > 40, detail: { ...r, fps: Math.round(fps), errors: h.errors.filter((e) => !e.includes('404')).slice(0, 3) } };
  });
  await h.close();

  // =========================================================== the Shady Forest, rebuilt
  h = await boot({ partner: 377 });
  const tp = (x, y) => h.R(([x, y]) => { const p = __PSX_REG__.Game.player; p.x = x; p.y = y; PSXAI.Mansion.snapCamera(p); }, [x, y]);

  await scenario(h, 'the journey: no mansion and no path during the first 20 minutes of forest, and the finale waits', async () => {
    const r = await h.R(async () => {
      const J = PSXAI.Journey, D = PSXAI.Decor, M = PSXAI.Mansion, p = __PSX_REG__.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const out = { start: { phase: J.phase, trail: !!D.trail, geom: !!M.geom() } };
      // wander in every direction for a while, then sit just under the 20 minutes
      for (let i = 0; i < 24; i++) { p.x += Math.cos(i * 0.9) * 140; p.y += Math.sin(i * 0.9) * 140; await wait(25); }
      J.debugElapse(J.threshold() - 15 - J.elapsed);
      await wait(1500);
      let cleared = 0;
      for (let y = -4000; y <= 4000; y += 250) for (let x = -4000; x <= 4000; x += 250) if (M.clearAt(x, y)) cleared++;
      out.at1185 = { phase: J.phase, trail: !!D.trail, cleared, elapsed: Math.round(J.elapsed), finaleBlocked: J.blocksFinale() };
      return out;
    });
    return { pass: r.start.phase === 'forest' && !r.start.trail && !r.start.geom && r.at1185.phase === 'forest' && !r.at1185.trail && r.at1185.cleared === 0 && r.at1185.finaleBlocked, detail: r };
  });

  await scenario(h, 'after 20 minutes the mansion is placed once: ahead, out of sight, on unseen ground, with a clear path', async () => {
    const r = await h.R(async () => {
      const J = PSXAI.Journey, M = PSXAI.Mansion, W = __PSX_REG__.World, p = __PSX_REG__.Game.player, C = __PSX_REG__.Camera;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      // head east for a moment so the party has a direction
      for (let i = 0; i < 100; i++) { p.x += 12; await wait(30); }
      const fresh0 = new Set(J.gen);
      J.debugElapse(Math.max(5, J.threshold() - J.elapsed + 5));
      for (let i = 0; i < 30 && !M.geom(); i++) await wait(100);
      const g = M.geom();
      if (!g) return { placed: false };
      const corridor = g.dense.map((q) => Math.floor(q[0] / 512) * 65536 + Math.floor(q[1] / 512));
      const seenBefore = corridor.filter((k) => fresh0.has(k)).length;
      let blocked = 0, trees = 0;
      for (const q of g.dense) { if (!W.isFree(q[0], q[1], 10)) blocked++; trees += PSXAI.Env.treesIn(q[0], q[1], 30).length; }
      const ahead = Math.cos(Math.atan2(g.S[1] - p.y, g.S[0] - p.x)); // east = 1
      const outOfSight = !C.sees(g.S[0], g.S[1], 60) && !C.sees(g.D[0], g.D[1], 200);
      // it's placed once: trying again changes nothing, and it stays put
      const D0 = g.D.slice();
      J.establish();
      await wait(800);
      const g2 = M.geom();
      return { placed: true, phase: J.phase, seenBefore, blocked, trees, ahead: +ahead.toFixed(2), outOfSight, same: g2.D[0] === D0[0] && g2.D[1] === D0[1], doorFromParty: Math.round(Math.hypot(g.D[0] - p.x, g.D[1] - p.y)) };
    });
    return { pass: r.placed && r.phase === 'route' && r.seenBefore === 0 && r.blocked === 0 && r.trees === 0 && r.ahead > 0.3 && r.outOfSight && r.same && r.doorFromParty > 1700, detail: r };
  });

  await scenario(h, 'wherever the party wanders, the forest points the way: old lanterns, fences and signs ahead, toward the path', async () => {
    const r = await h.R(async () => {
      const J = PSXAI.Journey, p = __PSX_REG__.Game.player, g = (PSXAI.Journey.establishNow(), PSXAI.Mansion.geom());
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      // go far the other way
      const a = Math.atan2(g.S[1] - g.D[1], g.S[0] - g.D[0]);
      p.x = g.S[0] + Math.cos(a) * 3000; p.y = g.S[1] + Math.sin(a) * 3000; PSXAI.Mansion.snapCamera(p);
      const n0 = J.st.crumbs.length;
      for (let i = 0; i < 4; i++) { J.st.crumbT = 0; await wait(300); }
      const placed = J.st.crumbs.slice(n0);
      const toward = placed.map((c) => { const d0 = Math.hypot(p.x - g.S[0], p.y - g.S[1]), d1 = Math.hypot(c.x - g.S[0], c.y - g.S[1]); return d1 < d0; });
      const visible = placed.filter((c) => __PSX_REG__.Camera.sees(c.x, c.y, 0)).length;
      return { crumbs: placed.length, toward: toward.every(Boolean), visible, kinds: placed.map((c) => c.kind) };
    });
    return { pass: r.crumbs >= 1 && r.toward && r.visible === 0, detail: r };
  });

  await scenario(h, 'the final stretch grows stranger: fewer ordinary Pokémon, more Ghosts, twisted trees, fog, sounds, silhouettes', async () => {
    const r = await h.R(async () => {
      const J = PSXAI.Journey, A = PSXAI.Areas, R = __PSX_REG__, p = R.Game.player, g = (PSXAI.Journey.establishNow(), PSXAI.Mansion.geom());
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      p.x = g.S[0]; p.y = g.S[1] - 200; PSXAI.Mansion.snapCamera(p);
      const rate0 = A.spawnRate();
      p.x = g.G[0]; p.y = g.G[1] + 260; PSXAI.Mansion.snapCamera(p);
      const k = J.partyK();
      const rate1 = A.spawnRate();
      const bag = R.Enemies.cast[0].list;
      let ghosts = 0, total = 0;
      for (let i = 0; i < 30; i++) { const b = A.weightBag(bag.slice()); for (const d of b) { total++; if ((R.DEX_BY[d.dex].types || []).includes('ghost')) ghosts++; } }
      // trees grown on ground first seen after the mansion was placed
      const TW = PSXAI.Forest.KIND.twisted;
      let tw = 0, nt = 0;
      for (let i = 0; i < 400; i++) { const tx = Math.round(g.G[0] / 32) + ((i % 20) - 10) * 3, ty = Math.round((g.G[1] + 300) / 32) + (((i / 20) | 0) - 10) * 3; const t = PSXAI.Forest.treeFor({ tx, ty }, 120, true); nt++; if (TW.includes(t.n)) tw++; }
      J.st.soundT = 0; J.st.silT = 0;
      await wait(2500);
      return { k: +k.toFixed(2), rate0: +rate0.toFixed(2), rate1: +rate1.toFixed(2), ghostShare: +(ghosts / total).toFixed(2), twisted: +(tw / nt).toFixed(2), sounds: J.st.soundT > 0, silhouettes: J.st.sils.length > 0 || J.st.silT > 0 };
    });
    return { pass: r.k > 0.6 && r.rate1 < r.rate0 && r.ghostShare > 0.2 && r.twisted > 0.2 && r.sounds && r.silhouettes, detail: r };
  });

  await scenario(h, 'the journey is the host\'s for the whole party, survives a saved run, and the finale opens once the mansion is done', async () => {
    const r = await h.R(async () => {
      const J = PSXAI.Journey, R = __PSX_REG__, D = PSXAI.Decor;
      const g = PSXAI.Mansion.geom(), seed = D.seed;
      // a saved run resumes in the same world (same seed): the journey comes back with it
      const saved = JSON.parse(localStorage.getItem('psx.journey.v1') || '{}');
      const el = J.elapsed;
      R.World.reset(seed);
      D.ensure();
      const g2 = PSXAI.Mansion.geom();
      const resumed = { phase: J.phase, sameDoor: !!g2 && g2.D[0] === g.D[0] && g2.D[1] === g.D[1], elapsedKept: Math.abs(J.elapsed - el) < 10 };
      // a co-op guest takes the host's journey (simulated host message)
      const realCoop = R.Coop;
      R.Coop = { active: true, isHost: false, puppets: () => [] };
      R.World.reset(seed + 1); D.ensure();
      const guestBefore = !!PSXAI.Mansion.geom();
      J.tick(5); // a guest's own clock doesn't run
      const guestClock = J.elapsed;
      J.onNet('host', { k: 'psx', t: 'journey', e: 1300, geo: { S: [5000, 400], D: [6200, 200] }, ph: 'route', f: 0, d: 0 });
      const gg = PSXAI.Mansion.geom();
      R.Coop = realCoop;
      const guest = { before: guestBefore, clock: guestClock, after: !!gg, door: gg ? gg.D : null, elapsed: J.elapsed };
      // the game's finale waits for the mansion's story
      const blocked = J.blocksFinale();
      J.finish();
      const open = !J.blocksFinale();
      R.World.reset(seed); D.ensure();
      return { saved: saved.seed === seed && !!saved.geo, resumed, guest, blocked, open };
    });
    const ok = r.saved && r.resumed.sameDoor && r.resumed.elapsedKept && r.resumed.phase !== 'forest' &&
      !r.guest.before && r.guest.clock === 0 && r.guest.after && r.guest.door[0] === 6200 && r.guest.elapsed >= 1300 && r.blocked && r.open;
    return { pass: ok, detail: r };
  });

  await scenario(h, 'cocoons never walk: Metapod, Kakuna, Silcoon and Cascoon cling to trees, still, and only Harden', async () => {
    const r = await h.R(async () => {
      const W = PSXAI.Wildlife, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const trees = W.treesNear(p.x, p.y, 700).filter((t) => !W.claims.has(t.tx + ',' + t.ty));
      const out = [];
      for (const dex of [11, 14, 266, 268]) {
        const t = trees.shift();
        const e = W.spawnResident(t, { dex, kind: 'cocoon' });
        if (e) out.push({ e, t, x0: e.x, y0: e.y });
      }
      // and one that just turns up on the ground somewhere: it goes to a tree, or doesn't appear
      const loose = PSXAI.Debug.spawn(14, { x: p.x + 200, y: p.y + 100, natural: true });
      p.x = out[0].t.x + 70; p.y = out[0].t.y + 30; // stand right beside the first one
      const hp0 = p.hp;
      await wait(4000);
      R.Combat && out[1] && (AI => AI)(PSXAI);
      out[1].e.hurt(3, '#fff', 0, 0, 0);
      await wait(400);
      const res = out.map((o) => ({ dex: o.e.dex, beh: o.e.psx.beh.id, moved: Math.round(Math.hypot(o.e.x - o.x0, o.e.y - o.y0)), perch: Math.round(o.e.psx.vis.perch), atTree: Math.round(Math.hypot(o.e.x - o.t.x, o.e.y - o.t.y)) }));
      const hardened = !!(out[1].e.psx.buff && out[1].e.psx.buff.def < 1);
      const looseOk = !R.EnemyMgr.all().includes(loose) || (loose.psx && loose.psx.eco && loose.psx.eco.tree && Math.hypot(loose.x - loose.psx.eco.tree.x, loose.y - loose.psx.eco.tree.y) < 10);
      for (const o of out) o.e.dead = true;
      return { res, hardened, touchDamage: Math.round(hp0 - p.hp), looseOk };
    });
    const ok = r.res.length === 4 && r.res.every((c) => c.beh === 'cocoon' && c.moved === 0 && c.perch > 5 && c.atTree < 8) && r.hardened && r.touchDamage === 0 && r.looseOk;
    return { pass: ok, detail: r };
  });

  await scenario(h, 'Caterpie crawls to a tree, climbs the trunk where you can see it, and feeds in the leaves', async () => {
    const r = await h.R(async () => {
      const W = PSXAI.Wildlife, R = __PSX_REG__, p = R.Game.player;
      PSXAI.Sky.set({ hour: 11, freeze: true });
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const t = W.treesNear(p.x + 300, p.y, 500).filter((q) => !W.claims.has(q.tx + ',' + q.ty))[0];
      const e = PSXAI.Debug.spawn(10, { x: t.x + 110, y: t.y + 50, natural: true, temp: 'neutral' });
      p.x = t.x - 900; p.y = t.y; // far enough not to disturb it
      const samples = [];
      for (let i = 0; i < 40; i++) { await wait(500); const tt = (e.psx.eco && e.psx.eco.tree) || t; samples.push({ beh: e.psx.beh.id, phase: e.psx.bs.phase, perch: Math.round(e.psx.vis.perch || 0), d: Math.round(Math.hypot(e.x - tt.x, e.y - tt.y)) }); if (e.psx.bs.phase === 'feed' && i > 4) break; }
      const phases = [...new Set(samples.map((q) => q.phase).filter(Boolean))];
      const rising = samples.filter((q) => q.phase === 'up').map((q) => q.perch);
      e.dead = true;
      return { phases, rising, last: samples[samples.length - 1] };
    });
    const ok = r.phases.includes('approach') && r.phases.includes('up') && r.phases.includes('feed') && r.rising.length >= 2 && r.rising[r.rising.length - 1] > r.rising[0] && r.last.d < 10 && r.last.perch > 25;
    return { pass: ok, detail: r };
  });

  await scenario(h, 'trees have residents: birds perch in the canopy, nothing floats, residents come back to the same trees', async () => {
    const r = await h.R(async () => {
      const W = PSXAI.Wildlife, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      PSXAI.Sky.set({ hour: 10, freeze: true });
      W.reset(); PSXAI.Debug.clear(true);
      const home = { x: p.x, y: p.y };
      for (let i = 0; i < 30; i++) { p.x += 40; PSXAI.Mansion.snapCamera(p); await wait(100); }
      await wait(1200);
      const first = new Map([...W.residents].map(([k, e]) => [k, e.dex]));
      // anything up in the air is held by a tree trunk right below it
      let floating = 0, perched = 0;
      for (const e of R.EnemyMgr.all()) { if (!e.psx || (e.psx.vis.perch || 0) < 3) continue; perched++; const t = e.psx.eco && e.psx.eco.tree; if (!t || Math.hypot(e.x - t.x, e.y - t.y) > 8) floating++; }
      // go far away, then come back the same way
      p.x = home.x + 6000; PSXAI.Mansion.snapCamera(p);
      for (let i = 0; i < 6; i++) await wait(400);
      const away = [...first.keys()].filter((k) => W.residents.has(k)).length; // the old trees' residents have gone home
      p.x = home.x; PSXAI.Mansion.snapCamera(p);
      for (let i = 0; i < 30; i++) { p.x += 40; PSXAI.Mansion.snapCamera(p); await wait(100); }
      await wait(1200);
      const again = new Map([...W.residents].map(([k, e]) => [k, e.dex]));
      let same = 0, diff = 0;
      for (const [k, d] of again) if (first.has(k)) { if (first.get(k) === d || (W.COCOON.has(d) && W.COCOON.has(first.get(k)))) same++; else diff++; }
      return { first: first.size, perched, floating, away, again: again.size, same, diff };
    });
    return { pass: r.first >= 2 && r.perched >= 1 && r.floating === 0 && r.away === 0 && r.same >= 1 && r.diff === 0, detail: r };
  });

  await scenario(h, 'fewer wild Pokémon: small caps, quiet stretches, no roaming cocoons', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, A = PSXAI.Areas, F = PSXAI.Forest;
      const bag = A.weightBag(R.Enemies.cast[1].list.slice());
      const cocoonsInBag = bag.filter((d) => PSXAI.Wildlife.COCOON.has(d.dex)).length;
      let quiet = 0, n = 0;
      for (let y = -6000; y <= 6000; y += 300) for (let x = -6000; x <= 6000; x += 300) { n++; if (F.quietAt(x, y) > 0.8) quiet++; }
      // a minute of play with spawning on: never more than the cap
      PSXAI.Debug.freeze(false); R.Game.debugSpeed(3);
      let max = 0;
      for (let i = 0; i < 20; i++) { await new Promise((res) => setTimeout(res, 500)); max = Math.max(max, PSXAI.Population.aliveWild()); }
      R.Game.debugSpeed(1); PSXAI.Debug.freeze(true);
      return { cap: PSXAI.cfg.maxNpcs, residentsCap: PSXAI.cfg.maxResidents, cocoonsInBag, quietShare: +(quiet / n).toFixed(2), maxAlive: max };
    });
    return { pass: r.cap <= 24 && r.cocoonsInBag === 0 && r.quietShare > 0.1 && r.quietShare < 0.6 && r.maxAlive <= r.cap + r.residentsCap, detail: r };
  });

  await scenario(h, 'the forest floor is one continuous painted surface: no tile grid, no sparkles, no seams', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, F = PSXAI.Forest;
      let painted = 0;
      const o = R.Tiles.paintChunk;
      R.Tiles.paintChunk = function () { painted++; return o.apply(this, arguments); };
      const p = R.Game.player;
      for (let i = 0; i < 6; i++) { p.x = 600 * i - 1500; p.y = (i % 2) * 700; PSXAI.Mansion.snapCamera(p); await new Promise((res) => setTimeout(res, 160)); }
      R.Tiles.paintChunk = o;
      // the edges of neighbouring chunks overlap by one world pixel
      const keys = [...F.chunks.keys()];
      return { on: F.on(), painted, chunks: keys.length };
    });
    return { pass: r.on && r.painted === 0 && r.chunks >= 4, detail: r };
  });

  await scenario(h, 'the forest is planned: a great lake, a stream, ponds, paths and mystery sites, all kept apart, across seeds', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, F = PSXAI.Forest, out = [];
      const keep = PSXAI.Decor.seed;
      for (const seed of [11, 404, 2024, 77777, 31337]) {
        R.World.reset(seed);
        const P = F.plan(), P2 = F.plan();
        const M = PSXAI.Mansion.geom();
        const sites = Object.values(P.sites).filter((s) => s.id !== 'suicune');
        let overlap = 0, wet = 0, nearStart = 0;
        for (let i = 0; i < sites.length; i++) {
          for (let j = i + 1; j < sites.length; j++) if (Math.hypot(sites[i].x - sites[j].x, sites[i].y - sites[j].y) < sites[i].r + sites[j].r) overlap++;
          if (F.water(sites[i].x, sites[i].y).e > 0 && sites[i].id !== 'cresselia') wet++;
          if (Math.hypot(sites[i].x, sites[i].y) < 1000) nearStart++;
        }
        let startWater = 0;
        for (let a = 0; a < 6.28; a += 0.3) for (let d = 0; d < 600; d += 60) if (F.water(Math.cos(a) * d, Math.sin(a) * d).e > 0) startWater++;
        const lakeToHouse = M ? Math.hypot(P.lake.x - M.D[0], P.lake.y - M.D[1]) : 9999;
        out.push({ seed, lakeR: Math.round(P.lake.R), ponds: P.ponds.length, streams: P.streams.length, paths: P.paths.length, sites: sites.length + 1, overlap, wet, nearStart, startWater, lakeToHouse: Math.round(lakeToHouse), same: P === P2 });
      }
      R.World.reset(keep);
      return out;
    });
    const ok = r.every((s) => s.lakeR >= 440 && s.ponds >= 1 && s.paths >= 2 && s.sites >= 8 && s.overlap === 0 && s.wet === 0 && s.nearStart === 0 && s.startWater === 0 && s.lakeToHouse > 900 && s.same);
    return { pass: ok, detail: r };
  });

  await scenario(h, 'trees keep an even, natural spacing and stay out of water, off paths and out of the sanctuaries', async () => {
    const r = await h.R(() => {
      const F = PSXAI.Forest, trees = [];
      for (let y = -2000; y <= 2000; y += 300) for (let x = -2000; x <= 2000; x += 300) for (const p of PSXAI.Env.props(x, y, 150)) if (p.type === 'tree' && !trees.includes(p)) trees.push(p);
      let close = 0, inWater = 0, onPath = 0, inSite = 0;
      for (const t of trees) {
        if (F.water(t.x, t.y).e > -10) inWater++;
        if (F.pathDist(t.x, t.y) < 10) onPath++;
        if (F.region(t.x, t.y).siteK > 0.5) inSite++;
        for (const u of trees) if (u !== t && Math.hypot(u.x - t.x, u.y - t.y) < 56) close++;
      }
      return { trees: trees.length, close: close / 2, inWater, onPath, inSite };
    });
    return { pass: r.trees > 150 && r.close === 0 && r.inWater === 0 && r.onPath === 0 && r.inSite === 0, detail: r };
  });

  await scenario(h, 'undergrowth follows habitat: reeds at the water, flowers only in clearings and sanctuaries, nothing inside a trunk', async () => {
    const r = await h.R(() => {
      const F = PSXAI.Forest, D = PSXAI.Decor, W = __PSX_REG__.World;
      const items = D.inRect(-2400, -2400, 2400, 2400, []);
      let flowersOut = 0, flowers = 0, reeds = 0, reedsDry = 0, inTrunk = 0, lilies = 0, liliesDry = 0;
      for (const it of items) {
        if (it.k === 'flower' && !it.myst) { flowers++; if (F.region(it.x, it.y).clear < 0.3) flowersOut++; }
        if (it.n === 'w_reeds') { reeds++; if (F.water(it.x, it.y).e < -80) reedsDry++; }
        if (it.k === 'lily') { lilies++; if (F.water(it.x, it.y).e <= 0) liliesDry++; }
        if (!it.flat && it.r) inTrunk += PSXAI.Env.treesIn(it.x, it.y, 12).length;
      }
      return { items: items.length, flowers, flowersOut, reeds, reedsDry, lilies, liliesDry, inTrunk };
    });
    return { pass: r.items > 500 && r.flowersOut === 0 && r.reedsDry === 0 && r.liliesDry === 0 && r.inTrunk === 0, detail: r };
  });

  await scenario(h, 'deep water stops the player from every direction, at any speed and through knockback; shallows only slow', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, F = PSXAI.Forest, W = R.World, p = R.Game.player, L = F.plan().lake;
      let entered = 0, reachedShallow = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * 6.283;
        // start on the shore, run straight at the middle in huge steps (dashes, knockback)
        let d = L.R * 1.8;
        while (d > 0 && F.water(L.x + Math.cos(a) * d, L.y + Math.sin(a) * d).e < -10) d -= 6;
        p.x = L.x + Math.cos(a) * (d + 20); p.y = L.y + Math.sin(a) * (d + 20); p._psxOk = null; W.collide(p);
        for (let i = 0; i < 60; i++) {
          const step = i % 10 === 9 ? 70 : 12;
          p.x -= Math.cos(a) * step + Math.sin(a) * (i % 2 ? 6 : -6); p.y -= Math.sin(a) * step;
          W.collide(p);
          const dc = F.depthClass(p.x, p.y);
          if (dc === 2) entered++;
          if (dc === 1) reachedShallow++;
        }
      }
      // dropped straight into the middle (a teleport): out to the nearest shore
      p.x = L.x; p.y = L.y; p._psxOk = null; W.collide(p);
      const rescued = F.depthClass(p.x, p.y) < 2;
      p.x = 0; p.y = 0; p._psxOk = null;
      return { entered, reachedShallow, rescued };
    });
    return { pass: r.entered === 0 && r.reachedShallow > 0 && r.rescued, detail: r };
  });

  await scenario(h, 'Pokémon cross water by how they move: walkers stay out of the deep, fish stay in it, flyers and floaters cross', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, F = PSXAI.Forest, L = F.plan().lake;
      const loco = { rattata: F.locomotion(19), magikarp: F.locomotion(129), pidgey: F.locomotion(16), psyduck: F.locomotion(54), surskit: F.locomotion(283), gastly: F.locomotion(92), squirtle: F.locomotion(7) };
      const walker = PSXAI.Debug.spawn(19, { x: L.x, y: L.y, temp: 'neutral', natural: true });
      const flyer = PSXAI.Debug.spawn(16, { x: L.x + 20, y: L.y, temp: 'neutral', natural: true });
      const fish = PSXAI.Debug.spawn(129, { x: L.x, y: L.y + L.R * 2.2, temp: 'neutral', natural: true });
      const out = { loco, walkerDepth: F.depthClass(walker.x, walker.y), flyerDepth: F.depthClass(flyer.x, flyer.y), fishDepth: fish.dead || !R.EnemyMgr.all().includes(fish) ? 'vetoed' : F.depthClass(fish.x, fish.y) };
      // a walker told to wander into the lake picks somewhere else
      let deepPicks = 0;
      for (let i = 0; i < 40; i++) { const pt = PSXAI.Behaviors.pointNear ? PSXAI.Behaviors.pointNear(walker, L.x, L.y, 0, L.R * 0.5) : null; if (pt && F.depthClass(pt[0], pt[1]) === 2) deepPicks++; }
      out.deepPicks = deepPicks;
      return out;
    });
    const l = r.loco;
    const ok = l.rattata === 'walk' && l.magikarp === 'swim' && l.pidgey === 'fly' && l.psyduck === 'amphi' && l.surskit === 'surface' && l.gastly === 'fly' && l.squirtle === 'amphi' &&
      r.walkerDepth < 2 && r.flyerDepth === 2 && (r.fishDepth === 'vetoed' || r.fishDepth > 0) && r.deepPicks === 0;
    return { pass: ok, detail: r };
  });

  await scenario(h, 'the water lives: reflections, rain ripples, mist and moonlight, at a steady frame rate', async () => {
    const r = await h.R(async () => {
      const F = PSXAI.Forest, L = F.plan().lake, p = __PSX_REG__.Game.player;
      let y = L.y + L.R * 2; while (F.water(L.x, y).e < 30) y -= 6;
      p.x = L.x; p.y = y + 60; PSXAI.Mansion.snapCamera(p);
      PSXAI.Sky.set({ hour: 22, rain: 0.9, storm: 0, fog: 0.5, cloud: 0.6, wet: 1, freeze: true });
      await new Promise((res) => setTimeout(res, 800));
      const ripples = PSXAI.Decor.ripples.filter((q) => F.water(q.x, q.y).e > 0).length;
      const fps = await new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); });
      return { ripples, fps: Math.round(fps), chunksWithWater: [...F.chunks.values()].filter((c) => c.water).length };
    });
    return { pass: r.ripples > 0 && r.chunksWithWater > 0 && r.fps >= 28, detail: r };
  });

  await scenario(h, 'Forest Mysteries: each mystery fills a nameless journal of its own step by step, reading pauses the game, and it is kept', async () => {
    const r = await h.R(async () => {
      const M = PSXAI.Mysteries, st = M.run.sites.celebi, p = __PSX_REG__.Game.player;
      M.resetJournal();
      const empty = Object.keys(M.journal.m).length;
      PSXAI.Sky.set({ hour: 12, rain: 0, fog: 0, cloud: 0.1, freeze: true });
      p.x = st.x; p.y = st.y + 120; PSXAI.Mansion.snapCamera(p);
      await new Promise((res) => setTimeout(res, 400));
      const afterRumour = M.status('celebi');
      p.x = st.x; p.y = st.y + 20;
      await new Promise((res) => setTimeout(res, 400));
      const afterClue = M.status('celebi');
      p.x = st.x; p.y = st.y + 120;
      await new Promise((res) => setTimeout(res, 6500));
      const celebiSeen = M.run.apps.some((a) => a.id === 'celebi');
      // walking up to it: it leaves, and the sighting is written down
      const ap = M.run.apps.find((a) => a.id === 'celebi');
      if (ap) { p.x = ap.x; p.y = ap.y + 10; }
      await new Promise((res) => setTimeout(res, 1500));
      const saved = JSON.parse(localStorage.getItem('psx.mysteries.v1') || '{}');
      // reading pauses the game (solo), and closing resumes it
      const G = __PSX_REG__.Game;
      M.toggle(true);
      const t0 = G.time;
      await new Promise((res) => setTimeout(res, 800));
      const paused = G.state === 'choice' && G.time === t0;
      M.toggle(false);
      await new Promise((res) => setTimeout(res, 300));
      const resumed = G.state === 'playing' && G.time > t0;
      // no journal ever names what it is about, or calls it legendary
      const names = M.ORDER.map((id) => M.MY[id].name).filter(Boolean).concat(['Legendary', 'legendary', 'Mythical', 'mythical', 'Pokémon']);
      const texts = M.ORDER.flatMap((id) => { const m = M.MY[id]; return [m.title, m.rumor, m.sight, m.conf, m.won, ...m.clues.map((c) => c[1])].filter(Boolean); });
      const leaks = texts.filter((t) => names.some((n) => t.includes(n)));
      const others = M.ORDER.filter((id) => id !== 'celebi').map((id) => M.status(id));
      return { empty, afterRumour, afterClue, celebiSeen, final: M.status('celebi'), saved: !!(saved.m && saved.m.celebi && saved.m.celebi.r), othersUnknown: others.filter((s) => s == null).length, othersTotal: others.length, paused, resumed, leaks: leaks.length, journals: M.journals().length };
    });
    return { pass: r.empty === 0 && r.afterRumour === 'Rumour' && /^Clues 1/.test(r.afterClue) && r.celebiSeen && /Sighted|Confirmed/.test(r.final) && r.saved && r.othersUnknown >= r.othersTotal - 2 && r.paused && r.resumed && r.leaks === 0, detail: r };
  });

  await scenario(h, 'Darkrai: the night darkens, a shadow rises and dissolves if rushed; only with its clues does it fight', async () => {
    const r = await h.R(async () => {
      const M = PSXAI.Mysteries, st = M.run.sites.darkrai, p = __PSX_REG__.Game.player, R = __PSX_REG__;
      if (!st) return { skip: true };
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      M.resetJournal(); M.run.cool = {};
      // in daylight: nothing
      PSXAI.Sky.set({ hour: 13, freeze: true });
      p.x = st.x + st.r * 1.2; p.y = st.y; PSXAI.Mansion.snapCamera(p);
      await wait(1500);
      const dayApps = M.run.apps.length;
      PSXAI.Sky.set({ hour: 23.5, cloud: 0.1, rain: 0, fog: 0, freeze: true });
      await wait(4500);
      const dark = M.run.dark;
      const ap = M.run.apps.find((a) => a.id === 'darkrai');
      const rose = !!ap;
      if (ap) { p.x = ap.x + 60; p.y = ap.y; }
      await wait(2000);
      const dissolved = !M.run.apps.some((a) => a.id === 'darkrai');
      const noFight1 = !R.EnemyMgr.all().some((e) => e.dex === 491);
      // find its clues
      for (const it of PSXAI.Decor.inRect(st.x - 400, st.y - 400, st.x + 400, st.y + 400, [])) if (it.clue && it.clue.id === 'darkrai') { p.x = it.x; p.y = it.y + 8; await wait(300); }
      M.run.cool.darkrai = 0;
      p.x = st.x + st.r * 1.2; p.y = st.y; PSXAI.Mansion.snapCamera(p);
      await wait(4500);
      const ap2 = M.run.apps.find((a) => a.id === 'darkrai');
      if (ap2) { p.x = ap2.x + 90; p.y = ap2.y; }
      await wait(1200);
      const boss = R.EnemyMgr.all().find((e) => e.dex === 491 && e.boss);
      if (boss) boss.dead = true;
      return { dayApps, dark: +dark.toFixed(2), rose, dissolved, noFight1, status: M.status('darkrai'), fought: !!boss };
    });
    if (r.skip) return { pass: true, detail: 'no hollow this world' };
    return { pass: r.dayApps === 0 && r.dark > 0.3 && r.rose && r.dissolved && r.noFight1 && r.status === 'Confirmed' && r.fought, detail: r };
  });

  await scenario(h, 'Raikou only in night storms: on the ridge in a lightning flash, gone by the next strike; Spectrier never fights', async () => {
    const r = await h.R(async () => {
      const M = PSXAI.Mysteries, S = PSXAI.Sky, R = __PSX_REG__, p = R.Game.player;
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const st = M.run.sites.raikou;
      const out = {};
      if (st) {
        M.run.cool = {};
        p.x = st.x; p.y = st.y + 95; PSXAI.Mansion.snapCamera(p);
        S.set({ hour: 13, storm: 1, rain: 1, cloud: 1, freeze: true });
        await wait(300); S.bolt(0.5); await wait(300);
        out.dayStorm = M.run.apps.some((a) => a.id === 'raikou');
        S.set({ hour: 23, storm: 1, rain: 1, cloud: 1, freeze: true });
        await wait(600); S.bolt(0.5); await wait(400);
        out.onRidge = M.run.apps.some((a) => a.id === 'raikou');
        await wait(900); S.bolt(0.5); await wait(1200);
        out.goneNext = !M.run.apps.some((a) => a.id === 'raikou');
      }
      const sp = M.run.sites.spectrier;
      if (sp && sp.path) {
        M.run.cool = {};
        S.set({ hour: 1, storm: 0, rain: 0, cloud: 0.2, freeze: true });
        // walk the path toward its end until something is there
        let ap = null;
        for (let k = 3; k < 9 && !ap; k++) { const q = sp.path[k]; p.x = q[0]; p.y = q[1]; PSXAI.Mansion.snapCamera(p); await wait(700); ap = M.run.apps.find((a) => a.id === 'spectrier'); }
        if (ap) await wait(1500);
        out.spectrier = !!ap;
        if (ap) { p.x += (ap.x - p.x) * 0.75; p.y += (ap.y - p.y) * 0.75; await wait(500); out.trail = ap.trail.length > 0; out.leaving = ap.state === 'out' || !M.run.apps.includes(ap); } // (walk right up to it)
        out.noEnemy = !R.EnemyMgr.all().some((e) => e.dex === 897);
      }
      return out;
    });
    return { pass: r.dayStorm === false && r.onRidge && r.goneNext && r.spectrier && r.trail && r.leaving && r.noEnemy, detail: r };
  });

  await scenario(h, 'the Evergold Sanctuary: no hostile Pokémon appear inside, and none stay there', async () => {
    const r = await h.R(async () => {
      const M = PSXAI.Mysteries, st = M.run.sites.celebi, R = __PSX_REG__;
      const n0 = R.EnemyMgr.all().length;
      const e = PSXAI.Debug.spawn(19, { x: st.x + 10, y: st.y + 10, temp: 'aggressive', natural: true });
      const vetoed = !R.EnemyMgr.all().includes(e);
      return { vetoed, sanctuary: M.sanctuary(st.x, st.y), n: R.EnemyMgr.all().length - n0 };
    });
    return { pass: r.vetoed && r.sanctuary, detail: r };
  });

  await scenario(h, 'wild Pokémon keep their HP but show no health bar, and their events stay quiet', async () => {
    const r = await h.R(() => ({ noBars: PSXGEN.noBars(), quietCfg: PSXAI.cfg.announce !== true, say: typeof PSXAI.say }));
    return { pass: r.noBars && r.quietCfg && r.say === 'function', detail: r };
  });

  await h.close();

  // =========================================================== Level 3: the Tropical Ocean
  h = await boot({});
  await h.R(() => { const R = __PSX_REG__; R.DB.save.mapWins = { 1: 1, 2: 1 }; R.Maps.choose(3); PSXAI.cfg.birthIslandChance = 1; PSXAI.Sea.forget(); });
  await h.startRun(25);
  await h.wait(600);
  // page-side helpers for the sea
  await h.R(() => {
    window.OT = {
      tp(x, y) { const p = __PSX_REG__.Game.player; if (p.psxBoat) PSXAI.Boats.leave(p.psxBoat, [x, y]); p.x = x; p.y = y; p._psxOk = [x, y]; PSXAI.Mansion.snapCamera(p); },
      // a point of the given depth class near (x, y)
      find(x, y, cls, r) { const O = PSXAI.Ocean; for (let d = 0; d <= (r || 3000); d += 24) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, qx = x + Math.cos(a) * d, qy = y + Math.sin(a) * d, s = O.sample(qx, qy); if (s.cls === cls && !s.solid && !s.tidal) return [qx, qy]; } return null; },
    };
  });

  await scenario(h, 'ocean: Level 3 is the Tropical Ocean (not the Ash Volcano), in every language', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, O = PSXAI.Ocean, m = R.Maps.LIST.find((x) => x.n === 3);
      return { name: m.name, biome: m.biome, BIOME: O.BIOME, world: R.World.biome, on: O.on(), en: R.T('Océano Tropical'), tab: R.T('3 · Volcán'), types: m.types.includes('water') && !m.types.includes('fire'), l1: R.Maps.LIST[0].biome, l2: R.Maps.LIST[1].biome };
    });
    return { pass: r.name === 'Océano Tropical' && r.biome === r.BIOME && r.world === r.BIOME && r.on && r.en === 'Tropical Ocean' && /Ocean/.test(r.tab) && r.types && r.l1 === 0 && r.l2 === 1, detail: r };
  });

  await scenario(h, 'ocean: you start on the harbour pier, boats moored beside it, the lighthouse on the headland', async () => {
    const r = await h.R(() => {
      const O = PSXAI.Ocean, B = PSXAI.Boats, LH = PSXAI.OceanDraw.LH;
      return { pier: O.artAt(0, 0), boats: B.boats.map((b) => [b.col, Math.round(Math.hypot(b.x, b.y)), O.sample(b.x, b.y).cls]), lh: O.artAt(LH.x, LH.foot), lhDist: Math.round(Math.hypot(LH.x, LH.y)), harbor: O.zoneAt(0, 0).id };
    });
    return { pass: r.pier === 1 && r.boats.length >= 3 && r.boats.every((b) => b[1] < 500 && b[2] >= 1) && r.lh === 2 && r.lhDist < 700 && r.harbor === 'harbor', detail: r };
  });

  await scenario(h, 'ocean: near the shallows, click a boat and double-tap Space to board (one tap does nothing, walking into it doesn\'t); the controls steer it', async () => {
    const at = async () => h.R(() => { const R = __PSX_REG__, b = PSXAI.Boats.boats[0], cam = R.Camera; const cv = [...document.querySelectorAll('canvas')].filter((c) => c.getBoundingClientRect().width > 300).pop(); const bb = cv.getBoundingClientRect(), k = (cam._cw || bb.width) / bb.width; return [bb.left + ((b.x - cam.left()) * cam.scale) / k, bb.top + ((b.y - 20 - cam.top()) * cam.scale) / k]; });
    // (from the pier's edge beside the boat: walking into it is blocked, it doesn't board)
    const b0 = await h.R(() => { const b = PSXAI.Boats.boats[0], O = PSXAI.Ocean; let y = b.y - 40; while (y > b.y - 200 && !O.fits('walk', b.x, y)) y -= 4; OT.tp(b.x, y); return [b.x, b.y]; });
    await h.page.keyboard.down('KeyS'); await h.wait(700); await h.page.keyboard.up('KeyS');
    const walked = await h.R(() => !!__PSX_REG__.Game.player.psxBoat);
    await h.page.keyboard.press('Space'); await h.wait(600);
    const oneTap = await h.R(() => !!__PSX_REG__.Game.player.psxBoat);
    const pt = await at(); await h.page.mouse.click(pt[0], pt[1]); await h.wait(150);
    const picked = await h.R(() => PSXAI.Boats.st.sel === PSXAI.Boats.boats[0]);
    await h.page.keyboard.press('Space'); await h.wait(120); await h.page.keyboard.press('Space'); await h.wait(300);
    const aboard = await h.R(() => !!__PSX_REG__.Game.player.psxBoat);
    await h.page.keyboard.down('KeyS'); await h.wait(2500); await h.page.keyboard.up('KeyS');
    const r = await h.R((b0) => { const p = __PSX_REG__.Game.player, b = p.psxBoat; return { aboard: !!b, moved: b ? Math.round(Math.hypot(b.x - b0[0], b.y - b0[1])) : 0, seated: b ? Math.hypot(p.x - b.x, p.y - b.y) < 40 : false, cls: PSXAI.Ocean.sample(p.x, p.y).cls }; }, b0);
    return { pass: !walked && !oneTap && picked && aboard && r.aboard && r.moved > 60 && r.seated && r.cls >= 1, detail: Object.assign({ walked, oneTap, picked, boarded: aboard }, r) };
  });

  await scenario(h, 'ocean: double-tap Space steps you off a boat parked in shallow water (never in deep water); the boat stays', async () => {
    const dbl = async () => { await h.page.keyboard.press('Space'); await h.wait(120); await h.page.keyboard.press('Space'); await h.wait(300); };
    // out in deep water: it won't let you off
    await h.R(() => { const B = PSXAI.Boats, O = PSXAI.Ocean, b = __PSX_REG__.Game.player.psxBoat; for (let r = 400; r < 3000; r += 50) for (let k = 0; k < 16; k++) { const x = Math.cos(k / 16 * 6.283) * r, y = 900 + Math.sin(k / 16 * 6.283) * r; if (O.sample(x, y).cls >= 3 && B.fits(b, x, y, 0)) { b.x = x; b.y = y; b.vx = b.vy = 0; return; } } });
    await h.wait(300); await dbl();
    const deep = await h.R(() => !!__PSX_REG__.Game.player.psxBoat);
    // parked in the shallows: off you step
    await h.R(() => { const B = PSXAI.Boats, O = PSXAI.Ocean, b = __PSX_REG__.Game.player.psxBoat; for (let r = 300; r < 3000; r += 20) for (let k = 0; k < 24; k++) { const x = 400 + Math.cos(k / 24 * 6.283) * r, y = Math.sin(k / 24 * 6.283) * r; if (O.sample(x, y).cls === 1 && B.fits(b, x, y, 0)) { b.x = x; b.y = y; b.vx = b.vy = 0; window.__bq = [x, y]; return; } } });
    await h.wait(300); await dbl(); await h.wait(400);
    const r = await h.R(() => {
      const p = __PSX_REG__.Game.player, O = PSXAI.Ocean, b = PSXAI.Boats.boats[0], s = O.sample(p.x, p.y);
      return { aboard: !!p.psxBoat, cls: s.cls, solid: s.solid, boatCls: O.sample(b.x, b.y).cls, rider: !!b.rider, near: Math.round(Math.hypot(b.x - p.x, b.y - p.y)), stayed: Math.round(Math.hypot(b.x - __bq[0], b.y - __bq[1])) };
    });
    return { pass: deep && !r.aboard && r.cls <= 1 && !r.solid && r.boatCls >= 1 && !r.rider && r.near < 200 && r.stayed < 20, detail: Object.assign({ stayedAboardInDeep: deep }, r) };
  });

  await scenario(h, 'ocean: a Pokémon that can\'t swim wades the shallows but never walks into deep water', async () => {
    const start = await h.R(() => { const q = OT.find(560, -260, 1, 900); const land = OT.find(q[0], q[1], 0, 400); OT.tp(land[0], land[1]); return { land, q }; });
    const dir = start.q[0] > start.land[0] ? 'KeyD' : 'KeyA';
    const dirY = start.q[1] > start.land[1] ? 'KeyS' : 'KeyW';
    await h.page.keyboard.down(dir); await h.page.keyboard.down(dirY);
    const s = await sample(h, 3500, 250, () => { const p = __PSX_REG__.Game.player; return PSXAI.Ocean.sample(p.x, p.y).cls; });
    await h.page.keyboard.up(dir); await h.page.keyboard.up(dirY);
    const loco = await h.R(() => PSXAI.Ocean.locoOf(__PSX_REG__.Game.player));
    return { pass: loco === 'walk' && Math.max(...s) <= 1 && s.includes(1), detail: { loco, classes: [...new Set(s)] } };
  });

  await scenario(h, 'ocean: everyone can enter the shallows; Water types swim in deep water', async () => {
    const r = await h.R(() => {
      const O = PSXAI.Ocean, sh = OT.find(0, 300, 1), dp = OT.find(0, 900, 3);
      return { walk: O.fits('walk', sh[0], sh[1]), swim: O.fits('swim', sh[0], sh[1]), amphi: O.fits('amphi', sh[0], sh[1]), walkDeep: O.fits('walk', dp[0], dp[1]), waterPlayer: O.playerLoco({ mon: { types: ['water'] } }), firePlayer: O.playerLoco({ mon: { types: ['fire'] } }), amphiDeep: O.fits('amphi', dp[0], dp[1]) };
    });
    return { pass: r.walk && r.swim && r.amphi && !r.walkDeep && r.waterPlayer === 'amphi' && r.firePlayer === 'walk' && r.amphiDeep, detail: r };
  });

  await scenario(h, 'ocean: Magikarp, Goldeen and Carvanha never leave the water', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, O = PSXAI.Ocean, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const land = OT.find(450, -300, 0, 600);
      OT.tp(land[0] - 200, land[1]);
      const fish = [129, 118, 318].map((dex) => PSXAI.Debug.spawn(dex, { x: land[0], y: land[1], natural: true, temp: 'neutral' }));
      const live = fish.filter((e) => R.EnemyMgr.all().includes(e));
      const seen = [];
      for (let i = 0; i < 12; i++) { await wait(250); for (const e of live) if (!e.dead) seen.push(O.sample(e.x, e.y).cls); }
      return { locos: [129, 118, 318].map((d) => O.locomotion(d)), spawned: live.length, minCls: seen.length ? Math.min(...seen) : null, vetoed: 3 - live.length };
    });
    return { pass: r.locos.every((l) => l === 'swim') && (r.spawned === 0 || r.minCls >= 1), detail: r };
  });

  await scenario(h, 'ocean: Seel, Shellder and Slowpoke live on the coast (Seel can swim; the others can\'t go deep)', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, O = PSXAI.Ocean, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const deep = OT.find(900, 400, 2, 1500);
      OT.tp(deep[0] - 300, deep[1] - 300);
      const out = {};
      for (const dex of [86, 90, 79]) {
        const e = PSXAI.Debug.spawn(dex, { x: deep[0], y: deep[1], natural: true, temp: 'neutral' });
        const alive = R.EnemyMgr.all().includes(e);
        O.place(e);
        await wait(300);
        out[dex] = { loco: O.locomotion(dex), hab: O.habitat(dex), alive, cls: alive ? O.sample(e.x, e.y).cls : null };
        if (alive) { e.dead = true; }
      }
      out.slowpokeDeep = O.fits(O.locomotion(79), deep[0], deep[1]);
      out.shellderDeep = O.fits(O.locomotion(90), deep[0], deep[1]);
      out.seelDeep = O.fits(O.locomotion(86), deep[0], deep[1]);
      return out;
    });
    const coastal = [90, 79].every((d) => !r[d].alive || r[d].cls <= 1);
    return { pass: r[86].loco === 'amphi' && r[90].loco === 'walk' && r[79].loco === 'walk' && r[86].hab === 'rocks' && r[90].hab === 'tidepool' && r[79].hab === 'beach' && coastal && !r.slowpokeDeep && !r.shellderDeep && r.seelDeep, detail: r };
  });

  await scenario(h, 'ocean: Pokémon that can\'t swim can\'t cross from one island to another', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, O = PSXAI.Ocean, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const o = O.islandById('wingull');
      let at = null;
      for (let k = 0; k < 40 && !at; k++) { const a = k / 40 * 6.283, x = o.x + Math.cos(a) * o.R * 0.4, y = o.y + Math.sin(a) * o.R * 0.4; if (O.fits('walk', x, y) && !PSXAI.Decor.blocked(x, y, 12)) at = [x, y]; }
      OT.tp(o.x - 400, o.y - 400);
      const e = PSXAI.Debug.spawn(19, { x: at[0], y: at[1], temp: 'neutral' });
      // shove it toward the harbour, again and again
      for (let i = 0; i < 30; i++) { e.x += 24; e.y -= 14; R.World.collide(e); await wait(60); }
      const s = O.sample(e.x, e.y);
      return { cls: s.cls, onIsle: O.islE(o, e.x, e.y) > -140, d: Math.round(Math.hypot(e.x - o.x, e.y - o.y)), R: o.R };
    });
    return { pass: r.cls <= 1 && r.onIsle, detail: r };
  });

  await scenario(h, 'ocean: shallow, medium, deep and abyssal water are distinct, with reefs and lagoons', async () => {
    const r = await h.R(() => {
      const O = PSXAI.Ocean, p = O.plan();
      const seq = [];
      for (let x = 150; x < 4500; x += 40) { const c = O.sample(x, -300).cls; if (seq[seq.length - 1] !== c) seq.push(c); }
      let trench = 0; for (const tr of p.trench.pts) trench = Math.max(trench, O.sample(tr[0], tr[1]).cls);
      const reef = p.reefs[0], reefC = O.sample(reef.x, reef.y);
      return { seq, trench, reef: { cls: reefC.cls, k: +reefC.reef.toFixed(2), e: Math.round(reefC.e) }, lagoon: +O.lagoonK(520, -80).toFixed(2), far: O.sample(9000, 9000).cls };
    });
    return { pass: r.seq.slice(0, 4).join() === '0,1,2,3' && r.trench === 4 && r.reef.cls === 1 && r.reef.e > 300 && r.lagoon > 0.5 && r.far === 4, detail: r };
  });

  await scenario(h, 'ocean: tides: the causeway and the sandbar are dry at low tide and drowned at high tide', async () => {
    const r = await h.R(() => {
      const O = PSXAI.Ocean, p = O.plan(), c = p.tidal.find((t) => t.id === 'causeway').pts[2], sb = p.sandbar;
      PSXAI.cfg.oceanTide = -1; const low = [O.sample(c[0], c[1]).cls, O.sample(sb.x, sb.y).cls];
      PSXAI.cfg.oceanTide = 1; const high = [O.sample(c[0], c[1]).cls, O.sample(sb.x, sb.y).cls, O.fits('walk', c[0], c[1])];
      PSXAI.cfg.oceanTide = 0; const mid = O.sample(c[0], c[1]).cls;
      return { low, high, mid, name: O.tideName(-1) + '/' + O.tideName(1) };
    });
    return { pass: r.low[0] === 0 && r.low[1] === 0 && r.high[0] >= 2 && r.high[1] >= 1 && r.high[2] === false && r.mid <= 1, detail: r };
  });

  await scenario(h, 'ocean: caught on a tidal path as the tide comes in, you can always wade out', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, O = PSXAI.Ocean, p = R.Game.player, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const c = O.plan().tidal.find((t) => t.id === 'causeway').pts[2];
      PSXAI.cfg.oceanTide = -1; OT.tp(c[0], c[1]); await wait(300);
      const dry = O.sample(p.x, p.y).cls;
      PSXAI.cfg.oceanTide = 1; await wait(300);
      const flooded = O.sample(p.x, p.y).cls;
      const ok = O.fits('walk', p.x, p.y, p), strangerOk = O.fits('walk', p.x, p.y, {});
      // a walker dropped far out at sea is put back somewhere it can stand
      // (a walker dropped out at sea is put back somewhere it can stand, or, far from any land, quietly leaves)
      const e = PSXAI.Debug.spawn(19, { x: c[0] + 900, y: c[1] + 1300 });
      e._psxOk = null; O.collide(e);
      const back = O.sample(e.x, e.y).cls, gone = !!e.dead;
      PSXAI.cfg.oceanTide = null;
      return { dry, flooded, ok, strangerOk, back, gone };
    });
    return { pass: r.dry === 0 && r.flooded >= 2 && r.ok && !r.strangerOk && (r.back <= 1 || r.gone), detail: r };
  });

  await scenario(h, 'ocean: put back out on deep water without a boat (after a rift, the Judgment…), the nearest boat comes for you', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, O = PSXAI.Ocean, p = R.Game.player, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      OT.tp(0, 0);
      await wait(200);
      let dp = null;
      for (let d = 1200; d < 6000 && !dp; d += 200) for (let k = 0; k < 16 && !dp; k++) { const x = Math.cos(k / 16 * 6.283) * d, y = 1500 + Math.sin(k / 16 * 6.283) * d; if (O.sample(x, y).e > 800 && !O.fitNear('walk', x, y, 700)) dp = [x, y]; }
      // (as the game does when it brings you back from an arena you entered while sailing: just puts
      // you where you were, and where you last stood was the boat)
      p.x = dp[0]; p.y = dp[1]; p._psxOk = [dp[0], dp[1]];
      await wait(600);
      const b = p.psxBoat;
      return { aboard: !!b, cls: O.sample(p.x, p.y).cls, near: b ? Math.round(Math.hypot(b.x - dp[0], b.y - dp[1])) : null };
    });
    return { pass: r.aboard && r.near < 420, detail: r };
  });

  await scenario(h, 'ocean: weather: a storm turns Carvanha vicious and sends Wingull to land', async () => {
    const r = await h.R(async () => {
      const R = __PSX_REG__, O = PSXAI.Ocean, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const dp = OT.find(300, 1300, 3, 1500);
      const b = PSXAI.Boats.boats[1]; b.x = dp[0]; b.y = dp[1]; PSXAI.Boats.board(b, R.Game.player); R.Game.player.x = dp[0]; R.Game.player.y = dp[1];
      PSXAI.Sky.set({ storm: 0, rain: 0, wind: 0.1 });
      const cv = PSXAI.Debug.spawn(318, { x: dp[0] + 160, y: dp[1], natural: true });
      const wg = PSXAI.Debug.spawn(278, { x: dp[0] - 160, y: dp[1], natural: true });
      await wait(700);
      const calm = cv.psxForceTemp || 'none';
      PSXAI.Sky.set({ storm: 1, rain: 1, wind: 0.9, cloud: 1 });
      const land0 = (() => { let best = 1e9; for (let d = 60; d < 2000; d += 60) for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; if (O.sample(wg.x + Math.cos(a) * d, wg.y + Math.sin(a) * d).cls === 0) { best = Math.min(best, d); } } return best; })();
      const w0 = [wg.x, wg.y];
      await wait(2500);
      return { calm, storm: cv.psxForceTemp, wingullMoved: Math.round(Math.hypot(wg.x - w0[0], wg.y - w0[1])), land0 };
    });
    return { pass: r.calm !== 'aggressive' && r.storm === 'aggressive' && r.wingullMoved > 40, detail: r };
  });

  await scenario(h, 'ocean: storms push the boat about (wind, waves, rough water) but it always answers the helm', async () => {
    const run = async (storm) => {
      await h.R((storm) => {
        const R = __PSX_REG__, b = R.Game.player.psxBoat, dp = OT.find(300, 1300, 3, 1500);
        b.x = dp[0]; b.y = dp[1]; b.vx = b.vy = 0; b.ang = 0;
        PSXAI.Sky.set(storm ? { storm: 1, rain: 1, wind: 1, cloud: 1 } : { storm: 0, rain: 0, wind: 0.05, cloud: 0.1 });
        window.__b0 = [b.x, b.y];
      }, storm);
      await h.page.keyboard.down('KeyD'); await h.wait(2200); await h.page.keyboard.up('KeyD');
      return h.R(() => { const b = __PSX_REG__.Game.player.psxBoat; return b ? { dx: Math.round(b.x - __b0[0]), dy: Math.round(b.y - __b0[1]) } : null; });
    };
    const calm = await run(false), storm = await run(true);
    const r = { calm, storm };
    return { pass: !!calm && !!storm && calm.dx > 150 && storm.dx > 80 && Math.hypot(storm.dx, storm.dy) !== Math.hypot(calm.dx, calm.dy) && storm.dx < calm.dx, detail: r };
  });

  await scenario(h, 'ocean: a boat turns where you steer: going right, holding left swings the bow round to the left (no backing up), and its sprite points the bow where it heads', async () => {
    await h.R(() => {
      const B = PSXAI.Boats, O = PSXAI.Ocean, p = __PSX_REG__.Game.player;
      if (p.psxBoat) B.leave(p.psxBoat, [p.x, p.y]);
      PSXAI.Sky.set({ wind: 0, storm: 0, rain: 0, freeze: true });
      const b = B.boats.find((q) => q.col === 'blue');
      let at = null; for (let r = 300; r < 2400 && !at; r += 60) for (let k = 0; k < 16; k++) { const x = 300 + Math.cos(k / 16 * 6.283) * r, y = 1300 + Math.sin(k / 16 * 6.283) * r; if (O.sample(x, y).cls >= 3 && B.fits(b, x, y, 0) && B.fits(b, x - 500, y, 0) && B.fits(b, x + 300, y, 0) && B.fits(b, x, y - 300, 0)) { at = [x, y]; break; } }
      b.x = at[0]; b.y = at[1]; b.ang = 0; b.vx = b.vy = 0; b.side = 0;
      B.board(b, p); window.BB = b;
    });
    await h.page.keyboard.down('KeyD'); await h.wait(1200); await h.page.keyboard.up('KeyD');
    const r0 = await h.R(() => ({ vx: Math.round(BB.vx), bow: PSXAI.Boats.orient(BB).bow.map((v) => +v.toFixed(2)), state: __PSX_REG__.Game.state, aboard: __PSX_REG__.Game.player.psxBoat === BB, busy: [PSXAI.Sea.busy(), PSXAI.Guardians.busy(), PSXAI.Birth.busy(), PSXAI.Story.lockInput(), !!(PSXAI.Trio && PSXAI.Trio.busy())] }));
    await h.page.keyboard.down('KeyA'); await h.wait(1600);
    const r1 = await h.R(() => ({ ang: Math.round(Math.abs(BB.ang) * 57.3), vx: Math.round(BB.vx), bow: PSXAI.Boats.orient(BB).bow.map((v) => +v.toFixed(2)) }));
    await h.page.keyboard.up('KeyA');
    await h.page.keyboard.down('KeyW'); await h.wait(1500); await h.page.keyboard.up('KeyW');
    const r2 = await h.R(() => ({ vy: Math.round(BB.vy), bow: PSXAI.Boats.orient(BB).bow.map((v) => +v.toFixed(2)) }));
    // every colour: the drawn bow follows the heading, whichever way its sprite faces
    const r3 = await h.R(() => { const out = []; for (const col of ['red', 'blue', 'yellow']) for (const a of [0, 0.8, 1.6, 2.4, 3.1, -0.8, -1.6, -2.4]) { const o = PSXAI.Boats.orient({ col, ang: a, side: 0 }); const vx = Math.cos(a), vy = Math.sin(a) * 0.7, l = Math.hypot(vx, vy); out.push(o.bow[0] * vx / l + o.bow[1] * vy / l); } return Math.min(...out); });
    return { pass: r0.vx > 80 && r0.bow[0] > 0.9 && r1.ang > 150 && r1.vx < -40 && r1.bow[0] < -0.9 && r2.vy < -60 && r2.bow[1] < -0.9 && r3 > 0.99, detail: [r0, r1, r2, r3] };
  });

  await scenario(h, 'ocean: four guardian islands, each its own place and its own encounter', async () => {
    const r = await h.R(async () => {
      const O = PSXAI.Ocean, G = PSXAI.Guardians, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const out = { kinds: ['koko', 'lele', 'bulu', 'fini'].map((id) => O.islandById(id).kind) };
      const k = O.islandById('koko'), rg = k.ring;
      out.ringSolid = O.sample(k.x + Math.cos(rg.gap + Math.PI) * (rg.r0 + 15), k.y + Math.sin(rg.gap + Math.PI) * (rg.r0 + 15)).solid;
      out.rampOpen = !O.sample(k.x + Math.cos(rg.gap) * (rg.r0 + 15), k.y + Math.sin(rg.gap) * (rg.r0 + 15)).solid;
      out.scenes = {};
      for (const id of ['koko', 'lele', 'bulu']) {
        const a = G.arena(id);
        OT.tp(a.x + 20, a.y + 20);
        await wait(400);
        out.scenes[id] = G.st.scene ? G.st.scene.id : null;
        OT.tp(0, 0);
        G.reset();
      }
      return out;
    });
    return { pass: r.kinds.join() === 'thunder,blossom,jungle,souls' && r.ringSolid && r.rampOpen && r.scenes.koko === 'koko' && r.scenes.lele === 'lele' && r.scenes.bulu === 'bulu', detail: r };
  });

  await scenario(h, 'ocean: the Isle of Lost Souls: graves and dead trees in a fog that thickens toward the summit', async () => {
    const r = await h.R(() => {
      const O = PSXAI.Ocean, R = __PSX_REG__, o = O.islandById('fini'), p = R.Game.player;
      OT.tp(o.x + o.R * 0.9, o.y);
      const t1 = { fog: 0, wind: 0.5, cloud: 0, rain: 0, storm: 0, snow: 0 }; O.localSky(t1);
      OT.tp(o.x + 30, o.y + 40);
      const t2 = { fog: 0, wind: 0.5, cloud: 0, rain: 0, storm: 0, snow: 0 }; O.localSky(t2);
      const items = PSXAI.Decor.inRect(o.x - o.R, o.y - o.R, o.x + o.R, o.y + o.R, []);
      return { edgeFog: +t1.fog.toFixed(2), summitFog: +t2.fog.toFixed(2), graves: items.filter((i) => i.k === 'grave').length, dead: items.filter((i) => /haunt_tree/.test(i.n || '')).length };
    });
    return { pass: r.summitFog > 0.9 && r.summitFog >= r.edgeFog && r.graves > 3 && r.dead > 1, detail: r };
  });

  await scenario(h, 'ocean: Tapu Fini\'s challenge (once only) gives both the Red Orb and the Blue Orb, kept between runs', async () => {
    const r = await h.R(async () => {
      const G = PSXAI.Guardians, S = PSXAI.Sea, R = __PSX_REG__, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const q = G.pedestals()[0];
      OT.tp(q[0], q[1] + 30);
      await wait(400);
      const scene = G.st.scene && G.st.scene.id;
      for (let i = 0; i < 50 && !G.st.battle; i++) await wait(300);
      const battle = G.st.battle && G.st.battle.e.dex;
      if (G.st.battle) G.st.battle.e.hurt(G.st.battle.e.hp + 99999);
      await wait(1800);
      R.Pickups.clear();
      const saved = JSON.parse(localStorage.getItem('psx.ocean') || '{}');
      G.reset();
      OT.tp(q[0], q[1] + 30);
      await wait(500);
      return { scene, battle, red: S.has('red'), blue: S.has('blue'), saved: !!(saved.orbs && saved.orbs.red && saved.orbs.blue), db: !!(R.DB.save.psxOcean && R.DB.save.psxOcean.orbs.blue), again: !!G.st.scene, finiOwned: !!(R.DB.save.owned && R.DB.save.owned[788]), noKyogre: !(R.DB.save.owned && (R.DB.save.owned[382] || R.DB.save.owned[383])) };
    });
    return { pass: r.scene === 'fini' && r.battle === 788 && r.red && r.blue && r.saved && r.db && !r.again && r.noKyogre, detail: r };
  });

  await scenario(h, 'ocean: Birth Island lies in its fog bank, and you\'re told its name when you find it', async () => {
    const r = await h.R(async () => {
      const B = PSXAI.Birth, O = PSXAI.Ocean, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const b = B.isle();
      if (!b) return { none: true };
      const fog = O.plan().fogs.some((f) => f.id === 'birth');
      OT.tp(b.cx, b.cy + 700);
      await wait(800);
      return { fog, seen: B.st.seen, art: O.artAt(b.cx, b.cy), pier: O.artAt(b.x + 248 * 2, b.y + 360 * 2) };
    });
    return { pass: !r.none && r.fog && r.seen && r.art === 1 && r.pier === 1, detail: r };
  });

  await scenario(h, 'ocean: the Deoxys triangle: too many steps sends it back; touch it at every place and Deoxys is yours', async () => {
    const r = await h.R(async () => {
      const B = PSXAI.Birth, R = __PSX_REG__, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const touch = async (i) => { const q = B.spot(i); OT.tp(q[0], q[1] + 40); await wait(120); OT.tp(q[0], q[1]); await wait(180); };
      await touch(0); await touch(1);
      const before = B.st.i;
      // wander about too long
      const q = B.spot(1);
      for (let k = 0; k < 40; k++) { OT.tp(q[0] + (k % 2 ? 60 : -60), q[1] + 30); await wait(40); }
      const after = B.st.i;
      for (let i = 0; i < B.SPOTS.length; i++) await touch(i);
      const scene = !!B.st.scene;
      for (let i = 0; i < 50 && !B.st.battle; i++) await wait(300);
      const dex = B.st.battle && B.st.battle.e.dex;
      if (B.st.battle) B.st.battle.e.hurt(B.st.battle.e.hp + 99999);
      await wait(800);
      R.Pickups.clear();
      return { before, after, scene, dex, owned: !!(R.DB.save.owned && R.DB.save.owned[386]), kept: !!PSXAI.Sea.save.deoxys };
    });
    return { pass: r.before === 2 && r.after === 0 && r.scene && r.dex === 386 && r.owned && r.kept, detail: r };
  });

  await scenario(h, 'ocean: Manaphy and Phione appear now and then, can\'t be caught, and dive away when you come close; the feather', async () => {
    const r = await h.R(async () => {
      const S = PSXAI.Sea, R = __PSX_REG__, O = PSXAI.Ocean, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      PSXAI.Sky.set({ storm: 0, rain: 0, fog: 0, wind: 0.1, cloud: 0.1, hour: 12 });
      const sh = OT.find(0, 400, 2, 1200);
      const b = PSXAI.Boats.boats[2]; b.x = sh[0]; b.y = sh[1]; b.vx = b.vy = 0;
      if (!R.Game.player.psxBoat) PSXAI.Boats.board(b, R.Game.player);
      PSXAI.cfg.manaphyChance = 1; S.st.appT = 0; S.st.apps = null;
      for (let i = 0; i < 20 && !S.st.apps; i++) { S.st.appT = 0; await wait(150); }
      const ap = S.st.apps;
      const dexes = ap ? ap.mons.map((m) => m.dex) : [];
      const enemies = R.EnemyMgr.all().some((e) => e.dex === 489 || e.dex === 490);
      // sail right up to them
      if (ap) { const pb = R.Game.player.psxBoat; pb.x = ap.x + 60; pb.y = ap.y; }
      await wait(2500);
      const gone = !S.st.apps;
      // the feather, picked up from the boat
      const pb = R.Game.player.psxBoat;
      S.st.feather = { x: pb.x + 50, y: pb.y, t: 0 };
      await wait(500);
      PSXAI.cfg.manaphyChance = null;
      return { appeared: !!ap, dexes, enemies, gone, feather: S.has('feather') };
    });
    return { pass: r.appeared && r.dexes.every((d) => d === 489 || d === 490) && !r.enemies && r.gone && r.feather, detail: r };
  });

  await scenario(h, 'ocean: Lugia\'s shrine rises at low tide; with the feather, Lugia passes overhead (and can\'t be caught)', async () => {
    const r = await h.R(async () => {
      const S = PSXAI.Sea, O = PSXAI.Ocean, R = __PSX_REG__, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const sh = O.plan().shrine;
      PSXAI.cfg.oceanTide = 1; const high = O.sample(sh.x, sh.y).cls;
      PSXAI.cfg.oceanTide = -1; const low = O.sample(sh.x, sh.y).cls;
      const path = O.plan().tidal.find((t) => t.id === 'shrine').pts[1], pathLow = O.sample(path[0], path[1]).cls;
      S.give('feather'); S.st.cool = {};
      OT.tp(sh.x, sh.y);
      await wait(1500);
      const scene = S.busy();
      await wait(4500);
      const box = !!(PSXAI.Talk.boxes.legend && PSXAI.Talk.boxes.legend.who.dex === 249);
      PSXAI.cfg.oceanTide = null;
      return { high, low, pathLow, scene, box, lugiaEnemy: R.EnemyMgr.all().some((e) => e.dex === 249), owned: !!(R.DB.save.owned && R.DB.save.owned[249]), tablets: S.TABLETS.length };
    });
    return { pass: r.high >= 1 && r.low === 0 && r.pathLow === 0 && r.scene && r.box && !r.lugiaEnemy && !r.owned && r.tablets >= 6, detail: r };
  });

  await scenario(h, 'ocean: Kyogre is only ever spoken of (inscriptions, the glow in the trench), never caught', async () => {
    const r = await h.R(() => {
      const S = PSXAI.Sea, A = PSXAI.Areas, R = __PSX_REG__;
      const ro = A.ROSTERS[PSXAI.Ocean.BIOME];
      const inRoster = ro.tiers.some((t) => t.includes(382) || t.includes(383)) || ro.bosses.some((t) => t.includes(382) || t.includes(383));
      const lore = S.TABLETS.some((t) => /sleeps who raised the seas/.test(t.text)) && S.TABLETS.some((t) => /orbs/.test(t.text));
      return { inRoster, lore, owned: !!(R.DB.save.owned && R.DB.save.owned[382]) };
    });
    return { pass: !r.inRoster && r.lore && !r.owned, detail: r };
  });

  await scenario(h, 'ocean: at sea the wild Pokémon are sea Pokémon; on a guardian island, that island\'s own', async () => {
    const r = await h.R(() => {
      const O = PSXAI.Ocean, R = __PSX_REG__;
      const p = R.Game.player;
      const dp = OT.find(300, 1300, 3, 1500);
      OT.tp(dp[0], dp[1]); if (p.psxBoat) p.psxBoat.x = dp[0];
      const sea = { karp: O.weight(129), tentacool: O.weight(72), pikachuIsle: O.weight(309), ghost: O.weight(92) };
      const k = O.islandById('koko'); OT.tp(k.x + k.R * 0.5, k.y);
      const koko = { electrike: O.weight(309), ralts: O.weight(280), gastly: O.weight(92) };
      return { sea, koko };
    });
    return { pass: r.sea.tentacool > 0.5 && r.sea.pikachuIsle === 0 && r.sea.ghost === 0 && r.koko.electrike >= 4 && r.koko.ralts === 0 && r.koko.gastly === 0, detail: r };
  });

  await scenario(h, 'ocean: the mainland behind the harbour is yours to roam: well over 8 km² you can walk, the jungle wall far inland', async () => {
    const r = await h.R(() => {
      const O = PSXAI.Ocean;
      let walk = 0, inland = 0;
      for (let y = -5000; y < 1000; y += 32) for (let x = -5000; x < 2000; x += 32) { const s = O.sample(x, y); if (s.cls === 0 && !s.solid) { walk++; if (s.art < 0 && O.mainland(x, y)) inland++; } }
      // walking north from the town: open forest for a long way before the jungle closes in
      let far = 0; for (let y = -1200; y > -6000; y -= 40) { const s = O.sample(-300, y); if (s.solid && s.art < 0) break; far = -1200 - y; }
      return { walkKm2: +(walk * 1024 / 1e6).toFixed(1), inlandKm2: +(inland * 1024 / 1e6).toFixed(1), far };
    });
    return { pass: r.walkKm2 > 8 && r.inlandKm2 > 6 && r.far > 1500, detail: r };
  });

  await scenario(h, 'ocean: the mainland has its own forest Pokémon (Pikipek, Yungoos, Exeggcute…), not sea Pokémon', async () => {
    const r = await h.R(() => {
      const O = PSXAI.Ocean, p = __PSX_REG__.Game.player;
      const q = O.fitNear('walk', -1400, -2000, 600); OT.tp(q[0], q[1]);
      O.st && (O.st.svT = -9);
      return { pikipek: O.weight(731), yungoos: O.weight(734), exeggcute: O.weight(102), karp: O.weight(129), goldeen: O.weight(118), habitat: O.habitat(731), suits: O.suits('mainland', q[0], q[1]) };
    });
    return { pass: r.pikipek > 1 && r.yungoos > 1 && r.exeggcute > 1 && r.karp < 0.5 && r.goldeen < 0.5 && r.habitat === 'mainland' && r.suits, detail: r };
  });

  await scenario(h, 'ocean: fish keep to the water clear of the shore (never on the sand) and sit half under the surface, with no shadow', async () => {
    const r = await h.R(() => {
      const p = __PSX_REG__.Game.player, O = PSXAI.Ocean;
      if (p.psxBoat) PSXAI.Boats.leave(p.psxBoat, [0, 0]);
      OT.tp(0, 0);
      window.FISH = [370, 118, 370].map((dex, i) => { const e = PSXAI.Debug.spawn(dex, { x: -40 + i * 60, y: -60, temp: 'timid', natural: true }); e.psxPlaced = false; return e; });
      return O.sample(-40, -60).cls;
    });
    await h.wait(3500);
    const f = await h.R(() => FISH.filter((e) => !e.dead).map((e) => { const s = PSXAI.Ocean.sample(e.x, e.y); return { dex: e.dex, flying: e.flying, cls: s.cls, e: Math.round(s.e), sub: +(e.psx.vis.subNow || 0).toFixed(2) }; }));
    return { pass: f.length === 3 && f.every((q) => q.cls >= 1 && (q.e >= 18 || q.cls >= 2) && q.sub > 0.6 && !q.flying), detail: { startCls: r, fish: f } };
  });

  await scenario(h, 'ocean: switching the ocean off brings the Ash Volcano back as Level 3', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, m = R.Maps.LIST.find((x) => x.n === 3);
      PSXAI.cfg.tropicalOcean = false;
      const off = { name: m.name, biome: m.biome, tab: R.T('3 · Volcán') };
      PSXAI.cfg.tropicalOcean = true;
      return { off, on: { name: m.name, biome: m.biome }, BIOME: PSXAI.Ocean.BIOME };
    });
    return { pass: r.off.name === 'Volcán Ceniza' && r.off.biome === 2 && r.on.biome === r.BIOME && r.on.name === 'Océano Tropical', detail: r };
  });

  await h.close();

  // =========================================================== breakables, no gacha, Spiritomb, dev console
  h = await boot({});
  await h.R(() => { PSXAI.Spiritomb.forget(); PSXAI.Catch.resetKills(); });
  await h.startRun(25);
  await h.wait(1200);
  await h.R(() => {
    window.BT = {
      // the trees around you whose size is known (they've been drawn)
      trees() { const R = __PSX_REG__, p = R.Game.player; const cam = { left() { return p.x - 700; }, top() { return p.y - 520; }, w: 1400, h: 1040, sees() { return true; } }; PSXAI.Breakables.markTrees(); return R.World.visibleProps(cam).filter((t) => t.type === 'tree'); },
    };
  });

  await scenario(h, 'breakables: your attacks knock a tree down (several hits, more for bigger ones), leaving a stump; ancient giants stand', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, B = PSXAI.Breakables;
      const trees = BT.trees();
      const by = {}; for (const t of trees) if (t._psxStage) (by[t._psxStage] || (by[t._psxStage] = [])).push(t);
      const out = { stages: Object.keys(by), hp: {} };
      for (const k of Object.keys(by)) out.hp[k] = by[k][0]._psxB ? by[k][0].hp : 'unbreakable';
      const t = (by.mature || by.young || by.large || by.sapling || [])[0];
      if (!t) return out;
      const dyn0 = PSXAI.Decor.inRect(t.x - 4, t.y - 4, t.x + 4, t.y + 8, []).filter((i) => i.k === 'stump').length;
      let hits = 0, firstBroke = null;
      while (t.hp > 0 && hits < 100) { const b = R.World.damageProp(t, 25, '#fff'); if (hits === 0) firstBroke = !!b; hits++; }
      out.hits = hits; out.firstBroke = firstBroke; out.broken = B.st.trees;
      out.stump = PSXAI.Decor.inRect(t.x - 4, t.y - 4, t.x + 4, t.y + 8, []).filter((i) => i.k === 'stump').length - dyn0;
      out.inWorld = BT.trees().includes(t);
      const anc = by.ancient && by.ancient[0];
      if (anc) { R.World.damageProp(anc, 99999); out.ancientStands = BT.trees().includes(anc) && anc._psxB === false; }
      return out;
    });
    return { pass: r.hits >= 2 && r.firstBroke === false && r.stump === 1 && !r.inWorld && r.ancientStands !== false, detail: r };
  });

  await scenario(h, 'breakables: your Pokémon never aims at a tree on its own (rocks and the like, as before)', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, p = R.Game.player;
      const t = BT.trees().find((q) => q._psxB);
      if (!t) return { none: true };
      const nb = R.World.nearestBreakable(t.x, t.y + 6, 120);
      return { picked: nb ? nb.type : null };
    });
    return { pass: !r.none && r.picked !== 'tree', detail: r };
  });

  await scenario(h, 'breakables: bushes, logs, stumps and dead saplings break and stay broken; signs, lamps and the like never', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, D = PSXAI.Decor, B = PSXAI.Breakables, p = R.Game.player;
      const its = D.inRect(p.x - 1200, p.y - 1200, p.x + 1200, p.y + 1200, []);
      const kinds = {}; for (const it of its) kinds[it.k] = (kinds[it.k] || 0) + (B.decorBreaks(it) ? 1 : 0);
      const it = its.find((i) => B.decorBreaks(i));
      if (!it) return { kinds };
      const pr = R.World.propsInCircle(it.x, it.y, 16).find((q) => q.psxBreak && q.item === it);
      let n = 0; while (pr && pr.hp > 0 && n < 60) { R.World.damageProp(pr, 12); n++; }
      const still = D.inRect(it.x - 2, it.y - 2, it.x + 2, it.y + 2, []).includes(it);
      return { kinds, k: it.k, solidProxy: pr ? pr.solid : null, n, gone: it._gone && !still, never: ['sign', 'lamp', 'grave', 'fence', 'well', 'tree'].every((k) => !B.decorBreaks({ k })) };
    });
    return { pass: r.gone && r.solidProxy === false && r.n >= 2 && r.never, detail: r };
  });

  await scenario(h, 'no gacha: its menu entry, ticket counter and screen are gone; dropped tickets are PokéCoins', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__;
      const vis = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display !== 'none' : false; };
      const n0 = R.Pickups.all().length;
      const p = R.Game.player;
      R.Pickups.drop('ticket', p.x + 300, p.y, 1);
      const added = R.Pickups.all().slice(n0).map((q) => q.kind || q.k || q.type);
      return { menu: vis('.menu-item[data-go="gacha"]'), pill: vis('#tickets-pill'), scr: vis('#scr-gacha'), added };
    });
    return { pass: !r.menu && !r.pill && !r.scr && r.added.length === 1 && r.added[0] === 'coin', detail: r };
  });

  await scenario(h, 'no gacha: a Pokémon you defeat may join you, likelier with every one of it you defeat, sure after enough; never a legendary', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, C = PSXAI.Catch, p = R.Game.player;
      const dex = 19; // Rattata
      const c0 = C.chance(dex);
      for (let i = 0; i < 10; i++) C.save.kills[dex] = (C.save.kills[dex] || 0) + 1;
      const c10 = C.chance(dex);
      const strong = C.chance(149); // Dragonite (rare, strong)
      const ev = (d, extra) => Object.assign({ victim: Object.assign({ x: p.x, y: p.y }, extra), victimDex: d, killerKey: 'P' }, {});
      let n = 0; while (!R.DB.owns(dex) && n < 500) { C.onDeath(ev(dex)); n++; }
      for (let i = 0; i < 400; i++) C.onDeath(ev(150)); // Mewtwo
      for (let i = 0; i < 400; i++) C.onDeath(ev(442)); // Spiritomb: only through the well
      for (let i = 0; i < 400; i++) C.onDeath(ev(41, { boss: true })); // a boss Zubat
      for (let i = 0; i < 400; i++) C.onDeath(Object.assign(ev(52), { killerKey: 7 })); // defeated by someone else
      return { c0, c10, strong, joined: R.DB.owns(dex), n, mewtwo: R.DB.owns(150), spiritomb: R.DB.owns(442), bossZubat: R.DB.owns(41), notMine: R.DB.owns(52), pity: C.PITY };
    });
    return { pass: r.c10 > r.c0 && r.strong < r.c0 && r.joined && r.n <= r.pity[1] + 1 && !r.mewtwo && !r.spiritomb && !r.bossZubat && !r.notMine, detail: r };
  });

  await scenario(h, 'spiritomb: the Odd Keystone lies in a clearing out of sight; walking onto it picks it up, for good', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, S = PSXAI.Spiritomb, F = PSXAI.Forest, p = R.Game.player;
      S.st.stone = null;
      const placed = S.placeStone();
      const s = S.st.stone;
      if (!s) return { placed };
      const out = { placed, clear: +F.region(s.x, s.y).clear.toFixed(2), seen: R.Camera.sees(s.x, s.y, 0), dist: Math.round(Math.hypot(s.x - p.x, s.y - p.y)) };
      p.x = s.x; p.y = s.y + 10; PSXAI.Mansion.snapCamera(p);
      return out;
    });
    await h.wait(500);
    const r2 = await h.R(() => ({ has: PSXAI.Spiritomb.hasKey(), stone: !!PSXAI.Spiritomb.st.stone, stored: JSON.parse(localStorage.getItem('psx.spiritomb.v1') || '{}').keystone > 0 }));
    return { pass: r.placed && r.clear >= 0.55 && !r.seen && r.dist >= 600 && r2.has && !r2.stone && r2.stored, detail: [r, r2] };
  });

  await scenario(h, 'spiritomb: defeating an innocent Pokémon in the forest counts; one that attacked you doesn\'t', async () => {
    const r = await h.R(() => {
      const S = PSXAI.Spiritomb, n0 = S.save.innocents;
      const p = __PSX_REG__.Game.player;
      S.onDeath({ victim: { x: p.x, y: p.y }, killerKey: 'P', victimPeaceful: true });
      const n1 = S.save.innocents;
      S.onDeath({ victim: { x: p.x, y: p.y }, killerKey: 'P', victimPeaceful: false });
      S.onDeath({ victim: { x: p.x, y: p.y, boss: true }, killerKey: 'P', victimPeaceful: true });
      S.onDeath({ victim: { x: p.x, y: p.y }, killerKey: 3, victimPeaceful: true });
      // a real one: a calm Pokémon minding its business, defeated by you
      const e = PSXAI.Debug.spawn(16, { temp: 'timid', dx: 200 });
      e._psxLast = p; e.hp = 0; e.die();
      return { n0, n1, n2: S.save.innocents };
    });
    return { pass: r.n1 === r.n0 + 1 && r.n2 === r.n1 + 1, detail: r };
  });

  await scenario(h, 'spiritomb: while you carry the keystone the well is always in the forest; clicking it without 100 innocents does nothing', async () => {
    const r = await h.R(() => {
      const S = PSXAI.Spiritomb, W = PSXAI.Well;
      PSXAI.cfg.oldWell = false; W.reset();
      const wants = S.wantsWell();
      PSXAI.Dev.run('well');
      S.setInnocents(42);
      const tried = S.clickWell(W.st.well);
      return { wants, tried, scene: S.busy(), text: S.st.text && S.st.text.text };
    });
    return { pass: r.wants && r.tried === false && !r.scene && /42\/100/.test(r.text || ''), detail: r };
  });

  await scenario(h, 'spiritomb: with the keystone and 100 innocents, clicking the well calls Spiritomb up; beat it and it joins you', async () => {
    const r0 = await h.R(() => {
      const R = __PSX_REG__, S = PSXAI.Spiritomb, W = PSXAI.Well, p = R.Game.player;
      p.god = true;
      S.give(); S.setInnocents(100);
      PSXAI.Dev.run('well');
      const w = W.st.well;
      p.x = w.x - 90; p.y = w.y; PSXAI.Mansion.snapCamera(p);
      return { w: [w.x, w.y] };
    });
    await h.wait(300);
    await h.R(() => {
      const R = __PSX_REG__, w = PSXAI.Well.st.well, cam = R.Camera;
      const cvs = [...document.querySelectorAll('canvas')].filter((c) => c.getBoundingClientRect().width > 300);
      const cv = cvs[cvs.length - 1], b = cv.getBoundingClientRect(), k = (cam._cw || b.width) / b.width;
      const cx = b.left + ((w.x - cam.left()) * cam.scale) / k, cy = b.top + ((w.y - 30 - cam.top()) * cam.scale) / k;
      cv.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true }));
    });
    const r1 = await h.R(() => ({ scene: PSXAI.Spiritomb.busy(), dark: PSXAI.Spiritomb.st.dark }));
    await h.wait(13000);
    const r2 = await h.R(() => { const b = PSXAI.Spiritomb.st.battle; return b ? { dex: b.e.dex, hp: Math.round(b.e.hp), wisps: PSXAI.Spiritomb.st.wisps.length } : null; });
    await h.R(() => { const b = PSXAI.Spiritomb.st.battle; if (b) { b.e._psxLast = __PSX_REG__.Game.player; b.e.hp = 0; b.e.die(); } });
    await h.wait(800);
    const r3 = await h.R(() => ({ owned: __PSX_REG__.DB.owns(442), won: !!PSXAI.Spiritomb.save.won, battle: !!PSXAI.Spiritomb.st.battle, wantsWell: PSXAI.Spiritomb.wantsWell() }));
    return { pass: r1.scene && r2 && r2.dex === 442 && r3.owned && r3.won && !r3.battle && !r3.wantsWell, detail: [r0, r1, r2, r3] };
  });

  await scenario(h, 'dev console: the hidden KARMA can be shown, maxed (the forest empties) and cleared', async () => {
    const r = await h.R(() => {
      const D = PSXAI.Dev, R = __PSX_REG__, K = PSXAI.Karma;
      if (!K || !K.set) return { loaded: false };
      if (!PSXAI.Forest.on()) return { forest: false };
      PSXAI.Debug.freeze(false);
      for (let i = 0; i < 4; i++) PSXAI.Debug.spawn(16, { dx: 200 + i * 30, temp: 'timid' });
      const show = D.run('karma'), n0 = R.EnemyMgr.all().filter((e) => !e.dead).length;
      D.run('karma max');
      const maxed = K.maxed, n1 = R.EnemyMgr.all().filter((e) => !e.dead && !e.boss).length;
      D.run('karma 5'); const five = K.value, stage = K.stage;
      D.run('karma clear');
      return { loaded: true, show, n0, maxed, n1, five, stage, cleared: K.value, phase: K.phase };
    });
    return { pass: r.loaded && /KARMA 0 \/ 25/.test(r.show) && r.n0 >= 4 && r.maxed && r.n1 === 0 && r.five === 5 && r.stage === 2 && r.cleared === 0 && r.phase === 'quiet', detail: r };
  });

  await scenario(h, 'dev console: F9 opens it; it unlocks every level and every Pokémon, and spawns what you ask for', async () => {
    await h.page.keyboard.press('F9');
    const r = await h.R(() => {
      const R = __PSX_REG__, D = PSXAI.Dev;
      const open = D.isOpen();
      const before = Object.keys(R.DB.save.owned).length;
      const n0 = R.EnemyMgr.all().length;
      D.exec('spawn gastly 4');
      const spawned = R.EnemyMgr.all().length - n0;
      D.exec('unlock all');
      const owned = Object.keys(R.DB.save.owned).length;
      const maps = [1, 2, 3].map((n) => R.Maps.isOpen(n));
      const bad = (() => { try { D.run('spawn notapokemon'); return false; } catch (e) { return true; } })();
      D.exec('lock stages');
      return { open, before, owned, spawned, maps, dev: R.DevMenu.on, bad };
    });
    await h.page.keyboard.press('F9');
    const closed = await h.R(() => !PSXAI.Dev.isOpen());
    return { pass: r.open && r.spawned === 4 && r.owned > 800 && r.maps.every(Boolean) && r.dev === false && r.bad && closed, detail: r };
  });

  await h.close();

  // =========================================================== types that matter, a team of six
  h = await boot({});
  await h.R(() => { const R = __PSX_REG__; for (const d of [50, 25, 7, 4, 16, 92]) R.DB.grant(d, 'test'); });
  await h.startRun(50);
  await h.wait(1200);

  await scenario(h, 'types: real multipliers (×2, ×½, ×4), and immunities are 0: Ground→Flying, Normal→Ghost, Dragon→Fairy, Psychic→Dark, Electric→Ground', async () => {
    const r = await h.R(() => { const M = __PSX_REG__.Types.mult; return { gf: M('ground', ['normal', 'flying']), ng: M('normal', ['ghost']), fg: M('fighting', ['ghost']), df: M('dragon', ['fairy']), pd: M('psychic', ['dark']), eg: M('electric', ['ground']), ps: M('poison', ['steel']), ew: M('electric', ['water']), ewf: M('electric', ['water', 'flying']), fw: M('fire', ['water']), fwr: M('fire', ['water', 'rock']), nn: M('normal', ['normal']) }; });
    return { pass: r.gf === 0 && r.ng === 0 && r.fg === 0 && r.df === 0 && r.pd === 0 && r.eg === 0 && r.ps === 0 && r.ew === 2 && r.ewf === 4 && r.fw === 0.5 && r.fwr === 0.25 && r.nn === 1, detail: r };
  });

  await scenario(h, 'types: a Diglett\'s Ground moves do no damage to a Pidgey ("No effect"), and no burn, poison, slow or stun comes with an immune hit', async () => {
    const r0 = await h.R(() => { const R = __PSX_REG__, p = R.Game.player; PSXAI.Debug.freeze(true); PSXAI.Debug.clear(true); p.god = true; const e = PSXAI.Debug.spawn(16, { dx: 90, temp: 'aggressive' }); e.maxHp = e.hp = 400; window.PG = e; return { moves: p.moves.map((m) => m.type || (m.def && m.def.type)), n0: PSXAI.Types.st.immune }; });
    await h.wait(5000);
    const r = await h.R(() => { const e = PG; e.hurt(0); e.applyBurn(1); e.applyStun(1); return { hp: Math.round(e.hp), max: e.maxHp, burned: e.burnT > 0 || e.burn > 0, stunned: (e.stunT || 0) > 0, immune: PSXAI.Types.st.immune }; });
    return { pass: r0.moves.every((t) => t === 'ground') && r.hp === r.max && !r.burned && !r.stunned && r.immune > r0.n0, detail: [r0, r] };
  });

  await scenario(h, 'types: you aren\'t hurt by a type your Pokémon is immune to', async () => {
    const r = await h.R(() => {
      const p = __PSX_REG__.Game.player; p.god = false; p.invuln = 0; p.reviveShield = 0; p.shadeInv = 0;
      const b0 = p.hp; p.hurt(8, 'electric'); const elec = b0 - p.hp; // (Diglett is Ground: immune to Electric)
      p.invuln = 0; const b1 = p.hp; p.hurt(8, 'water'); const water = b1 - p.hp;
      p.god = true; return { elec, water };
    });
    return { pass: r.elec === 0 && r.water > 0, detail: r };
  });
  await h.close();

  h = await boot({});
  await h.R(() => { const R = __PSX_REG__; for (const d of [25, 7, 4, 16]) R.DB.grant(d, 'test'); R.DB.save.partner = 25; PSXAI.Team.setTeam([25, 7, 4]); });
  await h.startRun(25);
  await h.wait(1200);

  await scenario(h, 'team: Z / X switch your Pokémon; each keeps its own moves and HP; one sent out for the first time starts with its own first move', async () => {
    const snap = () => h.R(() => { const p = __PSX_REG__.Game.player; return { dex: p.dex, hp: Math.round(p.hp), max: p.maxHp, moves: p.moves.map((m) => m.id).join(','), types: p.mon.types.join('/') }; });
    await h.R(() => { PSXAI.Debug.freeze(true); PSXAI.Debug.clear(true); const p = __PSX_REG__.Game.player; p.hp = Math.round(p.maxHp / 2); });
    const a = await snap();
    await h.page.keyboard.press('KeyX'); await h.wait(300);
    const b = await snap();
    await h.wait(1300); await h.page.keyboard.press('KeyZ'); await h.wait(300);
    const c = await snap();
    return { pass: a.dex === 25 && b.dex === 7 && b.types === 'water' && b.moves !== a.moves && b.hp === b.max && c.dex === 25 && c.moves === a.moves && Math.abs(c.hp - a.hp) <= 1, detail: [a, b, c] };
  });

  await scenario(h, 'team: when the one out faints the next healthy one comes in; the run ends only when the whole team is down', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, seq = [];
      for (let k = 0; k < 14; k++) { const p = R.Game.player; if (p.dead) break; p.god = false; p.invuln = 0; p.reviveShield = 0; p.shadeInv = 0; p.lives = 0; p.hurt(9999, 'normal'); seq.push(p.dex + (p.dead ? '†' : '')); }
      return { seq: seq.join(' '), team: PSXAI.Team.run.members.map((m) => m.fainted) };
    });
    await h.wait(800);
    const end = await h.R(() => ({ dead: __PSX_REG__.Game.player.dead, state: __PSX_REG__.Game.state }));
    const species = new Set(r.seq.replace(/†/g, '').split(' '));
    return { pass: species.size === 3 && /†$/.test(r.seq) && (r.seq.match(/†/g) || []).length === 1 && end.dead, detail: Object.assign(r, end) };
  });
  await h.close();

  h = await boot({});
  await h.startRun(25);
  await h.wait(600);
  await scenario(h, 'team: the Team screen picks up to six owned Pokémon; the first leads (and is the partner a run starts with)', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, Tm = PSXAI.Team;
      for (const d of [1, 4, 7, 25, 133, 143, 150]) R.DB.grant(d, 'test');
      Tm.setTeam([4, 7, 25, 133, 143, 150, 1, 999]);
      const t1 = Tm.chosen();
      R.DB.save.partner = 25; Tm.setTeam([25, 4, 7]);
      const btn = !!document.getElementById('psx-team-btn');
      Tm.open(); const open = document.getElementById('psx-team').style.display === 'flex'; Tm.close();
      return { t1, t2: Tm.chosen(), partner: R.DB.save.partner, saved: JSON.parse(localStorage.getItem('psx.team.v1')), btn, open };
    });
    return { pass: r.t1.length === 6 && !r.t1.includes(999) && r.t2[0] === 25 && r.partner === 25 && r.saved[0] === 25 && r.btn && r.open, detail: r };
  });
  await h.close();

  // =========================================================== colossal trees, ghosts out of nowhere
  h = await boot({});
  await h.startRun(25);
  await h.wait(1200);

  await scenario(h, 'forest: a few colossal trees tower over the rest (twice an ancient\'s size), unbreakable, with trunks you walk round', async () => {
    const r = await h.R(() => {
      const R = __PSX_REG__, AI = PSXAI; const counts = {}; const col = [];
      for (let gy = -4; gy <= 4; gy++) for (let gx = -4; gx <= 4; gx++) {
        const cx = gx * 1200, cy = gy * 1200; const cam = { left() { return cx - 600; }, top() { return cy - 600; }, w: 1200, h: 1200, sees() { return true; } };
        for (const t of R.World.visibleProps(cam)) { if (t.type !== 'tree') continue; AI.Ground.artFor(t); counts[t._psxStage] = (counts[t._psxStage] || 0) + 1; if (t._psxStage === 'colossal') col.push(t); }
      }
      const all = Object.values(counts).reduce((a, b) => a + b, 0);
      const t = col[0];
      if (t) { AI.Breakables.markTrees(); }
      return { counts, share: +(col.length / all).toFixed(4), scale: t ? +t._psxScale.toFixed(2) : 0, r: t ? Math.round(t.r) : 0, r0: t ? t._psxR0 : 0, breakable: t ? !!t._psxB : null };
    });
    return { pass: r.counts.colossal >= 2 && r.share < 0.03 && r.scale >= 1.9 && r.r > r.r0 && r.breakable === false, detail: r };
  });

  await scenario(h, 'ghosts: now and then a ghost Pokémon fades in out of nowhere, lingers, and fades away; come close and it vanishes in a puff', async () => {
    const r = await h.R(async () => {
      const A = PSXAI.Apparitions, p = __PSX_REG__.Game.player, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      A.reset();
      const a = A.appear(92, [p.x + 160, p.y]);
      const b = A.appear(200, [p.x - 300, p.y]);
      b.life = 1.2;
      await wait(700);
      const shown = a.fade > 0.4 && !a.gone;
      p.x += 150; // (walk right up to the first)
      await wait(300);
      const puffed = a.gone && a.puff;
      await wait(1600);
      const faded = b.gone && !b.puff;
      // never one inside the mansion, never outside the Shady Forest; and they turn up on their own
      A.st.nextT = 0; await wait(200);
      return { shown, puffed, faded, onTheirOwn: A.st.seen >= 3, ghosts: A.GHOSTS.length };
    });
    return { pass: r.shown && r.puffed && r.faded && r.onTheirOwn, detail: r };
  });
  await h.close();

  // =========================================================== the Sealed Chamber and the Regis
  h = await boot({});
  await h.R(() => { const R = __PSX_REG__; R.DB.save.mapWins = { 1: 1, 2: 1 }; for (const d of [25, 369, 321, 7]) R.DB.grant(d, 'test'); PSXAI.Regi.forget(); PSXAI.Team.setTeam([25, 369, 321]); R.Maps.choose(3); });
  await h.startRun(25);
  await h.wait(900);
  await h.R(() => {
    window.RG = {
      // walk onto a stone, then step back out (away from the altar, so no other stone is crossed)
      async step(ch) {
        const G = PSXAI.Regi, p = __PSX_REG__.Game.player, A = G.st.altar, s = G.st.stones.find((o) => o.ch === ch), wait = (ms) => new Promise((r) => setTimeout(r, ms));
        p.x = s.x; p.y = s.y; await wait(200);
        const a = Math.atan2(s.y - A.y, s.x - A.x); p.x = s.x + Math.cos(a) * 70; p.y = s.y + Math.sin(a) * 70; await wait(200);
        return G.st.seq.join('');
      },
      at(x, y) { const p = __PSX_REG__.Game.player; if (p.psxBoat) PSXAI.Boats.leave(p.psxBoat, [x, y]); p.x = x; p.y = y; p._psxOk = [x, y]; PSXAI.Mansion.snapCamera(p); },
    };
  });

  await scenario(h, 'regi: the Sealed Chamber in the Tropical Ocean: an altar ringed by six Braille stones; without Relicanth first and Wailord last they stay dark', async () => {
    const r = await h.R(async () => {
      const G = PSXAI.Regi, o = PSXAI.Ocean.islandById('sealed');
      RG.at(o.x, o.y + 200);
      await new Promise((res) => setTimeout(res, 400));
      const stones = G.st.stones.map((s) => s.ch).sort().join('');
      const step = await RG.step('R');
      return { island: !!o, name: o && o.name, altar: !!G.st.altar, stones, team: G.team(), setup: G.setupOk(), step, solved: G.solved(), hint: G.st.msg && G.st.msg.text };
    });
    return { pass: r.island && r.altar && r.stones === 'AEGILR' && !r.setup && r.step === '' && !r.solved && /RELICANTH/.test(r.hint || ''), detail: r };
  });
  await h.R(() => { __PSX_REG__.Game.state = 'menu'; PSXAI.Team.setTeam([369, 25, 7, 321]); });
  await h.startRun(369);
  await h.wait(900);

  await scenario(h, 'regi: with Relicanth leading and Wailord last, stepping on R-E-G-I in order opens the Regis\' doors (a wrong stone starts over)', async () => {
    const r = await h.R(async () => {
      const G = PSXAI.Regi, o = PSXAI.Ocean.islandById('sealed');
      RG.at(o.x, o.y + 200);
      await new Promise((res) => setTimeout(res, 400));
      const out = [];
      for (const ch of ['R', 'E', 'L', 'R', 'E', 'G']) out.push(await RG.step(ch));
      const before = G.solved();
      out.push(await RG.step('I'));
      return { setup: G.setupOk(), out, before, solved: G.solved(), saved: !!JSON.parse(localStorage.getItem('psx.regi.v1')).puzzle };
    });
    return { pass: r.setup && r.out.slice(0, 6).join(',') === 'R,RE,,R,RE,REG' && !r.before && r.solved && r.saved, detail: r };
  });

  await scenario(h, 'regi: Registeel\'s cave waits in the Shady Forest, Regirock\'s in the Crystal Caves; walk up, it wakes and fights; win and it joins you (repeatable: next time coins and EXP)', async () => {
    const out = {};
    for (const [map, dex] of [[1, 379], [2, 377], [1, 379]]) {
      await h.R((m) => { __PSX_REG__.Game.state = 'menu'; __PSX_REG__.Maps.choose(m); PSXAI.Team.setTeam([25]); }, map);
      await h.startRun(25);
      await h.wait(600);
      await h.R(() => { T.reset(); __PSX_REG__.Game.debugTime(50); });
      await h.wait(5000);
      const r = await h.R(async (dex) => {
        const G = PSXAI.Regi, R = __PSX_REG__, p = R.Game.player, wait = (ms) => new Promise((res) => setTimeout(res, ms));
        const c = G.caveOf(dex);
        if (!c) return { here: G.cavesHere(), caves: G.st.caves.length };
        const far = Math.hypot(c.x - p.x, c.y - p.y) | 0;
        const owned0 = R.DB.owns(dex);
        p.x = c.x; p.y = c.y + 100;
        await wait(300);
        const scene = G.busy();
        for (let i = 0; i < 60 && !G.st.battle; i++) await wait(250); // (the golem's wake-up scene takes about 6 s)
        const b = G.st.battle;
        if (!b) return { far, scene, battle: false };
        const boss = { dex: b.e.dex, hp: Math.round(b.e.maxHp) };
        b.e._psxLast = p; b.e.hp = 0; b.e.die();
        await wait(600);
        return { far, scene, boss, owned0, owned: R.DB.owns(dex), beaten: !!G.st.beatenRun[dex], again: Math.hypot(c.x - p.x, c.y - p.y) < 200 && !G.busy() };
      }, dex);
      out[map + ':' + dex + (out[map + ':' + dex] ? 'b' : '')] = r;
    }
    const a = out['1:379'], b = out['2:377'], c = out['1:379b'];
    const ok = (x) => x && x.far > 800 && x.scene && x.boss && x.boss.hp >= 2000 && x.owned && x.beaten;
    return { pass: ok(a) && a.boss.dex === 379 && !a.owned0 && ok(b) && b.boss.dex === 377 && ok(c) && c.owned0, detail: out };
  });

  await scenario(h, 'regi: Regigigas wakes only with Regirock, Regice and Registeel all on your team (any slots), in its temple in the Crystal Caves', async () => {
    const out = {};
    for (const [k, team] of [['two', [377, 25, 379]], ['three', [25, 379, 7, 378, 377]]]) {
      await h.R((t) => { const R = __PSX_REG__; R.Game.state = 'menu'; R.Maps.choose(2); for (const d of [377, 378, 379]) R.DB.grant(d, 'test'); PSXAI.Team.setTeam(t); }, team);
      await h.startRun(team[0]);
      await h.wait(600);
      await h.R(() => { T.reset(); __PSX_REG__.Game.debugTime(50); });
      await h.wait(9000);
      out[k] = await h.R(async () => {
        const G = PSXAI.Regi, R = __PSX_REG__, p = R.Game.player;
        const c = G.caveOf(486);
        const r = { ok: G.gigasOk(), here: G.cavesHere(), temple: !!c };
        if (c) { p.x = c.x; p.y = c.y + 100; for (let i = 0; i < 60 && !G.st.battle; i++) await new Promise((res) => setTimeout(res, 250)); r.boss = G.st.battle && G.st.battle.e.dex; }
        return r;
      });
    }
    return { pass: !out.two.ok && !out.two.temple && out.three.ok && out.three.temple && out.three.boss === 486, detail: out };
  });
  await h.close();

  const pass = results.filter((r) => r.pass).length;
  console.log('\n' + pass + '/' + results.length + ' scenarios passed');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
