---
description: Deployment command for production releases. Builds locally and deploys via Wrangler (bypasses Cloudflare broken build cache).
---

# /deploy - Production Deployment

## WARNING: Always Deploy Locally

Cloudflare CI/CD build cache is broken for this project — it always serves stale bundles from cache.
Always build locally and deploy via wrangler deploy.

---

## One-Command Deploy

From `e:\Coding\BOM Software\V3\bom-manager\`:

```powershell
.\deploy.ps1 "your commit message here"
```

This script does everything in order:
1. `npm run build` - fresh local build with new hash
2. `git add -A` + `git commit` + `git push` - saves code to GitHub
3. `npx wrangler deploy` - uploads fresh bundle to Cloudflare

---

## Manual Steps

```powershell
npm run build
git add -A
git commit -m "your message"
git push
npx wrangler deploy
```

---

## First Time Setup

If wrangler deploy asks for login:

```powershell
npx wrangler login
npx wrangler deploy
```

---

## Live URL

https://bep-bom-manager.abeypa.workers.dev
