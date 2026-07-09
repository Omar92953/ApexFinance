// Pure stock-health classification. Given a variant's current stock and its
// recent average daily sales, tells you whether to worry — full-name status
// so it reads clearly in a table badge without a legend.

export type StockHealthStatus = 'out_of_stock' | 'below_safe_level' | 'healthy' | 'overstocked' | 'no_sales_data';

export interface StockHealth {
  status: StockHealthStatus;
  label: string;
  daysOfCover: number | null; // null when there's no sales history to estimate from
  avgDailyUnits: number;
}

// Below this many days of cover, reorder now. Above this many, you're overstocked.
export const BELOW_SAFE_LEVEL_DAYS = 7;
export const OVERSTOCKED_DAYS = 45;

export function computeAvgDailyUnits(unitsSoldInWindow: number, windowDays: number): number {
  return windowDays > 0 ? unitsSoldInWindow / windowDays : 0;
}

export function classifyStockHealth(stockQty: number, avgDailyUnits: number): StockHealth {
  if (stockQty <= 0) {
    return { status: 'out_of_stock', label: 'Out of Stock', daysOfCover: 0, avgDailyUnits };
  }
  if (avgDailyUnits <= 0) {
    return { status: 'no_sales_data', label: 'No Sales Data', daysOfCover: null, avgDailyUnits: 0 };
  }
  const daysOfCover = stockQty / avgDailyUnits;
  if (daysOfCover < BELOW_SAFE_LEVEL_DAYS) {
    return { status: 'below_safe_level', label: 'Below Safe Level — Reorder Now', daysOfCover, avgDailyUnits };
  }
  if (daysOfCover > OVERSTOCKED_DAYS) {
    return { status: 'overstocked', label: 'Overstocked', daysOfCover, avgDailyUnits };
  }
  return { status: 'healthy', label: 'Healthy Stock Level', daysOfCover, avgDailyUnits };
}
