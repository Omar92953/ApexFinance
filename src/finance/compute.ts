import { ProfitEngine, type ProfitConfig, type AdditionalCost } from './profit-engine';
import type { Business, AdditionalCostRow } from '@/services/db';
import { metricsApi, costsApi, productsApi, shippingApi } from '@/services/db';
import { supabase } from '@/lib/supabase';

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

// Per-product COGS from the product catalog + zone-based shipping.
// COGS: if per-product sales exist (order_line_items), Σ(qty × variant cost by SKU);
// else fall back to average variant cost × total units. Shipping: default zone flat
// rate × orders (a reasonable approximation until per-order zone data exists).
async function computeLandedCosts(business: Business, start: string, end: string, orders: number, units: number) {
  const [variants, zones, lineItemsRes] = await Promise.all([
    productsApi.listVariants(business.id),
    shippingApi.listZones(business.id),
    supabase.from('order_line_items').select('sku, quantity').eq('business_id', business.id).gte('order_date', start).lte('order_date', end),
  ]);

  const costBySku = new Map(variants.filter((v) => v.sku).map((v) => [v.sku as string, Number(v.cost_per_item) || 0]));
  const avgCost = variants.length ? variants.reduce((s, v) => s + (Number(v.cost_per_item) || 0), 0) / variants.length : 0;

  const lineItems = (lineItemsRes.data as Array<{ sku: string | null; quantity: number }> | null) || [];
  let cogsTotal = 0;
  if (lineItems.length) {
    for (const li of lineItems) {
      const c = li.sku && costBySku.has(li.sku) ? costBySku.get(li.sku)! : avgCost;
      cogsTotal += c * (Number(li.quantity) || 0);
    }
  } else {
    cogsTotal = avgCost * units;
  }

  const dz = zones.find((z) => z.is_default) || zones[0];
  const shippingCost = dz ? (Number(dz.flat_rate) || 0) * orders : 0;

  return { cogsTotal, shippingCost };
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
  const landed = await computeLandedCosts(business, start, end, orders, units);
  return ProfitEngine.calculate(metrics, config, additionalCosts, landed);
}
