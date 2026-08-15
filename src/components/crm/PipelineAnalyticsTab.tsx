import { useEffect, useMemo, useState } from 'react';
import { TrendingDown, Clock, Trophy } from 'lucide-react';
import type { Business, DealRow } from '@/services/db';
import { dealsApi } from '@/services/db';
import { computeStageConversions, computeStageAging, computeWinLoss, staleDeals } from '@/finance/pipeline';
import { computeWeightedPipelineValue } from '@/finance/rfm';
import { formatCurrency, cn } from '@/lib/utils';

const STAGE_ORDER = ['lead', 'qualified', 'proposal', 'won'];

export default function PipelineAnalyticsTab({ business }: { business: Business }) {
  const cur = business.currency ?? 'EGP';
  const today = new Date().toISOString().slice(0, 10);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dealsApi.list(business.id).then(setDeals).catch(() => setDeals([])).finally(() => setLoading(false));
  }, [business.id]);

  const analysis = useMemo(() => deals.map((d) => ({
    id: d.id, title: d.title, value: Number(d.value) || 0, stage: d.stage,
    created_at: (d as { created_at?: string }).created_at ?? null,
    updated_at: (d as { updated_at?: string }).updated_at ?? null,
    expected_close: d.expected_close ?? null,
    win_loss_reason: d.win_loss_reason ?? null,
  })), [deals]);

  const conversions = useMemo(() => computeStageConversions(analysis, STAGE_ORDER), [analysis]);
  const aging = useMemo(() => computeStageAging(analysis, today, STAGE_ORDER.slice(0, -1)), [analysis, today]);
  const winLoss = useMemo(() => computeWinLoss(analysis), [analysis]);
  const stale = useMemo(() => staleDeals(analysis, today), [analysis, today]);
  const weighted = useMemo(
    () => computeWeightedPipelineValue(deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost')),
    [deals],
  );

  if (loading) return <p className="text-muted-foreground">Loading…</p>;

  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <Trophy className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">No deals to analyse yet</p>
        <p className="text-sm text-muted-foreground">Add deals in the Deals tab and the analytics fill in automatically.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Win rate</div>
          <div className="text-2xl font-bold tabular-nums">{winLoss.winRatePct.toFixed(0)}%</div>
          <p className="text-xs text-muted-foreground">{winLoss.won} won · {winLoss.lost} lost</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Weighted pipeline</div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(weighted, cur)}</div>
          <p className="text-xs text-muted-foreground">expected value of open deals</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Average time to close</div>
          <div className="text-2xl font-bold tabular-nums">{winLoss.avgDaysToClose.toFixed(0)}d</div>
          <p className="text-xs text-muted-foreground">on deals you won</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Going stale</div>
          <div className={cn('text-2xl font-bold tabular-nums', stale.length > 0 && 'text-warning')}>{stale.length}</div>
          <p className="text-xs text-muted-foreground">no movement in 14+ days</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Where deals drop out</h3>
          <div className="space-y-3">
            {conversions.map((c) => (
              <div key={`${c.from}-${c.to}`}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="capitalize">{c.from} → {c.to}</span>
                  <span className="tabular-nums text-muted-foreground">{c.advanced}/{c.entered} · {c.conversionPct.toFixed(0)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className={cn('h-full rounded-full', c.conversionPct < 30 ? 'bg-destructive' : c.conversionPct < 60 ? 'bg-warning' : 'bg-success')}
                    style={{ width: `${Math.min(100, c.conversionPct)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            The weakest hop is where to focus — improving your worst conversion beats adding more leads at the top.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Clock className="h-4 w-4" /> How long deals sit</h3>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground"><tr className="text-left">
              <th className="py-1.5 font-medium">Stage</th>
              <th className="py-1.5 font-medium text-right">Deals</th>
              <th className="py-1.5 font-medium text-right">Value</th>
              <th className="py-1.5 font-medium text-right">Avg days</th>
              <th className="py-1.5 font-medium text-right">Oldest</th>
            </tr></thead>
            <tbody>
              {aging.map((a) => (
                <tr key={a.stage} className="border-t border-border">
                  <td className="py-1.5 capitalize">{a.stage}</td>
                  <td className="py-1.5 text-right tabular-nums">{a.count}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCurrency(a.totalValue, cur, true)}</td>
                  <td className="py-1.5 text-right tabular-nums">{a.avgDaysInStage.toFixed(0)}</td>
                  <td className={cn('py-1.5 text-right tabular-nums', a.oldestDays > 30 && 'text-warning font-medium')}>{a.oldestDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {winLoss.topLossReasons.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><TrendingDown className="h-4 w-4" /> Why you lose</h3>
          <div className="space-y-1.5">
            {winLoss.topLossReasons.map((r) => (
              <div key={r.reason} className="flex items-center justify-between text-sm">
                <span className={cn(r.reason === 'Not recorded' && 'text-muted-foreground italic')}>{r.reason}</span>
                <span className="tabular-nums text-muted-foreground">{r.count} deal{r.count === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Lost {formatCurrency(winLoss.lostValue, cur)} against {formatCurrency(winLoss.wonValue, cur)} won.
            Unrecorded reasons are the ones you can't learn from — capture them when closing a deal.
          </p>
        </div>
      )}
    </div>
  );
}
