import { useState } from 'react';
import { api } from '../mock/api';
import { todayIso } from '../mock/schedule';
import { RECORD_TYPE_LABELS } from '../types';
import type { ConsentGrant } from '../types';
import { formatDate } from './RecordList';

interface Props {
  grants: ConsentGrant[];
  onRevoked: () => void;
}

export function ConsentList({ grants, onRevoked }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  async function revoke(grant: ConsentGrant) {
    if (!window.confirm(`Stop sharing your records with ${grant.doctorName}?`)) return;

    setError(null);
    setPendingId(grant.id);
    try {
      await api.revokeConsent(grant.id);
      onRevoked();
    } catch {
      setError('Could not revoke that access.');
    } finally {
      setPendingId(null);
    }
  }

  if (grants.length === 0) {
    return <p className="muted empty-state">No doctor can see your records right now.</p>;
  }

  return (
    <>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <ul className="record-list">
        {grants.map((grant) => {
          const expired = grant.expiresAt !== null && grant.expiresAt < today;
          const scope =
            grant.recordTypes.length === 0
              ? 'All record types'
              : grant.recordTypes.map((type) => RECORD_TYPE_LABELS[type]).join(', ');

          return (
            <li key={grant.id} className="record-item">
              <div className="record-main">
                <span className={`badge ${expired ? 'badge-other' : 'badge-vaccination'}`}>
                  {expired ? 'Expired' : 'Active'}
                </span>
                <h3>{grant.doctorName}</h3>
                <p className="muted small">
                  {grant.doctorEmail}
                  {grant.doctorSpecialty ? ` · ${grant.doctorSpecialty}` : ''}
                </p>
                <p className="record-notes">{scope}</p>
                <p className="muted small">
                  Shared {formatDate(grant.createdAt)}
                  {grant.expiresAt ? ` · ${expired ? 'ended' : 'ends'} ${formatDate(grant.expiresAt)}` : ' · no end date'}
                  {grant.purpose ? ` · ${grant.purpose}` : ''}
                </p>
              </div>

              <div className="record-actions">
                <button
                  type="button"
                  className="btn btn-danger-ghost"
                  onClick={() => revoke(grant)}
                  disabled={pendingId === grant.id}
                >
                  {pendingId === grant.id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
