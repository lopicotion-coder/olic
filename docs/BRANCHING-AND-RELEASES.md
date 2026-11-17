# Branch and release policy

## Branches

- `main`: stable archive and recovery tooling.
- `develop`: integration branch for ongoing work.
- `release/v0.1.0-html-prototype`: historical snapshot of the first HTML prototype.
- `release/v0.2.0-modular-prototype`: historical snapshot containing both HTML prototypes.
- `release/v1.0.0-prototype-bundle`: historical snapshot containing the Lovable demo source, Supabase inventory/types and recovery tooling.

## Workflow

1. Start changes from `develop` using a short-lived feature branch.
2. Run checks and review the diff.
3. Merge feature branches to `develop` through a pull request.
4. Merge accepted milestones from `develop` to `main`.
5. Create a new release branch from the exact accepted `main` commit; record its commit SHA in `releases/manifest.json`.

Never force-push or rewrite release branches. For rollback, check out the release branch or exact commit SHA.

The connected GitHub tool can create branches and commits but does not expose GitHub Release/tag creation. These release branches are the current restore points; annotated tags and GitHub Release pages can be added from GitHub's UI later.

## Hosting integration later

Vercel and Cloudflare should connect to this same repository only when the intended app root is production-ready. For the archived Lovable demo the root directory is `prototypes/lovable-command-center`; do not point a deployment at the repository root.
