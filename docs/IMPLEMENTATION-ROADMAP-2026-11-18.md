# My School — platform expansion implementation roadmap

Date: 2026-11-18
Target integration branch: `develop`
Working branch: `feature/platform-expansion-plan`
Production Supabase project: `yigixquioguqnpbfhepi` (EU West, PostgreSQL 17.11)

## Product direction

My School is being expanded from a school-management product into a student-first learning platform with an optional school operating layer.

A learner must be able to create and retain one durable learning identity without joining a school. A parent may create/link child profiles. School membership is an optional, permissioned relationship that can be requested by the learner or parent and approved by the school. School-owned records remain scoped to the school; the learner's personal learning history follows the learner under clear export, privacy and consent rules.

The platform will combine:
- Student Learning Passport and parent-child relationships.
- Optional school memberships and transfer history.
- Shared curriculum knowledge/RAG by curriculum, subject, grade and edition, with isolated school-specific curricula when needed.
- Reusable question bank, protected answer keys, student attempts and learning analytics.
- AI tutor and teacher/video discovery.
- YouTube-hosted My School Academy content.
- Student and school subscriptions, referrals, Gems, rewards and auditable settlements.
- Learning-first competitions and progress rewards.

## Verified backend baseline (2026-11-18)

Read-only inspection of the live Supabase project confirmed:
- Project `yigixquioguqnpbfhepi` is `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- 111 tables are present in the `public` schema.
- 40 migrations are recorded as applied.
- `ai-gateway` and `ai-worker` Edge Functions are deployed, both version 1 and configured with JWT verification.
- `pgvector` 0.8.2, `pgmq` 1.5.1, `pg_cron` and `pg_net` are installed.
- Three queues exist: `myschool_curriculum_ingestion`, `myschool_question_generation`, `myschool_embedding`.
- One active cron job runs every minute and calls `app.enqueue_due_question_generation_schedules(100)`.
- Existing curriculum structures include sources, source versions, chunks, vector embeddings, lexical search vectors, and RAG evidence.
- Existing assessment structures include question bank, protected answer table, source links, exposure history/events, attempts, generation batches/jobs and quality checks.
- Existing parent portal and school enrollment request structures exist.

## Verified gaps and risks

1. The production frontend source is not present in `olic`. The `draft` repository contains prototypes, not the production application. Do not deploy the prototype as production without an explicit source decision and full integration.
2. The current `students` rows are school/tenant-scoped: `tenant_id` and `school_id` are required. That model alone cannot represent an independent learner. Add a global learner identity layer rather than dropping school constraints or rewriting historical school records blindly.
3. The `students` table has a `national_id` text column. Audit its use and access before changing it. The target design is a keyed HMAC fingerprint, not plain SHA-256, with the original value removed or encrypted only where there is a justified legal/operational need.
4. The deployed worker uses a service-role Supabase client. Its request handler has no explicit in-function application-role authorization before running privileged jobs; JWT verification alone is not an adequate worker authorization policy.
5. Worker job claiming currently selects queued rows and later changes their status in a separate update. Concurrent invocations could claim the same job. Replace with atomic claim/lease semantics using `FOR UPDATE SKIP LOCKED` or the existing pgmq queues.
6. The worker polls job tables directly and does not consume the three existing pgmq queues. Reconcile one canonical queue/claiming model; do not run two competing job systems.
7. The ingestion handler is not yet a real document compiler. It does not extract PDF/DOCX content into the knowledge model; missing storage paths are deferred/retried.
8. The current cron job creates due question-generation jobs but does not invoke the Edge Function worker. A secure worker trigger/scheduler is still required.
9. The gateway is a provider proxy, not yet a complete end-user AI service boundary. Verify authorization, tenant/user budgets, rate limits, usage accounting, request validation, allowed models and response normalization before broad rollout.
10. Supabase advisors reported leaked-password protection disabled, multiple permissive RLS policies, auth init-plan warnings, unused indexes and many unindexed foreign keys. Triage these by security impact and real query plans; do not mass-create/drop indexes based only on advisor output.
11. The original SQL bodies for the recorded production migrations are not present in this repository. Recover/export and test a complete migration chain before enabling repeatable environment provisioning.
12. A successful encrypted backup and restore drill has not yet been confirmed.

## Execution phases

### Phase 0 — production safety and source recovery (P0)
- Preserve deployed Edge Function source in version control.
- Restrict `ai-worker` to a service-role/internal caller; keep health output non-sensitive.
- Add atomic job claiming, leases, bounded retries, idempotency and dead-letter handling.
- Reconcile pgmq queues with worker processing and add a secure scheduled trigger.
- Verify gateway identity, per-user/tenant budgets, rate limits, audit/usage records and provider allowlists.
- Recover the applied migration SQL and establish a tested staging/restore workflow.
- Enable leaked-password protection and remediate high-impact security advisor findings.

**Exit criteria:** a normal authenticated student cannot invoke privileged jobs; repeated/concurrent worker calls cannot double-process jobs; jobs complete or reach a visible terminal failure; recovery can be rehearsed away from production.

### Phase 1 — global learner identity and optional membership (P0/P1)
- Design a global `learner_profiles` entity that is independent of tenant/school.
- Add verified login identities and keyed identity fingerprints with key rotation/versioning.
- Keep school roster/enrollment records as school-owned records linked to the global learner identity.
- Model multiple historical school memberships and transfers without duplicating the learner.
- Link parent accounts to learner profiles with explicit, revocable relationships and age-appropriate consent.
- Add secure school join requests and approval/rejection flows.
- Keep school records private to authorized school roles; a new school does not automatically inherit private notes from a previous school.

**Exit criteria:** a learner can exist without a school, connect to a parent, request a school membership, transfer schools, and retain their personal learning history without duplicating identity.

### Phase 2 — curriculum compiler and shared RAG (P1)
- Define curriculum, subject, grade, edition, unit, lesson and source ownership/sharing rules.
- Build an ingestion pipeline for permitted PDF/DOCX/text sources.
- Process files ephemerally where practical; persist structured text, metadata, page references, content hashes and embeddings rather than retaining original files by default.
- Add Arabic-aware extraction/normalization and quality checks for scanned pages, tables, equations and image-only content.
- Implement chunking, deduplication, embedding model/version tracking and re-embedding jobs.
- Implement hybrid lexical/vector retrieval with filters for curriculum edition, subject, grade, school scope and permitted use.
- Store evidence and return citations (book/edition/unit/lesson/page).
- Add source/rights review, curriculum versioning and incremental reprocessing.

**Exit criteria:** an authorized student query returns relevant approved chunks and page references; unauthorized/school-specific sources never leak; the system can ingest and test a licensed sample book without permanent PDF storage.

### Phase 3 — reusable questions and assessment (P1)
- Treat the shared question bank as a reusable asset, not per-student generated content.
- Separate question text, protected answer keys, explanations, source evidence, exposures and attempts.
- Generate in batches when inventory falls below a per-scope threshold.
- Add duplicate detection, answer validation, curriculum grounding and teacher/admin review states.
- Select questions according to learner level and known gaps while respecting the selected curriculum edition.
- Track item difficulty and discrimination carefully; do not infer item quality from raw correctness alone.

**Exit criteria:** repeated student practice reuses approved questions, answer keys remain protected, new generation is triggered by inventory needs, and every question is traceable to an allowed source or an explicitly approved authored origin.

### Phase 4 — learner, parent and school interfaces (P1)
- Recover/identify the actual frontend source before implementing production screens.
- Build Student Learning Passport, parent dashboard, school profile and optional school-join workflow.
- Build platform-owner RAG control center and school-specific RAG view.
- Provide safe subject/source binding, ingestion status, retrieval testing and question-bank monitoring.
- Keep school dashboard data separated from personal learning data and enforce every permission in the backend.

**Exit criteria:** each role can perform only its permitted operations; the learner experience works with no school membership; platform and school RAG screens report real backend state.

### Phase 5 — media and teacher ecosystem (P2)
- Add a media catalog for YouTube-hosted lessons with subject/grade/lesson mapping.
- Recommend My School Academy videos first when suitable.
- Offer other teacher content when the internal video is not useful.
- Add teacher profiles, verified subjects, availability, lesson booking and settlement only after teacher workflows and payments are defined.

### Phase 6 — subscriptions and entitlements (P1/P2)
- Create a single entitlement model so students are not charged twice for features already included by a school.
- Support individual, family and school-provided subscriptions.
- Treat the proposed EGP 400/month price as a hypothesis to validate, not a fixed final price.
- Define usage quotas and AI fair-use limits per plan without degrading the free learning path.

### Phase 7 — referrals and Gems economy (P2)
- Reward only referrals that become paid, eligible subscriptions after refund/cancellation checks.
- Define the 5-referral monthly reward and 70-referral annual reward rules explicitly, including whether tiers stack.
- Keep XP (non-monetary progress) separate from Gems (redeemable platform-funded credits).
- Use an append-only double-entry-style ledger for issuance, redemption, expiry, reversals and school/teacher settlements.
- Do not offer student cash-out or peer-to-peer transfer in the initial release.
- Add fraud controls, parental consent where appropriate and per-campaign liability limits.

### Phase 8 — engagement and competitions (P2)
- Add weekly/monthly, subject, class, school and friend competitions.
- Reward mastery, consistency and improvement—not only answer volume or screen time.
- Provide privacy-preserving leaderboard defaults and moderation controls.
- Use XP and badges for learning progress; reserve Gems for explicitly budgeted rewards.

## Cross-cutting engineering gates

Every phase must include:
- RLS/tenant-isolation and role-matrix tests.
- Idempotency, concurrency and retry tests for background work.
- Observability for latency, failures, cost and queue age.
- Cost-per-active-student and contribution-margin reporting.
- Data minimization, retention and export/delete policies.
- Backup and restore coverage.
- Accessibility, Arabic RTL and mobile usability.
- Curriculum rights review before using external book content.

## Immediate work queue

| Priority | Task | Status |
|---|---|---|
| P0 | Snapshot and version deployed Edge Function source | Planned |
| P0 | Secure privileged worker authorization | Planned |
| P0 | Atomic queue/job claiming and retry recovery | Planned |
| P0 | Reconcile pgmq and job tables; securely trigger worker | Planned |
| P1 | Confirm RAG retrieval RPC/index path and add retrieval smoke tests | Planned |
| P1 | Build actual ingestion/compiler pipeline | Planned |
| P1 | Design global learner identity without breaking school roster history | Planned |
| P1 | Recover actual frontend source and validate prototype provenance | Blocked on source identification |
| P1 | Complete question consumption/exposure/attempt workflow | Planned |
| P2 | Subscription entitlements, referral ledger, Gems and gamification | Planned |

## Change control

- Work from short-lived branches based on `develop`.
- Never apply untested schema or function changes directly to production.
- Do not invent migration history. Restore original SQL or create new immutable migrations from verified current state.
- The production repository is Public at the time of this snapshot. Never commit secrets, production rows, identity values, document contents or private backup material.
- Do not deploy the archived Lovable prototype as production.

 
## Implementation progress — 2026-11-18
- Created working branch `feature/platform-expansion-plan` from `develop`.
- Added 12 GitHub Issues covering P0/P1/P2 work.
- Versioned the exact currently deployed `ai-gateway` and `ai-worker` source snapshots under `supabase/functions/`.
- Prepared an internal-token guard for privileged `ai-worker` execution, removed queue/key-presence details from its health response, and added focused Deno tests.
- Added a GitHub Actions workflow to run the worker-auth tests on pull requests.
- The worker hardening is branch-only and is **not deployed**. Deno is not installed in the current authoring environment, so local Deno test execution has not been completed; CI must verify it.
- No production database, Auth settings, Storage objects, deployed Edge Functions or billing configuration were modified in this implementation pass.
