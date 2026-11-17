# My School — Production Repository

This repository is the **production source of truth** for My School. Production application code, database migrations, generated database types, deployment configuration, and operational tooling belong here. Experimental UI prototypes belong in the private repository `lopicotion-coder/draft`.

## Current production baseline

The connected Supabase project was identified by its school/tenant/student/guardian/attendance/communications/AI schema:

- Project ref: `yigixquioguqnpbfhepi`
- Region: `eu-west-1`
- PostgreSQL: `17.11.0.018`
- Applied migration ledger entries: 30
- Public/app table inventory: 100
- Storage buckets: 1 (`school-files`, private)
- Edge Functions observed: 0

The repository currently contains a sanitized project inventory, generated public database types, the applied migration history ledger, and encrypted backup automation.

## Important: production frontend source is not yet present

The frontend source that powers the actual live My School experience has **not yet been recovered**. The Lovable project called *My School Command Center* is a separate prototype with fictional seed data and a placeholder home route; it is archived in the private `draft` repository, not here.

Supabase contains the production database/backend schema, but the migration-history endpoint returned migration names and versions rather than the original SQL files. Do not mistake the metadata ledger for a restore-ready migration directory.

This repository is reserved for production. Do not deploy it to Vercel or Cloudflare until the actual production frontend/app source and required migrations have been added and tested.

## Repository layout

```text
olic/
├── .github/workflows/       # encrypted backup automation
├── docs/                    # production operations and recovery runbooks
├── releases/                # production release manifest
├── scripts/backup/          # Storage export and restore utilities
└── supabase/
    ├── inventory/           # sanitized live-project snapshot
    ├── migrations/          # applied-history ledger; original SQL still missing
    └── types/               # generated public-schema TypeScript types
```

## Branch policy

- `main`: production baseline; only reviewed production-ready changes.
- `develop`: integration branch for the next production release.
- Use short-lived feature branches from `develop`; merge by pull request.
- Release branches and Git tags must be cut from a reviewed `main` commit.
- Historical `release/*-prototype` branches are retained for rollback/audit only. New prototypes go to `lopicotion-coder/draft`.

See `docs/BRANCHING-AND-RELEASES.md`.

## Backup and recovery

The daily GitHub Actions workflow creates PostgreSQL dumps and a Storage object archive, encrypts them with age, then uploads the encrypted archive to Cloudflare R2. It **will safely skip** until all required GitHub Actions secrets are configured.

Cloudflare R2 is not enabled on the connected account yet. Enable R2, create a private bucket, and configure the secrets described in `docs/BACKUP-RESTORE.md` before expecting a real off-site backup.

## Deployment status

No Vercel or Cloudflare deployment is currently linked to this repository. Vercel currently has a Git-linked project for `selsep-edu`, which is a separate product. See `docs/DEPLOYMENT.md`.
