import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

const isTest = process.env.NODE_ENV === 'test';

function requiredSecret(name: string, byteLength: number): string {
  const value = process.env[name];
  if (value && value.length >= byteLength) return value;
  if (isTest) return crypto.randomBytes(byteLength).toString('hex');
  throw new Error(
    `${name} is missing or too short. Copy .env.example to .env and generate a value (see the comments in that file).`,
  );
}

function encryptionKey(): Buffer {
  const raw = process.env.MEDLOG_ENCRYPTION_KEY;
  if (!raw) {
    if (isTest) return crypto.randomBytes(32);
    throw new Error(
      'MEDLOG_ENCRYPTION_KEY is missing. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('MEDLOG_ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256-GCM.');
  }
  return key;
}

function resolveDatabasePath(): string {
  const raw = process.env.DATABASE_PATH ?? './data/medlog.db';
  return raw === ':memory:' ? raw : path.resolve(projectRoot, raw);
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isTest,
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: requiredSecret('JWT_SECRET', 32),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  encryptionKey: encryptionKey(),
  databasePath: resolveDatabasePath(),
  storagePath: path.resolve(projectRoot, process.env.STORAGE_PATH ?? './data/records'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  bcryptRounds: isTest ? 4 : 12,
} as const;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
] as const;

export const RECORD_TYPES = [
  'LAB_REPORT',
  'PRESCRIPTION',
  'IMAGING',
  'DISCHARGE_SUMMARY',
  'VACCINATION',
  'INSURANCE',
  'OTHER',
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];
