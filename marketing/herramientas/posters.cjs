const { chromium } = require('playwright');
const [,, which = 'banner', shot = ''] = process.argv;
(async () => {
  const b = await chromium.launch();
  for (const lang of ['es', 'en']) {
    const vp = which === 'square' ? { width: 540, height: 540 } : { width: 640, height: 360 };
    const p = await b.newPage({ viewport: vp, deviceScaleFactor: 2 });
    await p.goto(`file://${process.cwd()}/promo/poster.html?lang=${lang}&id=${which}&shot=${encodeURIComponent(shot)}`);
    await p.evaluate(() => window.__ready); await p.waitForTimeout(150);
    await p.screenshot({ path: `promo/${which}-${lang}.png` });
    await p.close();
  }
  await b.close(); console.log('ok');
})();
