/* PokéSurvivor+ — Living World AI · earned encounters
 * Special encounters follow your progress instead of a clock:
 *   defeat Pokémon → reach a milestone → a boss approaches / a rift opens
 *  - the timed "Pokémon surge" hordes are switched off (setting: hordes)
 *  - each boss becomes eligible after a number of Pokémon defeated (setting: bossKills), only one
 *    at a time, with a cooldown between major encounters and a notice when one approaches
 *  - normal rifts open at their own milestones (riftKills), golden rifts much later (goldenRiftKills),
 *    at a reachable spot away from you; the game's timed rifts are cancelled
 * The game's own boss and rift systems do the actual spawning, so rewards and fights are unchanged.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const MSG = {
    boss: { es: '¡Algo poderoso se acerca…!', en: 'Something powerful is approaching…', fr: 'Quelque chose de puissant approche…', zh: '有強大的氣息正在接近……' },
    rift: { es: 'Una grieta se ha abierto cerca.', en: 'A rift has opened nearby.', fr: 'Une faille s\'est ouverte non loin.', zh: '附近出現了裂縫。' },
    gold: { es: '¡Una grieta dorada brilla en la distancia!', en: 'A golden rift shimmers in the distance!', fr: 'Une faille dorée scintille au loin !', zh: '遠方閃耀著金色的裂縫！' },
  };
  const st = { lastEvent: -999, rift: 0, gold: 0, ours: null, bossPending: null, rolled: null };

  function on() { return AI.enabled && AI.cfg.earnedEvents !== false; }
  function host() { const C = AI.R.Coop; return !C || !C.active || C.isHost; }
  function say(key, dur) { try { AI.R.Spawner.say(MSG[key][AI.lang ? AI.lang() : 'en'] || MSG[key].en, dur || 3.2); } catch (e) { /* ignore */ } }
  function kills() { const p = AI.R.Game.player; return p ? p.kills || 0 : 0; }
  // the n-th milestone of a list; past its end the gaps keep growing like the last one
  function milestone(list, n) {
    if (!list || !list.length) return Infinity;
    if (n < list.length) return list[n];
    const last = list[list.length - 1], step = list.length > 1 ? last - list[list.length - 2] : last;
    return last + step * (n - list.length + 1);
  }

  // a new run: hold every boss back until it's earned
  function onRoll() {
    st.lastEvent = -999; st.rift = 0; st.gold = 0; st.ours = null; st.bossPending = null;
    if (!on()) return;
    try { for (const b of AI.R.Enemies.BOSSES) { if (b._psxAt == null) b._psxAt = b.at; b.at = 1e9; } } catch (e) { AI.warn('progress', e); }
    st.rolled = AI.R.Enemies.BOSSES;
  }

  function riftSpot(p) {
    const W = AI.R.World;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * 6.283, r = U.rand(700, 1150);
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * 0.85;
      if (W.kindAt(x, y) === 'floor' && W.isFree(x, y, 30)) return [x, y];
    }
    return null;
  }

  function tick(dt) {
    const R = AI.R;
    if (!R || R.Game.state !== 'playing') return;
    const S = R.Spawner, Rift = R.Rift;
    if (!S || !Rift) return;
    // hordes
    try {
      const sn = S.snap();
      if (AI.enabled && !AI.cfg.hordes && sn.surgeT < 1e8) S.restore({ bossIdx: sn.bossIdx, surgeT: 1e9 });
      else if ((!AI.enabled || AI.cfg.hordes) && sn.surgeT > 1e8) S.restore({ bossIdx: sn.bossIdx, surgeT: 45 });
    } catch (e) { /* ignore */ }
    if (!on() || !host()) {
      // switched off mid-run: give the bosses their original schedule back
      if (st.rolled) { for (const b of st.rolled) if (b._psxAt != null && b.at >= 1e9) b.at = b._psxAt; st.rolled = null; }
      return;
    }
    if (R.Enemies.BOSSES !== st.rolled) onRoll();
    // the game's own timed rifts don't open any more
    const rf = Rift.rift;
    if (rf && rf !== st.ours) { try { Rift.onEvent(['riftx']); } catch (e) { /* ignore */ } }
    const now = AI.time;
    const busy = R.EnemyMgr.bossAlive() || Rift.inArena || Rift.open || (R.Judgment && R.Judgment.active) || now - st.lastEvent < (AI.cfg.eventCooldown || 75);
    const k = kills();
    // a boss approaches once it's earned
    if (st.bossPending) {
      if (now >= st.bossPending.at) { st.bossPending.b.at = 0; st.bossPending = null; st.lastEvent = now; }
      return;
    }
    const sn = S.snap();
    const B = R.Enemies.BOSSES;
    if (!busy && sn.bossIdx < B.length && k >= milestone(AI.cfg.bossKills, sn.bossIdx)) {
      say('boss', 3.4);
      st.bossPending = { b: B[sn.bossIdx], at: now + 4 };
      return;
    }
    if (busy) return;
    // golden rifts are rare; normal rifts come more often
    const p = R.Game.player;
    let gold = null;
    if (k >= milestone(AI.cfg.goldenRiftKills, st.gold)) gold = true;
    else if (k >= milestone(AI.cfg.riftKills, st.rift)) gold = false;
    if (gold === null || !p) return;
    const at = riftSpot(p);
    if (!at) return;
    try {
      Rift.onEvent(['rift', Math.round(at[0]), Math.round(at[1]), gold ? 60 : 45, gold ? 1 : 0]);
      st.ours = Rift.rift;
      if (R.Coop && R.Coop.isHost) R.Coop.broadcast(['rift', Math.round(at[0]), Math.round(at[1]), gold ? 60 : 45, gold ? 1 : 0]);
    } catch (e) { AI.warn('rift', e); return; }
    if (gold) st.gold++; else st.rift++;
    st.lastEvent = now;
    say(gold ? 'gold' : 'rift', 3.2);
  }

  AI.define('Progress', { st, tick, onRoll, milestone });
})();
