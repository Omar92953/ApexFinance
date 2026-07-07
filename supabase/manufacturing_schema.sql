-- ============================================================================
-- Apex Business Manager — Phase C: Manufacturing batches + inventory movements.
-- Self-contained: run ONCE in the Supabase SQL editor. No-login pattern + open_access.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

create table if not exists manufacturing_batches (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  business_id      uuid not null references businesses(id) on delete cascade,
  batch_number     text,
  product_id       uuid references products(id) on delete set null,
  variant_id       uuid references product_variants(id) on delete set null,
  quantity_produced numeric default 0,
  total_cost       numeric default 0,
  cost_per_unit    numeric default 0,
  status           text default 'completed',   -- planned | in_progress | completed | cancelled
  notes            text,
  date             date default current_date,
  completed_at     timestamptz,
  created_at       timestamptz default now()
);

create table if not exists manufacturing_cost_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  batch_id    uuid not null references manufacturing_batches(id) on delete cascade,
  name        text,
  category    text default 'materials',        -- materials | labor | overhead | other
  value       numeric default 0,
  created_at  timestamptz default now()
);

create table if not exists inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  business_id    uuid not null references businesses(id) on delete cascade,
  product_id     uuid references products(id) on delete set null,
  variant_id     uuid references product_variants(id) on delete set null,
  movement_type  text not null,                -- manufacture_in | sale_out | adjustment | return_in | damage_out
  quantity       numeric default 0,            -- signed: + in, - out
  cost_basis     numeric default 0,
  reference_type text,
  reference_id   uuid,
  notes          text,
  date           date default current_date,
  created_at     timestamptz default now()
);

do $$
declare t text;
begin
  foreach t in array array['manufacturing_batches','manufacturing_cost_items','inventory_movements']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

create index if not exists idx_batches_business  on manufacturing_batches(business_id, date);
create index if not exists idx_costitems_batch    on manufacturing_cost_items(batch_id);
create index if not exists idx_invmov_variant      on inventory_movements(variant_id, date);
