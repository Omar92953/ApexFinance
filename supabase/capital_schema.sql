-- ============================================================================
-- Apex Business Manager — Phase B: Capital (cash) accounts + transaction ledger.
-- Self-contained: run ONCE in the Supabase SQL editor. No-login pattern + open_access.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

create table if not exists capital_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  business_id     uuid not null references businesses(id) on delete cascade,
  name            text not null,
  account_type    text default 'cash',        -- cash | bank | wallet | other
  opening_balance numeric default 0,
  current_balance numeric default 0,
  currency        text default 'USD',
  created_at      timestamptz default now()
);

create table if not exists capital_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null,
  business_id      uuid not null references businesses(id) on delete cascade,
  account_id       uuid not null references capital_accounts(id) on delete cascade,
  transaction_type text not null,             -- income | expense | transfer | manufacturing | withdrawal | deposit
  amount           numeric not null default 0,  -- signed: + in, - out
  running_balance  numeric default 0,
  category         text,
  reference_type   text,
  reference_id     uuid,
  description      text,
  date             date default current_date,
  created_at       timestamptz default now()
);

do $$
declare t text;
begin
  foreach t in array array['capital_accounts','capital_transactions']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

create index if not exists idx_capital_accts_business on capital_accounts(business_id);
create index if not exists idx_capital_tx_account     on capital_transactions(account_id, date);
