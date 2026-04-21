import { supabase } from '../lib/supabase';

/**
 * Activity Logger — Client-side audit trail
 *
 * Logs user actions to the `activity_logs` table in Supabase.
 * Designed to be fire-and-forget: failures are logged to console
 * but never block the UI.
 */

export interface ActivityLogEntry {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'PASSWORD_RESET' | 'ROLE_CHANGE' | 'LOGIN' | 'LOGOUT' | 'IMPORT' | 'EXPORT';
  entity_type: 'user' | 'part' | 'project' | 'bom_item' | 'supplier' | 'purchase_order' | 'section' | 'job_order';
  entity_id: string;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
}

/**
 * Log a single activity to the audit trail.
 * Non-blocking — returns immediately so the UI stays responsive.
 */
export async function logActivity(entry: ActivityLogEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    await (supabase as any).from('activity_logs').insert({
      performed_by: user?.id || null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      old_values: entry.old_values || null,
      new_values: entry.new_values || null,
    });
  } catch (err) {
    // Silently fail — audit logging should never block the user
    console.warn('[ActivityLog] Failed to log activity:', err);
  }
}

/**
 * Log activity without awaiting (fire-and-forget).
 */
export function logActivityAsync(entry: ActivityLogEntry): void {
  logActivity(entry).catch(() => {});
}

/**
 * Fetch recent activity logs with optional filtering.
 */
export async function getActivityLogs(options: {
  entity_type?: string;
  entity_id?: string;
  performed_by?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<any[]> {
  let query = (supabase as any)
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (options.entity_type) {
    query = query.eq('entity_type', options.entity_type);
  }
  if (options.entity_id) {
    query = query.eq('entity_id', options.entity_id);
  }
  if (options.performed_by) {
    query = query.eq('performed_by', options.performed_by);
  }

  query = query.limit(options.limit || 50);

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
