// Collections — turning "this invoice is late" into "send this message today".
//
// An overdue invoice isn't an alert, it's a sequence: a polite nudge before the
// due date, a firmer one after, escalation, then a decision. This module owns
// that ladder plus the measure of whether collections are working at all (DSO).
//
// Pure: callers pass `today` and the invoice rows; nothing here reads a clock.

export type DunningChannel = 'whatsapp' | 'email' | 'call' | 'other';

export interface DunningStep {
  key: string;
  /** Days relative to the due date. Negative = before it falls due. */
  offsetDays: number;
  label: string;
  tone: 'reminder' | 'firm' | 'escalation' | 'final';
  /** Message template — `{{name}}`, `{{invoice}}`, `{{amount}}`, `{{due}}` are substituted. */
  template: string;
}

// A deliberately short ladder. Long sequences read as automated and get ignored;
// four touches over a month is roughly where small-business collections land.
export const DEFAULT_LADDER: DunningStep[] = [
  {
    key: 'pre-due', offsetDays: -3, label: 'Friendly heads-up', tone: 'reminder',
    template: 'Hi {{name}}, just a reminder that invoice {{invoice}} for {{amount}} is due on {{due}}. Thanks!',
  },
  {
    key: 'due-now', offsetDays: 1, label: 'Due yesterday', tone: 'reminder',
    template: 'Hi {{name}}, invoice {{invoice}} for {{amount}} was due on {{due}}. Could you confirm when it will be settled?',
  },
  {
    key: 'overdue-7', offsetDays: 7, label: 'A week late', tone: 'firm',
    template: 'Hi {{name}}, invoice {{invoice}} for {{amount}} is now a week overdue. Please arrange payment or let us know if there is an issue.',
  },
  {
    key: 'overdue-21', offsetDays: 21, label: 'Three weeks late', tone: 'escalation',
    template: 'Hi {{name}}, invoice {{invoice}} for {{amount}} is 3 weeks overdue. We need to agree a payment date this week.',
  },
  {
    key: 'overdue-45', offsetDays: 45, label: 'Final notice', tone: 'final',
    template: 'Hi {{name}}, invoice {{invoice}} for {{amount}} remains unpaid 45 days after its due date. This is a final request before we pause further work.',
  },
];

export interface InvoiceForDunning {
  id: string;
  invoice_number?: string | null;
  amount: number;
  amount_paid: number;
  status: string;
  payment_method: string;
  invoice_date: string;
  due_date?: string | null;
  promise_to_pay?: string | null;
  in_dispute?: boolean;
}

export const outstandingOf = (i: { amount: number; amount_paid: number }) =>
  (Number(i.amount) || 0) - (Number(i.amount_paid) || 0);

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
}

// The step this invoice has *reached* — the latest rung whose trigger date has
// passed. Returns null when nothing is due yet.
export function currentStep(invoice: InvoiceForDunning, today: string, ladder = DEFAULT_LADDER): DunningStep | null {
  if (!invoice.due_date) return null;
  const age = daysBetween(invoice.due_date, today);
  const reached = ladder.filter((s) => age >= s.offsetDays);
  return reached.length > 0 ? reached[reached.length - 1] : null;
}

export interface DunningAction {
  invoiceId: string;
  step: DunningStep;
  outstanding: number;
  daysOverdue: number;
}

// Which invoices need a collections touch right now: the step they've reached
// hasn't been sent yet. A live promise-to-pay or an open dispute suppresses
// chasing — nagging someone who already committed to a date destroys goodwill.
export function dueDunningActions(
  invoices: InvoiceForDunning[],
  sentSteps: Record<string, string[]>,   // invoiceId -> step keys already sent
  today: string,
  ladder = DEFAULT_LADDER,
): DunningAction[] {
  const out: DunningAction[] = [];
  for (const inv of invoices) {
    if (inv.status === 'paid') continue;
    if (inv.payment_method === 'cod') continue;      // couriers settle these, not the customer
    if (inv.in_dispute) continue;
    if (inv.promise_to_pay && inv.promise_to_pay >= today) continue;
    const outstanding = outstandingOf(inv);
    if (outstanding <= 0) continue;

    const step = currentStep(inv, today, ladder);
    if (!step) continue;
    if ((sentSteps[inv.id] ?? []).includes(step.key)) continue;

    out.push({
      invoiceId: inv.id,
      step,
      outstanding,
      daysOverdue: inv.due_date ? daysBetween(inv.due_date, today) : 0,
    });
  }
  return out.sort((a, b) => b.outstanding - a.outstanding);
}

export function renderTemplate(
  template: string,
  vars: { name?: string | null; invoice?: string | null; amount?: string; due?: string | null },
): string {
  return template
    .replace(/\{\{name\}\}/g, vars.name || 'there')
    .replace(/\{\{invoice\}\}/g, vars.invoice || '')
    .replace(/\{\{amount\}\}/g, vars.amount || '')
    .replace(/\{\{due\}\}/g, vars.due || '');
}

// --- Days Sales Outstanding --------------------------------------------------
// The headline measure of whether collections work: how many days of sales are
// tied up in unpaid invoices. Lower is better; a rising DSO means you're
// financing your customers.
export function computeDso(receivablesBalance: number, creditSalesInPeriod: number, periodDays: number): number {
  if (creditSalesInPeriod <= 0) return 0;
  return (receivablesBalance / creditSalesInPeriod) * periodDays;
}

export interface AgingBucket { key: string; label: string; total: number; count: number }

export function agingBuckets(invoices: InvoiceForDunning[], today: string): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { key: 'current', label: 'Not yet due', total: 0, count: 0 },
    { key: 'b1', label: '1–30 days', total: 0, count: 0 },
    { key: 'b2', label: '31–60 days', total: 0, count: 0 },
    { key: 'b3', label: '61–90 days', total: 0, count: 0 },
    { key: 'b4', label: '90+ days', total: 0, count: 0 },
  ];
  for (const inv of invoices) {
    if (inv.status === 'paid') continue;
    const outstanding = outstandingOf(inv);
    if (outstanding <= 0) continue;
    const days = inv.due_date ? daysBetween(inv.due_date, today) : -1;
    const b = days <= 0 ? buckets[0]
      : days <= 30 ? buckets[1]
      : days <= 60 ? buckets[2]
      : days <= 90 ? buckets[3]
      : buckets[4];
    b.total += outstanding;
    b.count += 1;
  }
  return buckets;
}

// Share of receivables sitting past due — a single health number for the tab.
export function overdueRatio(buckets: AgingBucket[]): number {
  const total = buckets.reduce((s, b) => s + b.total, 0);
  if (total <= 0) return 0;
  const overdue = buckets.filter((b) => b.key !== 'current').reduce((s, b) => s + b.total, 0);
  return (overdue / total) * 100;
}
