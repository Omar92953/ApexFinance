import { describe, it, expect } from 'vitest';
import {
  monthlyCost, annualCost, totalMonthlySpend, assessWaste, totalWaste,
  upcomingRenewals, realisedSavings, duplicateCategories, type Subscription,
} from './subscriptions';

const TODAY = '2026-08-15';

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1', name: 'Tool', amount: 100, cycle: 'monthly', ...over,
});

describe('cost normalisation', () => {
  it('converts every cycle to a comparable monthly figure', () => {
    expect(monthlyCost(sub({ amount: 120, cycle: 'monthly' }))).toBe(120);
    expect(monthlyCost(sub({ amount: 300, cycle: 'quarterly' }))).toBe(100);
    expect(monthlyCost(sub({ amount: 1200, cycle: 'annual' }))).toBe(100);
  });

  it('annualises consistently', () => {
    expect(annualCost(sub({ amount: 1200, cycle: 'annual' }))).toBe(1200);
    expect(annualCost(sub({ amount: 100, cycle: 'monthly' }))).toBe(1200);
  });

  it('excludes cancelled subscriptions from ongoing spend', () => {
    const total = totalMonthlySpend([sub({ id: 'a' }), sub({ id: 'b', decision: 'cancel' })]);
    expect(total).toBe(100);
  });
});

describe('assessWaste', () => {
  it('flags a tool nobody has touched in months', () => {
    const w = assessWaste(sub({ lastUsedOn: '2026-05-01' }), TODAY);
    expect(w.reason).toBe('stale');
    expect(w.wastedMonthly).toBe(100);
  });

  it('flags seats paid for but unoccupied', () => {
    const w = assessWaste(sub({ seats: 5, activeSeats: 0 }), TODAY);
    expect(w.reason).toBe('unused');
    expect(w.wastedMonthly).toBe(100);
  });

  it('prices partial waste on idle seats only', () => {
    const w = assessWaste(sub({ amount: 500, seats: 10, activeSeats: 3 }), TODAY);
    expect(w.reason).toBe('underused');
    expect(w.wastedMonthly).toBe(350);   // 7 idle seats of 10, at 50/seat
  });

  it('leaves a well-used tool alone', () => {
    const w = assessWaste(sub({ seats: 10, activeSeats: 9, lastUsedOn: '2026-08-14' }), TODAY);
    expect(w.reason).toBeNull();
    expect(w.wastedMonthly).toBe(0);
  });

  it('stays quiet when there is no usage evidence either way', () => {
    expect(assessWaste(sub({}), TODAY).reason).toBeNull();
  });

  it('totals waste across the estate, ignoring already-cancelled tools', () => {
    const total = totalWaste([
      sub({ id: 'a', seats: 4, activeSeats: 0 }),
      sub({ id: 'b', seats: 4, activeSeats: 0, decision: 'cancel' }),
    ], TODAY);
    expect(total).toBe(100);
  });
});

describe('upcomingRenewals', () => {
  it('surfaces renewals inside the lead window, soonest first', () => {
    const out = upcomingRenewals([
      sub({ id: 'far', renewsOn: '2026-12-01' }),
      sub({ id: 'soon', renewsOn: '2026-08-20' }),
      sub({ id: 'sooner', renewsOn: '2026-08-16' }),
    ], TODAY);
    expect(out.map((r) => r.subscription.id)).toEqual(['sooner', 'soon']);
  });

  it('marks a renewal with no decision as needing one — the silent auto-renew', () => {
    const out = upcomingRenewals([sub({ renewsOn: '2026-08-20' })], TODAY);
    expect(out[0].needsDecision).toBe(true);
    const decided = upcomingRenewals([sub({ renewsOn: '2026-08-20', decision: 'keep' })], TODAY);
    expect(decided[0].needsDecision).toBe(false);
  });

  it('includes an already-passed renewal date rather than hiding it', () => {
    const out = upcomingRenewals([sub({ renewsOn: '2026-08-10' })], TODAY);
    expect(out[0].daysUntil).toBe(-5);
  });

  it('ignores cancelled subscriptions and ones with no renewal date', () => {
    expect(upcomingRenewals([
      sub({ id: 'a', renewsOn: '2026-08-20', decision: 'cancel' }),
      sub({ id: 'b' }),
    ], TODAY)).toEqual([]);
  });
});

describe('realisedSavings', () => {
  it('counts the annual value of what has been cancelled', () => {
    const saved = realisedSavings([
      sub({ id: 'a', amount: 100, cycle: 'monthly', decision: 'cancel' }),
      sub({ id: 'b', amount: 100, cycle: 'monthly', decision: 'keep' }),
    ]);
    expect(saved).toBe(1200);
  });
});

describe('duplicateCategories', () => {
  it('spots two live tools doing the same job', () => {
    const dupes = duplicateCategories([
      sub({ id: 'a', category: 'Email' }),
      sub({ id: 'b', category: 'email' }),   // case-insensitive
      sub({ id: 'c', category: 'Design' }),
    ]);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].subs.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('does not count a cancelled tool as a duplicate', () => {
    expect(duplicateCategories([
      sub({ id: 'a', category: 'Email' }),
      sub({ id: 'b', category: 'Email', decision: 'cancel' }),
    ])).toEqual([]);
  });
});
