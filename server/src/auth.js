import crypto from 'node:crypto';
import { config } from './config.js';

/**
 * Valida el initData que Telegram entrega a la Mini App.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Devuelve el objeto user o null.
 */
export function validateInitData(initData, maxAgeSec = 24 * 3600) {
  if (!initData || !config.botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (expected.length !== hash.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;

  try {
    const user = JSON.parse(params.get('user'));
    // start_param llega cuando se abre con t.me/<bot>/<app>?startapp=... (lo usamos para referidos)
    return { ...user, start_param: params.get('start_param') || '' };
  } catch {
    return null;
  }
}

// Token de sesión simple firmado con HMAC: userId.expira.firma
export function signSession(userId, ttlSec = 12 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(`${userId}.${exp}`).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return userId;
}
