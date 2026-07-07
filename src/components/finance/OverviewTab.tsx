import { TrendingUp, DollarSign, Target, Users, ShoppingCart, Wallet } from 'lucide-react';
import type { ProfitCalculation } from '@/finance/profit-engine';
import type { Business } from '@/services/db';
import KpiCard from '@/components/shared/KpiCard';
import { formatCurrency, formatNumber } from '@/lib/utils';

export default function OverviewTab({ profit, business }: { profit: ProfitCalculation | null; business: Business }) {
  const cur = business.currency ?? 'USD';
  if (!profit) return <p className="text-muted-foreground">Computing…</p>;

  const aov = profit.orders > 0 ? profit.netSales / profit.orders : 0;
  const ltvCac = profit.cac > 0 ? profit.ltv / profit.cac : 0;
  const roasTone = profit.roas >= profit.breakevenRoas ? 'positive' : 'negative';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Net Profit" value={formatCurrency(profit.netProfit, cur)} sub={`${profit.profitMargin.toFixed(1)}% margin`} tone={profit.netProfit >= 0 ? 'positive' : 'negative'} icon={<TrendingUp className="h-4 w-4" />} delay={0} />
        <KpiCard label="Your Profit" value={formatCurrency(profit.userProfit, cur)} sub={business.profit_model.replace(/_/g, ' ')} tone="positive" icon={<Wallet className="h-4 w-4" />} delay={40} />
        <KpiCard label="Net Revenue" value={formatCurrency(profit.netSales, cur)} sub={`Gross ${formatCurrency(profit.grossSales, cur)}`} icon={<DollarSign className="h-4 w-4" />} delay={80} />
        <KpiCard label="Total Ad Spend" value={formatCurrency(profit.totalAdSpend, cur)} sub={`Meta ${formatCurrency(profit.metaSpend, cur)}`} icon={<Target className="h-4 w-4" />} delay={120} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="ROAS" value={`${profit.roas.toFixed(2)}x`} sub={`Break-even ${profit.breakevenRoas.toFixed(2)}x`} tone={roasTone} delay={160} />
        <KpiCard label="CAC" value={formatCurrency(profit.cac, cur, true)} sub="Cost per customer" delay={200} />
        <KpiCard label="LTV : CAC" value={`${ltvCac.toFixed(2)}x`} sub={ltvCac >= 3 ? 'Healthy' : 'Below target'} tone={ltvCac >= 3 ? 'positive' : 'warning'} icon={<Users className="h-4 w-4" />} delay={240} />
        <KpiCard label="Orders / AOV" value={formatNumber(profit.orders)} sub={`AOV ${formatCurrency(aov, cur)}`} icon={<ShoppingCart className="h-4 w-4" />} delay={280} />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Profit waterfall</h3>
        <div className="space-y-1.5 text-sm">
          <Row label="Net revenue" value={formatCurrency(profit.netSales, cur)} />
          <Row label="− COGS (products)" value={formatCurrency(profit.cogsTotal, cur)} muted />
          <Row label="− Shipping" value={formatCurrency(profit.shippingCost, cur)} muted />
          <Row label="− Ad spend" value={formatCurrency(profit.totalAdSpend, cur)} muted />
          <Row label="− Per-order costs" value={formatCurrency(profit.perOrderCosts, cur)} muted />
          <Row label="− Per-product costs" value={formatCurrency(profit.perProductCosts, cur)} muted />
          <Row label="− Fixed costs" value={formatCurrency(profit.fixedCosts, cur)} muted />
          <div className="border-t border-border my-2" />
          <Row label="Net profit" value={formatCurrency(profit.netProfit, cur)} bold tone={profit.netProfit >= 0 ? 'positive' : 'negative'} />
          <Row label="Your cut" value={formatCurrency(profit.userProfit, cur)} bold tone="positive" />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted, bold, tone }: { label: string; value: string; muted?: boolean; bold?: boolean; tone?: 'positive' | 'negative' }) {
  const toneClass = tone === 'positive' ? 'text-success' : tone === 'negative' ? 'text-destructive' : '';
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${toneClass}`}>{value}</span>
    </div>
  );
}
