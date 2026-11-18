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
