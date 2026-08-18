import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, api } from '../mock/api';
import { REMINDER_KINDS, REMINDER_KIND_LABELS, REPEAT_RULES, REPEAT_RULE_LABELS } from '../types';
import type { ReminderKind, RepeatRule } from '../types';
import { todayIso } from '../mock/schedule';

export function ReminderForm({ onCreated }: { onCreated: () => void }) {
  const [kind, setKind] = useState<ReminderKind>('MEDICATION');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(todayIso());
  const [dueTime, setDueTime] = useState('');
  const [repeat, setRepeat] = useState<RepeatRule>('NONE');
  const [notes, setNotes] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    setBusy(true);

    try {
      const { reminder } = await api.createReminder({
        kind,
        title,
        dueDate,
        dueTime: dueTime || undefined,
        repeat,
        notes: notes || undefined,
      });

      setSuccess(`"${reminder.title}" was added to your reminders.`);
      setTitle('');
      setDueTime('');
      setNotes('');
      setRepeat('NONE');
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        setError(null);
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Could not save that reminder. Please try again.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card upload-form" onSubmit={submit}>
      <div className="card-head">
        <h2>Add a reminder</h2>
        <p className="muted small">Medication, an appointment, or a follow-up you must not miss.</p>
      </div>

      <div className="field-row">
        <label className="field">
          <span>Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as ReminderKind)}>
            {REMINDER_KINDS.map((value) => (
              <option key={value} value={value}>
                {REMINDER_KIND_LABELS[value]}
              </option>
            ))}
          </select>
          {fieldErrors.kind && <span className="field-error">{fieldErrors.kind}</span>}
        </label>

        <label className="field">
          <span>Repeats</span>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatRule)}>
            {REPEAT_RULES.map((value) => (
              <option key={value} value={value}>
                {REPEAT_RULE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>What is it?</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Metformin 500mg"
          required
        />
        {fieldErrors.title && <span className="field-error">{fieldErrors.title}</span>}
      </label>

      <div className="field-row">
        <label className="field">
          <span>Due date</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          {fieldErrors.dueDate && <span className="field-error">{fieldErrors.dueDate}</span>}
        </label>

        <label className="field">
          <span>Time (optional)</span>
          <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          {fieldErrors.dueTime && <span className="field-error">{fieldErrors.dueTime}</span>}
        </label>
      </div>

      <label className="field">
        <span>Notes (optional)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>

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
        {busy ? 'Saving…' : 'Add reminder'}
      </button>
    </form>
  );
}
