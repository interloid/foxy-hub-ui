-- ============================================================
-- Cron jobs
-- URLs and secrets are read from Vault so this migration is
-- environment-agnostic (works against local, staging, prod).
-- ============================================================

-- Idempotent: unschedule any prior version before scheduling
select cron.unschedule('overdue-invoice-scheduler')
where exists (select 1 from cron.job where jobname = 'overdue-invoice-scheduler');

-- Runs daily at midnight UTC.
-- Calls the invoice-overdue-handler Edge Function.
select cron.schedule(
  'overdue-invoice-scheduler',
  '0 0 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_base_url')
           || '/functions/v1/invoice-overdue-handler',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'webhook_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Hourly reset of the shared demo workspace - see public.reset_demo_org() in
-- schemas/functions/functions.sql. Must sort after the migration that creates it.

-- The schema diff grants a new function to anon and authenticated through the default
-- privileges, so the revoke in grants/grants.sql has to be applied here as well: a visitor
-- calling reset_demo_org() through the API could reset the demo under everyone else.
revoke execute on function public.reset_demo_org() from public, anon, authenticated;
grant  execute on function public.reset_demo_org() to service_role;

-- Idempotent: drop any earlier version of the job first.
select cron.unschedule('demo-reset')
where exists (select 1 from cron.job where jobname = 'demo-reset');

-- At the top of every hour (UTC). Runs as postgres, in its own transaction.
select cron.schedule(
  'demo-reset',
  '0 * * * *',
  $$select public.reset_demo_org()$$
);

-- Once now, so the demo (and Sofia Reyes's new data) is fresh straight away instead of at
-- the next hour. A no-op on a database without the demo workspace.
select public.reset_demo_org();