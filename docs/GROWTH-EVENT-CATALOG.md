# My School Growth Events and Metrics Contract

**Status:** Proposed event contract; not wired to production  
**Date:** 2026-11-20  
**Related:** [Growth Engine preparation foundation](./GROWTH-ENGINE-PREPARATION.md)

## 1. Event envelope

Every server-accepted event should use a stable, versioned envelope:

| Field | Meaning |
|---|---|
| `event_id` | Server-generated UUID |
| `event_name` | Name from the allow-list below |
| `event_version` | Integer schema version |
| `occurred_at` | Server timestamp; client time may be retained separately as untrusted diagnostic data |
| `source_system` | `web`, `auth`, `billing`, `sales_agent`, `referral` or `admin` |
| `subject_type` | `anonymous_session`, `learner`, `school_lead`, `tenant` or `subscription` |
| `subject_ref` | Opaque internal ID; never a direct personal identifier |
| `attribution_ref` | Optional internal reference to the attributed first/last touch |
| `idempotency_key` | Unique server-enforced event key |
| `properties` | Strictly validated allow-listed JSON only |

The browser may propose campaign metadata, but it must not authoritatively declare a payment, paid conversion, school win, subscription status or reward eligibility. Those events are generated from trusted server-side state changes.

## 2. Event catalog

### Public acquisition

| Event | Created by | Allowed properties | Notes |
|---|---|---|---|
| `landing_page_viewed` | First-party web layer | page_key, campaign fields, device_class | Use a route key, not full URLs containing query data |
| `campaign_touch_captured` | Attribution service | source, medium, campaign, content, term, ref_code | Store sanitized values only |
| `signup_started` | Auth/signup service | signup_path, subject_type | No contact data in event |
| `account_created` | Auth server | subject_type, signup_path | Not a paid conversion |
| `account_activated` | Auth/business workflow | subject_type | Define activation by completed required onboarding, not mere login |

### School sales funnel

| Event | Created by | Allowed properties | Notes |
|---|---|---|---|
| `school_lead_created` | Lead intake service | school_size_band, school_type, country_code, curriculum_key | Contact fields remain in restricted lead record |
| `school_lead_qualified` | Sales workflow / approved agent tool | qualification_code, fit_band | Agent output is a recommendation, not a deal approval |
| `school_meeting_requested` | Lead workflow | meeting_channel | Meeting details live in restricted lead interactions |
| `school_proposal_approved` | Platform owner action | package_code, currency | Approval must be human-authenticated |
| `school_deal_won` | Platform owner / contract workflow | package_code, currency | Must reference approved agreement state |
| `school_deal_lost` | Platform owner / lead workflow | loss_reason_code | Use controlled reason codes, not free-text in analytics |
| `tenant_activated` | Provisioning service | tenant_ref, onboarding_version | Emit only after successful provisioning |

### Student paid conversion

| Event | Created by | Allowed properties | Notes |
|---|---|---|---|
| `student_plan_viewed` | First-party web layer | plan_code, currency | No student performance context |
| `checkout_started` | Checkout service | plan_code, billing_cycle, currency | Not revenue |
| `payment_succeeded` | Payment webhook / server reconciliation | payment_ref, subscription_ref, amount, currency | Verify provider signature and idempotency |
| `subscription_activated` | Billing service | plan_code, billing_cycle, currency | Derived from authoritative subscription state |
| `subscription_renewed` | Billing service | plan_code, billing_cycle, amount, currency | Only after successful renewal settlement |
| `subscription_cancelled` | Billing service | plan_code, cancellation_reason_code | Do not call a scheduled cancellation an immediate termination |
| `payment_refunded` | Payment webhook / server reconciliation | payment_ref, amount, currency, reason_code | Reverse the relevant revenue attribution |

### Referrals and rewards

The existing learner referral subsystem remains authoritative for learner referral codes, attributions, eligibility, rewards and the Gems ledger. Its current proposed statuses include pending, registered, paid, eligible, reversed and rejected.

Growth reporting may consume aggregate, status-transition events from that subsystem, but must not:
- Create a second referral identity or referral attribution for the same learner conversion.
- Decide reward eligibility in the analytics layer.
- Write directly to the Gems ledger.
- Mark a referral eligible based only on a browser event.

Partner/creator attribution is a different relationship and should be modeled separately from learner-to-learner referrals. Payout policy is out of scope for this contract.

## 3. Attribution contract

Capture only:
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- an approved referral/partner code
- normalized landing-page key
- referrer hostname (not the complete referrer URL)
- first-touch and latest eligible non-direct touch timestamps

Rules:
1. Preserve the first eligible touch; do not overwrite it.
2. Update latest eligible non-direct touch when a new tagged touch arrives.
3. A direct visit must not erase an existing source.
4. Sanitize length and character set; reject unexpected keys and oversized values.
5. Treat browser timestamps and browser-submitted conversion values as untrusted.
6. Attribute one conversion only once through a server-generated idempotency key.
7. Do not silently merge different people or devices. Cross-device linkage requires an authenticated, disclosed, permitted event.
8. Report first-touch and last non-direct attribution separately; do not present either as causal proof.

## 4. Events expressly prohibited from Growth telemetry

Do not send these to Growth:
- Student name, email, phone, national ID or date of birth.
- Parent identity or contact data.
- Grades, marks, assessment answers, question IDs or exposure history.
- Academic weak areas, mastery scores, predicted outcomes or attendance details.
- AI prompts, responses, conversation transcripts, uploaded files or document contents.
- Precise GPS, raw IP addresses, device fingerprints or full user-agent strings.
- School rosters, class membership lists or tenant-private records.

Learning analytics and AI cost accounting must remain in their own authorized systems. Growth may receive only aggregate, non-identifying counts where there is a documented need and approved access.

## 5. Metric definitions

| Metric | Definition |
|---|---|
| Visitor-to-signup rate | Distinct eligible signup starts or completed accounts ÷ eligible attributed visitors; choose and label the denominator explicitly |
| Signup completion rate | Activated accounts ÷ signup starts |
| Student paid conversion | Unique learners with a first settled student subscription payment ÷ eligible activated learners in the same cohort |
| School lead qualification rate | Qualified school leads ÷ valid school leads |
| School win rate | Won school leads ÷ school leads reaching a recorded decision |
| School activation rate | Provisioned tenants ÷ won school deals |
| CAC (student) | Attributed student acquisition spend ÷ new paying student customers |
| CAC (school) | Attributed sales and acquisition spend ÷ new paying school customers |
| MRR | Normalized monthly value of active, paid recurring subscriptions; exclude unpaid invoices and one-time sales |
| Renewal rate | Eligible subscriptions successfully renewed ÷ subscriptions due for renewal |
| Churn rate | Paid subscriptions terminated in the period ÷ paid subscriptions active at period start; publish the exact convention |
| Contribution margin | Collected revenue less direct variable AI, payment, delivery, refunds, reward and partner costs |
| CAC payback | Acquisition cost ÷ monthly contribution generated by the acquired customer/cohort |

Do not calculate LTV from an assumed subscription lifetime. Use observed cohort retention and contribution. Report school and student metrics separately.

## 6. Dashboard minimums

The first Growth dashboard should show:
- Student funnel and school funnel as separate views.
- New accounts, activated accounts, qualified leads and paid conversions.
- First-touch and last non-direct acquisition source.
- Spend, CAC and CAC payback by channel and customer type.
- MRR, successful collected payments, refunds and cancellations.
- Cohort retention and renewal rates.
- Data-quality warnings: un-attributed conversions, duplicate events, unmatched payments and stale lead records.

Do not display academic outcomes or AI conversation details in this dashboard.

## 7. Validation cases required before release

- Direct visit does not overwrite a tagged first touch.
- Multiple tagged visits preserve first touch and update latest eligible non-direct touch.
- Invalid or oversized UTM/referral fields are rejected or safely normalized.
- Duplicate payment webhooks do not duplicate revenue or subscription events.
- Failed, pending and expired payment attempts do not count as paid.
- Refunds and chargebacks reverse the appropriate attributed revenue.
- A school lead remains a prospect until human deal approval.
- AI Sales Agent cannot read tenant student data or approve a discount.
- Referral eligibility remains controlled by the referral subsystem, not Growth events.
- No prohibited student/guardian/academic/AI payload is accepted into Growth events.
- Cross-tenant and platform-owner access boundaries pass isolated RLS/authorization tests.
