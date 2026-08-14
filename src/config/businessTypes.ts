// Business types and the capabilities each one turns on.
//
// The app is per-business, so one workspace can be an online store while
// another is an agency — the type decides which sections, KPIs and signal
// providers exist for that business. A preset is only a starting point:
// `capabilities` on the business row overrides any individual flag, because
// plenty of real businesses straddle categories (a retail shop that also runs
// ads, an agency that resells hardware).

export type BusinessType = 'ecommerce' | 'service' | 'retail' | 'wholesale';

export interface Capabilities {
  inventory: boolean;      // stock levels, WAC costing, reorder, stock health
  manufacturing: boolean;  // production batches + bill of materials
  purchasing: boolean;     // suppliers, purchase orders, AP
  cod: boolean;            // cash-on-delivery reconciliation + RTO tracking
  adSpend: boolean;        // MER / ROAS / CAC / break-even ROAS KPIs
  onlineStore: boolean;    // Shopify product & order sync
  projects: boolean;       // project / retainer / billable-time delivery
}

export const BUSINESS_TYPES: Array<{ key: BusinessType; label: string; blurb: string }> = [
  { key: 'ecommerce', label: 'E-commerce / online store', blurb: 'Sells products online. Stock, couriers, COD and ad spend.' },
  { key: 'retail', label: 'Retail shop', blurb: 'Physical store with stock, but no online sync or COD.' },
  { key: 'wholesale', label: 'Wholesale / B2B', blurb: 'Sells on credit terms to other businesses. Stock and purchase orders, no ads.' },
  { key: 'service', label: 'Service / agency', blurb: 'Bills for projects, retainers or time. No stock to track.' },
];

const PRESETS: Record<BusinessType, Capabilities> = {
  ecommerce: { inventory: true, manufacturing: true, purchasing: true, cod: true, adSpend: true, onlineStore: true, projects: false },
  retail: { inventory: true, manufacturing: true, purchasing: true, cod: false, adSpend: false, onlineStore: false, projects: false },
  wholesale: { inventory: true, manufacturing: true, purchasing: true, cod: false, adSpend: false, onlineStore: false, projects: false },
  service: { inventory: false, manufacturing: false, purchasing: true, cod: false, adSpend: false, onlineStore: false, projects: true },
};

export const CAPABILITY_LABELS: Record<keyof Capabilities, string> = {
  inventory: 'Stock & inventory',
  manufacturing: 'Manufacturing / BOM',
  purchasing: 'Suppliers & purchase orders',
  cod: 'Cash on delivery',
  adSpend: 'Ad spend metrics (MER / ROAS / CAC)',
  onlineStore: 'Online store sync (Shopify)',
  projects: 'Projects & billable work',
};

export function defaultCapabilities(type: BusinessType): Capabilities {
  return { ...PRESETS[type] };
}

// Preset for the type, with any explicit per-business overrides applied on top.
// Unknown types fall back to e-commerce, which is what every business created
// before types existed effectively was.
export function resolveCapabilities(type?: string | null, overrides?: Partial<Capabilities> | null): Capabilities {
  const base = defaultCapabilities((type as BusinessType) in PRESETS ? (type as BusinessType) : 'ecommerce');
  if (!overrides) return base;
  const out = { ...base };
  for (const key of Object.keys(base) as Array<keyof Capabilities>) {
    if (typeof overrides[key] === 'boolean') out[key] = overrides[key] as boolean;
  }
  return out;
}

// True when the business tracks physical goods at all — the distinction that
// decides whether "COGS" means stock consumed or labour delivered.
export function sellsPhysicalGoods(caps: Capabilities): boolean {
  return caps.inventory || caps.manufacturing;
}
