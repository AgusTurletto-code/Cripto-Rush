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

// ---------- Diagnóstico de anuncios (en memoria, últimos 30 eventos) ----------
const adLog = [];
function logAd(entry) {
  adLog.unshift({ at: now(), ...entry });
  adLog.length = Math.min(adLog.length, 30);
  console.log('[ads]', JSON.stringify(entry));
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
  };
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
})));

app.post('/api/auth', wrap((req) => {
  let tgUser = validateInitData(req.body?.initData);
  if (!tgUser && config.devMode) {
    tgUser = { id: req.body?.devUserId || 'dev-1', first_name: 'Dev', username: 'dev' };
  }
  if (!tgUser) throw new ApiError(401, 'invalid_init_data');

  const id = String(tgUser.id);
  db.prepare(`
    INSERT INTO users (id, username, first_name, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET username = excluded.username, first_name = excluded.first_name
  `).run(id, tgUser.username || null, tgUser.first_name || null, now());

  return { token: signSession(id), user: publicUser(getUser.get(id)) };
}));

// Postback de Monetag: lo llama su servidor por cada evento confirmado (impression / click).
// Configurar en el panel de Monetag (ajustes de la zona principal → Postback URL):
// https://TU-DOMINIO/api/ads/postback?secret=TU_SECRETO&ymid={ymid}&event_type={event_type}&reward_event_type={reward_event_type}&telegram_id={telegram_id}&estimated_price={estimated_price}
app.get('/api/ads/postback', wrap((req) => {
  // sin secreto configurado el endpoint queda apagado: cualquiera podría falsificar anuncios vistos
  if (!config.adPostbackSecret || req.query.secret !== config.adPostbackSecret) {
    logAd({ kind: 'postback', result: config.adPostbackSecret ? 'secreto incorrecto' : 'AD_POSTBACK_SECRET no está configurado',
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
    db.prepare(`INSERT INTO ad_postbacks (ymid, created_at, telegram_id, revenue) VALUES (?, ?, ?, ?)
                ON CONFLICT(ymid) DO UPDATE SET revenue = revenue + excluded.revenue`)
      .run(ymid, now(), String(req.query.telegram_id || ''), price);
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
api.post('/ads/claim', wrap((req) => {
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
    const pb = ymid === expected && db.prepare('SELECT telegram_id FROM ad_postbacks WHERE ymid = ?').get(expected);
    if (!pb) throw new ApiError(402, 'ad_not_verified');
    // el anuncio lo tiene que haber visto este mismo usuario de Telegram
    if (pb.telegram_id && pb.telegram_id !== req.user.id) throw new ApiError(403, 'ad_not_verified');
    verified = 1;
  }

  tx(() => {
    db.prepare('INSERT INTO ad_events (user_id, run_id, type, verified, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, run.id, type, verified, now());
    if (type === 'revive') db.prepare('UPDATE runs SET revives = revives + 1 WHERE id = ?').run(run.id);
    else db.prepare('UPDATE runs SET doubled = 1 WHERE id = ?').run(run.id);
  });
  return { ok: true };
}));

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
    const gross = creditFor(coins, run.multiplier, run.doubled);
    const cap = config.economy.dailyCoinCap;
    const credited = cap > 0 ? Math.max(0, Math.min(gross, cap - earnedToday)) : gross;

    db.prepare(`UPDATE runs SET status='finished', ended_at=?, coins=?, distance=?, credited=? WHERE id=?`)
      .run(now(), coins, Math.floor(distance), credited, run.id);
    db.prepare(`UPDATE users SET balance = balance + ?, total_earned = total_earned + ?,
                best_distance = MAX(best_distance, ?) WHERE id = ?`)
      .run(credited, credited, Math.floor(distance), req.user.id);

    return {
      credited,
      capped: credited < gross,
      doubled: !!run.doubled,
      multiplier: run.multiplier,
      user: publicUser(getUser.get(req.user.id)),
    };
  });
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
  db.prepare('UPDATE users SET wallet = ? WHERE id = ?').run(address, req.user.id);
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
  db.prepare(`SELECT w.*, u.username, u.first_name, u.total_earned,
              (SELECT COUNT(*) FROM runs r WHERE r.user_id = w.user_id AND r.status='rejected') AS rejected_runs
              FROM withdrawals w JOIN users u ON u.id = w.user_id
              WHERE w.status = ? ORDER BY w.id`).all(req.query.status || 'pending')
));
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
