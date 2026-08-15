import { useEffect, useState } from 'react';
import { Download, FileBarChart, Loader2 } from 'lucide-react';
import type { Business } from '@/services/db';
import { glApi, customerInvoicesApi, supplierBillsApi, capitalApi } from '@/services/db';
import { computeBusinessProfit, computeMonthlyPnLTrend, computeProductProfitability, computeCashFlowForecastForBusiness } from '@/finance/compute';
import { computeIncomeStatementFromTrialBalance, computeBalanceSheetFromTrialBalance } from '@/finance/ledger';
import { useCapabilities } from '@/hooks/useCapabilities';
import { Button } from '@/components/ui/button';
import { exportToCsv } from '@/lib/csv';
import { formatCurrency } from '@/lib/utils';

interface ReportDef {
  key: string;
  name: string;
  description: string;
  run: () => Promise<Array<Record<string, unknown>>>;
}

// Every report is "build rows, then hand them to the CSV exporter" — the same
// shape, so adding one later is a single entry in this list.
export default function FinancialReportsTab({ business, start, end }: { business: Business; start: string; end: string }) {
  const cur = business.currency ?? 'EGP';
  const caps = useCapabilities(business);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; rows: Array<Record<string, unknown>> } | null>(null);
  const [summary, setSummary] = useState<{ revenue: number; profit: number; cash: number; ar: number; ap: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [calc, accounts, invoices, bills] = await Promise.all([
        computeBusinessProfit(business, start, end).catch(() => null),
        capitalApi.listAccounts(business.id).catch(() => []),
        customerInvoicesApi.list(business.id).catch(() => []),
        supplierBillsApi.list(business.id).catch(() => []),
      ]);
      if (cancelled) return;
      setSummary({
        revenue: calc?.netSales ?? 0,
        profit: calc?.netProfit ?? 0,
        cash: accounts.reduce((s, a) => s + (Number(a.current_balance) || 0), 0),
        ar: invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + ((Number(i.amount) || 0) - (Number(i.amount_paid) || 0)), 0),
        ap: bills.filter((b) => b.status !== 'paid').reduce((s, b) => s + ((Number(b.amount) || 0) - (Number(b.amount_paid) || 0)), 0),
      });
    })();
    return () => { cancelled = true; };
  }, [business.id, start, end]);

  const reports: ReportDef[] = [
    {
      key: 'pnl',
      name: 'Profit & loss',
      description: `Income statement from the ledger for ${start} → ${end}.`,
      run: async () => {
        const tb = await glApi.getTrialBalance(business.id, end);
        const inc = computeIncomeStatementFromTrialBalance(tb);
        return [
          { line: 'Revenue', amount: inc.revenue },
          ...Object.entries(inc.expensesBySubtype).map(([k, v]) => ({ line: `Expense — ${k}`, amount: -v })),
          { line: 'Net income', amount: inc.netIncome },
        ];
      },
    },
    {
      key: 'balance',
      name: 'Balance sheet',
      description: `Assets, liabilities and equity as at ${end}.`,
      run: async () => {
        const tb = await glApi.getTrialBalance(business.id, end);
        const inc = computeIncomeStatementFromTrialBalance(tb);
        const bs = computeBalanceSheetFromTrialBalance(tb, inc.netIncome);
        return [
          { line: 'Total assets', amount: bs.totalAssets },
          { line: 'Total liabilities', amount: bs.totalLiabilities },
          { line: 'Total equity', amount: bs.totalEquity },
          { line: 'Balanced', amount: bs.balanced ? 'yes' : 'no' },
        ];
      },
    },
    {
      key: 'trial-balance',
      name: 'Trial balance',
      description: `Every account with a balance as at ${end}.`,
      run: async () => {
        const tb = await glApi.getTrialBalance(business.id, end);
        return tb.rows.filter((r) => r.debit || r.credit).map((r) => ({
          code: r.account_code, account: r.account_name, type: r.account_type,
          debit: r.debit, credit: r.credit, balance: r.balance,
        }));
      },
    },
    {
      key: 'pnl-trend',
      name: 'Monthly P&L trend',
      description: 'Revenue, expenses and net income over the last 6 months.',
      run: async () => {
        const trend = await computeMonthlyPnLTrend(business, 6);
        return trend.map((m) => ({ month: m.month, revenue: m.revenue, expenses: m.expenses, net_income: m.netIncome }));
      },
    },
    {
      key: 'cashflow',
      name: '13-week cash flow',
      description: 'Weekly projected inflows, outflows and closing balance.',
      run: async () => {
        const weeks = await computeCashFlowForecastForBusiness(business, 13);
        return weeks.map((w) => ({
          week: w.week, starts: w.startDate, opening: w.opening,
          inflows: w.inflows, outflows: w.outflows, closing: w.balance,
        }));
      },
    },
    {
      key: 'ar-aging',
      name: 'Receivables ageing',
      description: 'Every unpaid customer invoice with its age.',
      run: async () => {
        const invoices = await customerInvoicesApi.list(business.id);
        const today = new Date().toISOString().slice(0, 10);
        return invoices.filter((i) => i.status !== 'paid').map((i) => ({
          invoice: i.invoice_number ?? i.id.slice(0, 8),
          method: i.payment_method, invoice_date: i.invoice_date, due_date: i.due_date ?? '',
          days_overdue: i.due_date && i.due_date < today ? Math.floor((Date.now() - new Date(i.due_date).getTime()) / 86400000) : 0,
          amount: i.amount, paid: i.amount_paid, outstanding: Number(i.amount) - Number(i.amount_paid),
        }));
      },
    },
    {
      key: 'ap-aging',
      name: 'Payables ageing',
      description: 'Every unpaid supplier bill with its age.',
      run: async () => {
        const bills = await supplierBillsApi.list(business.id);
        const today = new Date().toISOString().slice(0, 10);
        return bills.filter((b) => b.status !== 'paid').map((b) => ({
          bill: b.bill_number ?? b.id.slice(0, 8), due_date: b.due_date ?? '',
          days_overdue: b.due_date && b.due_date < today ? Math.floor((Date.now() - new Date(b.due_date).getTime()) / 86400000) : 0,
          amount: b.amount, paid: b.amount_paid, outstanding: Number(b.amount) - Number(b.amount_paid),
        }));
      },
    },
    ...(caps.inventory ? [{
      key: 'product-profit',
      name: 'Profit by product',
      description: `Contribution per SKU for ${start} → ${end}.`,
      run: async () => {
        const rows = await computeProductProfitability(business, start, end);
        return rows.map((r) => ({
          product: r.title, sku: r.sku ?? '', units_sold: r.unitsSold,
          revenue: r.revenue, contribution: r.contributionTotal,
        }));
      },
    }] : []),
  ];

  const runReport = async (r: ReportDef, download: boolean) => {
    setBusy(r.key);
    try {
      const rows = await r.run();
      if (download) {
        if (rows.length === 0) { alert('Nothing to export — this report has no data yet.'); return; }
        exportToCsv(`${business.name}-${r.key}-${end}`, rows);
      } else {
        setPreview({ key: r.key, rows });
      }
    } catch (e) {
      alert(`Could not build that report: ${e instanceof Error ? e.message : e}`);
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Revenue (period)', value: summary.revenue },
            { label: 'Net profit (period)', value: summary.profit },
            { label: 'Cash on hand', value: summary.cash },
            { label: 'Owed to you', value: summary.ar },
            { label: 'You owe', value: summary.ap },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-xl font-bold tabular-nums">{formatCurrency(s.value, cur)}</div>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Reports use the date range in the header. Preview one on screen, or export it to CSV for your accountant.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {reports.map((r) => (
          <div key={r.key} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-sm">{r.name}</div>
                <p className="text-xs text-muted-foreground">{r.description}</p>
              </div>
              <FileBarChart className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <div className="flex gap-1.5 mt-3">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === r.key} onClick={() => runReport(r, false)}>
                {busy === r.key ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Preview'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === r.key} onClick={() => runReport(r, true)}>
                <Download className="h-3 w-3 mr-1" /> CSV
              </Button>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="text-sm font-semibold">{reports.find((r) => r.key === preview.key)?.name} — {preview.rows.length} rows</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPreview(null)}>Close</Button>
          </div>
          {preview.rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No data for this period yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr className="text-left">
                    {Object.keys(preview.rows[0]).map((h) => (
                      <th key={h} className="px-4 py-2 font-medium whitespace-nowrap capitalize">{h.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 100).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {Object.entries(row).map(([k, v]) => (
                        <td key={k} className="px-4 py-1.5 whitespace-nowrap tabular-nums">
                          {typeof v === 'number' ? formatCurrency(v, cur, true) : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 100 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">Showing first 100 rows — export to CSV for the full set.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
