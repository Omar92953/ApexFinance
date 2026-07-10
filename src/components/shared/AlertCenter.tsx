import { useEffect, useState } from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import type { Business } from '@/services/db';
import { productsApi, supplierBillsApi, customerInvoicesApi, costBudgetsApi, costRulesApi, contactsApi } from '@/services/db';
import { classifyStockHealth, computeAvgDailyUnits } from '@/finance/stock-health';
import { computeCostRules, dateOverlapDays, type CostRuleContext } from '@/finance/cost-rules';
import { buildAlerts, type AlertItem } from '@/finance/alerts';
import { formatCurrency, cn } from '@/lib/utils';

const COD_OUTSTANDING_DAYS = 10;

function monthKeyAndRange(): { monthKey: string; start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  return { monthKey: start.slice(0, 7), start, end };
}

export default function AlertCenter({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    const { monthKey, start, end } = monthKeyAndRange();

    (async () => {
      const [variants, unitsBySku, bills, invoices, budgets, rules, contacts] = await Promise.all([
        productsApi.listVariants(business.id),
        productsApi.unitsSoldBySku(business.id, 30),
        supplierBillsApi.list(business.id),
        customerInvoicesApi.list(business.id),
        costBudgetsApi.list(business.id, monthKey),
        costRulesApi.list(business.id),
        contactsApi.list(business.id),
      ]);
      if (cancelled) return;

      let outOfStockCount = 0, lowStockCount = 0, negativeMarginProductCount = 0;
      for (const v of variants) {
        const avgDaily = computeAvgDailyUnits(v.sku ? unitsBySku[v.sku] || 0 : 0, 30);
        const health = classifyStockHealth(Number(v.inventory_qty) || 0, avgDaily);
        if (health.status === 'out_of_stock') outOfStockCount++;
        if (health.status === 'below_safe_level') lowStockCount++;
        if ((Number(v.price) || 0) > 0 && (Number(v.price) || 0) < (Number(v.cost_per_item) || 0)) negativeMarginProductCount++;
      }

      const overdueBills = bills.filter((b) => b.status !== 'paid' && b.due_date && b.due_date < today);
      const overdueBillsAmount = overdueBills.reduce((s, b) => s + ((Number(b.amount) || 0) - (Number(b.amount_paid) || 0)), 0);

      const overdueInvoices = invoices.filter((i) => i.status !== 'paid' && i.due_date && i.due_date < today);
      const overdueInvoicesAmount = overdueInvoices.reduce((s, i) => s + ((Number(i.amount) || 0) - (Number(i.amount_paid) || 0)), 0);

      const codOutstandingTooLongCount = invoices.filter((i) => i.payment_method === 'cod' && i.status !== 'paid' &&
        (Date.now() - new Date(i.invoice_date).getTime()) / 86400000 > COD_OUTSTANDING_DAYS).length;

      const overdueFollowUpsCount = contacts.filter((c) => c.follow_up_date && c.follow_up_date <= today).length;

      let overBudgetCategoryCount = 0;
      if (budgets.length > 0) {
        const ctx: CostRuleContext = { periodStart: start, periodEnd: end, orders: 0, units: 0, revenue: 0 };
        const breakdown = computeCostRules(rules.filter((r) => r.is_active), ctx);
        for (const b of budgets) {
          const actual = (breakdown.totalsByCategory as any)[b.category] || 0;
          if (actual > (Number(b.budget_amount) || 0)) overBudgetCategoryCount++;
        }
      }

      const items = buildAlerts({
        outOfStockCount, lowStockCount, overdueBillsCount: overdueBills.length, overdueBillsAmount,
        overdueInvoicesCount: overdueInvoices.length, overdueInvoicesAmount, overBudgetCategoryCount,
        negativeMarginProductCount, codOutstandingTooLongCount, overdueFollowUpsCount,
      });
      setAlerts(items);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [business.id]);

  if (loading || alerts.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-3">Alerts</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {alerts.map((a) => (
          <div key={a.id} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', a.severity === 'critical' ? 'border-destructive/30 bg-destructive/5' : 'border-warning/30 bg-warning/5')}>
            {a.severity === 'critical' ? <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />}
            <div>
              <div className="font-medium">{a.label}</div>
              <div className="text-xs text-muted-foreground">
                {a.count} {a.category.toLowerCase()}
                {a.amount ? ` · ${formatCurrency(a.amount, cur)}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
