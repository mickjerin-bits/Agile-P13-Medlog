import { RECORD_TYPES, REMINDER_KINDS, REPEAT_RULES, USER_ROLES } from '../types';
import type {
  AuditEntry,
  ConsentGrant,
  HealthAnalytics,
  MedicalRecord,
  RecordSummary,
  RecordType,
  Reminder,
  ReminderKind,
  RepeatRule,
  SharedPatient,
  User,
  UserRole,
} from '../types';
import { buildAnalytics } from './analytics';
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
import { activeCount, groupReminders, nextDueDate, todayIso } from './schedule';
import {
  type RecordMetadata,
  type ReminderMetadata,
  STORAGE_BUDGET_BYTES,
  type StoredAudit,
  type StoredGrant,
  type StoredRecord,
  type StoredReminder,
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

function requireRole(user: StoredUser, role: UserRole): void {
  if (user.role === role) return;
  throw new ApiError(
    403,
    role === 'DOCTOR'
      ? 'Only a doctor account can open shared records'
      : 'Only a patient account can do that',
  );
}

function isExpired(grant: StoredGrant, today: string): boolean {
  return grant.expiresAt !== null && grant.expiresAt < today;
}

function grantAllows(grant: StoredGrant, recordType: RecordType): boolean {
  return grant.recordTypes.length === 0 || grant.recordTypes.includes(recordType);
}

function recordAudit(entry: Omit<StoredAudit, 'id' | 'at'>): void {
  store.saveAudit([
    ...store.audit(),
    { ...entry, id: newId(), at: new Date().toISOString() },
  ]);
}

function publicGrant(grant: StoredGrant, patient: StoredUser, doctor: StoredUser): ConsentGrant {
  return {
    id: grant.id,
    patientId: patient.id,
    patientName: patient.fullName,
    patientEmail: patient.email,
    doctorId: doctor.id,
    doctorName: doctor.fullName,
    doctorEmail: doctor.email,
    doctorSpecialty: doctor.specialty,
    recordTypes: grant.recordTypes,
    purpose: grant.purpose,
    createdAt: grant.createdAt,
    expiresAt: grant.expiresAt,
  };
}

async function grantRecordKey(grant: StoredGrant): Promise<string> {
  const bytes = await decryptBytes(grant.wrapKey, {
    iv: grant.wrappedIv,
    ciphertext: grant.wrappedKey,
  });
  return new TextDecoder().decode(bytes);
}

function activeGrantForDoctor(doctor: StoredUser, grantId: string): StoredGrant {
  const grant = store
    .grants()
    .find((candidate) => candidate.id === grantId && candidate.doctorId === doctor.id);
  if (!grant || isExpired(grant, todayIso())) {
    throw new ApiError(404, 'This patient is no longer sharing their records with you');
  }
  return grant;
}

function sharedPatientView(grant: StoredGrant, patient: StoredUser): SharedPatient {
  const recordCount = store
    .records()
    .filter((record) => record.ownerId === patient.id && grantAllows(grant, record.recordType))
    .length;

  return {
    grantId: grant.id,
    patientId: patient.id,
    patientName: patient.fullName,
    patientEmail: patient.email,
    dateOfBirth: patient.dateOfBirth,
    bloodGroup: patient.bloodGroup,
    recordTypes: grant.recordTypes,
    purpose: grant.purpose,
    createdAt: grant.createdAt,
    expiresAt: grant.expiresAt,
    recordCount,
  };
}

async function decryptRecords(key: string, stored: StoredRecord[]): Promise<MedicalRecord[]> {
  return Promise.all(stored.map((record) => publicRecord(key, record)));
}

function ownedRecordsSorted(userId: string): StoredRecord[] {
  return store
    .records()
    .filter((record) => record.ownerId === userId)
    .sort(
      (a, b) => b.recordDate.localeCompare(a.recordDate) || b.createdAt.localeCompare(a.createdAt),
    );
}

async function publicReminder(key: string, reminder: StoredReminder): Promise<Reminder> {
  const bytes = await decryptBytes(key, {
    iv: reminder.metaIv,
    ciphertext: reminder.metaCipher,
  });
  const metadata = JSON.parse(new TextDecoder().decode(bytes)) as ReminderMetadata;

  return {
    id: reminder.id,
    kind: reminder.kind,
    dueDate: reminder.dueDate,
    dueTime: reminder.dueTime,
    repeat: reminder.repeat,
    completedAt: reminder.completedAt,
    createdAt: reminder.createdAt,
    relatedRecordId: reminder.relatedRecordId,
    ...metadata,
  };
}

async function ownReminders(user: StoredUser, key: string): Promise<Reminder[]> {
  const stored = store
    .reminders()
    .filter((reminder) => reminder.ownerId === user.id)
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? '').localeCompare(b.dueTime ?? ''),
    );

  return Promise.all(stored.map((reminder) => publicReminder(key, reminder)));
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  role?: UserRole;
  specialty?: string;
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
  if (payload.role && !USER_ROLES.includes(payload.role)) {
    details.push({ field: 'role', message: 'Choose whether you are a patient or a doctor' });
  }
  return details;
}

export interface ReminderPayload {
  kind: ReminderKind;
  title: string;
  dueDate: string;
  dueTime?: string;
  repeat?: RepeatRule;
  notes?: string;
  relatedRecordId?: string;
}

function validateReminder(payload: ReminderPayload): ValidationDetail[] {
  const details: ValidationDetail[] = [];

  if (payload.title.trim().length < 2) {
    details.push({ field: 'title', message: 'Title is required' });
  }
  if (payload.title.trim().length > 120) {
    details.push({ field: 'title', message: 'Title is too long' });
  }
  if (!REMINDER_KINDS.includes(payload.kind)) {
    details.push({ field: 'kind', message: 'Choose a reminder type' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)) {
    details.push({ field: 'dueDate', message: 'Due date must be YYYY-MM-DD' });
  }
  if (payload.dueTime && !/^\d{2}:\d{2}$/.test(payload.dueTime)) {
    details.push({ field: 'dueTime', message: 'Time must be HH:MM' });
  }
  if (payload.repeat && !REPEAT_RULES.includes(payload.repeat)) {
    details.push({ field: 'repeat', message: 'Choose how often this repeats' });
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

export const DEMO_DOCTOR_CREDENTIALS = {
  email: 'dr.iyer@medlog.test',
  password: 'DemoPass123!',
  fullName: 'Dr. Priya Iyer',
  specialty: 'General Medicine',
} as const;

async function createUser(payload: RegisterPayload): Promise<StoredUser> {
  const passwordSalt = toBase64(randomBytes(16));
  const keySalt = toBase64(randomBytes(16));

  return {
    id: newId(),
    email: payload.email.trim().toLowerCase(),
    fullName: payload.fullName.trim(),
    dateOfBirth: payload.dateOfBirth ?? null,
    bloodGroup: payload.bloodGroup ?? null,
    role: payload.role ?? 'PATIENT',
    specialty: payload.specialty?.trim() || null,
    createdAt: new Date().toISOString(),
    passwordSalt,
    passwordHash: await hashPassword(payload.password, passwordSalt),
    keySalt,
  };
}

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

    const user = await createUser(payload);

    store.saveUsers([...users, user]);
    store.saveRecordKey(user.id, await deriveRecordKey(payload.password, user.keySalt));
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

    if (
      !user &&
      normalised === DEMO_DOCTOR_CREDENTIALS.email &&
      password === DEMO_DOCTOR_CREDENTIALS.password
    ) {
      return api.signInAsDemoDoctor();
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

  async seedDemoReminders(): Promise<number> {
    const today = todayIso();
    const shift = (days: number) => {
      const date = new Date(`${today}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };

    const seeds: ReminderPayload[] = [
      {
        kind: 'MEDICATION',
        title: 'Metformin 500mg',
        dueDate: today,
        dueTime: '08:00',
        repeat: 'DAILY',
        notes: 'One tablet after breakfast',
      },
      {
        kind: 'FOLLOW_UP',
        title: 'Repeat HbA1c test',
        dueDate: shift(-3),
        repeat: 'NONE',
        notes: 'Overdue since the last consultation',
      },
      {
        kind: 'APPOINTMENT',
        title: 'Endocrinology review',
        dueDate: shift(9),
        dueTime: '10:30',
        repeat: 'NONE',
        notes: 'Carry the most recent blood panel',
      },
      { kind: 'MEDICATION', title: 'Vitamin D sachet', dueDate: shift(2), repeat: 'WEEKLY' },
    ];

    for (const seed of seeds) await api.createReminder(seed);

    return seeds.length;
  },

  async ensureDemoDoctorAccess(): Promise<void> {
    const users = store.users();
    let doctor = users.find((user) => user.email === DEMO_DOCTOR_CREDENTIALS.email);

    if (!doctor) {
      doctor = await createUser({
        email: DEMO_DOCTOR_CREDENTIALS.email,
        password: DEMO_DOCTOR_CREDENTIALS.password,
        fullName: DEMO_DOCTOR_CREDENTIALS.fullName,
        role: 'DOCTOR',
        specialty: DEMO_DOCTOR_CREDENTIALS.specialty,
      });
      store.saveUsers([...users, doctor]);
    }

    const patient = store.users().find((user) => user.email === DEMO_CREDENTIALS.email);
    const session = store.session();
    if (!patient || session?.userId !== patient.id) return;

    const alreadyShared = store
      .grants()
      .some(
        (grant) =>
          grant.patientId === patient.id &&
          grant.doctorId === doctor.id &&
          !isExpired(grant, todayIso()),
      );
    if (alreadyShared) return;

    await api.grantConsent({
      doctorEmail: DEMO_DOCTOR_CREDENTIALS.email,
      purpose: 'Ongoing diabetes review',
    });
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
    await api.seedDemoReminders();
    await api.ensureDemoDoctorAccess();

    return session;
  },

  async signInAsDemoDoctor(): Promise<{ user: User }> {
    initStore();

    const existing = store.users().some((user) => user.email === DEMO_DOCTOR_CREDENTIALS.email);
    if (!existing) {
      await api.signInAsDemoPatient();
      await api.ensureDemoDoctorAccess();
      api.logout();
    }

    return api.login(DEMO_DOCTOR_CREDENTIALS.email, DEMO_DOCTOR_CREDENTIALS.password);
  },

  async grantConsent(payload: {
    doctorEmail: string;
    recordTypes?: RecordType[];
    purpose?: string;
    expiresAt?: string;
  }): Promise<{ grant: ConsentGrant }> {
    const patient = currentUser();
    requireRole(patient, 'PATIENT');
    const key = recordKeyFor(patient);

    const email = payload.doctorEmail.trim().toLowerCase();
    const doctor = store
      .users()
      .find((candidate) => candidate.email === email && candidate.role === 'DOCTOR');

    if (!doctor) {
      throw new ApiError(404, 'No doctor is registered with that email address');
    }

    if (payload.expiresAt) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.expiresAt)) {
        throw new ApiError(400, 'Validation failed', [
          { field: 'expiresAt', message: 'Expiry date must be YYYY-MM-DD' },
        ]);
      }
      if (payload.expiresAt < todayIso()) {
        throw new ApiError(400, 'Validation failed', [
          { field: 'expiresAt', message: 'Expiry date must be in the future' },
        ]);
      }
    }

    const grants = store.grants();
    const today = todayIso();
    if (
      grants.some(
        (grant) =>
          grant.patientId === patient.id &&
          grant.doctorId === doctor.id &&
          !isExpired(grant, today),
      )
    ) {
      throw new ApiError(409, 'That doctor already has access to your records');
    }

    const wrapKey = toBase64(randomBytes(32));
    const wrapped = await encryptBytes(wrapKey, new TextEncoder().encode(key));

    const grant: StoredGrant = {
      id: newId(),
      patientId: patient.id,
      doctorId: doctor.id,
      recordTypes: payload.recordTypes ?? [],
      purpose: payload.purpose?.trim() || null,
      createdAt: new Date().toISOString(),
      expiresAt: payload.expiresAt ?? null,
      wrapKey,
      wrappedIv: wrapped.iv,
      wrappedKey: wrapped.ciphertext,
    };

    store.saveGrants([...grants, grant]);
    recordAudit({
      patientId: patient.id,
      actorId: patient.id,
      actorRole: 'PATIENT',
      action: 'CONSENT_GRANTED',
      recordId: null,
      detail: `${doctor.fullName} (${doctor.email})`,
    });

    return settle({ grant: publicGrant(grant, patient, doctor) });
  },

  async revokeConsent(grantId: string): Promise<void> {
    const patient = currentUser();
    requireRole(patient, 'PATIENT');

    const grant = store
      .grants()
      .find((candidate) => candidate.id === grantId && candidate.patientId === patient.id);
    if (!grant) throw new ApiError(404, 'That access grant was not found');

    const doctor = store.users().find((candidate) => candidate.id === grant.doctorId);

    store.saveGrants(store.grants().filter((candidate) => candidate.id !== grant.id));
    recordAudit({
      patientId: patient.id,
      actorId: patient.id,
      actorRole: 'PATIENT',
      action: 'CONSENT_REVOKED',
      recordId: null,
      detail: doctor ? `${doctor.fullName} (${doctor.email})` : null,
    });

    return settle(undefined);
  },

  async listConsentGrants(): Promise<{ grants: ConsentGrant[] }> {
    const patient = currentUser();
    requireRole(patient, 'PATIENT');

    const users = store.users();
    const grants = store
      .grants()
      .filter((grant) => grant.patientId === patient.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .flatMap((grant) => {
        const doctor = users.find((candidate) => candidate.id === grant.doctorId);
        return doctor ? [publicGrant(grant, patient, doctor)] : [];
      });

    return settle({ grants });
  },

  async listSharedPatients(): Promise<{ patients: SharedPatient[] }> {
    const doctor = currentUser();
    requireRole(doctor, 'DOCTOR');

    const users = store.users();
    const today = todayIso();
    const patients = store
      .grants()
      .filter((grant) => grant.doctorId === doctor.id && !isExpired(grant, today))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .flatMap((grant) => {
        const patient = users.find((candidate) => candidate.id === grant.patientId);
        return patient ? [sharedPatientView(grant, patient)] : [];
      });

    return settle({ patients });
  },

  async listSharedRecords(
    grantId: string,
    filters: { recordType?: string; search?: string } = {},
  ): Promise<{ patient: SharedPatient; records: MedicalRecord[] }> {
    const doctor = currentUser();
    requireRole(doctor, 'DOCTOR');

    const grant = activeGrantForDoctor(doctor, grantId);
    const patient = store.users().find((candidate) => candidate.id === grant.patientId);
    if (!patient) throw new ApiError(404, 'That patient account no longer exists');

    const key = await grantRecordKey(grant);
    const search = filters.search?.trim().toLowerCase();

    const stored = ownedRecordsSorted(grant.patientId)
      .filter((record) => grantAllows(grant, record.recordType))
      .filter((record) => !filters.recordType || record.recordType === filters.recordType);

    const decoded = await decryptRecords(key, stored);
    const records = search
      ? decoded.filter(
          (record) =>
            record.title.toLowerCase().includes(search) ||
            (record.providerName ?? '').toLowerCase().includes(search),
        )
      : decoded;

    recordAudit({
      patientId: grant.patientId,
      actorId: doctor.id,
      actorRole: 'DOCTOR',
      action: 'RECORDS_VIEWED',
      recordId: null,
      detail: `${records.length} record(s)`,
    });

    return settle({ patient: sharedPatientView(grant, patient), records });
  },

  async readSharedRecordFile(
    grantId: string,
    recordId: string,
  ): Promise<{ record: MedicalRecord; bytes: Uint8Array }> {
    const doctor = currentUser();
    requireRole(doctor, 'DOCTOR');

    const grant = activeGrantForDoctor(doctor, grantId);
    const stored = store
      .records()
      .find((candidate) => candidate.id === recordId && candidate.ownerId === grant.patientId);

    if (!stored) throw new ApiError(404, 'Record not found');

    if (!grantAllows(grant, stored.recordType)) {
      recordAudit({
        patientId: grant.patientId,
        actorId: doctor.id,
        actorRole: 'DOCTOR',
        action: 'ACCESS_DENIED',
        recordId: stored.id,
        detail: 'Record type outside the consent scope',
      });
      throw new ApiError(404, 'Record not found');
    }

    const ciphertext = store.blob(stored.id);
    if (!ciphertext) throw new ApiError(404, 'The stored file is missing');

    const key = await grantRecordKey(grant);
    const bytes = await decryptBytes(key, { iv: stored.iv, ciphertext });
    if ((await sha256(bytes)) !== stored.checksum) {
      throw new ApiError(422, 'This record failed its integrity check and was not opened');
    }

    recordAudit({
      patientId: grant.patientId,
      actorId: doctor.id,
      actorRole: 'DOCTOR',
      action: 'RECORD_OPENED',
      recordId: stored.id,
      detail: null,
    });

    return { record: await publicRecord(key, stored), bytes };
  },

  async downloadSharedRecord(grantId: string, record: MedicalRecord): Promise<void> {
    const { bytes } = await api.readSharedRecordFile(grantId, record.id);
    const grant = store.grants().find((candidate) => candidate.id === grantId);

    if (grant) {
      recordAudit({
        patientId: grant.patientId,
        actorId: currentUser().id,
        actorRole: 'DOCTOR',
        action: 'RECORD_DOWNLOADED',
        recordId: record.id,
        detail: null,
      });
    }

    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: record.mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = record.originalFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async listAuditTrail(): Promise<{ entries: AuditEntry[] }> {
    const patient = currentUser();
    requireRole(patient, 'PATIENT');
    const key = recordKeyFor(patient);

    const users = store.users();
    const owned = new Map(
      store.records().filter((record) => record.ownerId === patient.id).map((r) => [r.id, r]),
    );

    const entries = await Promise.all(
      store
        .audit()
        .filter((entry) => entry.patientId === patient.id)
        .sort((a, b) => b.at.localeCompare(a.at))
        .map(async (entry) => {
          const actor = users.find((candidate) => candidate.id === entry.actorId);
          const record = entry.recordId ? owned.get(entry.recordId) : undefined;

          return {
            id: entry.id,
            patientId: entry.patientId,
            actorId: entry.actorId,
            actorName: actor?.fullName ?? 'A removed account',
            actorRole: entry.actorRole,
            action: entry.action,
            recordId: entry.recordId,
            recordTitle: record ? (await publicRecord(key, record)).title : null,
            detail: entry.detail,
            at: entry.at,
          } satisfies AuditEntry;
        }),
    );

    return settle({ entries });
  },

  async listReminders(): Promise<{ reminders: Reminder[] }> {
    const user = currentUser();
    requireRole(user, 'PATIENT');
    const key = recordKeyFor(user);

    return settle({ reminders: await ownReminders(user, key) });
  },

  async createReminder(payload: ReminderPayload): Promise<{ reminder: Reminder }> {
    const user = currentUser();
    requireRole(user, 'PATIENT');
    const key = recordKeyFor(user);

    const details = validateReminder(payload);
    if (details.length > 0) throw new ApiError(400, 'Validation failed', details);

    const metadata: ReminderMetadata = {
      title: payload.title.trim(),
      notes: payload.notes?.trim() || null,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(metadata));
    const blob = await encryptBytes(key, bytes);

    const reminder: StoredReminder = {
      id: newId(),
      ownerId: user.id,
      kind: payload.kind,
      dueDate: payload.dueDate,
      dueTime: payload.dueTime?.trim() || null,
      repeat: payload.repeat ?? 'NONE',
      completedAt: null,
      createdAt: new Date().toISOString(),
      relatedRecordId: payload.relatedRecordId ?? null,
      metaIv: blob.iv,
      metaCipher: blob.ciphertext,
    };

    try {
      store.saveReminders([...store.reminders(), reminder]);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new ApiError(507, 'Browser storage is full. Delete something to free space.');
      }
      throw error;
    }

    return settle({ reminder: await publicReminder(key, reminder) });
  },

  async completeReminder(reminderId: string): Promise<{ reminder: Reminder }> {
    const user = currentUser();
    requireRole(user, 'PATIENT');
    const key = recordKeyFor(user);

    const reminders = store.reminders();
    const existing = reminders.find(
      (candidate) => candidate.id === reminderId && candidate.ownerId === user.id,
    );
    if (!existing) throw new ApiError(404, 'Reminder not found');

    const updated: StoredReminder =
      existing.repeat === 'NONE'
        ? { ...existing, completedAt: new Date().toISOString() }
        : { ...existing, dueDate: nextDueDate(existing.dueDate, existing.repeat) };

    store.saveReminders(
      reminders.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    );

    return settle({ reminder: await publicReminder(key, updated) });
  },

  async reopenReminder(reminderId: string): Promise<{ reminder: Reminder }> {
    const user = currentUser();
    requireRole(user, 'PATIENT');
    const key = recordKeyFor(user);

    const reminders = store.reminders();
    const existing = reminders.find(
      (candidate) => candidate.id === reminderId && candidate.ownerId === user.id,
    );
    if (!existing) throw new ApiError(404, 'Reminder not found');

    const updated: StoredReminder = { ...existing, completedAt: null };
    store.saveReminders(
      reminders.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
    );

    return settle({ reminder: await publicReminder(key, updated) });
  },

  async deleteReminder(reminderId: string): Promise<void> {
    const user = currentUser();
    requireRole(user, 'PATIENT');

    const reminders = store.reminders();
    const existing = reminders.find(
      (candidate) => candidate.id === reminderId && candidate.ownerId === user.id,
    );
    if (!existing) throw new ApiError(404, 'Reminder not found');

    store.saveReminders(reminders.filter((candidate) => candidate.id !== existing.id));
    return settle(undefined);
  },

  async analytics(): Promise<HealthAnalytics> {
    const user = currentUser();
    requireRole(user, 'PATIENT');
    const key = recordKeyFor(user);
    const today = todayIso();

    const records = await decryptRecords(key, ownedRecordsSorted(user.id));
    const reminders = await ownReminders(user, key);
    const doctorsWithAccess = store
      .grants()
      .filter((grant) => grant.patientId === user.id && !isExpired(grant, today)).length;

    return settle(
      buildAnalytics(records, {
        today,
        activeReminders: activeCount(groupReminders(reminders, today)),
        doctorsWithAccess,
      }),
    );
  },

  inspectRawStorage(recordId: string): string | null {
    return store.blob(recordId);
  },

  resetEverything(): void {
    store.reset();
  },
};

export { fromBase64, toBase64 };
