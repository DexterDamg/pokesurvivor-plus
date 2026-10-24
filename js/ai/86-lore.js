/* PokéSurvivor+ — Living World AI · lore: rumours, warnings and small wonders
 * Pokémon talk. In the evening some of them tell the others about an old mansion hidden in the
 * woods, and every storyteller tells a different version. Friendly ones warn you when the weather
 * turns, and those who trust you share secrets: where the old trail starts, a hidden berry patch,
 * a cave sealed with boulders. On moonless or foggy nights a music box seems to drift through the
 * trees near the abandoned trail. And once, on a wet night, a Hoothoot on the old sign tries to
 * warn you, while the lantern flickers and a distant door creaks open.
 * Small wonders happen too: a flock of Pidgey bursting into the air, a Rattata family crossing the
 * path, a tree felled by the storm, a Charmander relighting a lantern the wind blew out.
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const M = () => AI.Mind;

  // ---------------------------------------------------------------- lines (es / en / fr / zh)
  const T = {
    rumor: {
      es: ['Dicen que pasando los pinos altos hay una vieja mansión… nadie sale igual que entró.', 'Mi abuela juraba que su reloj aún hace tic-tac. Nadie le da cuerda desde hace cien años.', 'Anoche vi luces en las ventanas. Luces moradas.', 'No hay ninguna mansión. …Tú no sigas las piedras viejas, ¿vale?', 'Un Gastly me contó que dan fiestas allí en las noches sin luna.', 'Cuando baja la niebla, se oye una caja de música entre los árboles.', 'La puerta se abre sola. La oí crujir. Salí corriendo.', 'Algo ahí dentro colecciona cosas perdidas. Cosas brillantes. Pokémon.', 'El farol viejo del sendero parpadea aunque no sople el viento. Nos vigila.', 'Dicen que el señor de la casa aún espera invitados.'],
      en: ['They say there\'s an old mansion past the tall pines… nobody comes out the way they went in.', 'My grandma swore its clock still ticks. Nobody\'s wound it in a hundred years.', 'I saw lights in the windows last night. Purple ones.', 'There\'s no mansion. …Just don\'t follow the old stones, okay?', 'A Gastly told me they throw parties there on moonless nights.', 'When the fog rolls in, you can hear a music box in the trees.', 'The door opens by itself. I heard it creak. I ran.', 'Something in there collects lost things. Shiny things. Pokémon.', 'The old lantern by the trail flickers when there\'s no wind. It\'s watching.', 'They say the master of the house is still waiting for guests.'],
      fr: ['On dit qu\'il y a un vieux manoir derrière les grands pins… personne n\'en ressort pareil.', 'Ma grand-mère jurait que son horloge tourne encore. Personne ne la remonte depuis cent ans.', 'J\'ai vu des lumières aux fenêtres hier soir. Des lumières violettes.', 'Il n\'y a pas de manoir. …Ne suis pas les vieilles pierres, d\'accord ?', 'Un Fantominus m\'a dit qu\'ils font la fête là-bas les nuits sans lune.', 'Quand le brouillard tombe, on entend une boîte à musique dans les arbres.', 'La porte s\'ouvre toute seule. Je l\'ai entendue grincer. J\'ai fui.', 'Quelque chose là-dedans collectionne les choses perdues. Les choses brillantes. Les Pokémon.', 'La vieille lanterne du sentier vacille même sans vent. Elle nous observe.', 'On dit que le maître des lieux attend toujours ses invités.'],
      zh: ['聽說穿過高高的松樹林，有一座古老的洋館……進去的人都變了個樣。', '我奶奶發誓那裡的時鐘還在滴答響。一百年都沒人上發條了。', '昨晚我看到窗戶裡有光。是紫色的光。', '根本沒有什麼洋館。……總之別跟著那些舊石頭走，好嗎？', '鬼斯告訴我，沒有月亮的夜晚他們會在那裡開派對。', '起霧的時候，樹林裡會傳來音樂盒的聲音。', '那扇門會自己打開。我聽到它嘎吱作響。我逃走了。', '裡面有東西在收集遺失的東西。閃亮的東西。寶可夢。', '小路旁那盞舊燈籠，沒有風也會閃爍。它在看著我們。', '聽說洋館的主人還在等待客人。'],
    },
    react: {
      es: ['¡No puede ser…!', '¡Para ya, que me asustas!', '…Esta noche duermo con un ojo abierto.', 'Eso es solo un cuento.', '¡Chsss! Te puede oír.'],
      en: ['No way…', 'Stop it, you\'re scaring me!', '…I\'m sleeping with one eye open tonight.', 'That\'s just a story.', 'Shh! It can hear you.'],
      fr: ['Pas possible…', 'Arrête, tu me fais peur !', '…Ce soir je dors d\'un œil.', 'Ce n\'est qu\'une histoire.', 'Chut ! Il peut t\'entendre.'],
      zh: ['不會吧……', '別說了，好可怕！', '……今晚我要睜一隻眼睡覺。', '那只是個故事啦。', '噓！它聽得到。'],
    },
    warn_rain: { es: 'Huele a lluvia…', en: 'Smells like rain…', fr: 'Ça sent la pluie…', zh: '有下雨的味道……' },
    warn_storm: { es: '¡Viene tormenta, yo me escondo!', en: 'Thunder\'s coming — I\'m hiding!', fr: 'L\'orage arrive, je me cache !', zh: '雷雨要來了，我要躲起來！' },
    warn_wind: { es: '¡Agárrate a algo!', en: 'Hold on to something!', fr: 'Accroche-toi à quelque chose !', zh: '抓緊點東西！' },
    warn_fog: { es: 'No te acerques al camino viejo con esta niebla.', en: 'Don\'t go near the old road in this fog.', fr: 'Ne t\'approche pas du vieux chemin dans ce brouillard.', zh: '起這麼大的霧，別靠近那條舊路。' },
    warn_trail: { es: 'Aléjate del sendero viejo. Por favor.', en: 'Stay away from the old trail. Please.', fr: 'Reste loin du vieux sentier. S\'il te plaît.', zh: '離舊小路遠一點。拜託。' },
    hoot: { es: '…No.', en: '…Don\'t.', fr: '…Non.', zh: '……不要。' },
    hint_trail: { es: 'El viejo camino de faroles empieza hacia el {dir}. Lleva a la mansión. No vayas de noche.', en: 'The old lantern path starts to the {dir}. It leads to the mansion. Don\'t go at night.', fr: 'Le vieux chemin aux lanternes commence vers le {dir}. Il mène au manoir. N\'y va pas la nuit.', zh: '舊燈籠小路從{dir}方開始，通往洋館。晚上別去。' },
    hint_patch: { es: 'Hay bayas dulces escondidas tras los arbustos, hacia el {dir}.', en: 'There are sweet berries hidden behind the bushes to the {dir}.', fr: 'Il y a des baies sucrées cachées derrière les buissons, vers le {dir}.', zh: '{dir}方的灌木叢後面藏著甜甜的樹果。' },
    hint_cave: { es: 'Hay una cueva tapada con rocas hacia el {dir}. Algo vive dentro.', en: 'There\'s a cave sealed with boulders to the {dir}. Something lives inside.', fr: 'Il y a une grotte bouchée par des rochers vers le {dir}. Quelque chose vit dedans.', zh: '{dir}方有個被岩石封住的洞窟。裡面住著什麼。' },
    dirs: {
      es: ['este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste', 'norte', 'noreste'],
      en: ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'],
      fr: ['est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest', 'nord', 'nord-est'],
      zh: ['東', '東南', '南', '西南', '西', '西北', '北', '東北'],
    },
  };
  function L(key) { const lg = AI.lang ? AI.lang() : 'en'; const v = T[key]; return v[lg] || v.en; }
  function dirTo(x0, y0, x1, y1) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    return L('dirs')[(Math.round(a / (Math.PI / 4)) + 8) % 8];
  }

  // ---------------------------------------------------------------- speech bubbles
  const says = [];
  function say(e, text, dur = 4.5) {
    if (!AI.cfg.speech || !e || e.dead) return false;
    for (let i = says.length - 1; i >= 0; i--) if (says[i].e === e) says.splice(i, 1);
    if (says.length >= 3) says.shift();
    says.push({ e, text, t: 0, dur });
    return true;
  }
  function wrap(ctx, text, maxW) {
    const words = /[　-鿿]/.test(text) ? text.split('') : text.split(' ');
    const sep = /[　-鿿]/.test(text) ? '' : ' ';
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + sep + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function drawSpeech(ctx) {
    if (!says.length) return;
    const cam = AI.R.Camera;
    ctx.save();
    ctx.font = '700 7px Pixelify, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    for (const b of says) {
      const e = b.e;
      if (e.dead || !cam.sees(e.x, e.y, 60)) continue;
      const a = Math.min(1, (b.dur - b.t) / 0.4, b.t / 0.15);
      if (a <= 0) continue;
      const lines = wrap(ctx, b.text, 118);
      const w = Math.min(126, Math.max(...lines.map((l) => ctx.measureText(l).width))) + 10;
      const h = lines.length * 9 + 7;
      const lift = (e.psx && e.psx.vis ? (e.psx.vis.lift || 0) : 0) + (e.jumpLift || 0);
      const x = Math.round(e.x - w / 2), y = Math.round(e.y - AI.Scale.top(e) - lift - h - 26);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,253,244,0.96)';
      ctx.strokeStyle = '#2b2a3a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 4, y); ctx.lineTo(x + w - 4, y); ctx.quadraticCurveTo(x + w, y, x + w, y + 4);
      ctx.lineTo(x + w, y + h - 4); ctx.quadraticCurveTo(x + w, y + h, x + w - 4, y + h);
      ctx.lineTo(e.x + 4, y + h); ctx.lineTo(e.x, y + h + 6); ctx.lineTo(e.x - 3, y + h);
      ctx.lineTo(x + 4, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - 4);
      ctx.lineTo(x, y + 4); ctx.quadraticCurveTo(x, y, x + 4, y);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#26243a';
      lines.forEach((l, i) => ctx.fillText(l, x + 5, y + 4 + i * 9));
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- helpers
  function awake(e) { const s = e.psx; return s && !e.dead && !(s.beh && (s.beh.id === 'sleep' || s.beh.id === 'retreat-home')) && !s.inCombat && !s.lock && s.stance !== 'hostile'; }
  function nearPlayer(r, filter) {
    const R = AI.R;
    const p = R.Game.player;
    if (!p) return [];
    return R.EnemyMgr.queryCircle(p.x, p.y, r).filter((e) => e.psx && awake(e) && R.Camera.sees(e.x, e.y, -20) && (!filter || filter(e)));
  }
  function rumorOf(e) { return (U.hash(e.id, AI.Decor ? AI.Decor.seed : 1, 77) * 10) | 0; }

  // ---------------------------------------------------------------- directors
  let storyT = 40, warnT = 0, hintT = 60, eventT = 30, tickT = 0;
  let pendingWarn = null;
  const st = { hootDone: false, hoot: null, felled: 0, stormT: 0, family: 0 };

  function tellStory() {
    const R = AI.R;
    const cands = nearPlayer(520, (e) => e.psx.pers.temp !== 'timid' && e.psx.pers.tr.sociability > 0.35);
    for (const sp of cands) {
      const listeners = R.EnemyMgr.queryCircle(sp.x, sp.y, 170).filter((o) => o !== sp && o.psx && awake(o));
      if (!listeners.length) continue;
      const text = L('rumor')[rumorOf(sp)];
      if (!say(sp, text, 5.5)) return false;
      sp.psx.face = Math.atan2(listeners[0].y - sp.y, listeners[0].x - sp.x);
      M().say(sp.psx, 'dots', 2, 1);
      AI.Bus.emit({ type: 'cry', kind: 'story', x: sp.x, y: sp.y, loud: 140, src: sp });
      listeners.slice(0, 3).forEach((o, i) => {
        setTimeout(() => {
          if (o.dead || !o.psx) return;
          const s = o.psx;
          const scared = s.pers.temp === 'timid' || s.pers.tr.bravery < 0.4;
          M().feel(s, scared ? 'fear' : 'curiosity', scared ? 0.45 : 0.35, 'story');
          M().say(s, scared ? 'scared' : U.pick(['surprise', 'question', 'eyes']), 1.8, 2);
          if (i === 0 && Math.random() < 0.7) say(o, U.pick(L('react')), 3.2);
        }, 2600 + i * 700);
      });
      return true;
    }
    return false;
  }

  function warn(kind) {
    const cands = nearPlayer(480, (e) => {
      const s = e.psx;
      const r = s.rel.get('P');
      return s.pers.temp === 'friendly' || s.pers.temp === 'playful' || (r && r.b > 0.25) || s.pers.tr.alertness > 0.7;
    });
    const sp = cands[0];
    if (!sp) return false;
    say(sp, L('warn_' + kind), 4);
    M().say(sp.psx, kind === 'storm' || kind === 'wind' ? 'alert' : 'eyes', 1.8, 2);
    return true;
  }

  function hint() {
    const R = AI.R;
    const D = AI.Decor;
    const cands = nearPlayer(380, (e) => { const r = e.psx.rel.get('P'); return r && r.b > 0.5 && r.a > 0.3; });
    const sp = cands[0];
    if (!sp || !D) return false;
    const opts = [];
    if (D.trail) opts.push(['hint_trail', D.trail.start[0], D.trail.start[1]]);
    if (D.cave) opts.push(['hint_cave', D.cave.x, D.cave.y]);
    const patch = D.near(sp.x, sp.y, 1400, (o) => o.hab === 'berry' && o.berries > 0);
    if (patch) opts.push(['hint_patch', patch.x, patch.y]);
    if (!opts.length) return false;
    const [key, x, y] = U.pick(opts);
    say(sp, L(key).replace('{dir}', dirTo(sp.x, sp.y, x, y)), 5);
    M().say(sp.psx, 'love', 1.6, 2);
    return true;
  }

  // a Hoothoot on the old sign, staring down the abandoned road
  function hootScene(p) {
    const D = AI.Decor;
    const tr = D && D.trail;
    if (!tr || st.hootDone || !AI.Debug) return;
    const sign = tr.items.find((it) => it.k === 'sign');
    if (!sign) return;
    st.hootDone = true;
    const e = AI.Debug.spawn(163, { x: sign.x, y: sign.y + 1, temp: 'friendly', hp: 60 });
    if (!e || !e.psx) return;
    const s = e.psx;
    const lantern = tr.items.find((it) => it.k === 'gallows');
    const look = Math.atan2(tr.end[1] - e.y, tr.end[0] - e.x);
    st.hoot = e;
    s.lock = {
      t: 0, phase: 0,
      update(e2, s2, dt, it) {
        this.t += dt;
        s2.vis.lift = this.phase < 3 ? 22 : s2.vis.lift;
        if (this.phase === 0) {
          it.stay = true; it.face = look;
          const d = Math.hypot(p.x - e2.x, p.y - e2.y);
          if (d < 140 || this.t > 40) { this.phase = 1; this.t = 0; it.face = Math.atan2(p.y - e2.y, p.x - e2.x); say(e2, L('hoot'), 3); M().say(s2, 'alert', 2, 4); if (lantern) lantern.forceFlicker = AI.time + 3; }
          return true;
        }
        if (this.phase === 1) {
          it.stay = true; it.face = Math.atan2(p.y - e2.y, p.x - e2.x);
          if (this.t > 1.4) { this.phase = 2; this.t = 0; if (AI.Ambience) AI.Ambience.creak(); }
          return true;
        }
        if (this.phase === 2) {
          it.stay = true; it.face = look + Math.PI; // it turns away from you
          if (this.t > 0.6 && this.t - dt <= 0.6) { M().feel(s2, 'fear', 0.9, 'trail'); M().say(s2, 'scared', 2.4, 4); }
          if (this.t > 2) { this.phase = 3; this.t = 0; }
          return true;
        }
        // flies off into the night
        s2.vis.lift = 22 + this.t * 70;
        it.x = e2.x - Math.cos(look) * 300; it.y = e2.y - Math.sin(look) * 300; it.speed = 1;
        if (this.t > 3.5 || !AI.R.Camera.sees(e2.x, e2.y, 60)) { AI.EnvBeh.removeNpc(e2); return false; }
        return true;
      },
    };
  }

  // a startled flock takes off together
  function flock(p) {
    const R = AI.R;
    const birds = R.EnemyMgr.queryCircle(p.x, p.y, 420).filter((e) => e.psx && awake(e) && [16, 17, 21, 396, 397].includes(e.dex));
    if (birds.length < 3) return false;
    const near = birds.some((b) => Math.hypot(b.x - p.x, b.y - p.y) < 150);
    if (!near || Math.hypot(p._vx || 0, p._vy || 0) < 140) return false;
    for (const b of birds) {
      const s = b.psx;
      const a = Math.atan2(b.y - p.y, b.x - p.x) + U.rand(-0.4, 0.4);
      M().feel(s, 'fear', 0.6, 'P');
      M().say(s, 'surprise', 1.2, 3);
      s.lock = {
        t: 0, d: U.rand(0, 0.3),
        update(e2, s2, dt, it) {
          this.t += dt;
          if (this.t < this.d) { it.stay = true; return true; }
          const k = this.t - this.d;
          s2.vis.lift = Math.min(120, k * 90);
          s2.vis.rot = Math.sin(k * 30) * 0.08;
          e2.x += Math.cos(a) * 240 * dt; e2.y += Math.sin(a) * 160 * dt;
          it.stay = true;
          if (k > 3 || !AI.R.Camera.sees(e2.x, e2.y, 80)) { AI.EnvBeh.removeNpc(e2); return false; }
          return true;
        },
      };
    }
    if (AI.Ambience) AI.Ambience.flutter(p.x, p.y);
    return true;
  }

  // a Rattata family crosses the path, babies in a line behind mum
  function family(p) {
    const R = AI.R;
    const cam = R.Camera;
    if (!AI.Debug || !R.DEX_BY[19] || st.family >= 2) return false;
    const fromLeft = Math.random() < 0.5;
    const y = p.y + U.rand(-cam.h * 0.3, cam.h * 0.3);
    const x0 = fromLeft ? cam.left() - 30 : cam.left() + cam.w + 30, x1 = fromLeft ? cam.left() + cam.w + 60 : cam.left() - 60;
    if (!R.World.isFree(x0, y, 12) || !R.World.isFree((x0 + x1) / 2, y, 12)) return false;
    st.family++;
    const crew = [];
    for (let i = 0; i < 4; i++) {
      const e = AI.Debug.spawn(19, { x: x0 - (fromLeft ? 1 : -1) * i * 30, y: y + (i % 2) * 6, temp: 'friendly', hp: 40 });
      if (!e || !e.psx) continue;
      crew.push(e);
      if (i > 0) { e.psx.vis.sx = 0.62; e.psx.vis.sy = 0.62; }
      e.psx.lock = {
        update(e2, s2, dt, it) {
          it.x = x1; it.y = y + (i % 2) * 6; it.speed = 0.5;
          if (Math.random() < dt * 0.3) M().say(s2, i ? 'happy' : 'note', 1, 0);
          if (fromLeft ? e2.x >= x1 - 10 : e2.x <= x1 + 10) { AI.EnvBeh.removeNpc(e2); return false; }
          return true;
        },
      };
    }
    return crew.length > 0;
  }

  // after a severe storm, a fallen tree blocks a shortcut
  function fellTree(p) {
    const D = AI.Decor;
    if (!D || st.felled >= 2) return;
    const R = AI.R;
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * 6.283, r = U.rand(520, 760);
      const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * 0.8;
      if (R.World.kindAt(x, y) !== 'floor' || !R.World.isFree(x, y, 30)) continue;
      D.addDyn({ k: 'log', n: 'log_fallen', x, y, s: 1.7, r: 40, felled: true, hab: 'log' });
      st.felled++;
      return;
    }
  }

  function tick(dt) {
    tickT -= dt;
    if (tickT > 0) return;
    const step = 1 - tickT;
    tickT = 1;
    const R = AI.R;
    const p = R.Game.player;
    const Sky = AI.Sky;
    if (!p || p.dead || !AI.cfg.speech && false) return;
    for (let i = says.length - 1; i >= 0; i--) { says[i].t += step; if (says[i].t > says[i].dur || says[i].e.dead) says.splice(i, 1); }
    const atmo = Sky && AI.cfg.atmosphere !== false && !Sky.indoor();
    // stories at dusk and at night (and in the fog)
    storyT -= step;
    if (storyT <= 0 && AI.cfg.speech) {
      const mood = atmo && (Sky.darkness() > 0.35 || Sky.fog > 0.5) ? 1 : 0.15;
      storyT = Math.random() < mood && tellStory() ? U.rand(55, 95) : U.rand(12, 25);
    }
    // weather warnings, a little ahead of the change
    if (pendingWarn && AI.time >= pendingWarn.at) { warn(pendingWarn.kind); pendingWarn = null; }
    // secrets from Pokémon that trust you
    hintT -= step;
    if (hintT <= 0) hintT = hint() ? U.rand(120, 200) : U.rand(20, 40);
    if (!atmo) return;
    // the trail: lantern notice, music box, the Hoothoot
    const D = AI.Decor;
    const tr = D && D.trail;
    if (tr) {
      const lantern = tr.items.find((it) => it.k === 'gallows');
      if (lantern && R.Camera.sees(lantern.x, lantern.y, 0) && D.flame(lantern) < 0.3) {
        for (const e of R.EnemyMgr.queryCircle(lantern.x, lantern.y, 220)) {
          if (!e.psx || !awake(e) || Math.random() > 0.5) continue;
          M().feel(e.psx, 'suspicion', 0.4);
          M().say(e.psx, 'eyes', 1.6, 2);
        }
      }
      const dEnd = Math.hypot(p.x - tr.end[0], p.y - tr.end[1]);
      const moonless = Sky.moonPhase() < 0.13 || Sky.moonPhase() > 0.87;
      const music = Sky.darkness() > 0.6 && (moonless || Sky.fog > 0.55) && dEnd < 1100 ? (1 - dEnd / 1100) : 0;
      if (AI.Ambience) AI.Ambience.musicBox(music);
      const dStart = Math.hypot(p.x - tr.start[0], p.y - tr.start[1]);
      if (!st.hootDone && !(AI.Debug && AI.Debug.noSpawns && !st.allowHoot) && Sky.darkness() > 0.7 && Sky.wet > 0.2 && Sky.rain < 0.12 && dStart < 460) hootScene(p);
      if (Sky.fog > 0.65 && dStart < 500 && Math.random() < step * 0.05) warn('fog');
    }
    // storms fell trees
    if (Sky.storm > 0.8) st.stormT += step; else st.stormT = Math.max(0, st.stormT - step);
    if (st.stormT > 15) { st.stormT = 0; fellTree(p); }
    // fire-type Pokémon relight lanterns the wind blew out
    if (D) for (const it of D.lights(p.x - 700, p.y - 500, p.x + 700, p.y + 500)) {
      if (it.lit || it.light.kind === 'glow') continue;
      const f = R.EnemyMgr.queryCircle(it.x, it.y, 90).find((e) => !e.dead && (e.types || []).includes('fire') && e.psx && awake(e));
      if (f && Sky.rain < 0.3 && Sky.windNow() < 0.6) { it.lit = true; R.FX.burst(it.x, it.y - 50, '#ffb04a', 8, 60); M().say(f.psx, 'happy', 1.4, 2); }
    }
    // small wonders
    eventT -= step;
    if (eventT <= 0 && !(AI.Debug && AI.Debug.noSpawns)) {
      eventT = U.rand(25, 50);
      const day = Sky.darkness() < 0.4 && Sky.rain < 0.3;
      if (Math.random() < 0.6) flock(p);
      else if (day && AI.Areas.roster() && Math.random() < 0.35) family(p);
    }
  }
  AI.Bus.on('weather', (ev) => {
    const kind = ev.pattern === 'storm' ? 'storm' : ev.pattern === 'rain' || ev.pattern === 'drizzle' ? 'rain' : ev.pattern === 'gale' ? 'wind' : ev.pattern === 'deepfog' ? 'fog' : null;
    if (kind && AI.R && AI.R.Game && AI.R.Game.state === 'playing') pendingWarn = { kind, at: AI.time + U.rand(2, 6) };
  });

  function reset() { says.length = 0; st.hootDone = false; st.hoot = null; st.felled = 0; st.stormT = 0; st.family = 0; storyT = 40; hintT = 60; eventT = 30; pendingWarn = null; }

  AI.define('Lore', { T, L, say, says, drawSpeech, tick, reset, tellStory, warn, hint, hootScene, flock, family, fellTree, st });
})();
