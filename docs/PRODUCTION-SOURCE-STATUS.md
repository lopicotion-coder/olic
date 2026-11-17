# My School — production source recovery status

## Connected Supabase backend confirmed (2026-11-17)

The connected Supabase projects include:
- **My School production candidate:** `yigixquioguqnpbfhepi`, region `eu-west-1`, PostgreSQL `17.11.0.018`. Its schema contains school, tenant, student, guardian, attendance, finance, communications, support, AI-budget, and parental identity structures.
- **Selsep EDU:** `nhkorcyonlvvfnufwycf`; this is a separate product and must not be merged into My School.

The My School candidate project has 30 applied migration history entries, a public/app schema inventory, one private Storage bucket (`school-files`), and no deployed Edge Functions observed by the connected project tool at capture time.

## Lovable UI source found and archived

A Lovable project named **My School Command Center** was found. Its text source tree is archived under `prototypes/lovable-command-center/`. It is an Arabic-first UI demo with fictional data. It is unpublished, and the latest root route is a placeholder screen. This is not proof that it is the production frontend.

## Still missing for a complete production backup

1. The true production frontend source powering live My School (unless the owner confirms the Lovable demo is the intended source).
2. Original SQL bodies for applied migrations. Supabase's migration history returned version/name records; original migration files were not found in GitHub.
3. A real database dump (`roles.sql`, `schema.sql`, `data.sql`) and a byte-for-byte Storage object archive.
4. Auth provider settings, SMTP/OAuth secrets, custom domains/DNS and service-level secrets that are not contained in ordinary source.

## Safety and visibility

The GitHub repository `olic` is **Public** at capture time. No production rows, Auth users/password hashes, Storage file bytes, service-role keys, database passwords, OAuth/SMTP credentials, or plaintext dumps have been committed. The provided workflow encrypts database + Storage backups and uploads them to private R2 once its Actions secrets are configured.

## Production changes

All Supabase operations used for this archive were read-only. No schema, Auth, Storage, user, billing, or production settings were modified.
