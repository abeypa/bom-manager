# BOM Manager - Authentication Configuration Guide

## Overview
This document outlines the authentication configuration for the BOM Manager application using Supabase Auth. The system is configured for **email/password authentication only** with **manual user creation** (signup disabled).

## Configuration Steps

### Step 1: Disable Social Providers
1. Navigate to **Authentication → Providers** in your Supabase dashboard
2. Disable ALL social providers:
   - **Google**: Disabled
   - **GitHub**: Disabled
   - **Twitter/X**: Disabled
   - **Apple**: Disabled
   - **Azure**: Disabled
   - **GitLab**: Disabled
   - **Bitbucket**: Disabled
   - **Discord**: Disabled
   - **Facebook**: Disabled
   - **Keycloak**: Disabled
   - **LinkedIn**: Disabled
   - **Notion**: Disabled
   - **Slack**: Disabled
   - **Spotify**: Disabled
   - **Twitch**: Disabled
   - **WorkOS**: Disabled
   - **Zoom**: Disabled

### Step 2: Configure Email Provider
1. Ensure **Email** provider is **Enabled**
2. Under Email settings:
   - **Enable email confirmations**: `OFF` (recommended for internal tools)
   - **Enable secure email change**: `ON`
   - **Enable double confirmation for email changes**: `ON`
   - **Enable re-authentication period**: 168 hours (7 days)
   - **Enable automatic email verification**: `ON`

### Step 3: Disable Signup (Manual User Creation Only)
1. Under **Authentication → Settings**:
   - **Disable signup**: `ON`
   - This prevents anyone from self-registering
   - Only administrators can create users through the dashboard

### Step 4: Configure Additional Security Settings
1. **Password Security**:
   - **Minimum password length**: 8 characters
   - **Password required characters**: Leave at default
   - **Password HIBP check**: `ON` (recommended)
   
2. **Session Settings**:
   - **Session timeout**: 604800 seconds (7 days)
   - **Refresh token rotation**: `ON`
   - **Detect suspicious login attempts**: `ON`

3. **MFA Settings**:
   - **Enable MFA**: `OFF` (can be enabled if needed)
   - **MFA factor enrollment limit**: 10

## User Management

### Creating Users via Supabase Dashboard
1. Navigate to **Authentication → Users**
2. Click **"Add User"**
3. Fill in:
   - **Email**: User's email address
   - **Password**: Temporary password (user should change on first login)
   - **Email confirmed**: `ON`
   - **Phone confirmed**: Leave as `OFF`
4. Click **"Create User"**

### Creating Users via SQL (Admin Only)
```sql
-- Note: This requires admin privileges and should be done cautiously
-- Create a user with email/password
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at,
  is_super_admin,
  deleted_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'user@example.com',
  crypt('temporary_password', gen_salt('bf')),
  now(),
  now(),
  '',
  now(),
  '',
  now(),
  '',
  '',
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  null,
  null,
  '',
  '',
  now(),
  '',
  0,
  null,
  '',
  now(),
  false,
  null
);
```

### Creating Users via Management API
```bash
# Using curl with service_role key (keep this secure!)
curl -X POST 'https://your-project.supabase.co/auth/v1/admin/users' \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "temporary_password",
    "email_confirm": true,
    "user_metadata": {
      "role": "engineer"
    }
  }'
```

## Password Reset Flow
Since signup is disabled, password resets must be managed by administrators:
1. User requests password reset from administrator
2. Administrator resets password via Supabase dashboard:
   - Go to **Authentication → Users**
   - Find the user
   - Click **"Actions"** → **"Reset password"**
   - New password will be emailed to the user
3. User logs in with temporary password and changes it immediately

## User Roles and Permissions
All authenticated users have the same permissions in this system:
- **Role**: `authenticated`
- **Database Access**: Full CRUD access to all tables (via RLS policies)
- **Storage Access**: Full access to "drawings" bucket

## Testing Authentication
1. **Test Login**:
   ```bash
   curl -X POST 'https://your-project.supabase.co/auth/v1/token?grant_type=password' \
     -H "apikey: YOUR_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "password123"
     }'
   ```

2. **Verify Session**:
   ```bash
   curl -X GET 'https://your-project.supabase.co/auth/v1/user' \
     -H "apikey: YOUR_ANON_KEY" \
     -H "Authorization: Bearer ACCESS_TOKEN"
   ```

## Troubleshooting

### Common Issues
1. **"Signup disabled" error**: Ensure "Disable signup" is enabled in Auth settings
2. **User cannot login**: Check if email is confirmed in user management
3. **Password not working**: Reset password via dashboard
4. **Social login appearing**: Ensure all social providers are disabled

### Security Considerations
1. **Service Role Key**: Keep this key secure - it bypasses RLS policies
2. **Password Policy**: Enforce strong passwords (8+ chars, mixed case, numbers)
3. **Session Management**: Consider shorter timeouts for sensitive data
4. **Audit Logs**: Regularly review auth logs in Supabase dashboard

## Maintenance
1. **Regular user audit**: Review and remove inactive users monthly
2. **Password policy updates**: Update as security requirements change
3. **Security patches**: Monitor Supabase announcements for auth updates
4. **Backup user list**: Export user list periodically for disaster recovery

## Emergency Procedures
1. **Compromised account**:
   - Immediately reset user password
   - Review recent activity in auth logs
   - Consider revoking all sessions for the user
   
2. **Lost admin access**:
   - Use another admin account to reset password
   - Contact Supabase support if no admin accounts available

3. **Mass account compromise**:
   - Temporarily disable all user accounts
   - Reset all passwords
   - Investigate security breach
