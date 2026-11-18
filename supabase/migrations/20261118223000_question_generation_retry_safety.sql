-- Question generation retry-safety and reusable question indexing.
-- Persist the provider result once, then make database writes idempotent across retries.

begin;

create table if not exists public.question_generation_job_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.question_generation_jobs(id) on delete cascade,
  batch_id uuid not null references public.question_generation_batches(id) on delete cascade,
  provider_key text not null,
  model_key text not null,
  prompt_version text,
  response_sha256 char(64) not null check (response_sha256 ~ '^[0-9a-f]{64}$'),
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.question_generation_job_results enable row level security;

drop policy if exists question_generation_job_results_worker_only on public.question_generation_job_results;
create policy question_generation_job_results_worker_only
on public.question_generation_job_results
for all to service_role
using (true)
with check (true);

revoke all on public.question_generation_job_results from public, anon, authenticated, myschool_runtime;
grant all on public.question_generation_job_results to service_role;

create or replace function public.worker_finalize_question_generation_job(
  p_job_id uuid,
  p_batch_id uuid,
  p_accepted_count integer,
  p_rejected_count integer,
  p_provider_key text,
  p_model_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result_id uuid;
begin
  if p_accepted_count < 0 or p_rejected_count < 0 then
    raise exception 'Question counts cannot be negative';
  end if;
  if p_provider_key is null or p_model_key is null then
    raise exception 'Provider and model are required';
  end if;

  update public.question_generation_job_results r
     set accepted_count = p_accepted_count,
         rejected_count = p_rejected_count,
         finalized_at = now(),
         updated_at = now()
   where r.job_id = p_job_id
     and r.batch_id = p_batch_id
     and r.finalized_at is null
  returning r.id into result_id;

  if result_id is null then
    return false;
  end if;

  update public.question_generation_batches b
     set generated_count = b.generated_count + p_accepted_count + p_rejected_count,
         accepted_count = b.accepted_count + p_accepted_count,
         rejected_count = b.rejected_count + p_rejected_count,
         batch_status = case when p_accepted_count > 0 then 'completed' else 'failed' end,
         provider_key = p_provider_key,
         model_key = p_model_key,
         completed_at = now(),
         updated_at = now()
   where b.id = p_batch_id;

  if not found then
    raise exception 'Question generation batch not found';
  end if;

  update public.question_generation_jobs j
     set job_status = 'completed',
         last_error = null,
         locked_at = null,
         locked_by = null,
         updated_at = now()
   where j.id = p_job_id
     and j.batch_id = p_batch_id;

  if not found then
    raise exception 'Question generation job not found';
  end if;

  return true;
end;
$$;

revoke all on function public.worker_finalize_question_generation_job(uuid, uuid, integer, integer, text, text)
  from public, anon, authenticated, myschool_runtime;
grant execute on function public.worker_finalize_question_generation_job(uuid, uuid, integer, integer, text, text)
  to service_role;

create or replace function app.refresh_question_bank_search_vector()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.search_vector := to_tsvector(
    'simple'::regconfig,
    concat_ws(
      ' ',
      coalesce(new.question_text, ''),
      coalesce(new.choices::text, ''),
      coalesce(array_to_string(new.tags, ' '), ''),
      coalesce(new.subject_name, ''),
      coalesce(new.unit_title, ''),
      coalesce(new.lesson_title, '')
    )
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists question_bank_refresh_search_vector on public.question_bank;
create trigger question_bank_refresh_search_vector
before insert or update of question_text, choices, tags, subject_name, unit_title, lesson_title
on public.question_bank
for each row execute function app.refresh_question_bank_search_vector();

update public.question_bank
   set search_vector = to_tsvector(
     'simple'::regconfig,
     concat_ws(
       ' ',
       coalesce(question_text, ''),
       coalesce(choices::text, ''),
       coalesce(array_to_string(tags, ' '), ''),
       coalesce(subject_name, ''),
       coalesce(unit_title, ''),
       coalesce(lesson_title, '')
     )
   ),
       updated_at = now()
 where search_vector is null;

create index if not exists question_bank_curriculum_scope_status_idx
  on public.question_bank(sharing_scope, tenant_id, school_id, subject_code, grade_code, review_status, record_status);

commit;
