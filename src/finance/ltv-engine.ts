// LTV / cohort engine — ported from electron/core/ltv-engine.ts.
// Refactored to accept a plain orders array (browser-friendly) instead of a SQLite db.

export interface OrderRow {
  order_id: string;
  order_date: string; // 'YYYY-MM-DD'
  order_value: number;
}

export interface LtvPredictions {
  ltv_30d: number;
  ltv_90d: number;
  ltv_365d: number;
  aov: number;
  repeatRate30d: number;
  cac: number;
  ltv_cac_ratio: number;
  retentionCurve: Array<{ month: number; pct: number }>;
  hasData: boolean;
}

export function computeLtvPredictions(orders: OrderRow[]): LtvPredictions {
  if (!orders || orders.length === 0) {
    return { ltv_30d: 0, ltv_90d: 0, ltv_365d: 0, aov: 0, repeatRate30d: 0, cac: 0, ltv_cac_ratio: 0, retentionCurve: [], hasData: false };
  }

  const sorted = [...orders].sort((a, b) => a.order_date.localeCompare(b.order_date));
  const totalRevenue = sorted.reduce((s, o) => s + o.order_value, 0);
  const aov = totalRevenue / sorted.length;

  const customerFirstDate = new Map<string, string>();
  for (const o of sorted) {
    if (!customerFirstDate.has(o.order_id) || o.order_date < customerFirstDate.get(o.order_id)!) {
      customerFirstDate.set(o.order_id, o.order_date);
    }
  }

  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const newCusts30d = Array.from(customerFirstDate.values()).filter((d) => new Date(d) >= thirtyDaysAgo).length;
  const repeatOrders30d = sorted.filter((o) => {
    const firstDate = customerFirstDate.get(o.order_id);
    if (!firstDate) return false;
    const daysDiff = (new Date(o.order_date).getTime() - new Date(firstDate).getTime()) / 86400000;
    return daysDiff > 0 && daysDiff <= 30;
  }).length;
  const repeatRate30d = newCusts30d > 0 ? repeatOrders30d / newCusts30d : 0;

  const ltv_30d = aov * (1 + repeatRate30d);
  const ltv_90d = aov * (1 + repeatRate30d * 2);
  const ltv_365d = aov * Math.max(1, sorted.length / Math.max(1, customerFirstDate.size));

  const cohortSizes = new Map<string, number>();
  const retentionByMonth = new Map<number, number>();
  for (const [, firstDate] of customerFirstDate.entries()) {
    const acqMonth = firstDate.slice(0, 7);
    cohortSizes.set(acqMonth, (cohortSizes.get(acqMonth) ?? 0) + 1);
  }
  for (const o of sorted) {
    const firstDate = customerFirstDate.get(o.order_id);
    if (!firstDate) continue;
    const firstMs = new Date(firstDate.slice(0, 7) + '-01').getTime();
    const orderMs = new Date(o.order_date.slice(0, 7) + '-01').getTime();
    const monthsAfter = Math.round((orderMs - firstMs) / (30.44 * 86400000));
    if (monthsAfter > 0 && monthsAfter <= 12) {
      retentionByMonth.set(monthsAfter, (retentionByMonth.get(monthsAfter) ?? 0) + 1);
    }
  }

  const totalCohortSize = cohortSizes.size > 0 ? sorted.length / cohortSizes.size : 1;
  const retentionCurve: Array<{ month: number; pct: number }> = [{ month: 0, pct: 100 }];
  for (let m = 1; m <= 12; m++) {
    const active = retentionByMonth.get(m) ?? 0;
    retentionCurve.push({ month: m, pct: totalCohortSize > 0 ? Math.min(100, Math.round((active / totalCohortSize) * 100)) : 0 });
  }

  return {
    ltv_30d: Math.round(ltv_30d * 100) / 100,
    ltv_90d: Math.round(ltv_90d * 100) / 100,
    ltv_365d: Math.round(ltv_365d * 100) / 100,
    aov: Math.round(aov * 100) / 100,
    repeatRate30d: Math.round(repeatRate30d * 1000) / 10,
    cac: 0,
    ltv_cac_ratio: 0,
    retentionCurve,
    hasData: true,
  };
}
