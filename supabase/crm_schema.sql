-- ============================================================================
-- Apex Business Manager — CRM schema (run ONCE in the Supabase SQL editor).
-- Adds contacts, notes, activity timeline, deals pipeline, and tasks.
-- Per-business, all protected by Row-Level Security (only you can read).
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

-- ---------- CONTACTS (customers) ----------
create table if not exists contacts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  business_id        uuid not null references businesses(id) on delete cascade,
  first_name         text,
  last_name          text,
  email              text,
  phone              text,
  company            text,
  city               text,
  country            text,
  status             text default 'lead',        -- lead | prospect | customer | vip | churned
  source             text default 'manual',      -- manual | shopify | meta | import
  tags               text[] default '{}',
  shopify_customer_id text,
  total_spent        numeric default 0,
  orders_count       int default 0,
  accepts_marketing  boolean default false,
  last_order_date    date,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (business_id, email)                     -- dedupe by email (nulls allowed)
);

-- ---------- CONTACT NOTES ----------
create table if not exists contact_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  body        text not null,
  created_at  timestamptz default now()
);

-- ---------- CONTACT ACTIVITY TIMELINE ----------
create table if not exists contact_activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  type        text not null,                      -- created | note | status | call | email | order | deal | task
  description text,
  created_at  timestamptz default now()
);

-- ---------- DEALS (sales pipeline) ----------
create table if not exists deals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  business_id    uuid not null references businesses(id) on delete cascade,
  contact_id     uuid references contacts(id) on delete set null,
  title          text not null,
  value          numeric default 0,
  stage          text default 'lead',             -- lead | qualified | proposal | won | lost
  notes          text,
  expected_close date,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ---------- TASKS ----------
create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  deal_id     uuid references deals(id) on delete set null,
  title       text not null,
  due_date    date,
  is_done     boolean default false,
  created_at  timestamptz default now()
);

-- ---------- RLS: own rows only ----------
do $$
declare t text;
begin
  foreach t in array array['contacts','contact_notes','contact_activities','deals','tasks']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists own_rows on %I;', t);
    execute format(
      'create policy own_rows on %I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t);
  end loop;
end $$;

create index if not exists idx_contacts_business   on contacts(business_id);
create index if not exists idx_notes_contact        on contact_notes(contact_id);
create index if not exists idx_activities_contact    on contact_activities(contact_id);
create index if not exists idx_deals_business        on deals(business_id);
create index if not exists idx_tasks_business        on tasks(business_id);
