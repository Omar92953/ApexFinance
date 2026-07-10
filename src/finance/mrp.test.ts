import { describe, it, expect } from 'vitest';
import { computeMaterialShortfall, computeMaxBuildable } from './mrp';

describe('computeMaterialShortfall', () => {
  it('reports zero shortfall when stock covers the target', () => {
    const r = computeMaterialShortfall([{ componentVariantId: 'a', quantityPerUnit: 2, stockQty: 100 }], 10);
    expect(r[0].qtyNeeded).toBe(20);
    expect(r[0].shortfall).toBe(0);
  });

  it('reports the exact shortfall when stock is insufficient', () => {
    const r = computeMaterialShortfall([{ componentVariantId: 'a', quantityPerUnit: 3, stockQty: 5 }], 10);
    expect(r[0].qtyNeeded).toBe(30);
    expect(r[0].shortfall).toBe(25);
  });

  it('handles multiple components independently', () => {
    const r = computeMaterialShortfall([
      { componentVariantId: 'a', quantityPerUnit: 1, stockQty: 50 },
      { componentVariantId: 'b', quantityPerUnit: 4, stockQty: 10 },
    ], 20);
    expect(r[0].shortfall).toBe(0);
    expect(r[1].shortfall).toBe(70);
  });
});

describe('computeMaxBuildable', () => {
  it('is limited by the tightest component', () => {
    const max = computeMaxBuildable([
      { componentVariantId: 'a', quantityPerUnit: 1, stockQty: 100 },
      { componentVariantId: 'b', quantityPerUnit: 5, stockQty: 20 },
    ]);
    expect(max).toBe(4);
  });

  it('returns 0 for an empty BOM', () => {
    expect(computeMaxBuildable([])).toBe(0);
  });

  it('floors partial units', () => {
    const max = computeMaxBuildable([{ componentVariantId: 'a', quantityPerUnit: 3, stockQty: 10 }]);
    expect(max).toBe(3);
  });
});
