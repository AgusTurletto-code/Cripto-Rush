// Tasa automática: cuántas monedas valen 1 USD.
//
// Idea: en los últimos N días el juego ganó $R con anuncios (lo informa Monetag en cada postback)
// y repartió C monedas netas (partidas + diario + referidos − lo gastado en personajes).
// Para devolver a los jugadores un porcentaje S de lo ganado:
//
//        monedas por USD  =  C / (R × S)
//
// Así, si el CPM baja o los jugadores ganan más monedas, la tasa sube sola y nunca se paga
// más de lo que entra. Los cambios se suavizan (máximo ±X% por día) para que no salte de golpe.
import { db } from './db.js';
import { config } from './config.js';

db.exec(`
CREATE TABLE IF NOT EXISTS coin_flow (
  day    TEXT PRIMARY KEY,               -- AAAA-MM-DD (UTC)
  issued INTEGER NOT NULL DEFAULT 0,     -- monedas creadas (partidas, diario, referidos)
  spent  INTEGER NOT NULL DEFAULT 0      -- monedas gastadas dentro del juego (personajes)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const DAY = 24 * 3600 * 1000;
const dayStr = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export function recordIssued(coins) {
  coins = Math.floor(coins);
  if (coins > 0) db.prepare(`INSERT INTO coin_flow (day, issued) VALUES (?, ?)
    ON CONFLICT(day) DO UPDATE SET issued = issued + excluded.issued`).run(dayStr(), coins);
}
export function recordSpent(coins) {
  coins = Math.floor(coins);
  if (coins > 0) db.prepare(`INSERT INTO coin_flow (day, spent) VALUES (?, ?)
    ON CONFLICT(day) DO UPDATE SET spent = spent + excluded.spent`).run(dayStr(), coins);
}

function load() {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'rate'`).get();
  try { return row ? JSON.parse(row.value) : null; } catch { return null; }
}
let state = load() || { rate: config.economy.coinsPerUsd, mode: 'learning', updatedAt: 0 };

export const rate = () => state.rate;
export const minWithdrawCoins = () => Math.ceil(state.rate * config.economy.minWithdrawUsd);
export const economyState = () => ({ ...state, minWithdrawCoins: minWithdrawCoins(), share: config.economy.revenueShare });

/** Recalcula la tasa (se llama al arrancar y cada hora). */
export function recompute() {
  const e = config.economy;
  const now = Date.now();
  const since = now - e.rateWindowDays * DAY;
  const revenue = db.prepare('SELECT COALESCE(SUM(revenue),0) s FROM ad_postbacks WHERE created_at >= ?').get(since).s;
  const flow = db.prepare('SELECT COALESCE(SUM(issued),0) i, COALESCE(SUM(spent),0) sp FROM coin_flow WHERE day >= ?').get(dayStr(since));
  const netCoins = Math.max(0, flow.i - flow.sp);

  let target, mode;
  if (e.rateMode === 'fixed') {
    target = e.coinsPerUsd; mode = 'fixed';
  } else if (revenue < e.minRevenueForAuto || netCoins <= 0) {
    // todavía hay pocos datos: se usa la tasa inicial (COINS_PER_USD)
    target = e.coinsPerUsd; mode = 'learning';
  } else {
    target = netCoins / (revenue * e.revenueShare); mode = 'auto';
  }
  target = Math.min(e.maxRate, Math.max(e.minRate, target));

  // suavizado: como mucho ±maxDailyChange por día (proporcional al tiempo desde el último cálculo)
  let next = target;
  // (también al pasar de 'aprendiendo' a 'automática': nada de saltos bruscos)
  if (state.updatedAt && mode !== 'fixed' && state.mode !== 'fixed') {
    const days = Math.min(1, (now - state.updatedAt) / DAY);
    const allowed = Math.pow(1 + e.maxDailyChange, days);
    next = Math.min(state.rate * allowed, Math.max(state.rate / allowed, target));
  }
  state = {
    rate: Math.round(next), target: Math.round(target), mode, updatedAt: now,
    revenue: Number(revenue.toFixed(4)), netCoins, windowDays: e.rateWindowDays,
  };
  db.prepare(`INSERT INTO settings (key, value) VALUES ('rate', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(JSON.stringify(state));
  console.log(`[economía] ${state.rate} monedas = 1 USD (${mode}; objetivo ${state.target}; ingresos ${state.windowDays}d $${state.revenue}; monedas netas ${netCoins})`);
  return state;
}

recompute();
setInterval(recompute, 3600 * 1000).unref();
