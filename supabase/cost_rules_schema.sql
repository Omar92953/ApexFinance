-- ============================================================================
-- Apex Business Manager — Phase 2: Cost Rules Engine (replaces the flat
-- per-order/per-product/fixed cost model). Self-contained: run ONCE in the
-- SQL editor. No-login pattern (user_id has no auth FK) + open_access policy.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

create table if not exists cost_rules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  business_id    uuid not null references businesses(id) on delete cascade,
  name           text not null,
  category       text not null check (category in ('cogs','fulfillment','marketing','overhead','fees')),
  basis          text not null check (basis in ('per_unit','per_order','percent_of_revenue','fixed_daily','fixed_weekly','fixed_monthly')),
  value          numeric not null default 0,
  scope_type     text not null default 'none' check (scope_type in ('none','product')),
  scope_id       uuid,              -- product_variants.id when scope_type = 'product'
  effective_from date not null default current_date,
  effective_to   date,              -- null = ongoing
  is_active      boolean not null default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table if not exists cost_budgets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  business_id    uuid not null references businesses(id) on delete cascade,
  category       text not null check (category in ('cogs','fulfillment','marketing','overhead','fees')),
  month          text not null,     -- 'YYYY-MM'
  budget_amount  numeric not null default 0,
  created_at     timestamptz default now(),
  unique (business_id, category, month)
);

-- One-time migration: copy each business's legacy additional_costs rows into
-- cost_rules (default category 'overhead' — recategorize freely afterward),
-- then deactivate the old rows so nothing double-counts. Safe to re-run: it
-- only touches rows that are still active and haven't been migrated yet.
insert into cost_rules (user_id, business_id, name, category, basis, value, effective_from, is_active)
select
  ac.user_id,
  ac.business_id,
  ac.name,
  'overhead',
  case
    when ac.type = 'per_order' then 'per_order'
    when ac.type = 'per_product' then 'per_unit'
    when ac.type = 'fixed' and ac.period = 'daily' then 'fixed_daily'
    when ac.type = 'fixed' and ac.period = 'weekly' then 'fixed_weekly'
    else 'fixed_monthly'
  end,
  ac.value,
  current_date,
  true
from additional_costs ac
where ac.is_active = true
  and not exists (
    select 1 from cost_rules cr
    where cr.business_id = ac.business_id and cr.name = ac.name
  );

update additional_costs set is_active = false where is_active = true;

-- Open access (no-login) for the new tables
do $$
declare t text;
begin
  foreach t in array array['cost_rules','cost_budgets']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

create index if not exists idx_cost_rules_business on cost_rules(business_id);
create index if not exists idx_cost_budgets_business on cost_budgets(business_id, month);
