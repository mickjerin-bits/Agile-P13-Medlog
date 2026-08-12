import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { app, registerPatient, resetState, uploadRecord } from './helpers.js';

beforeEach(() => {
  resetState();
});

describe('POST /api/records', () => {
  it('stores an uploaded record with metadata', async () => {
    const patient = await registerPatient();
    const response = await uploadRecord(patient).expect(201);

    expect(response.body.record).toMatchObject({
      title: 'Blood panel',
      recordType: 'LAB_REPORT',
      recordDate: '2026-07-01',
      providerName: 'City Hospital',
      originalFilename: 'panel.txt',
      mimeType: 'text/plain',
    });
    expect(response.body.record).not.toHaveProperty('storageKey');
  });

  it('never writes the file to disk in plaintext', async () => {
    const patient = await registerPatient();
    const secret = 'HIV panel: negative';
    await uploadRecord(patient, secret).expect(201);

    const dir = path.join(config.storagePath, patient.id);
    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(1);

    const onDisk = fs.readFileSync(path.join(dir, files[0]!));
    expect(onDisk.toString('utf8')).not.toContain(secret);
    expect(onDisk.length).toBeGreaterThan(0);
  });

  it('rejects an unauthenticated upload', async () => {
    await request(app)
      .post('/api/records')
      .field('title', 'Blood panel')
      .attach('file', Buffer.from('x'), 'panel.txt')
      .expect(401);
  });

  it('rejects an unsupported file type', async () => {
    const patient = await registerPatient();

    const response = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${patient.token}`)
      .field('title', 'Malware')
      .field('recordType', 'OTHER')
      .field('recordDate', '2026-07-01')
      .attach('file', Buffer.from('MZ'), {
        filename: 'evil.exe',
        contentType: 'application/x-msdownload',
      })
      .expect(400);

    expect(response.body.error).toContain('Unsupported file type');
  });

  it('rejects invalid metadata', async () => {
    const patient = await registerPatient();

    const response = await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${patient.token}`)
      .field('title', 'X')
      .field('recordType', 'NOT_A_TYPE')
      .field('recordDate', '01-07-2026')
      .attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an upload with no file', async () => {
    const patient = await registerPatient();

    await request(app)
      .post('/api/records')
      .set('Authorization', `Bearer ${patient.token}`)
      .field('title', 'No file')
      .field('recordType', 'OTHER')
      .field('recordDate', '2026-07-01')
      .expect(400);
  });
});

describe('GET /api/records', () => {
  it('lists only the records owned by the caller', async () => {
    const alice = await registerPatient();
    const bob = await registerPatient();
    await uploadRecord(alice).expect(201);

    const aliceList = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    const bobList = await request(app)
      .get('/api/records')
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);

    expect(aliceList.body.records).toHaveLength(1);
    expect(bobList.body.records).toHaveLength(0);
  });

  it('filters by record type and search term', async () => {
    const patient = await registerPatient();
    await uploadRecord(patient).expect(201);

    const byType = await request(app)
      .get('/api/records?recordType=PRESCRIPTION')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200);
    expect(byType.body.records).toHaveLength(0);

    const bySearch = await request(app)
      .get('/api/records?search=blood')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200);
    expect(bySearch.body.records).toHaveLength(1);
  });
});

describe('GET /api/records/summary', () => {
  it('aggregates the dashboard figures', async () => {
    const patient = await registerPatient();
    await uploadRecord(patient, 'twelve bytes').expect(201);

    const response = await request(app)
      .get('/api/records/summary')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200);

    expect(response.body.totalRecords).toBe(1);
    expect(response.body.totalBytes).toBe(12);
    expect(response.body.byType).toEqual({ LAB_REPORT: 1 });
    expect(response.body.recentRecords).toHaveLength(1);
    expect(response.body.lastUploadAt).toBeTypeOf('string');
  });

  it('returns zeroes for a patient with no records', async () => {
    const patient = await registerPatient();

    const response = await request(app)
      .get('/api/records/summary')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200);

    expect(response.body).toMatchObject({ totalRecords: 0, totalBytes: 0, lastUploadAt: null });
  });
});

describe('GET /api/records/:id/file', () => {
  it('returns the decrypted file to its owner', async () => {
    const patient = await registerPatient();
    const created = await uploadRecord(patient, 'lab results 2026').expect(201);

    const response = await request(app)
      .get(`/api/records/${created.body.record.id}/file`)
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200);

    expect(response.headers['content-disposition']).toContain('panel.txt');
    expect(response.text).toBe('lab results 2026');
  });

  it('does not leak another patient\'s file', async () => {
    const alice = await registerPatient();
    const bob = await registerPatient();
    const created = await uploadRecord(alice).expect(201);

    await request(app)
      .get(`/api/records/${created.body.record.id}/file`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);
  });
});

describe('DELETE /api/records/:id', () => {
  it('removes the record and its encrypted blob', async () => {
    const patient = await registerPatient();
    const created = await uploadRecord(patient).expect(201);

    await request(app)
      .delete(`/api/records/${created.body.record.id}`)
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(204);

    await request(app)
      .get(`/api/records/${created.body.record.id}`)
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(404);

    expect(fs.readdirSync(path.join(config.storagePath, patient.id))).toHaveLength(0);
  });

  it('refuses to delete a record owned by someone else', async () => {
    const alice = await registerPatient();
    const bob = await registerPatient();
    const created = await uploadRecord(alice).expect(201);

    await request(app)
      .delete(`/api/records/${created.body.record.id}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);

    await request(app)
      .get(`/api/records/${created.body.record.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
  });
});
