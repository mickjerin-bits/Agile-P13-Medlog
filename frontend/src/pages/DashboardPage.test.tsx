import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../mock/api';
import { buildRecord, buildSummary, renderSignedIn, signedIn } from '../test-utils';
import { DashboardPage } from './DashboardPage';

beforeEach(() => {
  signedIn();
});

const populated = buildSummary({
  totalRecords: 2,
  totalBytes: 2048,
  lastUploadAt: '2026-08-10T10:00:00.000Z',
  byType: { LAB_REPORT: 1, PRESCRIPTION: 1 },
  recentRecords: [buildRecord(), buildRecord({ id: 'r2', title: 'Metformin 500mg repeat' })],
  storageUsedBytes: 4096,
});

describe('DashboardPage', () => {
  it('greets the patient by first name', async () => {
    vi.spyOn(api, 'summary').mockResolvedValue(populated);
    renderSignedIn(<DashboardPage />);

    expect(await screen.findByRole('heading', { name: 'Hello, Asha' })).toBeInTheDocument();
  });

  it('shows the summary figures and recent uploads', async () => {
    vi.spyOn(api, 'summary').mockResolvedValue(populated);
    renderSignedIn(<DashboardPage />);

    expect(await screen.findByText('Records stored')).toBeInTheDocument();
    expect(screen.getByText('Records stored').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Complete blood count')).toBeInTheDocument();
    expect(screen.getByText('Metformin 500mg repeat')).toBeInTheDocument();
  });

  it('invites a first upload when there is nothing stored', async () => {
    vi.spyOn(api, 'summary').mockResolvedValue(buildSummary());
    renderSignedIn(<DashboardPage />);

    expect(await screen.findByText(/upload your first record/i)).toBeInTheDocument();
  });

  it('offers the sample-records shortcut only while the record is empty', async () => {
    vi.spyOn(api, 'summary').mockResolvedValue(buildSummary());
    const { unmount } = renderSignedIn(<DashboardPage />);

    expect(await screen.findByRole('button', { name: 'Add four sample records' })).toBeInTheDocument();
    unmount();

    vi.spyOn(api, 'summary').mockResolvedValue(populated);
    renderSignedIn(<DashboardPage />);
    await screen.findByRole('heading', { name: 'Hello, Asha' });

    expect(screen.queryByRole('button', { name: 'Add four sample records' })).not.toBeInTheDocument();
  });

  it('seeds the sample records and reloads the summary', async () => {
    const summary = vi.spyOn(api, 'summary').mockResolvedValue(buildSummary());
    const seed = vi.spyOn(api, 'seedDemoRecords').mockResolvedValue(4);
    renderSignedIn(<DashboardPage />);
    const button = await screen.findByRole('button', { name: 'Add four sample records' });
    const callsBefore = summary.mock.calls.length;

    await userEvent.click(button);

    await waitFor(() => expect(seed).toHaveBeenCalled());
    await waitFor(() => expect(summary.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('reports a failure to seed the sample records', async () => {
    vi.spyOn(api, 'summary').mockResolvedValue(buildSummary());
    vi.spyOn(api, 'seedDemoRecords').mockRejectedValue(new Error('boom'));
    renderSignedIn(<DashboardPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Add four sample records' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not add the sample records.');
  });

  it('surfaces a dashboard load failure', async () => {
    vi.spyOn(api, 'summary').mockRejectedValue(new Error('boom'));
    renderSignedIn(<DashboardPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your dashboard.');
  });

  it('refreshes the summary after a successful upload', async () => {
    const summary = vi.spyOn(api, 'summary').mockResolvedValue(buildSummary());
    vi.spyOn(api, 'uploadRecord').mockResolvedValue({ record: buildRecord() });
    renderSignedIn(<DashboardPage />);
    await screen.findByRole('heading', { name: 'Hello, Asha' });
    const callsBefore = summary.mock.calls.length;

    await userEvent.upload(
      screen.getByLabelText('Document'),
      new File(['x'], 'panel.txt', { type: 'text/plain' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Upload record' }));

    await waitFor(() => expect(summary.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
