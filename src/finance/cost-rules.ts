// Cost Rules Engine — replaces the flat per-order/per-product/fixed cost model
// with category + allocation-basis + scope + effective-dates rules, so costs
// like "COD fee = 1.5% of revenue" or "packaging = 3 EGP/unit on Product X" can
// finally be expressed and prorated correctly across a date range.

export type CostCategory = 'cogs' | 'fulfillment' | 'marketing' | 'overhead' | 'fees';

export type AllocationBasis =
  | 'per_unit'
  | 'per_order'
  | 'percent_of_revenue'
  | 'fixed_daily'
  | 'fixed_weekly'
  | 'fixed_monthly';

export const COST_CATEGORIES: CostCategory[] = ['cogs', 'fulfillment', 'marketing', 'overhead', 'fees'];

export interface CostRule {
  id: string;
  name: string;
  category: CostCategory;
  basis: AllocationBasis;
  value: number;
  scope_type: 'none' | 'product';
  scope_id: string | null; // variant id when scope_type === 'product'
  effective_from: string;  // 'YYYY-MM-DD'
  effective_to: string | null; // null = ongoing
  is_active: boolean;
}

export interface CostRuleContext {
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string;
  orders: number;
  units: number;              // total units sold in the period (unscoped per_unit rules)
  revenue: number;             // net revenue basis for percent_of_revenue rules
  unitsByVariant?: Record<string, number>; // variant id -> units sold, for scoped per_unit rules
}

export interface CostRuleResult {
  ruleId: string;
  name: string;
  category: CostCategory;
  amount: number;
  overlapDays: number; // how many days of the period this rule was actually active
}

export interface CostRuleBreakdown {
  results: CostRuleResult[];
  totalsByCategory: Record<CostCategory, number>;
  total: number;
}

// Inclusive day-overlap between a rule's effective window and the period.
// Returns 0 when there's no overlap (rule not yet started, or already ended).
export function dateOverlapDays(ruleFrom: string, ruleTo: string | null, periodStart: string, periodEnd: string): number {
  const from = Math.max(new Date(ruleFrom).getTime(), new Date(periodStart).getTime());
  const to = Math.min(ruleTo ? new Date(ruleTo).getTime() : Infinity, new Date(periodEnd).getTime());
  if (to < from) return 0;
  return Math.floor((to - from) / 86400000) + 1;
}

export function computeCostRules(rules: CostRule[], ctx: CostRuleContext): CostRuleBreakdown {
  const results: CostRuleResult[] = [];

  for (const rule of rules) {
    if (!rule.is_active) continue;
    const overlapDays = dateOverlapDays(rule.effective_from, rule.effective_to, ctx.periodStart, ctx.periodEnd);
    if (overlapDays <= 0) continue;

    const scopedUnits = rule.scope_type === 'product' && rule.scope_id
      ? (ctx.unitsByVariant?.[rule.scope_id] ?? 0)
      : ctx.units;

    let amount = 0;
    switch (rule.basis) {
      case 'per_unit':
        amount = rule.value * scopedUnits;
        break;
      case 'per_order':
        amount = rule.value * ctx.orders;
        break;
      case 'percent_of_revenue':
        amount = ctx.revenue * (rule.value / 100);
        break;
      case 'fixed_daily':
        amount = rule.value * overlapDays;
        break;
      case 'fixed_weekly':
        amount = (rule.value / 7) * overlapDays;
        break;
      case 'fixed_monthly':
        amount = (rule.value / 30) * overlapDays;
        break;
    }

    results.push({ ruleId: rule.id, name: rule.name, category: rule.category, amount, overlapDays });
  }

  const totalsByCategory = COST_CATEGORIES.reduce((acc, cat) => { acc[cat] = 0; return acc; }, {} as Record<CostCategory, number>);
  let total = 0;
  for (const r of results) {
    totalsByCategory[r.category] += r.amount;
    total += r.amount;
  }

  return { results, totalsByCategory, total };
}

// Budget vs actual variance. Positive variancePct = over budget.
export interface BudgetVariance {
  budget: number;
  actual: number;
  variance: number;
  variancePct: number; // (actual - budget) / budget * 100; 0 when budget is 0
  overBudget: boolean;
}

export function computeBudgetVariance(budget: number, actual: number): BudgetVariance {
  const variance = actual - budget;
  const variancePct = budget !== 0 ? (variance / budget) * 100 : 0;
  return { budget, actual, variance, variancePct, overBudget: variance > 0 && budget > 0 };
}
