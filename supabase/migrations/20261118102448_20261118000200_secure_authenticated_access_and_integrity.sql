-- My School: expose existing RLS rules to authenticated users without
-- inheriting the internal myschool_runtime role or its private RPC surface.

BEGIN;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA app TO authenticated;

-- Scope rows are derived from tenant_memberships/school_memberships. Users may
-- read their own derived scopes but must not activate or rewrite them directly.
DROP POLICY IF EXISTS membership_scopes_self_accept ON app.user_membership_scopes;

-- Copy only the existing table-level DML grants from the restricted runtime
-- role. RLS remains enabled on every public base table and policy targets are
-- extended separately below. No default privileges are granted to future tables.
DO $grant_tables$
DECLARE
  g record;
BEGIN
  FOR g IN
    SELECT rg.table_schema, rg.table_name, rg.privilege_type
    FROM information_schema.role_table_grants AS rg
    JOIN information_schema.tables AS t
      ON t.table_schema = rg.table_schema
     AND t.table_name = rg.table_name
    WHERE rg.grantee = 'myschool_runtime'
      AND rg.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND rg.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  LOOP
    EXECUTE format(
      'GRANT %s ON TABLE %I.%I TO authenticated',
      g.privilege_type, g.table_schema, g.table_name
    );
  END LOOP;
END;
$grant_tables$;

-- Copy sequence USAGE/SELECT only where the runtime role already has it.
DO $grant_sequences$
DECLARE
  s record;
BEGIN
  FOR s IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
      AND has_sequence_privilege(
        'myschool_runtime', format('%I.%I', sequence_schema, sequence_name), 'USAGE'
      )
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO authenticated', s.sequence_schema, s.sequence_name);
  END LOOP;
END;
$grant_sequences$;

-- Add authenticated to every existing public policy which is currently
-- scoped to myschool_runtime. Preserve every other role already on the policy.
DO $extend_rls_policies$
DECLARE
  p record;
  role_list text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'myschool_runtime'::name = ANY (roles)
  LOOP
    SELECT string_agg(
      CASE WHEN role_name = 'public'::name THEN 'PUBLIC' ELSE quote_ident(role_name::text) END,
      ', ' ORDER BY role_name
    )
    INTO role_list
    FROM (
      SELECT DISTINCT role_name
      FROM unnest(p.roles || ARRAY['authenticated'::name]) AS role(role_name)
    ) AS all_roles;

    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO %s',
      p.policyname, p.schemaname, p.tablename, role_list
    );
  END LOOP;
END;
$extend_rls_policies$;

-- Grant EXECUTE to authenticated only for app-schema helpers used by RLS
-- expressions, plus their transitive app-schema helper dependencies.
-- This avoids inheriting unrelated SECURITY DEFINER RPC functions.
DO $grant_rls_helpers$
DECLARE
  f record;
BEGIN
  FOR f IN
    WITH RECURSIVE needed_functions(function_name) AS (
      SELECT DISTINCT (m)[1]
      FROM pg_policies AS p
      CROSS JOIN LATERAL regexp_matches(
        COALESCE(p.qual, '') || ' ' || COALESCE(p.with_check, ''),
        'app\.([a-zA-Z0-9_]+)\s*\(', 'g'
      ) AS m
      WHERE p.schemaname = 'public'
        AND 'myschool_runtime'::name = ANY (p.roles)
      UNION
      SELECT DISTINCT (m)[1]
      FROM needed_functions AS nf
      JOIN pg_proc AS parent_fn ON parent_fn.proname = nf.function_name
      JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent_fn.pronamespace
                                     AND parent_ns.nspname = 'app'
      CROSS JOIN LATERAL regexp_matches(
        pg_get_functiondef(parent_fn.oid),
        'app\.([a-zA-Z0-9_]+)\s*\(', 'g'
      ) AS m
    )
    SELECT DISTINCT p.proname, oidvectortypes(p.proargtypes) AS args
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app'
      AND p.proname IN (SELECT function_name FROM needed_functions)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION app.%I(%s) TO authenticated', f.proname, f.args);
  END LOOP;
END;
$grant_rls_helpers$;

-- A membership's identity/scope is immutable after creation. Moving a user
-- between schools/tenants must be an explicit remove-and-recreate operation.
CREATE OR REPLACE FUNCTION app.guard_school_membership_scope_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'School membership identity and scope are immutable';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_school_membership_scope_immutable ON public.school_memberships;
CREATE TRIGGER guard_school_membership_scope_immutable
BEFORE UPDATE ON public.school_memberships
FOR EACH ROW EXECUTE FUNCTION app.guard_school_membership_scope_immutable();
REVOKE ALL ON FUNCTION app.guard_school_membership_scope_immutable() FROM PUBLIC, anon, authenticated, myschool_runtime;

CREATE OR REPLACE FUNCTION app.guard_tenant_membership_scope_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Tenant membership identity and scope are immutable';
  END IF;

  IF NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    IF OLD.status <> 'invited' OR NEW.status <> 'active' OR OLD.joined_at IS NOT NULL THEN
      RAISE EXCEPTION 'Membership joined_at may only be set during invitation acceptance';
    END IF;
    NEW.joined_at := now();
  ELSIF OLD.status = 'invited' AND NEW.status = 'active' AND OLD.joined_at IS NULL THEN
    NEW.joined_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_tenant_membership_scope_immutable ON public.tenant_memberships;
CREATE TRIGGER guard_tenant_membership_scope_immutable
BEFORE UPDATE ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION app.guard_tenant_membership_scope_immutable();
REVOKE ALL ON FUNCTION app.guard_tenant_membership_scope_immutable() FROM PUBLIC, anon, authenticated, myschool_runtime;

-- Students may create/edit a draft and submit once (or resubmit a returned
-- assignment). They cannot set grades, grading metadata, arbitrary statuses,
-- backdate submissions, edit work after submission, or delete submitted work.
CREATE OR REPLACE FUNCTION app.guard_assignment_submission_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
DECLARE
  v_assignment_id uuid;
  v_tenant_id uuid;
  v_school_id uuid;
  v_student_id uuid;
  v_class_id uuid;
  v_due_at timestamptz;
  v_allow_late boolean;
  v_assignment_status text;
  v_is_owner boolean;
  v_can_manage boolean;
BEGIN
  -- Trusted server workers use service_role and do not carry an end-user JWT.
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_assignment_id := OLD.assignment_id;
    v_tenant_id := OLD.tenant_id;
    v_school_id := OLD.school_id;
    v_student_id := OLD.student_id;
  ELSE
    IF TG_OP = 'INSERT' THEN
      v_assignment_id := NEW.assignment_id;
      v_tenant_id := NEW.tenant_id;
      v_school_id := NEW.school_id;
      v_student_id := NEW.student_id;
    ELSE
      v_assignment_id := OLD.assignment_id;
      v_tenant_id := OLD.tenant_id;
      v_school_id := OLD.school_id;
      v_student_id := OLD.student_id;
    END IF;
  END IF;

  SELECT a.class_id, a.due_at, a.allow_late_submission, a.status::text
    INTO v_class_id, v_due_at, v_allow_late, v_assignment_status
  FROM public.assignments AS a
  WHERE a.id = v_assignment_id
    AND a.tenant_id = v_tenant_id
    AND a.school_id = v_school_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment was not found in the supplied school scope';
  END IF;

  v_is_owner := app.is_student_owner(v_student_id);
  v_can_manage := app.has_permission('assignments.manage', v_tenant_id, v_school_id, v_class_id);

  -- Non-students are still governed by the existing RLS policy (teacher/admin
  -- permissions). The trigger only narrows a student's self-service path.
  IF NOT v_is_owner OR v_can_manage THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Only a draft submission may be deleted by its student';
    END IF;
    RETURN OLD;
  END IF;

  IF v_assignment_status <> 'published' THEN
    RAISE EXCEPTION 'Students may only submit work for published assignments';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'submitted') THEN
      RAISE EXCEPTION 'Invalid initial student submission status';
    END IF;
    IF NEW.score IS NOT NULL OR NEW.feedback IS NOT NULL
       OR NEW.graded_by IS NOT NULL OR NEW.graded_at IS NOT NULL THEN
      RAISE EXCEPTION 'Students cannot set grading fields';
    END IF;

    NEW.created_at := now();
    NEW.updated_at := now();
    IF NEW.status = 'draft' THEN
      NEW.submitted_at := NULL;
    ELSE
      IF v_due_at IS NOT NULL AND now() > v_due_at AND NOT v_allow_late THEN
        RAISE EXCEPTION 'Late submission is not enabled for this assignment';
      END IF;
      IF v_due_at IS NOT NULL AND now() > v_due_at THEN
        NEW.status := 'late';
      END IF;
      NEW.submitted_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: a student cannot reassign the row, change its school, or modify
  -- any grading fields even when the row is otherwise visible to that student.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.score IS DISTINCT FROM OLD.score
     OR NEW.feedback IS DISTINCT FROM OLD.feedback
     OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at THEN
    RAISE EXCEPTION 'Students cannot change submission identity or grading fields';
  END IF;

  IF OLD.status NOT IN ('draft', 'returned') THEN
    RAISE EXCEPTION 'A submitted or graded assignment cannot be edited by the student';
  END IF;
  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Invalid draft submission state transition';
  END IF;
  IF OLD.status = 'returned' AND NEW.status NOT IN ('returned', 'submitted') THEN
    RAISE EXCEPTION 'Invalid returned submission state transition';
  END IF;

  NEW.updated_at := now();
  IF NEW.status = 'submitted' THEN
    IF v_due_at IS NOT NULL AND now() > v_due_at AND NOT v_allow_late THEN
      RAISE EXCEPTION 'Late submission is not enabled for this assignment';
    END IF;
    IF v_due_at IS NOT NULL AND now() > v_due_at THEN
      NEW.status := 'late';
    END IF;
    NEW.submitted_at := now();
  ELSE
    NEW.submitted_at := OLD.submitted_at;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_assignment_submission_mutation ON public.assignment_submissions;
CREATE TRIGGER guard_assignment_submission_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION app.guard_assignment_submission_mutation();
REVOKE ALL ON FUNCTION app.guard_assignment_submission_mutation() FROM PUBLIC, anon, authenticated, myschool_runtime;

-- AI requests, responses, token usage and budget reservations are generated by
-- trusted backend workers, never by a browser-supplied row.
DROP POLICY IF EXISTS ai_requests_write ON public.ai_requests;
DROP POLICY IF EXISTS ai_requests_update ON public.ai_requests;
REVOKE INSERT, UPDATE, DELETE ON public.ai_requests FROM myschool_runtime, authenticated;

DROP POLICY IF EXISTS ai_responses_write ON public.ai_responses;
REVOKE INSERT, UPDATE, DELETE ON public.ai_responses FROM myschool_runtime, authenticated;

DROP POLICY IF EXISTS ai_usage_write ON public.ai_usage;
REVOKE INSERT, UPDATE, DELETE ON public.ai_usage FROM myschool_runtime, authenticated;

DROP POLICY IF EXISTS ai_budget_reservations_insert ON public.ai_budget_reservations;
DROP POLICY IF EXISTS ai_budget_reservations_delete ON public.ai_budget_reservations;
REVOKE INSERT, UPDATE, DELETE ON public.ai_budget_reservations FROM myschool_runtime, authenticated;

-- SLA timestamps and budgets are system-owned. Requesters must not create an
-- SLA row or rewrite due/response/breach timestamps from the client.
DROP POLICY IF EXISTS ticket_slas_creator_insert ON public.ticket_slas;
DROP POLICY IF EXISTS ticket_slas_requester_cycle_update ON public.ticket_slas;
REVOKE INSERT, DELETE ON public.ticket_slas FROM myschool_runtime, authenticated;

COMMIT;