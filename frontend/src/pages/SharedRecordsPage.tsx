import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatBytes, formatDate } from '../components/RecordList';
import { api } from '../mock/api';
import { RECORD_TYPES, RECORD_TYPE_LABELS } from '../types';
import type { MedicalRecord, SharedPatient } from '../types';

export function SharedRecordsPage() {
  const { grantId = '' } = useParams();
  const [patient, setPatient] = useState<SharedPatient | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [recordType, setRecordType] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listSharedRecords(grantId, {
        recordType: recordType || undefined,
        search: search || undefined,
      })
      .then((response) => {
        setPatient(response.patient);
        setRecords(response.records);
        setError(null);
      })
      .catch(() => setError('You no longer have access to this patient’s records.'))
      .finally(() => setLoading(false));
  }, [grantId, recordType, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  async function download(record: MedicalRecord) {
    setDownloadError(null);
    try {
      await api.downloadSharedRecord(grantId, record);
    } catch {
      setDownloadError('Could not download that record.');
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{patient ? patient.patientName : 'Shared records'}</h1>
          <p className="muted">
            {patient
              ? `${patient.patientEmail} · every view is recorded in their access history`
              : 'Opening the patient record…'}
          </p>
        </div>
        <Link className="btn btn-ghost" to="/">
          Back to patients
        </Link>
      </div>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {!error && (
        <div className="card filters">
          <label className="field">
            <span>Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title or hospital"
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={recordType} onChange={(e) => setRecordType(e.target.value)}>
              <option value="">All shared types</option>
              {RECORD_TYPES.filter(
                (type) =>
                  !patient ||
                  patient.recordTypes.length === 0 ||
                  patient.recordTypes.includes(type),
              ).map((type) => (
                <option key={type} value={type}>
                  {RECORD_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {downloadError && (
        <p className="alert alert-error" role="alert">
          {downloadError}
        </p>
      )}

      {!error && (
        <section className="card">
          {loading ? (
            <p className="muted empty-state">Loading…</p>
          ) : records.length === 0 ? (
            <p className="muted empty-state">No shared records match these filters.</p>
          ) : (
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
                      {record.providerName ? ` · ${record.providerName}` : ''} ·{' '}
                      {formatBytes(record.sizeBytes)}
                    </p>
                    {record.notes && <p className="record-notes">{record.notes}</p>}
                  </div>

                  <div className="record-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => download(record)}>
                      Download
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
