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
  assigned_to: string | null
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
  // Joined Assignee details
  assignee_name?: string
  assignee_email?: string
}

export type PendingPartInsert = Omit<
  PendingPart,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'author_email'
  | 'author_name'
  | 'author_avatar'
  | 'approver_name'
  | 'assignee_name'
  | 'assignee_email'
  | 'approved_at'
  | 'approved_by'
>

export type PendingPartUpdate = Partial<
  Pick<PendingPart, 'name' | 'description' | 'category' | 'images' | 'links' | 'assigned_to'>
>

export type PendingPartComment = {
  id: number
  pending_part_id: number
  user_id: string | null
  message: string
  images: string[]
  parent_id: number | null
  created_at: string
  // Joined Author details
  author_email?: string
  author_name?: string
  author_avatar?: string
  // Client-side tree structure (not from DB)
  replies?: PendingPartComment[]
}

// Profiles type for assignee picker
export type Profile = {
  id: string
  full_name: string | null
  email: string | null
}

/** Build a flat comment list into a nested tree by parent_id */
function buildCommentTree(flat: PendingPartComment[]): PendingPartComment[] {
  const map = new Map<number, PendingPartComment>()
  const roots: PendingPartComment[] = []

  flat.forEach(c => map.set(c.id, { ...c, replies: [] }))

  flat.forEach(c => {
    const node = map.get(c.id)!
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.replies!.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

export const pendingPartsApi = {
  /**
   * Fetch all pending parts for a project, with author + assignee profiles joined
   */
  getPendingParts: async (projectId: number): Promise<PendingPart[]> => {
    const { data: parts, error } = await supabase
      .from('pending_parts')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Collect all relevant user IDs in one shot
    const allIds = [
      ...new Set(
        (parts || [])
          .flatMap((p: any) => [p.created_by, p.approved_by, p.assigned_to])
          .filter(Boolean)
      ),
    ] as string[]

    const profilesMap: Record<string, any> = {}
    if (allIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', allIds)
      if (profilesData) {
        profilesData.forEach((p: any) => { profilesMap[p.id] = p })
      }
    }

    return (parts || []).map((item: any) => ({
      ...item,
      author_name: profilesMap[item.created_by]?.full_name,
      author_email: profilesMap[item.created_by]?.email,
      author_avatar: undefined,
      approver_name: profilesMap[item.approved_by]?.full_name,
      assignee_name: profilesMap[item.assigned_to]?.full_name,
      assignee_email: profilesMap[item.assigned_to]?.email,
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
   * Update editable fields of a pending part (name, description, category, images, links, assigned_to)
   */
  updatePendingPart: async (id: number, updates: PendingPartUpdate): Promise<PendingPart> => {
    const { data, error } = await supabase
      .from('pending_parts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as PendingPart
  },

  /**
   * Assign a pending part to a user (shorthand)
   */
  assignPendingPart: async (id: number, userId: string | null): Promise<void> => {
    const { error } = await supabase
      .from('pending_parts')
      .update({ assigned_to: userId, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
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
      updated_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
      approved_by: user?.id,
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
   * Fetch all profiles (for assignee picker)
   */
  getProfiles: async (): Promise<Profile[]> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name', { ascending: true })

    if (error) throw error
    return (data || []) as Profile[]
  },

  /**
   * Get all comments for a specific pending part, returned as a nested tree
   */
  getComments: async (pendingPartId: number): Promise<PendingPartComment[]> => {
    const { data: comments, error } = await supabase
      .from('pending_part_comments')
      .select('*')
      .eq('pending_part_id', pendingPartId)
      .order('created_at', { ascending: true })

    if (error) throw error

    const userIds = [
      ...new Set((comments || []).map((c: any) => c.user_id).filter(Boolean)),
    ] as string[]

    const profilesMap: Record<string, any> = {}
    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      if (profilesData) {
        profilesData.forEach((p: any) => { profilesMap[p.id] = p })
      }
    }

    const flat: PendingPartComment[] = (comments || []).map((item: any) => ({
      ...item,
      author_name: profilesMap[item.user_id]?.full_name,
      author_email: profilesMap[item.user_id]?.email,
      author_avatar: undefined,
      images: Array.isArray(item.images) ? item.images : [],
      parent_id: item.parent_id ?? null,
    }))

    return buildCommentTree(flat)
  },

  /**
   * Add a new comment (optionally as a reply to parent_id)
   */
  addComment: async (
    pendingPartId: number,
    message: string,
    images: string[] = [],
    parentId: number | null = null
  ): Promise<PendingPartComment> => {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Must be logged in to comment')

    const { data, error } = await supabase
      .from('pending_part_comments')
      .insert([{
        pending_part_id: pendingPartId,
        user_id: user.id,
        message,
        images,
        parent_id: parentId,
      }])
      .select('*')
      .single()

    if (error) throw error

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    return {
      ...data,
      author_name: profile?.full_name,
      author_email: profile?.email,
      author_avatar: undefined,
      parent_id: data.parent_id ?? null,
    } as PendingPartComment
  },

  /**
   * Delete a pending part and its associated storage assets
   */
  deletePendingPart: async (id: number): Promise<void> => {
    const { data: part } = await supabase
      .from('pending_parts')
      .select('images')
      .eq('id', id)
      .single()

    const { data: comments } = await supabase
      .from('pending_part_comments')
      .select('images')
      .eq('pending_part_id', id)

    const relativePaths: string[] = []

    if (part?.images && Array.isArray(part.images)) {
      part.images.forEach((url: string) => {
        if (url.includes('bom_assets')) {
          const path = url.split('bom_assets/')[1]
          if (path) relativePaths.push(path)
        }
      })
    }

    if (comments) {
      comments.forEach((comment: any) => {
        if (comment.images && Array.isArray(comment.images)) {
          comment.images.forEach((url: string) => {
            if (url.includes('bom_assets')) {
              const path = url.split('bom_assets/')[1]
              if (path) relativePaths.push(path)
            }
          })
        }
      })
    }

    const { error: dbError } = await supabase
      .from('pending_parts')
      .delete()
      .eq('id', id)
      .throwOnError()

    if (dbError) {
      console.error('❌ DB Delete failed:', dbError)
      throw dbError
    }

    if (relativePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('bom_assets')
        .remove(relativePaths)

      if (storageError) {
        console.warn('⚠️ Storage cleanup failed (non-blocking):', storageError)
      }
    }

    console.log(`✅ Pending part ${id} and all related data deleted successfully`)
  },
}

export default pendingPartsApi
