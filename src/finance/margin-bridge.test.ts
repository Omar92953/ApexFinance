import { describe, it, expect } from 'vitest';
import { computeMarginBridge, rankContribution, topContributors, lossMakers, type PeriodSnapshot } from './margin-bridge';

const snap = (over: Partial<PeriodSnapshot>): PeriodSnapshot => ({
  units: 100, revenue: 10_000, cogs: 4_000, adSpend: 2_000, otherCosts: 1_000, ...over,
});

describe('computeMarginBridge', () => {
  it('reports no change when nothing moved', () => {
    const b = computeMarginBridge(snap({}), snap({}));
    expect(b.change).toBe(0);
    expect(b.steps.every((s) => Math.abs(s.amount) < 0.01)).toBe(true);
  });

  it('always reconciles: the steps sum to the actual profit change', () => {
    const cases: Array<[PeriodSnapshot, PeriodSnapshot]> = [
      [snap({}), snap({ units: 150, revenue: 14_000, cogs: 6_300 })],
      [snap({}), snap({ revenue: 8_000, adSpend: 3_500 })],
      [snap({ units: 80, revenue: 9_000 }), snap({ units: 120, revenue: 11_000, cogs: 5_400, otherCosts: 2_000 })],
    ];
    for (const [from, to] of cases) {
      const b = computeMarginBridge(from, to);
      const summed = b.steps.reduce((s, x) => s + x.amount, 0);
      expect(summed).toBeCloseTo(b.change, 2);
      expect(b.toProfit - b.fromProfit).toBeCloseTo(b.change, 2);
    }
  });

  it('attributes a pure volume increase to volume alone', () => {
    // Same price (100) and unit cost (40), 50 more units -> +3000 contribution.
    const b = computeMarginBridge(snap({}), snap({ units: 150, revenue: 15_000, cogs: 6_000 }));
    const volume = b.steps.find((s) => s.key === 'volume')!;
    expect(volume.amount).toBeCloseTo(3_000, 2);
    expect(b.steps.find((s) => s.key === 'price')!.amount).toBeCloseTo(0, 2);
    expect(b.steps.find((s) => s.key === 'cost')!.amount).toBeCloseTo(0, 2);
  });

  it('flags a price cut as a negative price effect', () => {
    // Same 100 units, revenue down to 9000 -> price fell by 10/unit.
    const b = computeMarginBridge(snap({}), snap({ revenue: 9_000 }));
    expect(b.steps.find((s) => s.key === 'price')!.amount).toBeCloseTo(-1_000, 2);
  });

  it('treats rising unit cost as a negative and falling cost as a positive', () => {
    const worse = computeMarginBridge(snap({}), snap({ cogs: 5_000 }));
    expect(worse.steps.find((s) => s.key === 'cost')!.amount).toBeCloseTo(-1_000, 2);
    const better = computeMarginBridge(snap({}), snap({ cogs: 3_000 }));
    expect(better.steps.find((s) => s.key === 'cost')!.amount).toBeCloseTo(1_000, 2);
  });

  it('shows extra ad spend as a drag on profit', () => {
    const b = computeMarginBridge(snap({}), snap({ adSpend: 3_000 }));
    expect(b.steps.find((s) => s.key === 'ads')!.amount).toBe(-1_000);
  });

  it('survives a period with zero units without dividing by zero', () => {
    const b = computeMarginBridge(snap({ units: 0, revenue: 0, cogs: 0 }), snap({}));
    expect(Number.isFinite(b.change)).toBe(true);
    expect(b.steps.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(b.change, 2);
  });
});

describe('rankContribution', () => {
  const rows = [
    { key: 'a', label: 'A', revenue: 1_000, cost: 400 },   // 600
    { key: 'b', label: 'B', revenue: 5_000, cost: 4_900 }, // 100 — big revenue, thin margin
    { key: 'c', label: 'C', revenue: 300, cost: 500 },     // -200 loss maker
  ];

  it('ranks by contribution, not revenue', () => {
    const ranked = rankContribution(rows);
    expect(ranked.map((r) => r.key)).toEqual(['a', 'b', 'c']);
  });

  it('computes margin percentage per row', () => {
    const ranked = rankContribution(rows);
    expect(ranked.find((r) => r.key === 'a')!.marginPct).toBe(60);
    expect(ranked.find((r) => r.key === 'b')!.marginPct).toBeCloseTo(2, 1);
  });

  it('shares out only positive contribution', () => {
    const ranked = rankContribution(rows);
    const positives = ranked.filter((r) => r.contribution > 0);
    expect(positives.reduce((s, r) => s + r.sharePct, 0)).toBeCloseTo(100, 1);
    expect(ranked.find((r) => r.key === 'c')!.sharePct).toBe(0);
  });

  it('handles an empty set and zero-revenue rows', () => {
    expect(rankContribution([])).toEqual([]);
    const zero = rankContribution([{ key: 'z', label: 'Z', revenue: 0, cost: 0 }]);
    expect(zero[0].marginPct).toBe(0);
  });
});

describe('topContributors / lossMakers', () => {
  const ranked = rankContribution([
    { key: 'a', label: 'A', revenue: 1_000, cost: 200 },  // 800
    { key: 'b', label: 'B', revenue: 500, cost: 350 },    // 150
    { key: 'c', label: 'C', revenue: 200, cost: 150 },    // 50
    { key: 'd', label: 'D', revenue: 100, cost: 300 },    // -200
  ]);

  it('returns the smallest set covering the requested share', () => {
    const top = topContributors(ranked, 80);
    expect(top.map((r) => r.key)).toEqual(['a']);   // A alone is 80% of positive contribution
  });

  it('stops before loss makers', () => {
    expect(topContributors(ranked, 100).every((r) => r.contribution > 0)).toBe(true);
  });

  it('isolates the lines that lose money', () => {
    expect(lossMakers(ranked).map((r) => r.key)).toEqual(['d']);
  });
});
