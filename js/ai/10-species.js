/* PokéSurvivor+ — Living World AI · species knowledge
 * Species-aware temperaments, lore overrides, habitats, predator/prey & rivalries,
 * and the per-individual personality roll (temperament + traits + quirks).
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  const TEMPS = ['friendly', 'neutral', 'timid', 'territorial', 'aggressive', 'playful', 'protective', 'opportunistic'];
  const BASE_W = { friendly: 1.5, neutral: 3, timid: 1.6, territorial: 1.2, aggressive: 1.25, playful: 1.1, protective: 0.8, opportunistic: 0.85 };

  const TYPE_T = {
    normal: { friendly: 1.3, playful: 1.2, neutral: 1.1 },
    fire: { aggressive: 1.4, territorial: 1.3, playful: 1.1 },
    water: { neutral: 1.3, playful: 1.3, friendly: 1.1 },
    grass: { neutral: 1.3, timid: 1.3, friendly: 1.2 },
    electric: { playful: 1.5, territorial: 1.1 },
    ice: { neutral: 1.3, territorial: 1.2, timid: 1.1 },
    fighting: { aggressive: 1.4, territorial: 1.4, protective: 1.2 },
    poison: { territorial: 1.3, opportunistic: 1.4 },
    ground: { territorial: 1.4, neutral: 1.1 },
    flying: { timid: 1.3, territorial: 1.2, opportunistic: 1.1 },
    psychic: { neutral: 1.4, timid: 1.2, protective: 1.1 },
    bug: { timid: 1.5, neutral: 1.2 },
    rock: { territorial: 1.4, neutral: 1.3 },
    ghost: { playful: 1.4, opportunistic: 1.4 },
    dragon: { aggressive: 1.4, territorial: 1.4, protective: 1.1 },
    dark: { opportunistic: 1.7, aggressive: 1.3 },
    steel: { territorial: 1.3, neutral: 1.3, protective: 1.1 },
    fairy: { friendly: 1.6, playful: 1.4, protective: 1.2 },
  };

  // vanilla archetype (Enemies behavior) → temperament bias
  const ARCH_T = {
    chase: { aggressive: 1.25 }, runner: { aggressive: 1.35, opportunistic: 1.2 }, charger: { aggressive: 1.4, territorial: 1.3 },
    ranged: { territorial: 1.3, opportunistic: 1.2 }, fan: { territorial: 1.2 }, beamer: { territorial: 1.3 }, zoner: { territorial: 1.4 },
    tank: { territorial: 1.3, neutral: 1.3 }, jumper: { playful: 1.2, aggressive: 1.2 },
    healer: { friendly: 2, protective: 1.8, aggressive: 0.3 }, shielder: { protective: 2.2 }, summoner: { protective: 1.6, territorial: 1.3 },
    bomber: { aggressive: 1.2, opportunistic: 1.1, timid: 1.2 },
  };

  // Lore: t = temperament multipliers, q = quirks, tr = trait overrides
  const LORE = {
    1: { t: { friendly: 2 }, q: ['sun-lover'] }, 4: { t: { friendly: 2, timid: 1.5, playful: 1.2 }, q: ['hates-water', 'warmth-seeker'] },
    5: { t: { aggressive: 1.8, territorial: 1.5 }, q: ['hates-water', 'warmth-seeker', 'hothead'] }, 6: { t: { territorial: 2, protective: 1.3 }, q: ['hates-water', 'proud'] },
    7: { t: { playful: 3 }, q: ['swimmer', 'splasher'] }, 8: { t: { playful: 2, territorial: 1.2 }, q: ['swimmer', 'splasher'] }, 9: { t: { territorial: 1.6, protective: 1.4 }, q: ['swimmer'] },
    10: { t: { timid: 3 } }, 11: { t: { timid: 3, neutral: 2 }, q: ['lazy'] }, 12: { t: { timid: 2, friendly: 2 } }, 13: { t: { timid: 3 } }, 14: { t: { timid: 2, neutral: 2 }, q: ['lazy'] },
    15: { t: { aggressive: 2.5, territorial: 2 }, tr: { aggression: 0.85 } },
    16: { t: { timid: 2.4 } }, 19: { t: { opportunistic: 2.2, timid: 2 } }, 20: { t: { opportunistic: 2.4 } },
    21: { t: { aggressive: 2.2, territorial: 2 } }, 22: { t: { aggressive: 2.4, territorial: 2 } },
    23: { t: { opportunistic: 2, aggressive: 1.4 } }, 24: { t: { aggressive: 2, territorial: 1.6 } },
    25: { t: { playful: 3, friendly: 2, territorial: 1 }, q: ['chaser', 'climber'] }, 26: { t: { playful: 2, territorial: 1.6 }, q: ['chaser'] },
    35: { t: { friendly: 2.4, playful: 2 }, q: ['dancer'] }, 36: { t: { friendly: 2, protective: 1.5 }, q: ['dancer'] },
    39: { t: { playful: 2.5, friendly: 1.5 }, q: ['singer'] }, 40: { t: { playful: 2, friendly: 1.8 }, q: ['singer'] },
    41: { t: { opportunistic: 2.4 }, q: ['blind'] }, 42: { t: { opportunistic: 2.4, aggressive: 1.4 }, q: ['blind'] },
    52: { t: { opportunistic: 4, playful: 1 }, q: ['shiny-collector', 'mischievous'] }, 53: { t: { opportunistic: 3, aggressive: 1.6 }, q: ['shiny-collector', 'proud'] },
    54: { t: { neutral: 3, timid: 1.5 }, q: ['headache', 'clumsy'], tr: { intelligence: 0.22 } }, 55: { t: { territorial: 1.6 }, q: ['swimmer'] },
    56: { t: { aggressive: 3, territorial: 1.5 }, q: ['hothead'], tr: { forgiveness: 0.05, grudge: 0.95 } }, 57: { t: { aggressive: 4 }, q: ['hothead'], tr: { forgiveness: 0.03, grudge: 0.98 } },
    58: { t: { protective: 2.6, friendly: 1.6 } }, 59: { t: { protective: 2.6, territorial: 1.5 }, q: ['proud'] },
    63: { t: { timid: 3, neutral: 2 }, q: ['teleporter', 'sleepy'] }, 64: { t: { neutral: 2.4 } }, 65: { t: { neutral: 2.6 }, tr: { intelligence: 0.97 } },
    66: { t: { playful: 2, territorial: 2, friendly: 1 }, q: ['show-off', 'lifter'] }, 67: { t: { territorial: 2.2, aggressive: 1.4 }, q: ['show-off', 'lifter'] }, 68: { t: { aggressive: 2, territorial: 2 }, q: ['lifter', 'proud'] },
    74: { t: { territorial: 2, neutral: 2 } }, 79: { t: { neutral: 4 }, q: ['dazed', 'lazy', 'water-sitter'], tr: { intelligence: 0.06, laziness: 0.92, alertness: 0.1 } },
    80: { t: { neutral: 4 }, q: ['dazed', 'lazy', 'water-sitter'], tr: { intelligence: 0.12, laziness: 0.85 } },
    92: { t: { playful: 2.4, opportunistic: 2 }, q: ['prankster'] }, 93: { t: { playful: 2.4, opportunistic: 2.4 }, q: ['prankster'] }, 94: { t: { playful: 2.6, opportunistic: 2.4 }, q: ['prankster'] },
    95: { t: { territorial: 2.6 } }, 104: { t: { timid: 2.4, neutral: 1.5 }, q: ['lonely'] }, 105: { t: { protective: 2.2, territorial: 1.6 } },
    106: { t: { territorial: 2.4 }, q: ['show-off'] }, 107: { t: { territorial: 2.4 }, q: ['show-off'] },
    113: { t: { friendly: 3, protective: 2.4 } }, 242: { t: { friendly: 3.4, protective: 2.4 } }, 440: { t: { friendly: 3, playful: 1.4 } },
    118: { q: ['fish'] }, 119: { q: ['fish'], t: { territorial: 1.6 } },
    123: { t: { aggressive: 2.6, territorial: 1.6 } }, 127: { t: { aggressive: 2.4, territorial: 1.8 } }, 128: { t: { aggressive: 3, territorial: 2 }, tr: { aggression: 0.9 } },
    129: { t: { timid: 3, neutral: 3, playful: 1.5, friendly: 1, aggressive: 0.08, territorial: 0.1, opportunistic: 0.05, protective: 0.2 }, q: ['fish', 'flopper'], tr: { bravery: 0.08, intelligence: 0.06, aggression: 0.04 } },
    130: { t: { aggressive: 5, territorial: 3, opportunistic: 1, protective: 0.6, friendly: 0.25, neutral: 0.8, timid: 0.05, playful: 0.2 }, q: ['swimmer', 'hothead'], tr: { aggression: 0.9, bravery: 0.92, grudge: 0.9 } },
    131: { t: { friendly: 3, protective: 1.6 }, q: ['swimmer', 'singer'] }, 132: { t: { neutral: 3 }, q: ['mimic'] },
    133: { t: { friendly: 2.4, playful: 1.6 }, q: ['curious'] }, 134: { q: ['swimmer'] }, 135: { q: ['chaser'] }, 136: { q: ['warmth-seeker', 'hates-water'] },
    143: { t: { neutral: 5, friendly: 1, territorial: 0.6, aggressive: 0.3 }, q: ['lazy', 'glutton', 'sleepy'], tr: { laziness: 0.97, energy: 0.15, alertness: 0.1 } },
    147: { t: { timid: 2, neutral: 2 }, q: ['swimmer'] }, 148: { t: { neutral: 2.4 }, q: ['swimmer'] }, 149: { t: { friendly: 2.4, protective: 2 } },
    172: { t: { playful: 2.6, timid: 1.4 }, q: ['clumsy', 'chaser'] }, 175: { t: { friendly: 3, playful: 2 }, q: ['clumsy'] }, 176: { t: { friendly: 3 } },
    183: { t: { playful: 2.6 }, q: ['swimmer', 'splasher'] }, 184: { t: { playful: 2, protective: 1.4 }, q: ['swimmer'] },
    185: { t: { neutral: 3, timid: 1.4 }, q: ['tree-mimic', 'hates-water'] }, 190: { t: { playful: 2.6, opportunistic: 1.6 }, q: ['climber', 'mischievous'] },
    194: { t: { neutral: 3 }, q: ['dazed', 'swimmer'] }, 195: { t: { neutral: 3 }, q: ['dazed', 'swimmer'] },
    198: { t: { opportunistic: 3 }, q: ['shiny-collector', 'mischievous'] }, 209: { t: { timid: 3 } }, 214: { t: { territorial: 2, protective: 1.4 } },
    216: { t: { friendly: 2.2 }, q: ['glutton'] }, 217: { t: { territorial: 2.6, aggressive: 2 }, q: ['glutton'] },
    228: { t: { aggressive: 2.6, opportunistic: 1.6 }, q: ['pack-hunter'] }, 229: { t: { aggressive: 3 }, q: ['pack-hunter'] },
    246: { t: { aggressive: 1.8, territorial: 1.6 }, q: ['glutton'] }, 248: { t: { aggressive: 3, territorial: 2.4 } },
    261: { t: { aggressive: 2, opportunistic: 2 }, q: ['pack-hunter'] }, 262: { t: { aggressive: 2.6, opportunistic: 2 }, q: ['pack-hunter'] },
    263: { t: { playful: 2, friendly: 1.4 }, q: ['shiny-collector', 'curious'] }, 280: { t: { timid: 2.4, protective: 1.6 } }, 281: { t: { protective: 2 } }, 282: { t: { protective: 3 } },
    287: { t: { neutral: 3 }, q: ['lazy', 'sleepy'], tr: { laziness: 0.95 } }, 289: { t: { neutral: 3 }, q: ['lazy'], tr: { laziness: 0.96 } },
    300: { t: { playful: 3 }, q: ['chaser'] }, 302: { t: { opportunistic: 3 }, q: ['shiny-collector', 'mischievous'] }, 303: { t: { opportunistic: 2.4 } },
    311: { t: { friendly: 2.6, playful: 2 }, q: ['cheer'] }, 312: { t: { friendly: 2.6, playful: 2 }, q: ['cheer'] },
    318: { t: { aggressive: 3 }, q: ['fish', 'pack-hunter'] }, 319: { t: { aggressive: 3.6 }, q: ['fish'] }, 320: { t: { friendly: 2.4, playful: 1.6 }, q: ['swimmer', 'splasher'] },
    325: { t: { playful: 2 }, q: ['bouncer'] }, 327: { t: { neutral: 2.4, playful: 1.4 }, q: ['dizzy'] }, 333: { t: { friendly: 2.4 }, q: ['singer'] }, 334: { t: { friendly: 2.4 }, q: ['singer'] },
    335: { t: { aggressive: 2.2, territorial: 1.6 } }, 336: { t: { aggressive: 2, opportunistic: 1.6 } },
    349: { t: { timid: 3 }, q: ['fish'] }, 350: { t: { friendly: 3, protective: 1.6 }, q: ['swimmer'] }, 359: { t: { neutral: 3 }, q: ['omen'] },
    371: { t: { playful: 1.6, territorial: 1.6 }, q: ['wannabe-flyer'] },
    393: { t: { neutral: 2, playful: 2, territorial: 1 }, q: ['proud', 'clumsy', 'swimmer'] }, 394: { q: ['proud', 'swimmer'] }, 395: { t: { territorial: 2 }, q: ['proud', 'swimmer'] },
    396: { t: { timid: 1.6 } }, 398: { t: { aggressive: 2.6, territorial: 1.6 } }, 399: { t: { friendly: 2.4, neutral: 2 }, q: ['dazed'] },
    403: { t: { territorial: 2 } }, 405: { t: { territorial: 2.4 } }, 415: { t: { protective: 2 } }, 416: { t: { protective: 3, territorial: 2 } }, 417: { t: { playful: 3 }, q: ['shiny-collector'] },
    425: { t: { playful: 2 }, q: ['follower'] }, 427: { t: { timid: 2, friendly: 2 } }, 431: { t: { opportunistic: 2.4 } }, 439: { q: ['mimic'] },
    443: { t: { aggressive: 2.4, territorial: 1.6 }, q: ['glutton'] }, 444: { t: { aggressive: 2.4, territorial: 2 } }, 445: { t: { aggressive: 3, territorial: 2 }, tr: { aggression: 0.88 } },
    446: { t: { friendly: 2.2, playful: 1.6 }, q: ['glutton'] }, 447: { t: { protective: 2.6, friendly: 1.4 } }, 448: { t: { protective: 3, territorial: 1.6 }, tr: { intelligence: 0.8 } },
    453: { t: { opportunistic: 2.4 } }, 454: { t: { opportunistic: 2.6 } }, 456: { q: ['fish'] }, 457: { q: ['fish'] },
    479: { t: { playful: 2.6, opportunistic: 1.6 }, q: ['prankster', 'mischievous'] }, 531: { t: { friendly: 3, protective: 2 } },
    546: { t: { playful: 2.4 }, q: ['prankster'] }, 570: { t: { playful: 2, opportunistic: 2 }, q: ['prankster'] }, 571: { t: { opportunistic: 2.6 }, q: ['prankster'] },
    610: { t: { territorial: 1.6, playful: 1.4 } }, 631: { t: { aggressive: 2.4 } }, 632: { t: { territorial: 2.6, protective: 2 } },
    658: { t: { territorial: 2, aggressive: 1.6 }, q: ['swimmer'], tr: { intelligence: 0.75, agility: 0.95 } },
    700: { t: { friendly: 3.4, protective: 1.6 } }, 722: { q: ['sleepy'] }, 728: { t: { playful: 2.6 }, q: ['swimmer', 'splasher'] },
    778: { t: { friendly: 1.6, timid: 1.6 }, q: ['lonely'] }, 819: { t: { timid: 2, friendly: 1.4 }, q: ['glutton'] }, 831: { t: { timid: 3 } },
  };

  // fish species that cannot leave water comfortably (flop on land)
  const FISH = new Set([72, 73, 116, 117, 118, 119, 129, 170, 171, 211, 222, 223, 224, 226, 230, 318, 319, 320, 321, 339, 340, 349, 350, 366, 367, 368, 369, 370, 456, 457, 550, 592, 593, 594, 746, 779, 846, 847]);
  // familiar habitats per species family (bad swimmers that panic in water)
  const SINKERS = new Set(['fire', 'rock', 'ground', 'steel']);

  // mutual hatred / rivalry and predator → prey
  const RIVALS = [[335, 336], [127, 214], [106, 107], [337, 338], [538, 539], [382, 383], [778, 25], [56, 57]];
  const FRIENDS = [[311, 312], [313, 314], [380, 381], [25, 172], [25, 26], [175, 176], [113, 242], [440, 113], [35, 39], [36, 40]];
  const PREY = {
    631: [632], 261: [19, 263, 399, 427, 16], 262: [19, 20, 263, 264, 399, 400, 427, 16], 228: [19, 263, 399, 427], 229: [19, 20, 263, 399, 427],
    23: [19, 16, 41, 129], 24: [19, 20, 16, 41, 129, 263], 318: [129, 118, 349, 456, 170], 319: [129, 118, 119, 349, 456, 170, 222],
    52: [19, 16], 53: [19, 20, 16, 17], 130: [129],
  };
  const rivalSet = new Map();
  const friendSet = new Map();
  for (const [a, b] of RIVALS) { (rivalSet.get(a) || rivalSet.set(a, new Set()).get(a)).add(b); (rivalSet.get(b) || rivalSet.set(b, new Set()).get(b)).add(a); }
  for (const [a, b] of FRIENDS) { (friendSet.get(a) || friendSet.set(a, new Set()).get(a)).add(b); (friendSet.get(b) || friendSet.set(b, new Set()).get(b)).add(a); }

  // biome index → spawn weight per type (habitat-driven ecosystems)
  const BIOME_W = {
    0: { grass: 1.6, bug: 1.6, normal: 1.2, flying: 1.3, poison: 1.2, fairy: 1.2, fire: 0.8 },
    1: { rock: 1.7, ground: 1.4, ghost: 1.3, dark: 1.3, steel: 1.3, psychic: 1.2, fairy: 1.2, ice: 1.2, grass: 0.6, fire: 0.8 },
    2: { fire: 2.2, ground: 1.6, rock: 1.4, dragon: 1.2, water: 0.45, ice: 0.35, grass: 0.5, bug: 0.7 },
    3: { normal: 1.5, grass: 1.5, fairy: 1.4, flying: 1.3, bug: 1.2 },
    4: { fire: 2.4, ground: 1.5, rock: 1.4, dragon: 1.3, water: 0.4, ice: 0.3 },
    5: { water: 2.4, ice: 1.3, rock: 1.1, fire: 0.5 },
    6: { grass: 2, bug: 1.7, poison: 1.4, water: 1.2 },
    7: { electric: 2.6, steel: 1.7 },
    8: { ice: 2.6, water: 1.4, fire: 0.4, grass: 0.5 },
    9: { fighting: 2.6, normal: 1.2 },
    10: { poison: 2.4, bug: 1.3, dark: 1.2, grass: 1.1 },
    11: { ground: 2.2, rock: 1.7, fire: 1.3, water: 0.5, grass: 0.6 },
    12: { flying: 2.4, dragon: 1.5, ice: 1.2 },
    13: { psychic: 2.5, fairy: 1.3, ghost: 1.2 },
    14: { bug: 2.6, grass: 1.4 },
    15: { rock: 2.4, ground: 1.6, steel: 1.3, fighting: 1.2 },
    16: { ghost: 2.6, dark: 1.5, poison: 1.2 },
    17: { dragon: 2.6, fire: 1.2 },
    18: { dark: 2.5, poison: 1.3, normal: 1.2 },
    19: { steel: 2.5, electric: 1.3, rock: 1.2 },
    20: { fairy: 2.5, grass: 1.4, psychic: 1.2 },
    22: { ghost: 2, dragon: 1.4, psychic: 1.3, dark: 1.3 },
    23: { dragon: 1.6, steel: 1.4, water: 1.2, psychic: 1.2 },
    24: { psychic: 1.4, poison: 1.4, electric: 1.2, steel: 1.2 },
  };

  const TEMP_TRAITS = {
    friendly: { sociability: 0.85, aggression: 0.12, bravery: 0.5, curiosity: 0.7, playfulness: 0.6, protectiveness: 0.55, forgiveness: 0.8, grudge: 0.2 },
    neutral: { sociability: 0.45, aggression: 0.3, bravery: 0.5, curiosity: 0.4, playfulness: 0.35, forgiveness: 0.55, grudge: 0.4 },
    timid: { sociability: 0.4, aggression: 0.07, bravery: 0.12, curiosity: 0.35, alertness: 0.88, forgiveness: 0.6, grudge: 0.35 },
    territorial: { territoriality: 0.92, aggression: 0.55, bravery: 0.7, sociability: 0.35, grudge: 0.6 },
    aggressive: { aggression: 0.9, bravery: 0.8, sociability: 0.3, forgiveness: 0.2, grudge: 0.7 },
    playful: { playfulness: 0.92, sociability: 0.8, curiosity: 0.75, aggression: 0.2, energy: 0.88 },
    protective: { protectiveness: 0.95, bravery: 0.75, sociability: 0.7, aggression: 0.4 },
    opportunistic: { greed: 0.85, aggression: 0.5, bravery: 0.4, sociability: 0.35 },
  };
  const TRAIT_KEYS = ['bravery', 'aggression', 'sociability', 'curiosity', 'playfulness', 'intelligence', 'clumsiness', 'laziness', 'grudge', 'forgiveness', 'territoriality', 'protectiveness', 'greed', 'energy', 'alertness', 'agility'];

  const cache = new Map();

  function profile(dex) {
    let p = cache.get(dex);
    if (p) return p;
    const R = AI.R;
    const d = (R.DEX_BY && R.DEX_BY[dex]) || { dex, name: '?', types: ['normal'], bst: 300, rarity: 1 };
    const bs = (R.BASE_STATS && R.BASE_STATS[dex]) || [d.hp || 60, 60, 60, 60, 60, 60];
    const types = d.types && d.types.length ? d.types : ['normal'];
    const lore = LORE[dex] || {};
    const r = R.Sprites.bodyRadius(dex, 1);
    const has = (t) => types.includes(t);
    const flying = R.Sprites.hovers(dex);
    const quirks = new Set(lore.q || []);
    if (FISH.has(dex)) quirks.add('fish');
    const swim = has('water') ? 1 : has('ice') ? 0.6 : flying ? 0.5 : types.some((t) => SINKERS.has(t)) ? 0.1 : 0.4;
    p = {
      dex, name: d.name, types, bst: d.bst || 300, leg: !!d.leg || d.rarity >= 5, rarity: d.rarity || 1, lore,
      atk: bs[1], def: bs[2], spa: bs[3], spe: bs[5],
      size: r <= 14 ? 0 : r <= 24 ? 1 : 2, radius: r,
      flying, quirks,
      swim, // 0 = sinks like a stone, 1 = natural swimmer
      fish: quirks.has('fish'),
      hatesWater: quirks.has('hates-water') || (has('fire') && !has('water')) || dex === 383,
      lovesWater: has('water') || quirks.has('swimmer'),
      sunLover: quirks.has('sun-lover') || has('grass') || has('fire'),
      coldLover: has('ice'),
      nocturnal: has('ghost') || has('dark'),
      climber: !flying && (quirks.has('climber') || (r <= 16 && types.some((t) => t === 'bug' || t === 'grass' || t === 'normal' || t === 'electric'))),
      diet: types.some((t) => t === 'dark' || t === 'dragon') ? 'carnivore' : types.some((t) => t === 'grass' || t === 'bug' || t === 'fairy') ? 'herbivore' : 'omnivore',
      intelligence: U.clamp(0.3 + (d.bst || 300) / 1500 + (has('psychic') ? 0.25 : 0) + (has('dark') || has('ghost') || has('dragon') ? 0.1 : 0) - (has('bug') ? 0.08 : 0), 0.05, 0.98),
      agility: U.clamp(((bs[5] || 60) - 25) / 115, 0.05, 1),
      sight: quirks.has('blind') ? 0.35 : has('psychic') ? 1.2 : 1,
      hearing: quirks.has('blind') ? 1.6 : 1,
    };
    cache.set(dex, p);
    return p;
  }

  function temperamentWeights(p, behavior, gameTime) {
    const w = Object.assign({}, BASE_W);
    for (const t of p.types) { const m = TYPE_T[t]; if (m) for (const k in m) w[k] *= m[k]; }
    const a = ARCH_T[behavior];
    if (a) for (const k in a) w[k] *= a[k];
    // power shapes attitude: weak species are cautious, strong ones assertive
    const pk = U.clamp((p.bst - 300) / 300, -1, 1);
    w.timid *= 1 - 0.45 * pk; w.friendly *= 1 - 0.2 * pk;
    w.aggressive *= 1 + 0.5 * pk; w.territorial *= 1 + 0.4 * pk;
    if (p.lore.t) for (const k in p.lore.t) w[k] = BASE_W[k] * p.lore.t[k] * (k in (a || {}) ? a[k] : 1);
    // world grows wilder as the run goes on (keeps the survival pressure of the original game)
    const ramp = AI.cfg.hostility * (1 + Math.max(0, gameTime) / Math.max(60, AI.cfg.hostilityRamp));
    w.aggressive *= ramp; w.territorial *= 0.5 + 0.5 * ramp; w.opportunistic *= 0.6 + 0.4 * ramp;
    return w;
  }

  // Roll an individual personality. seed makes it reproducible for remembered individuals.
  function roll(e, seed, forceTemp) {
    const p = profile(e.dex);
    const rnd = U.rng(seed);
    const R = AI.R;
    const gt = (R.Game && R.Game.st && R.Game.st.time) || AI.time;
    const temp = forceTemp || U.wpick(temperamentWeights(p, e.behavior, gt), rnd) || 'neutral';
    const base = TEMP_TRAITS[temp] || {};
    const tr = {};
    for (const k of TRAIT_KEYS) {
      let v = base[k] != null ? base[k] : 0.5;
      if (k === 'intelligence') v = p.intelligence;
      if (k === 'agility') v = p.agility;
      if (k === 'clumsiness') v = 0.15 + rnd() * 0.3;
      if (k === 'laziness') v = 0.2 + rnd() * 0.3;
      if (k === 'energy') v = base.energy != null ? base.energy : 0.45 + rnd() * 0.3;
      if (k === 'alertness') v = base.alertness != null ? base.alertness : 0.4 + rnd() * 0.3;
      v += (rnd() - 0.5) * 0.3; // individuality
      tr[k] = v;
    }
    if (p.lore.tr) for (const k in p.lore.tr) tr[k] = p.lore.tr[k] + (rnd() - 0.5) * 0.08;
    const quirks = new Set(p.quirks);
    // individual quirks on top of species ones
    const extra = { clumsy: 0.1, lazy: 0.08, curious: 0.12, mischievous: 0.07, stubborn: 0.08, skittish: 0.1, glutton: 0.06, 'show-off': 0.05 };
    for (const q in extra) if (rnd() < extra[q]) quirks.add(q);
    if (quirks.has('clumsy')) tr.clumsiness += 0.4;
    if (quirks.has('lazy')) tr.laziness += 0.35;
    if (quirks.has('curious')) tr.curiosity += 0.3;
    if (quirks.has('skittish')) { tr.alertness += 0.3; tr.bravery -= 0.15; }
    if (quirks.has('stubborn')) { tr.forgiveness -= 0.25; tr.grudge += 0.2; }
    if (quirks.has('hothead')) tr.aggression += 0.15;
    for (const k of TRAIT_KEYS) tr[k] = U.clamp(tr[k], 0, 1);
    const pers = { temp, tr, quirks, seed };
    // its Nature leans on all of the above (15-natures.js)
    if (AI.Natures) AI.Natures.apply(pers, e.psxNature || AI.Natures.pick(rnd), rnd);
    return pers;
  }

  function relationOf(pa, pb, persA) {
    // innate stance of species A toward species B (before any experience)
    if (rivalSet.has(pa.dex) && rivalSet.get(pa.dex).has(pb.dex)) return 'rival';
    if (friendSet.has(pa.dex) && friendSet.get(pa.dex).has(pb.dex)) return 'friend';
    if (PREY[pa.dex] && PREY[pa.dex].includes(pb.dex)) return 'prey';
    if (PREY[pb.dex] && PREY[pb.dex].includes(pa.dex)) return 'predator';
    // generic food chain: birds hunt bugs, strong carnivores hunt much weaker small critters
    if (persA && persA.tr.aggression > 0.55) {
      const birdBug = pa.types.includes('flying') && !pa.types.includes('bug') && pb.types.includes('bug') && pb.size <= pa.size && pb.bst < pa.bst - 40;
      const carn = pa.diet === 'carnivore' && pb.size < pa.size && pb.bst < pa.bst - 150;
      if (birdBug || carn) return 'prey';
    }
    if (pa.dex === pb.dex) return 'kin';
    return null;
  }

  function sameFamily(a, b) {
    if (a === b) return true;
    const E = AI.R.EVOS || {};
    const evo = (x) => (E[x] || []).map((v) => v[0]);
    return evo(a).includes(b) || evo(b).includes(a) || evo(a).some((m) => evo(m).includes(b)) || evo(b).some((m) => evo(m).includes(a));
  }

  AI.define('Species', {
    TEMPS, TRAIT_KEYS, LORE, BIOME_W, FISH,
    profile, roll, relationOf, sameFamily, temperamentWeights,
    biomeWeight(types, biome) {
      const w = BIOME_W[biome];
      if (!w) return 1;
      let up = 1, down = 1;
      for (const t of types) {
        const v = w[t];
        if (!v) continue;
        if (v > 1) up = Math.max(up, v); else down *= v;
      }
      return up * down;
    },
    // rough battle power used for intimidation & threat assessment
    power(e) {
      const p = profile(e.dex);
      let pw = p.bst;
      if (e.boss || e.legend) pw *= 1.8;
      if (e.shiny) pw *= 1.15;
      return pw;
    },
  });
})();
