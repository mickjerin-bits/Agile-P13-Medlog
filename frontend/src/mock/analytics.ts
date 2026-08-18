import type {
  CareGap,
  HealthAnalytics,
  MedicalRecord,
  MonthlyActivity,
  ProviderCount,
  RecordType,
  TypeCount,
} from '../types';

export const CARE_GAP_MONTHS = 6;

const ACTIVITY_MONTHS = 12;

const TOP_PROVIDERS = 5;

export function monthsBetween(fromIso: string, toIso: string): number {
  const [fromYear, fromMonth] = fromIso.split('-').map(Number);
  const [toYear, toMonth] = toIso.split('-').map(Number);
  return (toYear! - fromYear!) * 12 + (toMonth! - fromMonth!);
}

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

function recentMonths(today: string, count: number): string[] {
  const [year, month] = today.split('-').map(Number);
  const months: string[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const shifted = new Date(Date.UTC(year!, month! - 1 - offset, 1));
    months.push(shifted.toISOString().slice(0, 7));
  }

  return months;
}

export interface AnalyticsContext {
  today: string;
  activeReminders: number;
  doctorsWithAccess: number;
}

export function buildAnalytics(
  records: MedicalRecord[],
  context: AnalyticsContext,
): HealthAnalytics {
  const dates = records.map((record) => record.recordDate).sort();

  const counts = new Map<string, number>();
  for (const record of records) {
    const key = monthKey(record.recordDate);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const monthlyActivity: MonthlyActivity[] = recentMonths(context.today, ACTIVITY_MONTHS).map(
    (month) => ({ month, count: counts.get(month) ?? 0 }),
  );

  const typeCounts = new Map<RecordType, number>();
  const latestByType = new Map<RecordType, string>();
  for (const record of records) {
    typeCounts.set(record.recordType, (typeCounts.get(record.recordType) ?? 0) + 1);
    const seen = latestByType.get(record.recordType);
    if (!seen || record.recordDate > seen) latestByType.set(record.recordType, record.recordDate);
  }

  const byType: TypeCount[] = [...typeCounts.entries()]
    .map(([recordType, count]) => ({ recordType, count }))
    .sort((a, b) => b.count - a.count || a.recordType.localeCompare(b.recordType));

  const providerCounts = new Map<string, number>();
  for (const record of records) {
    const name = record.providerName?.trim();
    if (!name) continue;
    providerCounts.set(name, (providerCounts.get(name) ?? 0) + 1);
  }

  const topProviders: ProviderCount[] = [...providerCounts.entries()]
    .map(([providerName, count]) => ({ providerName, count }))
    .sort((a, b) => b.count - a.count || a.providerName.localeCompare(b.providerName))
    .slice(0, TOP_PROVIDERS);

  const careGaps: CareGap[] = [...latestByType.entries()]
    .map(([recordType, lastRecordDate]) => ({
      recordType,
      lastRecordDate,
      monthsSince: monthsBetween(lastRecordDate, context.today),
    }))
    .filter((gap) => gap.monthsSince >= CARE_GAP_MONTHS)
    .sort((a, b) => b.monthsSince - a.monthsSince);

  const ranked = [...monthlyActivity].sort(
    (a, b) => b.count - a.count || a.month.localeCompare(b.month),
  );
  const busiest = ranked[0];
  const busiestIsClear = busiest !== undefined && busiest.count > (ranked[1]?.count ?? 0);

  const monthsCovered =
    dates.length > 0 ? monthsBetween(monthKey(dates[0]!), monthKey(dates.at(-1)!)) + 1 : 0;

  return {
    totalRecords: records.length,
    firstRecordDate: dates[0] ?? null,
    latestRecordDate: dates.at(-1) ?? null,
    monthlyActivity,
    byType,
    topProviders,
    careGaps,
    busiestMonth: busiestIsClear ? busiest : null,
    averagePerMonth:
      monthsCovered > 0 ? Math.round((records.length / monthsCovered) * 10) / 10 : 0,
    activeReminders: context.activeReminders,
    doctorsWithAccess: context.doctorsWithAccess,
  };
}
