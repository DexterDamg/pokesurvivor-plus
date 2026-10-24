/* PokéSurvivor+ — Living World AI · sky: time of day, seasons and living weather
 * A day/night clock (dawn → midday → evening → midnight), the sun and moon (phase, direction,
 * shadow length), seasons, and a continuous weather simulation (clouds, rain, fog, wind, storms,
 * snow) that changes through believable transitions. The game's own weather events still run
 * their gameplay effects; the sky simply follows them, so a "Rain" event really looks and feels
 * like rain. Wetness builds up while it rains and dries slowly afterwards.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  // ambient light keyframes: hour → [r, g, b] (multiplied over the scene; 255 = untouched)
  const AMBIENT = [
    [0, [52, 62, 112]], [3.8, [58, 64, 114]], [5, [104, 92, 136]], [5.9, [176, 134, 146]], [6.8, [236, 206, 186]],
    [8.2, [252, 246, 236]], [12, [255, 255, 252]], [16, [255, 246, 228]], [17.4, [255, 214, 170]], [18.4, [240, 150, 116]],
    [19.2, [178, 108, 152]], [20, [104, 86, 140]], [21, [62, 66, 116]], [24, [52, 62, 112]],
  ];
  const SKY = [ // sky colour (puddle reflections, fog tint)
    [0, [24, 30, 58]], [5, [70, 62, 104]], [6.2, [240, 170, 150]], [8, [170, 210, 245]], [17, [180, 205, 240]],
    [18.6, [250, 150, 100]], [19.6, [120, 80, 140]], [21, [30, 36, 70]], [24, [24, 30, 58]],
  ];

  // weather patterns the sky drifts between: target values for each channel
  const PATTERNS = {
    clear: { cloud: 0.05, rain: 0, fog: 0, wind: 0.12, storm: 0 },
    fair: { cloud: 0.3, rain: 0, fog: 0, wind: 0.2, storm: 0 },
    cloudy: { cloud: 0.7, rain: 0, fog: 0.05, wind: 0.3, storm: 0 },
    drizzle: { cloud: 0.75, rain: 0.3, fog: 0.1, wind: 0.2, storm: 0 },
    rain: { cloud: 0.9, rain: 0.68, fog: 0.08, wind: 0.35, storm: 0 },
    storm: { cloud: 1, rain: 1, fog: 0.05, wind: 0.72, storm: 1 },
    mist: { cloud: 0.4, rain: 0, fog: 0.35, wind: 0.05, storm: 0 },
    fog: { cloud: 0.6, rain: 0, fog: 0.7, wind: 0.04, storm: 0 },
    deepfog: { cloud: 0.7, rain: 0, fog: 0.97, wind: 0.02, storm: 0 },
    breezy: { cloud: 0.35, rain: 0, fog: 0, wind: 0.55, storm: 0 },
    gale: { cloud: 0.55, rain: 0.05, fog: 0, wind: 0.95, storm: 0 },
  };
  // pattern weights by season (a forest feel; other biomes tweak it below)
  const SEASON_W = {
    spring: { clear: 3, fair: 3, cloudy: 2, drizzle: 2, rain: 1.6, storm: 0.6, mist: 1.4, fog: 0.8, deepfog: 0.3, breezy: 1.4, gale: 0.4 },
    summer: { clear: 4, fair: 3, cloudy: 1.4, drizzle: 0.8, rain: 1, storm: 1.1, mist: 0.6, fog: 0.4, deepfog: 0.15, breezy: 1, gale: 0.3 },
    autumn: { clear: 2, fair: 2.4, cloudy: 2.6, drizzle: 2, rain: 1.8, storm: 0.6, mist: 1.6, fog: 1.4, deepfog: 0.6, breezy: 2, gale: 1 },
    winter: { clear: 2.4, fair: 2, cloudy: 2.8, drizzle: 0.8, rain: 1, storm: 0.3, mist: 1.4, fog: 1.4, deepfog: 0.5, breezy: 1.4, gale: 0.9 },
  };
  const DRY_BIOMES = new Set([2, 4, 11]); // volcano, desert: hardly any rain or fog
  const INDOOR_BIOMES = new Set([1, 5, 7, 9, 13, 15, 18, 19, 21]); // caves, temples, factories: no sky

  const st = {
    hour: 6.5, day: 0, // clock
    cur: { cloud: 0.2, rain: 0, fog: 0.2, wind: 0.15, storm: 0, snow: 0 },
    tgt: { cloud: 0.2, rain: 0, fog: 0.2, wind: 0.15, storm: 0, snow: 0 },
    pattern: 'fair', patternT: 50,
    windAng: 0.3, gust: 0, gustT: 4, gustPow: 0,
    wet: 0, snowCover: 0,
    flash: 0, boltT: 8, thunders: [],
    phase: 'dawn', lastPhase: null,
    forced: null, // debug overrides {channel: value}
    seasonOverride: null,
  };

  // ---------------------------------------------------------------- clock
  function cfgOn() { return AI.cfg.atmosphere !== false; }
  function indoor() { try { return INDOOR_BIOMES.has(AI.Env.biome()); } catch (e) { return false; } }
  function hour() { return st.hour; }
  function phaseOf(h) {
    if (h >= 5 && h < 8) return 'dawn';
    if (h >= 8 && h < 17) return 'day';
    if (h >= 17 && h < 20) return 'dusk';
    return 'night';
  }
  // 0 at noon … 1 at midnight, smooth around dawn/dusk
  function darkness() {
    const h = st.hour;
    if (h >= 7.5 && h <= 17.5) return 0;
    if (h > 17.5 && h < 20.5) return (h - 17.5) / 3;
    if (h > 4.5 && h < 7.5) return 1 - (h - 4.5) / 3;
    return 1;
  }
  function isNight() { return darkness() > 0.7; }
  function midday() { return st.hour >= 11 && st.hour < 14.5; }
  function midnight() { return st.hour >= 23 || st.hour < 2.5; }
  // sun: elevation 0..1 (0 below the horizon), and the direction shadows fall
  function sunElev() { return Math.max(0, Math.sin(((st.hour - 6) / 12) * Math.PI)); }
  function shadowDir() {
    // morning shadows stretch west, noon short and slightly north, evening east
    const k = U.clamp((st.hour - 6) / 12, 0, 1);
    const a = Math.PI + 0.32 - k * (Math.PI + 0.64);
    if (sunElev() <= 0.02) return [Math.cos(-2.2), Math.sin(-2.2)]; // moonlight: soft, from the south-east
    return [Math.cos(a), Math.sin(a) * 0.55 - 0.25];
  }
  function shadowLen() {
    const e = sunElev();
    if (e <= 0.02) return 0.9;
    return U.clamp(0.35 / Math.max(0.16, e), 0.4, 2.3);
  }
  // how strong cast shadows are right now (sun or moon, minus clouds and fog)
  function shadowStrength() {
    const e = sunElev();
    const c = st.cur;
    const clear = (1 - c.cloud * 0.75) * (1 - c.fog * 0.8) * (1 - c.rain * 0.3);
    if (e > 0.02) return U.clamp(0.42 * Math.min(1, e * 3) * clear, 0, 0.42);
    return 0.13 * moonLight() * clear;
  }
  function moonPhase() { return (st.day % 8) / 8; } // 0 new … 0.5 full
  function moonLight() { return 0.5 - 0.5 * Math.cos(moonPhase() * Math.PI * 2); }

  function season() {
    const o = st.seasonOverride || AI.cfg.season;
    if (o && o !== 'auto' && SEASONS.includes(o)) return o;
    const m = new Date().getMonth();
    return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
  }
  function hot() { return (season() === 'summer' || weatherKind() === 'sun' || weatherKind() === 'harsh') && midday() && st.cur.cloud < 0.5; }

  function lerpKeys(keys, h) {
    for (let i = 0; i < keys.length - 1; i++) {
      const [h0, c0] = keys[i], [h1, c1] = keys[i + 1];
      if (h >= h0 && h <= h1) {
        const t = (h - h0) / (h1 - h0);
        return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
      }
    }
    return keys[0][1].slice();
  }
  // the colour the whole scene is multiplied by (before local lights are added)
  function ambient() {
    if (!cfgOn() || indoor()) return [255, 255, 255];
    const c = lerpKeys(AMBIENT, st.hour);
    const d = darkness();
    // moonlight: a full moon is noticeably brighter, a new moon very dark
    const moon = 0.78 + 0.32 * moonLight() * (1 - st.cur.cloud * 0.8);
    const k = d > 0 ? U.lerp(1, moon, d) : 1;
    const w = st.cur;
    const dim = 1 - w.cloud * 0.16 - w.rain * 0.14 - w.storm * 0.12 + st.flash * 1.4;
    const out = [c[0] * k * dim, c[1] * k * dim, c[2] * k * dim];
    // fog lifts the darks toward grey, rain and night shift to blue
    if (w.fog > 0) for (let i = 0; i < 3; i++) out[i] = U.lerp(out[i], 196 - d * 90, w.fog * 0.35);
    out[2] += w.rain * 10;
    return out.map((v) => U.clamp(Math.round(v), 0, 255));
  }
  function skyColor() {
    const c = lerpKeys(SKY, st.hour);
    const g = st.cur.cloud * 0.6 + st.cur.rain * 0.3;
    return c.map((v) => Math.round(U.lerp(v, 120 + (1 - darkness()) * 60, g)));
  }

  // ---------------------------------------------------------------- weather simulation
  function weatherKind() { try { const w = AI.R.Weather.current; return w ? w.kind : null; } catch (e) { return null; } }
  function pickPattern() {
    const b = AI.Env.biome();
    const w = Object.assign({}, SEASON_W[season()]);
    if (DRY_BIOMES.has(b)) { w.drizzle = 0.1; w.rain = 0.1; w.storm = 0.05; w.mist = 0.1; w.fog = 0.1; w.deepfog = 0; w.clear += 3; }
    if (b === 8) { w.breezy += 1; w.gale += 0.6; } // glacier
    if (b === 16 || b === 20) { w.mist += 1.5; w.fog += 1.5; w.deepfog += 0.8; } // graveyard, enchanted forest
    if (st.hour >= 4.5 && st.hour < 8) { w.mist += 3; w.fog += 1; } // morning mist
    if (isNight()) { w.fog += 0.6; w.deepfog += 0.25; }
    // stay a while in calm weather, storms don't follow storms
    if (st.pattern === 'storm') w.storm = 0;
    w.clear *= 1; w.fair *= 1;
    const f = Math.max(0, AI.cfg.weatherFreq == null ? 1 : AI.cfg.weatherFreq);
    for (const k in w) if (!['clear', 'fair'].includes(k)) w[k] *= f;
    return U.wpick(w) || 'fair';
  }
  function setPattern(name, hold) {
    st.pattern = name;
    st.patternT = hold || U.rand(45, 110);
    Object.assign(st.tgt, PATTERNS[name]);
    AI.Bus.emit({ type: 'weather', x: 0, y: 0, loud: 0, pattern: name });
  }

  // the game's own weather events: follow them so the sky agrees with the gameplay
  function followVanilla() {
    const k = weatherKind();
    const t = st.tgt;
    if (!k) return;
    if (k === 'rain') { t.rain = Math.max(t.rain, 0.7); t.cloud = Math.max(t.cloud, 0.85); }
    else if (k === 'storm') { t.rain = 1; t.storm = 1; t.cloud = 1; t.wind = Math.max(t.wind, 0.65); }
    else if (k === 'fog') { t.fog = Math.max(t.fog, 0.72); t.wind = Math.min(t.wind, 0.08); }
    else if (k === 'winds') { t.wind = Math.max(t.wind, 0.9); }
    else if (k === 'snow' || k === 'hail') { t.snow = 1; t.cloud = Math.max(t.cloud, 0.8); t.rain = 0; }
    else if (k === 'sun' || k === 'harsh') { t.cloud = 0; t.rain = 0; t.fog = 0; t.storm = 0; }
    else if (k === 'sand') { t.wind = Math.max(t.wind, 0.7); t.rain = 0; }
  }

  function tick(dt) {
    if (!dt || dt <= 0) return;
    const dayLen = Math.max(60, AI.cfg.dayLength || 600);
    if (!st.frozen) st.hour += (dt / dayLen) * 24;
    if (st.hour >= 24) { st.hour -= 24; st.day++; }
    const ph = phaseOf(st.hour);
    if (ph !== st.phase) {
      st.lastPhase = st.phase;
      st.phase = ph;
      AI.Bus.emit({ type: 'phase', x: 0, y: 0, loud: 0, phase: ph });
    }
    // weather fronts
    st.patternT -= dt;
    if (st.patternT <= 0) setPattern(pickPattern());
    const winter = season() === 'winter';
    Object.assign(st.tgt, PATTERNS[st.pattern]);
    st.tgt.snow = winter && st.tgt.rain > 0.2 ? 1 : 0;
    if (winter) st.tgt.rain *= 0.15;
    if (st.hour >= 4.5 && st.hour < 8.5 && !DRY_BIOMES.has(AI.Env.biome())) st.tgt.fog = Math.max(st.tgt.fog, 0.22 * (1 - Math.abs(st.hour - 6.3) / 2.2)); // dawn mist
    followVanilla();
    if (indoor()) { st.tgt.rain = 0; st.tgt.storm = 0; st.tgt.snow = 0; st.tgt.wind = Math.min(st.tgt.wind, 0.1); st.tgt.cloud = 0; }
    if (st.forced) Object.assign(st.tgt, st.forced);
    // believable transitions: fog creeps in, rain builds up, wind picks up faster than it dies
    const RATE = { cloud: 0.03, rain: 0.035, fog: 0.022, wind: 0.06, storm: 0.04, snow: 0.03 };
    for (const k in st.cur) {
      const r = (st.forced && k in st.forced ? 3 : 1) * RATE[k] * dt;
      const d = st.tgt[k] - st.cur[k];
      st.cur[k] += U.clamp(d, -r, r);
    }
    // wind: direction drifts, gusts come and go
    st.windAng += (Math.sin(AI.time * 0.05) * 0.02 + (Math.random() - 0.5) * 0.01) * dt * 10;
    st.gustT -= dt;
    if (st.gustT <= 0) {
      st.gustT = U.rand(2.5, 7) / (0.4 + st.cur.wind);
      st.gustPow = st.cur.wind * U.rand(0.4, 1.15);
      if (st.gustPow > 0.75) AI.Bus.emit({ type: 'gust', x: 0, y: 0, loud: 0, power: st.gustPow });
    }
    st.gust = U.lerp(st.gust, st.gustPow, Math.min(1, dt * 1.8));
    st.gustPow *= Math.pow(0.6, dt);
    // wetness and snow cover
    const c = st.cur;
    if (c.rain > 0.05) st.wet = Math.min(1, st.wet + dt * c.rain * 0.045);
    else st.wet = Math.max(0, st.wet - dt * (0.0035 + sunElev() * (1 - c.cloud) * 0.006 + c.wind * 0.003));
    if (c.snow > 0.2) st.snowCover = Math.min(1, st.snowCover + dt * c.snow * 0.02);
    else st.snowCover = Math.max(0, st.snowCover - dt * (season() === 'winter' ? 0.001 : 0.01));
    // lightning & delayed thunder
    st.flash = Math.max(0, st.flash - dt * 3.2);
    if (c.storm > 0.45) {
      st.boltT -= dt * c.storm;
      if (st.boltT <= 0) {
        st.boltT = U.rand(4, 13);
        bolt();
      }
    }
    for (let i = st.thunders.length - 1; i >= 0; i--) {
      const th = st.thunders[i];
      th.t -= dt;
      if (th.t <= 0) {
        st.thunders.splice(i, 1);
        AI.Bus.emit({ type: 'boom', x: th.x, y: th.y, loud: th.loud, thunder: true, dist: th.dist });
        if (AI.Ambience) AI.Ambience.thunder(th.dist);
      }
    }
  }

  function bolt(distKm) {
    const p = AI.R.Game.player;
    const dist = distKm != null ? distKm : U.rand(0.25, 3.2);
    st.flash = U.clamp(1.1 - dist * 0.25, 0.25, 1);
    const a = Math.random() * 6.283;
    const x = (p ? p.x : 0) + Math.cos(a) * dist * 600, y = (p ? p.y : 0) + Math.sin(a) * dist * 600;
    AI.Bus.emit({ type: 'lightning', x, y, loud: 0, dist });
    // sound travels slower than light: ~3 s per km
    st.thunders.push({ t: dist * 2.9, x: p ? p.x : x, y: p ? p.y : y, dist, loud: Math.round(600 - dist * 120) });
  }

  // ---------------------------------------------------------------- queries for other systems
  function windVec() { const w = st.cur.wind + st.gust * 0.6; return [Math.cos(st.windAng) * w, Math.sin(st.windAng) * w * 0.5]; }
  function windNow() { return U.clamp(st.cur.wind + st.gust * 0.6, 0, 1.6); }
  // how far creatures can see (1 = normal)
  function visibility(nocturnal) {
    if (!cfgOn()) return 1;
    let v = 1 - st.cur.fog * 0.82;
    v *= 1 - st.cur.rain * 0.18;
    const d = darkness();
    if (!indoor() && d > 0) v *= nocturnal ? 1 : U.lerp(1, 0.55 + moonLight() * 0.15, d);
    return U.clamp(v, 0.12, 1);
  }

  function reset() {
    st.hour = U.clamp(AI.cfg.startHour == null ? 6.5 : AI.cfg.startHour, 0, 23.99);
    st.day = 0;
    st.phase = phaseOf(st.hour);
    st.wet = 0; st.snowCover = season() === 'winter' ? 0.6 : 0;
    st.flash = 0; st.thunders.length = 0;
    st.forced = null;
    st.frozen = false;
    setPattern(st.hour < 8 ? 'mist' : 'fair', U.rand(40, 80));
    Object.assign(st.cur, st.tgt);
  }

  // debug / tests: Sky.set({hour: 0, rain: 1, fog: 0.9, wind: 1, storm: 1, wet: 1, season: 'autumn'})
  function set(o) {
    if (o.hour != null) { st.hour = ((o.hour % 24) + 24) % 24; st.phase = phaseOf(st.hour); }
    if (o.day != null) st.day = o.day;
    if (o.season !== undefined) st.seasonOverride = o.season;
    if (o.wet != null) st.wet = o.wet;
    if (o.snowCover != null) st.snowCover = o.snowCover;
    const ch = {};
    for (const k of ['cloud', 'rain', 'fog', 'wind', 'storm', 'snow']) if (o[k] != null) ch[k] = o[k];
    if (Object.keys(ch).length) {
      st.forced = Object.assign(st.forced || {}, ch);
      if (o.instant !== false) Object.assign(st.cur, ch);
    }
    if (o.release) st.forced = null;
    if (o.freeze != null) st.frozen = !!o.freeze;
    if (o.pattern) setPattern(o.pattern, o.hold);
  }

  AI.define('Sky', {
    st, PATTERNS, tick, reset, set, bolt,
    hour, phase: () => st.phase, phaseOf, darkness, isNight, midday, midnight, hot,
    sunElev, shadowDir, shadowLen, shadowStrength, moonPhase, moonLight, season, ambient, skyColor,
    windVec, windNow, visibility, weatherKind, indoor,
    get rain() { return st.cur.rain; }, get fog() { return st.cur.fog; }, get wind() { return st.cur.wind; },
    get storm() { return st.cur.storm; }, get cloud() { return st.cur.cloud; }, get snow() { return st.cur.snow; },
    get wet() { return st.wet; }, get flash() { return st.flash; }, get gust() { return st.gust; },
    get snowCover() { return st.snowCover; },
  });
})();
