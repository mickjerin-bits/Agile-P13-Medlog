import type { MonthlyActivity } from '../types';

const WIDTH = 640;
const HEIGHT = 180;
const PADDING = 28;

export function formatMonth(month: string): string {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, value! - 1, 1));
  return date.toLocaleDateString(undefined, { month: 'short' });
}

export function TrendChart({ activity }: { activity: MonthlyActivity[] }) {
  if (activity.length === 0) {
    return <p className="muted empty-state">Not enough history to chart yet.</p>;
  }

  const peak = Math.max(...activity.map((point) => point.count), 1);
  const usableWidth = WIDTH - PADDING * 2;
  const usableHeight = HEIGHT - PADDING * 2;
  const slot = usableWidth / activity.length;
  const barWidth = Math.max(slot * 0.55, 4);

  const total = activity.reduce((sum, point) => sum + point.count, 0);
  const label = `Records added per month over the last ${activity.length} months, ${total} in total`;

  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      <line
        x1={PADDING}
        y1={HEIGHT - PADDING}
        x2={WIDTH - PADDING}
        y2={HEIGHT - PADDING}
        className="trend-axis"
      />

      {activity.map((point, index) => {
        const height = point.count === 0 ? 0 : (point.count / peak) * usableHeight;
        const x = PADDING + index * slot + (slot - barWidth) / 2;
        const y = HEIGHT - PADDING - height;

        return (
          <g key={point.month}>
            {point.count > 0 && (
              <rect x={x} y={y} width={barWidth} height={height} rx="3" className="trend-bar" />
            )}
            {point.count > 0 && (
              <text x={x + barWidth / 2} y={y - 5} className="trend-value" textAnchor="middle">
                {point.count}
              </text>
            )}
            <text
              x={x + barWidth / 2}
              y={HEIGHT - PADDING + 15}
              className="trend-label"
              textAnchor="middle"
            >
              {formatMonth(point.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
