import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../mock/api';
import { buildReminder, renderWithProviders, signedIn } from '../test-utils';
import { RemindersPage } from './RemindersPage';

const overdue = buildReminder({ id: 'r1', title: 'Repeat HbA1c test', dueDate: '2020-01-01' });
const upcoming = buildReminder({
  id: 'r2',
  title: 'Endocrinology review',
  kind: 'APPOINTMENT',
  dueDate: '2099-01-01',
  repeat: 'NONE',
});

beforeEach(() => {
  signedIn();
});

describe('RemindersPage', () => {
  it('groups reminders into overdue and upcoming', async () => {
    vi.spyOn(api, 'listReminders').mockResolvedValue({ reminders: [overdue, upcoming] });
    renderWithProviders(<RemindersPage />, '/reminders');

    expect(await screen.findByText('Repeat HbA1c test')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Overdue/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Upcoming/ })).toBeInTheDocument();
    expect(screen.getByText('2 active · 1 overdue')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is scheduled', async () => {
    vi.spyOn(api, 'listReminders').mockResolvedValue({ reminders: [] });
    renderWithProviders(<RemindersPage />, '/reminders');

    expect(await screen.findByText(/No reminders yet/)).toBeInTheDocument();
  });

  it('tells the patient when the reminders cannot be loaded', async () => {
    vi.spyOn(api, 'listReminders').mockRejectedValue(new Error('boom'));
    renderWithProviders(<RemindersPage />, '/reminders');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your reminders.');
  });

  it('creates a reminder and reloads the board', async () => {
    const list = vi.spyOn(api, 'listReminders').mockResolvedValue({ reminders: [] });
    const create = vi
      .spyOn(api, 'createReminder')
      .mockResolvedValue({ reminder: buildReminder({ title: 'Vitamin D sachet' }) });

    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText(/No reminders yet/);

    await userEvent.type(screen.getByLabelText('What is it?'), 'Vitamin D sachet');
    await userEvent.click(screen.getByRole('button', { name: 'Add reminder' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Vitamin D sachet', kind: 'MEDICATION' }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('was added to your reminders');
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('completes a reminder and refreshes', async () => {
    vi.spyOn(api, 'listReminders').mockResolvedValue({ reminders: [upcoming] });
    const complete = vi
      .spyOn(api, 'completeReminder')
      .mockResolvedValue({ reminder: { ...upcoming, completedAt: '2026-08-16T00:00:00.000Z' } });

    renderWithProviders(<RemindersPage />, '/reminders');
    await screen.findByText('Endocrinology review');

    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }));

    await waitFor(() => expect(complete).toHaveBeenCalledWith('r2'));
  });

  it('offers to roll a repeating reminder forward rather than close it', async () => {
    vi.spyOn(api, 'listReminders').mockResolvedValue({ reminders: [overdue] });
    renderWithProviders(<RemindersPage />, '/reminders');

    expect(await screen.findByRole('button', { name: 'Done for now' })).toBeInTheDocument();
  });
});
