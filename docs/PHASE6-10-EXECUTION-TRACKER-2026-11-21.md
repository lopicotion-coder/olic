# My School — Phase 6–10 Execution Tracker
Snapshot: 2026-11-21  
Working branch: `feature/phase6-10-completion-2026-11-21`  
Release policy: zero-budget; no paid staging, provider calls, or production deployment without explicit approval.

## What this branch adds

- Reconstructed the 41 SQL migrations recorded by the live Supabase migration ledger into timestamped source files under `supabase/migrations/`.
- Updated `applied-history.json` to capture all 41 production-applied versions, names, hosted-ledger SQL lengths and MD5 references.
- Added an explicit fidelity warning: these files reconstruct the stored executed SQL statement arrays; original source comments, formatting and client-only directives are not guaranteed to be recoverable.
- Added an atomic academic-year rollover RPC with per-school transaction locking, optimistic concurrency, audit logging, and protected column privileges.
- Updated the school setup UI to create planned/active years and call the rollover RPC rather than writing `is_current` or `status` directly.
- Added PostgreSQL integration tests for permission checks, scope isolation, current-year transitions, idempotency, stale clients, and protected write columns.
- Added the new database test to the GitHub Actions database-security workflow.

## Phase status

### Phase 6 — Core completion

**Partially implemented / acceptance pending**
- Existing frontend role and access model is in `frontend/`; GitHub CI currently validates the Vite build and access-control tests.
- Academic-year rollover is now implemented on this branch.
- Student/class content RLS hardening and grade-score integrity migration/tests are already present on `develop`; their deployment to live Production remains blocked by the backup/release gate.
- Sensitive `national_id` column grants have a source migration and regression test; the live Production grants are still open until that migration is applied.
- Student and teacher account creation remains intentionally disabled in the browser until a secure Auth + Profile + membership + role + class-assignment workflow is complete.
- The CSV import wizard, full school setup wizard, and academic-year rollover migration still require CI and acceptance verification.

### Phase 7 — Communication completion

**Foundation present; delivery acceptance pending**
- Communication, conversations, notification preferences and ticket/SLA structures exist.
- End-to-end email/push delivery, bounce/failed-delivery recovery, and school/parent/teacher acceptance flows must be verified before describing communications as production-ready.

### Phase 8 — AI and learning intelligence

**Backend source present; deliberately not activated**
- The protected AI Gateway/Worker, tenant budgets, queueing, curriculum retrieval and objective adaptive-practice components exist in source.
- Production has no approved AI provider routes, budgets or provider credentials. No live paid model call is enabled.
- Standard PDF text extraction is supported in source. OCR, diagram understanding and written-response grading are not implemented.
- Question-bank browser delivery and a complete AI Tutor/Teacher/Parent UI still need end-to-end acceptance.
- Any OpenAI credential must be stored only as a server-side secret; never in frontend variables or source control.

### Phase 9 — Advanced platform

**Partial**
- Billing/subscription and backup/restore workflow records exist, but a working payment gateway and verified full disaster-recovery executor are not established by the presence of those records.
- Offline/PWA sync, cross-device conflict resolution and a complete restore drill still need implementation/verification.
- Search foundations exist; semantic retrieval must be tested end to end with approved curriculum sources.

### Phase 10 — Release and operations

**Not release-approved**
- `develop` is the integration source; `main`/the live Vercel deployment is not yet the reviewed My School frontend release.
- Production migration history is now recorded in source, but a clean replay has not yet been verified.
- No isolated Supabase staging database is available under the zero-budget constraint.
- Production migrations, Edge Function replacements and Vercel promotion remain paused until backup, replay, RLS and role-based journey gates pass.
- The live app currently has no school/student fixture data, so actual school workflows have not been accepted against two isolated tenants.

## Mandatory acceptance gates

1. GitHub Actions frontend, Edge Function and database-security workflows pass for this branch.
2. Run the full 41-migration chain plus branch-only migrations on a disposable Supabase-compatible environment; resolve every replay issue.
3. Verify student/parent/teacher/admin cross-school isolation, class-specific content visibility, grades, and private file access with positive and negative tests.
4. Complete and verify the manual logical dump procedure; document its Auth/Storage limits and perform a restore drill where supported.
5. Complete Auth invitation, existing-user enrollment, recovery, SMTP and onboarding idempotency tests.
6. Complete role-based browser journeys for Owner, School Admin, Supervisor, Teacher, Student and Parent; remove or finish intentionally disabled actions.
7. Complete notification delivery, AI Gateway/Worker queueing, model budgets, source ingestion and question delivery in an isolated environment.
8. Complete billing, offline, backup, monitoring, performance and accessibility acceptance.
9. Build and deploy only a reviewed release commit; validate Vercel preview with non-production data before any school goes live.

## Current non-actions / safety boundary

- No production migration was applied as part of this branch.
- No production Vercel deployment or `main` change was made.
- The previously deployed AI Gateway and Worker remain fail-closed until the reviewed protected implementations, internal tokens, budgets and scheduler are configured.
- No OpenAI API key, database password, service-role key, worker token, or private backup is stored in this repository.
- No paid staging resource or external AI request was created.

A phase is complete only after its implementation, automated tests, security review, and role-based acceptance pass. A directory, table, controller or mock UI alone does not count as completion.
