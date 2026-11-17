# Production branch and release policy

## Active branches

- `main`: stable production source of truth.
- `develop`: integration branch for upcoming work.
- `feature/*`: short-lived changes based on `develop`.
- `hotfix/*`: urgent production fixes based on `main`, then merged back into `develop`.

## Release flow

1. Create feature branches from `develop`.
2. Run build, lint, tests, type checks, migration validation, and security review.
3. Merge feature branches to `develop` through pull requests.
4. Validate on a non-production Supabase branch/project and Vercel Preview.
5. Merge an accepted release candidate to `main`.
6. Create an immutable Git tag/release from the exact `main` commit.
7. Deploy that commit and record the deployment ID, migration versions, and backup checkpoint.

Never force-push or rewrite production history. A rollback must select a known-good production commit and separately evaluate whether database migrations are reversible.

## Prototype separation

The current historical `release/v0.1.0-html-prototype`, `release/v0.2.0-modular-prototype`, and `release/v1.0.0-prototype-bundle` branches in this repository are legacy records from before the production/prototype split. They are retained for audit/rollback history only.

All active prototypes and experimental UI versions belong in the private `lopicotion-coder/draft` repository. Do not add new prototype screens to the production branch.

## Version manifest

See `releases/manifest.json`. Release entries must point to exact immutable commit SHAs and include the corresponding deployment record once production deployments exist.
