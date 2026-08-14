// 13-week rolling cash-flow forecast — DIRECT METHOD.
//
// Projects actual cash movements week by week (customer receipts, supplier
// payments, payroll, recurring costs) rather than extrapolating accounting
// profit. Each week's closing balance opens the next. This is the standard
// short-term liquidity model used across corporate finance precisely because
// it tells you *which* payment to delay or *which* collection to chase when a
// deficit appears — a single blended "net inflow" number cannot do that.
//
// Pure: callers pass `today` and all scheduled items; nothing reads the clock
// or the database here.

export type FlowKind =
  | 'invoice_receipt'      // open AR landing on its due date
  | 'cod_remittance'       // COD sales settling after the courier lag
  | 'forecast_sales'       // extrapolated future sales from trailing velocity
  | 'bill_payment'         // open AP landing on its due date
  | 'po_commitment'        // approved purchase orders not yet billed
  | 'payroll'
  | 'recurring_cost'       // fixed-basis cost rules
  | 'other';

export interface ScheduledFlow {
  date: string;            // YYYY-MM-DD
  amount: number;          // signed: + inflow, − outflow
  kind: FlowKind;
  label: string;
  ref?: string | null;     // entity id, so the UI can link back to the source
}

export interface ForecastWeek {
  week: number;            // 1-based
  label: string;
  startDate: string;
  endDate: string;
  opening: number;
  inflows: number;
  outflows: number;        // positive magnitude
  netChange: number;
  balance: number;         // closing
  flows: ScheduledFlow[];
}

export interface ForecastInputs {
  today: string;
  startingBalance: number;
  flows: ScheduledFlow[];
  weeks?: number;
}

const DAY_MS = 86_400_000;

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Buckets every scheduled flow into its week and rolls the balance forward.
// Anything dated before `today` is treated as due immediately (it lands in
// week 1) — an overdue bill is still a real claim on cash.
export function computeCashFlowForecast(inputs: ForecastInputs): ForecastWeek[] {
  const weeks = inputs.weeks ?? 13;
  const rows: ForecastWeek[] = [];
  let balance = inputs.startingBalance;

  for (let w = 1; w <= weeks; w++) {
    const startDate = addDays(inputs.today, (w - 1) * 7);
    const endDate = addDays(inputs.today, w * 7 - 1);

    const flows = inputs.flows.filter((f) => {
      if (w === 1) return f.date <= endDate;          // sweep up anything overdue
      return f.date >= startDate && f.date <= endDate;
    });

    const inflows = flows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
    const outflows = flows.filter((f) => f.amount < 0).reduce((s, f) => s + Math.abs(f.amount), 0);
    const netChange = inflows - outflows;
    const opening = balance;
    balance += netChange;

    rows.push({
      week: w,
      label: `Wk ${w}`,
      startDate,
      endDate,
      opening: round2(opening),
      inflows: round2(inflows),
      outflows: round2(outflows),
      netChange: round2(netChange),
      balance: round2(balance),
      flows,
    });
  }
  return rows;
}

// First week the projected balance falls below a floor — null if it never does.
export function weeksUntilNegative(rows: ForecastWeek[], floor = 0): number | null {
  return rows.find((r) => r.balance < floor)?.week ?? null;
}

// The lowest point across the horizon — the number that actually decides
// whether you can afford a commitment.
export function troughBalance(rows: ForecastWeek[]): { week: number; balance: number } | null {
  if (rows.length === 0) return null;
  return rows.reduce((low, r) => (r.balance < low.balance ? { week: r.week, balance: r.balance } : low), { week: rows[0].week, balance: rows[0].balance });
}

// Totals per flow kind across the horizon — powers the "where is the money
// going" breakdown next to the chart.
export function summariseByKind(rows: ForecastWeek[]): Array<{ kind: FlowKind; total: number }> {
  const totals = new Map<FlowKind, number>();
  for (const r of rows) {
    for (const f of r.flows) totals.set(f.kind, (totals.get(f.kind) ?? 0) + f.amount);
  }
  return Array.from(totals.entries())
    .map(([kind, total]) => ({ kind, total: round2(total) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

// --- Scheduled-flow builders (pure helpers the data layer composes) ---

export function invoiceReceipts(
  invoices: Array<{ id: string; invoice_number?: string | null; amount: number; amount_paid: number; status: string; payment_method: string; invoice_date: string; due_date?: string | null }>,
  today: string,
  codLagDays: number,
): ScheduledFlow[] {
  const out: ScheduledFlow[] = [];
  for (const i of invoices) {
    if (i.status === 'paid') continue;
    const balance = (Number(i.amount) || 0) - (Number(i.amount_paid) || 0);
    if (balance <= 0) continue;
    const label = i.invoice_number || `Invoice ${i.id.slice(0, 8)}`;

    if (i.payment_method === 'cod') {
      const expected = addDays(i.invoice_date, codLagDays);
      out.push({ date: expected < today ? today : expected, amount: balance, kind: 'cod_remittance', label: `${label} (COD)`, ref: i.id });
    } else {
      const due = i.due_date ?? today;
      out.push({ date: due < today ? today : due, amount: balance, kind: 'invoice_receipt', label, ref: i.id });
    }
  }
  return out;
}

export function billPayments(
  bills: Array<{ id: string; bill_number?: string | null; amount: number; amount_paid: number; status: string; due_date?: string | null }>,
  today: string,
): ScheduledFlow[] {
  const out: ScheduledFlow[] = [];
  for (const b of bills) {
    if (b.status === 'paid') continue;
    const balance = (Number(b.amount) || 0) - (Number(b.amount_paid) || 0);
    if (balance <= 0) continue;
    const due = b.due_date ?? today;
    out.push({
      date: due < today ? today : due,
      amount: -balance,
      kind: 'bill_payment',
      label: b.bill_number || `Bill ${b.id.slice(0, 8)}`,
      ref: b.id,
    });
  }
  return out;
}

// Spreads a per-day sales expectation across the horizon as weekly receipts.
export function forecastSales(avgDailyNet: number, today: string, weeks: number): ScheduledFlow[] {
  if (avgDailyNet <= 0) return [];
  return Array.from({ length: weeks }, (_, i) => ({
    date: addDays(today, i * 7 + 6),
    amount: round2(avgDailyNet * 7),
    kind: 'forecast_sales' as const,
    label: `Expected sales — week ${i + 1}`,
    ref: null,
  }));
}

// Turns a monthly recurring amount into dated outflows on the same day each month.
export function recurringOutflows(monthlyTotal: number, today: string, weeks: number, kind: FlowKind = 'recurring_cost', label = 'Recurring costs'): ScheduledFlow[] {
  if (monthlyTotal <= 0) return [];
  const months = Math.ceil((weeks * 7) / 30);
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + i + 1);
    d.setDate(1);
    return { date: d.toISOString().slice(0, 10), amount: -monthlyTotal, kind, label, ref: null };
  });
}
