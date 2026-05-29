import { supabase } from '@/lib/supabase'

export type PendingPartLink = {
  label: string
  url: string
}

export type PendingPartPriority = 'Urgent' | 'High' | 'Medium' | 'Low'
export type PendingPartStatus = 'Pending' | 'Approved' | 'Rejected'
export type PendingRecordType = 'work_item' | 'discussion'
export type DiscussionStatus = 'open' | 'closed'

export type PendingPart = {
  id: number
  project_id: number | null
  name: string
  description: string | null
  category: string | null
  status: PendingPartStatus
  priority: PendingPartPriority
  item_type: PendingRecordType
  discussion_status: DiscussionStatus
  created_by: string | null
  assigned_to: string | null
  images: string[]
  links: PendingPartLink[]
  rejection_reason: string | null
  created_at: string
  updated_at: string | null
  approved_at: string | null
  approved_by: string | null
  closed_at?: string | null
  closed_by?: string | null
  author_email?: string
  author_name?: string
  author_avatar?: string
  approver_name?: string
  assignee_name?: string
  assignee_email?: string
  project_name?: string | null
  project_number?: string | null
  comment_count?: number
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
  | 'project_name'
  | 'project_number'
  | 'comment_count'
  | 'closed_at'
  | 'closed_by'
  | 'item_type'
  | 'discussion_status'
>

export type PendingPartUpdate = Partial<
  Pick<PendingPart, 'name' | 'description' | 'category' | 'images' | 'links' | 'assigned_to' | 'priority' | 'project_id'>
>

export type PendingPartComment = {
  id: number
  pending_part_id: number
  user_id: string | null
  message: string
  images: string[]
  parent_id: number | null
  created_at: string
  author_email?: string
  author_name?: string
  author_avatar?: string
  replies?: PendingPartComment[]
}

export type Profile = {
  id: string
  full_name: string | null
  email: string | null
}

export type DiscussionInsert = {
  project_id?: number | null
  name: string
  description?: string | null
  priority?: PendingPartPriority
  images?: string[]
  links?: PendingPartLink[]
}

function buildCommentTree(flat: PendingPartComment[]): PendingPartComment[] {
  const map = new Map<number, PendingPartComment>()
  const roots: PendingPartComment[] = []

  flat.forEach((comment) => map.set(comment.id, { ...comment, replies: [] }))

  flat.forEach((comment) => {
    const node = map.get(comment.id)!
    if (comment.parent_id && map.has(comment.parent_id)) {
      map.get(comment.parent_id)!.replies!.push(node)
      return
    }
    roots.push(node)
  })

  return roots
}

async function enrichPendingParts(parts: any[]): Promise<PendingPart[]> {
  const allUserIds = [
    ...new Set(parts.flatMap((part: any) => [part.created_by, part.approved_by, part.assigned_to, part.closed_by]).filter(Boolean)),
  ] as string[]
  const projectIds = [...new Set(parts.map((part: any) => part.project_id).filter(Boolean))] as number[]

  const [profilesResult, projectsResult] = await Promise.all([
    allUserIds.length
      ? supabase.from('profiles').select('id, full_name, email').in('id', allUserIds)
      : Promise.resolve({ data: [] as any[] }),
    projectIds.length
      ? supabase.from('projects').select('id, project_name, project_number').in('id', projectIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const profilesMap: Record<string, any> = {}
  for (const profile of profilesResult.data || []) profilesMap[profile.id] = profile

  const projectsMap: Record<number, any> = {}
  for (const project of projectsResult.data || []) projectsMap[project.id] = project

  const { data: countsData } = await supabase
    .from('pending_part_comments')
    .select('pending_part_id')
    .in('pending_part_id', parts.map((part: any) => part.id))

  const countsMap = new Map<number, number>()
  for (const row of countsData || []) {
    countsMap.set(row.pending_part_id, (countsMap.get(row.pending_part_id) || 0) + 1)
  }

  return parts.map((item: any) => ({
    ...item,
    author_name: profilesMap[item.created_by]?.full_name,
    author_email: profilesMap[item.created_by]?.email,
    author_avatar: undefined,
    approver_name: profilesMap[item.approved_by]?.full_name,
    assignee_name: profilesMap[item.assigned_to]?.full_name,
    assignee_email: profilesMap[item.assigned_to]?.email,
    project_name: item.project_id ? projectsMap[item.project_id]?.project_name || null : null,
    project_number: item.project_id ? projectsMap[item.project_id]?.project_number || null : null,
    comment_count: countsMap.get(item.id) || 0,
    images: Array.isArray(item.images) ? item.images : [],
    links: Array.isArray(item.links) ? item.links : [],
    item_type: item.item_type || 'work_item',
    discussion_status: item.discussion_status || 'open',
  }))
}

export const pendingPartsApi = {
  getPendingParts: async (projectId: number): Promise<PendingPart[]> => {
    const { data: parts, error } = await supabase
      .from('pending_parts')
      .select('*')
      .eq('project_id', projectId)
      .eq('item_type', 'work_item')
      .order('created_at', { ascending: false })

    if (error) throw error
    return enrichPendingParts(parts || [])
  },

  getAllOpenWorkItems: async (): Promise<PendingPart[]> => {
    const { data: parts, error } = await supabase
      .from('pending_parts')
      .select('*')
      .eq('item_type', 'work_item')
      .eq('status', 'Pending')
      .order('priority', { ascending: true })
      .order('updated_at', { ascending: false, nullsFirst: false })

    if (error) throw error
    return enrichPendingParts(parts || [])
  },

  getDiscussions: async (includeClosed = false): Promise<PendingPart[]> => {
    let query = supabase
      .from('pending_parts')
      .select('*')
      .eq('item_type', 'discussion')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (!includeClosed) {
      query = query.eq('discussion_status', 'open')
    }

    const { data, error } = await query
    if (error) throw error
    return enrichPendingParts(data || [])
  },

  createPendingPart: async (partData: PendingPartInsert): Promise<PendingPart> => {
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      ...partData,
      item_type: 'work_item' as const,
      discussion_status: 'open' as const,
      created_by: user?.id,
    }

    const { data, error } = await supabase
      .from('pending_parts')
      .insert([payload])
      .select('*')
      .single()

    if (error) throw error
    return (await enrichPendingParts([data]))[0]
  },

  createDiscussion: async (discussion: DiscussionInsert): Promise<PendingPart> => {
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      project_id: discussion.project_id ?? null,
      name: discussion.name,
      description: discussion.description ?? null,
      category: 'general_discussion',
      status: 'Pending' as const,
      priority: discussion.priority || 'Medium',
      images: discussion.images || [],
      links: discussion.links || [],
      created_by: user?.id,
      assigned_to: null,
      item_type: 'discussion' as const,
      discussion_status: 'open' as const,
    }

    const { data, error } = await supabase
      .from('pending_parts')
      .insert([payload])
      .select('*')
      .single()

    if (error) throw error
    return (await enrichPendingParts([data]))[0]
  },

  updatePendingPart: async (id: number, updates: PendingPartUpdate): Promise<PendingPart> => {
    const { data, error } = await supabase
      .from('pending_parts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return (await enrichPendingParts([data]))[0]
  },

  assignPendingPart: async (id: number, userId: string | null): Promise<void> => {
    const { error } = await supabase
      .from('pending_parts')
      .update({ assigned_to: userId, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

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

    if (status === 'Rejected' && rejectionReason) payload.rejection_reason = rejectionReason

    const { data, error } = await supabase
      .from('pending_parts')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return (await enrichPendingParts([data]))[0]
  },

  updateDiscussionStatus: async (id: number, discussionStatus: DiscussionStatus): Promise<PendingPart> => {
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      discussion_status: discussionStatus,
      closed_at: discussionStatus === 'closed' ? new Date().toISOString() : null,
      closed_by: discussionStatus === 'closed' ? user?.id || null : null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('pending_parts')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return (await enrichPendingParts([data]))[0]
  },

  getProfiles: async (): Promise<Profile[]> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name', { ascending: true })

    if (error) throw error
    return (data || []) as Profile[]
  },

  getComments: async (pendingPartId: number): Promise<PendingPartComment[]> => {
    const { data: comments, error } = await supabase
      .from('pending_part_comments')
      .select('*')
      .eq('pending_part_id', pendingPartId)
      .order('created_at', { ascending: true })

    if (error) throw error

    const userIds = [...new Set((comments || []).map((comment: any) => comment.user_id).filter(Boolean))] as string[]
    const profilesMap: Record<string, any> = {}

    if (userIds.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (profilesData) {
        profilesData.forEach((profile: any) => {
          profilesMap[profile.id] = profile
        })
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

    await supabase
      .from('pending_parts')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', pendingPartId)

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

    await supabase.from('pending_parts').delete().eq('id', id).throwOnError()

    if (relativePaths.length > 0) {
      const { error: storageError } = await supabase.storage.from('bom_assets').remove(relativePaths)
      if (storageError) {
        console.warn('Storage cleanup failed (non-blocking):', storageError)
      }
    }
  },
}

export default pendingPartsApi
