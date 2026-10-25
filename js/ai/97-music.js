/* PokéSurvivor+ — Living World AI · music for places that have their own
 * The game picks a track every frame (the level's own, 'rift', 'boss', the Judgment's). Two places
 * have their own music instead of the level's track:
 *   - the Shady Forest: Viridian Forest (assets/music/viridian-forest.mp3), while a boss, a rift or
 *     the Judgment still bring their own music in
 *   - inside the haunted mansion: Old Chateau (assets/music/old-chateau.mp3), whatever is going on
 * While one of them plays, the game's music is stopped; it comes back as soon as you leave. Each
 * plays looped at your music volume and fades in and out. Settings: forestMusic, mansionMusic.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const SONGS = { forest: 'assets/music/viridian-forest.mp3', chateau: 'assets/music/old-chateau.mp3' };
  const IN_RUN = new Set(['playing', 'paused', 'choice']);
  const st = { req: null, cur: null, els: {}, hooked: false, orig: null };

  // the game asked for its level's own track (not a boss, a rift or the Judgment)?
  function regular(name) {
    const R = AI.R;
    return !!name && name !== 'rift' && name !== 'boss' && name !== 'village' && !(R.Judgment && R.Judgment.active);
  }
  function choose() {
    const R = AI.R;
    if (!AI.enabled || !R || !R.Game) return null;
    if (AI.Mansion && AI.Mansion.inside && AI.cfg.mansionMusic !== false) return 'chateau';
    if (AI.cfg.forestMusic !== false && IN_RUN.has(R.Game.state) && AI.Forest && AI.Forest.on() && regular(st.req)) return 'forest';
    return null;
  }
  function hook() {
    const A = AI.R && AI.R.Audio;
    if (st.hooked || !A || typeof A.music !== 'function') return;
    st.hooked = true;
    st.orig = A.music;
    A.music = function (name) { st.req = name; return st.orig.call(this, choose() ? null : name); };
  }
  function tick(dt) {
    const A = AI.R && AI.R.Audio;
    if (!A) return;
    hook();
    const want = choose();
    if (want !== st.cur) {
      st.cur = want;
      try { st.orig.call(A, want ? null : st.req); } catch (e) { /* ignore */ }
    }
    const set = A.settings || {};
    const vol = set.muted ? 0 : (set.music == null ? 0.55 : set.music) * 0.9;
    for (const k in SONGS) {
      const target = k === want ? vol : 0;
      let el = st.els[k];
      if (!el && target > 0) { try { el = st.els[k] = new Audio(SONGS[k]); el.loop = true; el.volume = 0; } catch (e) { continue; } }
      if (!el) continue;
      el.volume = U.clamp(el.volume + U.clamp(target - el.volume, -dt * 0.6, dt * 0.4), 0, 1);
      if (target > 0 && el.paused) { const pr = el.play(); if (pr && pr.catch) pr.catch(() => { /* not allowed yet: try again later */ }); }
      if (target === 0 && el.volume <= 0.001 && !el.paused) el.pause();
    }
  }
  // (on a timer, so the music also fades out in the menus, where the game loop doesn't run)
  setInterval(() => { try { tick(0.1); } catch (e) { AI.warn('music', e); } }, 100);

  AI.define('Music', { st, SONGS, choose, tick });
})();
