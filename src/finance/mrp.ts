// MRP-lite — pure. Given a BOM's components and a target production quantity,
// how many of each component are still needed beyond what's already in stock.

export interface BomComponentStock {
  componentVariantId: string;
  quantityPerUnit: number;
  stockQty: number;
}

export interface MaterialShortfall {
  componentVariantId: string;
  qtyNeeded: number;
  qtyAvailable: number;
  shortfall: number;
}

export function computeMaterialShortfall(components: BomComponentStock[], targetQty: number): MaterialShortfall[] {
  return components.map((c) => {
    const qtyNeeded = c.quantityPerUnit * targetQty;
    const shortfall = Math.max(0, qtyNeeded - c.stockQty);
    return { componentVariantId: c.componentVariantId, qtyNeeded, qtyAvailable: c.stockQty, shortfall };
  });
}

// The largest quantity of finished units that can be produced right now given
// current component stock (limited by the tightest-constrained component).
export function computeMaxBuildable(components: BomComponentStock[]): number {
  if (components.length === 0) return 0;
  return Math.min(...components.map((c) => (c.quantityPerUnit > 0 ? Math.floor(c.stockQty / c.quantityPerUnit) : Infinity)));
}
