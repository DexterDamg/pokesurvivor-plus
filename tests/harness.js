// Headless harness for driving PokéSurvivor+ in Chromium (Playwright).
// Usage from a test: const h = await boot({ partner: 25 }); ... await h.close();
'use strict';
const { chromium } = require('playwright');

const BASE = process.env.PSX_URL || 'http://127.0.0.1:8123/index.html';

async function boot(opts = {}) {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: opts.dpr || 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('[console] ' + m.text());
    if (opts.verbose || (process.env.PSX_WARN && m.type() === 'warning')) console.log('[page]', m.type(), m.text().slice(0, 600));
  });
  // Tests never talk to a real backend: force the offline/solo build and block third-party hosts.
  await page.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.PS_FIREBASE = null;' }));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
  await page.goto(BASE + (opts.query || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__PSX_REG__ && window.__PSX_REG__.Game && window.__PSX_REG__.DB, null, { timeout: 30000 });
  await page.evaluate(async () => {
    const R = window.__PSX_REG__;
    await R.DB.ready();
    if (!R.DB.save) R.DB.playAsGuest();
  });
  const h = {
    browser, page, errors,
    R: (fn, arg) => page.evaluate(fn, arg),
    async startRun(partner = 25) {
      await page.evaluate((p) => {
        const R = window.__PSX_REG__;
        R.DB.save.partner = p;
        R.Game.startRun();
      }, partner);
      await page.waitForFunction(() => window.__PSX_REG__.Game.state === 'playing', null, { timeout: 30000 });
      // dismiss any modal that would hold the loop
      await page.waitForTimeout(300);
    },
    async wait(ms) { await page.waitForTimeout(ms); },
    async close() { await browser.close(); },
  };
  if (opts.partner) await h.startRun(opts.partner);
  return h;
}

module.exports = { boot, BASE };
