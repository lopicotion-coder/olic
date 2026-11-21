create or replace function app.configure_student_access(
  p_tenant_id uuid,p_school_id uuid,p_student_login_enabled boolean,
  p_require_student_date_of_birth boolean,p_require_student_phone boolean,
  p_require_student_email boolean,p_require_student_national_id boolean,p_require_student_grade_level boolean
) returns table(student_login_enabled boolean,student_login_namespace integer)
language plpgsql security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
declare v_school public.schools%rowtype; v_student record; v_student_role uuid;
begin
  if auth.uid() is null or not app.has_permission('students.manage',p_tenant_id,p_school_id,null) then
    raise exception 'Not authorized to configure student access';
  end if;
  update public.schools set
    student_login_enabled=p_student_login_enabled,
    require_student_date_of_birth=p_require_student_date_of_birth,
    require_student_phone=p_require_student_phone,
    require_student_email=p_require_student_email,
    require_student_national_id=p_require_student_national_id,
    require_student_grade_level=p_require_student_grade_level,
    updated_at=now()
  where id=p_school_id and tenant_id=p_tenant_id
  returning * into v_school;
  if not found then raise exception 'School not found'; end if;
  select id into v_student_role from public.roles where key='student';
  if p_student_login_enabled then
    for v_student in
      select id,profile_id from public.students
      where tenant_id=p_tenant_id and school_id=p_school_id and status='active'
      order by created_at,id
    loop
      perform app.ensure_student_username(v_student.id);
      if v_student.profile_id is not null then
        insert into public.tenant_memberships(tenant_id,user_id,status,joined_at)
          values(p_tenant_id,v_student.profile_id,'active',now())
          on conflict(tenant_id,user_id) do update set status='active',joined_at=coalesce(public.tenant_memberships.joined_at,now());
        insert into public.school_memberships(tenant_id,school_id,user_id,status)
          values(p_tenant_id,p_school_id,v_student.profile_id,'active')
          on conflict(school_id,user_id) do update set status='active';
        if v_student_role is not null then
          insert into public.membership_roles(user_id,role_id,tenant_id,school_id,assigned_by)
            values(v_student.profile_id,v_student_role,p_tenant_id,p_school_id,auth.uid())
            on conflict do nothing;
        end if;
      end if;
    end loop;
  else
    delete from public.membership_roles mr
    using public.roles r,public.students s
    where mr.role_id=r.id and r.key='student'
      and s.tenant_id=p_tenant_id and s.school_id=p_school_id and s.profile_id=mr.user_id;
  end if;
  return query select v_school.student_login_enabled,v_school.student_login_namespace;
end $$;
revoke all on function app.configure_student_access(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function app.configure_student_access(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean) to myschool_runtime;