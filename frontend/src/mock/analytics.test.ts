import { describe, expect, it } from 'vitest';
import { CARE_GAP_MONTHS, buildAnalytics, monthsBetween } from './analytics';
import type { MedicalRecord, RecordType } from '../types';

const TODAY = '2026-08-16';

const CONTEXT = { today: TODAY, activeReminders: 0, doctorsWithAccess: 0 };

function record(
  recordDate: string,
  recordType: RecordType = 'LAB_REPORT',
  providerName: string | null = 'City General Hospital',
): MedicalRecord {
  return {
    id: `rec-${recordDate}-${recordType}`,
    title: 'Record',
    recordType,
    recordDate,
    providerName,
    notes: null,
    originalFilename: 'file.txt',
    mimeType: 'text/plain',
    sizeBytes: 10,
    createdAt: `${recordDate}T00:00:00.000Z`,
  };
}

describe('monthsBetween', () => {
  it('counts whole months across a year boundary', () => {
    expect(monthsBetween('2025-11-02', '2026-08-16')).toBe(9);
  });

  it('is zero within the same month', () => {
    expect(monthsBetween('2026-08-01', '2026-08-31')).toBe(0);
  });
});

describe('buildAnalytics', () => {
  it('returns an empty shape for a patient with no records', () => {
    const analytics = buildAnalytics([], CONTEXT);

    expect(analytics.totalRecords).toBe(0);
    expect(analytics.firstRecordDate).toBeNull();
    expect(analytics.busiestMonth).toBeNull();
    expect(analytics.averagePerMonth).toBe(0);
    expect(analytics.byType).toEqual([]);
    expect(analytics.careGaps).toEqual([]);
  });

  it('keeps a continuous twelve month axis including quiet months', () => {
    const analytics = buildAnalytics([record('2026-08-10')], CONTEXT);

    expect(analytics.monthlyActivity).toHaveLength(12);
    expect(analytics.monthlyActivity.at(0)?.month).toBe('2025-09');
    expect(analytics.monthlyActivity.at(-1)).toEqual({ month: '2026-08', count: 1 });
    expect(analytics.monthlyActivity.filter((point) => point.count === 0)).toHaveLength(11);
  });

  it('counts each category and orders them by how common they are', () => {
    const analytics = buildAnalytics(
      [
        record('2026-08-01', 'LAB_REPORT'),
        record('2026-07-01', 'LAB_REPORT'),
        record('2026-06-01', 'IMAGING'),
      ],
      CONTEXT,
    );

    expect(analytics.byType).toEqual([
      { recordType: 'LAB_REPORT', count: 2 },
      { recordType: 'IMAGING', count: 1 },
    ]);
  });

  it('ranks providers and ignores records with no provider', () => {
    const analytics = buildAnalytics(
      [
        record('2026-08-01', 'LAB_REPORT', 'City General Hospital'),
        record('2026-07-01', 'IMAGING', 'City General Hospital'),
        record('2026-06-01', 'PRESCRIPTION', 'Dr. Menon Family Clinic'),
        record('2026-05-01', 'OTHER', null),
      ],
      CONTEXT,
    );

    expect(analytics.topProviders).toEqual([
      { providerName: 'City General Hospital', count: 2 },
      { providerName: 'Dr. Menon Family Clinic', count: 1 },
    ]);
  });

  it('reports the busiest month when one month clearly leads', () => {
    const analytics = buildAnalytics(
      [record('2026-07-02'), record('2026-07-20', 'IMAGING'), record('2026-08-01', 'PRESCRIPTION')],
      CONTEXT,
    );

    expect(analytics.busiestMonth).toEqual({ month: '2026-07', count: 2 });
  });

  it('names no busiest month when the top months are tied', () => {
    const analytics = buildAnalytics(
      [record('2026-06-02'), record('2026-07-02', 'IMAGING')],
      CONTEXT,
    );

    expect(analytics.busiestMonth).toBeNull();
  });

  it('flags a category the patient has not revisited for six months', () => {
    const stale = '2026-01-10';
    const analytics = buildAnalytics(
      [record(stale, 'IMAGING'), record('2026-08-01', 'LAB_REPORT')],
      CONTEXT,
    );

    expect(analytics.careGaps).toEqual([
      { recordType: 'IMAGING', lastRecordDate: stale, monthsSince: 7 },
    ]);
    expect(monthsBetween(stale, TODAY)).toBeGreaterThanOrEqual(CARE_GAP_MONTHS);
  });

  it('does not flag a category seen recently', () => {
    const analytics = buildAnalytics([record('2026-07-01', 'IMAGING')], CONTEXT);

    expect(analytics.careGaps).toEqual([]);
  });

  it('carries the reminder and sharing counts through untouched', () => {
    const analytics = buildAnalytics([record('2026-08-01')], {
      today: TODAY,
      activeReminders: 4,
      doctorsWithAccess: 2,
    });

    expect(analytics.activeReminders).toBe(4);
    expect(analytics.doctorsWithAccess).toBe(2);
  });
});
