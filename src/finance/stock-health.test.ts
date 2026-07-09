import { describe, it, expect } from 'vitest';
import { classifyStockHealth, computeAvgDailyUnits, BELOW_SAFE_LEVEL_DAYS, OVERSTOCKED_DAYS } from './stock-health';

describe('computeAvgDailyUnits', () => {
  it('divides units by window days', () => {
    expect(computeAvgDailyUnits(60, 30)).toBe(2);
  });
  it('returns 0 when window is 0 (no divide-by-zero)', () => {
    expect(computeAvgDailyUnits(10, 0)).toBe(0);
  });
});

describe('classifyStockHealth', () => {
  it('flags zero stock as Out of Stock regardless of sales velocity', () => {
    const h = classifyStockHealth(0, 5);
    expect(h.status).toBe('out_of_stock');
    expect(h.daysOfCover).toBe(0);
  });

  it('flags negative stock as Out of Stock', () => {
    expect(classifyStockHealth(-3, 5).status).toBe('out_of_stock');
  });

  it('flags no sales history as No Sales Data even with stock on hand', () => {
    const h = classifyStockHealth(50, 0);
    expect(h.status).toBe('no_sales_data');
    expect(h.daysOfCover).toBeNull();
  });

  it('flags below the safe-level threshold as reorder-now', () => {
    // 1 unit/day, 5 units stock -> 5 days cover, under the 7-day threshold
    const h = classifyStockHealth(5, 1);
    expect(h.status).toBe('below_safe_level');
    expect(h.daysOfCover).toBe(5);
  });

  it('is healthy exactly at the safe-level boundary', () => {
    const h = classifyStockHealth(BELOW_SAFE_LEVEL_DAYS, 1);
    expect(h.status).toBe('healthy');
    expect(h.daysOfCover).toBe(BELOW_SAFE_LEVEL_DAYS);
  });

  it('is healthy exactly at the overstock boundary', () => {
    const h = classifyStockHealth(OVERSTOCKED_DAYS, 1);
    expect(h.status).toBe('healthy');
    expect(h.daysOfCover).toBe(OVERSTOCKED_DAYS);
  });

  it('flags well past the overstock threshold as Overstocked', () => {
    const h = classifyStockHealth(OVERSTOCKED_DAYS + 1, 1);
    expect(h.status).toBe('overstocked');
  });

  it('is healthy in the middle of the range', () => {
    const h = classifyStockHealth(20, 1);
    expect(h.status).toBe('healthy');
  });
});
