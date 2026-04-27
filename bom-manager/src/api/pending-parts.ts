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
  approved_at: string | null
  approved_by: string | null
  // Joined Author details
  author_email?: string
  author_name?: string
  author_avatar?: string
  // Joined Approver details
  approver_name?: string
}

export type PendingPartInsert = Omit<PendingPart, 'id' | 'created_at' | 'updated_at' | 'author_email' | 'author_name' | 'author_avatar' | 'approver_name' | 'approved_at' | 'approved_by'>

export type PendingPartComment = {
  id: number
  pending_part_id: number
  user_id: string | null
  message: string
  images: string[]
  created_at: string
  // Joined Author details
  author_email?: string
  author_name?: string
  author_avatar?: string
}

export const pendingPartsApi = {
  /**
   * Fetch all pending parts for a project
   */
  getPendingParts: async (projectId: number): Promise<PendingPart[]> => {
    const { data: parts, error } = await supabase
      .from('pending_parts')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Safe fallback mapping: manually fetch profiles safely linked via ID without foreign-key join constraints
    const userIds = [...new Set((parts || []).map((p: any) => p.created_by).concat((parts || []).map((p: any) => p.approved_by)).filter(Boolean))] as string[];
    const profilesMap: Record<string, any> = {};
    
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
      if (profilesData) {
        profilesData.forEach((p: any) => { profilesMap[p.id] = p });
      }
    }

    return (parts || []).map((item: any) => ({
      ...item,
      author_name: profilesMap[item.created_by]?.full_name,
      author_email: profilesMap[item.created_by]?.email,
      author_avatar: undefined, // profiles table does not have avatar_url column
      approver_name: profilesMap[item.approved_by]?.full_name,
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
    const { data: { user } } = await supabase.auth.getUser()
    
    const payload: any = {
      status,
      updated_at: new Date().toISOString()
    }
    
    if (status === 'Approved' || status === 'Rejected') {
      payload.approved_at = new Date().toISOString()
      payload.approved_by = user?.id
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
    const { data: comments, error } = await supabase
      .from('pending_part_comments')
      .select('*')
      .eq('pending_part_id', pendingPartId)
      .order('created_at', { ascending: true })

    if (error) throw error

    const userIds = [...new Set((comments || []).map((c: any) => c.user_id).filter(Boolean))] as string[];
    const profilesMap: Record<string, any> = {};
    
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
      if (profilesData) {
        profilesData.forEach((p: any) => { profilesMap[p.id] = p });
      }
    }

    return (comments || []).map((item: any) => ({
      ...item,
      author_name: profilesMap[item.user_id]?.full_name,
      author_email: profilesMap[item.user_id]?.email,
      author_avatar: undefined, // profiles table does not have avatar_url column
      images: Array.isArray(item.images) ? item.images : [],
    }))
  },

  /**
   * Add a new comment to a pending part
   */
  addComment: async (pendingPartId: number, message: string, images: string[] = []): Promise<PendingPartComment> => {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      throw new Error("Must be logged in to comment")
    }

    const { data, error } = await supabase
      .from('pending_part_comments')
      .insert([{
        pending_part_id: pendingPartId,
        user_id: user.id,
        message,
        images
      }])
      .select('*')
      .single()

    if (error) throw error

    // Fetch the author's profile safely
    const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single()

    return {
      ...data,
      author_name: profile?.full_name,
      author_email: profile?.email,
      author_avatar: undefined,
    } as PendingPartComment
  },

  /**
   * Delete a pending part and its associated storage assets
   */
  deletePendingPart: async (id: number): Promise<void> => {
    // 1. Fetch part to get image URLs before deletion
    const { data: part } = await supabase
      .from('pending_parts')
      .select('images')
      .eq('id', id)
      .single();

    // 2. Fetch comments to get image URLs
    const { data: comments } = await supabase
      .from('pending_part_comments')
      .select('images')
      .eq('pending_part_id', id);

    // 3. Collect all unique image paths
    const allImages: string[] = [];
    if (Array.isArray(part?.images)) allImages.push(...part.images);
    if (comments) {
      comments.forEach((c: any) => {
        if (Array.isArray(c.images)) allImages.push(...c.images);
      });
    }

    // 4. Transform URLs to relative storage paths
    const extractPathFromUrl = (url: string) => {
      try {
        // We handle both 'bom_assets' and 'part-images' (fallback) just in case
        const parts = url.split('/public/bom_assets/') || url.split('/public/part-images/');
        return parts.length > 1 ? decodeURIComponent(parts[1]) : null;
      } catch (e) { return null; }
    };

    const relativePaths = [...new Set(allImages.map(extractPathFromUrl).filter(Boolean))] as string[];

    // 5. Delete from DB (Comments will cascade delete)
    const { error: dbError } = await supabase.from('pending_parts').delete().eq('id', id);
    if (dbError) throw dbError;

    // 6. Bulk delete from storage
    if (relativePaths.length > 0) {
      // Clean up from both possible buckets to be ultra safe
      await Promise.all([
        supabase.storage.from('bom_assets').remove(relativePaths),
        supabase.storage.from('part-images').remove(relativePaths)
      ]);
    }
  }
}

export default pendingPartsApi
