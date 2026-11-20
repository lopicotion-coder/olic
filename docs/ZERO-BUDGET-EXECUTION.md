# My School — Zero-Budget Execution Mode

**Effective date:** 20 November 2026  
**Target:** earliest safe controlled MVP, aiming for 30 November 2026  
**Budget available now:** EGP 0 / USD 0 for new infrastructure and paid acquisition

## Operating decision

No new paid Supabase project, Supabase branch, hosting subscription, paid AI API, domain purchase, advertising campaign or third-party SaaS subscription may be started before first customer revenue or explicit founder approval.

The existing Supabase project remains the only hosted backend. It is not a staging environment. Production schema and data must not be used for untested migration experiments.

## Free resources to use now

- Existing GitHub repository and pull request workflow.
- Existing GitHub Actions checks for unit tests, type checks and frontend production builds, subject to the repository's current included usage.
- Local development tools already available on the founder's computer.
- Browser-based Vite local preview using the existing frontend package.
- Supabase's existing Free project for currently deployed baseline functionality only.
- Manual founder-led school/teacher outreach, product demonstrations and waitlist collection without paid ads.
- Deterministic forms and workflows instead of paid AI calls wherever possible.
- Existing local LLMs for private development experiments only; do not expose a home PC as a production inference API without a separately reviewed security and availability design.

## What is explicitly not allowed yet

- Creating a billable Supabase branch/project.
- Applying the 11 branch migrations directly to production.
- Deploying new Edge Function code that depends on unapplied migrations.
- Enabling AI provider routes or paid-model traffic without a funded budget, provider credentials, caps and an owner-approved spending ceiling.
- Advertising an AI feature as active when its runtime is not configured and tested.
- Connecting payment collection without a real provider integration, merchant onboarding, callback verification, reconciliation and refund handling.
- Treating database backup helper tables as a backup engine.
- Using production as a test database.

## Zero-cost validation sequence

### 1. Every commit

- Run GitHub Actions frontend tests and build.
- Run Deno checks and existing unit/integration tests for Edge Functions.
- Add tests for business logic that can run without paid infrastructure.
- Review dependency changes and keep public keys only in browser environment variables.
- Test role/permission derivation with fixtures and negative cases.

### 2. Local integration

Where the founder's machine supports it without additional subscriptions:
- Run the app locally.
- Use a local PostgreSQL/Supabase development stack only after recovering the exact applied schema and required extension/runtime versions.
- Never use copied production personal data in local tests; use synthetic test records.
- Verify migration ordering, RLS and function behavior in that local environment.

**Important limitation:** the applied production migration SQL is not fully recovered in this repository. A local database is not a trustworthy replica until the missing baseline schema, functions, policies, grants and extension dependencies are reconstructed and checked. A successful frontend build or isolated SQL parse is not proof that the new migrations are safe.

### 3. If local database validation cannot be completed

- Keep database-dependent migrations unapplied.
- Continue with frontend, pure logic, documentation and test improvements.
- Limit demonstrations to features already deployed and verified in the existing production schema.
- Make no production data changes merely to make a demo look populated.
- Mark features that depend on unreleased schema/runtime as "coming later" or remove their controls from the pilot UI.

### 4. Manual release safety

Before any production change:
- Run the existing local logical-dump procedure and store outputs outside GitHub.
- Verify the dump files and hashes.
- Recheck the scope limitation: this dump does not include a complete Auth/Storage recovery image.
- Do not claim a complete disaster-recovery backup or run a migration if the required recovery scope is not covered.
- Prefer waiting for first revenue and funding a proper recovery/staging path over risking the only production database.

## First-customer acquisition with no advertising budget

Prioritize the shortest path to a credible paid pilot:
1. Founder personally contacts a small, relevant list of schools, teachers and tutors.
2. Offer a bounded pilot around one real operational or learning problem, not every planned module.
3. Use a live demonstration and a transparent feature matrix: available now, pilot-only, coming soon.
4. Collect requirements and qualified leads with a free form/spreadsheet or an existing database table only if its permissions and data handling are verified.
5. The founder handles negotiation and deal closure. Do not promise autonomous onboarding or AI Sales Agent functionality until deployed.
6. Request a paid pilot or signed commitment only after the demonstrated workflow works end to end.
7. Reinvest the first revenue in the highest-risk release dependency: complete backup/recovery and isolated database validation before expanding AI, payments or marketplaces.

No paid ads, paid affiliate commissions or vendor marketplace commitments before revenue.

## AI and payment policy until revenue

- Student Free receives non-AI features such as approved question-bank practice only when available and verified.
- AI features remain disabled unless a funded provider budget and per-user/tenant caps are configured. No hidden or unmetered API calls.
- The sales intake can use a deterministic questionnaire and create a lead; a paid LLM sales agent is deferred until funded.
- Subscription invoices/status may be shown only if connected to verified records.
- Do not claim online payment processing until an approved provider and a tested payment/refund/reconciliation path exist. Manual payment recording must clearly say "received externally" and must not imitate a payment gateway.

## First-revenue reinvestment order

The first collected revenue should not be spread across multiple new services. Suggested order:
1. Complete backup/recovery coverage and a tested restoration.
2. Isolated database validation (local or paid staging only after funds are available).
3. Fix any critical authorization, tenant-isolation or data-integrity findings.
4. Fund the minimal production AI budget only for paid AI entitlements.
5. Fund payment integration and the customer-facing deployment/reliability needs.
6. Expand acquisition and deferred modules.

## Release definition

A zero-budget pilot is acceptable only when it uses already deployed and verified capabilities, does not incur hidden costs, does not expose one tenant's data to another, and does not misrepresent unavailable AI/payment features.

If a release gate requires a paid resource and no zero-cost safe alternative exists, that gate remains open. Do not bypass it to meet the calendar date.
