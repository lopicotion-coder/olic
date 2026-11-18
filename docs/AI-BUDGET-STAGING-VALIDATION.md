# AI Runtime Staging Validation

This checklist is mandatory before merging PR #13 or deploying its migrations and Worker. It must run on an isolated Supabase Development Branch or staging project, never on production.

## Environment gate

- [ ] Create an isolated Supabase branch from the current production schema. Production data must not be copied into the test environment.
- [ ] Apply migrations in repository order, including `20261118210000` through `20261119000000`.
- [ ] Confirm every migration appears in the branch migration ledger.
- [ ] Deploy branch versions of `ai-worker` and `ai-gateway` with `verify_jwt=true`.
- [ ] Provision test-only secrets: `AI_WORKER_INTERNAL_TOKEN`, provider API key, and `AI_EMBEDDING_PRICE_PER_MILLION`. Do not use production provider keys or budgets.
- [ ] Create test-only tenant/school AI budget rows and provider routes with positive USD prices. Leave platform learner AI disabled until its own test configuration is inserted.

## SQL integrity checks

Run after migrations in the staging branch:

```sql
select
  to_regclass('public.ai_background_budget_reservations') as background_reservations,
  to_regclass('public.ai_background_budget_events') as background_events,
  to_regprocedure('public.worker_reserve_background_ai_operation(text,uuid,uuid,uuid,text,text,text,text,numeric,integer,integer,jsonb)') as reserve_background,
  to_regprocedure('public.worker_finalize_background_ai_operation(text,text,text,integer,integer,numeric,jsonb)') as finalize_background,
  to_regprocedure('public.worker_fail_background_ai_operation(text,text,text,integer,integer,numeric,text,jsonb)') as fail_background,
  to_regprocedure('public.worker_fail_ai_request_after_provider(uuid,uuid,text,text,integer,integer,numeric,text,jsonb)') as fail_tenant_request,
  to_regprocedure('public.worker_fail_learner_ai_request_after_provider(uuid,text,text,integer,integer,numeric,text,jsonb)') as fail_learner_request;
```

All columns should return a non-null object/function reference.

Check RLS and server-only permissions:

```sql
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ai_background_budget_reservations','ai_background_budget_events');

select
  has_function_privilege('anon', 'public.worker_reserve_background_ai_operation(text,uuid,uuid,uuid,text,text,text,text,numeric,integer,integer,jsonb)', 'EXECUTE') as anon_can_reserve,
  has_function_privilege('authenticated', 'public.worker_reserve_background_ai_operation(text,uuid,uuid,uuid,text,text,text,text,numeric,integer,integer,jsonb)', 'EXECUTE') as authenticated_can_reserve,
  has_function_privilege('service_role', 'public.worker_reserve_background_ai_operation(text,uuid,uuid,uuid,text,text,text,text,numeric,integer,integer,jsonb)', 'EXECUTE') as service_role_can_reserve;
```

Expected: RLS enabled; `anon_can_reserve=false`; `authenticated_can_reserve=false`; `service_role_can_reserve=true`.

## Functional acceptance

- [ ] Tenant/school interactive request with a valid route and budget reserves before provider invocation and writes one completed budget event.
- [ ] Missing or zero USD price, missing route, inactive budget, or exhausted cap blocks the provider call.
- [ ] Question generation does not fall back to a default provider/model and requires a priced `exam_generator` route.
- [ ] Question generation, ingestion embeddings, queued chunk/question embeddings, and RAG query embeddings reserve and settle against the same tenant/school cap.
- [ ] Platform/global background embeddings fail closed while `platform_ai_runtime_settings.is_enabled=false`.
- [ ] After enabling a test platform budget, learner chat and learner RAG embeddings share the same platform cap; no school budget is charged.
- [ ] Embedding batches above the input-token cap split before provider invocation; each sub-call creates exactly one reservation and one event.
- [ ] Simulate response-persistence failure after a successful provider call for both tenant AI and learner AI: the request is terminally failed, an `outcome='failed'` event records actual usage/cost, and the provider is not invoked again for that request.
- [ ] Simulate a lost RPC response after `worker_finalize_ai_request` / `worker_finalize_learner_ai_request` commits: the follow-up failure RPC returns `false`, the Worker preserves the completed request and archives the duplicate queue message without overwriting status.
- [ ] Simulate normal settlement failure after background provider success: `worker_fail_background_ai_operation` writes one `outcome='completed'` event with `settlement_fallback=true`, removes the reservation, and returns the same provider output to the job for persistence.
- [ ] Simulate both settlement RPCs unavailable: reservation remains until TTL, no automatic second provider call occurs, and the critical log contains the operation/request ID.
- [ ] Run concurrent reservations near the monthly budget/request cap; row locks must prevent aggregate reservations from exceeding available budget.
- [ ] Duplicate queue deliveries and simultaneous Worker invocations claim a job once; retryable pre-provider failures do not leave reservations behind.
- [ ] Internal Worker token missing/incorrect is denied even with a valid JWT; valid server-side JWT plus the correct token is accepted.
- [ ] Cron triggers `POST /functions/v1/ai-worker/run`; inspect `net._http_response` for 2xx and Worker result counts.

## Release gate

Do not merge or deploy until all checks above pass and the test branch’s migration/function results are reviewed. The GitHub Deno CI workflow does not execute PostgreSQL migrations; a green CI run is necessary but not sufficient.
