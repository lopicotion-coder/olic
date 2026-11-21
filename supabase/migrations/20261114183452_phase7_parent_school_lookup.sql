begin;
create or replace function app.lookup_school_for_parent(p_code_hash text)
returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
declare v_user uuid; v_school public.schools%rowtype; v_grade_levels jsonb;
begin
  v_user:=auth.uid();
  if v_user is null or not exists(select 1 from public.parent_accounts where user_id=v_user) then
    raise exception 'Parent account required';
  end if;
  select s.* into v_school
  from public.school_join_codes c
  join public.schools s on s.id=c.school_id and s.tenant_id=c.tenant_id
  where c.code_hash=p_code_hash and c.status='active' and s.status='active'
  order by c.created_at desc limit 1;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',gl.id,'name',gl.name,'code',gl.code) order by gl.sort_order,gl.name),'[]'::jsonb)
    into v_grade_levels
    from public.grade_levels gl
    where gl.tenant_id=v_school.tenant_id and gl.school_id=v_school.id and gl.status='active';
  return jsonb_build_object(
    'schoolId',v_school.id,'schoolName',v_school.name,
    'studentLoginEnabled',v_school.student_login_enabled,
    'requireStudentDateOfBirth',v_school.require_student_date_of_birth,
    'requireStudentPhone',v_school.require_student_phone,
    'requireStudentEmail',v_school.require_student_email or v_school.student_login_enabled,
    'requireStudentNationalId',v_school.require_student_national_id,
    'requireStudentGradeLevel',v_school.require_student_grade_level,
    'gradeLevels',v_grade_levels
  );
end $$;
revoke all on function app.lookup_school_for_parent(text) from public,anon,authenticated;
grant execute on function app.lookup_school_for_parent(text) to myschool_runtime;
commit;