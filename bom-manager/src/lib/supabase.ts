// Supabase client configuration for BOM Manager

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Get environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Supabase environment variables are missing. High-level orchestrator will fail.');
}

// Create Supabase client with enhanced configuration (only if config exists)
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: localStorage,
        storageKey: 'supabase.auth.token',
        flowType: 'pkce',
      },
      global: {
        headers: {
          'x-application-name': 'bom-manager',
        },
      },
      db: {
        schema: 'public',
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null as any;

// Helper function to check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseAnonKey;
}

// Helper function to get storage bucket reference
export function getStorageBucket(bucketName: string = 'drawings') {
  return supabase.storage.from(bucketName);
}

// Helper function to get auth session
export async function getCurrentSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  
  return session;
}

// Helper function to get current user
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('Error getting user:', error);
    return null;
  }
  
  return user;
}

// Helper function to check if user is authenticated
export async function isAuthenticated(): Promise<boolean> {
  const session = await getCurrentSession();
  return !!session;
}

// Helper function to sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('Error signing out:', error);
    return false;
  }
  
  return true;
}

// Storage-specific helpers
export const storage = {
  // Upload with progress tracking
  uploadWithProgress: async (
    bucket: string,
    path: string,
    file: File,
    onProgress?: (progress: number) => void
  ) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        // Note: Supabase JS client doesn't currently support progress events
        // This would need to be implemented with XMLHttpRequest if needed
      });

    return { data, error };
  },

  // Download as blob with error handling
  downloadAsBlob: async (bucket: string, path: string) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path);

    return { data, error };
  },

  // Get multiple signed URLs at once
  getMultipleSignedUrls: async (
    bucket: string,
    paths: string[],
    expiresIn: number = 3600
  ) => {
    const promises = paths.map(path =>
      supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
    );
    
    const results = await Promise.all(promises);
    return results.map((result, index) => ({
      path: paths[index],
      signedUrl: result.data?.signedUrl || null,
      error: result.error,
    }));
  },

  // Check if file exists
  fileExists: async (bucket: string, path: string) => {
    const { data } = await supabase.storage
      .from(bucket)
      .list(path.split('/').slice(0, -1).join('/') || '');

    if (!data) return false;
    
    const fileName = path.split('/').pop();
    return data.some(file => file.name === fileName);
  },
};

// Realtime subscriptions helper
export function subscribeToTable(
  table: string,
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
  callback: (payload: any) => void
) {
  return supabase
    .channel(`table-changes:${table}`)
    .on(
      'postgres_changes',
      {
        event,
        schema: 'public',
        table,
      },
      callback
    )
    .subscribe();
}

// Unsubscribe from channel
export function unsubscribeFromChannel(channel: any) {
  supabase.removeChannel(channel);
}

// Error handling utilities
export class SupabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'SupabaseError';
  }
}

export function handleSupabaseError(error: any): SupabaseError {
  if (error instanceof Error) {
    return new SupabaseError(error.message);
  }
  
  if (error?.message) {
    return new SupabaseError(error.message, error.code, error.details);
  }
  
  return new SupabaseError('Unknown Supabase error');
}

// Export a singleton instance for convenience
export default supabase;
