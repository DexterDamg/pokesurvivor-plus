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
    AI.Player.lanternToggle = null;
    return true;
  };
  T.dist = (e) => { const p = R.Game.player; return Math.hypot(e.x - p.x, e.y - p.y); };
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
    await h.R(() => { PSXAI.Debug.freeze(false); __PSX_REG__.Game.debugSpeed(2); window.SEEN = new Set(); });
    const r = await h.R(async () => {
      const R = __PSX_REG__;
      const ro = PSXAI.Areas.roster();
      const early = new Set([...ro.tiers[0], ...ro.tiers[1]]);
      const cast0 = R.Enemies.cast[0].list.map((d) => d.dex);
      return { biome: PSXAI.Env.biome(), cast0, castOk: cast0.every((d) => early.has(d)), maxBst: Math.max(...cast0.map((d) => R.DEX_BY[d].bst)) };
    });
    const s = await sample(h, 9000, 500, () => { for (const e of __PSX_REG__.EnemyMgr.all()) if (e.psx && !e.boss) SEEN.add(e.dex); return SEEN.size; });
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
    await h.R(() => { window.X0 = [A.x, A.y]; PSXAI.Bus.emit({ type: 'gust', x: 0, y: 0, loud: 0, power: 1.4 }); PSXAI.Bus.emit({ type: 'gust', x: 0, y: 0, loud: 0, power: 1.4 }); PSXAI.Bus.emit({ type: 'gust', x: 0, y: 0, loud: 0, power: 1.4 }); });
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
    await h.R(() => { PSXAI.Sky.set({ hour: 0.5, day: 4 }); PSXAI.Player.lanternToggle = true; });
    await h.wait(700);
    const night = await lum();
    return { pass: night.corner < day.corner * 0.55 && night.center > night.corner * 1.4, detail: { day, night } };
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

  await scenario(h, 'the abandoned trail: clues, a lantern that flickers without wind, and a frightened Hoothoot', async () => {
    const info = await h.R(() => {
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
    await h.R(() => { const p = __PSX_REG__.Game.player, t = PSXAI.Decor.trail; p.x = t.start[0] - 80; p.y = t.start[1] + 40; });
    await h.wait(5000);
    const r = await h.R(() => ({ warned: PSXAI.Lore.says.some((s) => s.e === PSXAI.Lore.st.hoot) || PSXAI.Lore.st.hoot && PSXAI.Lore.st.hoot.psx.mind.emo.fear > 0.5, fear: PSXAI.Lore.st.hoot ? +PSXAI.Lore.st.hoot.psx.mind.emo.fear.toFixed(2) : null }));
    await h.R(() => { PSXAI.Lore.st.allowHoot = false; const p = __PSX_REG__.Game.player; p.x = 0; p.y = 0; });
    const need = ['sign', 'gallows', 'fence', 'wraith', 'path'];
    return { pass: need.every((k) => info.kinds.includes(k)) && info.minFlame < 0.3 && spawned && r.warned, detail: { ...info, hoothoot: spawned, ...r } };
  });

  await scenario(h, 'in thick fog, Pokémon refuse to go near the old trail', async () => {
    const r0 = await h.R(() => {
      const t = PSXAI.Decor.trail;
      const p = __PSX_REG__.Game.player;
      p.x = t.pts[5][0] + 300; p.y = t.pts[5][1];
      window.A = PSXAI.Debug.spawn(161, { temp: 'neutral', x: t.pts[6][0], y: t.pts[6][1] + 20 });
      PSXAI.Sky.set({ fog: 0.9, hour: 15 });
      return PSXAI.Decor.trailZone(A.x, A.y);
    });
    await h.wait(5000);
    const r = await h.R(() => ({ zone: +PSXAI.Decor.trailZone(A.x, A.y).toFixed(2), fear: +A.psx.mind.emo.fear.toFixed(2) }));
    await h.R(() => { const p = __PSX_REG__.Game.player; p.x = 0; p.y = 0; });
    return { pass: r0 > 0.2 && r.zone < r0 * 0.8 && r.fear > 0.2, detail: { start: +r0.toFixed(2), ...r } };
  });

  await scenario(h, 'new arrivals emerge naturally instead of popping up in plain view', async () => {
    await h.R(() => {
      const R = __PSX_REG__;
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
  await scenario(h, 'lamps stand only at the old trail, nowhere at random', async () => {
    const r = await h.R(() => {
      const D = PSXAI.Decor, p = __PSX_REG__.Game.player;
      D.ensure();
      const items = D.inRect(p.x - 3000, p.y - 3000, p.x + 3000, p.y + 3000, []);
      const lamps = items.filter((it) => it.k === 'lamp');
      const st = D.trail && D.trail.start;
      return { lamps: lamps.length, fromTrail: lamps.map((l) => (st ? Math.round(Math.hypot(l.x - st[0], l.y - st[1])) : -1)) };
    });
    return { pass: r.lamps <= 1 && r.fromTrail.every((d) => d >= 0 && d < 140), detail: r };
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
    await add(); await h.wait(1500);
    const soft = await red();
    await h.R(() => PSXAI.setCfg('softTelegraphs', false)); await add(); await h.wait(1500);
    const old = await red();
    await h.R(() => { __PSX_REG__.Hazards.clear(); PSXAI.setCfg('softTelegraphs', true); });
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
    const irregular = r.gaps.length > 1 && Math.max(...r.gaps) - Math.min(...r.gaps) > 0.8;
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

  await scenario(h, 'weather settles in for minutes and changes step by step', async () => {
    const r = await h.R(() => {
      const S = PSXAI.Sky, out = {};
      for (const k of ['clear', 'cloudy', 'drizzle', 'rain', 'fog', 'storm']) { const v = []; for (let i = 0; i < 200; i++) v.push(S.holdFor(k) / 60); out[k] = [+Math.min(...v).toFixed(1), +Math.max(...v).toFixed(1)]; }
      const keep = S.st.pattern, from = {};
      for (const k of ['clear', 'fair', 'storm']) { S.st.pattern = k; const c = {}; for (let i = 0; i < 300; i++) { const n = S.pickPattern(); c[n] = (c[n] || 0) + 1; } from[k] = c; }
      S.st.pattern = keep;
      return { minutes: out, next: from };
    });
    const m = r.minutes, within = (k, lo, hi) => m[k][0] >= lo - 0.05 && m[k][1] <= hi + 0.05;
    const stepwise = !r.next.clear.storm && !r.next.clear.rain && !r.next.fair.storm && !r.next.storm.storm && !r.next.storm.clear;
    return { pass: within('clear', 6, 12) && within('cloudy', 5, 10) && within('drizzle', 4, 8) && within('rain', 3, 7) && within('fog', 5, 9) && within('storm', 4, 8) && stepwise, detail: r };
  });

  await scenario(h, 'Pokémon are sized by species: tiny ones stay visible, giants stay playable', async () => {
    const r = await h.R(() => {
      // on-screen body size: the sprite's own size × the species factor
      const S = PSXAI.Scale, k = (d) => +(S.species(d) * __PSX_REG__.Sprites.bodyRadius(d, 1)).toFixed(1);
      const line = { joltik: k(595), pikachu: k(25), eevee: k(133), charmander: k(4), charmeleon: k(5), charizard: k(6), lucario: k(448), snorlax: k(143), onix: k(95), wailord: k(321) };
      const boss = +(S.of({ dex: 143, id: 7, boss: true }) / S.of({ dex: 143, id: 7 })).toFixed(2);
      const flock = [0, 1, 2, 3, 4, 5].map((i) => PSXAI.Debug.spawn(16, { temp: 'neutral', dx: -200 + i * 60, dy: -120 }));
      const ks = flock.map((e) => S.of(e));
      const big = PSXAI.Debug.spawn(143, { temp: 'neutral', dx: 200 }), tiny = PSXAI.Debug.spawn(595, { temp: 'neutral', dx: -200 });
      return { line, boss, spread: +((Math.max(...ks) - Math.min(...ks)) / ks[0]).toFixed(3), r: { snorlax: [big._psxR0, +big.r.toFixed(1)], joltik: [tiny._psxR0, +tiny.r.toFixed(1)] } };
    });
    const L = r.line, all = Object.values(L);
    const ok = L.joltik >= 6 && L.joltik < L.pikachu && L.pikachu < L.lucario && L.charmander < L.charmeleon && L.charmeleon < L.charizard && L.snorlax > L.pikachu * 1.6 &&
      Math.max(...all) <= L.joltik * 9 && r.boss > 1.08 && r.boss < 1.16 && r.spread > 0.01 && r.spread < 0.13 &&
      r.r.snorlax[1] / r.r.snorlax[0] <= 1.36 && r.r.joltik[1] / r.r.joltik[0] >= 0.79;
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
    await h.R(() => { PSXAI.setCfg('atmosphere', true); PSXAI.setCfg('newArt', true); PSXAI.Sky.set({ hour: 23, rain: 0.9, storm: 0.8, fog: 0.4, wind: 0.6, wet: 1 }); PSXAI.Player.lanternToggle = true; });
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

  const pass = results.filter((r) => r.pass).length;
  console.log('\n' + pass + '/' + results.length + ' scenarios passed');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
