/* PokéSurvivor+ — Living World AI · a team of six, switched in and out like in the Pokémon games
 * Choose up to six of your Pokémon from the main menu (Team); the first is your lead, the one a run
 * starts with. In a run your team sits at the bottom left of the screen: switch with Z / X (the
 * previous / next one) or click a portrait. A switch takes a moment (and can't be spammed), and the
 * one coming in gets a breath of invulnerability.
 *   - Each team member keeps its own HP and its own moves: the moves it learns are its own, and one
 *     sent out for the first time starts with its species' first move. The run's level, upgrades,
 *     items and coins belong to the whole team.
 *   - Types matter (66-types.js): send in the Pokémon the wild ones can't touch.
 *   - When the one out faints, the next healthy one is sent out at once; the run ends only when the
 *     whole team has fainted. A benched Pokémon heals a little on every level-up (a fainted one
 *     comes round with a little HP).
 * The team is kept on your save. Setting: team.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const KEY = 'psx.team.v1';
  const MAX = 6, SWITCH_CD = 1.2, BENCH_HEAL = 0.2;
  const st = { team: load(), run: null, cd: 0, hooked: false, el: null, boxes: [] };

  function load() { try { const t = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(t) ? t.filter((d) => d > 0).slice(0, MAX) : []; } catch (e) { return []; } }
  function T(en, es) { return (AI.lang && AI.lang() === 'es' && es) || en; }
  function on() { return AI.enabled && AI.cfg.team !== false; }
  function R() { return AI.R; }
  function owned(dex) { try { return !!R().DB.owns(dex); } catch (e) { return false; } }
  function nameOf(dex) { const d = R().DEX_BY[dex]; return d ? d.name : '#' + dex; }

  // ---------------------------------------------------------------- the team you've chosen (kept on your save)
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(st.team)); } catch (e) { /* ignore */ }
    try {
      const sv = R().DB.save;
      if (sv) {
        sv.psxTeam = st.team.slice();
        if (st.team[0] && owned(st.team[0])) sv.partner = st.team[0]; // (the lead is who a run starts with)
        if (R().DB.commit) R().DB.commit();
      }
    } catch (e) { /* ignore */ }
  }
  function sync() {
    try { const t = R().DB.save && R().DB.save.psxTeam; if (Array.isArray(t) && t.length && !st.team.length) st.team = t.slice(0, MAX); } catch (e) { /* ignore */ }
  }
  // the team as it stands: the lead first (your partner, if you picked one in the game's own menu)
  function chosen() {
    const sv = R().DB.save || {};
    let t = st.team.filter(owned);
    const lead = sv.partner;
    if (lead && owned(lead)) t = [lead].concat(t.filter((d) => d !== lead));
    return t.slice(0, MAX);
  }
  function setTeam(list) { st.team = [...new Set(list.filter((d) => owned(d)))].slice(0, MAX); persist(); render(); }

  // ---------------------------------------------------------------- in a run
  // each member: { dex, shiny, hpK (0…1), moves, slots, active, out }
  function startRun(p) {
    const team = chosen();
    if (!team.includes(p.dex)) team.unshift(p.dex);
    const sv = R().DB.save || {};
    st.run = { p, cur: 0, members: team.slice(0, MAX).map((dex) => ({ dex, shiny: dex === p.dex ? p.shiny : !!(sv.shiny && sv.shiny[dex] && R().Sprites.hasShiny && R().Sprites.hasShiny(dex)), hpK: 1, moves: null, slots: null, active: 0, fainted: false })) };
    const lead = st.run.members.findIndex((m) => m.dex === p.dex);
    st.run.cur = Math.max(0, lead);
    st.cd = 0;
  }
  function cur() { return st.run && st.run.members[st.run.cur]; }
  // keep what's the member's own (its species, HP, moves) when it goes back to the bench
  function stash(p, m) {
    m.dex = p.dex; m.shiny = p.shiny;
    m.hpK = p.maxHp > 0 ? U.clamp(p.hp / p.maxHp, 0, 1) : 0;
    m.moves = p.moves; m.slots = p.slots; m.active = p.active;
  }
  function canSwitchTo(i) {
    const r = st.run;
    return !!r && i !== r.cur && i >= 0 && i < r.members.length && !r.members[i].fainted && !!R().DEX_BY[r.members[i].dex];
  }
  function switchTo(i, forced) {
    const r = st.run, p = r && r.p;
    if (!on() || !p || p !== R().Game.player || !canSwitchTo(i)) return false;
    if (!forced && (st.cd > 0 || p.dead || R().Game.state !== 'playing' || (p.evoAnim || p.evoTo))) return false;
    const out = r.members[r.cur], m = r.members[i];
    stash(p, out);
    if (forced) out.fainted = true;
    // in comes the next one: its species (base stats, sprite, size), then its own HP and moves
    p.shiny = m.shiny;
    p.evolveTo(m.dex);
    if (m.moves) { p.moves = m.moves; p.slots = m.slots; p.active = Math.min(m.active, Math.max(0, m.slots.length - 1)); }
    else {
      p.moves = []; p.slots = []; p.active = 0;
      let first = null;
      try { first = R().startMoveOf ? R().startMoveOf(m.dex) : null; } catch (e) { first = null; }
      if (!first || !p.addMove(first)) p.addMove('tackle');
    }
    p.hp = Math.max(1, Math.round(p.maxHp * (m.fainted ? 0 : m.hpK)));
    p.dead = false;
    p.invuln = Math.max(p.invuln || 0, forced ? 2 : 0.6);
    r.cur = i;
    st.cd = SWITCH_CD;
    p._pas = null; p._pasSig = null; // (its passive bonuses are worked out again from its own moves)
    try { if (p.bondStale) p.bondStale(); } catch (e) { /* ignore */ }
    try {
      const Rr = R();
      Rr.FX.ring(p.x, p.y, 8, 90, '#ffffff', 0.5, 4); Rr.FX.burst(p.x, p.y - 20, '#ff5252', 14, 120); Rr.Audio.sfx('levelup');
      Rr.Spawner.say(forced ? T(nameOf(out.dex) + ' fainted! Go, ' + nameOf(m.dex) + '!', '¡' + nameOf(out.dex) + ' se ha debilitado! ¡Adelante, ' + nameOf(m.dex) + '!') : T('Go, ' + nameOf(m.dex) + '!', '¡Adelante, ' + nameOf(m.dex) + '!'), 2.4, 1);
    } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'team', what: forced ? 'faint' : 'switch', from: out.dex, to: m.dex, x: p.x, y: p.y, loud: 0 });
    return true;
  }
  function step(dir) {
    const r = st.run;
    if (!r) return false;
    for (let k = 1; k < r.members.length; k++) { const i = (r.cur + dir * k + r.members.length * 2) % r.members.length; if (canSwitchTo(i)) return switchTo(i); }
    return false;
  }
  function nextHealthy() {
    const r = st.run;
    if (!r) return -1;
    for (let k = 1; k < r.members.length; k++) { const i = (r.cur + k) % r.members.length; if (canSwitchTo(i)) return i; }
    return -1;
  }
  // a level-up: the bench catches its breath
  function onLevel() {
    const r = st.run;
    if (!r) return;
    r.members.forEach((m, i) => { if (i === r.cur) return; if (m.fainted) { m.fainted = false; m.hpK = BENCH_HEAL; } else m.hpK = Math.min(1, m.hpK + BENCH_HEAL); });
  }

  function tick(dt) {
    const p = R() && R().Game && R().Game.player;
    if (!on() || !p || p.remote) return;
    if (!st.run || st.run.p !== p) startRun(p);
    st.cd = Math.max(0, st.cd - dt);
    const r = st.run, m = cur();
    if (m) { m.dex = p.dex; m.hpK = p.maxHp > 0 ? U.clamp(p.hp / p.maxHp, 0, 1) : 0; }
    if (r && p.level > (r.level || p.level)) onLevel();
    if (r) r.level = p.level;
  }

  // ---------------------------------------------------------------- the team bar (bottom left)
  const icons = new Map();
  function icon(dex) {
    let im = icons.get(dex);
    if (!im) { im = new Image(); im.onload = () => { im.ok = true; }; im.src = 'assets/pokemon/' + dex + '/Idle.png'; icons.set(dex, im); }
    return im;
  }
  function drawIcon(ctx, dex, x, y, s, alpha) {
    const im = icon(dex), meta = R().SPRITE_META[dex], a = meta && meta.a && meta.a.Idle;
    if (!im.ok || !a) return;
    const k = Math.min(s / a.w, s / a.h) * 1.25;
    ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, 0, 0, a.w, a.h, Math.round(x + (s - a.w * k) / 2), Math.round(y + (s - a.h * k) / 2 + 2), Math.round(a.w * k), Math.round(a.h * k));
    ctx.restore();
  }
  function drawScreen(ctx, w, h) {
    const r = st.run;
    st.boxes.length = 0;
    if (!on() || !r || r.members.length < 2 || R().Game.state !== 'playing') return;
    const S = 40, G = 6, x0 = 12, y0 = h - S - 34;
    ctx.save();
    ctx.font = '600 10px Pixelify, "Segoe UI", sans-serif'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(10,14,24,0.55)'; ctx.fillRect(x0 - 6, y0 - 18, r.members.length * (S + G) + 6, S + 30);
    ctx.fillStyle = '#c8d2e6'; ctx.fillText(T('Team · Z / X to switch', 'Equipo · Z / X para cambiar'), x0, y0 - 14);
    r.members.forEach((m, i) => {
      const x = x0 + i * (S + G), y = y0, out = i === r.cur;
      ctx.fillStyle = out ? 'rgba(255,240,170,0.28)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, S, S);
      ctx.strokeStyle = out ? '#ffe680' : m.fainted ? '#6a3a3a' : 'rgba(200,210,230,0.5)'; ctx.lineWidth = out ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, S - 1, S - 1);
      drawIcon(ctx, m.dex, x, y, S, m.fainted ? 0.3 : 1);
      // its HP
      const k = out ? (r.p.maxHp > 0 ? r.p.hp / r.p.maxHp : 0) : m.fainted ? 0 : m.hpK;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 2, y + S + 3, S - 4, 4);
      ctx.fillStyle = k > 0.5 ? '#5fe08a' : k > 0.2 ? '#ffd23f' : '#ff5f6d'; ctx.fillRect(x + 2, y + S + 3, Math.round((S - 4) * U.clamp(k, 0, 1)), 4);
      if (m.fainted) { ctx.fillStyle = '#ff8a8a'; ctx.fillText('KO', x + 3, y + 3); }
      if (out && st.cd > 0) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x, y, S, S * (st.cd / SWITCH_CD)); }
      st.boxes.push({ x, y, w: S, h: S + 8, i });
    });
    ctx.restore();
  }
  // a click on a portrait
  function onClick(ev) {
    if (!on() || !st.run || !st.boxes.length || !(ev.target instanceof HTMLCanvasElement)) return;
    const b = ev.target.getBoundingClientRect(), Rr = R();
    const cw = (Rr.Camera && Rr.Camera._cw) || b.width, ch = (Rr.Camera && Rr.Camera._ch) || b.height;
    const x = (ev.clientX - b.left) * cw / b.width, y = (ev.clientY - b.top) * ch / b.height;
    for (const bx of st.boxes) if (x >= bx.x && x <= bx.x + bx.w && y >= bx.y && y <= bx.y + bx.h) { ev.stopPropagation(); switchTo(bx.i); return; }
  }

  // ---------------------------------------------------------------- the Team screen (main menu)
  function build() {
    const el = document.createElement('div');
    el.id = 'psx-team';
    el.style.cssText = 'position:fixed;inset:0;z-index:9000;display:none;align-items:center;justify-content:center;background:rgba(6,8,14,0.72)';
    el.innerHTML = '<div style="width:min(860px,calc(100vw - 32px));max-height:88vh;display:flex;flex-direction:column;gap:10px;padding:14px;background:#141a2a;border:2px solid #3d4a80;border-radius:12px;color:#e6ecff;font:14px system-ui,sans-serif">' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><b data-t style="font-size:18px"></b><button data-close style="padding:6px 12px;background:#232b48;color:#e6ecff;border:1px solid #3d4a80;border-radius:6px;cursor:pointer"></button></div>' +
      '<div data-sub style="opacity:.75;font-size:12px"></div>' +
      '<div data-team style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px"></div>' +
      '<input data-q style="padding:7px 9px;background:#0e1322;color:#fff;border:1px solid #3a4a7a;border-radius:6px">' +
      '<div data-list style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;min-height:160px"></div></div>';
    document.body.appendChild(el);
    el.querySelector('[data-close]').onclick = close;
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    el.querySelector('[data-q]').addEventListener('input', renderList);
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
    st.el = el;
  }
  function card(dex, extra) {
    const d = document.createElement('button');
    d.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;background:#1c2440;color:#e6ecff;border:1px solid #33406e;border-radius:8px;cursor:pointer;font:12px system-ui,sans-serif;min-height:92px';
    const cv = document.createElement('canvas'); cv.width = cv.height = 56;
    const im = icon(dex), meta = R().SPRITE_META[dex], a = meta && meta.a && meta.a.Idle;
    const paint = () => { if (!a) return; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; const k = Math.min(56 / a.w, 56 / a.h) * 1.25; g.clearRect(0, 0, 56, 56); g.drawImage(im, 0, 0, a.w, a.h, (56 - a.w * k) / 2, (56 - a.h * k) / 2, a.w * k, a.h * k); };
    if (im.ok) paint(); else im.addEventListener('load', paint, { once: true });
    const types = ((R().DEX_BY[dex] || {}).types || []).join(' / ');
    d.appendChild(cv);
    const n = document.createElement('div'); n.textContent = nameOf(dex); d.appendChild(n);
    const t = document.createElement('div'); t.textContent = types; t.style.cssText = 'opacity:.6;font-size:10px'; d.appendChild(t);
    if (extra) { const x = document.createElement('div'); x.textContent = extra; x.style.cssText = 'color:#ffe680;font-size:10px'; d.appendChild(x); }
    return d;
  }
  function render() {
    const el = st.el;
    if (!el || el.style.display === 'none') return;
    el.querySelector('[data-t]').textContent = T('Your team', 'Tu equipo');
    el.querySelector('[data-close]').textContent = T('Done', 'Listo');
    el.querySelector('[data-sub]').textContent = T('Pick up to six of your Pokémon: click one below to add it. The first is your lead, the one a run starts with. Click a team member to take it out, or "Make lead" to lead with it. In a run, switch with Z / X or click its portrait.', 'Elige hasta seis de tus Pokémon: haz clic en uno de abajo para añadirlo. El primero es tu líder, con el que empieza la partida. Haz clic en uno del equipo para quitarlo, o en "Hacer líder". En partida, cambia con Z / X o haciendo clic en su retrato.');
    el.querySelector('[data-q]').placeholder = T('Search your Pokémon…', 'Busca entre tus Pokémon…');
    const tb = el.querySelector('[data-team]');
    tb.innerHTML = '';
    const team = chosen();
    for (let i = 0; i < MAX; i++) {
      const dex = team[i];
      if (!dex) { const e = document.createElement('div'); e.style.cssText = 'min-height:92px;border:1px dashed #33406e;border-radius:8px;display:flex;align-items:center;justify-content:center;opacity:.5;font-size:12px'; e.textContent = T('empty', 'vacío'); tb.appendChild(e); continue; }
      const c = card(dex, i === 0 ? T('Lead', 'Líder') : null);
      c.title = T('Click to take it out of the team', 'Haz clic para quitarlo del equipo');
      c.onclick = () => setTeamLead(chosen().filter((d) => d !== dex));
      if (i > 0) {
        const lead = document.createElement('span');
        lead.textContent = T('Make lead', 'Hacer líder');
        lead.style.cssText = 'margin-top:2px;padding:1px 6px;border:1px solid #6a76b0;border-radius:4px;font-size:10px;color:#cfd8ff';
        lead.onclick = (e) => { e.stopPropagation(); setTeamLead([dex].concat(chosen().filter((d) => d !== dex))); };
        c.appendChild(lead);
      }
      tb.appendChild(c);
    }
    renderList();
  }
  // (changing the lead changes your partner)
  function setTeamLead(list) {
    try { if (list[0]) R().DB.save.partner = list[0]; } catch (e) { /* ignore */ }
    setTeam(list);
  }
  function renderList() {
    const el = st.el;
    if (!el) return;
    const q = (el.querySelector('[data-q]').value || '').toLowerCase().trim();
    const team = chosen();
    const list = el.querySelector('[data-list]');
    list.innerHTML = '';
    const sv = R().DB.save || {};
    const all = Object.keys(sv.owned || {}).map(Number).filter((d) => R().DEX_BY[d] && !team.includes(d)).filter((d) => !q || nameOf(d).toLowerCase().includes(q) || ((R().DEX_BY[d].types || []).join(' ').includes(q))).sort((a, b) => a - b);
    for (const dex of all.slice(0, 240)) {
      const c = card(dex);
      c.onclick = () => { const t = chosen(); if (t.length >= MAX) { c.style.borderColor = '#ff6a6a'; return; } setTeam(t.concat([dex])); };
      list.appendChild(c);
    }
    if (all.length > 240) { const m = document.createElement('div'); m.style.cssText = 'grid-column:1/-1;opacity:.6;font-size:12px'; m.textContent = T('… type to search the rest (' + all.length + ' in all)', '… escribe para buscar el resto (' + all.length + ')'); list.appendChild(m); }
    if (!all.length) { const m = document.createElement('div'); m.style.cssText = 'grid-column:1/-1;opacity:.6;font-size:12px'; m.textContent = T('No other Pokémon yet: defeat wild ones to have them join you.', 'Aún no tienes más Pokémon: derrota a los salvajes para que se unan a ti.'); list.appendChild(m); }
  }
  function open() { if (!st.el) build(); st.el.style.display = 'flex'; render(); }
  function close() { if (st.el) st.el.style.display = 'none'; try { if (R().MenuUI && R().MenuUI.refresh) R().MenuUI.refresh(); } catch (e) { /* ignore */ } }
  function addMenuButton() {
    const list = document.querySelector('.menu-list');
    if (!list || document.getElementById('psx-team-btn')) return;
    const b = document.createElement('button');
    b.id = 'psx-team-btn'; b.className = 'menu-item';
    b.innerHTML = T('Team', 'Equipo') + '<small>' + T('Your six Pokémon, switched in and out', 'Tus seis Pokémon, para cambiar en partida') + '</small>';
    b.onclick = (e) => { e.stopPropagation(); open(); };
    list.insertBefore(b, list.children[1] || null);
  }

  // ---------------------------------------------------------------- wiring
  function install(r) {
    if (st.hooked) return;
    st.hooked = true;
    sync();
    addMenuButton();
    setInterval(addMenuButton, 1500); // (the menu is rebuilt now and then)
    addEventListener('keydown', (ev) => {
      if (!on() || ev.repeat || (ev.code !== 'KeyZ' && ev.code !== 'KeyX')) return;
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const p = r.Game.player;
      if (!p || r.Game.state !== 'playing' || !st.run) return;
      if (step(ev.code === 'KeyX' ? 1 : -1)) ev.preventDefault();
    }, true);
    addEventListener('click', (ev) => { try { onClick(ev); } catch (e) { AI.warn('team-click', e); } }, true);
    // the one out faints: the next healthy one comes in, unless the whole team is down
    const PP = r.Player.prototype, oHurt = PP.hurt;
    PP.hurt = function () {
      const out = oHurt.apply(this, arguments);
      if (on() && this.dead && this === r.Game.player && st.run && st.run.p === this) {
        const i = nextHealthy();
        if (i >= 0) { try { this.anim && this.anim.play && this.anim.play('Idle'); } catch (e) { /* ignore */ } switchTo(i, true); }
      }
      return out;
    };
  }

  AI.define('Team', { st, MAX, install, tick, drawScreen, open, close, chosen, setTeam, switchTo, step, startRun, cur, nextHealthy, onLevel, get run() { return st.run; } });
})();
