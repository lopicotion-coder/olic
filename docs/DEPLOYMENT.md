# Production deployment readiness

## Current status

**Do not deploy this branch to production yet.** A new Vite + Supabase frontend now exists under `frontend/` on `feature/platform-expansion-plan`, but it is a proposed rebuild, not recovered production UI. It has not been deployed, and the full user journeys have not yet passed isolated-environment validation. The private `draft` repository remains an archive of prototypes only.

No Vercel or Cloudflare deployment is currently confirmed for My School:
- Vercel's connected Git context shows `lopicotion-coder/selsep-edu`, a separate education/assignments product.
- No Cloudflare Pages/Workers project linked to `olic` was verified.
- Cloudflare R2 is not enabled on the connected account yet.

## Intended production deployment flow

Once the actual frontend source is recovered and committed:

1. Confirm the application framework and production build command from its real `package.json`.
2. Keep the app root at repository root unless the source layout proves otherwise.
3. Link the `main` branch to Vercel Production.
4. Link `develop` to Preview.
5. Add only required runtime environment variables using Vercel's encrypted environment-variable store; never commit secrets.
6. Configure Cloudflare DNS/proxy only after the Vercel project and domain ownership are verified.
7. Test authentication, role scoping, RLS, Storage permissions, and tenant isolation against a non-production test environment.
8. Perform a rollback rehearsal before enabling real schools.

## Cloudflare role

Cloudflare can provide DNS, WAF, rate limiting, caching, and (after enabling R2) private off-site backup storage. Do not route production traffic to a prototype or the current archive.

## Release rule

Every production deployment must use a reviewed `main` commit. Preview deployments must not use production secrets or production data unless separately approved and protected.
