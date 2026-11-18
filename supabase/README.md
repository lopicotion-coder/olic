# My School Supabase snapshot

This folder records a read-only snapshot of the connected My School Supabase project as observed on 2026-11-18.
A separate production hardening follow-up was applied on 2026-11-18 and is documented in `docs/SECURITY-REVIEW-2026-11-18.md`.

- Project ref: `yigixquioguqnpbfhepi`
- Region: `eu-west-1`
- PostgreSQL: `17.11.0.018`
- Applied migration history: 40 entries
- Public/app table inventory: 115 entries
- Storage buckets: 1
- Deployed Edge Functions observed: 0 (AI/curriculum workers pending)

## Files

- `inventory/project-snapshot.json`: sanitized metadata, table names and RLS enabled flags.
- `inventory/storage-buckets.json`: bucket policies/configuration only; no file bytes.
- `inventory/edge-functions.json`: Edge Function inventory.
- `inventory/extensions.json`: installed PostgreSQL extensions.
- `migrations/applied-history.json`: exact migration version/name ledger from Supabase.
- `types/database.types.ts`: generated TypeScript types for the public schema.

## Important limitations

The connected migration-history API returned migration versions and names, not the original SQL bodies. No fabricated SQL migrations were written.

This repository is Public. No production rows, Auth users, password hashes, service-role keys, database credentials, or Storage object contents are committed. The encrypted backup workflow stores database and Storage bytes in private R2 after its required secrets are configured.

The Phase 9 schema and minute scheduler are live. PGMQ queues are ready; AI/curriculum worker Edge Functions and Grok/Gemini/OpenAI/OpenRouter secrets are still pending.

This is metadata and source support, **not yet a complete restore archive**. See `docs/BACKUP-RESTORE.md`.
