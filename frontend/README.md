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
- The student Learning Home reads active class enrollments, published lessons, published assignments, submissions, and published grades from the existing production tables. The Content reader opens the full published lesson body.
- Student/parent lesson lists are additionally filtered in the frontend to school-wide content and classes in their active enrollments. This is defense in depth only: a live Production RLS defect still allows broader class-content reads through the Data API. See P0 issue #15 and do not treat this UI filter as the database security fix.

## Explicitly unavailable

- The independent learner profile, mastery/track APIs and adaptive practice are not available against production until their migrations are safely applied and validated. The Learning Home falls back to ordinary school content, assignments and grades without claiming adaptive practice is active.
- Bank of Questions is intentionally disabled in this browser build. Current RLS policies depend on server-side tenant/school request context, which is not set by ordinary browser Data API requests.
- A separate P0 issue exists in the current Production `content_items_read` RLS policy: school membership may make class-specific published lessons readable without checking the student's active class enrollment. The frontend filter does not fix raw Data API access. Correct the policy and prove negative cross-class tests before onboarding real students. See https://github.com/lopicotion-coder/olic/issues/15.
- No online payment gateway is connected. Fee payments can only be recorded after money has actually been received through an external process.
- AI tutor and question generation are not represented as active UI workflows until production routes, budgets, worker invocation and feature migrations are deployed and tested.

## Security

Never expose a Supabase service-role key, database password, AI provider credential, payment-provider secret or worker token through `VITE_*` variables. Browser environment variables are public in the built assets.
