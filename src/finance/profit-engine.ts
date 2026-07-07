export type ProfitModel =
  | 'percentage_of_sales'
  | 'percentage_of_profit'
  | 'fixed_monthly'
  | 'hybrid'
  | 'owner';

export interface ProfitConfig {
  profitModel: ProfitModel;
  percentageValue: number;   // used by percentage_of_sales, percentage_of_profit, hybrid
  fixedAmount: number;       // used by fixed_monthly, hybrid
  isOwner: boolean;
  // legacy fields for backwards compatibility
  profitPercentage: number;
  fixedFee: number;
  // custom break-even ROAS override
  customBreakEvenRoas?: number | null;
  useCustomBreakEvenRoas?: boolean;
  // configurable LTV multiplier (default: 3.0)
  ltvMultiplier?: number;
}

export interface AdditionalCost {
  type: 'per_order' | 'per_product' | 'fixed';
  value: number;
  period?: 'daily' | 'weekly' | 'monthly'; // only for type='fixed'
  ordersInPeriod?: number;  // for per_order
  unitsInPeriod?: number;   // for per_product
  daysInPeriod?: number;    // for fixed
}

export interface ProfitCalculation {
  grossSales: number;
  netSales: number;
  totalAdSpend: number;
  metaSpend: number;
  tiktokSpend: number;
  googleSpend: number;
  additionalCosts: number;   // total of all additional costs
  perOrderCosts: number;
  perProductCosts: number;
  fixedCosts: number;
  cogsTotal: number;         // per-product COGS from the product catalog
  shippingCost: number;      // zone-based shipping
  netProfit: number;
  profitMargin: number;
  userProfit: number;
  userProfitMargin: number;
  autoBreakevenRoas: number;   // always the computed value
  breakevenRoas: number;       // effective: custom override if set, else auto
  cac: number;
  ltv: number;
  roas: number;
  orders: number;
}

export class ProfitEngine {
  static calculate(
    metrics: Record<string, number>,
    config: ProfitConfig,
    additionalCosts: AdditionalCost[] = [],
    landed: { cogsTotal?: number; shippingCost?: number } = {}
  ): ProfitCalculation {
    const grossSales = metrics['gross_sales'] || 0;
    const netSales = metrics['net_sales'] || 0;
    const metaSpend = metrics['meta_spend'] || metrics['spend'] || 0;
    const tiktokSpend = metrics['tiktok_spend'] || 0;
    const googleSpend = metrics['google_spend'] || 0;
    const totalAdSpend = metaSpend + tiktokSpend + googleSpend;
    const orders = metrics['orders'] || 0;
    const totalCustomers = metrics['total_customers'] || orders;

    // Sum additional costs by type
    let perOrderCosts = 0;
    let perProductCosts = 0;
    let fixedCosts = 0;

    for (const cost of additionalCosts) {
      if (cost.type === 'per_order') {
        perOrderCosts += cost.value * (cost.ordersInPeriod ?? 0);
      } else if (cost.type === 'per_product') {
        perProductCosts += cost.value * (cost.unitsInPeriod ?? 0);
      } else if (cost.type === 'fixed') {
        const days = cost.daysInPeriod ?? 30;
        if (cost.period === 'daily') {
          fixedCosts += cost.value * days;
        } else if (cost.period === 'weekly') {
          fixedCosts += (cost.value / 7) * days;
        } else {
          // monthly (default)
          fixedCosts += (cost.value / 30) * days;
        }
      }
    }

    const totalAdditionalCosts = perOrderCosts + perProductCosts + fixedCosts;

    // Per-product COGS + zone shipping (from the product catalog / compute layer)
    const cogsTotal = landed.cogsTotal ?? 0;
    const shippingCost = landed.shippingCost ?? 0;

    // Net Profit = Net Sales - Ad Spend - Additional Costs - COGS - Shipping
    const netProfit = netSales - totalAdSpend - totalAdditionalCosts - cogsTotal - shippingCost;

    // Profit Margin
    const profitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

    // Resolve effective profit model (handle legacy config where profitModel may be missing)
    const effectiveModel: ProfitModel = config.isOwner
      ? 'owner'
      : (config.profitModel || 'percentage_of_profit');
    const pct = config.percentageValue ?? config.profitPercentage ?? 0;
    const fixed = config.fixedAmount ?? config.fixedFee ?? 0;

    // User Profit — varies by profit model
    let userProfit = 0;
    switch (effectiveModel) {
      case 'percentage_of_sales':
        userProfit = netSales * (pct / 100);
        break;
      case 'percentage_of_profit':
        userProfit = netProfit * (pct / 100);
        break;
      case 'fixed_monthly':
        userProfit = fixed;
        break;
      case 'hybrid':
        userProfit = netProfit * (pct / 100) + fixed;
        break;
      case 'owner':
        userProfit = netProfit;
        break;
      default:
        if (pct > 0) userProfit = netProfit * (pct / 100);
        if (fixed > 0) userProfit += fixed;
    }

    const userProfitMargin = netProfit !== 0 ? (userProfit / netProfit) * 100 : 0;

    // Breakeven ROAS = 1 / (1 - costRatio)
    const costRatio = netSales > 0
      ? (totalAdSpend + totalAdditionalCosts) / netSales
      : 0;
    const autoBreakevenRoas = costRatio > 0 && costRatio < 1
      ? 1 / (1 - costRatio)
      : costRatio >= 1 ? 999 : 1.5;  // 999 = breakeven unreachable when costs exceed revenue
    const breakevenRoas = (config.useCustomBreakEvenRoas && config.customBreakEvenRoas && config.customBreakEvenRoas > 0)
      ? config.customBreakEvenRoas
      : autoBreakevenRoas;

    // CAC = Total Ad Spend / Number of Customers
    const cac = totalCustomers > 0 ? totalAdSpend / totalCustomers : 0;

    // LTV = AOV * ltvMultiplier (configurable per brand, default 3.0)
    // Always compute from components — the stored 'aov' metric is a SUM and must not be trusted
    const aov = orders > 0 ? netSales / orders : 0;
    const ltv = aov * (config.ltvMultiplier ?? 3);

    // ROAS = Revenue / Ad Spend
    const roas = totalAdSpend > 0 ? netSales / totalAdSpend : 0;

    return {
      grossSales,
      netSales,
      totalAdSpend,
      metaSpend,
      tiktokSpend,
      googleSpend,
      additionalCosts: totalAdditionalCosts,
      perOrderCosts,
      perProductCosts,
      fixedCosts,
      cogsTotal,
      shippingCost,
      netProfit,
      profitMargin,
      userProfit,
      userProfitMargin,
      autoBreakevenRoas,
      breakevenRoas,
      cac,
      ltv,
      roas,
      orders,
    };
  }

  static calculateGlobal(
    brandCalculations: Array<{ brandName: string; calculation: ProfitCalculation }>
  ): {
    totals: ProfitCalculation;
    topBrand: string | null;
    worstBrand: string | null;
  } {
    const totals: ProfitCalculation = {
      grossSales: 0,
      netSales: 0,
      totalAdSpend: 0,
      metaSpend: 0,
      tiktokSpend: 0,
      googleSpend: 0,
      additionalCosts: 0,
      perOrderCosts: 0,
      perProductCosts: 0,
      fixedCosts: 0,
      cogsTotal: 0,
      shippingCost: 0,
      netProfit: 0,
      profitMargin: 0,
      userProfit: 0,
      userProfitMargin: 0,
      autoBreakevenRoas: 0,
      breakevenRoas: 0,
      cac: 0,
      ltv: 0,
      roas: 0,
      orders: 0,
    };

    let topBrand: string | null = null;
    let worstBrand: string | null = null;
    let maxProfit = -Infinity;
    let minProfit = Infinity;

    for (const { brandName, calculation } of brandCalculations) {
      totals.grossSales += calculation.grossSales;
      totals.netSales += calculation.netSales;
      totals.totalAdSpend += calculation.totalAdSpend;
      totals.metaSpend += calculation.metaSpend;
      totals.tiktokSpend += calculation.tiktokSpend;
      totals.googleSpend += calculation.googleSpend;
      totals.additionalCosts += calculation.additionalCosts;
      totals.perOrderCosts += calculation.perOrderCosts;
      totals.perProductCosts += calculation.perProductCosts;
      totals.fixedCosts += calculation.fixedCosts;
      totals.cogsTotal += calculation.cogsTotal ?? 0;
      totals.shippingCost += calculation.shippingCost ?? 0;
      totals.netProfit += calculation.netProfit;
      totals.userProfit += calculation.userProfit;
      totals.orders += calculation.orders ?? 0;

      if (calculation.netProfit > maxProfit) {
        maxProfit = calculation.netProfit;
        topBrand = brandName;
      }
      if (calculation.netProfit < minProfit) {
        minProfit = calculation.netProfit;
        worstBrand = brandName;
      }
    }

    totals.profitMargin = totals.netSales > 0 ? (totals.netProfit / totals.netSales) * 100 : 0;
    totals.userProfitMargin = totals.netProfit !== 0 ? (totals.userProfit / totals.netProfit) * 100 : 0;
    totals.roas = totals.totalAdSpend > 0 ? totals.netSales / totals.totalAdSpend : 0;
    const costRatio = totals.netSales > 0
      ? (totals.totalAdSpend + totals.additionalCosts) / totals.netSales
      : 0;
    totals.autoBreakevenRoas = costRatio > 0 && costRatio < 1 ? 1 / (1 - costRatio) : 1.5;
    totals.breakevenRoas = totals.autoBreakevenRoas;
    // Weighted average CAC and LTV across all brands
    totals.cac = totals.orders > 0 ? totals.totalAdSpend / totals.orders : 0;
    totals.ltv = totals.orders > 0 ? (totals.netSales / totals.orders) * 3 : 0;

    return { totals, topBrand, worstBrand };
  }
}
