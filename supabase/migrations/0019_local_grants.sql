-- ============================================================================
-- LOCAL DEV ONLY. Hosted Supabase configures these role grants automatically
-- at the platform level, so this file is NOT part of the hosted SQL handoff —
-- it exists only so `supabase start` (self-managed local Postgres) grants the
-- anon/authenticated roles the same baseline access the hosted project has.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
