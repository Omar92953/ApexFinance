// RFM (Recency/Frequency/Monetary) customer segmentation — pure, rule-based
// (not quintile-based, since a small business's customer count is too low for
// quintiles to be meaningful). Full-name segments so they read clearly without
// a legend.

export type RfmSegment = 'champion' | 'loyal' | 'promising' | 'at_risk' | 'lost' | 'none';

export const RFM_LABELS: Record<RfmSegment, string> = {
  champion: 'Champion',
  loyal: 'Loyal Customer',
  promising: 'Promising New Customer',
  at_risk: 'At Risk of Churning',
  lost: 'Lost Customer',
  none: 'No Orders Yet',
};

export interface RfmInput {
  ordersCount: number;
  lastOrderDate: string | null; // 'YYYY-MM-DD'
  asOf?: string; // defaults to now — pass explicitly in tests for determinism
}

const LOST_AFTER_DAYS = 180;
const CHAMPION_MIN_ORDERS = 3;
const CHAMPION_MAX_RECENCY_DAYS = 60;
const LOYAL_MIN_ORDERS = 2;
const LOYAL_MAX_RECENCY_DAYS = 120;
const PROMISING_MAX_RECENCY_DAYS = 30;

export function classifyRfmSegment(input: RfmInput): RfmSegment {
  if (input.ordersCount <= 0) return 'none';

  const asOf = input.asOf ? new Date(input.asOf) : new Date();
  const recencyDays = input.lastOrderDate
    ? Math.floor((asOf.getTime() - new Date(input.lastOrderDate).getTime()) / 86400000)
    : Infinity;

  if (recencyDays > LOST_AFTER_DAYS) return 'lost';
  if (input.ordersCount >= CHAMPION_MIN_ORDERS && recencyDays <= CHAMPION_MAX_RECENCY_DAYS) return 'champion';
  if (input.ordersCount >= LOYAL_MIN_ORDERS && recencyDays <= LOYAL_MAX_RECENCY_DAYS) return 'loyal';
  if (input.ordersCount >= LOYAL_MIN_ORDERS) return 'at_risk'; // 2+ orders but recency > 120d (and <= 180d, else already 'lost')
  if (input.ordersCount === 1 && recencyDays <= PROMISING_MAX_RECENCY_DAYS) return 'promising';
  return 'at_risk'; // single order, aging (30d < recency <= 180d)
}

export interface DealPipelineLike { stage: string; value: number }

// Weighted pipeline value — how much of the open pipeline to actually expect,
// based on how far along each deal is.
const DEFAULT_STAGE_WEIGHTS: Record<string, number> = { lead: 0.1, qualified: 0.3, proposal: 0.6, won: 1, lost: 0 };

export function computeWeightedPipelineValue(deals: DealPipelineLike[], weights: Record<string, number> = DEFAULT_STAGE_WEIGHTS): number {
  return deals.reduce((sum, d) => sum + d.value * (weights[d.stage] ?? 0), 0);
}

// Stage-to-stage conversion: what % of deals that ever reached stage A also
// reached (or passed) a later stage B. Simple version: % of all deals
// currently at-or-past each stage, relative to total deals (a snapshot funnel,
// not a true cohort — good enough without stage-transition history).
export function computeStageFunnel(deals: DealPipelineLike[], stageOrder: string[]): Array<{ stage: string; count: number; pct: number }> {
  const total = deals.length;
  if (total === 0) return stageOrder.map((s) => ({ stage: s, count: 0, pct: 0 }));
  const stageIndex = new Map(stageOrder.map((s, i) => [s, i]));
  return stageOrder.map((stage, i) => {
    const count = deals.filter((d) => (stageIndex.get(d.stage) ?? -1) >= i).length;
    return { stage, count, pct: (count / total) * 100 };
  });
}
