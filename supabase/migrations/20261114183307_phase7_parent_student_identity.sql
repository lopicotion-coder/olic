begin;

create table public.parent_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(first_name)) between 1 and 120),
  check (length(trim(last_name)) between 1 and 120)
);
alter table public.parent_accounts enable row level security;
grant select, insert, update on public.parent_accounts to myschool_runtime;
create policy parent_accounts_self_read on public.parent_accounts for select to myschool_runtime
  using (user_id = auth.uid());
create policy parent_accounts_self_insert on public.parent_accounts for insert to myschool_runtime
  with check (user_id = auth.uid());
create policy parent_accounts_self_update on public.parent_accounts for update to myschool_runtime
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create sequence public.school_student_login_namespace_seq start 1;
alter table public.schools
  add column student_login_enabled boolean not null default false,
  add column student_login_namespace integer,
  add column student_login_next_number integer not null default 1,
  add column require_student_date_of_birth boolean not null default false,
  add column require_student_phone boolean not null default false,
  add column require_student_email boolean not null default false,
  add column require_student_national_id boolean not null default false,
  add column require_student_grade_level boolean not null default false;
update public.schools set student_login_namespace = nextval('public.school_student_login_namespace_seq')
where student_login_namespace is null;
alter table public.schools
  alter column student_login_namespace set default nextval('public.school_student_login_namespace_seq'),
  alter column student_login_namespace set not null;
create unique index schools_student_login_namespace_uidx on public.schools(student_login_namespace);
alter table public.schools add constraint schools_student_login_counter_positive check (student_login_next_number > 0);

alter table public.students
  add column student_username text,
  add column contact_email text,
  add column contact_phone text,
  add column national_id text;
create unique index students_student_username_ci_uidx
  on public.students(lower(student_username)) where student_username is not null;
create index students_parent_lookup_idx on public.students(tenant_id,school_id,profile_id) where profile_id is not null;

alter table public.student_enrollment_requests
  add column student_email text,
  add column student_phone text,
  add column national_id text,
  add column requested_grade_level_id uuid,
  add column relationship text not null default 'parent'
    check (relationship in ('father','mother','guardian','other'));
alter table public.student_enrollment_requests
  add constraint student_enrollment_requests_grade_level_fk
  foreign key (requested_grade_level_id) references public.grade_levels(id) on delete set null;

drop index if exists public.student_enrollment_requests_pending_user_idx;

create or replace function app.ensure_student_username(p_student_id uuid)
returns text
language plpgsql security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
declare v_student public.students%rowtype; v_namespace integer; v_number integer; v_username text;
begin
  select * into v_student from public.students where id=p_student_id for update;
  if not found then raise exception 'Student not found'; end if;
  if not exists(select 1 from public.schools where id=v_student.school_id and tenant_id=v_student.tenant_id and student_login_enabled) then
    return null;
  end if;
  if v_student.student_username is not null then return v_student.student_username; end if;
  update public.schools
    set student_login_next_number=student_login_next_number+1
    where id=v_student.school_id and tenant_id=v_student.tenant_id
    returning student_login_next_number-1,student_login_namespace into v_number,v_namespace;
  if v_number is null or v_number > 999999 then raise exception 'Student username sequence exhausted'; end if;
  v_username:=lpad(v_number::text,4,'0')||'-'||v_namespace::text;
  update public.students set student_username=v_username,updated_at=now() where id=p_student_id;
  return v_username;
end $$;
revoke all on function app.ensure_student_username(uuid) from public,anon,authenticated;
grant execute on function app.ensure_student_username(uuid) to myschool_runtime;

create or replace function app.configure_student_access(
  p_tenant_id uuid,p_school_id uuid,p_student_login_enabled boolean,
  p_require_student_date_of_birth boolean,p_require_student_phone boolean,
  p_require_student_email boolean,p_require_student_national_id boolean,p_require_student_grade_level boolean
) returns table(student_login_enabled boolean,student_login_namespace integer)
language plpgsql security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
declare v_school public.schools%rowtype; v_student record;
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
  if p_student_login_enabled then
    for v_student in select id from public.students where tenant_id=p_tenant_id and school_id=p_school_id and student_username is null order by created_at,id loop
      perform app.ensure_student_username(v_student.id);
    end loop;
  end if;
  return query select v_school.student_login_enabled,v_school.student_login_namespace;
end $$;
revoke all on function app.configure_student_access(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon,authenticated;
grant execute on function app.configure_student_access(uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean) to myschool_runtime;

create or replace function app.submit_parent_student_request(
  p_code_hash text,p_student_number text,p_first_name text,p_middle_name text,p_last_name text,
  p_date_of_birth date default null,p_student_email text default null,p_student_phone text default null,
  p_national_id text default null,p_grade_level_id uuid default null,p_relationship text default 'parent'
) returns table(request_id uuid,tenant_id uuid,school_id uuid,status text)
language plpgsql security definer
set search_path=pg_catalog,public,app,auth
set row_security=off
as $$
declare v_user uuid; v_code public.school_join_codes%rowtype; v_school public.schools%rowtype;
  v_number text; v_request uuid;
begin
  v_user:=auth.uid();
  if v_user is null or not exists(select 1 from public.parent_accounts where user_id=v_user) then
    raise exception 'Parent account required';
  end if;
  if p_relationship not in ('father','mother','guardian','other') then raise exception 'Invalid parent relationship'; end if;
  select * into v_code from public.school_join_codes where code_hash=p_code_hash and status='active' for share;
  if not found then raise exception 'School code is invalid or inactive'; end if;
  select * into v_school from public.schools where id=v_code.school_id and tenant_id=v_code.tenant_id and status='active';
  if not found then raise exception 'School is not accepting enrollment requests'; end if;
  if v_school.require_student_date_of_birth and p_date_of_birth is null then raise exception 'Date of birth is required by this school'; end if;
  if v_school.require_student_phone and nullif(trim(p_student_phone),'') is null then raise exception 'Student phone is required by this school'; end if;
  if (v_school.require_student_email or v_school.student_login_enabled) and nullif(trim(p_student_email),'') is null then raise exception 'Student email is required by this school'; end if;
  if v_school.require_student_national_id and nullif(trim(p_national_id),'') is null then raise exception 'National ID is required by this school'; end if;
  if v_school.require_student_grade_level and p_grade_level_id is null then raise exception 'Grade level is required by this school'; end if;
  if p_grade_level_id is not null and not exists (
    select 1 from public.grade_levels gl where gl.id=p_grade_level_id and gl.tenant_id=v_code.tenant_id and gl.school_id=v_code.school_id
  ) then raise exception 'Selected grade level is not part of this school'; end if;
  v_number:=nullif(trim(p_student_number),'');
  if v_number is null then v_number:='REQ-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)); end if;
  if exists(select 1 from public.students s where s.tenant_id=v_code.tenant_id and s.school_id=v_code.school_id and lower(s.student_number)=lower(v_number)) then
    raise exception 'A student record with this student number already exists. Use the individual import code instead.';
  end if;
  if exists(select 1 from public.student_enrollment_requests r where r.user_id=v_user and r.school_id=v_code.school_id
    and r.status='pending' and lower(r.first_name)=lower(trim(p_first_name))
    and lower(coalesce(r.middle_name,''))=lower(coalesce(nullif(trim(p_middle_name),''),''))
    and lower(r.last_name)=lower(trim(p_last_name)) and coalesce(r.date_of_birth,'0001-01-01'::date)=coalesce(p_date_of_birth,'0001-01-01'::date)) then
    raise exception 'A matching request for this child is already pending';
  end if;
  insert into public.profiles(id,email,display_name)
    select v_user,lower(u.email),pa.first_name||' '||pa.last_name
    from auth.users u join public.parent_accounts pa on pa.user_id=u.id where u.id=v_user
  on conflict(id) do nothing;
  insert into public.student_enrollment_requests(
    tenant_id,school_id,user_id,student_number,first_name,middle_name,last_name,date_of_birth,
    student_email,student_phone,national_id,requested_grade_level_id,relationship
  ) values (
    v_code.tenant_id,v_code.school_id,v_user,v_number,trim(p_first_name),nullif(trim(p_middle_name),''),trim(p_last_name),p_date_of_birth,
    nullif(lower(trim(p_student_email)),''),nullif(trim(p_student_phone),''),nullif(trim(p_national_id),''),p_grade_level_id,p_relationship
  ) returning id into v_request;
  insert into public.audit_logs(tenant_id,school_id,actor_user_id,action,entity_type,entity_id,after_data,metadata)
    values(v_code.tenant_id,v_code.school_id,v_user,'parent.student_enrollment.requested','student_enrollment_request',v_request,
      jsonb_build_object('studentNumber',v_number,'status','pending'),jsonb_build_object('schoolJoinCodeId',v_code.id,'parentUserId',v_user));
  return query select v_request,v_code.tenant_id,v_code.school_id,'pending'::text;
end $$;
revoke all on function app.submit_parent_student_request(text,text,text,text,text,date,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function app.submit_parent_student_request(text,text,text,text,text,date,text,text,text,uuid,text) to myschool_runtime;

create or replace function app.approve_parent_student_request(p_request_id uuid)
returns table(student_id uuid,student_number text,student_username text,parent_user_id uuid)
language plpgsql security definer
set search_path=pg_catalog,public,app,auth
set row_security=off
as $$
declare v_request public.student_enrollment_requests%rowtype; v_school public.schools%rowtype;
  v_parent public.parent_accounts%rowtype; v_student public.students%rowtype; v_guardian_id uuid; v_username text;
begin
  if auth.uid() is null then raise exception 'Authenticated school administrator required'; end if;
  select * into v_request from public.student_enrollment_requests where id=p_request_id and status='pending' for update;
  if not found then raise exception 'Pending parent enrollment request not found'; end if;
  if not app.has_permission('students.manage',v_request.tenant_id,v_request.school_id,null) then raise exception 'Not authorized to approve this request'; end if;
  select * into v_school from public.schools where id=v_request.school_id and tenant_id=v_request.tenant_id;
  if exists(select 1 from public.students s where s.school_id=v_request.school_id and lower(s.student_number)=lower(v_request.student_number)) then
    raise exception 'Student number already exists. Resolve the duplicate before approval.';
  end if;
  select * into v_parent from public.parent_accounts where user_id=v_request.user_id;
  if not found then raise exception 'Parent account no longer exists'; end if;
  insert into public.students(
    tenant_id,school_id,profile_id,student_number,first_name,middle_name,last_name,date_of_birth,contact_email,contact_phone,national_id
  ) values (
    v_request.tenant_id,v_request.school_id,null,v_request.student_number,v_request.first_name,v_request.middle_name,
    v_request.last_name,v_request.date_of_birth,v_request.student_email,v_request.student_phone,v_request.national_id
  ) returning * into v_student;
  if v_school.student_login_enabled then v_username:=app.ensure_student_username(v_student.id); end if;
  insert into public.guardians(tenant_id,school_id,profile_id,first_name,last_name,email,phone)
    values(v_request.tenant_id,v_request.school_id,v_request.user_id,v_parent.first_name,v_parent.last_name,
      (select email from public.profiles where id=v_request.user_id),v_parent.phone)
    on conflict(profile_id,school_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,
      email=coalesce(excluded.email,public.guardians.email),phone=coalesce(excluded.phone,public.guardians.phone)
    returning id into v_guardian_id;
  insert into public.student_guardians(tenant_id,school_id,student_id,guardian_id,relationship,is_primary,can_receive_notifications)
    values(v_request.tenant_id,v_request.school_id,v_student.id,v_guardian_id,v_request.relationship,true,true)
    on conflict(student_id,guardian_id) do update set relationship=excluded.relationship,is_primary=true,can_receive_notifications=true;
  insert into public.tenant_memberships(tenant_id,user_id,status,joined_at)
    values(v_request.tenant_id,v_request.user_id,'active',now())
    on conflict(tenant_id,user_id) do update set status='active',joined_at=coalesce(public.tenant_memberships.joined_at,now());
  insert into public.school_memberships(tenant_id,school_id,user_id,status)
    values(v_request.tenant_id,v_request.school_id,v_request.user_id,'active')
    on conflict(school_id,user_id) do update set status='active';
  insert into public.membership_roles(user_id,role_id,tenant_id,school_id,assigned_by)
    select v_request.user_id,r.id,v_request.tenant_id,v_request.school_id,auth.uid() from public.roles r where r.key='parent'
    on conflict do nothing;
  update public.student_enrollment_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),student_id=v_student.id
    where id=p_request_id;
  insert into public.audit_logs(tenant_id,school_id,actor_user_id,action,entity_type,entity_id,after_data,metadata)
    values(v_request.tenant_id,v_request.school_id,auth.uid(),'parent.student_enrollment.approved','student',v_student.id,
      jsonb_build_object('studentNumber',v_student.student_number,'studentUsername',v_username,'parentUserId',v_request.user_id),
      jsonb_build_object('requestId',p_request_id));
  return query select v_student.id,v_student.student_number,v_username,v_request.user_id;
end $$;
revoke all on function app.approve_parent_student_request(uuid) from public,anon,authenticated;
grant execute on function app.approve_parent_student_request(uuid) to myschool_runtime;

create or replace function app.claim_imported_student_for_parent(p_code_hash text,p_relationship text default 'parent')
returns table(student_id uuid,tenant_id uuid,school_id uuid,student_number text,student_username text)
language plpgsql security definer
set search_path=pg_catalog,public,app,auth
set row_security=off
as $$
declare v_user uuid; v_code public.student_activation_codes%rowtype; v_student public.students%rowtype;
  v_school public.schools%rowtype; v_parent public.parent_accounts%rowtype; v_guardian_id uuid; v_username text;
begin
  v_user:=auth.uid();
  if v_user is null or not exists(select 1 from public.parent_accounts where user_id=v_user) then raise exception 'Parent account required'; end if;
  if p_relationship not in ('father','mother','guardian','other') then raise exception 'Invalid relationship'; end if;
  select * into v_code from public.student_activation_codes
    where code_hash=p_code_hash and redeemed_at is null and revoked_at is null and expires_at>now() for update;
  if not found then raise exception 'Student activation code is invalid, expired or already used'; end if;
  select * into v_student from public.students where id=v_code.student_id and tenant_id=v_code.tenant_id and school_id=v_code.school_id for update;
  if not found or v_student.profile_id is not null or v_student.status<>'active' then raise exception 'Student record is unavailable or already linked'; end if;
  select * into v_school from public.schools where id=v_code.school_id and tenant_id=v_code.tenant_id;
  select * into v_parent from public.parent_accounts where user_id=v_user;
  insert into public.guardians(tenant_id,school_id,profile_id,first_name,last_name,email,phone)
    values(v_code.tenant_id,v_code.school_id,v_user,v_parent.first_name,v_parent.last_name,
      (select email from public.profiles where id=v_user),v_parent.phone)
    on conflict(profile_id,school_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,
      email=coalesce(excluded.email,public.guardians.email),phone=coalesce(excluded.phone,public.guardians.phone)
    returning id into v_guardian_id;
  insert into public.student_guardians(tenant_id,school_id,student_id,guardian_id,relationship,is_primary,can_receive_notifications)
    values(v_code.tenant_id,v_code.school_id,v_student.id,v_guardian_id,p_relationship,true,true)
    on conflict(student_id,guardian_id) do nothing;
  insert into public.tenant_memberships(tenant_id,user_id,status,joined_at) values(v_code.tenant_id,v_user,'active',now())
    on conflict(tenant_id,user_id) do update set status='active',joined_at=coalesce(public.tenant_memberships.joined_at,now());
  insert into public.school_memberships(tenant_id,school_id,user_id,status) values(v_code.tenant_id,v_code.school_id,v_user,'active')
    on conflict(school_id,user_id) do update set status='active';
  insert into public.membership_roles(user_id,role_id,tenant_id,school_id,assigned_by)
    select v_user,r.id,v_code.tenant_id,v_code.school_id,null from public.roles r where r.key='parent'
    on conflict do nothing;
  if v_school.student_login_enabled then v_username:=app.ensure_student_username(v_student.id); end if;
  update public.student_activation_codes set redeemed_at=now(),redeemed_by=v_user where id=v_code.id;
  insert into public.audit_logs(tenant_id,school_id,actor_user_id,action,entity_type,entity_id,after_data,metadata)
    values(v_code.tenant_id,v_code.school_id,v_user,'parent.student_import_code.claimed','student',v_student.id,
      jsonb_build_object('studentNumber',v_student.student_number,'studentUsername',v_username,'parentUserId',v_user),
      jsonb_build_object('activationCodeId',v_code.id));
  return query select v_student.id,v_code.tenant_id,v_code.school_id,v_student.student_number,v_username;
end $$;
revoke all on function app.claim_imported_student_for_parent(text,text) from public,anon,authenticated;
grant execute on function app.claim_imported_student_for_parent(text,text) to myschool_runtime;

create or replace function app.link_student_auth_account(p_student_id uuid,p_student_user_id uuid,p_student_email text)
returns table(student_id uuid,student_username text,user_id uuid)
language plpgsql security definer
set search_path=pg_catalog,public,app,auth
set row_security=off
as $$
declare v_student public.students%rowtype; v_enabled boolean;
begin
  if auth.uid() is null or not exists(
    select 1 from app.student_guardian_links l
    join app.user_membership_scopes ms on ms.user_id=l.guardian_user_id and ms.tenant_id=l.tenant_id
      and ms.school_id=l.school_id and ms.status='active'
    where l.student_id=p_student_id and l.guardian_user_id=auth.uid()
  ) then raise exception 'You are not authorized to manage this student account'; end if;
  select s.* into v_student from public.students s where s.id=p_student_id for update;
  if not found then raise exception 'Student not found'; end if;
  select sc.student_login_enabled into v_enabled from public.schools sc where sc.id=v_student.school_id and sc.tenant_id=v_student.tenant_id;
  if not coalesce(v_enabled,false) then raise exception 'Student login is disabled by the school'; end if;
  if v_student.profile_id is not null then raise exception 'Student login account already exists'; end if;
  if v_student.student_username is null then perform app.ensure_student_username(p_student_id); select * into v_student from public.students where id=p_student_id; end if;
  if not exists(select 1 from auth.users u where u.id=p_student_user_id and lower(u.email)=lower(p_student_email)) then raise exception 'Student Auth account does not match the supplied email'; end if;
  insert into public.profiles(id,email,display_name)
    values(p_student_user_id,lower(p_student_email),concat_ws(' ',v_student.first_name,v_student.middle_name,v_student.last_name))
    on conflict(id) do update set email=excluded.email,display_name=excluded.display_name,updated_at=now();
  update public.students set profile_id=p_student_user_id,contact_email=lower(p_student_email),updated_at=now() where id=p_student_id;
  insert into public.tenant_memberships(tenant_id,user_id,status,joined_at) values(v_student.tenant_id,p_student_user_id,'active',now())
    on conflict(tenant_id,user_id) do update set status='active',joined_at=coalesce(public.tenant_memberships.joined_at,now());
  insert into public.school_memberships(tenant_id,school_id,user_id,status) values(v_student.tenant_id,v_student.school_id,p_student_user_id,'active')
    on conflict(school_id,user_id) do update set status='active';
  insert into public.membership_roles(user_id,role_id,tenant_id,school_id,assigned_by)
    select p_student_user_id,r.id,v_student.tenant_id,v_student.school_id,auth.uid() from public.roles r where r.key='student'
    on conflict do nothing;
  insert into public.audit_logs(tenant_id,school_id,actor_user_id,action,entity_type,entity_id,after_data,metadata)
    values(v_student.tenant_id,v_student.school_id,auth.uid(),'parent.student_login.created','student',p_student_id,
      jsonb_build_object('studentUsername',v_student.student_username,'studentUserId',p_student_user_id),jsonb_build_object('parentUserId',auth.uid()));
  return query select p_student_id,v_student.student_username,p_student_user_id;
end $$;
revoke all on function app.link_student_auth_account(uuid,uuid,text) from public,anon,authenticated;
grant execute on function app.link_student_auth_account(uuid,uuid,text) to myschool_runtime;

create or replace function app.get_parent_linked_student_user(p_student_id uuid)
returns uuid
language sql stable security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
  select s.profile_id from public.students s
  where s.id=p_student_id and s.profile_id is not null
    and exists(select 1 from app.student_guardian_links l where l.student_id=s.id and l.guardian_user_id=auth.uid())
  limit 1
$$;
revoke all on function app.get_parent_linked_student_user(uuid) from public,anon,authenticated;
grant execute on function app.get_parent_linked_student_user(uuid) to myschool_runtime;

create or replace function app.resolve_student_login_email(p_username text)
returns text
language sql stable security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
  select p.email from public.students s
  join public.schools sc on sc.id=s.school_id and sc.tenant_id=s.tenant_id
  join public.profiles p on p.id=s.profile_id
  where lower(s.student_username)=lower(trim(p_username))
    and s.status='active' and sc.status='active' and sc.student_login_enabled
    and s.profile_id is not null and p.email is not null
  limit 1
$$;
revoke all on function app.resolve_student_login_email(text) from public,anon,authenticated;
grant execute on function app.resolve_student_login_email(text) to myschool_runtime;

commit;