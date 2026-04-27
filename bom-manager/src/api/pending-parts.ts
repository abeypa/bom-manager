import { supabase } from '@/lib/supabase'

export type PendingPartLink = {
  label: string
  url: string
}

export type PendingPart = {
  id: number
  project_id: number
  name: string
  description: string | null
  category: string | null
  status: 'Pending' | 'Approved' | 'Rejected'
  created_by: string | null
  images: string[]
  links: PendingPartLink[]
  rejection_reason: string | null
  created_at: string
  updated_at: string | null
  // Joined Author details
  author_email?: string
}

export type PendingPartInsert = Omit<PendingPart, 'id' | 'created_at' | 'updated_at' | 'author_email'>

export type PendingPartComment = {
  id: number
  pending_part_id: number
  user_id: string | null
  message: string
  created_at: string
  // Joined Author details
  author_email?: string
}

export const pendingPartsApi = {
  /**
   * Fetch all pending parts for a project
   */
  getPendingParts: async (projectId: number): Promise<PendingPart[]> => {
    const { data, error } = await supabase
      .from('pending_parts')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return (data || []).map((item: any) => ({
      ...item,
      author_email: item.author?.email,
      // Map arrays if they accidentally come back as strings or null
      images: Array.isArray(item.images) ? item.images : [],
      links: Array.isArray(item.links) ? item.links : [],
    }))
  },

  /**
   * Create a new pending part
   */
  createPendingPart: async (partData: PendingPartInsert): Promise<PendingPart> => {
    const { data: { user } } = await supabase.auth.getUser()
    
    const payload = {
      ...partData,
      created_by: user?.id,
    }

    const { data, error } = await supabase
      .from('pending_parts')
      .insert([payload])
      .select()
      .single()

    if (error) throw error
    return data as PendingPart
  },

  /**
   * Update status of a pending part (Approve / Reject)
   */
  updatePendingPartStatus: async (
    id: number, 
    status: 'Approved' | 'Rejected', 
    rejectionReason: string | null = null
  ): Promise<PendingPart> => {
    const payload: any = {
      status,
      updated_at: new Date().toISOString()
    }
    
    if (status === 'Rejected' && rejectionReason) {
      payload.rejection_reason = rejectionReason
    }

    const { data, error } = await supabase
      .from('pending_parts')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as PendingPart
  },

  /**
   * Get all comments for a specific pending part
   */
  getComments: async (pendingPartId: number): Promise<PendingPartComment[]> => {
    const { data, error } = await supabase
      .from('pending_part_comments')
      .select('*')
      .eq('pending_part_id', pendingPartId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return (data || []).map((item: any) => ({
      ...item,
      author_email: item.author?.email,
    }))
  },

  /**
   * Add a new comment to a pending part
   */
  addComment: async (pendingPartId: number, message: string): Promise<PendingPartComment> => {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Must be logged in to comment")
    }

    const { data, error } = await supabase
      .from('pending_part_comments')
      .insert([{
        pending_part_id: pendingPartId,
        user_id: user.id,
        message
      }])
      .select('*')
      .single()

    if (error) throw error

    return {
      ...data,
      author_email: data.author?.email
    } as PendingPartComment
  }
}

export default pendingPartsApi
