import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { COST_CATEGORIES, type CostCategory } from '@/finance/cost-rules';
import type { MonthlyCostPoint } from '@/finance/compute';
import { formatCurrency } from '@/lib/utils';

const CATEGORY_COLOR: Record<CostCategory, string> = {
  cogs: 'hsl(var(--chart-1))',
  fulfillment: 'hsl(var(--chart-2))',
  marketing: 'hsl(var(--chart-3))',
  overhead: 'hsl(var(--chart-4))',
  fees: 'hsl(var(--chart-5))',
};

const CATEGORY_LABEL: Record<CostCategory, string> = {
  cogs: 'COGS', fulfillment: 'Fulfillment', marketing: 'Marketing', overhead: 'Overhead', fees: 'Fees',
};

export default function CostTrendChart({ data, currency }: { data: MonthlyCostPoint[]; currency: string }) {
  const hasData = data.some((d) => COST_CATEGORIES.some((c) => (d[c] || 0) > 0));
  if (!hasData) return <p className="text-sm text-muted-foreground">No cost history yet — add rules and let time pass to see the trend.</p>;

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => formatCurrency(v, currency).replace(/\.\d+/, '')} width={70} />
          <Tooltip
            formatter={(value: number, name: string) => [formatCurrency(value, currency, true), CATEGORY_LABEL[name as CostCategory] ?? name]}
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
          />
          <Legend formatter={(name) => CATEGORY_LABEL[name as CostCategory] ?? name} wrapperStyle={{ fontSize: 12 }} />
          {COST_CATEGORIES.map((cat) => (
            <Bar key={cat} dataKey={cat} stackId="cost" fill={CATEGORY_COLOR[cat]} radius={cat === 'fees' ? [3, 3, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
