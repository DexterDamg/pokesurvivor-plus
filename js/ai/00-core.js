/* PokéSurvivor+ — Living World AI · core
 * Shared namespace, configuration, math helpers, seeded RNG and the world event bus.
 * Every other js/ai/* file registers itself on window.PSXAI and is wired up by 99-install.js.
 */
(function () {
  'use strict';
  const AI = (window.PSXAI = window.PSXAI || {});
  AI.version = '1.0.0';
  AI.R = null; // game module registry (window.__PSX_REG__), set on install
  AI.enabled = true;
  AI.time = 0; // seconds of simulated play time (only advances while a run is playing)
  AI.frame = 0;

  // ---------------------------------------------------------------- configuration
  const DEFAULTS = {
    maxNpcs: 48, // global cap of AI-driven wild Pokémon (vanilla hard cap of 64 still applies)
    localCap: 9, // max wild Pokémon around a spawn point (prevents crowding)
    localRadius: 420,
    spawnInterval: 0.32, // seconds between ambient spawns (token bucket refill)
    spawnBurst: 12, // tokens a horde/surge may spend at once
    hostility: 1, // multiplier on aggressive/territorial/opportunistic temperament weights
    hostilityRamp: 600, // seconds of run time for hostility pressure to double
    nearLod: 640, // px from the player: full-rate AI
    farLod: 1250, // px from the player: beyond this, simplified simulation
    think: [0.2, 0.55, 1.4], // decision intervals per LOD (s)
    maxCombatAI: 16, // simultaneous NPCs allowed to run the advanced combat controller
    maxSocial: 6, // simultaneous NPC↔NPC social interactions
    maxBubbles: 10, // emotion bubbles drawn per frame
    bubbleScale: 1,
    evolution: true,
    evoRate: 1, // multiplier on dynamic evolution growth
    autoAim: 'hostile', // 'hostile' (auto-attacks lock onto hostile Pokémon or your focus target) | 'prefer' (hostile first) | 'any' (vanilla)
    friendlyFire: true,
    debug: false,
    // living environment
    atmosphere: true, // day/night, lighting, living weather
    dayLength: 600, // seconds for a full day
    startHour: 6.5, // runs begin in the early morning
    season: 'auto', // 'auto' (from the calendar) | 'spring' | 'summer' | 'autumn' | 'winter'
    weatherFreq: 1, // how often the weather turns
    lightQuality: 'auto', // 'low' | 'medium' | 'high' | 'auto'
    newArt: true, // detailed trees, plants and forest decor
    areaSpawns: true, // each area has its own Pokémon (curated rosters, habitats)
    speech: true, // Pokémon speech bubbles (rumours, warnings)
    lantern: 'auto', // player lantern: 'auto' (on at night) | 'on' | 'off'
    ambientVol: 0.7, // ambient sound volume (relative to the game's sound effects volume)
  };
  const CFG_KEY = 'psx.ai.cfg';
  AI.DEFAULTS = DEFAULTS;
  AI.cfg = Object.assign({}, DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    for (const k in saved) if (k in DEFAULTS && typeof saved[k] === typeof DEFAULTS[k]) AI.cfg[k] = saved[k];
  } catch (e) { /* storage unavailable: defaults */ }
  AI.setCfg = function (k, v) {
    if (!(k in DEFAULTS)) return;
    AI.cfg[k] = v;
    try {
      const out = {};
      for (const key in AI.cfg) if (AI.cfg[key] !== DEFAULTS[key]) out[key] = AI.cfg[key];
      localStorage.setItem(CFG_KEY, JSON.stringify(out));
    } catch (e) { /* ignore */ }
  };
  AI.resetCfg = function () {
    AI.cfg = Object.assign({}, DEFAULTS);
    try { localStorage.removeItem(CFG_KEY); } catch (e) { /* ignore */ }
  };

  // ---------------------------------------------------------------- math helpers
  const U = (AI.U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    chance: (p) => Math.random() < p,
    pick: (arr) => arr[(Math.random() * arr.length) | 0],
    dist2: (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    angDiff: (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; },
    norm(x, y) { const l = Math.hypot(x, y); return l > 1e-6 ? [x / l, y / l] : [0, 0]; },
    // weighted choice over {key: weight}
    wpick(weights, rnd = Math.random) {
      let tot = 0;
      for (const k in weights) tot += Math.max(0, weights[k]);
      if (tot <= 0) return null;
      let r = rnd() * tot;
      for (const k in weights) { r -= Math.max(0, weights[k]); if (r <= 0) return k; }
      return Object.keys(weights)[0];
    },
    hash(a, b = 0, c = 0) {
      let h = Math.imul(a | 0, 0x165667b1) ^ Math.imul(b | 0, 0x27d4eb2f) ^ Math.imul(c | 0, 0x85ebca77);
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
      h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
      return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    },
    // small deterministic PRNG for per-individual personalities
    rng(seed) {
      let s = seed >>> 0 || 1;
      return function () {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
  });

  // ---------------------------------------------------------------- module registry
  // Files define themselves in load order; 99-install.js calls init() on each once the game is ready.
  AI.mods = [];
  AI.define = function (name, mod) {
    AI[name] = mod;
    AI.mods.push({ name, mod });
    return mod;
  };

  // ---------------------------------------------------------------- world event bus
  // Events are short-lived world stimuli (hits, deaths, explosions, cries, legendary pulses…).
  // NPCs only learn about the ones they can perceive (see 30-perception.js), so knowledge spreads
  // through witnesses instead of being global.
  const RING = 160;
  const Bus = {
    ring: new Array(RING),
    head: 0, // total events ever emitted (monotonic id)
    listeners: {},
    emit(ev) {
      ev.id = ++this.head;
      ev.t = AI.time;
      if (ev.loud == null) ev.loud = 200;
      this.ring[ev.id % RING] = ev;
      const ls = this.listeners[ev.type];
      if (ls) for (const fn of ls) { try { fn(ev); } catch (e) { AI.warn('bus', e); } }
      const any = this.listeners['*'];
      if (any) for (const fn of any) { try { fn(ev); } catch (e) { AI.warn('bus', e); } }
      return ev;
    },
    on(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
    // iterate events with id > sinceId that are still in the ring and younger than maxAge seconds
    since(sinceId, maxAge, fn) {
      const from = Math.max(sinceId + 1, this.head - RING + 1);
      for (let id = from; id <= this.head; id++) {
        const ev = this.ring[id % RING];
        if (!ev || ev.id !== id || AI.time - ev.t > maxAge) continue;
        fn(ev);
      }
    },
    clear() { this.ring = new Array(RING); },
  };
  AI.Bus = Bus;

  // ---------------------------------------------------------------- diagnostics
  let warned = 0;
  AI.warn = function (where, e) {
    if (warned++ < 20) console.warn('[PSXAI:' + where + ']', e && e.stack ? e.stack : e);
  };
  AI.stats = { aiMs: 0, thinkMs: [0, 0, 0], thinks: [0, 0, 0], npcs: 0, lod: [0, 0, 0], combat: 0, social: 0, bubbles: 0, spawnVetoed: 0 };
})();
