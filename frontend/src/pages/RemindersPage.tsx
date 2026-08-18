import { useCallback, useEffect, useState } from 'react';
import { ReminderForm } from '../components/ReminderForm';
import { ReminderList } from '../components/ReminderList';
import { api } from '../mock/api';
import { activeCount, groupReminders, todayIso } from '../mock/schedule';
import type { ReminderBoard } from '../types';

const EMPTY: ReminderBoard = { overdue: [], today: [], upcoming: [], completed: [] };

export function RemindersPage() {
  const [board, setBoard] = useState<ReminderBoard>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listReminders()
      .then((response) => {
        setBoard(groupReminders(response.reminders, todayIso()));
        setError(null);
      })
      .catch(() => setError('Could not load your reminders.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const active = activeCount(board);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reminders</h1>
          <p className="muted">
            {active} active · {board.overdue.length} overdue
          </p>
        </div>
      </div>

      <ReminderForm onCreated={load} />

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        {loading ? (
          <p className="muted empty-state">Loading…</p>
        ) : (
          <ReminderList board={board} onChanged={load} />
        )}
      </section>
    </div>
  );
}
