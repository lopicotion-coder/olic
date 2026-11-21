begin;

-- Prevent direct Data API reads of the student national ID.
revoke select (national_id) on public.students from authenticated, myschool_runtime;

-- Parent enrollment requests also carry the national ID and should not be
-- readable directly from browser-context roles.
revoke select (national_id) on public.student_enrollment_requests from authenticated, myschool_runtime;

comment on column public.students.national_id is
  'Sensitive identity field. Direct reads are restricted to server-side SECURITY DEFINER workflows only.';

comment on column public.student_enrollment_requests.national_id is
  'Sensitive identity field. Direct reads are restricted to server-side SECURITY DEFINER workflows only.';

commit;
