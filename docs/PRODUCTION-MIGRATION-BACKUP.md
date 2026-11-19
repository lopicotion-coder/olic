# Production Migration Backup Gate (Free Plan)

Project: `yigixquioguqnpbfhepi`  
Organization plan observed: `Free`  
Prepared: 2026-11-19

## Why rollout is paused

The Free plan does not include customer-accessible automated daily database backups or downloadable dashboard backups. Supabase's current guidance is to create manual logical dumps with the CLI. The project currently has one Auth user and one matching public profile, no tenant/school/student/curriculum/question data, and no Storage objects. That is a small live data footprint, but it is not a reason to skip a verified backup.

The My School `backup_jobs` / `restore_jobs` tables are workflow metadata only. The only backup-related database helpers found are access-check functions; there is no backup executor or restore engine behind those rows.

## Manual logical dump on Windows PowerShell

Install the current Supabase CLI v3, then authenticate:

```powershell
supabase --version
supabase login
```

Run from the repository checkout. Keep the backup directory outside the public Git repository; never commit SQL dumps, Auth data, passwords, or credentials.

```powershell
$ErrorActionPreference = "Stop"
$backupDir = Join-Path $env:USERPROFILE "MySchool-PrivateBackups\2026-11-19"
New-Item -ItemType Directory -Force $backupDir | Out-Null

# Read the existing Database password from the Supabase Dashboard.
# Do not reset it as part of this procedure.
$securePassword = Read-Host -AsSecureString "Existing Supabase Database password"
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
  $env:SUPABASE_DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

  # CLI v3 is local by default. --remote explicitly selects the production project.
  supabase db dump --remote=yigixquioguqnpbfhepi --password $env:SUPABASE_DB_PASSWORD --file (Join-Path $backupDir "roles.sql") --role-only
  if ($LASTEXITCODE -ne 0) { throw "Role dump failed" }

  supabase db dump --remote=yigixquioguqnpbfhepi --password $env:SUPABASE_DB_PASSWORD --file (Join-Path $backupDir "schema.sql")
  if ($LASTEXITCODE -ne 0) { throw "Schema dump failed" }

  supabase db dump --remote=yigixquioguqnpbfhepi --password $env:SUPABASE_DB_PASSWORD --file (Join-Path $backupDir "data.sql") --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
  if ($LASTEXITCODE -ne 0) { throw "Data dump failed" }
}
finally {
  Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

Get-ChildItem $backupDir | Select-Object Name, Length
$dumpFiles = @("roles.sql", "schema.sql", "data.sql")
foreach ($name in $dumpFiles) {
  $file = Join-Path $backupDir $name
  if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) {
    throw "Backup file is missing or empty: $name"
  }
  Get-FileHash $file -Algorithm SHA256
}
```

## Coverage limits

- The CLI wrapper intentionally excludes Supabase-managed schemas such as `auth`, `storage`, and extension-managed schemas. These dumps are a logical backup of user-managed database schemas and their data, not a complete project disaster-recovery image.
- Storage object binaries are not part of a database dump. The live project currently reports zero `storage.objects`, but re-check before future rollouts.
- The migration set does not alter Auth users. A full rollback of the whole Supabase project still requires a supported managed backup/restore path or a separately planned Auth/Storage recovery strategy.
- Keep the three files encrypted and off-repository. A SHA-256 hash verifies file integrity, not restoreability.

## Release gate

Do not apply migrations or deploy the new Worker until:
1. The three dump files exist and are non-empty.
2. The operator has verified the files can be opened/read and stored them outside GitHub.
3. The manual backup's Auth/Storage limitations are accepted for this schema-only rollout.
4. The final production migration list and PR head have been rechecked.

If a complete managed backup/restore point is required rather than this limited logical dump, upgrade the project to a plan that supports automatic backups/restore, or use a separately provisioned staging/backup project. Do not assume the My School `backup_jobs` table is a database backup.

## References

- Supabase Free-plan backup FAQ: https://supabase.com/kb/faqs/platform/free-plan-backups
- Database backups and CLI guidance: https://supabase.com/docs/guides/platform/backups
- Supabase CLI v3 `db dump`: https://supabase.com/docs/reference/cli/supabase-db-remote
- Backup/restore CLI examples: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore


## Current execution state

No production migration has been applied and no Edge Function has been replaced. The branch passed GitHub Actions run #74, including the invalid-provider-key integration check. The operator must perform the PowerShell dump and verify the three files before any production schema change.
