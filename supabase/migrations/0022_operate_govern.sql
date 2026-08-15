-- ============================================================================
-- Apex Business Manager — Product Plan v2, Phase 9: Operate + Govern.
--
-- OPERATE is the weekly rhythm the business actually runs on (EOS/Traction):
-- a Scorecard of leading numbers, a few quarterly Rocks, an Issues list, and
-- the weekly meeting that works through them.
--
-- GOVERN is the operating manual — the thing that makes the business
-- transferable instead of living in one person's head.
--
-- Both are universal: they apply to a shop, an agency, a wholesaler alike, so
-- neither is gated behind a capability.
-- ============================================================================

-- ---------- Scorecard ----------
create table if not exists scorecard_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  business_id  uuid not null references businesses(id) on delete cascade,
  name         text not null,
  owner        text,
  target_value numeric not null default 0,
  comparator   text not null default 'gte' check (comparator in ('gte', 'lte')),
  unit         text,                       -- 'EGP', '%', 'orders', …
  sort_order   integer default 0,
  is_active    boolean default true,
  created_at   timestamptz default now()
);

create table if not exists scorecard_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  business_id uuid not null references businesses(id) on delete cascade,
  metric_id   uuid not null references scorecard_metrics(id) on delete cascade,
  week_start  date not null,               -- always a Monday (see src/finance/eos.ts)
  value       numeric,
  created_at  timestamptz default now(),
  unique (metric_id, week_start)           -- one number per metric per week
);

-- ---------- Rocks (quarterly priorities) ----------
create table if not exists rocks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  business_id  uuid not null references businesses(id) on delete cascade,
  title        text not null,
  owner        text,
  quarter      text not null,              -- '2026-Q3'
  status       text not null default 'on_track' check (status in ('on_track', 'off_track', 'done')),
  due_date     date,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ---------- Issues (the IDS list) ----------
create table if not exists issues (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  business_id  uuid not null references businesses(id) on delete cascade,
  title        text not null,
  description  text,
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status       text not null default 'open' check (status in ('open', 'discussing', 'solved')),
  raised_by    text,
  resolution   text,
  solved_at    timestamptz,
  created_at   timestamptz default now()
);

-- ---------- Weekly meetings ----------
create table if not exists meetings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  business_id   uuid not null references businesses(id) on delete cascade,
  meeting_date  date not null default current_date,
  attendees     text,
  notes         text,
  rating        integer check (rating between 1 and 10),   -- the "level 10" self-score
  created_at    timestamptz default now()
);

-- ---------- Governance ----------
-- Nine document kinds share one table because they are structurally the same
-- thing: a titled, owned document with a review date. The kind-specific bits
-- (policy limits, system URLs, decision rationale) live in `meta`, which beats
-- nine near-identical tables.
--
-- SECURITY: the 'system' kind records THAT a credential exists, who owns it and
-- where it lives — never the credential itself. Secrets belong in a password
-- manager. Do not add a password/token column here.
create table if not exists governance_docs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  business_id  uuid not null references businesses(id) on delete cascade,
  kind         text not null check (kind in ('profile', 'role', 'sop', 'policy', 'vendor', 'system', 'decision', 'kpi', 'compliance')),
  title        text not null,
  body         text,
  owner        text,
  parent_id    uuid references governance_docs(id) on delete set null,  -- accountability chart hierarchy
  status       text not null default 'active' check (status in ('draft', 'active', 'archived')),
  review_due   date,          -- SOPs/policies: when this needs re-checking
  due_date     date,          -- compliance: next obligation
  recurrence   text check (recurrence in ('monthly', 'quarterly', 'annual')),
  meta         jsonb,
  sort_order   integer default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ---------- Open access (no-login) ----------
do $$
declare t text;
begin
  foreach t in array array['scorecard_metrics','scorecard_entries','rocks','issues','meetings','governance_docs']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists open_access on %I;', t);
    execute format('create policy open_access on %I for all to anon, authenticated using (true) with check (true);', t);
    execute format('grant all on %I to anon, authenticated, service_role;', t);
  end loop;
end $$;

create index if not exists idx_scorecard_metrics_business on scorecard_metrics(business_id, is_active, sort_order);
create index if not exists idx_scorecard_entries_metric   on scorecard_entries(metric_id, week_start desc);
create index if not exists idx_rocks_business             on rocks(business_id, quarter, status);
create index if not exists idx_issues_business            on issues(business_id, status, created_at);
create index if not exists idx_meetings_business          on meetings(business_id, meeting_date desc);
create index if not exists idx_governance_business        on governance_docs(business_id, kind, sort_order);
create index if not exists idx_governance_due             on governance_docs(business_id, due_date) where due_date is not null;
