# My School production backup and restore

## Current implementation

`.github/workflows/supabase-backup.yml` is configured for:
- Daily schedule at 02:17 UTC.
- Manual execution through GitHub Actions.
- Supabase CLI database dumps for roles, schema and data.
- Private Storage object export with a manifest.
- age encryption and SHA-256 checksum.
- Upload of ciphertext and checksum to Cloudflare R2.

The workflow checks all required secrets and skips safely when any are missing.

## Current blocker

Cloudflare API inspection returned: **R2 must be enabled through the Cloudflare Dashboard**. No R2 bucket was verified or created. Therefore, no off-site backup has been uploaded yet.

Enable R2, create a dedicated private bucket (recommended name: `myschool-encrypted-backups`), then configure the following GitHub Actions secrets:

- `SUPABASE_DB_URL`: PostgreSQL connection string for the My School project.
- `SUPABASE_URL`: `https://yigixquioguqnpbfhepi.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key used only by the runner to export private Storage objects.
- `AGE_RECIPIENT`: public age recipient (starts with `age1...`).
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`: private R2 bucket name.

Store the age **private identity** offline in a password manager or another secure recovery location. Never commit it or add it as a workflow secret unless the restore workflow explicitly requires it.

## Run and validate the first backup

1. Configure R2 and all GitHub Actions secrets.
2. Run Actions → **My School Supabase encrypted backup** → Run workflow.
3. Confirm the job succeeds.
4. Confirm the R2 object and checksum exist.
5. Download the encrypted archive to a secure machine and verify SHA-256.
6. Decrypt using the offline age identity.
7. Restore to a brand-new test Supabase project.
8. Verify table counts, RLS policies, Auth login, Storage object access and key workflows.
9. Record the recovery time and recovery point achieved.

Do not test restoration over production.

## Storage restore

Use `scripts/backup/restore-storage.mjs` only after validating the destination project and setting `CONFIRM_STORAGE_RESTORE=YES`. Restore the database/bucket metadata first, then restore the Storage object bytes and verify private bucket policies.

## Service settings not included in the SQL/Storage archive

Configure separately during disaster recovery:
- Auth provider settings and OAuth secrets.
- SMTP provider credentials and templates.
- API keys and service secrets.
- DNS/custom domains and TLS.
- External integrations and webhook secrets.

## Retention

After the first successful backup, configure an R2 lifecycle policy separately. Suggested starting point: daily backups retained for 30 days and monthly backups for 12 months. This retention policy is not currently configured.
