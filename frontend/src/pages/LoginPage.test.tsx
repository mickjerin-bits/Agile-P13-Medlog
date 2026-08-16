import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, DEMO_CREDENTIALS, DEMO_DOCTOR_CREDENTIALS, api } from '../mock/api';
import { renderWithProviders, signedOut, testDoctor, testUser } from '../test-utils';
import { LoginPage } from './LoginPage';

beforeEach(() => {
  signedOut();
});

async function renderLogin() {
  renderWithProviders(<LoginPage />, '/login');
  return screen.findByRole('button', { name: 'Sign in' });
}

describe('LoginPage', () => {
  it('signs in with the credentials entered', async () => {
    const login = vi.spyOn(api, 'login').mockResolvedValue({ user: testUser });
    await renderLogin();

    await userEvent.type(screen.getByLabelText('Email'), DEMO_CREDENTIALS.email);
    await userEvent.type(screen.getByLabelText('Password'), DEMO_CREDENTIALS.password);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password),
    );
  });

  it('shows the server message when the credentials are rejected', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    await renderLogin();

    await userEvent.type(screen.getByLabelText('Email'), 'asha.rao@medlog.test');
    await userEvent.type(screen.getByLabelText('Password'), 'WrongPass!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('falls back to a generic message for an unexpected failure', async () => {
    vi.spyOn(api, 'login').mockRejectedValue(new Error('network is down'));
    await renderLogin();

    await userEvent.type(screen.getByLabelText('Email'), 'asha.rao@medlog.test');
    await userEvent.type(screen.getByLabelText('Password'), 'DemoPass123!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign in');
  });

  it('opens the demo patient without any typing', async () => {
    const demo = vi.spyOn(api, 'signInAsDemoPatient').mockResolvedValue({ user: testUser });
    await renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Open the demo patient' }));

    await waitFor(() => expect(demo).toHaveBeenCalled());
  });

  it('reports a failure to open the demo patient', async () => {
    vi.spyOn(api, 'signInAsDemoPatient').mockRejectedValue(new Error('boom'));
    await renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Open the demo patient' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open the demo account');
  });

  it('publishes the demo credentials and explains they are per-browser', async () => {
    await renderLogin();

    expect(screen.getByText(new RegExp(DEMO_CREDENTIALS.email))).toBeInTheDocument();
    expect(screen.getAllByText(DEMO_CREDENTIALS.password).length).toBeGreaterThan(0);
    expect(screen.getByText(/this browser only/i)).toBeInTheDocument();
  });

  it('offers the demo doctor alongside the demo patient', async () => {
    const demoDoctor = vi.spyOn(api, 'signInAsDemoDoctor').mockResolvedValue({ user: testDoctor });
    await renderLogin();

    expect(screen.getByText(new RegExp(DEMO_DOCTOR_CREDENTIALS.email))).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open the demo doctor' }));

    await waitFor(() => expect(demoDoctor).toHaveBeenCalled());
  });

  it('reports a failure to open the demo doctor', async () => {
    vi.spyOn(api, 'signInAsDemoDoctor').mockRejectedValue(new Error('boom'));
    await renderLogin();

    await userEvent.click(screen.getByRole('button', { name: 'Open the demo doctor' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not open the demo doctor account',
    );
  });

  it('offers a route to registration', async () => {
    await renderLogin();

    expect(screen.getByRole('link', { name: 'Create a patient account' })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});
