import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import { useBusinessStore } from '@/stores/businessStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { computeBusinessProfit } from '@/finance/compute';
import { ProfitEngine, type ProfitCalculation } from '@/finance/profit-engine';
import KpiCard from '@/components/shared/KpiCard';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

function monthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { businesses, loaded, fetch } = useBusinessStore();
  const currency = useSettingsStore((s) => s.currency);
  const { start, end } = useMemo(monthRange, []);
  const [calcs, setCalcs] = useState<Array<{ name: string; id: string; calc: ProfitCalculation }>>([]);
  const [computing, setComputing] = useState(false);

  useEffect(() => { if (!loaded) fetch(); }, [loaded, fetch]);

  useEffect(() => {
    if (!loaded || businesses.length === 0) { setCalcs([]); return; }
    setComputing(true);
    Promise.all(
      businesses.map(async (b) => ({ name: b.name, id: b.id, calc: await computeBusinessProfit(b, start, end) })),
    ).then((rows) => setCalcs(rows)).finally(() => setComputing(false));
  }, [loaded, businesses, start, end]);

  const global = useMemo(
    () => ProfitEngine.calculateGlobal(calcs.map((c) => ({ brandName: c.name, calculation: c.calc }))),
    [calcs],
  );
  const t = global.totals;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">This month across all businesses · {start} → {end}</p>
        </div>
        <Button onClick={() => navigate('/businesses')}>Manage businesses <ArrowRight className="h-4 w-4 ml-1.5" /></Button>
      </div>

      {loaded && businesses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="font-medium">Welcome to Apex Finance</p>
          <p className="text-sm text-muted-foreground mb-4">Create your first business to start tracking exact profit.</p>
          <Button onClick={() => navigate('/businesses')}><Plus className="h-4 w-4 mr-1.5" /> New business</Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <KpiCard label="Net Profit" value={formatCurrency(t.netProfit, currency)} sub={`${t.profitMargin.toFixed(1)}% margin`} tone={t.netProfit >= 0 ? 'positive' : 'negative'} />
            <KpiCard label="Your Profit" value={formatCurrency(t.userProfit, currency)} sub="Across all businesses" tone="positive" delay={40} />
            <KpiCard label="Net Revenue" value={formatCurrency(t.netSales, currency)} sub={`Ad spend ${formatCurrency(t.totalAdSpend, currency)}`} delay={80} />
            <KpiCard label="Blended ROAS" value={`${t.roas.toFixed(2)}x`} sub={`Break-even ${t.breakevenRoas.toFixed(2)}x`} tone={t.roas >= t.breakevenRoas ? 'positive' : 'negative'} delay={120} />
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-5 py-3 text-sm font-semibold">Businesses {computing && <span className="text-muted-foreground font-normal">· computing…</span>}</div>
            <div className="divide-y divide-border">
              {calcs.map(({ name, id, calc }) => (
                <button key={id} onClick={() => navigate(`/businesses/${id}`)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">{name.charAt(0).toUpperCase()}</div>
                    <div>
                      <div className="text-sm font-medium">{name}</div>
                      <div className="text-xs text-muted-foreground">Revenue {formatCurrency(calc.netSales, currency)} · ROAS {calc.roas.toFixed(2)}x</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold tabular-nums ${calc.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(calc.netProfit, currency)}</div>
                    <div className="text-xs text-muted-foreground">net profit</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
