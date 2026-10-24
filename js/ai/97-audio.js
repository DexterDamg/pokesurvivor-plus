/* PokéSurvivor+ — Living World AI · ambient sound (synthesised, no audio files)
 * Morning birdsong and buzzing insects, Hoothoot calls and crickets at night, wind in the branches,
 * rain that sounds different on leaves, open ground and stone, thunder that rolls in late and
 * muffled when the storm is far away, rustling bushes, splashes, squelching mud, snoring Pokémon.
 * In deep fog the ordinary sounds fade away; now and then a branch creaks somewhere unseen.
 * Inside the haunted mansion the forest falls away: the house settles and creaks, a clock ticks in
 * the foyer, and the hauntings knock, bang, whisper and scratch behind the walls. Something much
 * older brings a low drone and a silence nothing else can.
 * Follows the game's sound-effect volume and mute setting.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  let ctx = null, master = null, noise = null, echo = null;
  const layers = {};
  let started = false;

  function start() {
    if (started) { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    started = true;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      let b = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
      // a soft echo for distant sounds (music box, creaks, thunder)
      echo = ctx.createDelay(1.2);
      echo.delayTime.value = 0.36;
      const fb = ctx.createGain(); fb.gain.value = 0.38;
      const eg = ctx.createGain(); eg.gain.value = 0.5;
      echo.connect(fb).connect(echo);
      echo.connect(eg).connect(master);
      layers.wind = loop('bandpass', 420, 0.8);
      layers.leaves = loop('bandpass', 2600, 0.6);
      layers.open = loop('highpass', 1400, 0.5);
      layers.stone = loop('highpass', 4200, 0.7);
      layers.bed = loop('lowpass', 900, 0.5);
      layers.house = loop('lowpass', 140, 0.7);
      layers.drone = droneLayer();
      crickets();
      // paused, in a menu, or the run is over: fade out
      setInterval(() => {
        const R = AI.R;
        if (!ctx || (R && R.Game.state === 'playing' && AI.enabled)) return;
        set(master.gain, 0, 0.15);
      }, 250);
    } catch (e) { AI.warn('audio', e); ctx = null; }
  }
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, start, { capture: true, passive: true });

  function loop(type, freq, q) {
    const src = ctx.createBufferSource();
    src.buffer = noise; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(master);
    src.start();
    return { src, f, g };
  }
  function crickets() {
    const o = ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 4300;
    const am = ctx.createGain(); am.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 22;
    const lg = ctx.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4300; f.Q.value = 8;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(am).connect(f).connect(g).connect(master);
    o.start(); lfo.start();
    layers.crickets = { g, am };
  }
  // a low, beating drone: two sine waves a hair apart, felt more than heard
  function droneLayer() {
    const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
    for (const hz of [36, 38.2, 54.5]) { const o = ctx.createOscillator(); o.type = hz > 50 ? 'triangle' : 'sine'; o.frequency.value = hz; o.connect(f); o.start(); }
    f.connect(g).connect(master);
    return { g };
  }
  function vol() {
    const A = AI.R && AI.R.Audio;
    const s = A && A.settings;
    if (!s || s.muted) return 0;
    return (s.sfx == null ? 0.7 : s.sfx) * (AI.cfg.ambientVol == null ? 0.7 : AI.cfg.ambientVol);
  }
  function set(param, v, tc = 0.4) { param.setTargetAtTime(v, ctx.currentTime, tc); }

  // ---------------------------------------------------------------- spatial one-shots
  function where(x, y) {
    const p = AI.R && AI.R.Game.player;
    if (!p || x == null) return [0, 1];
    const d = Math.hypot(x - p.x, y - p.y);
    return [U.clamp((x - p.x) / 450, -1, 1), U.clamp(1 - d / 700, 0, 1)];
  }
  function out(pan, wet) {
    const g = ctx.createGain();
    const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pn) { pn.pan.value = pan; g.connect(pn).connect(master); if (wet) pn.connect(echo); }
    else { g.connect(master); if (wet) g.connect(echo); }
    return g;
  }
  function tone(type, f0, f1, dur, gain, pan, wet, at = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = out(pan, wet);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(type, freq, q, dur, gain, pan, wet, at = 0, attack = 0.01) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = out(pan, wet);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  const ok = () => ctx && vol() > 0 && AI.R && AI.R.Game.state === 'playing' && AI.cfg.atmosphere !== false;

  function chirp(x, y) {
    if (!ok()) return;
    const [pan] = x == null ? [U.rand(-0.8, 0.8)] : where(x, y);
    const n = 2 + ((Math.random() * 3) | 0), base = U.rand(2400, 3600);
    for (let i = 0; i < n; i++) tone('sine', base * U.rand(0.9, 1.1), base * U.rand(1.2, 1.5), 0.07, 0.035, pan, false, i * U.rand(0.09, 0.14));
  }
  function hoot() {
    if (!ok()) return;
    const pan = U.rand(-0.9, 0.9);
    tone('sine', 430, 400, 0.32, 0.05, pan, true, 0);
    tone('sine', 420, 380, 0.42, 0.05, pan, true, 0.42);
  }
  function thunder(dist) {
    if (!ok()) return;
    const near = U.clamp(1.25 - dist * 0.3, 0.15, 1);
    burst('lowpass', 1800 / (1 + dist), 0.7, 2.5 + dist * 0.6, 0.35 * near, U.rand(-0.6, 0.6), true, 0, 0.03 + dist * 0.04);
    tone('sine', 55, 38, 2.4, 0.12 * near, 0, false);
  }
  // the storm clearing its throat somewhere far away
  function rumble() {
    if (!ok()) return;
    burst('lowpass', 260, 0.8, 3.2, 0.12, U.rand(-0.7, 0.7), true, 0, 0.6);
    tone('sine', 46, 34, 3, 0.05, 0, false);
  }
  function rustle(x, y, k = 1) { if (!ok()) return; const [pan, v] = where(x, y); if (v > 0) burst('bandpass', 3200, 0.8, 0.18, 0.04 * k * v, pan, false); }
  function splash(x, y) { if (!ok()) return; const [pan, v] = where(x, y); burst('bandpass', 1300, 1.2, 0.22, 0.07 * v, pan, false); tone('sine', 300, 120, 0.12, 0.03 * v, pan, false); }
  function squelch(x, y) { if (!ok()) return; const [pan, v] = where(x, y); burst('lowpass', 420, 2, 0.25, 0.06 * v, pan, false); }
  function snore(x, y) { if (!ok()) return; const [pan, v] = where(x, y); if (v > 0.35) burst('lowpass', 320, 4, 0.9, 0.022 * v, pan, false, 0, 0.4); }
  function cry(x, y, k = 1) {
    if (!ok()) return;
    const [pan, v] = where(x, y);
    for (let i = 0; i < 3; i++) tone('triangle', 1300, 2100, 0.12, 0.05 * k * Math.max(0.3, v), pan, false, i * 0.16);
  }
  function flutter(x, y) { if (!ok()) return; const [pan] = where(x, y); for (let i = 0; i < 9; i++) burst('bandpass', 900, 0.8, 0.06, 0.05, pan + U.rand(-0.3, 0.3), false, i * 0.05); }
  function creak() {
    if (!ok()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(82, t);
    for (let i = 1; i < 8; i++) o.frequency.linearRampToValueAtTime(70 + Math.random() * 30, t + i * 0.22);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 6;
    const g = out(U.rand(-0.5, 0.5), true);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(f).connect(g); o.start(t); o.stop(t + 1.9);
  }
  function branch() { if (!ok()) return; tone('sawtooth', 120, 85, 0.7, 0.015, U.rand(-1, 1), true); }

  // ---------------------------------------------------------------- the haunted mansion
  let houseLevel = 1, droneLevel = 0, tickT = 0, settleT = 6;
  function knock(pan, wet, at, gain) { burst('lowpass', 260, 1.4, 0.16, gain || 0.12, pan, wet, at, 0.004); tone('sine', 120, 70, 0.12, (gain || 0.12) * 0.5, pan, wet, at); }
  function mansion(name, x, y, o) {
    if (name === 'blip') { if (!ctx || vol() <= 0) return; tone('square', o || 520, (o || 520) * 0.98, 0.04, 0.018, 0, false); return; }
    if (!ok()) return;
    const [pan0, v0] = x != null && x !== 0 ? where(x, y) : [U.rand(-0.4, 0.4), 1];
    const pan = pan0, v = Math.max(0.25, v0);
    switch (name) {
      case 'creak': {
        const t = ctx.currentTime;
        const os = ctx.createOscillator(); os.type = 'sawtooth';
        os.frequency.setValueAtTime(130, t);
        for (let i = 1; i < 6; i++) os.frequency.linearRampToValueAtTime(95 + Math.random() * 70, t + i * 0.16);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 9;
        const g = out(pan, true);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07 * v, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        os.connect(f).connect(g); os.start(t); os.stop(t + 1.2);
        break;
      }
      case 'slam': burst('lowpass', 500, 0.8, 0.5, 0.3 * v, pan, true, 0, 0.003); tone('sine', 90, 40, 0.4, 0.25 * v, pan, true); break;
      case 'rattle': for (let i = 0; i < 6; i++) burst('bandpass', 2400, 3, 0.05, 0.06 * v, pan, false, i * 0.07 + Math.random() * 0.02); break;
      case 'knock': { const n = o || 3; for (let i = 0; i < n; i++) knock(pan, true, i * 0.32 + (i === n - 1 ? 0.12 : 0), 0.13 * v); break; }
      case 'bang': for (let i = 0; i < (o || 3); i++) { burst('lowpass', 150, 1, 0.5, 0.28, pan, true, i * 0.55, 0.005); tone('sine', 70, 34, 0.45, 0.22, pan, true, i * 0.55); } break;
      case 'step': burst('lowpass', 380, 1.2, 0.14, 0.07 * v, pan, true, 0, 0.004); break;
      case 'whisper':
        for (let i = 0; i < 7; i++) {
          const fq = U.rand(1400, 3800);
          burst('bandpass', fq, 7, U.rand(0.18, 0.4), 0.035 * v, pan + U.rand(-0.2, 0.2), true, i * U.rand(0.12, 0.3), 0.05);
        }
        break;
      case 'scratch': for (let i = 0; i < 10; i++) burst('bandpass', U.rand(1800, 3200), 4, 0.09, 0.04 * v, pan, false, i * 0.11 + Math.random() * 0.05, 0.02); break;
      case 'draft': {
        const t = ctx.currentTime;
        const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
        f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(1600, t + 1.2); f.frequency.exponentialRampToValueAtTime(300, t + 2.4);
        const g = out(pan, true);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
        src.connect(f).connect(g); src.start(t); src.stop(t + 2.6);
        break;
      }
      case 'chime': for (let i = 0; i < (o || 3); i++) { tone('sine', 523.3, 520, 2.2, 0.05, pan, true, i * 1.4); tone('sine', 1046.5, 1040, 1.6, 0.02, pan, true, i * 1.4); tone('sine', 659.3, 655, 2, 0.025, pan, true, i * 1.4 + 0.02); } break;
      case 'laugh':
        for (let i = 0; i < 5; i++) {
          const f0 = (o || 420) * (1 - i * 0.04);
          tone('sawtooth', f0 * 1.15, f0, 0.11, 0.035 * v, pan, true, i * 0.14);
          burst('bandpass', f0 * 3, 4, 0.1, 0.03 * v, pan, true, i * 0.14, 0.01);
        }
        break;
      case 'clank': tone('triangle', 1650, 1500, 0.35, 0.05 * v, pan, true); tone('triangle', 2320, 2200, 0.25, 0.03 * v, pan, true, 0.02); burst('highpass', 3500, 1, 0.12, 0.05 * v, pan, false); break;
      case 'swish': burst('bandpass', 1800, 1.2, 0.22, 0.07 * v, pan, false, 0, 0.06); break;
      case 'snuff': burst('bandpass', 700, 1, 0.25, 0.05 * v, pan, false, 0, 0.02); break;
      case 'ignite': burst('highpass', 2500, 0.8, 0.3, 0.04 * v, pan, false, 0, 0.01); tone('sine', 300, 600, 0.2, 0.02 * v, pan, false); break;
      case 'chandelier': for (let i = 0; i < 8; i++) tone('sine', U.rand(2400, 4200), 2000, 0.4, 0.012, pan + U.rand(-0.2, 0.2), true, i * 0.09); tone('sawtooth', 70, 60, 1.4, 0.012, pan, true); break;
      case 'boom': tone('sine', 60, 28, 1.6, 0.45, 0, true); burst('lowpass', 120, 1, 1.4, 0.3, 0, true, 0, 0.01); break;
      case 'sting': {
        // the jumpscare: a shrieking cluster over a falling sub-boom
        for (const fq of [311, 329.6, 466, 493.9, 698.5, 740]) tone('sawtooth', fq, fq * 0.82, 1.3, 0.06, U.rand(-0.5, 0.5), true);
        burst('highpass', 1800, 0.7, 0.9, 0.22, 0, true, 0, 0.003);
        tone('sine', 110, 26, 1.8, 0.5, 0, true);
        break;
      }
      case 'drone': droneLevel = o == null ? 0.8 : o; break;
      case 'silence': houseLevel = o == null ? 0 : o; break;
      default: break;
    }
  }
  function mansionMix(dt, v) {
    for (const k of ['wind', 'leaves', 'open', 'stone', 'bed']) set(layers[k].g.gain, 0, 0.5);
    set(layers.crickets.g.gain, 0, 0.5);
    set(layers.house.g.gain, 0.05 * houseLevel, 1.2);
    set(layers.drone.g.gain, 0.22 * droneLevel, droneLevel > 0 ? 2.5 : 1.2);
    if (houseLevel < 0.1) return;
    // the house settles
    settleT -= dt;
    if (settleT <= 0) { settleT = U.rand(8, 22); if (Math.random() < 0.6) mansion('creak'); else burst('bandpass', 600, 2, 0.4, 0.02, U.rand(-1, 1), true); }
    // the grandfather clock in the foyer
    const it = AI.Mansion && AI.Mansion.st.built;
    const p = AI.R.Game.player;
    if (it && p) {
      const clock = it.props.find((q) => q.kind === 'clock');
      if (clock && !clock.stopped) {
        const d = Math.hypot(p.x - clock.x, p.y - clock.y);
        tickT -= dt;
        if (tickT <= 0 && d < 700) { tickT = 1; const k = U.clamp(1 - d / 700, 0, 1); tone('square', (AI.time | 0) % 2 ? 1900 : 1600, 1500, 0.025, 0.012 * k * houseLevel, U.clamp((clock.x - p.x) / 450, -1, 1), true); }
      }
    }
  }

  // the music box near the abandoned trail: an eerie little waltz in A minor
  const TUNE = [880, 1046.5, 1318.5, 1046.5, 987.8, 1174.7, 1568, 1174.7, 880, 1046.5, 1318.5, 1760, 1661.2, 1318.5, 987.8, 0];
  let tuneI = 0, tuneT = 0, musicLevel = 0;
  function musicBox(level) { musicLevel = level || 0; }

  // ---------------------------------------------------------------- per-frame mix
  let birdT = 1, hootT = 6, creakT = 10;
  function tick(dt) {
    if (!ctx) return;
    const R = AI.R;
    const playing = R && R.Game.state === 'playing' && AI.enabled && AI.cfg.atmosphere !== false;
    const S = AI.Sky;
    const inHouse = !!(AI.Mansion && AI.Mansion.inside);
    const v = playing && S && (!S.indoor() || inHouse) ? vol() : 0;
    set(master.gain, v * 0.6, 0.6);
    if (!v) return;
    if (inHouse) { mansionMix(dt, v); return; }
    set(layers.house.g.gain, 0, 0.5);
    set(layers.drone.g.gain, 0.22 * droneLevel, 1.5);
    const p = R.Game.player;
    const fog = S.fog, dark = S.darkness(), rain = S.rain;
    let trees = 0, stones = 0;
    if (p) {
      for (const pr of AI.Env.props(p.x, p.y, 260)) { if (pr.type === 'tree') trees++; else if (pr.type === 'rock') stones++; }
      if (AI.Decor && AI.Decor.trailZone(p.x, p.y) > 0) stones += 3;
    }
    const tree = U.clamp(trees / 8, 0, 1), stone = U.clamp(stones / 5, 0, 1);
    const quiet = 1 - U.clamp((fog - 0.6) / 0.35, 0, 0.92); // deep fog swallows the forest's voice
    const wind = S.windNow();
    set(layers.wind.g.gain, Math.min(0.32, wind * 0.22) * (fog > 0.8 ? 0.4 : 1));
    set(layers.wind.f.frequency, 300 + wind * 500 + S.gust * 300, 0.8);
    set(layers.leaves.g.gain, rain * (0.06 + tree * 0.16));
    set(layers.open.g.gain, rain * (1 - tree) * 0.1 + S.storm * 0.03);
    set(layers.stone.g.gain, rain * stone * 0.07);
    set(layers.bed.g.gain, (0.018 + tree * 0.02) * (1 - dark) * quiet);
    set(layers.crickets.g.gain, 0.02 * dark * (1 - rain) * quiet * (S.season() === 'winter' ? 0.1 : 1));
    // birdsong: a dawn chorus, quieter at midday, silent at night, in the rain and in deep fog
    const h = S.hour();
    const birdRate = (h > 5 && h < 9 ? 1.8 : h >= 9 && h < 17 ? 0.5 : h >= 17 && h < 19.5 ? 0.35 : 0) * (1 - rain * 0.85) * quiet * (S.season() === 'winter' ? 0.3 : 1);
    birdT -= dt * birdRate;
    if (birdT <= 0) { birdT = U.rand(0.6, 2.2); chirp(); }
    if (dark > 0.6 && rain < 0.3) { hootT -= dt * quiet; if (hootT <= 0) { hootT = U.rand(9, 22); hoot(); } }
    if (fog > 0.7) { creakT -= dt; if (creakT <= 0) { creakT = U.rand(7, 16); branch(); } }
    // puddle plops in the rain
    if (rain > 0.3 && AI.Decor && AI.Decor.puddleAmt() > 0.3 && Math.random() < dt * rain * 3) tone('sine', U.rand(500, 900), 200, 0.05, 0.012, U.rand(-0.8, 0.8), false);
    // music box
    if (musicLevel > 0.02) {
      tuneT -= dt;
      if (tuneT <= 0) {
        tuneT = 0.42;
        const f = TUNE[tuneI++ % TUNE.length];
        if (f) tone('sine', f, f * 0.999, 0.9, 0.035 * musicLevel, U.rand(-0.3, 0.3), true);
      }
    } else tuneI = 0;
  }

  AI.define('Ambience', { start, tick, chirp, hoot, thunder, rumble, rustle, splash, squelch, snore, cry, flutter, creak, branch, musicBox, mansion, get ctx() { return ctx; } });
})();
