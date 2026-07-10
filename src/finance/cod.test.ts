import { describe, it, expect } from 'vitest';
import { computeRtoRate } from './cod';

describe('computeRtoRate', () => {
  it('computes the RTO percentage among COD orders only', () => {
    const r = computeRtoRate([
      { payment_method: 'cod', is_rto: true },
      { payment_method: 'cod', is_rto: false },
      { payment_method: 'cod', is_rto: false },
      { payment_method: 'cod', is_rto: false },
      { payment_method: 'prepaid', is_rto: false },
    ]);
    expect(r.codCount).toBe(4);
    expect(r.rtoCount).toBe(1);
    expect(r.ratePct).toBe(25);
  });

  it('ignores prepaid orders entirely', () => {
    const r = computeRtoRate([{ payment_method: 'prepaid', is_rto: true }]);
    expect(r.codCount).toBe(0);
    expect(r.ratePct).toBe(0);
  });

  it('returns 0% when there are no COD orders (no divide-by-zero)', () => {
    const r = computeRtoRate([]);
    expect(r.ratePct).toBe(0);
  });

  it('is 100% when every COD order was refused', () => {
    const r = computeRtoRate([{ payment_method: 'cod', is_rto: true }, { payment_method: 'cod', is_rto: true }]);
    expect(r.ratePct).toBe(100);
  });
});
