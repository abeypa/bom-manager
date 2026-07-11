import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type IssueRow = Database['public']['Tables']['issues']['Row']
export type IssueInsert = Database['public']['Tables']['issues']['Insert']
export type IssueUpdate = Database['public']['Tables']['issues']['Update']
export type IssueCommentRow = Database['public']['Tables']['issue_comments']['Row']
export type IssueCommentInsert = Database['public']['Tables']['issue_comments']['Insert']

export type IssueCategory = IssueRow['category']
export type IssueSeverity = IssueRow['severity']
export type IssueStatus = IssueRow['status']

export const ISSUE_CATEGORIES: IssueCategory[] = ['delivery', 'quality', 'design', 'supplier', 'commercial', 'other']
export const ISSUE_SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high', 'critical']
export const ISSUE_STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved', 'closed']

export type EnrichedIssue = IssueRow & {
  project_name: string | null
  project_number: string | null
  po_number: string | null
  po_supplier_name: string | null
  part_number: string | null
  assignee_name: string | null
  assignee_email: string | null
  creator_name: string | null
  comment_count: number
}

export type EnrichedIssueComment = IssueCommentRow & {
  images: string[]
  user_name: string | null
  user_email: string | null
}

export type IssueFilter = {
  projectId?: number
  purchaseOrderId?: number
  status?: IssueStatus
  severity?: IssueSeverity
  category?: IssueCategory
  assignedTo?: string
  openOnly?: boolean
}

export type IssueOpenCounts = {
  byProject: Map<number, number>
  byPurchaseOrder: Map<number, number>
  total: number
}

const OPEN_STATUSES: IssueStatus[] = ['open', 'in_progress']

const enrichIssues = async (issues: IssueRow[]): Promise<EnrichedIssue[]> => {
  const projectIds = Array.from(new Set(issues.map((item) => item.project_id).filter(Boolean))) as number[]
  const poIds = Array.from(new Set(issues.map((item) => item.purchase_order_id).filter(Boolean))) as number[]
  const projectPartIds = Array.from(new Set(issues.map((item) => item.project_part_id).filter(Boolean))) as number[]
  const userIds = Array.from(
    new Set(issues.flatMap((item) => [item.assigned_to, item.created_by]).filter(Boolean)),
  ) as string[]
  const issueIds = issues.map((item) => item.id)

  const [projectsResult, posResult, projectPartsResult, profilesResult, commentsResult] = await Promise.all([
    projectIds.length ? supabase.from('projects').select('id, project_name, project_number').in('id', projectIds) : Promise.resolve({ data: [] as any[] }),
    poIds.length ? supabase.from('purchase_orders').select('id, po_number, supplier_id, suppliers(name)').in('id', poIds) : Promise.resolve({ data: [] as any[] }),
    projectPartIds.length ? supabase.from('project_parts').select('id, part_type, part_id').in('id', projectPartIds) : Promise.resolve({ data: [] as any[] }),
    userIds.length ? supabase.from('profiles').select('id, full_name, email').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
    issueIds.length ? supabase.from('issue_comments').select('issue_id').in('issue_id', issueIds) : Promise.resolve({ data: [] as any[] }),
  ])

  // Resolve part numbers from the polymorphic master tables
  const projectParts = (projectPartsResult.data || []) as Array<{ id: number; part_type: string; part_id: number }>
  const partIdsByType = new Map<string, number[]>()
  for (const part of projectParts) {
    const list = partIdsByType.get(part.part_type) || []
    list.push(part.part_id)
    partIdsByType.set(part.part_type, list)
  }

  const masterPartLookups = await Promise.all(
    Array.from(partIdsByType.entries()).map(async ([table, ids]) => {
      const { data } = await supabase.from(table as any).select('id, part_number').in('id', Array.from(new Set(ids)))
      return { table, rows: (data || []) as Array<{ id: number; part_number: string }> }
    }),
  )

  const masterPartMap = new Map<string, string>()
  for (const lookup of masterPartLookups) {
    for (const row of lookup.rows) masterPartMap.set(`${lookup.table}:${row.id}`, row.part_number)
  }

  const projectMap = new Map<number, any>((projectsResult.data || []).map((row: any) => [row.id, row]))
  const poMap = new Map<number, any>((posResult.data || []).map((row: any) => [row.id, row]))
  const projectPartMap = new Map<number, any>(projectParts.map((row) => [row.id, row]))
  const profileMap = new Map<string, any>((profilesResult.data || []).map((row: any) => [row.id, row]))

  const commentCountMap = new Map<number, number>()
  for (const row of (commentsResult.data || []) as Array<{ issue_id: number }>) {
    commentCountMap.set(row.issue_id, (commentCountMap.get(row.issue_id) || 0) + 1)
  }

  return issues.map((item) => {
    const projectPart = item.project_part_id ? projectPartMap.get(item.project_part_id) : null
    const po = item.purchase_order_id ? poMap.get(item.purchase_order_id) : null
    return {
      ...item,
      project_name: item.project_id ? projectMap.get(item.project_id)?.project_name || null : null,
      project_number: item.project_id ? projectMap.get(item.project_id)?.project_number || null : null,
      po_number: po?.po_number || null,
      po_supplier_name: po?.suppliers?.name || null,
      part_number: projectPart ? masterPartMap.get(`${projectPart.part_type}:${projectPart.part_id}`) || null : null,
      assignee_name: item.assigned_to ? profileMap.get(item.assigned_to)?.full_name || null : null,
      assignee_email: item.assigned_to ? profileMap.get(item.assigned_to)?.email || null : null,
      creator_name: item.created_by ? profileMap.get(item.created_by)?.full_name || null : null,
      comment_count: commentCountMap.get(item.id) || 0,
    }
  })
}

export const issuesApi = {
  getAll: async (filter?: IssueFilter): Promise<EnrichedIssue[]> => {
    let query = supabase
      .from('issues')
      .select('*')
      .order('created_at', { ascending: false })

    if (filter?.projectId) query = query.eq('project_id', filter.projectId)
    if (filter?.purchaseOrderId) query = query.eq('purchase_order_id', filter.purchaseOrderId)
    if (filter?.status) query = query.eq('status', filter.status)
    if (filter?.severity) query = query.eq('severity', filter.severity)
    if (filter?.category) query = query.eq('category', filter.category)
    if (filter?.assignedTo) query = query.eq('assigned_to', filter.assignedTo)
    if (filter?.openOnly) query = query.in('status', OPEN_STATUSES)

    const { data, error } = await query
    if (error) throw error
    return enrichIssues((data || []) as IssueRow[])
  },

  getOpenCounts: async (): Promise<IssueOpenCounts> => {
    const { data, error } = await supabase
      .from('issues')
      .select('id, project_id, purchase_order_id')
      .in('status', OPEN_STATUSES)

    if (error) throw error

    const byProject = new Map<number, number>()
    const byPurchaseOrder = new Map<number, number>()
    for (const row of (data || []) as Array<{ project_id: number | null; purchase_order_id: number | null }>) {
      if (row.project_id) byProject.set(row.project_id, (byProject.get(row.project_id) || 0) + 1)
      if (row.purchase_order_id) byPurchaseOrder.set(row.purchase_order_id, (byPurchaseOrder.get(row.purchase_order_id) || 0) + 1)
    }

    return { byProject, byPurchaseOrder, total: (data || []).length }
  },

  create: async (payload: IssueInsert): Promise<IssueRow> => {
    const { data: auth } = await supabase.auth.getUser()
    const enrichedPayload: IssueInsert = {
      ...payload,
      created_by: payload.created_by || auth.user?.id || null,
    }

    const { data, error } = await supabase.from('issues').insert([enrichedPayload]).select('*').single()
    if (error) throw error
    return data as IssueRow
  },

  update: async (id: number, payload: IssueUpdate): Promise<IssueRow> => {
    const { data: auth } = await supabase.auth.getUser()
    const now = new Date().toISOString()
    const enrichedPayload: IssueUpdate = {
      ...payload,
      updated_at: now,
    }

    if (payload.status === 'resolved' || payload.status === 'closed') {
      enrichedPayload.resolved_at = payload.resolved_at || now
      enrichedPayload.resolved_by = payload.resolved_by || auth.user?.id || null
    } else if (payload.status === 'open' || payload.status === 'in_progress') {
      enrichedPayload.resolved_at = null
      enrichedPayload.resolved_by = null
    }

    const { data, error } = await supabase.from('issues').update(enrichedPayload).eq('id', id).select('*').single()
    if (error) throw error
    return data as IssueRow
  },

  remove: async (id: number): Promise<void> => {
    const { error } = await supabase.from('issues').delete().eq('id', id)
    if (error) throw error
  },

  getComments: async (issueId: number): Promise<EnrichedIssueComment[]> => {
    const { data, error } = await supabase
      .from('issue_comments')
      .select('*')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: true })

    if (error) throw error

    const rows = (data || []) as IssueCommentRow[]
    const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))) as string[]
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
      : { data: [] as any[] }

    const profileMap = new Map<string, any>((profiles || []).map((row: any) => [row.id, row]))

    return rows.map((row) => ({
      ...row,
      images: Array.isArray(row.images) ? row.images.filter((value): value is string => typeof value === 'string') : [],
      user_name: row.user_id ? profileMap.get(row.user_id)?.full_name || null : null,
      user_email: row.user_id ? profileMap.get(row.user_id)?.email || null : null,
    }))
  },

  addComment: async (issueId: number, payload: { comment_text: string; images?: string[] }): Promise<IssueCommentRow> => {
    const { data: auth } = await supabase.auth.getUser()
    const insert: IssueCommentInsert = {
      issue_id: issueId,
      user_id: auth.user?.id || null,
      comment_text: payload.comment_text,
      images: payload.images || [],
    }

    const { data, error } = await supabase.from('issue_comments').insert([insert]).select('*').single()
    if (error) throw error

    await supabase.from('issues').update({ updated_at: new Date().toISOString() }).eq('id', issueId)

    return data as IssueCommentRow
  },
}

export default issuesApi
