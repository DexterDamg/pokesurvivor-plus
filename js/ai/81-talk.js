/* PokéSurvivor+ — Living World AI · who's talking: Mystery Dungeon dialogue boxes
 * Every Pokémon that matters speaks in a proper box with its PMD portrait (SpriteCollab), its name
 * and its words, typed out with a voice:
 *  - left:  the important Pokémon of the party — you and the other players. At most two boxes at a
 *           time; a third speaker takes the place of the oldest.
 *  - right: important NPCs — Gengar, Dusknoir, the mansion's residents. At most two as well.
 *  - the legendary box: one large box, only ever used when a Legendary or Mythical Pokémon appears
 *           or speaks during its battle. Nobody else can use it. Until you know what it is, its name
 *           reads "???" and its portrait is a silhouette.
 * Portraits come from assets/portraits/<dex>/<Emotion>.png (see index.json); others are fetched from
 * SpriteCollab on demand, and if that fails the box falls back to the Pokémon's own sprite.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;

  // ---------------------------------------------------------------- portraits
  const EMOS = ['Normal', 'Happy', 'Surprised', 'Worried', 'Angry', 'Sad', 'Determined', 'Joyous', 'Pain', 'Shouting', 'Sigh', 'Teary-Eyed', 'Inspired', 'Stunned'];
  let manifest = null;
  const imgs = new Map(); // "dex/Emotion" → {img, ok, failed}
  try {
    fetch('assets/portraits/index.json').then((r) => (r.ok ? r.json() : {})).then((m) => { manifest = m || {}; }).catch(() => { manifest = {}; });
  } catch (e) { manifest = {}; }
  function src(dex, emo) {
    if (manifest && manifest[dex]) return 'assets/portraits/' + dex + '/' + emo + '.png';
    return 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait/' + String(dex).padStart(4, '0') + '/' + emo + '.png';
  }
  function load(dex, emo) {
    const k = dex + '/' + emo;
    let o = imgs.get(k);
    if (o) return o;
    o = { img: new Image(), ok: false, failed: false };
    imgs.set(k, o);
    o.img.crossOrigin = 'anonymous'; // (so the canvas stays readable)
    o.img.onload = () => { o.ok = true; };
    o.img.onerror = () => { o.failed = true; };
    o.img.src = src(dex, emo);
    return o;
  }
  // the best portrait we can show right now (the emotion asked for, else Normal), or null
  function portrait(dex, emo) {
    if (!dex || manifest == null) return null;
    const list = manifest[dex];
    let e = emo && EMOS.includes(emo) ? emo : 'Normal';
    if (list && !list.includes(e)) e = 'Normal';
    if (!list && e !== 'Normal') e = 'Normal'; // remote: only ask for the one that always exists
    const o = load(dex, e);
    if (o.ok) return o.img;
    if (e !== 'Normal') { const n = load(dex, 'Normal'); if (n.ok) return n.img; }
    return null;
  }
  function portraitFailed(dex) { const o = imgs.get(dex + '/Normal'); return !!(o && o.failed); }
  // warm up the portraits a scene is going to need
  function preload(dexes) { if (manifest == null) return; for (const d of dexes) load(d, 'Normal'); }

  // the feeling in a line, when the speaker doesn't say
  function emoFor(text) {
    if (/\b(?:ha(?:ha)+|heh(?:eh)*|he(?:he)+|hee+|ke(?:ke)+|kehe)|♪/i.test(text)) return 'Joyous';
    if (/\?!|!\?/.test(text)) return 'Surprised';
    if (/^(…|\.\.\.)/.test(text)) return 'Worried';
    if (/!$/.test(text.trim())) return /\b(no|stop|don't|get out|leave)\b/i.test(text) ? 'Angry' : 'Determined';
    return 'Normal';
  }

  // ---------------------------------------------------------------- speakers and boxes
  const MAX = 2;
  const boxes = { left: [], right: [], legend: null };
  let seq = 0;
  // (a few the game has no data for, like Zarude, which is only ever heard)
  const MYTHIC = new Set([151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809, 893]);
  function isLegend(dex) {
    try { if (!AI.R.DEX_BY[dex]) return MYTHIC.has(dex); return AI.Legend ? AI.Legend.isLegendDex(dex) || MYTHIC.has(dex) : MYTHIC.has(dex); } catch (e) { return false; }
  }
  function nameOf(dex) { const d = AI.R.DEX_BY[dex]; return d ? d.name : dex === 893 ? 'Zarude' : '???'; }
  // who: 'player' | an entity (player, puppet, enemy) | {dex, name, col, voice, kind, key}
  function speaker(who, kind) {
    const R = AI.R;
    if (who === 'player') who = R.Game.player;
    if (!who) return null;
    if (who.isSpeaker) return who;
    const dex = who.dex;
    const sp = {
      isSpeaker: true, dex, shiny: !!who.shiny, kind: kind || who.kind || 'party',
      name: who.talkName || who.name || nameOf(dex), nick: who.nick || null,
      col: who.col || (kind === 'npc' ? '#7a5ad0' : '#3a7ad0'), voice: who.voice || voiceFor(who),
      key: who.key || (who === R.Game.player ? 'player' : 'e' + (who.id != null ? who.id : dex)),
    };
    if (who === R.Game.player) sp.name = (R.DEX_BY[dex] || {}).name || sp.name;
    return sp;
  }
  // smaller Pokémon have higher voices
  function voiceFor(e) { const h = e.bodyH || 40; return U.clamp(640 - h * 4, 160, 620); }
  function sideOf(sp) { return sp.kind === 'npc' ? 'right' : 'left'; }

  function make(sp, text, o) {
    return {
      id: ++seq, who: sp, text, shown: 0, done: false, t: 0, after: 0, fade: 1,
      emo: (o && o.emo) || emoFor(text), hold: !!(o && o.hold), src: (o && o.src) || null,
      life: o && o.life != null ? o.life : U.clamp(1.6 + text.length * 0.045, 2.5, 7.5),
      unknown: !!(o && o.unknown), tag: (o && o.tag) || null, born: AI.time,
    };
  }
  function say(who, text, o) {
    o = o || {};
    const sp = speaker(who, o.kind);
    if (!sp || !text) return null;
    if (sp.kind === 'legend') return legend(sp, text, o);
    const side = o.side || sideOf(sp);
    const list = boxes[side];
    // the same speaker keeps one box: new words replace the old ones
    const mine = list.find((b) => b.who.key === sp.key);
    if (mine) list.splice(list.indexOf(mine), 1);
    const b = make(sp, text, o);
    while (list.length >= MAX) {
      const old = list.find((q) => !q.hold) || list[0];
      list.splice(list.indexOf(old), 1);
    }
    list.push(b);
    portrait(sp.dex, b.emo);
    return b;
  }
  // the legendary box: only for a Legendary or Mythical Pokémon
  function legend(who, text, o) {
    o = o || {};
    const sp = typeof who === 'number' ? speaker({ dex: who }, 'legend') : speaker(who, 'legend');
    if (!sp || !text) return null;
    if (!isLegend(sp.dex)) { sp.kind = 'npc'; return say(sp, text, Object.assign({}, o, { kind: 'npc' })); }
    sp.kind = 'legend';
    sp.col = o.col || '#d8b04a';
    sp.voice = o.voice || 150;
    const b = make(sp, text, Object.assign({ life: U.clamp(2.5 + text.length * 0.05, 3.5, 9) }, o));
    boxes.legend = b;
    portrait(sp.dex, b.emo);
    return b;
  }
  function party(ent, text, o) { return say(ent, text, Object.assign({}, o, { kind: 'party' })); }
  function npc(who, text, o) { return say(who, text, Object.assign({}, o, { kind: 'npc' })); }
  function release(b) { if (b) { b.hold = false; b.after = 0; b.life = Math.min(b.life, 6); } }
  function clear(pred) {
    for (const side of ['left', 'right']) boxes[side] = boxes[side].filter((b) => !(pred ? pred(b) : true));
    if (boxes.legend && (!pred || pred(boxes.legend))) boxes.legend = null;
  }
  function all() { return [...boxes.left, ...boxes.right, ...(boxes.legend ? [boxes.legend] : [])]; }

  // ---------------------------------------------------------------- typing, voices, fading
  function blip(b) { try { if (AI.Mansion && AI.Mansion.sfx) AI.Mansion.sfx('blip', 0, 0, b.who.voice * U.rand(0.95, 1.05)); } catch (e) { /* ignore */ } }
  function tickBox(b, dt) {
    b.t += dt;
    if (b.src) { b.shown = b.src.shown; b.done = b.src.done; } // typed by its owner (the story)
    else if (!b.done) {
      const n = Math.min(b.text.length, Math.floor(b.t * 42));
      if (n > b.shown) { if ((n >> 1) !== (b.shown >> 1)) blip(b); b.shown = n; }
      if (b.shown >= b.text.length) b.done = true;
    }
    if (b.done && !b.hold) {
      b.after += dt;
      if (b.after > b.life) b.fade -= dt / 0.4;
    }
    return b.fade > 0;
  }
  function tick(dt) {
    if (!AI.enabled) return;
    for (const side of ['left', 'right']) boxes[side] = boxes[side].filter((b) => tickBox(b, dt));
    if (boxes.legend && !tickBox(boxes.legend, dt)) boxes.legend = null;
    legends.tick(dt);
  }

  // ---------------------------------------------------------------- legendary bosses speak in battle
  /* When a Legendary arrives as a boss it says something, again as the battle turns, and when it
   * falls. Lines for some by name, the rest by type. */
  const T = (en, es) => ({ en, es });
  const LINES = {
    150: { in: T('You came looking for strength. Look no further.', 'Viniste buscando fuerza. Ya la encontraste.'), mid: T('Interesting. You are more than I calculated.', 'Interesante. Eres más de lo que calculé.'), low: T('This… was not in my design.', 'Esto… no estaba en mis planes.') },
    151: { in: T('Mew! ♪', '¡Mew! ♪'), mid: T('Hee hee! Again! Again!', '¡Ji, ji! ¡Otra vez! ¡Otra vez!'), low: T('Mew…? You\'re fun.', '¿Mew…? Eres divertido.') },
    493: { in: T('So. You are the one the land keeps speaking of.', 'Así que eres tú de quien habla la tierra.'), mid: T('Your resolve is real. Show me all of it.', 'Tu determinación es real. Muéstramela entera.'), low: T('Enough. You have been weighed… and found worthy.', 'Basta. Has sido juzgado… y eres digno.') },
    491: { in: T('You should not have come this far into the dark.', 'No debiste adentrarte tanto en la oscuridad.'), mid: T('Every step you take, the dream grows deeper.', 'Cada paso que das, el sueño se hace más profundo.'), low: T('…Then wake. And forget me.', '…Entonces despierta. Y olvídame.') },
    249: { in: T('The sea is restless because of you.', 'El mar está inquieto por tu culpa.') }, 250: { in: T('Let the flames judge your heart.', 'Que las llamas juzguen tu corazón.') },
    382: { in: T('The rain will not stop for you.', 'La lluvia no se detendrá por ti.') }, 383: { in: T('The land burns where I walk.', 'La tierra arde donde camino.') }, 384: { in: T('Nothing stands between the sky and me.', 'Nada se interpone entre el cielo y yo.') },
    243: { in: T('The storm chose this meeting. So did I.', 'La tormenta eligió este encuentro. Yo también.'), mid: T('Faster! The lightning doesn\'t wait for anyone!', '¡Más rápido! ¡El rayo no espera a nadie!'), low: T('…Your spark is real.', '…Tu chispa es real.') },
    245: { in: T('The water is calm. Are you?', 'El agua está en calma. ¿Y tú?'), mid: T('Your heart does not waver. Good.', 'Tu corazón no vacila. Bien.'), low: T('…Clear as the north wind.', '…Claro como el viento del norte.') },
    244: { in: T('Burn bright — or burn out!', '¡Arde con fuerza, o apágate!'), mid: T('Yes! Let the fire in you roar!', '¡Sí! ¡Que ruja el fuego que llevas dentro!'), low: T('…The others were right about you.', '…Los otros tenían razón sobre ti.') },
    144: { in: T('…Cold. Like the summit wind.', '…Frío. Como el viento de la cumbre.') }, 145: { in: T('The storm has a voice. Hear it.', 'La tormenta tiene voz. Escúchala.') }, 146: { in: T('Burn bright, little one. Briefly.', 'Arde con fuerza, pequeño. Brevemente.') },
  };
  const BY_TYPE = {
    fire: T('Feel the heat of something older than this forest.', 'Siente el calor de algo más antiguo que este bosque.'), water: T('The tide answers to me.', 'La marea me obedece.'),
    electric: T('Every hair on your body knows what\'s coming.', 'Cada pelo de tu cuerpo sabe lo que viene.'), psychic: T('I saw you coming long before you did.', 'Te vi venir mucho antes que tú.'),
    dragon: T('Kneel, or be made to.', 'Arrodíllate, o serás obligado.'), ghost: T('You hear me, but you cannot find me.', 'Me oyes, pero no puedes encontrarme.'),
    dark: T('The shadows here belong to me.', 'Las sombras de aquí me pertenecen.'), grass: T('Tread carefully. Everything here is alive.', 'Pisa con cuidado. Todo aquí está vivo.'),
    ice: T('Stillness. Silence. Cold.', 'Quietud. Silencio. Frío.'), steel: T('I do not bend.', 'Yo no me doblego.'), rock: T('I was here before the first tree.', 'Yo estaba aquí antes del primer árbol.'),
    fairy: T('How sweet. You think you can win.', 'Qué tierno. Crees que puedes ganar.'), flying: T('Look up. You\'re already too late.', 'Mira arriba. Ya es tarde.'),
    ground: T('The ground itself will turn on you.', 'El propio suelo se volverá contra ti.'), fighting: T('Show me your strength!', '¡Muéstrame tu fuerza!'),
    normal: T('So you\'re the one making all this noise.', 'Así que tú eres quien hace tanto ruido.'), bug: T('The forest is mine to protect.', 'Proteger el bosque es cosa mía.'), poison: T('Breathe deep.', 'Respira hondo.'),
  };
  const MID = T('You\'re stronger than you look.', 'Eres más fuerte de lo que pareces.'), LOW = T('…Remarkable.', '…Admirable.');
  function lang() { return AI.lang ? AI.lang() : 'en'; }
  function tr(v) { return v ? v[lang()] || v.en : ''; }
  const legends = {
    seen: new Map(),
    tick() {
      const R = AI.R;
      if (!R || !R.EnemyMgr) return;
      for (const e of R.EnemyMgr.all()) {
        if (e.dead || !(e.boss || e.legend || e.judge) || !isLegend(e.dex)) continue;
        let s = this.seen.get(e);
        if (!s) {
          s = { stage: 0 };
          this.seen.set(e, s);
          if (R.Camera.sees(e.x, e.y, 120)) this.speak(e, 'in');
          else s.stage = -1; // it speaks when it comes into view
          continue;
        }
        if (s.stage === -1 && R.Camera.sees(e.x, e.y, 40)) { s.stage = 0; this.speak(e, 'in'); }
        const k = e.hp / Math.max(1, e.maxHp);
        if (s.stage === 0 && k < 0.55) { s.stage = 1; this.speak(e, 'mid'); }
        else if (s.stage === 1 && k < 0.15) { s.stage = 2; this.speak(e, 'low'); }
      }
      for (const e of this.seen.keys()) if (e.dead || !R.EnemyMgr.all().includes(e)) this.seen.delete(e);
    },
    speak(e, when) {
      const own = LINES[e.dex];
      const ty = (e.types || (AI.R.DEX_BY[e.dex] || {}).types || ['normal'])[0];
      const line = (own && own[when]) || (when === 'in' ? BY_TYPE[ty] || BY_TYPE.normal : when === 'mid' ? MID : LOW);
      legend({ dex: e.dex, id: e.id }, tr(line), { emo: when === 'low' ? 'Pain' : when === 'mid' ? 'Determined' : 'Normal' });
    },
  };

  // other players' chat appears in their own box, with their Pokémon's portrait
  function hookChat() {
    const R = AI.R;
    if (!R || !R.Net || !R.Net.on || hookChat.done) return;
    hookChat.done = true;
    R.Net.on((from, msg) => {
      if (!msg || msg.k !== 'chat' || !AI.enabled || AI.cfg.talkBoxes === false) return;
      const uid = msg.u || from;
      if (uid === R.Net.uid) return;
      let pup = null;
      try { const ps = R.Coop.puppets(); pup = ps.find((q) => q.uid === uid || q.netUid === uid) || (ps.length === 1 ? ps[0] : null); } catch (e) { /* ignore */ }
      if (pup) party(Object.assign(Object.create(pup), { key: 'net:' + uid, talkName: pup.name || pup.nick || null, dex: pup.dex, bodyH: pup.bodyH, id: pup.id }), String(msg.t || '').slice(0, 140));
    });
  }

  // ---------------------------------------------------------------- drawing
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrap(ctx, text, maxW) {
    const cjk = /[　-鿿]/.test(text);
    const words = cjk ? text.split('') : text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + (cjk ? '' : ' ') + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  const spriteAnim = new Map();
  function drawFace(ctx, b, px, py, ps) {
    const img = portrait(b.who.dex, b.emo);
    ctx.save();
    rr(ctx, px + 2, py + 2, ps - 4, ps - 4, 5); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    if (img) ctx.drawImage(img, px + 2, py + 2, ps - 4, ps - 4);
    else if (portraitFailed(b.who.dex) || manifest) {
      // no portrait for this one: its own sprite, standing in the frame
      let a = spriteAnim.get(b.who.dex);
      if (!a) { try { a = new AI.R.Sprites.Animator(b.who.dex, 1, !!b.who.shiny); a.loop('Idle'); } catch (e) { a = null; } spriteAnim.set(b.who.dex, a); }
      if (a) { a.dir = 0; try { a.update(1 / 60); } catch (e) { /* ignore */ } ctx.translate(px + ps / 2, py + ps - 3); const k = ps / 60; ctx.scale(k, k); try { a.draw(ctx, 0, 0, { alpha: 1 }); } catch (e) { /* ignore */ } }
    }
    if (b.unknown) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(6,4,12,0.92)'; ctx.fillRect(px, py, ps, ps); }
    ctx.restore();
  }
  function nameTag(ctx, b, x, y, gold, alignRight) {
    const name = b.unknown ? '???' : b.who.nick ? b.who.name + ' · ' + b.who.nick : b.who.name;
    ctx.font = '700 14px Pixelify, "Segoe UI", sans-serif';
    const nw = ctx.measureText(name).width + 20;
    if (alignRight) x -= nw;
    ctx.fillStyle = gold ? '#3a2a10' : b.who.col;
    ctx.strokeStyle = gold ? '#e8c060' : '#f2e6c8'; ctx.lineWidth = 2;
    rr(ctx, x, y, nw, 24, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = gold ? '#ffe7a0' : '#fff'; ctx.textBaseline = 'middle';
    ctx.fillText(name, x + 10, y + 12.5);
  }
  function caret(ctx, b, x, y) {
    if (b.done && b.hold && Math.sin(AI.time * 7) > -0.3) {
      ctx.fillStyle = '#f2e6c8';
      ctx.beginPath(); ctx.moveTo(x - 12, y - 8); ctx.lineTo(x, y - 8); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill();
    }
  }
  function drawSideBox(ctx, b, x, y, bw, bh, right) {
    const ps = 64;
    ctx.save();
    ctx.globalAlpha = U.clamp(b.fade, 0, 1) * (b.hold || !b.done || b.after < 0.3 ? 1 : 0.92);
    ctx.fillStyle = 'rgba(14,16,40,0.93)';
    ctx.strokeStyle = '#f2e6c8'; ctx.lineWidth = 3;
    rr(ctx, x, y, bw, bh, 11); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,110,180,0.8)'; ctx.lineWidth = 1;
    rr(ctx, x + 5, y + 5, bw - 10, bh - 10, 8); ctx.stroke();
    // portrait on the outer side
    const px = right ? x + bw - ps - 10 : x + 10, py = y + (bh - ps) / 2;
    ctx.fillStyle = '#22264a'; ctx.strokeStyle = '#f2e6c8'; ctx.lineWidth = 2;
    rr(ctx, px, py, ps, ps, 7); ctx.fill(); ctx.stroke();
    drawFace(ctx, b, px, py, ps);
    const tx = right ? x + 16 : px + ps + 14, tw = bw - ps - 40;
    nameTag(ctx, b, right ? x + bw - 6 : x + 6, y - 15, false, right);
    ctx.font = '700 15px Pixelify, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f6f2ff';
    const lines = wrap(ctx, b.text.slice(0, b.shown), tw);
    lines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, tx, y + 16 + i * 20));
    caret(ctx, b, right ? px - 10 : x + bw - 12, y + bh - 10);
    ctx.restore();
  }
  function drawLegendBox(ctx, b, w, h) {
    const bw = Math.min(w - 32, 780), bh = 118, ps = 96;
    const x = Math.round((w - bw) / 2), y = Math.round(h - 112 - bh - 24);
    const pulse = 0.5 + 0.5 * Math.sin(AI.time * 2.2);
    ctx.save();
    ctx.globalAlpha = U.clamp(b.fade, 0, 1);
    // an aura around the box
    ctx.shadowColor = 'rgba(232,192,96,' + (0.35 + pulse * 0.3).toFixed(2) + ')';
    ctx.shadowBlur = 18 + pulse * 10;
    const g = ctx.createLinearGradient(0, y, 0, y + bh);
    g.addColorStop(0, 'rgba(26,14,40,0.96)'); g.addColorStop(1, 'rgba(8,6,16,0.97)');
    ctx.fillStyle = g;
    rr(ctx, x, y, bw, bh, 14); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#e8c060'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(232,192,96,0.45)'; ctx.lineWidth = 1;
    rr(ctx, x + 6, y + 6, bw - 12, bh - 12, 10); ctx.stroke();
    // little stars at the corners
    ctx.fillStyle = '#ffe7a0';
    for (const [cx, cy] of [[x + 14, y + 14], [x + bw - 14, y + 14], [x + 14, y + bh - 14], [x + bw - 14, y + bh - 14]]) {
      ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 1.5, cy - 1.5); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx + 1.5, cy + 1.5); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 1.5, cy + 1.5); ctx.lineTo(cx - 4, cy); ctx.lineTo(cx - 1.5, cy - 1.5); ctx.closePath(); ctx.fill();
    }
    // the portrait, in a double gold frame
    const px = x + 14, py = y + (bh - ps) / 2;
    ctx.fillStyle = '#120a1c'; ctx.strokeStyle = '#e8c060'; ctx.lineWidth = 3;
    rr(ctx, px, py, ps, ps, 9); ctx.fill(); ctx.stroke();
    drawFace(ctx, b, px, py, ps);
    ctx.strokeStyle = 'rgba(255,231,160,0.5)'; ctx.lineWidth = 1;
    rr(ctx, px - 4, py - 4, ps + 8, ps + 8, 11); ctx.stroke();
    const tx = px + ps + 20;
    nameTag(ctx, b, tx - 6, y - 16, true);
    ctx.font = '700 18px Pixelify, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff4d8';
    const lines = wrap(ctx, b.text.slice(0, b.shown), bw - (tx - x) - 30);
    lines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, tx, y + 22 + i * 26));
    caret(ctx, b, x + bw - 16, y + bh - 12);
    ctx.restore();
  }
  function draw(ctx, w, h) {
    if (!AI.enabled || AI.cfg.talkBoxes === false) return;
    if (AI.Haunt && AI.Haunt.hs && AI.Haunt.hs.jump) return;
    hookChat();
    const bw = Math.round(Math.min(400, (w - 36) / 2)), bh = 84;
    let lowY = Math.round(Math.min(h * 0.64, h - 140) - bh);
    if (boxes.legend) lowY = Math.min(lowY, Math.round(h - 112 - 118 - 24) - bh - 30); // (clear of the Legendary box)
    for (const [side, right] of [['left', false], ['right', true]]) {
      const list = boxes[side];
      const x = right ? w - 12 - bw : 12;
      // the newest at the bottom, the one before it just above
      list.forEach((b, i) => drawSideBox(ctx, b, x, lowY - (list.length - 1 - i) * (bh + 30), bw, bh, right));
    }
    if (boxes.legend) drawLegendBox(ctx, boxes.legend, w, h);
  }
  function reset() { boxes.left.length = 0; boxes.right.length = 0; boxes.legend = null; legends.seen.clear(); }

  AI.define('Talk', {
    say, party, npc, legend, release, clear, all, tick, draw, reset, boxes, emoFor, isLegend, preload,
    portrait, portraitFailed, get manifest() { return manifest; }, MAX, legends,
  });
})();
