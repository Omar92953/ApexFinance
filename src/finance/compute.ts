import { ProfitEngine, type ProfitConfig, type AdditionalCost } from './profit-engine';
import type { Business, AdditionalCostRow } from '@/services/db';
import { metricsApi, productsApi, shippingApi, costRulesApi } from '@/services/db';
import { supabase } from '@/lib/supabase';
import { computeLtvPredictions, type OrderRow } from './ltv-engine';
import { computeCostRules, type CostRuleBreakdown, type CostRuleContext, type CostCategory } from './cost-rules';

export interface MonthlyCostPoint extends Record<CostCategory, number> {
  month: string;
  label: string;
}

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

// Superseded by the Cost Rules Engine (src/finance/cost-rules.ts) — kept for
// any code still reading the legacy additional_costs table directly.
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

interface PeriodLineItems {
  variants: Awaited<ReturnType<typeof productsApi.listVariants>>;
  unitsBySku: Map<string, number>;
}

// Fetch variants + this period's order_line_items once — shared by the landed
// cost (COGS) calc and the cost-rules engine's per-product scoping.
async function fetchPeriodLineItems(business: Business, start: string, end: string): Promise<PeriodLineItems> {
  const [variants, lineItemsRes] = await Promise.all([
    productsApi.listVariants(business.id),
    supabase.from('order_line_items').select('sku, quantity').eq('business_id', business.id).gte('order_date', start).lte('order_date', end),
  ]);
  const lineItems = (lineItemsRes.data as Array<{ sku: string | null; quantity: number }> | null) || [];
  const unitsBySku = new Map<string, number>();
  for (const li of lineItems) {
    if (!li.sku) continue;
    unitsBySku.set(li.sku, (unitsBySku.get(li.sku) ?? 0) + (Number(li.quantity) || 0));
  }
  return { variants, unitsBySku };
}

// Per-product COGS from the product catalog + zone-based shipping.
// COGS: if per-product sales exist (order_line_items), Σ(qty × variant cost by SKU);
// else fall back to average variant cost × total units. Shipping: default zone flat
// rate × orders (a reasonable approximation until per-order zone data exists).
async function computeLandedCosts(business: Business, pli: PeriodLineItems, orders: number, units: number) {
  const { variants, unitsBySku } = pli;
  const costBySku = new Map(variants.filter((v) => v.sku).map((v) => [v.sku as string, Number(v.cost_per_item) || 0]));
  const avgCost = variants.length ? variants.reduce((s, v) => s + (Number(v.cost_per_item) || 0), 0) / variants.length : 0;

  let cogsTotal = 0;
  if (unitsBySku.size) {
    for (const [sku, qty] of unitsBySku) {
      const c = costBySku.has(sku) ? costBySku.get(sku)! : avgCost;
      cogsTotal += c * qty;
    }
  } else {
    cogsTotal = avgCost * units;
  }

  const zones = await shippingApi.listZones(business.id);
  const dz = zones.find((z) => z.is_default) || zones[0];
  const shippingCost = dz ? (Number(dz.flat_rate) || 0) * orders : 0;

  return { cogsTotal, shippingCost };
}

// Builds the (orders, units, revenue, unitsByVariant) context the Cost Rules
// Engine needs for a period. Exposed so UI (Cost Explorer, What-If Simulator)
// can run computeCostRules live without duplicating the fetch/mapping logic.
export async function buildCostRuleContext(business: Business, start: string, end: string): Promise<CostRuleContext> {
  const [metrics, pli] = await Promise.all([
    metricsApi.aggregate(business.id, start, end),
    fetchPeriodLineItems(business, start, end),
  ]);
  const orders = metrics['orders'] || 0;
  const units = metrics['units_sold'] || orders;
  const revenue = metrics['net_sales'] || 0;
  const unitsByVariant: Record<string, number> = {};
  for (const v of pli.variants) {
    if (v.sku && pli.unitsBySku.has(v.sku)) unitsByVariant[v.id] = pli.unitsBySku.get(v.sku)!;
  }
  return { periodStart: start, periodEnd: end, orders, units, revenue, unitsByVariant };
}

// Runs the Cost Rules Engine for the period: fetches active rules and maps
// this period's per-SKU units onto variant ids for product-scoped rules.
async function computeRuleCosts(
  business: Business,
  pli: PeriodLineItems,
  start: string,
  end: string,
  orders: number,
  units: number,
  revenue: number,
): Promise<CostRuleBreakdown> {
  const rules = await costRulesApi.list(business.id);
  const unitsByVariant: Record<string, number> = {};
  for (const v of pli.variants) {
    if (v.sku && pli.unitsBySku.has(v.sku)) unitsByVariant[v.id] = pli.unitsBySku.get(v.sku)!;
  }
  return computeCostRules(rules, { periodStart: start, periodEnd: end, orders, units, revenue, unitsByVariant });
}

// Automatically estimate LTV from real repeat-purchase history (order_line_items,
// synced from Shopify), looking back 12 months from `end`. Returns null when
// there isn't enough order history to estimate from — caller falls back to the
// AOV-multiplier estimate baked into ProfitEngine.
async function computeAutoLtv(business: Business, end: string): Promise<number | null> {
  const lookbackStart = new Date(end);
  lookbackStart.setFullYear(lookbackStart.getFullYear() - 1);
  const { data } = await supabase
    .from('order_line_items')
    .select('order_id, order_date, total_price')
    .eq('business_id', business.id)
    .gte('order_date', lookbackStart.toISOString().slice(0, 10))
    .lte('order_date', end);

  const rows = (data as Array<{ order_id: string; order_date: string; total_price: number }> | null) || [];
  if (!rows.length) return null;

  const byOrder = new Map<string, OrderRow>();
  for (const r of rows) {
    const existing = byOrder.get(r.order_id);
    if (existing) existing.order_value += Number(r.total_price) || 0;
    else byOrder.set(r.order_id, { order_id: r.order_id, order_date: r.order_date, order_value: Number(r.total_price) || 0 });
  }

  const preds = computeLtvPredictions(Array.from(byOrder.values()));
  return preds.hasData ? preds.ltv_365d : null;
}

// Category-stacked cost totals for the last N months (for the Cost Explorer's
// trend chart) — one computeCostRules pass per month using that month's actual
// order/unit/revenue metrics.
export async function computeMonthlyCostTrend(business: Business, months = 6): Promise<MonthlyCostPoint[]> {
  const rules = await costRulesApi.list(business.id);
  const now = new Date();
  const out: MonthlyCostPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const start = monthStart.toISOString().slice(0, 10);
    const end = monthEnd.toISOString().slice(0, 10);

    const ctx = await buildCostRuleContext(business, start, end);
    const breakdown = computeCostRules(rules, ctx);
    out.push({
      month: start.slice(0, 7),
      label: monthStart.toLocaleDateString('en-US', { month: 'short' }),
      ...breakdown.totalsByCategory,
    });
  }
  return out;
}

// Fetch everything for a business over a date range and compute the profit.
export async function computeBusinessProfit(business: Business, start: string, end: string) {
  const metrics = await metricsApi.aggregate(business.id, start, end);
  const orders = metrics['orders'] || 0;
  const units = metrics['units_sold'] || orders;
  const revenue = metrics['net_sales'] || 0;

  const pli = await fetchPeriodLineItems(business, start, end);
  const [landed, ruleCosts] = await Promise.all([
    computeLandedCosts(business, pli, orders, units),
    computeRuleCosts(business, pli, start, end, orders, units, revenue),
  ]);

  const config = buildProfitConfig(business);
  const calc = ProfitEngine.calculate(metrics, config, [], landed, { total: ruleCosts.total, byCategory: ruleCosts.totalsByCategory });

  const autoLtv = await computeAutoLtv(business, end);
  if (autoLtv !== null) calc.ltv = autoLtv;

  return calc;
}
