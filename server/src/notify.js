// Avisos del bot por Telegram (Bot API sendMessage).
//
// Solo se escribe a quien autorizó al bot (permiso de Telegram "allows_write_to_pm") y no los apagó.
// - Recordatorios (diario, ruleta): como máximo 1 cada 20 h por persona; dejan de mandarse a quien
//   no juega hace 14 días.
// - Avisos importantes (retiro pagado/rechazado, amigo activo, récord superado): se mandan al momento.
// Si alguien bloquea el bot, Telegram responde 403 y no se le vuelve a escribir.
import { db } from './db.js';
import { config } from './config.js';

const API = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const now = () => Date.now();
const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fmt = (n, lang) => Number(n).toLocaleString(lang === 'es' ? 'es' : 'en-US');

db.exec(`
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ok         INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_time ON notifications(created_at);
`);

/** Link que abre el juego dentro de Telegram. */
export function gameLink() {
  const r = config.referrals;
  return r.botUsername ? `https://t.me/${r.botUsername}/${r.miniAppName}` : null;
}

const T = {
  es: {
    play: '🎮 Jugar',
    daily: (u) => `🎁 <b>Tu recompensa diaria está lista</b>: +${fmt(u.reward, 'es')} monedas.`,
    streak: (u) => `🔥 <b>Tu racha de ${u.streak} días está por cortarse.</b> Entra hoy y reclama +${fmt(u.reward, 'es')} monedas.`,
    spins: () => '🎡 <b>Tus giros de la ruleta ya están disponibles.</b> ¡Prueba tu suerte!',
    paid: (w) => `✅ <b>Tu retiro fue pagado</b>: ${w.usd} USD en ${w.cur}.${w.tx ? `\nComprobante: <code>${esc(w.tx)}</code>` : ''}`,
    rejected: (w) => `❌ <b>Tu retiro de ${w.usd} USD fue rechazado.</b>${w.note ? `\nMotivo: ${esc(w.note)}` : ''}\nLas monedas volvieron a tu saldo.`,
    jackpotPaid: (w) => `💎 <b>¡Tu premio mayor de ${w.usd} USD fue pagado!</b>${w.tx ? `\nComprobante: <code>${esc(w.tx)}</code>` : ''}`,
    friend: (f) => `🎉 <b>${esc(f.name)} se activó</b> con tu invitación: +${fmt(f.bonus, 'es')} monedas para ti. Además ganas el ${f.pct}% de lo que gane.`,
    record: (f) => `😱 <b>${esc(f.name)} superó tu récord</b> con ${fmt(f.distance, 'es')} m. ¿Lo recuperas?`,
    footer: '\n\n<i>Puedes apagar estos avisos desde el juego (🔔).</i>',
  },
  en: {
    play: '🎮 Play',
    daily: (u) => `🎁 <b>Your daily reward is ready</b>: +${fmt(u.reward, 'en')} coins.`,
    streak: (u) => `🔥 <b>Your ${u.streak}-day streak is about to break.</b> Come back today and claim +${fmt(u.reward, 'en')} coins.`,
    spins: () => '🎡 <b>Your wheel spins are ready.</b> Try your luck!',
    paid: (w) => `✅ <b>Your withdrawal was paid</b>: ${w.usd} USD in ${w.cur}.${w.tx ? `\nReceipt: <code>${esc(w.tx)}</code>` : ''}`,
    rejected: (w) => `❌ <b>Your ${w.usd} USD withdrawal was rejected.</b>${w.note ? `\nReason: ${esc(w.note)}` : ''}\nThe coins are back in your balance.`,
    jackpotPaid: (w) => `💎 <b>Your ${w.usd} USD jackpot was paid!</b>${w.tx ? `\nReceipt: <code>${esc(w.tx)}</code>` : ''}`,
    friend: (f) => `🎉 <b>${esc(f.name)} is now active</b> through your invite: +${fmt(f.bonus, 'en')} coins for you. You also earn ${f.pct}% of what they earn.`,
    record: (f) => `😱 <b>${esc(f.name)} beat your record</b> with ${fmt(f.distance, 'en')} m. Can you take it back?`,
    footer: '\n\n<i>You can turn these off in the game (🔔).</i>',
  },
};
const tr = (u) => T[u.lang === 'es' ? 'es' : 'en'];

/** Envía un mensaje. Devuelve true si Telegram lo aceptó. */
async function send(userId, text, { button = true, html = true } = {}) {
  if (!config.botToken) return false;
  const link = gameLink();
  const body = { chat_id: userId, text, disable_web_page_preview: true };
  if (html) body.parse_mode = 'HTML';
  if (button && link) body.reply_markup = { inline_keyboard: [[{ text: tr(db.prepare('SELECT lang FROM users WHERE id = ?').get(userId) || {}).play, url: link }]] };
  try {
    const res = await fetch(`${API}/bot${config.botToken}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.status === 403) { // bloqueó el bot o nunca lo autorizó
      db.prepare('UPDATE users SET notify_ok = 0 WHERE id = ?').run(userId);
      return false;
    }
    if (res.status === 429) { // límite de Telegram: esperar lo que pide
      const j = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, ((j.parameters?.retry_after || 1) + 0.5) * 1000));
      return send(userId, text, { button, html });
    }
    return res.ok;
  } catch (e) {
    console.warn('[avisos] error de red:', e.message);
    return false;
  }
}

async function deliver(user, kind, text, { promo = false } = {}) {
  if (!user || !user.notify_ok || !user.notify_on) return false;
  const ok = await send(user.id, text + tr(user).footer);
  db.prepare('INSERT INTO notifications (user_id, kind, ok, created_at) VALUES (?, ?, ?, ?)').run(user.id, kind, ok ? 1 : 0, now());
  if (ok && promo) db.prepare('UPDATE users SET last_promo_at = ? WHERE id = ?').run(now(), user.id);
  return ok;
}
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

// ---------- Avisos importantes (se llaman desde el servidor cuando pasa algo) ----------
/** Se ejecuta después de la transacción, sin hacer esperar a nadie. */
const later = (fn) => setImmediate(() => fn().catch((e) => console.warn('[avisos]', e.message)));

export function notifyWithdrawal(w, action) {
  later(async () => {
    const u = getUser(w.user_id);
    if (!u) return;
    const d = { usd: (w.usd_cents / 100).toFixed(2), cur: w.currency === 'TON' ? 'TON' : 'USDT', tx: w.tx_hash, note: w.note };
    const jackpot = (w.note || '').includes('JACKPOT') || w.coins === 0;
    const text = action === 'paid' ? (jackpot ? tr(u).jackpotPaid(d) : tr(u).paid(d)) : tr(u).rejected(d);
    await deliver(u, 'withdraw_' + action, text);
  });
}

export function notifyFriendQualified(referrerId, friend, bonus) {
  later(async () => {
    const u = getUser(referrerId);
    await deliver(u, 'ref_qualified', tr(u || {}).friend({ name: friend.first_name || friend.username || '—', bonus, pct: Math.round(config.referrals.commission * 100) }));
  });
}

/** Avisa a los amigos (quien te invitó y tus invitados) que acabás de superar su récord. */
export function notifyRecordBeaten(user, oldBest, newBest) {
  if (newBest <= oldBest) return;
  later(async () => {
    const friends = db.prepare(`SELECT * FROM users WHERE (id = ? OR referred_by = ?) AND id != ?
                                AND best_distance >= ? AND best_distance < ? AND best_distance > 0`)
      .all(user.referred_by || '', user.id, user.id, oldBest, newBest);
    for (const f of friends) {
      if (f.last_record_notice_at && now() - f.last_record_notice_at < 6 * HOUR) continue;
      const ok = await deliver(f, 'record', tr(f).record({ name: user.first_name || user.username || '—', distance: newBest }));
      if (ok) db.prepare('UPDATE users SET last_record_notice_at = ? WHERE id = ?').run(now(), f.id);
    }
  });
}

// ---------- Recordatorios (cada 10 minutos) ----------
let running = false;
export async function runReminders() {
  if (running || !config.botToken) return { daily: 0, spins: 0 };
  running = true;
  const sent = { daily: 0, spins: 0 };
  try {
    const t = now();
    const today = new Date(t).toISOString().slice(0, 10);
    const yesterday = new Date(t - DAY).toISOString().slice(0, 10);
    const rewards = config.economy.dailyRewards;

    // 1) giros de la ruleta recargados (a quien los había gastado todos)
    const spinUsers = db.prepare(`SELECT * FROM users WHERE notify_ok = 1 AND notify_on = 1 AND spins_refill_at > 0 AND spins_refill_at <= ?
                                  AND (last_promo_at IS NULL OR last_promo_at < ?) LIMIT 200`).all(t, t - 4 * HOUR);
    for (const u of spinUsers) {
      if (await deliver(u, 'spins', tr(u).spins(), { promo: true })) sent.spins++;
      db.prepare('UPDATE users SET spins_refill_at = 0 WHERE id = ?').run(u.id);
      await new Promise((r) => setTimeout(r, 40));
    }

    // 2) recompensa diaria sin reclamar (no entra hace 20 h, pero jugó en los últimos 14 días)
    const dailyUsers = db.prepare(`SELECT * FROM users WHERE notify_ok = 1 AND notify_on = 1
        AND (daily_last IS NULL OR daily_last != ?) AND last_seen < ? AND last_seen > ?
        AND (last_promo_at IS NULL OR last_promo_at < ?) LIMIT 200`).all(today, t - 20 * HOUR, t - 14 * DAY, t - 20 * HOUR);
    for (const u of dailyUsers) {
      const alive = u.daily_last === yesterday && u.daily_streak > 0;
      const streak = alive ? u.daily_streak : 0;
      const reward = rewards[streak % rewards.length];
      const text = alive && streak >= 2 ? tr(u).streak({ streak, reward }) : tr(u).daily({ reward });
      if (await deliver(u, 'daily', text, { promo: true })) sent.daily++;
      await new Promise((r) => setTimeout(r, 40));
    }
  } finally {
    running = false;
  }
  if (sent.daily || sent.spins) console.log(`[avisos] enviados: ${sent.daily} diarios, ${sent.spins} de ruleta`);
  return sent;
}

/** Anuncio del admin a todos los que aceptan avisos. Texto plano. */
export async function broadcast(text) {
  const users = db.prepare('SELECT * FROM users WHERE notify_ok = 1 AND notify_on = 1').all();
  let ok = 0;
  for (const u of users) {
    const r = await send(u.id, String(text).slice(0, 3500) + '\n\n' + (u.lang === 'es' ? '🔕 Puedes apagar los avisos desde el juego.' : '🔕 You can turn off notifications in the game.'), { html: false });
    db.prepare('INSERT INTO notifications (user_id, kind, ok, created_at) VALUES (?, ?, ?, ?)').run(u.id, 'broadcast', r ? 1 : 0, now());
    if (r) ok++;
    await new Promise((res) => setTimeout(res, 40)); // ~25 mensajes por segundo (límite de Telegram: 30)
  }
  return { total: users.length, ok };
}

export function startReminders() {
  setInterval(() => runReminders().catch((e) => console.warn('[avisos]', e.message)), 10 * 60 * 1000).unref();
}
