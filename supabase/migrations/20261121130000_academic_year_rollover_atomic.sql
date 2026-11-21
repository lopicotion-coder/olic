begin;

-- School year rollover must be a single audited transaction. Direct browser
-- writes cannot change status/is_current; the narrowly scoped RPC below is the
-- only authenticated path that can promote a year and close its predecessor.
revoke insert, update on public.academic_years from public, anon, authenticated, myschool_runtime;

grant insert (tenant_id, school_id, name, starts_on, ends_on, status)
  on public.academic_years to authenticated, myschool_runtime;

grant update (name, starts_on, ends_on)
  on public.academic_years to authenticated, myschool_runtime;

create or replace function public.rollover_academic_year(
  p_tenant_id uuid,
  p_school_id uuid,
  p_target_academic_year_id uuid,
  p_expected_current_academic_year_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $function$
declare
  v_actor uuid := auth.uid();
  v_current public.academic_years%rowtype;
  v_target public.academic_years%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null then
    raise exception 'Authentication required'
      using errcode = '28000';
  end if;

  if p_tenant_id is null or p_school_id is null or p_target_academic_year_id is null then
    raise exception 'Tenant, school and target academic year are required'
      using errcode = '22023';
  end if;

  if not app.has_permission('academics.manage', p_tenant_id, p_school_id, null) then
    raise exception 'ACADEMIC_YEAR_MANAGE_PERMISSION_REQUIRED'
      using errcode = '42501';
  end if;

  -- Serialize all rollovers in a school. The optimistic expected-current
  -- argument prevents a stale browser from replacing a newer current year.
  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || p_school_id::text, 20261121)
  );

  select ay.*
    into v_target
  from public.academic_years ay
  where ay.id = p_target_academic_year_id
    and ay.tenant_id = p_tenant_id
    and ay.school_id = p_school_id
  for update;

  if not found then
    raise exception 'ACADEMIC_YEAR_TARGET_SCOPE_MISMATCH'
      using errcode = '23503';
  end if;

  if v_target.is_current then
    if v_target.status <> 'active' then
      raise exception 'ACADEMIC_YEAR_CURRENT_STATUS_INVALID'
        using errcode = '23514';
    end if;

    return jsonb_build_object(
      'success', true,
      'changed', false,
      'current_academic_year_id', v_target.id,
      'previous_academic_year_id', v_target.id
    );
  end if;

  if v_target.status not in ('planned', 'active') then
    raise exception 'ACADEMIC_YEAR_TARGET_NOT_ACTIVATABLE'
      using errcode = '23514';
  end if;

  select ay.*
    into v_current
  from public.academic_years ay
  where ay.tenant_id = p_tenant_id
    and ay.school_id = p_school_id
    and ay.is_current = true
  for update;

  if v_current.id is distinct from p_expected_current_academic_year_id then
    raise exception 'ACADEMIC_YEAR_CURRENT_CHANGED'
      using errcode = 'P0001';
  end if;

  v_before := case
    when v_current.id is null then null
    else jsonb_build_object(
      'id', v_current.id,
      'name', v_current.name,
      'status', v_current.status,
      'is_current', v_current.is_current
    )
  end;

  if v_current.id is not null then
    update public.academic_years
    set status = 'completed',
        is_current = false,
        updated_at = now()
    where id = v_current.id
      and tenant_id = p_tenant_id
      and school_id = p_school_id;
  end if;

  update public.academic_years
  set status = 'active',
      is_current = true,
      updated_at = now()
  where id = v_target.id
    and tenant_id = p_tenant_id
    and school_id = p_school_id;

  v_after := jsonb_build_object(
    'id', v_target.id,
    'name', v_target.name,
    'status', 'active',
    'is_current', true
  );

  insert into public.audit_logs (
    tenant_id,
    school_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    metadata
  )
  values (
    p_tenant_id,
    p_school_id,
    v_actor,
    'academic_year.rollover',
    'academic_year',
    v_target.id,
    v_before,
    v_after,
    jsonb_build_object(
      'previous_academic_year_id', v_current.id,
      'target_academic_year_id', v_target.id
    )
  );

  return jsonb_build_object(
    'success', true,
    'changed', true,
    'current_academic_year_id', v_target.id,
    'previous_academic_year_id', v_current.id
  );
end;
$function$;

revoke all on function public.rollover_academic_year(uuid, uuid, uuid, uuid)
  from public, anon;

grant execute on function public.rollover_academic_year(uuid, uuid, uuid, uuid)
  to authenticated, myschool_runtime;

comment on function public.rollover_academic_year(uuid, uuid, uuid, uuid) is
  'Atomically activates one academic year, completes its predecessor, enforces optimistic concurrency and writes an audit event. Requires academics.manage.';

commit;
