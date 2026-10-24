/* PokéSurvivor+ — Living World AI · how Mega Evolution and Z-Moves are earned
 * This replaces the game's own unlocks (Mega at level 50 for anyone with a form, Z-Moves at
 * level 10 with a locked slot on the bar before that). Now:
 *
 * Mega Evolution
 *   - only after Level 2 (Crystal Cave) has been beaten, and only from Level 3 on (Volcano, Zona Cero)
 *   - only with that Pokémon's own Mega Stone, which is a held item: it takes the one held-item
 *     slot like any other (Lucario holding Lucarionite holds no Assault Vest), and picking one up
 *     while holding something else asks which to keep
 *   - stones only ever come for the Pokémon you're playing (Lucarionite for Lucario, never Gengarite):
 *       level-up 1% (rolled on each level gained, offered right after the level-up screen)
 *       normal chest 5% · big chest 10%
 *       a glowing stone lying somewhere on the map: no message, no marker, no arrow; you find it
 *         or you don't (one chance per run, at a random moment)
 *   - forms that need no item in the games (Rayquaza's Dragon Ascent, Zen Mode, Palafin's Hero form)
 *     follow the same milestone without a stone
 *
 * Z-Moves
 *   - after Level 3 (Volcano) has been beaten, in the stages after it (Zona Cero for now)
 *   - each needs the Z-Crystal of the Pokémon's own Z-Move type, earned only by completing that
 *     type's Totem Trial (89-totem.js); never from chests or level-ups
 *   - until a Z-Move is actually usable its slot does not exist on the bar (no locked slot, no level)
 *
 * Dynamax is not part of this game yet (there is no Eternatus stage), so nothing unlocks it.
 * The game asks these rules through three one-expression hooks in js/app.min.js (PSXGEN.mega,
 * PSXGEN.zmove, PSXGEN.noZslot).
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  // each form's own item, by its name in the games
  const STONE = {
    '6_megax': 'Charizardite X', '65_mega': 'Alakazite', '80_mega': 'Slowbronite', '94_mega': 'Gengarite', '115_mega': 'Kangaskhanite',
    '142_mega': 'Aerodactylite', '150_megay': 'Mewtwonite Y', '208_mega': 'Steelixite', '227_mega': 'Skarmorite', '229_mega': 'Houndoominite',
    '248_mega': 'Tyranitarite', '282_mega': 'Gardevoirite', '302_mega': 'Sablenite', '303_mega': 'Mawilite', '308_mega': 'Medichamite',
    '310_mega': 'Manectite', '319_mega': 'Sharpedonite', '323_mega': 'Cameruptite', '334_mega': 'Altarianite', '354_mega': 'Banettite',
    '359_mega': 'Absolite', '362_mega': 'Glalitite', '380_mega': 'Latiasite', '381_mega': 'Latiosite', '382_primal': 'Blue Orb',
    '383_primal': 'Red Orb', '428_mega': 'Lopunnite', '448_mega': 'Lucarionite', '475_mega': 'Galladite', '491_mega': 'Darkranite',
    '530_mega': 'Excadrite', '560_mega': 'Scraftinite', '604_mega': 'Eelektrossite', '670_mega': 'Floettite', '691_mega': 'Dragalgite',
    '718_mega': 'Zygardite', '719_mega': 'Diancite', '780_mega': 'Drampanite', '807_mega': 'Zeraorite', '978_mega': 'Tatsugirinite',
    '800_ultra': 'Ultranecrozium Z', '646_black': 'DNA Splicers (Zekrom)', '646_white': 'DNA Splicers (Reshiram)',
    '888_crowned': 'Rusted Sword', '889_crowned': 'Rusted Shield', '720_unbound': 'Prison Bottle',
  };
  const NO_ITEM = new Set(['384_mega', '964_hero', '555_zen']);
  const CRYSTAL = {
    normal: 'Normalium Z', fire: 'Firium Z', water: 'Waterium Z', grass: 'Grassium Z', electric: 'Electrium Z', ice: 'Icium Z',
    fighting: 'Fightinium Z', poison: 'Poisonium Z', ground: 'Groundium Z', flying: 'Flyinium Z', psychic: 'Psychium Z', bug: 'Buginium Z',
    rock: 'Rockium Z', ghost: 'Ghostium Z', dragon: 'Dragonium Z', dark: 'Darkinium Z', steel: 'Steelium Z', fairy: 'Fairium Z',
  };
  const P = { chest: 0.05, bigchest: 0.1, levelup: 0.01 }; // exact, no pity

  function on() { return !!(AI.enabled && AI.cfg.powerRework !== false && AI.R && AI.R.Mega); }
  function player() { return AI.R.Game.player; }
  function save() { return (AI.R.DB && AI.R.DB.save) || {}; }
  // a stage beaten (wins are counted per map: 2 = Crystal Cave, 3 = Volcano)
  function beaten(n) { const s = save(); return !!((s.mapWins && s.mapWins[n]) || (s.ach && s.ach['arceus' + n])); }
  function stage() { try { return (AI.R.Maps.cur && AI.R.Maps.cur.n) || 1; } catch (e) { return 1; } }
  function megaStage() { return beaten(2) && stage() >= 3; }
  function zStage() { return beaten(3) && stage() >= 4; }

  // ---------------------------------------------------------------- Mega Stones as held items
  const isStone = (id) => typeof id === 'string' && id.indexOf('mstone_') === 0;
  const formOf = (id) => (isStone(id) ? id.slice(7) : null);
  function stonesFor(dex) {
    try { return AI.R.Mega.formsOf(dex).filter((k) => STONE[k] && !NO_ITEM.has(k)).map((k) => 'mstone_' + k); } catch (e) { return []; }
  }
  function registerItems() {
    const R = AI.R;
    if (!R.Items || !R.Items.BY || R.Items.BY.mstone_448_mega) return;
    for (const k in STONE) {
      if (!R.Mega.FORMS[k]) continue;
      const dex = +k.split('_')[0];
      const id = 'mstone_' + k;
      const it = {
        id, name: STONE[k], psxStone: k, dex,
        desc: 'Lets ' + ((R.DEX_BY[dex] || {}).name || 'its Pokémon') + ' transform (Space). Takes your held-item slot.',
        on() {},
        off(p) { try { if (p && p.megaKey) R.Mega.end(p); } catch (e) { /* ignore */ } },
      };
      R.Items.LIST.push(it);
      R.Items.BY[id] = it;
    }
    // the game's random item drops never hand out a stone (they only come the ways above)
    const oRoll = R.Items.roll;
    R.Items.roll = function (ex) {
      if (!on()) { let id; for (let i = 0; i < 30; i++) { id = oRoll.apply(this, arguments); if (!isStone(id)) return id; } return id; }
      const pool = R.Items.LIST.filter((i) => i.id !== ex && !i.psxStone);
      return U.pick(pool).id;
    };
    // stones are drawn from the game's own stone sheet
    const I = R.Icons;
    if (I) {
      const oHtml = I.html, oDraw = I.draw, oUrl = I.url;
      I.html = function (id, size) { return isStone(id) ? R.Mega.stoneHtml(formOf(id), size || 24) : oHtml.apply(this, arguments); };
      I.draw = function (ctx, id, x, y, size) { if (isStone(id)) { try { R.Mega.drawStone(ctx, formOf(id), x + size / 2, y + size / 2, size, null, 1); } catch (e) { /* ignore */ } return; } return oDraw.apply(this, arguments); };
      if (oUrl) I.url = function (id) { if (isStone(id)) return stoneUrl(formOf(id)); return oUrl.apply(this, arguments); };
    }
  }
  const urls = {};
  function stoneUrl(k) {
    if (urls[k]) return urls[k];
    const c = document.createElement('canvas'); c.width = c.height = 32;
    try { AI.R.Mega.drawStone(c.getContext('2d'), k, 16, 16, 32, null, 1); } catch (e) { /* ignore */ }
    const u = c.toDataURL();
    if (u.length > 300) urls[k] = u; // (blank until the sheet has loaded)
    return u;
  }

  // ---------------------------------------------------------------- the rules the game asks
  // can this Pokémon Mega Evolve right now?
  function megaOk(p) {
    if (!on()) return p.level >= 50; // (the game's own rule, if this is switched off)
    if (!p || p.remote || p !== player() || !megaStage()) return false;
    const R = AI.R;
    const forms = R.Mega.formsOf(p.dex);
    const held = formOf(p.item);
    if (held && forms.includes(held)) {
      // the stone you hold decides the form (Charizardite X → Mega Charizard X)
      const s = save();
      if (!(s.megaForm && s.megaForm[p.dex] === held)) try { R.Mega.setForm(p.dex, held); } catch (e) { /* ignore */ }
      return true;
    }
    return forms.some((k) => NO_ITEM.has(k));
  }
  // can it use its Z-Move right now?
  function zOk(p, def) {
    if (!on()) return p.level >= 10;
    if (p !== player()) return p.level >= 10; // (other players' clients decide for themselves)
    return zStage() && !!def && hasCrystal(def.type);
  }

  // ---------------------------------------------------------------- Z-Crystals (kept for good once earned)
  const ZKEY = 'psx.zcrystals.v1';
  let crystals = {};
  try { crystals = JSON.parse(localStorage.getItem(ZKEY) || '{}') || {}; } catch (e) { crystals = {}; }
  function hasCrystal(t) { return !!crystals[t]; }
  function giveCrystal(t) {
    if (!CRYSTAL[t] || crystals[t]) return false;
    crystals[t] = Date.now();
    try { localStorage.setItem(ZKEY, JSON.stringify(crystals)); } catch (e) { /* ignore */ }
    AI.Bus.emit({ type: 'zcrystal', t, x: player().x, y: player().y, loud: 0 });
    return true;
  }
  // the type of this Pokémon's own Z-Move (one of its types; the game lets you pick which)
  function zTypeOf(p) {
    try { const types = (p.mon && p.mon.types) || (AI.R.DEX_BY[p.dex] || {}).types || []; return AI.R.Ult.typeFor(p.dex, types) || null; } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- where stones come from
  function canGetStone(p) {
    if (!on() || !p || !megaStage()) return null;
    const list = stonesFor(p.dex).filter((id) => id !== p.item);
    return list.length ? U.pick(list) : null;
  }
  function offer(id, x, y) {
    if (!id) return false;
    try { AI.R.Pickups.drop('item', x, y, id); } catch (e) { AI.warn('stone-drop', e); return false; }
    st.log.push({ id, t: AI.time, how: st.how });
    return true;
  }
  // chests: 5% (normal) and 10% (big), and only a stone this Pokémon can use
  function onChest(prop) {
    if (!prop || prop._psxStone || (prop.type !== 'chest' && prop.type !== 'bigchest')) return;
    prop._psxStone = true;
    const p = player();
    const id = canGetStone(p);
    if (!id) return;
    if (Math.random() < (prop.type === 'bigchest' ? P.bigchest : P.chest)) { st.how = prop.type; offer(id, prop.x, prop.y - 12); }
  }
  const st = { lastLevel: null, world: null, worldAt: null, worldDone: false, log: [], how: '' };
  function tick(dt) {
    if (!on()) return;
    const R = AI.R, p = player();
    if (!p || p.dead || R.Game.state === 'menu') return;
    // a level gained: 1% per level
    if (st.lastLevel == null) st.lastLevel = p.level;
    while (p.level > st.lastLevel) {
      st.lastLevel++;
      const id = canGetStone(p);
      if (id && Math.random() < P.levelup) { st.how = 'levelup'; offer(id, p.x, p.y); }
    }
    if (p.level < st.lastLevel) st.lastLevel = p.level;
    tickWorld(dt);
  }
  // the stone on the map: one chance a run, placed out of sight at a random moment, never announced
  function tickWorld(dt) {
    const R = AI.R, p = player();
    if (st.worldDone || (AI.Mansion && AI.Mansion.inside) || (AI.Totem && AI.Totem.active())) return;
    if (st.worldAt == null) st.worldAt = U.rand(180, 900);
    const t = (R.Game.time || 0);
    if (!st.world) {
      if (t < st.worldAt) return;
      const id = canGetStone(p);
      if (!id) return;
      for (let k = 0; k < 30; k++) {
        const a = Math.random() * 6.283, d = U.rand(700, 1400);
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.85;
        if (!R.World.isFree(x, y, 18) || R.Camera.sees(x, y, 60)) continue;
        if (AI.Forest && AI.Forest.on() && AI.Forest.water(x, y).e > -20) continue;
        st.world = { id, x, y, t: 0 };
        return;
      }
      return;
    }
    const w = st.world;
    w.t += dt;
    if (Math.hypot(p.x - w.x, p.y - w.y) < 26) {
      st.how = 'world';
      offer(w.id, p.x, p.y);
      st.world = null; st.worldDone = true;
    }
  }
  function drawAir(ctx) {
    const w = st.world;
    if (!w || !on() || !AI.R.Camera.sees(w.x, w.y, 40)) return;
    try { AI.R.Mega.drawStone(ctx, formOf(w.id), w.x, w.y - 10 - Math.sin(AI.time * 2) * 2, 16, 'active', 1); } catch (e) { /* ignore */ }
  }
  function lights(out) {
    const w = st.world;
    if (!w || !on()) return;
    let c = [200, 170, 255];
    try { const col = AI.R.Mega.colorOf(formOf(w.id)); const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(col); if (m) c = [+m[1], +m[2], +m[3]]; } catch (e) { /* ignore */ }
    out.push({ x: w.x, y: w.y - 10, r: 70, c, i: 0.65 + Math.sin(AI.time * 3) * 0.15 });
  }
  function reset() { st.lastLevel = null; st.world = null; st.worldAt = null; st.worldDone = false; st.log.length = 0; }

  // the game's hooks (js/app.min.js) ask these
  function install() {
    if (!window.PSXGEN) return;
    window.PSXGEN.mega = (p) => megaOk(p);
    window.PSXGEN.zmove = (p, def) => zOk(p, def);
    window.PSXGEN.noZslot = () => on(); // with this rework the bar never shows a locked Z slot
  }
  install();

  AI.define('Power', {
    st, STONE, NO_ITEM, CRYSTAL, P, beaten, stage, megaStage, zStage, stonesFor, isStone, formOf, megaOk, zOk, hasCrystal, giveCrystal, zTypeOf,
    canGetStone, offer, onChest, tick, drawAir, lights, reset, registerItems, install,
    get crystals() { return crystals; },
    _forgetCrystals() { crystals = {}; try { localStorage.removeItem(ZKEY); } catch (e) { /* ignore */ } },
  });
})();
