# My School AI Gateway operations

## Trust boundary
The AI Gateway is a server-to-server provider proxy, not a browser-facing API. It requires both Supabase Edge Function JWT verification and a separate internal token header.

- Supabase Edge Function setting: keep `verify_jwt=true`.
- Required Edge Function secret: `AI_GATEWAY_INTERNAL_TOKEN`.
- Request header: `x-gateway-token`.
- Minimum token length: 32 characters; use 32 cryptographically random bytes encoded as hex or base64url.
- Keep the token only in server-side secret stores. Never place it in browser code, a public Vercel variable, logs, SQL migration text, or Git.

The gateway fails closed with HTTP 503 when the internal token is missing and HTTP 401 for a wrong token.

## Model and token controls
Optional environment variables:
- `AI_GATEWAY_ALLOWED_MODELS_OPENROUTER`
- `AI_GATEWAY_ALLOWED_MODELS_OPENAI`
- `AI_GATEWAY_ALLOWED_MODELS_GEMINI`
- `AI_GATEWAY_ALLOWED_MODELS_XAI`

Each is a comma-separated model allowlist. When unset, only the provider's configured default model is allowed.

`AI_GATEWAY_MAX_OUTPUT_TOKENS` sets the server maximum, capped at 8192. Requests above this limit are rejected.

## Intended client architecture
Browsers should not call this Gateway directly. Authenticated client requests should be created through permission-checked database RPCs and queued for `ai-worker`. The Worker enforces learner/tenant scope, entitlements and budgets before provider use. The Gateway remains reserved for trusted service-to-service integrations.

## Deployment status
The internal-token guard and request controls currently exist on `feature/platform-expansion-plan` only. They are not deployed. Do not deploy until:
1. the internal secret is provisioned securely;
2. server-side callers can send it;
3. Deno tests and a non-production deployment verify denial for ordinary JWT-only requests;
4. the user/tenant budget enforcement path is verified end to end.

No production Supabase settings were modified as part of this change.
