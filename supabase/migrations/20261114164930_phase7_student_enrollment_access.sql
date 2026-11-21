begin;

create table public.school_join_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  code_hash text not null unique,
  code_hint text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  foreign key (school_id,tenant_id) references public.schools(id,tenant_id) on delete restrict,
  check (length(code_hash)=64 and code_hash ~ '^[0-9a-f]{64}$'),
  check (length(code_hint) between 4 and 8)
);
create unique index school_join_codes_one_active_idx on public.school_join_codes(school_id) where status='active';
create index school_join_codes_lookup_idx on public.school_join_codes(code_hash,status);

create table public.student_activation_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  import_batch_id uuid references public.school_import_batches(id) on delete set null,
  code_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '90 days'),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (student_id,tenant_id,school_id) references public.students(id,tenant_id,school_id) on delete cascade,
  check (length(code_hash)=64 and code_hash ~ '^[0-9a-f]{64}$'),
  check ((redeemed_at is null and redeemed_by is null) or (redeemed_at is not null and redeemed_by is not null))
);
create unique index student_activation_codes_one_open_idx on public.student_activation_codes(student_id)
  where redeemed_at is null and revoked_at is null;
create index student_activation_codes_school_idx on public.student_activation_codes(tenant_id,school_id,created_at desc);

create table public.student_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  student_number text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  student_id uuid,
  created_at timestamptz not null default now(),
  foreign key (school_id,tenant_id) references public.schools(id,tenant_id) on delete restrict,
  foreign key (student_id,tenant_id,school_id) references public.students(id,tenant_id,school_id) on delete restrict,
  unique (id,tenant_id,school_id),
  check (length(trim(student_number)) between 1 and 80),
  check (length(trim(first_name)) between 1 and 120),
  check (length(trim(last_name)) between 1 and 120),
  check ((status='pending' and reviewed_by is null and reviewed_at is null and student_id is null)
      or (status='approved' and reviewed_by is not null and reviewed_at is not null and student_id is not null)
      or (status='rejected' and reviewed_by is not null and reviewed_at is not null and student_id is null))
);
create unique index student_enrollment_requests_pending_user_idx on public.student_enrollment_requests(user_id,school_id) where status='pending';
create unique index student_enrollment_requests_pending_number_idx on public.student_enrollment_requests(school_id,lower(student_number)) where status='pending';
create index student_enrollment_requests_admin_idx on public.student_enrollment_requests(tenant_id,school_id,status,created_at desc);

create table public.student_password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  issued_by uuid not null references auth.users(id) on delete restrict,
  code_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  reserved_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (student_id,tenant_id,school_id) references public.students(id,tenant_id,school_id) on delete cascade,
  check (length(code_hash)=64 and code_hash ~ '^[0-9a-f]{64}$')
);
create index student_password_reset_codes_user_idx on public.student_password_reset_codes(user_id,created_at desc);

insert into public.permissions(key,description) values
 ('students.password_reset.issue','Issue a one-time student password recovery code within the permitted class/school scope')
on conflict (key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('tenant_owner','school_owner','school_admin','teacher') and p.key='students.password_reset.issue'
on conflict do nothing;

alter table public.school_join_codes enable row level security;
alter table public.student_activation_codes enable row level security;
alter table public.student_enrollment_requests enable row level security;
alter table public.student_password_reset_codes enable row level security;

grant select,insert,update,delete on public.school_join_codes to myschool_runtime;
grant select,insert,update,delete on public.student_activation_codes to myschool_runtime;
grant select,insert,update,delete on public.student_enrollment_requests to myschool_runtime;
grant select,insert,update,delete on public.student_password_reset_codes to myschool_runtime;

create policy school_join_codes_admin on public.school_join_codes for all to myschool_runtime
  using (app.has_permission('students.manage',tenant_id,school_id,null))
  with check (app.has_permission('students.manage',tenant_id,school_id,null));
create policy student_activation_codes_admin on public.student_activation_codes for all to myschool_runtime
  using (app.has_permission('imports.manage',tenant_id,school_id,null) or app.has_permission('students.manage',tenant_id,school_id,null))
  with check (app.has_permission('imports.manage',tenant_id,school_id,null) or app.has_permission('students.manage',tenant_id,school_id,null));
create policy student_enrollment_requests_read on public.student_enrollment_requests for select to myschool_runtime
  using (user_id=auth.uid() or app.has_permission('students.manage',tenant_id,school_id,null));
create policy student_enrollment_requests_admin_update on public.student_enrollment_requests for update to myschool_runtime
  using (app.has_permission('students.manage',tenant_id,school_id,null))
  with check (app.has_permission('students.manage',tenant_id,school_id,null));
create policy student_password_reset_codes_issuer_read on public.student_password_reset_codes for select to myschool_runtime
  using (issued_by=auth.uid() or app.has_permission('students.manage',tenant_id,school_id,null));
create policy student_password_reset_codes_issue on public.student_password_reset_codes for insert to myschool_runtime
  with check (
    issued_by=auth.uid() and exists (
      select 1 from public.student_enrollments e
      where e.student_id=student_password_reset_codes.student_id
        and e.tenant_id=student_password_reset_codes.tenant_id
        and e.school_id=student_password_reset_codes.school_id
        and e.status='active'
        and app.has_permission('students.password_reset.issue',e.tenant_id,e.school_id,e.class_id)
    )
  );

create or replace function app.validate_student_activation_code(p_code_hash text)
returns table(tenant_id uuid,school_id uuid,student_id uuid,student_number text,first_name text,last_name text)
language sql stable security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
  select c.tenant_id,c.school_id,c.student_id,s.student_number,s.first_name,s.last_name
  from public.student_activation_codes c
  join public.students s on s.id=c.student_id and s.tenant_id=c.tenant_id and s.school_id=c.school_id
  where c.code_hash=p_code_hash and c.redeemed_at is null and c.revoked_at is null and c.expires_at>now()
    and s.profile_id is null and s.status='active'
  limit 1
$$;
revoke all on function app.validate_student_activation_code(text) from public,anon,authenticated;
grant execute on function app.validate_student_activation_code(text) to myschool_runtime;

create or replace function app.claim_student_activation_code(p_code_hash text)
returns table(tenant_id uuid,school_id uuid,student_id uuid,status text)
language plpgsql security definer
set search_path=pg_catalog,public,app,auth
set row_security=off
as $$
declare v_code public.student_activation_codes%rowtype; v_student public.students%rowtype; v_user uuid;
begin
  v_user:=auth.uid();
  if v_user is null then raise exception 'Authenticated account required'; end if;
  select * into v_code from public.student_activation_codes
    where code_hash=p_code_hash and redeemed_at is null and revoked_at is null and expires_at>now()
    for update;
  if not found then raise exception 'Student access code is invalid, expired or already used'; end if;
  select * into v_student from public.students where id=v_code.student_id and tenant_id=v_code.tenant_id and school_id=v_code.school_id for update;
  if not found or v_student.status<>'active' then raise exception 'Student record is not active'; end if;
  if v_student.profile_id is not null and v_student.profile_id<>v_user then raise exception 'Student record is already linked to another account'; end if;
  insert into public.profiles(id,email,display_name)
    select v_user,lower(u.email),trim(concat_ws(' ',v_student.first_name,v_student.middle_name,v_student.last_name))
    from auth.users u where u.id=v_user
  on conflict (id) do update set email=coalesce(excluded.email,public.profiles.email),display_name=coalesce(public.profiles.display_name,excluded.display_name),updated_at=now();
  update public.students set profile_id=v_user,updated_at=now() where id=v_student.id;
  insert into public.tenant_memberships(tenant_id,user_id,status,joined_at)
    values (v_code.tenant_id,v_user,'active',now()) on conflict (tenant_id,user_id) do update set status='active',joined_at=coalesce(public.tenant_memberships.joined_at,now());
  insert into public.school_memberships(tenant_id,school_id,user_id,status)
    values (v_code.tenant_id,v_code.school_id,v_user,'active') on conflict (school_id,user_id) do update set status='active';
  insert into public.membership_roles(user_id,role_id,tenant_id,school_id,assigned_by)
    select v_user,r.id,v_code.tenant_id,v_code.school_id,null from public.roles r where r.key='student'
  on conflict do nothing;
  update public.student_activation_codes set redeemed_at=now(),redeemed_by=v_user where id=v_code.id;
  insert into public.audit_logs(tenant_id,school_id,actor_user_id,action,entity_type,entity_id,after_data,metadata)
    values (v_code.tenant_id,v_code.school_id,v_user,'student.activation_code.redeemed','student',v_student.id,
      jsonb_build_object('studentNumber',v_student.student_number,'accountLinked',true),jsonb_build_object('activationCodeId',v_code.id));
  return query select v_code.tenant_id,v_code.school_id,v_student.id,'active'::text;
end $$;
revoke all on function app.claim_student_activation_code(text) from public,anon,authenticated;
grant execute on function app.claim_student_activation_code(text) to myschool_runtime;

create or replace function app.validate_school_join_code(p_code_hash text)
returns table(tenant_id uuid,school_id uuid,school_name text)
language sql stable security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
  select c.tenant_id,c.school_id,s.name
  from public.school_join_codes c
  join public.schools s on s.id=c.school_id and s.tenant_id=c.tenant_id
  where c.code_hash=p_code_hash and c.status='active' and s.status='active'
  limit 1
$$;
revoke all on function app.validate_school_join_code(text) from public,anon,authenticated;
grant execute on function app.validate_school_join_code(text) to myschool_runtime;

create or replace function app.submit_student_enrollment_request(
  p_code_hash text,p_student_number text,p_first_name text,p_middle_name text,p_last_name text,p_date_of_birth date default null
) returns table(request_id uuid,tenant_id uuid,school_id uuid,status text)
language plpgsql security definer
set search_path=pg_catalog,public,app,auth
set row_security=off
as $$
declare v_code public.school_join_codes%rowtype; v_user uuid; v_request uuid;
begin
  v_user:=auth.uid();
  if v_user is null then raise exception 'Authenticated account required'; end if;
  select * into v_code from public.school_join_codes where code_hash=p_code_hash and status='active' for share;
  if not found then raise exception 'School code is invalid or inactive'; end if;
  if exists(select 1 from public.school_memberships sm where sm.school_id=v_code.school_id and sm.user_id=v_user and sm.status in ('active','invited')) then
    raise exception 'This account already has a membership in the school';
  end if;
  if exists(select 1 from public.students s where s.school_id=v_code.school_id and lower(s.student_number)=lower(trim(p_student_number))) then
    raise exception 'Student number already exists; ask the school to issue an individual access code';
  end if;
  insert into public.profiles(id,email,display_name)
    select v_user,lower(u.email),trim(concat_ws(' ',p_first_name,p_middle_name,p_last_name)) from auth.users u where u.id=v_user
  on conflict (id) do update set email=coalesce(excluded.email,public.profiles.email),display_name=coalesce(excluded.display_name,public.profiles.display_name),updated_at=now();
  insert into public.student_enrollment_requests(tenant_id,school_id,user_id,student_number,first_name,middle_name,last_name,date_of_birth)
    values(v_code.tenant_id,v_code.school_id,v_user,trim(p_student_number),trim(p_first_name),nullif(trim(p_middle_name),''),trim(p_last_name),p_date_of_birth)
    returning id into v_request;
  insert into public.audit_logs(tenant_id,school_id,actor_user_id,action,entity_type,entity_id,after_data,metadata)
    values(v_code.tenant_id,v_code.school_id,v_user,'student.enrollment.requested','student_enrollment_request',v_request,
      jsonb_build_object('studentNumber',trim(p_student_number),'status','pending'),jsonb_build_object('schoolJoinCodeId',v_code.id));
  return query select v_request,v_code.tenant_id,v_code.school_id,'pending'::text;
end $$;
revoke all on function app.submit_student_enrollment_request(text,text,text,text,text,date) from public,anon,authenticated;
grant execute on function app.submit_student_enrollment_request(text,text,text,text,text,date) to myschool_runtime;

create or replace function app.reserve_student_password_reset_code(p_code_hash text)
returns table(reset_id uuid,user_id uuid)
language plpgsql security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
begin
  return query
  update public.student_password_reset_codes c
  set reserved_at=now()
  where c.code_hash=p_code_hash and c.used_at is null and c.expires_at>now()
    and (c.reserved_at is null or c.reserved_at<now()-interval '2 minutes')
  returning c.id,c.user_id;
end $$;
revoke all on function app.reserve_student_password_reset_code(text) from public,anon,authenticated;
grant execute on function app.reserve_student_password_reset_code(text) to myschool_runtime;

create or replace function app.finish_student_password_reset(p_reset_id uuid)
returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
declare v_code public.student_password_reset_codes%rowtype;
begin
  update public.student_password_reset_codes c set used_at=now()
  where c.id=p_reset_id and c.used_at is null and c.reserved_at>now()-interval '2 minutes'
  returning * into v_code;
  if not found then return false; end if;
  insert into public.audit_logs(tenant_id,school_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(v_code.tenant_id,v_code.school_id,v_code.issued_by,'student.password_reset.completed','student',v_code.student_id,
      jsonb_build_object('targetUserId',v_code.user_id,'resetCodeId',v_code.id));
  return true;
end $$;
revoke all on function app.finish_student_password_reset(uuid) from public,anon,authenticated;
grant execute on function app.finish_student_password_reset(uuid) to myschool_runtime;

create or replace function app.release_student_password_reset(p_reset_id uuid)
returns boolean
language sql security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
  with released as (
    update public.student_password_reset_codes set reserved_at=null
    where id=p_reset_id and used_at is null and reserved_at>now()-interval '2 minutes'
    returning 1
  ) select exists(select 1 from released)
$$;
revoke all on function app.release_student_password_reset(uuid) from public,anon,authenticated;
grant execute on function app.release_student_password_reset(uuid) to myschool_runtime;

commit;