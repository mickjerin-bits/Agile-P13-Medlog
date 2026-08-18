import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  const initials = user!.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ✚
          </span>
          <span>
            Med<strong>Log</strong>
          </span>
        </div>

        <nav className="app-nav">
          {user!.role === 'DOCTOR' ? (
            <NavLink to="/" end>
              Shared with me
            </NavLink>
          ) : (
            <>
              <NavLink to="/" end>
                Dashboard
              </NavLink>
              <NavLink to="/records">My records</NavLink>
              <NavLink to="/reminders">Reminders</NavLink>
              <NavLink to="/analytics">Trends</NavLink>
              <NavLink to="/sharing">Doctor access</NavLink>
            </>
          )}
        </nav>

        <div className="app-user">
          <span className="avatar" title={user!.email}>
            {initials}
          </span>
          <div className="app-user-meta">
            <span className="app-user-name">{user!.fullName}</span>
            <span className="muted small">
              {user!.role === 'DOCTOR'
                ? (user!.specialty ?? 'Doctor')
                : user!.email}
            </span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <footer className="app-footer muted small">
        MedLog · records are encrypted with AES-256-GCM before they touch disk
      </footer>
    </div>
  );
}
