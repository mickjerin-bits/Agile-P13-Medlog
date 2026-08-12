import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SummaryCards } from './SummaryCards';
import type { RecordSummary } from '../types';

const empty: RecordSummary = {
  totalRecords: 0,
  totalBytes: 0,
  lastUploadAt: null,
  byType: {},
  recentRecords: [],
  storageUsedBytes: 0,
  storageBudgetBytes: 5 * 1024 * 1024,
};

describe('SummaryCards', () => {
  it('renders the dashboard figures', () => {
    render(
      <SummaryCards
        summary={{
          ...empty,
          totalRecords: 4,
          totalBytes: 2048,
          lastUploadAt: '2026-08-05T10:00:00.000Z',
          byType: { LAB_REPORT: 2, IMAGING: 1, VACCINATION: 1 },
        }}
      />,
    );

    expect(screen.getByText('Records stored').nextElementSibling).toHaveTextContent('4');
    expect(screen.getByText('Encrypted volume').nextElementSibling).toHaveTextContent('2.0 KB');
    expect(screen.getByText('Categories used').nextElementSibling).toHaveTextContent('3');
  });

  it('reports browser storage usage as a percentage of the budget', () => {
    render(
      <SummaryCards
        summary={{ ...empty, storageUsedBytes: 1024 * 1024, storageBudgetBytes: 4 * 1024 * 1024 }}
      />,
    );

    expect(screen.getByText('Browser storage').nextElementSibling).toHaveTextContent('25%');
  });

  it('shows a placeholder when nothing has been uploaded', () => {
    render(<SummaryCards summary={empty} />);

    expect(screen.getByText('Last upload').nextElementSibling).toHaveTextContent('—');
    expect(screen.getByText('Categories used').nextElementSibling).toHaveTextContent('0');
  });
});
