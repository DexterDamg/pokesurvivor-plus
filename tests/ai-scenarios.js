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
    const want = { sleep: 'zzz', flee: 'scared', hide: 'scared', freeze: 'scared', fight: 'anger' };
    const pairs = s.flat().filter(([b]) => want[b]);
    const ok = pairs.filter(([b, i]) => i === want[b] || i === 'surprise').length;
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
