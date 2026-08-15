import { describe, it, expect } from 'vitest';
import { evaluateBudget, evaluateBudgets, budgetTotals, checkSpendApproval, allocateBudget } from './budget';

describe('evaluateBudget', () => {
  it('counts commitments as consumed, not just actual spend', () => {
    const r = evaluateBudget({ category: 'marketing', budget: 1000, spent: 300, committed: 400 });
    expect(r.consumed).toBe(700);
    expect(r.remaining).toBe(300);
    expect(r.usedPct).toBe(70);
    expect(r.status).toBe('under');
  });

  it('warns before the budget is fully gone', () => {
    expect(evaluateBudget({ category: 'x', budget: 1000, spent: 850, committed: 0 }).status).toBe('tight');
    expect(evaluateBudget({ category: 'x', budget: 1000, spent: 500, committed: 400 }).status).toBe('tight');
  });

  it('goes over on commitments alone, before any bill arrives', () => {
    const r = evaluateBudget({ category: 'x', budget: 1000, spent: 0, committed: 1200 });
    expect(r.status).toBe('over');
    expect(r.remaining).toBe(-200);
  });

  it('says so when no budget was set rather than reporting 0% used', () => {
    const r = evaluateBudget({ category: 'x', budget: 0, spent: 500, committed: 0 });
    expect(r.status).toBe('no_budget');
    expect(r.usedPct).toBe(0);
  });
});

describe('evaluateBudgets / budgetTotals', () => {
  const lines = [
    { category: 'a', budget: 1000, spent: 200, committed: 0 },
    { category: 'b', budget: 1000, spent: 900, committed: 300 },
    { category: 'c', budget: 500, spent: 100, committed: 0 },
  ];

  it('sorts the most consumed first so trouble is at the top', () => {
    expect(evaluateBudgets(lines).map((r) => r.category)).toEqual(['b', 'a', 'c']);
  });

  it('totals across categories and counts the over-budget ones', () => {
    const t = budgetTotals(evaluateBudgets(lines));
    expect(t.budget).toBe(2500);
    expect(t.spent).toBe(1200);
    expect(t.committed).toBe(300);
    expect(t.remaining).toBe(1000);
    expect(t.overCount).toBe(1);
  });
});

describe('checkSpendApproval', () => {
  const line = evaluateBudget({ category: 'marketing', budget: 1000, spent: 600, committed: 0, approvalLimit: 500 });

  it('requires approval above the per-transaction limit', () => {
    const check = checkSpendApproval(800, line);
    expect(check.requiresApproval).toBe(true);
    expect(check.reason).toContain('approval limit');
  });

  it('requires approval when the spend would break the budget', () => {
    const noLimit = evaluateBudget({ category: 'marketing', budget: 1000, spent: 900, committed: 0 });
    const check = checkSpendApproval(200, noLimit);
    expect(check.requiresApproval).toBe(true);
    expect(check.reason).toContain('exceed');
  });

  it('waves through spend inside both gates', () => {
    expect(checkSpendApproval(100, line).requiresApproval).toBe(false);
  });

  it('never hard-blocks — a business sometimes must overspend, just not by accident', () => {
    expect(checkSpendApproval(999_999, line).allowed).toBe(true);
  });

  it('handles a category with no budget line at all', () => {
    expect(checkSpendApproval(100, null).requiresApproval).toBe(false);
  });
});

describe('allocateBudget', () => {
  it('splits by weight', () => {
    const out = allocateBudget(1000, [
      { category: 'a', weight: 1 },
      { category: 'b', weight: 1 },
    ]);
    expect(out).toEqual([{ category: 'a', amount: 500 }, { category: 'b', amount: 500 }]);
  });

  it('always sums exactly to the total despite rounding', () => {
    const out = allocateBudget(1000, [
      { category: 'a', weight: 1 },
      { category: 'b', weight: 1 },
      { category: 'c', weight: 1 },
    ]);
    expect(out.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(1000, 2);
  });

  it('returns zeroes for a zero total or zero weights instead of NaN', () => {
    expect(allocateBudget(0, [{ category: 'a', weight: 1 }])).toEqual([{ category: 'a', amount: 0 }]);
    expect(allocateBudget(500, [{ category: 'a', weight: 0 }])).toEqual([{ category: 'a', amount: 0 }]);
  });

  it('ignores negative weights rather than producing negative budgets', () => {
    const out = allocateBudget(600, [
      { category: 'a', weight: 2 },
      { category: 'b', weight: -5 },
    ]);
    expect(out.find((r) => r.category === 'b')!.amount).toBe(0);
    expect(out.find((r) => r.category === 'a')!.amount).toBeCloseTo(600, 2);
  });
});
