import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../mock/api';
import { renderWithProviders, signedOut, testUser } from '../test-utils';
import { RegisterPage } from './RegisterPage';

beforeEach(() => {
  signedOut();
});

async function renderRegister() {
  renderWithProviders(<RegisterPage />, '/register');
  return screen.findByRole('button', { name: 'Create account' });
}

describe('RegisterPage', () => {
  it('submits the profile the patient filled in', async () => {
    const register = vi.spyOn(api, 'register').mockResolvedValue({ user: testUser });
    await renderRegister();

    await userEvent.type(screen.getByLabelText('Full name'), 'Asha Rao');
    await userEvent.type(screen.getByLabelText('Email'), 'asha.rao@medlog.test');
    await userEvent.type(screen.getByLabelText(/^Password/), 'Str0ngPass!');
    await userEvent.selectOptions(screen.getByLabelText('Blood group'), 'O+');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Asha Rao',
          email: 'asha.rao@medlog.test',
          password: 'Str0ngPass!',
          bloodGroup: 'O+',
        }),
      ),
    );
  });

  it('omits the optional fields when they are left blank', async () => {
    const register = vi.spyOn(api, 'register').mockResolvedValue({ user: testUser });
    await renderRegister();

    await userEvent.type(screen.getByLabelText('Full name'), 'Asha Rao');
    await userEvent.type(screen.getByLabelText('Email'), 'asha.rao@medlog.test');
    await userEvent.type(screen.getByLabelText(/^Password/), 'Str0ngPass!');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(register).toHaveBeenCalled());
    const payload = vi.mocked(register).mock.calls[0]![0];
    expect(payload.dateOfBirth).toBeUndefined();
    expect(payload.bloodGroup).toBeUndefined();
  });

  it('shows every field error returned by the API', async () => {
    vi.spyOn(api, 'register').mockRejectedValue(
      new ApiError(400, 'Validation failed', [
        { field: 'email', message: 'A valid email address is required' },
        { field: 'password', message: 'Password must be at least 8 characters' },
      ]),
    );
    await renderRegister();

    await userEvent.type(screen.getByLabelText('Full name'), 'Asha Rao');
    await userEvent.type(screen.getByLabelText('Email'), 'nope');
    await userEvent.type(screen.getByLabelText(/^Password/), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A valid email address is required');
    expect(alert).toHaveTextContent('Password must be at least 8 characters');
  });

  it('shows the message when the email is already taken', async () => {
    vi.spyOn(api, 'register').mockRejectedValue(
      new ApiError(409, 'An account with this email already exists'),
    );
    await renderRegister();

    await userEvent.type(screen.getByLabelText('Full name'), 'Asha Rao');
    await userEvent.type(screen.getByLabelText('Email'), 'asha.rao@medlog.test');
    await userEvent.type(screen.getByLabelText(/^Password/), 'Str0ngPass!');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });

  it('offers a route back to sign in', async () => {
    await renderRegister();

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });
});
