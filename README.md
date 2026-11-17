# My School — Prototype Archive & Recovery Workspace

This repository preserves My School experimental UI prototypes, the Lovable-built **My School Command Center** demo source, sanitized metadata from the live Supabase project, and tooling for encrypted off-site backups.

> **Not the production application yet.** The Lovable source archived here is a fictional-data UI prototype. The live Supabase project is a separate backend resource. Do not deploy this prototype as a production school system.

## Contents

- `prototypes/ui-v4.1/`: original single-file HTML prototype.
- `prototypes/modular-phase-9/`: role-oriented standalone HTML prototype.
- `prototypes/lovable-command-center/`: text source archive from the Lovable project **My School Command Center**.
- `supabase/`: sanitized project inventory, applied migration ledger, and generated public TypeScript types.
- `scripts/backup/`: Storage export and restore scripts.
- `.github/workflows/supabase-backup.yml`: scheduled/manual encrypted database + Storage backup workflow to private Cloudflare R2.
- `docs/`: source status, branch policy, deployment and recovery instructions.

## Prototype status

The Lovable project uses fictional demo data, browser-local state, and a placeholder home route. It is archived for recovery/design reference, not certified production-ready. Its binary favicon was not transferred through the source connector; see `prototypes/lovable-command-center/ARCHIVE-NOTES.md`.

## Production database

The connected My School Supabase project was identified by its school/tenant/student/guardian/attendance/AI schema. This repo contains metadata and generated public types only. The encrypted backup workflow requires GitHub Actions secrets and a private R2 bucket; no live database rows, Auth records, or Storage file contents are committed to GitHub.

## Run the archived Lovable demo locally

From `prototypes/lovable-command-center`:

```bash
bun install --frozen-lockfile
bun run dev
```

Build and test scripts are defined in that project's `package.json`. A successful build/test run has **not** yet been asserted by this archive operation.

## Deployment later

The archived demo's repository root is `prototypes/lovable-command-center`. Do not connect Vercel or Cloudflare to repository root: it contains docs and archives, not a production app root. Before publishing, replace the placeholder route, run build/tests, and confirm the platform adapter. See `docs/DEPLOYMENT.md`.

## Branching

- `main`: stable archive and recovery tooling.
- `develop`: integration branch for future work.
- `release/v0.1.0-html-prototype`: first HTML prototype snapshot.
- `release/v0.2.0-modular-prototype`: two HTML prototypes snapshot.
- `release/v1.0.0-prototype-bundle`: full prototype/source archive snapshot.

New work goes to `develop`, then a reviewed PR to `main`. Release branches are historical restore points; never rewrite them.
