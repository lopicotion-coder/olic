# Production deployment readiness

## Current status

**Do not deploy this branch to production yet.** A new Vite + Supabase frontend now exists under `frontend/` on `feature/platform-expansion-plan`, but it is a proposed rebuild, not recovered production UI. It has not been deployed, and the full user journeys have not yet passed isolated-environment validation. The private `draft` repository remains an archive of prototypes only.

No Vercel or Cloudflare deployment is currently confirmed for My School:
- Vercel's connected Git context shows `lopicotion-coder/selsep-edu`, a separate education/assignments product.
- No Cloudflare Pages/Workers project linked to `olic` was verified.
- Cloudflare R2 is not enabled on the connected account yet.

## Intended production deployment flow

The current candidate frontend lives in `frontend/`:

1. Use Node.js 24 and run `npm install` then `npm run build` from `frontend/`; the static output is `frontend/dist/`.
2. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the hosting provider. Only a publishable/anon key is allowed in browser variables. Never expose a service-role key, database password, provider key or internal worker token.
3. Configure the production site's Auth redirect URLs and password-recovery redirect URLs in Supabase Auth.
4. Run the GitHub Actions frontend check and fix all failures.
5. Validate login, recovery, membership-context switching, RLS row visibility, all write forms, empty states, and tenant/school/class isolation against a non-production Supabase environment.
6. Resolve the remaining server-side request-context requirement before enabling Bank of Questions or any query whose RLS policy depends on `app.current_tenant_id()` / `app.current_school_id()`.
7. Keep independent learner identity/practice disabled until the corresponding feature-branch migrations have been backed up, applied to an isolated database and validated.
8. Only then configure the hosting provider and deploy a reviewed `main` commit. Rehearse rollback before enabling real schools.

## Cloudflare role

Cloudflare can provide DNS, WAF, rate limiting, caching, and (after enabling R2) private off-site backup storage. Do not route production traffic to a prototype or the current archive.

## Release rule

Every production deployment must use a reviewed `main` commit. Preview deployments must not use production secrets or production data unless separately approved and protected.
