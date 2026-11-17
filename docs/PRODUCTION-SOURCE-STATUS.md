# Production source status — My School

## Current finding (2026-11-17)

The GitHub repositories inspected in the connected account were:

- `backup`: only README.md, index.html, and modular.html; prototype archive source.
- `selsep-edu`: separate React/Vite/Supabase education and assignments platform.
- `Winstone`: private Winston V2 update-feed repository scaffold.
- `olic`: was empty before this prototype archive was created.
- `draft`: empty.

No complete production My School application source was found in these repositories.

## Supabase-first development context

The user confirms My School was developed directly in Supabase. This means the live Supabase project may contain database schema, Auth configuration, Storage buckets, Edge Functions, and data, but it does not automatically mean the full frontend source is recoverable from Supabase.

The correct recovery process is:
1. Identify the exact Supabase project used by My School.
2. Inspect schema, migration history, Edge Functions, Storage buckets, and project configuration without changing production data.
3. Locate the frontend source separately (local workspace, Lovable project, or another connected GitHub account/repository).
4. Export/pull the actual migrations and function source into a clean production repository.
5. Validate the repository against the live schema before making any deployment or database changes.

Do not copy Selsep EDU into My School; they are separate products.
