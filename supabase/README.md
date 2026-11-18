# My School Supabase snapshot

Live baseline refreshed on 2026-11-18.

- Project ref: `yigixquioguqnpbfhepi`
- Region: `eu-west-1`
- PostgreSQL: `17.11.0.018`
- Status: `ACTIVE_HEALTHY`
- Public schema tables: 111
- Applied migration history: 40 entries
- Deployed Edge Functions: `ai-gateway` and `ai-worker` (both ACTIVE, v1, JWT verification enabled)
- Installed extensions include pgvector, pgmq, pg_cron, pg_net, pgcrypto and Supabase Vault.

## Existing AI/RAG schema

The live database includes curriculum sources/versions/chunks, vector embeddings, lexical search vectors, question bank and protected answers, question-source links, student exposures/attempts, generation batches/jobs/schedules, ingestion jobs, quality checks and RAG evidence.

## Queue/scheduler status

The database has three pgmq queues:
- `myschool_curriculum_ingestion`
- `myschool_question_generation`
- `myschool_embedding`

The active cron job runs `app.enqueue_due_question_generation_schedules(100)` every minute. It enqueues due schedules; it does not invoke the Edge Function worker. Worker triggering and a single canonical queue-consumption design remain follow-up work.

## Files

- `inventory/`: sanitized project metadata and table/RLS inventories.
- `migrations/applied-history.json`: migration name/version ledger only.
- `types/database.types.ts`: generated public-schema types.

## Important limitations

The original SQL bodies for the 40 applied migrations are not currently stored here. Do not treat the migration metadata ledger as a restore-ready migration directory or fabricate old migration SQL.

The production frontend source is not present in this repository. UI prototypes are archived separately in `lopicotion-coder/draft` and must not be deployed as production.

This repository is Public. Do not commit secrets, production rows, Auth users, password hashes, identity values, document contents, database credentials, service-role keys, plaintext dumps or private backup archives.
