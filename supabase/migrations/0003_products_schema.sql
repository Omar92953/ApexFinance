-- ============================================================================
-- Apex Business Manager — Phase A: Products, variants, shipping zones.
-- Self-contained: run ONCE in the Supabase SQL editor. No-login pattern
-- (user_id has no auth FK) + open_access policy so it works without login.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

create table if not exists products (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  business_id        uuid not null references businesses(id) on delete cascade,
  shopify_product_id text,
  handle             text,
  title              text not null,
  vendor             text,
  product_type       text,
  tags               text[] default '{}',
  status             text default 'active',
  image_url          text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (business_id, handle)
);

create table if not exists product_variants (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  business_id        uuid not null references businesses(id) on delete cascade,
  product_id         uuid not null references products(id) on delete cascade,
  shopify_variant_id text,
  title              text,
  sku                text,
  price              numeric default 0,
  compare_at_price   numeric,
  cost_per_item      numeric default 0,   -- WAC unit cost
  weight             numeric,
  weight_unit        text default 'kg',
  inventory_qty      numeric default 0,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (business_id, sku)
);

create table if not exists shipping_zones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  flat_rate   numeric default 0,
  is_default  boolean default false,
  sort_order  int default 0,
  created_at  timestamptz default now()
);

create table if not exists shipping_rates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  zone_id     uuid not null references shipping_zones(id) on delete cascade,
  product_id  uuid references products(id) on delete cascade,
  variant_id  uuid references product_variants(id) on delete cascade,
  rate        numeric default 0
);

-- Open access (no-login) for the new tables
do $$
declare t text;
begin
  foreach t in array array['products','product_variants','shipping_zones','shipping_rates']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

create index if not exists idx_products_business on products(business_id);
create index if not exists idx_variants_product  on product_variants(product_id);
create index if not exists idx_variants_business on product_variants(business_id);
create index if not exists idx_zones_business    on shipping_zones(business_id);
create index if not exists idx_rates_zone        on shipping_rates(zone_id);
