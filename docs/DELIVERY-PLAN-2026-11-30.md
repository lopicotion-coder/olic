# My School — 30 November delivery plan

**Planning date:** 20 November 2026  
**Target date:** 30 November 2026  
**Working branch:** `feature/platform-expansion-plan`  
**Active integration PR:** #13 (Draft)  
**Production project:** `yigixquioguqnpbfhepi` (EU West, PostgreSQL 17)

## Executive assessment

A complete public launch of every planned My School capability by 30 November is not a responsible commitment based on the verified state on 20 November. The remaining work includes database release engineering, independent learner identity, curriculum/RAG, question-bank release, AI runtime configuration, payments, self-service school onboarding, student/parent/teacher experience, growth/sales automation, referrals/rewards, and both marketplaces.

The target should be treated as a **controlled MVP delivery date**, not permission to bypass backup, migration, authorization, privacy, payment or end-to-end test gates. The team should freeze the launch scope immediately and defer non-core commercial/engagement surfaces until the core workflows are proven.

## Verified repository and production snapshot

- Production Supabase project is `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- Production has 111 public tables; the current production migration history ends at `20261118114708`.
- Production Edge Functions are `ai-gateway` v1 and `ai-worker` v1.
- Production table inventory reports one profile and zero rows in schools, AI provider routes, AI budgets, question bank, knowledge chunks, subscriptions, backups and restore jobs.
- Production has no separate Supabase staging branch configured. The branch listing contains only the default `main` branch.
- PR #13 is open and Draft. It contains 11 new SQL migrations that are not applied in production, frontend rebuild work, AI worker/gateway hardening and documentation.
- PR #13 explicitly records that migrations were statically reviewed but not executed against an isolated PostgreSQL/Supabase environment, and that a complete private backup plus restore verification is outstanding.
- The repository backup runbook does not capture Supabase-managed Auth/Storage as a complete disaster-recovery image.
- The new frontend is a branch-only Vite/Supabase app; it is not deployed. It has login, password recovery, permission-derived navigation, context switching and operational screens. Online payment processing, independent learner production APIs, and live AI tutor/question-generation UI are not yet available.
- The current security advisor reports leaked-password protection disabled. This must be enabled and verified before launch.
- The student engagement increment adds an evidence-based next learning action, bounded practice progress/completion UI and clearing of in-memory practice data on account/context switch. It must remain subject to CI and authenticated role/RLS testing.
- The branch now contains a protected onboarding Edge Function for tenant/school owner invitations and school member invitations, plus invite password-setup and own-membership activation UI. Auth email/redirect and existing-account linking are not yet production-validated.
- The branch Learning Home now reads active enrollments, published lessons, assignments, submissions and grades from the current production tables; a lesson reader opens the full content body. Adaptive practice/mastery still depend on unapplied branch migrations.
- The branch assignment workflow now includes student text submission, a per-student submission history, duplicate-submission suppression in the UI, teacher-side grading/feedback, and timestamps/grade values written through the existing assignment RLS/trigger path. The live submission trigger enforces published assignment status and late-submission rules.
- The Production `content_items_read` policy has a P0 class-scope defect: the school membership predicate can reveal published class-specific content to users who are not enrolled in that class. Issue #15 tracks the database policy correction; frontend filtering is defense-in-depth only and does not close the Data API exposure.

## Launch scope to freeze

### MVP — must work end to end

1. Secure authentication, password recovery, membership and context resolution.
2. One school tenant with real school setup, administrator, teacher, student and parent access.
3. Student roster, classes, attendance, assignments, submissions, grading and timetable.
4. Curriculum content and question-bank practice with protected answer keys.
5. Student learning progress derived from real attempts and approved curriculum mappings.
6. AI tutor only after provider routes, budgets, authentication, monitoring and cost limits are configured and tested.
7. Subscription status and invoice visibility. Do not represent payments as online-enabled until a real payment provider integration and reconciliation flow are tested.
8. Basic school onboarding that does not leave orphan tenants or unowned schools.
9. Support request creation and operational monitoring.
10. Arabic RTL, mobile usability, privacy controls, role boundaries, audit trail and backup/restore process.

### Defer unless the MVP is already proven

- Public AI Sales Agent and fully autonomous sales negotiation.
- Full Growth Engine CRM and advanced campaign automation.
- Referral commissions and redeemable Gems.
- Weekly/monthly competitions and public leaderboards.
- Family bundle billing.
- Full School Marketplace and Platform Marketplace, including vendor onboarding, inventory, fulfillment, refunds and settlements.
- Teacher discovery/booking marketplace.
- Advanced AI-generated study plans and analytics beyond validated records.

These are not dropped product ideas; they are explicitly outside the 30 November MVP unless their complete backend, frontend, financial and safeguarding workflows are already verified.

## Critical path and exit criteria

### Gate 0 — release safety (20–21 Nov)

- Complete a private, encrypted backup covering database, Auth, Storage and required configuration/secrets through supported procedures.
- Perform a restore drill into an isolated environment and verify row counts, Auth identities, storage metadata/objects and critical workflows.
- **Zero budget:** do not create a paid Supabase branch/project. Use local tooling and CI only. The existing Supabase project is production, not staging.
- Keep PR #13 Draft until the migration set and worker changes are reviewed and tested.
- Enable leaked-password protection and review remaining high-risk security findings.
- Pin dependencies and ensure frontend tests and production build run on the latest branch head.

**Exit:** recoverability is demonstrated; no untested production migration is allowed.

### Gate 1 — schema and AI runtime (21–24 Nov)

- Do not apply the 11 branch migrations to production. First recover the missing applied schema baseline and validate the migration sequence in a local environment using existing tools only.
- Validate constraints, functions, RLS, grants, triggers, indexes and rollback/recovery behavior.
- Run tenant isolation and role-matrix tests for platform admin, school admin, teacher, assistant, student and parent.
- Fix P0 issue #15 in `content_items_read`: school-wide content may use school access; class-scoped content must require `app.can_access_class`. Add negative student/parent/teacher tests proving that users cannot read lessons for unassigned classes.
- Configure provider routes, model allowlists, token prices, tenant/platform budgets, rate limits and secrets in staging.
- Verify interactive and background AI requests, reservation/settlement, failure paths, request caps, queue processing, dead letters and monitoring.
- Test real curriculum ingestion and citations with permitted sample content.
- Verify question generation, answer-key separation and student attempts.

**Exit:** critical SQL and AI workflows pass in staging, including negative authorization tests and budget-limit tests.

### Gate 2 — core frontend and school workflows (24–27 Nov)

- Run the branch frontend locally and through GitHub Actions. Do not create a paid preview/hosting service; use an already available no-cost option only if its terms and security fit.
- Test registration/invitation and school setup using real end-to-end accounts.
- Test each role's core workflows on desktop and mobile.
- Complete student learning home, adaptive practice progress, completion, evidence-based recommendations and parent progress view.
- Remove any visible controls that have no working backend route.
- Test error, empty, loading, retry, session-expiry and account/context-switch states.
- Verify Arabic RTL and accessibility basics.

**Exit:** the MVP can be completed end-to-end by a test school without operator SQL edits or fabricated records.

### Gate 3 — controlled pilot (27–29 Nov)

- Onboard one pilot school and a small, consented test cohort.
- Run roster import, invitations, parent linking, class setup, assignments, attendance, grading and student practice.
- Measure errors, response latency, AI cost per learner, support demand and task completion.
- Reconcile every payment-related state manually until the online gateway is fully implemented.
- Run a backup and restore rehearsal again after pilot data is created.

**Exit:** no critical data-isolation or integrity defects; core tasks completed; costs and operational alerts visible.

### Gate 4 — launch decision (30 Nov)

- Review open critical/high defects.
- Review backup and restore evidence.
- Review RLS/authorization results.
- Review AI provider spend and usage caps.
- Review payment/refund/reconciliation status.
- Decide whether to launch the MVP, extend the pilot or move the public release date.

A failed gate means controlled pilot or delay, not bypass.

## Day-by-day work order

| Date | Focus | Deliverable |
|---|---|---|
| 20 Nov | Freeze MVP scope; audit PR and production | This delivery plan and release blockers |
| 21 Nov | Backup/recovery and staging decision | Verified backup plan and isolated test target |
| 22–23 Nov | Migration validation | All branch migrations applied and tested in staging |
| 24 Nov | RLS and AI runtime validation | Role matrix, provider routes, budgets and queue tests |
| 25–26 Nov | Core student/parent/school UI | End-to-end role workflows |
| 27 Nov | Onboarding and import | Pilot school setup and roster import |
| 28–29 Nov | Pilot, fixes, recovery rehearsal | Pilot acceptance report |
| 30 Nov | Go/no-go | Controlled MVP release decision |

Dates are sequencing targets, not claims that the underlying dependencies are already available. Under the current EGP 0 / USD 0 budget, database-dependent release gates may remain open beyond 30 November; never bypass them to meet the date.

## Zero-budget constraint

No new paid infrastructure, provider/API spend, paid acquisition or subscriptions are approved before first customer revenue. Follow [Zero-Budget Execution Mode](ZERO-BUDGET-EXECUTION.md). The first revenue is reinvested first into backup/recovery and database validation, then funded AI/payment capabilities.

## Operational rule

The platform owner retains control of product decisions, architecture, access, pricing and deal closure. Repeatable operations should be automated with deterministic software where possible; AI is used only where it adds material value. Freelancers can support bounded tasks such as L1 support, content review and QA, with least-privilege access and documented procedures.

## Definition of done

A feature is **done** only when:
- Its UI is connected to a real backend path.
- Authorization is enforced server-side and tested negatively.
- Tenant and user isolation are verified.
- Loading, empty, error and retry states are handled.
- Audit and observability are adequate.
- Automated tests pass.
- It is validated in staging with realistic data.
- Backup/restore and privacy implications are addressed.
- Documentation and operator instructions exist.

A successful type-check or frontend build alone is not production readiness.
