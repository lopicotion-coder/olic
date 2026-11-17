# Supabase encrypted backup and restore

## Backup contents

The workflow in `.github/workflows/supabase-backup.yml` creates:
- PostgreSQL roles dump.
- PostgreSQL schema dump (including database-level objects captured by Supabase CLI filtering).
- PostgreSQL data dump.
- All Storage bucket object bytes plus a manifest.

It encrypts the archive with `age` and uploads only ciphertext to a private Cloudflare R2 bucket. Plaintext database dumps and Storage files are temporary on the GitHub runner and are not committed to this repository.

## GitHub Actions secrets required

Add under Repository → Settings → Secrets and variables → Actions:

- `SUPABASE_DB_URL`: project PostgreSQL connection string.
- `SUPABASE_URL`: Supabase API URL.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key used by the runner only to enumerate/download private Storage objects.
- `AGE_RECIPIENT`: public `age1...` encryption recipient.
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`: private R2 bucket name.

Keep the matching age **private identity** offline in a password manager or another secure recovery location. Never commit it.

## Run

Actions → **My School Supabase encrypted backup** → Run workflow. It also runs daily at 02:17 UTC once all secrets are configured. Before that, the job safely skips.

## Restore procedure

1. Download the encrypted backup object and checksum from private R2.
2. Verify SHA-256, then decrypt using the offline age identity.
3. Extract it on a trusted machine.
4. Restore into a **new test Supabase project** or a compatible PostgreSQL instance first.
5. Reconfigure service-level settings that are not in the SQL dump (Auth providers, SMTP, OAuth, custom domains and secrets).
6. Restore Storage bytes using `scripts/backup/restore-storage.mjs` after the bucket metadata has been created/restored.
7. Verify table counts, RLS, Auth login and Storage permissions before any production cutover.

Do not test restoration over the live production database.

## Retention

Configure R2 lifecycle separately. Suggested starting point: daily backups retained for 30 days and monthly backups for 12 months. Retention is not created automatically by this repository.
