// Graba el juego cuadro por cuadro con un "jugador automático".
const { chromium } = require('playwright');
const fs = require('fs');
const [,, outDir, lang = 'es', seconds = '14', charId = 'hank', seed = '7'] = process.argv;
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([lang, charId]) => {
    localStorage.setItem('cr-lang', lang); localStorage.setItem('cr-tutorial-done', '1'); localStorage.setItem('cr-muted', '1');
    const s = { user: { id: 'demo', name: 'Demo', balance: 150000, totalEarned: 0, bestDistance: 0, wallet: null, character: charId,
      owned: ['hank', 'muskrat', 'thump', 'pepe', 'bull', 'shiba', 'satoshi'], earnedToday: 0, dailyLast: new Date().toISOString().slice(0, 10), dailyStreak: 1 }, withdrawals: [] };
    localStorage.setItem('cryptorush-demo-v3', JSON.stringify(s));
  }, [lang, charId]);
  await p.goto('file://' + process.cwd() + '/promo/game.html?debug');
  await p.waitForSelector('#play', { timeout: 20000 });
  await p.evaluate(() => document.getElementById('modal')?.remove());
  await p.click('#play'); await p.waitForTimeout(600);
  await p.evaluate((seed) => {
    const g = window.__game;
    g.renderer.setAnimationLoop(null);          // control manual del tiempo
    g.clock.getDelta = () => 1 / 30;
    g.start(Number(seed));
    g.player.remove(g.fx.bubble);               // invencible sin burbuja visible (por si el bot se equivoca)
    const LANES = [-2.4, 0, 2.4];
    window.__bot = () => {
      g.invincible = 999;
      const ahead = g.world.obstacles.filter(o => o.d > g.d - 0.5 && o.d - g.d < 26).sort((a, b) => a.d - b.d);
      const inLane = (lane) => ahead.find(o => o.lane === lane);
      const o = inLane(g.lane);
      const dz = o ? o.d - g.d : 99;
      const blockedSoon = (lane) => ahead.some(x => x.lane === lane && x.d - g.d < 22 && x.type === 'wall');
      const keys = (a) => document.dispatchEvent(new KeyboardEvent('keydown', { code: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }[a] }));
      if (o && o.type === 'wall' && dz < 20) {
        const options = [g.lane - 1, g.lane + 1].filter(l => l >= 0 && l <= 2 && !blockedSoon(l));
        if (options.length) keys(options[0] < g.lane ? 'left' : 'right');
      } else if (o && o.type === 'low' && dz < 6.5 && g.y < 0.01) keys('up');
      else if (o && o.type === 'high' && dz < 6 && g.slideLeft <= 0) keys('down');
      else if (!o || dz > 14) {
        // ir hacia las monedas
        const c = g.world.coins.filter(c => c.d > g.d && c.d - g.d < 18).sort((a, b) => a.d - b.d)[0];
        if (c && c.lane !== g.lane && !blockedSoon(c.lane) && Math.abs(LANES[g.lane] - g.x) < 0.1) keys(c.lane < g.lane ? 'left' : 'right');
      }
    };
  }, seed);
  // guion: arrancar ya rápido, al atardecer, y saltear los primeros segundos vacíos
  await p.evaluate(() => { const g = window.__game; g.runTime = 40; g.dayPhase = 0.36; for (let i = 0; i < 75; i++) { window.__bot(); g._frame(); } });
  const frames = Number(seconds) * 30;
  for (let i = 0; i < frames; i++) {
    // cohete a los 7 s del video
    if (i === 210) await p.evaluate(() => {
      const g = window.__game; g.power.rocket = 3.2;
      const flight = g.speed * 3.2; g.world.rocketCoins(g.d, g.d + flight, g.lane, 7.6); g.world.clearAhead(g.d, flight + 20);
    });
    await p.evaluate(() => { window.__bot(); window.__game._frame(); });
    await p.screenshot({ path: `${outDir}/f${String(i).padStart(4, '0')}.png` });
  }
  console.log('frames', frames, 'coins', await p.evaluate(() => window.__game.coins), 'dist', await p.evaluate(() => Math.round(window.__game.d)), 'errors', errs);
  await b.close();
})();
