\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 integration harness.
-- The app.can_access_* functions below are narrow test doubles backed by
-- fixture tables. This validates the policy wiring and DB triggers in this
-- migration; production helper semantics are separately inspected against
-- the live project. Never run this file against Production.

create role anon nologin;
create role authenticated nologin;
create role myschool_runtime nologin;

create schema app;
create schema auth;

create type public.content_status as enum ('draft', 'published');

create table app.test_school_access (
  user_id uuid not null,
  tenant_id uuid not null,
  school_id uuid not null,
  primary key (user_id, tenant_id, school_id)
);

create table app.test_class_access (
  user_id uuid not null,
  class_id uuid not null,
  primary key (user_id, class_id)
);

create table app.test_permissions (
  user_id uuid not null,
  permission_key text not null,
  tenant_id uuid,
  school_id uuid,
  class_id uuid
);

create function auth.uid()
returns uuid
language sql
stable
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$function$;

create function app.can_access_school(p_tenant_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from app.test_school_access s
    where s.user_id = auth.uid()
      and s.tenant_id = p_tenant_id
      and s.school_id = p_school_id
  );
$function$;

create function app.can_access_class(p_class_id uuid, p_tenant_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from app.test_class_access c
    join app.test_school_access s
      on s.user_id = c.user_id
     and s.tenant_id = p_tenant_id
     and s.school_id = p_school_id
    where c.user_id = auth.uid()
      and c.class_id = p_class_id
  );
$function$;

create function app.has_permission(
  p_permission text,
  p_tenant_id uuid default null,
  p_school_id uuid default null,
  p_class_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from app.test_permissions p
    where p.user_id = auth.uid()
      and p.permission_key = p_permission
      and (p.tenant_id is null or p.tenant_id = p_tenant_id)
      and (p.school_id is null or p.school_id = p_school_id)
      and (p.class_id is null or p.class_id = p_class_id)
  );
$function$;

grant usage on schema app, auth to anon, authenticated, myschool_runtime;
grant execute on function auth.uid() to anon, authenticated, myschool_runtime;
grant execute on function app.can_access_school(uuid, uuid) to authenticated, myschool_runtime;
grant execute on function app.can_access_class(uuid, uuid, uuid) to authenticated, myschool_runtime;
grant execute on function app.has_permission(text, uuid, uuid, uuid) to authenticated, myschool_runtime;

-- IDs used by this isolated test fixture.
-- Tenant A / School A:
-- 10000000-0000-0000-0000-000000000001 / 20000000-0000-0000-0000-000000000001
-- Classes A and B: 30000000-0000-0000-0000-000000000001 / ...0002
-- Tenant B / School B / Class C: ...0002 / ...0002 / 30000000-0000-0000-0000-000000000003

insert into app.test_school_access (user_id, tenant_id, school_id) values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');

insert into app.test_class_access (user_id, class_id) values
  ('00000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000003');

insert into app.test_permissions (user_id, permission_key, tenant_id, school_id, class_id)
values (
  '00000000-0000-0000-0000-000000000006',
  'content.manage',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  null
);

create table public.content_items (
  id text primary key,
  tenant_id uuid not null,
  school_id uuid not null,
  class_id uuid,
  status public.content_status not null
);

alter table public.content_items enable row level security;
grant select, insert, update, delete on public.content_items to authenticated, myschool_runtime;

-- This is the original management policy. The migration must leave it intact.
create policy content_items_write
on public.content_items
as permissive
for all
to authenticated, myschool_runtime
using (app.has_permission('content.manage', tenant_id, school_id, class_id))
with check (app.has_permission('content.manage', tenant_id, school_id, class_id));

insert into public.content_items (id, tenant_id, school_id, class_id, status) values
  ('school-wide', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null, 'published'),
  ('class-a', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'published'),
  ('class-b', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'published'),
  ('draft-class-b', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'draft'),
  ('other-tenant', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'published');

create table public.students (
  id uuid primary key,
  tenant_id uuid not null,
  school_id uuid not null,
  unique (id, tenant_id, school_id)
);

create table public.assessments (
  id uuid primary key,
  tenant_id uuid not null,
  school_id uuid not null,
  max_score numeric not null,
  unique (id, tenant_id, school_id)
);

create table public.grades (
  id uuid primary key,
  assessment_id uuid not null,
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  score numeric not null check (score >= 0),
  unique (assessment_id, student_id),
  foreign key (assessment_id, tenant_id, school_id)
    references public.assessments (id, tenant_id, school_id),
  foreign key (student_id, tenant_id, school_id)
    references public.students (id, tenant_id, school_id)
);

insert into public.students (id, tenant_id, school_id) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');

insert into public.assessments (id, tenant_id, school_id, max_score)
values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  100
);

-- Apply the exact migration under test.
\ir ../migrations/20261121000200_content_and_grade_integrity_hardening.sql

-- Static policy assertions: preserve the write policy and replace only the read policy.
do $policy_catalog_tests$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'content_items'
      and policyname = 'content_items_read'
      and cmd = 'SELECT'
  ) then
    raise exception 'content_items_read policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'content_items'
      and policyname = 'content_items_write'
      and cmd = 'ALL'
  ) then
    raise exception 'content_items_write policy was not preserved';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.grades'::regclass
      and tgname = 'grades_enforce_assessment_max_score'
      and not tgisinternal
  ) then
    raise exception 'grade max-score trigger is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.assessments'::regclass
      and tgname = 'assessments_preserve_grade_score_bounds'
      and not tgisinternal
  ) then
    raise exception 'assessment max-score reduction trigger is missing';
  end if;
end;
$policy_catalog_tests$;

-- RLS checks use simulated identity-to-scope helpers; the production helper
-- definitions were reviewed independently against the live database.
set role authenticated;

do $content_access_tests$
declare
  v_count integer;
begin
  -- Student enrolled in Class A: school-wide + Class A, never Class B or another tenant.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  select count(*) into v_count from public.content_items;
  if v_count <> 2 then raise exception 'student class-A visibility expected 2 rows, got %', v_count; end if;
  if exists (select 1 from public.content_items where id in ('class-b', 'other-tenant')) then
    raise exception 'student in Class A can see out-of-scope content';
  end if;

  -- Parent linked only to a child in Class A.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
  select count(*) into v_count from public.content_items;
  if v_count <> 2 then raise exception 'parent visibility expected 2 rows, got %', v_count; end if;

  -- Teacher assigned to Class A only.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  select count(*) into v_count from public.content_items;
  if v_count <> 2 then raise exception 'teacher visibility expected 2 rows, got %', v_count; end if;

  -- School admin may read all published items in their school.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
  select count(*) into v_count from public.content_items;
  if v_count <> 3 then raise exception 'school admin visibility expected 3 rows, got %', v_count; end if;

  -- A school member without class access sees only school-wide published items.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
  select count(*) into v_count from public.content_items;
  if v_count <> 1 then raise exception 'unassigned school member expected 1 row, got %', v_count; end if;

  -- Content manager retains management visibility, but only within the assigned school.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
  select count(*) into v_count from public.content_items;
  if v_count <> 4 then raise exception 'school-scoped content manager expected 4 rows, got %', v_count; end if;

  -- Member of another tenant cannot see School A content.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', true);
  select count(*) into v_count from public.content_items;
  if v_count <> 1 then raise exception 'other-tenant member expected only its own row, got %', v_count; end if;

  -- Unaffiliated user sees nothing.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', true);
  select count(*) into v_count from public.content_items;
  if v_count <> 0 then raise exception 'unaffiliated user expected 0 rows, got %', v_count; end if;
end;
$content_access_tests$;

reset role;

-- Grade at the maximum boundary is valid; zero is also valid.
insert into public.grades (id, assessment_id, tenant_id, school_id, student_id, score)
values (
  '60000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  100
);

insert into public.grades (id, assessment_id, tenant_id, school_id, student_id, score)
values (
  '60000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002',
  0
);

-- Every invalid write must fail with the expected SQLSTATE.
do $grade_integrity_tests$
declare
  v_rejected boolean;
begin
  v_rejected := false;
  begin
    insert into public.grades (id, assessment_id, tenant_id, school_id, student_id, score)
    values ('60000000-0000-0000-0000-000000000003',
      '50000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000003', 101);
  exception when sqlstate '23514' then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'grade above max_score was accepted'; end if;

  v_rejected := false;
  begin
    insert into public.grades (id, assessment_id, tenant_id, school_id, student_id, score)
    values ('60000000-0000-0000-0000-000000000004',
      '50000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000004', -1);
  exception when sqlstate '23514' then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'negative grade was accepted'; end if;

  v_rejected := false;
  begin
    insert into public.grades (id, assessment_id, tenant_id, school_id, student_id, score)
    values ('60000000-0000-0000-0000-000000000005',
      '50000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000005', 50);
  exception when sqlstate '23503' then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'cross-school assessment/grade write was accepted'; end if;

  v_rejected := false;
  begin
    insert into public.grades (id, assessment_id, tenant_id, school_id, student_id, score)
    values ('60000000-0000-0000-0000-000000000006',
      '50000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000005', 50);
  exception when sqlstate '23503' then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'cross-school student/grade write was accepted'; end if;

  v_rejected := false;
  begin
    insert into public.grades (id, assessment_id, tenant_id, school_id, student_id, score)
    values ('60000000-0000-0000-0000-000000000007',
      '50000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001', 95);
  exception when unique_violation then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'duplicate assessment/student grade was accepted'; end if;

  v_rejected := false;
  begin
    update public.assessments set max_score = 99
    where id = '50000000-0000-0000-0000-000000000001';
  exception when sqlstate '23514' then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'assessment max_score was lowered below an existing grade'; end if;

  v_rejected := false;
  begin
    update public.grades set score = 101
    where id = '60000000-0000-0000-0000-000000000001';
  exception when sqlstate '23514' then
    v_rejected := true;
  end;
  if not v_rejected then raise exception 'grade update above max_score was accepted'; end if;
end;
$grade_integrity_tests$;

-- Leave this disposable database with a clear success marker for CI logs.
select 'content and grade integrity integration tests passed' as result;
