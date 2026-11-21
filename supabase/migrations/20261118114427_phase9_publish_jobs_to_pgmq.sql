
create or replace function app.publish_question_generation_job()
returns trigger
language plpgsql
security definer
set search_path = pgmq, pg_catalog, public, app, pg_temp
as $$
declare
  target_queue text;
begin
  if new.job_status not in ('queued','retrying') then
    return new;
  end if;

  target_queue := case
    when new.job_type in ('ingest_book','chunk_book') then 'myschool_curriculum_ingestion'
    when new.job_type in ('embed_chunks','embed_questions') then 'myschool_embedding'
    else 'myschool_question_generation'
  end;

  perform pgmq.send(
    target_queue,
    jsonb_build_object(
      'job_id', new.id,
      'batch_id', new.batch_id,
      'schedule_id', new.schedule_id,
      'source_version_id', new.source_version_id,
      'job_type', new.job_type,
      'idempotency_key', new.idempotency_key
    )
  );

  return new;
end;
$$;

revoke all on function app.publish_question_generation_job()
  from public, anon, authenticated, myschool_runtime, service_role;

create trigger question_generation_jobs_publish_insert
after insert on public.question_generation_jobs
for each row
when (new.job_status in ('queued','retrying'))
execute function app.publish_question_generation_job();

create trigger question_generation_jobs_publish_retry
after update of job_status on public.question_generation_jobs
for each row
when (old.job_status is distinct from new.job_status
  and new.job_status in ('queued','retrying'))
execute function app.publish_question_generation_job();

create or replace function app.publish_curriculum_ingestion_job()
returns trigger
language plpgsql
security definer
set search_path = pgmq, pg_catalog, public, app, pg_temp
as $$
begin
  if new.job_status in ('queued','retrying') then
    perform pgmq.send(
      'myschool_curriculum_ingestion',
      jsonb_build_object(
        'curriculum_ingestion_job_id', new.id,
        'source_version_id', new.source_version_id,
        'stage', new.stage
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function app.publish_curriculum_ingestion_job()
  from public, anon, authenticated, myschool_runtime, service_role;

create trigger curriculum_ingestion_jobs_publish_insert
after insert on public.curriculum_ingestion_jobs
for each row
when (new.job_status in ('queued','retrying'))
execute function app.publish_curriculum_ingestion_job();

create trigger curriculum_ingestion_jobs_publish_retry
after update of job_status on public.curriculum_ingestion_jobs
for each row
when (old.job_status is distinct from new.job_status
  and new.job_status in ('queued','retrying'))
execute function app.publish_curriculum_ingestion_job();

comment on function app.publish_question_generation_job() is
  'Publishes durable question-generation job rows into the matching private pgmq queue.';
comment on function app.publish_curriculum_ingestion_job() is
  'Publishes curriculum ingestion job rows into the private pgmq queue.';
