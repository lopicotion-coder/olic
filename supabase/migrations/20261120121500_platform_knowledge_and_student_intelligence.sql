-- Platform-owned knowledge ingestion, separated model-answer retrieval, and evidence-based student mastery.
-- No source, concept, question, or learner rows are seeded by this migration.
begin;

alter table public.schools
  add column if not exists country_code char(2),
  add column if not exists education_system text,
  add column if not exists curriculum_board text,
  add column if not exists school_track text,
  add column if not exists instruction_language_policy text not null default 'adaptive';
alter table public.schools
  alter column country_code drop default,
  alter column country_code drop not null;
alter table public.schools
  drop constraint if exists schools_country_code_check,
  drop constraint if exists schools_school_track_check,
  drop constraint if exists schools_instruction_language_policy_check;
alter table public.schools
  add constraint schools_country_code_check check (country_code ~ '^[A-Z]{2}$'),
  add constraint schools_school_track_check check (school_track is null or school_track in ('national_arabic','national_language','international','other')),
  add constraint schools_instruction_language_policy_check check (instruction_language_policy in ('adaptive','ar','en','bilingual'));

alter table public.curriculum_sources
  alter column country_code drop default,
  alter column country_code drop not null;
alter table public.curriculum_sources
  drop constraint if exists curriculum_sources_country_code_check;
alter table public.curriculum_sources
  add constraint curriculum_sources_country_code_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$');

alter table public.curriculum_source_versions
  add column if not exists source_url text,
  add column if not exists extraction_profile text not null default 'standard';
alter table public.curriculum_source_versions
  drop constraint if exists curriculum_source_versions_source_url_check,
  drop constraint if exists curriculum_source_versions_extraction_profile_check;
alter table public.curriculum_source_versions
  add constraint curriculum_source_versions_source_url_check check (source_url is null or (length(source_url) <= 2048 and source_url ~ '^https://')),
  add constraint curriculum_source_versions_extraction_profile_check check (extraction_profile in ('standard','diagram_ocr','science_hybrid'));

alter table public.curriculum_sources drop constraint if exists curriculum_sources_source_kind_check;
alter table public.curriculum_sources add constraint curriculum_sources_source_kind_check
  check (source_kind = any (array['official_textbook','licensed_external_book','teacher_material','official_reference','model_answer_document','other']));
alter table public.curriculum_sources drop constraint if exists curriculum_sources_permitted_uses_check;
alter table public.curriculum_sources add constraint curriculum_sources_permitted_uses_check
  check (permitted_uses <@ array['rag','question_generation','question_reuse_school','question_reuse_tenant','question_reuse_platform','model_answer_retrieval']::text[]);

-- The model-answer index is deliberately separate from curriculum_chunks and inaccessible to browser clients.
create table if not exists public.model_answer_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.curriculum_sources(id) on delete cascade,
  source_version_id uuid not null references public.curriculum_source_versions(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  page_start integer,
  page_end integer,
  chapter_title text,
  section_title text,
  content_text text not null,
  content_sha256 char(64) not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  token_count integer,
  embedding extensions.vector(1536),
  embedding_model_key text,
  search_vector tsvector generated always as (to_tsvector('simple', coalesce(content_text,''))) stored,
  status text not null default 'pending' check (status in ('pending','embedded','failed')),
  review_status text not null default 'pending_review' check (review_status in ('pending_review','approved','rejected')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  embedded_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_version_id, chunk_index),
  check ((page_start is null and page_end is null) or (page_start is not null and page_end >= page_start)),
  check ((embedding is null and embedding_model_key is null) or (embedding is not null and embedding_model_key is not null))
);
create index if not exists model_answer_chunks_source_version_idx on public.model_answer_chunks(source_version_id, chunk_index);
create index if not exists model_answer_chunks_source_idx on public.model_answer_chunks(source_id);
create index if not exists model_answer_chunks_search_idx on public.model_answer_chunks using gin(search_vector);
create index if not exists model_answer_chunks_embedding_idx on public.model_answer_chunks using hnsw(embedding extensions.vector_cosine_ops) where embedding is not null;
alter table public.model_answer_chunks enable row level security;
revoke all on public.model_answer_chunks from public, anon, authenticated;
grant select, insert, update, delete on public.model_answer_chunks to service_role;

create table if not exists public.school_subject_learning_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null,
  subject_code text not null check (length(trim(subject_code)) between 1 and 80),
  instruction_language_policy text not null check (instruction_language_policy in ('adaptive','ar','en','bilingual')),
  target_language_level text,
  curriculum_alignment text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, subject_code),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);
create index if not exists school_subject_learning_policies_scope_idx on public.school_subject_learning_policies(tenant_id, school_id);
alter table public.school_subject_learning_policies enable row level security;
grant select, insert, update, delete on public.school_subject_learning_policies to authenticated, service_role;
create policy school_subject_learning_policies_read on public.school_subject_learning_policies for select to authenticated
  using (app.has_permission('students.read', tenant_id, school_id, null) or app.has_permission('platform.knowledge.manage', null, null, null));
create policy school_subject_learning_policies_manage on public.school_subject_learning_policies for all to authenticated
  using (app.has_permission('platform.knowledge.manage', null, null, null) or app.has_permission('schools.manage', tenant_id, school_id, null))
  with check (app.has_permission('platform.knowledge.manage', null, null, null) or app.has_permission('schools.manage', tenant_id, school_id, null));

-- Curriculum concepts and mappings are empty until the platform's academic team verifies them.
create table if not exists public.curriculum_concepts (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  education_system text,
  curriculum_board text,
  subject_code text not null check (length(trim(subject_code)) between 1 and 80),
  grade_code text not null check (length(trim(grade_code)) between 1 and 80),
  concept_key text not null check (length(trim(concept_key)) between 2 and 120),
  title text not null check (length(trim(title)) between 2 and 300),
  description text,
  parent_concept_id uuid references public.curriculum_concepts(id) on delete set null,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, education_system, curriculum_board, subject_code, grade_code, concept_key)
);
create index if not exists curriculum_concepts_lookup_idx on public.curriculum_concepts(country_code, subject_code, grade_code, status);

create table if not exists public.question_concept_mappings (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.question_bank(id) on delete cascade,
  concept_id uuid not null references public.curriculum_concepts(id) on delete cascade,
  relevance_weight numeric(5,4) not null default 1 check (relevance_weight > 0 and relevance_weight <= 1),
  mapping_type text not null default 'assesses' check (mapping_type in ('assesses','prerequisite','application')),
  mapped_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (question_id, concept_id, mapping_type)
);
create index if not exists question_concept_mappings_concept_idx on public.question_concept_mappings(concept_id, question_id);
alter table public.curriculum_concepts enable row level security;
alter table public.question_concept_mappings enable row level security;
grant select, insert, update, delete on public.curriculum_concepts, public.question_concept_mappings to authenticated, service_role;
create policy curriculum_concepts_platform_manage on public.curriculum_concepts for all to authenticated
  using (app.has_permission('platform.knowledge.manage', null, null, null))
  with check (app.has_permission('platform.knowledge.manage', null, null, null));
create policy curriculum_concepts_student_read on public.curriculum_concepts for select to authenticated
  using (exists (
    select 1 from public.student_skill_mastery m where m.concept_id=curriculum_concepts.id
      and (app.is_student_owner(m.student_id) or app.is_guardian_of_student(m.student_id)
        or app.has_permission('students.read', m.tenant_id, m.school_id, null))
  ));
create policy question_concept_mappings_platform_manage on public.question_concept_mappings for all to authenticated
  using (app.has_permission('platform.knowledge.manage', null, null, null))
  with check (app.has_permission('platform.knowledge.manage', null, null, null));

-- Skills are calculated exclusively from actually graded question attempts linked to verified concept mappings.
create table if not exists public.student_skill_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  concept_id uuid not null references public.curriculum_concepts(id) on delete restrict,
  question_id uuid not null references public.question_bank(id) on delete restrict,
  question_attempt_id uuid not null references public.question_attempts(id) on delete cascade,
  evidence_score numeric(7,6) not null check (evidence_score between 0 and 1),
  evidence_weight numeric(7,4) not null check (evidence_weight > 0 and evidence_weight <= 2),
  evidence_type text not null default 'graded_question_attempt' check (evidence_type='graded_question_attempt'),
  evidence_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence_payload)='object'),
  observed_at timestamptz not null default now(),
  unique (question_attempt_id, concept_id),
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete cascade
);
create index if not exists student_skill_observations_history_idx on public.student_skill_observations(student_id, concept_id, observed_at desc);

create table if not exists public.student_skill_mastery (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  concept_id uuid not null references public.curriculum_concepts(id) on delete restrict,
  mastery_score numeric(7,6) not null check (mastery_score between 0 and 1),
  confidence_score numeric(7,6) not null check (confidence_score between 0 and 1),
  evidence_count integer not null check (evidence_count > 0),
  last_evidence_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (student_id, concept_id),
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete cascade
);
create index if not exists student_skill_mastery_student_idx on public.student_skill_mastery(student_id, mastery_score asc);
create index if not exists student_skill_mastery_school_idx on public.student_skill_mastery(tenant_id, school_id, concept_id);
alter table public.student_skill_observations enable row level security;
alter table public.student_skill_mastery enable row level security;
grant select on public.student_skill_observations, public.student_skill_mastery to authenticated;
grant select, insert, update, delete on public.student_skill_observations, public.student_skill_mastery to service_role;
create policy student_skill_observations_read on public.student_skill_observations for select to authenticated
  using (app.is_student_owner(student_id) or app.is_guardian_of_student(student_id) or app.has_permission('students.read', tenant_id, school_id, null));
create policy student_skill_mastery_read on public.student_skill_mastery for select to authenticated
  using (app.is_student_owner(student_id) or app.is_guardian_of_student(student_id) or app.has_permission('students.read', tenant_id, school_id, null));

create or replace function app.record_question_attempt_skill_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $function$
declare
  v_student_id uuid;
  v_tenant_id uuid;
  v_school_id uuid;
  v_question_id uuid;
  v_score numeric;
  v_weight numeric;
  v_concept_id uuid;
  v_count integer;
  v_mastery numeric;
begin
  if new.is_correct is not null then
    v_score := case when new.is_correct then 1 else 0 end;
  elsif new.score is not null and coalesce(new.max_score,0)>0 then
    v_score := greatest(0, least(1, new.score/new.max_score));
  else
    return new;
  end if;
  select e.student_id,e.tenant_id,e.school_id,e.question_id
    into v_student_id,v_tenant_id,v_school_id,v_question_id
  from public.student_question_exposures e where e.id=new.exposure_id;
  if v_student_id is null or v_question_id is null then return new; end if;
  v_weight := 1;

  for v_concept_id in
    select m.concept_id from public.question_concept_mappings m
    join public.curriculum_concepts c on c.id=m.concept_id and c.status='active'
    where m.question_id=v_question_id and m.mapping_type='assesses'
  loop
    insert into public.student_skill_observations (
      tenant_id,school_id,student_id,concept_id,question_id,question_attempt_id,
      evidence_score,evidence_weight,evidence_payload,observed_at
    ) values (
      v_tenant_id,v_school_id,v_student_id,v_concept_id,v_question_id,new.id,
      v_score,v_weight,
      jsonb_build_object('is_correct',new.is_correct,'score',new.score,'max_score',new.max_score,
        'graded_at',coalesce(new.reviewed_at,new.submitted_at)),
      coalesce(new.reviewed_at,new.submitted_at,now())
    )
    on conflict (question_attempt_id,concept_id) do update
      set evidence_score=excluded.evidence_score,evidence_weight=excluded.evidence_weight,
          evidence_payload=excluded.evidence_payload,observed_at=excluded.observed_at;

    select count(*)::integer,
      coalesce(sum(o.evidence_score*o.evidence_weight)/nullif(sum(o.evidence_weight),0),0)
      into v_count,v_mastery
    from public.student_skill_observations o
    where o.student_id=v_student_id and o.concept_id=v_concept_id;

    insert into public.student_skill_mastery (
      tenant_id,school_id,student_id,concept_id,mastery_score,confidence_score,evidence_count,last_evidence_at,updated_at
    )
    select v_tenant_id,v_school_id,v_student_id,v_concept_id,
      greatest(0,least(1,v_mastery)),
      greatest(0,least(1,1-exp(-v_count::numeric/4))),
      v_count,max(o.observed_at),now()
    from public.student_skill_observations o
    where o.student_id=v_student_id and o.concept_id=v_concept_id
    group by o.student_id
    on conflict (student_id,concept_id) do update
      set mastery_score=excluded.mastery_score,confidence_score=excluded.confidence_score,
          evidence_count=excluded.evidence_count,last_evidence_at=excluded.last_evidence_at,updated_at=now();
  end loop;
  return new;
end;
$function$;

drop trigger if exists question_attempts_record_skill_evidence on public.question_attempts;
create trigger question_attempts_record_skill_evidence
  after insert or update of is_correct,score,max_score,reviewed_at
  on public.question_attempts for each row execute function app.record_question_attempt_skill_evidence();
revoke all on function app.record_question_attempt_skill_evidence() from public;

insert into public.permissions (key,description)
values ('platform.knowledge.manage','Manage platform-owned curriculum sources, answer models, concepts and learning policies')
on conflict (key) do nothing;
insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('platform_admin','platform_owner') and p.key='platform.knowledge.manage'
on conflict do nothing;

create policy platform_knowledge_sources_read on public.curriculum_sources for select to authenticated
  using (sharing_scope='platform' and app.has_permission('platform.knowledge.manage',null,null,null));
grant select on public.curriculum_source_versions to authenticated;
create policy platform_knowledge_source_versions_read on public.curriculum_source_versions for select to authenticated
  using (exists (select 1 from public.curriculum_sources s where s.id=curriculum_source_versions.source_id and s.sharing_scope='platform' and app.has_permission('platform.knowledge.manage',null,null,null)));

create or replace function public.platform_create_knowledge_source(
  p_title text,
  p_source_url text,
  p_knowledge_role text,
  p_country_code text,
  p_education_system text,
  p_curriculum_board text,
  p_subject_code text,
  p_subject_name text,
  p_grade_code text,
  p_grade_label text,
  p_language_code text,
  p_version_label text,
  p_academic_year_label text default null,
  p_publication_year integer default null,
  p_extraction_profile text default 'standard',
  p_publisher text default null
)
returns table(source_id uuid,source_version_id uuid,ingestion_job_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $function$
declare
  v_source_id uuid;
  v_version_id uuid;
  v_job_id uuid;
  v_source_kind text;
begin
  if auth.uid() is null or not app.has_permission('platform.knowledge.manage',null,null,null) then
    raise exception 'FORBIDDEN_PLATFORM_KNOWLEDGE_MANAGEMENT' using errcode='42501';
  end if;
  if length(trim(coalesce(p_title,''))) not between 2 and 300 then raise exception 'INVALID_SOURCE_TITLE'; end if;
  if p_source_url is null or length(p_source_url)>2048 or p_source_url !~ '^https://' then raise exception 'SOURCE_URL_MUST_BE_HTTPS'; end if;
  if p_knowledge_role not in ('curriculum','model_answer') then raise exception 'INVALID_KNOWLEDGE_ROLE'; end if;
  if p_country_code is null or p_country_code !~ '^[A-Z]{2}$' then raise exception 'INVALID_COUNTRY_CODE'; end if;
  if length(trim(coalesce(p_subject_code,''))) not between 1 and 80
    or length(trim(coalesce(p_subject_name,''))) not between 1 and 160
    or length(trim(coalesce(p_grade_code,''))) not between 1 and 80
    or length(trim(coalesce(p_grade_label,''))) not between 1 and 160
    or length(trim(coalesce(p_version_label,''))) not between 1 and 120
  then raise exception 'SOURCE_CURRICULUM_METADATA_REQUIRED'; end if;
  if p_extraction_profile not in ('standard','diagram_ocr','science_hybrid') then raise exception 'INVALID_EXTRACTION_PROFILE'; end if;
  if p_publication_year is not null and p_publication_year not between 1800 and 2200 then raise exception 'INVALID_PUBLICATION_YEAR'; end if;

  v_source_kind := case when p_knowledge_role='model_answer' then 'model_answer_document' else 'official_textbook' end;
  insert into public.curriculum_sources (
    sharing_scope,tenant_id,school_id,title,publisher,source_kind,country_code,
    education_system,curriculum_board,subject_code,subject_name,grade_code,
    grade_label,language_code,publication_year,status,rights_status,permitted_uses,created_by
  ) values (
    'platform',null,null,trim(p_title),nullif(trim(coalesce(p_publisher,'')),''),
    v_source_kind,p_country_code,nullif(trim(coalesce(p_education_system,'')),''),
    nullif(trim(coalesce(p_curriculum_board,'')),''),
    trim(p_subject_code),trim(p_subject_name),trim(p_grade_code),trim(p_grade_label),
    coalesce(nullif(trim(p_language_code),''),'ar'),p_publication_year,
    'draft','pending_review','{}'::text[],auth.uid()
  ) returning id into v_source_id;

  insert into public.curriculum_source_versions (
    source_id,version_label,academic_year_label,publication_year,source_url,
    extraction_profile,storage_object_path,ingestion_status,extraction_metadata,created_by
  ) values (
    v_source_id,trim(p_version_label),nullif(trim(coalesce(p_academic_year_label,'')),''),
    p_publication_year,p_source_url,p_extraction_profile,null,'queued',
    jsonb_build_object('source_origin','platform_url','file_retained',false),auth.uid()
  ) returning id into v_version_id;

  insert into public.curriculum_ingestion_jobs (source_version_id,job_status,stage,attempts,max_attempts,metadata)
  values (v_version_id,'queued','extract',0,5,
    jsonb_build_object('requested_by',auth.uid(),'source_origin','platform_url','knowledge_role',p_knowledge_role))
  returning id into v_job_id;
  return query select v_source_id,v_version_id,v_job_id;
end;
$function$;

create or replace function public.platform_review_knowledge_source(
  p_source_id uuid,
  p_approve boolean,
  p_rights_basis text,
  p_rights_reference text,
  p_permitted_uses text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $function$
declare
  v_source_kind text;
  v_source_version_id uuid;
  v_version_ready boolean;
  v_chunk_count integer;
begin
  if auth.uid() is null or not app.has_permission('platform.knowledge.manage',null,null,null) then
    raise exception 'FORBIDDEN_PLATFORM_KNOWLEDGE_MANAGEMENT' using errcode='42501';
  end if;
  select s.source_kind,
    latest.id,
    coalesce(latest.ingestion_status='ready',false),
    case when s.source_kind='model_answer_document'
      then (select count(*)::integer from public.model_answer_chunks c where c.source_version_id=latest.id)
      else (select count(*)::integer from public.curriculum_chunks c where c.source_version_id=latest.id) end
  into v_source_kind,v_source_version_id,v_version_ready,v_chunk_count
  from public.curriculum_sources s
  left join lateral (
    select v.id,v.ingestion_status from public.curriculum_source_versions v
    where v.source_id=s.id order by v.created_at desc,v.id desc limit 1
  ) latest on true
  where s.id=p_source_id and s.sharing_scope='platform';
  if v_source_kind is null then raise exception 'PLATFORM_KNOWLEDGE_SOURCE_NOT_FOUND'; end if;

  if p_approve then
    if length(trim(coalesce(p_rights_basis,'')))<3 then raise exception 'RIGHTS_BASIS_REQUIRED'; end if;
    if not v_version_ready or coalesce(v_chunk_count,0)=0 then raise exception 'SOURCE_INGESTION_MUST_BE_READY_BEFORE_APPROVAL'; end if;
    if v_source_kind='model_answer_document' then
      if not ('model_answer_retrieval'=any(coalesce(p_permitted_uses,'{}'::text[]))) then raise exception 'MODEL_ANSWER_RETRIEVAL_PERMISSION_REQUIRED'; end if;
      if exists(select 1 from public.model_answer_chunks c where c.source_id=p_source_id and (c.embedding is null or c.status<>'embedded')) then
        raise exception 'MODEL_ANSWER_EMBEDDING_INCOMPLETE';
      end if;
      update public.model_answer_chunks set review_status='approved',updated_at=now() where source_version_id=v_source_version_id;
    else
      if cardinality(coalesce(p_permitted_uses,'{}'::text[]))=0
        or not (coalesce(p_permitted_uses,'{}'::text[]) <@ array['rag','question_generation']::text[])
      then raise exception 'CURRICULUM_PERMITTED_USE_REQUIRED'; end if;
    end if;
    update public.curriculum_sources set
      status='active',rights_status='approved',rights_basis=trim(p_rights_basis),
      rights_reference=nullif(trim(coalesce(p_rights_reference,'')),''),
      permitted_uses=p_permitted_uses,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=p_source_id;
  else
    update public.model_answer_chunks set review_status='rejected',updated_at=now()
      where source_version_id=v_source_version_id and v_source_kind='model_answer_document';
    update public.curriculum_sources set
      status='blocked',rights_status='denied',permitted_uses='{}'::text[],
      rights_basis=nullif(trim(coalesce(p_rights_basis,'')),''),
      rights_reference=nullif(trim(coalesce(p_rights_reference,'')),''),
      reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=p_source_id;
  end if;
end;
$function$;

create or replace function public.search_model_answer_hybrid(
  p_query_embedding extensions.vector(1536),
  p_tenant_id uuid,
  p_school_id uuid,
  p_country_code text,
  p_subject_code text,
  p_grade_code text,
  p_limit integer default 5
)
returns table (
  chunk_id uuid,source_id uuid,source_title text,version_label text,
  subject_code text,grade_code text,page_start integer,page_end integer,
  content_text text,similarity real,citation_label text
)
language sql stable
set search_path = pg_catalog, public, app, extensions
as $function$
  select c.id,s.id,s.title,v.version_label,s.subject_code,s.grade_code,c.page_start,c.page_end,c.content_text,
    (1-(c.embedding <=> p_query_embedding))::real,
    s.title || ' · ' || v.version_label || case when c.page_start is not null then ' · ص ' || c.page_start::text else '' end
  from public.model_answer_chunks c
  join public.curriculum_sources s on s.id=c.source_id
  join public.curriculum_source_versions v on v.id=c.source_version_id
  where c.embedding is not null and c.review_status='approved' and c.status='embedded'
    and s.source_kind='model_answer_document' and s.status='active' and s.rights_status='approved'
    and 'model_answer_retrieval'=any(s.permitted_uses)
    and v.id = (select latest.id from public.curriculum_source_versions latest
                where latest.source_id=s.id order by latest.created_at desc,latest.id desc limit 1)
    and v.ingestion_status='ready'
    and p_country_code is not null and s.country_code=p_country_code
    and (p_subject_code is null or s.subject_code=p_subject_code)
    and (p_grade_code is null or s.grade_code=p_grade_code)
    and ((s.sharing_scope='platform')
      or (s.sharing_scope='tenant' and s.tenant_id=p_tenant_id)
      or (s.sharing_scope='school' and s.tenant_id=p_tenant_id and s.school_id=p_school_id))
  order by c.embedding <=> p_query_embedding
  limit greatest(1,least(coalesce(p_limit,5),12));
$function$;

revoke all on function public.platform_create_knowledge_source(text,text,text,text,text,text,text,text,text,text,text,text,text,integer,text,text) from public,anon;
revoke all on function public.platform_review_knowledge_source(uuid,boolean,text,text,text[]) from public,anon;
revoke all on function public.search_model_answer_hybrid(extensions.vector,uuid,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.platform_create_knowledge_source(text,text,text,text,text,text,text,text,text,text,text,text,text,integer,text,text) to authenticated;
grant execute on function public.platform_review_knowledge_source(uuid,boolean,text,text,text[]) to authenticated;
grant execute on function public.search_model_answer_hybrid(extensions.vector,uuid,uuid,text,text,text,integer) to service_role;

grant select on public.curriculum_sources,public.curriculum_source_versions to authenticated;
grant select,insert,update,delete on public.model_answer_chunks to service_role;
commit;
