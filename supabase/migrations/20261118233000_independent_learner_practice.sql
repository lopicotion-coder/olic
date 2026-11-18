-- Independent learner practice: student-first question delivery, exposures and attempts.
-- Existing school-bound exposure/attempt tables remain unchanged.

begin;

create table if not exists public.learner_question_exposures (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  question_id uuid not null references public.question_bank(id) on delete restrict,
  tenant_id uuid references public.tenants(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  exposure_status text not null default 'assigned'
    check (exposure_status in ('assigned', 'delivered', 'opened', 'answered', 'needs_review', 'completed', 'expired')),
  assigned_at timestamptz not null default now(),
  first_delivered_at timestamptz,
  first_opened_at timestamptz,
  first_answered_at timestamptz,
  last_answered_at timestamptz,
  last_event_at timestamptz not null default now(),
  display_count integer not null default 1 check (display_count >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learner_profile_id, question_id)
);

create index if not exists learner_question_exposures_recent_idx
  on public.learner_question_exposures(learner_profile_id, last_event_at desc);

create index if not exists learner_question_exposures_question_idx
  on public.learner_question_exposures(question_id, learner_profile_id);

create table if not exists public.learner_question_attempts (
  id uuid primary key default gen_random_uuid(),
  exposure_id uuid not null references public.learner_question_exposures(id) on delete restrict,
  learner_profile_id uuid not null references public.learner_profiles(id) on delete restrict,
  question_id uuid not null references public.question_bank(id) on delete restrict,
  tenant_id uuid references public.tenants(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  attempt_number integer not null check (attempt_number > 0),
  answer_payload jsonb not null,
  is_correct boolean,
  score numeric(8,2),
  max_score numeric(8,2) not null default 100,
  grading_status text not null default 'needs_review'
    check (grading_status in ('auto_graded', 'needs_review', 'teacher_reviewed')),
  feedback text,
  idempotency_key text not null unique,
  submitted_at timestamptz not null default now(),
  graded_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (exposure_id, attempt_number),
  check (score is null or (score >= 0 and score <= max_score))
);

create index if not exists learner_question_attempts_learner_recent_idx
  on public.learner_question_attempts(learner_profile_id, submitted_at desc);

create index if not exists learner_question_attempts_question_idx
  on public.learner_question_attempts(question_id, learner_profile_id, submitted_at desc);

create table if not exists public.learner_question_exposure_events (
  id uuid primary key default gen_random_uuid(),
  exposure_id uuid not null references public.learner_question_exposures(id) on delete cascade,
  event_type text not null
    check (event_type in ('assigned', 'delivered', 'opened', 'answered', 'reviewed', 'completed', 'expired')),
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (exposure_id, idempotency_key)
);

create index if not exists learner_question_exposure_events_recent_idx
  on public.learner_question_exposure_events(exposure_id, occurred_at desc);

create table if not exists public.learner_account_link_codes (
  id uuid primary key default gen_random_uuid(),
  learner_profile_id uuid not null references public.learner_profiles(id) on delete cascade,
  code_hash char(64) not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

alter table public.learner_account_link_codes enable row level security;
revoke all on public.learner_account_link_codes from public, anon, authenticated, myschool_runtime;
grant all on public.learner_account_link_codes to service_role;

create or replace function app.has_learner_practice_access()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.learner_profiles lp
    where lp.profile_status = 'active'
      and (
        lp.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.learner_guardians g
          where g.learner_profile_id = lp.id
            and g.guardian_user_id = (select auth.uid())
            and g.link_status = 'active'
            and g.can_manage_learning
        )
      )
  );
$$;

create or replace function app.can_manage_learner_practice(p_learner_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.learner_profiles lp
    where lp.id = p_learner_profile_id
      and lp.profile_status = 'active'
      and (
        lp.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.learner_guardians g
          where g.learner_profile_id = lp.id
            and g.guardian_user_id = (select auth.uid())
            and g.link_status = 'active'
            and g.can_manage_learning
        )
      )
  );
$$;

create or replace function app.can_access_platform_curriculum_source(p_source_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, app
as $$
  select exists (
    select 1
    from public.curriculum_sources cs
    where cs.id = p_source_id
      and cs.sharing_scope = 'platform'
      and cs.tenant_id is null
      and cs.school_id is null
      and cs.status = 'active'
      and cs.rights_status = 'approved'
      and (
        'rag' = any(cs.permitted_uses)
        or 'question_generation' = any(cs.permitted_uses)
      )
      and app.has_learner_practice_access()
  );
$$;

revoke all on function app.has_learner_practice_access() from public, anon;
revoke all on function app.can_manage_learner_practice(uuid) from public, anon;
revoke all on function app.can_access_platform_curriculum_source(uuid) from public, anon;
grant execute on function app.has_learner_practice_access() to authenticated, myschool_runtime;
grant execute on function app.can_manage_learner_practice(uuid) to authenticated, myschool_runtime;
grant execute on function app.can_access_platform_curriculum_source(uuid) to authenticated, myschool_runtime;

-- Independent profiles may read approved platform content, but not tenant- or school-scoped material.
drop policy if exists question_bank_global_learner_read on public.question_bank;
create policy question_bank_global_learner_read
on public.question_bank
for select to authenticated, myschool_runtime
using (
  sharing_scope = 'platform'
  and tenant_id is null
  and school_id is null
  and record_status = 'active'
  and review_status = 'approved'
  and app.has_learner_practice_access()
);

drop policy if exists curriculum_sources_global_learner_read on public.curriculum_sources;
create policy curriculum_sources_global_learner_read
on public.curriculum_sources
for select to authenticated, myschool_runtime
using (app.can_access_platform_curriculum_source(id));

drop policy if exists curriculum_source_versions_global_learner_read on public.curriculum_source_versions;
create policy curriculum_source_versions_global_learner_read
on public.curriculum_source_versions
for select to authenticated, myschool_runtime
using (app.can_access_platform_curriculum_source(source_id));

drop policy if exists curriculum_chunks_global_learner_read on public.curriculum_chunks;
create policy curriculum_chunks_global_learner_read
on public.curriculum_chunks
for select to authenticated, myschool_runtime
using (app.can_access_platform_curriculum_source(source_id));

alter table public.learner_question_exposures enable row level security;
alter table public.learner_question_attempts enable row level security;
alter table public.learner_question_exposure_events enable row level security;

drop policy if exists learner_question_exposures_read on public.learner_question_exposures;
create policy learner_question_exposures_read
on public.learner_question_exposures
for select to authenticated, myschool_runtime
using (app.can_manage_learner_practice(learner_profile_id));

drop policy if exists learner_question_attempts_read on public.learner_question_attempts;
create policy learner_question_attempts_read
on public.learner_question_attempts
for select to authenticated, myschool_runtime
using (app.can_manage_learner_practice(learner_profile_id));

revoke all on public.learner_question_exposures,
  public.learner_question_attempts,
  public.learner_question_exposure_events
from public, anon, authenticated, myschool_runtime;

grant select on public.learner_question_exposures,
  public.learner_question_attempts
to authenticated, myschool_runtime;

grant all on public.learner_question_exposures,
  public.learner_question_attempts,
  public.learner_question_exposure_events
to service_role;

create or replace function public.create_learner_account_link_code(
  p_learner_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := auth.uid();
  raw_code text;
  hashed_code text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1
    from public.learner_guardians g
    where g.learner_profile_id = p_learner_profile_id
      and g.guardian_user_id = actor_id
      and g.link_status = 'active'
      and g.can_manage_learning
  ) then
    raise exception 'Active guardian permission is required to create a learner link code';
  end if;

  raw_code := encode(extensions.gen_random_bytes(24), 'hex');
  hashed_code := encode(extensions.digest(raw_code, 'sha256'), 'hex');

  delete from public.learner_account_link_codes
  where learner_profile_id = p_learner_profile_id
    and used_at is null;

  insert into public.learner_account_link_codes (
    learner_profile_id, code_hash, created_by_user_id, expires_at
  )
  values (
    p_learner_profile_id,
    hashed_code,
    actor_id,
    now() + interval '15 minutes'
  );

  return raw_code;
end;
$$;

create or replace function public.claim_learner_account_link_code(
  p_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  actor_id uuid := auth.uid();
  code_hash_value text;
  link_row public.learner_account_link_codes%rowtype;
  owner_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_code is null or length(p_code) <> 48 then raise exception 'Invalid learner link code'; end if;

  code_hash_value := encode(extensions.digest(lower(p_code), 'sha256'), 'hex');

  select * into link_row
  from public.learner_account_link_codes
  where code_hash = code_hash_value
  for update;

  if not found or link_row.used_at is not null or link_row.expires_at <= now() then
    raise exception 'Learner link code is invalid, expired or already used';
  end if;

  update public.learner_profiles
     set owner_user_id = actor_id,
         updated_at = now()
   where id = link_row.learner_profile_id
     and owner_user_id is null
     and profile_status = 'active';

  if not found then
    select owner_user_id into owner_id
    from public.learner_profiles
    where id = link_row.learner_profile_id;

    if owner_id is distinct from actor_id then
      raise exception 'Learner profile is already linked to another account';
    end if;
  end if;

  update public.learner_account_link_codes
     set used_at = now(),
         used_by_user_id = actor_id
   where id = link_row.id;

  return link_row.learner_profile_id;
end;
$$;

revoke all on function public.create_learner_account_link_code(uuid) from public, anon;
revoke all on function public.claim_learner_account_link_code(text) from public, anon;
grant execute on function public.create_learner_account_link_code(uuid) to authenticated, myschool_runtime;
grant execute on function public.claim_learner_account_link_code(text) to authenticated, myschool_runtime;

create or replace function public.get_learner_practice_set(
  p_learner_profile_id uuid,
  p_subject_code text default null,
  p_grade_code text default null,
  p_unit_title text default null,
  p_count integer default 10,
  p_difficulty smallint default null,
  p_avoid_recent_days integer default 7
)
returns table (
  exposure_id uuid,
  question_id uuid,
  question_type text,
  question_text text,
  choices jsonb,
  difficulty smallint,
  subject_code text,
  subject_name text,
  grade_code text,
  grade_label text,
  unit_title text,
  lesson_title text,
  tags text[],
  language_code text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, app
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not app.can_manage_learner_practice(p_learner_profile_id) then
    raise exception 'Learner practice access denied';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'Question count must be between 1 and 50';
  end if;
  if p_difficulty is not null and p_difficulty not between 1 and 5 then
    raise exception 'Difficulty must be between 1 and 5';
  end if;
  if p_avoid_recent_days is null or p_avoid_recent_days < 0 or p_avoid_recent_days > 365 then
    raise exception 'Recent exposure window must be between 0 and 365 days';
  end if;

  return query
  with candidates as materialized (
    select
      q.id,
      q.tenant_id,
      q.school_id,
      row_number() over (
        order by coalesce(e.display_count, 0) asc,
                 coalesce(e.attempt_count, 0) asc,
                 random()
      ) as candidate_order
    from public.question_bank q
    left join public.learner_question_exposures e
      on e.learner_profile_id = p_learner_profile_id
     and e.question_id = q.id
    where q.record_status = 'active'
      and q.review_status = 'approved'
      and (p_subject_code is null or q.subject_code = p_subject_code)
      and (p_grade_code is null or q.grade_code = p_grade_code)
      and (p_unit_title is null or q.unit_title = p_unit_title)
      and (p_difficulty is null or q.difficulty = p_difficulty)
      and (
        (
          q.sharing_scope = 'platform'
          and q.tenant_id is null
          and q.school_id is null
        )
        or exists (
          select 1
          from public.learner_school_memberships m
          where m.learner_profile_id = p_learner_profile_id
            and m.membership_status = 'active'
            and (
              (q.sharing_scope = 'tenant' and q.tenant_id = m.tenant_id)
              or (
                q.sharing_scope = 'school'
                and q.tenant_id = m.tenant_id
                and q.school_id = m.school_id
              )
            )
        )
      )
      and (
        q.origin_type <> 'ai_generated'
        or exists (
          select 1
          from public.question_sources qs
          join public.curriculum_chunks cc on cc.id = qs.chunk_id
          join public.curriculum_sources cs on cs.id = cc.source_id
          where qs.question_id = q.id
            and cs.status = 'active'
            and cs.rights_status = 'approved'
            and 'question_generation' = any(cs.permitted_uses)
            and (
              (q.sharing_scope = 'platform' and cs.sharing_scope = 'platform')
              or (q.sharing_scope = 'tenant' and cs.tenant_id = q.tenant_id and cs.sharing_scope in ('platform', 'tenant'))
              or (q.sharing_scope = 'school' and cs.tenant_id = q.tenant_id and cs.school_id = q.school_id and cs.sharing_scope in ('platform', 'tenant', 'school'))
            )
        )
      )
      and (
        p_avoid_recent_days = 0
        or e.id is null
        or e.last_event_at < now() - make_interval(days => p_avoid_recent_days)
      )
    order by candidate_order
    limit p_count
  ),
  assigned as (
    insert into public.learner_question_exposures (
      learner_profile_id, question_id, tenant_id, school_id,
      exposure_status, assigned_at, last_event_at, display_count
    )
    select
      p_learner_profile_id, c.id, c.tenant_id, c.school_id,
      'assigned', now(), now(), 1
    from candidates c
    on conflict (learner_profile_id, question_id)
    do update set
      exposure_status = 'assigned',
      last_event_at = now(),
      display_count = public.learner_question_exposures.display_count + 1,
      updated_at = now()
    returning id, question_id
  ),
  logged as (
    insert into public.learner_question_exposure_events (
      exposure_id, event_type, idempotency_key, occurred_at, metadata
    )
    select
      a.id, 'assigned',
      'assignment:' || a.id::text || ':' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISSMS'),
      now(),
      jsonb_build_object('source', 'get_learner_practice_set')
    from assigned a
    on conflict (exposure_id, idempotency_key) do nothing
    returning exposure_id
  )
  select
    a.id,
    q.id,
    q.question_type,
    q.question_text,
    q.choices,
    q.difficulty,
    q.subject_code,
    q.subject_name,
    q.grade_code,
    q.grade_label,
    q.unit_title,
    q.lesson_title,
    q.tags,
    q.language_code
  from assigned a
  join public.question_bank q on q.id = a.question_id
  order by q.subject_code, q.grade_code, q.unit_title nulls first, q.id;
end;
$$;

create or replace function public.submit_learner_question_attempt(
  p_learner_profile_id uuid,
  p_exposure_id uuid,
  p_response_payload jsonb,
  p_idempotency_key text
)
returns table (
  attempt_id uuid,
  attempt_number integer,
  grading_status text,
  is_correct boolean,
  score numeric,
  max_score numeric,
  feedback text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth, app
as $$
declare
  actor_id uuid := auth.uid();
  exposure_row public.learner_question_exposures%rowtype;
  question_row public.question_bank%rowtype;
  answer_row public.question_bank_answers%rowtype;
  existing_attempt public.learner_question_attempts%rowtype;
  expected_value text;
  actual_value text;
  is_auto_graded boolean := false;
  correct boolean;
  attempt_no integer;
  new_attempt_id uuid;
  reveal_feedback text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not app.can_manage_learner_practice(p_learner_profile_id) then
    raise exception 'Learner practice access denied';
  end if;
  if p_response_payload is null then raise exception 'An answer payload is required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 12 or length(p_idempotency_key) > 160 then
    raise exception 'A stable idempotency key between 12 and 160 characters is required';
  end if;

  select * into existing_attempt
  from public.learner_question_attempts
  where idempotency_key = p_idempotency_key;

  if found then
    if existing_attempt.learner_profile_id <> p_learner_profile_id
       or existing_attempt.exposure_id <> p_exposure_id
       or existing_attempt.answer_payload <> p_response_payload then
      raise exception 'Idempotency key was reused with a different attempt payload';
    end if;

    return query select
      existing_attempt.id,
      existing_attempt.attempt_number,
      existing_attempt.grading_status,
      existing_attempt.is_correct,
      existing_attempt.score,
      existing_attempt.max_score,
      existing_attempt.feedback;
    return;
  end if;

  select * into exposure_row
  from public.learner_question_exposures
  where id = p_exposure_id
    and learner_profile_id = p_learner_profile_id
  for update;
  if not found then raise exception 'Question exposure does not belong to this learner'; end if;

  -- Recheck after locking the exposure so concurrent requests with the same
  -- idempotency key cannot create two attempts for a single exposure.
  select * into existing_attempt
  from public.learner_question_attempts
  where idempotency_key = p_idempotency_key;

  if found then
    if existing_attempt.learner_profile_id <> p_learner_profile_id
       or existing_attempt.exposure_id <> p_exposure_id
       or existing_attempt.answer_payload <> p_response_payload then
      raise exception 'Idempotency key was reused with a different attempt payload';
    end if;
    return query select
      existing_attempt.id,
      existing_attempt.attempt_number,
      existing_attempt.grading_status,
      existing_attempt.is_correct,
      existing_attempt.score,
      existing_attempt.max_score,
      existing_attempt.feedback;
    return;
  end if;

  select * into question_row
  from public.question_bank q
  where q.id = exposure_row.question_id
    and q.record_status = 'active'
    and q.review_status = 'approved';
  if not found then raise exception 'Question is no longer available for practice'; end if;

  select * into answer_row
  from public.question_bank_answers a
  where a.question_id = question_row.id;
  if not found then raise exception 'Protected answer key is not available; the question cannot be graded'; end if;

  expected_value := coalesce(
    answer_row.answer_payload ->> 'correct_option_id',
    answer_row.answer_payload ->> 'correct_choice',
    answer_row.answer_payload ->> 'correct_choice_id',
    answer_row.answer_payload ->> 'correct_option',
    answer_row.answer_payload ->> 'correct_answer',
    answer_row.answer_payload ->> 'answer',
    answer_row.answer_payload #>> '{}'
  );
  actual_value := coalesce(
    p_response_payload ->> 'selected_choice_id',
    p_response_payload ->> 'selected_option',
    p_response_payload ->> 'answer',
    p_response_payload ->> 'text',
    p_response_payload #>> '{}'
  );

  if question_row.question_type in ('multiple_choice', 'true_false') and expected_value is not null and actual_value is not null then
    correct := lower(trim(expected_value)) = lower(trim(actual_value));
    is_auto_graded := true;
  elsif question_row.question_type = 'fill_blank' and jsonb_typeof(answer_row.answer_payload -> 'accepted_answers') = 'array' then
    correct := exists (
      select 1
      from jsonb_array_elements_text(answer_row.answer_payload -> 'accepted_answers') accepted(value)
      where lower(trim(accepted.value)) = lower(trim(coalesce(actual_value, '')))
    );
    is_auto_graded := true;
  else
    correct := null;
    is_auto_graded := false;
  end if;

  select coalesce(max(a.attempt_number), 0) + 1 into attempt_no
  from public.learner_question_attempts a
  where a.exposure_id = p_exposure_id;

  reveal_feedback := case
    when answer_row.answer_reveal_policy = 'after_submission' and is_auto_graded
      then answer_row.explanation
    else null
  end;

  insert into public.learner_question_attempts (
    exposure_id, learner_profile_id, question_id, tenant_id, school_id,
    attempt_number, answer_payload, is_correct, score, max_score,
    grading_status, feedback, idempotency_key, submitted_at, graded_at
  )
  values (
    p_exposure_id,
    p_learner_profile_id,
    question_row.id,
    exposure_row.tenant_id,
    exposure_row.school_id,
    attempt_no,
    p_response_payload,
    correct,
    case when is_auto_graded and correct then 100 when is_auto_graded then 0 else null end,
    100,
    case when is_auto_graded then 'auto_graded' else 'needs_review' end,
    reveal_feedback,
    p_idempotency_key,
    now(),
    case when is_auto_graded then now() else null end
  )
  returning id into new_attempt_id;

  update public.learner_question_exposures
     set exposure_status = case when is_auto_graded then 'answered' else 'needs_review' end,
         first_answered_at = coalesce(first_answered_at, now()),
         last_answered_at = now(),
         last_event_at = now(),
         attempt_count = attempt_count + 1,
         updated_at = now()
   where id = p_exposure_id;

  insert into public.learner_question_exposure_events (
    exposure_id, event_type, idempotency_key, occurred_at, metadata
  )
  values (
    p_exposure_id,
    'answered',
    'attempt:' || p_idempotency_key,
    now(),
    jsonb_build_object('attempt_id', new_attempt_id, 'grading_status', case when is_auto_graded then 'auto_graded' else 'needs_review' end)
  )
  on conflict (exposure_id, idempotency_key) do nothing;

  return query select
    new_attempt_id,
    attempt_no,
    case when is_auto_graded then 'auto_graded' else 'needs_review' end,
    correct,
    case when is_auto_graded and correct then 100::numeric when is_auto_graded then 0::numeric else null::numeric end,
    100::numeric,
    reveal_feedback;
end;
$$;

revoke all on function public.get_learner_practice_set(uuid, text, text, text, integer, smallint, integer)
  from public, anon;
revoke all on function public.submit_learner_question_attempt(uuid, uuid, jsonb, text)
  from public, anon;

grant execute on function public.get_learner_practice_set(uuid, text, text, text, integer, smallint, integer)
  to authenticated, myschool_runtime;
grant execute on function public.submit_learner_question_attempt(uuid, uuid, jsonb, text)
  to authenticated, myschool_runtime;

commit;
