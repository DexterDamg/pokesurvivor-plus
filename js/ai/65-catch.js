/* PokéSurvivor+ — Living World AI · Pokémon are earned by playing (no gacha)
 * The gacha is gone: its menu entry, the ticket counter and its screen are hidden, and the tickets
 * Pokémon used to drop are PokéCoins instead. You get Pokémon by playing:
 *   - Each Pokémon you defeat may join you. The first time it's a small chance (smaller for strong
 *     and rare species), and it grows with every one of that species you defeat; after enough of
 *     them one is sure to join. The count of each species you've defeated is kept between runs.
 *   - Shiny Pokémon you defeat still join you as shinies (the game's own rule).
 *   - Legendary and Mythical Pokémon never join this way: they have their own stories (the
 *     legendary trio, the Tapus, Deoxys, Spiritomb…). Bosses, rift Pokémon and the ones in a story
 *     don't either, and nothing joins in Training.
 * Joined Pokémon can be chosen as your partner from the menu like any other.
 * Settings: noGacha, catchRate.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const KEY = 'psx.catch.v1';
  const NEVER = new Set([442]); // Spiritomb: the Creepy Well (86-spiritomb.js)
  const RARITY = { 1: 1.4, 2: 1, 3: 0.7, 4: 0.4, 5: 0.15 };
  const PITY = { 1: 25, 2: 35, 3: 50, 4: 75, 5: 120 }; // defeated before one is sure to join
  let save = load();
  const st = { caught: 0, last: null, hooked: false };

  function load() { try { return Object.assign({ kills: {} }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { kills: {} }; } }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
    try { const sv = AI.R.DB.save; if (sv) { sv.psxCatch = { kills: Object.assign({}, save.kills) }; } } catch (e) { /* ignore */ }
  }
  function sync() {
    try {
      const sv = AI.R.DB.save, o = sv && sv.psxCatch;
      if (o && o.kills) for (const k in o.kills) save.kills[k] = Math.max(save.kills[k] || 0, o.kills[k]);
    } catch (e) { /* ignore */ }
  }
  function T(en, es) { return (AI.lang && AI.lang() === 'es' && es) || en; }
  function noGacha() { return AI.enabled && AI.cfg.noGacha !== false; }
  function owned(dex) { try { return !!AI.R.DB.owns(dex); } catch (e) { return false; } }

  // ---------------------------------------------------------------- who can join, and how likely
  function eligible(dex) {
    const d = AI.R.DEX_BY[dex];
    return !!d && !d.leg && !NEVER.has(dex);
  }
  function chance(dex) {
    const d = AI.R.DEX_BY[dex];
    if (!d) return 0;
    const n = save.kills[dex] || 0, rar = d.rarity || 3;
    if (n >= (PITY[rar] || 60)) return 1;
    const base = 0.02 * Math.pow(320 / Math.max(180, d.bst || 400), 1.5) * (RARITY[rar] || 0.5);
    return U.clamp(base * (1 + n / 15) * (AI.cfg.catchRate ?? 1), 0.002, 0.15);
  }
  function onDeath(ev) {
    const R = AI.R, e = ev.victim;
    if (!noGacha() || !e || ev.killerKey !== 'P' || !ev.victimDex) return;
    if (e.boss || e.legend || e.psxStory || e.psxNpcKill || e.psxTrio || e.psxDummy) return;
    if ((R.Training && R.Training.active) || (R.Rift && R.Rift.inArena)) return;
    const dex = ev.victimDex;
    if (!eligible(dex)) return;
    save.kills[dex] = (save.kills[dex] || 0) + 1;
    persist();
    if (owned(dex) || e.shiny) return; // (a shiny joins through the game's own rule)
    if (Math.random() < chance(dex)) join(dex, e.x, e.y);
  }
  function join(dex, x, y) {
    const R = AI.R, d = R.DEX_BY[dex];
    if (!d || owned(dex)) return false;
    try { R.DB.grant(dex, 'defeated'); if (R.DB.commit) R.DB.commit(); } catch (e) { AI.warn('catch-grant', e); return false; }
    st.caught++; st.last = dex;
    try {
      if (x != null) { R.FX.ring(x, y - 14, '#ff5252', 46); R.FX.burst(x, y - 14, '#ffffff', 14, 110); R.FX.burst(x, y - 14, '#ff5252', 10, 90); }
      R.Spawner.say(d.name + T(' joined you! Choose it as your partner from the menu.', ' se ha unido a ti. Elígelo como compañero desde el menú.'), 4, 1);
      R.Audio.sfx('levelup');
    } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'caught', dex, x, y });
    return true;
  }

  // ---------------------------------------------------------------- the gacha, gone
  function css() {
    if (document.getElementById('psx-nogacha')) return;
    const s = document.createElement('style');
    s.id = 'psx-nogacha';
    s.textContent = 'body.psx-nogacha .menu-item[data-go="gacha"], body.psx-nogacha #tickets-pill, body.psx-nogacha #scr-gacha { display: none !important; }';
    document.head.appendChild(s);
  }
  function apply() { try { document.body.classList.toggle('psx-nogacha', noGacha()); } catch (e) { /* ignore */ } }
  function install(R) {
    if (st.hooked) return;
    st.hooked = true;
    sync();
    css(); apply();
    const G = R.GachaUI;
    if (G && typeof G.open === 'function') {
      const oOpen = G.open;
      G.open = function () { if (noGacha()) { try { R.UI.show('scr-menu'); } catch (e) { /* ignore */ } return; } return oOpen.apply(this, arguments); };
    }
    // tickets become PokéCoins
    const oDrop = R.Pickups.drop;
    R.Pickups.drop = function (kind, x, y, v) {
      if (noGacha() && (kind === 'ticket' || kind === 'ticket10')) return oDrop.call(this, 'coin', x, y, kind === 'ticket10' ? 120 : 15);
      return oDrop.apply(this, arguments);
    };
    AI.Bus.on('death', (ev) => { try { onDeath(ev); } catch (e) { AI.warn('catch', e); } });
    setInterval(apply, 1000); // (the setting can be switched while in the menus)
  }

  function kills(dex) { return save.kills[dex] || 0; }
  function resetKills() { save = { kills: {} }; persist(); }

  AI.define('Catch', { st, install, chance, eligible, join, kills, resetKills, onDeath, PITY, get save() { return save; } });
})();
