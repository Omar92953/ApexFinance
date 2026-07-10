import { describe, it, expect } from 'vitest';
import { computeReorderQty } from './reorder';

describe('computeReorderQty', () => {
  it('suggests enough units to reach the target cover', () => {
    // 2 units/day, want 30 days cover -> target stock 60, currently have 5 -> order 55
    const r = computeReorderQty(5, 2, 30);
    expect(r.targetStock).toBe(60);
    expect(r.suggestedQty).toBe(55);
  });

  it('suggests zero when stock already meets or exceeds target', () => {
    const r = computeReorderQty(100, 2, 30);
    expect(r.suggestedQty).toBe(0);
  });

  it('rounds the target stock up to a whole unit', () => {
    const r = computeReorderQty(0, 1.5, 10); // 15 exactly, no rounding needed
    expect(r.targetStock).toBe(15);
    const r2 = computeReorderQty(0, 1.4, 10); // 14 -> ceil stays 14
    expect(r2.targetStock).toBe(14);
    const r3 = computeReorderQty(0, 1.45, 10); // 14.5 -> ceil to 15
    expect(r3.targetStock).toBe(15);
  });

  it('never suggests a negative quantity', () => {
    const r = computeReorderQty(1000, 1, 5);
    expect(r.suggestedQty).toBe(0);
  });
});
