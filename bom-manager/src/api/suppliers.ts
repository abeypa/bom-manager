import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Supplier = Database['public']['Tables']['suppliers']['Row']
export type SupplierInsert = Database['public']['Tables']['suppliers']['Insert']
export type SupplierUpdate = Database['public']['Tables']['suppliers']['Update']

export const suppliersApi = {
  getSuppliers: async () => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })
      
    if (error) throw error
    return data as Supplier[]
  },
  
  getSupplier: async (id: number) => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .single()
      
    if (error) throw error
    return data
  },
  
  createSupplier: async (supplier: SupplierInsert) => {
    const { data, error } = await ((supabase as any).from('suppliers') as any)
      .insert([supplier])
      .select()
      .single()
      
    if (error) throw error
    return data
  },
  
  updateSupplier: async (id: number, supplier: SupplierUpdate) => {
    const { data, error } = await ((supabase as any).from('suppliers') as any)
      .update(supplier)
      .eq('id', id)
      .select()
      .single()
      
    if (error) throw error
    return data
  },
  
  deleteSupplier: async (id: number) => {
    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id)
      
    if (error) throw error
  }
}
