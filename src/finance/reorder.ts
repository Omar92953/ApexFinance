// Reorder suggestion math — pure. Given a variant's current stock, its recent
// sales velocity, and a target cover (how many days of stock you want on
// hand), how many units to order right now.

export interface ReorderSuggestion {
  suggestedQty: number;
  targetStock: number;
}

// targetCoverDays: how many days of stock you want on hand after reordering.
export function computeReorderQty(stockQty: number, avgDailyUnits: number, targetCoverDays: number): ReorderSuggestion {
  const targetStock = Math.ceil(avgDailyUnits * targetCoverDays);
  const suggestedQty = Math.max(0, targetStock - stockQty);
  return { suggestedQty, targetStock };
}
