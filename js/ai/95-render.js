/* PokéSurvivor+ — Living World AI · rendering
 * Draw-time transforms (hops, climbing, tumbling, swimming, trembling, evolution glow), the
 * emotion bubbles (hand-painted pixel icons, budgeted per frame), ground overlays (evaporated
 * puddles, sacred stones), the Lake Trio's wisps, the player's bubble and the debug overlay.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  // ---------------------------------------------------------------- icons (painted once, cached)
  const ICON_PX = 16;
  const iconCache = new Map();
  const C = { ink: '#2a1f2e', red: '#ff4d6d', pink: '#ff8fc8', yel: '#ffd23f', blue: '#5ab8ff', lblue: '#bfe6ff', white: '#ffffff', grey: '#8f96a8', orange: '#ff9a3d', green: '#6fdc8c', purple: '#b48cff' };
  const painters = {
    love(g) { heart(g, 8, 9, 6, C.pink); heart(g, 12, 4, 3, C.red); },
    heart(g) { heart(g, 8, 9, 7, C.red); },
    happy(g) { face(g, C.yel); g.fillStyle = C.ink; g.fillRect(5, 6, 2, 2); g.fillRect(9, 6, 2, 2); g.fillRect(5, 10, 6, 1); g.fillRect(4, 9, 1, 1); g.fillRect(11, 9, 1, 1); },
    smirk(g) { face(g, C.purple); g.fillStyle = C.ink; g.fillRect(5, 6, 2, 1); g.fillRect(9, 6, 2, 1); g.fillRect(6, 10, 5, 1); g.fillRect(11, 9, 1, 1); },
    question(g) { g.fillStyle = C.blue; g.fillRect(5, 2, 6, 2); g.fillRect(10, 4, 2, 3); g.fillRect(8, 7, 3, 2); g.fillRect(7, 9, 2, 2); g.fillRect(7, 12, 2, 2); },
    anger(g) {
      g.fillStyle = C.red;
      for (const [x, y] of [[3, 3], [10, 3], [3, 10], [10, 10]]) { g.fillRect(x, y + 1, 3, 1); g.fillRect(x + 1, y, 1, 3); }
      g.fillRect(6, 6, 4, 1); g.fillRect(6, 9, 4, 1); g.fillRect(6, 6, 1, 4); g.fillRect(9, 6, 1, 4);
    },
    surprise(g) { g.fillStyle = C.red; g.fillRect(4, 2, 3, 8); g.fillRect(9, 2, 3, 8); g.fillRect(4, 12, 3, 2); g.fillRect(9, 12, 3, 2); },
    alert(g) { g.fillStyle = C.orange; g.fillRect(6, 2, 4, 8); g.fillRect(6, 12, 4, 2); },
    scared(g) { face(g, C.lblue); g.fillStyle = C.ink; g.fillRect(4, 5, 3, 3); g.fillRect(9, 5, 3, 3); g.fillStyle = C.white; g.fillRect(5, 6, 1, 1); g.fillRect(10, 6, 1, 1); g.fillStyle = C.ink; g.fillRect(6, 10, 4, 3); g.fillStyle = C.blue; g.fillRect(12, 2, 2, 3); },
    tear(g) { drop(g, 8, 3, C.blue); g.fillStyle = C.white; g.fillRect(6, 8, 1, 2); },
    sad(g) { face(g, C.lblue); g.fillStyle = C.ink; g.fillRect(5, 6, 2, 1); g.fillRect(9, 6, 2, 1); g.fillRect(5, 11, 6, 1); g.fillRect(4, 12, 1, 1); g.fillRect(11, 12, 1, 1); g.fillStyle = C.blue; g.fillRect(5, 8, 1, 2); },
    zzz(g) { g.fillStyle = C.blue; z(g, 2, 8, 6); z(g, 8, 3, 5); g.fillStyle = C.lblue; z(g, 11, 0, 3); },
    swirl(g) {
      g.strokeStyle = C.purple; g.lineWidth = 2; g.beginPath();
      for (let a = 0; a < 12.5; a += 0.3) { const r = a * 0.55; const x = 8 + Math.cos(a) * r, y = 8 + Math.sin(a) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    },
    food(g) { g.fillStyle = '#c8772e'; g.beginPath(); g.ellipse(9, 7, 5, 4, -0.5, 0, 6.283); g.fill(); g.fillStyle = '#f2b06a'; g.fillRect(7, 5, 3, 2); g.fillStyle = C.white; g.fillRect(2, 11, 4, 2); g.fillRect(4, 9, 2, 3); g.fillRect(1, 12, 2, 2); },
    sweat(g) { drop(g, 5, 2, C.lblue); drop(g, 11, 7, C.blue); },
    eyes(g) { for (const x of [3, 9]) { g.fillStyle = C.white; g.fillRect(x, 4, 5, 8); g.fillStyle = C.ink; g.fillRect(x, 4, 5, 1); g.fillRect(x, 11, 5, 1); g.fillRect(x, 4, 1, 8); g.fillRect(x + 4, 4, 1, 8); g.fillRect(x + 2, 7, 2, 3); } },
    sparkle(g) { star(g, 6, 7, 5, C.yel); star(g, 12, 3, 3, C.white); star(g, 12, 12, 2, C.yel); },
    note(g) { g.fillStyle = C.green; g.fillRect(9, 2, 2, 9); g.fillRect(11, 2, 3, 2); g.beginPath(); g.ellipse(8, 11, 3, 2.4, -0.4, 0, 6.283); g.fill(); g.fillRect(3, 5, 2, 6); g.beginPath(); g.ellipse(3, 11, 2.2, 1.8, -0.4, 0, 6.283); g.fill(); },
    dots(g) { g.fillStyle = C.grey; g.fillRect(2, 8, 3, 3); g.fillRect(7, 8, 3, 3); g.fillRect(12, 8, 3, 3); },
  };
  function face(g, col) { g.fillStyle = col; g.beginPath(); g.arc(8, 8, 6.5, 0, 6.283); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1; g.stroke(); }
  function heart(g, cx, cy, s, col) { g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy + s * 0.75); g.bezierCurveTo(cx - s * 1.4, cy - s * 0.2, cx - s * 0.6, cy - s * 1.2, cx, cy - s * 0.35); g.bezierCurveTo(cx + s * 0.6, cy - s * 1.2, cx + s * 1.4, cy - s * 0.2, cx, cy + s * 0.75); g.fill(); }
  function drop(g, x, y, col) { g.fillStyle = col; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 4, y + 6, x, y + 8); g.quadraticCurveTo(x - 4, y + 6, x, y); g.fill(); }
  function z(g, x, y, s) { g.fillRect(x, y, s, 1); g.fillRect(x, y + s - 1, s, 1); for (let i = 0; i < s; i++) g.fillRect(x + s - 1 - i, y + i, 1, 1); }
  function star(g, cx, cy, r, col) { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.35 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); }

  function icon(name) {
    let c = iconCache.get(name);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = ICON_PX;
    const g = c.getContext('2d');
    (painters[name] || painters.dots)(g);
    iconCache.set(name, c);
    return c;
  }

  function bubble(ctx, x, y, name, k = 1, alpha = 1) {
    const s = AI.cfg.bubbleScale * k;
    const w = 22 * s, h = 20 * s;
    const bx = Math.round(x - w / 2), by = Math.round(y - h);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2a1f2e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const r = 6 * s;
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + w, by, bx + w, by + h, r);
    ctx.arcTo(bx + w, by + h, bx, by + h, r);
    ctx.lineTo(bx + w / 2 + 3 * s, by + h);
    ctx.lineTo(bx + w / 2, by + h + 4 * s);
    ctx.lineTo(bx + w / 2 - 3 * s, by + h);
    ctx.arcTo(bx, by + h, bx, by, r);
    ctx.arcTo(bx, by, bx + w, by, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.imageSmoothingEnabled = false;
    const is = 16 * s;
    ctx.drawImage(icon(name), Math.round(bx + (w - is) / 2), Math.round(by + (h - is) / 2), is, is);
    ctx.restore();
  }

  // ---------------------------------------------------------------- per-NPC draw transforms
  function wrapDraw(orig) {
    return function (ctx) {
      const s = this.psx;
      if (!s || this.dead || !AI.enabled) return orig.call(this, ctx);
      const v = s.vis;
      let lift = (v.lift || 0) + (v.hopLift || 0);
      if (v.rise > 0) { v.rise = Math.max(0, v.rise - 1 / 60 / 1.2); }
      const sub = Math.max(v.subNow || 0, v.rise > 0 ? v.rise * 0.9 : 0);
      const breath = v.breath ? Math.sin(AI.time * 2.2 + this.id) * 0.025 : 0;
      const yawn = v.yawn > 0 ? Math.sin((0.8 - v.yawn) / 0.8 * Math.PI) * 0.06 : 0;
      const sy = (v.sy || 1) + breath + yawn;
      const sx = (v.sx || 1) - breath * 0.5;
      const plain = !lift && !v.rot && !v.shake && sx === 1 && sy === 1 && (v.alpha == null || v.alpha >= 1) && sub < 0.02 && !v.glow;
      if (plain) { orig.call(this, ctx); extras(ctx, this, s, 0); return; }
      const prevLift = this.jumpLift;
      if (!this.jump) this.jumpLift = (prevLift || 0) + lift;
      ctx.save();
      if (v.shake) ctx.translate((Math.random() - 0.5) * v.shake * 2, 0);
      if (v.alpha != null && v.alpha < 1) ctx.globalAlpha *= v.alpha;
      if (sub > 0.02) {
        const depth = this.bodyH * sub * 0.55;
        ctx.beginPath();
        ctx.rect(this.x - 300, this.y - 600, 600, 600 - depth);
        ctx.clip();
      }
      if (sx !== 1 || sy !== 1) { ctx.translate(this.x, this.y); ctx.scale(sx, sy); ctx.translate(-this.x, -this.y); }
      if (v.rot) { const cy = this.y - this.bodyH * 0.45 - lift; ctx.translate(this.x, cy); ctx.rotate(v.rot); ctx.translate(-this.x, -cy); }
      orig.call(this, ctx);
      if (v.glow > 0.02) {
        ctx.globalAlpha *= Math.min(1, v.glow);
        try { this.anim.draw(ctx, this.x, this.y - (this.jumpLift || 0), { flash: true, softFlash: false, alpha: 1 }); } catch (e) { /* ignore */ }
      }
      ctx.restore();
      if (!this.jump) this.jumpLift = prevLift;
      if (sub > 0.02) ripple(ctx, this, sub);
      extras(ctx, this, s, lift);
    };
  }

  function ripple(ctx, e, sub) {
    const y = e.y - e.bodyH * sub * 0.55;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#d8f0ff';
    ctx.lineWidth = 1.5;
    const w = e.r * (1.2 + Math.sin(AI.time * 3 + e.id) * 0.1);
    ctx.beginPath();
    ctx.ellipse(e.x, y, w, w * 0.32, 0, 0, 6.283);
    ctx.stroke();
    ctx.restore();
  }

  function extras(ctx, e, s, lift) {
    const v = s.vis;
    if (v.tears > 0) {
      const t = (AI.time * 2.4 + e.id) % 1;
      ctx.fillStyle = '#7fc8ff';
      const fy = e.y - e.bodyH * 0.72 - lift + t * 12;
      ctx.fillRect(Math.round(e.x - 5), Math.round(fy), 2, 3);
      ctx.fillRect(Math.round(e.x + 4), Math.round(fy + 4 - t * 4), 2, 3);
    }
    if (v.carry === 'rock') {
      const y = e.y - e.bodyH - 10 - lift;
      ctx.fillStyle = '#8a7f72'; ctx.beginPath(); ctx.ellipse(e.x, y, 13, 9, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#a89e90'; ctx.beginPath(); ctx.ellipse(e.x - 3, y - 3, 6, 4, 0, 0, 6.283); ctx.fill();
    }
  }

  // ---------------------------------------------------------------- ground overlays (under entities)
  function drawGround(ctx) {
    const R = AI.R;
    const cam = R.Camera;
    // evaporated water: dry, cracked earth
    const ts = AI.Env.TS();
    for (const [k, until] of AI.Env.driedTiles) {
      const left = until - AI.time;
      if (left <= 0) continue;
      const i = k.indexOf(',');
      const tx = +k.slice(0, i), ty = +k.slice(i + 1);
      const x = tx * ts, y = ty * ts;
      if (!cam.sees(x + ts / 2, y + ts / 2, ts)) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, left / 6) * 0.92;
      ctx.fillStyle = '#9c7a52';
      ctx.fillRect(x, y, ts + 0.5, ts + 0.5);
      ctx.strokeStyle = '#6e5236';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const h = U.hash(tx, ty, 5);
      ctx.moveTo(x + ts * h, y); ctx.lineTo(x + ts * 0.5, y + ts * 0.5); ctx.lineTo(x + ts, y + ts * (1 - h));
      ctx.moveTo(x + ts * 0.5, y + ts * 0.5); ctx.lineTo(x + ts * (0.3 + h * 0.3), y + ts);
      ctx.stroke();
      ctx.restore();
    }
    // sacred stones glow softly
    if (AI.Evolution && AI.cfg.evolution) {
      for (const p of R.World.visibleProps(cam)) {
        const kind = AI.Evolution.siteOf(p);
        if (!kind) continue;
        const pulse = 0.25 + 0.12 * Math.sin(AI.time * 2 + p.tx);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = kind === 'moss' ? '#5fe08a' : '#9fe8ff';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 26, 10, 0, 0, 6.283); ctx.fill();
        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------- air pass: bubbles & wisps
  const cand = [];
  function drawAir(ctx) {
    const R = AI.R;
    if (R.Game.state === 'ui') return;
    const cam = R.Camera;
    const p = R.Game.player;
    // sacred stone tufts on top of the rock sprite
    if (AI.Evolution && AI.cfg.evolution) {
      for (const pr of R.World.visibleProps(cam)) {
        const kind = AI.Evolution.siteOf(pr);
        if (!kind) continue;
        ctx.fillStyle = kind === 'moss' ? '#3fa35a' : '#dff7ff';
        for (let i = 0; i < 6; i++) {
          const h = U.hash(pr.tx, pr.ty, i);
          ctx.fillRect(Math.round(pr.x - 10 + h * 20), Math.round(pr.y - 20 + U.hash(pr.ty, pr.tx, i) * 8), 3, 2);
        }
        if (Math.random() < 0.04) R.FX.twinkle(pr.x + U.rand(-12, 12), pr.y - U.rand(8, 30));
      }
    }
    // Lake Trio wisps
    const lake = AI.Legend && AI.Legend.lake;
    if (lake && cam.sees(lake.x, lake.y, lake.r)) {
      const cols = { uxie: '#ffe14d', mesprit: '#ff8fc8', azelf: '#6fb8ff' };
      lake.trio.forEach((k, i) => {
        const a = AI.time * 1.4 + i * 2.094;
        const x = lake.x + Math.cos(a) * 64, y = lake.y - 40 + Math.sin(a) * 26;
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = cols[k];
        ctx.beginPath(); ctx.arc(x, y, 10, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.283); ctx.fill();
        ctx.restore();
        if (Math.random() < 0.3) R.FX.px(x, y, cols[k], { vy: -20, life: 0.5 });
      });
    }
    if (AI.Player) AI.Player.drawFocus(ctx);
    // NPC bubbles, budgeted
    cand.length = 0;
    const now = AI.time;
    for (const e of R.EnemyMgr.all()) {
      const s = e.psx;
      if (!s || e.dead || !cam.sees(e.x, e.y, 40)) continue;
      const b = AI.Mind.bubbleFor(s);
      if (!b) continue;
      const d = p ? Math.hypot(p.x - e.x, p.y - e.y) : 500;
      let show = b.fresh || now - (s.behAt || 0) < 3.5 || (b.prio > 0.6 && s.beh && s.beh.tier <= 5) || b.emo === 'sleepy' || (d < 260 && b.prio > 0.35);
      if (!show) show = ((now + e.id * 1.37) % 7) < 1.6; // gentle periodic reminder
      if (!show) continue;
      cand.push({ e, s, b, score: b.prio * 2 + (b.fresh ? 3 : 0) + (1 - Math.min(1, d / 800)) + (s.beh && s.beh.tier <= 3 ? 1 : 0) });
    }
    cand.sort((a, b) => b.score - a.score);
    const n = Math.min(cand.length, AI.cfg.maxBubbles);
    for (let i = 0; i < n; i++) {
      const { e, s, b } = cand[i];
      const v = s.vis;
      const lift = (v.lift || 0) + (v.hopLift || 0) + (e.jumpLift || 0);
      const top = e.y - e.bodyH - lift - (e.hp < e.maxHp ? 16 : 8) + Math.sin(now * 3 + e.id) * 1.2;
      const age = now - (s.bubbleAt || 0);
      const pop = b.fresh ? U.clamp(age / 0.12, 0.4, 1) : 1;
      bubble(ctx, e.x, top, b.icon, pop);
    }
    AI.stats.bubbles = n;
    // the player's own expressions (Groudon's rage, Giratina's amusement…)
    const pb = AI.playerBubble;
    if (p && !p.dead && pb.t > 0 && pb.icon) bubble(ctx, p.x, p.y - p.bodyH - 14 + Math.sin(now * 4) * 1.2, pb.icon, 1.1, Math.min(1, pb.t * 3));
    const eb = AI.Legend && AI.Legend.eventBubble;
    if (eb && eb.t > 0 && eb.icon && cam.sees(eb.x, eb.y, 60)) bubble(ctx, eb.x, eb.y - 90, eb.icon, 1.2, Math.min(1, eb.t * 3));
    if (AI.cfg.debug) drawDebugWorld(ctx);
  }

  // ---------------------------------------------------------------- debug overlay (F8)
  function drawDebugWorld(ctx) {
    const R = AI.R;
    ctx.save();
    ctx.font = '700 9px monospace';
    ctx.textAlign = 'center';
    for (const e of R.EnemyMgr.all()) {
      const s = e.psx;
      if (!s || e.dead || !R.Camera.sees(e.x, e.y, 20)) continue;
      const em = s.mind.emo;
      const top = Object.keys(em).filter((k) => em[k] > 0.3).sort((a, b) => em[b] - em[a]).slice(0, 2).map((k) => k.slice(0, 4) + (em[k] * 10 | 0)).join(' ');
      const rp = s.rel.get('P');
      const lines = [s.pers.temp.slice(0, 5) + ' ' + s.stance.slice(0, 4) + ' L' + s.lod, (s.lock ? 'LOCK' : s.beh.id) + (s.inCombat ? ' ⚔' + (s.combat.strat || '').slice(0, 4) : ''), top, rp ? 'P a' + rp.a.toFixed(1) + ' f' + rp.f.toFixed(1) + ' g' + rp.g.toFixed(1) : ''];
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(e.x - 42, e.y + 4, 84, 40);
      ctx.fillStyle = s.stance === 'hostile' ? '#ff8a8a' : s.stance === 'friendly' ? '#8aff9a' : s.stance === 'wary' ? '#ffd27a' : '#ffffff';
      lines.forEach((l, i) => ctx.fillText(l, e.x, e.y + 13 + i * 9));
      const t = s.combat && s.combat.target;
      if (t) { ctx.strokeStyle = 'rgba(255,80,80,.5)'; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(t.x, t.y); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawDebugHud(ctx, w, h) {
    if (!AI.cfg.debug) return;
    const st = AI.stats;
    const lines = [
      'Living World AI ' + AI.version,
      'NPCs ' + st.npcs + '  LOD ' + st.lod.join('/') + '  combat ' + st.combat + '  social ' + st.social,
      'AI ' + st.aiMs.toFixed(2) + ' ms/frame  bubbles ' + st.bubbles + '  vetoed ' + st.spawnVetoed,
      'think ms/call  L0 ' + avg(0) + '  L1 ' + avg(1) + '  L2 ' + avg(2),
    ];
    ctx.save();
    ctx.font = '700 11px monospace';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(8, 64, 330, lines.length * 14 + 8);
    ctx.fillStyle = '#d8f0ff';
    lines.forEach((l, i) => ctx.fillText(l, 14, 80 + i * 14));
    ctx.restore();
  }
  function avg(l) { const st = AI.stats; return st.thinks[l] ? (st.thinkMs[l] / st.thinks[l]).toFixed(3) : '-'; }

  AI.define('Render', { wrapDraw, drawGround, drawAir, drawDebugHud, bubble, icon, painters });
})();
