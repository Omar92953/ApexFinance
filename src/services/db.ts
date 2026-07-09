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
    return unwrap(await supabase.from('businesses').insert({ ...b, user_id }).select().single());
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
    return unwrap(await supabase.from('capital_accounts').insert({ ...a, user_id, opening_balance: opening, current_balance: opening }).select().single());
  },
  async removeAccount(id: string): Promise<void> {
    const { error } = await supabase.from('capital_accounts').delete().eq('id', id);
    if (error) throw error;
  },
  // Records a transaction (signed amount) and updates the account's running balance.
  async recordTransaction(t: {
    business_id: string; account_id: string; transaction_type: string; amount: number;
    category?: string; description?: string; date?: string; reference_type?: string; reference_id?: string;
  }): Promise<void> {
    const user_id = await uid();
    const acct = unwrap(await supabase.from('capital_accounts').select('current_balance').eq('id', t.account_id).single()) as { current_balance: number };
    const running = (Number(acct.current_balance) || 0) + t.amount;
    const { error } = await supabase.from('capital_transactions').insert({
      user_id, business_id: t.business_id, account_id: t.account_id, transaction_type: t.transaction_type,
      amount: t.amount, running_balance: running, category: t.category ?? null, description: t.description ?? null,
      date: t.date ?? new Date().toISOString().slice(0, 10), reference_type: t.reference_type ?? null, reference_id: t.reference_id ?? null,
    });
    if (error) throw error;
    const { error: uerr } = await supabase.from('capital_accounts').update({ current_balance: running }).eq('id', t.account_id);
    if (uerr) throw uerr;
  },
  async transfer(businessId: string, fromId: string, toId: string, amount: number, description?: string): Promise<void> {
    await this.recordTransaction({ business_id: businessId, account_id: fromId, transaction_type: 'transfer', amount: -Math.abs(amount), category: 'transfer', description: description ?? 'Transfer out' });
    await this.recordTransaction({ business_id: businessId, account_id: toId, transaction_type: 'transfer', amount: Math.abs(amount), category: 'transfer', description: description ?? 'Transfer in' });
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

    // Debit capital
    if (input.accountId && totalCost) {
      await capitalApi.recordTransaction({
        business_id: input.business_id, account_id: input.accountId, transaction_type: 'manufacturing',
        amount: -Math.abs(totalCost), category: 'manufacturing', description: `Manufacturing batch (${qty} units)`,
        reference_type: 'manufacturing_batch', reference_id: batch.id, date: input.date,
      });
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
