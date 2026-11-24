import { initData } from './telegram.js';
import { demoApi } from './demoApi.js';

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

const realApi = {
  async login() {
    const r = await call('POST', '/auth', { initData: initData() });
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
};

export const api = DEMO ? demoApi : realApi;

export const ERRORS = {
  network_error: 'Sin conexión con el servidor',
  invalid_init_data: 'Abre el juego desde Telegram',
  run_rejected: 'La partida no pasó la verificación',
  ad_limit: 'Llegaste al límite de anuncios de hoy',
  ad_not_verified: 'No pudimos verificar el anuncio',
  already_revived: 'Solo puedes revivir una vez por partida',
  already_doubled: 'Ya duplicaste esta partida',
  not_enough_coins: 'No tienes suficientes monedas',
  below_minimum: 'Monto por debajo del mínimo',
  no_wallet: 'Conecta tu wallet primero',
  withdraw_limit: 'Ya hiciste un retiro hoy',
  bad_address: 'Dirección de wallet inválida',
  banned: 'Tu cuenta fue suspendida',
};
export const errMsg = (e) => ERRORS[e?.message] || 'Algo salió mal (' + (e?.message || '?') + ')';
