import { Game } from './game/game.js';
import { CHARACTERS, renderPortraits } from './game/characters.js';
import { api, errMsg, DEMO } from './services/api.js';
import { initTelegram, haptic, tg } from './services/telegram.js';
import { showRewardedAd, preloadAds, preloadAd } from './services/ads.js';
import { initWallet, friendly, short } from './services/wallet.js';
import { sfx, unlockAudio, isMuted, setMuted, startMusic, stopMusic, setMusicSpeed } from './services/sound.js';
import { t, LANG, LOCALE, setLang } from './i18n.js';

const ui = document.getElementById('ui');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.floor(n).toLocaleString(LOCALE);
let PORTRAITS = {};
const portrait = (id, cls = 'portrait') => `<img class="${cls}" src="${PORTRAITS[id] || ''}" alt="">`;
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
// en PC (mouse/teclado) mostramos las teclas; en el celular, los gestos
const KEYBOARD = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

let user = null;
let cfg = null;
let run = null; // { runId, seed, revived, doubled, multiplier }
let dailyShownThisSession = false;
const usd = (coins) => (coins / cfg.coinsPerUsd).toFixed(2);
const multOf = (id) => CHARACTERS[id]?.multiplier ?? 1;
const fmtMult = (m) => 'x' + Number(m).toLocaleString(LOCALE, { maximumFractionDigits: 2 });
const charDesc = (c) => (LANG === 'en' && c.desc_en) || c.desc;

function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.innerHTML = `<div>${esc(msg)}</div>`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.innerHTML = ''), ms);
}
const render = (html) => { ui.innerHTML = html; };
const $ = (sel) => ui.querySelector(sel);
const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = (e) => { sfx.click(); fn(e); }; };

// ---------- Tutorial (carteles en pantalla) ----------
const TUTORIAL_KEY = 'cr-tutorial-done';
function showHint(text, ms = 0) {
  document.getElementById('hint')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="tut-hint" id="hint">${esc(text)}</div>`);
  sfx.hint();
  if (ms) setTimeout(() => document.getElementById('hint')?.remove(), ms);
}
const hideHint = () => document.getElementById('hint')?.remove();
const hintText = (key) => t(KEYBOARD ? key + '_keys' : key);

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
  onCoin() { sfx.coin(); if (game.coins % 10 === 0) haptic('light'); },
  onSpeed(v) { setMusicSpeed(v); },
  onInput(a) {
    if (a === 'left' || a === 'right') sfx.lane();
    else if (a === 'up') sfx.jump();
    else if (a === 'down') sfx.slide();
    else if (a.startsWith('power:')) { sfx.power(); haptic('medium'); toast(t('power_' + a.slice(6))); }
    else if (a === 'bump') { sfx.bump(); haptic('heavy'); }
    else if (a === 'shieldBreak') { sfx.shield(); haptic('heavy'); }
  },
  onTutorial(step) {
    if (step === 'move') showHint(hintText('tut_move'), 3000);
    else if (step === 'jump' || step === 'slide' || step === 'wall') showHint(hintText('tut_' + step));
    else if (step === 'nice') showHint(t('tut_nice'), 900);
    else if (step === 'clear') hideHint();
    else if (step === 'done') { store.set(TUTORIAL_KEY, '1'); setTimeout(() => showHint(t('tut_done'), 2200), 900); }
  },
  onDeath() {
    sfx.crash(); stopMusic(); hideHint();
    haptic('error');
    ui.insertAdjacentHTML('beforeend', '<div class="flash"></div>');
    setTimeout(() => (run.revived ? showGameOver() : showRevive()), 350);
  },
});

if (location.search.includes('debug')) window.__game = game; // solo para pruebas

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'running') { game.pause(); stopMusic(); showPause(); }
});

// ---------- Pantallas ----------
function showLoading() { render(`<div class="loading">🚀 ${esc(t('loading'))}</div>`); }

function showHome() {
  hudEls = null;
  hideHint();
  stopMusic();
  game.toMenu();
  game.setCharacter(user.character);
  const dailyReady = user.daily && !user.daily.claimedToday;
  render(`
  <div class="screen home">
    <div class="topbar">
      <div class="pill">🪙 ${fmt(user.balance)} <small>≈ $${usd(user.balance)}</small></div>
      <div class="top-actions">
        <button class="icon-btn" id="sound" aria-label="${esc(isMuted() ? t('sound_off') : t('sound_on'))}">${isMuted() ? '🔇' : '🔊'}</button>
        <button class="icon-btn lang" id="lang" aria-label="Language">${LANG === 'es' ? 'ES' : 'EN'}</button>
      </div>
    </div>
    <div class="logo"><h1>CRYPTO<br>RUSH</h1><p>${esc(t('logo_sub'))}</p></div>
    <div class="spacer"></div>
    <div class="home-actions">
      <button class="btn primary" id="play">${esc(t('play'))}</button>
      <div class="row">
        <button class="btn btn-icon" id="chars">${portrait(user.character, 'mini')} ${esc(t('characters'))} <span class="mult">${fmtMult(multOf(user.character))}</span></button>
        <button class="btn green" id="wallet">${esc(t('withdraw'))}</button>
      </div>
      <div class="row">
        <button class="btn ${dailyReady ? 'gold-outline' : ''}" id="daily">${esc(t('daily'))}${dailyReady ? '<i class="dot"></i>' : ''}</button>
        <button class="btn" id="invite">${esc(t('invite'))}</button>
      </div>
      ${DEMO ? `<div class="hint" style="color:var(--gold)">${esc(t('demo_hint'))}</div>` : ''}
      <div class="hint">${esc(t(KEYBOARD ? 'controls_keys' : 'controls_touch'))}<br>
      🏁 ${esc(t('record', { n: fmt(user.bestDistance) }))} · ${esc(t('mult_hint', { name: CHARACTERS[user.character]?.name, mult: fmtMult(multOf(user.character)) }))}</div>
    </div>
  </div>`);
  on('#play', startRun);
  on('#chars', showCharacters);
  on('#wallet', showWallet);
  on('#daily', showDaily);
  on('#invite', showInvite);
  on('#sound', () => { setMuted(!isMuted()); toast(isMuted() ? t('sound_off') : t('sound_on'), 1200); showHome(); });
  on('#lang', () => setLang(LANG === 'es' ? 'en' : 'es'));
  if (dailyReady && !dailyShownThisSession) { dailyShownThisSession = true; setTimeout(showDaily, 400); }
}

function showHud() {
  render(`
  <div class="hud">
    <div class="top">
      <div><div class="coins"><span id="h-coins">🪙 0</span> <span class="mult">${fmtMult(run.multiplier)}</span></div><div class="powerups" id="h-pu"></div></div>
      <div style="display:flex"><div class="dist" id="h-dist">0 m</div><button class="pause" id="pause" aria-label="Pause">⏸</button></div>
    </div>
  </div>`);
  hudEls = { coins: $('#h-coins'), dist: $('#h-dist'), pu: $('#h-pu') };
  on('#pause', () => { game.pause(); stopMusic(); showPause(); });
}

function modal(html) {
  ui.insertAdjacentHTML('beforeend', `<div class="modal-bg" id="modal"><div class="modal">${html}</div></div>`);
}
/** Confirmación dentro del juego (los diálogos nativos no funcionan bien en Telegram). */
function askConfirm(text) {
  return new Promise((resolve) => {
    closeModal();
    modal(`<h2>${esc(t('confirm_title'))}</h2><p>${esc(text)}</p>
      <div class="stack"><button class="btn primary" id="c-yes">${esc(t('confirm_yes'))}</button>
      <button class="btn ghost" id="c-no">${esc(t('cancel'))}</button></div>`);
    on('#c-yes', () => { closeModal(); resolve(true); });
    on('#c-no', () => { closeModal(); resolve(false); });
  });
}
const closeModal = () => { $('#modal')?.remove(); $('.flash')?.remove(); };

function showPause() {
  closeModal();
  modal(`<h2>${esc(t('pause_title'))}</h2><p>${esc(t('pause_sub'))}</p>
    <div class="stack"><button class="btn primary" id="resume">${esc(t('resume'))}</button>
    <button class="btn" id="psound">${isMuted() ? '🔇' : '🔊'} ${esc(isMuted() ? t('sound_off') : t('sound_on'))}</button>
    <button class="btn ghost" id="quit">${esc(t('quit'))}</button></div>`);
  on('#resume', () => { closeModal(); unlockAudio(); startMusic(); game.resume(); });
  on('#psound', () => { setMuted(!isMuted()); showPause(); });
  on('#quit', () => { closeModal(); game.state = 'dead'; showGameOver(); });
}

async function startRun() {
  try {
    unlockAudio();
    $('#play').disabled = true;
    run = await api.startRun();
    run.revived = false; run.doubled = false;
    game.setCharacter(user.character);
    showHud();
    game.start(run.seed, { tutorial: store.get(TUTORIAL_KEY) !== '1' });
    startMusic();
    preloadAds();
  } catch (e) {
    toast(errMsg(e));
    showHome();
  }
}

// ---------- Anuncios ----------
// ymid único por anuncio (Monetag solo admite letras, números, - _ .)
const adYmid = (type) => `${run.runId}_${type}`;
const adErrMsg = (e) => {
  const base = e?.message === 'ad_sdk_failed' || e?.message === 'ad_not_completed' ? t(e.message) : errMsg(e);
  return base + (e?.detail ? ` (${e.detail})` : '');
};

/** Aviso que queda detrás del anuncio: al cerrarlo se ve que el juego está confirmando. */
function showVerifying(type) {
  hideVerifying();
  document.body.insertAdjacentHTML('beforeend', `<div class="verifying" id="verifying">
    <div class="spinner"></div><b>${esc(t('verifying'))}</b>
    <small>${esc(t(type === 'revive' ? 'verifying_revive' : 'verifying_double'))}</small></div>`);
}
function hideVerifying() { document.getElementById('verifying')?.remove(); }

async function watchAd(type) {
  const ymid = adYmid(type);
  showVerifying(type);
  try {
    try {
      await showRewardedAd(ymid, type);
    } catch (e) {
      api.reportAdError(type, e.message, e.detail); // queda en el diagnóstico del panel /admin
      throw e;
    }
    // el servidor espera unos segundos el aviso de Monetag; si tarda, lo acepta como pendiente
    try { return await api.claimAd(run.runId, type, ymid); } catch (e) {
      api.reportAdError(type, e.message, 'el servidor rechazó el anuncio');
      throw e;
    }
  } finally {
    hideVerifying();
  }
}

function showRevive() {
  preloadAd(adYmid('revive'), 'revive').catch(() => {});
  let left = 5;
  modal(`<h2>${esc(t('liquidated'))}</h2><p>${esc(t('liquidated_sub'))}</p>
    <div class="ring" id="ring"><span id="count">5</span></div>
    <div class="stack"><button class="btn green" id="revive">${esc(t('revive'))}</button>
    <button class="btn ghost" id="skip">${esc(t('no_thanks'))}</button></div>`);
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
      haptic('success'); sfx.revive();
      toast(t('keep_running'), 1200);
      game.revive();
      startMusic();
    } catch (e) {
      toast(adErrMsg(e), 3500);
      closeModal(); showGameOver();
    }
  });
}

function showGameOver() {
  closeModal();
  hideHint();
  stopMusic();
  hudEls = null;
  const { coins, distance } = game.result;
  if (coins > 0) preloadAd(adYmid('double'), 'double').catch(() => {});
  const mult = run.multiplier ?? 1;
  const total = Math.floor(coins * mult); // igual que el servidor
  render('');
  modal(`<h2>${esc(t('game_over'))}</h2>
    <div class="stats"><div>${esc(t('distance'))}<b>${fmt(distance)} m</b></div><div>${esc(t('best'))}<b>${fmt(Math.max(distance, user.bestDistance))} m</b></div></div>
    <div class="big" id="go-coins">🪙 ${fmt(total)}</div>
    ${mult !== 1 && coins > 0 ? `<p>${esc(t('coins_x', { coins: fmt(coins), mult: fmtMult(mult).slice(1), name: CHARACTERS[game.characterId]?.name }))}</p>` : ''}
    <div class="stack">
      ${coins > 0 ? `<button class="btn primary" id="double">${esc(t('double_btn', { n: fmt(total * 2) }))}</button>` : ''}
      <button class="btn" id="collect">${esc(coins > 0 ? t('collect', { n: fmt(total) }) : t('back_btn'))}</button>
    </div>`);
  const finish = async () => {
    ui.querySelectorAll('.modal button').forEach((b) => (b.disabled = true));
    try {
      const r = await api.endRun(run.runId, coins, distance);
      user = r.user;
      closeModal();
      if (r.credited > 0) { haptic('success'); sfx.cash(); }
      modal(`<h2>${esc(t(r.doubled ? 'doubled' : 'collected'))}</h2>
        <div class="big">+${fmt(r.credited)}</div>
        ${r.pendingBonus ? `<p class="pending">⏳ ${esc(t('pending_bonus', { n: fmt(r.pendingBonus) }))}</p>` : ''}
        <p>${esc(r.capped ? t('capped') : t('balance_line', { b: fmt(user.balance), usd: usd(user.balance) }))}</p>
        <div class="stack"><button class="btn primary" id="again">${esc(t('again'))}</button><button class="btn ghost" id="home">${esc(t('menu'))}</button></div>`);
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
      $('#go-coins').textContent = '🪙 ' + fmt(total * 2);
    } catch (e) {
      toast(adErrMsg(e), 3500);
    }
    finish();
  });
}

// ---------- Recompensa diaria ----------
function showDaily() {
  const d = user.daily;
  if (!d) return;
  closeModal();
  const days = d.rewards.map((r, i) => {
    const n = i + 1;
    const done = d.claimedToday ? n <= d.day : n < d.day;
    const today = n === d.day;
    return `<div class="day ${done ? 'done' : ''} ${today ? 'today' : ''} ${n === d.rewards.length ? 'big-day' : ''}">
      <small>${esc(t('daily_day', { n }))}</small><b>${done ? '✅' : '🪙'}</b><span>${fmt(r)}</span></div>`;
  }).join('');
  const reward = d.rewards[d.day - 1];
  const nextDay = (d.day % d.rewards.length) + 1;
  modal(`<h2>${esc(t('daily_title'))}</h2><p>${esc(t('daily_sub'))}</p>
    <div class="days">${days}</div>
    ${d.streak > 1 ? `<p class="streak">🔥 ${esc(t('daily_streak', { n: d.streak }))}</p>` : ''}
    <div class="stack">
      ${d.claimedToday
        ? `<p class="legal">${esc(t('daily_back', { n: nextDay }))}</p><button class="btn ghost" id="dclose">${esc(t('back_btn'))}</button>`
        : `<button class="btn primary" id="dclaim">${esc(t('daily_claim', { n: fmt(reward) }))}</button>`}
    </div>`);
  on('#dclose', () => { closeModal(); });
  on('#dclaim', async () => {
    $('#dclaim').disabled = true;
    try {
      const r = await api.claimDaily();
      user = r.user;
      sfx.cash(); haptic('success');
      toast(t('daily_claimed', { n: fmt(r.reward) }));
      showHome();
    } catch (e) { toast(errMsg(e)); closeModal(); }
  });
}

// ---------- Invitar amigos ----------
async function showInvite() {
  const rc = cfg.referrals || {};
  render(`<div class="screen scroll">
    <div class="page-head"><button class="back" id="back" aria-label="${esc(t('back_btn'))}">←</button><h2>${esc(t('ref_title'))}</h2></div>
    <div class="box"><p class="ref-rules">${esc(t('ref_rules', { q: fmt(rc.qualifyCoins ?? 1000), bonus: fmt(rc.referrerBonus ?? 2000), welcome: fmt(rc.welcomeBonus ?? 500), pct: Math.round((rc.commission ?? 0.1) * 100) }))}</p></div>
    <div class="box" id="ref-box"><h3>${esc(t('ref_link'))}</h3><p class="legal">${esc(t('loading'))}</p></div>
    <div class="ref-stats" id="ref-stats"></div>
    <div class="box"><h3>${esc(t('ref_list'))}</h3><ul class="list" id="ref-list"><li>${esc(t('loading'))}</li></ul></div>
  </div>`);
  on('#back', showHome);
  let r;
  try { r = await api.referrals(); } catch (e) { toast(errMsg(e)); return; }
  const box = $('#ref-box');
  if (!box) return; // ya salió de la pantalla
  if (!r.link) {
    box.innerHTML = `<h3>${esc(t('ref_link'))}</h3><p class="legal">${esc(t('ref_not_ready'))}</p>`;
  } else {
    box.innerHTML = `<h3>${esc(t('ref_link'))}</h3><div class="ref-link" id="ref-link">${esc(r.link)}</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="share">${esc(t('ref_share'))}</button><button class="btn" id="copy">${esc(t('ref_copy'))}</button></div>`;
    const text = t('ref_share_text', { welcome: fmt(rc.welcomeBonus ?? 500) });
    on('#share', () => {
      const url = `https://t.me/share/url?url=${encodeURIComponent(r.link)}&text=${encodeURIComponent(text)}`;
      if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    });
    on('#copy', async () => {
      try { await navigator.clipboard.writeText(r.link); toast(t('ref_copied')); } catch {
        const sel = window.getSelection(); const range = document.createRange();
        range.selectNodeContents($('#ref-link')); sel.removeAllRanges(); sel.addRange(range);
      }
    });
  }
  $('#ref-stats').innerHTML = `<div><b>${fmt(r.total)}</b><small>${esc(t('ref_friends'))}</small></div>
    <div><b>${fmt(r.qualified)}</b><small>${esc(t('ref_active'))}</small></div>
    <div><b>🪙 ${fmt(r.earnings)}</b><small>${esc(t('ref_earned'))}</small></div>`;
  $('#ref-list').innerHTML = r.friends.length
    ? r.friends.map((f) => `<li><span>${esc(f.name)}<br><small class="legal">${new Date(f.since).toLocaleDateString(LOCALE)}</small></span>
        <span class="tag ${f.status === 'qualified' ? 'paid' : f.status === 'blocked' ? 'rejected' : 'pending'}">${esc(t('ref_' + (f.status || 'pending')))}</span></li>`).join('')
    : `<li>${esc(t('ref_none'))}</li>`;
}

// ---------- Personajes ----------
function showCharacters() {
  const cards = Object.entries(CHARACTERS).map(([id, c]) => {
    const owned = user.owned.includes(id);
    const price = c.price ?? 0;
    const sel = user.character === id;
    return `<div class="card ${sel ? 'sel' : ''}">
      <span class="mult card-mult">${fmtMult(c.multiplier)} ${esc(t('coins_word'))}</span>
      ${portrait(id)}<h3>${esc(c.name)}</h3><p>${esc(charDesc(c))}</p>
      <button class="btn ${owned ? '' : 'primary'}" data-id="${id}" ${sel ? 'disabled' : ''}>
        ${sel ? esc(t('in_use')) : owned ? esc(t('use')) : '🪙 ' + fmt(price)}</button></div>`;
  }).join('');
  render(`<div class="screen scroll">
    <div class="page-head"><button class="back" id="back" aria-label="${esc(t('back_btn'))}">←</button><h2>${esc(t('characters'))}</h2><div class="pill">🪙 ${fmt(user.balance)}</div></div>
    <div class="grid">${cards}</div>
    <p class="legal" style="margin-top:14px">${esc(t('parody_note'))}</p>
  </div>`);
  on('#back', showHome);
  ui.querySelectorAll('[data-id]').forEach((b) => {
    b.onclick = async () => {
      sfx.click();
      const id = b.dataset.id;
      const c = CHARACTERS[id];
      if (!user.owned.includes(id) && !(await askConfirm(t('buy_confirm', { name: c.name, price: fmt(c.price), mult: fmtMult(c.multiplier) })))) return;
      try {
        user = await api.buyCharacter(id);
        game.setCharacter(id);
        haptic('success'); sfx.cash();
        showCharacters();
      } catch (e) { toast(errMsg(e)); }
    };
  });
}

// ---------- Retiros ----------
async function showWallet() {
  game.toMenu();
  const canWithdraw = user.balance >= cfg.minWithdrawCoins;
  render(`<div class="screen scroll">
    <div class="page-head"><button class="back" id="back" aria-label="${esc(t('back_btn'))}">←</button><h2>${esc(t('withdraw_title'))}</h2></div>
    <div class="box"><h3>${esc(t('your_balance'))}</h3>
      <div class="balance">🪙 ${fmt(user.balance)}<small>≈ $${usd(user.balance)}</small></div>
      <p class="legal">${esc(t('rate_line', { rate: fmt(cfg.coinsPerUsd), min: fmt(cfg.minWithdrawCoins), minUsd: usd(cfg.minWithdrawCoins) }))}</p>
    </div>
    <div class="box"><h3>${esc(t('connect_wallet'))}</h3>
      ${DEMO ? `<button class="btn" id="demo-wallet">${esc(t('demo_wallet'))}</button>` : '<div id="ton-btn"></div>'}
      <p class="legal" id="w-addr">${esc(user.wallet ? t('wallet_registered', { w: short(user.wallet) }) : t('wallet_hint'))}</p>
    </div>
    <div class="box"><h3>${esc(t('request_title'))}</h3>
      <label for="cur">${esc(t('receive_in'))}</label>
      <select id="cur">${cfg.currencies.map((c) => `<option value="${c}">${c === 'USDT_TON' ? esc(t('usdt_ton')) : 'TON'}</option>`).join('')}</select>
      <label for="amt">${esc(t('coins_to_withdraw'))}</label>
      <input id="amt" type="number" inputmode="numeric" min="${cfg.minWithdrawCoins}" value="${user.balance}">
      <p class="legal" id="amt-usd"></p>
      <button class="btn green" id="go" style="width:100%" ${canWithdraw ? '' : 'disabled'}>
        ${esc(canWithdraw ? t('request_btn') : t('missing_coins', { n: fmt(cfg.minWithdrawCoins - user.balance) }))}</button>
    </div>
    <div class="box"><h3>${esc(t('history'))}</h3><ul class="list" id="hist"><li>${esc(t('loading'))}</li></ul></div>
    <p class="legal">${esc(t('withdraw_note'))}</p>
  </div>`);
  on('#back', showHome);
  const upd = () => { $('#amt-usd').textContent = '≈ $' + usd(Number($('#amt').value || 0)); };
  $('#amt').oninput = upd; upd();

  on('#demo-wallet', async () => {
    user = await api.setWallet('UQDemo' + 'x'.repeat(38) + 'Demo');
    $('#w-addr').textContent = t('wallet_registered', { w: short(user.wallet) });
  });
  if (!DEMO) initWallet('ton-btn', async (addr) => {
    if (!addr) return;
    try {
      user = await api.setWallet(friendly(addr));
      const el = $('#w-addr');
      if (el) el.textContent = t('wallet_registered', { w: short(user.wallet) });
    } catch (e) { toast(errMsg(e), 3500); }
  });

  on('#go', async () => {
    const coins = Math.floor(Number($('#amt').value));
    if (!(await askConfirm(t('withdraw_confirm', { coins: fmt(coins), usd: usd(coins), cur: $('#cur').value })))) return;
    try {
      const r = await api.withdraw(coins, $('#cur').value);
      user = r.user;
      haptic('success'); sfx.cash();
      toast(t('withdraw_ok', { usd: (r.usdCents / 100).toFixed(2) }));
      showWallet();
    } catch (e) { toast(errMsg(e)); }
  });

  try {
    const list = await api.withdrawals();
    const h = $('#hist');
    if (h) h.innerHTML = list.length ? list.map((w) => `<li><span>$${(w.usd_cents / 100).toFixed(2)} · ${w.currency === 'TON' ? 'TON' : 'USDT'}<br>
      <small class="legal">${new Date(w.created_at).toLocaleDateString(LOCALE)}</small></span>
      <span class="tag ${w.status}">${esc(t('st_' + w.status))}</span></li>`).join('') : `<li>${esc(t('no_withdrawals'))}</li>`;
  } catch { /* ignore */ }
}

// ---------- Arranque ----------
async function boot() {
  initTelegram();
  document.documentElement.lang = LANG;
  showLoading();
  try {
    [cfg, user] = await Promise.all([api.config(), api.login()]);
    try { PORTRAITS = renderPortraits(); } catch { /* sin WebGL extra: quedan sin imagen */ }
    showHome();
  } catch (e) {
    render(`<div class="loading"><div style="text-align:center;padding:16px">😵 ${esc(errMsg(e))}<br><br>
      <button class="btn primary" id="retry">${esc(t('retry'))}</button></div></div>`);
    on('#retry', boot);
  }
}
boot();
if (tg) tg.onEvent?.('viewportChanged', () => window.dispatchEvent(new Event('resize')));
