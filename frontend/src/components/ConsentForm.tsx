import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, api } from '../mock/api';
import { RECORD_TYPES, RECORD_TYPE_LABELS } from '../types';
import type { RecordType } from '../types';

export function ConsentForm({ onGranted }: { onGranted: () => void }) {
  const [doctorEmail, setDoctorEmail] = useState('');
  const [purpose, setPurpose] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [recordTypes, setRecordTypes] = useState<RecordType[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleType(type: RecordType) {
    setRecordTypes((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    setBusy(true);

    try {
      const { grant } = await api.grantConsent({
        doctorEmail,
        recordTypes,
        purpose: purpose || undefined,
        expiresAt: expiresAt || undefined,
      });

      setSuccess(`${grant.doctorName} can now read your records.`);
      setDoctorEmail('');
      setPurpose('');
      setExpiresAt('');
      setRecordTypes([]);
      onGranted();
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Could not share your records. Please try again.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card upload-form" onSubmit={submit}>
      <div className="card-head">
        <h2>Share with a doctor</h2>
        <p className="muted small">
          They see only what you choose here, and only until you revoke it.
        </p>
      </div>

      <label className="field">
        <span>Doctor's email</span>
        <input
          type="email"
          value={doctorEmail}
          onChange={(e) => setDoctorEmail(e.target.value)}
          placeholder="dr.iyer@medlog.test"
          required
        />
      </label>

      <fieldset className="field consent-types">
        <legend>Which records?</legend>
        <p className="muted small">Choose nothing to share every type.</p>
        <div className="consent-type-grid">
          {RECORD_TYPES.map((type) => (
            <label key={type} className="checkbox">
              <input
                type="checkbox"
                checked={recordTypes.includes(type)}
                onChange={() => toggleType(type)}
              />
              <span>{RECORD_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field-row">
        <label className="field">
          <span>Reason (optional)</span>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Ongoing diabetes review"
          />
        </label>

        <label className="field">
          <span>Access ends (optional)</span>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          {fieldErrors.expiresAt && <span className="field-error">{fieldErrors.expiresAt}</span>}
        </label>
      </div>

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
        {busy ? 'Sharing…' : 'Grant access'}
      </button>
    </form>
  );
}
