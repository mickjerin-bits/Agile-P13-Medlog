import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../mock/api';
import { buildSharedPatient, renderWithProviders, signedIn, testDoctor } from '../test-utils';
import { DoctorDashboardPage } from './DoctorDashboardPage';

beforeEach(() => {
  signedIn(testDoctor);
});

describe('DoctorDashboardPage', () => {
  it('lists the patients sharing with this doctor', async () => {
    vi.spyOn(api, 'listSharedPatients').mockResolvedValue({
      patients: [buildSharedPatient({ recordCount: 4 })],
    });

    renderWithProviders(<DoctorDashboardPage />, '/');

    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('4 record(s)')).toBeInTheDocument();
    expect(screen.getByText('1 patient(s) have given you access. You see only what each of them chose to share.')).toBeInTheDocument();
  });

  it('shows the scope the patient chose', async () => {
    vi.spyOn(api, 'listSharedPatients').mockResolvedValue({
      patients: [buildSharedPatient({ recordTypes: ['LAB_REPORT'] })],
    });

    renderWithProviders(<DoctorDashboardPage />, '/');

    expect(await screen.findByText('Lab report')).toBeInTheDocument();
  });

  it('links through to the shared records for that consent', async () => {
    vi.spyOn(api, 'listSharedPatients').mockResolvedValue({
      patients: [buildSharedPatient({ grantId: 'grant-9' })],
    });

    renderWithProviders(<DoctorDashboardPage />, '/');

    expect(await screen.findByRole('link', { name: 'Open records' })).toHaveAttribute(
      'href',
      '/shared/grant-9',
    );
  });

  it('explains what to do when no patient has shared yet', async () => {
    vi.spyOn(api, 'listSharedPatients').mockResolvedValue({ patients: [] });
    renderWithProviders(<DoctorDashboardPage />, '/');

    expect(await screen.findByText(/No patient is sharing records with you yet/)).toBeInTheDocument();
  });

  it('reports a failure to load the shared patients', async () => {
    vi.spyOn(api, 'listSharedPatients').mockRejectedValue(new Error('boom'));
    renderWithProviders(<DoctorDashboardPage />, '/');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your shared patients.',
    );
  });
});
