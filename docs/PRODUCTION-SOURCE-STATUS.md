# My School — production source recovery and live status

Snapshot date: 2026-11-18.

## Confirmed production backend

- Supabase project ref: `yigixquioguqnpbfhepi`
- Region: `eu-west-1`
- PostgreSQL: `17.11.0.018`
- Status at inspection: `ACTIVE_HEALTHY`
- Public schema tables: 111
- Applied migration history entries: 40
- Edge Functions: `ai-gateway` v1 ACTIVE; `ai-worker` v1 ACTIVE. Both currently have platform JWT verification enabled.
- Installed extensions include `vector` 0.8.2, `pgmq` 1.5.1, `pg_cron`, `pg_net`, `pgcrypto` and `supabase_vault`.
- pgmq queues: `myschool_curriculum_ingestion`, `myschool_question_generation`, `myschool_embedding`.
- One active cron job runs every minute and calls `app.enqueue_due_question_generation_schedules(100)`. This job enqueues due question-generation work; it does not itself invoke `ai-worker`.

## Existing AI and curriculum structures

The live schema already includes:
- `curriculum_sources` and `curriculum_source_versions`, including source scope, rights status and permitted-use metadata.
- `curriculum_chunks` with text, page ranges, metadata, SHA-256 content fingerprint, vector embedding and lexical search vector.
- `question_bank`, `question_bank_answers`, `question_sources`, student exposure/event and attempt tables.
- `question_generation_batches`, `question_generation_schedules`, `question_generation_jobs`, `curriculum_ingestion_jobs`, `question_quality_checks` and `ai_rag_evidence`.

The schema is a foundation, not proof of a complete live RAG workflow. Retrieval, ingestion, embedding generation, citations and question delivery must be exercised with end-to-end tests.

## Important verified gaps

- The production frontend source has not been recovered in `lopicotion-coder/olic`.
- The `draft` repository contains UI prototypes, including a Lovable demo with fictional seed data and a placeholder route. It is not the production application.
- The original SQL bodies for the 40 applied migrations are not present here; the live migration ledger exposes names and versions.
- The deployed worker uses a service-role database client, but its request handler does not implement an explicit in-function application-role authorization check before processing privileged jobs.
- Worker job selection and status update are separate operations; concurrent worker invocations need atomic claiming/leases.
- The deployed worker does not yet perform real PDF/DOCX extraction into curriculum chunks. Ingestion jobs with missing object paths are deferred/retried.
- The deployed worker polls job tables directly while pgmq queues also exist. A single queue/claiming strategy must be chosen.
- The current cron job schedules question-generation jobs but does not trigger the worker.
- `students` records are currently school/tenant-scoped (`tenant_id` and `school_id` are required). An independent learner needs a separate global identity/profile layer linked to school-owned rosters.
- A `national_id` text column exists on `students`; audit access and usage before designing a keyed HMAC identity fingerprint or migration.
- Supabase security advisor: leaked-password protection is disabled.
- Supabase performance advisor findings include multiple permissive RLS policies, auth init-plan warnings, unused indexes and unindexed foreign keys. Review by impact and query evidence rather than applying broad automated changes.
- A tested encrypted off-site backup and restore drill has not been confirmed.

## Frontend candidates and repository boundaries

- Production repository: `lopicotion-coder/olic`.
- Prototype archive: private `lopicotion-coder/draft`.
- Separate project `nhkorcyonlvvfnufwycf` is Selsep EDU and must remain separate.
- The `olic` repository is Public at this snapshot. Never commit secrets, production rows, Auth data, identity values, document contents or backup archives.

## Safety record

The 2026-11-18 inspection was read-only against production. No production schema, Auth settings, Storage objects, deployed functions, user data or billing settings were modified during the inspection.

 
## Implementation work in progress — 2026-11-18
- Working branch: `feature/platform-expansion-plan`.
- The exact deployed source snapshots for `ai-gateway` and `ai-worker` are now checked into `supabase/functions/` on that branch.
- A proposed `AI_WORKER_INTERNAL_TOKEN` guard is implemented in the branch, in addition to Supabase JWT verification. It has not been deployed. Deployment requires securely provisioning the token and a server-side scheduler caller, then verifying the behavior outside production.
- Deno tests and a GitHub Actions check have been added. Local Deno execution was unavailable in the authoring environment; CI verification is pending.
- New GitHub execution issues #1–#12 track the implementation backlog.
- This repository is Public; the new source files contain no production credential values. Do not add secrets to Git.


## AI runtime budget enforcement — 2026-11-19
- Added tenant/school budget reservation and atomic settlement to the Worker for standard AI requests.
- Added a separate platform AI budget for independent learner tutoring; it is disabled by default and does not draw from school budgets.
- Added explicit USD model pricing and RAG embedding pricing checks. Missing routes/prices/budgets fail closed.
- Worker now records spend and completes the request in the same database transaction that releases the budget reservation.
- Added unit-tested budget estimate helpers and included their tests in GitHub Actions.
- This remains branch-only and is not deployed. Current production snapshot has zero provider routes and zero AI budget rows; only the existing question-generation Cron is active, and Vault has no registered secrets. A protected recurring Worker scheduler remains to be configured before activation.

 
## Feature-branch changes after the production snapshot — 2026-11-19
The following are implemented on `feature/platform-expansion-plan` and are not yet live:
- Worker application-token authorization in addition to `verify_jwt=true`.
- Atomic queue/job claim, retry, curriculum extraction/chunking/embedding and retrieval paths.
- Tenant/school, independent-learner and background-operation AI spend reservations/events.
- Unified monthly spend/request caps across interactive and background provider calls.
- Question-generation strict route/pricing requirements and separate accounting for query/document embeddings.
- Vault-backed scheduler SQL template; no production Cron entry has been created.
- GitHub Actions run #41 passed Worker/Gateway type-checks and tests.

Do not interpret these branch changes as deployed production capability. The new budget migration has not been applied, Edge Function source remains the deployed v1 snapshot, and production still has no configured provider routes, AI budgets, Edge Function secrets or Worker schedule. No production writes/deployments were performed during this implementation pass.

 
## Final AI runtime hardening — 2026-11-19
- Added terminal failed-settlement RPCs for tenant and independent-learner chat when provider success is followed by response persistence failure. Actual usage and cost are recorded as failed events, and the request is not automatically called again.
- Added a failure-outcome settlement RPC for background providers. If normal finalization fails after a successful API call, Worker attempts to record actual usage and overrun metadata before releasing the reservation.
- If both settlement paths fail because the database is unavailable, the reservation remains until expiry and a critical log requires manual reconciliation against provider billing.
- Output-token fallback now estimates approximately one token per 1.5 characters when provider usage metadata is missing, matching the conservative Arabic prompt estimator.
- PostgreSQL migrations have not been executed against an isolated staging branch. The branch-creation tool requires cost approval; do not apply these migrations to production as a substitute.

- Fixed lost-RPC-response idempotency: if a normal chat finalizer committed but its return was lost, the Worker no longer overwrites the already completed request as failed.
- Background settlement fallback records a completed provider event and returns the same result, avoiding another provider call; terminal job handling applies only if both settlement paths fail.
- Vault snapshot corrected: Vault is installed; scheduler secrets are not registered.

- Added a paid-operation completion callback to all Worker paths (QGen, ingestion/queued embeddings, and tenant/platform RAG). Any downstream error after a billed provider call marks the parent job/request terminal instead of issuing a duplicate paid call.

- Release caveat: a hard Worker process termination after provider success but before settlement remains a distributed failure window; no exactly-once guarantee is claimed, and staging must verify reservation expiry/reconciliation before enabling paid AI.

- GitHub Actions run #64 passed: https://github.com/lopicotion-coder/olic/actions/runs/44424098077 (Deno type-check and Worker/parser/budget/auth tests).

- Production rollout remains blocked pending a verified CLI logical dump; the organization is on the Free plan with no customer-accessible daily backup/restore-point workflow. The My School backup_jobs table is not a database dump engine.


## Execution update — 2026-11-19
- GitHub Actions run #74 passed on the latest PR head: https://github.com/lopicotion-coder/olic/actions/runs/44455937815. It runs Deno type-check, unit tests, and the real invalid-key OpenAI HTTP 401 integration test.
- Static-reviewed branch migrations against live object inventory; all direct dependencies for the new tables and core AI structures were found in the current database. SQL has not been applied to production.
- Corrected the tenant background-operation request cap to count active reservations before they settle.
- Added a private manual logical backup procedure for the Free plan. The procedure excludes Supabase-managed Auth/Storage schemas and is not a full project recovery image.
- No production migrations, Edge Function replacements, secrets, provider routes, AI budgets, or cron jobs were written during this pass.


## Browser frontend rebuild — 2026-11-20

A new Vite/Supabase browser application has been added on `feature/platform-expansion-plan` under `frontend/`. This is a new schema-driven implementation, not a recovered copy of the previous live UI. It has not been deployed.

- Supabase Auth login, password reset completion, and role/context loading are implemented.
- Navigation is derived from active memberships, role assignments and role permissions; the client does not let users select arbitrary roles.
- User-facing tables/forms read and write the existing school, student, teacher, class, attendance, assignment, grade, conversation, notification, subscription, fee, timetable, exam, content and support tables. All requests remain subject to production RLS.
- The previous hardcoded demo dashboard was removed. The frontend has no seeded users, schools, student profiles, sample metrics or simulated payment results.
- Fee payment UI records money already received; it does not represent an online payment gateway.
- The independent learner profile/practice migrations are not deployed, so no global learner profile is presented as live.
- Bank of Questions is intentionally disabled in the browser UI. Its current RLS policy relies on `app.current_tenant_id()` / `app.current_school_id()`; the browser Data API request has no verified secure server-side context setter.
- GitHub Actions frontend check passed on commit `abc4f6e10bb0a810332fb01d9648403523998297` (run [#44717304945](https://github.com/lopicotion-coder/olic/actions/runs/44717304945)): all 6 access-control tests passed and `vite build` completed successfully. This is a source/build check only; it is not a substitute for authenticated RLS integration tests in an isolated Supabase environment.
- Production Supabase schema, Auth settings, deployed Edge Functions, Storage and live customer rows were not changed by this frontend work.

Release remains blocked until CI passes and login, role scoping, CRUD flows, password recovery, RLS isolation and tenant/school boundaries are exercised against an isolated test database. Do not deploy the branch or apply feature migrations to production as a substitute for that validation.
