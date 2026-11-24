const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  for (const lang of ['es', 'en']) for (const id of ['intro', 'coins', 'rocket', 'wheel', 'end']) {
    await p.goto(`file://${process.cwd()}/promo/overlay.html?lang=${lang}&id=${id}`);
    await p.evaluate(() => window.__ready); await p.waitForTimeout(150);
    await p.screenshot({ path: `promo/ov-${lang}-${id}.png`, omitBackground: id !== 'end' });
  }
  await b.close(); console.log('ok');
})();
