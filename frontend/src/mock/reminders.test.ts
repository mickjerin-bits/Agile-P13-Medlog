import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './api';
import { store } from './store';
import { nextDueDate } from './schedule';

const PASSWORD = 'Str0ngPass!';

let counter = 0;

async function makePatient() {
  counter += 1;
  const email = `patient${counter}@medlog.test`;
  await api.register({ email, password: PASSWORD, fullName: `Patient ${counter}` });
  return email;
}

function rawStorage(): string {
  return Object.keys(localStorage)
    .map((key) => `${key}=${localStorage.getItem(key) ?? ''}`)
    .join('\n');
}

beforeEach(() => {
  localStorage.clear();
});

describe('creating reminders', () => {
  it('stores a reminder and reads it back', async () => {
    await makePatient();

    const { reminder } = await api.createReminder({
      kind: 'MEDICATION',
      title: 'Metformin 500mg',
      dueDate: '2026-08-20',
      dueTime: '08:00',
      repeat: 'DAILY',
      notes: 'One tablet after breakfast',
    });

    expect(reminder.title).toBe('Metformin 500mg');
    expect(reminder.repeat).toBe('DAILY');
    expect(reminder.completedAt).toBeNull();

    const { reminders } = await api.listReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.notes).toBe('One tablet after breakfast');
  });

  it('encrypts the reminder title and notes rather than storing them readable', async () => {
    await makePatient();

    await api.createReminder({
      kind: 'FOLLOW_UP',
      title: 'Oncology follow-up',
      dueDate: '2026-09-01',
      notes: 'Discuss the biopsy result',
    });

    const raw = rawStorage();
    expect(raw).not.toContain('Oncology follow-up');
    expect(raw).not.toContain('Discuss the biopsy result');
    expect(JSON.stringify(store.reminders())).toContain('FOLLOW_UP');
  });

  it('rejects a reminder with no title and a malformed date together', async () => {
    await makePatient();

    await expect(
      api.createReminder({ kind: 'MEDICATION', title: '', dueDate: '01-09-2026' }),
    ).rejects.toMatchObject({
      status: 400,
      details: [
        { field: 'title', message: expect.any(String) },
        { field: 'dueDate', message: expect.any(String) },
      ],
    });

    expect(store.reminders()).toEqual([]);
  });

  it('rejects a time that is not HH:MM', async () => {
    await makePatient();

    await expect(
      api.createReminder({
        kind: 'APPOINTMENT',
        title: 'Review',
        dueDate: '2026-09-01',
        dueTime: '9am',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('completing reminders', () => {
  it('closes a one-off reminder', async () => {
    await makePatient();
    const { reminder } = await api.createReminder({
      kind: 'APPOINTMENT',
      title: 'Endocrinology review',
      dueDate: '2026-09-01',
    });

    const { reminder: done } = await api.completeReminder(reminder.id);

    expect(done.completedAt).not.toBeNull();
    expect(done.dueDate).toBe('2026-09-01');
  });

  it('rolls a repeating reminder forward instead of closing it', async () => {
    await makePatient();
    const { reminder } = await api.createReminder({
      kind: 'MEDICATION',
      title: 'Metformin 500mg',
      dueDate: '2026-08-20',
      repeat: 'WEEKLY',
    });

    const { reminder: rolled } = await api.completeReminder(reminder.id);

    expect(rolled.completedAt).toBeNull();
    expect(rolled.dueDate).toBe(nextDueDate('2026-08-20', 'WEEKLY'));
  });

  it('reopens a reminder that was closed by mistake', async () => {
    await makePatient();
    const { reminder } = await api.createReminder({
      kind: 'FOLLOW_UP',
      title: 'Repeat HbA1c',
      dueDate: '2026-09-01',
    });
    await api.completeReminder(reminder.id);

    const { reminder: reopened } = await api.reopenReminder(reminder.id);

    expect(reopened.completedAt).toBeNull();
  });

  it('deletes a reminder', async () => {
    await makePatient();
    const { reminder } = await api.createReminder({
      kind: 'MEDICATION',
      title: 'Vitamin D',
      dueDate: '2026-09-01',
    });

    await api.deleteReminder(reminder.id);

    expect((await api.listReminders()).reminders).toEqual([]);
  });
});

describe('reminder isolation', () => {
  it('lists only the signed-in patient reminders', async () => {
    await makePatient();
    await api.createReminder({ kind: 'MEDICATION', title: 'Mine', dueDate: '2026-09-01' });

    await makePatient();

    expect((await api.listReminders()).reminders).toEqual([]);
  });

  it('refuses to complete or delete another patient reminder', async () => {
    await makePatient();
    const { reminder } = await api.createReminder({
      kind: 'MEDICATION',
      title: 'Mine',
      dueDate: '2026-09-01',
    });

    await makePatient();

    await expect(api.completeReminder(reminder.id)).rejects.toMatchObject({ status: 404 });
    await expect(api.deleteReminder(reminder.id)).rejects.toMatchObject({ status: 404 });
    expect(store.reminders()).toHaveLength(1);
  });
});
