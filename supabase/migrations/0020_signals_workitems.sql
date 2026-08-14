-- ============================================================================
-- Apex Business Manager — Product Plan v2, Phase 1+2:
-- Signal Engine persistence + tasks promoted to first-class work items.
--
-- Signals themselves are COMPUTED, not stored — they're derived from live
-- module state on every load, so they can never go stale. What we persist is
-- only the human decisions layered on top: dismissals/snoozes, and the tasks
-- spawned from a signal.
-- ============================================================================

-- ---------- Signal dismissals / snoozes ----------
-- signal_id is the deterministic id emitted by src/finance/signals.ts
-- (e.g. 'overdue-invoice:<uuid>'), which is why it can be referenced stably
-- across recomputations without storing the signal itself.
create table if not exists signal_dismissals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  business_id    uuid not null references businesses(id) on delete cascade,
  signal_id      text not null,
  snoozed_until  date,               -- null = dismissed indefinitely
  reason         text,
  created_at     timestamptz default now(),
  unique (business_id, signal_id)
);

-- ---------- Tasks → work items ----------
-- Additive only: the existing CRM Tasks tab keeps working unchanged, while
-- signals can now spawn owned, dated, traceable work.
alter table tasks add column if not exists priority        text default 'normal';
alter table tasks add column if not exists assignee        text;
alter table tasks add column if not exists notes           text;
alter table tasks add column if not exists source_signal_id text;
alter table tasks add column if not exists entity_type     text;
alter table tasks add column if not exists entity_id       text;
alter table tasks add column if not exists completed_at    timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_check') then
    alter table tasks add constraint tasks_priority_check
      check (priority in ('low', 'normal', 'high', 'urgent'));
  end if;
end $$;

-- One open task per signal — prevents spawning duplicates when the same
-- signal recurs on every dashboard load. Partial so completed tasks don't block.
create unique index if not exists idx_tasks_open_signal
  on tasks (business_id, source_signal_id)
  where source_signal_id is not null and is_done = false;

-- ---------- Open access (no-login) ----------
alter table signal_dismissals enable row level security;
drop policy if exists open_access on signal_dismissals;
create policy open_access on signal_dismissals for all to anon, authenticated using (true) with check (true);

grant all on signal_dismissals to anon, authenticated, service_role;

create index if not exists idx_dismissals_business on signal_dismissals(business_id);
create index if not exists idx_tasks_business_open on tasks(business_id, is_done, due_date);
