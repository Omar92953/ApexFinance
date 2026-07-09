-- ============================================================================
-- Apex Business Manager — Phase 4: Double-entry General Ledger.
-- Self-contained: run ONCE in the SQL editor. No-login pattern + open_access.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

create table if not exists chart_of_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  code        text not null,
  name        text not null,
  type        text not null check (type in ('asset','liability','equity','income','expense')),
  subtype     text,        -- e.g. cogs | fulfillment | marketing | overhead | fees | cash | current | fixed | long_term
  is_active   boolean default true,
  created_at  timestamptz default now(),
  unique (business_id, code)
);

create table if not exists journal_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  date        date not null default current_date,
  memo        text,
  source_type text,        -- manual | expense | income | transfer | manufacturing | profit | deposit | withdrawal | opening_balance
  source_id   uuid,
  created_at  timestamptz default now()
);

create table if not exists journal_lines (
  id                uuid primary key default gen_random_uuid(),
  journal_entry_id  uuid not null references journal_entries(id) on delete cascade,
  account_id        uuid not null references chart_of_accounts(id),
  debit             numeric not null default 0,
  credit            numeric not null default 0,
  description       text,
  check ((debit > 0 and credit = 0) or (debit = 0 and credit > 0))
);

-- Capital accounts map 1:1 to a GL account (auto-created when a capital account is added).
alter table capital_accounts add column if not exists gl_account_id uuid references chart_of_accounts(id);

-- ---- Atomic posting: the only way rows are written to journal_entries/journal_lines.
-- Rejects (raises) any entry whose lines don't balance to the cent, so the
-- ledger can never be left in an inconsistent state.
create or replace function post_journal_entry(
  p_business_id uuid, p_user_id uuid, p_date date, p_memo text,
  p_source_type text, p_source_id uuid, p_lines jsonb
) returns uuid
language plpgsql
as $$
declare
  v_entry_id uuid;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line jsonb;
begin
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_total_debit := v_total_debit + coalesce((v_line->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + coalesce((v_line->>'credit')::numeric, 0);
  end loop;

  if round(v_total_debit, 2) != round(v_total_credit, 2) then
    raise exception 'Journal entry not balanced: debits=% credits=%', v_total_debit, v_total_credit;
  end if;

  insert into journal_entries (user_id, business_id, date, memo, source_type, source_id)
  values (p_user_id, p_business_id, coalesce(p_date, current_date), p_memo, p_source_type, p_source_id)
  returning id into v_entry_id;

  insert into journal_lines (journal_entry_id, account_id, debit, credit, description)
  select v_entry_id, (l->>'account_id')::uuid, coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0), l->>'description'
  from jsonb_array_elements(p_lines) l;

  return v_entry_id;
end;
$$;

-- ---- Default chart of accounts, seeded for every EXISTING business now.
-- New businesses get seeded automatically by the app when created.
insert into chart_of_accounts (user_id, business_id, code, name, type, subtype)
select b.user_id, b.id, a.code, a.name, a.type, a.subtype
from businesses b
cross join (values
  ('1010','Cash','asset','cash'),
  ('1020','Bank','asset','cash'),
  ('1030','Mobile Wallet','asset','cash'),
  ('1040','COD Receivable','asset','current'),
  ('1050','Accounts Receivable','asset','current'),
  ('1060','Inventory','asset','current'),
  ('1070','Prepaid Expenses','asset','current'),
  ('1080','Equipment','asset','fixed'),
  ('2010','Accounts Payable','liability','current'),
  ('2020','Credit Card Payable','liability','current'),
  ('2030','Taxes Payable','liability','current'),
  ('2040','Accrued Expenses','liability','current'),
  ('2050','Business Loans','liability','long_term'),
  ('3010',"Owner's Equity",'equity',null),
  ('3020','Retained Earnings','equity',null),
  ('3030',"Owner's Drawings",'equity',null),
  ('4010','Sales Revenue','income',null),
  ('4020','Shipping Income','income',null),
  ('4030','Other Income','income',null),
  ('5010','Cost of Goods Sold','expense','cogs'),
  ('5020','Fulfillment & Shipping','expense','fulfillment'),
  ('5030','Ad Spend - Meta','expense','marketing'),
  ('5040','Ad Spend - TikTok','expense','marketing'),
  ('5050','Ad Spend - Google','expense','marketing'),
  ('5060','Marketing - Other','expense','marketing'),
  ('5070','Salaries & Wages','expense','overhead'),
  ('5080','Rent','expense','overhead'),
  ('5090','Software & Tools','expense','overhead'),
  ('5100','Courier & COD Fees','expense','fees'),
  ('5110','Payment Gateway Fees','expense','fees'),
  ('5120','Overhead - Other','expense','overhead'),
  ('5130','Bank & Interest Charges','expense','fees')
) as a(code, name, type, subtype)
on conflict (business_id, code) do nothing;

-- Link each existing capital account to its own dedicated Cash-type GL account.
insert into chart_of_accounts (user_id, business_id, code, name, type, subtype)
select ca.user_id, ca.business_id,
       'CASH-' || substr(ca.id::text, 1, 8),
       ca.name, 'asset', 'cash'
from capital_accounts ca
where ca.gl_account_id is null
on conflict (business_id, code) do nothing;

update capital_accounts ca
set gl_account_id = coa.id
from chart_of_accounts coa
where ca.gl_account_id is null
  and coa.business_id = ca.business_id
  and coa.code = 'CASH-' || substr(ca.id::text, 1, 8);

-- ---- Open access (no-login) for the new tables
do $$
declare t text;
begin
  foreach t in array array['chart_of_accounts','journal_entries','journal_lines']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

create index if not exists idx_coa_business    on chart_of_accounts(business_id);
create index if not exists idx_je_business     on journal_entries(business_id, date);
create index if not exists idx_jl_entry        on journal_lines(journal_entry_id);
create index if not exists idx_jl_account      on journal_lines(account_id);
