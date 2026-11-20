-- Add secure question mapping administration and adaptive practice selection.
-- No questions, concepts, attempts, or learner data are seeded here.
begin;

grant select on public.question_bank to authenticated;
create policy platform_knowledge_question_bank_read
  on public.question_bank for select to authenticated
  using (app.has_permission('platform.knowledge.manage', null, null, null));

drop policy if exists school_subject_learning_policies_read on public.school_subject_learning_policies;
create policy school_subject_learning_policies_read
  on public.school_subject_learning_policies for select to authenticated
  using (
    app.has_permission('students.read', tenant_id, school_id, null)
    or app.has_permission('schools.manage', tenant_id, school_id, null)
    or app.has_permission('platform.knowledge.manage', null, null, null)
  );

create or replace function public.get_adaptive_practice_set(
  p_student_id uuid,
  p_subject_code text,
  p_grade_code text,
  p_limit integer default 8
)
returns table (
  exposure_id uuid,
  question_id uuid,
  question_text text,
  choices jsonb,
  question_type text,
  language_code text,
  difficulty smallint,
  unit_title text,
  lesson_title text,
  concept_id uuid,
  concept_title text,
  mastery_score numeric,
  confidence_score numeric,
  evidence_count integer,
  selection_reason text
)
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $function$
declare
  v_tenant_id uuid;
  v_school_id uuid;
  v_country_code text;
begin
  if auth.uid() is null or not app.is_student_owner(p_student_id) then
    raise exception 'STUDENT_OWNERSHIP_REQUIRED' using errcode='42501';
  end if;
  if length(trim(coalesce(p_subject_code,'')))=0 or length(trim(coalesce(p_grade_code,'')))=0 then
    raise exception 'SUBJECT_AND_GRADE_REQUIRED';
  end if;

  select s.tenant_id,s.school_id,sc.country_code
    into v_tenant_id,v_school_id,v_country_code
  from public.students s
  join public.schools sc on sc.id=s.school_id and sc.tenant_id=s.tenant_id
  where s.id=p_student_id;
  if v_tenant_id is null or v_school_id is null then
    raise exception 'STUDENT_SCHOOL_CONTEXT_NOT_FOUND';
  end if;
  if not exists (
    select 1
    from public.student_enrollments en
    join public.classes cl on cl.id=en.class_id and cl.tenant_id=en.tenant_id and cl.school_id=en.school_id
    join public.grade_levels gl on gl.id=cl.grade_level_id and gl.tenant_id=cl.tenant_id and gl.school_id=cl.school_id
    join public.class_subjects cs on cs.class_id=cl.id and cs.tenant_id=cl.tenant_id and cs.school_id=cl.school_id
    join public.subjects sub on sub.id=cs.subject_id and sub.tenant_id=cs.tenant_id and sub.school_id=cs.school_id
    where en.student_id=p_student_id and en.status='active'
      and cl.status='active' and gl.status='active' and sub.status='active'
      and sub.code=p_subject_code and gl.code=p_grade_code
  ) then
    raise exception 'PRACTICE_TRACK_NOT_IN_ACTIVE_ENROLLMENT' using errcode='42501';
  end if;

  return query
  with mapped_questions as (
    select
      q.id as qid,q.question_text as qtext,q.choices as qchoices,q.question_type as qtype,
      q.language_code as qlanguage,q.difficulty as qdifficulty,q.unit_title as qunit,q.lesson_title as qlesson,
      c.id as cid,c.title as ctitle,m.relevance_weight,
      sm.mastery_score as mastery,sm.confidence_score as confidence,
      coalesce(sm.evidence_count,0)::integer as evidence,
      row_number() over (
        partition by q.id
        order by
          case when coalesce(sm.evidence_count,0)>=2 and coalesce(sm.mastery_score,1)<0.6 then 0
             when coalesce(sm.evidence_count,0)<2 then 1 else 2 end,
          sm.mastery_score asc nulls last,
          m.relevance_weight desc,
          c.concept_key
      ) as concept_rank
    from public.question_bank q
    join public.question_concept_mappings m on m.question_id=q.id and m.mapping_type='assesses'
    join public.curriculum_concepts c on c.id=m.concept_id and c.status='active'
    left join public.student_skill_mastery sm
      on sm.student_id=p_student_id and sm.concept_id=c.id
    where q.review_status='approved'
      and q.record_status='active'
      and q.subject_code=p_subject_code
      and q.grade_code=p_grade_code
      and c.country_code=v_country_code
      and c.subject_code=p_subject_code
      and c.grade_code=p_grade_code
      and (
        (q.sharing_scope='platform' and v_tenant_id is not null)
        or (q.sharing_scope='tenant' and q.tenant_id=v_tenant_id)
        or (q.sharing_scope='school' and q.tenant_id=v_tenant_id and q.school_id=v_school_id)
      )
      and q.question_type in ('multiple_choice','true_false','fill_blank')
      and exists (
        select 1 from public.question_bank_answers answer_key
        where answer_key.question_id=q.id
          and answer_key.answer_reveal_policy='after_submission'
      )
      and not exists (
        select 1 from public.student_question_exposures e
        where e.student_id=p_student_id and e.question_id=q.id
          and (e.assessment_id is not null or e.assignment_id is not null)
      )
  ),
  selected as (
    select * from mapped_questions
    where concept_rank=1
    order by
      case when evidence>=2 and coalesce(mastery,1)<0.6 then 0
           when evidence<2 then 1 else 2 end,
      mastery asc nulls last,
      qdifficulty asc,
      qid
    limit greatest(1,least(coalesce(p_limit,8),20))
  ),
  new_exposures as (
    insert into public.student_question_exposures as existing_exposure (
      tenant_id,school_id,student_id,question_id,exposure_status,
      first_delivered_at,first_rendered_at,last_event_at,display_count
    )
    select v_tenant_id,v_school_id,p_student_id,s.qid,'rendered',now(),now(),now(),1
    from selected s
    on conflict (student_id,question_id) do update
      set exposure_status='rendered',
          first_delivered_at=coalesce(existing_exposure.first_delivered_at,now()),
          first_rendered_at=coalesce(existing_exposure.first_rendered_at,now()),
          last_event_at=now(),
          display_count=existing_exposure.display_count+1,
          updated_at=now()
      where existing_exposure.assessment_id is null
        and existing_exposure.assignment_id is null
    returning id,question_id
  )
  select
    e.id,s.qid,s.qtext,
    case when jsonb_typeof(s.qchoices)='array' then
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',coalesce(choice->>'id',ord::text),
          'text',coalesce(choice->>'text',choice->>'label',choice->>'value',choice #>> '{}')
        ) order by ord)
        from jsonb_array_elements(s.qchoices) with ordinality as choice_rows(choice,ord)
      ),'[]'::jsonb)
    else '[]'::jsonb end,
    s.qtype,s.qlanguage,s.qdifficulty,s.qunit,s.qlesson,
    s.cid,s.ctitle,s.mastery,s.confidence,s.evidence,
    case when s.evidence>=2 and coalesce(s.mastery,1)<0.6 then 'measured_learning_gap'
         when s.evidence>=2 then 'measured_skill_review'
         else 'baseline_diagnostic' end
  from selected s
  join new_exposures e on e.question_id=s.qid
  order by
    case when s.evidence>=2 then 0 else 1 end,
    s.mastery asc nulls last,
    s.qdifficulty asc;
end;
$function$;

revoke all on function public.get_adaptive_practice_set(uuid,text,text,integer) from public,anon;
grant execute on function public.get_adaptive_practice_set(uuid,text,text,integer) to authenticated;

commit;
