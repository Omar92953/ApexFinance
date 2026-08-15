// Subscription auditor — finding the money that leaves quietly.
//
// Recurring spend is uniquely easy to lose track of: it renews by default, the
// charge is small enough not to notice, and nobody owns the decision. The
// highest-value feature here isn't reporting — it's the renewal alert that
// arrives while you can still cancel.

export type BillingCycle = 'monthly' | 'quarterly' | 'annual';
export type SubscriptionDecision = 'keep' | 'renegotiate' | 'cancel' | 'undecided';

export interface Subscription {
  id: string;
  name: string;
  vendor?: string | null;
  amount: number;              // per billing cycle
  cycle: BillingCycle;
  renewsOn?: string | null;
  seats?: number | null;
  activeSeats?: number | null;
  lastUsedOn?: string | null;
  decision?: SubscriptionDecision;
  autoRenew?: boolean;
  category?: string | null;
}

const CYCLE_MONTHS: Record<BillingCycle, number> = { monthly: 1, quarterly: 3, annual: 12 };

export function monthlyCost(sub: Pick<Subscription, 'amount' | 'cycle'>): number {
  return (Number(sub.amount) || 0) / CYCLE_MONTHS[sub.cycle];
}

export function annualCost(sub: Pick<Subscription, 'amount' | 'cycle'>): number {
  return monthlyCost(sub) * 12;
}

export function totalMonthlySpend(subs: Subscription[]): number {
  return subs.filter((s) => s.decision !== 'cancel').reduce((sum, s) => sum + monthlyCost(s), 0);
}

// --- Waste detection ---------------------------------------------------------
export type WasteReason = 'unused' | 'underused' | 'stale' | 'undecided_renewal' | null;

export interface WasteAssessment {
  reason: WasteReason;
  wastedMonthly: number;
  detail: string;
}

export const STALE_AFTER_DAYS = 60;
export const UNDERUSED_SEAT_RATIO = 0.5;

// Judged on evidence the app actually has: seat utilisation and a last-used
// attestation. Deliberately conservative — flagging a tool someone silently
// relies on is worse than missing one.
export function assessWaste(sub: Subscription, today: string): WasteAssessment {
  const monthly = monthlyCost(sub);

  if (sub.lastUsedOn) {
    const idleDays = Math.floor((new Date(today).getTime() - new Date(sub.lastUsedOn).getTime()) / 86_400_000);
    if (idleDays >= STALE_AFTER_DAYS) {
      return {
        reason: 'stale',
        wastedMonthly: monthly,
        detail: `Not used for ${idleDays} days — confirm anyone still needs it.`,
      };
    }
  }

  const seats = Number(sub.seats) || 0;
  const active = Number(sub.activeSeats) || 0;
  if (seats > 0) {
    if (active === 0) {
      return { reason: 'unused', wastedMonthly: monthly, detail: `Paying for ${seats} seats with nobody on them.` };
    }
    if (active / seats <= UNDERUSED_SEAT_RATIO) {
      const idle = seats - active;
      return {
        reason: 'underused',
        wastedMonthly: (monthly / seats) * idle,
        detail: `${active} of ${seats} seats in use — ${idle} idle.`,
      };
    }
  }

  return { reason: null, wastedMonthly: 0, detail: 'No obvious waste.' };
}

export function totalWaste(subs: Subscription[], today: string): number {
  return subs
    .filter((s) => s.decision !== 'cancel')
    .reduce((sum, s) => sum + assessWaste(s, today).wastedMonthly, 0);
}

// --- Renewal calendar --------------------------------------------------------
export interface UpcomingRenewal {
  subscription: Subscription;
  daysUntil: number;
  amount: number;
  needsDecision: boolean;
}

export const RENEWAL_LEAD_DAYS = 30;

// Anything renewing inside the lead window. A renewal with no decision recorded
// is the one that matters — that's the auto-renew you didn't choose.
export function upcomingRenewals(subs: Subscription[], today: string, leadDays = RENEWAL_LEAD_DAYS): UpcomingRenewal[] {
  const out: UpcomingRenewal[] = [];
  for (const s of subs) {
    if (!s.renewsOn || s.decision === 'cancel') continue;
    const daysUntil = Math.floor((new Date(s.renewsOn).getTime() - new Date(today).getTime()) / 86_400_000);
    if (daysUntil > leadDays) continue;
    out.push({
      subscription: s,
      daysUntil,
      amount: Number(s.amount) || 0,
      needsDecision: !s.decision || s.decision === 'undecided',
    });
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}

// Money saved by decisions already taken — makes the audit's value visible
// rather than theoretical.
export function realisedSavings(subs: Subscription[]): number {
  return subs.filter((s) => s.decision === 'cancel').reduce((sum, s) => sum + annualCost(s), 0);
}

// Two tools in the same category is often duplication nobody noticed.
export function duplicateCategories(subs: Subscription[]): Array<{ category: string; subs: Subscription[] }> {
  const byCategory = new Map<string, Subscription[]>();
  for (const s of subs) {
    if (!s.category || s.decision === 'cancel') continue;
    const key = s.category.trim().toLowerCase();
    byCategory.set(key, [...(byCategory.get(key) ?? []), s]);
  }
  return Array.from(byCategory.entries())
    .filter(([, list]) => list.length > 1)
    .map(([category, list]) => ({ category, subs: list }));
}
