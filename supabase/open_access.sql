-- ============================================================================
-- Apex Business Manager — CREATE CRM TABLES + OPEN ACCESS (login disabled).
-- Single self-contained script — run ONCE in the Supabase SQL editor.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- It (1) creates the CRM tables if missing, then (2) makes every table
-- permissive so the app works with no login.
--
-- ⚠️  SECURITY: after this, anyone with the anon key (public in the web build)
--     can read/write the data. Use only while there's no sensitive data.
--     To restore login: re-run the RLS sections of schema.sql + crm_schema.sql.
-- ============================================================================

-- ---- 1) CRM tables (idempotent) ----
create table if not exists contacts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  business_id        uuid not null references businesses(id) on delete cascade,
  first_name         text, last_name text, email text, phone text, company text,
  city text, country text,
  status             text default 'lead',
  source             text default 'manual',
  tags               text[] default '{}',
  shopify_customer_id text,
  total_spent        numeric default 0,
  orders_count       int default 0,
  accepts_marketing  boolean default false,
  last_order_date    date,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (business_id, email)
);
create table if not exists contact_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
create table if not exists contact_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  type text not null,
  description text,
  created_at timestamptz default now()
);
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  title text not null,
  value numeric default 0,
  stage text default 'lead',
  notes text,
  expected_close date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  title text not null,
  due_date date,
  is_done boolean default false,
  created_at timestamptz default now()
);

-- ---- 2) Open access on every table (skips any that don't exist) ----
do $$
declare t text;
begin
  foreach t in array array[
    'businesses','additional_costs','product_cost_items','financial_inputs',
    'retained_earnings_history','business_goals','metrics_cache',
    'order_line_items','campaign_cache','reports','api_credentials',
    'contacts','contact_notes','contact_activities','deals','tasks','user_settings',
    'products','product_variants','shipping_zones','shipping_rates',
    'capital_accounts','capital_transactions',
    'manufacturing_batches','manufacturing_cost_items','inventory_movements'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    -- Login is off, so drop the FK to auth.users (the app stores a fixed local id).
    execute format('alter table %I drop constraint if exists %I;', t, t || '_user_id_fkey');
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists own_rows on %I;', t);
    execute format('drop policy if exists own_settings on %I;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format(
      'create policy open_access on %I for all to anon, authenticated using (true) with check (true);',
      t);
  end loop;
end $$;

create index if not exists idx_contacts_business  on contacts(business_id);
create index if not exists idx_notes_contact       on contact_notes(contact_id);
create index if not exists idx_activities_contact   on contact_activities(contact_id);
create index if not exists idx_deals_business       on deals(business_id);
create index if not exists idx_tasks_business       on tasks(business_id);
