# Production architecture baseline

## Current source of truth

- Production backend: Supabase PostgreSQL project `yigixquioguqnpbfhepi` (EU West).
- Production repository: `lopicotion-coder/olic`.
- Prototype repository: private `lopicotion-coder/draft`.

## Required modular application layout (when source is recovered)

Keep the production application modular by domain, not by a collection of role-specific monoliths:

- `apps/web`: React/TypeScript client, route composition and layouts.
- `apps/api`: server-side API/BFF and authorization boundary (only if the production source uses a separate API).
- `packages/ui`: shared primitives, tokens and accessible components.
- `packages/auth`: session, identity and role/scope helpers.
- `packages/domain`: school, academic year, students, guardians, teachers, attendance, grades, fees, communication, transport, device policy and AI feature contracts.
- `supabase/migrations`: immutable SQL migrations in version order.
- `supabase/functions`: Edge Functions with least-privilege access (currently none were found deployed).
- `supabase/tests`: RLS, tenant-isolation, role-matrix and critical workflow tests.
- `infra`: deployment and monitoring configuration.

This is the target organizational plan, not a claim that these source folders currently exist.

## Security boundaries

- Every tenant-owned database object must be scoped by tenant and school identifiers where appropriate.
- RLS is the database enforcement layer; UI route guards are not an authorization boundary.
- Privileged keys remain server-side and never ship in browser bundles.
- Parent/guardian access must be based on explicit student-guardian relationships.
- Location, transport and parental-control data require explicit authorization, retention rules and audit trails.
- Backup archives containing production records must be encrypted before leaving the trusted environment.

## Current gap

The production frontend source, original migration SQL bodies, and tested backup archive are not yet present. Recover and validate those before deploying this repository.
