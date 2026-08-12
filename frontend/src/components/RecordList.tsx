import { useState } from 'react';
import { api } from '../mock/api';
import { RECORD_TYPE_LABELS } from '../types';
import type { MedicalRecord } from '../types';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

interface Props {
  records: MedicalRecord[];
  onDeleted: (id: string) => void;
  emptyMessage?: string;
}

export function RecordList({ records, onDeleted, emptyMessage }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(record: MedicalRecord) {
    setError(null);
    try {
      await api.downloadRecord(record);
    } catch {
      setError('Could not download that record.');
    }
  }

  async function remove(record: MedicalRecord) {
    if (!window.confirm(`Delete "${record.title}"? This cannot be undone.`)) return;

    setError(null);
    setPendingId(record.id);
    try {
      await api.deleteRecord(record.id);
      onDeleted(record.id);
    } catch {
      setError('Could not delete that record.');
    } finally {
      setPendingId(null);
    }
  }

  if (records.length === 0) {
    return <p className="muted empty-state">{emptyMessage ?? 'No records yet.'}</p>;
  }

  return (
    <>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <ul className="record-list">
        {records.map((record) => (
          <li key={record.id} className="record-item">
            <div className="record-main">
              <span className={`badge badge-${record.recordType.toLowerCase()}`}>
                {RECORD_TYPE_LABELS[record.recordType]}
              </span>
              <h3>{record.title}</h3>
              <p className="muted small">
                {formatDate(record.recordDate)}
                {record.providerName ? ` · ${record.providerName}` : ''} · {record.originalFilename}{' '}
                · {formatBytes(record.sizeBytes)}
              </p>
              {record.notes && <p className="record-notes">{record.notes}</p>}
            </div>

            <div className="record-actions">
              <button type="button" className="btn btn-ghost" onClick={() => download(record)}>
                Download
              </button>
              <button
                type="button"
                className="btn btn-danger-ghost"
                onClick={() => remove(record)}
                disabled={pendingId === record.id}
              >
                {pendingId === record.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
