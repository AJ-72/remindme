# remindme-website

The public marketing/landing page for the RemindMe app (waitlist signup, feature overview).

Source: [src/App.tsx](src/App.tsx), [src/index.css](src/index.css).

This package was originally scaffolded as a generic UI mockup sandbox (see
`mockupPreviewPlugin.ts` and the `/preview/*` canvas routes in `index.html`) —
that tooling is still present, but this folder's actual content is the
RemindMe website, not a general-purpose mockup tool.

```bash
pnpm --filter @workspace/remindme-website run dev      # dev server
pnpm --filter @workspace/remindme-website run build    # production build (requires PORT/BASE_PATH env vars)
pnpm --filter @workspace/remindme-website run preview  # serve the build (e.g. for a cloudflare tunnel)
pnpm --filter @workspace/remindme-website run build:pages  # production build with PORT/BASE_PATH defaulted, for Cloudflare Pages
```

## Hosting on Cloudflare Pages (free tier)

Deployed via Wrangler CLI, not the GitHub-integration build (this is a pnpm
monorepo subpackage — the GitHub integration's "root directory" setting can't
see the workspace root's `pnpm-lock.yaml`/`pnpm-workspace.yaml`, same class of
problem noted for EAS in the top-level `CLAUDE.md`'s Gotchas section).

One-time setup:
```bash
npx wrangler login
npx wrangler pages project create remindme-website --production-branch main
```

Deploy (build + upload `dist/`):
```powershell
.\scripts\deploy-website-pages.ps1
```
