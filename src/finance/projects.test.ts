import { describe, it, expect } from 'vitest';
import {
  computeProjectEconomics, computeBudgetBurn, classifyProjectHealth, computeUnbilledValue,
  type TimeEntryLike,
} from './projects';

const entry = (over: Partial<TimeEntryLike>): TimeEntryLike => ({
  hours: 1, is_billable: true, billRate: 100, costRate: 40, ...over,
});

describe('computeProjectEconomics', () => {
  it('returns zeros for a project with no time logged', () => {
    const e = computeProjectEconomics([]);
    expect(e).toMatchObject({ hoursTotal: 0, billableValue: 0, laborCost: 0, margin: 0, marginPct: 0, utilizationPct: 0 });
  });

  it('values billable hours at the bill rate and costs every hour', () => {
    const e = computeProjectEconomics([entry({ hours: 10 })]);
    expect(e.billableValue).toBe(1000);
    expect(e.laborCost).toBe(400);
    expect(e.margin).toBe(600);
    expect(e.marginPct).toBe(60);
  });

  it('still charges labour cost for non-billable hours — the key service-business trap', () => {
    const e = computeProjectEconomics([entry({ hours: 10 }), entry({ hours: 10, is_billable: false })]);
    expect(e.billableValue).toBe(1000);   // unchanged
    expect(e.laborCost).toBe(800);        // both blocks of hours cost money
    expect(e.margin).toBe(200);
    expect(e.utilizationPct).toBe(50);
  });

  it('reports the effective rate across all hours worked, not just billable ones', () => {
    const e = computeProjectEconomics([entry({ hours: 5 }), entry({ hours: 5, is_billable: false })]);
    expect(e.effectiveHourlyRate).toBe(50);   // 500 billed / 10 hours worked
  });

  it('can report a negative margin when the work costs more than it bills', () => {
    const e = computeProjectEconomics([entry({ hours: 10, billRate: 30, costRate: 50 })]);
    expect(e.margin).toBe(-200);
    expect(e.marginPct).toBeCloseTo(-66.67, 1);
  });

  it('handles a project with only non-billable time without dividing by zero', () => {
    const e = computeProjectEconomics([entry({ hours: 8, is_billable: false })]);
    expect(e.marginPct).toBe(0);
    expect(e.utilizationPct).toBe(0);
    expect(e.margin).toBe(-320);
  });
});

describe('computeBudgetBurn', () => {
  it('is the share of the fee already consumed by labour', () => {
    expect(computeBudgetBurn(1000, 250)).toBe(0.25);
    expect(computeBudgetBurn(1000, 1500)).toBe(1.5);
  });

  it('returns 0 rather than dividing by zero when there is no budget', () => {
    expect(computeBudgetBurn(0, 500)).toBe(0);
  });
});

describe('classifyProjectHealth', () => {
  it('flags fixed-price work over budget once labour exceeds the fee', () => {
    expect(classifyProjectHealth('fixed', 1000, null, { laborCost: 1200, hoursTotal: 30 })).toBe('over_budget');
  });

  it('warns before the fee is fully consumed', () => {
    expect(classifyProjectHealth('fixed', 1000, null, { laborCost: 850, hoursTotal: 20 })).toBe('at_risk');
    expect(classifyProjectHealth('fixed', 1000, null, { laborCost: 400, hoursTotal: 10 })).toBe('healthy');
  });

  it('judges hourly work on its hours cap, not on money', () => {
    expect(classifyProjectHealth('hourly', 0, 100, { laborCost: 99999, hoursTotal: 120 })).toBe('over_budget');
    expect(classifyProjectHealth('hourly', 0, 100, { laborCost: 10, hoursTotal: 50 })).toBe('healthy');
  });

  it('says so when there is nothing to measure against', () => {
    expect(classifyProjectHealth('hourly', 0, null, { laborCost: 500, hoursTotal: 20 })).toBe('no_budget');
    expect(classifyProjectHealth('fixed', 0, null, { laborCost: 500, hoursTotal: 20 })).toBe('no_budget');
  });

  it('treats retainers like fixed-fee work', () => {
    expect(classifyProjectHealth('retainer', 5000, null, { laborCost: 6000, hoursTotal: 100 })).toBe('over_budget');
  });
});

describe('computeUnbilledValue', () => {
  it('counts only billable hours that have not been invoiced', () => {
    const value = computeUnbilledValue([
      { ...entry({ hours: 10 }), invoiced_on: null },
      { ...entry({ hours: 10 }), invoiced_on: 'inv-1' },      // already billed
      { ...entry({ hours: 10, is_billable: false }), invoiced_on: null },  // never billable
    ]);
    expect(value).toBe(1000);
  });

  it('is zero when everything has been invoiced', () => {
    expect(computeUnbilledValue([{ ...entry({ hours: 5 }), invoiced_on: 'inv-1' }])).toBe(0);
  });
});
