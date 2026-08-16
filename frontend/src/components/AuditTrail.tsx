import { AUDIT_ACTION_LABELS } from '../types';
import type { AuditEntry } from '../types';

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TONES: Partial<Record<AuditEntry['action'], string>> = {
  CONSENT_GRANTED: 'audit-grant',
  CONSENT_REVOKED: 'audit-revoke',
  ACCESS_DENIED: 'audit-denied',
};

export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="muted empty-state">Nothing has touched your records yet.</p>;
  }

  return (
    <ol className="audit-list">
      {entries.map((entry) => (
        <li key={entry.id} className={`audit-item ${TONES[entry.action] ?? ''}`}>
          <div className="audit-main">
            <p className="audit-action">{AUDIT_ACTION_LABELS[entry.action]}</p>
            <p className="muted small">
              {entry.actorName}
              {entry.actorRole === 'DOCTOR' ? ' · Doctor' : ' · You'}
              {entry.recordTitle ? ` · ${entry.recordTitle}` : ''}
              {entry.detail ? ` · ${entry.detail}` : ''}
            </p>
          </div>
          <time className="muted small" dateTime={entry.at}>
            {formatDateTime(entry.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}
