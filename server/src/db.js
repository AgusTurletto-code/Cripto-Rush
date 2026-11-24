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

// Migraciones simples: columnas agregadas después de la primera versión
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
