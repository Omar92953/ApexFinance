-- ============================================================================
-- Apex Business Manager — OPEN ACCESS (login disabled "for now").
-- Run this ONCE in the Supabase SQL editor. It replaces the per-user RLS
-- policies with permissive ones so the app works without signing in.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
--
-- ⚠️  SECURITY: after this, anyone with the anon key (public in the web build)
--     can read/write the data. Only use while there's no sensitive data.
-- To RESTORE login later: re-run the RLS sections of schema.sql + crm_schema.sql.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'businesses','additional_costs','product_cost_items','financial_inputs',
    'retained_earnings_history','business_goals','metrics_cache',
    'order_line_items','campaign_cache','reports','api_credentials',
    'contacts','contact_notes','contact_activities','deals','tasks','user_settings'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists own_rows on %I;', t);
    execute format('drop policy if exists own_settings on %I;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format(
      'create policy open_access on %I for all to anon, authenticated using (true) with check (true);',
      t);
  end loop;
end $$;
