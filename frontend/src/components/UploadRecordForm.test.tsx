import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import { UploadRecordForm } from './UploadRecordForm';
import type { MedicalRecord } from '../types';

const created: MedicalRecord = {
  id: 'rec-9',
  title: 'panel',
  recordType: 'LAB_REPORT',
  recordDate: '2026-07-01',
  providerName: null,
  notes: null,
  originalFilename: 'panel.txt',
  mimeType: 'text/plain',
  sizeBytes: 12,
  createdAt: '2026-07-01T00:00:00.000Z',
};

function textFile(name = 'panel.txt', sizeBytes = 12) {
  return new File(['x'.repeat(sizeBytes)], name, { type: 'text/plain' });
}

describe('UploadRecordForm', () => {
  it('requires a file before submitting', async () => {
    const upload = vi.spyOn(api, 'uploadRecord');
    render(<UploadRecordForm onUploaded={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Title'), 'Blood panel');
    await userEvent.click(screen.getByRole('button', { name: 'Upload record' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a file to upload.');
    expect(upload).not.toHaveBeenCalled();
  });

  it('prefills the title from the chosen filename', async () => {
    render(<UploadRecordForm onUploaded={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText('Document'), textFile('blood-panel.txt'));

    expect(screen.getByLabelText('Title')).toHaveValue('blood-panel');
  });

  it('rejects a file larger than 10 MB before any request', async () => {
    const upload = vi.spyOn(api, 'uploadRecord');
    render(<UploadRecordForm onUploaded={vi.fn()} />);

    const big = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });

    await userEvent.upload(screen.getByLabelText('Document'), big);

    expect(await screen.findByRole('alert')).toHaveTextContent('larger than 10 MB');
    expect(upload).not.toHaveBeenCalled();
  });

  it('posts the metadata with the file and reports success', async () => {
    const upload = vi.spyOn(api, 'uploadRecord').mockResolvedValue({ record: created });
    const onUploaded = vi.fn();
    render(<UploadRecordForm onUploaded={onUploaded} />);

    await userEvent.upload(screen.getByLabelText('Document'), textFile());
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Blood panel');
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'PRESCRIPTION');
    await userEvent.type(screen.getByLabelText('Hospital / clinic'), 'City Hospital');
    await userEvent.click(screen.getByRole('button', { name: 'Upload record' }));

    expect(await screen.findByRole('status')).toHaveTextContent('was encrypted and stored');
    expect(onUploaded).toHaveBeenCalledWith(created);

    const form = upload.mock.calls[0]![0];
    expect(form.get('title')).toBe('Blood panel');
    expect(form.get('recordType')).toBe('PRESCRIPTION');
    expect(form.get('providerName')).toBe('City Hospital');
    expect(form.get('file')).toBeInstanceOf(File);
  });

  it('shows validation details returned by the API', async () => {
    vi.spyOn(api, 'uploadRecord').mockRejectedValue(
      new ApiError(400, 'Validation failed', [
        { field: 'recordDate', message: 'Record date must be YYYY-MM-DD' },
      ]),
    );
    render(<UploadRecordForm onUploaded={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText('Document'), textFile());
    await userEvent.click(screen.getByRole('button', { name: 'Upload record' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Record date must be YYYY-MM-DD');
  });
});
