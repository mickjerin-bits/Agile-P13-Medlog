import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { api } from './mock/api';
import type {
  AuditEntry,
  ConsentGrant,
  HealthAnalytics,
  MedicalRecord,
  RecordSummary,
  Reminder,
  SharedPatient,
  User,
} from './types';

export const testUser: User = {
  id: 'user-1',
  email: 'asha.rao@medlog.test',
  fullName: 'Asha Rao',
  dateOfBirth: '1994-03-12',
  bloodGroup: 'O+',
  role: 'PATIENT',
  specialty: null,
  createdAt: '2026-08-01T00:00:00.000Z',
};

export const testDoctor: User = {
  id: 'doctor-1',
  email: 'dr.iyer@medlog.test',
  fullName: 'Dr. Priya Iyer',
  dateOfBirth: null,
  bloodGroup: null,
  role: 'DOCTOR',
  specialty: 'General Medicine',
  createdAt: '2026-08-01T00:00:00.000Z',
};

export function buildGrant(overrides: Partial<ConsentGrant> = {}): ConsentGrant {
  return {
    id: 'grant-1',
    patientId: testUser.id,
    patientName: testUser.fullName,
    patientEmail: testUser.email,
    doctorId: testDoctor.id,
    doctorName: testDoctor.fullName,
    doctorEmail: testDoctor.email,
    doctorSpecialty: testDoctor.specialty,
    recordTypes: [],
    purpose: 'Ongoing diabetes review',
    createdAt: '2026-08-02T09:00:00.000Z',
    expiresAt: null,
    ...overrides,
  };
}

export function buildSharedPatient(overrides: Partial<SharedPatient> = {}): SharedPatient {
  return {
    grantId: 'grant-1',
    patientId: testUser.id,
    patientName: testUser.fullName,
    patientEmail: testUser.email,
    dateOfBirth: testUser.dateOfBirth,
    bloodGroup: testUser.bloodGroup,
    recordTypes: [],
    purpose: 'Ongoing diabetes review',
    createdAt: '2026-08-02T09:00:00.000Z',
    expiresAt: null,
    recordCount: 1,
    ...overrides,
  };
}

export function buildReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'rem-1',
    kind: 'MEDICATION',
    title: 'Metformin 500mg',
    notes: 'One tablet after breakfast',
    dueDate: '2026-08-20',
    dueTime: '08:00',
    repeat: 'DAILY',
    completedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    relatedRecordId: null,
    ...overrides,
  };
}

export function buildAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'audit-1',
    patientId: testUser.id,
    actorId: testDoctor.id,
    actorName: testDoctor.fullName,
    actorRole: 'DOCTOR',
    action: 'RECORD_OPENED',
    recordId: 'rec-1',
    recordTitle: 'Complete blood count',
    detail: null,
    at: '2026-08-03T10:15:00.000Z',
    ...overrides,
  };
}

export function buildAnalytics(overrides: Partial<HealthAnalytics> = {}): HealthAnalytics {
  return {
    totalRecords: 0,
    firstRecordDate: null,
    latestRecordDate: null,
    monthlyActivity: [],
    byType: [],
    topProviders: [],
    careGaps: [],
    busiestMonth: null,
    averagePerMonth: 0,
    activeReminders: 0,
    doctorsWithAccess: 0,
    ...overrides,
  };
}

export function buildRecord(overrides: Partial<MedicalRecord> = {}): MedicalRecord {
  return {
    id: 'rec-1',
    title: 'Complete blood count',
    recordType: 'LAB_REPORT',
    recordDate: '2026-07-14',
    providerName: 'City General Hospital',
    notes: null,
    originalFilename: 'cbc.txt',
    mimeType: 'text/plain',
    sizeBytes: 81,
    createdAt: '2026-07-14T09:00:00.000Z',
    ...overrides,
  };
}

export function buildSummary(overrides: Partial<RecordSummary> = {}): RecordSummary {
  return {
    totalRecords: 0,
    totalBytes: 0,
    lastUploadAt: null,
    byType: {},
    recentRecords: [],
    storageUsedBytes: 0,
    storageBudgetBytes: 5 * 1024 * 1024,
    ...overrides,
  };
}

export function signedIn(user: User = testUser) {
  return vi.spyOn(api, 'me').mockResolvedValue({ user });
}

export function signedOut() {
  return vi.spyOn(api, 'me').mockRejectedValue(new Error('no session'));
}

export function renderWithProviders(ui: ReactElement, route = '/'): RenderResult {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
}

function SignedInGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading || !user) return null;
  return <>{children}</>;
}

/**
 * Mirrors App.tsx, which only mounts the shell and its pages once a session has
 * resolved. Components that assume a signed-in patient must be rendered behind
 * the same gate or they see a null user on first paint.
 */
export function renderSignedIn(ui: ReactElement, route = '/'): RenderResult {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <SignedInGate>{ui}</SignedInGate>
      </AuthProvider>
    </MemoryRouter>,
  );
}
