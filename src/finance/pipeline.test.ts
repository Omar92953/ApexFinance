import { describe, it, expect } from 'vitest';
import { computeStageConversions, computeStageAging, computeWinLoss, staleDeals, type DealForAnalysis } from './pipeline';

const TODAY = '2026-08-15';
const ORDER = ['lead', 'qualified', 'proposal', 'won'];

const deal = (over: Partial<DealForAnalysis>): DealForAnalysis => ({
  id: 'd1', title: 'Deal', value: 1000, stage: 'lead',
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-08-14T00:00:00Z', ...over,
});

describe('computeStageConversions', () => {
  it('counts a deal as having passed through every earlier stage', () => {
    const conv = computeStageConversions([deal({ id: 'a', stage: 'proposal' })], ORDER);
    expect(conv.find((c) => c.from === 'lead')!.advanced).toBe(1);
    expect(conv.find((c) => c.from === 'qualified')!.advanced).toBe(1);
    expect(conv.find((c) => c.from === 'proposal')!.advanced).toBe(0);
  });

  it('computes a conversion percentage per hop', () => {
    const conv = computeStageConversions([
      deal({ id: 'a', stage: 'qualified' }),
      deal({ id: 'b', stage: 'qualified' }),
      deal({ id: 'c', stage: 'lead' }),
      deal({ id: 'd', stage: 'lead' }),
    ], ORDER);
    expect(conv.find((c) => c.from === 'lead')!.conversionPct).toBe(50);
  });

  it('counts lost deals as entered but never advanced', () => {
    const conv = computeStageConversions([deal({ id: 'a', stage: 'lost' })], ORDER);
    expect(conv.find((c) => c.from === 'lead')!.entered).toBe(1);
    expect(conv.find((c) => c.from === 'lead')!.advanced).toBe(0);
  });

  it('does not divide by zero on an empty pipeline', () => {
    expect(computeStageConversions([], ORDER).every((c) => c.conversionPct === 0)).toBe(true);
  });
});

describe('computeStageAging', () => {
  it('reports count, value and age per stage', () => {
    const aging = computeStageAging([
      deal({ id: 'a', stage: 'lead', value: 100, updated_at: '2026-08-05T00:00:00Z' }),
      deal({ id: 'b', stage: 'lead', value: 300, updated_at: '2026-08-13T00:00:00Z' }),
    ], TODAY, ORDER);
    const lead = aging.find((a) => a.stage === 'lead')!;
    expect(lead.count).toBe(2);
    expect(lead.totalValue).toBe(400);
    expect(lead.avgDaysInStage).toBe(6);   // (10 + 2) / 2
    expect(lead.oldestDays).toBe(10);
  });

  it('returns zeroes for empty stages rather than omitting them', () => {
    const aging = computeStageAging([], TODAY, ORDER);
    expect(aging).toHaveLength(ORDER.length);
    expect(aging.every((a) => a.count === 0 && a.avgDaysInStage === 0)).toBe(true);
  });
});

describe('computeWinLoss', () => {
  const deals = [
    deal({ id: 'w1', stage: 'won', value: 1000, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-21T00:00:00Z' }),
    deal({ id: 'w2', stage: 'won', value: 2000, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-11T00:00:00Z' }),
    deal({ id: 'l1', stage: 'lost', value: 500, win_loss_reason: 'Price' }),
    deal({ id: 'l2', stage: 'lost', value: 800, win_loss_reason: 'Price' }),
    deal({ id: 'o1', stage: 'proposal', value: 999 }),
  ];

  it('computes win rate over closed deals only', () => {
    const s = computeWinLoss(deals);
    expect(s.won).toBe(2);
    expect(s.lost).toBe(2);
    expect(s.winRatePct).toBe(50);
  });

  it('totals won and lost value separately', () => {
    const s = computeWinLoss(deals);
    expect(s.wonValue).toBe(3000);
    expect(s.lostValue).toBe(1300);
  });

  it('averages the cycle time of won deals', () => {
    expect(computeWinLoss(deals).avgDaysToClose).toBe(15);   // (20 + 10) / 2
  });

  it('ranks loss reasons and labels missing ones', () => {
    const s = computeWinLoss([...deals, deal({ id: 'l3', stage: 'lost' })]);
    expect(s.topLossReasons[0]).toEqual({ reason: 'Price', count: 2 });
    expect(s.topLossReasons.some((r) => r.reason === 'Not recorded')).toBe(true);
  });

  it('handles a pipeline with nothing closed yet', () => {
    const s = computeWinLoss([deal({ stage: 'lead' })]);
    expect(s.winRatePct).toBe(0);
    expect(s.avgDaysToClose).toBe(0);
  });
});

describe('staleDeals', () => {
  it('finds open deals with no movement past the threshold', () => {
    const stale = staleDeals([
      deal({ id: 'old', stage: 'proposal', updated_at: '2026-07-01T00:00:00Z' }),
      deal({ id: 'fresh', stage: 'proposal', updated_at: '2026-08-14T00:00:00Z' }),
    ], TODAY);
    expect(stale.map((d) => d.id)).toEqual(['old']);
  });

  it('never flags closed deals', () => {
    const stale = staleDeals([
      deal({ id: 'w', stage: 'won', updated_at: '2020-01-01T00:00:00Z' }),
      deal({ id: 'l', stage: 'lost', updated_at: '2020-01-01T00:00:00Z' }),
    ], TODAY);
    expect(stale).toEqual([]);
  });
});
