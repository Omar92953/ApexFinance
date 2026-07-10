// Alert center — pure. Takes pre-aggregated counts/amounts from each module
// and decides which alerts to surface and in what order (critical first).
// Currency formatting and the underlying filtering (which bill counts as
// "overdue", which product counts as "negative margin") stay in the caller —
// this just assembles and prioritizes what to show.

export type AlertSeverity = 'critical' | 'warning';

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  category: string;
  label: string;
  count: number;
  amount?: number;
}

export interface AlertInputs {
  outOfStockCount: number;
  lowStockCount: number;
  overdueBillsCount: number;
  overdueBillsAmount: number;
  overdueInvoicesCount: number;
  overdueInvoicesAmount: number;
  overBudgetCategoryCount: number;
  negativeMarginProductCount: number;
  codOutstandingTooLongCount: number;
  overdueFollowUpsCount: number;
}

export function buildAlerts(i: AlertInputs): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (i.outOfStockCount > 0) alerts.push({ id: 'out-of-stock', severity: 'critical', category: 'Inventory', label: 'Products out of stock', count: i.outOfStockCount });
  if (i.overdueBillsCount > 0) alerts.push({ id: 'overdue-bills', severity: 'critical', category: 'Payables', label: 'Overdue supplier bills', count: i.overdueBillsCount, amount: i.overdueBillsAmount });
  if (i.overdueInvoicesCount > 0) alerts.push({ id: 'overdue-invoices', severity: 'critical', category: 'Receivables', label: 'Overdue customer invoices', count: i.overdueInvoicesCount, amount: i.overdueInvoicesAmount });
  if (i.negativeMarginProductCount > 0) alerts.push({ id: 'negative-margin', severity: 'critical', category: 'Inventory', label: 'Products selling below cost', count: i.negativeMarginProductCount });

  if (i.lowStockCount > 0) alerts.push({ id: 'low-stock', severity: 'warning', category: 'Inventory', label: 'Products below safe stock level', count: i.lowStockCount });
  if (i.overBudgetCategoryCount > 0) alerts.push({ id: 'over-budget', severity: 'warning', category: 'Costs', label: 'Cost categories over budget this month', count: i.overBudgetCategoryCount });
  if (i.codOutstandingTooLongCount > 0) alerts.push({ id: 'cod-outstanding', severity: 'warning', category: 'COD', label: 'COD orders outstanding too long', count: i.codOutstandingTooLongCount });
  if (i.overdueFollowUpsCount > 0) alerts.push({ id: 'overdue-followups', severity: 'warning', category: 'CRM', label: 'Overdue customer follow-ups', count: i.overdueFollowUpsCount });

  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return b.count - a.count;
  });
}
