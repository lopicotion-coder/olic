begin;

-- Cover every foreign key on the newly added enrollment/recovery tables.
create index if not exists school_join_codes_school_tenant_fk_idx on public.school_join_codes(school_id,tenant_id);
create index if not exists school_join_codes_created_by_fk_idx on public.school_join_codes(created_by);
create index if not exists student_activation_codes_student_scope_fk_idx on public.student_activation_codes(student_id,tenant_id,school_id);
create index if not exists student_activation_codes_import_batch_fk_idx on public.student_activation_codes(import_batch_id);
create index if not exists student_activation_codes_redeemed_by_fk_idx on public.student_activation_codes(redeemed_by);
create index if not exists student_activation_codes_created_by_fk_idx on public.student_activation_codes(created_by);
create index if not exists student_enrollment_requests_school_tenant_fk_idx on public.student_enrollment_requests(school_id,tenant_id);
create index if not exists student_enrollment_requests_student_scope_fk_idx on public.student_enrollment_requests(student_id,tenant_id,school_id);
create index if not exists student_enrollment_requests_reviewed_by_fk_idx on public.student_enrollment_requests(reviewed_by);
create index if not exists student_password_reset_codes_student_scope_fk_idx on public.student_password_reset_codes(student_id,tenant_id,school_id);
create index if not exists student_password_reset_codes_issued_by_fk_idx on public.student_password_reset_codes(issued_by);

-- Avoid per-row auth.uid() evaluation in enrollment and recovery RLS policies.
drop policy if exists student_enrollment_requests_read on public.student_enrollment_requests;
create policy student_enrollment_requests_read on public.student_enrollment_requests for select to myschool_runtime
  using (user_id=(select auth.uid()) or app.has_permission('students.manage',tenant_id,school_id,null));

drop policy if exists student_password_reset_codes_issuer_read on public.student_password_reset_codes;
create policy student_password_reset_codes_issuer_read on public.student_password_reset_codes for select to myschool_runtime
  using (issued_by=(select auth.uid()) or app.has_permission('students.manage',tenant_id,school_id,null));

drop policy if exists student_password_reset_codes_issue on public.student_password_reset_codes;
create policy student_password_reset_codes_issue on public.student_password_reset_codes for insert to myschool_runtime
  with check (
    issued_by=(select auth.uid()) and exists (
      select 1 from public.student_enrollments e
      where e.student_id=student_password_reset_codes.student_id
        and e.tenant_id=student_password_reset_codes.tenant_id
        and e.school_id=student_password_reset_codes.school_id
        and e.status='active'
        and app.has_permission('students.password_reset.issue',e.tenant_id,e.school_id,e.class_id)
    )
  );

commit;