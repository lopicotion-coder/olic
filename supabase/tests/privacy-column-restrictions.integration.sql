\set ON_ERROR_STOP on

do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role myschool_runtime nologin;
exception when duplicate_object then null;
end $$;

drop table if exists public.student_enrollment_requests cascade;
drop table if exists public.students cascade;

create table public.students (
  id uuid primary key,
  tenant_id uuid not null,
  school_id uuid not null,
  national_id text,
  first_name text not null
);

create table public.student_enrollment_requests (
  id uuid primary key,
  tenant_id uuid not null,
  school_id uuid not null,
  national_id text,
  student_number text not null
);

grant select on public.students to authenticated, myschool_runtime;
grant select on public.student_enrollment_requests to authenticated, myschool_runtime;

-- Apply the column-level hardening under test.
\ir ../migrations/20261121001000_privacy_column_hardening.sql

-- The browser-facing roles must not be able to select national_id directly.
do $privacy_tests$
declare
  v_students_ok boolean;
  v_requests_ok boolean;
  v_students_id_ok boolean;
begin
  select has_column_privilege('authenticated', 'public.students', 'national_id', 'select') into v_students_ok;
  select has_column_privilege('authenticated', 'public.student_enrollment_requests', 'national_id', 'select') into v_requests_ok;
  select has_column_privilege('authenticated', 'public.students', 'id', 'select') into v_students_id_ok;

  if v_students_ok then
    raise exception 'authenticated can still read public.students.national_id';
  end if;

  if v_requests_ok then
    raise exception 'authenticated can still read public.student_enrollment_requests.national_id';
  end if;

  if not v_students_id_ok then
    raise exception 'baseline students.id select privilege was removed unexpectedly';
  end if;
end;
$privacy_tests$;

select 'privacy column restriction tests passed' as result;
