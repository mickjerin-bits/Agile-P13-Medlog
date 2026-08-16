import { useCallback, useEffect, useState } from 'react';
import { AuditTrail } from '../components/AuditTrail';
import { ConsentForm } from '../components/ConsentForm';
import { ConsentList } from '../components/ConsentList';
import { api } from '../mock/api';
import type { AuditEntry, ConsentGrant } from '../types';

export function SharingPage() {
  const [grants, setGrants] = useState<ConsentGrant[]>([]);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.listConsentGrants(), api.listAuditTrail()])
      .then(([consent, audit]) => {
        setGrants(consent.grants);
        setEntries(audit.entries);
        setError(null);
      })
      .catch(() => setError('Could not load your sharing settings.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Doctor access</h1>
          <p className="muted">Decide who can read your records, and see everything they did.</p>
        </div>
      </div>

      <ConsentForm onGranted={load} />

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Who has access</h2>
        </div>
        {loading ? (
          <p className="muted empty-state">Loading…</p>
        ) : (
          <ConsentList grants={grants} onRevoked={load} />
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Access history</h2>
          <p className="muted small">
            Every view, download and consent change, newest first. Record titles are decrypted for
            you and are never stored in the log.
          </p>
        </div>
        {loading ? (
          <p className="muted empty-state">Loading…</p>
        ) : (
          <AuditTrail entries={entries} />
        )}
      </section>
    </div>
  );
}
