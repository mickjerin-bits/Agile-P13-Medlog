import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../mock/api';
import {
  buildRecord,
  buildSharedPatient,
  renderWithProviders,
  signedIn,
  testDoctor,
} from '../test-utils';
import { SharedRecordsPage } from './SharedRecordsPage';

const records = [
  buildRecord({ id: 'r1', title: 'Complete blood count', recordType: 'LAB_REPORT' }),
  buildRecord({ id: 'r2', title: 'Chest X-ray report', recordType: 'IMAGING' }),
];

function renderShared(route = '/shared/grant-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/shared/:grantId" element={<SharedRecordsPage />} />
    </Routes>,
    route,
  );
}

beforeEach(() => {
  signedIn(testDoctor);
});

describe('SharedRecordsPage', () => {
  it('shows the patient and the records they shared', async () => {
    vi.spyOn(api, 'listSharedRecords').mockResolvedValue({
      patient: buildSharedPatient(),
      records,
    });

    renderShared();

    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeInTheDocument();
    expect(screen.getByText('Complete blood count')).toBeInTheDocument();
    expect(screen.getByText(/every view is recorded in their access history/)).toBeInTheDocument();
  });

  it('asks the API for the consent named in the URL', async () => {
    const list = vi
      .spyOn(api, 'listSharedRecords')
      .mockResolvedValue({ patient: buildSharedPatient(), records });

    renderShared('/shared/grant-42');

    await waitFor(() => expect(list).toHaveBeenCalledWith('grant-42', expect.any(Object)));
  });

  it('filters by record type', async () => {
    const list = vi
      .spyOn(api, 'listSharedRecords')
      .mockResolvedValue({ patient: buildSharedPatient(), records });

    renderShared();
    await screen.findByText('Complete blood count');

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'IMAGING');

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        'grant-1',
        expect.objectContaining({ recordType: 'IMAGING' }),
      ),
    );
  });

  it('offers only the types the patient actually shared', async () => {
    vi.spyOn(api, 'listSharedRecords').mockResolvedValue({
      patient: buildSharedPatient({ recordTypes: ['LAB_REPORT'] }),
      records: [records[0]!],
    });

    renderShared();
    await screen.findByText('Complete blood count');

    const options = screen.getByLabelText('Type').querySelectorAll('option');
    expect([...options].map((option) => option.textContent)).toEqual([
      'All shared types',
      'Lab report',
    ]);
  });

  it('downloads a shared record through the audited endpoint', async () => {
    vi.spyOn(api, 'listSharedRecords').mockResolvedValue({
      patient: buildSharedPatient(),
      records: [records[0]!],
    });
    const download = vi.spyOn(api, 'downloadSharedRecord').mockResolvedValue(undefined);

    renderShared();
    await screen.findByText('Complete blood count');

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() =>
      expect(download).toHaveBeenCalledWith('grant-1', expect.objectContaining({ id: 'r1' })),
    );
  });

  it('reports a failed download without losing the list', async () => {
    vi.spyOn(api, 'listSharedRecords').mockResolvedValue({
      patient: buildSharedPatient(),
      records: [records[0]!],
    });
    vi.spyOn(api, 'downloadSharedRecord').mockRejectedValue(new Error('boom'));

    renderShared();
    await screen.findByText('Complete blood count');

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not download that record.');
    expect(screen.getByText('Complete blood count')).toBeInTheDocument();
  });

  it('tells the doctor plainly when consent has been withdrawn', async () => {
    vi.spyOn(api, 'listSharedRecords').mockRejectedValue(new Error('revoked'));

    renderShared();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You no longer have access to this patient',
    );
  });

  it('says when the filters match nothing', async () => {
    vi.spyOn(api, 'listSharedRecords').mockResolvedValue({
      patient: buildSharedPatient(),
      records: [],
    });

    renderShared();

    expect(await screen.findByText('No shared records match these filters.')).toBeInTheDocument();
  });
});
