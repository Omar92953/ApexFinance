// Why did profit move? — a margin bridge.
//
// Knowing profit fell 40k is useless on its own. The bridge decomposes the
// change between two periods into the drivers you can actually act on: did you
// sell less, discount harder, pay more for goods, or overspend on ads?
//
// Classic variance analysis: hold everything constant except one factor at a
// time, so the pieces add back to the total exactly.

export interface PeriodSnapshot {
  units: number;
  revenue: number;
  cogs: number;
  adSpend: number;
  otherCosts: number;
}

export interface BridgeStep {
  key: string;
  label: string;
  amount: number;      // signed contribution to the change in net profit
  explanation: string;
}

export interface MarginBridge {
  fromProfit: number;
  toProfit: number;
  change: number;
  steps: BridgeStep[];
}

const netProfitOf = (p: PeriodSnapshot) => p.revenue - p.cogs - p.adSpend - p.otherCosts;

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

export function computeMarginBridge(from: PeriodSnapshot, to: PeriodSnapshot): MarginBridge {
  const fromProfit = netProfitOf(from);
  const toProfit = netProfitOf(to);

  const fromPrice = safeDiv(from.revenue, from.units);
  const toPrice = safeDiv(to.revenue, to.units);
  const fromUnitCost = safeDiv(from.cogs, from.units);
  const toUnitCost = safeDiv(to.cogs, to.units);
  const unitChange = to.units - from.units;

  // Volume: same price and unit cost as before, just more or fewer units.
  const volume = unitChange * (fromPrice - fromUnitCost);
  // Price: the units you actually sold, at the new price versus the old.
  const price = to.units * (toPrice - fromPrice);
  // Cost: the units you actually sold, at the new unit cost versus the old.
  const cost = -to.units * (toUnitCost - fromUnitCost);
  const ads = -(to.adSpend - from.adSpend);
  const other = -(to.otherCosts - from.otherCosts);

  const steps: BridgeStep[] = [
    { key: 'volume', label: 'Volume', amount: volume, explanation: unitChange >= 0 ? `Sold ${unitChange} more units` : `Sold ${Math.abs(unitChange)} fewer units` },
    { key: 'price', label: 'Price / mix', amount: price, explanation: toPrice >= fromPrice ? 'Average selling price rose' : 'Average selling price fell — discounting or mix shift' },
    { key: 'cost', label: 'Unit cost', amount: cost, explanation: toUnitCost <= fromUnitCost ? 'Goods got cheaper per unit' : 'Goods got more expensive per unit' },
    { key: 'ads', label: 'Ad spend', amount: ads, explanation: to.adSpend >= from.adSpend ? 'Spent more on advertising' : 'Spent less on advertising' },
    { key: 'other', label: 'Other costs', amount: other, explanation: to.otherCosts >= from.otherCosts ? 'Other costs rose' : 'Other costs fell' },
  ];

  // Any residual is rounding plus the price×volume interaction term; folding it
  // into a visible line keeps the bridge honest rather than silently off.
  const explained = steps.reduce((s, x) => s + x.amount, 0);
  const residual = (toProfit - fromProfit) - explained;
  if (Math.abs(residual) > 0.01) {
    steps.push({ key: 'other-mix', label: 'Mix interaction', amount: residual, explanation: 'Combined effect of price and volume moving together' });
  }

  return { fromProfit, toProfit, change: toProfit - fromProfit, steps };
}

// --- Attribution -------------------------------------------------------------
export interface ContributionRow {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  contribution: number;
  marginPct: number;
  sharePct: number;   // share of total positive contribution
}

// Ranks any dimension (product, channel, customer) by what it actually
// contributes, not by revenue — the two orderings often disagree, and revenue
// is the one that misleads.
export function rankContribution(rows: Array<{ key: string; label: string; revenue: number; cost: number }>): ContributionRow[] {
  const withContribution = rows.map((r) => {
    const contribution = r.revenue - r.cost;
    return { ...r, contribution, marginPct: r.revenue > 0 ? (contribution / r.revenue) * 100 : 0 };
  });
  const totalPositive = withContribution.reduce((s, r) => s + Math.max(0, r.contribution), 0);
  return withContribution
    .map((r) => ({ ...r, sharePct: totalPositive > 0 ? (Math.max(0, r.contribution) / totalPositive) * 100 : 0 }))
    .sort((a, b) => b.contribution - a.contribution);
}

// The few lines carrying most of the profit — where a small change matters most.
export function topContributors(rows: ContributionRow[], sharePct = 80): ContributionRow[] {
  const out: ContributionRow[] = [];
  let cumulative = 0;
  for (const r of rows) {
    if (r.contribution <= 0) break;
    out.push(r);
    cumulative += r.sharePct;
    if (cumulative >= sharePct) break;
  }
  return out;
}

export function lossMakers(rows: ContributionRow[]): ContributionRow[] {
  return rows.filter((r) => r.contribution < 0);
}
