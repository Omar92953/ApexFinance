-- ============================================================================
-- Apex Business Manager — multi-vertical support.
--
-- The app was built assuming e-commerce (stock, couriers, COD, ad spend). It
-- also needs to serve service/agency, retail and wholesale businesses. Since
-- each business is already its own workspace, the type is per-business: one
-- workspace can be an online store while the next is an agency.
--
-- Existing rows default to 'ecommerce', which is exactly what they were.
-- ============================================================================

alter table businesses add column if not exists business_type text not null default 'ecommerce';
alter table businesses add column if not exists capabilities jsonb;   -- per-business overrides on the type preset

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_type_check') then
    alter table businesses add constraint businesses_type_check
      check (business_type in ('ecommerce', 'service', 'retail', 'wholesale'));
  end if;
end $$;

-- ---------- Projects / retainers / billable time (service businesses) ----------
-- The revenue model a service business actually runs on: work is sold as a
-- fixed-price project, a recurring retainer, or time at a rate. This is the
-- non-product equivalent of products+stock, and it feeds the same invoices,
-- ledger and cash-flow machinery everything else uses.

create table if not exists rate_cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,               -- e.g. 'Senior developer', 'Design'
  hourly_rate  numeric not null default 0,
  cost_rate    numeric not null default 0,  -- what it costs you per hour — drives real project margin
  is_active    boolean default true,
  created_at   timestamptz default now()
);

create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  business_id    uuid not null references businesses(id) on delete cascade,
  contact_id     uuid references contacts(id) on delete set null,
  name           text not null,
  code           text,
  billing_type   text not null default 'fixed'
                 check (billing_type in ('fixed', 'hourly', 'retainer')),
  status         text not null default 'active'
                 check (status in ('quoted', 'active', 'on_hold', 'completed', 'cancelled')),
  budget_amount  numeric not null default 0,   -- fixed price, or monthly amount for a retainer
  budget_hours   numeric,                      -- optional cap for hourly/retainer work
  start_date     date default current_date,
  end_date       date,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table if not exists time_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  business_id   uuid not null references businesses(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  employee_id   uuid references employees(id) on delete set null,
  rate_card_id  uuid references rate_cards(id) on delete set null,
  entry_date    date not null default current_date,
  hours         numeric not null default 0,
  description   text,
  is_billable   boolean not null default true,
  invoiced_on   uuid references customer_invoices(id) on delete set null,  -- null = not yet billed
  created_at    timestamptz default now()
);

-- ---------- Open access (no-login) ----------
do $$
declare t text;
begin
  foreach t in array array['rate_cards','projects','time_entries']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
    execute format('grant all on %I to anon, authenticated, service_role;', t);
  end loop;
end $$;

create index if not exists idx_projects_business  on projects(business_id, status);
create index if not exists idx_ratecards_business on rate_cards(business_id, is_active);
create index if not exists idx_time_project       on time_entries(project_id, entry_date);
create index if not exists idx_time_unbilled      on time_entries(business_id, is_billable) where invoiced_on is null;
