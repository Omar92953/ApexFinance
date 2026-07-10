-- ============================================================================
-- Apex Business Manager — Phase 10: Audit trail.
-- Self-contained: run ONCE in the SQL editor. No-login pattern + open_access.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  table_name  text not null,
  row_id      text,
  action      text not null,        -- e.g. 'receive_po', 'pay_bill', 'record_bom_batch', 'merge_contacts'
  new_data    jsonb,
  created_at  timestamptz default now()
);

alter table audit_log enable row level security;
drop policy if exists open_access on audit_log;
create policy open_access on audit_log for all to anon, authenticated using (true) with check (true);

create index if not exists idx_audit_business on audit_log(business_id, created_at desc);
