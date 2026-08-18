import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../mock/api';
import {
  buildAuditEntry,
  buildGrant,
  renderWithProviders,
  signedIn,
  testDoctor,
} from '../test-utils';
import { SharingPage } from './SharingPage';

beforeEach(() => {
  signedIn();
});

function mockSharing(grants = [buildGrant()], entries = [buildAuditEntry()]) {
  vi.spyOn(api, 'listConsentGrants').mockResolvedValue({ grants });
  vi.spyOn(api, 'listAuditTrail').mockResolvedValue({ entries });
}

describe('SharingPage', () => {
  it('lists who has access and what they did', async () => {
    mockSharing();
    renderWithProviders(<SharingPage />, '/sharing');

    expect(await screen.findByText('Dr. Priya Iyer')).toBeInTheDocument();
    expect(screen.getByText('All record types')).toBeInTheDocument();
    expect(screen.getByText('Opened a record')).toBeInTheDocument();
  });

  it('shows the scope when only some record types are shared', async () => {
    mockSharing([buildGrant({ recordTypes: ['LAB_REPORT', 'IMAGING'] })]);
    renderWithProviders(<SharingPage />, '/sharing');

    expect(await screen.findByText('Lab report, Imaging / scan')).toBeInTheDocument();
  });

  it('marks a grant whose end date has passed as expired', async () => {
    mockSharing([buildGrant({ expiresAt: '2020-01-01' })]);
    renderWithProviders(<SharingPage />, '/sharing');

    expect(await screen.findByText('Expired')).toBeInTheDocument();
  });

  it('says plainly when nobody has access and nothing has happened', async () => {
    mockSharing([], []);
    renderWithProviders(<SharingPage />, '/sharing');

    expect(await screen.findByText(/No doctor can see your records/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing has touched your records yet/)).toBeInTheDocument();
  });

  it('tells the patient when the sharing settings cannot be loaded', async () => {
    vi.spyOn(api, 'listConsentGrants').mockRejectedValue(new Error('boom'));
    vi.spyOn(api, 'listAuditTrail').mockResolvedValue({ entries: [] });
    renderWithProviders(<SharingPage />, '/sharing');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your sharing settings.',
    );
  });

  it('grants access to a doctor and reloads', async () => {
    mockSharing([], []);
    const grant = vi
      .spyOn(api, 'grantConsent')
      .mockResolvedValue({ grant: buildGrant({ doctorName: testDoctor.fullName }) });

    renderWithProviders(<SharingPage />, '/sharing');
    await screen.findByText(/No doctor can see your records/);

    await userEvent.type(screen.getByLabelText("Doctor's email"), testDoctor.email);
    await userEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() =>
      expect(grant).toHaveBeenCalledWith(
        expect.objectContaining({ doctorEmail: testDoctor.email }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('can now read your records');
  });

  it('surfaces a refusal to share with an unknown doctor', async () => {
    mockSharing([], []);
    const { ApiError } = await import('../mock/api');
    vi.spyOn(api, 'grantConsent').mockRejectedValue(
      new ApiError(404, 'No doctor is registered with that email address'),
    );

    renderWithProviders(<SharingPage />, '/sharing');
    await screen.findByText(/No doctor can see your records/);

    await userEvent.type(screen.getByLabelText("Doctor's email"), 'nobody@medlog.test');
    await userEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No doctor is registered');
  });

  it('revokes access after the patient confirms', async () => {
    mockSharing();
    const revoke = vi.spyOn(api, 'revokeConsent').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<SharingPage />, '/sharing');
    await screen.findByText('Dr. Priya Iyer');

    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(revoke).toHaveBeenCalledWith('grant-1'));
  });

  it('leaves access alone when the patient cancels the confirmation', async () => {
    mockSharing();
    const revoke = vi.spyOn(api, 'revokeConsent').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<SharingPage />, '/sharing');
    await screen.findByText('Dr. Priya Iyer');

    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(revoke).not.toHaveBeenCalled();
  });
});
