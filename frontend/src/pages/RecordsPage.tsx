import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { RecordList } from '../components/RecordList';
import { RECORD_TYPES, RECORD_TYPE_LABELS } from '../types';
import type { MedicalRecord } from '../types';

export function RecordsPage() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [recordType, setRecordType] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listRecords({ recordType: recordType || undefined, search: search || undefined })
      .then((response) => setRecords(response.records))
      .catch(() => setError('Could not load your records.'))
      .finally(() => setLoading(false));
  }, [recordType, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My records</h1>
          <p className="muted">{records.length} document(s) in your health record</p>
        </div>
      </div>

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
            <option value="">All types</option>
            {RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {RECORD_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        {loading ? (
          <p className="muted empty-state">Loading…</p>
        ) : (
          <RecordList
            records={records}
            onDeleted={(id) => setRecords((current) => current.filter((r) => r.id !== id))}
            emptyMessage="No records match these filters."
          />
        )}
      </section>
    </div>
  );
}
