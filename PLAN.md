# BOM Manager - Comprehensive Deployment Plan

## 📋 Project Overview

**Project:** BOM Manager (Bill of Materials Management System)
**Architecture:** React 18 + Vite + TypeScript + Tailwind CSS frontend with Supabase backend
**Deployment:** Cloudflare Pages (frontend) + Supabase Cloud (backend)
**Status:** Phase-based implementation of 21 tasks

## 🎯 Success Criteria

| Criterion | Measurable Outcome |
|-----------|-------------------|
| GitHub repo exists | `github.com/[user]/bom-manager` has main branch |
| Supabase project created | Dashboard at `supabase.com` shows project |
| All tables created | 13 tables with RLS policies |
| Auth works | Login with email/password, redirect to dashboard |
| Storage works | Upload image for a part → view it in the app |
| Frontend deploys | Cloudflare Pages URL returns working app |
| No secrets committed | `.env` not in git history |

## 👥 Agent Team

| Agent | Role | Primary Responsibilities |
|-------|------|--------------------------|
| `devops-engineer` | DevOps Engineer | Repository setup, CI/CD, deployment, infrastructure |
| `backend-specialist` | Backend Specialist | Supabase setup, API design, database functions |
| `database-architect` | Database Architect | Schema design, SQL scripts, RLS policies |
| `security-auditor` | Security Auditor | Auth configuration, RLS policies, security review |
| `frontend-specialist` | Frontend Specialist | React/Vite app, UI components, state management |
| `documentation-writer` | Documentation Writer | README, deployment guides, user documentation |

## 📊 Task Breakdown (23 Tasks, 5 Phases)

### PHASE 0: Repository & Supabase Setup (Blockers)
*Sequential tasks - each depends on previous completion*

#### **TASK-01: Create GitHub Repository**
- **Agent:** `devops-engineer`
- **Priority:** P0 (Blocker)
- **Dependencies:** None
- **Input:** Nothing (fresh start)
- **Output:** GitHub repo `bom-manager` with initial commit
- **Verification:** `git remote -v` shows GitHub origin
- **Steps:**
  1. Create local directory: `mkdir bom-manager && cd bom-manager`
  2. Initialize git: `git init`
  3. Create `.gitignore` (node_modules, dist, .env, .env.local)
  4. Create `.env.example` with Supabase placeholders
  5. Initial commit: `git add . && git commit -m "chore: initial project setup"`
  6. Create GitHub repo and push
- **Success Criteria:** Repository accessible at GitHub with initial files

#### **TASK-02: Set Up Supabase Project**
- **Agent:** `backend-specialist`
- **Priority:** P0 (Blocker)
- **Dependencies:** TASK-01
- **Input:** Supabase account credentials
- **Output:** Supabase project created with URL + anon key
- **Verification:** Can access Supabase dashboard for project
- **Steps:**
  1. Go to [https://supabase.com](https://supabase.com) and sign in
  2. Click "New Project"
  3. Fill in:
     - **Name:** `bom-manager`
     - **Database Password:** (save this)
     - **Region:** Choose closest to users
     - **Plan:** Free (500MB DB, 1GB storage, 50k auth users)
  4. Wait ~2 minutes for project provisioning
  5. Go to **Settings → API** and copy:
     - **Project URL** (e.g., `https://xyzxyzxyz.supabase.co`)
     - **anon/public key**
- **Success Criteria:** Project visible in Supabase dashboard with API credentials available

#### **TASK-03: Create Database Tables (13 Tables)**
- **Agent:** `database-architect`
- **Priority:** P0 (Blocker)
- **Dependencies:** TASK-02
- **Input:** SQL scripts from bom-deployment.md Steps 2a-2g
- **Output:** 13 tables created with proper indexes
- **Verification:** All tables visible in Supabase Table Editor
- **Tables to create:**
  1. `suppliers`
  2. `projects`
  3. `project_sections`
  4. `mechanical_manufacture`
  5. `mechanical_bought_out`
  6. `electrical_manufacture`
  7. `electrical_bought_out`
  8. `pneumatic_bought_out`
  9. `project_parts` (junction table)
  10. `purchase_orders`
  11. `purchase_order_items`
  12. `part_usage_logs`
  13. `json_excel_file_uploaded`
- **Success Criteria:** All 13 tables exist with correct schema and indexes

#### **TASK-04: Configure Row Level Security (RLS)**
- **Agent:** `security-auditor`
- **Priority:** P0 (Blocker)
- **Dependencies:** TASK-03
- **Input:** RLS script from bom-deployment.md Step 3
- **Output:** All tables have RLS enabled + authenticated-only policy
- **Verification:** Anonymous request to any table returns empty/error
- **Steps:**
  1. Enable RLS on all 13 tables
  2. Create "Authenticated users full access" policy on each table
  3. Test with anonymous and authenticated requests
- **Success Criteria:** Unauthenticated users cannot access any data

#### **TASK-05: Create Storage Bucket + Policies**
- **Agent:** `backend-specialist`
- **Priority:** P0
- **Dependencies:** TASK-02
- **Input:** Storage setup from bom-deployment.md Step 4
- **Output:** "drawings" bucket exists with auth-only access
- **Verification:** Upload a test file via Supabase dashboard
- **Steps:**
  1. Go to **Storage** in Supabase Dashboard
  2. Click "New Bucket"
  3. **Name:** `drawings`
  4. **Public:** OFF (private — requires auth)
  5. Click "Create Bucket"
  6. Run SQL policies for authenticated users (upload/view/update/delete)
- **Success Criteria:** Authenticated users can upload/download files to/from "drawings" bucket

#### **TASK-06: Configure Auth & Create Users**
- **Agent:** `security-auditor`
- **Priority:** P0
- **Dependencies:** TASK-02
- **Input:** Auth config from bom-deployment.md Step 5
- **Output:** Email/password auth enabled, signup disabled, user(s) created
- **Verification:** Can sign in with test credentials via Supabase Auth UI
- **Steps:**
  1. Go to **Authentication → Providers** in Supabase Dashboard
  2. **Disable** ALL social providers (Google, GitHub, etc.)
  3. **Email** provider should be **Enabled**
  4. Under Email settings:
     - **Enable email confirmations:** ON or OFF (your choice)
     - **Disable signup:** ON — only you can create users from the dashboard
  5. Go to **Authentication → Users** and click "Add User" to create login accounts
- **Success Criteria:** Only manually created users can log in; no public signup

### PHASE 1: Frontend Foundation
*Sequential tasks - foundation for all frontend work*

#### **TASK-07: Initialize Vite + React + TypeScript + Tailwind**
- **Agent:** `frontend-specialist`
- **Priority:** P1
- **Dependencies:** TASK-01 (GitHub repo)
- **Input:** Empty project directory
- **Output:** Working Vite dev server with Tailwind
- **Verification:** `npm run dev` shows styled hello world
- **Steps:**
  1. Initialize Vite React TypeScript project: `npm create vite@latest . -- --template react-ts`
  2. Install dependencies: `npm install`
  3. Install Tailwind CSS: `npm install -D tailwindcss postcss autoprefixer`
  4. Initialize Tailwind: `npx tailwindcss init -p`
  5. Configure Tailwind in `tailwind.config.js`
  6. Add Tailwind directives to `src/index.css`
  7. Install React Router: `npm install react-router-dom`
  8. Install TanStack Query: `npm install @tanstack/react-query`
  9. Install React Hook Form: `npm install react-hook-form`
  10. Install Supabase client: `npm install @supabase/supabase-js`
  11. Create basic App.tsx with routing structure
- **Success Criteria:** Dev server runs and displays basic React app with Tailwind styling

#### **TASK-08: Build Supabase Client + Auth Context**
- **Agent:** `frontend-specialist`
- **Priority:** P1
- **Dependencies:** TASK-02 (Supabase credentials), TASK-07 (Frontend setup)
- **Input:** Supabase URL + anon key from `.env`
- **Output:** `supabase.ts` client, `AuthContext.tsx`, `ProtectedRoute.tsx`
- **Verification:** Unauthenticated user redirected to `/login`
- **Steps:**
  1. Create `src/lib/supabase.ts` with Supabase client initialization
  2. Create `src/context/AuthContext.tsx` with auth state management
  3. Create `src/components/layout/ProtectedRoute.tsx` for route protection
  4. Set up `.env.example` and `.env.local` with Supabase credentials
  5. Implement auth state persistence
- **Success Criteria:** Auth context provides user state; protected routes redirect unauthenticated users

#### **TASK-09: Build Login Page**
- **Agent:** `frontend-specialist`
- **Priority:** P1
- **Dependencies:** TASK-08 (Auth context)
- **Input:** Supabase Auth (email/password)
- **Output:** Beautiful login page with email + password form
- **Verification:** Login with valid credentials → redirect to dashboard; invalid → error shown
- **Steps:**
  1. Create `src/pages/Login.tsx`
  2. Implement email/password form with React Hook Form
  3. Add form validation
  4. Integrate with Supabase Auth
  5. Handle loading states and error messages
  6. Style with Tailwind
- **Success Criteria:** Users can log in and are redirected to dashboard

#### **TASK-10: Build App Layout (Sidebar + TopBar)**
- **Agent:** `frontend-specialist`
- **Priority:** P1
- **Dependencies:** TASK-08 (Auth context), TASK-09 (Login)
- **Input:** Route structure
- **Output:** Sidebar with nav links, user avatar, logout functionality
- **Verification:** Clicking sidebar links navigates correctly; logout works
- **Steps:**
  1. Create `src/components/layout/AppLayout.tsx`
  2. Implement responsive sidebar with navigation
  3. Add top bar with user info and logout
  4. Create navigation structure:
     - Dashboard
     - Parts (with sub-navigation for 5 part types)
     - Projects
     - Purchase Orders
     - Suppliers
     - Part Usage Logs
  5. Implement logout functionality
  6. Make layout responsive (mobile/desktop)
- **Success Criteria:** Layout works on all screen sizes; navigation and logout functional

### PHASE 2: Feature Modules
*Parallel tasks after foundation is complete*

#### **TASK-11: Build TypeScript Types**
- **Agent:** `frontend-specialist`
- **Priority:** P2
- **Dependencies:** TASK-03 (Database schema)
- **Input:** Supabase schema (13 tables)
- **Output:** `src/types/index.ts` with all interfaces
- **Verification:** No type errors in IDE; types match database schema
- **Steps:**
  1. Create TypeScript interfaces for all 13 tables
  2. Create enums for status fields
  3. Create utility types for form data
  4. Create API response types
  5. Export all types from index file
- **Success Criteria:** All database entities have corresponding TypeScript types

#### **TASK-12: Build Dashboard Page**
- **Agent:** `frontend-specialist`
- **Priority:** P2
- **Dependencies:** TASK-08 (Auth), TASK-10 (Layout), TASK-11 (Types)
- **Input:** `get_dashboard_stats()` RPC function (needs to be created)
- **Output:** Dashboard with stat cards, project status chart, low stock alerts
- **Verification:** Numbers match database; charts display correctly
- **Steps:**
  1. Create `src/pages/Dashboard.tsx`
  2. Create `src/api/dashboard.ts` with `getDashboardStats` function
  3. Create database function `get_dashboard_stats()` in Supabase
  4. Implement stat cards for:
     - Total parts (by type)
     - Low stock alerts
     - Total/active/completed/on-hold projects
  5. Create project status chart
  6. Add recent activity feed
  7. Style with Tailwind
- **Success Criteria:** Dashboard displays real data from database; all stats update correctly

#### **TASK-13: Build Parts Module (Biggest Module)**
- **Agent:** `frontend-specialist`
- **Priority:** P2
- **Dependencies:** TASK-05 (Storage), TASK-08 (Auth), TASK-10 (Layout), TASK-11 (Types)
- **Input:** 5 part tables + "drawings" storage bucket
- **Output:** Tabbed page for 5 part types, searchable table, create/edit with file upload
- **Verification:** Create part with image → image appears in list; PDF can be downloaded
- **Steps:**
  1. Create `src/pages/Parts.tsx` with tab navigation for 5 part types
  2. Create `src/api/parts.ts` with CRUD operations for all 5 part types
  3. Create `src/components/parts/PartTable.tsx` (generic table component)
  4. Create `src/components/parts/PartForm.tsx` (create/edit modal)
  5. Create `src/components/parts/FileUpload.tsx` (drag-n-drop uploader)
  6. Implement file upload/download to/from Supabase Storage
  7. Add search, filter, and pagination
  8. Create hooks: `src/hooks/useParts.ts`
- **Success Criteria:** All 5 part types can be CRUD'd; file attachments work

#### **TASK-14: Build Projects Module**
- **Agent:** `frontend-specialist`
- **Priority:** P2
- **Dependencies:** TASK-08 (Auth), TASK-10 (Layout), TASK-11 (Types)
- **Input:** projects + project_sections + project_parts tables
- **Output:** Project list, project detail with sections, add parts to sections
- **Verification:** Create project → add section → assign part → shows in detail view
- **Steps:**
  1. Create `src/pages/Projects.tsx` (project list)
  2. Create `src/pages/ProjectDetail.tsx` (single project view)
  3. Create `src/api/projects.ts` with CRUD for projects, sections, project parts
  4. Create `src/components/projects/ProjectCard.tsx`
  5. Create `src/components/projects/SectionManager.tsx`
  6. Create `src/components/projects/MilestoneBar.tsx` (status visualization)
  7. Implement project → sections → parts hierarchy
  8. Create hooks: `src/hooks/useProjects.ts`
- **Success Criteria:** Full project hierarchy works; parts can be assigned to sections

#### **TASK-15: Build Purchase Orders Module**
- **Agent:** `frontend-specialist`
- **Priority:** P2
- **Dependencies:** TASK-08 (Auth), TASK-10 (Layout), TASK-11 (Types)
- **Input:** purchase_orders + purchase_order_items tables
- **Output:** PO list, create PO wizard, status management, export functionality
- **Verification:** Create PO → appears in list → change status → export works
- **Steps:**
  1. Create `src/pages/PurchaseOrders.tsx`
  2. Create `src/api/po.ts` with CRUD for POs and items
  3. Create `src/components/po/POTable.tsx`
  4. Create `src/components/po/POCreateWizard.tsx` (multi-step form)
  5. Implement PO status management
  6. Add export functionality (PDF/CSV)
  7. Create hooks: `src/hooks/usePO.ts`
- **Success Criteria:** Full PO lifecycle works; exports generate correctly

#### **TASK-16: Build Suppliers & Part Usage Logs**
- **Agent:** `frontend-specialist`
- **Priority:** P3
- **Dependencies:** TASK-08 (Auth), TASK-10 (Layout), TASK-11 (Types)
- **Input:** suppliers and part_usage_logs tables
- **Output:** CRUD for suppliers, read-only log viewer
- **Verification:** Add supplier → appears in dropdown when creating parts
- **Steps:**
  1. Create `src/pages/Suppliers.tsx`
  2. Create `src/pages/PartUsageLogs.tsx`
  3. Create `src/api/suppliers.ts` with CRUD operations
  4. Create `src/api/logs.ts` for part usage logs (read-only)
  5. Create supplier selection component for part forms
  6. Implement search and filtering for logs
  7. Create hooks: `src/hooks/useSuppliers.ts`
- **Success Criteria:** Suppliers can be managed; part usage logs are viewable

### PHASE 3: Polish & Error Handling

#### **TASK-17: Error Handling + Loading States + Toasts**
- **Agent:** `frontend-specialist`
- **Priority:** P2
- **Dependencies:** TASK-12 through TASK-16 (All feature modules)
- **Input:** All pages
- **Output:** Skeleton loaders, error boundaries, toast notifications
- **Verification:** Kill internet → graceful error shown, not blank page
- **Steps:**
  1. Implement error boundaries for all pages
  2. Add skeleton loaders for all data tables
  3. Implement toast notification system
  4. Add loading states for all async operations
  5. Implement retry logic for failed requests
  6. Add offline detection and messaging
- **Success Criteria:** Graceful degradation for all error scenarios; loading states everywhere

#### **TASK-18: Add Realtime Subscriptions**
- **Agent:** `frontend-specialist`
- **Priority:** P3
- **Dependencies:** TASK-13 (Parts), TASK-14 (Projects), TASK-15 (POs)
- **Input:** Supabase realtime channels
- **Output:** Parts table auto-refreshes when someone else edits
- **Verification:** Open 2 tabs, edit part in one → other tab updates
- **Steps:**
  1. Enable realtime in Supabase for key tables
  2. Create realtime subscription hooks
  3. Implement auto-refresh for:
     - Parts tables (all 5 types)
     - Projects list
     - Purchase orders
  4. Add visual indicators for real-time updates
  5. Implement optimistic updates
- **Success Criteria:** Real-time updates work across multiple browser sessions

### PHASE 4: Deploy & CI

#### **TASK-19: Create Dashboard Database Function**
- **Agent:** `database-architect`
- **Priority:** P2
- **Dependencies:** TASK-03 (Tables)
- **Input:** Dashboard requirements
- **Output:** `get_dashboard_stats()` function in Supabase
- **Verification:** Function returns correct statistics
- **Steps:**
  1. Create SQL function `get_dashboard_stats()` as shown in bom-deployment.md
  2. Test function with sample data
  3. Verify all calculations are correct
- **Success Criteria:** Function returns JSON with all dashboard statistics

#### **TASK-20: Seed Sample Data**
- **Agent:** `database-architect`
- **Priority:** P3
- **Dependencies:** TASK-03 (Tables), TASK-04 (RLS), TASK-06 (Users)
- **Input:** Sample data requirements
- **Output:** Sample data in all tables for testing
- **Verification:** All tables have representative data
- **Steps:**
  1. Create seed SQL script
  2. Insert sample suppliers
  3. Insert sample projects with sections
  4. Insert sample parts across all 5 types
  5. Insert sample purchase orders
  6. Insert sample part usage logs
- **Success Criteria:** Database has realistic test data for all features

#### **TASK-21: GitHub Actions CI**
- **Agent:** `devops-engineer`
- **Priority:** P3
- **Dependencies:** TASK-07 (Frontend setup)
- **Output:** `.github/workflows/ci.yml`
- **Verification:** CI runs on push to main and PRs
- **Steps:**
  1. Create `.github/workflows/ci.yml`
  2. Set up workflow to run on push to main and PRs
  3. Configure Node.js setup
  4. Install dependencies
  5. Run TypeScript type checking
  6. Run build process
  7. Add linting if configured
- **Success Criteria:** CI pipeline runs green on GitHub

#### **TASK-22: Deploy to Cloudflare Pages**
- **Agent:** `devops-engineer`
- **Priority:** P4
- **Dependencies:** TASK-21 (CI), All frontend tasks
- **Steps:**
  1. Go to Cloudflare Dashboard → Pages → Create project
  2. Connect GitHub repo `bom-manager`
  3. Settings:
     - **Build command:** `npm run build`
     - **Build output directory:** `dist`
     - **Root directory:** `/` (project root)
  4. Environment variables:
     - `VITE_SUPABASE_URL` = your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
  5. Deploy!
- **Success Criteria:** App accessible at Cloudflare Pages URL

#### **TASK-23: Write README.md**
- **Agent:** `documentation-writer`
- **Priority:** P3
- **Output:** Complete README with Supabase setup, local dev, deployment
- **Verification:** New developer can set up from scratch using README
- **Sections to include:**
  1. Project overview
  2. Tech stack
  3. Local development setup
  4. Supabase setup instructions
  5. Environment variables
  6. Available scripts
  7. Deployment instructions
  8. Contributing guidelines
- **Success Criteria:** README enables fresh developer to set up from scratch

## 🔗 Dependency Graph

```
PHASE 0 (Sequential - Blockers):
  TASK-01 → TASK-02 → TASK-03 → TASK-04 → TASK-05 → TASK-06

PHASE 1 (Sequential - Foundation):
  TASK-07 → TASK-08 → TASK-09 → TASK-10

PHASE 2 (Parallel after TASK-10 + TASK-06):
  TASK-11 → TASK-12, TASK-13, TASK-14, TASK-15, TASK-16 (parallel)

PHASE 3 (After Phase 2):
  TASK-17 → TASK-18

PHASE 4 (After Phase 3):
  TASK-19 → TASK-20 → TASK-21 → TASK-22 → TASK-23
```

## 📋 Verification Checklist

### Phase 0 Verification
- [ ] GitHub repository exists and accessible
- [ ] Supabase project created with API credentials
- [ ] All 13 tables created with correct schemas
- [ ] RLS enabled on all tables with auth-only policies
- [ ] Storage bucket "drawings" exists with RLS policies
- [ ] Auth configured: email/password only, signup disabled
- [ ] At least 1 user created in Supabase Auth

### Phase 1 Verification
- [ ] Frontend builds: `npm run build` succeeds
- [ ] Dev server runs: `npm run dev` shows styled app
- [ ] Supabase client initialized and working
- [ ] Auth context provides user state
- [ ] Protected routes redirect unauthenticated users
- [ ] Login page works with Supabase Auth
- [ ] App layout works on all screen sizes
- [ ] Navigation and logout functional

### Phase 2 Verification
- [ ] TypeScript types match database schema
- [ ] Dashboard displays real statistics
- [ ] All 5 part types can be CRUD'd
- [ ] File upload/download works for part attachments
- [ ] Projects → Sections → Parts hierarchy works
- [ ] Purchase order creation and status management works
- [ ] PO export functionality works
- [ ] Suppliers CRUD operations work
- [ ] Part usage logs are viewable

### Phase 3 Verification
- [ ] Error boundaries catch and display errors gracefully
- [ ] Skeleton loaders show during data fetching
- [ ] Toast notifications work for user feedback
- [ ] Real-time updates work across multiple sessions
- [ ] Dashboard function returns correct statistics
- [ ] Sample data exists for all tables

### Phase 4 Verification
- [ ] CI pipeline runs green on GitHub
- [ ] Cloudflare Pages deployment serves the app
- [ ] README enables fresh developer setup
- [ ] No `.env` file in git history
- [ ] Environment variables properly configured

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Git
- Supabase account
- Cloudflare account (for deployment)

### Quick Start
1. Clone repository: `git clone <repo-url>`
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and fill Supabase credentials
4. Run dev server: `npm run dev`
5. Open browser to `http://localhost:5173`

### Environment Variables
```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-anon-key
```

## 🔐 Security Summary

| Concern | Solution |
|---------|----------|
| Who can login? | Only users YOU create in Supabase Auth dashboard |
| Who can read/write data? | Only authenticated users (RLS enforced) |
| Who can upload files? | Only authenticated users (Storage RLS) |
| Anon key exposed in frontend? | Safe — anon key only works with RLS policies |
| Signup disabled? | Yes — no self-registration |
| `.env` in git? | No — `.gitignore` blocks it |

## 📞 Support & Troubleshooting

### Common Issues

1. **Authentication fails**
   - Verify RLS policies are enabled on all tables
   - Check Supabase Auth users exist
   - Confirm `.env` variables are correct

2. **File upload fails**
   - Verify "drawings" bucket exists
   - Check Storage RLS policies
   - Confirm user is authenticated

3. **Database queries fail**
   - Check table names match exactly
   - Verify column names in queries
   - Confirm user has proper permissions

4. **Build fails on Cloudflare Pages**
   - Check environment variables are set
   - Verify build command matches package.json
   - Check Node.js version compatibility

### Rollback Procedures

1. **Database issues**: Use Supabase dashboard to restore from backup
2. **Frontend issues**: Revert to previous Cloudflare Pages deployment
3. **Security issues**: Rotate Supabase anon key and update environment variables

## 📈 Next Steps After Deployment

1. **Monitoring**: Set up Supabase monitoring and alerts
2. **Backup**: Configure automatic database backups
3. **Scaling**: Monitor usage and upgrade Supabase plan if needed
4. **Features**: Consider adding:
   - Email notifications for low stock
   - PDF generation for purchase orders
   - Bulk import/export functionality
   - Advanced search and filtering
   - User role-based permissions

## 🏆 Success Metrics

- **Deployment**: App accessible at Cloudflare Pages URL
- **Performance**: Page load < 3 seconds
- **Reliability**: 99.9% uptime (Cloudflare + Supabase SLA)
- **Usability**: All CRUD operations work without errors
- **Security**: No data leaks, proper authentication enforced

---
*Last Updated: April 1, 2026*  
*Version: 1.0.0*  
*Status: Ready for Implementation*
