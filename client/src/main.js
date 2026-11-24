import { Game } from './game/game.js';
import { CHARACTERS } from './game/characters.js';
import { api, errMsg, DEMO } from './services/api.js';
import { initTelegram, haptic, tg } from './services/telegram.js';
import { showRewardedAd, preloadAds } from './services/ads.js';
import { initWallet, friendly, short } from './services/wallet.js';

const ui = document.getElementById('ui');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.floor(n).toLocaleString('es');
const EMOJI = { hank: '🧢', muskrat: '🐀', thump: '🍊', satoshi: '🥷' };

let user = null;
let cfg = null;
let run = null; // { runId, seed, revived, doubled }
const usd = (coins) => (coins / cfg.coinsPerUsd).toFixed(2);

function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.innerHTML = `<div>${esc(msg)}</div>`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.innerHTML = ''), ms);
}
const render = (html) => { ui.innerHTML = html; };
const $ = (sel) => ui.querySelector(sel);
const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };

// ---------- Juego ----------
let hudEls = null;
const game = new Game(document.getElementById('game'), {
  onHud(h) {
    if (!hudEls) return;
    hudEls.coins.textContent = '🪙 ' + h.coins;
    hudEls.dist.textContent = h.distance + ' m';
    hudEls.pu.innerHTML = h.powerups.map((p) =>
      `<div class="pu">${p.icon} <span class="bar"><i style="width:${(p.left / p.duration) * 100}%"></i></span></div>`).join('');
  },
  onCoin() { if (game.coins % 10 === 0) haptic('light'); },
  onInput(a) {
    if (a.startsWith('power:')) { haptic('medium'); toast(({ 'power:magnet': '🐋 ¡Ballena imán!', 'power:rocket': '🚀 To the Moon!', 'power:shield': '🛡️ Escudo HODL' })[a]); }
    if (a === 'shieldBreak' || a === 'bump') haptic('heavy');
  },
  onDeath() {
    haptic('error');
    ui.insertAdjacentHTML('beforeend', '<div class="flash"></div>');
    setTimeout(() => (run.revived ? showGameOver() : showRevive()), 350);
  },
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'running') { game.pause(); showPause(); }
});

// ---------- Pantallas ----------
function showLoading(text = 'Cargando…') { render(`<div class="loading">🚀 ${esc(text)}</div>`); }

function showHome() {
  hudEls = null;
  game.toMenu();
  game.setCharacter(user.character);
  render(`
  <div class="screen home">
    <div class="topbar">
      <div class="pill">🪙 ${fmt(user.balance)} <small>≈ $${usd(user.balance)}</small></div>
      <div class="pill">🏁 ${fmt(user.bestDistance)} m</div>
    </div>
    <div class="logo"><h1>MOON<br>RUSH</h1><p>Esquiva el mercado bajista. Junta monedas. Llega a la Luna.</p></div>
    <div class="spacer"></div>
    <div class="home-actions">
      <button class="btn primary" id="play">▶ JUGAR</button>
      <div class="row">
        <button class="btn" id="chars">${EMOJI[user.character]} Personajes</button>
        <button class="btn green" id="wallet">💸 Retirar</button>
      </div>
      ${DEMO ? '<div class="hint" style="color:var(--gold)">🧪 Versión demo: anuncios simulados y retiros de prueba</div>' : ''}
      <div class="hint">Desliza ⬅️ ➡️ para cambiar de carril · ⬆️ saltar · ⬇️ deslizarte<br>
      Hoy ganaste ${fmt(user.earnedToday)} / ${fmt(cfg.dailyCoinCap)} monedas</div>
    </div>
  </div>`);
  on('#play', startRun);
  on('#chars', showCharacters);
  on('#wallet', showWallet);
}

function showHud() {
  render(`
  <div class="hud">
    <div class="top">
      <div><div class="coins" id="h-coins">🪙 0</div><div class="powerups" id="h-pu"></div></div>
      <div style="display:flex"><div class="dist" id="h-dist">0 m</div><button class="pause" id="pause">⏸</button></div>
    </div>
  </div>`);
  hudEls = { coins: $('#h-coins'), dist: $('#h-dist'), pu: $('#h-pu') };
  on('#pause', () => { game.pause(); showPause(); });
}

function modal(html) {
  ui.insertAdjacentHTML('beforeend', `<div class="modal-bg" id="modal"><div class="modal">${html}</div></div>`);
}
/** Confirmación dentro del juego (los diálogos nativos no funcionan bien en Telegram). */
function askConfirm(text) {
  return new Promise((resolve) => {
    closeModal();
    modal(`<h2>¿Confirmas?</h2><p>${esc(text)}</p>
      <div class="stack"><button class="btn primary" id="c-yes">Sí, confirmar</button>
      <button class="btn ghost" id="c-no">Cancelar</button></div>`);
    on('#c-yes', () => { closeModal(); resolve(true); });
    on('#c-no', () => { closeModal(); resolve(false); });
  });
}
const closeModal = () => { $('#modal')?.remove(); $('.flash')?.remove(); };

function showPause() {
  closeModal();
  modal(`<h2>⏸ Pausa</h2><p>El mercado nunca duerme…</p>
    <div class="stack"><button class="btn primary" id="resume">Continuar</button>
    <button class="btn ghost" id="quit">Terminar partida</button></div>`);
  on('#resume', () => { closeModal(); game.resume(); });
  on('#quit', () => { closeModal(); game.state = 'dead'; showGameOver(); });
}

async function startRun() {
  try {
    $('#play').disabled = true;
    run = await api.startRun();
    run.revived = false; run.doubled = false;
    game.setCharacter(user.character);
    showHud();
    game.start(run.seed);
    preloadAds();
  } catch (e) {
    toast(errMsg(e));
    showHome();
  }
}

/** Muestra un anuncio y lo reclama en el servidor (con reintentos si se usa postback). */
async function watchAd(type) {
  const ymid = `${run.runId}:${type}`;
  await showRewardedAd(ymid);
  for (let i = 0; ; i++) {
    try { return await api.claimAd(run.runId, type, ymid); } catch (e) {
      if (e.message !== 'ad_not_verified' || i >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

function showRevive() {
  let left = 5;
  modal(`<h2>📉 ¡Liquidado!</h2><p>Mira un anuncio y sigue corriendo</p>
    <div class="ring" id="ring"><span id="count">5</span></div>
    <div class="stack"><button class="btn green" id="revive">📺 Revivir</button>
    <button class="btn ghost" id="skip">No, gracias</button></div>`);
  const timer = setInterval(() => {
    left -= 0.1;
    const r = $('#ring');
    if (r) { r.style.setProperty('--p', (left / 5) * 100 + '%'); $('#count').textContent = Math.ceil(left); }
    if (left <= 0) { clearInterval(timer); closeModal(); showGameOver(); }
  }, 100);
  on('#skip', () => { clearInterval(timer); closeModal(); showGameOver(); });
  on('#revive', async () => {
    clearInterval(timer);
    $('#revive').disabled = true; $('#skip').disabled = true;
    try {
      await watchAd('revive');
      run.revived = true;
      closeModal();
      haptic('success');
      game.revive();
    } catch (e) {
      toast(e.message === 'ad_sdk_failed' ? 'No hay anuncios disponibles ahora' : errMsg(e));
      closeModal(); showGameOver();
    }
  });
}

function showGameOver() {
  closeModal();
  hudEls = null;
  const { coins, distance } = game.result;
  render('');
  modal(`<h2>Fin de la partida</h2>
    <div class="stats"><div>Distancia<b>${fmt(distance)} m</b></div><div>Récord<b>${fmt(Math.max(distance, user.bestDistance))} m</b></div></div>
    <div class="big" id="go-coins">🪙 ${coins}</div>
    <div class="stack">
      ${coins > 0 ? `<button class="btn primary" id="double">📺 x2 = ${coins * 2} monedas</button>` : ''}
      <button class="btn" id="collect">${coins > 0 ? 'Cobrar ' + coins : 'Volver'}</button>
    </div>`);
  const finish = async () => {
    ui.querySelectorAll('.modal button').forEach((b) => (b.disabled = true));
    try {
      const r = await api.endRun(run.runId, coins, distance);
      user = r.user;
      closeModal();
      if (r.credited > 0) haptic('success');
      modal(`<h2>${r.doubled ? '🚀 ¡Duplicado!' : '💰 ¡Cobrado!'}</h2>
        <div class="big">+${fmt(r.credited)}</div>
        <p>${r.capped ? `Llegaste al tope diario de ${fmt(cfg.dailyCoinCap)} monedas.` : `Saldo: ${fmt(user.balance)} (≈ $${usd(user.balance)})`}</p>
        <div class="stack"><button class="btn primary" id="again">▶ Otra vez</button><button class="btn ghost" id="home">Menú</button></div>`);
      on('#again', () => { closeModal(); showHome(); startRun(); });
      on('#home', () => { closeModal(); showHome(); });
    } catch (e) {
      toast(errMsg(e), 3500);
      closeModal(); showHome();
    }
  };
  on('#collect', finish);
  on('#double', async () => {
    ui.querySelectorAll('.modal button').forEach((b) => (b.disabled = true));
    try {
      await watchAd('double');
      run.doubled = true;
      $('#go-coins').textContent = '🪙 ' + coins * 2;
    } catch (e) {
      toast(e.message === 'ad_sdk_failed' ? 'No hay anuncios disponibles ahora' : errMsg(e));
    }
    finish();
  });
}

function showCharacters() {
  const cards = Object.entries(CHARACTERS).map(([id, c]) => {
    const owned = user.owned.includes(id);
    const price = cfg.characters[id]?.price ?? 0;
    const sel = user.character === id;
    return `<div class="card ${sel ? 'sel' : ''}">
      <div class="emoji">${EMOJI[id]}</div><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p>
      <button class="btn ${owned ? '' : 'primary'}" data-id="${id}" data-preview="${id}" ${sel ? 'disabled' : ''}>
        ${sel ? 'En uso' : owned ? 'Usar' : '🪙 ' + fmt(price)}</button></div>`;
  }).join('');
  render(`<div class="screen scroll">
    <div class="page-head"><button class="back" id="back">←</button><h2>Personajes</h2><div class="pill">🪙 ${fmt(user.balance)}</div></div>
    <div class="grid">${cards}</div>
    <p class="legal" style="margin-top:14px">Personajes de parodia. Cualquier parecido con personas reales es satírico.</p>
  </div>`);
  on('#back', showHome);
  ui.querySelectorAll('[data-id]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.id;
      const owned = user.owned.includes(id);
      if (!owned && !(await askConfirm(`¿Comprar ${CHARACTERS[id].name} por ${fmt(cfg.characters[id].price)} monedas?`))) return;
      try {
        user = await api.buyCharacter(id);
        game.setCharacter(id);
        haptic('success');
        showCharacters();
      } catch (e) { toast(errMsg(e)); }
    };
  });
}

async function showWallet() {
  game.toMenu();
  const canWithdraw = user.balance >= cfg.minWithdrawCoins;
  render(`<div class="screen scroll">
    <div class="page-head"><button class="back" id="back">←</button><h2>Retirar</h2></div>
    <div class="box"><h3>Tu saldo</h3>
      <div class="balance">🪙 ${fmt(user.balance)}<small>≈ $${usd(user.balance)}</small></div>
      <p class="legal">Tasa: ${fmt(cfg.coinsPerUsd)} monedas = 1 USD · Mínimo: ${fmt(cfg.minWithdrawCoins)} monedas ($${usd(cfg.minWithdrawCoins)})</p>
    </div>
    <div class="box"><h3>1. Conecta tu wallet TON</h3>
      ${DEMO ? '<button class="btn" id="demo-wallet">🔗 Conectar wallet de prueba</button>' : '<div id="ton-btn"></div>'}
      <p class="legal" id="w-addr">${user.wallet ? 'Wallet registrada: ' + esc(short(user.wallet)) : 'Usa Tonkeeper, @wallet u otra wallet TON.'}</p>
    </div>
    <div class="box"><h3>2. Solicita el retiro</h3>
      <label>Recibir en</label>
      <select id="cur">${cfg.currencies.map((c) => `<option value="${c}">${c === 'USDT_TON' ? 'USDT (red TON)' : 'TON'}</option>`).join('')}</select>
      <label>Monedas a retirar</label>
      <input id="amt" type="number" inputmode="numeric" min="${cfg.minWithdrawCoins}" value="${user.balance}">
      <p class="legal" id="amt-usd"></p>
      <button class="btn green" id="go" style="width:100%" ${canWithdraw ? '' : 'disabled'}>
        ${canWithdraw ? 'Solicitar retiro' : `Te faltan ${fmt(cfg.minWithdrawCoins - user.balance)} monedas`}</button>
    </div>
    <div class="box"><h3>Historial</h3><ul class="list" id="hist"><li>Cargando…</li></ul></div>
    <p class="legal">Los retiros se revisan manualmente para evitar fraudes y se pagan en 24–72 h.
    Las cuentas con partidas sospechosas pueden ser suspendidas.</p>
  </div>`);
  on('#back', showHome);
  const upd = () => { $('#amt-usd').textContent = '≈ $' + usd(Number($('#amt').value || 0)); };
  $('#amt').oninput = upd; upd();

  on('#demo-wallet', async () => {
    user = await api.setWallet('UQDemo' + 'x'.repeat(38) + 'Demo');
    $('#w-addr').textContent = 'Wallet de prueba: ' + short(user.wallet);
  });
  if (!DEMO) initWallet('ton-btn', async (addr) => {
    if (!addr) return;
    try {
      user = await api.setWallet(friendly(addr));
      const el = $('#w-addr');
      if (el) el.textContent = 'Wallet registrada: ' + short(user.wallet);
    } catch (e) { toast(errMsg(e)); }
  });

  on('#go', async () => {
    const coins = Math.floor(Number($('#amt').value));
    if (!(await askConfirm(`¿Retirar ${fmt(coins)} monedas (≈ $${usd(coins)}) en ${$('#cur').value}?`))) return;
    try {
      const r = await api.withdraw(coins, $('#cur').value);
      user = r.user;
      haptic('success');
      toast(`✅ Retiro de $${(r.usdCents / 100).toFixed(2)} solicitado`);
      showWallet();
    } catch (e) { toast(errMsg(e)); }
  });

  try {
    const list = await api.withdrawals();
    const STATUS = { pending: 'Pendiente', paid: 'Pagado', rejected: 'Rechazado' };
    const h = $('#hist');
    if (h) h.innerHTML = list.length ? list.map((w) => `<li><span>$${(w.usd_cents / 100).toFixed(2)} · ${w.currency === 'TON' ? 'TON' : 'USDT'}<br>
      <small class="legal">${new Date(w.created_at).toLocaleDateString('es')}</small></span>
      <span class="tag ${w.status}">${STATUS[w.status]}</span></li>`).join('') : '<li>Aún no hay retiros</li>';
  } catch { /* ignore */ }
}

// ---------- Arranque ----------
async function boot() {
  initTelegram();
  showLoading();
  try {
    [cfg, user] = await Promise.all([api.config(), api.login()]);
    showHome();
  } catch (e) {
    render(`<div class="loading"><div style="text-align:center;padding:16px">😵 ${esc(errMsg(e))}<br><br>
      <button class="btn primary" id="retry">Reintentar</button></div></div>`);
    on('#retry', boot);
  }
}
boot();
if (tg) tg.onEvent?.('viewportChanged', () => window.dispatchEvent(new Event('resize')));
