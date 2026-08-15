-- ============================================================================
-- Apex Business Manager — Product Plan v2, Phase 8: Subscription Auditor.
--
-- Recurring spend is uniquely easy to lose: it renews by default, each charge
-- is small, and nobody owns the decision. This is the register plus the
-- decision trail — the point is the renewal alert that arrives while there is
-- still time to cancel.
-- ============================================================================

create table if not exists subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  business_id   uuid not null references businesses(id) on delete cascade,
  name          text not null,
  vendor        text,
  category      text,                        -- two tools in one category is often duplication
  amount        numeric not null default 0,  -- per billing cycle
  cycle         text not null default 'monthly' check (cycle in ('monthly', 'quarterly', 'annual')),
  renews_on     date,
  auto_renew    boolean not null default true,
  seats         integer,
  active_seats  integer,
  last_used_on  date,                        -- attestation, not telemetry — someone confirms it's still used
  decision      text not null default 'undecided' check (decision in ('keep', 'renegotiate', 'cancel', 'undecided')),
  decided_on    date,
  decision_note text,
  supplier_id   uuid references suppliers(id) on delete set null,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table subscriptions enable row level security;
drop policy if exists open_access on subscriptions;
create policy open_access on subscriptions for all to anon, authenticated using (true) with check (true);
grant all on subscriptions to anon, authenticated, service_role;

create index if not exists idx_subscriptions_business on subscriptions(business_id, decision);
create index if not exists idx_subscriptions_renewal  on subscriptions(business_id, renews_on) where renews_on is not null;
