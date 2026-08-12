import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ApiError, MAX_UPLOAD_BYTES, api } from '../mock/api';
import { RECORD_TYPES, RECORD_TYPE_LABELS } from '../types';
import type { MedicalRecord, RecordType } from '../types';

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp,.txt';

const MAX_LABEL = `${(MAX_UPLOAD_BYTES / 1_000_000).toFixed(1)} MB`;

interface Props {
  onUploaded: (record: MedicalRecord) => void;
}

export function UploadRecordForm({ onUploaded }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [recordType, setRecordType] = useState<RecordType>('LAB_REPORT');
  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [providerName, setProviderName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setSuccess(null);

    if (selected && selected.size > MAX_UPLOAD_BYTES) {
      setError(`That file is larger than ${MAX_LABEL}. Please upload a smaller scan.`);
      setFile(null);
      return;
    }

    setError(null);
    setFile(selected);
    if (selected && !title.trim()) {
      setTitle(selected.name.replace(/\.[^.]+$/, ''));
    }
  }

  function reset() {
    setFile(null);
    setTitle('');
    setProviderName('');
    setNotes('');
    setRecordType('LAB_REPORT');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!file) {
      setError('Choose a file to upload.');
      return;
    }

    const form = new FormData();
    form.append('file', file);
    form.append('title', title.trim());
    form.append('recordType', recordType);
    form.append('recordDate', recordDate);
    form.append('providerName', providerName.trim());
    form.append('notes', notes.trim());

    setBusy(true);
    try {
      const response = await api.uploadRecord(form);
      onUploaded(response.record);
      setSuccess(`"${response.record.title}" was encrypted and stored.`);
      reset();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (err.details?.map((d) => d.message).join(' · ') ?? err.message)
          : 'Upload failed. Please try again.';
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card upload-form" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>Upload a record</h2>
        <p className="muted small">PDF, image or text · up to {MAX_LABEL}</p>
      </div>

      <label className="field">
        <span>Document</span>
        <input ref={fileInput} type="file" accept={ACCEPTED} onChange={pickFile} />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Complete blood count"
            required
          />
        </label>

        <label className="field">
          <span>Type</span>
          <select value={recordType} onChange={(e) => setRecordType(e.target.value as RecordType)}>
            {RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {RECORD_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Record date</span>
          <input
            type="date"
            value={recordDate}
            onChange={(e) => setRecordDate(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Hospital / clinic</span>
          <input
            type="text"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            placeholder="Apollo Hospitals"
          />
        </label>
      </div>

      <label className="field">
        <span>Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Fasting sample, follow-up in 3 months"
        />
      </label>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="alert alert-success" role="status">
          {success}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Encrypting…' : 'Upload record'}
      </button>
    </form>
  );
}
