import { describe, it, expect } from 'vitest';
import { computeCashFlowForecast, weeksUntilNegative } from './forecast';

describe('computeCashFlowForecast', () => {
  it('produces the requested number of weeks', () => {
    const rows = computeCashFlowForecast({ startingBalance: 1000, avgDailyNetInflow: 100, weeklyFixedCosts: 200 }, 13);
    expect(rows).toHaveLength(13);
    expect(rows[0].week).toBe(1);
    expect(rows[12].week).toBe(13);
  });

  it('compounds balance correctly week over week', () => {
    // net inflow 100/day * 7 = 700/week, minus 200 fixed = +500/week
    const rows = computeCashFlowForecast({ startingBalance: 1000, avgDailyNetInflow: 100, weeklyFixedCosts: 200 }, 3);
    expect(rows[0].balance).toBe(1500);
    expect(rows[1].balance).toBe(2000);
    expect(rows[2].balance).toBe(2500);
  });

  it('projects a declining balance when fixed costs exceed inflow', () => {
    const rows = computeCashFlowForecast({ startingBalance: 1000, avgDailyNetInflow: 10, weeklyFixedCosts: 500 }, 3);
    // 10*7=70 - 500 = -430/week
    expect(rows[0].netChange).toBe(-430);
    expect(rows[2].balance).toBeLessThan(rows[0].balance);
  });
});

describe('weeksUntilNegative', () => {
  it('returns null when the balance never dips below zero', () => {
    const rows = computeCashFlowForecast({ startingBalance: 1000, avgDailyNetInflow: 100, weeklyFixedCosts: 100 }, 13);
    expect(weeksUntilNegative(rows)).toBeNull();
  });

  it('finds the first week the balance goes negative', () => {
    const rows = computeCashFlowForecast({ startingBalance: 500, avgDailyNetInflow: 0, weeklyFixedCosts: 200 }, 13);
    // 500 -> 300 -> 100 -> -100 (week 3)
    expect(weeksUntilNegative(rows)).toBe(3);
  });
});
