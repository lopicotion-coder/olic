-- Independent learner AI tutor requests, entitlements, costs and background execution.

begin;

do $$
begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'myschool_learner_ai_requests') then
    perform pgmq.create('myschool_learner_ai_requests');
  end if;
end;
$$;

create table if not exists public.learner_ai_requests (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  membership_id uuid references public.learner_school_memberships(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  feature_key text not null default 'tutor' check (feature_key = 'tutor'),
  subject_code text,
  grade_code text,
  source_version_id uuid references public.curriculum_source_versions(id) on delete set null,
  prompt_text text not null check (length(trim(prompt_text)) between 1 and 12000),
  input_context jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'canceled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  max_output_tokens integer not null default 1024 check (max_output_tokens between 128 and 8192),
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists learner_ai_requests_queue_idx
  on public.learner_ai_requests(status, available_at, created_at)
  where status in ('queued', 'processing');

create index if not exists learner_ai_requests_profile_recent_idx
  on public.learner_ai_requests(learner_profile_id, created_at desc);

create table if not exists public.learner_ai_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.learner_ai_requests(id) on delete cascade,
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  response_text text not null,
  response_json jsonb not null default '{}'::jsonb,
  provider_key text not null,
  model_key text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_amount numeric(14,8) not null default 0 check (cost_amount >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists learner_ai_responses_profile_recent_idx
  on public.learner_ai_responses(learner_profile_id, created_at desc);

create table if not exists public.learner_ai_usage (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.learner_ai_requests(id) on delete cascade,
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  feature_key text not null,
  provider_key text not null,
  model_key text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_amount numeric(14,8) not null default 0 check (cost_amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists learner_ai_usage_profile_period_idx
  on public.learner_ai_usage(learner_profile_id, feature_key, created_at desc);

create table if not exists public.learner_ai_rag_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.learner_ai_requests(id) on delete cascade,
  response_id uuid not null references public.learner_ai_responses(id) on delete cascade,
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  chunk_id uuid not null references public.curriculum_chunks(id) on delete restrict,
  retrieval_rank integer not null check (retrieval_rank > 0),
  similarity_score numeric,
  source_excerpt text not null,
  citation_label text,
  selected_for_answer boolean not null default false,
  created_at timestamptz not null default now(),
  unique (request_id, chunk_id)
);

create index if not exists learner_ai_rag_evidence_request_idx
  on public.learner_ai_rag_evidence(request_id, retrieval_rank);

create or replace function app.worker_has_learner_tutor_entitlement(
  p_learner_profile_id uuid
)
returns table (
  max_output_tokens integer,
  monthly_request_limit integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with entitlement_candidates as (
    select
      case
        when jsonb_typeof(feature.value) = 'object'
          then greatest(128, least(8192, coalesce((feature.value ->> 'max_output_tokens')::integer, 1024)))
        else 1024
      end as max_output_tokens,
      case
        when jsonb_typeof(feature.value) = 'object'
          then greatest(1, least(10000, coalesce((feature.value ->> 'monthly_requests')::integer, 30)))
        else 30
      end as monthly_request_limit,
      1 as priority
    from public.learner_subscriptions ls
    join public.subscription_plans sp on sp.id = ls.subscription_plan_id and sp.status = 'active'
    cross join lateral jsonb_each(sp.features) feature
    where ls.learner_profile_id = p_learner_profile_id
      and ls.status in ('active', 'trialing')
      and ls.starts_on <= current_date
      and (ls.ends_on is null or ls.ends_on >= current_date)
      and feature.key = 'tutor'
      and (
        feature.value = 'true'::jsonb
        or feature.value ->> 'enabled' = 'true'
        or feature.value ->> 'included' = 'true'
      )

    union all

    select
      case
        when jsonb_typeof(feature.value) = 'object'
          then greatest(128, least(8192, coalesce((feature.value ->> 'max_output_tokens')::integer, 1024)))
        else 1024
      end as max_output_tokens,
      case
        when jsonb_typeof(feature.value) = 'object'
          then greatest(1, least(10000, coalesce((feature.value ->> 'monthly_requests')::integer, 30)))
        else 30
      end as monthly_request_limit,
      2 as priority
    from public.learner_school_memberships lm
    join public.tenant_subscriptions ts
      on ts.tenant_id = lm.tenant_id
     and ts.status in ('active', 'trialing')
     and ts.starts_on <= current_date
     and (ts.ends_on is null or ts.ends_on >= current_date)
     and (ts.trial_ends_on is null or ts.trial_ends_on >= current_date)
    join public.subscription_plans sp on sp.id = ts.subscription_plan_id and sp.status = 'active'
    cross join lateral jsonb_each(sp.features) feature
    where lm.learner_profile_id = p_learner_profile_id
      and lm.membership_status = 'active'
      and feature.key = 'tutor'
      and (
        feature.value = 'true'::jsonb
        or feature.value ->> 'enabled' = 'true'
        or feature.value ->> 'included' = 'true'
      )
  )
  select c.max_output_tokens, c.monthly_request_limit
  from entitlement_candidates c
  order by c.priority
  limit 1;
$$;

revoke all on function app.worker_has_learner_tutor_entitlement(uuid) from public, anon, authenticated, myschool_runtime;
grant execute on function app.worker_has_learner_tutor_entitlement(uuid) to service_role;

create or replace function public.create_learner_ai_request(
  p_learner_profile_id uuid,
  p_prompt_text text,
  p_subject_code text default null,
  p_grade_code text default null,
  p_source_version_id uuid default null,
  p_membership_id uuid default null,
  p_input_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := auth.uid();
  selected_membership public.learner_school_memberships%rowtype;
  monthly_limit integer;
  monthly_used bigint;
  output_limit integer;
  learner_request_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not app.can_manage_learner_practice(p_learner_profile_id) then
    raise exception 'Learner profile access denied';
  end if;
  if p_prompt_text is null or length(trim(p_prompt_text)) < 1 or length(p_prompt_text) > 12000 then
    raise exception 'Prompt length must be between 1 and 12000 characters';
  end if;

  if p_membership_id is not null then
    select * into selected_membership
    from public.learner_school_memberships
    where id = p_membership_id
      and learner_profile_id = p_learner_profile_id
      and membership_status = 'active'
    for share;
    if not found then raise exception 'Selected school membership is not active for this learner'; end if;
  end if;

  if p_source_version_id is not null and not exists (
    select 1
    from public.curriculum_source_versions cv
    join public.curriculum_sources cs on cs.id = cv.source_id
    where cv.id = p_source_version_id
      and cv.ingestion_status = 'ready'
      and cs.status = 'active'
      and cs.rights_status = 'approved'
      and 'rag' = any(cs.permitted_uses)
      and (
        cs.sharing_scope = 'platform'
        or (
          p_membership_id is not null
          and cs.tenant_id = selected_membership.tenant_id
          and (
            cs.sharing_scope = 'tenant'
            or (cs.sharing_scope = 'school' and cs.school_id = selected_membership.school_id)
          )
        )
      )
  ) then
    raise exception 'Selected curriculum version is not available to this learner';
  end if;

  select e.max_output_tokens, e.monthly_request_limit
    into output_limit, monthly_limit
  from app.worker_has_learner_tutor_entitlement(p_learner_profile_id) e;

  if not found then
    raise exception 'An active My School Tutor entitlement is required';
  end if;

  select count(*) into monthly_used
  from public.learner_ai_requests
  where learner_profile_id = p_learner_profile_id
    and feature_key = 'tutor'
    and created_at >= date_trunc('month', now());

  if monthly_used >= monthly_limit then
    raise exception 'The learner monthly tutor request allowance has been reached';
  end if;

  insert into public.learner_ai_requests (
    learner_profile_id, requester_user_id, membership_id, tenant_id, school_id,
    feature_key, subject_code, grade_code, source_version_id,
    prompt_text, input_context, max_output_tokens
  )
  values (
    p_learner_profile_id,
    actor_id,
    p_membership_id,
    case when p_membership_id is null then null else selected_membership.tenant_id end,
    case when p_membership_id is null then null else selected_membership.school_id end,
    'tutor',
    p_subject_code,
    p_grade_code,
    p_source_version_id,
    trim(p_prompt_text),
    coalesce(p_input_context, '{}'::jsonb),
    output_limit
  )
  returning id into learner_request_id;

  return learner_request_id;
end;
$$;

create or replace function app.publish_learner_ai_request()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app, pgmq
as $$
begin
  if new.status = 'queued' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform pgmq.send(
      'myschool_learner_ai_requests',
      jsonb_build_object('learner_ai_request_id', new.id),
      greatest(0, least(86400, ceil(extract(epoch from (new.available_at - now())))::integer))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists learner_ai_requests_publish_insert on public.learner_ai_requests;
create trigger learner_ai_requests_publish_insert
after insert on public.learner_ai_requests
for each row
when (new.status = 'queued')
execute function app.publish_learner_ai_request();

drop trigger if exists learner_ai_requests_publish_retry on public.learner_ai_requests;
create trigger learner_ai_requests_publish_retry
after update of status on public.learner_ai_requests
for each row
when (old.status is distinct from new.status and new.status = 'queued')
execute function app.publish_learner_ai_request();

create or replace function public.worker_claim_learner_ai_request(
  p_request_id uuid,
  p_worker_id text
)
returns setof public.learner_ai_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed public.learner_ai_requests%rowtype;
begin
  if p_worker_id is null or length(p_worker_id) < 8 or length(p_worker_id) > 128 then
    raise exception 'Invalid worker id';
  end if;

  update public.learner_ai_requests r
     set status = 'processing',
         attempts = r.attempts + 1,
         locked_at = now(),
         locked_by = p_worker_id,
         last_error = null,
         updated_at = now()
   where r.id = p_request_id
     and r.attempts < r.max_attempts
     and (
       (r.status = 'queued' and r.available_at <= now())
       or (r.status = 'processing' and coalesce(r.locked_at, r.created_at) < now() - interval '15 minutes')
     )
  returning r.* into claimed;

  if found then return next claimed; return; end if;

  update public.learner_ai_requests r
     set status = 'failed',
         completed_at = coalesce(r.completed_at, now()),
         last_error = coalesce(r.last_error, 'Maximum worker attempts exceeded'),
         locked_at = null,
         locked_by = null,
         updated_at = now()
   where r.id = p_request_id
     and r.status in ('queued', 'processing')
     and r.attempts >= r.max_attempts;
end;
$$;

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
    'myschool_learner_ai_requests',
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
    'myschool_learner_ai_requests',
    'myschool_question_generation',
    'myschool_curriculum_ingestion',
    'myschool_embedding'
  ) then
    raise exception 'Queue is not registered for My School workers';
  end if;
  if p_msg_id is null or p_msg_id < 1 then raise exception 'Invalid queue message id'; end if;
  return pgmq.archive(p_queue_name, p_msg_id);
end;
$$;

alter table public.learner_ai_requests enable row level security;
alter table public.learner_ai_responses enable row level security;
alter table public.learner_ai_usage enable row level security;
alter table public.learner_ai_rag_evidence enable row level security;

drop policy if exists learner_ai_requests_read on public.learner_ai_requests;
create policy learner_ai_requests_read
on public.learner_ai_requests for select to authenticated, myschool_runtime
using (app.can_manage_learner_practice(learner_profile_id));

drop policy if exists learner_ai_responses_read on public.learner_ai_responses;
create policy learner_ai_responses_read
on public.learner_ai_responses for select to authenticated, myschool_runtime
using (app.can_manage_learner_practice(learner_profile_id));

drop policy if exists learner_ai_rag_evidence_read on public.learner_ai_rag_evidence;
create policy learner_ai_rag_evidence_read
on public.learner_ai_rag_evidence for select to authenticated, myschool_runtime
using (app.can_manage_learner_practice(learner_profile_id));

drop policy if exists learner_ai_usage_read on public.learner_ai_usage;
create policy learner_ai_usage_read
on public.learner_ai_usage for select to authenticated, myschool_runtime
using (app.can_manage_learner_practice(learner_profile_id));

revoke all on public.learner_ai_requests, public.learner_ai_responses, public.learner_ai_usage,
  public.learner_ai_rag_evidence
  from public, anon, authenticated, myschool_runtime;
grant select on public.learner_ai_requests, public.learner_ai_responses, public.learner_ai_usage,
  public.learner_ai_rag_evidence
  to authenticated, myschool_runtime;
grant all on public.learner_ai_requests, public.learner_ai_responses, public.learner_ai_usage,
  public.learner_ai_rag_evidence
  to service_role;

revoke all on function public.create_learner_ai_request(uuid, text, text, text, uuid, uuid, jsonb)
  from public, anon;
revoke all on function public.worker_claim_learner_ai_request(uuid, text)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_read_queue(text, integer, integer)
  from public, anon, authenticated, myschool_runtime;
revoke all on function public.worker_archive_queue_message(text, bigint)
  from public, anon, authenticated, myschool_runtime;

grant execute on function public.create_learner_ai_request(uuid, text, text, text, uuid, uuid, jsonb)
  to authenticated, myschool_runtime;
grant execute on function public.worker_claim_learner_ai_request(uuid, text)
  to service_role;
grant execute on function public.worker_read_queue(text, integer, integer)
  to service_role;
grant execute on function public.worker_archive_queue_message(text, bigint)
  to service_role;

commit;
