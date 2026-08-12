import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { api } from './mock/api';
import type { MedicalRecord, RecordSummary, User } from './types';

export const testUser: User = {
  id: 'user-1',
  email: 'asha.rao@medlog.test',
  fullName: 'Asha Rao',
  dateOfBirth: '1994-03-12',
  bloodGroup: 'O+',
  role: 'PATIENT',
  createdAt: '2026-08-01T00:00:00.000Z',
};

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
