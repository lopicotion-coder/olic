# My School frontend

A browser application built with Vite, vanilla JavaScript modules, and Supabase JS.

## Local setup

1. Install Node.js 24 or later.
2. Copy `.env.example` to `.env.local`.
3. Set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (publishable key or legacy anon key only)
4. Run `npm install`.
5. Run `npm run dev` and open the printed local URL.

Build with `npm run build`; preview the static output with `npm run preview`.

## Data and permissions

- No demo users, school records, sample metrics, seeded invoices or fabricated payment outcomes are included.
- Authentication is performed by Supabase Auth.
- Available workspaces are loaded from `membership_roles`, `roles`, `role_permissions`, `permissions`, and active memberships.
- Navigation is derived from granted permissions and user role; role selection is not an authorization mechanism.
- All application reads and writes use the browser Supabase client and remain subject to database RLS.
- Cross-school selectors are constrained to the active organization and school context.

## Explicitly unavailable

- The independent learner profile and practice APIs in the feature branch are not available against production until their migrations are safely applied and validated.
- Bank of Questions is intentionally disabled in this browser build. Current RLS policies depend on server-side tenant/school request context, which is not set by ordinary browser Data API requests.
- No online payment gateway is connected. Fee payments can only be recorded after money has actually been received through an external process.
- AI tutor and question generation are not represented as active UI workflows until production routes, budgets, worker invocation and feature migrations are deployed and tested.

## Security

Never expose a Supabase service-role key, database password, AI provider credential, payment-provider secret or worker token through `VITE_*` variables. Browser environment variables are public in the built assets.
