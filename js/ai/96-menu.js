/* PokéSurvivor+ — Living World AI · the main menu's level banners
 * The Shady Forest ends at the Haunted Mansion, not at Arceus: its banner shows the mansion and its
 * status line says whether you've explored it ("Mansion not explored yet" until the story is done).
 * What's locked behind it (Level 2, Area Zero) says "Complete Level 1 to unlock it", not Arceus.
 * The Tropical Ocean's banner shows the harbour. Each banner has a still picture and an animated
 * layer over it (.pp-bgs); both are swapped (the mansion's animation pans from the house down past the
 * fountain to the gates and back, with candlelight behind the windows and a distant flash of lightning).
 */
(function () {
  'use strict';
  const AI = window.PSXAI;

  const NOT = 'Mansión aún no explorada', DONE = 'Mansión explorada';
  const LOCK = 'Derrota a Arceus en el mapa {x} para abrirlo.', LOCK1 = 'Completa el nivel 1 para abrirlo.';
  function picture(n, anim) {
    if (n === 1) return anim ? 'assets/ui/zone-1-mansion-anim.webp' : 'assets/ui/zone-1-mansion.webp';
    if (n === 3 && AI.cfg.tropicalOcean !== false) return 'assets/ocean/zone.webp';
    return null;
  }
  function selected() { try { return AI.R.Maps.selected(); } catch (e) { return 0; } }
  function explored() { try { return AI.Story.stageN() >= AI.Story.STAGES.indexOf('done'); } catch (e) { return false; } }

  function swap() {
    const el = document.getElementById('pp-banner');
    if (!el) return;
    const m = /zone-(\d)(?:-anim)?\.webp/.exec(el.style.backgroundImage || '');
    const url = m && picture(+m[1]);
    if (!url) return;
    el.style.backgroundImage = 'url(' + url + ')';
    for (const i of el.querySelectorAll('.pp-bgs i')) if (/zone-\d-anim\.webp/.test(i.style.backgroundImage || '')) i.style.backgroundImage = 'url(' + picture(+m[1], true) + ')';
  }

  function install(R) {
    try {
      R.I18n.add({ [NOT]: 'Mansion not explored yet', [DONE]: 'Mansion explored', [LOCK1]: 'Complete Level 1 to unlock it.' }, 'en');
      R.I18n.add({ [NOT]: 'Manoir pas encore exploré', [DONE]: 'Manoir exploré', [LOCK1]: 'Termine le niveau 1 pour le débloquer.' }, 'fr');
      R.I18n.add({ [NOT]: '尚未探索洋館', [DONE]: '已探索洋館', [LOCK1]: '完成第 1 關即可解鎖。' }, 'zh');
    } catch (e) { AI.warn('menu-i18n', e); }
    // the Shady Forest's status line: the mansion instead of Arceus (beaten or not)
    const oT = R.T;
    if (typeof oT === 'function') R.T = function (s) { return oT.apply(this, s === 'Arceus aún no vencido' && selected() === 1 ? [explored() ? DONE : NOT] : arguments); };
    const I = R.I18n;
    if (I && typeof I.f === 'function') {
      const oF = I.f;
      I.f = function (s, x) {
        if (s === 'Arceus vencido en {x}' && selected() === 1) return R.T(explored() ? DONE : NOT);
        if (s === LOCK && +x === 1) return R.T(LOCK1); // (the levels that open once Level 1 is done)
        return oF.apply(this, arguments);
      };
    }
    try { new MutationObserver(swap).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] }); } catch (e) { /* ignore */ }
    swap();
  }

  AI.define('Menu', { install, swap, picture, explored });
})();
