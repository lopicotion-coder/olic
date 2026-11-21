# Notification Delivery Worker — Operations

## Purpose
The notification worker sends queued school notifications by email (Resend) and push (Expo). In-app notification records are already stored in My School and do not require this external delivery worker.

## Runtime secrets
Set these only in the Supabase Edge Function secret store. Never put them in frontend `VITE_*` variables or source control.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFICATION_WORKER_INTERNAL_TOKEN` — random secret with at least 32 characters
- `RESEND_API_KEY` — required only for email delivery
- `RESEND_FROM_EMAIL` — verified sender address for the Resend account
- `EXPO_ACCESS_TOKEN` — required only for push delivery

The worker claims only the provider keys whose secrets are configured. If no provider is configured, it returns 503 without claiming queue rows.

## Invocation
- Edge Function: `notification-worker`
- Method: `POST`
- Header: `x-myschool-notification-worker-token: <internal token>`
- Supabase JWT verification must stay enabled. Invoke from a trusted scheduler using a server-side Supabase service-role JWT plus the additional internal token.
- Body: `{"batch_size":20}` (integer 1–50)
- The endpoint has no browser CORS allowance and must not be called directly by the frontend.

Use a scheduler with a 1–5 minute interval after secrets are configured. No production schedule is installed by this change.

## Queue behavior
1. `claim_notification_deliveries` atomically claims rows with `FOR UPDATE SKIP LOCKED`, filtered by configured providers.
2. A 180-second lease and worker identifier prevent another worker from settling the active attempt.
3. Expired leases can be reclaimed. Expired attempts are recorded in the attempt log.
4. Resend requests use the delivery `idempotency_key` as the provider idempotency header.
5. Transient errors use capped exponential backoff. Permanent 4xx/payload errors are quarantined immediately.
6. Exhausted deliveries enter `notification_delivery_dead_letters`; attempts and provider message IDs are retained.
7. A worker whose lease was replaced cannot mark the delivery as sent or failed.

## Payload contract

Email payload:
- `to`: one validated email address
- `subject`: 1–180 characters
- `text` or `html`: at least one, max 200 KB

Push payload:
- `to`: one `ExpoPushToken[...]`
- `title`: 1–120 characters
- `body`: 1–1000 characters
- `data`: optional JSON object

Only trusted server-side notification creation should write provider payloads. Never store credentials or private student records in push data; send opaque resource IDs and fetch them through normal RLS-protected app requests.

## Verification before production activation
- Run Edge Function checks and the notification PostgreSQL integration test.
- Configure the secrets in a non-production project and run a provider sandbox test.
- Verify the Resend sender/domain, Expo credential, opt-out/preferences logic and quiet hours.
- Test duplicate invocation, timeout after provider acceptance, retry/backoff, lease expiry, permanent errors and dead-letter handling.
- Add a scheduler only after all checks pass and the provider budgets/limits are agreed.

## Current status
Source and automated tests are included in the Phase 6–10 feature branch. This change does not deploy the worker, configure secrets, install a cron schedule, or send live notifications.
