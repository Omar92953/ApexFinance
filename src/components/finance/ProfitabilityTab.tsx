import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Lock, AlertTriangle } from 'lucide-react';
import type { Business, PeriodCloseRow } from '@/services/db';
import { periodClosesApi } from '@/services/db';
import {
  computeProductProfitability, computeMonthlyPnLTrend, computeCashFlowForecastForBusiness,
  computeBusinessProfit, type ProductProfitRow, type MonthlyPnLPoint,
} from '@/finance/compute';
import { weeksUntilNegative, type ForecastWeek } from '@/finance/forecast';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';

export default function ProfitabilityTab({ business, start, end }: { business: Business; start: string; end: string }) {
  const cur = business.currency ?? 'EGP';
  const [products, setProducts] = useState<ProductProfitRow[]>([]);
  const [pnlTrend, setPnlTrend] = useState<MonthlyPnLPoint[]>([]);
  const [forecast, setForecast] = useState<ForecastWeek[]>([]);
  const [closes, setCloses] = useState<PeriodCloseRow[]>([]);
  const [closing, setClosing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [p, t, f, c] = await Promise.all([
        computeProductProfitability(business, start, end),
        computeMonthlyPnLTrend(business, 6),
        computeCashFlowForecastForBusiness(business, 13),
        periodClosesApi.list(business.id),
      ]);
      setProducts(p); setPnlTrend(t); setForecast(f); setCloses(c);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [business.id, start, end]);

  const runwayWeeks = useMemo(() => weeksUntilNegative(forecast), [forecast]);
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const alreadyClosed = closes.some((c) => c.period_key === thisMonthKey);

  const closeMonth = async () => {
    setClosing(true); setMsg(null);
    try {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const monthEnd = new Date().toISOString().slice(0, 10);
      const calc = await computeBusinessProfit(business, monthStart, monthEnd);
      await periodClosesApi.close(business.id, {
        period_key: thisMonthKey, revenue: calc.netSales, cogs: calc.cogsTotal,
        total_expenses: calc.netSales - calc.netProfit, net_income: calc.netProfit,
        total_assets: 0, total_liabilities: 0, total_equity: 0,
      });
      setMsg('Month closed and snapshotted.');
      await load();
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : e}`);
    } finally { setClosing(false); }
  };

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-5">
      {/* Profit by product */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold">Profit by product — {start} to {end}</div>
        {products.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No sales recorded in this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-muted-foreground"><tr className="text-left">
                <th className="px-4 py-2 font-medium">Product</th><th className="px-4 py-2 font-medium text-right">Units sold</th>
                <th className="px-4 py-2 font-medium text-right">Revenue</th><th className="px-4 py-2 font-medium text-right">Total contribution</th>
              </tr></thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.variantId} className="border-b border-border last:border-0">
                    <td className="px-4 py-1.5">{p.title}{p.sku ? <span className="text-muted-foreground"> · {p.sku}</span> : null}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{p.unitsSold}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{formatCurrency(p.revenue, cur)}</td>
                    <td className={cn('px-4 py-1.5 text-right tabular-nums font-medium', p.contributionTotal < 0 ? 'text-destructive' : 'text-success')}>{formatCurrency(p.contributionTotal, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Monthly P&L trend */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Monthly P&amp;L trend — last 6 months</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pnlTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatCurrency(v, cur).replace(/\.\d+/, '')} width={70} />
              <Tooltip formatter={(v: number) => formatCurrency(v, cur, true)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expenses" name="Expenses" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="netIncome" name="Net income" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cash-flow forecast */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">13-week cash-flow forecast</h3>
          {runwayWeeks !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Cash runs out in week {runwayWeeks}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">Straight-line projection from your last 30 days of net cash generation, plus recurring fixed cost rules. Gets more accurate once Procurement/Payroll are wired in.</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={forecast} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatCurrency(v, cur).replace(/\.\d+/, '')} width={70} />
              <Tooltip formatter={(v: number) => formatCurrency(v, cur, true)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="balance" name="Projected balance" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Month close */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Month close</h3>
            <p className="text-xs text-muted-foreground">Snapshots this month's P&amp;L for month-over-month comparison. Doesn't lock editing yet — informational only.</p>
          </div>
          <Button size="sm" variant="outline" onClick={closeMonth} disabled={closing || alreadyClosed}>
            <Lock className="h-3.5 w-3.5 mr-1.5" /> {alreadyClosed ? `${thisMonthKey} closed` : closing ? 'Closing…' : `Close ${thisMonthKey}`}
          </Button>
        </div>
        {msg && <p className={cn('text-xs mb-2', msg.toLowerCase().includes('error') ? 'text-destructive' : 'text-success')}>{msg}</p>}
        {closes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No closed months yet.</p>
        ) : (
          <div className="space-y-1.5">
            {closes.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-medium">{c.period_key}</span>
                <span className="text-muted-foreground">Revenue {formatCurrency(c.revenue, cur)}</span>
                <span className={cn('font-medium tabular-nums', c.net_income >= 0 ? 'text-success' : 'text-destructive')}>{formatCurrency(c.net_income, cur)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
