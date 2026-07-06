-- ============================================================================
-- Apex Finance — automatic sync schedule (run ONCE in the Supabase SQL editor,
-- AFTER deploying the sync-shopify and sync-meta Edge Functions).
-- Calls each sync function every 15 minutes in "cron mode" (service-role key),
-- which syncs every connected business.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Store the service-role key in Vault so it isn't written in plaintext in the job.
--    Get it from: Dashboard → Project Settings → API → service_role (secret).
--    Replace the placeholder below, run this line once, then you can delete it.
-- select vault.create_secret('PASTE_YOUR_SERVICE_ROLE_KEY_HERE', 'apex_service_role_key');

-- 2) Schedule the two sync jobs.
select cron.schedule('apex-sync-shopify', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://gyqqrbchpepvchjgweep.supabase.co/functions/v1/sync-shopify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'apex_service_role_key')
    ),
    body := '{}'::jsonb
  );
$$);

select cron.schedule('apex-sync-meta', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://gyqqrbchpepvchjgweep.supabase.co/functions/v1/sync-meta',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'apex_service_role_key')
    ),
    body := '{}'::jsonb
  );
$$);

-- Useful management queries:
--   select * from cron.job;                       -- list scheduled jobs
--   select * from cron.job_run_details order by start_time desc limit 20;  -- run history
--   select cron.unschedule('apex-sync-shopify');  -- stop a job
