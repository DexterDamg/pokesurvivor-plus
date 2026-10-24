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
    pattern: 'fair', patternT: 50, trend: 0,
    windAng: 0.3, gust: 0, gustT: 4, gustPow: 0,
    wet: 0, snowCover: 0,
    flash: 0, boltT: 8, thunders: [], pulses: [], strikes: [], next: null,
    phase: 'dawn', lastPhase: null,
    forced: null, // debug overrides {channel: value}
    seasonOverride: null,
  };

  // ---------------------------------------------------------------- clock
  function cfgOn() { return AI.cfg.atmosphere !== false; }
  function indoor() { try { return INDOOR_BIOMES.has(AI.Env.biome()) || !!(AI.Mansion && AI.Mansion.inside); } catch (e) { return false; } }
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
    if (cfgOn() && AI.Mansion && AI.Mansion.inside) return AI.Mansion.ambient();
    if (!cfgOn() || indoor()) return [255, 255, 255];
    const c = lerpKeys(AMBIENT, st.hour);
    const d = darkness();
    // moonlight: a full moon is noticeably brighter, a new moon very dark
    const moon = 0.78 + 0.32 * moonLight() * (1 - st.cur.cloud * 0.8);
    const k = d > 0 ? U.lerp(1, moon, d) : 1;
    const w = st.cur;
    // heavy storm clouds swallow the light; a nighttime storm is nearly black
    const dim = 1 - w.cloud * 0.18 - w.rain * 0.16 - w.storm * 0.24;
    const out = [c[0] * k * dim, c[1] * k * dim, c[2] * k * dim];
    // lightning: for an instant the whole forest stands out in cold white light
    const fl = Math.min(1, st.flash) * (AI.cfg.flashIntensity == null ? 1 : AI.cfg.flashIntensity);
    if (fl > 0) { out[0] = U.lerp(out[0], 228, fl); out[1] = U.lerp(out[1], 234, fl); out[2] = U.lerp(out[2], 255, fl); }
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
  // how long each kind of weather settles in (seconds), and what it can turn into next
  /* Weather only ever takes one step at a time along one of three chains, and every change is a
   * slow blend of its channels (clouds gather over about a minute, fog creeps in over two):
   *   dry ↔ wet:   clear – fair – cloudy – drizzle – rain – storm
   *   calm ↔ fog:  fair / cloudy / drizzle – mist – fog – dense fog   (calm air, dawn, night, after rain)
   *   calm ↔ wind: fair – breezy – gale
   * A front has momentum: once clouds start to gather they tend to keep building to rain (or a
   * storm) and then clear away the same way, instead of flip-flopping. Fog never turns straight into
   * sunshine or wind, and a storm never comes out of a clear sky. Each spell lasts 2–3 minutes. */
  const HOLD = {
    clear: [120, 180], fair: [120, 180], cloudy: [120, 180], drizzle: [120, 180], rain: [120, 180], storm: [120, 180],
    mist: [120, 180], fog: [120, 180], deepfog: [120, 180], breezy: [120, 180], gale: [120, 180],
  };
  const NEXT = {
    clear: { fair: 1 },
    fair: { clear: 1, cloudy: 1, breezy: 0.5, mist: 0.35 },
    cloudy: { fair: 1, drizzle: 1, mist: 0.35 },
    drizzle: { cloudy: 1, rain: 1, mist: 0.5 },
    rain: { drizzle: 1, storm: 0.6 },
    storm: { rain: 1 },
    mist: { fog: 1, fair: 0.8, cloudy: 0.8 },
    fog: { mist: 1, deepfog: 0.6 },
    deepfog: { fog: 1 },
    breezy: { fair: 1, gale: 0.5 },
    gale: { breezy: 1 },
  };
  // where each pattern sits on its chain(s): the trend remembers which way the weather is heading
  const CHAIN = [
    ['clear', 'fair', 'cloudy', 'drizzle', 'rain', 'storm'],
    ['fair', 'mist', 'fog', 'deepfog'], ['cloudy', 'mist', 'fog', 'deepfog'], ['drizzle', 'mist', 'fog', 'deepfog'],
    ['fair', 'breezy', 'gale'],
  ];
  function step(from, to) {
    for (const c of CHAIN) { const a = c.indexOf(from), b = c.indexOf(to); if (a >= 0 && b >= 0) return Math.sign(b - a); }
    return 0;
  }
  function holdFor(name) {
    const h = HOLD[name] || [120, 180];
    return U.rand(h[0], h[1]) * Math.max(0.1, AI.cfg.weatherDuration == null ? 1 : AI.cfg.weatherDuration);
  }
  function pickPattern() {
    const b = AI.Env.biome();
    const sw = SEASON_W[season()];
    const chain = NEXT[st.pattern] || NEXT.fair;
    const w = {};
    for (const k in chain) {
      let v = chain[k] * Math.sqrt(sw[k] || 1);
      // momentum: keep going the way the weather is already heading (a front builds, then clears)
      const dir = step(st.pattern, k);
      if (st.trend && dir) v *= dir === st.trend ? 2.2 : 0.45;
      w[k] = v;
    }
    if (DRY_BIOMES.has(b)) { for (const k of ['drizzle', 'rain', 'storm', 'mist', 'fog', 'deepfog']) if (w[k]) w[k] *= 0.05; }
    if (b === 8) { if (w.breezy) w.breezy *= 2; if (w.gale) w.gale *= 2; } // glacier
    if (b === 16 || b === 20) { for (const k of ['mist', 'fog', 'deepfog']) if (w[k]) w[k] *= 2.5; } // graveyard, enchanted forest
    // fog needs calm, damp air: dawn, night, or just after rain; daytime sun burns it off
    const damp = st.hour >= 4.5 && st.hour < 8.5 ? 3 : isNight() ? 1.6 : 0.5;
    for (const k of ['mist', 'fog', 'deepfog']) if (w[k] && step(st.pattern, k) > 0) w[k] *= damp;
    if ((st.pattern === 'mist' || st.pattern === 'fog') && st.hour > 9 && st.hour < 17) { if (w.fair) w.fair *= 2; if (w.mist) w.mist *= 2; }
    // and it doesn't turn straight back into what it just was (rain → storm → rain → storm…)
    if (st.prev && w[st.prev] && Object.keys(w).filter((k) => w[k] > 0).length > 1) w[st.prev] *= 0.04;
    const f = Math.max(0, AI.cfg.weatherFreq == null ? 1 : AI.cfg.weatherFreq);
    // (weatherFreq: how eager the weather is to turn wetter, foggier or windier)
    for (const k in w) if (step(st.pattern, k) > 0 && k !== 'fair') w[k] *= f;
    const next = U.wpick(w) || 'fair';
    const d = step(st.pattern, next);
    // at the end of a chain the trend turns around; a calm spell resets it
    st.trend = next === 'storm' || next === 'deepfog' || next === 'gale' ? -1 : next === 'clear' ? 0 : d || st.trend || 0;
    return next;
  }
  function setPattern(name, hold) {
    if (name !== st.pattern) st.prev = st.pattern;
    st.pattern = name;
    st.patternT = hold || holdFor(name);
    Object.assign(st.tgt, PATTERNS[name]);
    AI.Bus.emit({ type: 'weather', x: 0, y: 0, loud: 0, pattern: name });
  }

  // the game's own weather events: follow them so the sky agrees with the gameplay
  /* The sky leads, the game's weather follows: when the sky turns to rain, storm, fog, snow or a
   * gale, the matching gameplay weather is started (and kept going) for as long as it lasts; the
   * game's own random atmospheric events, which only ran ~60 s, are replaced by this. Terrain
   * fields (grassy, electric, misty, psychic) and other special weathers stay as they were.
   * In co-op only the host leads; guests follow what they receive. */
  const ATMOS = new Set(['rain', 'storm', 'fog', 'snow', 'winds', 'hail', 'sun', 'harsh', 'sand']);
  let driveT = 0;
  function wanted() {
    const c = st.cur;
    if (c.storm > 0.55) return 'storm';
    if (c.snow > 0.5) return 'snow';
    if (c.rain > 0.5) return 'rain';
    if (c.fog > 0.6) return 'fog';
    if (c.wind + st.gust * 0.3 > 0.85) return 'winds';
    return null;
  }
  function drive(dt) {
    const R = AI.R;
    if (AI.cfg.gameWeather !== true) return; // the game's weather events are off: the sky is atmosphere only
    const C = R && R.Coop;
    if (!R || !R.Weather || (C && C.active && !C.isHost) || indoor() || (R.Rift && R.Rift.inArena)) { followVanilla(); return; }
    driveT -= dt;
    if (driveT > 0) return;
    driveT = 1;
    const W = R.Weather;
    const cur = W.current;
    const k = cur ? cur.kind : null;
    const want = wanted();
    if (want && k !== want) { try { W.force(want, 900); if (C && C.isHost) C.broadcast(['wx', want, 900]); } catch (e) { /* ignore */ } }
    else if (!want && k && ATMOS.has(k)) { try { W.clear(); } catch (e) { /* ignore */ } }
  }
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
    drive(dt);
    if (indoor()) { st.tgt.rain = 0; st.tgt.storm = 0; st.tgt.snow = 0; st.tgt.wind = Math.min(st.tgt.wind, 0.1); st.tgt.cloud = 0; }
    if (st.forced) Object.assign(st.tgt, st.forced);
    // believable transitions: fog creeps in, rain builds up, wind picks up faster than it dies
    // gradual: fog creeps in over minutes, rain builds and fades, a storm grows, peaks and weakens
    const RATE = { cloud: 0.012, rain: 0.012, fog: 0.007, wind: 0.03, storm: 0.01, snow: 0.012 };
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
    st.flash = Math.max(0, st.flash - dt * 4.5);
    for (let i = st.pulses.length - 1; i >= 0; i--) {
      const pu = st.pulses[i];
      pu.t -= dt;
      if (pu.t <= 0) { st.flash = Math.max(st.flash, pu.i); st.pulses.splice(i, 1); }
    }
    for (let i = st.strikes.length - 1; i >= 0; i--) { st.strikes[i].t += dt; if (st.strikes[i].t > 0.7) st.strikes.splice(i, 1); }
    // storms (and now and then heavy rain) build tension, then strike
    const rate = Math.max(0, AI.cfg.lightningRate == null ? 1 : AI.cfg.lightningRate);
    const active = rate > 0 && !indoor() && (c.storm > 0.35 || c.rain > 0.65);
    if (active) {
      if (!st.next) {
        const storm = c.storm > 0.35;
        const gap = storm ? U.rand(5, 18) / (0.4 + c.storm) : U.rand(45, 110);
        st.next = { at: AI.time + gap / rate, storm, warned: Math.random() < 0.45 ? false : null };
      }
      const nx = st.next;
      if (nx.warned === false && AI.time > nx.at - U.rand(2.5, 5)) { nx.warned = true; if (AI.Ambience) AI.Ambience.rumble(); st.gustPow = Math.max(st.gustPow, c.wind + 0.25); }
      if (AI.time >= nx.at) {
        st.next = null;
        // distant flickers are common; close, blinding strikes are rarer (and rarer still in plain rain)
        const r = Math.random();
        const dist = nx.storm ? (r < 0.45 ? U.rand(2, 4) : r < 0.8 ? U.rand(0.8, 2) : U.rand(0.15, 0.8)) : (r < 0.7 ? U.rand(2.2, 4) : U.rand(0.9, 2.2));
        bolt(dist);
      }
    } else st.next = null;
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
    const R = AI.R;
    const p = R.Game.player;
    const dist = distKm != null ? distKm : U.rand(0.25, 3.2);
    const peak = U.clamp(1.15 - dist * 0.28, 0.16, 1);
    st.flash = Math.max(st.flash, peak);
    // a double flash, or a nervous flicker for the close ones
    if (Math.random() < 0.35) { st.pulses.push({ t: 0.09, i: peak * 0.45 }, { t: 0.2, i: peak * 0.9 }); }
    if (dist < 0.8) for (let k = 0; k < 2 + ((Math.random() * 3) | 0); k++) st.pulses.push({ t: 0.05 + k * 0.07 + Math.random() * 0.04, i: peak * U.rand(0.35, 0.8) });
    let x, y;
    if (dist < 0.8 && p) {
      // close enough to see it touch down
      const cam = R.Camera;
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * 6.283, rr = U.rand(160, 520);
        x = p.x + Math.cos(a) * rr; y = p.y + Math.sin(a) * rr * 0.7;
        if (cam.sees(x, y, -40)) break;
      }
      st.strikes.push({ x, y, t: 0, seed: (Math.random() * 1e9) | 0, power: peak });
    } else {
      const a = Math.random() * 6.283;
      x = (p ? p.x : 0) + Math.cos(a) * dist * 600; y = (p ? p.y : 0) + Math.sin(a) * dist * 600;
    }
    AI.Bus.emit({ type: 'lightning', x, y, loud: dist < 0.8 ? 500 : 0, dist, near: dist < 0.8 });
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
    st.flash = 0; st.thunders.length = 0; st.pulses.length = 0; st.strikes.length = 0; st.next = null;
    st.forced = null;
    st.frozen = false;
    st.trend = 0; st.prev = null;
    setPattern(st.hour < 8 ? 'mist' : 'fair');
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
    st, PATTERNS, HOLD, NEXT, holdFor, pickPattern, tick, reset, set, bolt,
    hour, phase: () => st.phase, phaseOf, darkness, isNight, midday, midnight, hot,
    sunElev, shadowDir, shadowLen, shadowStrength, moonPhase, moonLight, season, ambient, skyColor,
    windVec, windNow, visibility, weatherKind, indoor,
    get rain() { return st.cur.rain; }, get fog() { return st.cur.fog; }, get wind() { return st.cur.wind; },
    get storm() { return st.cur.storm; }, get cloud() { return st.cur.cloud; }, get snow() { return st.cur.snow; },
    get wet() { return st.wet; }, get flash() { return st.flash; }, get gust() { return st.gust; },
    get snowCover() { return st.snowCover; },
  });
})();
