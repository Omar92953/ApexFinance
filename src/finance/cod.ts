// COD (cash-on-delivery) reconciliation math — pure. RTO = "Return to Origin",
// i.e. the customer refused the package at the door — a key loss metric for
// COD-heavy e-commerce (common in Egypt).

export interface CodOrderLike { payment_method: string; is_rto: boolean }

export function computeRtoRate(orders: CodOrderLike[]): { codCount: number; rtoCount: number; ratePct: number } {
  const codOrders = orders.filter((o) => o.payment_method === 'cod');
  const rtoCount = codOrders.filter((o) => o.is_rto).length;
  return { codCount: codOrders.length, rtoCount, ratePct: codOrders.length > 0 ? (rtoCount / codOrders.length) * 100 : 0 };
}
