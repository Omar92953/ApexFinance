// Project economics — the service-business equivalent of unit economics.
//
// A product business asks "what does this SKU earn per unit?". A service
// business asks "is this project actually profitable once I count the hours
// we've poured into it?" — which is a different question, because the cost is
// labour that's already been spent whether or not it was billable.

export interface TimeEntryLike {
  hours: number;
  is_billable: boolean;
  billRate: number;   // resolved from the rate card at entry time
  costRate: number;   // what that hour costs the business
}

export interface ProjectEconomics {
  hoursTotal: number;
  hoursBillable: number;
  billableValue: number;   // what the logged billable hours are worth
  laborCost: number;       // cost of ALL hours, billable or not
  margin: number;          // billableValue − laborCost
  marginPct: number;
  utilizationPct: number;  // share of logged hours that are billable
  effectiveHourlyRate: number; // billableValue spread across every hour worked
}

export function computeProjectEconomics(entries: TimeEntryLike[]): ProjectEconomics {
  let hoursTotal = 0, hoursBillable = 0, billableValue = 0, laborCost = 0;

  for (const e of entries) {
    const hours = Number(e.hours) || 0;
    hoursTotal += hours;
    laborCost += hours * (Number(e.costRate) || 0);
    if (e.is_billable) {
      hoursBillable += hours;
      billableValue += hours * (Number(e.billRate) || 0);
    }
  }

  const margin = billableValue - laborCost;
  return {
    hoursTotal,
    hoursBillable,
    billableValue,
    laborCost,
    margin,
    marginPct: billableValue > 0 ? (margin / billableValue) * 100 : 0,
    utilizationPct: hoursTotal > 0 ? (hoursBillable / hoursTotal) * 100 : 0,
    effectiveHourlyRate: hoursTotal > 0 ? billableValue / hoursTotal : 0,
  };
}

// For fixed-price work the revenue is capped, so the real question is whether
// the hours have eaten the fee. Returns >1 when you're over budget.
export function computeBudgetBurn(budgetAmount: number, laborCost: number): number {
  if (budgetAmount <= 0) return 0;
  return laborCost / budgetAmount;
}

export type ProjectHealth = 'healthy' | 'at_risk' | 'over_budget' | 'no_budget';

export const PROJECT_HEALTH_LABELS: Record<ProjectHealth, string> = {
  healthy: 'On track',
  at_risk: 'At risk — burning fast',
  over_budget: 'Over budget',
  no_budget: 'No budget set',
};

export const AT_RISK_BURN = 0.8;

// Fixed-price and retainer work is judged on cost-vs-fee; hourly work can't go
// "over budget" on money unless an hours cap was agreed, so it's judged on that.
export function classifyProjectHealth(
  billingType: 'fixed' | 'hourly' | 'retainer',
  budgetAmount: number,
  budgetHours: number | null | undefined,
  econ: Pick<ProjectEconomics, 'laborCost' | 'hoursTotal'>,
): ProjectHealth {
  if (billingType === 'hourly') {
    if (!budgetHours || budgetHours <= 0) return 'no_budget';
    const burn = econ.hoursTotal / budgetHours;
    if (burn > 1) return 'over_budget';
    return burn >= AT_RISK_BURN ? 'at_risk' : 'healthy';
  }

  if (budgetAmount <= 0) return 'no_budget';
  const burn = computeBudgetBurn(budgetAmount, econ.laborCost);
  if (burn > 1) return 'over_budget';
  return burn >= AT_RISK_BURN ? 'at_risk' : 'healthy';
}

// Value of billable work logged but never invoiced — the service-business
// equivalent of stock sitting in a warehouse, and just as easy to forget.
export function computeUnbilledValue(entries: Array<TimeEntryLike & { invoiced_on?: string | null }>): number {
  return entries
    .filter((e) => e.is_billable && !e.invoiced_on)
    .reduce((sum, e) => sum + (Number(e.hours) || 0) * (Number(e.billRate) || 0), 0);
}
