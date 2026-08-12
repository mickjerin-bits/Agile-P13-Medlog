import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, DEMO_CREDENTIALS } from '../mock/api';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login, signInAsDemoPatient } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function useDemoAccount() {
    setError(null);
    setBusy(true);

    try {
      await signInAsDemoPatient();
    } catch {
      setError('Could not open the demo account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="centered-page">
      <form className="card auth-card" onSubmit={submit}>
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true">
            ✚
          </span>
          <span>
            Med<strong>Log</strong>
          </span>
        </div>
        <h1>Sign in</h1>
        <p className="muted">Your health records, encrypted and in one place.</p>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="muted small center">
          New here? <Link to="/register">Create a patient account</Link>
        </p>

        <div className="demo-block">
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={useDemoAccount}
            disabled={busy}
          >
            Open the demo patient
          </button>
          <p className="muted small center">
            Creates {DEMO_CREDENTIALS.email} with four sample records.
            <br />
            Password: <code>{DEMO_CREDENTIALS.password}</code>
          </p>
        </div>
      </form>
    </div>
  );
}
