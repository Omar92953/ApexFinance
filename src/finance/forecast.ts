// 13-week cash-flow forecast — pure projection math. Deliberately simple: a
// straight-line extrapolation of recent daily net cash generation plus known
// recurring fixed costs. It gets more accurate once Procurement (upcoming
// supplier bills) and Payroll (Phase 6/9) feed real scheduled outflows in;
// until then this is the honest "if nothing changes" baseline.

export interface ForecastInputs {
  startingBalance: number;
  avgDailyNetInflow: number; // (net sales − variable costs) per day, from trailing history
  weeklyFixedCosts: number;  // recurring fixed-basis cost rules, expressed per week
}

export interface ForecastWeek {
  week: number;
  label: string;
  netChange: number;
  balance: number;
}

export function computeCashFlowForecast(inputs: ForecastInputs, weeks = 13): ForecastWeek[] {
  const rows: ForecastWeek[] = [];
  let balance = inputs.startingBalance;
  for (let w = 1; w <= weeks; w++) {
    const netChange = inputs.avgDailyNetInflow * 7 - inputs.weeklyFixedCosts;
    balance += netChange;
    rows.push({ week: w, label: `Wk ${w}`, netChange: Math.round(netChange * 100) / 100, balance: Math.round(balance * 100) / 100 });
  }
  return rows;
}

// Weeks until the balance is projected to first go negative — null if it never does.
export function weeksUntilNegative(rows: ForecastWeek[]): number | null {
  const first = rows.find((r) => r.balance < 0);
  return first ? first.week : null;
}
