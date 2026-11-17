# Deployment readiness

## Current state

No Vercel or Cloudflare deployment was created from this repository. The connected Vercel account currently lists a Git-linked project for `selsep-edu`, not My School. No Cloudflare Pages/Workers linkage to `olic` has been confirmed.

## Archived Lovable demo

- Repository: `lopicotion-coder/olic`
- Root directory: `prototypes/lovable-command-center`
- Package manager: Bun (`bun.lock`)
- Build command: `bun run build`
- Tests: `bun run test`

The current `src/routes/index.tsx` is a placeholder screen. Replace it and complete the role-specific UX before publishing. It uses fictional data and browser-local state, not the production Supabase project.

## Vercel later

When ready, create a Git-linked Vercel project from `lopicotion-coder/olic`, set Root Directory to `prototypes/lovable-command-center`, then verify the TanStack Start build and runtime settings. Map `main` to Production and `develop` to Preview only after the source is production-ready.

## Cloudflare later

Cloudflare Pages static hosting is not automatically equivalent to a Vercel SSR deployment. Confirm the TanStack Start/Nitro Cloudflare adapter and Worker output before linking. Do not route production traffic to the HTML archive or the placeholder home route.
