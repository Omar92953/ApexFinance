import { describe, it, expect } from 'vitest';
import {
  currentStep, dueDunningActions, renderTemplate, computeDso, agingBuckets, overdueRatio,
  DEFAULT_LADDER, type InvoiceForDunning,
} from './dunning';

const TODAY = '2026-08-15';

const inv = (over: Partial<InvoiceForDunning>): InvoiceForDunning => ({
  id: 'i1', amount: 1000, amount_paid: 0, status: 'unpaid', payment_method: 'prepaid',
  invoice_date: '2026-07-01', due_date: '2026-08-01', ...over,
});

describe('currentStep', () => {
  it('picks the latest rung the invoice has reached', () => {
    expect(currentStep(inv({ due_date: '2026-08-01' }), TODAY)?.key).toBe('overdue-7');   // 14 days over
    expect(currentStep(inv({ due_date: '2026-07-20' }), TODAY)?.key).toBe('overdue-21');  // 26 days over
    expect(currentStep(inv({ due_date: '2026-07-01' }), TODAY)?.key).toBe('overdue-45');  // 45 days over — exactly on the rung
  });

  it('nudges before the due date', () => {
    expect(currentStep(inv({ due_date: '2026-08-17' }), TODAY)?.key).toBe('pre-due');
  });

  it('returns nothing when the invoice is too far from due', () => {
    expect(currentStep(inv({ due_date: '2026-09-30' }), TODAY)).toBeNull();
  });

  it('returns nothing when there is no due date to measure from', () => {
    expect(currentStep(inv({ due_date: null }), TODAY)).toBeNull();
  });

  it('reaches the final notice on very old invoices', () => {
    expect(currentStep(inv({ due_date: '2026-06-01' }), TODAY)?.key).toBe('overdue-45');
  });
});

describe('dueDunningActions', () => {
  it('lists invoices whose current step has not been sent', () => {
    const actions = dueDunningActions([inv({ id: 'a' })], {}, TODAY);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ invoiceId: 'a', outstanding: 1000, daysOverdue: 14 });
  });

  it('does not re-send a step already sent', () => {
    const actions = dueDunningActions([inv({ id: 'a' })], { a: ['overdue-7'] }, TODAY);
    expect(actions).toEqual([]);
  });

  it('still chases once the invoice ages into the NEXT step', () => {
    // 26 days overdue: the 7-day rung was already sent, the 21-day one has now come due.
    const actions = dueDunningActions([inv({ id: 'a', due_date: '2026-07-20' })], { a: ['overdue-7'] }, TODAY);
    expect(actions[0].step.key).toBe('overdue-21');
  });

  it('respects a live promise to pay, then resumes once it lapses', () => {
    expect(dueDunningActions([inv({ id: 'a', promise_to_pay: '2026-08-20' })], {}, TODAY)).toEqual([]);
    expect(dueDunningActions([inv({ id: 'a', promise_to_pay: '2026-08-10' })], {}, TODAY)).toHaveLength(1);
  });

  it('never chases a disputed invoice', () => {
    expect(dueDunningActions([inv({ id: 'a', in_dispute: true })], {}, TODAY)).toEqual([]);
  });

  it('leaves COD alone — the courier settles those, not the customer', () => {
    expect(dueDunningActions([inv({ id: 'a', payment_method: 'cod' })], {}, TODAY)).toEqual([]);
  });

  it('skips paid and fully-settled invoices', () => {
    expect(dueDunningActions([inv({ id: 'a', status: 'paid' })], {}, TODAY)).toEqual([]);
    expect(dueDunningActions([inv({ id: 'b', amount_paid: 1000 })], {}, TODAY)).toEqual([]);
  });

  it('puts the biggest money first', () => {
    const actions = dueDunningActions([
      inv({ id: 'small', amount: 100 }),
      inv({ id: 'big', amount: 90_000 }),
    ], {}, TODAY);
    expect(actions.map((a) => a.invoiceId)).toEqual(['big', 'small']);
  });
});

describe('renderTemplate', () => {
  it('substitutes every placeholder', () => {
    const msg = renderTemplate(DEFAULT_LADDER[1].template, {
      name: 'Ali', invoice: 'INV-1042', amount: 'EGP 1,000', due: '2026-08-01',
    });
    expect(msg).toContain('Ali');
    expect(msg).toContain('INV-1042');
    expect(msg).toContain('EGP 1,000');
    expect(msg).not.toContain('{{');
  });

  it('falls back to a neutral greeting when the name is unknown', () => {
    expect(renderTemplate('Hi {{name}},', {})).toBe('Hi there,');
  });
});

describe('computeDso', () => {
  it('expresses receivables as days of sales', () => {
    expect(computeDso(30_000, 90_000, 90)).toBe(30);
  });

  it('is zero when there were no credit sales to measure against', () => {
    expect(computeDso(5_000, 0, 30)).toBe(0);
  });
});

describe('agingBuckets / overdueRatio', () => {
  const invoices = [
    inv({ id: 'a', due_date: '2026-09-01', amount: 100 }),   // not yet due
    inv({ id: 'b', due_date: '2026-08-01', amount: 200 }),   // 14 days
    inv({ id: 'c', due_date: '2026-07-01', amount: 300 }),   // 45 days
    inv({ id: 'd', due_date: '2026-05-01', amount: 400 }),   // 106 days
    inv({ id: 'e', due_date: '2026-08-01', amount: 500, status: 'paid' }),
  ];

  it('sorts invoices into the right buckets and ignores paid ones', () => {
    const b = agingBuckets(invoices, TODAY);
    expect(b.find((x) => x.key === 'current')).toMatchObject({ total: 100, count: 1 });
    expect(b.find((x) => x.key === 'b1')).toMatchObject({ total: 200, count: 1 });
    expect(b.find((x) => x.key === 'b2')).toMatchObject({ total: 300, count: 1 });
    expect(b.find((x) => x.key === 'b4')).toMatchObject({ total: 400, count: 1 });
  });

  it('computes the share of receivables that are late', () => {
    const ratio = overdueRatio(agingBuckets(invoices, TODAY));
    expect(ratio).toBeCloseTo(90, 0);   // 900 overdue of 1000 total
  });

  it('is zero when nothing is outstanding', () => {
    expect(overdueRatio(agingBuckets([], TODAY))).toBe(0);
  });
});
