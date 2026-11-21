begin;

create type public.timetable_entry_status as enum ('draft','published','archived');
create type public.exam_session_status as enum ('draft','scheduled','completed','cancelled');
create type public.grade_publication_status as enum ('pending','approved','rejected','published');
create type public.import_batch_status as enum ('previewed','committed','failed','cancelled');

create table public.school_setup_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  step_key text not null check (step_key in ('school_profile','academic_year','grade_levels','subjects','classes','staff','students','finance')),
  is_completed boolean not null default false,
  notes text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade,
  unique (school_id, step_key)
);

create table public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  academic_year_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  teacher_id uuid not null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  period_number smallint not null check (period_number between 1 and 20),
  starts_at time not null,
  ends_at time not null,
  room_name text,
  status public.timetable_entry_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (academic_year_id, tenant_id, school_id) references public.academic_years(id, tenant_id, school_id) on delete restrict,
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete restrict,
  foreign key (subject_id, tenant_id, school_id) references public.subjects(id, tenant_id, school_id) on delete restrict,
  foreign key (teacher_id, tenant_id, school_id) references public.teachers(id, tenant_id, school_id) on delete restrict,
  check (ends_at > starts_at),
  unique (school_id, academic_year_id, class_id, day_of_week, period_number)
);
create index timetable_teacher_schedule_idx
  on public.timetable_entries(tenant_id, school_id, academic_year_id, teacher_id, day_of_week, starts_at, ends_at);
create index timetable_class_schedule_idx
  on public.timetable_entries(tenant_id, school_id, academic_year_id, class_id, day_of_week, period_number);

create table public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  term_id uuid,
  title text not null,
  exam_type text not null check (exam_type in ('quiz','midterm','final','practical','oral','other')),
  scheduled_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  room_name text,
  max_score numeric(10,2) not null check (max_score > 0),
  status public.exam_session_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, school_id),
  foreign key (class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete restrict,
  foreign key (subject_id, tenant_id, school_id) references public.subjects(id, tenant_id, school_id) on delete restrict,
  foreign key (term_id, tenant_id, school_id) references public.terms(id, tenant_id, school_id) on delete restrict
);
create index exam_sessions_scope_schedule_idx on public.exam_sessions(tenant_id, school_id, scheduled_at);

create table public.exam_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  exam_session_id uuid not null references public.exam_sessions(id) on delete cascade,
  student_id uuid not null,
  seat_number text not null,
  committee_name text,
  invigilator_teacher_id uuid,
  created_at timestamptz not null default now(),
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete restrict,
  foreign key (invigilator_teacher_id, tenant_id, school_id) references public.teachers(id, tenant_id, school_id) on delete restrict,
  foreign key (exam_session_id, tenant_id, school_id) references public.exam_sessions(id, tenant_id, school_id) on delete cascade,
  unique (exam_session_id, student_id),
  unique (exam_session_id, seat_number)
);
create index exam_candidates_student_idx on public.exam_candidates(tenant_id, school_id, student_id);

create table public.grade_publication_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  assessment_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status public.grade_publication_status not null default 'pending',
  request_notes text,
  review_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (assessment_id, tenant_id, school_id) references public.assessments(id, tenant_id, school_id) on delete restrict
);
create unique index grade_publication_pending_unique on public.grade_publication_requests(assessment_id) where status='pending';
create index grade_publication_scope_idx on public.grade_publication_requests(tenant_id, school_id, status, created_at desc);

create table public.school_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  entity_type text not null check (entity_type in ('students','teachers')),
  file_name text not null,
  status public.import_batch_status not null default 'previewed',
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  created_rows integer not null default 0 check (created_rows >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade
);
create index school_import_batches_scope_idx on public.school_import_batches(tenant_id, school_id, created_at desc);

create table public.school_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.school_import_batches(id) on delete cascade,
  tenant_id uuid not null,
  school_id uuid not null,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null,
  normalized_data jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  status text not null check (status in ('valid','invalid','created','failed')),
  created_entity_id uuid,
  created_at timestamptz not null default now(),
  foreign key (school_id, tenant_id) references public.schools(id, tenant_id) on delete cascade,
  unique (batch_id, row_number)
);
create index school_import_rows_batch_idx on public.school_import_rows(batch_id, row_number);

create table public.student_academic_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  school_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid,
  event_type text not null check (event_type in ('enrolled','transferred','repeated_year','graduated','withdrawn','reactivated')),
  from_class_id uuid,
  to_class_id uuid,
  event_date date not null default current_date,
  notes text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (student_id, tenant_id, school_id) references public.students(id, tenant_id, school_id) on delete restrict,
  foreign key (academic_year_id, tenant_id, school_id) references public.academic_years(id, tenant_id, school_id) on delete restrict,
  foreign key (from_class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete restrict,
  foreign key (to_class_id, tenant_id, school_id) references public.classes(id, tenant_id, school_id) on delete restrict
);
create index student_academic_events_history_idx on public.student_academic_events(tenant_id, school_id, student_id, event_date desc);

insert into public.permissions(key, description) values
  ('school.setup.read','Read school setup progress'),
  ('school.setup.manage','Update school setup progress'),
  ('timetable.read','Read timetables'),
  ('timetable.manage','Create and publish timetables'),
  ('exams.read','Read exam schedules and candidate lists'),
  ('exams.manage','Create exam schedules and manage candidate lists'),
  ('grades.publications.manage','Review grade publication requests'),
  ('imports.manage','Preview and commit approved student and teacher imports'),
  ('finance.reports.read','Read school finance reports')
on conflict (key) do nothing;

with mapping(role_key, permission_key) as (values
  ('tenant_owner','school.setup.read'),('tenant_owner','school.setup.manage'),('tenant_owner','timetable.read'),('tenant_owner','timetable.manage'),('tenant_owner','exams.read'),('tenant_owner','exams.manage'),('tenant_owner','grades.publications.manage'),('tenant_owner','imports.manage'),('tenant_owner','finance.reports.read'),
  ('school_owner','school.setup.read'),('school_owner','school.setup.manage'),('school_owner','timetable.read'),('school_owner','timetable.manage'),('school_owner','exams.read'),('school_owner','exams.manage'),('school_owner','grades.publications.manage'),('school_owner','imports.manage'),('school_owner','finance.reports.read'),
  ('school_admin','school.setup.read'),('school_admin','school.setup.manage'),('school_admin','timetable.read'),('school_admin','timetable.manage'),('school_admin','exams.read'),('school_admin','exams.manage'),('school_admin','grades.publications.manage'),('school_admin','imports.manage'),('school_admin','finance.reports.read'),
  ('supervisor','school.setup.read'),('supervisor','timetable.read'),('supervisor','exams.read'),('supervisor','grades.publications.manage'),
  ('teacher','timetable.read'),('teacher','exams.read'),('teacher','exams.manage'),
  ('student','timetable.read'),('student','exams.read'),
  ('parent','timetable.read'),('parent','exams.read'),
  ('finance','finance.reports.read')
)
insert into public.role_permissions(role_id, permission_id)
select r.id,p.id from mapping m join public.roles r on r.key=m.role_key join public.permissions p on p.key=m.permission_key
on conflict do nothing;

alter table public.school_setup_steps enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.exam_candidates enable row level security;
alter table public.grade_publication_requests enable row level security;
alter table public.school_import_batches enable row level security;
alter table public.school_import_rows enable row level security;
alter table public.student_academic_events enable row level security;

create policy school_setup_read on public.school_setup_steps for select to myschool_runtime
  using (app.has_permission('school.setup.read',tenant_id,school_id,null) or app.has_permission('schools.manage',tenant_id,school_id,null));
create policy school_setup_write on public.school_setup_steps for all to myschool_runtime
  using (app.has_permission('school.setup.manage',tenant_id,school_id,null))
  with check (app.has_permission('school.setup.manage',tenant_id,school_id,null));

create policy timetable_read on public.timetable_entries for select to myschool_runtime
  using (app.can_access_school(tenant_id,school_id) and
    (app.has_permission('timetable.read',tenant_id,school_id,class_id) or app.has_permission('academics.read',tenant_id,school_id,class_id)));
create policy timetable_write on public.timetable_entries for all to myschool_runtime
  using (app.has_permission('timetable.manage',tenant_id,school_id,class_id))
  with check (app.has_permission('timetable.manage',tenant_id,school_id,class_id));

create policy exam_sessions_read on public.exam_sessions for select to myschool_runtime
  using (app.can_access_school(tenant_id,school_id) and
    (app.has_permission('exams.read',tenant_id,school_id,class_id) or app.has_permission('academics.read',tenant_id,school_id,class_id)));
create policy exam_sessions_write on public.exam_sessions for all to myschool_runtime
  using (app.has_permission('exams.manage',tenant_id,school_id,class_id))
  with check (app.has_permission('exams.manage',tenant_id,school_id,class_id));

create policy exam_candidates_read on public.exam_candidates for select to myschool_runtime
  using (app.can_access_student(student_id,tenant_id,school_id) or exists (
    select 1 from public.exam_sessions es where es.id=exam_candidates.exam_session_id and es.tenant_id=exam_candidates.tenant_id and es.school_id=exam_candidates.school_id
      and (app.has_permission('exams.read',es.tenant_id,es.school_id,es.class_id)
        or app.has_permission('exams.manage',es.tenant_id,es.school_id,es.class_id))));
create policy exam_candidates_write on public.exam_candidates for all to myschool_runtime
  using (exists(select 1 from public.exam_sessions es where es.id=exam_candidates.exam_session_id and es.tenant_id=exam_candidates.tenant_id and es.school_id=exam_candidates.school_id
    and app.has_permission('exams.manage',es.tenant_id,es.school_id,es.class_id)))
  with check (exists(select 1 from public.exam_sessions es where es.id=exam_candidates.exam_session_id and es.tenant_id=exam_candidates.tenant_id and es.school_id=exam_candidates.school_id
    and app.has_permission('exams.manage',es.tenant_id,es.school_id,es.class_id)));

create policy grade_publication_read on public.grade_publication_requests for select to myschool_runtime
  using (exists(select 1 from public.assessments a where a.id=grade_publication_requests.assessment_id and a.tenant_id=grade_publication_requests.tenant_id and a.school_id=grade_publication_requests.school_id
    and (app.has_permission('grades.read',a.tenant_id,a.school_id,a.class_id)
      or app.has_permission('grades.publications.manage',a.tenant_id,a.school_id,a.class_id))));
create policy grade_publication_insert on public.grade_publication_requests for insert to myschool_runtime
  with check (requested_by=auth.uid() and exists(select 1 from public.assessments a where a.id=grade_publication_requests.assessment_id and a.tenant_id=grade_publication_requests.tenant_id and a.school_id=grade_publication_requests.school_id
    and app.has_permission('grades.manage',a.tenant_id,a.school_id,a.class_id)));
create policy grade_publication_review on public.grade_publication_requests for update to myschool_runtime
  using (app.has_permission('grades.publications.manage',tenant_id,school_id,null) or app.has_permission('grades.publish',tenant_id,school_id,null))
  with check (app.has_permission('grades.publications.manage',tenant_id,school_id,null) or app.has_permission('grades.publish',tenant_id,school_id,null));

create policy school_import_batches_read on public.school_import_batches for select to myschool_runtime
  using (app.has_permission('imports.manage',tenant_id,school_id,null));
create policy school_import_batches_write on public.school_import_batches for all to myschool_runtime
  using (app.has_permission('imports.manage',tenant_id,school_id,null))
  with check (app.has_permission('imports.manage',tenant_id,school_id,null));
create policy school_import_rows_read on public.school_import_rows for select to myschool_runtime
  using (exists(select 1 from public.school_import_batches b where b.id=batch_id and app.has_permission('imports.manage',b.tenant_id,b.school_id,null)));
create policy school_import_rows_write on public.school_import_rows for all to myschool_runtime
  using (exists(select 1 from public.school_import_batches b where b.id=batch_id and app.has_permission('imports.manage',b.tenant_id,b.school_id,null)))
  with check (exists(select 1 from public.school_import_batches b where b.id=batch_id and app.has_permission('imports.manage',b.tenant_id,b.school_id,null)));

create policy student_academic_events_read on public.student_academic_events for select to myschool_runtime
  using (app.can_access_student(student_id,tenant_id,school_id) or app.has_permission('students.read',tenant_id,school_id,null));
create policy student_academic_events_write on public.student_academic_events for all to myschool_runtime
  using (app.has_permission('students.manage',tenant_id,school_id,null))
  with check (app.has_permission('students.manage',tenant_id,school_id,null));

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to myschool_runtime;
grant usage, select on all sequences in schema public to myschool_runtime;
alter default privileges in schema public grant select, insert, update, delete on tables to myschool_runtime;
alter default privileges in schema public grant usage, select on sequences to myschool_runtime;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

commit;