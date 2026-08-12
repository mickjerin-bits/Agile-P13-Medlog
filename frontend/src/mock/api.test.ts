import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, DEMO_CREDENTIALS, MAX_UPLOAD_BYTES, api } from './api';
import { store } from './store';

const PASSWORD = 'Str0ngPass!';

let counter = 0;

async function registerPatient(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const email = `patient${counter}@medlog.test`;
  const { user } = await api.register({
    email,
    password: PASSWORD,
    fullName: `Test Patient ${counter}`,
    ...overrides,
  });
  return { ...user, email };
}

function recordForm(content = 'lab results 2026', overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new File([content], 'panel.txt', { type: 'text/plain' }));
  form.append('title', 'Blood panel');
  form.append('recordType', 'LAB_REPORT');
  form.append('recordDate', '2026-07-01');
  form.append('providerName', 'City Hospital');
  form.append('notes', '');
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

function rawStorage(): string {
  return Object.keys(localStorage)
    .map((key) => `${key}=${localStorage.getItem(key) ?? ''}`)
    .join('\n');
}

async function textOf(recordId: string): Promise<string> {
  const { bytes } = await api.readRecordFile(recordId);
  return new TextDecoder().decode(bytes);
}

beforeEach(() => {
  localStorage.clear();
});

describe('register', () => {
  it('creates a patient, signs them in, and never stores the password', async () => {
    const { user } = await api.register({
      email: 'Asha@Example.com',
      password: PASSWORD,
      fullName: 'Asha Rao',
      dateOfBirth: '1994-03-12',
      bloodGroup: 'O+',
    });

    expect(user.email).toBe('asha@example.com');
    expect(user.role).toBe('PATIENT');
    expect(user).not.toHaveProperty('passwordHash');

    const raw = localStorage.getItem('medlog.users')!;
    expect(raw).not.toContain(PASSWORD);
    expect((await api.me()).user.id).toBe(user.id);
  });

  it('rejects a weak password and a bad email together', async () => {
    const error = await api
      .register({ email: 'not-an-email', password: 'short', fullName: 'Weak Pass' })
      .catch((e) => e as ApiError);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).details?.map((d) => d.field)).toEqual(['email', 'password']);
  });

  it('rejects a duplicate email', async () => {
    const patient = await registerPatient();

    await expect(
      api.register({ email: patient.email, password: PASSWORD, fullName: 'Copy Cat' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('login', () => {
  it('signs in with the right password', async () => {
    const patient = await registerPatient();
    api.logout();

    const { user } = await api.login(patient.email, PASSWORD);
    expect(user.id).toBe(patient.id);
  });

  it('rejects a wrong password without saying which field failed', async () => {
    const patient = await registerPatient();
    api.logout();

    await expect(api.login(patient.email, 'WrongPass!')).rejects.toThrow(
      'Invalid email or password',
    );
  });

  it('rejects an unknown email with the same message', async () => {
    await expect(api.login('nobody@medlog.test', PASSWORD)).rejects.toThrow(
      'Invalid email or password',
    );
  });
});

describe('schema versioning', () => {
  it('clears data written by an older build instead of failing to decrypt it', async () => {
    await registerPatient();
    await api.uploadRecord(recordForm());
    expect((await api.listRecords()).records).toHaveLength(1);

    localStorage.setItem('medlog.version', '1');

    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(store.users()).toHaveLength(0);
    expect(store.records()).toHaveLength(0);
  });
});

describe('session', () => {
  it('rejects reads once signed out', async () => {
    await registerPatient();
    api.logout();

    await expect(api.summary()).rejects.toMatchObject({ status: 401 });
    await expect(api.listRecords()).rejects.toMatchObject({ status: 401 });
  });
});

describe('uploadRecord', () => {
  it('stores the record with its metadata', async () => {
    await registerPatient();
    const { record } = await api.uploadRecord(recordForm());

    expect(record).toMatchObject({
      title: 'Blood panel',
      recordType: 'LAB_REPORT',
      recordDate: '2026-07-01',
      providerName: 'City Hospital',
      originalFilename: 'panel.txt',
      mimeType: 'text/plain',
    });
    expect(record).not.toHaveProperty('ownerId');
    expect(record).not.toHaveProperty('iv');
  });

  it('never writes the file contents into localStorage', async () => {
    await registerPatient();
    const secret = 'HIV panel: negative';
    const { record } = await api.uploadRecord(recordForm(secret));

    const ciphertext = api.inspectRawStorage(record.id)!;
    expect(ciphertext).not.toContain(secret);
    expect(ciphertext.length).toBeGreaterThan(0);
    expect(rawStorage()).not.toContain(secret);
  });

  it('never writes the record metadata into localStorage either', async () => {
    await registerPatient();
    await api.uploadRecord(
      recordForm('x', {
        title: 'Oncology discharge summary',
        providerName: 'Tata Memorial Hospital',
        notes: 'Chemotherapy cycle 3 completed',
      }),
    );

    const raw = rawStorage();
    expect(raw).not.toContain('Oncology discharge summary');
    expect(raw).not.toContain('Tata Memorial Hospital');
    expect(raw).not.toContain('Chemotherapy cycle 3 completed');
    expect(raw).not.toContain('panel.txt');
  });

  it('decrypts back to the exact bytes for the owner', async () => {
    await registerPatient();
    const { record } = await api.uploadRecord(recordForm('lab results 2026'));

    expect(await textOf(record.id)).toBe('lab results 2026');
  });

  it('rejects an unsupported file type', async () => {
    await registerPatient();
    const form = recordForm();
    form.set('file', new File(['MZ'], 'evil.exe', { type: 'application/x-msdownload' }));

    await expect(api.uploadRecord(form)).rejects.toThrow('Unsupported file type');
  });

  it('rejects invalid metadata', async () => {
    await registerPatient();
    const form = recordForm('x', { title: 'X', recordType: 'NOT_A_TYPE', recordDate: '01-07-2026' });

    const error = (await api.uploadRecord(form).catch((e) => e)) as ApiError;
    expect(error.status).toBe(400);
    expect(error.details?.map((d) => d.field)).toEqual(['title', 'recordType', 'recordDate']);
  });

  it('rejects a file over the size cap', async () => {
    await registerPatient();
    const big = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });

    const form = recordForm();
    form.set('file', big);

    await expect(api.uploadRecord(form)).rejects.toMatchObject({ status: 413 });
  });

  it('rejects an upload with no file', async () => {
    await registerPatient();
    const form = recordForm();
    form.delete('file');

    await expect(api.uploadRecord(form)).rejects.toThrow('A file is required');
  });

  it('reports a full quota and leaves no orphan blob behind', async () => {
    await registerPatient();
    const blobCount = () =>
      Object.keys(localStorage).filter((key) => key.startsWith('medlog.blob.')).length;
    const before = blobCount();

    const original = Storage.prototype.setItem;
    let calls = 0;
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key: string, value: string) {
        calls += 1;
        if (calls === 2) {
          const error = new Error('exceeded the quota');
          error.name = 'QuotaExceededError';
          throw error;
        }
        original.call(this, key, value);
      });

    try {
      await expect(api.uploadRecord(recordForm())).rejects.toMatchObject({ status: 507 });
    } finally {
      spy.mockRestore();
    }

    expect(blobCount()).toBe(before);
    expect((await api.listRecords()).records).toHaveLength(0);
  });
});

describe('isolation between patients', () => {
  it('lists only the caller\'s records', async () => {
    const alice = await registerPatient();
    await api.uploadRecord(recordForm());
    api.logout();

    await registerPatient();
    expect((await api.listRecords()).records).toHaveLength(0);

    api.logout();
    await api.login(alice.email, PASSWORD);
    expect((await api.listRecords()).records).toHaveLength(1);
  });

  it('refuses to open or delete another patient\'s record', async () => {
    await registerPatient();
    const { record } = await api.uploadRecord(recordForm());
    api.logout();

    await registerPatient();
    await expect(api.readRecordFile(record.id)).rejects.toMatchObject({ status: 404 });
    await expect(api.deleteRecord(record.id)).rejects.toMatchObject({ status: 404 });
  });

  it('cannot decrypt another patient\'s blob even with the raw ciphertext', async () => {
    await registerPatient();
    const { record } = await api.uploadRecord(recordForm('confidential'));
    const ciphertext = api.inspectRawStorage(record.id)!;
    api.logout();

    const bob = await registerPatient();
    const stolen = { ...store.records().find((r) => r.id === record.id)!, ownerId: bob.id };
    store.saveRecords([...store.records().filter((r) => r.id !== record.id), stolen]);
    store.saveBlob(record.id, ciphertext);

    await expect(api.readRecordFile(record.id)).rejects.toThrow();
  });
});

describe('listRecords filters', () => {
  it('filters by type and searches title and provider', async () => {
    await registerPatient();
    await api.uploadRecord(recordForm());

    expect((await api.listRecords({ recordType: 'PRESCRIPTION' })).records).toHaveLength(0);
    expect((await api.listRecords({ recordType: 'LAB_REPORT' })).records).toHaveLength(1);
    expect((await api.listRecords({ search: 'blood' })).records).toHaveLength(1);
    expect((await api.listRecords({ search: 'city hosp' })).records).toHaveLength(1);
    expect((await api.listRecords({ search: 'nothing' })).records).toHaveLength(0);
  });

  it('orders newest record date first', async () => {
    await registerPatient();
    await api.uploadRecord(recordForm('a', { title: 'Older', recordDate: '2026-01-01' }));
    await api.uploadRecord(recordForm('b', { title: 'Newer', recordDate: '2026-08-01' }));

    expect((await api.listRecords()).records.map((r) => r.title)).toEqual(['Newer', 'Older']);
  });
});

describe('summary', () => {
  it('aggregates the dashboard figures', async () => {
    await registerPatient();
    await api.uploadRecord(recordForm('twelve bytes'));

    const summary = await api.summary();

    expect(summary.totalRecords).toBe(1);
    expect(summary.totalBytes).toBe(12);
    expect(summary.byType).toEqual({ LAB_REPORT: 1 });
    expect(summary.recentRecords).toHaveLength(1);
    expect(summary.lastUploadAt).toBeTypeOf('string');
    expect(summary.storageUsedBytes).toBeGreaterThan(0);
  });

  it('returns zeroes for a patient with no records', async () => {
    await registerPatient();
    const summary = await api.summary();

    expect(summary).toMatchObject({ totalRecords: 0, totalBytes: 0, lastUploadAt: null });
  });
});

describe('deleteRecord', () => {
  it('removes the record and its ciphertext', async () => {
    await registerPatient();
    const { record } = await api.uploadRecord(recordForm());

    await api.deleteRecord(record.id);

    expect(api.inspectRawStorage(record.id)).toBeNull();
    expect((await api.listRecords()).records).toHaveLength(0);
  });
});

describe('integrity', () => {
  it('refuses to open a record whose ciphertext was tampered with', async () => {
    await registerPatient();
    const { record } = await api.uploadRecord(recordForm('original content'));

    const ciphertext = api.inspectRawStorage(record.id)!;
    const flipped = ciphertext[0] === 'A' ? `B${ciphertext.slice(1)}` : `A${ciphertext.slice(1)}`;
    store.saveBlob(record.id, flipped);

    await expect(api.readRecordFile(record.id)).rejects.toThrow();
  });

  it('reports a missing blob rather than returning empty data', async () => {
    await registerPatient();
    const { record } = await api.uploadRecord(recordForm());
    store.deleteBlob(record.id);

    await expect(api.readRecordFile(record.id)).rejects.toThrow('The stored file is missing');
  });
});

describe('signInAsDemoPatient', () => {
  it('creates the demo patient with sample records on first use', async () => {
    const { user } = await api.signInAsDemoPatient();

    expect(user.email).toBe(DEMO_CREDENTIALS.email);
    expect((await api.summary()).totalRecords).toBe(4);
  });

  it('signs back into the same account without duplicating records', async () => {
    await api.signInAsDemoPatient();
    api.logout();

    const { user } = await api.signInAsDemoPatient();

    expect((await api.summary()).totalRecords).toBe(4);
    expect(store.users().filter((u) => u.email === user.email)).toHaveLength(1);
  });

  it('can be signed into with the published password', async () => {
    await api.signInAsDemoPatient();
    api.logout();

    const { user } = await api.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
    expect(user.fullName).toBe(DEMO_CREDENTIALS.fullName);
  });

  it('provisions the demo account when the published credentials are typed in a fresh browser', async () => {
    expect(store.users()).toHaveLength(0);

    const { user } = await api.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);

    expect(user.email).toBe(DEMO_CREDENTIALS.email);
    expect((await api.summary()).totalRecords).toBe(4);
  });

  it('still rejects the demo email with a wrong password', async () => {
    await expect(api.login(DEMO_CREDENTIALS.email, 'NotTheDemoPassword')).rejects.toThrow(
      'Invalid email or password',
    );
    expect(store.users()).toHaveLength(0);
  });

  it('does not re-provision once the demo account exists with a changed password', async () => {
    await api.signInAsDemoPatient();
    api.logout();

    await expect(api.login(DEMO_CREDENTIALS.email, 'WrongPass!')).rejects.toThrow(
      'Invalid email or password',
    );
  });
});

describe('seedDemoRecords', () => {
  it('adds four sample records for the signed-in patient', async () => {
    await registerPatient();

    expect(await api.seedDemoRecords()).toBe(4);
    const summary = await api.summary();
    expect(summary.totalRecords).toBe(4);
    expect(Object.keys(summary.byType).sort()).toEqual([
      'IMAGING',
      'LAB_REPORT',
      'PRESCRIPTION',
      'VACCINATION',
    ]);
  });
});
