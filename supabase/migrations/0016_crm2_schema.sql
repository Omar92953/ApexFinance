-- ============================================================================
-- Apex Business Manager — Phase 8: CRM 2.0. Self-contained: run ONCE in the
-- SQL editor. No-login pattern + open_access.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

alter table contacts add column if not exists follow_up_date date;
alter table deals add column if not exists win_loss_reason text;

create table if not exists tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete cascade,
  subject     text not null,
  status      text not null default 'open' check (status in ('open','pending','resolved')),
  priority    text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  ticket_id   uuid not null references tickets(id) on delete cascade,
  body        text not null,
  created_at  timestamptz default now()
);

-- ---- Merge a duplicate contact into a primary one: re-points notes,
-- activities, deals, tasks, and tickets, unions tags, keeps the higher
-- total_spent/orders_count, then deletes the duplicate. Atomic.
create or replace function merge_contacts(p_primary_id uuid, p_duplicate_id uuid) returns void
language plpgsql
as $$
begin
  update contact_notes set contact_id = p_primary_id where contact_id = p_duplicate_id;
  update contact_activities set contact_id = p_primary_id where contact_id = p_duplicate_id;
  update deals set contact_id = p_primary_id where contact_id = p_duplicate_id;
  update tasks set contact_id = p_primary_id where contact_id = p_duplicate_id;
  update tickets set contact_id = p_primary_id where contact_id = p_duplicate_id;

  update contacts p set
    tags = (select array_agg(distinct t) from unnest(p.tags || d.tags) t),
    total_spent = greatest(p.total_spent, d.total_spent),
    orders_count = greatest(p.orders_count, d.orders_count),
    phone = coalesce(p.phone, d.phone),
    company = coalesce(p.company, d.company),
    city = coalesce(p.city, d.city),
    country = coalesce(p.country, d.country)
  from contacts d
  where p.id = p_primary_id and d.id = p_duplicate_id;

  delete from contacts where id = p_duplicate_id;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['tickets','ticket_messages']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

create index if not exists idx_tickets_business on tickets(business_id, status);
create index if not exists idx_ticket_msgs_ticket on ticket_messages(ticket_id);
