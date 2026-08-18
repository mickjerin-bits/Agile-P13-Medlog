import type { Reminder, ReminderBoard, RepeatRule } from '../types';

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function parse(dateIso: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateIso.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

function format(year: number, month: number, day: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function nextDueDate(dateIso: string, repeat: RepeatRule): string {
  if (repeat === 'NONE') return dateIso;

  const { year, month, day } = parse(dateIso);

  if (repeat === 'MONTHLY') {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return format(nextYear, nextMonth, Math.min(day, daysInMonth(nextYear, nextMonth)));
  }

  const step = repeat === 'DAILY' ? 1 : 7;
  const moved = new Date(Date.UTC(year, month - 1, day + step));
  return moved.toISOString().slice(0, 10);
}

function byDue(a: Reminder, b: Reminder): number {
  return a.dueDate.localeCompare(b.dueDate) || (a.dueTime ?? '').localeCompare(b.dueTime ?? '');
}

export function groupReminders(reminders: Reminder[], today: string): ReminderBoard {
  const board: ReminderBoard = { overdue: [], today: [], upcoming: [], completed: [] };

  for (const reminder of reminders) {
    if (reminder.completedAt) board.completed.push(reminder);
    else if (reminder.dueDate < today) board.overdue.push(reminder);
    else if (reminder.dueDate === today) board.today.push(reminder);
    else board.upcoming.push(reminder);
  }

  board.overdue.sort(byDue);
  board.today.sort(byDue);
  board.upcoming.sort(byDue);
  board.completed.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  return board;
}

export function activeCount(board: ReminderBoard): number {
  return board.overdue.length + board.today.length + board.upcoming.length;
}
