import { initData } from './telegram.js';
import { demoApi } from './demoApi.js';
import { t } from '../i18n.js';

export const DEMO = import.meta.env.VITE_DEMO === '1';

const BASE = import.meta.env.VITE_API_URL || '';
let token = null;

export class ApiError extends Error {}

async function call(method, path, body) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'network_error');
  return data;
}

// ---------- Identificación del dispositivo (para detectar varias cuentas de la misma persona) ----------
function deviceId() {
  try {
    let id = localStorage.getItem('cr-device');
    if (!id) { id = crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now(); localStorage.setItem('cr-device', id); }
    return id;
  } catch { return 'nostorage'; }
}

/** Huella del dispositivo (modelo de pantalla, idioma, zona horaria, GPU…): señal débil, varios teléfonos iguales coinciden. */
async function fingerprint() {
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  } catch { /* ignore */ }
  const raw = [navigator.userAgent, screen.width + 'x' + screen.height, devicePixelRatio, navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency, navigator.deviceMemory, gpu].join('|');
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 0; for (const c of raw) h = (h * 31 + c.charCodeAt(0)) | 0;
    return 'h' + (h >>> 0).toString(16);
  }
}

const realApi = {
  async login() {
    const r = await call('POST', '/auth', { initData: initData(), device: { id: deviceId(), fp: await fingerprint() } });
    token = r.token;
    return r.user;
  },
  config: () => call('GET', '/config'),
  me: () => call('GET', '/me'),
  startRun: () => call('POST', '/run/start'),
  endRun: (runId, coins, distance) => call('POST', '/run/end', { runId, coins, distance }),
  claimAd: (runId, type, ymid) => call('POST', '/ads/claim', { runId, type, ymid }),
  reportAdError: (type, code, detail) => call('POST', '/ads/error', { type, code, detail }).catch(() => {}),
  buyCharacter: (id) => call('POST', '/character/buy', { id }),
  setWallet: (address) => call('POST', '/wallet', { address }),
  withdraw: (coins, currency) => call('POST', '/withdraw', { coins, currency }),
  withdrawals: () => call('GET', '/withdrawals'),
  claimDaily: () => call('POST', '/daily/claim'),
  referrals: () => call('GET', '/referrals'),
  spinStart: () => call('POST', '/spin/start'),
  legal: (lang) => call('GET', '/legal?lang=' + lang),
  acceptTerms: (version) => call('POST', '/terms/accept', { version }),
  spinClaim: (spinId) => call('POST', '/spin/claim', { spinId }),
};

export const api = DEMO ? demoApi : realApi;

export const errMsg = (e) => t('err')[e?.message] || t('error_generic', { code: e?.message || '?' });
