import { describe, it, expect } from 'vitest';
import {
  computeCashFlowForecast, weeksUntilNegative, troughBalance, summariseByKind,
  invoiceReceipts, billPayments, forecastSales, recurringOutflows,
  type ScheduledFlow,
} from './forecast';

const TODAY = '2026-08-14';

const flow = (over: Partial<ScheduledFlow>): ScheduledFlow => ({
  date: TODAY, amount: 0, kind: 'other', label: 'x', ref: null, ...over,
});

describe('computeCashFlowForecast', () => {
  it('rolls each week closing balance into the next opening', () => {
    const rows = computeCashFlowForecast({
      today: TODAY,
      startingBalance: 1000,
      flows: [flow({ date: TODAY, amount: 500 }), flow({ date: '2026-08-25', amount: -300 })],
      weeks: 3,
    });
    expect(rows[0].opening).toBe(1000);
    expect(rows[0].balance).toBe(1500);
    expect(rows[1].opening).toBe(1500);
    expect(rows[2].opening).toBe(rows[1].balance);
  });

  it('produces the requested number of weeks', () => {
    expect(computeCashFlowForecast({ today: TODAY, startingBalance: 0, flows: [] })).toHaveLength(13);
    expect(computeCashFlowForecast({ today: TODAY, startingBalance: 0, flows: [], weeks: 4 })).toHaveLength(4);
  });

  it('sweeps overdue items into week 1 rather than dropping them', () => {
    const rows = computeCashFlowForecast({
      today: TODAY,
      startingBalance: 0,
      flows: [flow({ date: '2026-01-01', amount: -750, label: 'ancient bill' })],
      weeks: 2,
    });
    expect(rows[0].outflows).toBe(750);
    expect(rows[0].balance).toBe(-750);
  });

  it('separates inflows from outflows in the same week', () => {
    const rows = computeCashFlowForecast({
      today: TODAY,
      startingBalance: 0,
      flows: [flow({ amount: 1000 }), flow({ amount: -400 })],
      weeks: 1,
    });
    expect(rows[0].inflows).toBe(1000);
    expect(rows[0].outflows).toBe(400);
    expect(rows[0].netChange).toBe(600);
  });

  it('does not double-count a flow across adjacent weeks', () => {
    const rows = computeCashFlowForecast({
      today: TODAY,
      startingBalance: 0,
      flows: [flow({ date: '2026-08-21', amount: 100 })],
      weeks: 3,
    });
    const hits = rows.filter((r) => r.flows.length > 0);
    expect(hits).toHaveLength(1);
    expect(hits[0].week).toBe(2);
  });
});

describe('weeksUntilNegative / troughBalance', () => {
  const rows = computeCashFlowForecast({
    today: TODAY,
    startingBalance: 500,
    flows: [flow({ date: '2026-08-25', amount: -900 }), flow({ date: '2026-09-10', amount: 2000 })],
    weeks: 6,
  });

  it('finds the first breach week', () => {
    expect(weeksUntilNegative(rows)).toBe(2);
  });

  it('respects a non-zero floor', () => {
    expect(weeksUntilNegative(rows, 600)).toBe(1);
  });

  it('returns null when the balance never breaches', () => {
    const healthy = computeCashFlowForecast({ today: TODAY, startingBalance: 10_000, flows: [], weeks: 3 });
    expect(weeksUntilNegative(healthy)).toBeNull();
  });

  it('reports the lowest point across the horizon, not just the first dip', () => {
    const trough = troughBalance(rows);
    expect(trough?.balance).toBe(-400);
  });
});

describe('summariseByKind', () => {
  it('totals flows per kind, biggest absolute first', () => {
    const rows = computeCashFlowForecast({
      today: TODAY,
      startingBalance: 0,
      flows: [
        flow({ amount: 100, kind: 'invoice_receipt' }),
        flow({ amount: 50, kind: 'invoice_receipt' }),
        flow({ amount: -900, kind: 'payroll' }),
      ],
      weeks: 2,
    });
    expect(summariseByKind(rows)).toEqual([
      { kind: 'payroll', total: -900 },
      { kind: 'invoice_receipt', total: 150 },
    ]);
  });
});

describe('invoiceReceipts', () => {
  const base = { amount: 1000, amount_paid: 0, status: 'unpaid', invoice_date: '2026-08-10' };

  it('schedules a prepaid invoice on its due date', () => {
    const out = invoiceReceipts([{ id: 'i1', ...base, payment_method: 'prepaid', due_date: '2026-09-01' }], TODAY, 10);
    expect(out[0]).toMatchObject({ date: '2026-09-01', amount: 1000, kind: 'invoice_receipt' });
  });

  it('schedules COD by courier lag from the invoice date', () => {
    const out = invoiceReceipts([{ id: 'i2', ...base, payment_method: 'cod', due_date: null }], TODAY, 10);
    expect(out[0]).toMatchObject({ date: '2026-08-20', kind: 'cod_remittance' });
  });

  it('pulls an already-overdue receipt forward to today rather than the past', () => {
    const out = invoiceReceipts([{ id: 'i3', ...base, payment_method: 'prepaid', due_date: '2026-07-01' }], TODAY, 10);
    expect(out[0].date).toBe(TODAY);
  });

  it('nets off partial payments and skips settled invoices', () => {
    const out = invoiceReceipts([
      { id: 'i4', ...base, amount_paid: 400, payment_method: 'prepaid', due_date: '2026-09-01' },
      { id: 'i5', ...base, status: 'paid', payment_method: 'prepaid', due_date: '2026-09-01' },
      { id: 'i6', ...base, amount_paid: 1000, payment_method: 'prepaid', due_date: '2026-09-01' },
    ], TODAY, 10);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(600);
  });
});

describe('billPayments', () => {
  it('schedules unpaid bills as negative flows on their due date', () => {
    const out = billPayments([{ id: 'b1', amount: 500, amount_paid: 0, status: 'unpaid', due_date: '2026-09-01' }], TODAY);
    expect(out[0]).toMatchObject({ date: '2026-09-01', amount: -500, kind: 'bill_payment' });
  });

  it('treats a missing due date as payable now', () => {
    const out = billPayments([{ id: 'b2', amount: 500, amount_paid: 0, status: 'unpaid', due_date: null }], TODAY);
    expect(out[0].date).toBe(TODAY);
  });
});

describe('forecastSales / recurringOutflows', () => {
  it('spreads daily sales into one weekly receipt each week', () => {
    const out = forecastSales(100, TODAY, 3);
    expect(out).toHaveLength(3);
    expect(out[0].amount).toBe(700);
  });

  it('emits nothing when there is no sales velocity or no recurring cost', () => {
    expect(forecastSales(0, TODAY, 13)).toEqual([]);
    expect(recurringOutflows(0, TODAY, 13)).toEqual([]);
  });

  it('lands recurring costs monthly as negative flows', () => {
    const out = recurringOutflows(3000, TODAY, 13);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.every((f) => f.amount === -3000)).toBe(true);
    expect(out[0].date.endsWith('-01')).toBe(true);
  });
});
