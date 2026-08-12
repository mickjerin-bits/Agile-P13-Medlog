import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../mock/api';
import { useAuth } from '../auth/AuthContext';
import { RecordList } from '../components/RecordList';
import { SummaryCards } from '../components/SummaryCards';
import { UploadRecordForm } from '../components/UploadRecordForm';
import type { RecordSummary } from '../types';

export function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<RecordSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(() => {
    api
      .summary()
      .then(setSummary)
      .catch(() => setError('Could not load your dashboard.'));
  }, []);

  useEffect(load, [load]);

  async function seed() {
    setError(null);
    setSeeding(true);
    try {
      await api.seedDemoRecords();
      load();
    } catch {
      setError('Could not add the sample records.');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Hello, {user!.fullName.split(' ')[0]}</h1>
          <p className="muted">
            Your records are encrypted before they are written to browser storage.
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
          {summary?.totalRecords === 0 && (
            <p className="demo-hint">
              <button type="button" className="btn btn-ghost" onClick={seed} disabled={seeding}>
                {seeding ? 'Adding…' : 'Add four sample records'}
              </button>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
