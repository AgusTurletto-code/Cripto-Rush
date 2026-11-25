import { Game } from './game/game.js';
import { CHARACTERS, renderPortraits } from './game/characters.js';
import { api, errMsg, DEMO } from './services/api.js';
import { initTelegram, haptic, tg, canAskWriteAccess, requestWriteAccess } from './services/telegram.js';
import { showRewardedAd, preloadAds, preloadAd } from './services/ads.js';
import { initWallet, friendly, short } from './services/wallet.js';
import { sfx, unlockAudio, isMuted, setMuted, startMusic, stopMusic, setMusicSpeed } from './services/sound.js';
import { t, LANG, LOCALE, setLang } from './i18n.js';
import { drawWheel, spinTo } from './ui/wheel.js';

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
// con tasas altas los montos chicos dan centavos: mostramos más decimales si hace falta
const usd = (coins) => { const v = coins / cfg.coinsPerUsd; return v > 0 && v < 0.1 ? v.toFixed(3) : v.toFixed(2); };
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
        ${canAskWriteAccess() || user.notify?.allowed ? `<button class="icon-btn" id="bell" aria-label="${esc(user.notify?.allowed && user.notify?.on ? t('notify_on') : t('notify_off'))}">${user.notify?.allowed && user.notify?.on ? '🔔' : '🔕'}</button>` : ''}
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
      <div class="row row3">
        <button class="btn ${dailyReady ? 'gold-outline' : ''}" id="daily">${esc(t('daily'))}${dailyReady ? '<i class="dot"></i>' : ''}</button>
        <button class="btn ${user.spins?.left ? 'gold-outline' : ''}" id="wheelbtn">${esc(t('wheel'))}${user.spins?.left ? `<i class="count">${user.spins.left}</i>` : ''}</button>
        <button class="btn" id="invite">${esc(t('invite'))}</button>
      </div>
      ${DEMO ? `<div class="hint" style="color:var(--gold)">${esc(t('demo_hint'))}</div>` : ''}
      <div class="hint">${esc(t(KEYBOARD ? 'controls_keys' : 'controls_touch'))}<br>
      🏁 ${esc(t('record', { n: fmt(user.bestDistance) }))} · ${esc(t('mult_hint', { name: CHARACTERS[user.character]?.name, mult: fmtMult(multOf(user.character)) }))}<br>
      <button class="linkbtn" id="legal">${esc(t('legal_link'))}</button></div>
    </div>
  </div>`);
  on('#play', startRun);
  on('#chars', showCharacters);
  on('#wallet', showWallet);
  on('#daily', showDaily);
  on('#invite', showInvite);
  on('#wheelbtn', showWheel);
  on('#legal', () => showLegal(showHome));
  if (!user.termsAccepted) { showTermsGate(); return; }
  on('#bell', async () => {
    if (!user.notify?.allowed) return askNotify(showHome, true);
    try { user = await api.setNotify({ on: !user.notify.on }); toast(t(user.notify.on ? 'notify_on' : 'notify_off'), 1500); } catch (e) { toast(errMsg(e)); }
    showHome();
  });
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
    <small>${esc(t({ revive: 'verifying_revive', double: 'verifying_double', spin: 'verifying_spin' }[type]))}</small></div>`);
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
      on('#home', () => { closeModal(); if (r.credited > 0 && shouldOfferNotify()) askNotify(showHome); else showHome(); });
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

// ---------- Avisos del bot ----------
const NOTIFY_ASKED = 'cr-notify-asked';
function shouldOfferNotify() {
  if (user.notify?.allowed || !canAskWriteAccess()) return false;
  const last = Number(store.get(NOTIFY_ASKED) || 0);
  return Date.now() - last > 3 * 864e5;
}

/** Explica para qué sirven los avisos y, si acepta, pide el permiso oficial de Telegram. */
function askNotify(after, direct = false) {
  store.set(NOTIFY_ASKED, String(Date.now()));
  const go = async () => {
    const granted = await requestWriteAccess();
    if (granted) {
      try { user = await api.setNotify({ allowed: true, on: true }); haptic('success'); toast(t('notify_on')); } catch (e) { toast(errMsg(e)); }
    } else toast(t('notify_denied'), 3500);
    after();
  };
  if (direct) return go();
  closeModal();
  modal(`<h2>${esc(t('notify_title'))}</h2><p>${esc(t('notify_body'))}</p>
    <div class="stack"><button class="btn primary" id="n-yes">${esc(t('notify_yes'))}</button>
    <button class="btn ghost" id="n-no">${esc(t('notify_no'))}</button></div>`);
  on('#n-yes', () => { closeModal(); go(); });
  on('#n-no', () => { closeModal(); after(); });
}

// ---------- Términos y privacidad ----------
const MIN_AGE = 18;
let legalCache = null;
async function loadLegal() {
  if (!legalCache) legalCache = await api.legal(LANG);
  return legalCache;
}

/** Pantalla con los términos completos (los arma el servidor con los valores reales). */
async function showLegal(back) {
  render(`<div class="screen scroll">
    <div class="page-head"><button class="back" id="back" aria-label="${esc(t('back_btn'))}">←</button><h2>${esc(t('legal_title'))}</h2></div>
    <div class="box legal-doc" id="legal-doc">${esc(t('loading'))}</div></div>`);
  on('#back', back);
  try {
    const l = await loadLegal();
    const box = $('#legal-doc');
    if (box) box.innerHTML = l.html; // contenido de nuestro propio servidor
  } catch (e) { toast(errMsg(e)); }
}

/** Primera vez (o términos nuevos): hay que aceptarlos para seguir. */
function showTermsGate() {
  closeModal();
  modal(`<h2>${esc(t('terms_welcome'))}</h2><p class="terms-sum">${esc(t('terms_summary'))}</p>
    <div class="stack"><button class="btn" id="t-read">${esc(t('terms_read'))}</button>
    <button class="btn primary" id="t-ok">${esc(t('terms_accept', { age: MIN_AGE }))}</button></div>`);
  on('#t-read', () => showLegal(() => { showHome(); }));
  on('#t-ok', async () => {
    $('#t-ok').disabled = true;
    try {
      const l = await loadLegal();
      user = await api.acceptTerms(l.version);
      closeModal(); haptic('success');
      showHome();
    } catch (e) { toast(errMsg(e)); $('#t-ok').disabled = false; }
  });
}

// ---------- Ruleta ----------
let wheelAngle = 0;
let wheelTimer = null;
const fmtWait = (ms) => {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

function showWheel() {
  const w = cfg.wheel;
  if (!w) return;
  // probabilidades agrupadas por premio (el 50 aparece en dos casilleros)
  const byPrize = new Map();
  for (const s of w.segments) if (!s.jackpot) byPrize.set(s.coins, (byPrize.get(s.coins) || 0) + s.odds);
  const jackpot = w.segments.find((s) => s.jackpot);
  const pct = (p) => (p * 100).toLocaleString(LOCALE, { maximumFractionDigits: 2 }) + '%';
  const oddsRows = [...byPrize.entries()].sort((a, b) => a[0] - b[0])
    .map(([coins, p]) => `<li><span>🪙 ${fmt(coins)}</span><span>${pct(p)}</span></li>`).join('')
    + (jackpot ? `<li class="jp"><span>${esc(t('odds_jackpot', { usd: w.jackpotUsd, n: fmt(Math.round(1 / jackpot.odds)) }))}</span></li>` : '');

  render(`<div class="screen scroll">
    <div class="page-head"><button class="back" id="back" aria-label="${esc(t('back_btn'))}">←</button><h2>${esc(t('wheel_title'))}</h2><div class="pill" id="wbal">🪙 ${fmt(user.balance)}</div></div>
    <p class="wheel-sub">${esc(t('wheel_sub', { max: w.spinsPer24h }))}</p>
    <div class="wheel-wrap"><div class="wheel-pointer" aria-hidden="true"></div><canvas id="wheel" class="wheel" aria-label="${esc(t('wheel_title'))}"></canvas></div>
    <p class="spins-left" id="spins-left"></p>
    <button class="btn primary" id="spin" style="width:100%"></button>
    <div class="box" style="margin-top:14px"><h3>${esc(t('odds_title'))}</h3><ul class="list odds">${oddsRows}</ul>
      <p class="legal">${esc(t('wheel_note'))} <button class="linkbtn" id="wlegal">${esc(t('legal_link'))}</button></p></div>
  </div>`);
  const canvas = $('#wheel');
  drawWheel(canvas, w.segments, { jackpot: t('jackpot_label', { usd: w.jackpotUsd }), fmt });
  canvas.style.transform = `rotate(${wheelAngle}deg)`;
  on('#back', () => { clearInterval(wheelTimer); showHome(); });
  on('#spin', doSpin);
  on('#wlegal', () => { clearInterval(wheelTimer); showLegal(showWheel); });
  updateSpinUi();
  clearInterval(wheelTimer);
  wheelTimer = setInterval(() => { if (!$('#spin')) clearInterval(wheelTimer); else updateSpinUi(); }, 30000);
}

function updateSpinUi(busy = false) {
  const s = user.spins || { left: 0, max: 10 };
  const btn = $('#spin');
  if (!btn) return;
  $('#spins-left').textContent = t('spins_left', { n: s.left, max: s.max });
  if (s.left > 0) { btn.disabled = busy; btn.textContent = t('spin_btn'); }
  else { btn.disabled = true; btn.textContent = t('spin_next', { time: fmtWait((s.nextAt || Date.now()) - Date.now()) }); }
}

async function doSpin() {
  unlockAudio();
  updateSpinUi(true);
  let start;
  try { start = await api.spinStart(); } catch (e) { toast(errMsg(e)); updateSpinUi(); return; }
  showVerifying('spin');
  try {
    await showRewardedAd(start.ymid, 'spin');
  } catch (e) {
    hideVerifying();
    api.reportAdError('spin', e.message, e.detail);
    toast(adErrMsg(e), 3500);
    updateSpinUi();
    return;
  }
  let r;
  try { r = await api.spinClaim(start.spinId); } catch (e) { hideVerifying(); toast(errMsg(e), 3500); updateSpinUi(); return; }
  hideVerifying();
  user = r.user;
  const canvas = $('#wheel');
  if (canvas) {
    wheelAngle = await spinTo(canvas, r.segment, cfg.wheel.segments.length, { from: wheelAngle, onTick: () => { sfx.tick(); haptic('light'); } });
  }
  if (r.jackpot) {
    sfx.jackpot(); haptic('success'); confetti();
    modal(`<h2>${esc(t('jackpot_title'))}</h2><div class="big">💎 ${cfg.wheel.jackpotUsd} USD</div>
      <p>${esc(t('jackpot_body', { usd: cfg.wheel.jackpotUsd }))}</p>
      ${r.pending ? `<p class="pending">⏳ ${esc(t('jackpot_pending'))}</p>` : ''}
      <div class="stack"><button class="btn green" id="jp-wallet">${esc(t('withdraw'))}</button><button class="btn ghost" id="jp-close">${esc(t('back_btn'))}</button></div>`);
    on('#jp-wallet', () => { closeModal(); clearInterval(wheelTimer); showWallet(); });
    on('#jp-close', closeModal);
  } else {
    sfx.cash(); haptic('success');
    toast(t('spin_won', { n: fmt(r.coins) }) + (r.pending ? ' ⏳ ' + t('spin_pending') : ''), r.pending ? 4000 : 2200);
  }
  const bal = $('#wbal'); if (bal) bal.textContent = '🪙 ' + fmt(user.balance);
  updateSpinUi();
}

function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#ffd60a', '#ff006e', '#3a86ff', '#2ec4b6', '#fb5607', '#fff'];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.8 + 's';
    p.style.animationDuration = 2.2 + Math.random() * 1.6 + 's';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4500);
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
  try { cfg = await api.config(); } catch { /* se usa la anterior */ } // la tasa cambia sola: traer la actual
  const canWithdraw = user.balance >= cfg.minWithdrawCoins;
  render(`<div class="screen scroll">
    <div class="page-head"><button class="back" id="back" aria-label="${esc(t('back_btn'))}">←</button><h2>${esc(t('withdraw_title'))}</h2></div>
    <div class="box"><h3>${esc(t('your_balance'))}</h3>
      <div class="balance">🪙 ${fmt(user.balance)}<small>≈ $${usd(user.balance)}</small></div>
      <p class="legal">${esc(t('rate_line', { rate: fmt(cfg.coinsPerUsd), min: fmt(cfg.minWithdrawCoins), minUsd: usd(cfg.minWithdrawCoins) }))}<br>${esc(t('rate_auto'))}</p>
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
    <p class="legal">${esc(t('withdraw_note'))} <button class="linkbtn" id="wdlegal">${esc(t('legal_link'))}</button></p>
  </div>`);
  on('#back', showHome);
  on('#wdlegal', () => showLegal(showWallet));
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
