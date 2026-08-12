import { RECORD_TYPES } from '../types';
import type { MedicalRecord, RecordSummary, RecordType, User } from '../types';
import {
  decryptBytes,
  deriveRecordKey,
  encryptBytes,
  fromBase64,
  hashPassword,
  newId,
  randomBytes,
  sha256,
  toBase64,
} from './crypto';
import {
  type RecordMetadata,
  STORAGE_BUDGET_BYTES,
  type StoredRecord,
  type StoredUser,
  bytesUsed,
  initStore,
  isQuotaError,
  store,
} from './store';

export const MAX_UPLOAD_BYTES = 1_500_000;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
] as const;

const LATENCY_MS = import.meta.env?.MODE === 'test' ? 0 : 140;

export interface ValidationDetail {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: ValidationDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file'));
    reader.readAsArrayBuffer(file);
  });
}

function settle<T>(value: T): Promise<T> {
  if (LATENCY_MS === 0) return Promise.resolve(value);
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function publicUser(user: StoredUser): User {
  const { passwordHash, passwordSalt, keySalt, ...rest } = user;
  return rest;
}

async function encodeMetadata(key: string, metadata: RecordMetadata) {
  const bytes = new TextEncoder().encode(JSON.stringify(metadata));
  const blob = await encryptBytes(key, bytes);
  return { metaIv: blob.iv, metaCipher: blob.ciphertext };
}

async function publicRecord(key: string, record: StoredRecord): Promise<MedicalRecord> {
  const bytes = await decryptBytes(key, { iv: record.metaIv, ciphertext: record.metaCipher });
  const metadata = JSON.parse(new TextDecoder().decode(bytes)) as RecordMetadata;

  return {
    id: record.id,
    recordType: record.recordType,
    recordDate: record.recordDate,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
    ...metadata,
  };
}

function currentUser(): StoredUser {
  const session = store.session();
  const user = session && store.users().find((candidate) => candidate.id === session.userId);
  if (!user) throw new ApiError(401, 'Please sign in to continue');
  return user;
}

function recordKeyFor(user: StoredUser): string {
  const key = store.recordKey(user.id);
  if (!key) throw new ApiError(401, 'Your encryption key is unavailable — please sign in again');
  return key;
}

function ownedRecord(user: StoredUser, recordId: string): StoredRecord {
  const record = store
    .records()
    .find((candidate) => candidate.id === recordId && candidate.ownerId === user.id);
  if (!record) throw new ApiError(404, 'Record not found');
  return record;
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  dateOfBirth?: string;
  bloodGroup?: string;
}

function validateRegistration(payload: RegisterPayload): ValidationDetail[] {
  const details: ValidationDetail[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
    details.push({ field: 'email', message: 'A valid email address is required' });
  }
  if (payload.password.length < 8) {
    details.push({ field: 'password', message: 'Password must be at least 8 characters' });
  }
  if (payload.fullName.trim().length < 2) {
    details.push({ field: 'fullName', message: 'Full name is required' });
  }
  if (payload.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateOfBirth)) {
    details.push({ field: 'dateOfBirth', message: 'Date of birth must be YYYY-MM-DD' });
  }
  return details;
}

function validateMetadata(form: FormData): ValidationDetail[] {
  const details: ValidationDetail[] = [];
  const title = String(form.get('title') ?? '').trim();
  const recordType = String(form.get('recordType') ?? '');
  const recordDate = String(form.get('recordDate') ?? '');

  if (title.length < 2) details.push({ field: 'title', message: 'Title is required' });
  if (title.length > 120) details.push({ field: 'title', message: 'Title is too long' });
  if (!RECORD_TYPES.includes(recordType as RecordType)) {
    details.push({ field: 'recordType', message: 'Choose a record type' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    details.push({ field: 'recordDate', message: 'Record date must be YYYY-MM-DD' });
  }
  return details;
}

export const DEMO_CREDENTIALS = {
  email: 'asha.rao@medlog.test',
  password: 'DemoPass123!',
  fullName: 'Asha Rao',
} as const;

export const api = {
  async register(payload: RegisterPayload): Promise<{ user: User }> {
    initStore();

    const details = validateRegistration(payload);
    if (details.length > 0) throw new ApiError(400, 'Validation failed', details);

    const email = payload.email.trim().toLowerCase();
    const users = store.users();
    if (users.some((user) => user.email === email)) {
      throw new ApiError(409, 'An account with this email already exists');
    }

    const passwordSalt = toBase64(randomBytes(16));
    const keySalt = toBase64(randomBytes(16));

    const user: StoredUser = {
      id: newId(),
      email,
      fullName: payload.fullName.trim(),
      dateOfBirth: payload.dateOfBirth ?? null,
      bloodGroup: payload.bloodGroup ?? null,
      role: 'PATIENT',
      createdAt: new Date().toISOString(),
      passwordSalt,
      passwordHash: await hashPassword(payload.password, passwordSalt),
      keySalt,
    };

    store.saveUsers([...users, user]);
    store.saveRecordKey(user.id, await deriveRecordKey(payload.password, keySalt));
    store.saveSession(user.id);

    return settle({ user: publicUser(user) });
  },

  async login(email: string, password: string): Promise<{ user: User }> {
    initStore();

    const normalised = email.trim().toLowerCase();
    const user = store.users().find((candidate) => candidate.email === normalised);

    if (!user && normalised === DEMO_CREDENTIALS.email && password === DEMO_CREDENTIALS.password) {
      return api.signInAsDemoPatient();
    }

    const hash = user ? await hashPassword(password, user.passwordSalt) : null;

    if (!user || hash !== user.passwordHash) {
      throw new ApiError(401, 'Invalid email or password');
    }

    store.saveRecordKey(user.id, await deriveRecordKey(password, user.keySalt));
    store.saveSession(user.id);

    return settle({ user: publicUser(user) });
  },

  async me(): Promise<{ user: User }> {
    initStore();
    return settle({ user: publicUser(currentUser()) });
  },

  logout(): void {
    const session = store.session();
    if (session) store.clearRecordKey(session.userId);
    store.clearSession();
  },

  async listRecords(
    filters: { recordType?: string; search?: string } = {},
  ): Promise<{ records: MedicalRecord[] }> {
    const user = currentUser();
    const key = recordKeyFor(user);
    const search = filters.search?.trim().toLowerCase();

    const stored = store
      .records()
      .filter((record) => record.ownerId === user.id)
      .filter((record) => !filters.recordType || record.recordType === filters.recordType)
      .sort(
        (a, b) => b.recordDate.localeCompare(a.recordDate) || b.createdAt.localeCompare(a.createdAt),
      );

    const decoded = await Promise.all(stored.map((record) => publicRecord(key, record)));
    const records = search
      ? decoded.filter(
          (record) =>
            record.title.toLowerCase().includes(search) ||
            (record.providerName ?? '').toLowerCase().includes(search),
        )
      : decoded;

    return settle({ records });
  },

  async summary(): Promise<RecordSummary> {
    const user = currentUser();
    const key = recordKeyFor(user);
    const owned = store.records().filter((record) => record.ownerId === user.id);

    const byType: Partial<Record<RecordType, number>> = {};
    for (const record of owned) {
      byType[record.recordType] = (byType[record.recordType] ?? 0) + 1;
    }

    const recent = await Promise.all(
      [...owned]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5)
        .map((record) => publicRecord(key, record)),
    );

    return settle({
      totalRecords: owned.length,
      totalBytes: owned.reduce((sum, record) => sum + record.sizeBytes, 0),
      lastUploadAt: recent[0]?.createdAt ?? null,
      byType,
      recentRecords: recent,
      storageUsedBytes: bytesUsed(),
      storageBudgetBytes: STORAGE_BUDGET_BYTES,
    });
  },

  async uploadRecord(form: FormData): Promise<{ record: MedicalRecord }> {
    const user = currentUser();
    const key = recordKeyFor(user);

    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(400, 'A file is required');

    const details = validateMetadata(form);
    if (details.length > 0) throw new ApiError(400, 'Validation failed', details);

    if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
      throw new ApiError(400, `Unsupported file type: ${file.type || 'unknown'}`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiError(413, 'File exceeds the maximum allowed size');
    }

    const plaintext = await readFileBytes(file);
    const blob = await encryptBytes(key, plaintext);

    const metadata: RecordMetadata = {
      title: String(form.get('title')).trim(),
      providerName: String(form.get('providerName') ?? '').trim() || null,
      notes: String(form.get('notes') ?? '').trim() || null,
      originalFilename: file.name,
    };

    const record: StoredRecord = {
      id: newId(),
      ownerId: user.id,
      recordType: String(form.get('recordType')) as RecordType,
      recordDate: String(form.get('recordDate')),
      mimeType: file.type,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      iv: blob.iv,
      checksum: await sha256(plaintext),
      ...(await encodeMetadata(key, metadata)),
    };

    try {
      store.saveBlob(record.id, blob.ciphertext);
      store.saveRecords([...store.records(), record]);
    } catch (error) {
      store.deleteBlob(record.id);
      if (isQuotaError(error)) {
        throw new ApiError(
          507,
          'Browser storage is full. Delete a record to free space before uploading another.',
        );
      }
      throw error;
    }

    return settle({ record: await publicRecord(key, record) });
  },

  async readRecordFile(recordId: string): Promise<{ record: MedicalRecord; bytes: Uint8Array }> {
    const user = currentUser();
    const key = recordKeyFor(user);
    const record = ownedRecord(user, recordId);

    const ciphertext = store.blob(record.id);
    if (!ciphertext) throw new ApiError(404, 'The stored file is missing');

    const bytes = await decryptBytes(key, { iv: record.iv, ciphertext });
    if ((await sha256(bytes)) !== record.checksum) {
      throw new ApiError(422, 'This record failed its integrity check and was not opened');
    }

    return { record: await publicRecord(key, record), bytes };
  },

  async downloadRecord(record: MedicalRecord): Promise<void> {
    const { bytes } = await api.readRecordFile(record.id);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: record.mimeType }));

    const link = document.createElement('a');
    link.href = url;
    link.download = record.originalFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async deleteRecord(recordId: string): Promise<void> {
    const user = currentUser();
    const record = ownedRecord(user, recordId);

    store.deleteBlob(record.id);
    store.saveRecords(store.records().filter((candidate) => candidate.id !== record.id));

    return settle(undefined);
  },

  async seedDemoRecords(): Promise<number> {
    const seeds: Array<[string, RecordType, string, string, string]> = [
      ['Complete blood count', 'LAB_REPORT', '2026-07-14', 'City General Hospital', 'Fasting sample, review in 3 months'],
      ['Metformin 500mg repeat', 'PRESCRIPTION', '2026-06-18', 'Dr. Menon Family Clinic', 'One tablet twice daily after meals'],
      ['Chest X-ray report', 'IMAGING', '2026-05-02', 'City General Hospital', 'No acute findings'],
      ['Covid booster certificate', 'VACCINATION', '2026-02-11', 'District Health Centre', ''],
    ];

    for (const [title, recordType, recordDate, providerName, notes] of seeds) {
      const form = new FormData();
      const body = `MedLog sample document\n\n${title}\n${providerName} · ${recordDate}\n`;
      form.append(
        'file',
        new File([body], `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`, {
          type: 'text/plain',
        }),
      );
      form.append('title', title);
      form.append('recordType', recordType);
      form.append('recordDate', recordDate);
      form.append('providerName', providerName);
      form.append('notes', notes);

      await api.uploadRecord(form);
    }

    return seeds.length;
  },

  async signInAsDemoPatient(): Promise<{ user: User }> {
    initStore();

    const existing = store.users().some((user) => user.email === DEMO_CREDENTIALS.email);
    if (existing) {
      return api.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
    }

    const session = await api.register({
      email: DEMO_CREDENTIALS.email,
      password: DEMO_CREDENTIALS.password,
      fullName: DEMO_CREDENTIALS.fullName,
      dateOfBirth: '1994-03-12',
      bloodGroup: 'O+',
    });

    await api.seedDemoRecords();
    return session;
  },

  inspectRawStorage(recordId: string): string | null {
    return store.blob(recordId);
  },

  resetEverything(): void {
    store.reset();
  },
};

export { fromBase64, toBase64 };
