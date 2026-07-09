import { useEffect, useMemo, useState } from 'react';
import type { Business, Product, ProductVariant, CostRuleRow } from '@/services/db';
import { productsApi, costRulesApi } from '@/services/db';
import { computeCostRules, dateOverlapDays, type CostRuleContext } from '@/finance/cost-rules';
import { buildCostRuleContext } from '@/finance/compute';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function UnitEconomicsTab({ business, start, end }: { business: Business; start: string; end: string }) {
  const cur = business.currency ?? 'EGP';
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [rules, setRules] = useState<CostRuleRow[]>([]);
  const [ctx, setCtx] = useState<CostRuleContext | null>(null);

  useEffect(() => {
    Promise.all([
      productsApi.listProducts(business.id),
      productsApi.listVariants(business.id),
      costRulesApi.list(business.id),
      buildCostRuleContext(business, start, end),
    ]).then(([p, v, r, c]) => { setProducts(p); setVariants(v); setRules(r); setCtx(c); });
  }, [business.id, start, end]);

  const productTitle = useMemo(() => new Map(products.map((p) => [p.id, p.title])), [products]);

  // Business-wide fixed-basis rules for the period (used for the simplified
  // break-even estimate — assumes each product alone had to cover them).
  const totalFixedCosts = useMemo(() => {
    if (!ctx) return 0;
    return rules
      .filter((r) => r.is_active && ['fixed_daily', 'fixed_weekly', 'fixed_monthly'].includes(r.basis))
      .reduce((sum, r) => {
        const days = dateOverlapDays(r.effective_from, r.effective_to, ctx.periodStart, ctx.periodEnd);
        if (days <= 0) return sum;
        const perDay = r.basis === 'fixed_daily' ? r.value : r.basis === 'fixed_weekly' ? r.value / 7 : r.value / 30;
        return sum + perDay * days;
      }, 0);
  }, [rules, ctx]);

  const rows = useMemo(() => {
    if (!ctx) return [];
    return variants.map((v) => {
      const price = Number(v.price) || 0;
      const cogsPerUnit = Number(v.cost_per_item) || 0;

      const perUnitRules = rules.filter((r) =>
        r.is_active && r.basis === 'per_unit' &&
        (r.scope_type === 'none' || (r.scope_type === 'product' && r.scope_id === v.id)) &&
        dateOverlapDays(r.effective_from, r.effective_to, ctx.periodStart, ctx.periodEnd) > 0,
      );
      const otherPerUnitCost = perUnitRules.reduce((s, r) => s + (Number(r.value) || 0), 0);

      const totalUnitCost = cogsPerUnit + otherPerUnitCost;
      const contributionMargin = price - totalUnitCost;
      const contributionPct = price > 0 ? (contributionMargin / price) * 100 : 0;
      const breakEvenUnits = contributionMargin > 0 ? Math.ceil(totalFixedCosts / contributionMargin) : null;

      return { variant: v, price, cogsPerUnit, otherPerUnitCost, totalUnitCost, contributionMargin, contributionPct, breakEvenUnits };
    });
  }, [variants, rules, ctx, totalFixedCosts]);

  if (!ctx) return <p className="text-muted-foreground">Computing…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Contribution margin = price − COGS − per-unit cost rules that apply to this product. Break-even units is a
        simplified estimate: total business fixed costs for the period (<b>{formatCurrency(totalFixedCosts, cur)}</b>)
        ÷ this product's contribution margin — as if it alone had to cover them.
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No products yet — add some in the Products tab.</p>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium text-right">Price</th>
                  <th className="px-4 py-2.5 font-medium text-right">COGS</th>
                  <th className="px-4 py-2.5 font-medium text-right">Other / unit</th>
                  <th className="px-4 py-2.5 font-medium text-right">Contribution / unit</th>
                  <th className="px-4 py-2.5 font-medium text-right">Contribution %</th>
                  <th className="px-4 py-2.5 font-medium text-right">Break-even units</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ variant: v, price, cogsPerUnit, otherPerUnitCost, contributionMargin, contributionPct, breakEvenUnits }) => (
                  <tr key={v.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{productTitle.get(v.product_id) || '—'}{v.title && v.title !== 'Default' ? ` · ${v.title}` : ''}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(price, cur, true)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(cogsPerUnit, cur, true)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(otherPerUnitCost, cur, true)}</td>
                    <td className={cn('px-4 py-2 text-right tabular-nums font-medium', contributionMargin < 0 ? 'text-destructive' : 'text-success')}>{formatCurrency(contributionMargin, cur, true)}</td>
                    <td className={cn('px-4 py-2 text-right tabular-nums', contributionPct < 0 ? 'text-destructive' : contributionPct >= 40 ? 'text-success' : '')}>{contributionPct.toFixed(0)}%</td>
                    <td className="px-4 py-2 text-right tabular-nums">{breakEvenUnits === null ? '—' : breakEvenUnits.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
