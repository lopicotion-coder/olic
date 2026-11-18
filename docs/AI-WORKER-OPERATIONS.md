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

## Known follow-up
Atomic job claiming and pgmq consumption are tracked separately. This auth guard does not by itself solve duplicate concurrent claims or connect the scheduler to the worker.
