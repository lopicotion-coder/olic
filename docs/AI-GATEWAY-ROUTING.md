# My School — AI Gateway provider routing

## Runtime path

All chat-completion work performed by the AI Worker is sent to the internal Supabase Edge Function:

`ai-worker → ai-gateway → selected provider`

The Worker still owns the authorization context, tenant/school budget reservation, provider/model record, and final usage settlement. The Gateway owns provider API keys, provider-specific request formats, model allowlists, and response normalization. Provider secrets are not sent back to the Worker or browser.

The selected provider and model come from the enabled `ai_provider_routes` row for the request feature and tenant/school scope. A provider route is not inferred from a frontend request.

## Required Edge Function secrets

Configure these in Supabase Edge Function Secrets (project-level):

- `OPENAI_API_KEY` — used only by the Gateway for OpenAI chat routes and the `text-embedding-3-small` embeddings route.
- `OPENROUTER_API_KEY` — used only by the Gateway for OpenRouter routes.
- `GEMINI_API_KEY` — used only by the Gateway for Gemini routes.
- `AI_GATEWAY_INTERNAL_TOKEN` — a random secret of at least 32 characters. The Worker sends it only in the server-to-server `x-gateway-token` header; the Gateway compares it in constant time.
- `AI_WORKER_INTERNAL_TOKEN` — a separate random secret of at least 32 characters. Required by the Worker to authenticate its own internal/scheduler trigger requests. Do not reuse the Gateway token.

The existing Supabase service-role credential is used only by the Worker to call the protected Edge Function. Never put it in the browser or commit it to Git.

Optional:

- `AI_GATEWAY_URL` — optional base URL of the `ai-gateway` Edge Function (for example `https://<project-ref>.supabase.co/functions/v1/ai-gateway`). When omitted, the Worker derives it from `SUPABASE_URL`.
- `AI_GATEWAY_ALLOWED_MODELS_OPENAI`, `AI_GATEWAY_ALLOWED_MODELS_GEMINI`, `AI_GATEWAY_ALLOWED_MODELS_OPENROUTER` — comma-separated exact chat model IDs allowed for each provider. The fallback allowlist is limited to the Gateway's single default model for that provider.
- `AI_GATEWAY_ALLOWED_EMBEDDING_MODELS_OPENAI` — comma-separated exact embedding model IDs; defaults to `text-embedding-3-small`.
- `AI_GATEWAY_DEFAULT_MODEL_OPENAI`, `AI_GATEWAY_DEFAULT_MODEL_GEMINI`, `AI_GATEWAY_DEFAULT_MODEL_OPENROUTER` — defaults used by the Gateway when a model is not provided; normal Worker requests use the model from the database route.
- `AI_GATEWAY_MAX_OUTPUT_TOKENS`, `AI_GATEWAY_HTTP_REFERER`, `AI_GATEWAY_APP_NAME`.

Do not add provider credentials to frontend environment variables, Vite files, SQL rows, or GitHub.

## Database and spend gates

A working API key is not sufficient to enable AI. Before any paid request can run:

1. Validate and release the branch's AI schema migrations only after a reproducible backup and isolated SQL validation.
2. Add an explicit enabled `ai_provider_routes` row for the feature and tenant/school scope. Its model ID must exactly match the Gateway allowlist.
3. Configure a funded active USD `ai_budgets` row with monthly spend/request caps and token limits.
4. For RAG embeddings, set a positive `AI_EMBEDDING_PRICE_PER_MILLION` matching the selected embedding model's current price and fund the corresponding budget.

Missing routes, secrets, allowlist entries, or budgets fail closed. The production database currently has no configured provider routes or AI budget rows, and this code change does not create them or spend provider credits.

## Current scope and limitations

- OpenAI, Gemini, and OpenRouter chat requests are routed through the same protected Gateway contract.
- Both chat completions and OpenAI `text-embedding-3-small` embeddings are routed through the protected Gateway. Embeddings remain OpenAI-only because the database vector column is fixed at 1536 dimensions.
- One enabled database route is selected per feature/scope. Automatic cross-provider failover is deliberately not enabled in this change: a timeout can occur after a provider has processed a paid request, and retrying against another provider without a separate reservation/settlement state machine could double-charge. Priority-based failover needs its own budget-aware implementation and tests.
- Streaming is not enabled.
- The Gateway keeps JWT verification enabled and additionally requires the internal token. Do not disable either protection for browser access.

## Local verification

The Deno CI workflow type-checks the Worker and Gateway and runs the shared Gateway-client tests. Local Edge Function secrets belong in `supabase/functions/.env`; never commit that file.
