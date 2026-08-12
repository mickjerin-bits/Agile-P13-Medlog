import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { RecordList, formatBytes } from './RecordList';
import type { MedicalRecord } from '../types';

const record: MedicalRecord = {
  id: 'rec-1',
  title: 'Complete blood count',
  recordType: 'LAB_REPORT',
  recordDate: '2026-07-01',
  providerName: 'City Hospital',
  notes: 'Fasting sample',
  originalFilename: 'cbc.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  createdAt: '2026-07-02T10:00:00.000Z',
};

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('RecordList', () => {
  it('renders record metadata', () => {
    render(<RecordList records={[record]} onDeleted={vi.fn()} />);

    expect(screen.getByText('Complete blood count')).toBeInTheDocument();
    expect(screen.getByText('Lab report')).toBeInTheDocument();
    expect(screen.getByText(/City Hospital/)).toBeInTheDocument();
    expect(screen.getByText(/cbc\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
  });

  it('shows the empty message when there are no records', () => {
    render(<RecordList records={[]} onDeleted={vi.fn()} emptyMessage="Nothing stored yet" />);

    expect(screen.getByText('Nothing stored yet')).toBeInTheDocument();
  });

  it('downloads a record on demand', async () => {
    const download = vi.spyOn(api, 'downloadRecord').mockResolvedValue();
    render(<RecordList records={[record]} onDeleted={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(download).toHaveBeenCalledWith(record);
  });

  it('deletes a record only after confirmation', async () => {
    const remove = vi.spyOn(api, 'deleteRecord').mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<RecordList records={[record]} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(remove).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('rec-1'));
    expect(remove).toHaveBeenCalledWith('rec-1');
  });

  it('surfaces a delete failure without removing the row', async () => {
    vi.spyOn(api, 'deleteRecord').mockRejectedValue(new Error('boom'));
    const onDeleted = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<RecordList records={[record]} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete that record.');
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
