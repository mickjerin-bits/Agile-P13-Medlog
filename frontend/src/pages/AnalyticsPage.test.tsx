import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../mock/api';
import { buildAnalytics, renderWithProviders, signedIn } from '../test-utils';
import { AnalyticsPage } from './AnalyticsPage';

beforeEach(() => {
  signedIn();
});

describe('AnalyticsPage', () => {
  it('summarises the headline figures', async () => {
    vi.spyOn(api, 'analytics').mockResolvedValue(
      buildAnalytics({
        totalRecords: 5,
        averagePerMonth: 1.2,
        activeReminders: 3,
        doctorsWithAccess: 1,
        busiestMonth: { month: '2026-07', count: 2 },
        monthlyActivity: [
          { month: '2026-07', count: 2 },
          { month: '2026-08', count: 3 },
        ],
      }),
    );

    renderWithProviders(<AnalyticsPage />, '/analytics');

    expect(await screen.findByText('Health trends')).toBeInTheDocument();

    const statFor = (label: string) => screen.getByText(label).closest('.stat');
    expect(statFor('Records tracked')).toHaveTextContent('5');
    expect(statFor('Average per month')).toHaveTextContent('1.2');
    expect(statFor('Active reminders')).toHaveTextContent('3');
    expect(statFor('Doctors with access')).toHaveTextContent('1');
    expect(statFor('Busiest month')).toHaveTextContent('2 record(s)');
  });

  it('charts the monthly activity with an accessible description', async () => {
    vi.spyOn(api, 'analytics').mockResolvedValue(
      buildAnalytics({
        totalRecords: 3,
        monthlyActivity: [
          { month: '2026-07', count: 1 },
          { month: '2026-08', count: 2 },
        ],
      }),
    );

    renderWithProviders(<AnalyticsPage />, '/analytics');

    const chart = await screen.findByRole('img');
    expect(chart).toHaveAccessibleName(/Records added per month over the last 2 months, 3 in total/);
  });

  it('breaks the record down by category and provider', async () => {
    vi.spyOn(api, 'analytics').mockResolvedValue(
      buildAnalytics({
        totalRecords: 3,
        byType: [
          { recordType: 'LAB_REPORT', count: 2 },
          { recordType: 'IMAGING', count: 1 },
        ],
        topProviders: [{ providerName: 'City General Hospital', count: 3 }],
      }),
    );

    renderWithProviders(<AnalyticsPage />, '/analytics');

    expect(await screen.findByText('Lab report')).toBeInTheDocument();
    expect(screen.getByText('Imaging / scan')).toBeInTheDocument();
    expect(screen.getByText('City General Hospital')).toBeInTheDocument();
  });

  it('does not claim a leading category when the counts are tied', async () => {
    vi.spyOn(api, 'analytics').mockResolvedValue(
      buildAnalytics({
        totalRecords: 2,
        byType: [
          { recordType: 'IMAGING', count: 1 },
          { recordType: 'LAB_REPORT', count: 1 },
        ],
      }),
    );

    renderWithProviders(<AnalyticsPage />, '/analytics');

    expect(await screen.findByText('Imaging / scan')).toBeInTheDocument();
    expect(screen.queryByText(/Most of your record is/)).not.toBeInTheDocument();
  });

  it('names the leading category only when one clearly leads', async () => {
    vi.spyOn(api, 'analytics').mockResolvedValue(
      buildAnalytics({
        totalRecords: 3,
        byType: [
          { recordType: 'LAB_REPORT', count: 2 },
          { recordType: 'IMAGING', count: 1 },
        ],
      }),
    );

    renderWithProviders(<AnalyticsPage />, '/analytics');

    expect(await screen.findByText('Most of your record is lab report.')).toBeInTheDocument();
  });

  it('lists a care gap as a prompt rather than advice', async () => {
    vi.spyOn(api, 'analytics').mockResolvedValue(
      buildAnalytics({
        totalRecords: 2,
        careGaps: [{ recordType: 'IMAGING', lastRecordDate: '2026-01-10', monthsSince: 7 }],
      }),
    );

    renderWithProviders(<AnalyticsPage />, '/analytics');

    expect(await screen.findByText(/7 months ago/)).toBeInTheDocument();
    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument();
  });

  it('invites a first upload when there is nothing to analyse', async () => {
    vi.spyOn(api, 'analytics').mockResolvedValue(buildAnalytics());
    renderWithProviders(<AnalyticsPage />, '/analytics');

    expect(await screen.findByText('Upload a record to see this.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing is overdue/)).toBeInTheDocument();
  });

  it('tells the patient when the analytics cannot be loaded', async () => {
    vi.spyOn(api, 'analytics').mockRejectedValue(new Error('boom'));
    renderWithProviders(<AnalyticsPage />, '/analytics');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your analytics.');
  });
});
