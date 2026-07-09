import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, TrendingUp, TrendingDown } from 'lucide-react';
import type { Business, CostRuleRow, CostBudgetRow } from '@/services/db';
import { costRulesApi, costBudgetsApi } from '@/services/db';
import { computeCostRules, computeBudgetVariance, COST_CATEGORIES, type CostCategory, type CostRuleContext } from '@/finance/cost-rules';
import { buildCostRuleContext, computeMonthlyCostTrend, computeBusinessProfit, type MonthlyCostPoint } from '@/finance/compute';
import type { ProfitCalculation } from '@/finance/profit-engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatCurrency } from '@/lib/utils';
import ShippingZonesCard from './ShippingZonesCard';
import CostRuleDialog from './CostRuleDialog';
import CostTrendChart from './CostTrendChart';

const CATEGORY_LABEL: Record<CostCategory, string> = {
  cogs: 'COGS', fulfillment: 'Fulfillment', marketing: 'Marketing', overhead: 'Overhead', fees: 'Fees',
};
const CATEGORY_HINT: Record<CostCategory, string> = {
  cogs: 'Extra product cost not already covered by a variant\'s unit cost',
  fulfillment: 'Packaging, courier, warehouse handling',
  marketing: 'Influencers, SMS, promo — ad spend itself is tracked separately',
  overhead: 'Rent, salaries, software, utilities',
  fees: 'Payment gateway, COD handling, platform fees',
};

function monthRange(offsetMonths = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const end = offsetMonths === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), key: start.toISOString().slice(0, 7) };
}

export default function CostsTab({ business, start, end, onChanged }: { business: Business; start: string; end: string; onChanged: () => void }) {
  const cur = business.currency ?? 'EGP';
  const [rules, setRules] = useState<CostRuleRow[]>([]);
  const [ctx, setCtx] = useState<CostRuleContext | null>(null);
  const [budgets, setBudgets] = useState<CostBudgetRow[]>([]);
  const [trend, setTrend] = useState<MonthlyCostPoint[]>([]);
  const [baseline, setBaseline] = useState<ProfitCalculation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CostRuleRow | null>(null);
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [adSpendPct, setAdSpendPct] = useState(0);
  const [cogsPct, setCogsPct] = useState(0);
  const [rulesPct, setRulesPct] = useState(0);

  const thisMonth = useMemo(() => monthRange(0), []);

  const load = async () => {
    const [r, c, b, t, base] = await Promise.all([
      costRulesApi.list(business.id),
      buildCostRuleContext(business, start, end),
      costBudgetsApi.list(business.id, thisMonth.key),
      computeMonthlyCostTrend(business, 6),
      computeBusinessProfit(business, start, end),
    ]);
    setRules(r); setCtx(c); setBudgets(b); setTrend(t); setBaseline(base);
  };
  useEffect(() => { load(); }, [business.id, start, end]);

  const breakdown = useMemo(() => (ctx ? computeCostRules(rules, ctx) : null), [rules, ctx]);

  // This-month breakdown, independent of the page's selected range, for budget tracking.
  const [monthCtx, setMonthCtx] = useState<CostRuleContext | null>(null);
  useEffect(() => { buildCostRuleContext(business, thisMonth.start, thisMonth.end).then(setMonthCtx); }, [business.id]);
  const monthBreakdown = useMemo(() => (monthCtx ? computeCostRules(rules, monthCtx) : null), [rules, monthCtx]);

  const openAdd = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (r: CostRuleRow) => { setEditing(r); setDialogOpen(true); };
  const removeRule = async (id: string) => { if (confirm('Delete this cost rule?')) { await costRulesApi.remove(id); load(); onChanged(); } };
  const toggleActive = async (r: CostRuleRow) => { await costRulesApi.update(r.id, { is_active: !r.is_active }); load(); onChanged(); };

  const saveBudget = async (category: CostCategory) => {
    const draft = budgetDrafts[category];
    if (draft === undefined) return;
    await costBudgetsApi.save(business.id, category, thisMonth.key, parseFloat(draft) || 0);
    setBudgetDrafts((d) => { const n = { ...d }; delete n[category]; return n; });
    const b = await costBudgetsApi.list(business.id, thisMonth.key);
    setBudgets(b);
  };
  const budgetFor = (category: CostCategory) => budgets.find((b) => b.category === category)?.budget_amount ?? 0;

  // What-If Simulator — projects net profit from the selected period's actuals.
  const projected = useMemo(() => {
    if (!baseline) return null;
    const adSpendDelta = baseline.totalAdSpend * (adSpendPct / 100);
    const cogsDelta = baseline.cogsTotal * (cogsPct / 100);
    const rulesDelta = baseline.costRulesTotal * (rulesPct / 100);
    const netProfit = baseline.netProfit - adSpendDelta - cogsDelta - rulesDelta;
    const margin = baseline.netSales > 0 ? (netProfit / baseline.netSales) * 100 : 0;
    return { netProfit, margin, delta: netProfit - baseline.netProfit };
  }, [baseline, adSpendPct, cogsPct, rulesPct]);

  return (
    <div className="space-y-5">
      <ShippingZonesCard business={business} onChanged={onChanged} />

      {/* Cost Rules Explorer */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Cost Explorer</h3>
          <p className="text-xs text-muted-foreground">Every rule, grouped by category, with its real impact for the selected period.</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1.5" /> New rule</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {COST_CATEGORIES.map((cat) => {
          const items = rules.filter((r) => r.category === cat);
          const total = breakdown?.totalsByCategory[cat] ?? 0;
          return (
            <div key={cat} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold">{CATEGORY_LABEL[cat]}</h4>
                <span className="text-sm font-bold tabular-nums">{formatCurrency(total, cur)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{CATEGORY_HINT[cat]}</p>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No rules yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {items.map((r) => {
                    const result = breakdown?.results.find((x) => x.ruleId === r.id);
                    return (
                      <div key={r.id} className={cn('flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5 text-xs', !r.is_active && 'opacity-50')}>
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-muted-foreground">
                            {r.value} {r.basis.replace(/_/g, ' ')}{r.scope_type === 'product' ? ' · scoped' : ''}
                            {' · from '}{r.effective_from}{r.effective_to ? ` to ${r.effective_to}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="tabular-nums font-medium">{formatCurrency(result?.amount ?? 0, cur, true)}</span>
                          <button onClick={() => toggleActive(r)} className="text-muted-foreground hover:text-foreground" title={r.is_active ? 'Deactivate' : 'Activate'}>{r.is_active ? '●' : '○'}</button>
                          <button onClick={() => openEdit(r)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                          <button onClick={() => removeRule(r.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Budget vs Actual */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-1">Budget vs actual — {thisMonth.key}</h3>
        <p className="text-xs text-muted-foreground mb-4">Set a monthly budget per category; see variance against this month's rules so far.</p>
        <div className="space-y-2">
          {COST_CATEGORIES.map((cat) => {
            const budget = budgetFor(cat);
            const actual = monthBreakdown?.totalsByCategory[cat] ?? 0;
            const v = computeBudgetVariance(budget, actual);
            return (
              <div key={cat} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="w-28 font-medium">{CATEGORY_LABEL[cat]}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Budget</span>
                  <Input
                    type="number" step="any" className="h-8 w-28"
                    value={budgetDrafts[cat] ?? budget}
                    onChange={(e) => setBudgetDrafts((d) => ({ ...d, [cat]: e.target.value }))}
                    onBlur={() => saveBudget(cat)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">Actual <b className="text-foreground">{formatCurrency(actual, cur, true)}</b></span>
                {budget > 0 && (
                  <span className={cn('ml-auto inline-flex items-center gap-1 text-xs font-medium', v.overBudget ? 'text-destructive' : 'text-success')}>
                    {v.overBudget ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {v.variancePct >= 0 ? '+' : ''}{v.variancePct.toFixed(0)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cost trend */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Cost trend — last 6 months</h3>
        <CostTrendChart data={trend} currency={cur} />
      </div>

      {/* What-If Simulator */}
      {baseline && projected && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-1">What-if simulator</h3>
          <p className="text-xs text-muted-foreground mb-4">Nudge the big levers and see the projected impact on this period's net profit — nothing here is saved.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <SimSlider label="Ad spend" value={adSpendPct} onChange={setAdSpendPct} />
            <SimSlider label="COGS" value={cogsPct} onChange={setCogsPct} />
            <SimSlider label="Other cost rules" value={rulesPct} onChange={setRulesPct} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-6 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div><span className="text-muted-foreground">Current net profit </span><b className="tabular-nums">{formatCurrency(baseline.netProfit, cur)}</b></div>
            <div>
              <span className="text-muted-foreground">Projected </span>
              <b className={cn('tabular-nums', projected.delta >= 0 ? 'text-success' : 'text-destructive')}>{formatCurrency(projected.netProfit, cur)}</b>
              <span className={cn('ml-1.5 text-xs', projected.delta >= 0 ? 'text-success' : 'text-destructive')}>({projected.delta >= 0 ? '+' : ''}{formatCurrency(projected.delta, cur, true)})</span>
            </div>
            <div><span className="text-muted-foreground">Projected margin </span><b className="tabular-nums">{projected.margin.toFixed(1)}%</b></div>
          </div>
        </div>
      )}

      <CostRuleDialog business={business} editing={editing} open={dialogOpen} onOpenChange={setDialogOpen} onSaved={() => { load(); onChanged(); }} />
    </div>
  );
}

function SimSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium">{label}</span>
        <span className={cn('tabular-nums', value > 0 ? 'text-destructive' : value < 0 ? 'text-success' : 'text-muted-foreground')}>{value > 0 ? '+' : ''}{value}%</span>
      </div>
      <input type="range" min={-50} max={100} step={5} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="w-full accent-primary" />
    </div>
  );
}
