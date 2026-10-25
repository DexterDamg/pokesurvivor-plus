/* PokéSurvivor+ — Living World AI · settings panel
 * F7 (or the "Wild life" button in the pause menu) opens a small panel to tune the AI:
 * population caps, spawn pacing, hostility, combat/social budgets, bubbles, evolution, auto-aim,
 * the environment, and world settings (terrain, tree sizes, Pokémon sizes, encounters, storms).
 */
(function () {
  'use strict';
  const AI = window.PSXAI;

  const STR = {
    title: { es: 'Vida salvaje (IA)', en: 'Wild life (AI)', fr: 'Vie sauvage (IA)', zh: '野生生態 (AI)' },
    btn: { es: '🧠 Vida salvaje', en: '🧠 Wild life', fr: '🧠 Vie sauvage', zh: '🧠 野生生態' },
    hint: { es: 'pausar/reanudar ataque', en: 'pause/resume attack', fr: 'pause/reprise attaque', zh: '暫停/恢復攻擊' },
    maxNpcs: { es: 'Pokémon salvajes máx.', en: 'Max wild Pokémon', fr: 'Pokémon sauvages max', zh: '野生寶可夢上限' },
    localCap: { es: 'Máx. por zona', en: 'Max per area', fr: 'Max par zone', zh: '區域上限' },
    spawnInterval: { es: 'Intervalo de aparición (s)', en: 'Spawn interval (s)', fr: 'Intervalle d\'apparition (s)', zh: '出現間隔 (秒)' },
    hostility: { es: 'Hostilidad', en: 'Hostility', fr: 'Hostilité', zh: '敵意' },
    maxCombatAI: { es: 'Combates avanzados simultáneos', en: 'Simultaneous advanced fighters', fr: 'Combattants avancés simultanés', zh: '同時進階戰鬥數' },
    maxSocial: { es: 'Interacciones sociales', en: 'Social interactions', fr: 'Interactions sociales', zh: '社交互動數' },
    maxBubbles: { es: 'Burbujas de emoción', en: 'Emotion bubbles', fr: 'Bulles d\'émotion', zh: '情緒泡泡數' },
    bubbleScale: { es: 'Tamaño de burbujas', en: 'Bubble size', fr: 'Taille des bulles', zh: '泡泡大小' },
    evolution: { es: 'Evolución dinámica', en: 'Dynamic evolution', fr: 'Évolution dynamique', zh: '動態進化' },
    evoRate: { es: 'Ritmo de evolución', en: 'Evolution rate', fr: 'Rythme d\'évolution', zh: '進化速度' },
    friendlyFire: { es: 'Fuego amigo entre Pokémon', en: 'Friendly fire between Pokémon', fr: 'Tirs amis entre Pokémon', zh: '寶可夢之間的誤傷' },
    autoAim: { es: 'Apuntado automático', en: 'Auto-aim', fr: 'Visée auto', zh: '自動瞄準' },
    any: { es: 'Cualquiera', en: 'Anyone', fr: 'N\'importe qui', zh: '任何目標' },
    prefer: { es: 'Prefiere hostiles', en: 'Prefer hostile', fr: 'Hostiles d\'abord', zh: '優先敵對' },
    hostile: { es: 'Hostiles + objetivo marcado', en: 'Hostile + marked target', fr: 'Hostiles + cible marquée', zh: '敵對＋標記目標' },
    focusHint: { es: 'Toca o haz clic en un Pokémon para marcarlo como objetivo.', en: 'Click or tap a Pokémon to mark it as your target.', fr: 'Clique ou touche un Pokémon pour le marquer comme cible.', zh: '點擊寶可夢即可將其標記為目標。' },
    enabled: { es: 'IA del mundo vivo activa', en: 'Living world AI on', fr: 'IA du monde vivant active', zh: '啟用生態 AI' },
    debug: { es: 'Depuración (F8)', en: 'Debug overlay (F8)', fr: 'Débogage (F8)', zh: '除錯顯示 (F8)' },
    envTitle: { es: 'Entorno', en: 'Environment', fr: 'Environnement', zh: '環境' },
    atmosphere: { es: 'Día/noche, luz y clima vivo', en: 'Day/night, lighting & living weather', fr: 'Jour/nuit, lumière et météo vivante', zh: '晝夜、光影與動態天氣' },
    newArt: { es: 'Árboles, plantas y decorado nuevos', en: 'New trees, plants & forest decor', fr: 'Nouveaux arbres, plantes et décor', zh: '全新樹木、植物與森林裝飾' },
    areaSpawns: { es: 'Pokémon propios de cada zona', en: 'Each area has its own Pokémon', fr: 'Chaque zone a ses propres Pokémon', zh: '各區域有專屬寶可夢' },
    speech: { es: 'Los Pokémon hablan (rumores, avisos)', en: 'Pokémon speech (rumours, warnings)', fr: 'Les Pokémon parlent (rumeurs, alertes)', zh: '寶可夢對話（傳聞、警告）' },
    dayLength: { es: 'Duración del día (s)', en: 'Day length (s)', fr: 'Durée du jour (s)', zh: '一天長度（秒）' },
    startHour: { es: 'Hora al empezar', en: 'Starting hour', fr: 'Heure de départ', zh: '開始時刻' },
    weatherFreq: { es: 'Cambios de clima', en: 'Weather changes', fr: 'Changements de météo', zh: '天氣變化頻率' },
    ambientVol: { es: 'Sonido ambiente', en: 'Ambient sound', fr: 'Son d\'ambiance', zh: '環境音量' },
    season: { es: 'Estación', en: 'Season', fr: 'Saison', zh: '季節' },
    auto: { es: 'Automática', en: 'Automatic', fr: 'Automatique', zh: '自動' },
    spring: { es: 'Primavera', en: 'Spring', fr: 'Printemps', zh: '春' },
    summer: { es: 'Verano', en: 'Summer', fr: 'Été', zh: '夏' },
    autumn: { es: 'Otoño', en: 'Autumn', fr: 'Automne', zh: '秋' },
    winter: { es: 'Invierno', en: 'Winter', fr: 'Hiver', zh: '冬' },
    lightQuality: { es: 'Calidad de luz', en: 'Light quality', fr: 'Qualité de la lumière', zh: '光影品質' },
    low: { es: 'Baja', en: 'Low', fr: 'Basse', zh: '低' },
    medium: { es: 'Media', en: 'Medium', fr: 'Moyenne', zh: '中' },
    high: { es: 'Alta', en: 'High', fr: 'Haute', zh: '高' },
    lantern: { es: 'Farol (L)', en: 'Lantern (L)', fr: 'Lanterne (L)', zh: '燈籠（L）' },
    on: { es: 'Encendido', en: 'On', fr: 'Allumée', zh: '開' },
    off: { es: 'Apagado', en: 'Off', fr: 'Éteinte', zh: '關' },
    reset: { es: 'Restablecer', en: 'Reset', fr: 'Réinitialiser', zh: '重設' },
    close: { es: 'Cerrar', en: 'Close', fr: 'Fermer', zh: '關閉' },
    worldTitle: { es: 'Mundo y encuentros', en: 'World & encounters', fr: 'Monde et rencontres', zh: '世界與遭遇' },
    naturalTerrain: { es: 'Bosques naturales (sin bloques)', en: 'Natural forests (no wall blocks)', fr: 'Forêts naturelles (sans blocs)', zh: '自然森林（無方塊牆）' },
    treeSizes: { es: 'Árboles de varios tamaños', en: 'Trees of many sizes', fr: 'Arbres de toutes tailles', zh: '大小不一的樹木' },
    treeDensity: { es: 'Densidad de árboles', en: 'Tree density', fr: 'Densité des arbres', zh: '樹木密度' },
    speciesScale: { es: 'Tamaño según la especie', en: 'Size by species', fr: 'Taille selon l\'espèce', zh: '依物種調整體型' },
    softTelegraphs: { es: 'Avisos de ataque suaves', en: 'Soft attack warnings', fr: 'Alertes d\'attaque discrètes', zh: '柔和的攻擊預警' },
    earnedEvents: { es: 'Jefes y grietas por Pokémon derrotados', en: 'Bosses & rifts earned by defeats', fr: 'Boss et failles selon les victoires', zh: '擊敗數解鎖首領與裂縫' },
    hordes: { es: 'Oleadas de Pokémon', en: 'Pokémon surges (hordes)', fr: 'Déferlantes de Pokémon', zh: '寶可夢大量湧現' },
    eventCooldown: { es: 'Pausa entre encuentros (s)', en: 'Pause between encounters (s)', fr: 'Pause entre rencontres (s)', zh: '遭遇間隔（秒）' },
    weatherDuration: { es: 'Duración del clima', en: 'Weather duration', fr: 'Durée de la météo', zh: '天氣持續時間' },
    fogSpawns: { es: 'La niebla reduce apariciones', en: 'Fog reduces spawns', fr: 'Le brouillard réduit les apparitions', zh: '霧減少出現' },
    lightningRate: { es: 'Frecuencia de rayos', en: 'Lightning frequency', fr: 'Fréquence des éclairs', zh: '閃電頻率' },
    nightVisibility: { es: 'Visibilidad nocturna (accesibilidad)', en: 'Night visibility (accessibility)', fr: 'Visibilité nocturne (accessibilité)', zh: '夜間能見度（無障礙）' },
    manual: { es: 'Manual (L)', en: 'Manual (L)', fr: 'Manuel (L)', zh: '手動（L）' },
    flashIntensity: { es: 'Destellos de rayos (accesibilidad)', en: 'Lightning flashes (accessibility)', fr: 'Flashs d\'éclairs (accessibilité)', zh: '閃電閃光（無障礙）' },
    mansionTitle: { es: 'La mansión encantada', en: 'The haunted mansion', fr: 'Le manoir hanté', zh: '鬼屋洋館' },
    mansion: { es: 'Mansión, sustos e historia', en: 'Mansion, hauntings & story', fr: 'Manoir, hantises et histoire', zh: '洋館、靈異事件與劇情' },
    jumpscare: { es: 'Susto del espejo a pantalla completa', en: 'Full-screen mirror jumpscare', fr: 'Jumpscare du miroir en plein écran', zh: '全螢幕鏡子驚嚇' },
    hauntRate: { es: 'Frecuencia de sucesos', en: 'Haunting frequency', fr: 'Fréquence des hantises', zh: '靈異事件頻率' },
    replay: { es: 'Ver de nuevo', en: 'Replay', fr: 'Revoir', zh: '重播' },
    noScenes: { es: 'Aún no has visto ninguna escena.', en: 'No scenes seen yet.', fr: 'Aucune scène vue pour l\'instant.', zh: '尚未看過任何場景。' },
    resetStory: { es: 'Reiniciar la historia', en: 'Reset story progress', fr: 'Réinitialiser l\'histoire', zh: '重設劇情進度' },
    forestTitle: { es: 'El Bosque Umbrío', en: 'The Shady Forest', fr: 'La Forêt Ombreuse', zh: '幽暗森林' },
    forestWorld: { es: 'Bosque renovado (suelo, lago, regiones)', en: 'Rebuilt forest (ground, lake, regions)', fr: 'Forêt refaite (sol, lac, régions)', zh: '重建的森林（地面、湖泊、區域）' },
    mysteries: { es: 'Misterios del bosque (avistamientos extraños)', en: 'Forest mysteries (strange sightings)', fr: 'Mystères de la forêt (apparitions étranges)', zh: '森林之謎（奇異目擊）' },
    enemyBars: { es: 'Barras de vida de Pokémon salvajes', en: 'Health bars on wild Pokémon', fr: 'Barres de vie des Pokémon sauvages', zh: '野生寶可夢血條' },
    announce: { es: 'Anunciar sucesos salvajes', en: 'Announce wild events', fr: 'Annoncer les événements sauvages', zh: '公告野生事件' },
    forestTraps: { es: 'Trampas ocultas en el suelo', en: 'Hidden floor traps', fr: 'Pièges cachés au sol', zh: '地面隱藏陷阱' },
    journal: { es: '📖 Diario (J)', en: '📖 Journal (J)', fr: '📖 Carnet (J)', zh: '📖 日誌（J）' },
  };
  AI.lang = function () {
    const l = (AI.R && AI.R.I18n && AI.R.I18n.lang) || (navigator.language || 'es');
    return String(l).slice(0, 2);
  };
  AI.tr = function (k) { const s = STR[k]; return s ? s[AI.lang()] || s.en : k; };

  const SLIDERS = [
    ['maxNpcs', 8, 64, 1], ['localCap', 3, 20, 1], ['spawnInterval', 0.1, 2, 0.05], ['hostility', 0, 3, 0.1],
    ['maxCombatAI', 2, 40, 1], ['maxSocial', 0, 16, 1], ['maxBubbles', 0, 30, 1], ['bubbleScale', 0.6, 2, 0.1], ['evoRate', 0, 4, 0.1],
  ];
  const TOGGLES = ['evolution', 'friendlyFire', 'debug'];
  const ENV_TOGGLES = ['atmosphere', 'newArt', 'areaSpawns', 'speech'];
  const ENV_SLIDERS = [['dayLength', 60, 1800, 30], ['startHour', 0, 23.5, 0.5], ['weatherFreq', 0, 3, 0.1], ['ambientVol', 0, 1, 0.05]];
  const ENV_SELECTS = [['season', ['auto', 'spring', 'summer', 'autumn', 'winter']], ['lightQuality', ['auto', 'low', 'medium', 'high']], ['lantern', ['manual', 'on', 'off']]];
  const WORLD_TOGGLES = ['naturalTerrain', 'treeSizes', 'speciesScale', 'softTelegraphs', 'earnedEvents', 'hordes'];
  const WORLD_SLIDERS = [['treeDensity', 0.3, 2, 0.1], ['eventCooldown', 20, 240, 5], ['weatherDuration', 0.3, 3, 0.1], ['fogSpawns', 0, 1.5, 0.05], ['lightningRate', 0, 3, 0.1], ['flashIntensity', 0, 1, 0.05], ['nightVisibility', 0, 1, 0.05]];
  const MANSION_TOGGLES = ['mansion', 'jumpscare'];
  const FOREST_TOGGLES = ['forestWorld', 'mysteries', 'enemyBars', 'announce', 'forestTraps'];
  let el = null;

  function build() {
    el = document.createElement('div');
    el.id = 'psx-ai-panel';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(4,6,14,.55);font-family:Pixelify,"Segoe UI",system-ui,sans-serif';
    el.innerHTML = '<div class="box" style="background:#151b2e;color:#eaf2ff;border:2px solid #ffd23f;border-radius:14px;padding:16px 18px;width:min(420px,calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;box-shadow:0 0 24px rgba(0,0,0,.6)"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (ev) => { if (ev.target === el) close(); });
    render();
  }
  function render() {
    const box = el.firstChild;
    const c = AI.cfg;
    let h = '<h3 style="margin:0 0 10px;color:#ffd23f">' + AI.tr('title') + '</h3>';
    h += row('<label><input type="checkbox" data-k="__enabled"' + (AI.enabled ? ' checked' : '') + '> ' + AI.tr('enabled') + '</label>');
    for (const [k, min, max, step] of SLIDERS) {
      h += row('<div style="display:flex;justify-content:space-between"><span>' + AI.tr(k) + '</span><b data-v="' + k + '">' + c[k] + '</b></div><input type="range" style="width:100%" min="' + min + '" max="' + max + '" step="' + step + '" value="' + c[k] + '" data-k="' + k + '">');
    }
    h += row(AI.tr('autoAim') + ' <select data-k="autoAim">' + ['any', 'prefer', 'hostile'].map((o) => '<option value="' + o + '"' + (c.autoAim === o ? ' selected' : '') + '>' + AI.tr(o) + '</option>').join('') + '</select>');
    h += '<div style="opacity:.7;font-size:11px;margin-top:-4px">' + AI.tr('focusHint') + '</div>';
    for (const k of TOGGLES) h += row('<label><input type="checkbox" data-k="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + AI.tr(k) + '</label>');
    h += '<h4 style="margin:14px 0 6px;color:#9fe0c0">' + AI.tr('envTitle') + '</h4>';
    for (const k of ENV_TOGGLES) h += row('<label><input type="checkbox" data-k="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + AI.tr(k) + '</label>');
    for (const [k, min, max, step] of ENV_SLIDERS) {
      h += row('<div style="display:flex;justify-content:space-between"><span>' + AI.tr(k) + '</span><b data-v="' + k + '">' + c[k] + '</b></div><input type="range" style="width:100%" min="' + min + '" max="' + max + '" step="' + step + '" value="' + c[k] + '" data-k="' + k + '">');
    }
    for (const [k, opts] of ENV_SELECTS) h += row(AI.tr(k) + ' <select data-k="' + k + '">' + opts.map((o) => '<option value="' + o + '"' + (c[k] === o ? ' selected' : '') + '>' + AI.tr(o) + '</option>').join('') + '</select>');
    h += '<h4 style="margin:14px 0 6px;color:#9fe0c0">' + AI.tr('worldTitle') + '</h4>';
    for (const k of WORLD_TOGGLES) h += row('<label><input type="checkbox" data-k="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + AI.tr(k) + '</label>');
    for (const [k, min, max, step] of WORLD_SLIDERS) {
      h += row('<div style="display:flex;justify-content:space-between"><span>' + AI.tr(k) + '</span><b data-v="' + k + '">' + c[k] + '</b></div><input type="range" style="width:100%" min="' + min + '" max="' + max + '" step="' + step + '" value="' + c[k] + '" data-k="' + k + '">');
    }
    h += '<h4 style="margin:14px 0 6px;color:#9fe0c0">' + AI.tr('forestTitle') + '</h4>';
    for (const k of FOREST_TOGGLES) h += row('<label><input type="checkbox" data-k="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + AI.tr(k) + '</label>');
    if (AI.Mysteries) h += row('<button class="btn" data-a="journal">' + AI.tr('journal') + '</button>');
    h += '<h4 style="margin:14px 0 6px;color:#c9a0f0">' + AI.tr('mansionTitle') + '</h4>';
    for (const k of MANSION_TOGGLES) h += row('<label><input type="checkbox" data-k="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + AI.tr(k) + '</label>');
    h += row('<div style="display:flex;justify-content:space-between"><span>' + AI.tr('hauntRate') + '</span><b data-v="hauntRate">' + c.hauntRate + '</b></div><input type="range" style="width:100%" min="0" max="3" step="0.1" value="' + c.hauntRate + '" data-k="hauntRate">');
    const jr = AI.Story ? AI.Story.journal() : [];
    if (!jr.length) h += '<div style="opacity:.7;font-size:12px">' + AI.tr('noScenes') + '</div>';
    for (const j of jr) h += '<div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0"><span>' + j.title + '</span><button class="btn" data-replay="' + j.id + '">▶ ' + AI.tr('replay') + '</button></div>';
    if (jr.length) h += '<div style="text-align:right;margin-top:6px"><button class="btn" data-a="resetStory">' + AI.tr('resetStory') + '</button></div>';
    h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" data-a="reset">' + AI.tr('reset') + '</button><button class="btn gold" data-a="close">' + AI.tr('close') + '</button></div>';
    box.innerHTML = h;
    box.querySelectorAll('input,select').forEach((inp) => inp.addEventListener('input', onInput));
    box.querySelector('[data-a=reset]').onclick = () => { AI.resetCfg(); render(); };
    box.querySelector('[data-a=close]').onclick = close;
    box.querySelectorAll('[data-replay]').forEach((b) => { b.onclick = () => { close(); if (AI.Story) AI.Story.replay(b.dataset.replay); }; });
    const jb = box.querySelector('[data-a=journal]');
    if (jb) jb.onclick = () => { close(); AI.Mysteries.toggle(true); };
    const rs = box.querySelector('[data-a=resetStory]');
    if (rs) rs.onclick = () => { if (AI.Story) AI.Story.resetProgress(); render(); };
  }
  function row(inner) { return '<div style="margin:8px 0">' + inner + '</div>'; }
  function onInput(ev) {
    const t = ev.target;
    const k = t.dataset.k;
    if (k === '__enabled') { AI.enabled = t.checked; return; }
    let v;
    if (t.type === 'checkbox') v = t.checked;
    else if (t.tagName === 'SELECT') v = t.value;
    else v = +t.value;
    AI.setCfg(k, v);
    const lab = el.querySelector('[data-v="' + k + '"]');
    if (lab) lab.textContent = v;
  }

  function open() { if (!el) build(); else { render(); el.style.display = 'flex'; } }
  function close() { if (el) el.style.display = 'none'; }
  function toggle() { if (el && el.style.display !== 'none') close(); else open(); }

  function install() {
    addEventListener('keydown', (ev) => {
      if (ev.code === 'F7') { ev.preventDefault(); toggle(); }
      else if (ev.code === 'F8') { ev.preventDefault(); AI.setCfg('debug', !AI.cfg.debug); }
      else if (ev.code === 'Escape' && el && el.style.display !== 'none') { close(); ev.stopPropagation(); }
    }, true);
    // pause menu entry + key hint
    const grid = document.querySelector('#scr-pause .pause-grid');
    if (grid && !document.getElementById('btn-pause-ai')) {
      const b = document.createElement('button');
      b.id = 'btn-pause-ai';
      b.className = 'btn pg-wide';
      b.textContent = AI.tr('btn');
      b.onclick = open;
      const quit = document.getElementById('btn-save-run');
      grid.insertBefore(b, quit || null);
    }
    const keys = document.querySelector('#scr-pause .pause-keys');
    if (keys && !document.getElementById('psx-key-hint')) {
      const sp = document.createElement('span');
      sp.id = 'psx-key-hint';
      sp.innerHTML = '<kbd>1–4</kbd> <i>' + AI.tr('hint') + '</i>';
      keys.appendChild(sp);
    }
  }

  AI.define('Panel', { open, close, toggle, install });
})();
