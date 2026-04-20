import { supabase } from '../lib/supabase';

export const stockMovementsApi = {
  /**
   * Get all stock movements (with optional filters)
   */
  getAll: async (filters?: {
    movement_type?: 'IN' | 'OUT' | 'ADJUST' | 'RESTORE';
    part_table_name?: string;
    part_id?: number;
    project_id?: number;
    limit?: number;
  }) => {
    let query = supabase
      .from('stock_movements')
      .select(`
        *,
        suppliers (name),
        projects (project_name)
      `) as any;

    query = query.order('moved_at', { ascending: false });

    if (filters?.movement_type) {
      query = query.eq('movement_type', filters.movement_type);
    }
    if (filters?.part_table_name) {
      query = query.eq('part_table_name', filters.part_table_name);
    }
    if (filters?.part_id) {
      query = query.eq('part_id', filters.part_id);
    }
    if (filters?.project_id) {
      query = query.eq('project_id', filters.project_id);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  /**
   * Get movements for a specific part (used in Part detail)
   */
  getByPart: async (partTable: string, partId: number) => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('part_table_name', partTable)
      .eq('part_id', partId)
      .order('moved_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  /**
   * Get movements for a specific project
   */
  getByProject: async (projectId: number) => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('project_id', projectId)
      .order('moved_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  /**
   * Add a manual stock movement (used by Part In / Part Out page)
   */
  addMovement: async (movement: {
    movement_type: 'IN' | 'OUT' | 'ADJUST' | 'RESTORE';
    part_table_name: string;
    part_id: number;
    part_number: string;
    quantity: number;
    stock_before?: number;
    stock_after?: number;
    supplier_id?: number;
    supplier_name?: string;
    po_number?: string;
    project_id?: number;
    project_name?: string;
    project_section_name?: string;
    site_name?: string;
    reference_notes?: string;
    unit_price_at_movement?: number;
  }) => {
    const { data, error } = await (supabase as any)
      .from('stock_movements')
      .insert([
        {
          ...movement,
          moved_by: (await supabase.auth.getUser()).data.user?.email || 'system',
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

export default stockMovementsApi;
