/* PokéSurvivor+ — Living World AI · the mansion's story: the pranksters, and what watches
 * Fear → suspense → discovery → humour → comfort → confusion → genuine dread.
 *
 *  1. You arrive. The door slams behind you. Something is in the house (88-haunt.js).
 *  2. The mirror at the end of the hall shows something standing behind you.
 *  3. Laughter, from behind the locked ballroom door. Inside: Gengar, Haunter, Gastly, Dusknoir,
 *     Duskull, Misdreavus, Mismagius, Honedge, Doublade, Aegislash, three Litwick and Chandelure,
 *     mid-celebration. Every haunting was a prank, and each of them wants credit for theirs.
 *  4. You mention the tall shadow in the mirror. Nobody laughs. None of them did that.
 *  5. Dusknoir examines the mirror; Mismagius finds no illusion; Gengar can't find a joke. You are
 *     told to leave. On the way out the house goes completely still, and for a moment the mirror at
 *     the far end of the hall shows something vast.
 *  6. Somewhere else entirely, something watches a distorted reflection of you. "How... peculiar."
 *
 * Pokémon speak in proper dialogue, Mystery Dungeon style: a box with a portrait, a name and a
 * voice. It is never named, never fought, never caught. Progress is saved; every scene you've seen
 * can be replayed from the settings panel (F7).
 */
(function () {
  'use strict';
  const AI = window.PSXAI;
  const U = AI.U;
  const M = () => AI.Mansion;
  const H = () => AI.Haunt;

  // ---------------------------------------------------------------- the cast
  const CAST = {
    gengar: { dex: 94, name: 'Gengar', voice: 230, col: '#a77be0' },
    haunter: { dex: 93, name: 'Haunter', voice: 340, col: '#9c6ad6' },
    gastly: { dex: 92, name: 'Gastly', voice: 410, col: '#8a62c8' },
    dusknoir: { dex: 477, name: 'Dusknoir', voice: 140, col: '#8e8aa6' },
    duskull: { dex: 355, name: 'Duskull', voice: 480, col: '#b8b0c8' },
    misdreavus: { dex: 200, name: 'Misdreavus', voice: 580, col: '#5fa8b8' },
    mismagius: { dex: 429, name: 'Mismagius', voice: 470, col: '#a35ac0' },
    honedge: { dex: 679, name: 'Honedge', voice: 390, col: '#b8a888' },
    doublade: { dex: 680, name: 'Doublade', voice: 300, col: '#b8a888' },
    aegislash: { dex: 681, name: 'Aegislash', voice: 170, col: '#d8c488' },
    wick: { dex: 607, name: 'Litwick', nick: 'Wick', voice: 620, col: '#c8c0f0' },
    flicker: { dex: 607, name: 'Litwick', nick: 'Flicker', voice: 700, col: '#c8c0f0' },
    ember: { dex: 607, name: 'Litwick', nick: 'Ember', voice: 540, col: '#c8c0f0' },
    chandelure: { dex: 609, name: 'Chandelure', voice: 260, col: '#9a7af0' },
  };
  // where everyone gathers in the ballroom (tile coordinates), and how high they float
  const PLACES = {
    gengar: [23.5, 11.2, 4], haunter: [21.4, 10.6, 14], gastly: [25.6, 10.4, 16], dusknoir: [23.5, 8.6, 10], duskull: [21.6, 8.9, 12],
    misdreavus: [19.6, 11.6, 14], mismagius: [18.6, 9.6, 12], honedge: [27.5, 11.8, 8], doublade: [28.6, 10.2, 10], aegislash: [29.2, 8.4, 2],
    wick: [20.6, 13.4, 0], flicker: [22.6, 13.8, 0], ember: [25.2, 13.6, 0], chandelure: [23.5, 9.4, 46],
  };

  // ---------------------------------------------------------------- words
  function lang() { return AI.lang ? AI.lang() : 'en'; }
  function tr(v) { if (v == null) return ''; if (typeof v === 'function') v = v(); if (typeof v === 'string') return v; return v[lang()] || v.en; }
  const T = (en, es) => ({ en, es });
  const did = (k) => H() && H().happened(k);

  const SCENES = {
    arrival: {
      title: T('Arrival', 'La llegada'),
      steps: [
        { wait: 0.9 },
        { who: 'player', text: T('Hello…? Is anyone home?', '¿Hola…? ¿Hay alguien en casa?') },
        { wait: 1.3 },
        { act: 'slam' },
        { wait: 0.6 },
        { who: 'player', emote: '!', text: T('!!', '¡¡!!') },
        { who: 'player', text: T('…It was just the wind. Old houses are drafty. That\'s all it was.', '…Solo ha sido el viento. Las casas viejas tienen corrientes. Nada más.') },
        { who: 'player', text: T('(It\'s so quiet in here. Too quiet.)', '(Qué silencio hay aquí dentro. Demasiado.)') },
      ],
    },
    mirror: {
      title: T('The mirror', 'El espejo'),
      steps: [
        { wait: 0.4 },
        { who: 'player', text: T('…', '…') },
        { who: 'player', text: T('There was something behind me. Something huge.', 'Había algo detrás de mí. Algo enorme.') },
        { who: 'player', text: T('I turned around and… nothing. Nothing at all.', 'Me di la vuelta y… nada. Absolutamente nada.') },
        { who: 'player', text: T('(My heart is pounding so hard I can hear it.)', '(El corazón me late tan fuerte que lo oigo.)') },
      ],
    },
    laughter: {
      title: T('Laughter', 'Risas'),
      steps: [
        { act: 'laughter' },
        { wait: 1.6 },
        { who: 'player', emote: '?', text: T('…Laughter? From behind the locked door…?', '…¿Risas? ¿Detrás de la puerta cerrada…?') },
        { act: 'unlock' },
      ],
    },
    reveal: {
      title: T('The pranksters', 'Los bromistas'),
      steps: [
        { act: 'gather' },
        { cam: 'ballroom' },
        { who: 'haunter', act: 'bounce:haunter', text: T('And THEN the door goes BAM! And the little guy jumps THIS high! HAHAHA!', '¡Y ENTONCES la puerta hace PUM! ¡Y el pequeñín salta ASÍ de alto! ¡JAJAJA!') },
        { who: 'gastly', text: T('A masterpiece of terror! The timing! The acoustics!', '¡Una obra maestra del terror! ¡Qué sincronía! ¡Qué acústica!') },
        { who: 'misdreavus', text: T('Um… guys?', 'Eh… ¿chicos?') },
        { who: 'gengar', text: T('What? I\'m basking.', '¿Qué? Estoy disfrutando del momento.') },
        { who: 'misdreavus', text: T('They\'re standing right there.', 'Está justo ahí.') },
        { act: 'turnAll' },
        { wait: 1.1 },
        { who: 'gengar', emote: '!', text: T('…Oh. Heeey. You found the party.', '…Oh. Holaaa. Has encontrado la fiesta.') },
        { who: 'player', emote: '!', text: T('You\'re… Pokémon? All of this was YOU?', '¿Sois… Pokémon? ¿Todo esto lo habéis hecho VOSOTROS?') },
        { who: 'gengar', text: T('Guilty! Welcome to the finest haunted house in the whole forest. Five stars. Would scare again.', '¡Culpable! Bienvenido a la mejor casa encantada de todo el bosque. Cinco estrellas. Volvería a asustar.') },
        { who: 'aegislash', text: T('*Ahem.* What my colleague means is: welcome. We receive very few guests.', '*Ejem.* Lo que mi colega quiere decir es: bienvenido. Recibimos muy pocos invitados.') },
        { who: 'gengar', text: T('Because we scare them all off! That\'s the whole point, Aegislash!', '¡Porque los espantamos a todos! ¡Esa es la gracia, Aegislash!') },
        { who: 'aegislash', text: T('Hmph.', 'Hmpf.') },
        { who: 'player', text: T('So the knocking, the footsteps, the doors…', 'Entonces los golpes, los pasos, las puertas…') },
        { who: 'haunter', act: 'bounce:haunter', text: () => (did('door') ? T('Doors were ME! Open, slam, open, SLAM! HAHA! You should\'ve seen your face!', '¡Las puertas fui YO! ¡Abrir, portazo, abrir, PORTAZO! ¡JAJA! ¡Tendrías que haberte visto la cara!') : T('The doors were ME! Well, the front one. BAM! HAHA! You should\'ve seen your face!', '¡Las puertas fui YO! Bueno, la de la entrada. ¡PUM! ¡JAJA! ¡Tendrías que haberte visto la cara!')) },
        { who: 'haunter', text: () => (did('steps') ? T('And the footsteps? Me too! I don\'t even HAVE feet! HAHAHA!', '¿Y los pasos? ¡También yo! ¡Si ni siquiera TENGO pies! ¡JAJAJA!') : T('I had footsteps planned too! I don\'t even HAVE feet! HAHAHA!', '¡También tenía preparados unos pasos! ¡Si ni siquiera TENGO pies! ¡JAJAJA!')) },
        { who: 'dusknoir', text: () => (did('bang') ? T('The banging overhead was mine. I find a heavy hand… lends a certain gravitas.', 'Los golpes del piso de arriba fueron cosa mía. Una mano pesada… aporta cierta solemnidad.') : T('I was to provide the banging upstairs. A heavy hand… lends a certain gravitas.', 'A mí me tocaban los golpes del piso de arriba. Una mano pesada… aporta cierta solemnidad.')) },
        { who: 'gastly', text: T('The whispers! All mine! "Behiiind youuu…" I\'ve been practising for a century!', '¡Los susurros! ¡Todos míos! «Detrááás de tiii…» ¡Llevo un siglo ensayando!') },
        { who: 'misdreavus', act: 'bounce:misdreavus', text: T('Ooh, ooh! Did you like the portraits? I made the lady grin at you! Did you scream? Tell me you screamed!', '¡Uy, uy! ¿Te gustaron los retratos? ¡Hice que la señora te sonriera! ¿Gritaste? ¡Dime que gritaste!') },
        { who: 'player', text: T('I… might have yelped.', 'Puede que… se me escapara un gritito.') },
        { who: 'misdreavus', emote: '♪', text: T('YES!', '¡SÍ!') },
        { who: 'mismagius', text: T('The portraits did not change, little one. Your eyes did. I merely… suggested.', 'Los retratos no cambiaron, pequeño. Cambiaron tus ojos. Yo solo… lo sugerí.') },
        { who: 'player', emote: '?', text: T('…What does that even mean?', '…¿Y eso qué significa?') },
        { who: 'mismagius', text: T('Exactly what you fear it means.', 'Exactamente lo que temes que signifique.') },
        { who: 'honedge', act: 'bounce:honedge', text: T('I-I rattled the armour! Did you see, Aegislash? Did you see me?', '¡Y-yo hice temblar la armadura! ¿Lo viste, Aegislash? ¿Me viste?') },
        { who: 'aegislash', text: T('I saw. Your form was… adequate.', 'Lo vi. Tu técnica fue… aceptable.') },
        { who: 'honedge', emote: '♪', text: T('He said adequate!', '¡Ha dicho aceptable!') },
        { who: 'doublade', text: T('We moved the chairs. When you weren\'t looking.', 'Nosotros movimos las sillas. Cuando no mirabas.') },
        { who: 'doublade', text: T('…Both of us. Together. Like always.', '…Los dos. Juntos. Como siempre.') },
        { act: 'chandelure' },
        { wait: 0.8 },
        { who: 'chandelure', text: T('And every flame you saw dance, flicker, die and rise again… was mine.', 'Y cada llama que viste bailar, titilar, morir y volver a nacer… era mía.') },
        { who: 'chandelure', text: T('Lighting is everything, darling. Without me, they\'re just Pokémon making noises in the dark.', 'La iluminación lo es todo, querido. Sin mí, solo son Pokémon haciendo ruiditos en la oscuridad.') },
        { who: 'haunter', emote: '!', text: T('HEY!', '¡OYE!') },
        { who: 'wick', text: T('…We carried the candles around. Sorry if we scared you.', '…Nosotras llevábamos las velas de un lado a otro. Perdona si te asustamos.') },
        { who: 'flicker', act: 'bounce:flicker', text: T('Tee-hee! I blew out your candles! Twice! Tee-hee!', '¡Ji, ji! ¡Te apagué las velas! ¡Dos veces! ¡Ji, ji!') },
        { who: 'ember', text: T('I mostly stood in a corner and glowed. It\'s a living.', 'Yo básicamente me quedé en un rincón brillando. Hay que ganarse la vida.') },
        { who: 'duskull', text: T('…I followed you down the hall.', '…Te seguí por el pasillo.') },
        { who: 'player', emote: '!', text: T('That WAS you! You kept disappearing!', '¡ERAS tú! ¡No parabas de desaparecer!') },
        { who: 'duskull', text: T('…I\'m shy.', '…Es que soy tímido.') },
        { who: 'dusknoir', text: T('Forgive us. This house sees so few visitors, and we have rehearsed for so long. It would have been a shame not to perform.', 'Perdónanos. Esta casa recibe tan pocas visitas, y llevábamos tanto tiempo ensayando… Habría sido una pena no actuar.') },
        { who: 'gengar', text: T('So? Admit it. Best scare of your life.', '¿Y bien? Admítelo. El mejor susto de tu vida.') },
      ],
    },
    twist: {
      title: T('What shadow figure?', '¿Qué figura?'),
      steps: [
        { who: 'player', text: T('Okay, I get it. You were the ones making all those noises.', 'Vale, lo pillo. Erais vosotros los que hacíais todos esos ruidos.') },
        { who: 'gengar', text: T('Guilty! You should\'ve seen your face when that door slammed!', '¡Culpable! ¡Tendrías que haberte visto la cara cuando cerramos la puerta de golpe!') },
        { who: 'haunter', text: T('HAHA! And the footsteps upstairs? That was me!', '¡JAJA! ¿Y los pasos del piso de arriba? ¡Era yo!') },
        { who: 'dusknoir', text: T('I must admit, our little performance was rather entertaining.', 'He de admitir que nuestra pequeña función ha sido bastante entretenida.') },
        { who: 'player', text: T('Well, you definitely got me. Especially with that really tall shadow figure.', 'Bueno, desde luego me la habéis colado. Sobre todo con esa figura de sombra tan alta.') },
        { wait: 0.7 },
        { who: 'gengar', act: 'freezeAll', text: T('…What shadow figure?', '…¿Qué figura de sombra?') },
        { who: 'player', text: T('The one in the mirror. I saw it standing behind me.', 'La del espejo. La vi de pie detrás de mí.') },
        { who: 'haunter', emote: '?', text: T('Huh? I wasn\'t doing anything with mirrors.', '¿Eh? Yo no he hecho nada con espejos.') },
        { who: 'player', text: T('It was enormous. Really tall. It just stood there, staring at me.', 'Era enorme. Altísima. Solo estaba ahí, mirándome fijamente.') },
        { who: 'dusknoir', text: T('How fascinating. I don\'t recall arranging anything of that nature.', 'Qué fascinante. No recuerdo haber preparado nada parecido.') },
        { who: 'player', text: T('Come on. That was one of your tricks, wasn\'t it?', 'Venga ya. Era uno de vuestros trucos, ¿verdad?') },
        { act: 'silence' },
        { narr: T('(Silence.)', '(Silencio.)') },
        { who: 'mismagius', text: T('…No.', '…No.') },
        { who: 'gengar', text: T('Hold on. You\'re joking, right?', 'Espera. Estás de broma, ¿no?') },
        { who: 'player', text: T('I\'m serious. When I looked into the mirror, I saw it standing directly behind me.', 'Lo digo en serio. Cuando me miré en el espejo, la vi justo detrás de mí.') },
        { act: 'glances' },
        { narr: T('(The Ghost Pokémon exchange uneasy glances.)', '(Los Pokémon fantasma intercambian miradas inquietas.)') },
        { who: 'dusknoir', text: T('…Describe precisely what you saw.', '…Describe con precisión lo que viste.') },
        { who: 'player', text: T('It was so tall it didn\'t fit in the glass. Like a shadow with wings. And eyes. Red eyes.', 'Era tan alta que no cabía en el espejo. Como una sombra con alas. Y ojos. Ojos rojos.') },
        { who: 'flicker', text: T('…That\'s not funny anymore.', '…Eso ya no tiene gracia.') },
        { who: 'misdreavus', text: T('Gengar, tell them it was you. Please tell them it was you.', 'Gengar, dile que fuiste tú. Por favor, dile que fuiste tú.') },
        { who: 'gengar', text: T('…It wasn\'t me.', '…No fui yo.') },
        { who: 'aegislash', text: T('Nor I. None of us touches that mirror. It was here long before any of us.', 'Ni yo. Ninguno de nosotros toca ese espejo. Estaba aquí mucho antes que todos nosotros.') },
        { who: 'chandelure', text: T('…My flames stopped moving just now. Did anyone else notice? I did not do that.', '…Mis llamas se han quedado quietas hace un momento. ¿Alguien más lo ha notado? Yo no he sido.') },
        { act: 'unsilence' },
        { who: 'dusknoir', text: T('Show me the mirror.', 'Llévame hasta el espejo.') },
      ],
    },
    investigate: {
      title: T('The glass is cold', 'El cristal está frío'),
      steps: [
        { act: 'toMirror' },
        { wait: 0.6 },
        { cam: 'mirror' },
        { narr: T('(Dusknoir drifts up to the old mirror and studies it for a long moment.)', '(Dusknoir flota hasta el viejo espejo y lo examina durante un largo rato.)') },
        { who: 'dusknoir', text: T('…Nothing. The glass is cold. Old. Ordinary.', '…Nada. El cristal está frío. Viejo. Normal.') },
        { who: 'mismagius', text: T('No illusion clings to it. No trace of any spell I know.', 'No hay ninguna ilusión en él. Ni rastro de ningún hechizo que yo conozca.') },
        { who: 'mismagius', text: T('…And I know all of them.', '…Y los conozco todos.') },
        { who: 'gengar', text: T('Heh. Maybe it was just, uh… your own reflection having a bad day? …Heh.', 'Je. A lo mejor era, eh… ¿tu propio reflejo teniendo un mal día? …Je.') },
        { narr: T('(Nobody laughs.)', '(Nadie se ríe.)') },
        { who: 'gengar', text: T('…Yeah. I got nothing.', '…Ya. No se me ocurre nada.') },
        { who: 'duskull', text: T('…Something was looking at us. I could feel it.', '…Algo nos estaba mirando. Lo noté.') },
        { cam: null },
        { who: 'dusknoir', text: T('Little one. I think it would be wise for you to leave this house. For now.', 'Pequeño. Creo que sería prudente que salieras de esta casa. Por ahora.') },
        { who: 'dusknoir', text: T('Whatever stood behind you in that glass, it was not one of us. And I fear it came here for you.', 'Lo que estaba detrás de ti en ese cristal no era uno de nosotros. Y me temo que vino por ti.') },
        { who: 'player', emote: '?', text: T('For… me?', '¿Por… mí?') },
        { who: 'dusknoir', text: T('Go. We will keep watch. We have nowhere else to haunt, after all.', 'Vete. Nosotros vigilaremos. Al fin y al cabo, no tenemos otro sitio que encantar.') },
        { who: 'aegislash', text: T('Go quickly. And do not look back at the glass.', 'Vete rápido. Y no vuelvas la vista hacia el cristal.') },
        { act: 'release' },
      ],
    },
    leaving: {
      title: T('Something impossible', 'Algo imposible'),
      steps: [
        { act: 'hush' },
        { wait: 1.6 },
        { act: 'lookBack' },
        { cam: 'mirror' },
        { wait: 0.7 },
        { act: 'vast' },
        { wait: 1.4 },
        { cam: null },
        { wait: 0.8 },
        { act: 'afterHush' },
      ],
    },
    aftermath: {
      title: T('How… peculiar', 'Qué… peculiar'),
      steps: [
        { act: 'black' },
        { wait: 1.2 },
        { narr: T('(Inside the mansion, the Ghost Pokémon remain unusually quiet.)', '(Dentro de la mansión, los Pokémon fantasma siguen inusualmente callados.)') },
        { narr: T('(Nobody knows what was watching them.)', '(Nadie sabe qué los estaba observando.)') },
        { act: 'distortion' },
        { until: () => !st.cine },
      ],
    },
  };
  const JOURNAL = ['arrival', 'mirror', 'reveal', 'twist', 'investigate', 'aftermath'];
  // later visits: the residents chat (speech bubbles, not scenes)
  const CHAT = {
    before: [T('Back again? Brave. Or dumb. …Respect.', '¿Otra vez por aquí? Valiente. O tonto. …Respeto.'), T('Watch the third step. It bites. HAHA!', '¡Cuidado con el tercer escalón, que muerde! ¡JAJA!'), T('I\'ve been working on a new scream. Wanna hear it?', 'Estoy ensayando un grito nuevo. ¿Quieres oírlo?')],
    after: [T('The glass has been quiet. Too quiet.', 'El cristal ha estado tranquilo. Demasiado.'), T('Nobody goes near the mirror anymore.', 'Ya nadie se acerca al espejo.'), T('…Do you feel watched too?', '…¿Tú también te sientes observado?'), T('I tried to scare a Rattata yesterday. My heart wasn\'t in it.', 'Ayer intenté asustar a un Rattata. No le puse ganas.'), T('If it comes back, I\'m hiding in the chandelier.', 'Si vuelve, me escondo en la lámpara.'), T('We keep watch, like Dusknoir said.', 'Seguimos vigilando, como dijo Dusknoir.')],
  };

  // ---------------------------------------------------------------- saved progress
  const KEY = 'psx_mansion_story_v1';
  const STAGES = ['unvisited', 'exploring', 'mirror', 'unlocked', 'revealed', 'warned', 'done'];
  let save = { stage: 0, seen: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s.stage === 'number') save = s; } catch (e) { /* private window */ }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
  function stage() { return save.stage; }
  function setStage(n) { if (n > save.stage) { save.stage = n; persist(); AI.Bus.emit({ type: 'mansion', what: 'stage', stage: STAGES[n], x: 0, y: 0, loud: 0 }); } }

  // ---------------------------------------------------------------- state
  const st = {
    scene: null, line: null, cam: null, actors: [], cine: null, cineT: 0, replay: false,
    visit: 0, leftHall: false, leaving: false, chatT: 6, bubbles: [], exitArmed: false,
  };
  function busy() { return !!(st.scene || st.cine); }
  function lockInput() { return busy() || (H() && H().hs.mirror.phase !== 'idle' && H().hs.mirror.phase !== 'look'); }

  // ---------------------------------------------------------------- actors
  const anims = new Map();
  function animFor(dex) { let a = anims.get(dex); if (!a) { a = new AI.R.Sprites.Animator(dex, 1, false); a.loop('Idle'); anims.set(dex, a); } return a; }
  function actorOf(id) { return st.actors.find((a) => a.id === id); }
  function spawnActor(id, x, y) {
    let a = actorOf(id);
    const c = CAST[id];
    if (!a) {
      a = { id, dex: c.dex, x, y, tx: x, ty: y, lift: (PLACES[id] || [0, 0, 8])[2], face: Math.PI / 2, alpha: 0, show: 1, emote: null, emoteT: 0, hop: 0, anim: new AI.R.Sprites.Animator(c.dex, 1, false), frozen: false, bob: Math.random() * 6 };
      a.anim.loop('Idle');
      st.actors.push(a);
    }
    a.x = a.tx = x; a.y = a.ty = y; a.show = 1;
    return a;
  }
  function placeAtBallroom() {
    const it = M().interior();
    for (const id of Object.keys(CAST)) {
      const [tx, ty] = PLACES[id];
      spawnActor(id, it.wx(tx), it.wy(ty));
    }
  }
  function tickActors(dt) {
    const p = AI.R.Game.player;
    for (const a of st.actors) {
      a.alpha += ((a.show ? 1 : 0) - a.alpha) * Math.min(1, dt * 3);
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      const moving = d > 2;
      if (moving) { const sp = Math.min(d, (a.speed || 110) * dt); a.x += dx / d * sp; a.y += dy / d * sp; a.face = Math.atan2(dy, dx); }
      else if (a.lookAt) a.face = Math.atan2(a.lookAt.y - a.y, a.lookAt.x - a.x);
      if (!a.frozen) { a.anim.loop(moving ? 'Walk' : 'Idle'); try { a.anim.update && a.anim.update(dt); } catch (e) { /* ignore */ } }
      a.anim.dir = AI.R.Sprites.dirFromAngle(a.face);
      if (a.hop > 0) a.hop = Math.max(0, a.hop - dt * 2.5);
      if (a.emoteT > 0) a.emoteT -= dt;
      // the Litwick wander a little when nothing's happening
      if ((a.id === 'wick' || a.id === 'flicker' || a.id === 'ember') && !busy() && !moving && Math.random() < dt * 0.25 && !a.frozen) {
        const it = M().st.built;
        const [hx, hy] = PLACES[a.id];
        a.tx = it.wx(hx) + U.rand(-50, 50); a.ty = it.wy(hy) + U.rand(-30, 30);
      }
      void p;
    }
  }
  function drawActor(ctx, a) {
    if (a.alpha < 0.02) return;
    const c = CAST[a.id];
    const bob = a.frozen ? 0 : Math.sin(AI.time * 2 + a.bob) * (a.lift > 3 ? 3 : 0.6);
    const hop = Math.sin(a.hop * Math.PI) * 10;
    const y = a.y - a.lift - bob - hop;
    // a soft shadow on the floor
    ctx.save();
    ctx.globalAlpha = a.alpha * 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(a.x, a.y, 14, 5, 0, 0, 6.283); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a.alpha * (a.ghostly ? 0.6 : 1);
    try { a.anim.draw(ctx, a.x, y, { alpha: 1 }); } catch (e) { /* ignore */ }
    ctx.restore();
    if (a.emoteT > 0 && a.emote) {
      ctx.save();
      ctx.font = '700 14px Pixelify, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1a1424'; ctx.lineWidth = 3;
      const top = y - 64;
      ctx.strokeText(a.emote, a.x, top); ctx.fillText(a.emote, a.x, top);
      ctx.restore();
    }
    void c;
  }
  function drawables() {
    const out = [];
    for (const a of st.actors) {
      if (a.alpha < 0.02) continue;
      out.push(a._pr || (a._pr = { psxDraw: (ctx) => drawActor(ctx, a), get x() { return a.x; }, get y() { return a.y + (a.id === 'chandelure' ? 40 : 0); }, flat: false, type: 'psx-m', tx: 0, ty: 0, r: 0 }));
    }
    return out;
  }
  function lights(out) {
    for (const a of st.actors) {
      if (a.alpha < 0.2) continue;
      const lit = st.hush ? 0.25 + Math.random() * 0.5 : 1;
      if (a.dex === 607) out.push({ x: a.x, y: a.y - 24, r: 70, c: [170, 140, 255], i: 0.75 * a.alpha * lit });
      else if (a.dex === 609) out.push({ x: a.x, y: a.y - a.lift - 20, r: 210, c: [160, 120, 255], i: (st.chanDim || 1) * a.alpha * lit });
      else out.push({ x: a.x, y: a.y - a.lift - 16, r: 48, c: [170, 130, 230], i: 0.35 * a.alpha });
    }
    if (stage() === 3 && M().st.built) { const it = M().st.built; out.push({ x: it.wx(32.6), y: it.wy(10), r: 120, c: [255, 190, 120], i: 0.8 }); }
  }

  // ---------------------------------------------------------------- scene actions
  const ACTS = {
    slam() {
      if (M()) M().sfx('slam', 0, 0);
      try { AI.R.Camera.kick(0.5); } catch (e) { /* ignore */ }
    },
    laughter() {
      const it = M().st.built;
      if (!it) return;
      M().sfx('laugh', it.wx(31.5), it.wy(9.5), 420);
      setTimeout(() => M().sfx('laugh', it.wx(31.5), it.wy(9.5), 300), 700);
      setTimeout(() => M().sfx('laugh', it.wx(31.5), it.wy(9.5), 560), 1200);
    },
    unlock() {
      const it = M().st.built;
      const d = it.doors.find((q) => q.id === 'ballroom');
      if (d) { d.locked = false; M().openDoor(d, true); }
      setStage(3);
    },
    gather() {
      placeAtBallroom();
      const p = AI.R.Game.player;
      for (const a of st.actors) { a.lookAt = actorOf('haunter'); a.alpha = 1; }
      const h = actorOf('haunter'); h.lookAt = actorOf('gengar');
      // the chandelier was Chandelure all along (not yet)
      actorOf('chandelure').show = 0; actorOf('chandelure').alpha = 0;
      M().sfx('laugh', h.x, h.y, 380);
      void p;
    },
    turnAll() { const p = AI.R.Game.player; for (const a of st.actors) { a.lookAt = p; a.emote = '!'; a.emoteT = 1.2; } M().sfx('step', 0, 0); },
    chandelure() {
      const it = M().st.built;
      const ch = it.chandeliers.find((c) => c.id === 'ballroom');
      if (ch) ch.hidden = true;
      const c = actorOf('chandelure');
      c.show = 1; c.lookAt = AI.R.Game.player;
      M().sfx('ignite', c.x, c.y); M().sfx('chandelier', c.x, c.y);
      for (const q of it.props) if (q.room === 'ballroom' && q.kind === 'candles') q.lit = true;
    },
    freezeAll() { for (const a of st.actors) a.frozen = true; },
    silence() { if (H()) H().stillness(30); for (const a of st.actors) a.frozen = true; st.chanDim = 0.6; },
    glances() {
      // they look at each other, not at you
      const list = st.actors.filter((a) => a.id !== 'chandelure');
      for (const a of list) { const o = U.pick(list.filter((b) => b !== a)); a.lookAt = o; }
    },
    unsilence() { if (H()) H().endStillness(); for (const a of st.actors) { a.frozen = false; a.lookAt = AI.R.Game.player; } st.chanDim = 1; },
    toMirror() {
      // everyone moves to the end of the hall; you're already there
      const it = M().st.built;
      const mi = it.mirror;
      const p = AI.R.Game.player;
      // the hall is narrow: the others crowd the ballroom and study doorways
      const bx = it.wx(31.6), by = it.wy(10), sx2 = it.wx(37.2), sy2 = it.wy(17);
      const spots = {
        dusknoir: [mi.x, mi.y + 40], mismagius: [mi.x - 32, mi.y + 84], gengar: [mi.x + 32, mi.y + 110], duskull: [mi.x + 30, mi.y + 64],
        haunter: [bx + 10, by - 26], misdreavus: [bx - 20, by + 22], gastly: [bx - 34, by - 18], chandelure: [bx - 70, by + 8],
        aegislash: [mi.x - 34, mi.y + 250], honedge: [mi.x - 30, mi.y + 290], doublade: [mi.x + 34, mi.y + 270],
        wick: [sx2, sy2 - 14], flicker: [sx2 + 26, sy2 + 8], ember: [sx2 + 6, sy2 + 30],
      };
      for (const a of st.actors) { const s = spots[a.id]; if (!s) continue; a.x = a.tx = s[0]; a.y = a.ty = s[1]; a.lookAt = a.id === 'dusknoir' ? { x: mi.x, y: mi.y - 60 } : mi; a.frozen = false; }
      p.x = mi.x; p.y = mi.y + 190; p.x += 0;
      M().snapCamera(p);
      if (actorOf('dusknoir')) { actorOf('dusknoir').ty = mi.y + 26; }
    },
    release() {
      setStage(5);
      const dn = actorOf('dusknoir'), it = M().st.built;
      if (dn && it) { dn.tx = it.mirror.x + 34; dn.ty = it.mirror.y + 70; } // it steps away from the glass, keeping watch
      for (const a of st.actors) a.lookAt = AI.R.Game.player;
      st.exitArmed = true;
    },
    hush() {
      // the whole house goes still
      if (H()) H().stillness(60, true);
      st.hush = true;
      st.chanDim = 0.15;
      const it = M().st.built;
      for (const c of it.chandeliers) c.lit = Math.min(c.lit, 0.08);
      for (const a of st.actors) a.frozen = true;
    },
    lookBack() { const p = AI.R.Game.player; if (p.anim) p.anim.dir = 4; },
    vast() { if (H()) H().mirrorGlimpse(1.3); if (M()) M().sfx('boom', 0, 0); },
    afterHush() { st.leaving = true; },
    distortion() { st.cine = 'distortion'; st.cineT = 0; if (M()) M().sfx('drone', 0, 0, 0.9); },
    black() { if (M()) M().fadeTo(1, null, 1.4); },
  };
  function runAct(name) {
    if (st.replay && !['distortion', 'slam', 'laughter'].includes(name)) return;
    if (name.startsWith('bounce:')) { const a = actorOf(name.slice(7)); if (a) a.hop = 1; return; }
    const f = ACTS[name];
    if (f) try { f(); } catch (e) { AI.warn('story-act', e); }
  }

  // ---------------------------------------------------------------- the scene runner
  function play(id, opts) {
    const sc = SCENES[id];
    if (!sc) return false;
    st.scene = { id, steps: sc.steps, i: -1, t: 0 };
    st.replay = !!(opts && opts.replay);
    st.line = null;
    if (!st.replay) { save.seen[id] = true; persist(); }
    next();
    return true;
  }
  function next() {
    const sc = st.scene;
    if (!sc) return;
    for (;;) {
      sc.i++;
      sc.t = 0;
      st.line = null;
      if (sc.i >= sc.steps.length) { const id = sc.id; st.scene = null; st.cam = null; onSceneEnd(id); return; }
      const s = sc.steps[sc.i];
      if (s.act) runAct(s.act);
      if (s.cam !== undefined && !st.replay) setCam(s.cam);
      if (s.who || s.narr) {
        const text = tr(s.who ? s.text : s.narr);
        st.line = { who: s.who || null, text, shown: 0, done: false, t: 0 };
        if (s.emote && s.who !== 'player') { const a = actorOf(s.who); if (a) { a.emote = s.emote; a.emoteT = 1.4; } }
        if (s.emote && s.who === 'player') { AI.playerBubble.icon = s.emote === '!' ? 'surprise' : s.emote === '?' ? 'question' : 'happy'; AI.playerBubble.t = 1.6; }
        if (s.who && s.who !== 'player') { const a = actorOf(s.who); if (a) { a.hop = Math.max(a.hop, 0.4); a.lookAt = AI.R.Game.player; } }
        return;
      }
      if (s.wait || s.until) return;
    }
  }
  function setCam(c) {
    if (c == null) { st.cam = null; return; }
    const it = M() && M().st.built;
    if (!it) return;
    if (c === 'ballroom') st.cam = [it.wx(23.5), it.wy(11)];
    else if (c === 'mirror') st.cam = [it.mirror.x, it.mirror.y - 40];
    else st.cam = c;
  }
  function advance() {
    const L = st.line;
    if (!L) return;
    if (!L.done) { L.shown = L.text.length; L.done = true; return; }
    next();
  }
  function skipScene() { let n = 0; while (st.scene && n++ < 400) { if (st.line) { st.line.done = true; } next(); } if (st.cine) st.cineT = 99; }
  function onSceneEnd(id) {
    if (st.replay) { st.replay = false; return; }
    if (id === 'mirror') { st.laughAt = AI.time + 4; }
    if (id === 'reveal') { setStage(4); setTimeout(() => { if (!st.scene) play('twist'); }, 400); }
    if (id === 'twist') setTimeout(() => { if (!st.scene) play('investigate'); }, 600);
    if (id === 'aftermath') {
      setStage(6);
      st.leaving = false;
      if (H()) H().endStillness();
      M().exit();
    }
  }

  // ---------------------------------------------------------------- the flow
  AI.Bus.on('mansion', (ev) => {
    if (ev.what === 'enter') onEnter();
    if (ev.what === 'exit') onExit();
  });
  function onEnter() {
    st.visit++;
    st.actors.length = 0;
    st.hush = false; st.chanDim = 1; st.leaving = false; st.exitArmed = stage() === 5;
    const it = M().interior();
    const d = it.doors.find((q) => q.id === 'ballroom');
    if (d) { d.locked = stage() < 3; d.open = stage() >= 3; }
    if (stage() === 0) { setStage(1); setTimeout(() => { if (M().inside && !st.scene) play('arrival'); }, 900); return; }
    if (stage() === 2) st.laughAt = AI.time + 5;
    // residents, once you know them
    if (stage() >= 4) {
      placeAtBallroom();
      for (const a of st.actors) a.lookAt = AI.R.Game.player;
      const ch = it.chandeliers.find((c) => c.id === 'ballroom');
      if (ch) ch.hidden = true;
      if (stage() === 5) { st.exitArmed = true; } // you were told to leave
    }
  }
  function onExit() { st.cam = null; st.bubbles.length = 0; }
  function onMirror() { setStage(2); play('mirror'); }

  function tick(dt) {
    if (!AI.enabled) return;
    const R = AI.R;
    const p = R.Game.player;
    if (!p) return;
    // keep you safe while a scene plays
    if (busy() && p.invuln != null) p.invuln = Math.max(p.invuln, 0.3);
    // the typewriter
    const L = st.line;
    if (L && !L.done) {
      L.t += dt;
      const n = Math.min(L.text.length, Math.floor(L.t * 42));
      if (n > L.shown) {
        if ((n >> 1) !== (L.shown >> 1) && L.who) { const c = CAST[L.who]; M().sfx('blip', 0, 0, (c ? c.voice : 520) * U.rand(0.95, 1.05)); }
        L.shown = n;
      }
      if (L.shown >= L.text.length) L.done = true;
    }
    if (st.scene && !st.line) {
      const s = st.scene.steps[st.scene.i];
      st.scene.t += dt;
      if (s && s.wait && st.scene.t >= s.wait) next();
      else if (s && s.until && s.until()) next();
    }
    if (st.cine) { st.cineT += dt; if (st.cineT > 11.5) { st.cine = null; if (M()) M().sfx('drone', 0, 0, 0); } }
    if (!M() || !M().inside) return;
    tickActors(dt);
    const it = M().st.built;
    if (!it) return;
    // laughter behind the locked door, some time after the mirror
    if (stage() === 2 && st.laughAt && AI.time > st.laughAt && !st.scene) { st.laughAt = 0; play('laughter'); }
    // walking into the ballroom: you catch them
    if (stage() === 3 && !st.scene && M().roomAt(p.x, p.y) === 'ballroom' && p.y < it.wy(14.5)) play('reveal');
    // told to leave: on your way down the hall, the house goes still and the mirror shows something
    if (stage() === 5 && st.exitArmed && !st.scene && !st.leaving) {
      if ((M().roomAt(p.x, p.y) === 'hall' && p.y > it.mirror.y + 380) || M().roomAt(p.x, p.y) === 'foyer') { st.exitArmed = false; play('leaving'); }
    }
    // chatter from the residents
    if (stage() >= 4 && !busy()) {
      st.chatT -= dt;
      if (st.chatT <= 0) {
        st.chatT = U.rand(7, 13);
        const near = st.actors.filter((a) => a.alpha > 0.5 && Math.hypot(a.x - p.x, a.y - p.y) < 260);
        if (near.length) { const a = U.pick(near); st.bubbles.push({ a, text: tr(U.pick(stage() >= 6 ? CHAT.after : CHAT.before)), t: 0 }); }
      }
    }
    for (let i = st.bubbles.length - 1; i >= 0; i--) { st.bubbles[i].t += dt; if (st.bubbles[i].t > 4.5) st.bubbles.splice(i, 1); }
  }
  function blockExit() {
    if (busy()) return true;
    if (stage() === 5 && st.exitArmed) { st.exitArmed = false; play('leaving'); return true; }
    if (st.leaving) { st.leaving = false; play('aftermath'); return true; }
    return false;
  }
  function blockEntry() { return busy(); }

  // ---------------------------------------------------------------- input (advance the dialogue)
  addEventListener('keydown', (ev) => {
    if (!st.line || !AI.enabled) return;
    if (['Space', 'Enter', 'KeyE', 'KeyZ', 'KeyX', 'NumpadEnter'].includes(ev.code)) { ev.preventDefault(); ev.stopImmediatePropagation(); if (!ev.repeat) advance(); }
  }, true);
  addEventListener('pointerdown', (ev) => {
    if (!st.line || !AI.enabled) return;
    if (ev.target && ev.target.closest && ev.target.closest('#psx-ai-panel')) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    advance();
  }, true);

  // ---------------------------------------------------------------- drawing: dialogue (Mystery Dungeon style)
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
  const portraitAnim = new Map();
  function drawDialogue(ctx, w, h) {
    const L = st.line;
    if (!L) return;
    const bw = Math.min(w - 32, 860), bh = 128;
    const x = Math.round((w - bw) / 2), y = Math.round(h - bh - 18);
    const narr = !L.who;
    ctx.save();
    // the box
    ctx.fillStyle = 'rgba(14,16,40,0.94)';
    ctx.strokeStyle = '#f2e6c8'; ctx.lineWidth = 3;
    roundRect(ctx, x, y, bw, bh, 12); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,110,180,0.8)'; ctx.lineWidth = 1;
    roundRect(ctx, x + 5, y + 5, bw - 10, bh - 10, 9); ctx.stroke();
    let tx = x + 22;
    if (!narr) {
      // portrait
      const px = x + 14, py = y + 14, ps = 100;
      ctx.fillStyle = '#22264a'; ctx.strokeStyle = '#f2e6c8'; ctx.lineWidth = 2;
      roundRect(ctx, px, py, ps, ps, 8); ctx.fill(); ctx.stroke();
      const c = L.who === 'player' ? { dex: AI.R.Game.player.dex } : CAST[L.who];
      let a = portraitAnim.get(c.dex);
      if (!a) { a = new AI.R.Sprites.Animator(c.dex, 1, false); a.loop('Idle'); portraitAnim.set(c.dex, a); }
      a.dir = 0;
      try { a.update && a.update(1 / 60); } catch (e) { /* ignore */ }
      ctx.save();
      ctx.beginPath(); roundRect(ctx, px + 2, py + 2, ps - 4, ps - 4, 6); ctx.clip();
      ctx.imageSmoothingEnabled = false;
      const k = c.dex === 477 || c.dex === 681 || c.dex === 609 ? 1.25 : 1.7;
      ctx.translate(px + ps / 2, py + ps - 4);
      ctx.scale(k, k);
      try { a.draw(ctx, 0, 0, { alpha: 1 }); } catch (e) { /* ignore */ }
      ctx.restore();
      tx = px + ps + 18;
      // name tag
      const name = L.who === 'player' ? playerName() : CAST[L.who].nick ? CAST[L.who].name + ' · ' + CAST[L.who].nick : CAST[L.who].name;
      ctx.font = '700 15px Pixelify, "Segoe UI", sans-serif';
      const nw = ctx.measureText(name).width + 22;
      ctx.fillStyle = L.who === 'player' ? '#3a7ad0' : (CAST[L.who].col || '#7a5ad0');
      ctx.strokeStyle = '#f2e6c8'; ctx.lineWidth = 2;
      roundRect(ctx, tx - 6, y - 16, nw, 26, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      ctx.fillText(name, tx + 5, y - 3);
    }
    // the words
    ctx.font = (narr ? 'italic ' : '') + '700 17px Pixelify, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = narr ? '#c8c0e8' : '#f6f2ff';
    const lines = wrap(ctx, L.text.slice(0, L.shown), bw - (tx - x) - 26);
    lines.slice(0, 4).forEach((ln, i) => ctx.fillText(ln, tx, y + 22 + i * 24));
    if (L.done && Math.sin(AI.time * 7) > -0.3) {
      ctx.fillStyle = '#f2e6c8';
      ctx.beginPath(); ctx.moveTo(x + bw - 28, y + bh - 22); ctx.lineTo(x + bw - 16, y + bh - 22); ctx.lineTo(x + bw - 22, y + bh - 14); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function playerName() { const p = AI.R.Game.player; const d = AI.R.DEX_BY[p.dex]; return d ? d.name : '???'; }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // residents' chatter bubbles (world positions → screen)
  function drawBubbles(ctx) {
    if (!st.bubbles.length) return;
    const cam = AI.R.Camera;
    ctx.save();
    ctx.font = '700 12px Pixelify, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    for (const b of st.bubbles) {
      const a = b.a;
      const sx = (a.x - cam.left()) * cam.scale, sy = (a.y - a.lift - 70 - cam.top()) * cam.scale;
      const al = Math.min(1, b.t / 0.2, (4.5 - b.t) / 0.4);
      const lines = wrap(ctx, b.text, 190);
      const bw2 = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, bh2 = lines.length * 15 + 10;
      ctx.globalAlpha = al;
      ctx.fillStyle = 'rgba(255,253,244,0.96)'; ctx.strokeStyle = '#2b2a3a'; ctx.lineWidth = 2;
      roundRect(ctx, sx - bw2 / 2, sy - bh2, bw2, bh2, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#26243a';
      lines.forEach((l, i) => ctx.fillText(l, sx - bw2 / 2 + 7, sy - bh2 + 5 + i * 15));
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- the Distortion World (a glimpse)
  const isles = [];
  function makeIsles() {
    isles.length = 0;
    for (let i = 0; i < 14; i++) {
      const pts = [];
      const n = 7 + ((Math.random() * 5) | 0);
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI; pts.push([Math.cos(a) * (0.7 + Math.random() * 0.3), Math.sin(a) * (0.5 + Math.random() * 0.8)]); }
      isles.push({ x: Math.random(), y: Math.random() * 0.9, s: 24 + Math.random() * 90, z: 0.3 + Math.random() * 0.9, pts, inv: Math.random() < 0.45, spin: (Math.random() - 0.5) * 0.12, tree: Math.random() < 0.6, col: ['#3a3450', '#2c2a3e', '#463a58', '#30384a'][(Math.random() * 4) | 0] });
    }
  }
  function drawDistortion(ctx, w, h) {
    const t = st.cineT;
    if (!isles.length) makeIsles();
    const fadeIn = Math.min(1, t / 1.2), fadeOut = Math.min(1, Math.max(0, (11.5 - t) / 1.2));
    ctx.save();
    // the void
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#06040c'); g.addColorStop(0.5, '#140c22'); g.addColorStop(1, '#05030a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // drifting bands of grey-violet mist
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(110,90,150,' + (0.05 + i * 0.012).toFixed(3) + ')';
      const y = (h * (0.15 + i * 0.18) + Math.sin(t * 0.3 + i) * 20);
      ctx.fillRect(0, y, w, 18 + i * 6);
    }
    const push = 1 + t * 0.025; // the view slowly closes in
    ctx.translate(w / 2, h / 2); ctx.scale(push, push); ctx.translate(-w / 2, -h / 2);
    // islands of rock, some hanging upside down, trees growing the wrong way
    const A = AI.Art;
    for (const is of isles) {
      const x = is.x * w + Math.sin(t * 0.2 * is.z + is.s) * 30 * is.z, y = is.y * h + Math.cos(t * 0.17 + is.s) * 14 * is.z;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(is.spin * t);
      if (is.inv) ctx.scale(1, -1);
      ctx.globalAlpha = 0.45 + is.z * 0.5;
      ctx.fillStyle = is.col;
      ctx.beginPath();
      ctx.moveTo(-is.s, 0);
      for (const [px, py] of is.pts) ctx.lineTo(px * is.s * -1, py * is.s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a4a70'; ctx.fillRect(-is.s, -3, is.s * 2, 4);
      if (is.tree && A && A.has('haunt_tree_a')) A.draw(ctx, is.s > 60 ? 'haunt_tree_a' : 'deadsapling_a', 0, -2, { scale: 0.4 + is.s / 200 });
      ctx.restore();
    }
    // inverted columns and a staircase floating nowhere
    if (A) {
      ctx.save(); ctx.translate(w * 0.18, h * 0.22 + Math.sin(t * 0.4) * 8); ctx.scale(1, -1); ctx.globalAlpha = 0.7; A.draw(ctx, 'm_column', 0, 0, { scale: 0.9 }); ctx.restore();
      ctx.save(); ctx.translate(w * 0.82, h * 0.78 + Math.cos(t * 0.35) * 8); ctx.rotate(Math.PI * 0.5 + t * 0.02); ctx.globalAlpha = 0.55; A.draw(ctx, 'm_stairs', 0, 0, { scale: 0.7 }); ctx.restore();
    }
    // water falling upward
    ctx.fillStyle = 'rgba(150,170,230,0.35)';
    for (let i = 0; i < 40; i++) { const x = w * 0.62 + (i % 5) * 4; const y = h - ((t * 90 + i * 37) % (h * 0.9)); ctx.fillRect(x, y, 2, 7); }
    // a shard of glass, and in it, you — distorted
    const p = AI.R.Game.player;
    const sx = w * 0.3, sy = h * 0.58;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(40,36,70,0.9)'; ctx.strokeStyle = 'rgba(200,190,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx - 46, sy - 70); ctx.lineTo(sx + 40, sy - 84); ctx.lineTo(sx + 52, sy + 40); ctx.lineTo(sx - 30, sy + 56); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.clip();
    let a = portraitAnim.get('d' + p.dex);
    if (!a) { a = new AI.R.Sprites.Animator(p.dex, 1, !!p.shiny); a.loop('Idle'); portraitAnim.set('d' + p.dex, a); }
    a.dir = 0;
    try { a.update && a.update(1 / 60); } catch (e) { /* ignore */ }
    // drawn in thin wavering slices
    const off = document.createElement('canvas');
    off.width = 120; off.height = 120;
    const og = off.getContext('2d');
    og.imageSmoothingEnabled = false;
    og.translate(60, 110); og.scale(1.6, 1.6);
    try { a.draw(og, 0, 0, { alpha: 1 }); } catch (e) { /* ignore */ }
    for (let yy = 0; yy < 120; yy += 3) ctx.drawImage(off, 0, yy, 120, 3, sx - 60 + Math.sin(yy * 0.12 + t * 3) * 6, sy - 80 + yy, 120, 3);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(170,140,255,0.9)'; ctx.fillRect(sx - 70, sy - 90, 140, 160);
    ctx.restore();
    // something vast, watching it
    if (A && A.has('giratina_shadow')) {
      const [sw0, sh0] = A.size('giratina_shadow');
      const k = (h * 1.15) / sh0 * (1 + Math.sin(t * 0.8) * 0.015);
      ctx.save();
      ctx.globalAlpha = Math.min(1, t / 3) * 0.92;
      ctx.imageSmoothingEnabled = true;
      ctx.filter = 'blur(3px)';
      ctx.translate(w * 0.74, h * 1.12);
      ctx.scale(k, k);
      A.draw(ctx, 'giratina_shadow', 0, 0, {});
      ctx.restore();
      const ey = h * 1.12 - sh0 * k * 0.49;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const ex of [-0.05, 0.06]) {
        const ex0 = w * 0.74 + ex * sw0 * k;
        const gg = ctx.createRadialGradient(ex0, ey, 0, ex0, ey, 26);
        gg.addColorStop(0, 'rgba(255,40,60,' + (0.55 * Math.min(1, t / 4)).toFixed(2) + ')'); gg.addColorStop(1, 'rgba(255,40,60,0)');
        ctx.fillStyle = gg; ctx.fillRect(ex0 - 28, ey - 28, 56, 56);
      }
      ctx.restore();
    }
    ctx.restore();
    // the thought
    if (t > 5.5) {
      const msg = tr(T('"How... peculiar."', '«Qué… peculiar.»'));
      const n = Math.min(msg.length, Math.floor((t - 5.5) * 9));
      ctx.save();
      ctx.font = 'italic 700 26px Pixelify, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(230,220,255,' + Math.min(1, (t - 5.5) / 0.6).toFixed(2) + ')';
      ctx.shadowColor = 'rgba(160,60,200,0.8)'; ctx.shadowBlur = 12;
      ctx.fillText(msg.slice(0, n), w / 2, h * 0.86);
      ctx.restore();
      if (!st.boomed && t > 5.6) { st.boomed = true; if (M()) M().sfx('boom', 0, 0); }
    }
    // fade in and out of black
    ctx.fillStyle = 'rgba(0,0,0,' + (1 - Math.min(fadeIn, fadeOut)).toFixed(3) + ')';
    ctx.fillRect(0, 0, w, h);
  }

  function drawScreen(ctx, w, h) {
    if (!AI.enabled) return;
    if (st.cine === 'distortion') { drawDistortion(ctx, w, h); return; }
    st.boomed = false;
    drawBubbles(ctx);
    // a slight letterbox while a scene plays
    if (st.scene) {
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, w, 26); ctx.restore();
    }
    if (!(H() && H().hs.jump)) drawDialogue(ctx, w, h);
  }

  // ---------------------------------------------------------------- journal & replays
  function journal() { return JOURNAL.filter((id) => save.seen[id]).map((id) => ({ id, title: tr(SCENES[id].title) })); }
  function replay(id) {
    if (busy() || !save.seen[id]) return false;
    if (id === 'aftermath') { st.replay = true; st.cine = 'distortion'; st.cineT = 0; return true; }
    return play(id, { replay: true });
  }
  function resetProgress() { save = { stage: 0, seen: {} }; persist(); }

  function reset() { st.scene = null; st.line = null; st.cam = null; st.cine = null; st.actors.length = 0; st.bubbles.length = 0; st.hush = false; st.leaving = false; st.exitArmed = false; st.laughAt = 0; }

  AI.define('Story', {
    st, CAST, SCENES, STAGES, tick, reset, play, advance, skipScene, busy, lockInput, blockExit, blockEntry, drawables, lights, drawScreen,
    journal, replay, resetProgress, onMirror, actorOf,
    stage: () => STAGES[stage()], stageN: stage, setStage, revealed: () => stage() >= 4, canMirror: () => stage() <= 1,
    get cam() { return st.cam; },
  });
})();
