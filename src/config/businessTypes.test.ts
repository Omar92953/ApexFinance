import { describe, it, expect } from 'vitest';
import { defaultCapabilities, resolveCapabilities, sellsPhysicalGoods, BUSINESS_TYPES } from './businessTypes';
import { visibleSections, visibleSubTabs, sectionLabel, resolveSectionFor } from './businessSections';

describe('capability presets', () => {
  it('gives an online store the full product + ads + COD stack', () => {
    const c = defaultCapabilities('ecommerce');
    expect(c).toMatchObject({ inventory: true, cod: true, adSpend: true, onlineStore: true, projects: false });
  });

  it('gives a service business projects but no stock', () => {
    const c = defaultCapabilities('service');
    expect(c.projects).toBe(true);
    expect(c.inventory).toBe(false);
    expect(c.manufacturing).toBe(false);
    expect(c.cod).toBe(false);
    // Service businesses still buy things — purchasing stays on.
    expect(c.purchasing).toBe(true);
  });

  it('gives retail and wholesale stock without COD, ads or online sync', () => {
    for (const type of ['retail', 'wholesale'] as const) {
      const c = defaultCapabilities(type);
      expect(c.inventory).toBe(true);
      expect(c.cod).toBe(false);
      expect(c.adSpend).toBe(false);
      expect(c.onlineStore).toBe(false);
      expect(c.projects).toBe(false);
    }
  });

  it('exposes every type in the picker list', () => {
    expect(BUSINESS_TYPES.map((t) => t.key).sort()).toEqual(['ecommerce', 'retail', 'service', 'wholesale']);
  });
});

describe('resolveCapabilities', () => {
  it('treats an unknown or missing type as e-commerce (what pre-type businesses were)', () => {
    expect(resolveCapabilities(null)).toEqual(defaultCapabilities('ecommerce'));
    expect(resolveCapabilities('nonsense')).toEqual(defaultCapabilities('ecommerce'));
  });

  it('lets an override switch a single flag without disturbing the rest', () => {
    const c = resolveCapabilities('retail', { adSpend: true });
    expect(c.adSpend).toBe(true);
    expect(c.inventory).toBe(true);
    expect(c.cod).toBe(false);
  });

  it('can turn a preset capability off as well as on', () => {
    expect(resolveCapabilities('ecommerce', { cod: false }).cod).toBe(false);
  });

  it('ignores non-boolean override values', () => {
    const c = resolveCapabilities('service', { inventory: undefined });
    expect(c.inventory).toBe(false);
  });

  it('does not mutate the shared preset between calls', () => {
    const a = resolveCapabilities('service', { inventory: true });
    const b = resolveCapabilities('service');
    expect(a.inventory).toBe(true);
    expect(b.inventory).toBe(false);
  });
});

describe('sellsPhysicalGoods', () => {
  it('is true for any business tracking stock or production', () => {
    expect(sellsPhysicalGoods(defaultCapabilities('retail'))).toBe(true);
    expect(sellsPhysicalGoods(defaultCapabilities('service'))).toBe(false);
  });
});

describe('section gating', () => {
  const ecom = defaultCapabilities('ecommerce');
  const service = defaultCapabilities('service');

  it('hides Projects from a shop and Inventory-as-stock from an agency', () => {
    expect(visibleSections(ecom).map((s) => s.key)).not.toContain('projects');
    expect(visibleSections(service).map((s) => s.key)).toContain('projects');
    expect(visibleSubTabs('inventory', service).map((t) => t.key)).toEqual(['suppliers', 'purchase-orders']);
  });

  it('drops the COD tab for everyone except COD businesses', () => {
    expect(visibleSubTabs('sales', ecom).map((t) => t.key)).toContain('cod');
    expect(visibleSubTabs('sales', service).map((t) => t.key)).not.toContain('cod');
  });

  it('keeps universal sections for every type', () => {
    for (const caps of [ecom, service, defaultCapabilities('retail')]) {
      const keys = visibleSections(caps).map((s) => s.key);
      expect(keys).toEqual(expect.arrayContaining(['overview', 'finance', 'sales', 'crm', 'hr', 'setup']));
    }
  });

  it('renames the Inventory section to Purchasing when there is no stock to hold', () => {
    expect(sectionLabel('inventory', ecom)).toBe('Inventory');
    expect(sectionLabel('inventory', service)).toBe('Purchasing');
  });
});

describe('resolveSectionFor', () => {
  const service = defaultCapabilities('service');

  it('sends a disabled section back to Command rather than rendering blank', () => {
    expect(resolveSectionFor(service, 'projects', 'active')).toEqual({ section: 'projects', subTab: 'active' });
    expect(resolveSectionFor(defaultCapabilities('ecommerce'), 'projects', 'active').section).toBe('overview');
  });

  it('falls back to the first visible sub-tab when the default one is gated off', () => {
    // Inventory's default is 'products', which a service business cannot see.
    expect(resolveSectionFor(service, 'inventory')).toEqual({ section: 'inventory', subTab: 'suppliers' });
  });

  it('rejects a sub-tab the business type cannot access', () => {
    expect(resolveSectionFor(service, 'sales', 'cod').subTab).toBe('orders');
  });
});
