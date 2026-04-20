# Cloudflare Pages — Complete Deployment Guide for BOM Manager

> **Project:** BOM Manager (Bill of Materials Management System)
> **Tech Stack:** React + Vite + TypeScript + Tailwind CSS + Supabase
> **Deployment Target:** Cloudflare Pages (Frontend) + Supabase (Backend)
> **Repository:** https://github.com/abeypa/bep-bom-manager
> **Last Updated:** April 2, 2026

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Create Cloudflare Account](#2-create-cloudflare-account)
3. [Make GitHub Repository Public](#3-make-github-repository-public)
4. [Connect GitHub to Cloudflare](#4-connect-github-to-cloudflare)
5. [Create New Pages Project](#5-create-new-pages-project)
6. [Configure Build Settings](#6-configure-build-settings)
7. [Set Environment Variables](#7-set-environment-variables)
8. [Deploy the Project](#8-deploy-the-project)
9. [Verify Deployment](#9-verify-deployment)
10. [Configure Custom Domain (Optional)](#10-configure-custom-domain-optional)
11. [Auto-Deploy Settings](#11-auto-deploy-settings)
12. [Branch Deployments](#12-branch-deployments)
13. [Troubleshooting](#13-troubleshooting)
14. [Reference Screenshots](#14-reference-screenshots)
15. [Verification Checklist](#15-verification-checklist)

---

## 1. Prerequisites

Before starting, ensure you have:

| Requirement | Status | Details |
|-------------|--------|---------|
| GitHub Account | Required | https://github.com |
| Cloudflare Account | Required | https://dash.cloudflare.com (free tier works) |
| Repository Public | Required | `abeypa/bep-bom-manager` must be public |
| Supabase Project | Required | Tables, RLS, Storage already configured |
| Supabase Auth | Required | At least 1 user created |

### Project Files Verified

```
bom-manager/
├── package.json          ✅ Contains "build" script
├── vite.config.ts        ✅ Vite configuration
├── tsconfig.json         ✅ TypeScript configuration
├── tailwind.config.js    ✅ Tailwind CSS configuration
├── index.html            ✅ Entry HTML file
├── public/
│   └── _redirects        ✅ SPA routing support
├── src/
│   ├── main.tsx          ✅ React entry point
│   ├── App.tsx           ✅ Main app component
│   └── ...               ✅ All source files
└── .env.example          ✅ Environment variable template
```

---

## 2. Create Cloudflare Account

### Step 2.1: Sign Up

1. Open https://dash.cloudflare.com/sign-up
2. Enter your email address
3. Create a password
4. Verify your email
5. Complete account setup

### Step 2.2: Access Dashboard

1. Login to https://dash.cloudflare.com
2. You should see the main dashboard
3. Look for **Workers & Pages** in the left sidebar

```
┌─────────────────────────────────────────┐
│  Cloudflare Dashboard                   │
├─────────────────────────────────────────┤
│  ┌─────────────────┐                    │
│  │ Overview        │                    │
│  │ Websites        │                    │
│  │ Workers & Pages │ ◄── Click here     │
│  │ R2 Storage      │                    │
│  │ AI              │                    │
│  └─────────────────┘                    │
└─────────────────────────────────────────┘
```

---

## 3. Make GitHub Repository Public

> **IMPORTANT:** Cloudflare Pages free tier requires public repositories.
> If your repo is private, you must either make it public or use Cloudflare's paid plan.

### Step 3.1: Go to Repository Settings

1. Open https://github.com/abeypa/bep-bom-manager
2. Click **Settings** tab (top right of repo page)
3. Scroll down to **Danger Zone** section

### Step 3.2: Change Visibility

1. Click **Change visibility**
2. Select **Make public**
3. Type repository name to confirm: `abeypa/bep-bom-manager`
4. Click **I understand, change repository visibility**

```
┌─────────────────────────────────────────┐
│  Repository Settings                    │
├─────────────────────────────────────────┤
│  ⚠️  Danger Zone                        │
│  ┌─────────────────────────────────┐    │
│  │ Change repository visibility    │    │
│  │ Currently: Private              │    │
│  │ [Make public]                   │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Verification

After making public, verify:
- Go to https://github.com/abeypa/bep-bom-manager
- The repo should NOT show a "Private" badge
- It should be accessible without login

---

## 4. Connect GitHub to Cloudflare

### Step 4.1: Navigate to Pages

1. Go to https://dash.cloudflare.com
2. Click **Workers & Pages** in left sidebar
3. Click **Create application** button

```
┌─────────────────────────────────────────┐
│  Workers & Pages                        │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │  + Create application           │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Your Pages projects will appear here   │
└─────────────────────────────────────────┘
```

### Step 4.2: Select Pages Tab

1. Click on the **Pages** tab (not Workers)
2. Click **Connect to Git**

```
┌─────────────────────────────────────────┐
│  Create application                     │
├─────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐          │
│  │  Workers  │  │   Pages   │ ◄── Click│
│  └───────────┘  └───────────┘          │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │      Connect to Git             │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Step 4.3: Authorize GitHub

1. Select **GitHub** as your Git provider
2. A popup window will open asking for GitHub authorization
3. Click **Authorize Cloudflare** (or authorize for your organization)
4. If you have multiple GitHub accounts, select the correct one

```
┌─────────────────────────────────────────┐
│  GitHub Authorization                   │
├─────────────────────────────────────────┤
│  Cloudflare Pages wants access to:      │
│  ✅ Public repositories                 │
│  ✅ Private repositories (if granted)   │
│                                         │
│  [Authorize Cloudflare]                 │
└─────────────────────────────────────────┘
```

### Step 4.4: Select Repositories

1. After authorization, Cloudflare will show your repositories
2. Search for `bep-bom-manager`
3. Select `abeypa/bep-bom-manager`
4. Click **Begin setup**

```
┌─────────────────────────────────────────┐
│  Select a repository                    │
├─────────────────────────────────────────┤
│  🔍 Search: bep-bom-manager            │
│  ┌─────────────────────────────────┐    │
│  │ ☑️ abeypa/bep-bom-manager       │    │
│  │   Public · React                │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Begin setup]                          │
└─────────────────────────────────────────┘
```

---

## 5. Create New Pages Project

### Step 5.1: Set Project Name

1. **Project name:** `bom-manager`
2. This will create a URL like: `https://bom-manager.pages.dev`

### Step 5.2: Set Production Branch

1. **Production branch:** `main`
2. This is the branch that triggers production deployments

---

## 6. Configure Build Settings

> **CRITICAL:** These settings must match exactly or the build will fail.

### Build Settings Table

| Setting | Value | Notes |
|---------|-------|-------|
| **Project name** | `bom-manager` | Will be part of the URL |
| **Production branch** | `main` | Main deployment branch |
| **Framework preset** | `Vite` | Select from dropdown |
| **Build command** | `npm run build` | DO NOT change |
| **Build output directory** | `dist` | Vite default output |
| **Root directory** | `/` | Leave empty or `/` |
| **Node.js version** | `20` | Recommended version |

### Step 6.1: Select Framework Preset

1. Click **Framework preset** dropdown
2. Select **Vite** (if available)
3. If Vite is not in the list, select **None** and enter settings manually

```
┌─────────────────────────────────────────┐
│  Build settings                         │
├─────────────────────────────────────────┤
│  Framework preset:                      │
│  ┌─────────────────────────────────┐    │
│  │ Select a framework ▼            │    │
│  ├─────────────────────────────────┤    │
│  │ Next.js                         │    │
│  │ Nuxt                            │    │
│  │ React (Vite)                    │    │
│  │ Vue (Vite)                      │    │
│  │ Vite                 ◄── Select │    │
│  │ Astro                           │    │
│  │ Gatsby                          │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Step 6.2: Verify Build Command

1. **Build command:** `npm run build`
2. This runs `tsc && vite build` (defined in package.json)
3. DO NOT change this unless you know what you're doing

### Step 6.3: Verify Output Directory

1. **Build output directory:** `dist`
2. Vite outputs to `dist/` by default
3. After build, Cloudflare serves files from this directory

### Step 6.4: Root Directory

1. **Root directory:** Leave empty or enter `/`
2. Since `package.json` is in the repository root, no subdirectory needed

```
┌─────────────────────────────────────────┐
│  Build settings                         │
├─────────────────────────────────────────┤
│  Project name:     [bom-manager       ] │
│  Production branch:[main              ] │
│  Framework preset: [Vite              ] │
│  Build command:    [npm run build     ] │
│  Build output dir: [dist              ] │
│  Root directory:   [                   ] │ ← Leave empty
│  Node.js version:  [20 (Recommended)  ] │
└─────────────────────────────────────────┘
```

---

## 7. Set Environment Variables

> **CRITICAL:** Without these, the app will fail to connect to Supabase.

### Step 7.1: Add Environment Variables

Click **Add variable** button for each one:

#### Variable 1: Supabase URL

| Field | Value |
|-------|-------|
| **Variable name** | `VITE_SUPABASE_URL` |
| **Value** | `https://jomsfmlhfutmibhbavdg.supabase.co` |

#### Variable 2: Supabase Anon Key

| Field | Value |
|-------|-------|
| **Variable name** | `VITE_SUPABASE_ANON_KEY` |
| **Value** | `sb_publishable_bz7toL6_jDrWIR55Re-NhQ_oKoHrT_d` |

### Step 7.2: Verify Variables

Your environment variables section should look like this:

```
┌─────────────────────────────────────────────────────────────────┐
│  Environment variables (production)                             │
├─────────────────────────────────────────────────────────────────┤
│  Variable name              Value                    Actions    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ VITE_SUPABASE_URL        https://jomsfmlhfutmibhbavdg... │ ✏️ │
│  │ VITE_SUPABASE_ANON_KEY   sb_publishable_bz7toL6_jDr...   │ ✏️ │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ Add variable]                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Important Notes

- Variables starting with `VITE_` are exposed to the browser
- The anon key is safe to expose (protected by RLS)
- NEVER add service role key or database password here

---

## 8. Deploy the Project

### Step 8.1: Save and Deploy

1. Review all settings one final time
2. Click **Save and Deploy** button
3. Wait for the build to complete (1-3 minutes)

### Step 8.2: Monitor Build Progress

You will see build logs in real-time:

```
┌─────────────────────────────────────────┐
│  Building your project...               │
├─────────────────────────────────────────┤
│  07:50:14  Initializing build env...    │
│  07:50:16  Success: Environment ready   │
│  07:50:20  Cloning repository...        │
│  07:50:25  Cloned successfully          │
│  07:50:26  Running build command...     │
│  07:50:28  > npm install                │
│  07:50:35  > npm run build              │
│  07:50:40  > tsc && vite build          │
│  07:50:45  ✓ 1827 modules transformed  │
│  07:50:46  dist/index.html    0.74 kB   │
│  07:50:46  dist/assets/...    25.87 kB  │
│  07:50:46  dist/assets/...    468.89 kB │
│  07:50:47  ✓ Built in 3.25s            │
│  07:50:48  ✅ Deployment successful!   │
└─────────────────────────────────────────┘
```

### Step 8.3: Get Deployment URL

After successful deployment, Cloudflare provides:

```
┌─────────────────────────────────────────┐
│  🎉 Deployment successful!              │
├─────────────────────────────────────────┤
│  Your site is live at:                  │
│  https://bom-manager.pages.dev          │
│                                         │
│  [Visit site]  [Continue to project]    │
└─────────────────────────────────────────┘
```

---

## 9. Verify Deployment

### Step 9.1: Open the URL

1. Click **Visit site** or open the URL directly
2. You should see the BOM Manager login page

### Step 9.2: Test Login

1. Enter your Supabase credentials (email/password)
2. Click **Sign in**
3. You should be redirected to the Dashboard

### Step 9.3: Verify All Pages

| Page | URL Path | Status |
|------|----------|--------|
| Login | `/login` | Should show login form |
| Dashboard | `/dashboard` | Should show stats cards |
| Parts | `/parts` | Should show placeholder |
| Projects | `/projects` | Should show placeholder |
| Purchase Orders | `/purchase-orders` | Should show placeholder |
| Suppliers | `/suppliers` | Should show placeholder |
| Usage Logs | `/part-usage-logs` | Should show placeholder |

### Step 9.4: Test SPA Routing

1. Navigate to Dashboard
2. Refresh the page (F5)
3. Page should load correctly (not 404)
4. If 404 occurs, check `public/_redirects` file exists

---

## 10. Configure Custom Domain (Optional)

### Step 10.1: Access Custom Domain Settings

1. Go to Cloudflare Dashboard → **Workers & Pages**
2. Click on **bom-manager** project
3. Click **Custom domains** tab
4. Click **Set up a custom domain**

### Step 10.2: Enter Domain

1. Enter your domain: `bom.yourcompany.com`
2. Click **Continue**

### Step 10.3: DNS Configuration

If your domain is on Cloudflare:
- DNS record will be added automatically
- No manual configuration needed

If your domain is NOT on Cloudflare:
- Add a CNAME record pointing to `bom-manager.pages.dev`
- Contact your DNS provider for instructions

```
┌─────────────────────────────────────────┐
│  Custom domain setup                    │
├─────────────────────────────────────────┤
│  Domain: [bom.yourcompany.com        ]  │
│                                         │
│  DNS Records needed:                    │
│  Type: CNAME                            │
│  Name: bom                              │
│  Value: bom-manager.pages.dev           │
│                                         │
│  [Activate]                             │
└─────────────────────────────────────────┘
```

---

## 11. Auto-Deploy Settings

### Default Behavior

By default, Cloudflare Pages automatically deploys:
- **Production:** Every push to `main` branch
- **Preview:** Every push to other branches or pull requests

### Disable Auto-Deploy

1. Go to **Workers & Pages** → **bom-manager**
2. Click **Settings** tab
3. Scroll to **Builds & deployments**
4. Click **Disable automatic build**

### Manual Deploy

To trigger a manual deploy:
1. Go to **Deployments** tab
2. Click **Create deployment**
3. Select branch and click **Deploy**

---

## 12. Branch Deployments

### Preview Deployments

Every branch push creates a preview deployment:

| Branch | Preview URL |
|--------|-------------|
| `main` | `https://bom-manager.pages.dev` (production) |
| `feature-xyz` | `https://abc123.bom-manager.pages.dev` |
| PR #42 | `https://def456.bom-manager.pages.dev` |

### Preview Environment Variables

By default, preview deployments use the same environment variables as production. To set different variables for preview:

1. Go to **Settings** → **Environment variables**
2. Click **Preview** tab
3. Add variables for preview environment

---

## 13. Troubleshooting

### Error: Failed to fetch repository

```
Failed: error occurred while fetching repository
```

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Repository is private | Make repository public |
| Cloudflare not authorized | Re-authorize GitHub connection |
| Repository name changed | Update repository link in Cloudflare |
| GitHub rate limit | Wait and retry |

**Fix Steps:**
1. Go to GitHub → Repository → Settings → Change visibility → Make public
2. Go to Cloudflare → Pages → Disconnect and reconnect GitHub

---

### Error: Build failed - npm error

```
npm ERR! code ELIFECYCLE
npm ERR! errno 1
npm ERR! bom-manager@1.0.0 build: `tsc && vite build`
```

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Missing dependencies | Ensure `package-lock.json` is committed |
| Wrong Node version | Set Node.js version to 20 |
| TypeScript errors | Run `npm run build` locally first |

**Debug Steps:**
1. Clone repo locally
2. Run `npm install`
3. Run `npm run build`
4. Fix any errors locally
5. Commit and push fixes

---

### Error: Module not found

```
Error: Cannot find module './some-file'
```

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| File not committed | Check git status, add missing files |
| Wrong import path | Check case sensitivity (Linux is case-sensitive) |
| Missing dependency | Add to package.json and install |

---

### Error: Environment variable undefined

```
Error: Missing environment variable: VITE_SUPABASE_URL
```

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Variable not set | Add in Cloudflare Pages settings |
| Wrong variable name | Must start with `VITE_` prefix |
| Typo in name | Check spelling matches code exactly |

**Fix Steps:**
1. Go to **Workers & Pages** → **bom-manager** → **Settings**
2. Scroll to **Environment variables**
3. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist
4. Redeploy after adding variables

---

### Error: 404 on page refresh

```
404 Not Found (when refreshing non-root pages)
```

**Cause:** SPA routing not configured

**Solution:** Ensure `public/_redirects` file exists with content:
```
/*    /index.html   200
```

**Verify file exists:**
```bash
cat public/_redirects
# Should output: /*    /index.html   200
```

---

### Error: Blank page after deploy

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Missing env vars | Check Supabase variables are set |
| Console errors | Open browser DevTools → Console |
| Build output wrong | Verify output directory is `dist` |
| Supabase RLS | Verify RLS policies are configured |

**Debug Steps:**
1. Open browser DevTools (F12)
2. Check Console tab for errors
3. Check Network tab for failed requests
4. Verify environment variables in Cloudflare settings

---

### Error: Login redirects back to login

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Auth not configured | Configure Auth in Supabase Dashboard |
| No user created | Create user in Supabase → Auth → Users |
| Wrong Supabase URL | Check VITE_SUPABASE_URL value |
| CORS issues | Check Supabase URL settings |

---

### Error: CORS policy blocked

```
Access to fetch has been blocked by CORS policy
```

**Solution:**
1. Go to Supabase Dashboard → **Settings** → **API**
2. Under **Site URL**, add your Cloudflare domain:
   - `https://bom-manager.pages.dev`
   - `https://*.bom-manager.pages.dev` (for preview deploys)

---

## 14. Reference Screenshots

### Cloudflare Pages Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare Dashboard > Workers & Pages > bom-manager       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  bom-manager                              [Visit site]       │
│  Production: bom-manager.pages.dev                          │
│                                                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │ Deployments│ │   Builds   │ │  Settings  │              │
│  └────────────┘ └────────────┘ └────────────┘              │
│                                                              │
│  Latest deployment:                                          │
│  ✅ Success · main · 2 minutes ago                          │
│  Commit: docs: Add Cloudflare setup guide                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Build Settings Page

```
┌──────────────────────────────────────────────────────────────┐
│  Build settings                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Framework preset:  Vite                                     │
│  Build command:     npm run build                            │
│  Build output dir:  dist                                     │
│  Root directory:    (empty)                                  │
│                                                              │
│  Environment variables (production)                          │
│  ┌────────────────────────────────────────────────────┐      │
│  │ VITE_SUPABASE_URL     ...supabase.co           ✏️  │      │
│  │ VITE_SUPABASE_ANON_KEY ...T_d                   ✏️  │      │
│  └────────────────────────────────────────────────────┘      │
│  [+ Add variable]                                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 15. Verification Checklist

### Pre-Deploy Checklist

- [x] GitHub repository is **public**
- [x] `package.json` has `build` script: `tsc && vite build`
- [x] `public/_redirects` file exists for SPA routing
- [x] All source files are committed and pushed
- [x] Supabase tables are created (13 tables)
- [x] Supabase RLS policies are enabled
- [x] Supabase Storage bucket "drawings" exists
- [x] Supabase Auth is configured with at least 1 user

### Cloudflare Settings Checklist

- [ ] Project name: `bom-manager`
- [ ] Production branch: `main`
- [ ] Framework preset: `Vite`
- [ ] Build command: `npm run build`
- [ ] Build output directory: `dist`
- [ ] Root directory: empty
- [ ] `VITE_SUPABASE_URL` is set
- [ ] `VITE_SUPABASE_ANON_KEY` is set

### Post-Deploy Checklist

- [ ] Build completed without errors
- [ ] URL loads (no 404)
- [ ] Login page displays correctly
- [ ] Can login with Supabase credentials
- [ ] Redirects to Dashboard after login
- [ ] Sidebar navigation works
- [ ] Page refresh works (no 404)
- [ ] Logout works

---

## Quick Reference Card

```
╔══════════════════════════════════════════════════════════════╗
║  BOM Manager — Cloudflare Pages Quick Reference             ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Repository:    https://github.com/abeypa/bep-bom-manager   ║
║  Live URL:      https://bom-manager.pages.dev               ║
║  Supabase:      https://jomsfmlhfutmibhbavdg.supabase.co   ║
║                                                              ║
║  Build Settings:                                             ║
║    Command:      npm run build                               ║
║    Output:       dist                                        ║
║    Branch:       main                                        ║
║                                                              ║
║  Environment Variables:                                      ║
║    VITE_SUPABASE_URL                                         ║
║    VITE_SUPABASE_ANON_KEY                                    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Support & Resources

- **Cloudflare Pages Docs:** https://developers.cloudflare.com/pages/
- **Vite Docs:** https://vitejs.dev/
- **Supabase Docs:** https://supabase.com/docs
- **Project Repo:** https://github.com/abeypa/bep-bom-manager

---

*Document generated: April 2, 2026*
*Project: BOM Manager v3*
*Deployment: Cloudflare Pages + Supabase*
