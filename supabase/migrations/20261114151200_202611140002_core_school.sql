-- My School / Phase 2 Core School System
begin;

create type public.academic_period_status as enum ('planned','active','completed','archived');
create type public.enrollment_status as enum ('active','transferred','completed','withdrawn');
create type public.attendance_status as enum ('present','absent','late','excused');
create type public.assignment_status as enum ('draft','published','closed','archived');
create type public.submission_status as enum ('draft','submitted','late','graded','returned');

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
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (school_id, name),
  check (ends_on > starts_on)
);
create unique index academic_year_one_current_per_school on public.academic_years(school_id) where is_current = true;

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status public.academic_period_status not null default 'planned',
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  foreign key (academic_year_id, tenant_id, school_id) references public.academic_years(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (academic_year_id, name),
  check (ends_on > starts_on)
);

create table public.grade_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  name text not null,
  code text,
  sort_order integer not null default 0,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (school_id, name),
  unique (school_id, code)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  name text not null,
  code text,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (school_id, name),
  unique (school_id, code)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  campus_id uuid,
  academic_year_id uuid not null,
  grade_level_id uuid not null,
  name text not null,
  capacity integer,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete restrict,
  foreign key (academic_year_id, tenant_id, school_id) references public.academic_years(id, tenant_id, school_id) on delete restrict,
  foreign key (grade_level_id, tenant_id, school_id) references public.grade_levels(id, tenant_id, school_id) on delete restrict,
  foreign key (campus_id, tenant_id, school_id) references public.campuses(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (school_id, academic_year_id, name),
  check (capacity is null or capacity > 0)
);

alter table public.membership_roles
  add constraint membership_roles_class_fk
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete restrict;
alter table app.user_effective_permissions add constraint effective_permissions_class_fk
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete cascade;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  campus_id uuid,
  profile_id uuid references public.profiles(id) on delete set null,
  student_number text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  date_of_birth date,
  admission_date date,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete restrict,
  foreign key (campus_id, tenant_id, school_id) references public.campuses(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (school_id, student_number),
  unique (profile_id, school_id)
);
create index students_name_search_idx on public.students(school_id, lower(last_name), lower(first_name));

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  campus_id uuid,
  profile_id uuid references public.profiles(id) on delete set null,
  employee_number text,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete restrict,
  foreign key (campus_id, tenant_id, school_id) references public.campuses(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (school_id, employee_number),
  unique (profile_id, school_id),
  check (email is null or email = lower(trim(email)))
);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  profile_id uuid references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (profile_id, school_id),
  check (email is null or email = lower(trim(email)))
);

create table public.student_guardians (
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship text not null,
  is_primary boolean not null default false,
  can_receive_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (student_id, guardian_id),
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete restrict,
  foreign key (guardian_id, tenant_id, school_id) references public.guardians(id, tenant_id, school_id) on delete restrict
);
create unique index one_primary_guardian_per_student on public.student_guardians(student_id) where is_primary = true;

create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  periods_per_week integer not null default 1,
  created_at timestamptz not null default now(),
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete cascade,
  foreign key (subject_id, tenant_id, school_id) references public.subjects(id, tenant_id, school_id) on delete restrict,
  unique (class_id, subject_id),
  unique (id, tenant_id, school_id),
  check (periods_per_week > 0)
);

create table public.teacher_class_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  class_id uuid not null,
  teacher_id uuid not null,
  subject_id uuid,
  created_at timestamptz not null default now(),
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete cascade,
  foreign key (teacher_id, tenant_id, school_id) references public.teachers(id, tenant_id, school_id) on delete restrict,
  foreign key (subject_id, tenant_id, school_id) references public.subjects(id, tenant_id, school_id) on delete restrict,
  unique (class_id, teacher_id, subject_id)
);
create index teacher_class_assignments_teacher_idx on public.teacher_class_assignments(teacher_id, class_id);

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  academic_year_id uuid not null,
  enrolled_on date not null default current_date,
  ended_on date,
  status public.enrollment_status not null default 'active',
  transfer_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete restrict,
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete restrict,
  foreign key (academic_year_id, tenant_id, school_id) references public.academic_years(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id),
  check (ended_on is null or ended_on >= enrolled_on)
);
create unique index one_active_enrollment_per_student_year
  on public.student_enrollments(student_id, academic_year_id) where status = 'active';

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  class_id uuid not null,
  subject_id uuid,
  session_date date not null,
  period_number integer,
  notes text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete restrict,
  foreign key (subject_id, tenant_id, school_id) references public.subjects(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (class_id, session_date, period_number)
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  status public.attendance_status not null,
  note text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, tenant_id, school_id) references public.attendance_sessions(id, tenant_id, school_id) on delete cascade,
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete restrict,
  unique (session_id, student_id)
);
create index attendance_records_student_idx on public.attendance_records(student_id, created_at desc);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  term_id uuid,
  title text not null,
  assessment_type text not null default 'quiz',
  max_score numeric(8,2) not null,
  weight numeric(6,3) not null default 1,
  assessment_date date,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete restrict,
  foreign key (subject_id, tenant_id, school_id) references public.subjects(id, tenant_id, school_id) on delete restrict,
  foreign key (term_id, tenant_id, school_id) references public.terms(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id),
  check (max_score > 0),
  check (weight > 0)
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  assessment_id uuid not null,
  student_id uuid not null,
  score numeric(8,2) not null,
  feedback text,
  entered_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (assessment_id, tenant_id, school_id) references public.assessments(id, tenant_id, school_id) on delete restrict,
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete restrict,
  unique (assessment_id, student_id),
  check (score >= 0)
);
create index grades_student_idx on public.grades(student_id, created_at desc);

create table public.grade_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  grade_id uuid not null,
  changed_by uuid,
  operation text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
  -- grade_id intentionally has no FK: revision history must survive source-row removal.
);

create or replace function app.record_grade_revision() returns trigger
language plpgsql security invoker
set search_path = pg_catalog, public, app
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.grade_revisions(tenant_id, school_id, grade_id, changed_by, operation, new_values)
    values (new.tenant_id, new.school_id, new.id, auth.uid(), 'INSERT', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.grade_revisions(tenant_id, school_id, grade_id, changed_by, operation, old_values, new_values)
    values (new.tenant_id, new.school_id, new.id, auth.uid(), 'UPDATE', to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.grade_revisions(tenant_id, school_id, grade_id, changed_by, operation, old_values)
    values (old.tenant_id, old.school_id, old.id, auth.uid(), 'DELETE', to_jsonb(old));
    return old;
  end if;
end;
$$;
create trigger grades_revision_trigger after insert or update or delete on public.grades
  for each row execute function app.record_grade_revision();

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  title text not null,
  instructions text,
  status public.assignment_status not null default 'draft',
  due_at timestamptz,
  max_score numeric(8,2),
  allow_late_submission boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete restrict,
  foreign key (subject_id, tenant_id, school_id) references public.subjects(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id),
  check (max_score is null or max_score > 0)
);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null,
  submission_text text,
  file_path text,
  status public.submission_status not null default 'draft',
  submitted_at timestamptz,
  score numeric(8,2),
  feedback text,
  graded_by uuid references auth.users(id) on delete set null,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (assignment_id, tenant_id, school_id) references public.assignments(id, tenant_id, school_id) on delete restrict,
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete restrict,
  unique (assignment_id, student_id),
  check (score is null or score >= 0)
);

-- Minimal student finance foundation (school fees are separate from My School SaaS billing).
create table public.fee_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  name text not null,
  currency char(3) not null default 'EGP',
  total_amount numeric(12,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (academic_year_id, tenant_id, school_id) references public.academic_years(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id),
  check (total_amount >= 0)
);

create table public.student_fee_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  fee_plan_id uuid not null,
  discount_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete restrict,
  foreign key (fee_plan_id, tenant_id, school_id) references public.fee_plans(id, tenant_id, school_id) on delete restrict,
  unique (student_id, fee_plan_id),
  unique (id, tenant_id, school_id),
  check (discount_amount >= 0)
);

create table public.fee_installments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  fee_account_id uuid not null,
  sequence_number integer not null,
  due_on date not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  foreign key (fee_account_id, tenant_id, school_id) references public.student_fee_accounts(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id),
  unique (id, fee_account_id, tenant_id, school_id),
  unique (fee_account_id, sequence_number),
  check (sequence_number > 0 and amount >= 0)
);

create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  fee_account_id uuid not null,
  installment_id uuid,
  receipt_number text not null,
  amount numeric(12,2) not null,
  currency char(3) not null default 'EGP',
  payment_method text not null,
  reference text,
  received_at timestamptz not null default now(),
  received_by uuid not null references auth.users(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (fee_account_id, tenant_id, school_id) references public.student_fee_accounts(id, tenant_id, school_id) on delete restrict,
  foreign key (installment_id, fee_account_id, tenant_id, school_id) references public.fee_installments(id, fee_account_id, tenant_id, school_id) on delete restrict,
  unique (school_id, receipt_number),
  check (amount > 0)
);

-- Private document metadata. Object storage keys include an explicit resource scope.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  storage_path text not null unique,
  original_file_name text not null,
  mime_type text not null,
  byte_size bigint not null,
  resource_type text not null check (resource_type in ('school','class','student','assignment','assessment','message','support_ticket')),
  resource_id uuid,
  class_id uuid,
  student_id uuid,
  created_at timestamptz not null default now(),
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete restrict,
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete restrict,
  check (byte_size > 0 and byte_size <= 26214400),
  check ((resource_type='class' and class_id is not null) or resource_type <> 'class'),
  check ((resource_type='student' and student_id is not null) or resource_type <> 'student')
);
create index documents_scope_created_idx on public.documents(tenant_id,school_id,created_at desc);
create index documents_class_idx on public.documents(class_id) where class_id is not null;
create index documents_student_idx on public.documents(student_id) where student_id is not null;

-- Timetable configuration and generation history; the solver remains an admin-only setup workflow.
create table public.timetable_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  configuration jsonb not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (academic_year_id, tenant_id, school_id) references public.academic_years(id, tenant_id, school_id) on delete restrict,
  unique (id, tenant_id, school_id)
);
create table public.timetable_generation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  config_id uuid not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  result_summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (config_id, tenant_id, school_id) references public.timetable_configs(id, tenant_id, school_id) on delete restrict
);

-- RLS policies: same-tenant access is insufficient; the permission and school/class scope must match.
-- Small private link tables let RLS safely resolve student/guardian ownership without
-- recursive policies against students or student_guardians.
create table app.student_user_links (
  student_id uuid primary key,
  tenant_id uuid not null,
  school_id uuid not null,
  user_id uuid not null
);
create table app.student_guardian_links (
  student_id uuid not null,
  tenant_id uuid not null,
  school_id uuid not null,
  guardian_user_id uuid not null,
  guardian_id uuid not null,
  primary key (student_id, guardian_id)
);
alter table app.student_user_links enable row level security;
alter table app.student_guardian_links enable row level security;
create policy student_user_link_self on app.student_user_links for select to myschool_runtime using (user_id=auth.uid());
create policy student_guardian_link_self on app.student_guardian_links for select to myschool_runtime using (guardian_user_id=auth.uid());
create policy student_user_link_manage on app.student_user_links for all to myschool_runtime
  using (app.has_permission('students.manage', tenant_id, school_id, null))
  with check (app.has_permission('students.manage', tenant_id, school_id, null));
create policy student_guardian_link_manage on app.student_guardian_links for all to myschool_runtime
  using (app.has_permission('students.manage', tenant_id, school_id, null))
  with check (app.has_permission('students.manage', tenant_id, school_id, null));

-- These private link tables are not part of the public Data API. Storage policies
-- may read only the calling user's own linkage rows under RLS.
revoke all on app.student_user_links, app.student_guardian_links from anon, authenticated;
grant select, insert, update, delete on app.student_user_links, app.student_guardian_links to myschool_runtime;
grant usage on schema app to authenticated;
grant select on app.student_user_links, app.student_guardian_links to authenticated;
grant select on app.user_membership_scopes to authenticated;
create policy student_user_link_authenticated_self on app.student_user_links for select to authenticated using (user_id=auth.uid());
create policy student_guardian_link_authenticated_self on app.student_guardian_links for select to authenticated using (guardian_user_id=auth.uid());

create or replace function app.sync_student_user_link() returns trigger
language plpgsql security invoker set search_path=pg_catalog, public, app as $$
begin
  delete from app.student_user_links where student_id=coalesce(new.id, old.id);
  if tg_op <> 'DELETE' and new.profile_id is not null then
    insert into app.student_user_links(student_id, tenant_id, school_id, user_id)
    values (new.id, new.tenant_id, new.school_id, new.profile_id);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
create trigger students_user_link_trigger after insert or update of profile_id or delete on public.students
  for each row execute function app.sync_student_user_link();

create or replace function app.sync_guardian_link_from_relationship() returns trigger
language plpgsql security invoker set search_path=pg_catalog, public, app as $$
declare v_guardian_user_id uuid;
begin
  if tg_op='DELETE' then
    select profile_id into v_guardian_user_id from public.guardians where id=old.guardian_id;
    if v_guardian_user_id is not null then
      delete from app.student_guardian_links where student_id=old.student_id and guardian_id=old.guardian_id;
    end if;
    return old;
  end if;
  select profile_id into v_guardian_user_id from public.guardians where id=new.guardian_id;
  if v_guardian_user_id is not null then
    insert into app.student_guardian_links(student_id,tenant_id,school_id,guardian_user_id,guardian_id)
    values (new.student_id,new.tenant_id,new.school_id,v_guardian_user_id,new.guardian_id)
    on conflict (student_id,guardian_id) do update set guardian_user_id=excluded.guardian_user_id;
  end if;
  return new;
end; $$;
create trigger student_guardians_link_trigger after insert or delete on public.student_guardians
  for each row execute function app.sync_guardian_link_from_relationship();

create or replace function app.sync_guardian_profile_links() returns trigger
language plpgsql security invoker set search_path=pg_catalog, public, app as $$
begin
  delete from app.student_guardian_links where guardian_id=new.id;
  if new.profile_id is not null then
    insert into app.student_guardian_links(student_id,tenant_id,school_id,guardian_user_id,guardian_id)
    select sg.student_id,sg.tenant_id,sg.school_id,new.profile_id,new.id
      from public.student_guardians sg where sg.guardian_id=new.id
    on conflict (student_id,guardian_id) do update set guardian_user_id=excluded.guardian_user_id;
  end if;
  return new;
end; $$;
create trigger guardians_user_link_trigger after insert or update of profile_id on public.guardians
  for each row execute function app.sync_guardian_profile_links();

create or replace function app.is_student_owner(p_student_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,app as $$
  select exists(select 1 from app.student_user_links l
    join app.user_membership_scopes ms on ms.user_id=l.user_id and ms.tenant_id=l.tenant_id
      and ms.school_id=l.school_id and ms.status='active'
    where l.student_id=p_student_id and l.user_id=auth.uid());
$$;
create or replace function app.is_guardian_of_student(p_student_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,app as $$
  select exists(select 1 from app.student_guardian_links l
    join app.user_membership_scopes ms on ms.user_id=l.guardian_user_id and ms.tenant_id=l.tenant_id
      and ms.school_id=l.school_id and ms.status='active'
    where l.student_id=p_student_id and l.guardian_user_id=auth.uid());
$$;

-- Scope-aware helpers are used by Storage RLS so a linked student/guardian
-- cannot use a correct student UUID under a forged tenant/school object path.
create or replace function app.is_student_owner_in_school(p_student_id uuid, p_tenant_id uuid, p_school_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,app as $$
  select exists(select 1 from app.student_user_links l
    join app.user_membership_scopes ms on ms.user_id=l.user_id and ms.tenant_id=l.tenant_id
      and ms.school_id=l.school_id and ms.status='active'
    where l.student_id=p_student_id and l.tenant_id=p_tenant_id and l.school_id=p_school_id and l.user_id=auth.uid());
$$;
create or replace function app.is_guardian_of_student_in_school(p_student_id uuid, p_tenant_id uuid, p_school_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,app as $$
  select exists(select 1 from app.student_guardian_links l
    join app.user_membership_scopes ms on ms.user_id=l.guardian_user_id and ms.tenant_id=l.tenant_id
      and ms.school_id=l.school_id and ms.status='active'
    where l.student_id=p_student_id and l.tenant_id=p_tenant_id and l.school_id=p_school_id and l.guardian_user_id=auth.uid());
$$;

grant execute on function app.is_student_owner(uuid) to authenticated;
grant execute on function app.is_guardian_of_student(uuid) to authenticated;
grant execute on function app.is_student_owner_in_school(uuid, uuid, uuid) to authenticated;
grant execute on function app.is_guardian_of_student_in_school(uuid, uuid, uuid) to authenticated;
grant execute on function app.is_student_owner(uuid) to myschool_runtime;
grant execute on function app.is_guardian_of_student(uuid) to myschool_runtime;
grant execute on function app.is_student_owner_in_school(uuid, uuid, uuid) to myschool_runtime;
grant execute on function app.is_guardian_of_student_in_school(uuid, uuid, uuid) to myschool_runtime;
create or replace function app.can_access_class(p_class_id uuid, p_tenant_id uuid, p_school_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,public,app as $$
  select app.has_permission('classes.read',p_tenant_id,p_school_id,p_class_id)
    or app.has_permission('classes.read',p_tenant_id,p_school_id,null)
    or exists (select 1 from public.student_enrollments e join app.student_user_links l on l.student_id=e.student_id
      where e.class_id=p_class_id and e.status='active' and l.user_id=auth.uid())
    or exists (select 1 from public.student_enrollments e join app.student_guardian_links l on l.student_id=e.student_id
      where e.class_id=p_class_id and e.status='active' and l.guardian_user_id=auth.uid());
$$;
create or replace function app.can_access_student(p_student_id uuid, p_tenant_id uuid, p_school_id uuid) returns boolean
language sql stable security invoker set search_path=pg_catalog,public,app as $$
  select app.is_student_owner(p_student_id)
    or app.is_guardian_of_student(p_student_id)
    or app.has_permission('students.read', p_tenant_id, p_school_id, null)
    or exists (select 1 from public.student_enrollments e
      where e.student_id=p_student_id and e.status='active'
        and app.has_permission('students.read', p_tenant_id, p_school_id, e.class_id));
$$;

-- RLS on every public table introduced in Phase 2.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_years','terms','grade_levels','subjects','classes','students','teachers','guardians',
    'student_guardians','class_subjects','teacher_class_assignments','student_enrollments',
    'attendance_sessions','attendance_records','assessments','grades','grade_revisions',
    'assignments','assignment_submissions','fee_plans','student_fee_accounts','fee_installments',
    'fee_payments','documents','timetable_configs','timetable_generation_runs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

create policy academic_years_read on public.academic_years for select to myschool_runtime
  using (app.can_access_school(tenant_id, school_id) or app.has_permission('academics.read', tenant_id, school_id, null));
create policy academic_years_write on public.academic_years for all to myschool_runtime
  using (app.has_permission('academics.manage', tenant_id, school_id, null))
  with check (app.has_permission('academics.manage', tenant_id, school_id, null));

create policy terms_read on public.terms for select to myschool_runtime
  using (app.can_access_school(tenant_id, school_id) or app.has_permission('academics.read', tenant_id, school_id, null));
create policy terms_write on public.terms for all to myschool_runtime
  using (app.has_permission('academics.manage', tenant_id, school_id, null))
  with check (app.has_permission('academics.manage', tenant_id, school_id, null));

create policy grade_levels_read on public.grade_levels for select to myschool_runtime
  using (app.can_access_school(tenant_id, school_id) or app.has_permission('academics.read', tenant_id, school_id, null));
create policy grade_levels_write on public.grade_levels for all to myschool_runtime
  using (app.has_permission('academics.manage', tenant_id, school_id, null))
  with check (app.has_permission('academics.manage', tenant_id, school_id, null));

create policy subjects_read on public.subjects for select to myschool_runtime
  using (app.can_access_school(tenant_id, school_id) or app.has_permission('academics.read', tenant_id, school_id, null));
create policy subjects_write on public.subjects for all to myschool_runtime
  using (app.has_permission('academics.manage', tenant_id, school_id, null))
  with check (app.has_permission('academics.manage', tenant_id, school_id, null));

create policy classes_read on public.classes for select to myschool_runtime
  using (app.can_access_class(id, tenant_id, school_id));
create policy classes_write on public.classes for all to myschool_runtime
  using (app.has_permission('classes.manage', tenant_id, school_id, null))
  with check (app.has_permission('classes.manage', tenant_id, school_id, null));

create policy students_read on public.students for select to myschool_runtime
  using (app.can_access_student(id, tenant_id, school_id));
create policy students_insert on public.students for insert to myschool_runtime
  with check (app.has_permission('students.manage', tenant_id, school_id, null));
create policy students_update on public.students for update to myschool_runtime
  using (app.has_permission('students.manage', tenant_id, school_id, null))
  with check (app.has_permission('students.manage', tenant_id, school_id, null));

create policy teachers_read on public.teachers for select to myschool_runtime
  using (app.has_permission('teachers.read', tenant_id, school_id, null)
    or exists (select 1 from public.teacher_class_assignments tca
      where tca.teacher_id=teachers.id and app.has_permission('teachers.read', teachers.tenant_id, teachers.school_id, tca.class_id)));
create policy teachers_write on public.teachers for all to myschool_runtime
  using (app.has_permission('teachers.manage', tenant_id, school_id, null))
  with check (app.has_permission('teachers.manage', tenant_id, school_id, null));

create policy guardians_read on public.guardians for select to myschool_runtime
  using (profile_id=auth.uid() or app.has_permission('students.read', tenant_id, school_id, null));
create policy guardians_write on public.guardians for all to myschool_runtime
  using (app.has_permission('students.manage', tenant_id, school_id, null))
  with check (app.has_permission('students.manage', tenant_id, school_id, null));

create policy student_guardians_read on public.student_guardians for select to myschool_runtime
  using (app.is_guardian_of_student(student_id) or app.is_student_owner(student_id) or app.has_permission('students.read', tenant_id, school_id, null));
create policy student_guardians_write on public.student_guardians for all to myschool_runtime
  using (app.has_permission('students.manage', tenant_id, school_id, null))
  with check (app.has_permission('students.manage', tenant_id, school_id, null));

create policy class_subjects_read on public.class_subjects for select to myschool_runtime
  using (app.can_access_class(class_id, tenant_id, school_id));
create policy class_subjects_write on public.class_subjects for all to myschool_runtime
  using (app.has_permission('classes.manage', tenant_id, school_id, null))
  with check (app.has_permission('classes.manage', tenant_id, school_id, null));

create policy teacher_class_assignments_read on public.teacher_class_assignments for select to myschool_runtime
  using (app.can_access_class(class_id, tenant_id, school_id));
create policy teacher_class_assignments_write on public.teacher_class_assignments for all to myschool_runtime
  using (app.has_permission('teachers.manage', tenant_id, school_id, null))
  with check (app.has_permission('teachers.manage', tenant_id, school_id, null));

create policy student_enrollments_read on public.student_enrollments for select to myschool_runtime
  using (app.is_student_owner(student_id) or app.is_guardian_of_student(student_id)
    or app.has_permission('classes.read', tenant_id, school_id, class_id)
    or app.has_permission('classes.manage', tenant_id, school_id, null));
create policy student_enrollments_write on public.student_enrollments for all to myschool_runtime
  using (app.has_permission('classes.manage', tenant_id, school_id, null))
  with check (app.has_permission('classes.manage', tenant_id, school_id, null));

create policy attendance_sessions_read on public.attendance_sessions for select to myschool_runtime
  using (app.can_access_class(class_id, tenant_id, school_id));
create policy attendance_sessions_write on public.attendance_sessions for all to myschool_runtime
  using (app.has_permission('attendance.manage', tenant_id, school_id, class_id))
  with check (app.has_permission('attendance.manage', tenant_id, school_id, class_id));

create policy attendance_records_read on public.attendance_records for select to myschool_runtime
  using (app.can_access_student(student_id, tenant_id, school_id)
    or exists (select 1 from public.attendance_sessions s where s.id=attendance_records.session_id
      and app.has_permission('attendance.read', attendance_records.tenant_id, attendance_records.school_id, s.class_id)));
create policy attendance_records_write on public.attendance_records for all to myschool_runtime
  using (exists (select 1 from public.attendance_sessions s
      join public.student_enrollments e on e.class_id=s.class_id and e.student_id=attendance_records.student_id
        and e.tenant_id=attendance_records.tenant_id and e.school_id=attendance_records.school_id and e.status='active'
      where s.id=attendance_records.session_id
        and app.has_permission('attendance.manage', attendance_records.tenant_id, attendance_records.school_id, s.class_id)))
  with check (exists (select 1 from public.attendance_sessions s
      join public.student_enrollments e on e.class_id=s.class_id and e.student_id=attendance_records.student_id
        and e.tenant_id=attendance_records.tenant_id and e.school_id=attendance_records.school_id and e.status='active'
      where s.id=attendance_records.session_id
        and app.has_permission('attendance.manage', attendance_records.tenant_id, attendance_records.school_id, s.class_id)));

create policy assessments_read on public.assessments for select to myschool_runtime
  using (app.can_access_class(class_id, tenant_id, school_id));
create policy assessments_write on public.assessments for all to myschool_runtime
  using (app.has_permission('grades.manage', tenant_id, school_id, class_id))
  with check (app.has_permission('grades.manage', tenant_id, school_id, class_id));

create policy grades_read on public.grades for select to myschool_runtime
  using (app.can_access_student(student_id, tenant_id, school_id)
    or exists (select 1 from public.assessments a where a.id=grades.assessment_id
      and app.has_permission('grades.read', grades.tenant_id, grades.school_id, a.class_id)));

create policy grades_insert on public.grades for insert to myschool_runtime
  with check (exists (select 1 from public.assessments a where a.id=grades.assessment_id
      and app.has_permission('grades.manage', grades.tenant_id, grades.school_id, a.class_id)));
create policy grades_update on public.grades for update to myschool_runtime
  using (exists (select 1 from public.assessments a where a.id=grades.assessment_id
      and app.has_permission('grades.manage', grades.tenant_id, grades.school_id, a.class_id)))
  with check (exists (select 1 from public.assessments a where a.id=grades.assessment_id
      and app.has_permission('grades.manage', grades.tenant_id, grades.school_id, a.class_id)));

create policy grade_revisions_read on public.grade_revisions for select to myschool_runtime
  using (app.has_permission('grades.read', tenant_id, school_id, null) or app.has_permission('audit.read', tenant_id, school_id, null));
create policy grade_revisions_insert on public.grade_revisions for insert to myschool_runtime
  with check (
    app.has_permission('grades.manage', tenant_id, school_id, null)
    or exists (select 1 from public.grades g join public.assessments a on a.id=g.assessment_id
      where g.id=grade_revisions.grade_id and app.has_permission('grades.manage', grade_revisions.tenant_id, grade_revisions.school_id, a.class_id))
  );

create policy assignments_read on public.assignments for select to myschool_runtime
  using (app.can_access_class(class_id, tenant_id, school_id));
create policy assignments_write on public.assignments for all to myschool_runtime
  using (app.has_permission('assignments.manage', tenant_id, school_id, class_id))
  with check (app.has_permission('assignments.manage', tenant_id, school_id, class_id));

create policy assignment_submissions_read on public.assignment_submissions for select to myschool_runtime
  using (app.can_access_student(student_id, tenant_id, school_id)
    or exists (select 1 from public.assignments a where a.id=assignment_submissions.assignment_id
      and app.has_permission('assignments.read', assignment_submissions.tenant_id, assignment_submissions.school_id, a.class_id)));
create policy assignment_submissions_write on public.assignment_submissions for all to myschool_runtime
  using (app.is_student_owner(student_id)
    or exists (select 1 from public.assignments a where a.id=assignment_submissions.assignment_id
      and app.has_permission('assignments.manage', assignment_submissions.tenant_id, assignment_submissions.school_id, a.class_id)))
  with check (app.is_student_owner(student_id)
    or exists (select 1 from public.assignments a where a.id=assignment_submissions.assignment_id
      and app.has_permission('assignments.manage', assignment_submissions.tenant_id, assignment_submissions.school_id, a.class_id)));

create policy documents_read on public.documents for select to myschool_runtime
  using (
    app.has_permission('files.read', tenant_id, school_id, class_id)
    or (student_id is not null and (app.is_student_owner(student_id) or app.is_guardian_of_student(student_id)
      or app.has_permission('students.read', tenant_id, school_id, class_id)))
  );
create policy documents_insert on public.documents for insert to myschool_runtime
  with check (uploaded_by=auth.uid() and (
    app.has_permission('files.upload', tenant_id, school_id, class_id)
    or (student_id is not null and app.is_student_owner(student_id)
      and app.has_permission('assignments.submit', tenant_id, school_id, class_id))
  ));
create policy documents_delete on public.documents for delete to myschool_runtime
  using (app.has_permission('files.upload', tenant_id, school_id, class_id));

create policy fee_plans_read on public.fee_plans for select to myschool_runtime
  using (app.has_permission('fees.read', tenant_id, school_id, null)
    or exists (select 1 from public.student_fee_accounts fa
      where fa.fee_plan_id=fee_plans.id and app.can_access_student(fa.student_id, fee_plans.tenant_id, fee_plans.school_id)));
create policy fee_plans_write on public.fee_plans for all to myschool_runtime
  using (app.has_permission('fees.manage', tenant_id, school_id, null))
  with check (app.has_permission('fees.manage', tenant_id, school_id, null));

create policy student_fee_accounts_read on public.student_fee_accounts for select to myschool_runtime
  using (app.has_permission('fees.read', tenant_id, school_id, null) or app.can_access_student(student_id, tenant_id, school_id));
create policy student_fee_accounts_write on public.student_fee_accounts for all to myschool_runtime
  using (app.has_permission('fees.manage', tenant_id, school_id, null))
  with check (app.has_permission('fees.manage', tenant_id, school_id, null));

create policy fee_installments_read on public.fee_installments for select to myschool_runtime
  using (app.has_permission('fees.read', tenant_id, school_id, null)
    or exists (select 1 from public.student_fee_accounts fa
      where fa.id=fee_installments.fee_account_id and app.can_access_student(fa.student_id, fee_installments.tenant_id, fee_installments.school_id)));
create policy fee_installments_write on public.fee_installments for all to myschool_runtime
  using (app.has_permission('fees.manage', tenant_id, school_id, null))
  with check (app.has_permission('fees.manage', tenant_id, school_id, null));

create policy fee_payments_read on public.fee_payments for select to myschool_runtime
  using (app.has_permission('fees.read', tenant_id, school_id, null)
    or exists (select 1 from public.student_fee_accounts fa
      where fa.id=fee_payments.fee_account_id and app.can_access_student(fa.student_id, fee_payments.tenant_id, fee_payments.school_id)));
create policy fee_payments_write on public.fee_payments for insert to myschool_runtime
  with check (app.has_permission('fees.payments.record', tenant_id, school_id, null));

create policy timetable_configs_read on public.timetable_configs for select to myschool_runtime
  using (app.has_permission('academics.read', tenant_id, school_id, null));
create policy timetable_configs_write on public.timetable_configs for all to myschool_runtime
  using (app.has_permission('academics.manage', tenant_id, school_id, null))
  with check (app.has_permission('academics.manage', tenant_id, school_id, null));
create policy timetable_runs_read on public.timetable_generation_runs for select to myschool_runtime
  using (app.has_permission('academics.read', tenant_id, school_id, null));
create policy timetable_runs_write on public.timetable_generation_runs for all to myschool_runtime
  using (app.has_permission('academics.manage', tenant_id, school_id, null))
  with check (app.has_permission('academics.manage', tenant_id, school_id, null));

-- New Phase 2 tables must not inherit broad Data API access. The mobile/web
-- client uses Supabase only for Auth and Storage; application data goes through NestJS.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Grant only the backend role; the public Supabase Data API remains closed.
grant select, insert, update, delete on all tables in schema public to myschool_runtime;
grant usage, select on all sequences in schema public to myschool_runtime;
grant usage on schema app to myschool_runtime;
grant select, insert, delete on app.user_effective_permissions to myschool_runtime;
grant execute on function app.can_access_student(uuid, uuid, uuid) to myschool_runtime;
grant execute on function app.is_student_owner(uuid) to myschool_runtime;
grant execute on function app.is_guardian_of_student(uuid) to myschool_runtime;
grant execute on function app.can_access_class(uuid, uuid, uuid) to myschool_runtime;
grant execute on function app.has_permission(text, uuid, uuid, uuid) to myschool_runtime;

-- Storage is private by default. Object key format: tenant_uuid/school_uuid/resource_uuid/file_uuid.ext
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('school-files', 'school-files', false, 26214400,
  array['application/pdf','image/png','image/jpeg','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

-- Object path: tenant_uuid/school_uuid/school|class|student/resource_uuid/randomized_file_name
-- Student/parent access is resolved through private link tables; no broad student files.read grant.
create policy school_files_read on storage.objects for select to authenticated
  using (bucket_id='school-files' and (
    (split_part(name,'/',3)='school' and app.has_permission('files.read', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, null))
    or (split_part(name,'/',3)='class' and app.has_permission('files.read', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, split_part(name,'/',4)::uuid))
    or (split_part(name,'/',3)='student' and (
      app.is_student_owner_in_school(split_part(name,'/',4)::uuid, split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid)
      or app.is_guardian_of_student_in_school(split_part(name,'/',4)::uuid, split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid)
      or app.has_permission('students.read', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, null)
    ))
  ));
create policy school_files_insert on storage.objects for insert to authenticated
  with check (bucket_id='school-files' and (
    (split_part(name,'/',3)='school' and app.has_permission('files.upload', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, null))
    or (split_part(name,'/',3)='class' and app.has_permission('files.upload', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, split_part(name,'/',4)::uuid))
    or (split_part(name,'/',3)='student' and app.is_student_owner_in_school(split_part(name,'/',4)::uuid, split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid)
      and app.has_permission('assignments.submit', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, null))
  ));
create policy school_files_update on storage.objects for update to authenticated
  using (bucket_id='school-files' and (
    (split_part(name,'/',3)='school' and app.has_permission('files.upload', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, null))
    or (split_part(name,'/',3)='class' and app.has_permission('files.upload', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, split_part(name,'/',4)::uuid))
  ))
  with check (bucket_id='school-files' and (
    (split_part(name,'/',3)='school' and app.has_permission('files.upload', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, null))
    or (split_part(name,'/',3)='class' and app.has_permission('files.upload', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, split_part(name,'/',4)::uuid))
  ));
create policy school_files_delete on storage.objects for delete to authenticated
  using (bucket_id='school-files' and (
    (split_part(name,'/',3)='school' and app.has_permission('files.upload', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, null))
    or (split_part(name,'/',3)='class' and app.has_permission('files.upload', split_part(name,'/',1)::uuid, split_part(name,'/',2)::uuid, split_part(name,'/',4)::uuid))
  ));

commit;