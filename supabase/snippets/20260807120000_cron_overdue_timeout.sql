-- ============================================================
-- Reschedule: overdue-invoice-scheduler
--
-- Only change from 20260727123025_cron_jobs.sql is the request
-- timeout, 5s -> 60s.
--
-- pg_net gives up waiting after `timeout_milliseconds` and records
-- the attempt as a timeout. The handler makes one Google OAuth call,
-- one admin lookup per distinct client, and one Gmail send plus one
-- status update per overdue invoice, so five seconds was never long
-- enough to see the outcome on a real workload. The work itself was
-- not cancelled — pg_net only stops waiting — so the effect was that
-- cron.job_run_details could never tell you whether a run succeeded.
--
-- A new migration rather than an edit to the original: that one has
-- already been applied, and cron.schedule on the same jobname is an
-- update, not a duplicate.
-- ============================================================

select cron.unschedule('overdue-invoice-scheduler')
where exists (select 1 from cron.job where jobname = 'overdue-invoice-scheduler');

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
