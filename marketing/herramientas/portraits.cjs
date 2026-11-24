const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const p = await b.newPage();
  for (const [c, pose, rot] of [['hank', 'run', 0.45], ['bull', 'idle', 0.3], ['shiba', 'run', -0.4], ['satoshi', 'idle', 0.25]]) {
    await p.goto(`file:///home/user/cripto-rush/client/dist-portrait/index.html?char=${c}&pose=${pose}&rot=${rot}&size=900`);
    await p.waitForFunction(() => window.__png, null, { timeout: 30000 });
    const url = await p.evaluate(() => window.__png);
    fs.writeFileSync(`promo/char-${c}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  await b.close(); console.log('ok');
})();
