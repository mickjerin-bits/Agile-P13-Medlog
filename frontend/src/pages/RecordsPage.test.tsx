import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../mock/api';
import { buildRecord, renderWithProviders, signedIn } from '../test-utils';
import { RecordsPage } from './RecordsPage';

const records = [
  buildRecord({ id: 'r1', title: 'Complete blood count', recordType: 'LAB_REPORT' }),
  buildRecord({
    id: 'r2',
    title: 'Metformin 500mg repeat',
    recordType: 'PRESCRIPTION',
    providerName: 'Dr. Menon Family Clinic',
    recordDate: '2026-06-18',
  }),
];

beforeEach(() => {
  signedIn();
});

describe('RecordsPage', () => {
  it('lists the records and counts them', async () => {
    vi.spyOn(api, 'listRecords').mockResolvedValue({ records });
    renderWithProviders(<RecordsPage />, '/records');

    expect(await screen.findByText('Complete blood count')).toBeInTheDocument();
    expect(screen.getByText('Metformin 500mg repeat')).toBeInTheDocument();
    expect(screen.getByText('2 document(s) in your health record')).toBeInTheDocument();
  });

  it('asks the API for a single category when the filter is used', async () => {
    const list = vi.spyOn(api, 'listRecords').mockResolvedValue({ records });
    renderWithProviders(<RecordsPage />, '/records');
    await screen.findByText('Complete blood count');

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'PRESCRIPTION');

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ recordType: 'PRESCRIPTION' }),
      ),
    );
  });

  it('passes the search term to the API', async () => {
    const list = vi.spyOn(api, 'listRecords').mockResolvedValue({ records });
    renderWithProviders(<RecordsPage />, '/records');
    await screen.findByText('Complete blood count');

    await userEvent.type(screen.getByLabelText('Search'), 'menon');

    await waitFor(
      () =>
        expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'menon' })),
      { timeout: 2000 },
    );
  });

  it('debounces typing instead of querying on every keystroke', async () => {
    const list = vi.spyOn(api, 'listRecords').mockResolvedValue({ records });
    renderWithProviders(<RecordsPage />, '/records');
    await screen.findByText('Complete blood count');
    const callsAfterLoad = list.mock.calls.length;

    await userEvent.type(screen.getByLabelText('Search'), 'menon');
    await waitFor(
      () => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'menon' })),
      { timeout: 2000 },
    );

    expect(list.mock.calls.length - callsAfterLoad).toBeLessThan('menon'.length);
  });

  it('shows an empty message when nothing matches', async () => {
    vi.spyOn(api, 'listRecords').mockResolvedValue({ records: [] });
    renderWithProviders(<RecordsPage />, '/records');

    expect(await screen.findByText('No records match these filters.')).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    vi.spyOn(api, 'listRecords').mockRejectedValue(new Error('boom'));
    renderWithProviders(<RecordsPage />, '/records');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your records.');
  });

  it('drops a deleted record from the list without refetching', async () => {
    vi.spyOn(api, 'listRecords').mockResolvedValue({ records });
    vi.spyOn(api, 'deleteRecord').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<RecordsPage />, '/records');
    await screen.findByText('Complete blood count');

    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);

    await waitFor(() =>
      expect(screen.queryByText('Complete blood count')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Metformin 500mg repeat')).toBeInTheDocument();
  });
});
