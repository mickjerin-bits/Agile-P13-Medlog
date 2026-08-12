import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../mock/api';
import { renderSignedIn, signedIn, testUser } from '../test-utils';
import { AppShell } from './AppShell';

beforeEach(() => {
  signedIn();
});

describe('AppShell', () => {
  it('shows the signed-in patient and their initials', async () => {
    renderSignedIn(
      <AppShell>
        <p>page content</p>
      </AppShell>,
    );

    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('AR')).toBeInTheDocument();
    expect(screen.getByText('asha.rao@medlog.test', { selector: '.small' })).toBeInTheDocument();
  });

  it('renders the page it wraps', async () => {
    renderSignedIn(
      <AppShell>
        <p>page content</p>
      </AppShell>,
    );

    expect(await screen.findByText('page content')).toBeInTheDocument();
  });

  it('takes a single initial from a one-word name', async () => {
    signedIn({ ...testUser, fullName: 'Asha' });
    renderSignedIn(
      <AppShell>
        <p>x</p>
      </AppShell>,
    );

    expect(await screen.findByText('A')).toBeInTheDocument();
  });

  it('links to the dashboard and the records page', async () => {
    renderSignedIn(
      <AppShell>
        <p>x</p>
      </AppShell>,
    );

    expect(await screen.findByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'My records' })).toHaveAttribute('href', '/records');
  });

  it('signs the patient out', async () => {
    const logout = vi.spyOn(api, 'logout').mockImplementation(() => {});
    renderSignedIn(
      <AppShell>
        <p>x</p>
      </AppShell>,
    );
    await screen.findByText('Asha Rao');

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
  });
});
