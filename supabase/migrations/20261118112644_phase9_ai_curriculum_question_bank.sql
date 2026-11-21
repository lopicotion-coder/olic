
-- My School Phase 9: curriculum-grounded AI, question bank and exposure tracking.
-- Additive only. No existing school/student records are modified.

create table public.curriculum_sources (
  id uuid primary key default gen_random_uuid(),
  sharing_scope text not null default 'tenant'
    check (sharing_scope in ('platform','tenant','school')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  school_id uuid,
  title text not null check (length(trim(title)) between 2 and 300),
  publisher text,
  source_kind text not null default 'official_textbook'
    check (source_kind in ('official_textbook','licensed_external_book','teacher_material','official_reference','other')),
  country_code char(2) not null default 'EG',
  education_system text,
  curriculum_board text,
  subject_code text not null,
  subject_name text not null,
  grade_code text not null,
  grade_label text not null,
  language_code text not null default 'ar',
  publication_year integer check (publication_year is null or publication_year between 1800 and 2200),
  status text not null default 'draft'
    check (status in ('draft','active','archived','blocked')),
  rights_status text not null default 'pending_review'
    check (rights_status in ('pending_review','approved','restricted','denied','expired')),
  rights_basis text,
  rights_reference text,
  permitted_uses text[] not null default '{}'::text[]
    check (permitted_uses <@ array['rag','question_generation','question_reuse_school','question_reuse_tenant','question_reuse_platform']::text[]),
  storage_bucket text not null default 'school-files',
  storage_object_path text,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_sources_scope_check check (
    (sharing_scope = 'platform' and tenant_id is null and school_id is null)
    or (sharing_scope = 'tenant' and tenant_id is not null and school_id is null)
    or (sharing_scope = 'school' and tenant_id is not null and school_id is not null)
  ),
  constraint curriculum_sources_school_tenant_fk
    foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

create table public.curriculum_source_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.curriculum_sources(id) on delete cascade,
  version_label text not null,
  academic_year_label text,
  publication_year integer check (publication_year is null or publication_year between 1800 and 2200),
  page_count integer check (page_count is null or page_count > 0),
  file_sha256 char(64) check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  storage_bucket text not null default 'school-files',
  storage_object_path text,
  ingestion_status text not null default 'pending'
    check (ingestion_status in ('pending','queued','processing','ready','failed','archived')),
  extracted_text_sha256 char(64) check (extracted_text_sha256 is null or extracted_text_sha256 ~ '^[0-9a-f]{64}$'),
  extraction_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(extraction_metadata) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, version_label),
  unique (id, source_id)
);

create table public.curriculum_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null,
  source_version_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  page_start integer,
  page_end integer,
  chapter_title text,
  section_title text,
  content_text text not null check (length(trim(content_text)) > 0),
  content_sha256 char(64) not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  token_count integer check (token_count is null or token_count > 0),
  embedding extensions.vector(1536),
  embedding_model_key text,
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, content_text)) stored,
  status text not null default 'pending'
    check (status in ('pending','embedded','failed','archived')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  embedded_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_version_id, source_id)
    references public.curriculum_source_versions(id, source_id) on delete cascade,
  unique (source_version_id, chunk_index),
  constraint curriculum_chunks_embedding_state_check check (
    (embedding is null and embedding_model_key is null and status <> 'embedded')
    or (embedding is not null and embedding_model_key is not null and status = 'embedded')
  ),
  constraint curriculum_chunks_page_range_check check (
    (page_start is null and page_end is null)
    or (page_start is not null and page_start > 0 and (page_end is null or page_end >= page_start))
  )
);

create table public.question_bank (
  id uuid primary key default gen_random_uuid(),
  sharing_scope text not null default 'tenant'
    check (sharing_scope in ('platform','tenant','school')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  school_id uuid,
  subject_code text not null,
  subject_name text not null,
  grade_code text not null,
  grade_label text not null,
  unit_title text,
  lesson_title text,
  question_type text not null
    check (question_type in ('multiple_choice','true_false','short_answer','essay','fill_blank','matching','ordering')),
  question_text text not null check (length(trim(question_text)) between 3 and 12000),
  choices jsonb not null default '[]'::jsonb
    check (jsonb_typeof(choices) = 'array'),
  language_code text not null default 'ar',
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  cognitive_level text
    check (cognitive_level is null or cognitive_level in ('remember','understand','apply','analyze','evaluate','create')),
  tags text[] not null default '{}'::text[],
  origin_type text not null
    check (origin_type in ('ai_generated','teacher_authored','imported')),
  review_status text not null default 'pending_review'
    check (review_status in ('draft','pending_review','approved','rejected','needs_review','blocked')),
  record_status text not null default 'active'
    check (record_status in ('active','retired','blocked')),
  content_fingerprint char(64)
    check (content_fingerprint is null or content_fingerprint ~ '^[0-9a-f]{64}$'),
  embedding extensions.vector(1536),
  embedding_model_key text,
  generated_by_request_id uuid references public.ai_requests(id) on delete set null,
  provider_key text,
  model_key text,
  prompt_version text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  search_vector tsvector generated always as (to_tsvector('simple'::regconfig, question_text)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_bank_scope_check check (
    (sharing_scope = 'platform' and tenant_id is null and school_id is null)
    or (sharing_scope = 'tenant' and tenant_id is not null and school_id is null)
    or (sharing_scope = 'school' and tenant_id is not null and school_id is not null)
  ),
  constraint question_bank_school_tenant_fk
    foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade,
  constraint question_bank_embedding_state_check check (
    (embedding is null and embedding_model_key is null)
    or (embedding is not null and embedding_model_key is not null)
  )
);

create table public.question_bank_answers (
  question_id uuid primary key references public.question_bank(id) on delete cascade,
  answer_payload jsonb not null check (jsonb_typeof(answer_payload) in ('object','array','string','number','boolean')),
  explanation text,
  marking_rubric jsonb not null default '{}'::jsonb
    check (jsonb_typeof(marking_rubric) = 'object'),
  answer_reveal_policy text not null default 'after_submission'
    check (answer_reveal_policy in ('after_submission','after_due_date','teacher_only','never')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.question_sources (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_bank(id) on delete cascade,
  chunk_id uuid not null references public.curriculum_chunks(id) on delete restrict,
  relation_type text not null default 'question_grounding'
    check (relation_type in ('question_grounding','answer_grounding','explanation_grounding','reference')),
  evidence_excerpt text check (evidence_excerpt is null or length(evidence_excerpt) <= 5000),
  citation_order smallint not null default 1 check (citation_order > 0),
  grounding_score numeric(5,4) check (grounding_score is null or grounding_score between 0 and 1),
  created_at timestamptz not null default now(),
  unique (question_id, chunk_id, relation_type)
);

create table public.student_question_exposures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null,
  student_id uuid not null,
  question_id uuid not null references public.question_bank(id) on delete restrict,
  exposure_status text not null default 'assigned'
    check (exposure_status in ('assigned','delivered','rendered','opened','answered','reviewed','expired')),
  assigned_at timestamptz not null default now(),
  first_delivered_at timestamptz,
  first_rendered_at timestamptz,
  first_opened_at timestamptz,
  first_answered_at timestamptz,
  last_answered_at timestamptz,
  reviewed_at timestamptz,
  last_event_at timestamptz not null default now(),
  display_count integer not null default 0 check (display_count >= 0),
  assignment_id uuid references public.assignments(id) on delete set null,
  assessment_id uuid references public.assessments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, tenant_id, school_id)
    references public.students(id, tenant_id, school_id) on delete cascade,
  unique (student_id, question_id),
  unique (id, tenant_id, school_id)
);

create table public.question_exposure_events (
  id uuid primary key default gen_random_uuid(),
  exposure_id uuid not null references public.student_question_exposures(id) on delete cascade,
  event_type text not null
    check (event_type in ('delivered','rendered','opened','answered','reviewed','expired')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  received_at timestamptz not null default now(),
  unique (exposure_id, idempotency_key)
);

create table public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  exposure_id uuid not null,
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  answer_payload jsonb not null,
  is_correct boolean,
  score numeric(8,3) check (score is null or score >= 0),
  max_score numeric(8,3) check (max_score is null or max_score >= 0),
  feedback text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  unique (exposure_id, attempt_number),
  foreign key (exposure_id, tenant_id, school_id)
    references public.student_question_exposures(id, tenant_id, school_id) on delete cascade,
  foreign key (student_id, tenant_id, school_id)
    references public.students(id, tenant_id, school_id) on delete cascade
);

create table public.question_generation_batches (
  id uuid primary key default gen_random_uuid(),
  sharing_scope text not null default 'tenant'
    check (sharing_scope in ('platform','tenant','school')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  school_id uuid,
  source_version_id uuid not null references public.curriculum_source_versions(id) on delete restrict,
  subject_code text not null,
  grade_code text not null,
  unit_title text,
  lesson_title text,
  question_types text[] not null default array['multiple_choice']::text[],
  difficulty_distribution jsonb not null default '{"1":10,"2":20,"3":40,"4":20,"5":10}'::jsonb
    check (jsonb_typeof(difficulty_distribution) = 'object'),
  requested_count integer not null check (requested_count between 1 and 10000),
  generated_count integer not null default 0 check (generated_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  batch_status text not null default 'queued'
    check (batch_status in ('queued','processing','validating','completed','partial','failed','cancelled')),
  provider_key text,
  model_key text,
  prompt_version text,
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_generation_batches_scope_check check (
    (sharing_scope = 'platform' and tenant_id is null and school_id is null)
    or (sharing_scope = 'tenant' and tenant_id is not null and school_id is null)
    or (sharing_scope = 'school' and tenant_id is not null and school_id is not null)
  ),
  constraint question_generation_batches_school_tenant_fk
    foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);

create table public.question_generation_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid,
  source_version_id uuid not null references public.curriculum_source_versions(id) on delete restrict,
  subject_code text not null,
  grade_code text not null,
  unit_title text,
  lesson_title text,
  frequency text not null default 'weekly'
    check (frequency in ('daily','weekly','monthly','interval')),
  interval_minutes integer check (interval_minutes is null or interval_minutes between 15 and 525600),
  local_run_time time,
  days_of_week smallint[] not null default '{}'::smallint[]
    check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),
  day_of_month smallint check (day_of_month is null or day_of_month between 1 and 28),
  timezone text not null default 'Africa/Cairo',
  target_question_count integer not null default 500 check (target_question_count between 1 and 10000),
  low_watermark integer not null default 100 check (low_watermark >= 0),
  question_types text[] not null default array['multiple_choice']::text[],
  is_enabled boolean not null default false,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade,
  constraint question_generation_schedule_frequency_check check (
    (frequency = 'interval' and interval_minutes is not null)
    or (frequency <> 'interval' and interval_minutes is null)
  )
);

create table public.question_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.question_generation_batches(id) on delete cascade,
  schedule_id uuid references public.question_generation_schedules(id) on delete set null,
  source_version_id uuid references public.curriculum_source_versions(id) on delete cascade,
  job_type text not null
    check (job_type in ('ingest_book','chunk_book','embed_chunks','generate_questions','validate_questions','deduplicate_questions','embed_questions')),
  job_status text not null default 'queued'
    check (job_status in ('queued','processing','completed','retrying','failed','cancelled')),
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (batch_id is not null or schedule_id is not null or source_version_id is not null)
);

create table public.curriculum_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_version_id uuid not null references public.curriculum_source_versions(id) on delete cascade,
  job_status text not null default 'queued'
    check (job_status in ('queued','processing','completed','retrying','failed','cancelled')),
  stage text not null default 'extract'
    check (stage in ('extract','normalize','chunk','embed','index','verify')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.question_quality_checks (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_bank(id) on delete cascade,
  check_key text not null
    check (check_key in ('schema','answer_consistency','curriculum_grounding','duplicate_exact','duplicate_semantic','difficulty','language','safety','human_review')),
  result text not null check (result in ('passed','warning','failed','skipped')),
  score numeric(6,4) check (score is null or score between 0 and 1),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  validator_provider text,
  validator_model text,
  created_at timestamptz not null default now(),
  unique (question_id, check_key, validator_provider, validator_model)
);

create table public.ai_rag_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ai_requests(id) on delete cascade,
  response_id uuid references public.ai_responses(id) on delete cascade,
  chunk_id uuid not null references public.curriculum_chunks(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid,
  retrieval_rank integer not null check (retrieval_rank > 0),
  similarity_score numeric(7,6) check (similarity_score is null or similarity_score between 0 and 1),
  source_excerpt text not null check (length(source_excerpt) <= 5000),
  citation_label text,
  selected_for_answer boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade,
  unique (request_id, chunk_id)
);

-- Search and workload indexes.
create index curriculum_sources_scope_idx
  on public.curriculum_sources (sharing_scope, tenant_id, school_id, status, rights_status);
create index curriculum_versions_source_idx
  on public.curriculum_source_versions (source_id, ingestion_status, created_at desc);
create index curriculum_chunks_source_idx
  on public.curriculum_chunks (source_id, source_version_id, chunk_index);
create index curriculum_chunks_fts_idx
  on public.curriculum_chunks using gin (search_vector);
create index curriculum_chunks_embedding_hnsw_idx
  on public.curriculum_chunks using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;
create index question_bank_scope_status_idx
  on public.question_bank (sharing_scope, tenant_id, school_id, review_status, record_status);
create index question_bank_fts_idx
  on public.question_bank using gin (search_vector);
create index question_bank_embedding_hnsw_idx
  on public.question_bank using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;
create unique index question_bank_fingerprint_scope_uq
  on public.question_bank (sharing_scope, tenant_id, school_id, content_fingerprint) nulls not distinct
  where content_fingerprint is not null;
create index question_sources_chunk_idx on public.question_sources (chunk_id);
create index question_exposures_student_recent_idx
  on public.student_question_exposures (tenant_id, school_id, student_id, last_event_at desc);
create index question_exposures_question_idx
  on public.student_question_exposures (question_id, student_id);
create index question_generation_batches_status_idx
  on public.question_generation_batches (batch_status, created_at);
create index question_generation_schedules_due_idx
  on public.question_generation_schedules (next_run_at)
  where is_enabled = true;
create index question_generation_jobs_ready_idx
  on public.question_generation_jobs (job_status, available_at, created_at)
  where job_status in ('queued','retrying');
create index curriculum_ingestion_jobs_ready_idx
  on public.curriculum_ingestion_jobs (job_status, available_at, created_at)
  where job_status in ('queued','retrying');
create index ai_rag_evidence_request_idx on public.ai_rag_evidence (request_id, retrieval_rank);

-- Prevent questions from being reused more broadly than their source rights allow.
create or replace function app.validate_question_source_scope()
returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
declare
  q record;
  s record;
  reuse_allowed boolean := false;
begin
  select sharing_scope, tenant_id, school_id, origin_type
    into q
    from public.question_bank
   where id = new.question_id;

  if not found then
    raise exception 'Question source link references an unknown question';
  end if;

  select cs.sharing_scope, cs.tenant_id, cs.school_id, cs.status,
         cs.rights_status, cs.permitted_uses
    into s
    from public.curriculum_chunks cc
    join public.curriculum_sources cs on cs.id = cc.source_id
   where cc.id = new.chunk_id;

  if not found then
    raise exception 'Question source link references an unknown curriculum chunk';
  end if;

  if s.status <> 'active' or s.rights_status <> 'approved' then
    raise exception 'Question source is not approved for use';
  end if;

  if q.origin_type = 'ai_generated'
     and not ('question_generation' = any(s.permitted_uses)) then
    raise exception 'Source does not permit AI question generation';
  end if;

  if q.sharing_scope = 'platform' then
    reuse_allowed := s.sharing_scope = 'platform'
      and ('question_reuse_platform' = any(s.permitted_uses));
  elsif q.sharing_scope = 'tenant' then
    reuse_allowed := (
      s.sharing_scope = 'platform'
      and 'question_reuse_platform' = any(s.permitted_uses)
    ) or (
      s.sharing_scope = 'tenant'
      and s.tenant_id = q.tenant_id
      and ('question_reuse_tenant' = any(s.permitted_uses)
           or 'question_reuse_platform' = any(s.permitted_uses))
    );
  elsif q.sharing_scope = 'school' then
    reuse_allowed := (
      s.sharing_scope = 'platform'
      and 'question_reuse_platform' = any(s.permitted_uses)
    ) or (
      s.sharing_scope = 'tenant'
      and s.tenant_id = q.tenant_id
      and ('question_reuse_tenant' = any(s.permitted_uses)
           or 'question_reuse_platform' = any(s.permitted_uses))
    ) or (
      s.sharing_scope = 'school'
      and s.tenant_id = q.tenant_id
      and s.school_id = q.school_id
      and ('question_reuse_school' = any(s.permitted_uses)
           or 'question_reuse_tenant' = any(s.permitted_uses)
           or 'question_reuse_platform' = any(s.permitted_uses))
    );
  end if;

  if not reuse_allowed then
    raise exception 'Question sharing scope exceeds the curriculum source licence';
  end if;

  return new;
end;
$$;

create trigger question_sources_validate_scope
before insert or update on public.question_sources
for each row execute function app.validate_question_source_scope();

-- AI-generated questions cannot be approved until they have curriculum evidence.
create or replace function app.validate_approved_question_grounding()
returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
begin
  if new.origin_type = 'ai_generated'
     and new.review_status = 'approved'
     and old.review_status is distinct from new.review_status then
    if not exists (
      select 1
      from public.question_sources qs
      join public.curriculum_chunks cc on cc.id = qs.chunk_id
      join public.curriculum_sources cs on cs.id = cc.source_id
      where qs.question_id = new.id
        and cs.status = 'active'
        and cs.rights_status = 'approved'
        and 'question_generation' = any(cs.permitted_uses)
    ) then
      raise exception 'AI-generated question requires an approved curriculum source before approval';
    end if;
  end if;
  return new;
end;
$$;

create trigger question_bank_require_grounding
before update on public.question_bank
for each row execute function app.validate_approved_question_grounding();

-- If a source licence or approval is withdrawn, block every dependent question until re-reviewed.
create or replace function app.invalidate_questions_after_source_change()
returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
begin
  if old.status is distinct from new.status
     or old.rights_status is distinct from new.rights_status
     or old.permitted_uses is distinct from new.permitted_uses
     or old.sharing_scope is distinct from new.sharing_scope
     or old.tenant_id is distinct from new.tenant_id
     or old.school_id is distinct from new.school_id then
    update public.question_bank q
       set record_status = 'blocked',
           review_status = 'needs_review',
           updated_at = now()
     where q.id in (
       select qs.question_id
       from public.question_sources qs
       join public.curriculum_chunks cc on cc.id = qs.chunk_id
       where cc.source_id = new.id
     );
  end if;
  return new;
end;
$$;

create trigger curriculum_sources_invalidate_dependent_questions
after update on public.curriculum_sources
for each row execute function app.invalidate_questions_after_source_change();

-- Keep a compact "has been shown" summary while retaining an auditable event history.
create or replace function app.apply_question_exposure_event()
returns trigger
language plpgsql
set search_path = public, app, pg_temp
as $$
begin
  update public.student_question_exposures e
     set first_delivered_at = case when new.event_type = 'delivered'
          then coalesce(e.first_delivered_at, new.occurred_at) else e.first_delivered_at end,
         first_rendered_at = case when new.event_type = 'rendered'
          then coalesce(e.first_rendered_at, new.occurred_at) else e.first_rendered_at end,
         first_opened_at = case when new.event_type = 'opened'
          then coalesce(e.first_opened_at, new.occurred_at) else e.first_opened_at end,
         first_answered_at = case when new.event_type = 'answered'
          then coalesce(e.first_answered_at, new.occurred_at) else e.first_answered_at end,
         last_answered_at = case when new.event_type = 'answered'
          then new.occurred_at else e.last_answered_at end,
         reviewed_at = case when new.event_type = 'reviewed'
          then coalesce(e.reviewed_at, new.occurred_at) else e.reviewed_at end,
         exposure_status = case new.event_type
           when 'delivered' then case when e.exposure_status in ('assigned','expired') then 'delivered' else e.exposure_status end
           when 'rendered' then case when e.exposure_status in ('assigned','delivered','expired') then 'rendered' else e.exposure_status end
           when 'opened' then case when e.exposure_status in ('assigned','delivered','rendered','expired') then 'opened' else e.exposure_status end
           when 'answered' then 'answered'
           when 'reviewed' then 'reviewed'
           when 'expired' then case when e.exposure_status in ('assigned','delivered') then 'expired' else e.exposure_status end
           else e.exposure_status
         end,
         display_count = e.display_count + case when new.event_type = 'rendered' then 1 else 0 end,
         last_event_at = greatest(e.last_event_at, new.occurred_at),
         updated_at = now()
   where e.id = new.exposure_id;

  return new;
end;
$$;

create trigger question_exposure_events_update_summary
after insert on public.question_exposure_events
for each row execute function app.apply_question_exposure_event();

-- RLS is mandatory on every new public table.
alter table public.curriculum_sources enable row level security;
alter table public.curriculum_source_versions enable row level security;
alter table public.curriculum_chunks enable row level security;
alter table public.question_bank enable row level security;
alter table public.question_bank_answers enable row level security;
alter table public.question_sources enable row level security;
alter table public.student_question_exposures enable row level security;
alter table public.question_exposure_events enable row level security;
alter table public.question_attempts enable row level security;
alter table public.question_generation_batches enable row level security;
alter table public.question_generation_schedules enable row level security;
alter table public.question_generation_jobs enable row level security;
alter table public.curriculum_ingestion_jobs enable row level security;
alter table public.question_quality_checks enable row level security;
alter table public.ai_rag_evidence enable row level security;

alter table public.curriculum_sources force row level security;
alter table public.curriculum_source_versions force row level security;
alter table public.curriculum_chunks force row level security;
alter table public.question_bank force row level security;
alter table public.question_bank_answers force row level security;
alter table public.question_sources force row level security;
alter table public.student_question_exposures force row level security;
alter table public.question_exposure_events force row level security;
alter table public.question_attempts force row level security;
alter table public.question_generation_batches force row level security;
alter table public.question_generation_schedules force row level security;
alter table public.question_generation_jobs force row level security;
alter table public.curriculum_ingestion_jobs force row level security;
alter table public.question_quality_checks force row level security;
alter table public.ai_rag_evidence force row level security;

create policy curriculum_sources_read
on public.curriculum_sources for select
to authenticated, myschool_runtime
using (
  (
    (sharing_scope = 'platform' and app.current_tenant_id() is not null)
    or (sharing_scope = 'tenant' and tenant_id = app.current_tenant_id())
    or (sharing_scope = 'school' and tenant_id = app.current_tenant_id() and school_id = app.current_school_id())
  )
  and (
    (status = 'active' and rights_status = 'approved'
      and (('rag' = any(permitted_uses)) or ('question_generation' = any(permitted_uses))))
    or app.has_permission('ai.manage', coalesce(tenant_id, app.current_tenant_id()),
                          coalesce(school_id, app.current_school_id()), null)
  )
  and (
    app.has_permission('ai.use', coalesce(tenant_id, app.current_tenant_id()),
                       coalesce(school_id, app.current_school_id()), null)
    or app.has_permission('ai.manage', coalesce(tenant_id, app.current_tenant_id()),
                           coalesce(school_id, app.current_school_id()), null)
  )
);

create policy curriculum_source_versions_read
on public.curriculum_source_versions for select
to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.curriculum_sources s
    where s.id = curriculum_source_versions.source_id
  )
);

create policy curriculum_chunks_read
on public.curriculum_chunks for select
to authenticated, myschool_runtime
using (
  exists (
    select 1 from public.curriculum_sources s
    where s.id = curriculum_chunks.source_id
  )
);

create policy question_bank_read
on public.question_bank for select
to authenticated, myschool_runtime
using (
  (
    (sharing_scope = 'platform' and app.current_tenant_id() is not null)
    or (sharing_scope = 'tenant' and tenant_id = app.current_tenant_id())
    or (sharing_scope = 'school' and tenant_id = app.current_tenant_id() and school_id = app.current_school_id())
  )
  and (
    (record_status = 'active' and review_status = 'approved')
    or app.has_permission('ai.manage', coalesce(tenant_id, app.current_tenant_id()),
                          coalesce(school_id, app.current_school_id()), null)
  )
  and (
    app.has_permission('ai.use', coalesce(tenant_id, app.current_tenant_id()),
                       coalesce(school_id, app.current_school_id()), null)
    or app.has_permission('ai.manage', coalesce(tenant_id, app.current_tenant_id()),
                           coalesce(school_id, app.current_school_id()), null)
  )
);

create policy question_sources_read
on public.question_sources for select
to authenticated, myschool_runtime
using (
  exists (select 1 from public.question_bank q where q.id = question_sources.question_id)
  and exists (select 1 from public.curriculum_chunks c where c.id = question_sources.chunk_id)
);

create policy student_question_exposures_read
on public.student_question_exposures for select
to authenticated, myschool_runtime
using (
  app.is_student_owner(student_id)
  or app.has_permission('ai.read', tenant_id, school_id, null)
  or app.has_permission('assignments.read', tenant_id, school_id, null)
);

create policy question_attempts_read
on public.question_attempts for select
to authenticated, myschool_runtime
using (
  app.is_student_owner(student_id)
  or app.has_permission('ai.read', tenant_id, school_id, null)
  or app.has_permission('assignments.read', tenant_id, school_id, null)
);

create policy question_generation_batches_read
on public.question_generation_batches for select
to authenticated, myschool_runtime
using (
  (
    (sharing_scope = 'platform' and app.has_permission('platform.operations.read', null, null, null))
    or (sharing_scope = 'tenant' and tenant_id = app.current_tenant_id())
    or (sharing_scope = 'school' and tenant_id = app.current_tenant_id() and school_id = app.current_school_id())
  )
  and app.has_permission('ai.manage', coalesce(tenant_id, app.current_tenant_id()),
                         coalesce(school_id, app.current_school_id()), null)
);

create policy question_generation_schedules_read
on public.question_generation_schedules for select
to authenticated, myschool_runtime
using (
  tenant_id = app.current_tenant_id()
  and (school_id is null or school_id = app.current_school_id())
  and app.has_permission('ai.manage', tenant_id, school_id, null)
);

create policy ai_rag_evidence_read
on public.ai_rag_evidence for select
to authenticated, myschool_runtime
using (app.can_access_ai_request(request_id, tenant_id, school_id));

-- API clients receive read-only access to the non-secret surfaces.
revoke all on public.curriculum_sources, public.curriculum_source_versions,
  public.curriculum_chunks, public.question_bank, public.question_bank_answers,
  public.question_sources, public.student_question_exposures,
  public.question_exposure_events, public.question_attempts,
  public.question_generation_batches, public.question_generation_schedules,
  public.question_generation_jobs, public.curriculum_ingestion_jobs,
  public.question_quality_checks, public.ai_rag_evidence
from public, anon, authenticated, myschool_runtime;

grant select on public.curriculum_sources, public.curriculum_source_versions,
  public.curriculum_chunks, public.question_bank, public.question_sources,
  public.student_question_exposures, public.question_attempts,
  public.question_generation_batches, public.question_generation_schedules,
  public.ai_rag_evidence
to authenticated, myschool_runtime;

grant all on public.curriculum_sources, public.curriculum_source_versions,
  public.curriculum_chunks, public.question_bank, public.question_bank_answers,
  public.question_sources, public.student_question_exposures,
  public.question_exposure_events, public.question_attempts,
  public.question_generation_batches, public.question_generation_schedules,
  public.question_generation_jobs, public.curriculum_ingestion_jobs,
  public.question_quality_checks, public.ai_rag_evidence
to service_role;

-- Authenticated callers can only retrieve curriculum chunks permitted by RLS.
create or replace function public.match_curriculum_chunks(
  p_query_embedding extensions.vector(1536),
  p_match_threshold real default 0.45,
  p_match_count integer default 8,
  p_subject_code text default null,
  p_grade_code text default null
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_title text,
  version_label text,
  subject_code text,
  grade_code text,
  page_start integer,
  page_end integer,
  chapter_title text,
  section_title text,
  content_text text,
  similarity real
)
language sql
stable
security invoker
set search_path = public, app, extensions, pg_temp
as $$
  select
    cc.id,
    cs.id,
    cs.title,
    cv.version_label,
    cs.subject_code,
    cs.grade_code,
    cc.page_start,
    cc.page_end,
    cc.chapter_title,
    cc.section_title,
    cc.content_text,
    (1 - (cc.embedding <=> p_query_embedding))::real as similarity
  from public.curriculum_chunks cc
  join public.curriculum_source_versions cv on cv.id = cc.source_version_id
  join public.curriculum_sources cs on cs.id = cc.source_id
  where auth.uid() is not null
    and app.current_tenant_id() is not null
    and cc.embedding is not null
    and cc.status = 'embedded'
    and cv.ingestion_status = 'ready'
    and cs.status = 'active'
    and cs.rights_status = 'approved'
    and 'rag' = any(cs.permitted_uses)
    and (
      cs.sharing_scope = 'platform'
      or (cs.sharing_scope = 'tenant' and cs.tenant_id = app.current_tenant_id())
      or (cs.sharing_scope = 'school' and cs.tenant_id = app.current_tenant_id()
          and cs.school_id = app.current_school_id())
    )
    and app.has_permission('ai.use', coalesce(cs.tenant_id, app.current_tenant_id()),
                           coalesce(cs.school_id, app.current_school_id()), null)
    and (p_subject_code is null or cs.subject_code = p_subject_code)
    and (p_grade_code is null or cs.grade_code = p_grade_code)
    and (1 - (cc.embedding <=> p_query_embedding)) >= p_match_threshold
  order by cc.embedding <=> p_query_embedding
  limit least(greatest(coalesce(p_match_count, 8), 1), 20);
$$;

revoke all on function public.match_curriculum_chunks(
  extensions.vector, real, integer, text, text
) from public, anon;
grant execute on function public.match_curriculum_chunks(
  extensions.vector, real, integer, text, text
) to authenticated, myschool_runtime;

comment on table public.curriculum_sources is
  'Books and curriculum source metadata. Rights and sharing scope gate RAG and question generation.';
comment on table public.curriculum_chunks is
  'Extracted curriculum chunks with page provenance and 1536-dimension embeddings.';
comment on table public.question_bank is
  'Reusable questions; question options are separate from protected answer keys.';
comment on table public.question_bank_answers is
  'Protected answer keys. Never grant direct access to anon/authenticated clients.';
comment on table public.student_question_exposures is
  'One row per student/question pair; first_rendered_at records that the question was actually shown.';
comment on table public.question_generation_jobs is
  'Durable worker queue for scheduled ingestion, embedding, question generation, validation and deduplication.';
comment on table public.ai_rag_evidence is
  'Traceable source evidence retrieved for each AI request and linked response.';
