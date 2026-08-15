-- ============================================================================
-- Apex Business Manager — Product Plan v2, Phases 4, 7 and 10.
--   Phase 4  — collections: dunning history, promise-to-pay, disputes
--   Phase 7  — budget allocation: commitments and approval thresholds
--   Phase 10 — ERP chaining: document numbers, stock reservation
-- Plus the service-business gap: invoicing unbilled project time.
-- ============================================================================

-- ---------- Phase 4: collections ----------
alter table customer_invoices add column if not exists promise_to_pay date;
alter table customer_invoices add column if not exists in_dispute      boolean not null default false;
alter table customer_invoices add column if not exists dispute_reason  text;

create table if not exists dunning_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  invoice_id  uuid not null references customer_invoices(id) on delete cascade,
  step_key    text not null,                -- matches DEFAULT_LADDER in src/finance/dunning.ts
  channel     text not null default 'whatsapp' check (channel in ('whatsapp', 'email', 'call', 'other')),
  message     text,
  sent_at     timestamptz default now(),
  unique (invoice_id, step_key)             -- a rung is sent once per invoice
);

-- ---------- Phase 7: budget commitments ----------
-- A budget that only counts paid bills lies to you: money is really gone the
-- moment a PO is approved. Commitments capture that earlier promise so
-- "remaining" means remaining.
create table if not exists budget_commitments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  business_id   uuid not null references businesses(id) on delete cascade,
  category      text not null,
  amount        numeric not null default 0,
  month         text not null,              -- 'YYYY-MM'
  source_type   text,                       -- 'purchase_order' | 'manual' | …
  source_id     text,
  description   text,
  released      boolean not null default false,   -- true once the real bill lands
  created_at    timestamptz default now()
);

alter table cost_budgets add column if not exists approval_limit numeric;

-- ---------- Phase 10: document numbering + stock reservation ----------
-- Human-readable, per-business, per-type sequence numbers (PO-0001, INV-0001).
create table if not exists document_sequences (
  business_id  uuid not null references businesses(id) on delete cascade,
  doc_type     text not null,
  prefix       text not null,
  next_number  integer not null default 1,
  primary key (business_id, doc_type)
);

create or replace function next_document_number(p_business_id uuid, p_doc_type text, p_prefix text)
returns text
language plpgsql
as $$
declare
  v_number integer;
  v_prefix text;
begin
  -- Atomic claim: the UPDATE ... RETURNING is what stops two concurrent callers
  -- ever receiving the same number.
  insert into document_sequences (business_id, doc_type, prefix, next_number)
  values (p_business_id, p_doc_type, p_prefix, 1)
  on conflict (business_id, doc_type) do nothing;

  update document_sequences
     set next_number = next_number + 1
   where business_id = p_business_id and doc_type = p_doc_type
  returning next_number - 1, prefix into v_number, v_prefix;

  return v_prefix || '-' || lpad(v_number::text, 4, '0');
end;
$$;

-- Stock held for confirmed orders so it cannot be sold twice.
alter table product_variants add column if not exists reserved_qty numeric not null default 0;

create table if not exists stock_reservations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  business_id     uuid not null references businesses(id) on delete cascade,
  variant_id      uuid not null references product_variants(id) on delete cascade,
  sales_order_id  uuid references sales_orders(id) on delete cascade,
  quantity        numeric not null default 0,
  released        boolean not null default false,
  created_at      timestamptz default now()
);

-- Atomic: reserve stock for a confirmed order, refusing to over-commit what is
-- physically available (on-hand minus what is already spoken for).
create or replace function reserve_stock_for_order(
  p_business_id uuid, p_user_id uuid, p_sales_order_id uuid
) returns integer
language plpgsql
as $$
declare
  v_line record;
  v_available numeric;
  v_count integer := 0;
begin
  for v_line in
    select variant_id, quantity from sales_order_lines
     where sales_order_id = p_sales_order_id and variant_id is not null
  loop
    select coalesce(inventory_qty, 0) - coalesce(reserved_qty, 0)
      into v_available from product_variants where id = v_line.variant_id;

    if v_available < v_line.quantity then
      raise exception 'Not enough free stock for variant %: need %, only % unreserved',
        v_line.variant_id, v_line.quantity, v_available;
    end if;

    update product_variants
       set reserved_qty = coalesce(reserved_qty, 0) + v_line.quantity, updated_at = now()
     where id = v_line.variant_id;

    insert into stock_reservations (user_id, business_id, variant_id, sales_order_id, quantity)
    values (p_user_id, p_business_id, v_line.variant_id, p_sales_order_id, v_line.quantity);

    v_count := v_count + 1;
  end loop;

  update sales_orders set status = 'confirmed', updated_at = now() where id = p_sales_order_id;
  return v_count;
end;
$$;

-- Releases a reservation — on invoicing (stock actually leaves) or cancellation.
create or replace function release_stock_for_order(p_sales_order_id uuid)
returns void
language plpgsql
as $$
declare v_res record;
begin
  for v_res in
    select id, variant_id, quantity from stock_reservations
     where sales_order_id = p_sales_order_id and released = false
  loop
    update product_variants
       set reserved_qty = greatest(coalesce(reserved_qty, 0) - v_res.quantity, 0), updated_at = now()
     where id = v_res.variant_id;
    update stock_reservations set released = true where id = v_res.id;
  end loop;
end;
$$;

-- ---------- Service businesses: bill unbilled project time ----------
-- Turns delivered-but-uninvoiced hours into a real customer invoice and marks
-- those entries billed, in one transaction so time can never be double-billed.
create or replace function invoice_project_time(
  p_business_id uuid, p_user_id uuid, p_project_id uuid, p_entry_ids uuid[],
  p_invoice_number text, p_due_date date
) returns uuid
language plpgsql
as $$
declare
  v_total numeric := 0;
  v_contact uuid;
  v_invoice_id uuid;
  v_ar_account uuid;
  v_revenue_account uuid;
begin
  select coalesce(sum(te.hours * coalesce(rc.hourly_rate, 0)), 0)
    into v_total
    from time_entries te
    left join rate_cards rc on rc.id = te.rate_card_id
   where te.id = any(p_entry_ids)
     and te.project_id = p_project_id
     and te.is_billable = true
     and te.invoiced_on is null;

  if v_total <= 0 then
    raise exception 'Nothing billable in that selection';
  end if;

  select contact_id into v_contact from projects where id = p_project_id;

  insert into customer_invoices (user_id, business_id, contact_id, invoice_number, amount, amount_paid, payment_method, status, invoice_date, due_date)
  values (p_user_id, p_business_id, v_contact, p_invoice_number, v_total, 0, 'prepaid', 'unpaid', current_date, p_due_date)
  returning id into v_invoice_id;

  update time_entries set invoiced_on = v_invoice_id where id = any(p_entry_ids) and invoiced_on is null;

  -- Service revenue has no COGS leg — the labour cost was already expensed
  -- through payroll, so posting one here would double-count it.
  select id into v_ar_account      from chart_of_accounts where business_id = p_business_id and code = '1050';
  select id into v_revenue_account from chart_of_accounts where business_id = p_business_id and code = '4010';

  if v_ar_account is not null and v_revenue_account is not null then
    perform post_journal_entry(p_business_id, p_user_id, current_date, 'Project invoice', 'customer_invoice', v_invoice_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_ar_account, 'debit', v_total, 'credit', 0),
        jsonb_build_object('account_id', v_revenue_account, 'debit', 0, 'credit', v_total)
      ));
  end if;

  return v_invoice_id;
end;
$$;

-- ---------- Open access (no-login) ----------
do $$
declare t text;
begin
  foreach t in array array['dunning_events','budget_commitments','document_sequences','stock_reservations']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
    execute format('grant all on %I to anon, authenticated, service_role;', t);
  end loop;
end $$;

create index if not exists idx_dunning_invoice     on dunning_events(invoice_id);
create index if not exists idx_dunning_business    on dunning_events(business_id, sent_at desc);
create index if not exists idx_commitments_month   on budget_commitments(business_id, month, released);
create index if not exists idx_reservations_order  on stock_reservations(sales_order_id, released);
