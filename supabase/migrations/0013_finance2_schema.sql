-- ============================================================================
-- Apex Business Manager — Phase 5: Finance 2.0 (month-close snapshots).
-- Self-contained: run ONCE in the SQL editor. No-login pattern + open_access.
-- Goals already exist (business_goals, from the original Phase 1 schema) —
-- nothing to add there.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

create table if not exists period_closes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  business_id        uuid not null references businesses(id) on delete cascade,
  period_key         text not null,   -- 'YYYY-MM'
  revenue            numeric default 0,
  cogs               numeric default 0,
  total_expenses     numeric default 0,
  net_income         numeric default 0,
  total_assets       numeric default 0,
  total_liabilities  numeric default 0,
  total_equity       numeric default 0,
  closed_at          timestamptz default now(),
  unique (business_id, period_key)
);

alter table period_closes enable row level security;
drop policy if exists open_access on period_closes;
create policy open_access on period_closes for all to anon, authenticated using (true) with check (true);

create index if not exists idx_period_closes_business on period_closes(business_id, period_key);
