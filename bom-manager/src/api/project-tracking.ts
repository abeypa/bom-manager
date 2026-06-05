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
    }
  })
}

export const projectTrackingApi = {
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
}
