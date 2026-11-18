# AI runtime budgets and operations

## What the runtime enforces

### Tenant and school requests
The Worker must load an enabled provider route with explicit positive USD input/output prices. It estimates prompt cost, reserves funds from the most-specific active school budget (or the tenant fallback), and rejects the job when there is no route, no active budget, a non-USD budget, or insufficient remaining funds.

On success, the Worker saves the response and usage, then calls one database function that atomically writes the billable event, closes the request, and releases the reservation. On a retryable failure before a provider response, it releases the reservation before re-queuing.

Required configuration rows:
- `ai_provider_routes`: one or more enabled routes for the tenant/feature; `input_price_per_million` and `output_price_per_million` must be current positive USD prices for the selected model.
- `ai_budgets`: an active USD budget for the tenant, optionally at school level; configure monthly amount, monthly request limit, input-token limit and output-token limit.

No route or budget is silently inferred. Missing configuration blocks execution.

### Independent learner requests
Learner-first tutoring is not charged to a school budget. It uses the separate singleton `platform_ai_runtime_settings`, plus platform reservation and spend ledgers. The singleton is inserted disabled by default. It must be configured with:
- provider key and exact model ID;
- current USD input/output prices per million tokens;
- platform monthly spend cap;
- platform monthly request cap;
- maximum input/output tokens.

The runtime remains disabled until all required values are non-null and positive. The Worker reserves chat cost in the platform learner ledger and RAG query-embedding cost in the background-operation ledger. Both ledgers share one platform monthly spend cap, request cap, and token limits.

### RAG embedding price
Set the Edge Function secret `AI_EMBEDDING_PRICE_PER_MILLION` to the current USD input price for `text-embedding-3-small`. It is mandatory for every embedding operation: tenant RAG retrieval, independent-learner RAG retrieval, curriculum-book ingestion, and queued chunk/question embedding jobs. Each provider call reserves budget before execution and records its own measured cost in `ai_background_budget_events`; the ledger shares the tenant/school or platform monthly spend and request cap with interactive AI.

## Background AI accounting

Question generation requires an enabled `exam_generator` provider route with a non-empty model, positive USD input/output prices, and a valid output-token cap. There is no fallback to a hardcoded provider or model.

The migration adds:
- `ai_background_budget_reservations`: pre-call reservations for operations that do not have an `ai_requests` row.
- `ai_background_budget_events`: one billable event for each successful provider operation, including its type, route, measured tokens and cost.
- `worker_reserve_background_ai_operation`, `worker_finalize_background_ai_operation`, `worker_fail_background_ai_operation`, and `worker_release_background_ai_operation`: server-only RPCs.
- `worker_fail_ai_request_after_provider` and `worker_fail_learner_ai_request_after_provider`: charge successful provider calls when response persistence fails and terminally fail the application request.

Background reservations and events are aggregated with `ai_budget_reservations` and `ai_budget_events` when calculating the same school/tenant monthly spend cap. The platform background ledger is likewise aggregated with `platform_ai_budget_reservations` and `platform_ai_budget_events`. Shared/global curriculum embeddings use the platform budget and stay blocked unless `platform_ai_runtime_settings` is enabled. The source file extraction and chunking stages are local; the paid embedding stage is budgeted.

The background ledger stores embedding costs separately from the parent chat cost, avoiding double billing. Every provider call has a success/failure event; failed persistence after a successful provider response is charged rather than silently released. Background API calls are recorded even if response persistence fails after the provider has returned successfully. In that case the request is marked terminally failed and a `failed` budget event captures the actual provider usage; it is not retried automatically. If the real cost or token usage exceeds the reserved cap, the event records `budget_overrun` / `token_limit_exceeded`, and later reservations see the recorded spend. If both the normal settlement RPC and its failure-outcome fallback are unavailable after the provider response, the reservation is retained until its expiry and a critical Worker log is emitted; reconcile this rare distributed failure from provider billing records. This failure window is an external API/database distributed-transaction limitation and must be monitored.

## Configuration examples

These are operator templates, not commands that should be run with placeholder values.

Configure the platform runtime only after choosing the provider/model and verifying its current price sheet:

```sql
update public.platform_ai_runtime_settings
set is_enabled = true,
    provider_key = '<openai|openrouter|gemini|xai>',
    model_key = '<exact-model-id>',
    input_price_per_million = <current-usd-input-price>,
    output_price_per_million = <current-usd-output-price>,
    monthly_budget_amount = <platform-monthly-usd-cap>,
    currency = 'USD',
    monthly_request_limit = <monthly-request-cap>,
    max_input_tokens = <max-input-tokens>,
    max_output_tokens = <max-output-tokens>,
    updated_at = now()
where singleton = true;
```

Before enabling, provision the corresponding provider key as a Supabase Edge Function secret. Do not place credentials in this file, migrations, GitHub Actions logs, or browser variables.

For tenant requests, insert the approved `ai_provider_routes` and `ai_budgets` rows through the platform's trusted admin workflow. Do not let a school administrator grant itself unlimited platform spend.

## Worker scheduling and deployment gate

The deployed project currently has a question-generation schedule, but no recurring Worker invocation. The Vault schema and decrypted-secrets view exist, but no credentials are registered there. Do not schedule the Worker through a public unauthenticated endpoint.

Before enabling background execution:
1. Set `AI_WORKER_INTERNAL_TOKEN` as a Supabase Edge Function secret and provision the same value to the trusted server-side caller.
2. Keep `verify_jwt=true` on `ai-worker`; the Worker checks both Supabase JWT and the internal token.
3. Configure `OPENAI_API_KEY` for embeddings and whichever provider secret matches the platform/tenant routes.
4. Set `AI_EMBEDDING_PRICE_PER_MILLION`.
5. Store `project_url`, `publishable_key`, and `worker_internal_token` in Supabase Vault, then review and run `docs/AI-WORKER-SCHEDULER.sql` after deploying the protected Worker. The script sends both the Supabase gateway key and the independent `x-worker-token`.
6. Verify in staging that JWT-only calls, missing-token calls, unpriced routes, missing budgets and budget exhaustion are denied; verify successful calls create exactly one spend event.

The Worker must be invoked by a protected scheduler using a valid Supabase JWT and `x-worker-token`. The current production project has no Worker cron entry, and no Vault-backed credentials are installed. A ready-to-review operator script is maintained separately; do not execute it until the Edge Function is deployed and the Vault secrets are populated.

The AI Gateway has its own `AI_GATEWAY_INTERNAL_TOKEN` and model allowlists. It is currently a separate server-to-server endpoint; the Worker still calls providers directly. Do not assume the Gateway token protects Worker provider calls.

## Snapshot observed during implementation (2026-11-19)
- `ai_provider_routes`: 0 rows.
- `ai_budgets`: 0 rows.
- `ai_budget_reservations`: 0 rows.
- `ai_budget_events`: 0 rows.
- `ai_background_budget_reservations` / `ai_background_budget_events`: introduced by this branch migration; not yet applied in production.
- Supabase Vault extension was not enabled in the production project's extension list when checked; `pg_cron` and `pg_net` are enabled.
- Active Cron jobs: the existing question-generation scheduler only; no AI Worker schedule.
- `vault.secrets`: no registered secrets.
- Deployed `ai-worker` and `ai-gateway` remain at their existing version 1; this feature branch has not been deployed.

Therefore the code is prepared but deliberately fails closed. Do not enable real AI usage until provider prices, limits, secrets, and scheduling are configured and tested in a non-production environment.


Background settlement fallback: if a provider responds but normal event finalization fails, the Worker now calls `worker_fail_background_ai_operation` to record the actual provider cost as a failed operation (including over-budget/token-limit metadata) and release the reservation. If that fallback call also fails, it retains the reservation until expiry and emits a critical log for manual reconciliation.
