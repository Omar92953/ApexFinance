import { describe, it, expect } from 'vitest';
import { buildAlerts, type AlertInputs } from './alerts';

const ZERO: AlertInputs = {
  outOfStockCount: 0, lowStockCount: 0, overdueBillsCount: 0, overdueBillsAmount: 0,
  overdueInvoicesCount: 0, overdueInvoicesAmount: 0, overBudgetCategoryCount: 0,
  negativeMarginProductCount: 0, codOutstandingTooLongCount: 0, overdueFollowUpsCount: 0,
};

describe('buildAlerts', () => {
  it('returns nothing when everything is healthy', () => {
    expect(buildAlerts(ZERO)).toEqual([]);
  });

  it('surfaces a critical alert with its amount', () => {
    const alerts = buildAlerts({ ...ZERO, overdueBillsCount: 2, overdueBillsAmount: 500 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: 'overdue-bills', severity: 'critical', count: 2, amount: 500 });
  });

  it('sorts critical alerts before warnings', () => {
    const alerts = buildAlerts({ ...ZERO, lowStockCount: 5, overdueInvoicesCount: 1, overdueInvoicesAmount: 100 });
    expect(alerts.map((a) => a.id)).toEqual(['overdue-invoices', 'low-stock']);
  });

  it('sorts within the same severity by count descending', () => {
    const alerts = buildAlerts({ ...ZERO, lowStockCount: 3, overBudgetCategoryCount: 8 });
    expect(alerts.map((a) => a.id)).toEqual(['over-budget', 'low-stock']);
  });

  it('includes every alert type when all thresholds are crossed', () => {
    const alerts = buildAlerts({
      outOfStockCount: 1, lowStockCount: 1, overdueBillsCount: 1, overdueBillsAmount: 1,
      overdueInvoicesCount: 1, overdueInvoicesAmount: 1, overBudgetCategoryCount: 1,
      negativeMarginProductCount: 1, codOutstandingTooLongCount: 1, overdueFollowUpsCount: 1,
    });
    expect(alerts).toHaveLength(8);
  });
});
