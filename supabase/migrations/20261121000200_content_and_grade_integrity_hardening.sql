begin;

-- Learners may read school-wide published content only when class_id is NULL.
-- Class-scoped content requires access to that exact class through the existing
-- app.can_access_class helper. Preserve the existing explicitly-scoped
-- content.manage path and do not change the write policy.
drop policy if exists content_items_read on public.content_items;

create policy content_items_read
on public.content_items
as permissive
for select
to authenticated, myschool_runtime
using (
  (
    status = 'published'::public.content_status
    and (
      (
        class_id is null
        and app.can_access_school(tenant_id, school_id)
      )
      or
      (
        class_id is not null
        and app.can_access_class(class_id, tenant_id, school_id)
      )
    )
  )
  or app.has_permission('content.manage', tenant_id, school_id, class_id)
);

-- Enforce the assessment score ceiling in the database, not only in the UI.
-- The parent assessment row is locked so concurrent grade writes and max_score
-- updates serialize on the same row.
create or replace function app.enforce_grade_assessment_max_score()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_max_score numeric;
begin
  -- Both grade writes and assessment max-score updates take this same
  -- transaction-scoped advisory lock before checking the other table.
  -- The next SQL statement then sees a fresh READ COMMITTED snapshot.
  perform pg_advisory_xact_lock(hashtextextended(new.assessment_id::text, 20261121));

  select a.max_score
    into v_max_score
  from public.assessments as a
  where a.id = new.assessment_id
    and a.tenant_id = new.tenant_id
    and a.school_id = new.school_id;

  if not found then
    raise exception 'GRADE_ASSESSMENT_SCOPE_MISMATCH'
      using errcode = '23503';
  end if;

  if new.score < 0 or new.score > v_max_score then
    raise exception 'GRADE_SCORE_OUT_OF_RANGE'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function app.enforce_grade_assessment_max_score()
  from public, anon, authenticated;

drop trigger if exists grades_enforce_assessment_max_score on public.grades;

create trigger grades_enforce_assessment_max_score
before insert or update of assessment_id, tenant_id, school_id, score
on public.grades
for each row
execute function app.enforce_grade_assessment_max_score();

-- A later reduction of assessments.max_score must not invalidate grades
-- that have already been recorded. The assessment row is already locked by
-- PostgreSQL for this UPDATE; grade writes lock the same parent row above.
create or replace function app.prevent_assessment_max_score_below_existing_grades()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if new.max_score is distinct from old.max_score then
    perform pg_advisory_xact_lock(hashtextextended(new.id::text, 20261121));
  end if;

  if new.max_score is distinct from old.max_score
     and exists (
       select 1
       from public.grades as g
       where g.assessment_id = new.id
         and g.tenant_id = new.tenant_id
         and g.school_id = new.school_id
         and g.score > new.max_score
     )
  then
    raise exception 'ASSESSMENT_MAX_SCORE_BELOW_RECORDED_GRADE'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function app.prevent_assessment_max_score_below_existing_grades()
  from public, anon, authenticated;

drop trigger if exists assessments_preserve_grade_score_bounds on public.assessments;

create trigger assessments_preserve_grade_score_bounds
before update of max_score
on public.assessments
for each row
execute function app.prevent_assessment_max_score_below_existing_grades();

comment on function app.enforce_grade_assessment_max_score() is
  'Rejects grades outside the referenced assessment max_score while using a transaction advisory lock shared with assessment updates.';
comment on function app.prevent_assessment_max_score_below_existing_grades() is
  'Prevents reducing an assessment max_score below any existing recorded grade using a transaction advisory lock shared with grade writes.';

commit;
