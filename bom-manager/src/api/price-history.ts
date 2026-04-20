import { supabase } from '../lib/supabase';

export const priceHistoryApi = {
  /**
   * Get full price history for a specific part
   */
  getHistory: async (partTable: string, partId: number) => {
    const { data, error } = await supabase
      .from('part_price_history')
      .select('*')
      .eq('part_table_name', partTable)
      .eq('part_id', partId)
      .order('changed_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Get recent price changes (for dashboard or part list)
   */
  getRecentChanges: async (limit: number = 10) => {
    const { data, error } = await supabase
      .from('part_price_history')
      .select(`
        *,
        part_table_name,
        part_number,
        new_price,
        changed_at,
        change_reason
      `)
      .order('changed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  /**
   * Manually add a price history entry (used by updatePart and import)
   */
  addEntry: async (entry: {
    part_table_name: string;
    part_id: number;
    part_number: string;
    old_price?: number | null;
    new_price: number;
    old_currency?: string | null;
    new_currency?: string;
    old_discount_percent?: number | null;
    new_discount_percent?: number | null;
    change_reason?: string;
    changed_at?: string; // Optional custom date
  }) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('part_price_history')
      .insert([
        {
          ...entry,
          changed_by: user?.email || 'system',
          changed_at: entry.changed_at || new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a specific price history entry
   */
  deleteEntry: async (id: string) => {
    const { error } = await supabase
      .from('part_price_history')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};

export default priceHistoryApi;
