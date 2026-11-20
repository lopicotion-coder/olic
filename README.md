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

## Frontend implementation status

A new browser frontend is being implemented under `frontend/` on `feature/platform-expansion-plan`. It is a schema-driven rebuild, **not a recovery of the previous live UI**. It uses Supabase Auth, reads role assignments and permissions from the database, and renders only records returned under the signed-in user's RLS policies. The UI contains no seeded users, sample schools, demo invoices, fake payment results or fabricated performance metrics.

The implementation is branch-only and has not been deployed. It is not approved for production until the frontend CI build passes, its data flows are verified against an isolated Supabase environment, the server-side tenant-context dependency is resolved for protected modules, and the deployment environment is configured.

The Lovable project called *My School Command Center* remains an archived prototype with fictional seed data in the private `draft` repository; it is not used by this implementation.

Supabase contains the live database/backend schema, but the original SQL bodies for the applied migrations are not fully recovered here. Do not mistake the metadata ledger for a restore-ready migration directory.

Do not deploy this branch to Vercel or Cloudflare until the release gates in `docs/DEPLOYMENT.md` are satisfied.

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
