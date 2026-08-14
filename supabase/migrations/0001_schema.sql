-- ============================================================================
-- Apex Finance — Supabase schema (Postgres) + Row-Level Security
-- Run this once in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/ygzarhxoyqngvrdizlev/sql/new
-- Every table is owned by a user_id and protected by RLS so each account
-- can only read/write its own finance data.
-- ============================================================================

-- ---------- BUSINESSES (was "brands") ----------
create table if not exists businesses (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  logo                text,
  group_name          text,
  sort_order          int default 0,
  profit_model        text default 'percentage_of_profit',  -- percentage_of_sales | percentage_of_profit | fixed_monthly | hybrid | owner
  percentage_value    numeric default 0,
  fixed_amount        numeric default 0,
  is_owner            boolean default true,
  custom_be_roas      numeric,
  use_custom_be_roas  boolean default false,
  ltv_multiplier      numeric default 3.0,
  currency            text default 'USD',
  is_active           boolean default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ---------- ADDITIONAL COSTS (per_order | per_product | fixed) ----------
create table if not exists additional_costs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('per_order','per_product','fixed')),
  value       numeric not null default 0,
  period      text check (period in ('daily','weekly','monthly')),
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ---------- PRODUCT COST ITEMS (granular COGS) ----------
create table if not exists product_cost_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  business_id   uuid not null references businesses(id) on delete cascade,
  product_id    text,
  product_title text,
  name          text,
  category      text check (category in ('cogs','fulfillment','fixed')),
  basis         text check (basis in ('per_unit','per_order','fixed_amount')),
  value         numeric default 0,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- ---------- FINANCIAL INPUTS (assets / liabilities / equity / dividends) ----------
create table if not exists financial_inputs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  category    text not null check (category in (
                'current_asset','fixed_asset','current_liability',
                'long_term_liability','equity','distribution',
                'investing','financing','tax','depreciation')),
  name        text not null,
  value       numeric default 0,
  period      text,
  notes       text,
  updated_at  timestamptz default now(),
  unique (business_id, category, name)
);

-- ---------- RETAINED EARNINGS HISTORY ----------
create table if not exists retained_earnings_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  business_id     uuid not null references businesses(id) on delete cascade,
  period_end      text not null,
  opening_balance numeric default 0,
  net_income      numeric default 0,
  withdrawals     numeric default 0,
  closing_balance numeric default 0,
  created_at      timestamptz default now(),
  unique (business_id, period_end)
);

-- ---------- GOALS ----------
create table if not exists business_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  business_id  uuid not null references businesses(id) on delete cascade,
  period_type  text not null,                 -- monthly | quarterly | yearly
  period_key   text not null,                 -- '2026-06', '2026-Q2', '2026'
  metric_key   text not null,                 -- revenue | roas | profit | orders | cac | margin | ad_spend_budget
  target_value numeric default 0,
  is_suggested boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (business_id, period_type, period_key, metric_key)
);

-- ---------- METRICS CACHE (manual entry now; filled by sync in Phase 2) ----------
create table if not exists metrics_cache (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  business_id  uuid not null references businesses(id) on delete cascade,
  platform     text not null,                 -- shopify | meta | tiktok | google | manual
  metric_date  date not null,
  metric_type  text not null,                 -- gross_sales | net_sales | orders | meta_spend | units_sold ...
  metric_value numeric default 0,
  raw_data     jsonb,
  unique (business_id, platform, metric_date, metric_type)
);

-- ---------- ORDER LINE ITEMS (filled by sync; usable for LTV) ----------
create table if not exists order_line_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  business_id    uuid not null references businesses(id) on delete cascade,
  order_id       text not null,
  order_date     date not null,
  product_id     text,
  product_title  text,
  variant_title  text,
  sku            text,
  quantity       numeric default 0,
  unit_price     numeric default 0,
  total_price    numeric default 0,
  discount_amount numeric default 0,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  fetched_at     timestamptz default now()
);

-- ---------- CAMPAIGN CACHE (Phase 2) ----------
create table if not exists campaign_cache (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  business_id      uuid not null references businesses(id) on delete cascade,
  platform         text not null,
  entity_type      text not null,             -- campaign | adset | ad
  entity_id        text not null,
  entity_name      text,
  parent_id        text,
  metric_date      date not null,
  spend            numeric default 0,
  impressions      numeric default 0,
  clicks           numeric default 0,
  conversions      numeric default 0,
  conversion_value numeric default 0,
  roas             numeric default 0
);

-- ---------- REPORTS (saved statements as JSONB) ----------
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  report_type text,
  title       text,
  data        jsonb,
  created_at  timestamptz default now()
);

-- ---------- USER SETTINGS (one row per user) ----------
create table if not exists user_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  default_currency text default 'USD',
  theme          text default 'dark',
  settings       jsonb default '{}'::jsonb,
  updated_at     timestamptz default now()
);

-- ---------- API CREDENTIALS (Phase 2 — tokens read ONLY by Edge Functions) ----------
-- The client may insert/update its own row, but RLS below intentionally does NOT
-- grant SELECT on the token columns to end users from the browser. In Phase 2 the
-- Edge Functions read these via the service-role key, which bypasses RLS.
create table if not exists api_credentials (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  business_id  uuid not null references businesses(id) on delete cascade,
  platform     text not null,                 -- shopify | meta
  credentials  jsonb not null default '{}'::jsonb,  -- encrypted/secret payload
  is_valid     boolean default false,
  last_verified timestamptz,
  created_at   timestamptz default now(),
  unique (business_id, platform)
);

-- ============================================================================
-- ROW-LEVEL SECURITY — enable on every table, policy: auth.uid() = user_id
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'businesses','additional_costs','product_cost_items','financial_inputs',
    'retained_earnings_history','business_goals','metrics_cache',
    'order_line_items','campaign_cache','reports','api_credentials'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists own_rows on %I;', t);
    execute format(
      'create policy own_rows on %I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t);
  end loop;
end $$;

-- user_settings keyed by user_id directly
alter table user_settings enable row level security;
drop policy if exists own_settings on user_settings;
create policy own_settings on user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Helpful indexes
create index if not exists idx_costs_business     on additional_costs(business_id);
create index if not exists idx_pci_business        on product_cost_items(business_id);
create index if not exists idx_fininputs_business  on financial_inputs(business_id);
create index if not exists idx_goals_business      on business_goals(business_id);
create index if not exists idx_metrics_business    on metrics_cache(business_id, metric_date);
create index if not exists idx_oli_business         on order_line_items(business_id, order_date);
create index if not exists idx_campaign_business    on campaign_cache(business_id, metric_date);
