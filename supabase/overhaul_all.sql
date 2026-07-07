-- ============================================================================
-- Apex Business Manager — Overhaul (Phases A+B+C) in ONE script.
-- Idempotent: safe to run once (or again). Creates Products, Capital, and
-- Manufacturing tables, all no-login (open_access). Run in the SQL editor:
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

-- ============ PHASE A — Products, variants, shipping ============
create table if not exists products (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  shopify_product_id text, handle text, title text not null, vendor text,
  product_type text, tags text[] default '{}', status text default 'active',
  image_url text, created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (business_id, handle)
);
create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  shopify_variant_id text, title text, sku text, price numeric default 0,
  compare_at_price numeric, cost_per_item numeric default 0, weight numeric,
  weight_unit text default 'kg', inventory_qty numeric default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (business_id, sku)
);
create table if not exists shipping_zones (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null, flat_rate numeric default 0, is_default boolean default false,
  sort_order int default 0, created_at timestamptz default now()
);
create table if not exists shipping_rates (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  zone_id uuid not null references shipping_zones(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete cascade, rate numeric default 0
);

-- ============ PHASE B — Capital accounts + ledger ============
create table if not exists capital_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null, account_type text default 'cash', opening_balance numeric default 0,
  current_balance numeric default 0, currency text default 'USD', created_at timestamptz default now()
);
create table if not exists capital_transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  account_id uuid not null references capital_accounts(id) on delete cascade,
  transaction_type text not null, amount numeric not null default 0, running_balance numeric default 0,
  category text, reference_type text, reference_id uuid, description text,
  date date default current_date, created_at timestamptz default now()
);

-- ============ PHASE C — Manufacturing + inventory ============
create table if not exists manufacturing_batches (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade, batch_number text,
  product_id uuid references products(id) on delete set null,
  variant_id uuid references product_variants(id) on delete set null,
  quantity_produced numeric default 0, total_cost numeric default 0, cost_per_unit numeric default 0,
  status text default 'completed', notes text, date date default current_date,
  completed_at timestamptz, created_at timestamptz default now()
);
create table if not exists manufacturing_cost_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  batch_id uuid not null references manufacturing_batches(id) on delete cascade,
  name text, category text default 'materials', value numeric default 0, created_at timestamptz default now()
);
create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  variant_id uuid references product_variants(id) on delete set null,
  movement_type text not null, quantity numeric default 0, cost_basis numeric default 0,
  reference_type text, reference_id uuid, notes text, date date default current_date,
  created_at timestamptz default now()
);

-- ============ Open access (no-login) for every new table ============
do $$
declare t text;
begin
  foreach t in array array[
    'products','product_variants','shipping_zones','shipping_rates',
    'capital_accounts','capital_transactions',
    'manufacturing_batches','manufacturing_cost_items','inventory_movements'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

create index if not exists idx_variants_business on product_variants(business_id);
create index if not exists idx_zones_business    on shipping_zones(business_id);
create index if not exists idx_capital_tx_account on capital_transactions(account_id, date);
create index if not exists idx_batches_business   on manufacturing_batches(business_id, date);
