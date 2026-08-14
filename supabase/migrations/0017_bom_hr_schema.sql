-- ============================================================================
-- Apex Business Manager — Phase 9: Manufacturing BOM/MRP-lite + simple HR/Payroll.
-- Self-contained: run ONCE in the SQL editor. No-login pattern + open_access.
-- Requires gl_schema.sql (chart_of_accounts + post_journal_entry) and
-- manufacturing_schema.sql (manufacturing_batches, inventory_movements) to
-- already be run.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

-- ---------- Bill of Materials ----------
create table if not exists bill_of_materials (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  business_id         uuid not null references businesses(id) on delete cascade,
  finished_variant_id uuid not null references product_variants(id) on delete cascade,
  name                text,
  is_active           boolean default true,
  created_at          timestamptz default now()
);

create table if not exists bom_components (
  id                    uuid primary key default gen_random_uuid(),
  bom_id                uuid not null references bill_of_materials(id) on delete cascade,
  component_variant_id  uuid not null references product_variants(id) on delete cascade,
  quantity_per_unit     numeric not null default 1
);

alter table manufacturing_batches add column if not exists bom_id uuid references bill_of_materials(id) on delete set null;

-- ---- Atomic: record a production batch from a BOM. Deducts each component's
-- stock (raises if any component is short — no partial/negative-stock batches),
-- auto-fills the finished unit's cost from component WAC, blends the finished
-- variant's WAC, and — only for extra cost items actually paid in cash
-- (labor/overhead; material cost is just an inventory-to-inventory transform,
-- both sides post to the same 1060 Inventory account so it nets to zero and
-- needs no journal) — debits the chosen capital account and posts
-- Dr Inventory / Cr [capital GL]. One transaction.
create or replace function record_bom_batch(
  p_business_id uuid, p_user_id uuid, p_bom_id uuid, p_quantity numeric,
  p_extra_costs jsonb, p_account_id uuid, p_date date
) returns uuid
language plpgsql
as $$
declare
  v_finished_variant_id uuid;
  v_component record;
  v_qty_needed numeric;
  v_component_stock numeric;
  v_component_cost numeric;
  v_material_cost numeric := 0;
  v_extra_cost numeric := 0;
  v_extra_item jsonb;
  v_total_cost numeric;
  v_cost_per_unit numeric;
  v_batch_id uuid;
  v_exist_qty numeric;
  v_exist_cost numeric;
  v_new_qty numeric;
  v_new_cost numeric;
  v_date date := coalesce(p_date, current_date);
  v_inventory_account uuid;
  v_gl_account uuid;
  v_current_balance numeric;
  v_new_balance numeric;
begin
  select finished_variant_id into v_finished_variant_id from bill_of_materials where id = p_bom_id;
  if v_finished_variant_id is null then
    raise exception 'BOM % not found', p_bom_id;
  end if;

  -- Pass 1: validate stock and total the material cost before touching anything.
  for v_component in select component_variant_id, quantity_per_unit from bom_components where bom_id = p_bom_id
  loop
    v_qty_needed := v_component.quantity_per_unit * p_quantity;
    select inventory_qty, cost_per_item into v_component_stock, v_component_cost from product_variants where id = v_component.component_variant_id;
    if coalesce(v_component_stock, 0) < v_qty_needed then
      raise exception 'Insufficient stock for component %: need %, have %', v_component.component_variant_id, v_qty_needed, coalesce(v_component_stock, 0);
    end if;
    v_material_cost := v_material_cost + (v_qty_needed * coalesce(v_component_cost, 0));
  end loop;

  for v_extra_item in select * from jsonb_array_elements(coalesce(p_extra_costs, '[]'::jsonb))
  loop
    v_extra_cost := v_extra_cost + coalesce((v_extra_item->>'value')::numeric, 0);
  end loop;

  v_total_cost := v_material_cost + v_extra_cost;
  v_cost_per_unit := case when p_quantity > 0 then v_total_cost / p_quantity else 0 end;

  insert into manufacturing_batches (user_id, business_id, bom_id, variant_id, quantity_produced, total_cost, cost_per_unit, status, date, completed_at)
  values (p_user_id, p_business_id, p_bom_id, v_finished_variant_id, p_quantity, v_total_cost, v_cost_per_unit, 'completed', v_date, now())
  returning id into v_batch_id;

  if jsonb_array_length(coalesce(p_extra_costs, '[]'::jsonb)) > 0 then
    insert into manufacturing_cost_items (user_id, business_id, batch_id, name, category, value)
    select p_user_id, p_business_id, v_batch_id, item->>'name', coalesce(item->>'category', 'other'), coalesce((item->>'value')::numeric, 0)
    from jsonb_array_elements(p_extra_costs) item;
  end if;

  -- Pass 2: deduct each component's stock and log the movement.
  for v_component in select component_variant_id, quantity_per_unit from bom_components where bom_id = p_bom_id
  loop
    v_qty_needed := v_component.quantity_per_unit * p_quantity;
    insert into inventory_movements (user_id, business_id, variant_id, movement_type, quantity, cost_basis, reference_type, reference_id, date)
    values (p_user_id, p_business_id, v_component.component_variant_id, 'component_out', -v_qty_needed,
      (select cost_per_item from product_variants where id = v_component.component_variant_id), 'bom_batch', v_batch_id, v_date);
    update product_variants set inventory_qty = inventory_qty - v_qty_needed, updated_at = now() where id = v_component.component_variant_id;
  end loop;

  -- Add the finished units, blending WAC.
  insert into inventory_movements (user_id, business_id, variant_id, movement_type, quantity, cost_basis, reference_type, reference_id, date)
  values (p_user_id, p_business_id, v_finished_variant_id, 'manufacture_in', p_quantity, v_cost_per_unit, 'bom_batch', v_batch_id, v_date);

  select inventory_qty, cost_per_item into v_exist_qty, v_exist_cost from product_variants where id = v_finished_variant_id;
  v_exist_qty := coalesce(v_exist_qty, 0);
  v_exist_cost := coalesce(v_exist_cost, 0);
  v_new_qty := v_exist_qty + p_quantity;
  v_new_cost := case when v_new_qty > 0 then (v_exist_qty * v_exist_cost + p_quantity * v_cost_per_unit) / v_new_qty else v_cost_per_unit end;
  update product_variants set inventory_qty = v_new_qty, cost_per_item = v_new_cost, updated_at = now() where id = v_finished_variant_id;

  -- Only the extra (cash) cost needs a capital debit + journal — material cost
  -- is already sitting in inventory value and just moved between variants.
  if v_extra_cost > 0 and p_account_id is not null then
    select current_balance, gl_account_id into v_current_balance, v_gl_account from capital_accounts where id = p_account_id;
    v_new_balance := coalesce(v_current_balance, 0) - v_extra_cost;

    insert into capital_transactions (user_id, business_id, account_id, transaction_type, amount, running_balance, category, description, date, reference_type, reference_id)
    values (p_user_id, p_business_id, p_account_id, 'manufacturing', -v_extra_cost, v_new_balance, 'manufacturing', 'BOM batch — labor/overhead', v_date, 'manufacturing_batch', v_batch_id);

    update capital_accounts set current_balance = v_new_balance where id = p_account_id;

    select id into v_inventory_account from chart_of_accounts where business_id = p_business_id and code = '1060';
    if v_inventory_account is not null and v_gl_account is not null then
      perform post_journal_entry(p_business_id, p_user_id, v_date, 'BOM batch (labor/overhead)', 'manufacturing_batch', v_batch_id,
        jsonb_build_array(
          jsonb_build_object('account_id', v_inventory_account, 'debit', v_extra_cost, 'credit', 0),
          jsonb_build_object('account_id', v_gl_account, 'debit', 0, 'credit', v_extra_cost)
        ));
    end if;
  end if;

  return v_batch_id;
end;
$$;

-- ---------- Simple HR / Payroll ----------
create table if not exists employees (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  business_id    uuid not null references businesses(id) on delete cascade,
  name           text not null,
  role           text,
  monthly_salary numeric not null default 0,
  phone          text,
  email          text,
  hire_date      date default current_date,
  is_active      boolean default true,
  created_at     timestamptz default now()
);

create table if not exists payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  business_id   uuid not null references businesses(id) on delete cascade,
  period_month  date not null,             -- first-of-month marker for the pay period
  status        text not null default 'draft' check (status in ('draft','paid')),
  total_amount  numeric default 0,
  paid_date     date,
  created_at    timestamptz default now()
);

create table if not exists payroll_run_lines (
  id              uuid primary key default gen_random_uuid(),
  payroll_run_id  uuid not null references payroll_runs(id) on delete cascade,
  employee_id     uuid references employees(id) on delete set null,
  base_salary     numeric not null default 0,
  bonus           numeric not null default 0,
  deductions      numeric not null default 0,
  net_amount      numeric not null default 0
);

create table if not exists leave_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  business_id  uuid not null references businesses(id) on delete cascade,
  employee_id  uuid not null references employees(id) on delete cascade,
  leave_type   text default 'annual',       -- annual | sick | unpaid | other
  start_date   date not null,
  end_date     date not null,
  notes        text,
  status       text not null default 'approved' check (status in ('pending','approved','rejected')),
  created_at   timestamptz default now()
);

-- ---- Atomic: pay a payroll run. Debits the chosen capital account for the
-- run's total, posts Dr Salaries & Wages (5070) / Cr [capital GL], and marks
-- the run paid — one transaction.
create or replace function process_payroll_run(
  p_business_id uuid, p_user_id uuid, p_payroll_run_id uuid, p_account_id uuid, p_date date
) returns uuid
language plpgsql
as $$
declare
  v_total numeric;
  v_current_balance numeric;
  v_gl_account uuid;
  v_new_balance numeric;
  v_tx_id uuid;
  v_salaries_account uuid;
  v_date date := coalesce(p_date, current_date);
begin
  select coalesce(sum(net_amount), 0) into v_total from payroll_run_lines where payroll_run_id = p_payroll_run_id;
  if v_total <= 0 then
    raise exception 'Payroll run % has no payable lines', p_payroll_run_id;
  end if;

  select current_balance, gl_account_id into v_current_balance, v_gl_account from capital_accounts where id = p_account_id;
  v_new_balance := coalesce(v_current_balance, 0) - v_total;

  insert into capital_transactions (user_id, business_id, account_id, transaction_type, amount, running_balance, category, description, date, reference_type, reference_id)
  values (p_user_id, p_business_id, p_account_id, 'expense', -v_total, v_new_balance, 'overhead', 'Payroll run', v_date, 'payroll_run', p_payroll_run_id)
  returning id into v_tx_id;

  update capital_accounts set current_balance = v_new_balance where id = p_account_id;

  update payroll_runs set status = 'paid', total_amount = v_total, paid_date = v_date where id = p_payroll_run_id;

  select id into v_salaries_account from chart_of_accounts where business_id = p_business_id and code = '5070';
  if v_salaries_account is not null and v_gl_account is not null then
    perform post_journal_entry(p_business_id, p_user_id, v_date, 'Payroll run', 'payroll_run', p_payroll_run_id,
      jsonb_build_array(
        jsonb_build_object('account_id', v_salaries_account, 'debit', v_total, 'credit', 0),
        jsonb_build_object('account_id', v_gl_account, 'debit', 0, 'credit', v_total)
      ));
  end if;

  return v_tx_id;
end;
$$;

-- ---- Open access (no-login) for the new tables
do $$
declare t text;
begin
  foreach t in array array['bill_of_materials','bom_components','employees','payroll_runs','payroll_run_lines','leave_records']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

create index if not exists idx_bom_business        on bill_of_materials(business_id);
create index if not exists idx_bomcomp_bom          on bom_components(bom_id);
create index if not exists idx_employees_business   on employees(business_id, is_active);
create index if not exists idx_payrollruns_business  on payroll_runs(business_id, period_month);
create index if not exists idx_payrolllines_run      on payroll_run_lines(payroll_run_id);
create index if not exists idx_leave_employee        on leave_records(employee_id, start_date);
