import fs from 'node:fs';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { resetDbForTests } from '../src/db/index.js';

export const app: Express = createApp();

export function resetState(): void {
  resetDbForTests();
  fs.rmSync(config.storagePath, { recursive: true, force: true });
}

export interface TestPatient {
  token: string;
  id: string;
  email: string;
}

let counter = 0;

export async function registerPatient(overrides: Record<string, unknown> = {}): Promise<TestPatient> {
  counter += 1;
  const email = `patient${counter}@medlog.test`;

  const response = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Str0ngPass!', fullName: `Test Patient ${counter}`, ...overrides })
    .expect(201);

  return { token: response.body.token, id: response.body.user.id, email: response.body.user.email };
}

export function uploadRecord(patient: TestPatient, content = 'lab results 2026') {
  return request(app)
    .post('/api/records')
    .set('Authorization', `Bearer ${patient.token}`)
    .field('title', 'Blood panel')
    .field('recordType', 'LAB_REPORT')
    .field('recordDate', '2026-07-01')
    .field('providerName', 'City Hospital')
    .attach('file', Buffer.from(content), { filename: 'panel.txt', contentType: 'text/plain' });
}
