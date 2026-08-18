import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import { store } from './store';
import type { RecordType } from '../types';

const PASSWORD = 'Str0ngPass!';

let counter = 0;

function recordForm(title = 'Blood panel', recordType: RecordType = 'LAB_REPORT') {
  const form = new FormData();
  form.append('file', new File([`${title} contents`], 'panel.txt', { type: 'text/plain' }));
  form.append('title', title);
  form.append('recordType', recordType);
  form.append('recordDate', '2026-07-01');
  form.append('providerName', 'City General Hospital');
  form.append('notes', '');
  return form;
}

async function makeDoctor() {
  counter += 1;
  const email = `doctor${counter}@medlog.test`;
  await api.register({
    email,
    password: PASSWORD,
    fullName: `Doctor ${counter}`,
    role: 'DOCTOR',
    specialty: 'General Medicine',
  });
  return email;
}

async function makePatient() {
  counter += 1;
  const email = `patient${counter}@medlog.test`;
  await api.register({ email, password: PASSWORD, fullName: `Patient ${counter}` });
  return email;
}

async function shared(recordTypes: RecordType[] = []) {
  const doctorEmail = await makeDoctor();
  const patientEmail = await makePatient();
  const { record } = await api.uploadRecord(recordForm());
  const { grant } = await api.grantConsent({ doctorEmail, recordTypes, purpose: 'Review' });
  return { doctorEmail, patientEmail, record, grant };
}

function rawStorage(): string {
  return Object.keys(localStorage)
    .map((key) => `${key}=${localStorage.getItem(key) ?? ''}`)
    .join('\n');
}

beforeEach(() => {
  localStorage.clear();
});

describe('granting consent', () => {
  it('lets a doctor read the records a patient shared with them', async () => {
    const { doctorEmail, grant } = await shared();

    await api.login(doctorEmail, PASSWORD);
    const { patients } = await api.listSharedPatients();
    expect(patients).toHaveLength(1);
    expect(patients[0]?.grantId).toBe(grant.id);
    expect(patients[0]?.recordCount).toBe(1);

    const { records } = await api.listSharedRecords(grant.id);
    expect(records.map((record) => record.title)).toEqual(['Blood panel']);
  });

  it('decrypts the shared record back to the exact bytes the patient uploaded', async () => {
    const { doctorEmail, grant, record } = await shared();

    await api.login(doctorEmail, PASSWORD);
    const { bytes } = await api.readSharedRecordFile(grant.id, record.id);

    expect(new TextDecoder().decode(bytes)).toBe('Blood panel contents');
  });

  it('refuses to share with an email that is not a registered doctor', async () => {
    await makePatient();

    await expect(api.grantConsent({ doctorEmail: 'nobody@medlog.test' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('refuses to share with the same doctor twice', async () => {
    const { doctorEmail, patientEmail } = await shared();
    await api.login(patientEmail, PASSWORD);

    await expect(api.grantConsent({ doctorEmail })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects an expiry date that has already passed', async () => {
    const doctorEmail = await makeDoctor();
    await makePatient();

    await expect(
      api.grantConsent({ doctorEmail, expiresAt: '2020-01-01' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('doctor isolation', () => {
  it('shows a doctor nothing until a patient shares with them', async () => {
    const doctorEmail = await makeDoctor();
    await makePatient();
    await api.uploadRecord(recordForm());

    await api.login(doctorEmail, PASSWORD);

    expect((await api.listSharedPatients()).patients).toEqual([]);
  });

  it('refuses a doctor who was never granted access to that consent id', async () => {
    const { grant } = await shared();
    const otherDoctor = await makeDoctor();

    await api.login(otherDoctor, PASSWORD);

    await expect(api.listSharedRecords(grant.id)).rejects.toMatchObject({ status: 404 });
  });

  it('closes the door the moment consent is revoked', async () => {
    const { doctorEmail, patientEmail, grant } = await shared();

    await api.login(doctorEmail, PASSWORD);
    expect((await api.listSharedRecords(grant.id)).records).toHaveLength(1);

    await api.login(patientEmail, PASSWORD);
    await api.revokeConsent(grant.id);

    await api.login(doctorEmail, PASSWORD);
    await expect(api.listSharedRecords(grant.id)).rejects.toMatchObject({ status: 404 });
    expect((await api.listSharedPatients()).patients).toEqual([]);
  });

  it('destroys the wrapped record key when consent is revoked', async () => {
    const { patientEmail, grant } = await shared();

    expect(store.grants()).toHaveLength(1);
    const wrapped = store.grants()[0]!.wrappedKey;
    expect(rawStorage()).toContain(wrapped);

    await api.login(patientEmail, PASSWORD);
    await api.revokeConsent(grant.id);

    expect(store.grants()).toEqual([]);
    expect(rawStorage()).not.toContain(wrapped);
  });

  it('treats consent that has expired as no longer there', async () => {
    const { doctorEmail, grant } = await shared();

    store.saveGrants(
      store.grants().map((candidate) => ({ ...candidate, expiresAt: '2020-01-01' })),
    );

    await api.login(doctorEmail, PASSWORD);

    expect((await api.listSharedPatients()).patients).toEqual([]);
    await expect(api.listSharedRecords(grant.id)).rejects.toMatchObject({ status: 404 });
  });

  it('hides record types the patient left out of the grant', async () => {
    const doctorEmail = await makeDoctor();
    await makePatient();
    const { record: lab } = await api.uploadRecord(recordForm('Blood panel', 'LAB_REPORT'));
    const { record: scan } = await api.uploadRecord(recordForm('Chest X-ray', 'IMAGING'));
    const { grant } = await api.grantConsent({ doctorEmail, recordTypes: ['LAB_REPORT'] });

    await api.login(doctorEmail, PASSWORD);
    const { records } = await api.listSharedRecords(grant.id);

    expect(records.map((record) => record.title)).toEqual(['Blood panel']);
    await expect(api.readSharedRecordFile(grant.id, scan.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(api.readSharedRecordFile(grant.id, lab.id)).resolves.toBeTruthy();
  });

  it('keeps patient-only and doctor-only endpoints apart', async () => {
    const { doctorEmail, patientEmail, grant } = await shared();

    await api.login(doctorEmail, PASSWORD);
    await expect(api.listReminders()).rejects.toMatchObject({ status: 403 });
    await expect(api.listAuditTrail()).rejects.toMatchObject({ status: 403 });
    await expect(api.analytics()).rejects.toMatchObject({ status: 403 });

    await api.login(patientEmail, PASSWORD);
    await expect(api.listSharedPatients()).rejects.toMatchObject({ status: 403 });
    await expect(api.listSharedRecords(grant.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe('audit trail', () => {
  it('records the grant, the doctor reading, and the revoke', async () => {
    const { doctorEmail, patientEmail, grant, record } = await shared();

    await api.login(doctorEmail, PASSWORD);
    await api.listSharedRecords(grant.id);
    await api.readSharedRecordFile(grant.id, record.id);

    await api.login(patientEmail, PASSWORD);
    await api.revokeConsent(grant.id);

    const { entries } = await api.listAuditTrail();
    const actions = entries.map((entry) => entry.action);

    expect(actions).toContain('CONSENT_GRANTED');
    expect(actions).toContain('RECORDS_VIEWED');
    expect(actions).toContain('RECORD_OPENED');
    expect(actions).toContain('CONSENT_REVOKED');
  });

  it('names the doctor who opened a record and the record they opened', async () => {
    const { doctorEmail, patientEmail, grant, record } = await shared();

    await api.login(doctorEmail, PASSWORD);
    await api.readSharedRecordFile(grant.id, record.id);

    await api.login(patientEmail, PASSWORD);
    const { entries } = await api.listAuditTrail();
    const opened = entries.find((entry) => entry.action === 'RECORD_OPENED');

    expect(opened?.actorRole).toBe('DOCTOR');
    expect(opened?.actorName).toMatch(/^Doctor /);
    expect(opened?.recordTitle).toBe('Blood panel');
  });

  it('logs a refusal when a doctor reaches outside the consent scope', async () => {
    const doctorEmail = await makeDoctor();
    const patientEmail = await makePatient();
    await api.uploadRecord(recordForm('Blood panel', 'LAB_REPORT'));
    const { record: scan } = await api.uploadRecord(recordForm('Chest X-ray', 'IMAGING'));
    const { grant } = await api.grantConsent({ doctorEmail, recordTypes: ['LAB_REPORT'] });

    await api.login(doctorEmail, PASSWORD);
    await expect(api.readSharedRecordFile(grant.id, scan.id)).rejects.toMatchObject({
      status: 404,
    });

    await api.login(patientEmail, PASSWORD);
    const { entries } = await api.listAuditTrail();

    expect(entries.some((entry) => entry.action === 'ACCESS_DENIED')).toBe(true);
  });

  it('never writes a record title into the stored audit log', async () => {
    const { doctorEmail, patientEmail, grant, record } = await shared();

    await api.login(doctorEmail, PASSWORD);
    await api.readSharedRecordFile(grant.id, record.id);

    await api.login(patientEmail, PASSWORD);
    const { entries } = await api.listAuditTrail();

    expect(entries.some((entry) => entry.recordTitle === 'Blood panel')).toBe(true);
    expect(JSON.stringify(store.audit())).not.toContain('Blood panel');
  });

  it('shows one patient nothing of another patient audit history', async () => {
    await shared();
    const outsider = await makePatient();

    await api.login(outsider, PASSWORD);

    expect((await api.listAuditTrail()).entries).toEqual([]);
  });
});
