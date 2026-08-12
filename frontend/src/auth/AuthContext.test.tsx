import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../mock/api';
import { renderWithProviders, signedIn, signedOut, testUser } from '../test-utils';
import { AuthProvider, useAuth } from './AuthContext';

function Probe() {
  const { user, loading, login, register, signInAsDemoPatient, logout } = useAuth();

  if (loading) return <p>loading</p>;

  return (
    <div>
      <p data-testid="who">{user ? user.fullName : 'nobody'}</p>
      <button type="button" onClick={() => login('asha.rao@medlog.test', 'DemoPass123!')}>
        do-login
      </button>
      <button
        type="button"
        onClick={() => register({ email: 'new@medlog.test', password: 'Str0ngPass!', fullName: 'New Patient' })}
      >
        do-register
      </button>
      <button type="button" onClick={() => signInAsDemoPatient()}>
        do-demo
      </button>
      <button type="button" onClick={logout}>
        do-logout
      </button>
    </div>
  );
}

describe('AuthProvider session restore', () => {
  it('restores an existing session on mount', async () => {
    signedIn();
    renderWithProviders(<Probe />);

    expect(await screen.findByTestId('who')).toHaveTextContent('Asha Rao');
  });

  it('settles to signed out when there is no session', async () => {
    signedOut();
    renderWithProviders(<Probe />);

    expect(await screen.findByTestId('who')).toHaveTextContent('nobody');
  });

  it('shows a loading state until the session check resolves', async () => {
    let release: (value: { user: typeof testUser }) => void = () => {};
    vi.spyOn(api, 'me').mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    renderWithProviders(<Probe />);
    expect(screen.getByText('loading')).toBeInTheDocument();

    release({ user: testUser });
    expect(await screen.findByTestId('who')).toHaveTextContent('Asha Rao');
  });
});

describe('AuthProvider actions', () => {
  it('signs a patient in through login', async () => {
    signedOut();
    vi.spyOn(api, 'login').mockResolvedValue({ user: testUser });
    renderWithProviders(<Probe />);
    await screen.findByTestId('who');

    await userEvent.click(screen.getByRole('button', { name: 'do-login' }));

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('Asha Rao'));
    expect(api.login).toHaveBeenCalledWith('asha.rao@medlog.test', 'DemoPass123!');
  });

  it('signs a patient in through register', async () => {
    signedOut();
    vi.spyOn(api, 'register').mockResolvedValue({
      user: { ...testUser, fullName: 'New Patient' },
    });
    renderWithProviders(<Probe />);
    await screen.findByTestId('who');

    await userEvent.click(screen.getByRole('button', { name: 'do-register' }));

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('New Patient'));
  });

  it('signs a patient in through the demo shortcut', async () => {
    signedOut();
    vi.spyOn(api, 'signInAsDemoPatient').mockResolvedValue({ user: testUser });
    renderWithProviders(<Probe />);
    await screen.findByTestId('who');

    await userEvent.click(screen.getByRole('button', { name: 'do-demo' }));

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('Asha Rao'));
    expect(api.signInAsDemoPatient).toHaveBeenCalled();
  });

  it('clears the session on logout', async () => {
    signedIn();
    const logout = vi.spyOn(api, 'logout').mockImplementation(() => {});
    renderWithProviders(<Probe />);
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('Asha Rao'));

    await userEvent.click(screen.getByRole('button', { name: 'do-logout' }));

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'));
    expect(logout).toHaveBeenCalled();
  });

  it('leaves the user signed out when login fails', async () => {
    signedOut();
    vi.spyOn(api, 'login').mockRejectedValue(new Error('bad credentials'));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByTestId('who');

    await userEvent.click(screen.getByRole('button', { name: 'do-login' })).catch(() => {});

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'));
  });
});

describe('useAuth', () => {
  it('throws when used outside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Probe />)).toThrow('useAuth must be used inside an AuthProvider');

    consoleError.mockRestore();
  });
});
