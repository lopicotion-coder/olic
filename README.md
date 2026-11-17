# My School — Prototype Archive

**Purpose:** preserve experimental UI prototypes and design explorations for My School.

> This repository is a design/prototype archive only. It is NOT the production application source, database backup, migration history, or disaster-recovery backup.

## Repository identity

- Current GitHub repository name: `olic`
- Preferred repository name: `my-school-prototype-archive`
- Default branch: `main`
- Visibility at time of archive creation: Public

## Archive layout

```text
prototypes/
  README.md
  catalog.json
  ui-v4.1/
    index.html
  modular-phase-9/
    index.html
docs/
  PRODUCTION-SOURCE-STATUS.md
```

## Included prototypes

| Version | File | Purpose |
|---|---|---|
| UI v4.1 | `prototypes/ui-v4.1/index.html` | Earlier multi-role dashboard prototype |
| Modular Phase 9 | `prototypes/modular-phase-9/index.html` | Role-oriented prototype including early transport and parent-control concepts |

These are standalone HTML mockups with demo data. They do not connect to Supabase, do not authenticate users, and do not persist real school data.

## Important separation

The production My School application was developed directly in Supabase and its actual application source has not yet been located in the GitHub repositories inspected so far. Do not treat this archive as production source or as a database backup.

The separate `backup` repository is the source of the two archived HTML prototypes. The `selsep-edu` repository is a different standalone education/assignments product and must remain separate.

## Handling rules

- Keep each prototype in its own versioned folder.
- Do not overwrite an older prototype; add a new version folder.
- Record source repository, original path, source commit/blob SHA, date, and known limitations in `prototypes/catalog.json`.
- Do not add student records, credentials, API keys, database dumps, or production secrets here.
- Keep actual production source, Supabase migrations, and encrypted database/storage backups in separate, purpose-specific repositories or storage locations.
