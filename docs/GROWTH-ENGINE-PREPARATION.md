# My School Growth Engine — preparation foundation

**Status:** Preparation specification only  
**Date:** 2026-11-20  
**Target:** My School production platform  
**Implementation branch:** `feature/platform-expansion-plan`

## 1. Purpose

Prepare a repeatable, measurable user-acquisition system for My School without introducing campaign spend, student profiling, duplicate referral systems, or unverified production database changes.

Growth is a platform capability, not an AI-only feature. Deterministic code should handle event capture, attribution, deduplication, lifecycle transitions, reporting and budget limits. AI is reserved for bounded tasks such as school-lead qualification and support conversations.

## 2. Separate acquisition funnels

Do not combine these into one conversion funnel or one customer metric.

### Student / guardian funnel (B2C)

1. Discover a public My School page or a referral link.
2. Visit a public landing page.
3. Start account creation.
4. Complete account activation.
5. Explore the free, non-AI learning experience where available.
6. View a paid student plan.
7. Start checkout.
8. Complete a verified payment.
9. Renew, pause, cancel or request a refund.

A registered account is not a paying customer. A checkout start is not revenue. Count paid conversion only after a verified successful payment event.

### School funnel (B2B)

1. A school representative discovers My School.
2. The representative opens the self-service school registration flow.
3. The representative provides the minimum school and business-contact details.
4. The separate AI Sales Agent explains approved product information and qualifies the opportunity.
5. The system prepares a structured lead summary.
6. The platform owner reviews the opportunity and closes the deal.
7. A signed/approved commercial agreement and required payment state are recorded.
8. The school tenant is provisioned through the existing controlled onboarding process.

A prospect is not a tenant merely because a form was submitted. Do not create an active school tenant or grant school access before the commercial approval gate.

### Partner / creator funnel

Partners and creators may receive attributed links or codes after approval. Their referrals must be attributed to a partner record and evaluated separately from student-to-student referrals. Do not introduce payout logic in this preparation phase.

## 3. Core components

| Component | Responsibility | Preferred implementation |
|---|---|---|
| Campaign/UTM capture | Record the first and latest eligible source touch | Small deterministic client utility + server validation |
| Signup attribution | Attach a permitted anonymous attribution key to signup | Auth/server-side event, not a browser-supplied user identity |
| School lead intake | Validate and store school prospects | Server-side endpoint and restricted lead store |
| AI Sales Agent | Qualify needs and prepare a summary | Separate agent, approved Sales RAG, bounded tools |
| Referral integration | Reuse the learner referral subsystem | Existing referral code/attribution and reward ledger contracts |
| Conversion ledger | Record authoritative lifecycle events idempotently | Server-generated append-only events |
| Growth reporting | Calculate funnel and revenue metrics | Read-only aggregate queries/views |
| Campaign operations | Manage source, campaign status and spend records | Platform-owner-only controls |

## 4. AI Sales Agent boundary

The Sales Agent is independent from the student Learning Tutor, even when both use the same model provider.

It must have:
- Its own system instructions, Sales RAG, approved product facts and tool allow-list.
- Read access only to approved product, package, onboarding, security and FAQ material.
- Permission to create or update a prospect lead and record a qualification summary.
- A handoff action to request human review or a meeting.

It must not:
- Read student profiles, grades, learning history, AI conversations or another school's tenant data.
- Invent prices, discounts, availability, compliance claims or contract terms.
- change a price, approve a discount, sign an agreement, collect a payment or provision a live tenant.
- Treat generated text as an authoritative quote.

Prices and commercial rules must come from an owner-approved, versioned source. The agent may explain those facts but cannot alter them. The final deal decision remains with the platform owner.

Keep full conversation transcripts separate from aggregate marketing events. Restrict transcript access, document retention, and provide a clear notice before collecting contact details or storing the conversation.

## 5. Proposed data boundaries (not migrations)

The active feature branch already contains a learner referral and Gems design in `20261118213000_global_learner_entitlements_rewards.sql`. Reuse it; do not create a second referral code table, referral attribution table, Gems ledger or reward ledger.

For the Growth Engine, evaluate a platform-owned, non-tenant CRM/analytics boundary before designing SQL:

- `growth.leads`: school prospects, business contact purpose/consent, qualification status, owner and next action.
- `growth.attribution_touches`: pseudonymous first/last eligible campaign touches.
- `growth.events`: append-only, idempotent platform acquisition/conversion events.
- `growth.campaigns`: campaign metadata and approved budget controls.
- `growth.lead_interactions`: restricted human/agent activity timeline; no academic data.

These are candidate logical entities, not approved table names or a migration. Confirm schema exposure, RLS, grants, platform-owner permissions, retention and backup/restore before implementation. Prefer an unexposed schema and server-side access for lead/contact records. Never expose privileged keys to the browser.

Keep platform-level prospects separate from school-owned tenant records. Once a school is approved, link the won lead to the created tenant using an explicit conversion reference; do not move or duplicate student data into the CRM.

## 6. Privacy and abuse controls

- Do not use grades, assessment attempts, learning weaknesses, tutor prompts, AI conversations or academic predictions for advertising targeting or marketing segmentation.
- Do not put names, email addresses, phone numbers, national IDs, dates of birth, message text, prompt text, grades or school roster data in analytics event properties.
- Do not fingerprint devices or collect precise location for attribution.
- Use first-party, minimal attribution identifiers. Capture only the campaign fields needed to measure acquisition.
- Separate contact information and consent records from aggregate analytics events.
- Apply rate limits, bot controls, event idempotency and referral-abuse checks.
- Provide a clear privacy notice and obtain the required permissions/guardian consent where applicable before collecting data from minors or using optional tracking.
- Complete a qualified privacy/legal review before public student acquisition campaigns or enabling optional analytics/marketing cookies.
- Define deletion, retention, access, export and incident procedures before production launch.

This specification is not a legal-compliance certification.

## 7. Financial measurement rules

Report student subscriptions and school subscriptions separately.

- Count revenue only from verified successful payment records.
- Reverse attributed revenue for refunds, chargebacks and reversed payments.
- Keep booked pipeline value separate from collected revenue.
- Report discounts, payment fees, AI variable costs, reward liabilities, partner commissions and refunds explicitly.
- Calculate CAC by channel and customer type; do not blend school CAC with student CAC.
- Report contribution margin before claiming company net margin. Net margin must also include engineering, contractors, support, marketing, administration, tax and other overhead.
- Do not release a channel budget until attribution and payment reconciliation have been tested.

The previously discussed 50–70% net-profit ambition is a business target, not a value that can be assumed in the reporting model.

## 8. Dependencies and release gates

This preparation work does not deploy anything and does not change the live Supabase project.

Before a database implementation:
1. Reconcile the feature branch with the current production baseline using reviewed migrations; the feature branch is currently behind `main`.
2. Recover and validate the original production migration history and a restorable backup.
3. Create or select an isolated Supabase staging environment.
4. Validate schema grants, RLS, tenant isolation and platform-owner-only access.
5. Validate consent, privacy notice, retention and minor-specific controls.
6. Confirm the actual production frontend/auth source and integration boundary.

Before public acquisition:
1. Test signup and activation from an external landing page.
2. Test attribution persistence and deduplication.
3. Reconcile successful payment events to subscription/payment records.
4. Verify refund and cancellation reversals.
5. Review the Growth dashboard against source-of-truth billing records.
6. Set and approve a channel budget and CAC stop-loss.

## 9. Explicit exclusions from this phase

- No production SQL migration or Supabase write.
- No production deployment, DNS, secrets or payment-gateway configuration.
- No live advertising spend or campaign launch.
- No change to student AI entitlements, AI budgets, Gems conversion value or Marketplace rules.
- No new rewards or referral ledger.
- No public student behavior tracking or third-party ad pixel.
- No automatic price changes, discounts, contracts or tenant provisioning by an AI agent.

## 10. Definition of done for preparation

- Acquisition funnels are separated and documented.
- Event and metric definitions are documented.
- Sales Agent data and permission boundaries are documented.
- Existing learner referral/Gems subsystem is identified as the integration point.
- Privacy, financial and release gates are explicit.
- The implementation backlog can be split into staging-safe, testable tasks without assuming that a prototype or feature-branch migration is already live.
