/* PokéSurvivor+ — Living World AI · the dev console
 * Press F9 (or the ` key) anywhere, in the menus or in a run, to open it. Buttons for the common
 * things, and a command line for the rest (type "help"):
 *   unlock stages | pokemon | shiny | all     open every level / own every Pokémon (and shinies)
 *   lock stages                               back to the normal level unlocks
 *   spawn <name|dex> [n] [boss|peaceful]      Pokémon next to you (hostile unless "peaceful")
 *   catch <name|dex>                          that Pokémon joins you
 *   spawns on | off                           wild Pokémon keep appearing, or don't
 *   keystone · innocents <n> · spiritomb       the Odd Keystone, the innocent count, Spiritomb's fight now
 *   regi [solve|reset|team|chamber|steel|rock|gigas]  the Sealed Chamber and the Regis (69-regi.js)
 *   karma [max|clear|<n>|judge]               the hidden KARMA (100-karma.js): see it, max it, clear it, or call the judgment
 *   well · mansion                            the old well next to you · the mansion's route now
 *   god · heal · level <n> · coins <n> · kill time <hour> · weather clear|rain|storm|fog|snow
 * The stage unlock is remembered (the game's own developer switch, R.DevMenu); everything else
 * acts on your save or on the run in progress.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const KEY = 'psx.dev.v1';
  let save = load();
  let el = null, out = null, input = null;
  const hist = [];
  let hi = 0;

  function load() { try { return Object.assign({ stages: false }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { stages: false }; } }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
  function R() { return AI.R; }
  function inRun() { const r = R(); return !!(r && r.Game && r.Game.player && ['playing', 'paused', 'choice'].includes(r.Game.state)); }
  function log(s, col) {
    if (!out) return;
    const d = document.createElement('div');
    d.textContent = s;
    if (col) d.style.color = col;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  }
  function need() { if (!inRun()) throw new Error('start a run first'); return R().Game.player; }

  // ---------------------------------------------------------------- what it can do
  function find(q) {
    const r = R();
    if (q == null || q === '') return null;
    if (/^\d+$/.test(q)) return r.DEX_BY[+q] || null;
    const k = String(q).toLowerCase().replace(/[^a-z0-9]/g, '');
    return r.DEX.find((d) => d.name.toLowerCase().replace(/[^a-z0-9]/g, '') === k) || r.DEX.find((d) => d.name.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(k)) || null;
  }
  function commit() { try { if (R().DB.commit) R().DB.commit(); } catch (e) { /* ignore */ } }
  function unlockStages(on = true) {
    save.stages = !!on; persist();
    try { const sv = R().DB.save; if (on && sv) { sv.mapMax = Math.max(sv.mapMax || 1, 3); commit(); } } catch (e) { /* ignore */ }
    refreshMenu();
    return on ? 'every level is open (Area Zero too)' : 'levels unlock normally again';
  }
  function unlockPokemon(shiny) {
    const r = R();
    let n = 0;
    for (const d of r.DEX) {
      if (!r.SPRITE_META[d.dex]) continue;
      try {
        if (!r.DB.owns(d.dex)) { r.DB.grant(d.dex, 'dev'); n++; }
        if (shiny && !r.DB.ownsShiny(d.dex)) r.DB.grantShiny(d.dex, 'dev');
      } catch (e) { /* ignore */ }
    }
    commit();
    refreshMenu();
    return n + ' Pokémon added' + (shiny ? ', every shiny too' : '') + ' (choose your partner from the menu)';
  }
  function spawn(q, n, mode) {
    const r = R(), p = need();
    const d = find(q);
    if (!d) throw new Error('no Pokémon called "' + q + '"');
    n = U.clamp(n | 0 || 1, 1, 30);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, dist = U.rand(140, 260);
      const x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist * 0.8;
      let e;
      if (mode === 'boss') {
        let hp = 2000, dmg = 18;
        try { hp = Math.round(Math.max(6 * r.Stats.hpRef(), 1800)); dmg = Math.round(r.Enemies.bossDmg(r.Game.st.time)); } catch (err) { /* ignore */ }
        e = new r.Enemy({ dex: d.dex, name: d.name, hp, spd: 90, dmg, xp: 300, behavior: 'shooter', shotDmg: Math.round(dmg * 0.45), shotCd: 1.5, range: 280 }, x, y, { hp: 1, spd: 1, dmg: 1 }, true);
        e.psxStory = true; e.psxForceTemp = 'aggressive';
      } else if (AI.Areas && r.Enemies.TIERS) {
        const T0 = r.Enemies.TIERS, ti = Math.min(T0.length - 1, 1);
        e = new r.Enemy(AI.Areas.defFor(d, T0[ti], ti), x, y, r.Maps.sc({ hp: 1, spd: 1, dmg: 1 }));
        e.psxForceTemp = mode === 'peaceful' ? 'timid' : 'aggressive';
      } else e = AI.Debug.spawn(d.dex, { x, y, temp: mode === 'peaceful' ? 'timid' : 'aggressive' });
      e.psxPlaced = true;
      if (!r.EnemyMgr.all().includes(e)) r.EnemyMgr.add(e);
    }
    return n + '× ' + d.name + (mode ? ' (' + mode + ')' : '');
  }
  function catchOne(q) {
    const d = find(q);
    if (!d) throw new Error('no Pokémon called "' + q + '"');
    R().DB.grant(d.dex, 'dev'); commit(); refreshMenu();
    return d.name + ' joined you';
  }
  function wellHere() {
    const p = need(), W = AI.Well;
    if (!W) throw new Error('no well module');
    if (W.st.item && AI.Decor.breakItem) AI.Decor.breakItem(W.st.item);
    const x = p.x + 120, y = p.y;
    W.st.rolled = true; W.st.wanted = true;
    W.st.well = { x, y, seed: (Math.random() * 1e9) | 0, born: AI.time };
    W.st.item = AI.Decor.addFixed({ k: 'well', n: null, x, y, s: 1, r: 30, well: true });
    return 'the old well is right next to you';
  }
  function spiritombNow() {
    const S = AI.Spiritomb;
    need();
    if (!AI.Forest || !AI.Forest.on()) throw new Error('Spiritomb lives in the Shady Forest (Level 1)');
    S.give(); S.setInnocents(Math.max(S.save.innocents, S.NEED));
    if (S.save.won) { S.save.won = 0; }
    if (!AI.Well.st.well) wellHere();
    S.startScene(AI.Well.st.well);
    return 'the well answers…';
  }
  // the hidden KARMA (100-karma.js): how far the forest remembers, and its judgment
  function karma(k) {
    const K = AI.Karma;
    if (!K || !K.set) throw new Error('the KARMA system isn\'t loaded yet');
    const show = () => 'KARMA ' + K.value + ' / ' + K.MAX + ' · stage ' + K.stage + ' of ' + (K.CUTS.length) + (K.maxed ? ' · MAX: the forest is empty, the mansion gates are shut' : '') + (K.phase !== 'quiet' ? ' · ' + K.phase : '');
    if (!k) return show() + '  (karma max | clear | <0-' + K.MAX + '> | judge)';
    if (k === 'max') { K.set(K.MAX); return show(); }
    if (k === 'clear' || k === 'reset' || k === 'off') { K.set(0); return show(); }
    if (k === 'judge' || k === 'judgment') { if (!K.judge()) throw new Error('the judgment happens in the Shady Forest, once (start a Level 1 run)'); return 'The forest has not forgotten… (the run ends after the judgment)'; }
    if (/^\d+$/.test(k)) { K.set(+k); return show(); }
    throw new Error('karma | karma max | karma clear | karma <0-' + K.MAX + '> | karma judge');
  }
  // the Sealed Chamber and the Regis (69-regi.js)
  function regi(k) {
    const G = AI.Regi;
    if (!G) throw new Error('the Regi module isn\'t loaded');
    const nm = { 377: 'Regirock', 378: 'Regice', 379: 'Registeel', 486: 'Regigigas' };
    const show = () => 'Sealed Chamber: ' + (G.solved() ? 'solved' : 'sealed') + ' · team: ' + (G.setupOk() ? 'Relicanth first, Wailord last ✓' : 'needs Relicanth first and Wailord last') + ' · beaten: ' + (Object.keys(G.save.won).map((d) => nm[d] || d).join(', ') || 'none') + (G.gigasOk() ? ' · all three Regis on your team' : '');
    if (!k) return show() + '  (regi solve | reset | team | chamber | steel | rock | gigas)';
    if (k === 'solve') { G.unlock(); return 'the Sealed Chamber is solved: the caves open in the Shady Forest (Registeel) and the Crystal Caves (Regirock)'; }
    if (k === 'reset') { G.forget(); return 'the Sealed Chamber is sealed again; no Regi beaten'; }
    if (k === 'team') {
      const r = R();
      for (const d of [369, 321]) if (!r.DB.owns(d)) r.DB.grant(d, 'dev');
      const t = AI.Team.chosen().filter((d) => d !== 369 && d !== 321).slice(0, 4);
      AI.Team.setTeam([369].concat(t, [321])); commit(); refreshMenu();
      return 'your team: Relicanth first, Wailord last' + (inRun() ? ' (from your next run)' : '');
    }
    if (k === 'chamber') {
      const p = need(), o = AI.Ocean && AI.Ocean.on() && AI.Ocean.islandById('sealed');
      if (!o) throw new Error('the Sealed Chamber is in the Tropical Ocean (Level 3)');
      if (p.psxBoat) AI.Boats.leave(p.psxBoat, [o.x, o.y + 200]);
      p.x = o.x; p.y = o.y + 200; p._psxOk = [p.x, p.y];
      return 'you stand before the Sealed Chamber';
    }
    const dex = { steel: 379, registeel: 379, rock: 377, regirock: 377, gigas: 486, regigigas: 486 }[k];
    if (!dex) throw new Error('regi | regi solve | reset | team | chamber | steel | rock | gigas');
    const p = need();
    G.unlock();
    delete G.st.beatenRun[dex];
    G.st.scene = null;
    const c = G.caveOf(dex) && Math.hypot(G.caveOf(dex).x - p.x, G.caveOf(dex).y - p.y) < 600 ? G.caveOf(dex) : G.placeCave(dex, [p.x, p.y - 180]);
    G.startScene(c);
    return nm[dex] + '\'s door opens…';
  }
  function weather(k) {
    const W = { clear: { rain: 0, storm: 0, fog: 0, cloud: 0.1, snow: 0 }, rain: { rain: 0.8, storm: 0, fog: 0.1, cloud: 0.8, snow: 0 }, storm: { rain: 1, storm: 1, fog: 0.1, cloud: 1, snow: 0 }, fog: { rain: 0, storm: 0, fog: 0.95, cloud: 0.5, snow: 0 }, snow: { rain: 0, storm: 0, fog: 0.2, cloud: 0.8, snow: 0.9 }, auto: { release: true } }[k];
    if (!W) throw new Error('weather clear | rain | storm | fog | snow | auto');
    AI.Sky.set(W);
    return 'weather: ' + k;
  }
  function refreshMenu() {
    try { const r = R(); if (r.Game.state !== 'playing' && r.Game.toUI) { /* the menu redraws itself on its next visit */ } } catch (e) { /* ignore */ }
    try { if (AI.Menu) AI.Menu.swap(); } catch (e) { /* ignore */ }
  }

  const HELP = [
    'unlock stages | pokemon | shiny | all     lock stages',
    'spawn <name|dex> [n] [boss|peaceful]      catch <name|dex>      spawns on|off',
    'keystone      innocents <n>      spiritomb      well      mansion',
    'regi      regi solve | reset | team | chamber | steel | rock | gigas   (the Sealed Chamber and the Regis)',
    'karma      karma max | clear | <0-25> | judge   (the hidden KARMA: test it maxed or not)',
    'god      heal      level <n>      coins <n>      kill      time <hour>      weather <clear|rain|storm|fog|snow|auto>',
  ];
  function run(line) {
    const a = line.trim().split(/\s+/), c = (a[0] || '').toLowerCase(), x = a[1], y = a[2], z = a[3];
    const r = R();
    switch (c) {
      case '': return '';
      case 'help': case '?': return HELP.join('\n');
      case 'unlock':
        if (x === 'stages' || x === 'levels') return unlockStages(true);
        if (x === 'pokemon' || x === 'pokémon' || x === 'mons') return unlockPokemon(false);
        if (x === 'shiny' || x === 'shinies') return unlockPokemon(true);
        if (x === 'all' || !x) { unlockStages(true); return unlockPokemon(true) + '; every level is open'; }
        throw new Error('unlock stages | pokemon | shiny | all');
      case 'lock': return unlockStages(false);
      case 'spawn': {
        let n = 1, mode = null;
        for (const t of [y, z]) { if (t == null) continue; if (/^\d+$/.test(t)) n = +t; else mode = t.toLowerCase(); }
        return spawn(x, n, mode);
      }
      case 'catch': case 'give': if (c === 'give' && x === 'keystone') { AI.Spiritomb.give(); return 'you have the Odd Keystone'; } return catchOne(x);
      case 'spawns': AI.Debug.freeze(x === 'off'); return 'wild Pokémon ' + (x === 'off' ? 'stop appearing' : 'appear again');
      case 'keystone': AI.Spiritomb.give(); return 'you have the Odd Keystone';
      case 'innocents': AI.Spiritomb.setInnocents(+x || AI.Spiritomb.NEED); return 'innocent Pokémon defeated: ' + AI.Spiritomb.save.innocents;
      case 'spiritomb': return spiritombNow();
      case 'well': return wellHere();
      case 'karma': return karma((x || '').toLowerCase());
      case 'regi': return regi((x || '').toLowerCase());
      case 'mansion': need(); if (!AI.Forest || !AI.Forest.on()) throw new Error('the mansion is in the Shady Forest'); AI.Journey.establishNow(); return 'the path to the mansion is open';
      case 'god': { const p = need(); p.god = !p.god; return 'god mode ' + (p.god ? 'on' : 'off'); }
      case 'heal': { const p = need(); p.hp = p.maxHp; return 'healed'; }
      case 'level': { need(); const n = U.clamp(+x || 1, 1, 50); for (let i = 0; i < n; i++) r.Game.debugLevelUp(); return '+' + n + ' level' + (n > 1 ? 's' : ''); }
      case 'coins': { const n = +x || 1000; if (inRun()) r.Game.player.coins = (r.Game.player.coins || 0) + n; else { r.DB.save.coins = (r.DB.save.coins || 0) + n; commit(); } return '+' + n + ' coins'; }
      case 'kill': need(); AI.Debug.clear(true); return 'every Pokémon around is gone';
      case 'time': if (x == null) throw new Error('time <hour 0-24>'); AI.Sky.set({ hour: +x }); return 'it is ' + (+x) + ':00';
      case 'weather': return weather((x || '').toLowerCase());
      default: throw new Error('unknown command "' + c + '" (type help)');
    }
  }
  function exec(line) {
    if (!line.trim()) return;
    hist.push(line); hi = hist.length;
    log('> ' + line, '#9fb4d8');
    try { const res = run(line); if (res) for (const s of String(res).split('\n')) log(s, '#d8e2f0'); } catch (e) { log(e.message || String(e), '#ff8a8a'); }
  }

  // ---------------------------------------------------------------- the panel
  const BUTTONS = [
    ['Unlock everything', 'unlock all'], ['All stages', 'unlock stages'], ['All Pokémon', 'unlock pokemon'], ['All shinies', 'unlock shiny'],
    ['God mode', 'god'], ['Heal', 'heal'], ['+5 levels', 'level 5'], ['+10000 coins', 'coins 10000'],
    ['Spawns off', 'spawns off'], ['Spawns on', 'spawns on'], ['Clear Pokémon', 'kill'], ['Mansion now', 'mansion'],
    ['Odd Keystone', 'keystone'], ['100 innocents', 'innocents 100'], ['Well here', 'well'], ['Fight Spiritomb', 'spiritomb'],
    ['Regi: status', 'regi'], ['Chamber solved', 'regi solve'], ['Relicanth + Wailord', 'regi team'], ['Go to the Chamber', 'regi chamber'],
    ['Fight Registeel', 'regi steel'], ['Fight Regirock', 'regi rock'], ['Fight Regigigas', 'regi gigas'], ['Regi: reset', 'regi reset'],
    ['KARMA: show', 'karma'], ['KARMA max', 'karma max'], ['KARMA clear', 'karma clear'], ['KARMA judgment', 'karma judge'],
    ['Noon', 'time 12'], ['Midnight', 'time 0'], ['Clear sky', 'weather clear'], ['Storm', 'weather storm'],
  ];
  function build() {
    el = document.createElement('div');
    el.id = 'psx-dev';
    el.style.cssText = 'position:fixed;left:50%;top:6%;transform:translateX(-50%);z-index:100000;width:min(720px,calc(100vw - 32px));max-height:86vh;display:flex;flex-direction:column;gap:8px;padding:12px;background:rgba(10,12,20,0.94);border:2px solid #5a4ad0;border-radius:10px;color:#d8e2f0;font:13px/1.4 ui-monospace,Consolas,monospace;box-shadow:0 10px 40px rgba(0,0,0,0.6)';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b style="color:#b8a8ff">Dev console</b><span style="opacity:.6">F9 or ` to close · type help</span></div>' +
      '<div data-b style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px"></div>' +
      '<div data-o style="flex:1;min-height:120px;max-height:36vh;overflow:auto;white-space:pre-wrap;background:rgba(0,0,0,0.35);padding:6px 8px;border-radius:6px"></div>' +
      '<input data-i spellcheck="false" autocomplete="off" placeholder="spawn gastly 5 · catch spiritomb · unlock all…" style="width:100%;box-sizing:border-box;padding:7px 9px;background:#141a2a;color:#fff;border:1px solid #3a4a7a;border-radius:6px;font:inherit">';
    const bx = el.querySelector('[data-b]');
    for (const [label, cmd] of BUTTONS) {
      const b = document.createElement('button');
      b.textContent = label; b.dataset.cmd = cmd;
      b.style.cssText = 'padding:6px 8px;background:#232b48;color:#e6ecff;border:1px solid #3d4a80;border-radius:6px;cursor:pointer;font:12px ui-monospace,Consolas,monospace';
      b.onclick = () => { exec(cmd); input.focus(); };
      bx.appendChild(b);
    }
    out = el.querySelector('[data-o]');
    input = el.querySelector('[data-i]');
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation(); // (typing doesn't move you or fire moves)
      if (ev.key === 'Enter') { exec(input.value); input.value = ''; }
      else if (ev.key === 'ArrowUp') { hi = Math.max(0, hi - 1); input.value = hist[hi] || ''; ev.preventDefault(); }
      else if (ev.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; ev.preventDefault(); }
      else if (ev.key === 'Escape' || ev.key === 'F9' || ev.key === '`') { ev.preventDefault(); close(); }
    });
    input.addEventListener('keyup', (ev) => ev.stopPropagation());
    document.body.appendChild(el);
    log('PokéSurvivor+ dev console. Type help for the commands.', '#b8a8ff');
  }
  function open() { if (!el) build(); el.style.display = 'flex'; setTimeout(() => input && input.focus(), 0); }
  function close() { if (el) el.style.display = 'none'; }
  function isOpen() { return !!el && el.style.display !== 'none'; }
  function toggle() { if (isOpen()) close(); else open(); }

  function install(r) {
    // the game's own developer switch: every level open while it's on
    if (!r.DevMenu) {
      const dm = {};
      Object.defineProperty(dm, 'on', { get() { return !!save.stages; }, set(v) { save.stages = !!v; persist(); }, enumerable: true });
      r.DevMenu = dm;
    }
    addEventListener('keydown', (ev) => {
      if (ev.code !== 'F9' && ev.code !== 'Backquote') return;
      const t = ev.target;
      if (t && t !== input && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; // (typing in a chat box)
      ev.preventDefault(); ev.stopPropagation();
      toggle();
    }, true);
  }

  AI.define('Dev', { install, open, close, toggle, isOpen, run, exec, find, unlockStages, unlockPokemon, spawn, get save() { return save; } });
})();
