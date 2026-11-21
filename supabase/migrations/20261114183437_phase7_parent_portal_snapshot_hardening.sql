begin;
create or replace function app.get_parent_portal_snapshot()
returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
declare v_user uuid; v_parent public.parent_accounts%rowtype; v_profile public.profiles%rowtype;
  v_children jsonb; v_requests jsonb;
begin
  v_user:=auth.uid();
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_parent from public.parent_accounts where user_id=v_user;
  if not found then return jsonb_build_object('isParent',false); end if;
  select * into v_profile from public.profiles where id=v_user;
  select coalesce(jsonb_agg(jsonb_build_object(
    'studentId',s.id,'studentNumber',s.student_number,'studentUsername',s.student_username,
    'firstName',s.first_name,'middleName',s.middle_name,'lastName',s.last_name,
    'dateOfBirth',s.date_of_birth,'studentEmail',s.contact_email,'studentPhone',s.contact_phone,
    'schoolId',sc.id,'schoolName',sc.name,'tenantId',sc.tenant_id,
    'studentLoginEnabled',sc.student_login_enabled,'studentAccountActive',(s.profile_id is not null),
    'className',cl.class_name
  ) order by sc.name,s.last_name,s.first_name),'[]'::jsonb)
  into v_children
  from public.student_guardians sg
  join public.guardians g on g.id=sg.guardian_id and g.tenant_id=sg.tenant_id and g.school_id=sg.school_id
  join public.students s on s.id=sg.student_id and s.tenant_id=sg.tenant_id and s.school_id=sg.school_id
  join public.schools sc on sc.id=s.school_id and sc.tenant_id=s.tenant_id
  join app.user_membership_scopes ms on ms.user_id=v_user and ms.tenant_id=sg.tenant_id
    and ms.school_id=sg.school_id and ms.status='active'
  left join lateral (
    select c.name as class_name from public.student_enrollments e
    join public.classes c on c.id=e.class_id and c.tenant_id=e.tenant_id and c.school_id=e.school_id
    where e.student_id=s.id and e.tenant_id=s.tenant_id and e.school_id=s.school_id and e.status='active'
    order by e.enrolled_on desc limit 1
  ) cl on true
  where g.profile_id=v_user and g.status='active';
  select coalesce(jsonb_agg(jsonb_build_object(
    'requestId',r.id,'schoolId',r.school_id,'schoolName',sc.name,
    'studentNumber',r.student_number,'firstName',r.first_name,'middleName',r.middle_name,'lastName',r.last_name,
    'dateOfBirth',r.date_of_birth,'studentEmail',r.student_email,'studentPhone',r.student_phone,
    'status',r.status,'createdAt',r.created_at,'studentId',r.student_id
  ) order by r.created_at desc),'[]'::jsonb)
  into v_requests
  from public.student_enrollment_requests r
  join public.schools sc on sc.id=r.school_id and sc.tenant_id=r.tenant_id
  where r.user_id=v_user;
  return jsonb_build_object(
    'isParent',true,
    'profile',jsonb_build_object('firstName',v_parent.first_name,'lastName',v_parent.last_name,
      'phone',v_parent.phone,'email',v_profile.email,'displayName',v_profile.display_name),
    'children',coalesce(v_children,'[]'::jsonb),
    'requests',coalesce(v_requests,'[]'::jsonb)
  );
end $$;
revoke all on function app.get_parent_portal_snapshot() from public,anon,authenticated;
grant execute on function app.get_parent_portal_snapshot() to myschool_runtime;

create or replace function app.audit_parent_student_password_reset(p_student_id uuid,p_student_user_id uuid)
returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
declare v_student public.students%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select s.* into v_student
  from public.students s
  where s.id=p_student_id and s.profile_id=p_student_user_id
    and exists(
      select 1 from app.student_guardian_links l
      join app.user_membership_scopes ms on ms.user_id=l.guardian_user_id and ms.tenant_id=l.tenant_id
        and ms.school_id=l.school_id and ms.status='active'
      where l.student_id=s.id and l.guardian_user_id=auth.uid()
    );
  if not found then raise exception 'You are not authorized to reset this student password'; end if;
  insert into public.audit_logs(tenant_id,school_id,actor_user_id,action,entity_type,entity_id,after_data,metadata)
  values(v_student.tenant_id,v_student.school_id,auth.uid(),'parent.student_password.reset','student',v_student.id,
    jsonb_build_object('studentUserId',p_student_user_id),jsonb_build_object('parentUserId',auth.uid()));
  return true;
end $$;
revoke all on function app.audit_parent_student_password_reset(uuid,uuid) from public,anon,authenticated;
grant execute on function app.audit_parent_student_password_reset(uuid,uuid) to myschool_runtime;
commit;