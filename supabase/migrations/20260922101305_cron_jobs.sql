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