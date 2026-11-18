# My School — security hardening review

Date: 2026-11-18

This document records the production hardening follow-up that was applied to the connected Supabase project for My School.

## Scope

- Supabase project ref: `yigixquioguqnpbfhepi`
- Production database/backend schema only
- No frontend source code was recovered during this pass

## What was hardened

- The client-facing authenticated path was kept separate from the internal runtime role.
- Write access to AI request/response/usage/budget tables was removed from the browser-facing path.
- Membership-scope mutations were constrained so that school/tenant scope cannot be widened by a normal authenticated user.
- Security checks for sensitive helper functions were reviewed so they remain non-executable from `authenticated` unless explicitly intended.
- The live project was re-checked after the migration and the expected post-conditions were verified.

## Residual follow-up

- `ticket_slas` still has one requester-cycle write path that should be reviewed again before final production lockdown.
- Supabase Auth leaked-password protection is still disabled in the dashboard and should be enabled separately.

## Repository note

This repository remains the production source-of-truth workspace. Experimental UI prototypes belong in `lopicotion-coder/draft`.

The presence of this review does not mean the frontend/application source has been recovered. That work is still pending.
