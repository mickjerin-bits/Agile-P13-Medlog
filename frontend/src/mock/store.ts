import type { MedicalRecord } from '../types';

const KEYS = {
  version: 'medlog.version',
  users: 'medlog.users',
  records: 'medlog.records',
  session: 'medlog.session',
  key: (userId: string) => `medlog.key.${userId}`,
  blob: (recordId: string) => `medlog.blob.${recordId}`,
} as const;

export const SCHEMA_VERSION = 2;

export const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;

export interface StoredUser {
  id: string;
  email: string;
  fullName: string;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  role: string;
  createdAt: string;
  passwordSalt: string;
  passwordHash: string;
  keySalt: string;
}

export interface StoredRecord {
  id: string;
  ownerId: string;
  recordType: MedicalRecord['recordType'];
  recordDate: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  iv: string;
  checksum: string;
  metaIv: string;
  metaCipher: string;
}

export interface RecordMetadata {
  title: string;
  providerName: string | null;
  notes: string | null;
  originalFilename: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function initStore(): void {
  const stored = read<number | null>(KEYS.version, null);
  if (stored === SCHEMA_VERSION) return;

  if (stored !== null) store.reset();
  write(KEYS.version, SCHEMA_VERSION);
}

export const store = {
  users: () => read<StoredUser[]>(KEYS.users, []),
  saveUsers: (users: StoredUser[]) => write(KEYS.users, users),

  records: () => read<StoredRecord[]>(KEYS.records, []),
  saveRecords: (records: StoredRecord[]) => write(KEYS.records, records),

  session: () => read<{ userId: string } | null>(KEYS.session, null),
  saveSession: (userId: string) => write(KEYS.session, { userId }),
  clearSession: () => localStorage.removeItem(KEYS.session),

  recordKey: (userId: string) => localStorage.getItem(KEYS.key(userId)),
  saveRecordKey: (userId: string, rawKeyBase64: string) =>
    localStorage.setItem(KEYS.key(userId), rawKeyBase64),
  clearRecordKey: (userId: string) => localStorage.removeItem(KEYS.key(userId)),

  blob: (recordId: string) => localStorage.getItem(KEYS.blob(recordId)),
  saveBlob: (recordId: string, ciphertext: string) =>
    localStorage.setItem(KEYS.blob(recordId), ciphertext),
  deleteBlob: (recordId: string) => localStorage.removeItem(KEYS.blob(recordId)),

  reset: () => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('medlog.')) localStorage.removeItem(key);
    }
  },
};

export function bytesUsed(): number {
  let total = 0;
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('medlog.')) continue;
    total += key.length + (localStorage.getItem(key)?.length ?? 0);
  }
  return total;
}

export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.message.toLowerCase().includes('quota')
  );
}
