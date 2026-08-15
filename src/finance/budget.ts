// Budget allocation with commitments.
//
// A budget that only counts money already paid tells you the truth too late.
// The moment a purchase order is approved, that money is effectively gone —
// "committed" — even though no bill has arrived. Counting commitments is what
// makes "remaining" mean remaining, and it's the difference between a budget
// that prevents overspend and one that merely reports it.

export interface BudgetLine {
  category: string;
  budget: number;
  spent: number;        // actual, already incurred
  committed: number;    // approved but not yet billed
  approvalLimit?: number | null;
}

export type BudgetStatus = 'under' | 'tight' | 'over' | 'no_budget';

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  under: 'Within budget',
  tight: 'Running tight',
  over: 'Over budget',
  no_budget: 'No budget set',
};

export const TIGHT_THRESHOLD = 0.85;

export interface BudgetLineResult extends BudgetLine {
  consumed: number;      // spent + committed
  remaining: number;
  usedPct: number;
  status: BudgetStatus;
}

export function evaluateBudget(line: BudgetLine): BudgetLineResult {
  const consumed = (Number(line.spent) || 0) + (Number(line.committed) || 0);
  const budget = Number(line.budget) || 0;
  const remaining = budget - consumed;
  const usedPct = budget > 0 ? (consumed / budget) * 100 : 0;

  let status: BudgetStatus;
  if (budget <= 0) status = 'no_budget';
  else if (consumed > budget) status = 'over';
  else if (consumed >= budget * TIGHT_THRESHOLD) status = 'tight';
  else status = 'under';

  return { ...line, consumed, remaining, usedPct, status };
}

export function evaluateBudgets(lines: BudgetLine[]): BudgetLineResult[] {
  return lines.map(evaluateBudget).sort((a, b) => b.usedPct - a.usedPct);
}

export interface BudgetTotals {
  budget: number;
  spent: number;
  committed: number;
  remaining: number;
  overCount: number;
}

export function budgetTotals(results: BudgetLineResult[]): BudgetTotals {
  return results.reduce<BudgetTotals>((acc, r) => ({
    budget: acc.budget + (Number(r.budget) || 0),
    spent: acc.spent + (Number(r.spent) || 0),
    committed: acc.committed + (Number(r.committed) || 0),
    remaining: acc.remaining + r.remaining,
    overCount: acc.overCount + (r.status === 'over' ? 1 : 0),
  }), { budget: 0, spent: 0, committed: 0, remaining: 0, overCount: 0 });
}

// --- Approval gate -----------------------------------------------------------
export interface ApprovalCheck {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
}

// Two independent gates: a per-transaction ceiling (from the governance policy)
// and whether the spend would break the category budget. Either can force an
// approval; neither silently blocks, because a business sometimes genuinely
// needs to overspend — it just shouldn't happen by accident.
export function checkSpendApproval(amount: number, line: BudgetLineResult | null): ApprovalCheck {
  const limit = line?.approvalLimit ?? null;

  if (limit !== null && limit > 0 && amount > limit) {
    return {
      allowed: true,
      requiresApproval: true,
      reason: `Above the ${limit.toFixed(0)} approval limit for ${line?.category ?? 'this category'}.`,
    };
  }

  if (line && line.budget > 0 && line.consumed + amount > line.budget) {
    const over = line.consumed + amount - line.budget;
    return {
      allowed: true,
      requiresApproval: true,
      reason: `Would exceed the ${line.category} budget by ${over.toFixed(0)}.`,
    };
  }

  return { allowed: true, requiresApproval: false, reason: 'Within budget and limits.' };
}

// --- Allocation --------------------------------------------------------------
// Splits a total envelope across categories by weight, giving any rounding
// remainder to the largest share so the parts always sum exactly to the total.
export function allocateBudget(total: number, weights: Array<{ category: string; weight: number }>): Array<{ category: string; amount: number }> {
  const totalWeight = weights.reduce((s, w) => s + Math.max(0, w.weight), 0);
  if (totalWeight <= 0 || total <= 0) return weights.map((w) => ({ category: w.category, amount: 0 }));

  const raw = weights.map((w) => ({
    category: w.category,
    exact: (Math.max(0, w.weight) / totalWeight) * total,
  }));

  const rounded = raw.map((r) => ({ category: r.category, amount: Math.floor(r.exact * 100) / 100 }));
  const assigned = rounded.reduce((s, r) => s + r.amount, 0);
  const remainder = Math.round((total - assigned) * 100) / 100;

  if (remainder !== 0 && rounded.length > 0) {
    const largest = raw.reduce((a, b) => (a.exact >= b.exact ? a : b));
    const target = rounded.find((r) => r.category === largest.category)!;
    target.amount = Math.round((target.amount + remainder) * 100) / 100;
  }
  return rounded;
}
