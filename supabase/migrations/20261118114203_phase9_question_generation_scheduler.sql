
alter table public.question_generation_schedules
  alter column local_run_time set default time '02:00',
  alter column local_run_time set not null;

alter table public.question_generation_schedules
  add constraint question_generation_schedules_calendar_config_check
  check (
    (frequency = 'daily' and local_run_time is not null)
    or (frequency = 'weekly' and local_run_time is not null and cardinality(days_of_week) > 0)
    or (frequency = 'monthly' and local_run_time is not null and day_of_month is not null)
    or (frequency = 'interval')
  );

alter table public.question_generation_schedules
  add constraint question_generation_schedules_question_types_check
  check (question_types <@ array[
    'multiple_choice','true_false','short_answer','essay','fill_blank','matching','ordering'
  ]::text[]);

alter table public.question_generation_batches
  add constraint question_generation_batches_question_types_check
  check (question_types <@ array[
    'multiple_choice','true_false','short_answer','essay','fill_blank','matching','ordering'
  ]::text[]);

create or replace function app.enqueue_due_question_generation_schedules(
  p_limit integer default 100
)
returns integer
language plpgsql
security invoker
set search_path = public, app, pg_temp
as $$
declare
  s public.question_generation_schedules%rowtype;
  local_now timestamp without time zone;
  next_run timestamptz;
  inventory_count integer;
  missing_count integer;
  batch_uuid uuid;
  scheduled_for timestamptz;
  processed_count integer := 0;
begin
  if p_limit < 1 or p_limit > 500 then
    raise exception 'p_limit must be between 1 and 500';
  end if;

  for s in
    select *
      from public.question_generation_schedules
     where is_enabled = true
       and next_run_at is not null
       and next_run_at <= now()
     order by next_run_at, id
     for update skip locked
     limit p_limit
  loop
    scheduled_for := s.next_run_at;
    local_now := now() at time zone s.timezone;

    -- A schedule is eligible only when the exact curriculum edition is ready
    -- and its current rights permit question generation.
    if not exists (
      select 1
        from public.curriculum_source_versions cv
        join public.curriculum_sources cs on cs.id = cv.source_id
       where cv.id = s.source_version_id
         and cv.ingestion_status = 'ready'
         and cs.status = 'active'
         and cs.rights_status = 'approved'
         and 'question_generation' = any(cs.permitted_uses)
         and cs.subject_code = s.subject_code
         and cs.grade_code = s.grade_code
         and (
           (s.school_id is null and cs.sharing_scope in ('platform','tenant')
             and (cs.sharing_scope = 'platform' or cs.tenant_id = s.tenant_id))
           or
           (s.school_id is not null and (
             cs.sharing_scope = 'platform'
             or (cs.sharing_scope = 'tenant' and cs.tenant_id = s.tenant_id)
             or (cs.sharing_scope = 'school' and cs.tenant_id = s.tenant_id and cs.school_id = s.school_id)
           ))
         )
    ) then
      -- Leave the schedule due. It will be retried after ingestion/rights are fixed.
      continue;
    end if;

    select count(distinct q.id)::integer
      into inventory_count
      from public.question_bank q
      join public.question_sources qs on qs.question_id = q.id
      join public.curriculum_chunks cc on cc.id = qs.chunk_id
     where cc.source_version_id = s.source_version_id
       and q.subject_code = s.subject_code
       and q.grade_code = s.grade_code
       and q.review_status = 'approved'
       and q.record_status = 'active'
       and q.sharing_scope = case when s.school_id is null then 'tenant' else 'school' end
       and q.tenant_id = s.tenant_id
       and q.school_id is not distinct from s.school_id;

    if inventory_count <= s.low_watermark then
      missing_count := greatest(s.target_question_count - inventory_count, 0);

      if missing_count > 0 then
        insert into public.question_generation_batches (
          sharing_scope, tenant_id, school_id, source_version_id,
          subject_code, grade_code, unit_title, lesson_title,
          question_types, requested_count, batch_status, requested_by
        )
        values (
          case when s.school_id is null then 'tenant' else 'school' end,
          s.tenant_id, s.school_id, s.source_version_id,
          s.subject_code, s.grade_code, s.unit_title, s.lesson_title,
          s.question_types, missing_count, 'queued', s.created_by
        )
        returning id into batch_uuid;

        insert into public.question_generation_jobs (
          batch_id, schedule_id, source_version_id,
          job_type, job_status, idempotency_key, payload
        )
        values (
          batch_uuid,
          s.id,
          s.source_version_id,
          'generate_questions',
          'queued',
          'question-generation:' || s.id::text || ':' ||
            to_char(scheduled_for at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
          jsonb_build_object(
            'subject_code', s.subject_code,
            'grade_code', s.grade_code,
            'unit_title', s.unit_title,
            'lesson_title', s.lesson_title,
            'question_types', s.question_types,
            'requested_count', missing_count,
            'source_version_id', s.source_version_id
          )
        )
        on conflict (idempotency_key) do nothing;
        processed_count := processed_count + 1;
      end if;
    end if;

    -- Advance the local schedule after each successful check.
    if s.frequency = 'interval' then
      next_run := now() + make_interval(mins => s.interval_minutes);
    elsif s.frequency = 'daily' then
      next_run := ((local_now::date + 1) + s.local_run_time) at time zone s.timezone;
    elsif s.frequency = 'weekly' then
      select ((g.run_day::date + s.local_run_time) at time zone s.timezone)
        into next_run
        from generate_series(
          (local_now::date + 1)::timestamp,
          (local_now::date + 7)::timestamp,
          interval '1 day'
        ) as g(run_day)
       where extract(dow from g.run_day)::smallint = any(s.days_of_week)
       order by g.run_day
       limit 1;
    elsif s.frequency = 'monthly' then
      select (
        make_date(
          extract(year from (date_trunc('month', local_now) + make_interval(months => m.month_offset)))::integer,
          extract(month from (date_trunc('month', local_now) + make_interval(months => m.month_offset)))::integer,
          s.day_of_month
        ) + s.local_run_time
      ) at time zone s.timezone
        into next_run
        from generate_series(0, 1) as m(month_offset)
       where (
        make_date(
          extract(year from (date_trunc('month', local_now) + make_interval(months => m.month_offset)))::integer,
          extract(month from (date_trunc('month', local_now) + make_interval(months => m.month_offset)))::integer,
          s.day_of_month
        ) + s.local_run_time
       ) at time zone s.timezone > now()
       order by m.month_offset
       limit 1;
    end if;

    update public.question_generation_schedules
       set last_run_at = now(),
           next_run_at = next_run,
           updated_at = now()
     where id = s.id;

    processed_count := processed_count + 0;
  end loop;

  return processed_count;
end;
$$;

revoke all on function app.enqueue_due_question_generation_schedules(integer)
  from public, anon, authenticated, myschool_runtime, service_role;
grant execute on function app.enqueue_due_question_generation_schedules(integer)
  to postgres;

select cron.schedule(
  'myschool-question-generation-scheduler',
  '* * * * *',
  'select app.enqueue_due_question_generation_schedules(100);'
);
