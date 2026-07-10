import { describe, it, expect } from 'vitest';
import { classifyRfmSegment, computeWeightedPipelineValue, computeStageFunnel } from './rfm';

const ASOF = '2026-07-01';
const daysAgo = (n: number) => new Date(new Date(ASOF).getTime() - n * 86400000).toISOString().slice(0, 10);

describe('classifyRfmSegment', () => {
  it('flags a contact with no orders as none', () => {
    expect(classifyRfmSegment({ ordersCount: 0, lastOrderDate: null, asOf: ASOF })).toBe('none');
  });

  it('flags a frequent, recent buyer as a champion', () => {
    expect(classifyRfmSegment({ ordersCount: 4, lastOrderDate: daysAgo(10), asOf: ASOF })).toBe('champion');
  });

  it('flags a moderate, fairly recent buyer as loyal', () => {
    expect(classifyRfmSegment({ ordersCount: 2, lastOrderDate: daysAgo(90), asOf: ASOF })).toBe('loyal');
  });

  it('flags a first-time recent buyer as promising', () => {
    expect(classifyRfmSegment({ ordersCount: 1, lastOrderDate: daysAgo(5), asOf: ASOF })).toBe('promising');
  });

  it('flags a previously-frequent buyer who has gone quiet as at risk', () => {
    expect(classifyRfmSegment({ ordersCount: 3, lastOrderDate: daysAgo(150), asOf: ASOF })).toBe('at_risk');
  });

  it('flags anyone who has not ordered in over 180 days as lost, regardless of past frequency', () => {
    expect(classifyRfmSegment({ ordersCount: 10, lastOrderDate: daysAgo(200), asOf: ASOF })).toBe('lost');
  });

  it('flags a single old order as at risk (not promising, not lost)', () => {
    expect(classifyRfmSegment({ ordersCount: 1, lastOrderDate: daysAgo(100), asOf: ASOF })).toBe('at_risk');
  });
});

describe('computeWeightedPipelineValue', () => {
  it('weights each deal by its stage', () => {
    const total = computeWeightedPipelineValue([
      { stage: 'lead', value: 1000 },      // 0.1 -> 100
      { stage: 'proposal', value: 2000 },  // 0.6 -> 1200
      { stage: 'won', value: 500 },        // 1.0 -> 500
      { stage: 'lost', value: 999 },       // 0 -> 0
    ]);
    expect(total).toBe(1800);
  });
});

describe('computeStageFunnel', () => {
  it('counts deals at or past each stage in the funnel', () => {
    const funnel = computeStageFunnel([
      { stage: 'lead', value: 0 }, { stage: 'qualified', value: 0 },
      { stage: 'proposal', value: 0 }, { stage: 'won', value: 0 },
    ], ['lead', 'qualified', 'proposal', 'won']);
    expect(funnel.map((f) => f.count)).toEqual([4, 3, 2, 1]);
    expect(funnel[0].pct).toBe(100);
    expect(funnel[3].pct).toBe(25);
  });

  it('returns all zeros for an empty pipeline', () => {
    const funnel = computeStageFunnel([], ['lead', 'won']);
    expect(funnel.every((f) => f.count === 0 && f.pct === 0)).toBe(true);
  });
});
