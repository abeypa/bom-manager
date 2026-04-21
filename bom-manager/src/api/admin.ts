import { supabase } from '../lib/supabase';
import { logActivityAsync } from './activity-logs';

export const adminApi = {
  /**
   * Get all user profiles merged with their auth emails.
   *
   * Problem: when a user signs up, the `profiles` trigger may not populate
   * the `email` column — leaving it NULL. We fix this by:
   *   1. Fetching all profile rows (includes NULLs)
   *   2. Fetching the current user's own auth record (always available)
   *   3. Using a Supabase RPC or Edge Function to fetch all auth users
   *      (only works with service-role key — not available client-side)
   *
   * Fallback strategy: for rows where email IS NULL, derive the display
   * name from whatever data is available and show them clearly.
   */
  getProfiles: async () => {
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('*')
      .order('created_date', { ascending: true });

    if (error) throw error;

    // Patch NULL emails: try to get email from auth for the current user,
    // and for others mark them as needing sync.
    const { data: { user: me } } = await supabase.auth.getUser();

    return (data || []).map((p: any) => {
      // If this profile is the current logged-in user, we can fill the email
      if (p.id === me?.id && !p.email) {
        return { ...p, email: me.email };
      }
      return p;
    });
  },

  /**
   * Update a user's role in the profiles table
   */
  updateUserRole: async (userId: string, role: 'admin' | 'user') => {
    // Fetch old role for audit trail
    const { data: oldProfile } = await (supabase as any)
      .from('profiles').select('role').eq('id', userId).single();

    const { data, error } = await (supabase as any)
      .from('profiles')
      .update({ role, updated_date: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    logActivityAsync({
      action: 'ROLE_CHANGE',
      entity_type: 'user',
      entity_id: userId,
      old_values: { role: oldProfile?.role },
      new_values: { role },
    });

    return data;
  },

  /**
   * System stats for admin dashboard
   */
  getSystemStats: async () => {
    const [
      { count: projectsCount },
      { count: partsCount },
      { count: usersCount },
    ] = await Promise.all([
      (supabase as any).from('projects').select('*', { count: 'exact', head: true }),
      (supabase as any).from('parts_all').select('*', { count: 'exact', head: true }),
      (supabase as any).from('profiles').select('*', { count: 'exact', head: true }),
    ]);

    return {
      projects: projectsCount || 0,
      parts: partsCount || 0,
      users: usersCount || 0,
    };
  },

  /**
   * Create a new user using a separate Supabase client that does NOT
   * affect the current admin session.
   *
   * Uses signUp with emailRedirectTo disabled (no confirmation email sent
   * when email confirmations are turned OFF in Supabase Auth settings).
   *
   * IMPORTANT: In Supabase Dashboard → Authentication → Settings →
   * "Enable email confirmations" must be DISABLED for new users to
   * log in immediately without confirming their email.
   *
   * The profile row is always inserted explicitly after creation so that
   * email, full_name, and role are correctly set regardless of whether
   * the DB trigger fires.
   */
  createUser: async (email: string, password: string, fullName: string) => {
    // Use a temporary client with no session persistence so the admin
    // stays logged in
    const { createClient } = await import('@supabase/supabase-js');
    const tempClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Create the auth user
    const { data: authData, error: authError } = await tempClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        // Disable email redirect — user logs in immediately
        emailRedirectTo: undefined,
      },
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('User creation returned no user object');

    // Explicitly upsert the profile row so email + full_name are always set.
    // Use upsert in case the DB trigger already created a row.
    const { error: profileError } = await (supabase as any)
      .from('profiles')
      .upsert(
        {
          id: authData.user.id,
          email,
          full_name: fullName,
          role: 'user',
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    // Ignore unique violation (23505) — trigger may have already inserted
    if (profileError && (profileError as any).code !== '23505') {
      console.error('Profile upsert error:', profileError);
      // Don't throw — the auth user was created successfully
    }

    logActivityAsync({
      action: 'CREATE',
      entity_type: 'user',
      entity_id: authData.user.id,
      new_values: { email, full_name: fullName, role: 'user' },
    });

    return authData.user;
  },

  /**
   * Patch existing profile rows that have NULL email.
   * Admin calls this to sync profiles with known data.
   * Can only fix the current user's own row since we don't have
   * service-role access client-side.
   */
  patchMyProfile: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    await (supabase as any)
      .from('profiles')
      .update({
        email: user.email,
        updated_date: new Date().toISOString(),
      })
      .eq('id', user.id)
      .is('email', null);
  },

  /**
   * Update a user's display profile (full_name and/or email in profiles table).
   * Note: This does NOT change the auth.users login email — profiles only.
   */
  updateUserProfile: async (userId: string, updates: { fullName?: string; email?: string }) => {
    // Fetch old profile for audit trail
    const { data: oldProfile } = await (supabase as any)
      .from('profiles').select('full_name, email').eq('id', userId).single();

    const patch: Record<string, any> = { updated_date: new Date().toISOString() };
    if (updates.fullName !== undefined) patch.full_name = updates.fullName;
    if (updates.email !== undefined) patch.email = updates.email;

    const { data, error } = await (supabase as any)
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    logActivityAsync({
      action: 'UPDATE',
      entity_type: 'user',
      entity_id: userId,
      old_values: oldProfile ? { full_name: oldProfile.full_name, email: oldProfile.email } : null,
      new_values: { full_name: patch.full_name, email: patch.email },
    });

    return data;
  },

  /**
   * Send a password reset email to the user via Supabase Auth.
   * Uses the standard auth.resetPasswordForEmail which sends a secure
   * link — the user clicks it and sets their own new password.
   */
  sendPasswordResetEmail: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) throw error;
  },

  /**
   * Reset a user's password via the admin_reset_user_password RPC.
   * Requires the SQL function deployed in Supabase (see admin_reset_password.sql).
   * The RPC uses SECURITY DEFINER and enforces that the caller is an admin.
   */
  resetUserPassword: async (userId: string, newPassword: string) => {
    const { error } = await (supabase as any).rpc('admin_reset_user_password', {
      target_user_id: userId,
      new_password: newPassword,
    });
    if (error) throw error;

    logActivityAsync({
      action: 'PASSWORD_RESET',
      entity_type: 'user',
      entity_id: userId,
      new_values: { password_changed: true, method: 'admin_override' },
    });
  },
};

export default adminApi;
