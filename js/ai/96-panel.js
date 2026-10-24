/* PokéSurvivor+ — Living World AI · settings panel
 * F7 (or the "Wild life" button in the pause menu) opens a small panel to tune the AI:
 * population caps, spawn pacing, hostility, combat/social budgets, bubbles, evolution, auto-aim.
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
    reset: { es: 'Restablecer', en: 'Reset', fr: 'Réinitialiser', zh: '重設' },
    close: { es: 'Cerrar', en: 'Close', fr: 'Fermer', zh: '關閉' },
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
    h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" data-a="reset">' + AI.tr('reset') + '</button><button class="btn gold" data-a="close">' + AI.tr('close') + '</button></div>';
    box.innerHTML = h;
    box.querySelectorAll('input,select').forEach((inp) => inp.addEventListener('input', onInput));
    box.querySelector('[data-a=reset]').onclick = () => { AI.resetCfg(); render(); };
    box.querySelector('[data-a=close]').onclick = close;
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
