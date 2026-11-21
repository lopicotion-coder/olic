begin;
alter table public.student_password_reset_codes add column if not exists revoked_at timestamptz;
create unique index if not exists student_password_reset_codes_one_open_idx
  on public.student_password_reset_codes(student_id)
  where used_at is null and revoked_at is null;

create or replace function app.issue_student_password_reset_code(p_student_id uuid,p_code_hash text)
returns table(reset_id uuid,expires_at timestamptz)
language plpgsql security definer
set search_path=pg_catalog,public,app,auth
set row_security=off
as $$
declare v_student public.students%rowtype; v_user uuid; v_id uuid; v_expiry timestamptz;
begin
  if auth.uid() is null then raise exception 'Authenticated teacher or school administrator required'; end if;
  if p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid reset token digest'; end if;
  select s.* into v_student
  from public.students s
  where s.id=p_student_id and s.profile_id is not null and s.status='active'
    and exists (
      select 1 from public.student_enrollments e
      where e.student_id=s.id and e.tenant_id=s.tenant_id and e.school_id=s.school_id and e.status='active'
        and app.has_permission('students.password_reset.issue',e.tenant_id,e.school_id,e.class_id)
    )
  for update;
  if not found then raise exception 'Student is not eligible for this teacher reset operation'; end if;
  v_user:=v_student.profile_id;
  update public.student_password_reset_codes set revoked_at=now()
    where student_id=v_student.id and used_at is null and revoked_at is null;
  v_expiry:=now()+interval '15 minutes';
  insert into public.student_password_reset_codes(tenant_id,school_id,student_id,user_id,issued_by,code_hash,expires_at)
    values(v_student.tenant_id,v_student.school_id,v_student.id,v_user,auth.uid(),p_code_hash,v_expiry)
    returning id into v_id;
  return query select v_id,v_expiry;
end $$;
revoke all on function app.issue_student_password_reset_code(uuid,text) from public,anon,authenticated;
grant execute on function app.issue_student_password_reset_code(uuid,text) to myschool_runtime;

create or replace function app.reserve_student_password_reset_code(p_code_hash text)
returns table(reset_id uuid,user_id uuid)
language plpgsql security definer
set search_path=pg_catalog,public,app
set row_security=off
as $$
begin
  return query
  update public.student_password_reset_codes c set reserved_at=now()
  where c.code_hash=p_code_hash and c.used_at is null and c.revoked_at is null and c.expires_at>now()
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
  where c.id=p_reset_id and c.used_at is null and c.revoked_at is null
    and c.reserved_at>now()-interval '2 minutes'
  returning * into v_code;
  if not found then return false; end if;
  insert into public.audit_logs(tenant_id,school_id,actor_user_id,action,entity_type,entity_id,metadata)
    values(v_code.tenant_id,v_code.school_id,v_code.user_id,'student.password_reset.completed','student',v_code.student_id,
      jsonb_build_object('issuedBy',v_code.issued_by,'resetCodeId',v_code.id));
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
    where id=p_reset_id and used_at is null and revoked_at is null and reserved_at>now()-interval '2 minutes'
    returning 1
  ) select exists(select 1 from released)
$$;
revoke all on function app.release_student_password_reset(uuid) from public,anon,authenticated;
grant execute on function app.release_student_password_reset(uuid) to myschool_runtime;
commit;