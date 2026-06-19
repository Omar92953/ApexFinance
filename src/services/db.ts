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
