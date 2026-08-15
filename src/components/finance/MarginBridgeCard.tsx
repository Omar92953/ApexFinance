import { useEffect, useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import type { Business } from '@/services/db';
import { computeBusinessProfit } from '@/finance/compute';
import { computeMarginBridge, type MarginBridge } from '@/finance/margin-bridge';
import { formatCurrency, cn } from '@/lib/utils';

// Answers "why did profit move?" by comparing the selected period against the
// one immediately before it, of the same length.
export default function MarginBridgeCard({ business, start, end }: { business: Business; start: string; end: string }) {
  const cur = business.currency ?? 'EGP';
  const [bridge, setBridge] = useState<MarginBridge | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const lengthMs = new Date(end).getTime() - new Date(start).getTime();
        const prevEnd = new Date(new Date(start).getTime() - 86_400_000).toISOString().slice(0, 10);
        const prevStart = new Date(new Date(prevEnd).getTime() - lengthMs).toISOString().slice(0, 10);

        const [prev, curr] = await Promise.all([
          computeBusinessProfit(business, prevStart, prevEnd),
          computeBusinessProfit(business, start, end),
        ]);
        if (cancelled) return;

        // Orders stand in for units: it's the volume measure the profit engine
        // reports for every business type, product-based or not.
        const toSnapshot = (c: Awaited<ReturnType<typeof computeBusinessProfit>>) => ({
          units: c.orders || 0,
          revenue: c.netSales,
          cogs: c.cogsTotal,
          adSpend: c.totalAdSpend,
          otherCosts: c.netSales - c.cogsTotal - c.totalAdSpend - c.netProfit,
        });
        setBridge(computeMarginBridge(toSnapshot(prev), toSnapshot(curr)));
      } catch {
        if (!cancelled) setBridge(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [business.id, start, end]);

  if (loading || !bridge) return null;

  const maxAbs = Math.max(...bridge.steps.map((s) => Math.abs(s.amount)), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
        <GitCompareArrows className="h-4 w-4" /> Why profit moved
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Against the previous period of equal length: {formatCurrency(bridge.fromProfit, cur)} →{' '}
        {formatCurrency(bridge.toProfit, cur)}{' '}
        <span className={cn('font-medium', bridge.change >= 0 ? 'text-success' : 'text-destructive')}>
          ({bridge.change >= 0 ? '+' : ''}{formatCurrency(bridge.change, cur)})
        </span>
      </p>

      <div className="space-y-2">
        {bridge.steps.map((s) => (
          <div key={s.key}>
            <div className="flex justify-between text-xs">
              <span>{s.label}</span>
              <span className={cn('tabular-nums font-medium', s.amount >= 0 ? 'text-success' : 'text-destructive')}>
                {s.amount >= 0 ? '+' : ''}{formatCurrency(s.amount, cur, true)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="relative h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn('absolute top-0 h-full rounded-full', s.amount >= 0 ? 'bg-success' : 'bg-destructive')}
                  style={{
                    width: `${(Math.abs(s.amount) / maxAbs) * 50}%`,
                    left: s.amount >= 0 ? '50%' : undefined,
                    right: s.amount < 0 ? '50%' : undefined,
                  }}
                />
                <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">{s.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
