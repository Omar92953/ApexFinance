import { supabase } from '@/lib/supabase';

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
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not authenticated');
  return data.user.id;
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
  // Trigger a sync via the Edge Function; returns the function's JSON result.
  async sync(businessId: string, platform: 'shopify' | 'meta', days = 30): Promise<any> {
    const fn = platform === 'shopify' ? 'sync-shopify' : 'sync-meta';
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
