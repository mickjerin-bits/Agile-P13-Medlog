import { useState } from 'react';
import { api } from '../mock/api';
import { REMINDER_KIND_LABELS, REPEAT_RULE_LABELS } from '../types';
import type { Reminder, ReminderBoard } from '../types';
import { formatDate } from './RecordList';

interface Props {
  board: ReminderBoard;
  onChanged: () => void;
}

const SECTIONS: Array<{ key: keyof ReminderBoard; title: string; tone: string }> = [
  { key: 'overdue', title: 'Overdue', tone: 'overdue' },
  { key: 'today', title: 'Due today', tone: 'today' },
  { key: 'upcoming', title: 'Upcoming', tone: 'upcoming' },
  { key: 'completed', title: 'Completed', tone: 'completed' },
];

export function ReminderList({ board, onChanged }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total =
    board.overdue.length + board.today.length + board.upcoming.length + board.completed.length;

  async function run(reminder: Reminder, action: () => Promise<unknown>, message: string) {
    setError(null);
    setPendingId(reminder.id);
    try {
      await action();
      onChanged();
    } catch {
      setError(message);
    } finally {
      setPendingId(null);
    }
  }

  async function remove(reminder: Reminder) {
    if (!window.confirm(`Delete "${reminder.title}"?`)) return;
    await run(reminder, () => api.deleteReminder(reminder.id), 'Could not delete that reminder.');
  }

  if (total === 0) {
    return <p className="muted empty-state">No reminders yet. Add your first one above.</p>;
  }

  return (
    <>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {SECTIONS.map(({ key, title, tone }) => {
        const items = board[key];
        if (items.length === 0) return null;

        return (
          <section key={key} className="reminder-section">
            <h3 className={`reminder-heading reminder-heading-${tone}`}>
              {title} <span className="muted small">({items.length})</span>
            </h3>

            <ul className="reminder-list">
              {items.map((reminder) => (
                <li key={reminder.id} className={`reminder-item reminder-${tone}`}>
                  <div className="reminder-main">
                    <span className={`badge badge-${reminder.kind.toLowerCase()}`}>
                      {REMINDER_KIND_LABELS[reminder.kind]}
                    </span>
                    <h4>{reminder.title}</h4>
                    <p className="muted small">
                      {formatDate(reminder.dueDate)}
                      {reminder.dueTime ? ` · ${reminder.dueTime}` : ''}
                      {reminder.repeat !== 'NONE'
                        ? ` · ${REPEAT_RULE_LABELS[reminder.repeat]}`
                        : ''}
                    </p>
                    {reminder.notes && <p className="record-notes">{reminder.notes}</p>}
                  </div>

                  <div className="record-actions">
                    {reminder.completedAt ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={pendingId === reminder.id}
                        onClick={() =>
                          run(
                            reminder,
                            () => api.reopenReminder(reminder.id),
                            'Could not reopen that reminder.',
                          )
                        }
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={pendingId === reminder.id}
                        onClick={() =>
                          run(
                            reminder,
                            () => api.completeReminder(reminder.id),
                            'Could not update that reminder.',
                          )
                        }
                      >
                        {reminder.repeat === 'NONE' ? 'Mark done' : 'Done for now'}
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-danger-ghost"
                      disabled={pendingId === reminder.id}
                      onClick={() => remove(reminder)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
