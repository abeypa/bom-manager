# Supabase Setup Guide — BOM Manager / EngineFlow-PM

> Complete step-by-step guide to setting up the Supabase backend.
> Follow every step in order. Estimated time: **15–20 minutes**.

---

## Prerequisites

- A web browser
- Your `supabase-schema.sql` file (already in this project root)
- A Supabase account (free — no credit card required)

---

## STEP 1: Create a Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click **"Start your project"**
3. Sign up using **GitHub**, **Google**, or **email**
4. Verify your email if prompted

---

## STEP 2: Create a New Project

1. After logging in, click **"New Project"**
2. Fill in the form:

   | Field | Value |
   |-------|-------|
   | **Organization** | Your personal org (auto-created) |
   | **Project name** | `engineflow-pm` |
   | **Database Password** | Click "Generate" → **SAVE THIS PASSWORD** |
   | **Region** | Choose the one closest to your team |
   | **Pricing Plan** | Free (sufficient for a 15-person team) |

3. Click **"Create new project"**
4. Wait **1–2 minutes** for provisioning to complete (you'll see a loading screen)

> ⚠️ **Save your database password now.** You will not be able to retrieve it later.

---

## STEP 3: Create the Storage Bucket

> **This must be done BEFORE running the SQL schema**, because the SQL file contains
> storage policies that reference the `drawings` bucket.

1. In the left sidebar, click **"Storage"**
2. Click **"New Bucket"**
3. Fill in:

   | Field | Value |
   |-------|-------|
   | **Bucket name** | `drawings` |
   | **Public bucket** | **OFF** (private — requires authentication) |

4. Click **"Create bucket"**
5. You should see `drawings` appear in the bucket list ✅

---

## STEP 4: Run the Database Schema

1. In the left sidebar, click **"SQL Editor"**
2. Click **"New query"** (top right of the editor)
3. Open the file `supabase-schema.sql` from this project root
4. **Select All** the content (`Ctrl+A`) and **Copy** (`Ctrl+C`)
5. Click inside the Supabase SQL Editor and **Paste** (`Ctrl+V`)
6. Click **"Run"** (or press `Ctrl + Enter`)

**Expected output:**
```
Success. No rows returned.
```

### Verify Tables Were Created

1. In the left sidebar, click **"Table Editor"**
2. You should see **13 tables** listed:

   | Table | Purpose |
   |-------|---------|
   | `suppliers` | Supplier contact info |
   | `projects` | Engineering projects |
   | `project_sections` | Sub-sections within projects |
   | `mechanical_manufacture` | Mechanical parts (manufactured) |
   | `mechanical_bought_out` | Mechanical parts (bought out) |
   | `electrical_manufacture` | Electrical parts (manufactured) |
   | `electrical_bought_out` | Electrical parts (bought out) |
   | `pneumatic_bought_out` | Pneumatic parts |
   | `project_parts` | Parts assigned to project sections |
   | `purchase_orders` | Purchase order headers |
   | `purchase_order_items` | Line items within POs |
   | `part_usage_logs` | Audit trail of part usage |
   | `json_excel_file_uploaded` | Bulk import history |

3. Also verify in **Database → Functions** that `get_dashboard_stats` exists ✅

### Verify RLS Is Active

1. In the left sidebar, click **"Database"** → **"Tables"**
2. Click any table (e.g., `projects`)
3. In the table detail page, look for **"Row Level Security"** — it should show **"Enabled"** ✅

---

## STEP 5: Configure Authentication

### 5a. Disable Public Signup

> This app is for internal team use only. Only YOU can create user accounts.

1. In the left sidebar, click **"Authentication"**
2. Click **"Providers"**
3. Scroll down to find **"Email"** — confirm it is **Enabled** ✅
4. Click **"Authentication"** → **"Policies"** (or go to **Settings**)
5. In the left sidebar, go to **"Authentication"** → **"Settings"** (gear icon)
6. Find **"User Signups"** section
7. Toggle **"Allow new users to sign up"** → **OFF**
8. Click **"Save"**

> With signup disabled, the login page exists but nobody can self-register.
> Only users you manually create will be able to log in.

### 5b. Configure Email Templates (Optional)

1. Still in **Authentication → Email Templates**
2. Customize the **"Confirm signup"** email if you want (not required for private apps)

### 5c. Add Redirect URL for Local Development

1. Go to **Authentication → URL Configuration**
2. Under **"Redirect URLs"**, add:
   ```
   http://localhost:5173
   ```
3. Click **"Save"**
4. (After deployment) Add your Cloudflare Pages URL too, e.g.:
   ```
   https://engineflow-pm.pages.dev
   ```

---

## STEP 6: Create User Accounts

> Only users created here can log into the application.

1. In the left sidebar, click **"Authentication"** → **"Users"**
2. Click **"Add user"** → **"Create new user"**
3. Fill in:

   | Field | Value |
   |-------|-------|
   | **Email** | e.g., `yourname@company.com` |
   | **Password** | Choose a secure password |
   | **Auto Confirm User** | **ON** (skip email verification) |

4. Click **"Create user"**
5. Repeat for every team member who needs access
6. Users can change their passwords after first login via the app's Profile page

---

## STEP 7: Get Your API Credentials

1. In the left sidebar, go to **"Project Settings"** (gear icon at the bottom)
2. Click **"API"**
3. Copy and save the following:

   | Credential | Where to find | Example |
   |-----------|---------------|---------|
   | **Project URL** | Under "Project URL" | `https://xyzxyzxyz.supabase.co` |
   | **anon / public key** | Under "Project API keys" → `anon public` | `eyJhbGciOiJIUzI1NiIs...` |

> ⚠️ **Never share or commit your `service_role` key.** Only use the `anon` key in the frontend.

---

## STEP 8: Configure Environment Variables

1. In this project root, copy the example env file:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Open `.env` and fill in your credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...your-anon-key
   ```
3. **Never commit `.env` to git** — it is already listed in `.gitignore` ✅

---

## STEP 9: Verify Everything Works

Run a quick smoke test from the Supabase SQL Editor:

```sql
-- Test 1: Check all 13 tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Test 2: Verify RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Test 3: Verify the dashboard function works
SELECT get_dashboard_stats();

-- Test 4: Check seed data
SELECT COUNT(*) AS supplier_count FROM suppliers;
SELECT COUNT(*) AS project_count FROM projects;
```

**Expected results:**
- Test 1: 13 rows (one per table)
- Test 2: All rows with `rowsecurity = true`
- Test 3: JSON object with counts (all zeros if no data yet, or 5 if seed data was loaded)
- Test 4: `5` for both suppliers and projects (from seed data)

---

## STEP 10: Enable Realtime (Optional but Recommended)

For live dashboard updates when team members add parts:

1. In the left sidebar, go to **"Database"** → **"Replication"**
2. Under **"Supabase Realtime"**, enable the following tables:
   - `mechanical_manufacture` ✅
   - `mechanical_bought_out` ✅
   - `electrical_manufacture` ✅
   - `electrical_bought_out` ✅
   - `pneumatic_bought_out` ✅
   - `projects` ✅
   - `purchase_orders` ✅

---

## Summary Checklist

Run through this checklist before starting the frontend setup:

- [ ] Supabase project `engineflow-pm` created
- [ ] Database password saved securely
- [ ] Storage bucket `drawings` created (private, not public)
- [ ] `supabase-schema.sql` executed successfully
- [ ] All 13 tables visible in Table Editor
- [ ] `get_dashboard_stats` function visible in Database → Functions
- [ ] RLS is **Enabled** on all 13 tables
- [ ] Auth → Settings: **"Allow new users to sign up"** is **OFF**
- [ ] At least 1 user created in Authentication → Users
- [ ] Redirect URL `http://localhost:5173` added
- [ ] Project URL and anon key copied
- [ ] `.env` file created with both keys
- [ ] `.env` is NOT committed to git (verify with `git status`)
- [ ] Realtime enabled for 7 tables (optional)

---

## Troubleshooting

### SQL Error: "relation already exists"
The table already exists from a previous run. Either:
- Drop the table and re-run: `DROP TABLE IF EXISTS <table_name> CASCADE;`
- Or ignore the error — the schema uses `IF NOT EXISTS` so this is safe

### SQL Error: "policy already exists"
Run this to drop existing policies first, then re-run the SQL:
```sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;
```

### Storage Policy Error: "bucket drawings does not exist"
You skipped Step 3. Create the `drawings` bucket in Storage → New Bucket first, then re-run just the Part 3 section of the SQL file.

### Cannot log in to app
- Confirm you created a user in **Authentication → Users** (not just signup)
- Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` are correct
- Confirm the redirect URL `http://localhost:5173` is added in Auth → URL Configuration

### RLS blocking queries
If you're testing via SQL Editor and getting empty results, queries run as `anon` role by default. Try:
```sql
-- Temporarily bypass RLS for testing (SQL Editor only)
SET LOCAL role TO 'authenticated';
SELECT * FROM projects;
```

---

## Next Steps

Once all 14 checkboxes above are ticked, proceed to:
**Phase 1: Frontend Scaffolding** — Initialize React/Vite and connect to Supabase.

---

*Generated by Antigravity AI Agent for the BOM Manager / EngineFlow-PM project.*
