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

export type ManufacturedPartTrackingItem = TrackingWorkItem & {
  project_part_id: number
  part_id: number
  part_type: 'mechanical_manufacture' | 'electrical_manufacture'
  part_number: string
  required_quantity: number
  received_quantity: number
  remaining_quantity: number
  po_count: number
  is_received: boolean
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

const MANUFACTURED_PART_TYPES = ['mechanical_manufacture', 'electrical_manufacture'] as const
type ManufacturedPartType = (typeof MANUFACTURED_PART_TYPES)[number]

type ProjectPartRow = Database['public']['Tables']['project_parts']['Row']

type ManufacturedMasterPart = {
  id: number
  part_number: string
  description: string | null
  supplier_id: number | null
}

type ProjectPartContext = {
  projectPart: ProjectPartRow
  projectId: number
  sectionId: number | null
  sectionName: string | null
  subsectionId: number
  subsectionName: string | null
  projectName: string | null
  projectNumber: string | null
  masterPart: ManufacturedMasterPart | null
}

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

const syncManufacturedTrackingItems = async (projectId?: number): Promise<TrackingWorkItem[]> => {
  let subsectionsQuery = supabase
    .from('project_subsections')
    .select('id, project_id, section_id, section_name')
    .order('project_id', { ascending: true })
    .order('sort_order', { ascending: true, nullsFirst: false })

  if (projectId) subsectionsQuery = subsectionsQuery.eq('project_id', projectId)

  const { data: subsections, error: subsectionsError } = await subsectionsQuery
  if (subsectionsError) throw subsectionsError

  const subsectionRows = (subsections || []) as Array<{
    id: number
    project_id: number
    section_id: number | null
    section_name: string | null
  }>

  if (!subsectionRows.length) return []

  const subsectionIds = subsectionRows.map((row) => row.id)

  const { data: projectParts, error: projectPartsError } = await supabase
    .from('project_parts')
    .select('*')
    .in('project_section_id', subsectionIds)
    .in('part_type', [...MANUFACTURED_PART_TYPES])

  if (projectPartsError) throw projectPartsError

  const manufacturedProjectParts = (projectParts || []) as ProjectPartRow[]
  if (!manufacturedProjectParts.length) return []

  const projectIds = Array.from(new Set(subsectionRows.map((row) => row.project_id)))
  const sectionIds = Array.from(new Set(subsectionRows.map((row) => row.section_id).filter(Boolean))) as number[]
  const partIdsByType = manufacturedProjectParts.reduce<Record<ManufacturedPartType, number[]>>(
    (acc, part) => {
      const partType = part.part_type as ManufacturedPartType
      if (!acc[partType]) acc[partType] = []
      acc[partType].push(part.part_id)
      return acc
    },
    {
      mechanical_manufacture: [],
      electrical_manufacture: [],
    },
  )

  const [projectsResult, sectionsResult, mechPartsResult, elecPartsResult, poItemsResult, existingTrackingResult] = await Promise.all([
    supabase.from('projects').select('id, project_name, project_number').in('id', projectIds),
    sectionIds.length
      ? supabase.from('project_sections').select('id, name').in('id', sectionIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    partIdsByType.mechanical_manufacture.length
      ? supabase
          .from('mechanical_manufacture')
          .select('id, part_number, description, supplier_id')
          .in('id', Array.from(new Set(partIdsByType.mechanical_manufacture)))
      : Promise.resolve({ data: [] as any[], error: null }),
    partIdsByType.electrical_manufacture.length
      ? supabase
          .from('electrical_manufacture')
          .select('id, part_number, description, supplier_id')
          .in('id', Array.from(new Set(partIdsByType.electrical_manufacture)))
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase
      .from('purchase_order_items')
      .select('project_part_id, received_qty')
      .in('project_part_id', manufacturedProjectParts.map((part) => part.id)),
    supabase
      .from('pending_parts')
      .select('*')
      .eq('item_type', 'work_item')
      .in('project_part_id', manufacturedProjectParts.map((part) => part.id)),
  ])

  if (projectsResult.error) throw projectsResult.error
  if (sectionsResult.error) throw sectionsResult.error
  if (mechPartsResult.error) throw mechPartsResult.error
  if (elecPartsResult.error) throw elecPartsResult.error
  if (poItemsResult.error) throw poItemsResult.error
  if (existingTrackingResult.error) throw existingTrackingResult.error

  const subsectionMap = new Map<number, (typeof subsectionRows)[number]>(subsectionRows.map((row) => [row.id, row]))
  const projectMap = new Map<number, any>((projectsResult.data || []).map((row: any) => [row.id, row]))
  const sectionMap = new Map<number, any>((sectionsResult.data || []).map((row: any) => [row.id, row]))
  const masterPartsMap: Record<ManufacturedPartType, Map<number, ManufacturedMasterPart>> = {
    mechanical_manufacture: new Map((mechPartsResult.data || []).map((row: any) => [row.id, row])),
    electrical_manufacture: new Map((elecPartsResult.data || []).map((row: any) => [row.id, row])),
  }

  const poReceivedMap = new Map<number, number>()
  const poCountMap = new Map<number, number>()
  for (const row of (poItemsResult.data || []) as Array<{ project_part_id: number | null; received_qty?: number | null }>) {
    if (!row.project_part_id) continue
    poReceivedMap.set(row.project_part_id, (poReceivedMap.get(row.project_part_id) || 0) + Number(row.received_qty || 0))
    poCountMap.set(row.project_part_id, (poCountMap.get(row.project_part_id) || 0) + 1)
  }

  const existingTrackingMap = new Map<number, PendingPartRow>()
  for (const row of (existingTrackingResult.data || []) as PendingPartRow[]) {
    if (row.project_part_id) existingTrackingMap.set(row.project_part_id, row)
  }

  const contexts: ProjectPartContext[] = manufacturedProjectParts.map((projectPart) => {
    const subsection = subsectionMap.get(projectPart.project_section_id)
    const project = subsection ? projectMap.get(subsection.project_id) : null
    const section = subsection?.section_id ? sectionMap.get(subsection.section_id) : null
    return {
      projectPart,
      projectId: subsection?.project_id || projectId || 0,
      sectionId: subsection?.section_id || null,
      sectionName: section?.name || null,
      subsectionId: projectPart.project_section_id,
      subsectionName: subsection?.section_name || null,
      projectName: project?.project_name || null,
      projectNumber: project?.project_number || null,
      masterPart: masterPartsMap[projectPart.part_type as ManufacturedPartType]?.get(projectPart.part_id) || null,
    }
  })

  const inserts: Database['public']['Tables']['pending_parts']['Insert'][] = []
  const updates: Array<{ id: number; payload: Database['public']['Tables']['pending_parts']['Update'] }> = []
  const now = new Date().toISOString()

  for (const context of contexts) {
    const existing = existingTrackingMap.get(context.projectPart.id)
    const master = context.masterPart
    const requiredQty = Number(context.projectPart.quantity || 0)
    const receivedQty = Number(poReceivedMap.get(context.projectPart.id) || 0)
    const receiptProgress = requiredQty > 0 ? Math.min(100, Math.round((receivedQty / requiredQty) * 100)) : 0
    const isReceived = requiredQty > 0 && receivedQty >= requiredQty
    const trackingStatus = isReceived ? 'closed' : existing?.tracking_status || 'not_started'
    const status = isReceived ? 'Approved' : existing?.status || 'Pending'
    const progressPercent = isReceived ? 100 : Math.max(existing?.progress_percent || 0, receiptProgress)
    const normalizedName = master?.part_number || existing?.name || `Manufactured Part #${context.projectPart.id}`
    const normalizedDescription = master?.description || existing?.description || null

    const payload: Database['public']['Tables']['pending_parts']['Update'] = {
      project_id: context.projectId || null,
      project_part_id: context.projectPart.id,
      section_id: context.sectionId,
      subsection_id: context.subsectionId,
      supplier_id: master?.supplier_id || null,
      name: normalizedName,
      description: normalizedDescription,
      category: context.projectPart.part_type,
      status,
      progress_percent: progressPercent,
      tracking_status: trackingStatus,
      updated_at: now,
      closed_at: isReceived ? existing?.closed_at || now : null,
      closed_by: isReceived ? existing?.closed_by || null : null,
    }

    if (!existing) {
      inserts.push({
        ...payload,
        priority: 'Medium',
        item_type: 'work_item',
        discussion_status: 'open',
        due_date: null,
        target_date: null,
        next_action: null,
        blocker: null,
        risk_level: 'normal',
        images: [],
        links: [],
      } as Database['public']['Tables']['pending_parts']['Insert'])
      continue
    }

    updates.push({ id: existing.id, payload })
  }

  if (inserts.length) {
    const { error } = await supabase.from('pending_parts').insert(inserts)
    if (error) throw error
  }

  if (updates.length) {
    await Promise.all(
      updates.map(({ id, payload }) =>
        supabase.from('pending_parts').update(payload).eq('id', id).throwOnError()
      ),
    )
  }

  let finalQuery = supabase
    .from('pending_parts')
    .select('*')
    .eq('item_type', 'work_item')
    .in('project_part_id', manufacturedProjectParts.map((part) => part.id))
    .order('target_date', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false, nullsFirst: false })

  if (projectId) finalQuery = finalQuery.eq('project_id', projectId)

  const { data: syncedRows, error: syncedRowsError } = await finalQuery
  if (syncedRowsError) throw syncedRowsError

  return enrichWorkItems((syncedRows || []) as PendingPartRow[])
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

  getManufacturedPartWorkItems: async (assignedTo?: string): Promise<ManufacturedPartTrackingItem[]> => {
    let items = await syncManufacturedTrackingItems()
    if (assignedTo) items = items.filter((item) => item.assigned_to === assignedTo)
    const projectIds = Array.from(new Set(items.map((item) => item.project_id).filter(Boolean))) as number[]
    if (!projectIds.length) return []

    const projectScopedResults = await Promise.all(projectIds.map((currentProjectId) => projectTrackingApi.getProjectManufacturedPartTracking(currentProjectId)))
    return projectScopedResults.flat().filter((item) => !assignedTo || item.assigned_to === assignedTo)
  },

  getProjectManufacturedPartTracking: async (projectId: number): Promise<ManufacturedPartTrackingItem[]> => {
    const items = await syncManufacturedTrackingItems(projectId)
    const projectPartIds = items.map((item) => item.project_part_id).filter(Boolean) as number[]
    if (!projectPartIds.length) return []

    const [{ data: projectParts }, { data: poItems }] = await Promise.all([
      supabase
        .from('project_parts')
        .select('id, part_type, part_id, quantity')
        .in('id', projectPartIds),
      supabase
        .from('purchase_order_items')
        .select('project_part_id, received_qty')
        .in('project_part_id', projectPartIds),
    ])

    const projectPartMap = new Map<number, any>((projectParts || []).map((row: any) => [row.id, row]))
    const receiptMap = new Map<number, { received: number; count: number }>()
    for (const row of (poItems || []) as Array<{ project_part_id: number | null; received_qty?: number | null }>) {
      if (!row.project_part_id) continue
      const existing = receiptMap.get(row.project_part_id) || { received: 0, count: 0 }
      existing.received += Number(row.received_qty || 0)
      existing.count += 1
      receiptMap.set(row.project_part_id, existing)
    }

    return items.map((item) => {
      const linkedProjectPartId = item.project_part_id as number
      const projectPart = projectPartMap.get(linkedProjectPartId)
      const receipt = receiptMap.get(linkedProjectPartId) || { received: 0, count: 0 }
      const requiredQuantity = Number(projectPart?.quantity || 0)
      const receivedQuantity = receipt.received
      return {
        ...item,
        project_part_id: linkedProjectPartId,
        part_id: Number(projectPart?.part_id || 0),
        part_type: (projectPart?.part_type || item.category || 'mechanical_manufacture') as ManufacturedPartType,
        part_number: item.name,
        required_quantity: requiredQuantity,
        received_quantity: receivedQuantity,
        remaining_quantity: Math.max(0, requiredQuantity - receivedQuantity),
        po_count: receipt.count,
        is_received: requiredQuantity > 0 && receivedQuantity >= requiredQuantity,
      }
    })
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
