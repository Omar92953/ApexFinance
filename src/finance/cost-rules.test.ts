import { describe, it, expect } from 'vitest';
import { computeCostRules, dateOverlapDays, computeBudgetVariance, type CostRule } from './cost-rules';

function rule(overrides: Partial<CostRule> = {}): CostRule {
  return {
    id: 'r1', name: 'Test rule', category: 'overhead', basis: 'fixed_monthly', value: 3000,
    scope_type: 'none', scope_id: null, effective_from: '2026-01-01', effective_to: null, is_active: true,
    ...overrides,
  };
}

const ctx = { periodStart: '2026-06-01', periodEnd: '2026-06-30', orders: 100, units: 250, revenue: 50000 };

describe('dateOverlapDays', () => {
  it('returns full period length when the rule covers it entirely', () => {
    expect(dateOverlapDays('2026-01-01', null, '2026-06-01', '2026-06-30')).toBe(30);
  });
  it('returns 0 when the rule starts after the period ends', () => {
    expect(dateOverlapDays('2026-07-01', null, '2026-06-01', '2026-06-30')).toBe(0);
  });
  it('returns 0 when the rule ended before the period starts', () => {
    expect(dateOverlapDays('2026-01-01', '2026-05-31', '2026-06-01', '2026-06-30')).toBe(0);
  });
  it('prorates a rule that starts mid-period', () => {
    // starts June 16 -> 15 days remain in a 30-day June period (16..30 inclusive)
    expect(dateOverlapDays('2026-06-16', null, '2026-06-01', '2026-06-30')).toBe(15);
  });
});

describe('computeCostRules — allocation bases', () => {
  it('per_unit multiplies by total units', () => {
    const r = computeCostRules([rule({ basis: 'per_unit', value: 3 })], ctx);
    expect(r.total).toBe(3 * ctx.units);
  });

  it('per_order multiplies by order count', () => {
    const r = computeCostRules([rule({ basis: 'per_order', value: 10 })], ctx);
    expect(r.total).toBe(10 * ctx.orders);
  });

  it('percent_of_revenue applies the percentage to net revenue', () => {
    const r = computeCostRules([rule({ basis: 'percent_of_revenue', value: 1.5 })], ctx);
    expect(r.total).toBeCloseTo(50000 * 0.015);
  });

  it('fixed_monthly prorates by days/30 for a full 30-day period', () => {
    const r = computeCostRules([rule({ basis: 'fixed_monthly', value: 3000 })], ctx);
    expect(r.total).toBe(3000); // 30-day June period == 1 full month
  });

  it('fixed_weekly prorates by days/7', () => {
    const r = computeCostRules([rule({ basis: 'fixed_weekly', value: 700 })], ctx);
    expect(r.total).toBe((700 / 7) * 30);
  });

  it('fixed_daily multiplies by overlap days', () => {
    const r = computeCostRules([rule({ basis: 'fixed_daily', value: 100 })], ctx);
    expect(r.total).toBe(100 * 30);
  });
});

describe('computeCostRules — scoping, activity, and dates', () => {
  it('excludes inactive rules entirely', () => {
    const r = computeCostRules([rule({ is_active: false, basis: 'per_unit', value: 999 })], ctx);
    expect(r.total).toBe(0);
    expect(r.results).toHaveLength(0);
  });

  it('excludes rules whose effective window does not overlap the period', () => {
    const r = computeCostRules([rule({ effective_from: '2027-01-01' })], ctx);
    expect(r.total).toBe(0);
  });

  it('a product-scoped per_unit rule only applies that variant\'s units, not the total', () => {
    const r = computeCostRules(
      [rule({ basis: 'per_unit', value: 5, scope_type: 'product', scope_id: 'variant-A' })],
      { ...ctx, unitsByVariant: { 'variant-A': 40, 'variant-B': 210 } },
    );
    expect(r.total).toBe(5 * 40); // not 5 * 250
  });

  it('a product-scoped rule with no matching unit data contributes 0, not the global total', () => {
    const r = computeCostRules(
      [rule({ basis: 'per_unit', value: 5, scope_type: 'product', scope_id: 'variant-Z' })],
      { ...ctx, unitsByVariant: { 'variant-A': 40 } },
    );
    expect(r.total).toBe(0);
  });

  it('sums multiple rules into per-category totals correctly', () => {
    const r = computeCostRules([
      rule({ id: 'a', category: 'fulfillment', basis: 'per_order', value: 20 }),
      rule({ id: 'b', category: 'fulfillment', basis: 'per_unit', value: 2 }),
      rule({ id: 'c', category: 'marketing', basis: 'fixed_monthly', value: 1000 }),
    ], ctx);
    expect(r.totalsByCategory.fulfillment).toBe(20 * 100 + 2 * 250);
    expect(r.totalsByCategory.marketing).toBeCloseTo(1000);
    expect(r.totalsByCategory.overhead).toBe(0);
    expect(r.total).toBeCloseTo(r.totalsByCategory.fulfillment + r.totalsByCategory.marketing);
  });
});

describe('computeBudgetVariance', () => {
  it('flags over-budget with a positive variance percentage', () => {
    const v = computeBudgetVariance(1000, 1250);
    expect(v.variance).toBe(250);
    expect(v.variancePct).toBe(25);
    expect(v.overBudget).toBe(true);
  });

  it('does not flag under-budget spend', () => {
    const v = computeBudgetVariance(1000, 800);
    expect(v.overBudget).toBe(false);
    expect(v.variancePct).toBe(-20);
  });

  it('handles a zero budget without dividing by zero', () => {
    const v = computeBudgetVariance(0, 500);
    expect(v.variancePct).toBe(0);
    expect(v.overBudget).toBe(false);
  });
});
