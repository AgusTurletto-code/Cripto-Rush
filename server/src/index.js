import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { db, tx } from './db.js';
import { validateInitData, signSession, verifySession } from './auth.js';
import { checkRun, CHARACTERS, multiplierOf, creditFor } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));

const now = () => Date.now();
const DAY = 24 * 3600 * 1000;
const startOfDay = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); };

class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.code });
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
};

/** Explica en qué difieren dos secretos, sin mostrarlos (para el panel admin). */
function secretHint(got, want) {
  if (!got) return 'la URL de Monetag no trae secret= (¿falta en el Postback URL?)';
  if (got === 'TU_SECRETO') return 'en Monetag quedó escrito TU_SECRETO: reemplazalo por tu contraseña';
  if (got.startsWith('{') || got.includes('}')) return 'el secreto de Monetag tiene llaves { }: va sin llaves';
  if (got.toLowerCase() === want.toLowerCase()) return 'solo difieren mayúsculas/minúsculas';
  if (got.length !== want.length) return `Monetag manda ${got.length} caracteres y Railway tiene ${want.length}`;
  let diff = 0; for (let i = 0; i < got.length; i++) if (got[i] !== want[i]) diff++;
  return `mismo largo (${got.length}) pero ${diff} carácter(es) distintos`;
}

/**
 * Llegó la confirmación de Monetag para un anuncio que el juego ya aceptó "pendiente":
 * marca el anuncio como verificado y, si era un x2 de una partida ya cobrada, paga la mitad que faltaba.
 */
function settlePendingAd(ymid, telegramId) {
  const m = ymid.match(/^(.+)_(revive|double)$/);
  if (!m) return;
  const [, runId, type] = m;
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
  if (!run || (telegramId && telegramId !== run.user_id)) return;
  db.prepare('UPDATE ad_events SET verified = 1 WHERE run_id = ? AND type = ?').run(runId, type);
  if (type === 'double' && run.status === 'finished' && run.pending_bonus > 0) {
    const bonus = run.pending_bonus;
    db.prepare('UPDATE runs SET pending_bonus = 0, credited = credited + ? WHERE id = ?').run(bonus, runId);
    db.prepare('UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?').run(bonus, bonus, run.user_id);
    payReferral(run.user_id, bonus);
    console.log(`[ads] x2 confirmado tarde: +${bonus} a ${run.user_id}`);
  }
}

// ---------- Diagnóstico de anuncios (en memoria, últimos 30 eventos) ----------
const adLog = [];
function logAd(entry) {
  adLog.unshift({ at: now(), ...entry });
  adLog.length = Math.min(adLog.length, 30);
  console.log('[ads]', JSON.stringify(entry));
}

// ---------- Utilidades ----------
const dayStr = (t = now()) => new Date(t).toISOString().slice(0, 10); // fecha UTC AAAA-MM-DD

/** Wallet TON normalizada (workchain:hash): EQ…/UQ…/raw de la misma wallet dan lo mismo. */
function walletKey(address) {
  const raw = address.match(/^(-?\d+):([0-9a-fA-F]{64})$/);
  if (raw) return `${Number(raw[1])}:${raw[2].toLowerCase()}`;
  try {
    const b = Buffer.from(address.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (b.length !== 36) return address;
    return `${b.readInt8(1)}:${b.subarray(2, 34).toString('hex')}`;
  } catch { return address; }
}

const clip = (v, n = 80) => String(v ?? '').slice(0, n);
function recordDevice(userId, device, ip) {
  const deviceId = clip(device?.id, 64) || 'none';
  const fp = clip(device?.fp, 64) || 'none';
  db.prepare(`INSERT INTO user_devices (user_id, device_id, fp, ip, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, device_id, ip) DO UPDATE SET last_seen = excluded.last_seen, fp = excluded.fp`)
    .run(userId, deviceId, fp, clip(ip, 64) || 'none', now(), now());
}

/**
 * Otras cuentas que comparten algo con esta:
 *  - device: mismo navegador/teléfono (señal fuerte)
 *  - wallet: misma wallet TON (señal fuerte)
 *  - ip: misma IP en los últimos 30 días (señal débil: familias, wifi público, datos móviles comparten IP)
 */
function linkedAccounts(userId) {
  const q = (sql, ...a) => db.prepare(sql).all(...a).map((r) => r.user_id);
  const device = q(`SELECT DISTINCT b.user_id FROM user_devices a JOIN user_devices b ON a.device_id = b.device_id
                    WHERE a.user_id = ? AND b.user_id != a.user_id AND a.device_id != 'none'`, userId);
  const ip = q(`SELECT DISTINCT b.user_id FROM user_devices a JOIN user_devices b ON a.ip = b.ip
                WHERE a.user_id = ? AND b.user_id != a.user_id AND a.ip != 'none' AND b.last_seen >= ?`, userId, now() - 30 * DAY);
  const u = db.prepare('SELECT wallet_key FROM users WHERE id = ?').get(userId);
  const wallet = u?.wallet_key ? q('SELECT id AS user_id FROM users WHERE wallet_key = ? AND id != ?', u.wallet_key, userId) : [];
  return { device, ip, wallet };
}

/** ¿Estas dos cuentas parecen ser la misma persona? (para no pagar auto-referidos) */
function sameOwner(a, b) {
  const l = linkedAccounts(a);
  return l.device.includes(b) || l.wallet.includes(b);
}

// ---------- Usuarios ----------
const getUser = db.prepare('SELECT * FROM users WHERE id = ?');

function publicUser(u) {
  const earnedToday = db.prepare(
    `SELECT COALESCE(SUM(credited),0) AS s FROM runs WHERE user_id = ? AND ended_at >= ?`
  ).get(u.id, startOfDay()).s;
  return {
    id: u.id,
    name: u.first_name || u.username || 'Jugador',
    balance: u.balance,
    totalEarned: u.total_earned,
    bestDistance: u.best_distance,
    wallet: u.wallet,
    character: u.character,
    owned: JSON.parse(u.owned),
    earnedToday,
    daily: dailyState(u),
  };
}

function dailyState(u) {
  const today = dayStr(), yesterday = dayStr(now() - DAY);
  const claimedToday = u.daily_last === today;
  const alive = claimedToday || u.daily_last === yesterday; // la racha sigue viva
  const streak = alive ? u.daily_streak : 0;
  const n = config.economy.dailyRewards.length;
  // día que toca reclamar (1..7); si ya reclamó hoy, el que reclamó
  const day = claimedToday ? ((streak - 1) % n) + 1 : (streak % n) + 1;
  return { claimedToday, streak, day, rewards: config.economy.dailyRewards };
}

function auth(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const userId = verifySession(token);
  if (!userId) return next(new ApiError(401, 'unauthorized'));
  const user = getUser.get(userId);
  if (!user) return next(new ApiError(401, 'unauthorized'));
  if (user.banned) return next(new ApiError(403, 'banned'));
  req.user = user;
  next();
}

// ---------- Rutas públicas ----------
app.get('/api/config', wrap(() => ({
  coinsPerUsd: config.economy.coinsPerUsd,
  minWithdrawCoins: config.economy.minWithdrawCoins,
  dailyCoinCap: config.economy.dailyCoinCap,
  currencies: config.economy.currencies,
  characters: CHARACTERS,
  devMode: config.devMode,
  dailyRewards: config.economy.dailyRewards,
  referrals: {
    commission: config.referrals.commission,
    qualifyCoins: config.referrals.qualifyCoins,
    referrerBonus: config.referrals.referrerBonus,
    welcomeBonus: config.referrals.welcomeBonus,
  },
})));

app.post('/api/auth', wrap((req) => {
  let tgUser = validateInitData(req.body?.initData);
  if (!tgUser && config.devMode) {
    tgUser = { id: req.body?.devUserId || 'dev-1', first_name: 'Dev', username: 'dev' };
  }
  if (!tgUser) throw new ApiError(401, 'invalid_init_data');

  const id = String(tgUser.id);
  const isNew = !getUser.get(id);
  db.prepare(`
    INSERT INTO users (id, username, first_name, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name
  `).run(id, tgUser.username || null, tgUser.first_name || null, now());
  recordDevice(id, req.body?.device, req.ip);

  // Referido: solo al crear la cuenta, con start_param = ref_<id del que invitó>
  const startParam = tgUser.start_param || (config.devMode ? String(req.body?.devStartParam || '') : '');
  const refMatch = startParam.match(/^ref_(\w{1,32})$/);
  if (isNew && refMatch && refMatch[1] !== id && getUser.get(refMatch[1])) {
    // si comparte dispositivo o wallet con quien lo invitó, es un auto-referido: queda bloqueado
    const status = sameOwner(id, refMatch[1]) ? 'blocked' : 'pending';
    db.prepare('UPDATE users SET referred_by = ?, ref_status = ? WHERE id = ?').run(refMatch[1], status, id);
    console.log(`[ref] ${id} invitado por ${refMatch[1]} (${status})`);
  }

  return { token: signSession(id), user: publicUser(getUser.get(id)) };
}));

// Postback de Monetag: lo llama su servidor por cada evento confirmado (impression / click).
// Configurar en el panel de Monetag (ajustes de la zona principal → Postback URL):
// https://TU-DOMINIO/api/ads/postback?secret=TU_SECRETO&ymid={ymid}&event_type={event_type}&reward_event_type={reward_event_type}&telegram_id={telegram_id}&estimated_price={estimated_price}
app.get('/api/ads/postback', wrap((req) => {
  // sin secreto configurado el endpoint queda apagado: cualquiera podría falsificar anuncios vistos
  const got = String(req.query.secret ?? '').trim();
  if (!config.adPostbackSecret || got !== config.adPostbackSecret) {
    logAd({ kind: 'postback', result: config.adPostbackSecret ? 'secreto incorrecto: ' + secretHint(got, config.adPostbackSecret) : 'AD_POSTBACK_SECRET no está configurado',
      ymid: String(req.query.ymid || ''), reward: String(req.query.reward_event_type || '') });
    throw new ApiError(403, 'bad_secret');
  }
  const ymid = String(req.query.ymid || '');
  const valued = req.query.reward_event_type === 'valued';
  const price = Math.max(0, Number(req.query.estimated_price) || 0);
  // solo se registran eventos pagados ("valued"); impresión y click llegan con el mismo ymid
  logAd({ kind: 'postback', result: 'ok', ymid, reward: String(req.query.reward_event_type || ''),
    event: String(req.query.event_type || ''), price });
  if (ymid && valued) {
    tx(() => {
      db.prepare(`INSERT INTO ad_postbacks (ymid, created_at, telegram_id, revenue) VALUES (?, ?, ?, ?)
                  ON CONFLICT(ymid) DO UPDATE SET revenue = revenue + excluded.revenue`)
        .run(ymid, now(), String(req.query.telegram_id || ''), price);
      settlePendingAd(ymid, String(req.query.telegram_id || ''));
    });
  }
  return { ok: true };
}));

// ---------- Rutas autenticadas ----------
const api = express.Router();
api.use(auth);

api.get('/me', wrap((req) => publicUser(req.user)));

// el juego informa cuando un anuncio falla (para el diagnóstico del panel)
api.post('/ads/error', wrap((req) => {
  const clip = (v) => String(v ?? '').slice(0, 160);
  logAd({ kind: 'juego', user: req.user.id, type: clip(req.body?.type), code: clip(req.body?.code), detail: clip(req.body?.detail) });
  return { ok: true };
}));

api.post('/run/start', wrap((req) => {
  // cierra partidas viejas que quedaron abiertas
  db.prepare(`UPDATE runs SET status='rejected', reject_reason='abandoned', ended_at=?
              WHERE user_id=? AND status='active'`).run(now(), req.user.id);
  const id = crypto.randomUUID();
  const seed = crypto.randomInt(1, 2 ** 31 - 1);
  // el multiplicador se fija al empezar: cambiar de personaje a mitad de partida no lo altera
  const multiplier = multiplierOf(req.user.character);
  db.prepare('INSERT INTO runs (id, user_id, seed, started_at, character, multiplier) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.user.id, seed, now(), req.user.character, multiplier);
  return { runId: id, seed, multiplier };
}));

function getActiveRun(userId, runId) {
  const run = db.prepare('SELECT * FROM runs WHERE id = ? AND user_id = ?').get(runId, userId);
  if (!run) throw new ApiError(404, 'run_not_found');
  if (run.status !== 'active') throw new ApiError(409, 'run_closed');
  return run;
}

/**
 * El cliente llama acá después de que el anuncio de Monetag terminó.
 * type = 'revive' (máx 1 por partida) | 'double' (máx 1 por partida)
 */
function claimAd(req, allowPending = false) {
  const { runId, type, ymid } = req.body || {};
  if (!['revive', 'double'].includes(type)) throw new ApiError(400, 'bad_type');
  const run = getActiveRun(req.user.id, runId);

  const adsToday = db.prepare('SELECT COUNT(*) AS c FROM ad_events WHERE user_id = ? AND created_at >= ?')
    .get(req.user.id, now() - DAY).c;
  if (adsToday >= config.economy.maxAdsPerDay) throw new ApiError(429, 'ad_limit');

  if (type === 'revive' && run.revives >= 1) throw new ApiError(409, 'already_revived');
  if (type === 'double' && run.doubled) throw new ApiError(409, 'already_doubled');

  let verified = 0;
  if (config.adVerifyMode === 'postback') {
    const expected = `${run.id}_${type}`;
    if (ymid !== expected) throw new ApiError(400, 'ad_not_verified');
    const pb = db.prepare('SELECT telegram_id FROM ad_postbacks WHERE ymid = ?').get(expected);
    // el anuncio lo tiene que haber visto este mismo usuario de Telegram
    if (pb?.telegram_id && pb.telegram_id !== req.user.id) throw new ApiError(403, 'ad_not_verified');
    if (pb) verified = 1;
    else if (!allowPending) throw new ApiError(402, 'ad_not_verified');
    // si no llegó todavía, se acepta como pendiente: el revivir sigue y el x2 paga la mitad extra al confirmarse
  } else {
    verified = 1;
  }

  tx(() => {
    db.prepare('INSERT INTO ad_events (user_id, run_id, type, verified, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, run.id, type, verified, now());
    if (type === 'revive') db.prepare('UPDATE runs SET revives = revives + 1 WHERE id = ?').run(run.id);
    else db.prepare('UPDATE runs SET doubled = 1 WHERE id = ?').run(run.id);
  });
  return { ok: true, pending: !verified };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
api.post('/ads/claim', async (req, res) => {
  // Esperamos un poco el aviso de Monetag; si tarda más, se acepta como pendiente (sin hacer esperar al jugador).
  const deadline = now() + 2500;
  for (;;) {
    try {
      return res.json(claimAd(req, now() >= deadline));
    } catch (e) {
      if (e instanceof ApiError && e.status === 402 && e.code === 'ad_not_verified' && now() < deadline) {
        await sleep(150);
        continue;
      }
      if (e instanceof ApiError) return res.status(e.status).json({ error: e.code });
      console.error(e);
      return res.status(500).json({ error: 'server_error' });
    }
  }
});

api.post('/run/end', wrap((req) => {
  const { runId } = req.body || {};
  const coins = Number(req.body?.coins);
  const distance = Number(req.body?.distance);
  const run = getActiveRun(req.user.id, runId);
  const serverSeconds = (now() - run.started_at) / 1000;

  const reason = checkRun({ coins, distance, serverSeconds });
  if (reason) {
    db.prepare(`UPDATE runs SET status='rejected', reject_reason=?, ended_at=?, coins=?, distance=? WHERE id=?`)
      .run(reason, now(), coins | 0, distance | 0, run.id);
    console.warn(`[anticheat] user=${req.user.id} run=${run.id} ${reason} coins=${coins} dist=${distance} t=${serverSeconds}`);
    throw new ApiError(422, 'run_rejected');
  }

  return tx(() => {
    const earnedToday = db.prepare(
      'SELECT COALESCE(SUM(credited),0) AS s FROM runs WHERE user_id = ? AND ended_at >= ?'
    ).get(req.user.id, startOfDay()).s;
    // ¿el x2 ya está confirmado por Monetag? (si no, la mitad extra queda pendiente hasta el postback)
    const doubleOk = run.doubled && (config.adVerifyMode !== 'postback'
      || !!db.prepare('SELECT 1 FROM ad_postbacks WHERE ymid = ?').get(`${run.id}_double`));
    const pendingBonus = run.doubled && !doubleOk ? creditFor(coins, run.multiplier, false) : 0;
    const gross = creditFor(coins, run.multiplier, doubleOk);
    const cap = config.economy.dailyCoinCap;
    const credited = cap > 0 ? Math.max(0, Math.min(gross, cap - earnedToday)) : gross;

    db.prepare(`UPDATE runs SET status='finished', ended_at=?, coins=?, distance=?, credited=?, pending_bonus=? WHERE id=?`)
      .run(now(), coins, Math.floor(distance), credited, pendingBonus, run.id);
    db.prepare(`UPDATE users SET balance = balance + ?, total_earned = total_earned + ?,
                best_distance = MAX(best_distance, ?) WHERE id = ?`)
      .run(credited, credited, Math.floor(distance), req.user.id);
    payReferral(req.user.id, credited);

    return {
      credited,
      capped: credited < gross,
      doubled: !!run.doubled,
      pendingBonus,
      multiplier: run.multiplier,
      user: publicUser(getUser.get(req.user.id)),
    };
  });
}));

/** Comisión para quien invitó + premios cuando el amigo califica. Todo dentro de la transacción de la partida. */
function payReferral(userId, credited) {
  const u = getUser.get(userId);
  if (!u.referred_by || u.ref_status === 'blocked' || credited <= 0) return;
  const r = config.referrals;
  const addTo = (id, coins, refEarn = 0) => db.prepare(
    'UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, ref_earnings = ref_earnings + ? WHERE id = ?'
  ).run(coins, coins, refEarn, id);

  if (u.ref_status === 'pending') {
    // monedas ganadas jugando (sin contar premios): el amigo tiene que jugar de verdad
    const played = db.prepare(`SELECT COALESCE(SUM(credited),0) s FROM runs WHERE user_id = ? AND status = 'finished'`).get(userId).s;
    if (played < r.qualifyCoins) return; // todavía no califica: aún no hay comisión
    if (sameOwner(userId, u.referred_by)) { // se volvió a revisar al calificar
      db.prepare(`UPDATE users SET ref_status = 'blocked' WHERE id = ?`).run(userId);
      return;
    }
    db.prepare(`UPDATE users SET ref_status = 'qualified' WHERE id = ?`).run(userId);
    addTo(u.referred_by, r.referrerBonus, r.referrerBonus);
    addTo(userId, r.welcomeBonus);
    console.log(`[ref] ${userId} calificó: +${r.referrerBonus} a ${u.referred_by}, +${r.welcomeBonus} a ${userId}`);
  }
  const commission = Math.floor(credited * r.commission);
  if (commission > 0) addTo(u.referred_by, commission, commission);
}

// Recompensa diaria
api.post('/daily/claim', wrap((req) => tx(() => {
  const u = getUser.get(req.user.id);
  const today = dayStr();
  if (u.daily_last === today) throw new ApiError(409, 'already_claimed');
  const streak = u.daily_last === dayStr(now() - DAY) ? u.daily_streak + 1 : 1;
  const rewards = config.economy.dailyRewards;
  const reward = rewards[(streak - 1) % rewards.length];
  db.prepare(`UPDATE users SET balance = balance + ?, total_earned = total_earned + ?, daily_streak = ?, daily_last = ? WHERE id = ?`)
    .run(reward, reward, streak, today, u.id);
  return { reward, streak, user: publicUser(getUser.get(u.id)) };
})));

// Referidos: link para compartir y lista de invitados
api.get('/referrals', wrap((req) => {
  const r = config.referrals;
  const rows = db.prepare(`SELECT id, first_name, username, ref_status, created_at FROM users
                           WHERE referred_by = ? ORDER BY created_at DESC LIMIT 50`).all(req.user.id);
  const counts = db.prepare(`SELECT COUNT(*) total, SUM(ref_status = 'qualified') qualified FROM users WHERE referred_by = ?`).get(req.user.id);
  return {
    link: r.botUsername ? `https://t.me/${r.botUsername}/${r.miniAppName}?startapp=ref_${req.user.id}` : null,
    total: counts.total || 0,
    qualified: counts.qualified || 0,
    earnings: getUser.get(req.user.id).ref_earnings,
    friends: rows.map((f) => ({ name: f.first_name || f.username || 'Jugador', status: f.ref_status, since: f.created_at })),
  };
}));

api.post('/character/buy', wrap((req) => {
  const id = req.body?.id;
  const ch = CHARACTERS[id];
  if (!ch) throw new ApiError(404, 'no_character');
  return tx(() => {
    const u = getUser.get(req.user.id);
    const owned = JSON.parse(u.owned);
    if (!owned.includes(id)) {
      if (u.balance < ch.price) throw new ApiError(402, 'not_enough_coins');
      owned.push(id);
      db.prepare('UPDATE users SET balance = balance - ?, owned = ? WHERE id = ?')
        .run(ch.price, JSON.stringify(owned), u.id);
    }
    db.prepare('UPDATE users SET character = ? WHERE id = ?').run(id, u.id);
    return publicUser(getUser.get(u.id));
  });
}));

api.post('/wallet', wrap((req) => {
  const address = String(req.body?.address || '').trim();
  // Direcciones TON: formato raw (0:hex) o "user-friendly" base64url de 48 caracteres
  if (!/^(-?\d:[0-9a-fA-F]{64}|[A-Za-z0-9_\-+/]{48})$/.test(address)) throw new ApiError(400, 'bad_address');
  const key = walletKey(address);
  const other = db.prepare('SELECT id FROM users WHERE wallet_key = ? AND id != ?').get(key, req.user.id);
  if (other) {
    console.warn(`[multicuenta] ${req.user.id} intentó usar la wallet de ${other.id}`);
    throw new ApiError(409, 'wallet_in_use');
  }
  db.prepare('UPDATE users SET wallet = ?, wallet_key = ? WHERE id = ?').run(address, key, req.user.id);
  return publicUser(getUser.get(req.user.id));
}));

api.get('/withdrawals', wrap((req) =>
  db.prepare('SELECT id, coins, usd_cents, currency, status, tx_hash, created_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 20')
    .all(req.user.id)
));

api.post('/withdraw', wrap((req) => {
  const coins = Math.floor(Number(req.body?.coins));
  const currency = req.body?.currency;
  const e = config.economy;
  if (!e.currencies.includes(currency)) throw new ApiError(400, 'bad_currency');
  if (!Number.isFinite(coins) || coins < e.minWithdrawCoins) throw new ApiError(400, 'below_minimum');

  return tx(() => {
    const u = getUser.get(req.user.id);
    if (!u.wallet) throw new ApiError(400, 'no_wallet');
    if (u.balance < coins) throw new ApiError(402, 'not_enough_coins');
    const recent = db.prepare(`SELECT COUNT(*) AS c FROM withdrawals WHERE user_id = ? AND created_at >= ? AND status != 'rejected'`)
      .get(u.id, now() - DAY).c;
    if (recent >= e.maxWithdrawalsPerDay) throw new ApiError(429, 'withdraw_limit');

    const usdCents = Math.floor((coins / e.coinsPerUsd) * 100);
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(coins, u.id);
    db.prepare(`INSERT INTO withdrawals (user_id, coins, usd_cents, currency, wallet, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(u.id, coins, usdCents, currency, u.wallet, now());
    return { ok: true, usdCents, user: publicUser(getUser.get(u.id)) };
  });
}));

// ---------- Admin (header x-admin-key) ----------
const admin = express.Router();
admin.use((req, _res, next) => {
  if (!config.adminKey || req.headers['x-admin-key'] !== config.adminKey) return next(new ApiError(403, 'forbidden'));
  next();
});
admin.get('/withdrawals', wrap((req) =>
  db.prepare(`SELECT w.*, u.username, u.first_name, u.total_earned, u.referred_by, u.ref_status, u.created_at AS user_created,
              (SELECT COUNT(*) FROM runs r WHERE r.user_id = w.user_id AND r.status='rejected') AS rejected_runs,
              (SELECT COALESCE(SUM(credited),0) FROM runs r WHERE r.user_id = w.user_id AND r.status='finished') AS played_coins,
              (SELECT COUNT(*) FROM ad_events e WHERE e.user_id = w.user_id AND e.verified = 0 AND e.created_at < ?) AS unverified_ads
              FROM withdrawals w JOIN users u ON u.id = w.user_id
              WHERE w.status = ? ORDER BY w.id`).all(now() - 15 * 60 * 1000, req.query.status || 'pending')
    .map((w) => {
      const l = linkedAccounts(w.user_id);
      return { ...w, linked: { device: l.device.length, ip: l.ip.length, wallet: l.wallet.length } };
    })
));
admin.get('/users/:id', wrap((req) => {
  const u = getUser.get(req.params.id);
  if (!u) throw new ApiError(404, 'not_found');
  const l = linkedAccounts(u.id);
  const brief = (ids) => ids.map((id) => {
    const x = getUser.get(id);
    return x && { id, name: x.first_name || x.username, balance: x.balance, banned: !!x.banned,
      withdrawals: db.prepare(`SELECT COUNT(*) c FROM withdrawals WHERE user_id = ? AND status != 'rejected'`).get(id).c };
  }).filter(Boolean);
  return {
    id: u.id, name: u.first_name || u.username, username: u.username, balance: u.balance, banned: !!u.banned,
    referredBy: u.referred_by, refStatus: u.ref_status, referrals: db.prepare('SELECT COUNT(*) c FROM users WHERE referred_by = ?').get(u.id).c,
    linked: { device: brief(l.device), wallet: brief(l.wallet), ip: brief(l.ip) },
    devices: db.prepare('SELECT device_id, ip, first_seen, last_seen FROM user_devices WHERE user_id = ? ORDER BY last_seen DESC LIMIT 10').all(u.id),
  };
}));
admin.post('/withdrawals/:id', wrap((req) => {
  const { action, txHash, note } = req.body || {};
  return tx(() => {
    const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(Number(req.params.id));
    if (!w || w.status !== 'pending') throw new ApiError(404, 'not_pending');
    if (action === 'paid') {
      db.prepare(`UPDATE withdrawals SET status='paid', tx_hash=?, note=?, processed_at=? WHERE id=?`)
        .run(txHash || null, note || null, now(), w.id);
    } else if (action === 'reject') {
      db.prepare(`UPDATE withdrawals SET status='rejected', note=?, processed_at=? WHERE id=?`)
        .run(note || null, now(), w.id);
      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(w.coins, w.user_id); // devuelve monedas
    } else throw new ApiError(400, 'bad_action');
    return { ok: true };
  });
}));
admin.get('/ads-debug', wrap(() => adLog));
admin.get('/stats', wrap(() => ({
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
  runs24h: db.prepare('SELECT COUNT(*) c FROM runs WHERE started_at >= ?').get(now() - DAY).c,
  ads24h: db.prepare('SELECT COUNT(*) c FROM ad_events WHERE created_at >= ?').get(now() - DAY).c,
  rejectedRuns24h: db.prepare(`SELECT COUNT(*) c FROM runs WHERE status='rejected' AND reject_reason!='abandoned' AND started_at >= ?`).get(now() - DAY).c,
  coinsOutstanding: db.prepare('SELECT COALESCE(SUM(balance),0) s FROM users').get().s,
  pendingUsdCents: db.prepare(`SELECT COALESCE(SUM(usd_cents),0) s FROM withdrawals WHERE status='pending'`).get().s,
  paidUsdCents: db.prepare(`SELECT COALESCE(SUM(usd_cents),0) s FROM withdrawals WHERE status='paid'`).get().s,
  // ingresos estimados que informa Monetag (en USD)
  adRevenue24h: db.prepare('SELECT COALESCE(SUM(revenue),0) s FROM ad_postbacks WHERE created_at >= ?').get(now() - DAY).s,
  adRevenueTotal: db.prepare('SELECT COALESCE(SUM(revenue),0) s FROM ad_postbacks').get().s,
  adVerifyMode: config.adVerifyMode,
  referralsConfigured: !!config.referrals.botUsername,
  dailyClaims24h: db.prepare('SELECT COUNT(*) c FROM users WHERE daily_last = ?').get(dayStr()).c,
  referredUsers: db.prepare('SELECT COUNT(*) c FROM users WHERE referred_by IS NOT NULL').get().c,
  blockedReferrals: db.prepare(`SELECT COUNT(*) c FROM users WHERE ref_status = 'blocked'`).get().c,
})));
admin.post('/users/:id/ban', wrap((req) => {
  db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(req.body?.banned === false ? 0 : 1, req.params.id);
  return { ok: true };
}));
app.use('/api/admin', admin);
app.use('/api', api);

app.use('/api', (err, _req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.code });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

// ---------- Archivos estáticos (cliente compilado + panel admin) ----------
app.get('/admin', (_req, res) => res.sendFile(path.resolve(__dirname, 'admin.html')));
// Manifest de TON Connect con el dominio real (PUBLIC_URL o el host de la petición)
app.get('/tonconnect-manifest.json', (req, res) => {
  const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.set('Access-Control-Allow-Origin', '*');
  res.json({ url: base, name: 'Crypto Rush', iconUrl: `${base}/icon.png` });
});
const dist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(config.port, () => {
  console.log(`🚀 Crypto Rush server en http://localhost:${config.port}  (devMode=${config.devMode}, ads=${config.adVerifyMode})`);
});
