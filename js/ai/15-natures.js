/* PokéSurvivor+ — Living World AI · Natures shape behaviour
 * Every Pokémon has one of the 25 Natures (the same ones the game uses for stats, whose stat effects
 * are untouched). Here a Nature also leans on how it behaves:
 *   - its personality traits (bravery, curiosity, sociability… the ones every behaviour already reads)
 *   - a few extra leanings: caution, impulsiveness, talkativeness, independence, patience, compassion,
 *     focus and distractibility
 *   - how strongly it feels: fear, anger and joy come easier or harder, and fade faster or slower.
 * A Nature leans; it doesn't override. Species, the individual roll, what has happened to it and how
 * it feels right now still come first, so a Timid Charmander is nervous in the dark, and still steps
 * in when a friend is in danger.
 *   Nature + species + individual personality + experiences + current emotion = behaviour.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  // tr: deltas on the personality traits · x: extra leanings (0.5 = neutral) · emo: how it feels
  const N = {
    hardy: { tr: { bravery: 0.1, energy: 0.05 }, x: {}, emo: {}, en: 'steady and hard to rattle' },
    lonely: { tr: { sociability: -0.25, protectiveness: -0.05 }, x: { independence: 0.8, talk: 0.35 }, emo: {}, en: 'independent; reluctant to ask for help' },
    brave: { tr: { bravery: 0.35, protectiveness: 0.2 }, x: { caution: 0.35 }, emo: { fear: 0.6 }, en: 'faces threats; protective; hard to intimidate' },
    adamant: { tr: { bravery: 0.15, grudge: 0.15, forgiveness: -0.1 }, x: { focus: 0.8, patience: 0.6 }, emo: {}, en: 'determined and persistent; sticks to its decisions' },
    naughty: { tr: { playfulness: 0.25, aggression: 0.1, curiosity: 0.1, forgiveness: -0.05 }, x: { distract: 0.65 }, emo: {}, en: 'mischievous; tests the rules' },
    bold: { tr: { bravery: 0.25, curiosity: 0.25 }, x: { caution: 0.35, independence: 0.6 }, emo: { fear: 0.8 }, en: 'confident; explores unfamiliar ground' },
    docile: { tr: { sociability: 0.15, aggression: -0.15 }, x: { independence: 0.25 }, emo: {}, en: 'agreeable; goes along with the group' },
    relaxed: { tr: { laziness: 0.25, energy: -0.15 }, x: { patience: 0.85 }, emo: { fear: 0.8, anger: 0.7 }, en: 'patient; happy to take things slowly' },
    impish: { tr: { playfulness: 0.2, grudge: 0.1, bravery: 0.1 }, x: { talk: 0.6 }, emo: {}, en: 'cheeky and thick-skinned' },
    lax: { tr: { alertness: -0.2, clumsiness: 0.15, laziness: 0.15 }, x: { caution: 0.3, distract: 0.65 }, emo: {}, en: 'easy-going; a little careless' },
    timid: { tr: { bravery: -0.35, alertness: 0.25, sociability: 0.05 }, x: { caution: 0.85, talk: 0.4 }, emo: { fear: 1.6 }, en: 'hesitant around danger; seeks reassurance' },
    hasty: { tr: { energy: 0.2, alertness: -0.1 }, x: { impulsive: 0.8, patience: 0.2 }, emo: {}, en: 'quick to act; overlooks details' },
    serious: { tr: { playfulness: -0.25, curiosity: -0.1 }, x: { focus: 0.85, distract: 0.2, talk: 0.4 }, emo: {}, en: 'focused and practical' },
    jolly: { tr: { playfulness: 0.3, sociability: 0.25, energy: 0.2 }, x: { talk: 0.8 }, emo: { joy: 1.3 }, en: 'energetic, playful, sociable' },
    naive: { tr: { curiosity: 0.2, alertness: -0.1, forgiveness: 0.2, playfulness: 0.15 }, x: { caution: 0.3 }, emo: {}, en: 'carefree and trusting' },
    modest: { tr: { aggression: -0.1 }, x: { talk: 0.35 }, emo: {}, en: 'humble; avoids attention' },
    mild: { tr: { aggression: -0.15, sociability: 0.05 }, x: { talk: 0.4, compassion: 0.65 }, emo: {}, en: 'soft-spoken and kind' },
    quiet: { tr: { alertness: 0.2, curiosity: 0.05 }, x: { talk: 0.15 }, emo: {}, en: 'reserved and observant' },
    bashful: { tr: { sociability: -0.15 }, x: { talk: 0.25 }, emo: { fear: 1.15 }, en: 'shy' },
    rash: { tr: { aggression: 0.15 }, x: { impulsive: 0.9, caution: 0.25, patience: 0.25 }, emo: { anger: 1.5 }, en: 'impulsive and emotionally reactive' },
    calm: { tr: {}, x: { patience: 0.8, caution: 0.6, focus: 0.6 }, emo: { fear: 0.7, anger: 0.6 }, en: 'composed under pressure; thoughtful' },
    gentle: { tr: { aggression: -0.25, forgiveness: 0.25, protectiveness: 0.15 }, x: { compassion: 0.85 }, emo: {}, en: 'considerate; avoids needless harm' },
    sassy: { tr: { grudge: 0.15, forgiveness: -0.15, sociability: -0.05 }, x: { talk: 0.6 }, emo: { anger: 1.2 }, en: 'defiant and cheeky' },
    careful: { tr: { alertness: 0.25, intelligence: 0.1 }, x: { caution: 0.85, impulsive: 0.25 }, emo: {}, en: 'analytical; watches for risks' },
    quirky: { tr: { curiosity: 0.2, playfulness: 0.1 }, x: { distract: 0.8 }, emo: {}, en: 'unpredictable' },
  };
  const IDS = Object.keys(N);
  const X_KEYS = ['caution', 'impulsive', 'talk', 'independence', 'patience', 'compassion', 'focus', 'distract'];

  function pick(rnd) { return IDS[Math.floor((rnd ? rnd() : Math.random()) * IDS.length) % IDS.length]; }
  // a full set of leanings for this Nature (neutral where it says nothing)
  function leanings(id) {
    const n = N[id] || N.hardy;
    const x = {};
    for (const k of X_KEYS) x[k] = n.x[k] != null ? n.x[k] : 0.5;
    return x;
  }
  // put a Nature on a rolled personality (10-species.js roll)
  function apply(pers, id, rnd) {
    const n = N[id] || N.hardy;
    pers.nature = id;
    for (const k in n.tr) if (pers.tr[k] != null) pers.tr[k] = U.clamp(pers.tr[k] + n.tr[k], 0, 1);
    pers.nx = leanings(id);
    for (const k of X_KEYS) pers.nx[k] = U.clamp(pers.nx[k] + ((rnd ? rnd() : Math.random()) - 0.5) * 0.12, 0, 1);
    pers.nemo = { fear: n.emo.fear || 1, anger: n.emo.anger || 1, joy: n.emo.joy || 1 };
    return pers;
  }
  // how much easier (or harder) an emotion comes to this Pokémon
  function feelK(s, key) {
    const e = s && s.pers && s.pers.nemo;
    if (!e) return 1;
    if (key === 'fear') return e.fear;
    if (key === 'anger') return e.anger;
    if (key === 'joy' || key === 'excitement') return e.joy;
    return 1;
  }
  // …and how much faster it fades (calm natures settle quickly, rash ones stay angry)
  function decayK(s, key) { const k = feelK(s, key); return k === 1 ? 1 : U.clamp(1 / k, 0.6, 1.5); }
  function nameOf(id) {
    try { const R = AI.R; if (R && R.Natures && R.Natures.nameOf) { const v = R.Natures.nameOf({ id, name: id }); if (v) return v; } } catch (e) { /* ignore */ }
    return id ? id[0].toUpperCase() + id.slice(1) : '';
  }
  function describe(id) { return (N[id] || {}).en || ''; }

  AI.define('Natures', { N, IDS, X_KEYS, pick, leanings, apply, feelK, decayK, nameOf, describe });
})();
