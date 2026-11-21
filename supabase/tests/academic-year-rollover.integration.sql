\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 integration harness. Never run against Production.
do $anon_role$ begin create role anon nologin; exception when duplicate_object then null; end $anon_role$;
do $authenticated_role$ begin create role authenticated nologin; exception when duplicate_object then null; end $authenticated_role$;
do $runtime_role$ begin create role myschool_runtime nologin; exception when duplicate_object then null; end $runtime_role$;

create schema if not exists app;
create schema if not exists auth;

create type public.academic_period_status as enum ('planned','active','completed','archived');

create table app.test_permissions (
  user_id uuid not null,
  permission_key text not null,
  tenant_id uuid not null,
  school_id uuid not null,
  primary key (user_id, permission_key, tenant_id, school_id)
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$function$;

create or replace function app.has_permission(
  p_permission text,
  p_tenant_id uuid default null,
  p_school_id uuid default null,
  p_class_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app
as $function$
  select exists (
    select 1 from app.test_permissions p
    where p.user_id = auth.uid()
      and p.permission_key = p_permission
      and p.tenant_id = p_tenant_id
      and p.school_id = p_school_id
  );
$function$;

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status public.academic_period_status not null default 'planned',
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_years_check check (ends_on > starts_on),
  constraint academic_years_school_id_name_key unique (school_id,name)
);

create unique index academic_year_one_current_per_school
  on public.academic_years(school_id) where is_current=true;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  school_id uuid,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.academic_years enable row level security;
alter table public.audit_logs enable row level security;

create policy academic_years_read
on public.academic_years
for select to authenticated, myschool_runtime
using (app.has_permission('academics.manage', tenant_id, school_id, null));

create policy academic_years_write
on public.academic_years
for all to authenticated, myschool_runtime
using (app.has_permission('academics.manage', tenant_id, school_id, null))
with check (app.has_permission('academics.manage', tenant_id, school_id, null));

create policy audit_logs_insert_actor
on public.audit_logs
for insert to authenticated, myschool_runtime
with check (actor_user_id = auth.uid());

grant usage on schema app, auth to authenticated, myschool_runtime;
grant execute on function auth.uid() to authenticated, myschool_runtime;
grant execute on function app.has_permission(text,uuid,uuid,uuid) to authenticated, myschool_runtime;
grant select, insert, update on public.academic_years to authenticated, myschool_runtime;
grant insert on public.audit_logs to authenticated, myschool_runtime;
grant select on app.test_permissions to authenticated, myschool_runtime;

insert into app.test_permissions(user_id,permission_key,tenant_id,school_id)
values
 ('00000000-0000-0000-0000-000000000001','academics.manage','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000003','academics.manage','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');

insert into public.academic_years(id,tenant_id,school_id,name,starts_on,ends_on,status,is_current)
values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2025/2026','2025-09-01','2026-06-30','active',true),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Other School 2026/2027','2026-09-01','2027-06-30','planned',false);

-- Apply the exact migration under test.
\ir ../migrations/20261121130000_academic_year_rollover_atomic.sql

do $privilege_tests$
begin
  if has_column_privilege('authenticated','public.academic_years','is_current','update') then
    raise exception 'authenticated must not directly update academic_years.is_current';
  end if;
  if has_column_privilege('authenticated','public.academic_years','status','update') then
    raise exception 'authenticated must not directly update academic_years.status';
  end if;
  if has_column_privilege('authenticated','public.academic_years','is_current','insert') then
    raise exception 'authenticated must not directly insert academic_years.is_current';
  end if;
  if not has_column_privilege('authenticated','public.academic_years','name','update') then
    raise exception 'authenticated should retain harmless year-name edits';
  end if;
  if not has_column_privilege('authenticated','public.academic_years','status','insert') then
    raise exception 'authenticated should retain planned/active year creation';
  end if;
end;
$privilege_tests$;

set role authenticated;

do $rollover_tests$
declare
  v_user uuid := '00000000-0000-0000-0000-000000000001';
  v_tenant uuid := '10000000-0000-0000-0000-000000000001';
  v_school uuid := '20000000-0000-0000-0000-000000000001';
  v_first_target uuid := '30000000-0000-0000-0000-000000000002';
  v_second_target uuid := '30000000-0000-0000-0000-000000000003';
  v_result jsonb;
  v_rejected boolean;
begin
  perform set_config('request.jwt.claim.sub',v_user::text,true);

  -- A permitted browser role may create a non-current year but cannot set the
  -- protected is_current field. The database default leaves it non-current.
  insert into public.academic_years(tenant_id,school_id,name,starts_on,ends_on,status)
  values(v_tenant,v_school,'2026/2027','2026-09-01','2027-06-30','planned');

  insert into public.academic_years(id,tenant_id,school_id,name,starts_on,ends_on,status)
  values(v_first_target,v_tenant,v_school,'2027/2028','2027-09-01','2028-06-30','planned');

  v_result := public.rollover_academic_year(
    v_tenant,v_school,v_first_target,
    '30000000-0000-0000-0000-000000000001'
  );

  if v_result->>'success' <> 'true' or v_result->>'changed' <> 'true' then
    raise exception 'first rollover did not report a change: %',v_result;
  end if;

  if not exists(select 1 from public.academic_years where id=v_first_target and is_current and status='active') then
    raise exception 'target year was not made active/current';
  end if;
  if not exists(select 1 from public.academic_years where id='30000000-0000-0000-0000-000000000001' and not is_current and status='completed') then
    raise exception 'previous current year was not completed';
  end if;

  -- Repeating the same target is idempotent and does not duplicate audit rows.
  v_result := public.rollover_academic_year(v_tenant,v_school,v_first_target,v_first_target);
  if v_result->>'changed' <> 'false' then
    raise exception 'replayed rollover should be idempotent: %',v_result;
  end if;

  insert into public.academic_years(id,tenant_id,school_id,name,starts_on,ends_on,status)
  values(v_second_target,v_tenant,v_school,'2028/2029','2028-09-01','2029-06-30','planned');

  -- Stale client: expected-current ID no longer matches actual current year.
  v_rejected := false;
  begin
    perform public.rollover_academic_year(
      v_tenant,v_school,v_second_target,
      '30000000-0000-0000-0000-000000000001'
    );
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'ACADEMIC_YEAR_CURRENT_CHANGED' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'stale current-year update was accepted'; end if;

  -- A caller authorized for School A cannot select a target from School B.
  v_rejected := false;
  begin
    perform public.rollover_academic_year(
      v_tenant,v_school,
      '30000000-0000-0000-0000-000000000004',
      v_first_target
    );
  exception when sqlstate '23503' then
    if sqlerrm <> 'ACADEMIC_YEAR_TARGET_SCOPE_MISMATCH' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'cross-school target was accepted'; end if;

  if (select count(*) from public.audit_logs where action='academic_year.rollover') <> 1 then
    raise exception 'rollover audit event count is incorrect';
  end if;
end;
$rollover_tests$;

-- A user with no academics.manage grant cannot activate a school year.
do $unauthorized_test$
declare
  v_rejected boolean := false;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
  begin
    perform public.rollover_academic_year(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000003',
      '30000000-0000-0000-0000-000000000002'
    );
  exception when insufficient_privilege then
    if sqlerrm <> 'ACADEMIC_YEAR_MANAGE_PERMISSION_REQUIRED' then raise; end if;
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'unauthorized year rollover was accepted'; end if;
end;
$unauthorized_test$;

reset role;

select 'academic year rollover integration tests passed' as result;
