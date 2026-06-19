import { ProfitEngine, type ProfitConfig, type AdditionalCost } from './profit-engine';
import type { Business, AdditionalCostRow } from '@/services/db';
import { metricsApi, costsApi } from '@/services/db';

export function daysBetween(start: string, end: string): number {
  return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
}

export function buildProfitConfig(b: Business): ProfitConfig {
  return {
    profitModel: b.profit_model,
    percentageValue: b.percentage_value ?? 0,
    fixedAmount: b.fixed_amount ?? 0,
    isOwner: b.is_owner ?? false,
    profitPercentage: b.percentage_value ?? 0,
    fixedFee: b.fixed_amount ?? 0,
    customBreakEvenRoas: b.custom_be_roas ?? null,
    useCustomBreakEvenRoas: b.use_custom_be_roas ?? false,
    ltvMultiplier: b.ltv_multiplier ?? 3,
  };
}

export function buildAdditionalCosts(
  rows: AdditionalCostRow[],
  orders: number,
  units: number,
  days: number,
): AdditionalCost[] {
  return rows
    .filter((c) => c.is_active !== false)
    .map((c) => ({
      type: c.type,
      value: Number(c.value) || 0,
      period: c.period ?? undefined,
      ordersInPeriod: orders,
      unitsInPeriod: units,
      daysInPeriod: days,
    }));
}

// Fetch everything for a business over a date range and compute the profit.
export async function computeBusinessProfit(business: Business, start: string, end: string) {
  const [metrics, costRows] = await Promise.all([
    metricsApi.aggregate(business.id, start, end),
    costsApi.list(business.id),
  ]);
  const days = daysBetween(start, end);
  const orders = metrics['orders'] || 0;
  const units = metrics['units_sold'] || orders;
  const additionalCosts = buildAdditionalCosts(costRows, orders, units, days);
  const config = buildProfitConfig(business);
  return ProfitEngine.calculate(metrics, config, additionalCosts);
}
