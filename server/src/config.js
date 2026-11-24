// Configuración central. Todo se puede cambiar con variables de entorno (.env).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga mínima de .env (sin dependencias)
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const num = (k, d) => (process.env[k] !== undefined ? Number(process.env[k]) : d);

export const config = {
  port: num('PORT', 3000),
  botToken: process.env.BOT_TOKEN || '',
  sessionSecret: process.env.SESSION_SECRET || 'cambia-esto-en-produccion',
  adminKey: process.env.ADMIN_KEY || '',
  // DEV_MODE=1 permite jugar desde un navegador normal sin Telegram (usuario falso).
  devMode: process.env.DEV_MODE === '1',
  // Railway define RAILWAY_VOLUME_MOUNT_PATH cuando el servicio tiene un disco (Volume) conectado.
  // Si falta DB_PATH pero hay disco, la base va al disco para no perder los saldos en cada reinicio.
  dbPath: process.env.DB_PATH
    || (process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'cryptorush.db') : null)
    || path.resolve(__dirname, '../data/cryptorush.db'),
  volumePath: process.env.RAILWAY_VOLUME_MOUNT_PATH || '',

  economy: {
    // Cuántas monedas del juego equivalen a 1 USD. Ajustar según lo que paguen los anuncios.
    coinsPerUsd: num('COINS_PER_USD', 20000),
    minWithdrawCoins: num('MIN_WITHDRAW_COINS', 40000), // = 2 USD con la tasa por defecto
    maxWithdrawalsPerDay: num('MAX_WITHDRAWALS_PER_DAY', 1),
    dailyCoinCap: num('DAILY_COIN_CAP', 0), // tope de monedas ganadas por día (0 = sin límite)
    maxAdsPerDay: num('MAX_ADS_PER_DAY', 40),
    currencies: ['USDT_TON', 'TON'],
    // Recompensa diaria: día 1..7 (después del 7 vuelve a empezar). Cortar la racha la reinicia.
    dailyRewards: (process.env.DAILY_REWARDS || '100,150,200,300,400,600,1000').split(',').map(Number),
  },

  // Referidos: link https://t.me/<BOT_USERNAME>/<MINI_APP_NAME>?startapp=ref_<id>
  referrals: {
    botUsername: (process.env.BOT_USERNAME || '').replace(/^@/, ''),
    miniAppName: process.env.MINI_APP_NAME || 'play',
    commission: num('REF_COMMISSION', 0.1),        // % de lo que gana el amigo en partidas, para siempre
    qualifyCoins: num('REF_QUALIFY_COINS', 1000),  // el amigo "cuenta" cuando gana esto jugando
    referrerBonus: num('REF_BONUS', 2000),         // premio para quien invitó, al calificar
    welcomeBonus: num('REF_WELCOME', 500),         // premio de bienvenida para el amigo, al calificar
  },

  // 'client': se confía en que el SDK de Monetag resolvió la promesa (más simple).
  // 'postback': además se exige que Monetag haya llamado a /api/ads/postback (más seguro).
  // si hay AD_POSTBACK_SECRET se usa 'postback' por defecto
  adVerifyMode: process.env.AD_VERIFY_MODE || (process.env.AD_POSTBACK_SECRET ? 'postback' : 'client'),
  adPostbackSecret: (process.env.AD_POSTBACK_SECRET || '').trim(), // sin espacios accidentales
};

// Reglas físicas del juego compartidas con el cliente (client/src/game/rules.js)
// El servidor las usa para detectar partidas imposibles.
export const RULES = {
  startSpeed: 14,       // unidades/segundo
  acceleration: 0.22,   // unidades/segundo²
  maxSpeed: 38,
  coinSpacing: 3,       // distancia mínima entre monedas de una misma fila
  maxRunSeconds: 60 * 30,
};

// ¿La base de datos está en un disco permanente?
config.dbPersistent = !!config.volumePath && path.resolve(config.dbPath).startsWith(path.resolve(config.volumePath) + path.sep);
if (process.env.RAILWAY_ENVIRONMENT && !config.dbPersistent) {
  console.warn(`[config] ⚠️  La base de datos (${config.dbPath}) NO está en un Volume de Railway: los saldos se borran en cada reinicio.`);
}

if (!config.devMode && !config.botToken) {
  console.warn('[config] ⚠️  Falta BOT_TOKEN. Sin él no se puede validar a los usuarios de Telegram.');
}
if (config.sessionSecret === 'cambia-esto-en-produccion') {
  console.warn('[config] ⚠️  Usa un SESSION_SECRET propio en producción.');
}
