-- Phase 0: make pgmq the canonical delivery mechanism for AI background jobs.
-- Safe to apply after a staging restore. This migration is additive and does not touch production data rows.

begin;

do $$
begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'myschool_ai_requests') then
    perform pgmq.create('myschool_ai_requests');
  end if;
end;
$$;

alter table public.ai_requests
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists last_error text;

alter table public.question_generation_jobs
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text;

alter table public.curriculum_ingestion_jobs
  add column if not exists idempotency_key text;

create unique index if not exists curriculum_ingestion_jobs_idempotency_key_uidx
  on public.curriculum_ingestion_jobs (idempotency_key)
  where idempotency_key is not null;

-- Publish one small, idempotency-addressable pointer per AI request. Never enqueue prompts or PII.
create or replace function app.publish_ai_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app, pgmq
as $$
declare
  delay_seconds integer;
begin
  if new.status::text <> 'queued' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  delay_seconds := greatest(
    0,
    least(86400, ceil(extract(epoch from (coalesce(new.available_at, now()) - now())))::integer)
  );

  perform pgmq.send(
    'myschool_ai_requests',
    jsonb_build_object('ai_request_id', new.id),
    delay_seconds
  );
  return new;
end;
$$;

drop trigger if exists ai_requests_publish_insert on public.ai_requests;
drop trigger if exists ai_requests_publish_retry on public.ai_requests;

create trigger ai_requests_publish_insert
after insert on public.ai_requests
for each row
when (new.status::text = 'queued')
execute function app.publish_ai_request();

create trigger ai_requests_publish_retry
after update of status on public.ai_requests
for each row
when (old.status::text is distinct from new.status::text and new.status::text = 'queued')
execute function app.publish_ai_request();

-- Existing job publishers now honor available_at. A retry changes status to retrying,
-- creates a delayed message, and the current delivery is archived by the worker.
create or replace function app.publish_question_generation_job()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app, pgmq
as $$
declare
  target_queue text;
  delay_seconds integer;
begin
  if new.job_status not in ('queued', 'retrying') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.job_status is not distinct from new.job_status then
    return new;
  end if;

  target_queue := case
    when new.job_type in ('ingest_book', 'chunk_book') then 'myschool_curriculum_ingestion'
    when new.job_type in ('embed_chunks', 'embed_questions') then 'myschool_embedding'
    else 'myschool_question_generation'
  end;

  delay_seconds := greatest(
    0,
    least(86400, ceil(extract(epoch from (coalesce(new.available_at, now()) - now())))::integer)
  );

  perform pgmq.send(
    target_queue,
    jsonb_build_object(
      'job_id', new.id,
      'batch_id', new.batch_id,
      'schedule_id', new.schedule_id,
      'source_version_id', new.source_version_id,
      'job_type', new.job_type,
      'idempotency_key', new.idempotency_key
    ),
    delay_seconds
  );
  return new;
end;
$$;

create or replace function app.publish_curriculum_ingestion_job()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app, pgmq
as $$
declare
  delay_seconds integer;
begin
  if new.job_status not in ('queued', 'retrying') then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.job_status is not distinct from new.job_status then
    return new;
  end if;

  delay_seconds := greatest(
    0,
    least(86400, ceil(extract(epoch from (coalesce(new.available_at, now()) - now())))::integer)
  );

  perform pgmq.send(
    'myschool_curriculum_ingestion',
    jsonb_build_object(
      'curriculum_ingestion_job_id', new.id,
      'source_version_id', new.source_version_id,
      'stage', new.stage
    ),
    delay_seconds
  );
  return new;
end;
$$;

-- Only the service-role worker can read or archive messages.
create or replace function public.worker_read_queue(
  p_queue_name text,
  p_limit integer default 3,
  p_visibility_timeout_seconds integer default 900
)
returns table (
  msg_id bigint,
  read_ct bigint,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, pgmq
as $$
begin
  if p_queue_name not in (
    'myschool_ai_requests',
    'myschool_question_generation',
    'myschool_curriculum_ingestion',
    'myschool_embedding'
  ) then
    raise exception 'Queue is not registered for My School workers';
  end if;
  if p_limit < 1 or p_limit > 25 then
    raise exception 'p_limit must be between 1 and 25';
  end if;
  if p_visibility_timeout_seconds < 60 or p_visibility_timeout_seconds > 3600 then
    raise exception 'Visibility timeout must be between 60 and 3600 seconds';
  end if;

  return query
    select r.msg_id, r.read_ct, r.enqueued_at, r.vt, r.message
    from pgmq.read(p_queue_name, p_visibility_timeout_seconds, p_limit) as r;
end;
$$;

create or replace function public.worker_archive_queue_message(
  p_queue_name text,
  p_msg_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pgmq
as $$
begin
  if p_queue_name not in (
    'myschool_ai_requests',
    'myschool_question_generation',
    'myschool_curriculum_ingestion',
    'myschool_embedding'
  ) then
    raise exception 'Queue is not registered for My School workers';
  end if;
  if p_msg_id is null or p_msg_id < 1 then
    raise exception 'Invalid queue message id';
  end if;
  return pgmq.archive(p_queue_name, p_msg_id);
end;
$$;

-- Atomic claims. PGMQ provides message visibility; these updates are the final
-- database-level guard against duplicate delivery or multiple worker instances.
create or replace function public.worker_claim_ai_request(
  p_request_id uuid,
  p_worker_id text
)
returns setof public.ai_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed public.ai_requests%rowtype;
begin
  if p_worker_id is null or length(p_worker_id) < 8 or length(p_worker_id) > 128 then
    raise exception 'Invalid worker id';
  end if;

  update public.ai_requests r
     set status = 'processing',
         attempts = r.attempts + 1,
         locked_at = now(),
         locked_by = p_worker_id,
         last_error = null
   where r.id = p_request_id
     and r.attempts < r.max_attempts
     and (
       (r.status::text = 'queued' and r.available_at <= now())
       or (
         r.status::text = 'processing'
         and coalesce(r.locked_at, r.created_at) < now() - interval '15 minutes'
       )
     )
  returning r.* into claimed;

  if found then
    return next claimed;
    return;
  end if;

  update public.ai_requests r
     set status = 'failed',
         completed_at = coalesce(r.completed_at, now()),
         last_error = coalesce(r.last_error, 'Maximum worker attempts exceeded'),
         locked_at = null,
         locked_by = null
   where r.id = p_request_id
     and r.status::text in ('queued', 'processing')
     and r.attempts >= r.max_attempts;
end;
$$;

create or replace function public.worker_claim_question_generation_job(
  p_job_id uuid,
  p_worker_id text
)
returns setof public.question_generation_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed public.question_generation_jobs%rowtype;
begin
  if p_worker_id is null or length(p_worker_id) < 8 or length(p_worker_id) > 128 then
    raise exception 'Invalid worker id';
  end if;

  update public.question_generation_jobs j
     set job_status = 'processing',
         attempts = j.attempts + 1,
         locked_at = now(),
         locked_by = p_worker_id,
         last_error = null
   where j.id = p_job_id
     and j.attempts < j.max_attempts
     and (
       (j.job_status in ('queued', 'retrying') and j.available_at <= now())
       or (
         j.job_status = 'processing'
         and coalesce(j.locked_at, j.created_at) < now() - interval '15 minutes'
       )
     )
  returning j.* into claimed;

  if found then
    return next claimed;
    return;
  end if;

  update public.question_generation_jobs j
     set job_status = 'failed',
         last_error = coalesce(j.last_error, 'Maximum worker attempts exceeded'),
         locked_at = null,
         locked_by = null
   where j.id = p_job_id
     and j.job_status in ('queued', 'retrying', 'processing')
     and j.attempts >= j.max_attempts;
end;
$$;

create or replace function public.worker_claim_curriculum_ingestion_job(
  p_job_id uuid,
  p_worker_id text
)
returns setof public.curriculum_ingestion_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed public.curriculum_ingestion_jobs%rowtype;
begin
  if p_worker_id is null or length(p_worker_id) < 8 or length(p_worker_id) > 128 then
    raise exception 'Invalid worker id';
  end if;

  update public.curriculum_ingestion_jobs j
     set job_status = 'processing',
         attempts = j.attempts + 1,
         locked_at = now(),
         locked_by = p_worker_id,
         last_error = null,
         updated_at = now()
   where j.id = p_job_id
     and j.attempts < j.max_attempts
     and (
       (j.job_status in ('queued', 'retrying') and j.available_at <= now())
       or (
         j.job_status = 'processing'
         and coalesce(j.locked_at, j.created_at) < now() - interval '15 minutes'
       )
     )
  returning j.* into claimed;

  if found then
    return next claimed;
    return;
  end if;

  update public.curriculum_ingestion_jobs j
     set job_status = 'failed',
         last_error = coalesce(j.last_error, 'Maximum worker attempts exceeded'),
         locked_at = null,
         locked_by = null,
         updated_at = now()
   where j.id = p_job_id
     and j.job_status in ('queued', 'retrying', 'processing')
     and j.attempts >= j.max_attempts;
end;
$$;

revoke all on function public.worker_read_queue(text, integer, integer) from public, anon, authenticated;
revoke all on function public.worker_archive_queue_message(text, bigint) from public, anon, authenticated;
revoke all on function public.worker_claim_ai_request(uuid, text) from public, anon, authenticated;
revoke all on function public.worker_claim_question_generation_job(uuid, text) from public, anon, authenticated;
revoke all on function public.worker_claim_curriculum_ingestion_job(uuid, text) from public, anon, authenticated;

grant execute on function public.worker_read_queue(text, integer, integer) to service_role;
grant execute on function public.worker_archive_queue_message(text, bigint) to service_role;
grant execute on function public.worker_claim_ai_request(uuid, text) to service_role;
grant execute on function public.worker_claim_question_generation_job(uuid, text) to service_role;
grant execute on function public.worker_claim_curriculum_ingestion_job(uuid, text) to service_role;

commit;
