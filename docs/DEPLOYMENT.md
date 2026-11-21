# Production deployment readiness

## Current status

**Do not deploy this branch to production yet.** A new Vite + Supabase frontend now exists under `frontend/` on `feature/platform-expansion-plan`, but it is a proposed rebuild, not recovered production UI. It has not been deployed, and the full user journeys have not yet passed isolated-environment validation. The private `draft` repository remains an archive of prototypes only.

## Hosting account snapshot (20 November 2026)

A Vercel project named `myschool` is linked to `lopicotion-coder/olic`, but its current READY deployment is **not the My School Vite application**:

- The observed deployment was built from the `main` commit `55f3f8eedf5bdcaa84935f12adbcdfa992935afe`.
- The deployment build completed in approximately 39 ms without a visible frontend dependency install or Vite production build.
- The project had no detected framework and no configured `frontend/` root directory.
- The Vite/Supabase frontend exists on `feature/platform-expansion-plan` only and has not been released to `main`.
- Deployment SSO protection was enabled on the observed Vercel deployment domains.

Therefore, a READY status or the existing `myschool` deployment URL must not be treated as evidence that the student application is deployed or launch-ready. Vercel project access was unavailable during the follow-up review, so no project settings or environment variables were changed.

No Cloudflare Pages/Workers project linked to `olic` was verified. Cloudflare R2 is not enabled on the connected account yet.

## Intended production deployment flow

The current candidate frontend lives in `frontend/`:

1. Configure the existing Vercel project to build the intended frontend from the reviewed feature branch (or from a reviewed release commit containing `frontend/`). Its build must run from `frontend/` using Node.js 24; the static output is `frontend/dist/`. The current READY deployment is not a valid app deployment.
2. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the hosting provider. Only a publishable/anon key is allowed in browser variables. Never expose a service-role key, database password, provider key or internal worker token.
3. Configure the production site's Auth redirect URLs and password-recovery redirect URLs in Supabase Auth.
4. Run the GitHub Actions frontend check and fix all failures.
5. Validate login, recovery, membership-context switching, RLS row visibility, all write forms, empty states, and tenant/school/class isolation against a non-production Supabase environment.
6. Resolve the remaining server-side request-context requirement before enabling Bank of Questions or any query whose RLS policy depends on `app.current_tenant_id()` / `app.current_school_id()`.
7. Keep independent learner identity/practice disabled until the corresponding feature-branch migrations have been backed up, applied to an isolated database and validated.
8. After all release gates pass and the frontend has been promoted through a reviewed PR into `main`, configure the production deployment to use `frontend/` and deploy that reviewed `main` commit. Rehearse rollback before enabling real schools.

## Cloudflare role

Cloudflare can provide DNS, WAF, rate limiting, caching, and (after enabling R2) private off-site backup storage. Do not route production traffic to a prototype or the current archive.

## Release rule

Every production deployment must use a reviewed `main` commit. Preview deployments must not use production secrets or production data unless separately approved and protected.
