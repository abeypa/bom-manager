import { supabase } from '@/lib/supabase'
import type { PartCategory } from './parts'

// ─── Part In: Receiving stock from suppliers ───

export interface PartInEntry {
  part_type: PartCategory
  part_number: string
  part_id: number
  supplier_name: string
  supplier_id: number | null
  quantity: number
  po_number?: string
  notes?: string
  received_date: string
}

export const partInOutApi = {
  // ── PART IN ──

  /**
   * Manually receive parts into stock (Part In).
   * Updates the master part's stock_quantity and received_qty.
   */
  receivePartIn: async (entry: PartInEntry) => {
    const { part_type, part_id, quantity, supplier_name, po_number } = entry

    if (quantity <= 0) throw new Error('Quantity must be greater than 0')

    // 1. Get current master part
    const { data: part, error: fetchErr } = await ((supabase as any).from(part_type) as any)
      .select('id, part_number, stock_quantity, received_qty')
      .eq('id', part_id)
      .single()

    if (fetchErr) throw fetchErr
    if (!part) throw new Error('Part not found')

    // 2. Update stock
    const { error: updateErr } = await ((supabase as any).from(part_type) as any)
      .update({
        stock_quantity: (part.stock_quantity || 0) + quantity,
        received_qty: (part.received_qty || 0) + quantity,
        updated_date: new Date().toISOString()
      })
      .eq('id', part_id)

    if (updateErr) throw updateErr

    // 3. Log in part_usage_logs with negative quantity convention (positive = in)
    // Or we use a dedicated approach: store with a marker in site_name
    const { error: logErr } = await ((supabase as any).from('part_usage_logs') as any)
      .insert([{
        project_name: `STOCK-IN: ${supplier_name}`,
        site_name: po_number ? `PO: ${po_number}` : 'Manual Receipt',
        part_number: part.part_number,
        part_table_name: part_type,
        quantity: quantity,
        use_date_time: entry.received_date || new Date().toISOString(),
        created_date: new Date().toISOString()
      }])

    if (logErr) console.error('Failed to log part-in:', logErr)

    return { success: true, newStock: (part.stock_quantity || 0) + quantity }
  },

  /**
   * Get Part-In history (received stock).
   * Filters part_usage_logs where project_name starts with "STOCK-IN:"
   */
  getPartInHistory: async () => {
    const { data, error } = await supabase
      .from('part_usage_logs')
      .select('*')
      .like('project_name', 'STOCK-IN:%')
      .order('use_date_time', { ascending: false })

    if (error) throw error
    return (data || []).map((log: any) => ({
      ...log,
      supplier_name: log.project_name.replace('STOCK-IN: ', ''),
      po_reference: log.site_name
    }))
  },

  // ── PART OUT ──

  /**
   * Get Part-Out history (project consumption).
   * Filters part_usage_logs where project_name does NOT start with "STOCK-IN:"
   */
  getPartOutHistory: async () => {
    const { data, error } = await supabase
      .from('part_usage_logs')
      .select('*')
      .not('project_name', 'like', 'STOCK-IN:%')
      .order('use_date_time', { ascending: false })

    if (error) throw error
    return data || []
  },

  /**
   * Get Part-Out grouped by project
   */
  getPartOutByProject: async () => {
    const { data, error } = await supabase
      .from('part_usage_logs')
      .select('*')
      .not('project_name', 'like', 'STOCK-IN:%')
      .order('project_name', { ascending: true })

    if (error) throw error

    // Group by project
    const grouped: Record<string, any[]> = {}
    for (const log of (data || [])) {
      const key = (log as any).project_name
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(log)
    }

    return Object.entries(grouped).map(([projectName, logs]) => ({
      projectName,
      totalParts: logs.length,
      totalQuantity: logs.reduce((sum: number, l: any) => sum + (l.quantity || 0), 0),
      logs
    }))
  },

  // ── Helpers ──

  /**
   * Get all parts across all categories for dropdown selection
   */
  getAllPartsFlat: async () => {
    const categories: PartCategory[] = [
      'mechanical_manufacture',
      'mechanical_bought_out',
      'electrical_manufacture',
      'electrical_bought_out',
      'pneumatic_bought_out'
    ]

    const results: any[] = []

    for (const cat of categories) {
      const { data } = await ((supabase as any).from(cat) as any)
        .select('id, part_number, description, stock_quantity, supplier_id, suppliers:supplier_id(name)')
        .order('part_number', { ascending: true })

      if (data) {
        results.push(...data.map((p: any) => ({
          ...p,
          part_type: cat,
          supplier_name: p.suppliers?.name || null
        })))
      }
    }

    return results
  }
}
