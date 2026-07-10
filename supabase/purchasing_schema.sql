-- ============================================================================
-- Apex Business Manager — Phase 6: Procurement & Purchasing.
-- Self-contained: run ONCE in the SQL editor. No-login pattern + open_access.
-- Requires gl_schema.sql to already be run (uses chart_of_accounts + post_journal_entry).
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

create table if not exists suppliers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  business_id    uuid not null references businesses(id) on delete cascade,
  name           text not null,
  contact_name   text,
  email          text,
  phone          text,
  payment_terms  text,        -- e.g. 'Net 30', 'COD'
  notes          text,
  is_active      boolean default true,
  created_at     timestamptz default now()
);

create table if not exists purchase_orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  business_id    uuid not null references businesses(id) on delete cascade,
  supplier_id    uuid references suppliers(id) on delete set null,
  po_number      text,
  status         text not null default 'draft' check (status in ('draft','sent','partially_received','received','closed','cancelled')),
  order_date     date default current_date,
  expected_date  date,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table if not exists purchase_order_lines (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  business_id        uuid not null references businesses(id) on delete cascade,
  purchase_order_id  uuid not null references purchase_orders(id) on delete cascade,
  variant_id         uuid references product_variants(id) on delete set null,
  description        text,
  quantity_ordered   numeric not null default 0,
  quantity_received  numeric not null default 0,
  unit_cost          numeric not null default 0
);

create table if not exists goods_receipts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  business_id        uuid not null references businesses(id) on delete cascade,
  purchase_order_id  uuid not null references purchase_orders(id) on delete cascade,
  received_date      date default current_date,
  notes              text,
  created_at         timestamptz default now()
);

create table if not exists goods_receipt_lines (
  id                     uuid primary key default gen_random_uuid(),
  goods_receipt_id       uuid not null references goods_receipts(id) on delete cascade,
  purchase_order_line_id uuid not null references purchase_order_lines(id) on delete cascade,
  variant_id             uuid references product_variants(id),
  quantity_received      numeric not null default 0,
  unit_cost              numeric not null default 0
);

create table if not exists supplier_bills (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  business_id        uuid not null references businesses(id) on delete cascade,
  supplier_id        uuid references suppliers(id) on delete set null,
  purchase_order_id  uuid references purchase_orders(id) on delete set null,
  bill_number        text,
  amount             numeric not null default 0,
  amount_paid        numeric not null default 0,
  status             text not null default 'unpaid' check (status in ('unpaid','partially_paid','paid')),
  bill_date          date default current_date,
  due_date           date,
  created_at         timestamptz default now()
);

create table if not exists bill_payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  business_id         uuid not null references businesses(id) on delete cascade,
  supplier_bill_id    uuid not null references supplier_bills(id) on delete cascade,
  capital_account_id  uuid references capital_accounts(id),
  amount              numeric not null default 0,
  date                date default current_date,
  created_at          timestamptz default now()
);

-- ---- Atomic: receive a PO (full or partial). Updates PO lines, inventory
-- (movement + WAC), creates a supplier bill, and posts Dr Inventory/Cr AP —
-- all in one transaction, so a receiving action can never be left half-done.
create or replace function receive_purchase_order(
  p_business_id uuid, p_user_id uuid, p_purchase_order_id uuid, p_lines jsonb,
  p_bill_number text, p_due_date date
) returns uuid
language plpgsql
as $$
declare
  v_line jsonb;
  v_po_line_id uuid;
  v_qty numeric;
  v_unit_cost numeric;
  v_variant_id uuid;
  v_exist_qty numeric;
  v_exist_cost numeric;
  v_new_qty numeric;
  v_new_cost numeric;
  v_receipt_id uuid;
  v_total numeric := 0;
  v_inventory_account uuid;
  v_ap_account uuid;
  v_all_received boolean;
begin
  select id into v_inventory_account from chart_of_accounts where business_id = p_business_id and code = '1060';
  select id into v_ap_account from chart_of_accounts where business_id = p_business_id and code = '2010';

  insert into goods_receipts (user_id, business_id, purchase_order_id, received_date)
  values (p_user_id, p_business_id, p_purchase_order_id, current_date)
  returning id into v_receipt_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_po_line_id := (v_line->>'po_line_id')::uuid;
    v_qty := coalesce((v_line->>'quantity_received')::numeric, 0);
    v_unit_cost := coalesce((v_line->>'unit_cost')::numeric, 0);
    if v_qty <= 0 then continue; end if;

    select variant_id into v_variant_id from purchase_order_lines where id = v_po_line_id;
    update purchase_order_lines set quantity_received = quantity_received + v_qty where id = v_po_line_id;

    insert into goods_receipt_lines (goods_receipt_id, purchase_order_line_id, variant_id, quantity_received, unit_cost)
    values (v_receipt_id, v_po_line_id, v_variant_id, v_qty, v_unit_cost);

    if v_variant_id is not null then
      insert into inventory_movements (user_id, business_id, variant_id, movement_type, quantity, cost_basis, reference_type, reference_id, date)
      values (p_user_id, p_business_id, v_variant_id, 'purchase_in', v_qty, v_unit_cost, 'goods_receipt', v_receipt_id::text, current_date);

      select inventory_qty, cost_per_item into v_exist_qty, v_exist_cost from product_variants where id = v_variant_id;
      v_exist_qty := coalesce(v_exist_qty, 0);
      v_exist_cost := coalesce(v_exist_cost, 0);
      v_new_qty := v_exist_qty + v_qty;
      v_new_cost := case when v_new_qty > 0 then (v_exist_qty * v_exist_cost + v_qty * v_unit_cost) / v_new_qty else v_unit_cost end;
      update product_variants set inventory_qty = v_new_qty, cost_per_item = v_new_cost, updated_at = now() where id = v_variant_id;
    end if;

    v_total := v_total + (v_qty * v_unit_cost);
  end loop;

  if v_total > 0 then
    insert into supplier_bills (user_id, business_id, supplier_id, purchase_order_id, bill_number, amount, status, due_date)
    select p_user_id, p_business_id, po.supplier_id, p_purchase_order_id, p_bill_number, v_total, 'unpaid', p_due_date
    from purchase_orders po where po.id = p_purchase_order_id;

    if v_inventory_account is not null and v_ap_account is not null then
      perform post_journal_entry(p_business_id, p_user_id, current_date, 'Goods receipt', 'goods_receipt', v_receipt_id,
        jsonb_build_array(
          jsonb_build_object('account_id', v_inventory_account, 'debit', v_total, 'credit', 0),
          jsonb_build_object('account_id', v_ap_account, 'debit', 0, 'credit', v_total)
        ));
    end if;
  end if;

  select bool_and(quantity_received >= quantity_ordered) into v_all_received from purchase_order_lines where purchase_order_id = p_purchase_order_id;
  update purchase_orders set status = case when v_all_received then 'received' else 'partially_received' end, updated_at = now()
  where id = p_purchase_order_id;

  return v_receipt_id;
end;
$$;

-- ---- Atomic: pay a supplier bill. Debits AP, credits the chosen capital
-- account's GL account, records the capital transaction + bill_payment, and
-- updates the bill's paid amount/status — one transaction.
create or replace function pay_supplier_bill(
  p_business_id uuid, p_user_id uuid, p_bill_id uuid, p_capital_account_id uuid, p_amount numeric, p_date date
) returns uuid
language plpgsql
as $$
declare
  v_current_balance numeric;
  v_gl_account uuid;
  v_ap_account uuid;
  v_new_balance numeric;
  v_tx_id uuid;
  v_bill_amount numeric;
  v_bill_paid numeric;
  v_date date := coalesce(p_date, current_date);
begin
  select current_balance, gl_account_id into v_current_balance, v_gl_account from capital_accounts where id = p_capital_account_id;
  select id into v_ap_account from chart_of_accounts where business_id = p_business_id and code = '2010';
  select amount, amount_paid into v_bill_amount, v_bill_paid from supplier_bills where id = p_bill_id;

  v_new_balance := coalesce(v_current_balance, 0) - p_amount;

  insert into capital_transactions (user_id, business_id, account_id, transaction_type, amount, running_balance, category, description, date, reference_type, reference_id)
  values (p_user_id, p_business_id, p_capital_account_id, 'expense', -p_amount, v_new_balance, 'accounts_payable', 'Supplier bill payment', v_date, 'supplier_bill', p_bill_id)
  returning id into v_tx_id;

  update capital_accounts set current_balance = v_new_balance where id = p_capital_account_id;

  update supplier_bills set amount_paid = coalesce(v_bill_paid, 0) + p_amount,
    status = case when coalesce(v_bill_paid, 0) + p_amount >= v_bill_amount then 'paid' else 'partially_paid' end
  where id = p_bill_id;

  insert into bill_payments (user_id, business_id, supplier_bill_id, capital_account_id, amount, date)
  values (p_user_id, p_business_id, p_bill_id, p_capital_account_id, p_amount, v_date);

  if v_gl_account is not null and v_ap_account is not null then
    perform post_journal_entry(p_business_id, p_user_id, v_date, 'Supplier bill payment', 'bill_payment', p_bill_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_ap_account, 'debit', p_amount, 'credit', 0),
        jsonb_build_object('account_id', v_gl_account, 'debit', 0, 'credit', p_amount)
      ));
  end if;

  return v_tx_id;
end;
$$;

-- ---- Open access (no-login) for the new tables
do $$
declare t text;
begin
  foreach t in array array['suppliers','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines','supplier_bills','bill_payments']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

create index if not exists idx_suppliers_business on suppliers(business_id);
create index if not exists idx_po_business         on purchase_orders(business_id, status);
create index if not exists idx_pol_po               on purchase_order_lines(purchase_order_id);
create index if not exists idx_bills_business       on supplier_bills(business_id, status);
