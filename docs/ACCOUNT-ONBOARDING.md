# My School — school onboarding and account invitations

**Status:** implementation in progress on `feature/platform-expansion-plan`; not deployed.

## Why this path exists

A row in `students`, `teachers`, or `schools` is not itself a login account. Production has no `auth.users` trigger that creates `public.profiles`, and the old browser forms wrote roster rows without Auth identities, memberships, or role assignments.

The browser must never receive the Supabase service-role key. All provisioning is therefore handled by the `school-onboarding` Edge Function with JWT verification enabled.

## Required environment and Auth email setup

The Edge Function requires the secret `APP_REDIRECT_URL` before it will send any invite. Set it to the exact HTTPS URL of the deployed My School frontend, for example `https://app.example.com/`. This value is not guessed in code: it must match the actual deployed frontend and must also be listed in Supabase Auth's allowed redirect URLs.

The function appends `?invite=1` to this redirect. Supabase Auth's **Invite User** email template must use the standard `{{ .ConfirmationURL }}` link so Supabase can verify the invite and return the session to the app. Configure and test SMTP/email delivery for the real domain before sending production invitations. Supabase's email-template guide: https://supabase.com/docs/guides/auth/auth-email-templates

The Auth user metadata includes `myschool_invite: true` solely as a user-experience marker for the password-setup screen. It is user-editable and is never used to authorize access. The invitee must set a password successfully before the frontend accepts their own pending tenant/school memberships; existing RLS self-accept policies remain the authorization boundary.

## API

Endpoint:

`POST {SUPABASE_URL}/functions/v1/school-onboarding`

The request must carry a valid Supabase user JWT in `Authorization: Bearer <access-token>`. The Edge Function validates that JWT using Supabase Auth, then reloads the caller's role assignments and active memberships server-side before deciding which operation is allowed.

### Create a tenant and invite its first owner

```json
{
  "action": "create_tenant",
  "tenant": {
    "legal_name": "Example Education",
    "display_name": "Example Education",
    "slug": "example-education",
    "default_locale": "ar",
    "timezone": "Africa/Cairo"
  },
  "owner": {
    "email": "owner@example.com",
    "display_name": "Tenant Owner"
  }
}
```

Requires the caller's platform-scoped `platform.tenants.manage` permission. The invited person receives the `tenant_owner` tenant-scoped role.

### Create a school and invite its first owner

```json
{
  "action": "create_school",
  "tenant_id": "TENANT_UUID",
  "school": {
    "name": "Example School",
    "slug": "example-school",
    "default_locale": "ar",
    "timezone": "Africa/Cairo"
  },
  "owner": {
    "email": "school-owner@example.com",
    "display_name": "School Owner"
  }
}
```

Requires platform `platform.schools.manage` or tenant-scoped `schools.manage`. The invited person receives `school_owner` at that school.

### Invite a member to an existing school

```json
{
  "action": "invite_member",
  "tenant_id": "TENANT_UUID",
  "school_id": "SCHOOL_UUID",
  "email": "teacher@example.com",
  "display_name": "Example Teacher",
  "role_key": "teacher",
  "class_ids": ["CLASS_UUID"],
  "roster": {
    "first_name": "Example",
    "last_name": "Teacher",
    "employee_number": "T-001",
    "phone": "+201000000000"
  }
}
```

Currently supported role keys are `school_admin`, `school_owner`, `supervisor`, `teacher`, `student`, and `parent`. The production role catalog has no `assistant` role; that role cannot be granted until it is deliberately added and permission-reviewed.

Role-specific roster data:
- `student`: requires `student_number`, `first_name`, `last_name`, and at least one `class_id`; optional `middle_name`, `date_of_birth`, and `admission_date`. Each selected class and its academic year must be active and belong to the same school. The database permits only one active enrollment per student per academic year, so the invite function rejects choosing two classes from the same year. It creates an active `student_enrollments` row using each selected class's academic year.
- `teacher`: requires first/last name and at least one valid `class_id`; optional `employee_number` and `phone`. Each assigned class gets a class-scoped teacher role.
- `parent`: requires first/last name, `relationship`, and one or more `student_ids` belonging to the same tenant and school. The Guardian profile and child links are provisioned together.
- `school_admin`, `school_owner`, and `supervisor`: require school membership/role but no separate roster row.

The server validates school/class/student ownership before invitation. It does not trust user-supplied role IDs, tenant context, school context, or metadata for authorization.

## Invitation lifecycle

1. The Edge Function validates the caller, allowed role, target tenant/school, requested class/child IDs, and existing roster uniqueness.
2. Supabase Auth Admin sends an invite email and returns the new Auth user ID. The redirect is the configured `APP_REDIRECT_URL` with `?invite=1`.
3. The function creates the matching profile, invited tenant/school memberships, scoped role assignments, and applicable roster/guardian relationships.
4. For students, the function creates a class enrollment only after verifying that the class belongs to the same school and loading its actual academic year.
5. The function writes an audit event without storing the invitation token or plaintext credentials.
6. The invitee verifies the email invitation and returns to the app. The frontend requires the invitee to choose a password and successfully updates the Auth user before opening a workspace.
7. Only then does the frontend accept that user's own `invited` tenant/school memberships. Existing RLS self-accept policies govern these updates; the UI does not activate another user's membership.

## Authorization model

- The caller's permission rows are derived from `membership_roles → roles → role_permissions → permissions`, plus active membership scopes.
- Tenant and school memberships must be active to grant scoped authority.
- A school administrator may invite standard roles in their school, but cannot promote another user to `school_admin` or `school_owner`. Those elevated grants require platform authority or tenant-level user-management authority.
- Teachers must be assigned to active classes in the requested school and active academic years.
- Student enrollments are created only in active classes and active academic years.
- Parent-child links are checked against student records in the same school.
- Platform role keys are never accepted by the school-member endpoint.

## Current limitations and release gates

- Invitations currently target **new email addresses**. Linking an already registered Auth user to another school/tenant is not implemented yet; the function returns `ACCOUNT_ALREADY_EXISTS_USE_ACCOUNT_LINKING`. This is a required follow-up for families and staff who already use My School.
- `APP_REDIRECT_URL` is mandatory and is not yet configured. It must be set only after the real frontend domain is deployed and added to Supabase Auth's allowed redirect URLs.
- The Supabase Auth Invite User email template and SMTP delivery have not yet been tested for the production domain.
- Auth invitation delivery and multiple PostgREST writes cannot form one distributed database transaction. The Edge Function performs best-effort compensation if provisioning fails, but an invite email may already have been sent before a later write fails. A database transaction/RPC plus a durable invitation outbox is required before public launch.
- Cleanup failures are logged as a critical server error and must be reconciled before retrying a failed invitation.
- The Edge Function is branch-only. Do not deploy it to Production until a private full backup/restore and isolated SQL validation are complete, and the invitation/acceptance workflow passes end-to-end and negative-authorization tests.
- Keep the Supabase Edge Function JWT verification enabled. Never expose `SUPABASE_SERVICE_ROLE_KEY`, Auth Admin access, or internal function secrets in browser code.

## Related release work

Tracked in [Issue #14](https://github.com/lopicotion-coder/olic/issues/14). This document describes the current branch implementation and the remaining release requirements; it is not a production-ready guarantee.
