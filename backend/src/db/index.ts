import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  date_of_birth   TEXT,
  blood_group     TEXT,
  role            TEXT NOT NULL DEFAULT 'PATIENT',
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  record_type       TEXT NOT NULL,
  record_date       TEXT NOT NULL,
  provider_name     TEXT,
  notes             TEXT,
  original_filename TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  storage_key       TEXT NOT NULL,
  encryption_iv     TEXT NOT NULL,
  encryption_tag    TEXT NOT NULL,
  checksum          TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_owner ON records(owner_id, record_date DESC);

CREATE TABLE IF NOT EXISTS access_log (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT,
  record_id  TEXT,
  action     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_access_log_record ON access_log(record_id, created_at DESC);
`;

export type DatabaseHandle = Database.Database;

let db: DatabaseHandle | undefined;

export function getDb(): DatabaseHandle {
  if (db) return db;

  if (config.databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  }
  db = new Database(config.databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

export function resetDbForTests(): void {
  const handle = getDb();
  handle.exec('DELETE FROM access_log; DELETE FROM records; DELETE FROM users;');
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
