# AI Worker Operations

## Purpose
`ai-worker` executes privileged background jobs with the Supabase service-role client. It must not be callable by ordinary authenticated users.

## Required secrets
Configure `AI_WORKER_INTERNAL_TOKEN` as a Supabase Edge Function secret for `ai-worker`. Use a cryptographically random value of at least 32 characters (prefer 32 random bytes encoded as hex/base64url). Never expose this value to a browser or commit it to Git.

The Edge Function platform must continue to enforce `verify_jwt=true`. Requests to `POST /run` must include:
- a valid Supabase bearer JWT (server-side caller only); and
- `x-worker-token: <AI_WORKER_INTERNAL_TOKEN>`.

A missing secret causes worker execution to fail closed with HTTP 503. A wrong token receives HTTP 401. The health endpoint returns only a non-sensitive readiness response.

## Current deployment note
The authentication hardening is prepared on the feature branch only. Do not deploy until:
1. the internal secret has been generated and stored securely;
2. the scheduled caller has a server-side way to send both credentials;
3. automated tests and a non-production deployment verify denial for ordinary JWTs and acceptance for the internal caller.

Do not place the internal token in cron SQL text, a public app variable, client-side code, logs, screenshots or GitHub commits.

## Invocation example (server-side only)
```http
POST /functions/v1/ai-worker/run
Authorization: Bearer <server-side Supabase JWT>
x-worker-token: <AI_WORKER_INTERNAL_TOKEN>
Content-Type: application/json

{"mode":"all","limit":3}
```

## Queue and scheduler state

The feature branch includes atomic job-claim/lease handling, pgmq queue consumption, retries, and the protected `POST /run` endpoint. The current CI validates Deno types and unit tests, but a staging concurrency/duplicate-delivery test is still required.

The ready-to-review operator script is `docs/AI-WORKER-SCHEDULER.sql`. It reads `project_url`, `publishable_key`, and `worker_internal_token` from Vault, then creates a one-minute Cron job that calls `/functions/v1/ai-worker/run` with both gateway and Worker authorization. It must only be executed after branch code is deployed, Edge Function secrets are configured, and staging validation is complete. No production schedule has been created.
