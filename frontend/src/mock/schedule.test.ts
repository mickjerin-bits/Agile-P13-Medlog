import { describe, expect, it } from 'vitest';
import { activeCount, groupReminders, nextDueDate, todayIso } from './schedule';
import type { Reminder } from '../types';

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'rem-1',
    kind: 'MEDICATION',
    title: 'Metformin 500mg',
    notes: null,
    dueDate: '2026-08-16',
    dueTime: null,
    repeat: 'NONE',
    completedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    relatedRecordId: null,
    ...overrides,
  };
}

describe('nextDueDate', () => {
  it('leaves a one-off reminder where it is', () => {
    expect(nextDueDate('2026-08-16', 'NONE')).toBe('2026-08-16');
  });

  it('steps a daily reminder over the end of a month', () => {
    expect(nextDueDate('2026-08-31', 'DAILY')).toBe('2026-09-01');
  });

  it('steps a weekly reminder by seven days', () => {
    expect(nextDueDate('2026-08-10', 'WEEKLY')).toBe('2026-08-17');
  });

  it('clamps a monthly reminder to the end of a shorter month', () => {
    expect(nextDueDate('2026-01-31', 'MONTHLY')).toBe('2026-02-28');
  });

  it('rolls a monthly reminder into the next year', () => {
    expect(nextDueDate('2026-12-15', 'MONTHLY')).toBe('2027-01-15');
  });
});

describe('groupReminders', () => {
  const today = '2026-08-16';

  it('splits reminders into overdue, today, upcoming and completed', () => {
    const board = groupReminders(
      [
        reminder({ id: 'past', dueDate: '2026-08-01' }),
        reminder({ id: 'now', dueDate: today }),
        reminder({ id: 'later', dueDate: '2026-09-02' }),
        reminder({ id: 'done', dueDate: '2026-07-01', completedAt: '2026-07-02T09:00:00.000Z' }),
      ],
      today,
    );

    expect(board.overdue.map((r) => r.id)).toEqual(['past']);
    expect(board.today.map((r) => r.id)).toEqual(['now']);
    expect(board.upcoming.map((r) => r.id)).toEqual(['later']);
    expect(board.completed.map((r) => r.id)).toEqual(['done']);
  });

  it('treats a completed reminder as done even when its due date has passed', () => {
    const board = groupReminders(
      [reminder({ dueDate: '2020-01-01', completedAt: '2026-08-01T00:00:00.000Z' })],
      today,
    );

    expect(board.overdue).toHaveLength(0);
    expect(board.completed).toHaveLength(1);
  });

  it('orders each bucket by due date and then time', () => {
    const board = groupReminders(
      [
        reminder({ id: 'b', dueDate: '2026-09-01', dueTime: '14:00' }),
        reminder({ id: 'a', dueDate: '2026-09-01', dueTime: '08:00' }),
        reminder({ id: 'c', dueDate: '2026-09-05' }),
      ],
      today,
    );

    expect(board.upcoming.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('counts only the reminders still needing action', () => {
    const board = groupReminders(
      [
        reminder({ id: 'past', dueDate: '2026-08-01' }),
        reminder({ id: 'now', dueDate: today }),
        reminder({ id: 'done', completedAt: '2026-08-02T00:00:00.000Z' }),
      ],
      today,
    );

    expect(activeCount(board)).toBe(2);
  });
});

describe('todayIso', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(todayIso(new Date('2026-08-16T23:30:00.000Z'))).toBe('2026-08-16');
  });
});
