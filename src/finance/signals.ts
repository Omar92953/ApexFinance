// The Signal Engine — the layer that turns recorded data into decisions.
//
// Every module feeds it aggregated state; it emits ranked, typed, actionable
// signals. This deliberately replaces the old alerts.ts (which only counted
// things) — a count tells you something is wrong, a signal tells you what to
// do about it and what it's costing you.
//
// Pure by design: no DB, no dates from the clock (callers pass `today`), so
// every rule below is directly testable.

export type SignalSeverity = 'critical' | 'warning' | 'info';
export type SignalDomain = 'cash' | 'receivables' | 'payables' | 'inventory' | 'sales' | 'crm' | 'costs';

export interface Signal {
  id: string;                 // deterministic — dismissals/tasks reference it stably
  severity: SignalSeverity;
  domain: SignalDomain;
  title: string;
  why: string;                // the evidence behind it
  impactEgp: number;          // money at stake, drives ranking
  suggestedAction: string;
  entity?: { type: string; id: string } | null;
}

// --- Thresholds (exported so they're tunable and assertable in tests) ---
export const COD_OUTSTANDING_DAYS = 10;
export const STALE_DEAL_DAYS = 14;
export const LOW_STOCK_COVER_DAYS = 7;
export const CASH_FLOOR_EGP = 0;

// Severity sets a floor; money can override it. A warning worth more than the
// gap between tiers will outrank a zero-impact critical — which is the point:
// rank by what's actually at stake, not by label alone.
const SEVERITY_BASE: Record<SignalSeverity, number> = {
  critical: 100_000,
  warning: 10_000,
  info: 0,
};

export function signalScore(s: Signal): number {
  return SEVERITY_BASE[s.severity] + Math.max(0, s.impactEgp);
}

export function rankSignals(signals: Signal[]): Signal[] {
  return [...signals].sort((a, b) => signalScore(b) - signalScore(a));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

// --- Input shapes: minimal structural types so this file stays free of DB imports ---
export interface InvoiceLike {
  id: string;
  invoice_number?: string | null;
  amount: number;
  amount_paid: number;
  status: string;
  payment_method: string;
  invoice_date: string;
  due_date?: string | null;
}
export interface BillLike {
  id: string;
  bill_number?: string | null;
  amount: number;
  amount_paid: number;
  status: string;
  due_date?: string | null;
}
export interface VariantLike {
  id: string;
  sku?: string | null;
  title?: string | null;
  price: number;
  cost_per_item: number;
  inventory_qty: number;
  avgDailyUnits: number;
}
export interface DealLike {
  id: string;
  title: string;
  value: number;
  stage: string;
  updated_at?: string | null;
  expected_close?: string | null;
}
export interface ContactLike {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  follow_up_date?: string | null;
}
export interface BudgetLike {
  category: string;
  budget_amount: number;
  actual: number;
}
export interface ForecastWeekLike {
  week: number;
  balance: number;
}

export interface ProjectLike {
  id: string;
  name: string;
  billingType: 'fixed' | 'hourly' | 'retainer';
  status: string;
  budgetAmount: number;
  laborCost: number;
  unbilledValue: number;
}

export interface SignalInputs {
  today: string;
  invoices?: InvoiceLike[];
  bills?: BillLike[];
  variants?: VariantLike[];
  deals?: DealLike[];
  contacts?: ContactLike[];
  budgets?: BudgetLike[];
  forecast?: ForecastWeekLike[];
  projects?: ProjectLike[];
  cashFloor?: number;
  // Which providers to run. A service business has no stock to be low on and
  // no couriers to chase; a shop has no projects. Omitted = everything on.
  enabled?: { inventory?: boolean; cod?: boolean; projects?: boolean };
}

const outstanding = (x: { amount: number; amount_paid: number }) => (Number(x.amount) || 0) - (Number(x.amount_paid) || 0);

// --- Providers: one per domain, each independently testable ---

export function receivableSignals(invoices: InvoiceLike[], today: string, codEnabled = true): Signal[] {
  const out: Signal[] = [];
  for (const i of invoices) {
    if (i.status === 'paid') continue;
    const balance = outstanding(i);
    if (balance <= 0) continue;
    const label = i.invoice_number || `Invoice ${i.id.slice(0, 8)}`;

    if (i.payment_method === 'cod' && codEnabled) {
      const age = daysBetween(i.invoice_date, today);
      if (age > COD_OUTSTANDING_DAYS) {
        out.push({
          id: `cod-outstanding:${i.id}`,
          severity: 'warning',
          domain: 'receivables',
          title: `${label} still unremitted after ${age} days`,
          why: `COD order shipped ${age} days ago and the courier has not remitted.`,
          impactEgp: balance,
          suggestedAction: 'Chase the courier for remittance or mark it RTO.',
          entity: { type: 'customer_invoice', id: i.id },
        });
      }
      continue;
    }

    if (i.due_date && i.due_date < today) {
      const overdue = daysBetween(i.due_date, today);
      out.push({
        id: `overdue-invoice:${i.id}`,
        severity: overdue > 30 ? 'critical' : 'warning',
        domain: 'receivables',
        title: `${label} is ${overdue} days overdue`,
        why: `Due ${i.due_date}, still ${balance.toFixed(0)} EGP unpaid.`,
        impactEgp: balance,
        suggestedAction: overdue > 30 ? 'Escalate — call the customer today.' : 'Send a payment reminder.',
        entity: { type: 'customer_invoice', id: i.id },
      });
    }
  }
  return out;
}

export function payableSignals(bills: BillLike[], today: string): Signal[] {
  const out: Signal[] = [];
  for (const b of bills) {
    if (b.status === 'paid') continue;
    const balance = outstanding(b);
    if (balance <= 0) continue;
    if (!b.due_date) continue;
    const label = b.bill_number || `Bill ${b.id.slice(0, 8)}`;

    if (b.due_date < today) {
      out.push({
        id: `overdue-bill:${b.id}`,
        severity: 'critical',
        domain: 'payables',
        title: `${label} is overdue`,
        why: `Was due ${b.due_date} — ${balance.toFixed(0)} EGP still owed to the supplier.`,
        impactEgp: balance,
        suggestedAction: 'Pay it or renegotiate terms before it damages the relationship.',
        entity: { type: 'supplier_bill', id: b.id },
      });
    } else if (daysBetween(today, b.due_date) <= 7) {
      out.push({
        id: `bill-due-soon:${b.id}`,
        severity: 'info',
        domain: 'payables',
        title: `${label} due in ${daysBetween(today, b.due_date)} days`,
        why: `${balance.toFixed(0)} EGP payment coming up on ${b.due_date}.`,
        impactEgp: balance,
        suggestedAction: 'Make sure cash is available for this week.',
        entity: { type: 'supplier_bill', id: b.id },
      });
    }
  }
  return out;
}

export function inventorySignals(variants: VariantLike[]): Signal[] {
  const out: Signal[] = [];
  for (const v of variants) {
    const name = v.title || v.sku || `Variant ${v.id.slice(0, 8)}`;
    const qty = Number(v.inventory_qty) || 0;
    const price = Number(v.price) || 0;
    const cost = Number(v.cost_per_item) || 0;

    if (price > 0 && cost > price) {
      out.push({
        id: `negative-margin:${v.id}`,
        severity: 'critical',
        domain: 'inventory',
        title: `${name} sells below cost`,
        why: `Priced at ${price.toFixed(0)} EGP but costs ${cost.toFixed(0)} EGP — losing ${(cost - price).toFixed(0)} EGP per unit.`,
        impactEgp: (cost - price) * Math.max(v.avgDailyUnits * 30, 1),
        suggestedAction: 'Raise the price or renegotiate supply cost.',
        entity: { type: 'product_variant', id: v.id },
      });
    }

    if (qty <= 0 && v.avgDailyUnits > 0) {
      out.push({
        id: `out-of-stock:${v.id}`,
        severity: 'critical',
        domain: 'inventory',
        title: `${name} is out of stock`,
        why: `Selling ~${v.avgDailyUnits.toFixed(1)} units/day with nothing on hand.`,
        impactEgp: v.avgDailyUnits * 30 * Math.max(price - cost, 0),
        suggestedAction: 'Raise a purchase order now — every day out is lost margin.',
        entity: { type: 'product_variant', id: v.id },
      });
    } else if (qty > 0 && v.avgDailyUnits > 0) {
      const cover = qty / v.avgDailyUnits;
      if (cover < LOW_STOCK_COVER_DAYS) {
        out.push({
          id: `low-stock:${v.id}`,
          severity: 'warning',
          domain: 'inventory',
          title: `${name} has ${cover.toFixed(1)} days of stock left`,
          why: `${qty} units on hand against ~${v.avgDailyUnits.toFixed(1)} units/day of demand.`,
          impactEgp: v.avgDailyUnits * 14 * Math.max(price - cost, 0),
          suggestedAction: 'Reorder now to avoid a stock-out.',
          entity: { type: 'product_variant', id: v.id },
        });
      }
    }
  }
  return out;
}

export function cashSignals(forecast: ForecastWeekLike[], floor = CASH_FLOOR_EGP): Signal[] {
  const breach = forecast.find((w) => w.balance < floor);
  if (!breach) return [];
  return [{
    id: `cash-runway:week-${breach.week}`,
    severity: breach.week <= 4 ? 'critical' : 'warning',
    domain: 'cash',
    title: `Cash runs out in week ${breach.week}`,
    why: `Projected balance falls to ${breach.balance.toFixed(0)} EGP by week ${breach.week}.`,
    impactEgp: Math.abs(breach.balance),
    suggestedAction: 'Delay a supplier payment, accelerate collections, or inject capital.',
    entity: null,
  }];
}

export function budgetSignals(budgets: BudgetLike[]): Signal[] {
  return budgets
    .filter((b) => b.budget_amount > 0 && b.actual > b.budget_amount)
    .map((b) => {
      const over = b.actual - b.budget_amount;
      return {
        id: `over-budget:${b.category}`,
        severity: 'warning' as const,
        domain: 'costs' as const,
        title: `${b.category} is ${((over / b.budget_amount) * 100).toFixed(0)}% over budget`,
        why: `Spent ${b.actual.toFixed(0)} EGP against a ${b.budget_amount.toFixed(0)} EGP budget.`,
        impactEgp: over,
        suggestedAction: 'Freeze discretionary spend in this category or re-baseline the budget.',
        entity: null,
      };
    });
}

export function pipelineSignals(deals: DealLike[], today: string): Signal[] {
  const out: Signal[] = [];
  for (const d of deals) {
    if (d.stage === 'won' || d.stage === 'lost') continue;
    const value = Number(d.value) || 0;

    if (d.updated_at) {
      const idle = daysBetween(d.updated_at.slice(0, 10), today);
      if (idle >= STALE_DEAL_DAYS) {
        out.push({
          id: `stale-deal:${d.id}`,
          severity: 'warning',
          domain: 'sales',
          title: `"${d.title}" has had no activity for ${idle} days`,
          why: `Sitting in ${d.stage} worth ${value.toFixed(0)} EGP with no next step.`,
          impactEgp: value,
          suggestedAction: 'Schedule a next step or mark it lost — stale deals distort the forecast.',
          entity: { type: 'deal', id: d.id },
        });
      }
    }

    if (d.expected_close && d.expected_close < today) {
      out.push({
        id: `deal-past-close:${d.id}`,
        severity: 'info',
        domain: 'sales',
        title: `"${d.title}" is past its expected close date`,
        why: `Expected to close ${d.expected_close} but is still in ${d.stage}.`,
        impactEgp: value,
        suggestedAction: 'Update the close date or move the stage.',
        entity: { type: 'deal', id: d.id },
      });
    }
  }
  return out;
}

export function followUpSignals(contacts: ContactLike[], today: string): Signal[] {
  return contacts
    .filter((c) => c.follow_up_date && c.follow_up_date <= today)
    .map((c) => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Contact';
      return {
        id: `follow-up:${c.id}`,
        severity: 'info' as const,
        domain: 'crm' as const,
        title: `Follow up with ${name}`,
        why: `Follow-up was scheduled for ${c.follow_up_date}.`,
        impactEgp: 0,
        suggestedAction: 'Call or WhatsApp them today.',
        entity: { type: 'contact', id: c.id },
      };
    });
}

// Service-business equivalents of the stock signals: work that has eaten its
// fee, and delivered work nobody has invoiced yet.
export const UNBILLED_ALERT_EGP = 5_000;

export function projectSignals(projects: ProjectLike[]): Signal[] {
  const out: Signal[] = [];
  for (const p of projects) {
    if (p.status !== 'active') continue;

    if (p.budgetAmount > 0 && p.billingType !== 'hourly' && p.laborCost > p.budgetAmount) {
      out.push({
        id: `project-over-budget:${p.id}`,
        severity: 'critical',
        domain: 'sales',
        title: `"${p.name}" has burned through its fee`,
        why: `Labour cost is ${p.laborCost.toFixed(0)} EGP against a ${p.budgetAmount.toFixed(0)} EGP budget.`,
        impactEgp: p.laborCost - p.budgetAmount,
        suggestedAction: 'Stop unbilled work, renegotiate scope, or raise a change order.',
        entity: { type: 'project', id: p.id },
      });
    }

    if (p.unbilledValue >= UNBILLED_ALERT_EGP) {
      out.push({
        id: `project-unbilled:${p.id}`,
        severity: 'warning',
        domain: 'receivables',
        title: `"${p.name}" has ${p.unbilledValue.toFixed(0)} EGP of unbilled work`,
        why: 'Billable hours have been delivered but never invoiced.',
        impactEgp: p.unbilledValue,
        suggestedAction: 'Raise an invoice for the delivered work.',
        entity: { type: 'project', id: p.id },
      });
    }
  }
  return out;
}

// --- The single entry point every consumer uses ---
export function buildSignals(inputs: SignalInputs): Signal[] {
  const { today } = inputs;
  const on = { inventory: true, cod: true, projects: true, ...(inputs.enabled ?? {}) };

  const all = [
    ...receivableSignals(inputs.invoices ?? [], today, on.cod),
    ...payableSignals(inputs.bills ?? [], today),
    ...(on.inventory ? inventorySignals(inputs.variants ?? []) : []),
    ...(on.projects ? projectSignals(inputs.projects ?? []) : []),
    ...cashSignals(inputs.forecast ?? [], inputs.cashFloor),
    ...budgetSignals(inputs.budgets ?? []),
    ...pipelineSignals(inputs.deals ?? [], today),
    ...followUpSignals(inputs.contacts ?? [], today),
  ];
  return rankSignals(all);
}

export function totalAtStake(signals: Signal[]): number {
  return signals.reduce((sum, s) => sum + Math.max(0, s.impactEgp), 0);
}
