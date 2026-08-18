import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../components/RecordList';
import { api } from '../mock/api';
import { RECORD_TYPE_LABELS } from '../types';
import type { SharedPatient } from '../types';

export function DoctorDashboardPage() {
  const [patients, setPatients] = useState<SharedPatient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listSharedPatients()
      .then((response) => setPatients(response.patients))
      .catch(() => setError('Could not load your shared patients.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Shared with you</h1>
          <p className="muted">
            {patients.length} patient(s) have given you access. You see only what each of them chose
            to share.
          </p>
        </div>
      </div>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        {loading ? (
          <p className="muted empty-state">Loading…</p>
        ) : patients.length === 0 ? (
          <p className="muted empty-state">
            No patient is sharing records with you yet. Ask them to add your email address on their
            Doctor access page.
          </p>
        ) : (
          <ul className="record-list">
            {patients.map((patient) => {
              const scope =
                patient.recordTypes.length === 0
                  ? 'All record types'
                  : patient.recordTypes.map((type) => RECORD_TYPE_LABELS[type]).join(', ');

              return (
                <li key={patient.grantId} className="record-item">
                  <div className="record-main">
                    <span className="badge badge-vaccination">{patient.recordCount} record(s)</span>
                    <h3>{patient.patientName}</h3>
                    <p className="muted small">
                      {patient.patientEmail}
                      {patient.dateOfBirth ? ` · born ${formatDate(patient.dateOfBirth)}` : ''}
                      {patient.bloodGroup ? ` · ${patient.bloodGroup}` : ''}
                    </p>
                    <p className="record-notes">{scope}</p>
                    <p className="muted small">
                      Shared {formatDate(patient.createdAt)}
                      {patient.expiresAt ? ` · ends ${formatDate(patient.expiresAt)}` : ''}
                      {patient.purpose ? ` · ${patient.purpose}` : ''}
                    </p>
                  </div>

                  <div className="record-actions">
                    <Link className="btn btn-primary" to={`/shared/${patient.grantId}`}>
                      Open records
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
