import { useEffect, useMemo, useState } from 'react';
import type { Business, GoalRow } from '@/services/db';
import { goalsApi } from '@/services/db';
import { computeBusinessProfit } from '@/finance/compute';
import type { ProfitCalculation } from '@/finance/profit-engine';
import { Input } from '@/components/ui/input';
import { cn, formatCurrency } from '@/lib/utils';

const METRICS: { key: string; label: string; format: (v: number, cur: string) => string }[] = [
  { key: 'revenue', label: 'Net revenue', format: (v, c) => formatCurrency(v, c) },
  { key: 'net_profit', label: 'Net profit', format: (v, c) => formatCurrency(v, c) },
  { key: 'orders', label: 'Orders', format: (v) => v.toFixed(0) },
  { key: 'mer', label: 'MER', format: (v) => `${v.toFixed(2)}x` },
];

function monthKey() { return new Date().toISOString().slice(0, 7); }
function monthRange() {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
}

export default function GoalsTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [profit, setProfit] = useState<ProfitCalculation | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const periodKey = useMemo(monthKey, []);
  const { start, end } = useMemo(monthRange, []);

  const load = async () => {
    const [g, p] = await Promise.all([goalsApi.list(business.id), computeBusinessProfit(business, start, end)]);
    setGoals(g); setProfit(p);
  };
  useEffect(() => { load(); }, [business.id]);

  const targetFor = (key: string) => goals.find((g) => g.period_type === 'monthly' && g.period_key === periodKey && g.metric_key === key)?.target_value ?? 0;
  const actualFor = (key: string): number => {
    if (!profit) return 0;
    if (key === 'revenue') return profit.netSales;
    if (key === 'net_profit') return profit.netProfit;
    if (key === 'orders') return profit.orders;
    if (key === 'mer') return profit.totalAdSpend > 0 ? profit.grossSales / profit.totalAdSpend : 0;
    return 0;
  };

  const saveTarget = async (key: string) => {
    const draft = drafts[key];
    if (draft === undefined) return;
    await goalsApi.save(business.id, { period_type: 'monthly', period_key: periodKey, metric_key: key, target_value: parseFloat(draft) || 0 });
    setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Set this month's targets — progress updates live from your actual data. Goals reset each calendar month.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {METRICS.map((m) => {
          const target = targetFor(m.key);
          const actual = actualFor(m.key);
          const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
          const onTrack = target > 0 && actual >= target;
          return (
            <div key={m.key} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{m.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Target</span>
                  <Input
                    type="number" step="any" className="h-7 w-24 text-right text-xs"
                    value={drafts[m.key] ?? target}
                    onChange={(e) => setDrafts((d) => ({ ...d, [m.key]: e.target.value }))}
                    onBlur={() => saveTarget(m.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                </div>
              </div>
              <div className="text-2xl font-bold tabular-nums mb-2">{m.format(actual, cur)}</div>
              {target > 0 && (
                <>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className={cn('h-full rounded-full', onTrack ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{pct.toFixed(0)}% of {m.format(target, cur)} target</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
