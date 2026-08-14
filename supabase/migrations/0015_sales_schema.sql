-- ============================================================================
-- Apex Business Manager — Phase 7: Sales, AR, Returns & COD reconciliation.
-- Self-contained: run ONCE in the SQL editor. No-login pattern + open_access.
-- Requires gl_schema.sql (chart_of_accounts + post_journal_entry).
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
--
-- This is the manual/wholesale sales channel (quotes -> orders -> invoices).
-- Shopify orders remain the automatic channel (metrics_cache + order_line_items).
-- ============================================================================

create table if not exists sales_orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  business_id    uuid not null references businesses(id) on delete cascade,
  contact_id     uuid references contacts(id) on delete set null,
  order_number   text,
  status         text not null default 'draft' check (status in ('draft','confirmed','invoiced','cancelled')),
  payment_method text not null default 'prepaid' check (payment_method in ('prepaid','cod')),
  courier        text,
  is_rto         boolean default false,  -- customer refused delivery (COD-specific)
  order_date     date default current_date,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table if not exists sales_order_lines (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  business_id     uuid not null references businesses(id) on delete cascade,
  sales_order_id  uuid not null references sales_orders(id) on delete cascade,
  variant_id      uuid references product_variants(id) on delete set null,
  description     text,
  quantity        numeric not null default 0,
  unit_price      numeric not null default 0
);

create table if not exists customer_invoices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  business_id     uuid not null references businesses(id) on delete cascade,
  sales_order_id  uuid references sales_orders(id) on delete set null,
  contact_id      uuid references contacts(id) on delete set null,
  invoice_number  text,
  amount          numeric not null default 0,
  amount_paid     numeric not null default 0,
  payment_method  text not null default 'prepaid' check (payment_method in ('prepaid','cod')),
  status          text not null default 'unpaid' check (status in ('unpaid','partially_paid','paid')),
  invoice_date    date default current_date,
  due_date        date,
  created_at      timestamptz default now()
);

create table if not exists invoice_payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  business_id         uuid not null references businesses(id) on delete cascade,
  customer_invoice_id uuid not null references customer_invoices(id) on delete cascade,
  capital_account_id  uuid references capital_accounts(id),
  amount              numeric not null default 0,
  date                date default current_date,
  created_at          timestamptz default now()
);

create table if not exists sales_returns (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  business_id         uuid not null references businesses(id) on delete cascade,
  customer_invoice_id uuid references customer_invoices(id) on delete set null,
  variant_id          uuid references product_variants(id) on delete set null,
  quantity            numeric not null default 0,
  refund_amount       numeric not null default 0,
  refund_via_cash      boolean default false, -- true = cash refund, false = credit note against AR
  capital_account_id  uuid references capital_accounts(id),
  reason              text,
  date                date default current_date,
  created_at          timestamptz default now()
);

create table if not exists cod_remittances (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  business_id         uuid not null references businesses(id) on delete cascade,
  courier             text,
  gross_amount        numeric not null default 0,
  courier_fee         numeric not null default 0,
  net_amount          numeric not null default 0,
  capital_account_id  uuid references capital_accounts(id),
  invoice_ids         uuid[] default '{}',  -- customer_invoices settled by this remittance
  date                date default current_date,
  created_at          timestamptz default now()
);

-- ---- Atomic: creates a customer invoice from a sales order's lines, deducts
-- stock (sale_out movement, no WAC change on the sell side), and posts revenue
-- + COGS recognition. AR/COD Receivable is debited depending on payment_method.
create or replace function create_customer_invoice(
  p_business_id uuid, p_user_id uuid, p_sales_order_id uuid, p_invoice_number text, p_due_date date
) returns uuid
language plpgsql
as $$
declare
  v_line record;
  v_invoice_id uuid;
  v_total numeric := 0;
  v_cogs_total numeric := 0;
  v_payment_method text;
  v_contact_id uuid;
  v_receivable_account uuid;
  v_sales_account uuid;
  v_cogs_account uuid;
  v_inventory_account uuid;
  v_cost numeric;
begin
  select payment_method, contact_id into v_payment_method, v_contact_id from sales_orders where id = p_sales_order_id;

  select id into v_receivable_account from chart_of_accounts where business_id = p_business_id and code = (case when v_payment_method = 'cod' then '1040' else '1050' end);
  select id into v_sales_account from chart_of_accounts where business_id = p_business_id and code = '4010';
  select id into v_cogs_account from chart_of_accounts where business_id = p_business_id and code = '5010';
  select id into v_inventory_account from chart_of_accounts where business_id = p_business_id and code = '1060';

  for v_line in select * from sales_order_lines where sales_order_id = p_sales_order_id
  loop
    v_total := v_total + (v_line.quantity * v_line.unit_price);

    if v_line.variant_id is not null then
      select coalesce(cost_per_item, 0) into v_cost from product_variants where id = v_line.variant_id;
      v_cogs_total := v_cogs_total + (v_line.quantity * v_cost);

      insert into inventory_movements (user_id, business_id, variant_id, movement_type, quantity, cost_basis, reference_type, reference_id, date)
      values (p_user_id, p_business_id, v_line.variant_id, 'sale_out', -v_line.quantity, v_cost, 'sales_order', p_sales_order_id::text, current_date);

      update product_variants set inventory_qty = greatest(0, inventory_qty - v_line.quantity), updated_at = now() where id = v_line.variant_id;
    end if;
  end loop;

  insert into customer_invoices (user_id, business_id, sales_order_id, contact_id, invoice_number, amount, payment_method, due_date)
  values (p_user_id, p_business_id, p_sales_order_id, v_contact_id, p_invoice_number, v_total, v_payment_method, p_due_date)
  returning id into v_invoice_id;

  if v_receivable_account is not null and v_sales_account is not null and v_total > 0 then
    perform post_journal_entry(p_business_id, p_user_id, current_date, 'Customer invoice', 'customer_invoice', v_invoice_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_receivable_account, 'debit', v_total, 'credit', 0),
        jsonb_build_object('account_id', v_sales_account, 'debit', 0, 'credit', v_total)
      ));
  end if;
  if v_cogs_account is not null and v_inventory_account is not null and v_cogs_total > 0 then
    perform post_journal_entry(p_business_id, p_user_id, current_date, 'COGS on customer invoice', 'customer_invoice', v_invoice_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_cogs_account, 'debit', v_cogs_total, 'credit', 0),
        jsonb_build_object('account_id', v_inventory_account, 'debit', 0, 'credit', v_cogs_total)
      ));
  end if;

  update sales_orders set status = 'invoiced', updated_at = now() where id = p_sales_order_id;

  return v_invoice_id;
end;
$$;

-- ---- Atomic: record a customer payment against a prepaid invoice (COD
-- invoices are settled via record_cod_remittance instead). Dr Cash / Cr AR.
create or replace function pay_customer_invoice(
  p_business_id uuid, p_user_id uuid, p_invoice_id uuid, p_capital_account_id uuid, p_amount numeric, p_date date
) returns uuid
language plpgsql
as $$
declare
  v_current_balance numeric;
  v_gl_account uuid;
  v_ar_account uuid;
  v_new_balance numeric;
  v_tx_id uuid;
  v_amount numeric;
  v_paid numeric;
  v_date date := coalesce(p_date, current_date);
begin
  select current_balance, gl_account_id into v_current_balance, v_gl_account from capital_accounts where id = p_capital_account_id;
  select id into v_ar_account from chart_of_accounts where business_id = p_business_id and code = '1050';
  select amount, amount_paid into v_amount, v_paid from customer_invoices where id = p_invoice_id;

  v_new_balance := coalesce(v_current_balance, 0) + p_amount;

  insert into capital_transactions (user_id, business_id, account_id, transaction_type, amount, running_balance, category, description, date, reference_type, reference_id)
  values (p_user_id, p_business_id, p_capital_account_id, 'income', p_amount, v_new_balance, 'accounts_receivable', 'Customer invoice payment', v_date, 'customer_invoice', p_invoice_id)
  returning id into v_tx_id;

  update capital_accounts set current_balance = v_new_balance where id = p_capital_account_id;

  update customer_invoices set amount_paid = coalesce(v_paid, 0) + p_amount,
    status = case when coalesce(v_paid, 0) + p_amount >= v_amount then 'paid' else 'partially_paid' end
  where id = p_invoice_id;

  insert into invoice_payments (user_id, business_id, customer_invoice_id, capital_account_id, amount, date)
  values (p_user_id, p_business_id, p_invoice_id, p_capital_account_id, p_amount, v_date);

  if v_gl_account is not null and v_ar_account is not null then
    perform post_journal_entry(p_business_id, p_user_id, v_date, 'Customer invoice payment', 'invoice_payment', p_invoice_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_gl_account, 'debit', p_amount, 'credit', 0),
        jsonb_build_object('account_id', v_ar_account, 'debit', 0, 'credit', p_amount)
      ));
  end if;

  return v_tx_id;
end;
$$;

-- ---- Atomic: process a return — restocks the unit (at its prior cost, no WAC
-- blend since nothing new was purchased) and reverses revenue. If refunded via
-- cash, also debits Sales Revenue against the chosen capital account; if it's
-- a credit note, reverses against Accounts Receivable instead.
create or replace function process_sales_return(
  p_business_id uuid, p_user_id uuid, p_customer_invoice_id uuid, p_variant_id uuid,
  p_quantity numeric, p_refund_amount numeric, p_refund_via_cash boolean, p_capital_account_id uuid, p_reason text
) returns uuid
language plpgsql
as $$
declare
  v_return_id uuid;
  v_sales_account uuid;
  v_other_account uuid;
  v_new_balance numeric;
  v_current_balance numeric;
  v_gl_account uuid;
begin
  select id into v_sales_account from chart_of_accounts where business_id = p_business_id and code = '4010';

  insert into sales_returns (user_id, business_id, customer_invoice_id, variant_id, quantity, refund_amount, refund_via_cash, capital_account_id, reason)
  values (p_user_id, p_business_id, p_customer_invoice_id, p_variant_id, p_quantity, p_refund_amount, p_refund_via_cash, p_capital_account_id, p_reason)
  returning id into v_return_id;

  if p_variant_id is not null and p_quantity > 0 then
    insert into inventory_movements (user_id, business_id, variant_id, movement_type, quantity, reference_type, reference_id, date)
    values (p_user_id, p_business_id, p_variant_id, 'return_in', p_quantity, 'sales_return', v_return_id::text, current_date);
    update product_variants set inventory_qty = inventory_qty + p_quantity, updated_at = now() where id = p_variant_id;
  end if;

  if p_refund_amount > 0 and v_sales_account is not null then
    if p_refund_via_cash and p_capital_account_id is not null then
      select current_balance, gl_account_id into v_current_balance, v_gl_account from capital_accounts where id = p_capital_account_id;
      v_new_balance := coalesce(v_current_balance, 0) - p_refund_amount;
      insert into capital_transactions (user_id, business_id, account_id, transaction_type, amount, running_balance, category, description, date, reference_type, reference_id)
      values (p_user_id, p_business_id, p_capital_account_id, 'expense', -p_refund_amount, v_new_balance, 'sales_return', 'Customer refund', current_date, 'sales_return', v_return_id);
      update capital_accounts set current_balance = v_new_balance where id = p_capital_account_id;
      v_other_account := v_gl_account;
    else
      select id into v_other_account from chart_of_accounts where business_id = p_business_id and code = '1050';
    end if;

    if v_other_account is not null then
      perform post_journal_entry(p_business_id, p_user_id, current_date, 'Sales return', 'sales_return', v_return_id,
        jsonb_build_array(
          jsonb_build_object('account_id', v_sales_account, 'debit', p_refund_amount, 'credit', 0),
          jsonb_build_object('account_id', v_other_account, 'debit', 0, 'credit', p_refund_amount)
        ));
    end if;
  end if;

  return v_return_id;
end;
$$;

-- ---- Atomic: record a COD courier remittance. Courier sends the net amount
-- (gross minus their fee) for a batch of delivered COD orders. Marks the
-- listed invoices paid and posts Dr Cash(net) + Dr Courier Fees(fee) / Cr COD Receivable(gross).
create or replace function record_cod_remittance(
  p_business_id uuid, p_user_id uuid, p_courier text, p_gross numeric, p_fee numeric,
  p_capital_account_id uuid, p_invoice_ids uuid[]
) returns uuid
language plpgsql
as $$
declare
  v_net numeric := p_gross - p_fee;
  v_remit_id uuid;
  v_current_balance numeric;
  v_gl_account uuid;
  v_new_balance numeric;
  v_cod_account uuid;
  v_fee_account uuid;
  v_invoice_id uuid;
begin
  select current_balance, gl_account_id into v_current_balance, v_gl_account from capital_accounts where id = p_capital_account_id;
  select id into v_cod_account from chart_of_accounts where business_id = p_business_id and code = '1040';
  select id into v_fee_account from chart_of_accounts where business_id = p_business_id and code = '5100';

  v_new_balance := coalesce(v_current_balance, 0) + v_net;

  insert into cod_remittances (user_id, business_id, courier, gross_amount, courier_fee, net_amount, capital_account_id, invoice_ids)
  values (p_user_id, p_business_id, p_courier, p_gross, p_fee, v_net, p_capital_account_id, p_invoice_ids)
  returning id into v_remit_id;

  insert into capital_transactions (user_id, business_id, account_id, transaction_type, amount, running_balance, category, description, date, reference_type, reference_id)
  values (p_user_id, p_business_id, p_capital_account_id, 'income', v_net, v_new_balance, 'cod_remittance', concat('COD remittance — ', p_courier), current_date, 'cod_remittance', v_remit_id);
  update capital_accounts set current_balance = v_new_balance where id = p_capital_account_id;

  foreach v_invoice_id in array p_invoice_ids
  loop
    update customer_invoices set amount_paid = amount, status = 'paid' where id = v_invoice_id;
  end loop;

  if v_gl_account is not null and v_cod_account is not null and v_fee_account is not null then
    perform post_journal_entry(p_business_id, p_user_id, current_date, concat('COD remittance — ', p_courier), 'cod_remittance', v_remit_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_gl_account, 'debit', v_net, 'credit', 0),
        jsonb_build_object('account_id', v_fee_account, 'debit', p_fee, 'credit', 0),
        jsonb_build_object('account_id', v_cod_account, 'debit', 0, 'credit', p_gross)
      ));
  end if;

  return v_remit_id;
end;
$$;

-- ---- Open access (no-login) for the new tables
do $$
declare t text;
begin
  foreach t in array array['sales_orders','sales_order_lines','customer_invoices','invoice_payments','sales_returns','cod_remittances']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

create index if not exists idx_so_business    on sales_orders(business_id, status);
create index if not exists idx_sol_order       on sales_order_lines(sales_order_id);
create index if not exists idx_ci_business     on customer_invoices(business_id, status);
create index if not exists idx_cod_business    on cod_remittances(business_id, date);
