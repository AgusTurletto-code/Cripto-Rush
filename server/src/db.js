import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec(`PRAGMA journal_mode = WAL;`);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,           -- id de Telegram
  username      TEXT,
  first_name    TEXT,
  balance       INTEGER NOT NULL DEFAULT 0, -- monedas canjeables
  total_earned  INTEGER NOT NULL DEFAULT 0,
  best_distance INTEGER NOT NULL DEFAULT 0,
  wallet        TEXT,
  character     TEXT NOT NULL DEFAULT 'hank',
  owned         TEXT NOT NULL DEFAULT '["hank"]',
  banned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  seed       INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  coins      INTEGER,
  distance   INTEGER,
  doubled    INTEGER NOT NULL DEFAULT 0,
  revives    INTEGER NOT NULL DEFAULT 0,
  credited   INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'active', -- active | finished | rejected
  reject_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, started_at);

CREATE TABLE IF NOT EXISTS ad_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  type       TEXT NOT NULL,          -- double | revive
  verified   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(run_id, type, created_at)
);
CREATE INDEX IF NOT EXISTS idx_ads_user ON ad_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS ad_postbacks (
  ymid       TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  coins        INTEGER NOT NULL,
  usd_cents    INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  wallet       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | paid | rejected
  tx_hash      TEXT,
  note         TEXT,
  created_at   INTEGER NOT NULL,
  processed_at INTEGER
);
`);

// Dispositivos e IPs vistos por cuenta (para detectar cuentas múltiples)
db.exec(`
CREATE TABLE IF NOT EXISTS user_devices (
  user_id    TEXT NOT NULL,
  device_id  TEXT NOT NULL,   -- id aleatorio guardado en el navegador del jugador
  fp         TEXT NOT NULL,   -- huella del dispositivo (modelo, pantalla, idioma...): señal débil
  ip         TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id, ip)
);
CREATE INDEX IF NOT EXISTS idx_dev_device ON user_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_dev_fp ON user_devices(fp);
CREATE INDEX IF NOT EXISTS idx_dev_ip ON user_devices(ip);
`);

// Ruleta: un registro por giro
db.exec(`
CREATE TABLE IF NOT EXISTS spins (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,                         -- cuándo se giró (cuenta para el límite de 24 h)
  status     TEXT NOT NULL DEFAULT 'started', -- started | pending (esperando a Monetag) | done
  segment    INTEGER,
  coins      INTEGER NOT NULL DEFAULT 0,
  jackpot    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_spins_user ON spins(user_id, claimed_at);
`);

// Migraciones simples: columnas agregadas después de la primera versión
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
const addUserCol = (name, def) => { if (!userCols.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`); };
addUserCol('daily_streak', 'INTEGER NOT NULL DEFAULT 0');
addUserCol('daily_last', 'TEXT');
addUserCol('referred_by', 'TEXT');
addUserCol('ref_status', 'TEXT');          // pending | qualified | blocked
addUserCol('ref_earnings', 'INTEGER NOT NULL DEFAULT 0');
addUserCol('wallet_key', 'TEXT');
addUserCol('terms_version', 'TEXT');          // versión de términos aceptada          // wallet normalizada (para detectar la misma wallet en 2 cuentas)
addUserCol('lang', 'TEXT');                   // idioma de Telegram (para los avisos)
addUserCol('last_seen', 'INTEGER');
addUserCol('notify_ok', 'INTEGER NOT NULL DEFAULT 0');  // autorizó al bot a escribirle
addUserCol('notify_on', 'INTEGER NOT NULL DEFAULT 1');  // no apagó los avisos
addUserCol('last_promo_at', 'INTEGER');       // último recordatorio (diario / ruleta)
addUserCol('spins_refill_at', 'INTEGER NOT NULL DEFAULT 0'); // cuándo se recargan sus giros (si los gastó todos)
addUserCol('last_record_notice_at', 'INTEGER');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_ref ON users(referred_by)');
db.exec('CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_key)');
const runCols2 = db.prepare('PRAGMA table_info(runs)').all().map((c) => c.name);
// x2 sin confirmar todavía: la mitad extra se paga cuando llega el postback de Monetag
if (!runCols2.includes('pending_bonus')) db.exec('ALTER TABLE runs ADD COLUMN pending_bonus INTEGER NOT NULL DEFAULT 0');
const pbCols = db.prepare('PRAGMA table_info(ad_postbacks)').all().map((c) => c.name);
if (!pbCols.includes('telegram_id')) db.exec(`ALTER TABLE ad_postbacks ADD COLUMN telegram_id TEXT NOT NULL DEFAULT ''`);
if (!pbCols.includes('revenue')) db.exec('ALTER TABLE ad_postbacks ADD COLUMN revenue REAL NOT NULL DEFAULT 0');
const runCols = db.prepare('PRAGMA table_info(runs)').all().map((c) => c.name);
if (!runCols.includes('character')) db.exec(`ALTER TABLE runs ADD COLUMN character TEXT NOT NULL DEFAULT 'hank'`);
if (!runCols.includes('multiplier')) db.exec('ALTER TABLE runs ADD COLUMN multiplier REAL NOT NULL DEFAULT 1');

/** Ejecuta fn dentro de una transacción. */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
