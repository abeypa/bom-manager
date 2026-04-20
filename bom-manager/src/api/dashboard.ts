import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Project = Database['public']['Tables']['projects']['Row']

export interface DashboardStats {
  total_parts: number;
  mechanical_manufacture: number;
  mechanical_bought_out: number;
  electrical_manufacture: number;
  electrical_bought_out: number;
  pneumatic_bought_out: number;
  low_stock_alerts: number;
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  on_hold_projects: number;
  total_suppliers: number;
  pending_pos: number;
  total_pos: number;
}

export const dashboardApi = {
  // Main dashboard stats (uses the new RPC with robust fallback)
  getStats: async (): Promise<DashboardStats> => {
    try {
      const { data, error } = await supabase.rpc('get_dashboard_stats');
      if (error) throw error;
      return data as unknown as DashboardStats;
    } catch (err) {
      console.warn('RPC get_dashboard_stats failed, using fallback queries', err);

      // Fallback queries (safe if RPC is missing in some environments)
      const [
        { count: mm },
        { count: mbo },
        { count: em },
        { count: ebo },
        { count: pbo },
        { count: totalProjects },
        { count: pendingPOs },
      ] = await Promise.all([
        (supabase as any).from('mechanical_manufacture').select('*', { count: 'exact', head: true }),
        (supabase as any).from('mechanical_bought_out').select('*', { count: 'exact', head: true }),
        (supabase as any).from('electrical_manufacture').select('*', { count: 'exact', head: true }),
        (supabase as any).from('electrical_bought_out').select('*', { count: 'exact', head: true }),
        (supabase as any).from('pneumatic_bought_out').select('*', { count: 'exact', head: true }),
        (supabase as any).from('projects').select('*', { count: 'exact', head: true }),
        (supabase as any).from('purchase_orders').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
      ]);

      return {
        total_parts: (mm || 0) + (mbo || 0) + (em || 0) + (ebo || 0) + (pbo || 0),
        mechanical_manufacture: mm || 0,
        mechanical_bought_out: mbo || 0,
        electrical_manufacture: em || 0,
        electrical_bought_out: ebo || 0,
        pneumatic_bought_out: pbo || 0,
        low_stock_alerts: 0, // Fallback doesn't compute complex low stock yet
        total_projects: totalProjects || 0,
        active_projects: totalProjects || 0,
        completed_projects: 0,
        on_hold_projects: 0,
        total_suppliers: 0,
        pending_pos: pendingPOs || 0,
        total_pos: 0,
      };
    }
  },

  getRecentProjects: async (): Promise<Project[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_date', { ascending: false })
      .limit(5)
      
    if (error) throw error
    return data as Project[]
  }
};
