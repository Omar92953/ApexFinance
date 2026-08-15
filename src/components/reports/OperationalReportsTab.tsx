import { useState } from 'react';
import { Download, ClipboardList, Loader2 } from 'lucide-react';
import type { Business } from '@/services/db';
import {
  productsApi, contactsApi, dealsApi, salesOrdersApi, projectsApi, timeEntriesApi,
  rateCardsApi, employeesApi, tasksApi, auditApi,
} from '@/services/db';
import { classifyStockHealth, computeAvgDailyUnits } from '@/finance/stock-health';
import { classifyRfmSegment, RFM_LABELS } from '@/finance/rfm';
import { computeProjectEconomics } from '@/finance/projects';
import { computeRtoRate } from '@/finance/cod';
import { useCapabilities } from '@/hooks/useCapabilities';
import { Button } from '@/components/ui/button';
import { exportToCsv } from '@/lib/csv';

const WINDOW_DAYS = 30;

export default function OperationalReportsTab({ business }: { business: Business }) {
  const caps = useCapabilities(business);
  const [busy, setBusy] = useState<string | null>(null);

  const reports: Array<{ key: string; name: string; description: string; run: () => Promise<Array<Record<string, unknown>>> }> = [
    ...(caps.inventory ? [{
      key: 'stock-health',
      name: 'Stock health',
      description: 'Every variant with its cover in days and reorder status.',
      run: async () => {
        const [variants, unitsBySku] = await Promise.all([
          productsApi.listVariants(business.id),
          productsApi.unitsSoldBySku(business.id, WINDOW_DAYS),
        ]);
        return variants.map((v) => {
          const avg = computeAvgDailyUnits(v.sku ? unitsBySku[v.sku] || 0 : 0, WINDOW_DAYS);
          const health = classifyStockHealth(Number(v.inventory_qty) || 0, avg);
          return {
            product: v.title ?? '', sku: v.sku ?? '', stock: v.inventory_qty,
            avg_daily_sales: Number(avg.toFixed(2)),
            days_of_cover: health.daysOfCover === null ? '' : Number(health.daysOfCover.toFixed(1)),
            status: health.label, unit_cost: v.cost_per_item, price: v.price,
          };
        });
      },
    }] : []),
    {
      key: 'customers',
      name: 'Customer segments',
      description: 'Every contact with its RFM segment and spend.',
      run: async () => {
        const contacts = await contactsApi.list(business.id);
        return contacts.map((c) => ({
          name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '',
          email: c.email ?? '', phone: c.phone ?? '',
          segment: RFM_LABELS[classifyRfmSegment({ ordersCount: c.orders_count || 0, lastOrderDate: c.last_order_date ?? null })],
          orders: c.orders_count || 0, total_spent: Number(c.total_spent) || 0,
          last_order: c.last_order_date ?? '', follow_up: c.follow_up_date ?? '',
        }));
      },
    },
    {
      key: 'pipeline',
      name: 'Deal pipeline',
      description: 'Open and closed deals with stage and value.',
      run: async () => {
        const deals = await dealsApi.list(business.id);
        return deals.map((d) => ({
          deal: d.title, stage: d.stage, value: Number(d.value) || 0,
          expected_close: d.expected_close ?? '', reason: d.win_loss_reason ?? '',
        }));
      },
    },
    ...(caps.cod ? [{
      key: 'rto',
      name: 'COD & RTO performance',
      description: 'Return-to-origin rate across COD orders.',
      run: async () => {
        const orders = await salesOrdersApi.list(business.id);
        const rto = computeRtoRate(orders.map((o) => ({ payment_method: o.payment_method, is_rto: !!o.is_rto })));
        return [
          { measure: 'COD orders', value: rto.codCount },
          { measure: 'Returned to origin', value: rto.rtoCount },
          { measure: 'RTO rate %', value: Number(rto.ratePct.toFixed(1)) },
        ];
      },
    }] : []),
    ...(caps.projects ? [{
      key: 'project-profit',
      name: 'Project profitability',
      description: 'Hours, billable value, labour cost and margin per project.',
      run: async () => {
        const [projects, entries, rates] = await Promise.all([
          projectsApi.list(business.id), timeEntriesApi.list(business.id), rateCardsApi.list(business.id),
        ]);
        const rateById = new Map(rates.map((r) => [r.id, r]));
        return projects.map((p) => {
          const econ = computeProjectEconomics(entries.filter((e) => e.project_id === p.id).map((e) => {
            const rc = e.rate_card_id ? rateById.get(e.rate_card_id) : undefined;
            return {
              hours: Number(e.hours) || 0, is_billable: e.is_billable,
              billRate: Number(rc?.hourly_rate) || 0, costRate: Number(rc?.cost_rate) || 0,
            };
          }));
          return {
            project: p.name, type: p.billing_type, status: p.status,
            budget: Number(p.budget_amount) || 0,
            hours: Number(econ.hoursTotal.toFixed(1)),
            billable_pct: Number(econ.utilizationPct.toFixed(0)),
            billable_value: Number(econ.billableValue.toFixed(2)),
            labour_cost: Number(econ.laborCost.toFixed(2)),
            margin: Number(econ.margin.toFixed(2)),
          };
        });
      },
    }] : []),
    {
      key: 'employees',
      name: 'Employee roster',
      description: 'Active and inactive staff with salaries.',
      run: async () => {
        const employees = await employeesApi.list(business.id);
        return employees.map((e) => ({
          name: e.name, role: e.role ?? '', monthly_salary: e.monthly_salary,
          hire_date: e.hire_date ?? '', active: e.is_active ? 'yes' : 'no',
          phone: e.phone ?? '', email: e.email ?? '',
        }));
      },
    },
    {
      key: 'open-work',
      name: 'Open work items',
      description: 'Everything currently queued, with due dates and priority.',
      run: async () => {
        const tasks = await tasksApi.listOpen(business.id);
        return tasks.map((t) => ({
          task: t.title, notes: t.notes ?? '', priority: t.priority ?? 'normal',
          due_date: t.due_date ?? '', from_signal: t.source_signal_id ?? '',
        }));
      },
    },
    {
      key: 'audit',
      name: 'Audit trail',
      description: 'Recent money-moving and irreversible actions.',
      run: async () => {
        const rows = await auditApi.list(business.id, 500);
        return rows.map((r) => ({
          when: r.created_at, action: r.action, table: r.table_name,
          row_id: r.row_id ?? '', details: JSON.stringify(r.new_data ?? {}),
        }));
      },
    },
  ];

  const run = async (r: (typeof reports)[number]) => {
    setBusy(r.key);
    try {
      const rows = await r.run();
      if (rows.length === 0) { alert('Nothing to export — this report has no data yet.'); return; }
      exportToCsv(`${business.name}-${r.key}`, rows);
    } catch (e) {
      alert(`Could not build that report: ${e instanceof Error ? e.message : e}`);
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Operational exports — the day-to-day lists, in a form you can hand to someone else or open in Excel.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {reports.map((r) => (
          <div key={r.key} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm">{r.name}</div>
                <p className="text-xs text-muted-foreground">{r.description}</p>
              </div>
              <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs mt-3" disabled={busy === r.key} onClick={() => run(r)}>
              {busy === r.key ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
              Export CSV
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
