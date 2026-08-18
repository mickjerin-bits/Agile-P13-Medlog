import { useEffect, useState } from 'react';
import { formatDate } from '../components/RecordList';
import { TrendChart, formatMonth } from '../components/TrendChart';
import { api } from '../mock/api';
import { RECORD_TYPE_LABELS } from '../types';
import type { HealthAnalytics } from '../types';

export function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<HealthAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .analytics()
      .then(setAnalytics)
      .catch(() => setError('Could not load your analytics.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page">
        <p className="muted empty-state">Loading…</p>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="page">
        <p className="alert alert-error" role="alert">
          {error ?? 'Could not load your analytics.'}
        </p>
      </div>
    );
  }

  const peakType = analytics.byType[0];
  const peakTypeIsClear = peakType !== undefined && peakType.count > (analytics.byType[1]?.count ?? 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Health trends</h1>
          <p className="muted">What your record says about your care over time.</p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <span className="stat-label">Records tracked</span>
          <span className="stat-value">{analytics.totalRecords}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Average per month</span>
          <span className="stat-value">{analytics.averagePerMonth}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Busiest month</span>
          <span className="stat-value">
            {analytics.busiestMonth ? formatMonth(analytics.busiestMonth.month) : '—'}
          </span>
          {analytics.busiestMonth && (
            <span className="muted small">{analytics.busiestMonth.count} record(s)</span>
          )}
        </div>
        <div className="card stat">
          <span className="stat-label">Active reminders</span>
          <span className="stat-value">{analytics.activeReminders}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Doctors with access</span>
          <span className="stat-value">{analytics.doctorsWithAccess}</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Records added per month</h2>
          {analytics.firstRecordDate && (
            <p className="muted small">
              First record {formatDate(analytics.firstRecordDate)} · latest{' '}
              {formatDate(analytics.latestRecordDate!)}
            </p>
          )}
        </div>
        <TrendChart activity={analytics.monthlyActivity} />
      </section>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-head">
            <h2>By category</h2>
            {peakTypeIsClear && (
              <p className="muted small">
                Most of your record is {RECORD_TYPE_LABELS[peakType!.recordType].toLowerCase()}.
              </p>
            )}
          </div>

          {analytics.byType.length === 0 ? (
            <p className="muted empty-state">Upload a record to see this.</p>
          ) : (
            <ul className="bar-list">
              {analytics.byType.map((entry) => (
                <li key={entry.recordType} className="bar-row">
                  <span className="bar-label">{RECORD_TYPE_LABELS[entry.recordType]}</span>
                  <span className="bar-track" aria-hidden="true">
                    <span
                      className="bar-fill"
                      style={{ width: `${(entry.count / peakType!.count) * 100}%` }}
                    />
                  </span>
                  <span className="bar-count">{entry.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Where you were treated</h2>
          </div>

          {analytics.topProviders.length === 0 ? (
            <p className="muted empty-state">No hospital or clinic recorded yet.</p>
          ) : (
            <ul className="bar-list">
              {analytics.topProviders.map((provider) => (
                <li key={provider.providerName} className="bar-row">
                  <span className="bar-label">{provider.providerName}</span>
                  <span className="bar-track" aria-hidden="true">
                    <span
                      className="bar-fill"
                      style={{
                        width: `${(provider.count / analytics.topProviders[0]!.count) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="bar-count">{provider.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Worth a look</h2>
          <p className="muted small">
            Care you have had before but not recently. This is a prompt, not medical advice.
          </p>
        </div>

        {analytics.careGaps.length === 0 ? (
          <p className="muted empty-state">Nothing is overdue based on what you have stored.</p>
        ) : (
          <ul className="gap-list">
            {analytics.careGaps.map((gap) => (
              <li key={gap.recordType} className="gap-item">
                <span className={`badge badge-${gap.recordType.toLowerCase()}`}>
                  {RECORD_TYPE_LABELS[gap.recordType]}
                </span>
                <span>
                  Last one {formatDate(gap.lastRecordDate)} — {gap.monthsSince} months ago
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
