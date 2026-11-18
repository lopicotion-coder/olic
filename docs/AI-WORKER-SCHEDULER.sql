-- Operator-run script: only execute after the ai-worker branch has been deployed.
-- Secrets must be created in Supabase Vault under these exact names:
--   project_url          e.g. https://<project-ref>.supabase.co
--   publishable_key      the project's Supabase publishable API key
--   worker_internal_token the same random value configured as AI_WORKER_INTERNAL_TOKEN
--
-- The publishable key is used only for Supabase's function gateway verification.
-- The independent x-worker-token is what authorizes the privileged Worker operation.
-- Never place secret values in this script or directly in cron.job.command.

do $$
declare
  v_project_url text;
  v_publishable_key text;
  v_worker_token text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault is not available; enable it before scheduling the Worker';
  end if;

  select decrypted_secret into v_project_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_publishable_key
    from vault.decrypted_secrets where name = 'publishable_key';
  select decrypted_secret into v_worker_token
    from vault.decrypted_secrets where name = 'worker_internal_token';

  if coalesce(length(trim(v_project_url)), 0) = 0
     or coalesce(length(trim(v_publishable_key)), 0) = 0
     or coalesce(length(trim(v_worker_token)), 0) < 32 then
    raise exception 'Missing Vault credentials or worker token shorter than 32 characters';
  end if;
  if v_project_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/?$' then
    raise exception 'project_url must be the canonical Supabase HTTPS project URL';
  end if;
end;
$$;

-- Remove a prior Worker schedule so this script is safe to re-run.
select cron.unschedule(jobid)
from cron.job
where jobname = 'myschool-ai-worker';

-- Invoke the deployed protected Edge Function every minute.
-- pg_net sends the HTTP request asynchronously after the transaction commits.
select cron.schedule(
  'myschool-ai-worker',
  '* * * * *',
  $worker$
    select net.http_post(
      url := (select rtrim(decrypted_secret, '/') from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/ai-worker/run',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
        'x-worker-token', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_internal_token')
      ),
      body := '{"mode":"all","limit":3}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $worker$
);

-- Check scheduled Worker requests and HTTP outcomes:
-- select jobid, jobname, schedule, active from cron.job where jobname = 'myschool-ai-worker';
-- select id, status_code, timed_out, error_msg, created
-- from net._http_response
-- order by created desc limit 30;
--
-- Disable the Worker scheduler when needed:
-- select cron.unschedule(jobid) from cron.job where jobname = 'myschool-ai-worker';
