begin;

-- Remove direct table-level SELECT from browser-context roles so the
-- national_id column can be withheld explicitly.
revoke select on public.students from authenticated, myschool_runtime;
grant select (
  id,
  tenant_id,
  school_id,
  campus_id,
  profile_id,
  student_number,
  first_name,
  middle_name,
  last_name,
  date_of_birth,
  admission_date,
  status,
  created_at,
  updated_at,
  student_username,
  contact_email,
  contact_phone
) on public.students to authenticated, myschool_runtime;

revoke select on public.student_enrollment_requests from authenticated, myschool_runtime;
grant select (
  id,
  tenant_id,
  school_id,
  user_id,
  student_number,
  first_name,
  middle_name,
  last_name,
  date_of_birth,
  status,
  reviewed_by,
  reviewed_at,
  student_id,
  created_at,
  student_email,
  student_phone,
  requested_grade_level_id,
  relationship
) on public.student_enrollment_requests to authenticated, myschool_runtime;

comment on column public.students.national_id is
  'Sensitive identity field. Direct reads are restricted to server-side SECURITY DEFINER workflows only.';

comment on column public.student_enrollment_requests.national_id is
  'Sensitive identity field. Direct reads are restricted to server-side SECURITY DEFINER workflows only.';

commit;
