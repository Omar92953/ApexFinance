import { describe, it, expect } from 'vitest';
import {
  buildSignals, rankSignals, signalScore, totalAtStake,
  receivableSignals, payableSignals, inventorySignals, cashSignals,
  budgetSignals, pipelineSignals, followUpSignals,
  type Signal,
} from './signals';

const TODAY = '2026-08-14';

const sig = (over: Partial<Signal>): Signal => ({
  id: 'x', severity: 'info', domain: 'cash', title: 't', why: 'w',
  impactEgp: 0, suggestedAction: 'a', entity: null, ...over,
});

describe('ranking', () => {
  it('puts a higher severity above a lower one when money is equal', () => {
    const ranked = rankSignals([sig({ id: 'a', severity: 'warning' }), sig({ id: 'b', severity: 'critical' })]);
    expect(ranked.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('lets a large-enough warning outrank a zero-impact critical — money at stake wins', () => {
    const ranked = rankSignals([
      sig({ id: 'tiny-critical', severity: 'critical', impactEgp: 0 }),
      sig({ id: 'big-warning', severity: 'warning', impactEgp: 500_000 }),
    ]);
    expect(ranked[0].id).toBe('big-warning');
  });

  it('sorts by impact within the same severity', () => {
    const ranked = rankSignals([
      sig({ id: 'small', severity: 'warning', impactEgp: 100 }),
      sig({ id: 'large', severity: 'warning', impactEgp: 9_000 }),
    ]);
    expect(ranked.map((s) => s.id)).toEqual(['large', 'small']);
  });

  it('ignores negative impact when scoring', () => {
    expect(signalScore(sig({ severity: 'info', impactEgp: -500 }))).toBe(0);
  });
});

describe('receivableSignals', () => {
  const base = { amount: 1000, amount_paid: 0, status: 'unpaid', payment_method: 'prepaid', invoice_date: '2026-07-01' };

  it('flags an overdue prepaid invoice as warning, and critical past 30 days', () => {
    const warn = receivableSignals([{ id: 'i1', ...base, due_date: '2026-08-01' }], TODAY);
    expect(warn).toHaveLength(1);
    expect(warn[0].severity).toBe('warning');
    expect(warn[0].impactEgp).toBe(1000);

    const crit = receivableSignals([{ id: 'i2', ...base, due_date: '2026-06-01' }], TODAY);
    expect(crit[0].severity).toBe('critical');
  });

  it('ignores paid and fully-settled invoices', () => {
    expect(receivableSignals([{ id: 'i3', ...base, status: 'paid', due_date: '2026-06-01' }], TODAY)).toEqual([]);
    expect(receivableSignals([{ id: 'i4', ...base, amount_paid: 1000, due_date: '2026-06-01' }], TODAY)).toEqual([]);
  });

  it('ignores an invoice that is not yet due', () => {
    expect(receivableSignals([{ id: 'i5', ...base, due_date: '2026-09-01' }], TODAY)).toEqual([]);
  });

  it('flags COD by age since invoice date, not due date', () => {
    const out = receivableSignals([{ id: 'c1', ...base, payment_method: 'cod', invoice_date: '2026-07-20', due_date: null }], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('cod-outstanding:c1');
  });

  it('leaves a recent COD order alone', () => {
    const out = receivableSignals([{ id: 'c2', ...base, payment_method: 'cod', invoice_date: '2026-08-12', due_date: null }], TODAY);
    expect(out).toEqual([]);
  });
});

describe('payableSignals', () => {
  const base = { amount: 5000, amount_paid: 0, status: 'unpaid' };

  it('marks an overdue supplier bill critical', () => {
    const out = payableSignals([{ id: 'b1', ...base, due_date: '2026-08-01' }], TODAY);
    expect(out[0].severity).toBe('critical');
    expect(out[0].impactEgp).toBe(5000);
  });

  it('gives an early heads-up for a bill due within a week', () => {
    const out = payableSignals([{ id: 'b2', ...base, due_date: '2026-08-18' }], TODAY);
    expect(out[0].id).toBe('bill-due-soon:b2');
    expect(out[0].severity).toBe('info');
  });

  it('stays quiet for a bill due far out, or with no due date', () => {
    expect(payableSignals([{ id: 'b3', ...base, due_date: '2026-10-01' }], TODAY)).toEqual([]);
    expect(payableSignals([{ id: 'b4', ...base, due_date: null }], TODAY)).toEqual([]);
  });
});

describe('inventorySignals', () => {
  const base = { id: 'v1', sku: 'SKU1', title: 'Widget', price: 100, cost_per_item: 60, inventory_qty: 100, avgDailyUnits: 1 };

  it('flags out of stock only when the product actually sells', () => {
    expect(inventorySignals([{ ...base, inventory_qty: 0 }])[0].id).toBe('out-of-stock:v1');
    expect(inventorySignals([{ ...base, inventory_qty: 0, avgDailyUnits: 0 }])).toEqual([]);
  });

  it('flags low stock below the cover threshold', () => {
    const out = inventorySignals([{ ...base, inventory_qty: 3, avgDailyUnits: 1 }]);
    expect(out[0].id).toBe('low-stock:v1');
    expect(out[0].severity).toBe('warning');
  });

  it('does not flag healthy stock', () => {
    expect(inventorySignals([{ ...base, inventory_qty: 60, avgDailyUnits: 1 }])).toEqual([]);
  });

  it('flags a product selling below cost as critical', () => {
    const out = inventorySignals([{ ...base, price: 50, cost_per_item: 80 }]);
    expect(out.some((s) => s.id === 'negative-margin:v1' && s.severity === 'critical')).toBe(true);
  });
});

describe('cashSignals', () => {
  it('reports the first week the balance goes negative', () => {
    const out = cashSignals([{ week: 1, balance: 500 }, { week: 2, balance: -200 }, { week: 3, balance: -900 }]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('cash-runway:week-2');
    expect(out[0].severity).toBe('critical');
  });

  it('is a warning rather than critical when the breach is further out', () => {
    const weeks = Array.from({ length: 9 }, (_, i) => ({ week: i + 1, balance: i < 7 ? 100 : -50 }));
    expect(cashSignals(weeks)[0].severity).toBe('warning');
  });

  it('stays silent when cash never breaches the floor', () => {
    expect(cashSignals([{ week: 1, balance: 100 }])).toEqual([]);
  });
});

describe('budgetSignals', () => {
  it('flags only categories that exceed their budget', () => {
    const out = budgetSignals([
      { category: 'marketing', budget_amount: 1000, actual: 1500 },
      { category: 'overhead', budget_amount: 1000, actual: 400 },
      { category: 'fees', budget_amount: 0, actual: 300 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].impactEgp).toBe(500);
  });
});

describe('pipelineSignals', () => {
  it('flags a deal idle past the stale threshold', () => {
    const out = pipelineSignals([{ id: 'd1', title: 'Big order', value: 20000, stage: 'proposal', updated_at: '2026-07-20T00:00:00Z' }], TODAY);
    expect(out[0].id).toBe('stale-deal:d1');
    expect(out[0].impactEgp).toBe(20000);
  });

  it('ignores won and lost deals entirely', () => {
    const deals = [
      { id: 'd2', title: 'W', value: 1, stage: 'won', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'd3', title: 'L', value: 1, stage: 'lost', updated_at: '2026-01-01T00:00:00Z' },
    ];
    expect(pipelineSignals(deals, TODAY)).toEqual([]);
  });

  it('notes a deal past its expected close date', () => {
    const out = pipelineSignals([{ id: 'd4', title: 'Late', value: 100, stage: 'lead', updated_at: TODAY + 'T00:00:00Z', expected_close: '2026-08-01' }], TODAY);
    expect(out.some((s) => s.id === 'deal-past-close:d4')).toBe(true);
  });
});

describe('followUpSignals', () => {
  it('flags due and overdue follow-ups only', () => {
    const out = followUpSignals([
      { id: 'c1', first_name: 'Ali', follow_up_date: '2026-08-10' },
      { id: 'c2', first_name: 'Sara', follow_up_date: TODAY },
      { id: 'c3', first_name: 'Omar', follow_up_date: '2026-09-01' },
      { id: 'c4', first_name: 'None', follow_up_date: null },
    ], TODAY);
    expect(out.map((s) => s.entity?.id)).toEqual(['c1', 'c2']);
  });
});

describe('buildSignals', () => {
  it('returns an empty list for a perfectly healthy business', () => {
    expect(buildSignals({ today: TODAY })).toEqual([]);
  });

  it('aggregates every domain and returns them ranked by what is at stake', () => {
    const out = buildSignals({
      today: TODAY,
      invoices: [{ id: 'i1', amount: 40000, amount_paid: 0, status: 'unpaid', payment_method: 'prepaid', invoice_date: '2026-06-01', due_date: '2026-06-15' }],
      variants: [{ id: 'v1', sku: 'S', title: 'W', price: 100, cost_per_item: 60, inventory_qty: 2, avgDailyUnits: 1 }],
      contacts: [{ id: 'c1', first_name: 'Ali', follow_up_date: '2026-08-01' }],
    });

    expect(out.length).toBe(3);
    // The 40k overdue invoice is both critical and the biggest number — it leads.
    expect(out[0].id).toBe('overdue-invoice:i1');
    // The zero-impact follow-up sinks to the bottom.
    expect(out[out.length - 1].domain).toBe('crm');
  });

  it('sums only positive impact in totalAtStake', () => {
    expect(totalAtStake([sig({ impactEgp: 100 }), sig({ impactEgp: -50 }), sig({ impactEgp: 25 })])).toBe(125);
  });
});
