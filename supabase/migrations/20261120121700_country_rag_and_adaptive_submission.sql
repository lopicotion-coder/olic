-- Country-scoped curriculum retrieval and protected objective practice submission.
-- Student answer keys remain server-only and are never returned by practice APIs.
begin;

create or replace function public.search_curriculum_hybrid_country(  p_query_text text,
  p_query_embedding extensions.vector(1536),
  p_tenant_id uuid,
  p_school_id uuid,
  p_subject_code text,
  p_grade_code text,
  p_source_version_id uuid,
  p_limit integer,
  p_country_code text)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_version_id uuid,
  source_title text,
  version_label text,
  subject_code text,
  grade_code text,
  sharing_scope text,
  chapter_title text,
  section_title text,
  page_start integer,
  page_end integer,
  content_text text,
  similarity_score numeric,
  lexical_rank bigint,
  semantic_rank bigint,
  retrieval_score numeric,
  citation_label text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, app, extensions
as $$
declare
  query_text text := nullif(trim(coalesce(p_query_text, '')), '');
begin
  if query_text is null then
    raise exception 'A non-empty curriculum query is required';
  end if;
  -- NULL tenant means platform-only curriculum retrieval for independent learners.
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'p_limit must be between 1 and 20';
  end if;

  return query
  with permitted_sources as materialized (
    select
      cs.id,
      cs.title,
      cs.subject_code,
      cs.grade_code,
      cs.sharing_scope,
      cs.country_code
    from public.curriculum_sources cs
    where cs.status = 'active'
      and cs.rights_status = 'approved'
      and 'rag' = any(cs.permitted_uses)
      and (p_subject_code is null or cs.subject_code = p_subject_code)
      and (p_grade_code is null or cs.grade_code = p_grade_code)
      and p_country_code is not null
      and cs.country_code = p_country_code
      and (
        (cs.sharing_scope = 'platform')
        or (cs.sharing_scope = 'tenant' and cs.tenant_id = p_tenant_id)
        or (
          cs.sharing_scope = 'school'
          and cs.tenant_id = p_tenant_id
          and p_school_id is not null
          and cs.school_id = p_school_id
        )
      )
  ),
  lexical_candidates as (
    select
      cc.id as chunk_id,
      row_number() over (
        order by ts_rank_cd(
          cc.search_vector,
          plainto_tsquery('simple'::regconfig, query_text)
        ) desc, cc.id
      ) as position
    from public.curriculum_chunks cc
    join permitted_sources ps on ps.id = cc.source_id
    join public.curriculum_source_versions cv
      on cv.id = cc.source_version_id
     and cv.ingestion_status = 'ready'
     and cv.id = (
       select latest.id
       from public.curriculum_source_versions latest
       where latest.source_id = cc.source_id
       order by latest.created_at desc
       limit 1
     )
    where cc.search_vector @@ plainto_tsquery('simple'::regconfig, query_text)
      and (p_source_version_id is null or cc.source_version_id = p_source_version_id)
    order by ts_rank_cd(
      cc.search_vector,
      plainto_tsquery('simple'::regconfig, query_text)
    ) desc, cc.id
    limit 60
  ),
  semantic_candidates as (
    select
      cc.id as chunk_id,
      row_number() over (
        order by cc.embedding <=> p_query_embedding, cc.id
      ) as position,
      greatest(0, least(1, 1 - (cc.embedding <=> p_query_embedding)))::numeric as similarity
    from public.curriculum_chunks cc
    join permitted_sources ps on ps.id = cc.source_id
    join public.curriculum_source_versions cv
      on cv.id = cc.source_version_id
     and cv.ingestion_status = 'ready'
     and cv.id = (
       select latest.id
       from public.curriculum_source_versions latest
       where latest.source_id = cc.source_id
       order by latest.created_at desc
       limit 1
     )
    where cc.embedding is not null
      and (p_source_version_id is null or cc.source_version_id = p_source_version_id)
    order by cc.embedding <=> p_query_embedding, cc.id
    limit 60
  ),
  fused_positions as (
    select
      lc.chunk_id,
      1.0::numeric / (60 + lc.position)::numeric as rrf_score
    from lexical_candidates lc
    union all
    select
      sc.chunk_id,
      1.0::numeric / (60 + sc.position)::numeric as rrf_score
    from semantic_candidates sc
  ),
  fused as (
    select
      fp.chunk_id,
      sum(fp.rrf_score)::numeric as combined_score
    from fused_positions fp
    group by fp.chunk_id
  ),
  top_chunks as (
    select
      f.chunk_id,
      f.combined_score,
      lc.position as lexical_position,
      sc.position as semantic_position,
      sc.similarity
    from fused f
    left join lexical_candidates lc on lc.chunk_id = f.chunk_id
    left join semantic_candidates sc on sc.chunk_id = f.chunk_id
    order by f.combined_score desc, f.chunk_id
    limit p_limit
  )
  select
    cc.id,
    cc.source_id,
    cc.source_version_id,
    ps.title,
    cv.version_label,
    ps.subject_code,
    ps.grade_code,
    ps.sharing_scope,
    cc.chapter_title,
    cc.section_title,
    cc.page_start,
    cc.page_end,
    cc.content_text,
    coalesce(tc.similarity, 0)::numeric,
    tc.lexical_position,
    tc.semantic_position,
    tc.combined_score,
    concat(
      ps.title,
      ' — ',
      cv.version_label,
      case
        when cc.page_start is null then ''
        when cc.page_end is null or cc.page_end = cc.page_start then concat(' — ص. ', cc.page_start)
        else concat(' — ص. ', cc.page_start, '-', cc.page_end)
      end
    )::text
  from top_chunks tc
  join public.curriculum_chunks cc on cc.id = tc.chunk_id
  join permitted_sources ps on ps.id = cc.source_id
  join public.curriculum_source_versions cv
    on cv.id = cc.source_version_id
   and cv.ingestion_status = 'ready'
   and cv.id = (
     select latest.id
     from public.curriculum_source_versions latest
     where latest.source_id = cc.source_id
     order by latest.created_at desc
     limit 1
   )
  order by tc.combined_score desc, cc.id;
end;
$$;


revoke all on function public.search_curriculum_hybrid_country(text,extensions.vector,uuid,uuid,text,text,uuid,integer,text)
  from public,anon,authenticated,myschool_runtime;
grant execute on function public.search_curriculum_hybrid_country(text,extensions.vector,uuid,uuid,text,text,uuid,integer,text)
  to service_role;

alter table public.question_attempts
  add column if not exists idempotency_key text;
create unique index if not exists question_attempts_idempotency_key_idx
  on public.question_attempts(idempotency_key)
  where idempotency_key is not null;

create or replace function public.submit_adaptive_question_attempt(
  p_exposure_id uuid,
  p_answer jsonb,
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
set search_path = pg_catalog,public,app
as $function$
declare
  v_exposure public.student_question_exposures%rowtype;
  v_question public.question_bank%rowtype;
  v_answer_key jsonb;
  v_answer_reveal_policy text;
  v_attempt_id uuid;
  v_attempt_number integer;
  v_is_correct boolean;
  v_score numeric;
  v_feedback text;
  v_grading_status text;
  v_expected text;
  v_actual text;
  v_max_score numeric;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
  end if;
  if p_exposure_id is null or p_answer is null or jsonb_typeof(p_answer)<>'object' then
    raise exception 'INVALID_PRACTICE_ANSWER';
  end if;
  if length(coalesce(p_idempotency_key,'')) not between 16 and 120 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  select * into v_exposure
  from public.student_question_exposures e
  where e.id=p_exposure_id
  for update;
  if not found or not app.is_student_owner(v_exposure.student_id) then
    raise exception 'PRACTICE_EXPOSURE_NOT_FOUND' using errcode='42501';
  end if;
  if v_exposure.assessment_id is not null or v_exposure.assignment_id is not null then
    raise exception 'ASSIGNMENT_OR_ASSESSMENT_EXPOSURES_NOT_AVAILABLE_IN_PRACTICE';
  end if;

  select * into v_question
  from public.question_bank q
  where q.id=v_exposure.question_id
    and q.review_status='approved'
    and q.record_status='active';
  if not found then raise exception 'APPROVED_QUESTION_NOT_FOUND'; end if;

  -- Idempotent retry: return the prior result for the same submission key.
  select a.id,a.attempt_number,a.is_correct,a.score,a.max_score
    into v_attempt_id,v_attempt_number,v_is_correct,v_score,v_max_score
  from public.question_attempts a
  where a.idempotency_key=p_idempotency_key;
  if found then
    if not exists(select 1 from public.question_attempts a where a.id=v_attempt_id and a.exposure_id=p_exposure_id) then
      raise exception 'IDEMPOTENCY_KEY_ALREADY_USED';
    end if;
    return query select v_attempt_id,v_attempt_number,
      case when v_is_correct is null then 'needs_review' else 'auto_graded' end,
      v_is_correct,v_score,v_max_score,
      case when v_is_correct is null then 'تم استلام الإجابة وتحتاج مراجعة.' when v_is_correct then 'إجابة صحيحة.' else 'الإجابة غير صحيحة. راجع شرح الدرس وحاول من جديد.' end;
    return;
  end if;

  if v_exposure.exposure_status not in ('rendered','opened','delivered') then
    raise exception 'PRACTICE_EXPOSURE_NOT_ACTIVE';
  end if;

  if not exists (
    select 1
    from public.student_enrollments en
    join public.classes cl on cl.id=en.class_id and cl.tenant_id=en.tenant_id and cl.school_id=en.school_id
    join public.grade_levels gl on gl.id=cl.grade_level_id and gl.tenant_id=cl.tenant_id and gl.school_id=cl.school_id
    join public.class_subjects cs on cs.class_id=cl.id and cs.tenant_id=cl.tenant_id and cs.school_id=cl.school_id
    join public.subjects sub on sub.id=cs.subject_id and sub.tenant_id=cs.tenant_id and sub.school_id=cs.school_id
    where en.student_id=v_exposure.student_id and en.status='active'
      and en.tenant_id=v_exposure.tenant_id and en.school_id=v_exposure.school_id
      and cl.status='active' and gl.status='active' and sub.status='active'
      and sub.code=v_question.subject_code and gl.code=v_question.grade_code
  ) then
    raise exception 'PRACTICE_TRACK_NOT_IN_ACTIVE_ENROLLMENT' using errcode='42501';
  end if;

  select a.answer_payload,a.answer_reveal_policy into v_answer_key,v_answer_reveal_policy
  from public.question_bank_answers a
  where a.question_id=v_question.id;
  if v_answer_key is null then raise exception 'QUESTION_ANSWER_KEY_NOT_AVAILABLE'; end if;
  if v_answer_reveal_policy is distinct from 'after_submission' then
    raise exception 'QUESTION_REVEAL_POLICY_BLOCKS_ADAPTIVE_PRACTICE';
  end if;

  v_grading_status := 'needs_review';
  v_is_correct := null;
  v_score := null;
  v_feedback := 'تم استلام إجابتك. سيتم تقييمها عندما تتاح آلية التصحيح المناسبة.';

  if v_question.question_type='multiple_choice' then
    if jsonb_typeof(v_question.choices) is distinct from 'array' then
      raise exception 'QUESTION_CHOICES_INVALID';
    end if;
    v_expected := v_answer_key->>'correct_choice_id';
    v_actual := coalesce(p_answer->>'choice_id',p_answer->>'selected_choice_id');
    if v_expected is null or v_actual is null then raise exception 'INVALID_MULTIPLE_CHOICE_ANSWER'; end if;
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(v_question.choices,'[]'::jsonb))
        with ordinality as choice_rows(choice,ord)
      where coalesce(choice->>'id',ord::text)=v_actual
    ) then raise exception 'MULTIPLE_CHOICE_ID_NOT_FOUND'; end if;
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(v_question.choices,'[]'::jsonb))
        with ordinality as choice_rows(choice,ord)
      where coalesce(choice->>'id',ord::text)=v_expected
    ) then raise exception 'QUESTION_ANSWER_KEY_INVALID'; end if;
    v_is_correct := v_expected=v_actual;
    v_grading_status := 'auto_graded';
  elsif v_question.question_type='true_false' then
    v_expected := v_answer_key->>'correct_answer';
    v_actual := coalesce(p_answer->>'value',p_answer->>'answer');
    if v_expected is null or lower(v_expected) not in ('true','false')
       or v_actual is null or lower(v_actual) not in ('true','false') then
      raise exception 'INVALID_TRUE_FALSE_ANSWER';
    end if;
    v_is_correct := lower(v_expected)=lower(v_actual);
    v_grading_status := 'auto_graded';
  elsif v_question.question_type='fill_blank' then
    v_actual := nullif(trim(coalesce(p_answer->>'text',p_answer->>'value','')),'');
    if v_actual is null then raise exception 'FILL_BLANK_ANSWER_REQUIRED'; end if;
    if jsonb_typeof(v_answer_key->'accepted_answers') is distinct from 'array'
       or jsonb_array_length(v_answer_key->'accepted_answers')=0 then
      raise exception 'QUESTION_ANSWER_KEY_INVALID';
    end if;
    v_is_correct := exists (
      select 1
      from jsonb_array_elements_text(v_answer_key->'accepted_answers') accepted(value)
      where lower(trim(accepted.value))=lower(trim(v_actual))
    );
    v_grading_status := 'auto_graded';
  end if;

  if v_grading_status='auto_graded' then
    v_score := case when v_is_correct then 100 else 0 end;
    v_feedback := case when v_is_correct
      then 'إجابة صحيحة. انتقل إلى السؤال التالي.'
      else 'الإجابة غير صحيحة. راجع شرح الدرس وحاول مرة أخرى.' end;
  end if;

  select coalesce(max(a.attempt_number),0)+1 into v_attempt_number
  from public.question_attempts a where a.exposure_id=p_exposure_id;

  insert into public.question_attempts (
    exposure_id,tenant_id,school_id,student_id,attempt_number,answer_payload,
    is_correct,score,max_score,feedback,idempotency_key,submitted_at,
    reviewed_at
  ) values (
    v_exposure.id,v_exposure.tenant_id,v_exposure.school_id,v_exposure.student_id,
    v_attempt_number,p_answer,v_is_correct,v_score,100,v_feedback,p_idempotency_key,
    now(),case when v_grading_status='auto_graded' then now() else null end
  ) returning id into v_attempt_id;

  update public.student_question_exposures
  set exposure_status='answered',
      first_answered_at=coalesce(first_answered_at,now()),
      last_answered_at=now(),
      last_event_at=now(),
      updated_at=now()
  where id=v_exposure.id;

  return query select v_attempt_id,v_attempt_number,v_grading_status,
    v_is_correct,v_score,100::numeric,v_feedback;
end;
$function$;

revoke all on function public.submit_adaptive_question_attempt(uuid,jsonb,text) from public,anon;
grant execute on function public.submit_adaptive_question_attempt(uuid,jsonb,text) to authenticated;


create or replace function public.get_student_learning_tracks(p_student_id uuid)
returns table(subject_code text,grade_code text)
language plpgsql
security definer
set search_path=pg_catalog,public,app
as $function$
declare
  v_country_code text;
  v_tenant_id uuid;
  v_school_id uuid;
begin
  if auth.uid() is null or not app.is_student_owner(p_student_id) then
    raise exception 'STUDENT_OWNERSHIP_REQUIRED' using errcode='42501';
  end if;
  select sc.country_code,s.tenant_id,s.school_id
    into v_country_code,v_tenant_id,v_school_id
  from public.students s join public.schools sc on sc.id=s.school_id and sc.tenant_id=s.tenant_id
  where s.id=p_student_id;
  if v_school_id is null then raise exception 'STUDENT_SCHOOL_CONTEXT_NOT_FOUND'; end if;
  return query
  select distinct sub.code,gl.code
  from public.student_enrollments en
  join public.classes cl on cl.id=en.class_id and cl.tenant_id=en.tenant_id and cl.school_id=en.school_id
  join public.grade_levels gl on gl.id=cl.grade_level_id and gl.tenant_id=cl.tenant_id and gl.school_id=cl.school_id
  join public.class_subjects cs on cs.class_id=cl.id and cs.tenant_id=cl.tenant_id and cs.school_id=cl.school_id
  join public.subjects sub on sub.id=cs.subject_id and sub.tenant_id=cs.tenant_id and sub.school_id=cs.school_id
  join public.curriculum_concepts c
    on c.country_code=v_country_code and c.subject_code=sub.code and c.grade_code=gl.code and c.status='active'
  join public.question_concept_mappings m on m.concept_id=c.id and m.mapping_type='assesses'
  join public.question_bank q on q.id=m.question_id and q.review_status='approved' and q.record_status='active'
    and q.question_type in ('multiple_choice','true_false','fill_blank')
  where en.student_id=p_student_id and en.status='active'
    and cl.status='active' and gl.status='active' and sub.status='active'
    and (
      (q.sharing_scope='platform')
      or (q.sharing_scope='tenant' and q.tenant_id=v_tenant_id)
      or (q.sharing_scope='school' and q.tenant_id=v_tenant_id and q.school_id=v_school_id)
    )
  order by sub.code,gl.code;
end;
$function$;

revoke all on function public.get_student_learning_tracks(uuid) from public,anon;
grant execute on function public.get_student_learning_tracks(uuid) to authenticated;

commit;
