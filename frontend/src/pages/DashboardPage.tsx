import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { RecordList } from '../components/RecordList';
import { SummaryCards } from '../components/SummaryCards';
import { UploadRecordForm } from '../components/UploadRecordForm';
import type { RecordSummary } from '../types';

export function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<RecordSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .summary()
      .then(setSummary)
      .catch(() => setError('Could not load your dashboard.'));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Hello, {user!.fullName.split(' ')[0]}</h1>
          <p className="muted">
            Your records are encrypted before storage and only you can open them.
          </p>
        </div>
        <Link className="btn btn-ghost" to="/records">
          View all records
        </Link>
      </div>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {summary && <SummaryCards summary={summary} />}

      <div className="dashboard-grid">
        <UploadRecordForm onUploaded={load} />

        <section className="card">
          <div className="card-head">
            <h2>Recent uploads</h2>
            <p className="muted small">Your five most recently added documents</p>
          </div>
          {summary && (
            <RecordList
              records={summary.recentRecords}
              onDeleted={load}
              emptyMessage="Nothing here yet — upload your first record to get started."
            />
          )}
        </section>
      </div>
    </div>
  );
}
