create or replace function app.notify_parent_enrollment_status()
returns trigger
language plpgsql security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
declare v_notification_id uuid; v_student_name text; v_title text; v_body text;
begin
  if old.status='pending' and new.status in ('approved','rejected') and new.user_id is not null then
    if auth.uid() is null or not app.has_permission('students.manage',new.tenant_id,new.school_id,null) then
      raise exception 'Not authorized to notify parent of enrollment decision';
    end if;
    v_student_name:=trim(concat_ws(' ',new.first_name,new.middle_name,new.last_name));
    if new.status='approved' then
      v_title:='Student enrollment approved';
      v_body:=v_student_name||' has been approved by the school. Open My Family to view the student profile and username.';
    else
      v_title:='Student enrollment update';
      v_body:='The school could not approve the enrollment request for '||v_student_name||'. Contact the school office for details.';
    end if;
    insert into public.notifications(tenant_id,school_id,recipient_user_id,sender_user_id,title,body,notification_type,metadata)
    values(new.tenant_id,new.school_id,new.user_id,auth.uid(),v_title,v_body,'alert',
      jsonb_build_object('requestId',new.id,'studentId',new.student_id,'status',new.status))
    returning id into v_notification_id;
    insert into public.notification_receipts(notification_id,tenant_id,school_id,user_id,delivered_at)
    values(v_notification_id,new.tenant_id,new.school_id,new.user_id,now());
  end if;
  return new;
end $$;
revoke all on function app.notify_parent_enrollment_status() from public,anon,authenticated;
drop trigger if exists student_enrollment_request_parent_notice on public.student_enrollment_requests;
create trigger student_enrollment_request_parent_notice
after update of status on public.student_enrollment_requests
for each row execute function app.notify_parent_enrollment_status();

create or replace function app.get_parent_portal_snapshot()
returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
declare
  v_user uuid;
  v_parent public.parent_accounts%rowtype;
  v_profile public.profiles%rowtype;
  v_children jsonb;
  v_requests jsonb;
  v_notifications jsonb;
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
    'studentNationalId',s.national_id,'studentStatus',s.status,
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
    'status',r.status,'createdAt',r.created_at,'studentId',r.student_id,
    'requestedGradeLevelId',r.requested_grade_level_id
  ) order by r.created_at desc),'[]'::jsonb)
  into v_requests
  from public.student_enrollment_requests r
  join public.schools sc on sc.id=r.school_id and sc.tenant_id=r.tenant_id
  where r.user_id=v_user;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'title',q.title,'body',q.body,'notificationType',q.notification_type,
    'createdAt',q.created_at,'readAt',q.read_at
  ) order by q.created_at desc),'[]'::jsonb)
  into v_notifications
  from (
    select n.id,n.title,n.body,n.notification_type,n.created_at,nr.read_at
    from public.notifications n
    left join public.notification_receipts nr on nr.notification_id=n.id and nr.user_id=v_user
    where n.recipient_user_id=v_user
    order by n.created_at desc limit 20
  ) q;

  return jsonb_build_object(
    'isParent',true,
    'profile',jsonb_build_object('firstName',v_parent.first_name,'lastName',v_parent.last_name,
      'phone',v_parent.phone,'email',v_profile.email,'displayName',v_profile.display_name),
    'children',coalesce(v_children,'[]'::jsonb),
    'requests',coalesce(v_requests,'[]'::jsonb),
    'notifications',coalesce(v_notifications,'[]'::jsonb)
  );
end $$;
revoke all on function app.get_parent_portal_snapshot() from public,anon,authenticated;
grant execute on function app.get_parent_portal_snapshot() to myschool_runtime;