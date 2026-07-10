import { supabase } from '@/lib/supabase';
import { LOCAL_USER_ID } from '@/stores/authStore';

// ---------- Types ----------
export type ProfitModel =
  | 'percentage_of_sales'
  | 'percentage_of_profit'
  | 'fixed_monthly'
  | 'hybrid'
  | 'owner';

export interface Business {
  id: string;
  user_id?: string;
  name: string;
  logo?: string | null;
  group_name?: string | null;
  sort_order?: number;
  profit_model: ProfitModel;
  percentage_value: number;
  fixed_amount: number;
  is_owner: boolean;
  custom_be_roas?: number | null;
  use_custom_be_roas?: boolean;
  ltv_multiplier?: number;
  currency?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AdditionalCostRow {
  id: string;
  business_id: string;
  name: string;
  type: 'per_order' | 'per_product' | 'fixed';
  value: number;
  period?: 'daily' | 'weekly' | 'monthly' | null;
  is_active?: boolean;
}

export interface FinancialInputRow {
  id: string;
  business_id: string;
  category: string;
  name: string;
  value: number;
  period?: string | null;
  notes?: string | null;
}

export interface GoalRow {
  id: string;
  business_id: string;
  period_type: string;
  period_key: string;
  metric_key: string;
  target_value: number;
  is_suggested?: boolean;
}

export interface MetricRow {
  id?: string;
  business_id: string;
  platform: string;
  metric_date: string;
  metric_type: string;
  metric_value: number;
}

async function uid(): Promise<string> {
  // Login disabled: everything is stored under one shared local identity.
  return LOCAL_USER_ID;
}

function unwrap<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

// ---------- Businesses ----------
export const businessesApi = {
  async list(): Promise<Business[]> {
    return unwrap(
      await supabase.from('businesses').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    ) || [];
  },
  async get(id: string): Promise<Business> {
    return unwrap(await supabase.from('businesses').select('*').eq('id', id).single());
  },
  async create(b: Partial<Business>): Promise<Business> {
    const user_id = await uid();
    const created: Business = unwrap(await supabase.from('businesses').insert({ ...b, user_id }).select().single());
    try { await glApi.seedDefaultChart(created.id); } catch { /* GL is additive — a business is still usable without it */ }
    return created;
  },
  async update(id: string, patch: Partial<Business>): Promise<Business> {
    return unwrap(
      await supabase.from('businesses').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single(),
    );
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('businesses').delete().eq('id', id);
    if (error) throw error;
  },
};

// ---------- Additional costs ----------
export const costsApi = {
  async list(businessId: string): Promise<AdditionalCostRow[]> {
    return unwrap(await supabase.from('additional_costs').select('*').eq('business_id', businessId).order('created_at')) || [];
  },
  async create(c: Partial<AdditionalCostRow>): Promise<AdditionalCostRow> {
    const user_id = await uid();
    return unwrap(await supabase.from('additional_costs').insert({ ...c, user_id }).select().single());
  },
  async update(id: string, patch: Partial<AdditionalCostRow>): Promise<AdditionalCostRow> {
    return unwrap(await supabase.from('additional_costs').update(patch).eq('id', id).select().single());
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('additional_costs').delete().eq('id', id);
    if (error) throw error;
  },
};

// ---------- Financial inputs (assets / liabilities / equity / dividends) ----------
export const financialInputsApi = {
  async list(businessId: string): Promise<FinancialInputRow[]> {
    return unwrap(await supabase.from('financial_inputs').select('*').eq('business_id', businessId).order('category').order('name')) || [];
  },
  // Upsert by (business_id, category, name)
  async save(businessId: string, input: { category: string; name: string; value: number; period?: string | null; notes?: string | null }): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('financial_inputs').upsert(
      { user_id, business_id: businessId, ...input, updated_at: new Date().toISOString() },
      { onConflict: 'business_id,category,name' },
    );
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('financial_inputs').delete().eq('id', id);
    if (error) throw error;
  },
};

// ---------- Goals ----------
export const goalsApi = {
  async list(businessId: string): Promise<GoalRow[]> {
    return unwrap(await supabase.from('business_goals').select('*').eq('business_id', businessId)) || [];
  },
  async save(businessId: string, goal: { period_type: string; period_key: string; metric_key: string; target_value: number }): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('business_goals').upsert(
      { user_id, business_id: businessId, ...goal, updated_at: new Date().toISOString() },
      { onConflict: 'business_id,period_type,period_key,metric_key' },
    );
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('business_goals').delete().eq('id', id);
    if (error) throw error;
  },
};

// ---------- Metrics (manual entry now; sync-filled in Phase 2) ----------
export const metricsApi = {
  async listForRange(businessId: string, start: string, end: string): Promise<MetricRow[]> {
    return unwrap(
      await supabase.from('metrics_cache').select('*').eq('business_id', businessId).gte('metric_date', start).lte('metric_date', end),
    ) || [];
  },
  // Aggregate metric_value summed by metric_type across the range.
  async aggregate(businessId: string, start: string, end: string): Promise<Record<string, number>> {
    const rows = await this.listForRange(businessId, start, end);
    const agg: Record<string, number> = {};
    for (const r of rows) agg[r.metric_type] = (agg[r.metric_type] ?? 0) + Number(r.metric_value);
    return agg;
  },
  async upsertMany(businessId: string, rows: Array<{ platform: string; metric_date: string; metric_type: string; metric_value: number }>): Promise<void> {
    const user_id = await uid();
    const payload = rows.map((r) => ({ user_id, business_id: businessId, ...r }));
    const { error } = await supabase.from('metrics_cache').upsert(payload, { onConflict: 'business_id,platform,metric_date,metric_type' });
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('metrics_cache').delete().eq('id', id);
    if (error) throw error;
  },
};

// ---------- Reports (saved statements) ----------
export const reportsApi = {
  async list(businessId?: string): Promise<any[]> {
    let q = supabase.from('reports').select('*').order('created_at', { ascending: false });
    if (businessId) q = q.eq('business_id', businessId);
    return unwrap(await q) || [];
  },
  async save(businessId: string, report_type: string, title: string, data: any): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('reports').insert({ user_id, business_id: businessId, report_type, title, data });
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('reports').delete().eq('id', id);
    if (error) throw error;
  },
};

// ---------- Retained earnings history ----------
export const retainedApi = {
  async latestClosing(businessId: string): Promise<number> {
    const { data } = await supabase
      .from('retained_earnings_history')
      .select('closing_balance')
      .eq('business_id', businessId)
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.closing_balance ?? 0;
  },
};

// ---------- API credentials (Shopify / Meta) ----------
// We deliberately never SELECT the `credentials` (token) column back to the client —
// only connection status. Tokens are written here and read only by Edge Functions.
export interface ConnectionStatus {
  platform: string;
  is_valid: boolean;
  last_verified: string | null;
}

export const credentialsApi = {
  async status(businessId: string): Promise<ConnectionStatus[]> {
    return unwrap(
      await supabase.from('api_credentials').select('platform, is_valid, last_verified').eq('business_id', businessId),
    ) || [];
  },
  async connect(businessId: string, platform: 'shopify' | 'meta', credentials: Record<string, string>): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('api_credentials').upsert(
      { user_id, business_id: businessId, platform, credentials, is_valid: false },
      { onConflict: 'business_id,platform' },
    );
    if (error) throw error;
  },
  async disconnect(businessId: string, platform: 'shopify' | 'meta'): Promise<void> {
    const { error } = await supabase.from('api_credentials').delete().eq('business_id', businessId).eq('platform', platform);
    if (error) throw error;
  },
  // Trigger a sync via the named Edge Function; returns the function's JSON result.
  // fn: 'sync-shopify' (orders) | 'sync-shopify-products' | 'sync-shopify-customers' | 'sync-meta'
  async sync(businessId: string, fn: string, days = 30): Promise<any> {
    const { data, error } = await supabase.functions.invoke(fn, { body: { business_id: businessId, days } });
    if (error) throw error;
    return data;
  },
};

// ---------- CRM: contacts ----------
export interface Contact {
  id: string;
  business_id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  city?: string | null;
  country?: string | null;
  status: string;
  source: string;
  tags: string[];
  shopify_customer_id?: string | null;
  total_spent: number;
  orders_count: number;
  accepts_marketing: boolean;
  last_order_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DealRow {
  id: string;
  business_id: string;
  contact_id?: string | null;
  title: string;
  value: number;
  stage: string;
  notes?: string | null;
  expected_close?: string | null;
}

export interface TaskRow {
  id: string;
  business_id: string;
  contact_id?: string | null;
  deal_id?: string | null;
  title: string;
  due_date?: string | null;
  is_done: boolean;
}

async function logActivity(businessId: string, contactId: string, type: string, description: string) {
  try {
    const user_id = await uid();
    await supabase.from('contact_activities').insert({ user_id, business_id: businessId, contact_id: contactId, type, description });
  } catch { /* non-fatal */ }
}

export const contactsApi = {
  async list(businessId: string): Promise<Contact[]> {
    return unwrap(await supabase.from('contacts').select('*').eq('business_id', businessId).order('updated_at', { ascending: false })) || [];
  },
  async create(c: Partial<Contact>): Promise<Contact> {
    const user_id = await uid();
    const created: Contact = unwrap(await supabase.from('contacts').insert({ ...c, user_id }).select().single());
    await logActivity(created.business_id, created.id, 'created', 'Contact created');
    return created;
  },
  async update(id: string, patch: Partial<Contact>): Promise<Contact> {
    return unwrap(await supabase.from('contacts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single());
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) throw error;
  },
  // Trigger the Shopify customer import Edge Function.
  async importFromShopify(businessId: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('sync-shopify-customers', { body: { business_id: businessId } });
    if (error) throw error;
    return data;
  },
};

export const notesApi = {
  async list(contactId: string): Promise<Array<{ id: string; body: string; created_at: string }>> {
    return unwrap(await supabase.from('contact_notes').select('id, body, created_at').eq('contact_id', contactId).order('created_at', { ascending: false })) || [];
  },
  async add(businessId: string, contactId: string, body: string): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('contact_notes').insert({ user_id, business_id: businessId, contact_id: contactId, body });
    if (error) throw error;
    await logActivity(businessId, contactId, 'note', body.slice(0, 120));
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('contact_notes').delete().eq('id', id);
    if (error) throw error;
  },
};

export const activitiesApi = {
  async list(contactId: string): Promise<Array<{ id: string; type: string; description: string; created_at: string }>> {
    return unwrap(await supabase.from('contact_activities').select('id, type, description, created_at').eq('contact_id', contactId).order('created_at', { ascending: false })) || [];
  },
};

export const dealsApi = {
  async list(businessId: string): Promise<DealRow[]> {
    return unwrap(await supabase.from('deals').select('*').eq('business_id', businessId).order('created_at', { ascending: false })) || [];
  },
  async create(d: Partial<DealRow>): Promise<DealRow> {
    const user_id = await uid();
    return unwrap(await supabase.from('deals').insert({ ...d, user_id }).select().single());
  },
  async update(id: string, patch: Partial<DealRow>): Promise<DealRow> {
    return unwrap(await supabase.from('deals').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single());
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('deals').delete().eq('id', id);
    if (error) throw error;
  },
};

export const tasksApi = {
  async list(businessId: string): Promise<TaskRow[]> {
    return unwrap(await supabase.from('tasks').select('*').eq('business_id', businessId).order('due_date', { ascending: true, nullsFirst: false })) || [];
  },
  async create(t: Partial<TaskRow>): Promise<TaskRow> {
    const user_id = await uid();
    return unwrap(await supabase.from('tasks').insert({ ...t, user_id }).select().single());
  },
  async update(id: string, patch: Partial<TaskRow>): Promise<TaskRow> {
    return unwrap(await supabase.from('tasks').update(patch).eq('id', id).select().single());
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  },
};

// ---------- Products & variants ----------
export interface Product {
  id: string;
  business_id: string;
  handle?: string | null;
  title: string;
  vendor?: string | null;
  product_type?: string | null;
  tags: string[];
  status?: string;
  image_url?: string | null;
}

export interface ProductVariant {
  id: string;
  business_id: string;
  product_id: string;
  sku?: string | null;
  title?: string | null;
  price: number;
  compare_at_price?: number | null;
  cost_per_item: number;
  inventory_qty: number;
}

// Minimal RFC-4180 CSV parser (handles quoted fields with commas / newlines).
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== '')).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

// Pick the first non-empty value among possible header names (Shopify has two
// CSV export formats — classic "Variant SKU" and newer "SKU"/"URL handle").
function pick(r: Record<string, string>, names: string[]): string {
  for (const n of names) { const v = r[n]; if (v !== undefined && v !== '') return v; }
  return '';
}

export const productsApi = {
  async listProducts(businessId: string): Promise<Product[]> {
    return unwrap(await supabase.from('products').select('*').eq('business_id', businessId).order('title')) || [];
  },
  async listVariants(businessId: string): Promise<ProductVariant[]> {
    return unwrap(await supabase.from('product_variants').select('*').eq('business_id', businessId).order('created_at')) || [];
  },
  async createProduct(p: Partial<Product>): Promise<Product> {
    const user_id = await uid();
    const created: Product = unwrap(await supabase.from('products').insert({ ...p, user_id }).select().single());
    return created;
  },
  async updateVariant(id: string, patch: Partial<ProductVariant>): Promise<void> {
    const { error } = await supabase.from('product_variants').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
  async createVariant(v: Partial<ProductVariant>): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('product_variants').insert({ ...v, user_id });
    if (error) throw error;
  },
  async removeProduct(id: string): Promise<void> {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
  },
  async removeVariant(id: string): Promise<void> {
    const { error } = await supabase.from('product_variants').delete().eq('id', id);
    if (error) throw error;
  },
  // Set stock to an absolute value and log the delta as an inventory adjustment.
  async setStock(businessId: string, variantId: string, newQty: number, oldQty: number): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('product_variants').update({ inventory_qty: newQty, updated_at: new Date().toISOString() }).eq('id', variantId);
    if (error) throw error;
    const delta = newQty - oldQty;
    if (delta !== 0) {
      await supabase.from('inventory_movements').insert({
        user_id, business_id: businessId, variant_id: variantId, movement_type: 'adjustment',
        quantity: delta, notes: 'Manual stock adjustment',
      });
    }
  },
  // Bulk-set one field across many variants (cost_per_item | price | inventory_qty).
  async bulkSet(ids: string[], field: 'cost_per_item' | 'price' | 'inventory_qty', value: number): Promise<void> {
    const { error } = await supabase.from('product_variants').update({ [field]: value, updated_at: new Date().toISOString() }).in('id', ids);
    if (error) throw error;
  },
  // Units sold per SKU in a trailing window — feeds stock-health classification.
  async unitsSoldBySku(businessId: string, days = 30): Promise<Record<string, number>> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data } = await supabase
      .from('order_line_items')
      .select('sku, quantity')
      .eq('business_id', businessId)
      .gte('order_date', since.toISOString().slice(0, 10));
    const map: Record<string, number> = {};
    for (const r of (data as Array<{ sku: string | null; quantity: number }> | null) || []) {
      if (!r.sku) continue;
      map[r.sku] = (map[r.sku] || 0) + (Number(r.quantity) || 0);
    }
    return map;
  },

  // Import Shopify's standard product CSV export.
  async importFromShopifyCsv(businessId: string, csvText: string): Promise<{ products: number; variants: number }> {
    const user_id = await uid();
    const rows = parseCsv(csvText);
    if (rows.length === 0) return { products: 0, variants: 0 };

    // Group rows by Handle; carry product-level fields from the first row of each handle.
    const groups = new Map<string, { product: any; variants: any[] }>();
    for (const r of rows) {
      // handle: classic "Handle" or newer "URL handle"; else derive from title.
      const title = pick(r, ['Title', 'title']);
      let handle = pick(r, ['Handle', 'handle', 'URL handle']);
      if (!handle) handle = title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
      if (!handle) continue;
      if (!groups.has(handle)) {
        groups.set(handle, {
          product: {
            business_id: businessId, user_id, handle,
            title: title || handle,
            vendor: pick(r, ['Vendor']) || null,
            product_type: pick(r, ['Type', 'Product Type', 'Product category']) || null,
            tags: pick(r, ['Tags']) ? pick(r, ['Tags']).split(',').map((t) => t.trim()).filter(Boolean) : [],
            status: (pick(r, ['Status']) || 'active').toLowerCase(),
            image_url: pick(r, ['Image Src', 'Product image URL', 'Variant image URL']) || null,
          },
          variants: [],
        });
      }
      const g = groups.get(handle)!;
      const price = parseFloat(pick(r, ['Variant Price', 'Price']) || '0');
      const sku = pick(r, ['Variant SKU', 'SKU']);
      const compareRaw = pick(r, ['Variant Compare At Price', 'Compare-at price']);
      const costRaw = pick(r, ['Cost per item']);
      const optionValues = [
        pick(r, ['Option1 Value', 'Option1 value']),
        pick(r, ['Option2 Value', 'Option2 value']),
        pick(r, ['Option3 Value', 'Option3 value']),
      ].filter((v) => v && v !== 'Default Title').join(' / ');
      if (sku || price || optionValues) {
        g.variants.push({
          business_id: businessId, user_id,
          sku: sku || `${handle}-${g.variants.length + 1}`,
          title: optionValues || 'Default',
          price: price || 0,
          compare_at_price: compareRaw ? parseFloat(compareRaw) : null,
          cost_per_item: costRaw ? parseFloat(costRaw) : 0,
        });
      }
    }

    // Upsert products, then variants (need product ids).
    const productRows = Array.from(groups.values()).map((g) => g.product);
    const savedProducts: Product[] = unwrap(
      await supabase.from('products').upsert(productRows, { onConflict: 'business_id,handle' }).select(),
    ) || [];
    const handleToId = new Map(savedProducts.map((p) => [p.handle, p.id]));

    const variantRows: any[] = [];
    for (const [handle, g] of groups) {
      const pid = handleToId.get(handle);
      if (!pid) continue;
      for (const v of g.variants) variantRows.push({ ...v, product_id: pid });
    }
    if (variantRows.length) {
      const { error } = await supabase.from('product_variants').upsert(variantRows, { onConflict: 'business_id,sku' });
      if (error) throw error;
    }
    return { products: productRows.length, variants: variantRows.length };
  },
};

// ---------- Per-product cost breakdown (materials / labor / packaging / other) ----------
// Reuses the legacy `product_cost_items` table (product_id stored as the
// variant's uuid, as text). The line items are a UI convenience: saving
// recomputes their sum and writes it to the variant's cost_per_item, which
// remains the single source of truth the profit engine reads (WAC).
export interface CostBreakdownItem {
  id: string;
  product_id: string; // variant id (text)
  name: string;
  category: string;   // materials | labor | packaging | other
  value: number;
}

export const productCostItemsApi = {
  async list(variantId: string): Promise<CostBreakdownItem[]> {
    return unwrap(await supabase.from('product_cost_items').select('*').eq('product_id', variantId).eq('is_active', true).order('created_at')) || [];
  },
  async add(businessId: string, variantId: string, item: { name: string; category: string; value: number }): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('product_cost_items').insert({
      user_id, business_id: businessId, product_id: variantId, name: item.name,
      category: item.category, basis: 'per_unit', value: item.value, is_active: true,
    });
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('product_cost_items').delete().eq('id', id);
    if (error) throw error;
  },
  // Sum active line items and write the total to the variant's cost_per_item.
  async applyToVariant(variantId: string): Promise<number> {
    const items = await this.list(variantId);
    const total = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
    const { error } = await supabase.from('product_variants').update({ cost_per_item: total, updated_at: new Date().toISOString() }).eq('id', variantId);
    if (error) throw error;
    return total;
  },
};

// ---------- Cost rules (Phase 2 cost engine) ----------
export type { CostCategory, AllocationBasis, CostRule } from '@/finance/cost-rules';
import type { CostRule } from '@/finance/cost-rules';

export interface CostRuleRow extends CostRule {
  business_id: string;
}

export const costRulesApi = {
  async list(businessId: string): Promise<CostRuleRow[]> {
    return unwrap(await supabase.from('cost_rules').select('*').eq('business_id', businessId).order('category').order('name')) || [];
  },
  async create(businessId: string, rule: Omit<CostRule, 'id'>): Promise<CostRuleRow> {
    const user_id = await uid();
    return unwrap(await supabase.from('cost_rules').insert({ ...rule, business_id: businessId, user_id }).select().single());
  },
  async update(id: string, patch: Partial<CostRule>): Promise<CostRuleRow> {
    return unwrap(await supabase.from('cost_rules').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single());
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('cost_rules').delete().eq('id', id);
    if (error) throw error;
  },
};

export interface CostBudgetRow {
  id: string;
  business_id: string;
  category: string;
  month: string; // 'YYYY-MM'
  budget_amount: number;
}

export const costBudgetsApi = {
  async list(businessId: string, month?: string): Promise<CostBudgetRow[]> {
    let q = supabase.from('cost_budgets').select('*').eq('business_id', businessId);
    if (month) q = q.eq('month', month);
    return unwrap(await q) || [];
  },
  async save(businessId: string, category: string, month: string, budget_amount: number): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('cost_budgets').upsert(
      { user_id, business_id: businessId, category, month, budget_amount },
      { onConflict: 'business_id,category,month' },
    );
    if (error) throw error;
  },
};

// ---------- Shipping zones ----------
export interface ShippingZone {
  id: string;
  business_id: string;
  name: string;
  flat_rate: number;
  is_default: boolean;
  sort_order?: number;
}

export const shippingApi = {
  async listZones(businessId: string): Promise<ShippingZone[]> {
    return unwrap(await supabase.from('shipping_zones').select('*').eq('business_id', businessId).order('sort_order')) || [];
  },
  async createZone(z: Partial<ShippingZone>): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('shipping_zones').insert({ ...z, user_id });
    if (error) throw error;
  },
  async updateZone(id: string, patch: Partial<ShippingZone>): Promise<void> {
    const { error } = await supabase.from('shipping_zones').update(patch).eq('id', id);
    if (error) throw error;
  },
  async removeZone(id: string): Promise<void> {
    const { error } = await supabase.from('shipping_zones').delete().eq('id', id);
    if (error) throw error;
  },
};

// ---------- Capital (cash) ----------
export interface CapitalAccount {
  id: string;
  business_id: string;
  name: string;
  account_type: string;
  gl_account_id?: string | null;
  opening_balance: number;
  current_balance: number;
  currency?: string;
}

export interface CapitalTransaction {
  id: string;
  business_id: string;
  account_id: string;
  transaction_type: string;
  amount: number;
  running_balance: number;
  category?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  description?: string | null;
  date: string;
}

export const capitalApi = {
  async listAccounts(businessId: string): Promise<CapitalAccount[]> {
    return unwrap(await supabase.from('capital_accounts').select('*').eq('business_id', businessId).order('created_at')) || [];
  },
  async createAccount(a: Partial<CapitalAccount>): Promise<CapitalAccount> {
    const user_id = await uid();
    const opening = Number(a.opening_balance) || 0;
    const created: CapitalAccount = unwrap(await supabase.from('capital_accounts').insert({ ...a, user_id, opening_balance: opening, current_balance: opening }).select().single());
    try { await glApi.ensureCapitalAccountGL(created.business_id, created.id, created.name); } catch { /* GL is additive */ }
    return created;
  },
  async removeAccount(id: string): Promise<void> {
    const { error } = await supabase.from('capital_accounts').delete().eq('id', id);
    if (error) throw error;
  },
  // Records a transaction (signed amount), updates the account's running balance,
  // and — unless it's a manufacturing/transfer leg (posted by their own callers
  // with more specific context) — auto-posts a balanced entry to the General Ledger.
  async recordTransaction(t: {
    business_id: string; account_id: string; transaction_type: string; amount: number;
    category?: string; description?: string; date?: string; reference_type?: string; reference_id?: string;
  }): Promise<void> {
    const user_id = await uid();
    const acct = unwrap(await supabase.from('capital_accounts').select('current_balance, gl_account_id').eq('id', t.account_id).single()) as { current_balance: number; gl_account_id: string | null };
    const running = (Number(acct.current_balance) || 0) + t.amount;
    const tx: { id: string } = unwrap(await supabase.from('capital_transactions').insert({
      user_id, business_id: t.business_id, account_id: t.account_id, transaction_type: t.transaction_type,
      amount: t.amount, running_balance: running, category: t.category ?? null, description: t.description ?? null,
      date: t.date ?? new Date().toISOString().slice(0, 10), reference_type: t.reference_type ?? null, reference_id: t.reference_id ?? null,
    }).select('id').single());
    const { error: uerr } = await supabase.from('capital_accounts').update({ current_balance: running }).eq('id', t.account_id);
    if (uerr) throw uerr;

    if (acct.gl_account_id && t.category !== 'manufacturing' && t.category !== 'transfer') {
      try {
        const amt = Math.abs(t.amount);
        const glAccountId = acct.gl_account_id;
        let otherCode: string | null;
        let debitIsCapital: boolean;
        if (t.category === 'profit') { otherCode = '3020'; debitIsCapital = true; }
        else if (t.transaction_type === 'expense') { otherCode = CATEGORY_TO_CODE[t.category ?? ''] ?? '5120'; debitIsCapital = false; }
        else if (t.transaction_type === 'income') { otherCode = CATEGORY_TO_CODE[t.category ?? ''] ?? '4030'; debitIsCapital = true; }
        else if (t.transaction_type === 'deposit') { otherCode = '3010'; debitIsCapital = true; }
        else if (t.transaction_type === 'withdrawal') { otherCode = '3030'; debitIsCapital = false; }
        else { otherCode = null; debitIsCapital = true; }

        if (otherCode) {
          const other = await glApi.findByCode(t.business_id, otherCode);
          if (other) {
            await glApi.postEntry({
              business_id: t.business_id, date: t.date, source_type: 'capital_transaction', source_id: tx.id,
              memo: t.description || `${t.transaction_type}${t.category ? ' · ' + t.category : ''}`,
              lines: debitIsCapital
                ? [{ account_id: glAccountId, debit: amt }, { account_id: other.id, credit: amt }]
                : [{ account_id: other.id, debit: amt }, { account_id: glAccountId, credit: amt }],
            });
          }
        }
      } catch { /* GL posting is additive — don't block the cash transaction if it fails */ }
    }
  },
  async transfer(businessId: string, fromId: string, toId: string, amount: number, description?: string): Promise<void> {
    await this.recordTransaction({ business_id: businessId, account_id: fromId, transaction_type: 'transfer', amount: -Math.abs(amount), category: 'transfer', description: description ?? 'Transfer out' });
    await this.recordTransaction({ business_id: businessId, account_id: toId, transaction_type: 'transfer', amount: Math.abs(amount), category: 'transfer', description: description ?? 'Transfer in' });
    try {
      const [fromAcct, toAcct] = await Promise.all([
        supabase.from('capital_accounts').select('gl_account_id').eq('id', fromId).single(),
        supabase.from('capital_accounts').select('gl_account_id').eq('id', toId).single(),
      ]);
      const fromGl = fromAcct.data?.gl_account_id, toGl = toAcct.data?.gl_account_id;
      if (fromGl && toGl) {
        await glApi.postEntry({
          business_id: businessId, source_type: 'transfer', source_id: null,
          memo: description || 'Transfer between accounts',
          lines: [{ account_id: toGl, debit: Math.abs(amount) }, { account_id: fromGl, credit: Math.abs(amount) }],
        });
      }
    } catch { /* GL posting is additive */ }
  },
  async listTransactions(businessId: string, limit = 200): Promise<CapitalTransaction[]> {
    return unwrap(await supabase.from('capital_transactions').select('*').eq('business_id', businessId).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(limit)) || [];
  },
  async removeTransaction(id: string): Promise<void> {
    const { error } = await supabase.from('capital_transactions').delete().eq('id', id);
    if (error) throw error;
  },
};

// ---------- Manufacturing & inventory ----------
export interface ManufacturingBatch {
  id: string;
  business_id: string;
  batch_number?: string | null;
  product_id?: string | null;
  variant_id?: string | null;
  quantity_produced: number;
  total_cost: number;
  cost_per_unit: number;
  status: string;
  notes?: string | null;
  date: string;
}

export const manufacturingApi = {
  async listBatches(businessId: string): Promise<ManufacturingBatch[]> {
    return unwrap(await supabase.from('manufacturing_batches').select('*').eq('business_id', businessId).order('date', { ascending: false })) || [];
  },
  // Records a production batch: creates the batch + cost items, adds an inventory
  // movement, debits capital, and updates the variant's WAC cost + stock.
  async createBatch(input: {
    business_id: string; variant_id: string; product_id?: string | null; quantity: number;
    costItems: Array<{ name: string; category: string; value: number }>;
    accountId?: string | null; date?: string; notes?: string; batchNumber?: string;
  }): Promise<void> {
    const user_id = await uid();
    const totalCost = input.costItems.reduce((s, c) => s + (Number(c.value) || 0), 0);
    const qty = Number(input.quantity) || 0;
    const costPerUnit = qty > 0 ? totalCost / qty : 0;

    const batch: ManufacturingBatch = unwrap(await supabase.from('manufacturing_batches').insert({
      user_id, business_id: input.business_id, batch_number: input.batchNumber ?? null,
      product_id: input.product_id ?? null, variant_id: input.variant_id,
      quantity_produced: qty, total_cost: totalCost, cost_per_unit: costPerUnit,
      status: 'completed', notes: input.notes ?? null, date: input.date ?? new Date().toISOString().slice(0, 10),
      completed_at: new Date().toISOString(),
    }).select().single());

    if (input.costItems.length) {
      await supabase.from('manufacturing_cost_items').insert(
        input.costItems.filter((c) => c.name || c.value).map((c) => ({ user_id, business_id: input.business_id, batch_id: batch.id, name: c.name, category: c.category, value: Number(c.value) || 0 })),
      );
    }

    await supabase.from('inventory_movements').insert({
      user_id, business_id: input.business_id, product_id: input.product_id ?? null, variant_id: input.variant_id,
      movement_type: 'manufacture_in', quantity: qty, cost_basis: costPerUnit,
      reference_type: 'manufacturing_batch', reference_id: batch.id, date: input.date ?? new Date().toISOString().slice(0, 10),
    });

    // Debit capital, then post Dr Inventory / Cr [capital account's GL] — the batch
    // itself posts this (rather than recordTransaction's generic mapper) since it
    // knows the money became inventory, not an expense.
    if (input.accountId && totalCost) {
      await capitalApi.recordTransaction({
        business_id: input.business_id, account_id: input.accountId, transaction_type: 'manufacturing',
        amount: -Math.abs(totalCost), category: 'manufacturing', description: `Manufacturing batch (${qty} units)`,
        reference_type: 'manufacturing_batch', reference_id: batch.id, date: input.date,
      });
      try {
        const [inventoryAccount, capAcct] = await Promise.all([
          glApi.findByCode(input.business_id, '1060'),
          supabase.from('capital_accounts').select('gl_account_id').eq('id', input.accountId).single(),
        ]);
        const capGl = capAcct.data?.gl_account_id;
        if (inventoryAccount && capGl) {
          await glApi.postEntry({
            business_id: input.business_id, date: input.date, source_type: 'manufacturing', source_id: batch.id,
            memo: `Manufacturing batch (${qty} units)`,
            lines: [{ account_id: inventoryAccount.id, debit: totalCost }, { account_id: capGl, credit: totalCost }],
          });
        }
      } catch { /* GL posting is additive */ }
    }

    // Update variant WAC + stock
    const variant = unwrap(await supabase.from('product_variants').select('inventory_qty, cost_per_item').eq('id', input.variant_id).single()) as { inventory_qty: number; cost_per_item: number };
    const existQty = Number(variant.inventory_qty) || 0;
    const existCost = Number(variant.cost_per_item) || 0;
    const newQty = existQty + qty;
    const newCost = newQty > 0 ? (existQty * existCost + qty * costPerUnit) / newQty : costPerUnit;
    await supabase.from('product_variants').update({ inventory_qty: newQty, cost_per_item: newCost, updated_at: new Date().toISOString() }).eq('id', input.variant_id);
  },
};

// ---------- General Ledger (double-entry, Phase 4) ----------
import { isBalanced, computeTrialBalance, type TrialBalance, type TrialBalanceLine, type AccountType } from '@/finance/ledger';

export interface ChartAccount {
  id: string;
  business_id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  is_active: boolean;
}

export interface JournalEntryRow {
  id: string;
  business_id: string;
  date: string;
  memo: string | null;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
}

export interface JournalLineRow {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string | null;
  account?: { code: string; name: string; type: AccountType };
}

// Kept in sync with the default chart seeded by supabase/gl_schema.sql — used
// to auto-seed new businesses created after that migration ran.
const DEFAULT_CHART: Array<{ code: string; name: string; type: AccountType; subtype: string | null }> = [
  { code: '1010', name: 'Cash', type: 'asset', subtype: 'cash' },
  { code: '1020', name: 'Bank', type: 'asset', subtype: 'cash' },
  { code: '1030', name: 'Mobile Wallet', type: 'asset', subtype: 'cash' },
  { code: '1040', name: 'COD Receivable', type: 'asset', subtype: 'current' },
  { code: '1050', name: 'Accounts Receivable', type: 'asset', subtype: 'current' },
  { code: '1060', name: 'Inventory', type: 'asset', subtype: 'current' },
  { code: '1070', name: 'Prepaid Expenses', type: 'asset', subtype: 'current' },
  { code: '1080', name: 'Equipment', type: 'asset', subtype: 'fixed' },
  { code: '2010', name: 'Accounts Payable', type: 'liability', subtype: 'current' },
  { code: '2020', name: 'Credit Card Payable', type: 'liability', subtype: 'current' },
  { code: '2030', name: 'Taxes Payable', type: 'liability', subtype: 'current' },
  { code: '2040', name: 'Accrued Expenses', type: 'liability', subtype: 'current' },
  { code: '2050', name: 'Business Loans', type: 'liability', subtype: 'long_term' },
  { code: '3010', name: "Owner's Equity", type: 'equity', subtype: null },
  { code: '3020', name: 'Retained Earnings', type: 'equity', subtype: null },
  { code: '3030', name: "Owner's Drawings", type: 'equity', subtype: null },
  { code: '4010', name: 'Sales Revenue', type: 'income', subtype: null },
  { code: '4020', name: 'Shipping Income', type: 'income', subtype: null },
  { code: '4030', name: 'Other Income', type: 'income', subtype: null },
  { code: '5010', name: 'Cost of Goods Sold', type: 'expense', subtype: 'cogs' },
  { code: '5020', name: 'Fulfillment & Shipping', type: 'expense', subtype: 'fulfillment' },
  { code: '5030', name: 'Ad Spend - Meta', type: 'expense', subtype: 'marketing' },
  { code: '5040', name: 'Ad Spend - TikTok', type: 'expense', subtype: 'marketing' },
  { code: '5050', name: 'Ad Spend - Google', type: 'expense', subtype: 'marketing' },
  { code: '5060', name: 'Marketing - Other', type: 'expense', subtype: 'marketing' },
  { code: '5070', name: 'Salaries & Wages', type: 'expense', subtype: 'overhead' },
  { code: '5080', name: 'Rent', type: 'expense', subtype: 'overhead' },
  { code: '5090', name: 'Software & Tools', type: 'expense', subtype: 'overhead' },
  { code: '5100', name: 'Courier & COD Fees', type: 'expense', subtype: 'fees' },
  { code: '5110', name: 'Payment Gateway Fees', type: 'expense', subtype: 'fees' },
  { code: '5120', name: 'Overhead - Other', type: 'expense', subtype: 'overhead' },
  { code: '5130', name: 'Bank & Interest Charges', type: 'expense', subtype: 'fees' },
];

// Maps a capital-transaction category (including the Cost Rules categories) to
// the expense/income account it auto-posts against.
const CATEGORY_TO_CODE: Record<string, string> = {
  cogs: '5010', fulfillment: '5020', marketing: '5060', overhead: '5120', fees: '5110',
  sales: '4010', shipping: '4020',
};

export const glApi = {
  async listAccounts(businessId: string): Promise<ChartAccount[]> {
    return unwrap(await supabase.from('chart_of_accounts').select('*').eq('business_id', businessId).eq('is_active', true).order('code')) || [];
  },
  async findByCode(businessId: string, code: string): Promise<ChartAccount | null> {
    return (await supabase.from('chart_of_accounts').select('*').eq('business_id', businessId).eq('code', code).maybeSingle()).data ?? null;
  },
  // Idempotent — does nothing if the business already has any accounts.
  async seedDefaultChart(businessId: string): Promise<void> {
    const existing = await this.listAccounts(businessId);
    if (existing.length > 0) return;
    const user_id = await uid();
    const { error } = await supabase.from('chart_of_accounts').insert(DEFAULT_CHART.map((a) => ({ ...a, business_id: businessId, user_id })));
    if (error) throw error;
  },
  // Creates a dedicated Cash-type GL account for a capital account and links it (1:1).
  async ensureCapitalAccountGL(businessId: string, capitalAccountId: string, name: string): Promise<string> {
    const user_id = await uid();
    const code = `CASH-${capitalAccountId.slice(0, 8)}`;
    const created: ChartAccount = unwrap(await supabase.from('chart_of_accounts')
      .insert({ user_id, business_id: businessId, code, name, type: 'asset', subtype: 'cash' }).select().single());
    await supabase.from('capital_accounts').update({ gl_account_id: created.id }).eq('id', capitalAccountId);
    return created.id;
  },
  // The only write path into the ledger — validates balance client-side for a
  // fast error, then posts via the RPC, which re-validates atomically server-side.
  async postEntry(input: {
    business_id: string; date?: string; memo?: string; source_type?: string; source_id?: string | null;
    lines: Array<{ account_id: string; debit?: number; credit?: number; description?: string }>;
  }): Promise<string> {
    if (!isBalanced(input.lines)) throw new Error('Journal entry is not balanced (debits must equal credits).');
    const user_id = await uid();
    const { data, error } = await supabase.rpc('post_journal_entry', {
      p_business_id: input.business_id, p_user_id: user_id,
      p_date: input.date ?? new Date().toISOString().slice(0, 10),
      p_memo: input.memo ?? null, p_source_type: input.source_type ?? 'manual', p_source_id: input.source_id ?? null,
      p_lines: input.lines.map((l) => ({ account_id: l.account_id, debit: l.debit ?? 0, credit: l.credit ?? 0, description: l.description ?? null })),
    });
    if (error) throw error;
    return data as string;
  },
  async listEntries(businessId: string, opts: { start?: string; end?: string; limit?: number } = {}): Promise<Array<JournalEntryRow & { lines: JournalLineRow[] }>> {
    let q = supabase.from('journal_entries').select('*').eq('business_id', businessId).order('date', { ascending: false }).order('created_at', { ascending: false });
    if (opts.start) q = q.gte('date', opts.start);
    if (opts.end) q = q.lte('date', opts.end);
    if (opts.limit) q = q.limit(opts.limit);
    const entries: JournalEntryRow[] = unwrap(await q) || [];
    if (!entries.length) return [];
    const ids = entries.map((e) => e.id);
    const lines: JournalLineRow[] = unwrap(
      await supabase.from('journal_lines').select('*, account:chart_of_accounts(code,name,type)').in('journal_entry_id', ids),
    ) || [];
    const byEntry = new Map<string, JournalLineRow[]>();
    for (const l of lines) { const arr = byEntry.get(l.journal_entry_id) ?? []; arr.push(l); byEntry.set(l.journal_entry_id, arr); }
    return entries.map((e) => ({ ...e, lines: byEntry.get(e.id) ?? [] }));
  },
  async getTrialBalance(businessId: string, asOfDate?: string): Promise<TrialBalance> {
    let q = supabase.from('journal_entries').select('id').eq('business_id', businessId);
    if (asOfDate) q = q.lte('date', asOfDate);
    const entries: Array<{ id: string }> = unwrap(await q) || [];
    if (!entries.length) return computeTrialBalance([]);
    const ids = entries.map((e) => e.id);
    const rows: any[] = unwrap(
      await supabase.from('journal_lines').select('debit, credit, account:chart_of_accounts(id,code,name,type,subtype)').in('journal_entry_id', ids),
    ) || [];
    const lines: TrialBalanceLine[] = rows.filter((r) => r.account).map((r) => ({
      account_id: r.account.id, account_code: r.account.code, account_name: r.account.name,
      account_type: r.account.type, account_subtype: r.account.subtype,
      debit: Number(r.debit) || 0, credit: Number(r.credit) || 0,
    }));
    return computeTrialBalance(lines);
  },
  // One-time conversion of legacy manual Assets & Liabilities (financial_inputs)
  // and each capital account's opening balance into proper opening journal
  // entries. Safe to click more than once — already-posted entries are skipped.
  async postOpeningBalances(businessId: string): Promise<{ posted: number; skipped: number }> {
    const [accounts, existingEntries, capitalAccounts, inputs] = await Promise.all([
      this.listAccounts(businessId),
      supabase.from('journal_entries').select('source_id').eq('business_id', businessId).eq('source_type', 'opening_balance'),
      capitalApi.listAccounts(businessId),
      financialInputsApi.list(businessId),
    ]);
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const equity = byCode.get('3010');
    if (!equity) throw new Error('Chart of accounts not seeded for this business yet.');
    const alreadyPosted = new Set(((existingEntries.data as Array<{ source_id: string | null }>) || []).map((e) => e.source_id));

    let posted = 0, skipped = 0;

    // 1) Each capital account's opening balance: Dr [account's GL] / Cr Owner's Equity.
    for (const acct of capitalAccounts) {
      if (alreadyPosted.has(acct.id)) { skipped++; continue; }
      const opening = Number(acct.opening_balance) || 0;
      if (!opening || !acct.gl_account_id) continue;
      await this.postEntry({
        business_id: businessId, source_type: 'opening_balance', source_id: acct.id,
        memo: `Opening balance — ${acct.name}`,
        lines: opening >= 0
          ? [{ account_id: acct.gl_account_id, debit: Math.abs(opening) }, { account_id: equity.id, credit: Math.abs(opening) }]
          : [{ account_id: equity.id, debit: Math.abs(opening) }, { account_id: acct.gl_account_id, credit: Math.abs(opening) }],
      });
      posted++;
    }

    // 2) Legacy financial_inputs balance-sheet fields → one combined entry, plugged to equity.
    if (alreadyPosted.has(null)) { skipped++; }
    else {
      const FIELD_CODE: Record<string, string> = {
        'A/R Payouts': '1050', 'Inventory Value': '1060', 'Prepaid Credits': '1070', 'Equipment': '1080',
        'Supplier Payable': '2010', 'Credit Card Balance': '2020', 'Tax Payable': '2030', 'Accrued Expenses': '2040',
        'Business Loans': '2050', 'Owner Investment': '3010',
      };
      const DEBIT_FIELDS = new Set(['A/R Payouts', 'Inventory Value', 'Prepaid Credits', 'Equipment']);
      const lines: Array<{ account_id: string; debit?: number; credit?: number; description?: string }> = [];
      let totalDebit = 0, totalCredit = 0;
      for (const inp of inputs) {
        const code = FIELD_CODE[inp.name];
        const account = code ? byCode.get(code) : null;
        const value = Number(inp.value) || 0;
        if (!account || !value) continue;
        if (DEBIT_FIELDS.has(inp.name)) { lines.push({ account_id: account.id, debit: value, description: inp.name }); totalDebit += value; }
        else { lines.push({ account_id: account.id, credit: value, description: inp.name }); totalCredit += value; }
      }
      if (lines.length) {
        const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
        if (diff > 0) lines.push({ account_id: equity.id, credit: diff, description: "Plug to Owner's Equity" });
        else if (diff < 0) lines.push({ account_id: equity.id, debit: -diff, description: "Plug to Owner's Equity" });
        await this.postEntry({ business_id: businessId, source_type: 'opening_balance', source_id: null, memo: 'Opening balances from Assets & Liabilities', lines });
        posted++;
      }
    }

    return { posted, skipped };
  },
};

// ---------- Procurement & Purchasing (Phase 6) ----------
export interface Supplier {
  id: string;
  business_id: string;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface PurchaseOrder {
  id: string;
  business_id: string;
  supplier_id?: string | null;
  po_number?: string | null;
  status: string;
  order_date: string;
  expected_date?: string | null;
  notes?: string | null;
}

export interface PurchaseOrderLine {
  id: string;
  purchase_order_id: string;
  variant_id?: string | null;
  description?: string | null;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
}

export interface SupplierBill {
  id: string;
  business_id: string;
  supplier_id?: string | null;
  purchase_order_id?: string | null;
  bill_number?: string | null;
  amount: number;
  amount_paid: number;
  status: string;
  bill_date: string;
  due_date?: string | null;
}

export const suppliersApi = {
  async list(businessId: string): Promise<Supplier[]> {
    return unwrap(await supabase.from('suppliers').select('*').eq('business_id', businessId).order('name')) || [];
  },
  async create(s: Partial<Supplier>): Promise<Supplier> {
    const user_id = await uid();
    return unwrap(await supabase.from('suppliers').insert({ ...s, user_id }).select().single());
  },
  async update(id: string, patch: Partial<Supplier>): Promise<void> {
    const { error } = await supabase.from('suppliers').update(patch).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw error;
  },
};

export const purchaseOrdersApi = {
  async list(businessId: string): Promise<PurchaseOrder[]> {
    return unwrap(await supabase.from('purchase_orders').select('*').eq('business_id', businessId).order('order_date', { ascending: false })) || [];
  },
  async listLines(purchaseOrderId: string): Promise<PurchaseOrderLine[]> {
    return unwrap(await supabase.from('purchase_order_lines').select('*').eq('purchase_order_id', purchaseOrderId)) || [];
  },
  // Creates a draft PO with its lines in one go.
  async create(businessId: string, po: { supplier_id?: string | null; po_number?: string; expected_date?: string; notes?: string },
    lines: Array<{ variant_id?: string | null; description?: string; quantity_ordered: number; unit_cost: number }>): Promise<PurchaseOrder> {
    const user_id = await uid();
    const created: PurchaseOrder = unwrap(await supabase.from('purchase_orders').insert({ ...po, business_id: businessId, user_id, status: 'draft' }).select().single());
    if (lines.length) {
      const { error } = await supabase.from('purchase_order_lines').insert(
        lines.map((l) => ({ ...l, business_id: businessId, user_id, purchase_order_id: created.id })),
      );
      if (error) throw error;
    }
    return created;
  },
  async updateStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase.from('purchase_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
    if (error) throw error;
  },
  // Atomic: records a goods receipt, updates inventory (WAC + qty), creates the
  // supplier bill, and posts the Dr Inventory/Cr AP journal entry.
  async receive(businessId: string, purchaseOrderId: string, lines: Array<{ po_line_id: string; quantity_received: number; unit_cost: number }>, billNumber?: string, dueDate?: string): Promise<string> {
    const user_id = await uid();
    const { data, error } = await supabase.rpc('receive_purchase_order', {
      p_business_id: businessId, p_user_id: user_id, p_purchase_order_id: purchaseOrderId,
      p_lines: lines, p_bill_number: billNumber ?? null, p_due_date: dueDate ?? null,
    });
    if (error) throw error;
    return data as string;
  },
};

export const supplierBillsApi = {
  async list(businessId: string): Promise<SupplierBill[]> {
    return unwrap(await supabase.from('supplier_bills').select('*').eq('business_id', businessId).order('due_date', { ascending: true, nullsFirst: false })) || [];
  },
  // Atomic: debits the bill's balance, credits the capital account, and posts
  // the Dr AP/Cr Cash journal entry.
  async pay(businessId: string, billId: string, capitalAccountId: string, amount: number, date?: string): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.rpc('pay_supplier_bill', {
      p_business_id: businessId, p_user_id: user_id, p_bill_id: billId,
      p_capital_account_id: capitalAccountId, p_amount: amount, p_date: date ?? new Date().toISOString().slice(0, 10),
    });
    if (error) throw error;
  },
};

// ---------- Period closes (month-close snapshots, Phase 5) ----------
export interface PeriodCloseRow {
  id: string;
  business_id: string;
  period_key: string; // 'YYYY-MM'
  revenue: number;
  cogs: number;
  total_expenses: number;
  net_income: number;
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  closed_at: string;
}

export const periodClosesApi = {
  async list(businessId: string): Promise<PeriodCloseRow[]> {
    return unwrap(await supabase.from('period_closes').select('*').eq('business_id', businessId).order('period_key', { ascending: false })) || [];
  },
  async close(businessId: string, snapshot: Omit<PeriodCloseRow, 'id' | 'business_id' | 'closed_at'>): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('period_closes').upsert(
      { user_id, business_id: businessId, ...snapshot, closed_at: new Date().toISOString() },
      { onConflict: 'business_id,period_key' },
    );
    if (error) throw error;
  },
};

// ---------- User settings ----------
export const settingsApi = {
  async get(): Promise<{ default_currency: string; theme: string; settings: any } | null> {
    const { data } = await supabase.from('user_settings').select('*').maybeSingle();
    return data;
  },
  async save(patch: { default_currency?: string; theme?: string; settings?: any }): Promise<void> {
    const user_id = await uid();
    const { error } = await supabase.from('user_settings').upsert(
      { user_id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
  },
};
