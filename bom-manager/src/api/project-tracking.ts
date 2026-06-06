import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type PendingPartRow = Database['public']['Tables']['pending_parts']['Row']
type SupplierAssignmentRow = Database['public']['Tables']['supplier_assignments']['Row']
type WorkItemUpdateRow = Database['public']['Tables']['work_item_updates']['Row']

export type TrackingProjectSummary = {
  project_id: number
  project_name: string
  project_number: string
  status: string
  total_work_items: number
  blocked_work_items: number
  overdue_work_items: number
  open_supplier_assignments: number
}

export type TrackingSupplierAssignment = SupplierAssignmentRow & {
  supplier_name: string
  project_name: string
  project_number: string
  section_name: string | null
  subsection_name: string | null
  assigned_user_name: string | null
  assigned_user_email: string | null
}

export type TrackingWorkItem = PendingPartRow & {
  project_name: string | null
  project_number: string | null
  supplier_name: string | null
  section_name: string | null
  subsection_name: string | null
  assigned_user_name: string | null
  assigned_user_email: string | null
}

export type TrackingRecentUpdate = WorkItemUpdateRow & {
  images: string[]
  work_item_name: string
  project_id: number | null
  project_name: string | null
  supplier_name: string | null
  user_name: string | null
  user_email: string | null
}

export type ProjectTrackingDashboard = {
  summaries: TrackingProjectSummary[]
  my_assignments: TrackingSupplierAssignment[]
  overdue_assignments: TrackingSupplierAssignment[]
  blocked_work_items: TrackingWorkItem[]
  recent_updates: TrackingRecentUpdate[]
}

export type TrackingWorkItemFilter = {
  projectId?: number
  assignedTo?: string
  overdueOnly?: boolean
}

export type TrackingAssignmentFilter = {
  projectId?: number
  assignedUserId?: string
  overdueOnly?: boolean
}

export type TrackingProjectLookup = {
  id: number
  project_name: string
  project_number: string
}

export type TrackingSectionLookup = {
  id: number
  project_id: number
  name: string
}

export type TrackingSubsectionLookup = {
  id: number
  project_id: number
  section_id: number | null
  section_name: string
}

export type TrackingSupplierLookup = {
  id: number
  name: string
}

export type TrackingProfileLookup = {
  id: string
  full_name: string | null
  email: string | null
}

export type TrackingLookupBundle = {
  projects: TrackingProjectLookup[]
  suppliers: TrackingSupplierLookup[]
  profiles: TrackingProfileLookup[]
}

export type SupplierAssignmentInsert = Database['public']['Tables']['supplier_assignments']['Insert']
export type SupplierAssignmentUpdate = Database['public']['Tables']['supplier_assignments']['Update']
export type WorkItemUpdateInsert = Database['public']['Tables']['work_item_updates']['Insert']

const enrichWorkItems = async (items: PendingPartRow[]): Promise<TrackingWorkItem[]> => {
  const projectIds = Array.from(new Set(items.map((item) => item.project_id).filter(Boolean))) as number[]
  const supplierIds = Array.from(new Set(items.map((item) => item.supplier_id).filter(Boolean))) as number[]
  const sectionIds = Array.from(new Set(items.map((item) => item.section_id).filter(Boolean))) as number[]
  const subsectionIds = Array.from(new Set(items.map((item) => item.subsection_id).filter(Boolean))) as number[]
  const userIds = Array.from(new Set(items.map((item) => item.assigned_to).filter(Boolean))) as string[]

  const [projectsResult, suppliersResult, sectionsResult, subsectionsResult, profilesResult] = await Promise.all([
    projectIds.length ? supabase.from('projects').select('id, project_name, project_number').in('id', projectIds) : Promise.resolve({ data: [] as any[] }),
    supplierIds.length ? supabase.from('suppliers').select('id, name').in('id', supplierIds) : Promise.resolve({ data: [] as any[] }),
    sectionIds.length ? supabase.from('project_sections').select('id, name').in('id', sectionIds) : Promise.resolve({ data: [] as any[] }),
    subsectionIds.length ? supabase.from('project_subsections').select('id, section_name').in('id', subsectionIds) : Promise.resolve({ data: [] as any[] }),
    userIds.length ? supabase.from('profiles').select('id, full_name, email').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
  ])

  const projectMap = new Map<number, any>((projectsResult.data || []).map((row: any) => [row.id, row]))
  const supplierMap = new Map<number, any>((suppliersResult.data || []).map((row: any) => [row.id, row]))
  const sectionMap = new Map<number, any>((sectionsResult.data || []).map((row: any) => [row.id, row]))
  const subsectionMap = new Map<number, any>((subsectionsResult.data || []).map((row: any) => [row.id, row]))
  const profileMap = new Map<string, any>((profilesResult.data || []).map((row: any) => [row.id, row]))

  return items.map((item) => ({
    ...item,
    project_name: item.project_id ? projectMap.get(item.project_id)?.project_name || null : null,
    project_number: item.project_id ? projectMap.get(item.project_id)?.project_number || null : null,
    supplier_name: item.supplier_id ? supplierMap.get(item.supplier_id)?.name || null : null,
    section_name: item.section_id ? sectionMap.get(item.section_id)?.name || null : null,
    subsection_name: item.subsection_id ? subsectionMap.get(item.subsection_id)?.section_name || null : null,
    assigned_user_name: item.assigned_to ? profileMap.get(item.assigned_to)?.full_name || null : null,
    assigned_user_email: item.assigned_to ? profileMap.get(item.assigned_to)?.email || null : null,
  }))
}

const enrichAssignments = async (assignments: SupplierAssignmentRow[]): Promise<TrackingSupplierAssignment[]> => {
  const projectIds = Array.from(new Set(assignments.map((item) => item.project_id))) as number[]
  const supplierIds = Array.from(new Set(assignments.map((item) => item.supplier_id))) as number[]
  const sectionIds = Array.from(new Set(assignments.map((item) => item.section_id).filter(Boolean))) as number[]
  const subsectionIds = Array.from(new Set(assignments.map((item) => item.subsection_id).filter(Boolean))) as number[]
  const userIds = Array.from(new Set(assignments.map((item) => item.assigned_user_id).filter(Boolean))) as string[]

  const [projectsResult, suppliersResult, sectionsResult, subsectionsResult, profilesResult] = await Promise.all([
    projectIds.length ? supabase.from('projects').select('id, project_name, project_number').in('id', projectIds) : Promise.resolve({ data: [] as any[] }),
    supplierIds.length ? supabase.from('suppliers').select('id, name').in('id', supplierIds) : Promise.resolve({ data: [] as any[] }),
    sectionIds.length ? supabase.from('project_sections').select('id, name').in('id', sectionIds) : Promise.resolve({ data: [] as any[] }),
    subsectionIds.length ? supabase.from('project_subsections').select('id, section_name').in('id', subsectionIds) : Promise.resolve({ data: [] as any[] }),
    userIds.length ? supabase.from('profiles').select('id, full_name, email').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
  ])

  const projectMap = new Map<number, any>((projectsResult.data || []).map((row: any) => [row.id, row]))
  const supplierMap = new Map<number, any>((suppliersResult.data || []).map((row: any) => [row.id, row]))
  const sectionMap = new Map<number, any>((sectionsResult.data || []).map((row: any) => [row.id, row]))
  const subsectionMap = new Map<number, any>((subsectionsResult.data || []).map((row: any) => [row.id, row]))
  const profileMap = new Map<string, any>((profilesResult.data || []).map((row: any) => [row.id, row]))

  return assignments.map((item) => ({
    ...item,
    supplier_name: supplierMap.get(item.supplier_id)?.name || `Supplier #${item.supplier_id}`,
    project_name: projectMap.get(item.project_id)?.project_name || `Project #${item.project_id}`,
    project_number: projectMap.get(item.project_id)?.project_number || `P-${item.project_id}`,
    section_name: item.section_id ? sectionMap.get(item.section_id)?.name || null : null,
    subsection_name: item.subsection_id ? subsectionMap.get(item.subsection_id)?.section_name || null : null,
    assigned_user_name: item.assigned_user_id ? profileMap.get(item.assigned_user_id)?.full_name || null : null,
    assigned_user_email: item.assigned_user_id ? profileMap.get(item.assigned_user_id)?.email || null : null,
  }))
}

const enrichUpdates = async (updates: WorkItemUpdateRow[]): Promise<TrackingRecentUpdate[]> => {
  const workItemIds = Array.from(new Set(updates.map((item) => item.work_item_id))) as number[]
  const userIds = Array.from(new Set(updates.map((item) => item.user_id).filter(Boolean))) as string[]

  const [{ data: workItems }, { data: profiles }] = await Promise.all([
    workItemIds.length
      ? supabase.from('pending_parts').select('id, name, project_id, supplier_id').in('id', workItemIds)
      : Promise.resolve({ data: [] as any[] }),
    userIds.length
      ? supabase.from('profiles').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const supplierIds = Array.from(new Set((workItems || []).map((item: any) => item.supplier_id).filter(Boolean))) as number[]
  const projectIds = Array.from(new Set((workItems || []).map((item: any) => item.project_id).filter(Boolean))) as number[]

  const [{ data: suppliers }, { data: projects }] = await Promise.all([
    supplierIds.length ? supabase.from('suppliers').select('id, name').in('id', supplierIds) : Promise.resolve({ data: [] as any[] }),
    projectIds.length ? supabase.from('projects').select('id, project_name').in('id', projectIds) : Promise.resolve({ data: [] as any[] }),
  ])

  const workItemMap = new Map<number, any>((workItems || []).map((row: any) => [row.id, row]))
  const profileMap = new Map<string, any>((profiles || []).map((row: any) => [row.id, row]))
  const supplierMap = new Map<number, any>((suppliers || []).map((row: any) => [row.id, row]))
  const projectMap = new Map<number, any>((projects || []).map((row: any) => [row.id, row]))

  return updates.map((item) => {
    const workItem = workItemMap.get(item.work_item_id)
    return {
      ...item,
      work_item_name: workItem?.name || `Work Item #${item.work_item_id}`,
      project_id: workItem?.project_id || null,
      project_name: workItem?.project_id ? projectMap.get(workItem.project_id)?.project_name || null : null,
      supplier_name: workItem?.supplier_id ? supplierMap.get(workItem.supplier_id)?.name || null : null,
      user_name: item.user_id ? profileMap.get(item.user_id)?.full_name || null : null,
      user_email: item.user_id ? profileMap.get(item.user_id)?.email || null : null,
      images: Array.isArray(item.images) ? item.images.filter((value): value is string => typeof value === 'string') : [],
    }
  })
}

export const projectTrackingApi = {
  getWorkItems: async (filters?: TrackingWorkItemFilter): Promise<TrackingWorkItem[]> => {
    let query = supabase
      .from('pending_parts')
      .select('*')
      .eq('item_type', 'work_item')
      .order('updated_at', { ascending: false, nullsFirst: false })

    if (filters?.projectId) query = query.eq('project_id', filters.projectId)
    if (filters?.assignedTo) query = query.eq('assigned_to', filters.assignedTo)
    if (filters?.overdueOnly) {
      const today = new Date().toISOString().slice(0, 10)
      query = query.lt('due_date', today).neq('status', 'Approved')
    }

    const { data, error } = await query
    if (error) throw error
    return enrichWorkItems((data || []) as PendingPartRow[])
  },

  getManufacturedPartWorkItems: async (assignedTo?: string): Promise<TrackingWorkItem[]> => {
    let query = supabase
      .from('pending_parts')
      .select('*')
      .eq('item_type', 'work_item')
      .in('category', ['mechanical_manufacture', 'electrical_manufacture'])
      .order('target_date', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false, nullsFirst: false })

    if (assignedTo) query = query.eq('assigned_to', assignedTo)

    const { data, error } = await query
    if (error) throw error
    return enrichWorkItems((data || []) as PendingPartRow[])
  },

  getSupplierAssignments: async (filters?: TrackingAssignmentFilter): Promise<TrackingSupplierAssignment[]> => {
    let query = supabase
      .from('supplier_assignments')
      .select('*')
      .order('target_date', { ascending: true, nullsFirst: false })

    if (filters?.projectId) query = query.eq('project_id', filters.projectId)
    if (filters?.assignedUserId) query = query.eq('assigned_user_id', filters.assignedUserId)
    if (filters?.overdueOnly) {
      const today = new Date().toISOString().slice(0, 10)
      query = query.lt('target_date', today).neq('current_status', 'closed')
    }

    const { data, error } = await query
    if (error) throw error
    return enrichAssignments((data || []) as SupplierAssignmentRow[])
  },

  getLookupBundle: async (): Promise<TrackingLookupBundle> => {
    const [projects, suppliers, profiles] = await Promise.all([
      supabase.from('projects').select('id, project_name, project_number').order('project_name', { ascending: true }),
      supabase.from('suppliers').select('id, name').order('name', { ascending: true }),
      supabase.from('profiles').select('id, full_name, email').order('full_name', { ascending: true }),
    ])

    if (projects.error) throw projects.error
    if (suppliers.error) throw suppliers.error
    if (profiles.error) throw profiles.error

    return {
      projects: (projects.data || []) as TrackingProjectLookup[],
      suppliers: (suppliers.data || []) as TrackingSupplierLookup[],
      profiles: (profiles.data || []) as TrackingProfileLookup[],
    }
  },

  getProjectContext: async (projectId: number): Promise<{ sections: TrackingSectionLookup[]; subsections: TrackingSubsectionLookup[] }> => {
    const [sections, subsections] = await Promise.all([
      supabase.from('project_sections').select('id, project_id, name').eq('project_id', projectId).order('order_index', { ascending: true }),
      supabase.from('project_subsections').select('id, project_id, section_id, section_name').eq('project_id', projectId).order('sort_order', { ascending: true }),
    ])

    if (sections.error) throw sections.error
    if (subsections.error) throw subsections.error

    return {
      sections: (sections.data || []) as TrackingSectionLookup[],
      subsections: (subsections.data || []) as TrackingSubsectionLookup[],
    }
  },

  getDashboard: async (userId: string, isAdmin: boolean): Promise<ProjectTrackingDashboard> => {
    const today = new Date().toISOString().slice(0, 10)

    const [projectsResult, workItemsResult, assignmentsResult, updatesResult] = await Promise.all([
      supabase
        .from('projects')
        .select('id, project_name, project_number, status')
        .neq('status', 'completed')
        .order('updated_date', { ascending: false, nullsFirst: false }),
      supabase
        .from('pending_parts')
        .select('*')
        .eq('item_type', 'work_item')
        .order('updated_at', { ascending: false, nullsFirst: false }),
      supabase
        .from('supplier_assignments')
        .select('*')
        .order('target_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('work_item_updates')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(12),
    ])

    if (projectsResult.error) throw projectsResult.error
    if (workItemsResult.error) throw workItemsResult.error
    if (assignmentsResult.error) throw assignmentsResult.error
    if (updatesResult.error) throw updatesResult.error

    const projects = projectsResult.data || []
    const workItems = (workItemsResult.data || []) as PendingPartRow[]
    const assignments = (assignmentsResult.data || []) as SupplierAssignmentRow[]
    const recentUpdates = (updatesResult.data || []) as WorkItemUpdateRow[]

    const summaries: TrackingProjectSummary[] = projects.map((project: any) => {
      const projectItems = workItems.filter((item) => item.project_id === project.id)
      const projectAssignments = assignments.filter((item) => item.project_id === project.id)
      return {
        project_id: project.id,
        project_name: project.project_name,
        project_number: project.project_number,
        status: project.status,
        total_work_items: projectItems.length,
        blocked_work_items: projectItems.filter((item) => item.status === 'Rejected' || !!item.blocker).length,
        overdue_work_items: projectItems.filter((item) => item.due_date && item.due_date < today && item.status !== 'Approved').length,
        open_supplier_assignments: projectAssignments.filter((item) => item.current_status !== 'closed').length,
      }
    })

    const myAssignmentsRaw = assignments.filter((item) => (isAdmin ? true : item.assigned_user_id === userId))
    const overdueAssignmentsRaw = assignments.filter((item) => item.target_date && item.target_date < today && item.current_status !== 'closed')
    const blockedItemsRaw = workItems
      .filter((item) => item.status !== 'Approved' && (!!item.blocker || item.risk_level === 'critical' || item.status === 'Rejected'))
      .slice(0, 12)

    return {
      summaries,
      my_assignments: await enrichAssignments(myAssignmentsRaw.slice(0, 12)),
      overdue_assignments: await enrichAssignments(overdueAssignmentsRaw.slice(0, 12)),
      blocked_work_items: await enrichWorkItems(blockedItemsRaw),
      recent_updates: await enrichUpdates(recentUpdates),
    }
  },

  createSupplierAssignment: async (payload: SupplierAssignmentInsert): Promise<SupplierAssignmentRow> => {
    const { data: auth } = await supabase.auth.getUser()
    const enrichedPayload = {
      ...payload,
      last_updated_by: auth.user?.id || null,
      last_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.from('supplier_assignments').insert([enrichedPayload]).select('*').single()
    if (error) throw error
    return data as SupplierAssignmentRow
  },

  updateSupplierAssignment: async (id: number, payload: SupplierAssignmentUpdate): Promise<SupplierAssignmentRow> => {
    const { data: auth } = await supabase.auth.getUser()
    const enrichedPayload = {
      ...payload,
      last_updated_by: auth.user?.id || null,
      last_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase.from('supplier_assignments').update(enrichedPayload).eq('id', id).select('*').single()
    if (error) throw error
    return data as SupplierAssignmentRow
  },

  createWorkItemUpdate: async (payload: WorkItemUpdateInsert): Promise<WorkItemUpdateRow> => {
    const { data: auth } = await supabase.auth.getUser()
    const finalPayload = {
      ...payload,
      user_id: auth.user?.id || payload.user_id || null,
    }

    const { data, error } = await supabase.from('work_item_updates').insert([finalPayload]).select('*').single()
    if (error) throw error

    const workItemPatch: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    if (payload.status !== undefined) workItemPatch.tracking_status = payload.status
    if (payload.progress_percent !== undefined) workItemPatch.progress_percent = payload.progress_percent
    if (payload.blocker !== undefined) workItemPatch.blocker = payload.blocker
    if (payload.next_step !== undefined) workItemPatch.next_action = payload.next_step
    if (payload.updated_delivery_date !== undefined) workItemPatch.target_date = payload.updated_delivery_date

    const { error: workItemError } = await supabase
      .from('pending_parts')
      .update(workItemPatch)
      .eq('id', payload.work_item_id)

    if (workItemError) throw workItemError

    return data as WorkItemUpdateRow
  },
}
