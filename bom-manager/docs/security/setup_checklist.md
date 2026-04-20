# BOM Manager - Security Setup Checklist

## Overview
Complete checklist for setting up BOM Manager security configuration on Supabase.

## Phase 1: Initial Supabase Setup ✅
- [ ] Create Supabase project at https://supabase.com
- [ ] Choose region closest to users
- [ ] Set database password (save securely)
- [ ] Wait for project provisioning (2-5 minutes)
- [ ] Copy Project URL and anon key from Settings → API

## Phase 2: Database Tables Setup (From bom-deployment.md)
- [ ] Run 2a. suppliers table SQL
- [ ] Run 2b. projects table SQL  
- [ ] Run 2c. project_sections table SQL
- [ ] Run 2d. parts tables SQL (5 tables)
- [ ] Run 2e. project_parts junction table SQL
- [ ] Run 2f. purchase_orders tables SQL
- [ ] Run 2g. part_usage_logs & upload history SQL

## Phase 3: Row Level Security (RLS) Configuration
- [ ] Run `sql/rls/01_enable_rls_policies.sql` in Supabase SQL Editor
- [ ] Verify RLS is enabled on all 13 tables
- [ ] Verify policies exist for "Authenticated users full access"
- [ ] Test: Anonymous query should return empty/error

### Verification Queries
```sql
-- Check RLS status
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Check policies on sample tables
SELECT tablename, policyname, cmd
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```

## Phase 4: Storage Configuration
- [ ] Go to Storage → New Bucket
- [ ] Name: `drawings`
- [ ] Public: OFF (private bucket)
- [ ] Create bucket
- [ ] Verify RLS policies for storage were created (from RLS script)
- [ ] Test upload/download with authenticated user

### Storage Test
```sql
-- Check storage policies
SELECT * FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects';
```

## Phase 5: Authentication Configuration
### Step 5.1: Disable Social Providers
- [ ] Authentication → Providers
- [ ] Disable: Google, GitHub, Twitter, Apple, Azure, GitLab, Bitbucket
- [ ] Disable: Discord, Facebook, Keycloak, LinkedIn, Notion
- [ ] Disable: Slack, Spotify, Twitch, WorkOS, Zoom

### Step 5.2: Configure Email Provider
- [ ] Ensure Email provider is Enabled
- [ ] Email confirmations: OFF (for internal tool)
- [ ] Secure email change: ON
- [ ] Double confirmation for email changes: ON
- [ ] Re-authentication period: 168 hours (7 days)

### Step 5.3: Disable Signup
- [ ] Authentication → Settings
- [ ] Disable signup: ON
- [ ] Save changes

### Step 5.4: Configure Security Settings
- [ ] Password minimum length: 8
- [ ] HIBP check: ON
- [ ] Session timeout: 604800 (7 days)
- [ ] Refresh token rotation: ON
- [ ] Detect suspicious login attempts: ON

## Phase 6: User Creation
### Step 6.1: Create Admin User(s)
- [ ] Authentication → Users → Add User
- [ ] Email: admin@yourcompany.com
- [ ] Password: [generate strong temporary password]
- [ ] Email confirmed: ON
- [ ] Create User

### Step 6.2: Create Additional Users
- [ ] Repeat for each team member needing access
- [ ] Document user emails and temporary passwords
- [ ] Instruct users to change password on first login

### Step 6.3: Test Authentication
- [ ] Open incognito browser
- [ ] Navigate to your login page (or Supabase Auth UI)
- [ ] Login with test credentials
- [ ] Verify successful authentication
- [ ] Verify session token is received

## Phase 7: Environment Configuration
### Step 7.1: Frontend Environment Variables
- [ ] Create `.env.local` from `.env.example`
- [ ] Set `VITE_SUPABASE_URL` to your project URL
- [ ] Set `VITE_SUPABASE_ANON_KEY` to your anon key
- [ ] Verify `.env.local` is in `.gitignore`

### Step 7.2: Cloudflare Pages Configuration
- [ ] Go to Cloudflare Pages → Your Project → Settings
- [ ] Environment Variables → Add variable
- [ ] Add `VITE_SUPABASE_URL` (production value)
- [ ] Add `VITE_SUPABASE_ANON_KEY` (production value)
- [ ] Configure for both Production and Preview deployments

## Phase 8: Security Verification
### Step 8.1: RLS Verification
```bash
# Test anonymous access (should fail)
curl -X GET 'https://your-project.supabase.co/rest/v1/suppliers?select=*' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json"

# Test authenticated access (should succeed with token)
curl -X GET 'https://your-project.supabase.co/rest/v1/suppliers?select=*' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer USER_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

### Step 8.2: Storage Verification
```bash
# Test storage access (requires auth)
curl -X POST 'https://your-project.supabase.co/storage/v1/object/drawings/test.txt' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer USER_ACCESS_TOKEN" \
  -H "Content-Type: text/plain" \
  -d 'Test file content'
```

### Step 8.3: Auth Verification
```bash
# Test login
curl -X POST 'https://your-project.supabase.co/auth/v1/token?grant_type=password' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password123"}'

# Should return access_token, refresh_token, etc.
```

## Phase 9: Monitoring Setup
### Step 9.1: Supabase Monitoring
- [ ] Set up email alerts for unusual activity
- [ ] Review Auth logs weekly
- [ ] Monitor database performance metrics
- [ ] Check storage usage regularly

### Step 9.2: Application Monitoring
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Monitor Cloudflare Analytics
- [ ] Set up uptime monitoring
- [ ] Create incident response plan

## Phase 10: Documentation & Handover
### Step 10.1: Document Configuration
- [ ] Save Supabase project details securely
- [ ] Document all user accounts
- [ ] Save backup recovery procedures
- [ ] Document key rotation schedule

### Step 10.2: Team Training
- [ ] Train administrators on user management
- [ ] Train users on security best practices
- [ ] Document troubleshooting procedures
- [ ] Create emergency contact list

## Emergency Contacts
- **Supabase Support**: https://supabase.com/docs/support
- **Cloudflare Support**: https://dash.cloudflare.com/?to=/:account/support
- **Internal IT Contact**: [Your IT department]
- **Security Incident Response**: [Your security team]

## Post-Setup Maintenance Schedule
- **Daily**: Check error logs
- **Weekly**: Review auth logs, check for suspicious activity
- **Monthly**: Rotate passwords for service accounts
- **Quarterly**: Full security review, dependency audit
- **Annually**: Penetration testing, security training refresh

## Troubleshooting Common Issues

### Issue: "RLS policy violation" errors
**Solution**: Verify RLS policies exist and user is authenticated

### Issue: Cannot upload to storage
**Solution**: Check storage bucket exists and policies are correct

### Issue: Users cannot sign up
**Solution**: This is expected - signup is disabled

### Issue: Social login buttons appear
**Solution**: Verify all social providers are disabled

### Issue: Environment variables not working
**Solution**: Check Cloudflare Pages environment variables are set
