import type { RecordSummary, RecordType } from '../types';
import { formatBytes, formatDate } from './RecordList';

export function SummaryCards({ summary }: { summary: RecordSummary }) {
  const types = Object.entries(summary.byType) as Array<[RecordType, number]>;
  const categories = types.filter(([, count]) => count > 0).length;
  const usedPercent = Math.min(
    100,
    Math.round((summary.storageUsedBytes / summary.storageBudgetBytes) * 100),
  );

  return (
    <div className="stat-grid">
      <div className="card stat">
        <span className="stat-label">Records stored</span>
        <span className="stat-value">{summary.totalRecords}</span>
      </div>
      <div className="card stat">
        <span className="stat-label">Encrypted volume</span>
        <span className="stat-value">{formatBytes(summary.totalBytes)}</span>
      </div>
      <div className="card stat">
        <span className="stat-label">Categories used</span>
        <span className="stat-value">{categories}</span>
      </div>
      <div className="card stat">
        <span className="stat-label">Last upload</span>
        <span className="stat-value">
          {summary.lastUploadAt ? formatDate(summary.lastUploadAt) : '—'}
        </span>
      </div>
      <div className="card stat">
        <span className="stat-label">Browser storage</span>
        <span className="stat-value">{usedPercent}%</span>
        <span className="muted small">
          {formatBytes(summary.storageUsedBytes)} of {formatBytes(summary.storageBudgetBytes)}
        </span>
        <span className="quota-bar" aria-hidden="true">
          <span className="quota-fill" style={{ width: `${Math.max(usedPercent, 1)}%` }} />
        </span>
      </div>
    </div>
  );
}
