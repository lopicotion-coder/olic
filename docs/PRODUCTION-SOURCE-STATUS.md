# My School — production source recovery status

Snapshot date: 2026-11-18.

## Confirmed production database

The connected Supabase project matching My School's school/tenant/student/guardian/attendance/finance/communications/support/AI schema is:

- Project ref: `yigixquioguqnpbfhepi`
- Region: `eu-west-1`
- PostgreSQL: `17.11.0.018`
- Status at inspection: `ACTIVE_HEALTHY`
- Applied migration history: 40 entries
- Public/app table inventory: 115 entries
- Storage buckets: 1 private bucket (`school-files`)
- Deployed Edge Functions observed: 0

The separate project `nhkorcyonlvvfnufwycf` is Selsep EDU and must not be merged into My School.

## Hardening follow-up

A production hardening follow-up was applied on 2026-11-18 and is documented separately in `docs/SECURITY-REVIEW-2026-11-18.md`.

## Phase 9 AI curriculum foundation

Six additive migrations were applied on 2026-11-18. They add curriculum source/edition rights, vectorized curriculum chunks, a question bank with protected answer keys, question-source grounding, student exposure/attempt records, generation batches and schedules, worker queues, ingestion jobs, quality checks, and AI RAG evidence. All 15 new public tables have RLS enabled and forced. The minute scheduler enqueues due work. Edge Functions and provider credentials remain pending.

That follow-up did **not** recover the frontend/application source. It only tightened the live Supabase database/backend path and then verified the expected post-conditions.

## Confirmed frontend candidates

A Lovable project named **My School Command Center** was found. Its source is a TanStack Start/React demo with fictional seed data, browser-local state, and a placeholder `src/routes/index.tsx`. It is unpublished and is archived in the private `lopicotion-coder/draft` repository.

It is not verified as the source that powers the production My School application. Keep it out of this production repository until the owner explicitly identifies it as the intended production frontend and it has been rebuilt, tested, and integrated safely.

## What is present in this production repository

- Sanitized project metadata and table/RLS inventory.
- Exact applied migration version/name ledger.
- Generated public-schema TypeScript database types.
- Installed extension and Storage bucket inventory.
- Storage export/restore scripts.
- GitHub Actions workflow for encrypted PostgreSQL + Storage backups.

## What is still missing

1. The actual production frontend/application source.
2. Original SQL migration bodies for the 30 applied migrations. The connected migration-history API exposed names and versions only.
3. A tested full database archive and byte-for-byte Storage object archive.
4. Verification of restore into a separate test project.
5. Auth provider configuration, SMTP/OAuth configuration, and production secrets (these must be configured outside Git and stored in secret managers).
6. AI/ingestion Edge Workers, API secrets and live provider tests for OpenRouter, OpenAI, Gemini, and xAI.
7. Final Vercel/Cloudflare deployment configuration and a verified rollback procedure.

## Safety and scope

The current GitHub repository `olic` is Public. Therefore no production rows, Auth user records, password hashes, Storage object bytes, service-role keys, database passwords, OAuth/SMTP credentials, or plaintext dumps are committed here.

The source-recovery snapshot itself was read-only. The later hardening follow-up was a separate production change and is documented in `docs/SECURITY-REVIEW-2026-11-18.md`.
