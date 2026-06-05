import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Project = Database['public']['Tables']['projects']['Row']

type InsightSeverity = 'critical' | 'warning' | 'info' | 'success'

export interface DashboardStats {
  total_parts: number;
  mechanical_manufacture: number;
  mechanical_bought_out: number;
  electrical_manufacture: number;
  electrical_bought_out: number;
  pneumatic_bought_out: number;
  low_stock_alerts: number;
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  on_hold_projects: number;
  total_suppliers: number;
  pending_pos: number;
  total_pos: number;
}

export interface SmartDashboardInsight {
  id: string
  severity: InsightSeverity
  title: string
  message: string
  metric: string
  action_label: string
  to: string
}

export interface SmartProjectSignal {
  project_id: number
  project_name: string
  project_number: string
  status: string
  bom_value: number
  po_value: number
  gap_value: number
  po_count: number
  overdue_pos: number
  pending_parts: number
  health_score: number
  risk_reason: string
}

export interface SupplierFocusSignal {
  supplier_id: number | null
  supplier_name: string
  open_po_value: number
  open_po_count: number
  overdue_po_count: number
}

export interface WorkDashboardItem {
  id: number
  project_id: number | null
  project_name: string
  project_number: string
  name: string
  description: string | null
  status: 'Pending' | 'Approved' | 'Rejected'
  priority: 'Urgent' | 'High' | 'Medium' | 'Low'
  item_type?: 'work_item' | 'discussion'
  discussion_status?: 'open' | 'closed'
  assigned_to: string | null
  created_by: string | null
  assignee_name: string | null
  assignee_email: string | null
  requester_name: string | null
  requester_email: string | null
  updated_at: string | null
  created_at: string
  comment_count?: number
  tracking_status?: string | null
  risk_level?: 'low' | 'normal' | 'high' | 'critical'
  due_date?: string | null
  progress_percent?: number
  blocker?: string | null
  supplier_name?: string | null
}

export interface WorkDashboardProject {
  project_id: number
  project_name: string
  project_number: string
  status: string
  total_items: number
  open_items: number
  completed_items: number
  needs_rework_items: number
  my_open_items: number
  waiting_on_me_count: number
  completion_percent: number
  last_activity_at: string | null
}

export interface WorkDashboardNotification {
  id: string
  kind: 'assignment' | 'mention' | 'overdue' | 'supplier_followup'
  project_id: number
  work_item_id: number
  project_name: string
  project_number: string
  work_item_name: string
  created_at: string
  message: string
  from_name: string | null
  from_email: string | null
  priority: 'Urgent' | 'High' | 'Medium' | 'Low'
}

export interface WorkDashboardWorkload {
  user_id: string
  name: string
  email: string | null
  open_items: number
  urgent_items: number
}

export interface WorkDashboardData {
  counts: {
    total_projects: number
    total_open_items: number
    my_open_items: number
    completed_items: number
    waiting_on_me: number
    open_discussions: number
    closed_discussions: number
    overdue_items: number
    blocked_items: number
    overdue_supplier_assignments: number
  }
  my_work_items: WorkDashboardItem[]
  admin_open_work_items: WorkDashboardItem[]
  open_discussions: WorkDashboardItem[]
  closed_discussions: WorkDashboardItem[]
  active_projects: WorkDashboardProject[]
  notifications: WorkDashboardNotification[]
  workload: WorkDashboardWorkload[]
}

export interface SmartDashboard {
  generated_at: string
  kpis: {
    open_po_value: number
    draft_po_value: number
    overdue_pos: number
    pending_procurement_parts: number
    bom_po_gap_value: number
    projects_at_risk: number
    bom_health_issues: number
    price_spikes: number
    duplicate_part_groups: number
    po_pdf_missing: number
  }
  insights: SmartDashboardInsight[]
  priority_projects: SmartProjectSignal[]
  supplier_focus: SupplierFocusSignal[]
}

const OPEN_PO_STATUSES = new Set(['Draft', 'Released', 'Pending', 'Sent', 'Confirmed', 'Partial'])
const PART_TABLES = [
  'mechanical_manufacture',
  'mechanical_bought_out',
  'electrical_manufacture',
  'electrical_bought_out',
  'pneumatic_bought_out',
]
const BOUGHT_OUT_TABLES = new Set(['mechanical_bought_out', 'electrical_bought_out', 'pneumatic_bought_out'])

const calcLineValue = (row: any) => {
  const quantity = Number(row?.quantity || 0)
  const unitPrice = Number(row?.unit_price || 0)
  const discount = Number(row?.discount_percent || 0)
  return quantity * unitPrice * (1 - discount / 100)
}

const moneyMetric = (value: number) => {
  if (value >= 10000000) return `INR ${(value / 10000000).toFixed(1)}Cr`
  if (value >= 100000) return `INR ${(value / 100000).toFixed(1)}L`
  return `INR ${Math.round(value).toLocaleString('en-IN')}`
}

const getPercentChange = (oldPrice: any, newPrice: any) => {
  const oldValue = Number(oldPrice || 0)
  const newValue = Number(newPrice || 0)
  if (!oldValue || !Number.isFinite(oldValue) || !Number.isFinite(newValue)) return null
  return ((newValue - oldValue) / oldValue) * 100
}

const priorityWeight: Record<WorkDashboardItem['priority'], number> = {
  Urgent: 4,
  High: 3,
  Medium: 2,
  Low: 1,
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hasUserMention = (message: string | null | undefined, aliases: string[]) => {
  if (!message) return false
  return aliases.some((alias) => {
    const clean = alias.trim()
    if (!clean) return false
    const pattern = new RegExp(`(^|\\W)@${escapeRegExp(clean)}(?=\\s|$|[^\\w\\s])`, 'i')
    return pattern.test(message)
  })
}

export const dashboardApi = {
  // Main dashboard stats (uses the new RPC with robust fallback)
  getStats: async (): Promise<DashboardStats> => {
    try {
      const { data, error } = await supabase.rpc('get_dashboard_stats');
      if (error) throw error;
      return data as unknown as DashboardStats;
    } catch (err) {
      console.warn('RPC get_dashboard_stats failed, using fallback queries', err);

      // Fallback queries (safe if RPC is missing in some environments)
      const [
        { count: mm },
        { count: mbo },
        { count: em },
        { count: ebo },
        { count: pbo },
        { count: totalProjects },
        { count: pendingPOs },
      ] = await Promise.all([
        (supabase as any).from('mechanical_manufacture').select('*', { count: 'exact', head: true }),
        (supabase as any).from('mechanical_bought_out').select('*', { count: 'exact', head: true }),
        (supabase as any).from('electrical_manufacture').select('*', { count: 'exact', head: true }),
        (supabase as any).from('electrical_bought_out').select('*', { count: 'exact', head: true }),
        (supabase as any).from('pneumatic_bought_out').select('*', { count: 'exact', head: true }),
        (supabase as any).from('projects').select('*', { count: 'exact', head: true }),
        (supabase as any).from('purchase_orders').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
      ]);

      return {
        total_parts: (mm || 0) + (mbo || 0) + (em || 0) + (ebo || 0) + (pbo || 0),
        mechanical_manufacture: mm || 0,
        mechanical_bought_out: mbo || 0,
        electrical_manufacture: em || 0,
        electrical_bought_out: ebo || 0,
        pneumatic_bought_out: pbo || 0,
        low_stock_alerts: 0, // Fallback doesn't compute complex low stock yet
        total_projects: totalProjects || 0,
        active_projects: totalProjects || 0,
        completed_projects: 0,
        on_hold_projects: 0,
        total_suppliers: 0,
        pending_pos: pendingPOs || 0,
        total_pos: 0,
      };
    }
  },

  getRecentProjects: async (): Promise<Project[]> => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_date', { ascending: false })
      .limit(5)
      
    if (error) throw error
    return data as Project[]
  },

  getWorkDashboard: async (userId: string, isAdmin = false): Promise<WorkDashboardData> => {
    const { data: currentProfile } = await (supabase as any)
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', userId)
      .maybeSingle()

    const aliases = Array.from(new Set([
      currentProfile?.full_name,
      currentProfile?.email,
    ].filter(Boolean))) as string[]

    const { data: pendingParts, error: pendingPartsError } = await (supabase as any)
      .from('pending_parts')
      .select(`
        id,
        project_id,
        supplier_id,
        name,
        description,
        status,
        priority,
        item_type,
        discussion_status,
        created_by,
        assigned_to,
        created_at,
        updated_at,
        tracking_status,
        risk_level,
        due_date,
        progress_percent,
        blocker
      `)
      .order('updated_at', { ascending: false, nullsFirst: false })

    if (pendingPartsError) throw pendingPartsError

    const parts = pendingParts || []
    const projectIds = Array.from(new Set(parts.map((part: any) => part.project_id).filter(Boolean)))
    const supplierIds = Array.from(new Set(parts.map((part: any) => part.supplier_id).filter(Boolean)))
    const userIds = Array.from(new Set(
      parts.flatMap((part: any) => [part.created_by, part.assigned_to]).filter(Boolean)
    ))

    const [{ data: projectsData }, { data: profilesData }, { data: suppliersData }] = await Promise.all([
      projectIds.length
        ? (supabase as any)
            .from('projects')
            .select('id, project_name, project_number, status')
            .in('id', projectIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? (supabase as any)
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds)
        : Promise.resolve({ data: [] }),
      supplierIds.length
        ? (supabase as any)
            .from('suppliers')
            .select('id, name')
            .in('id', supplierIds)
        : Promise.resolve({ data: [] }),
    ])

    const profilesMap = new Map<string, { full_name: string | null; email: string | null }>()
    for (const profile of profilesData || []) {
      profilesMap.set(profile.id, { full_name: profile.full_name, email: profile.email })
    }

    const projectsMap = new Map<number, { project_name: string; project_number: string; status: string }>()
    for (const project of projectsData || []) {
      projectsMap.set(project.id, {
        project_name: project.project_name,
        project_number: project.project_number,
        status: project.status,
      })
    }
    const suppliersMap = new Map<number, { name: string }>()
    for (const supplier of suppliersData || []) {
      suppliersMap.set(supplier.id, { name: supplier.name })
    }

    const items: WorkDashboardItem[] = parts.map((part: any) => {
      const project = projectsMap.get(part.project_id)
      const assignee = part.assigned_to ? profilesMap.get(part.assigned_to) : null
      const requester = part.created_by ? profilesMap.get(part.created_by) : null

      return {
        id: part.id,
        project_id: part.project_id,
        project_name: project?.project_name || `Project #${part.project_id}`,
        project_number: project?.project_number || (part.project_id ? `P-${part.project_id}` : 'GENERAL'),
        name: part.name,
        description: part.description,
        status: part.status,
        priority: part.priority || 'Medium',
        item_type: part.item_type || 'work_item',
        discussion_status: part.discussion_status || 'open',
        assigned_to: part.assigned_to,
        created_by: part.created_by,
        assignee_name: assignee?.full_name || null,
        assignee_email: assignee?.email || null,
        requester_name: requester?.full_name || null,
        requester_email: requester?.email || null,
        updated_at: part.updated_at,
        created_at: part.created_at,
        tracking_status: part.tracking_status || null,
        risk_level: part.risk_level || 'normal',
        due_date: part.due_date || null,
        progress_percent: part.progress_percent ?? 0,
        blocker: part.blocker || null,
        supplier_name: part.supplier_id ? suppliersMap.get(part.supplier_id)?.name || null : null,
      }
    })

    const today = new Date().toISOString().slice(0, 10)
    const { data: supplierAssignmentsData } = await (supabase as any)
      .from('supplier_assignments')
      .select('id, project_id, work_item_id, supplier_id, assigned_user_id, current_status, target_date, remarks, last_updated_at')
      .order('target_date', { ascending: true, nullsFirst: false })

    const overdueSupplierAssignments = (supplierAssignmentsData || []).filter((assignment: any) =>
      assignment.target_date && assignment.target_date < today && assignment.current_status !== 'closed'
    )

    const { data: commentsData } = await (supabase as any)
      .from('pending_part_comments')
      .select('id, pending_part_id, user_id, message, created_at')
      .order('created_at', { ascending: false })
      .limit(400)

    const comments = commentsData || []
    const commentAuthorIds = Array.from(new Set(comments.map((comment: any) => comment.user_id).filter(Boolean)))

    if (commentAuthorIds.length > 0) {
      const { data: commentProfiles } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, email')
        .in('id', commentAuthorIds)

      for (const profile of commentProfiles || []) {
        profilesMap.set(profile.id, { full_name: profile.full_name, email: profile.email })
      }
    }

    const itemMap = new Map<number, WorkDashboardItem>(items.map((item) => [item.id, item]))

    const mentionNotifications: WorkDashboardNotification[] = comments
      .filter((comment: any) => comment.user_id !== userId && hasUserMention(comment.message, aliases))
      .map((comment: any) => {
        const workItem = itemMap.get(comment.pending_part_id)
        if (!workItem) return null
        const author = comment.user_id ? profilesMap.get(comment.user_id) : null

        return {
          id: `mention-${comment.id}`,
          kind: 'mention' as const,
          project_id: workItem.project_id ?? 0,
          work_item_id: workItem.id,
          project_name: workItem.project_name,
          project_number: workItem.project_number,
          work_item_name: workItem.name,
          created_at: comment.created_at,
          message: comment.message || 'You were tagged in a work item discussion.',
          from_name: author?.full_name || null,
          from_email: author?.email || null,
          priority: workItem.priority,
        }
      })
      .filter(Boolean) as WorkDashboardNotification[]

    const workItems = items.filter((item) => item.item_type !== 'discussion')
    const discussions = items.filter((item) => item.item_type === 'discussion')

    const assignmentNotifications: WorkDashboardNotification[] = items
      .filter((item) => item.assigned_to === userId && item.status === 'Pending')
      .map((item) => ({
        id: `assignment-${item.id}`,
        kind: 'assignment' as const,
        project_id: item.project_id ?? 0,
        work_item_id: item.id,
        project_name: item.project_name,
        project_number: item.project_number,
        work_item_name: item.name,
        created_at: item.updated_at || item.created_at,
        message: item.description || 'This work item is assigned to you.',
        from_name: item.requester_name,
        from_email: item.requester_email,
        priority: item.priority,
      }))

    const overdueNotifications: WorkDashboardNotification[] = workItems
      .filter((item) => item.status === 'Pending' && item.due_date && item.due_date < today)
      .filter((item) => isAdmin || item.assigned_to === userId)
      .map((item) => ({
        id: `overdue-${item.id}`,
        kind: 'overdue' as const,
        project_id: item.project_id ?? 0,
        work_item_id: item.id,
        project_name: item.project_name,
        project_number: item.project_number,
        work_item_name: item.name,
        created_at: item.updated_at || item.created_at,
        message: item.blocker || `This work item is overdue since ${item.due_date}.`,
        from_name: item.assignee_name,
        from_email: item.assignee_email,
        priority: item.priority,
      }))

    const supplierFollowupNotifications: WorkDashboardNotification[] = overdueSupplierAssignments
      .filter((assignment: any) => isAdmin || assignment.assigned_user_id === userId)
      .map((assignment: any) => {
        const project = projectsMap.get(assignment.project_id)
        const supplier = assignment.supplier_id ? suppliersMap.get(assignment.supplier_id) : null
        return {
          id: `supplier-followup-${assignment.id}`,
          kind: 'supplier_followup' as const,
          project_id: assignment.project_id ?? 0,
          work_item_id: assignment.work_item_id ?? 0,
          project_name: project?.project_name || `Project #${assignment.project_id}`,
          project_number: project?.project_number || `P-${assignment.project_id}`,
          work_item_name: supplier?.name ? `Supplier follow-up: ${supplier.name}` : 'Supplier follow-up overdue',
          created_at: assignment.last_updated_at || new Date().toISOString(),
          message: assignment.remarks || `Supplier follow-up is overdue since ${assignment.target_date}.`,
          from_name: null,
          from_email: null,
          priority: 'High' as const,
        }
      })

    const activeProjects: WorkDashboardProject[] = Array.from(
      workItems.filter((item) => item.project_id != null).reduce((map, item) => {
        const projectId = item.project_id as number
        const existing = map.get(projectId) || {
          project_id: projectId,
          project_name: item.project_name,
          project_number: item.project_number,
          status: projectsMap.get(projectId)?.status || 'active',
          total_items: 0,
          open_items: 0,
          completed_items: 0,
          needs_rework_items: 0,
          my_open_items: 0,
          waiting_on_me_count: 0,
          completion_percent: 0,
          last_activity_at: null,
        }

        existing.total_items += 1
        if (item.status === 'Pending') existing.open_items += 1
        if (item.status === 'Approved') existing.completed_items += 1
        if (item.status === 'Rejected') existing.needs_rework_items += 1
        if (item.assigned_to === userId && item.status === 'Pending') existing.my_open_items += 1
        const activityAt = item.updated_at || item.created_at
        if (!existing.last_activity_at || activityAt > existing.last_activity_at) {
          existing.last_activity_at = activityAt
        }

        map.set(projectId, existing)
        return map
      }, new Map<number, WorkDashboardProject>()).values()
    ).map((project) => ({
      ...project,
      waiting_on_me_count: mentionNotifications.filter((note) => note.project_id === project.project_id).length,
      completion_percent: project.total_items
        ? Math.round((project.completed_items / project.total_items) * 100)
        : 0,
    }))

    const workload = Array.from(
      workItems
        .filter((item) => item.assigned_to && item.status === 'Pending')
        .reduce((map, item) => {
          const id = item.assigned_to as string
          const existing = map.get(id) || {
            user_id: id,
            name: item.assignee_name || item.assignee_email || 'Unassigned',
            email: item.assignee_email,
            open_items: 0,
            urgent_items: 0,
          }
          existing.open_items += 1
          if (item.priority === 'Urgent') existing.urgent_items += 1
          map.set(id, existing)
          return map
        }, new Map<string, WorkDashboardWorkload>())
        .values()
    ).sort((a, b) => b.open_items - a.open_items || b.urgent_items - a.urgent_items)

    const myWorkItems = workItems
      .filter((item) => item.assigned_to === userId)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'Pending' ? -1 : 1
        if (priorityWeight[a.priority] !== priorityWeight[b.priority]) {
          return priorityWeight[b.priority] - priorityWeight[a.priority]
        }
        return String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))
      })

    const adminOpenWorkItems = workItems
      .filter((item) => item.status === 'Pending')
      .sort((a, b) => {
        if (priorityWeight[a.priority] !== priorityWeight[b.priority]) {
          return priorityWeight[b.priority] - priorityWeight[a.priority]
        }
        return String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))
      })

    const openDiscussions = discussions
      .filter((item) => item.discussion_status !== 'closed')
      .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))

    const closedDiscussions = discussions
      .filter((item) => item.discussion_status === 'closed')
      .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))

    const notifications = [...mentionNotifications, ...assignmentNotifications, ...overdueNotifications, ...supplierFollowupNotifications]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 10)

    const completedItems = workItems.filter((item) => item.status === 'Approved').length
    const openItems = workItems.filter((item) => item.status === 'Pending').length
    const overdueItems = workItems.filter((item) => item.status === 'Pending' && item.due_date && item.due_date < today).length
    const blockedItems = workItems.filter((item) => item.status !== 'Approved' && ((item.tracking_status || '') === 'blocked' || !!item.blocker || item.risk_level === 'critical')).length

    return {
      counts: {
        total_projects: activeProjects.length,
        total_open_items: openItems,
        my_open_items: myWorkItems.filter((item) => item.status === 'Pending').length,
        completed_items: completedItems,
        waiting_on_me: mentionNotifications.length,
        open_discussions: openDiscussions.length,
        closed_discussions: closedDiscussions.length,
        overdue_items: overdueItems,
        blocked_items: blockedItems,
        overdue_supplier_assignments: overdueSupplierAssignments.length,
      },
      my_work_items: myWorkItems,
      admin_open_work_items: isAdmin ? adminOpenWorkItems : [],
      open_discussions: openDiscussions,
      closed_discussions: closedDiscussions,
      active_projects: activeProjects.sort((a, b) => {
        if (a.my_open_items !== b.my_open_items) return b.my_open_items - a.my_open_items
        if (a.waiting_on_me_count !== b.waiting_on_me_count) return b.waiting_on_me_count - a.waiting_on_me_count
        return b.open_items - a.open_items
      }),
      notifications,
      workload: workload.slice(0, 6),
    }
  },

  getSmartDashboard: async (): Promise<SmartDashboard> => {
    const { data: projectsData, error: projectError } = await (supabase as any)
      .from('projects')
      .select('id, project_name, project_number, status, target_completion_date, created_date')
      .order('created_date', { ascending: false })

    if (projectError) throw projectError

    const projects = projectsData || []
    const projectIds = projects.map((p: any) => p.id)
    if (projectIds.length === 0) {
      return {
        generated_at: new Date().toISOString(),
        kpis: {
          open_po_value: 0,
          draft_po_value: 0,
          overdue_pos: 0,
          pending_procurement_parts: 0,
          bom_po_gap_value: 0,
          projects_at_risk: 0,
          bom_health_issues: 0,
          price_spikes: 0,
          duplicate_part_groups: 0,
          po_pdf_missing: 0,
        },
        insights: [{
          id: 'no-projects',
          severity: 'info',
          title: 'Project intelligence is waiting',
          message: 'Create or import a project to unlock BOM, PO, supplier, and delivery risk signals.',
          metric: '0 projects',
          action_label: 'Create Project',
          to: '/projects',
        }],
        priority_projects: [],
        supplier_focus: [],
      }
    }

    const [{ data: subsectionsData }, { data: purchaseOrdersData }] = await Promise.all([
      (supabase as any)
        .from('project_subsections')
        .select('id, project_id')
        .in('project_id', projectIds),
      (supabase as any)
        .from('purchase_orders')
        .select(`
          id,
          project_id,
          supplier_id,
          status,
          grand_total,
          po_date,
          expected_delivery_date,
          bep_po_pdf_url,
          suppliers (name)
        `)
        .in('project_id', projectIds),
    ])

    const subsections = subsectionsData || []
    const subsectionIds = subsections.map((s: any) => s.id)
    const subsectionToProject = new Map<number, number>(
      subsections.map((s: any) => [s.id, s.project_id])
    )

    let projectParts: any[] = []
    if (subsectionIds.length > 0) {
      const { data: partsData } = await (supabase as any)
        .from('project_parts')
        .select('id, project_section_id, part_type, part_id, quantity, unit_price, discount_percent')
        .in('project_section_id', subsectionIds)
      projectParts = partsData || []
    }

    const detailsByType: Record<string, Record<number, any>> = {}
    const idsByType: Record<string, number[]> = {}
    for (const part of projectParts) {
      if (!part.part_type || !part.part_id || !PART_TABLES.includes(part.part_type)) continue
      if (!idsByType[part.part_type]) idsByType[part.part_type] = []
      idsByType[part.part_type].push(part.part_id)
    }
    for (const [partType, ids] of Object.entries(idsByType)) {
      const uniqueIds = Array.from(new Set(ids))
      if (!uniqueIds.length) continue
      const { data } = await (supabase as any)
        .from(partType)
        .select('id, part_number, supplier_id, image_path, base_price')
        .in('id', uniqueIds)
      detailsByType[partType] = Object.fromEntries((data || []).map((row: any) => [row.id, row]))
    }

    let poItems: any[] = []
    const purchaseOrders = purchaseOrdersData || []
    const poIds = purchaseOrders.map((po: any) => po.id)
    if (poIds.length > 0) {
      const { data: poItemsData } = await (supabase as any)
        .from('purchase_order_items')
        .select('purchase_order_id, project_part_id')
        .in('purchase_order_id', poIds)
        .not('project_part_id', 'is', null)
      poItems = poItemsData || []
    }

    const orderedProjectPartIds = new Set(poItems.map((item: any) => item.project_part_id).filter(Boolean))
    const duplicateMap = new Map<string, number>()
    let missingImages = 0
    let missingSuppliers = 0
    let zeroPrices = 0
    for (const part of projectParts) {
      const projectIdForPart = subsectionToProject.get(part.project_section_id)
      const master = detailsByType[part.part_type]?.[part.part_id]
      if (projectIdForPart && part.part_type && part.part_id) {
        const key = `${projectIdForPart}:${part.part_type}:${part.part_id}`
        duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1)
      }
      if (BOUGHT_OUT_TABLES.has(part.part_type) && !master?.image_path) missingImages += 1
      if (!master?.supplier_id) missingSuppliers += 1
      if (Number(part.unit_price || 0) <= 0 || Number(master?.base_price || 0) <= 0) zeroPrices += 1
    }
    const duplicateGroups = Array.from(duplicateMap.values()).filter((count) => count > 1).length

    const recentPriceSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentPriceRows } = await (supabase as any)
      .from('part_price_history')
      .select('old_price, new_price, changed_at')
      .gte('changed_at', recentPriceSince)
      .order('changed_at', { ascending: false })
      .limit(300)
    const priceSpikes = (recentPriceRows || []).filter((row: any) => {
      const pct = getPercentChange(row.old_price, row.new_price)
      return pct != null && Math.abs(pct) >= 10
    }).length

    const today = new Date().toISOString().split('T')[0]
    const isOpenPO = (po: any) => OPEN_PO_STATUSES.has(po.status)
    const isOverdue = (po: any) => isOpenPO(po) && po.expected_delivery_date && po.expected_delivery_date < today

    const projectSignals: SmartProjectSignal[] = projects.map((project: any) => {
      const parts = projectParts.filter((part) => subsectionToProject.get(part.project_section_id) === project.id)
      const projectPOs = purchaseOrders.filter((po: any) => po.project_id === project.id)
      const openPOs = projectPOs.filter(isOpenPO)
      const overduePOs = projectPOs.filter(isOverdue)
      const bomValue = parts.reduce((sum, part) => sum + calcLineValue(part), 0)
      const poValue = projectPOs
        .filter((po: any) => po.status !== 'Cancelled')
        .reduce((sum: number, po: any) => sum + Number(po.grand_total || 0), 0)
      const pendingParts = parts.filter((part) => !orderedProjectPartIds.has(part.id)).length
      const gapValue = Math.max(0, bomValue - poValue)
      const pendingRatio = parts.length ? pendingParts / parts.length : 0
      const overduePenalty = overduePOs.length * 12
      const gapPenalty = bomValue > 0 ? Math.min(25, (gapValue / bomValue) * 25) : 0
      const healthScore = Math.max(0, Math.round(100 - pendingRatio * 35 - overduePenalty - gapPenalty))
      const riskReason = overduePOs.length > 0
        ? `${overduePOs.length} PO delivery ${overduePOs.length === 1 ? 'date is' : 'dates are'} overdue`
        : pendingParts > 0
          ? `${pendingParts} BOM ${pendingParts === 1 ? 'part is' : 'parts are'} not mapped to a PO`
          : gapValue > 0
            ? `${moneyMetric(gapValue)} BOM value is not covered by POs`
            : 'Procurement coverage looks healthy'

      return {
        project_id: project.id,
        project_name: project.project_name,
        project_number: project.project_number,
        status: project.status,
        bom_value: bomValue,
        po_value: poValue,
        gap_value: gapValue,
        po_count: openPOs.length,
        overdue_pos: overduePOs.length,
        pending_parts: pendingParts,
        health_score: healthScore,
        risk_reason: riskReason,
      }
    })

    const openPOs = purchaseOrders.filter(isOpenPO)
    const draftPOs = purchaseOrders.filter((po: any) => po.status === 'Draft')
    const overduePOs = purchaseOrders.filter(isOverdue)
    const pendingParts = projectSignals.reduce((sum, p) => sum + p.pending_parts, 0)
    const bomPoGap = projectSignals.reduce((sum, p) => sum + p.gap_value, 0)
    const projectsAtRisk = projectSignals.filter((p) => p.health_score < 70 || p.overdue_pos > 0 || p.pending_parts > 0).length
    const missingPoPdfCount = purchaseOrders.filter((po: any) => !po.bep_po_pdf_url).length
    const bomHealthIssues = missingImages + missingSuppliers + zeroPrices + duplicateGroups + pendingParts + missingPoPdfCount

    const supplierMap = new Map<string, SupplierFocusSignal>()
    for (const po of openPOs) {
      const key = String(po.supplier_id || po.suppliers?.name || 'unknown')
      const current = supplierMap.get(key) || {
        supplier_id: po.supplier_id || null,
        supplier_name: po.suppliers?.name || 'Unassigned supplier',
        open_po_value: 0,
        open_po_count: 0,
        overdue_po_count: 0,
      }
      current.open_po_value += Number(po.grand_total || 0)
      current.open_po_count += 1
      if (isOverdue(po)) current.overdue_po_count += 1
      supplierMap.set(key, current)
    }

    const insights: SmartDashboardInsight[] = []
    if (overduePOs.length > 0) {
      insights.push({
        id: 'overdue-pos',
        severity: 'critical',
        title: 'Supplier follow-up required',
        message: 'Open POs have crossed expected delivery dates. Prioritize confirmation and receiving updates.',
        metric: `${overduePOs.length} overdue`,
        action_label: 'Review POs',
        to: '/purchase-orders',
      })
    }
    if (pendingParts > 0) {
      insights.push({
        id: 'pending-parts',
        severity: 'warning',
        title: 'BOM parts need procurement mapping',
        message: 'Some project parts are not linked to any PO line. Draft or map POs before release.',
        metric: `${pendingParts} parts`,
        action_label: 'Open Projects',
        to: '/projects',
      })
    }
    if (draftPOs.length > 0) {
      insights.push({
        id: 'draft-pos',
        severity: 'info',
        title: 'Draft POs waiting for decision',
        message: 'Draft orders are staged but not released. Use AI chat to validate supplier, category, and project table mapping.',
        metric: `${draftPOs.length} drafts`,
        action_label: 'Review Drafts',
        to: '/purchase-orders',
      })
    }
    if (bomPoGap > 0) {
      insights.push({
        id: 'coverage-gap',
        severity: 'warning',
        title: 'BOM value exceeds PO coverage',
        message: 'The dashboard sees project BOM value that is not yet covered by purchase orders.',
        metric: moneyMetric(bomPoGap),
        action_label: 'View Reports',
        to: '/reports',
      })
    }
    if (duplicateGroups > 0) {
      insights.push({
        id: 'duplicate-project-parts',
        severity: 'critical',
        title: 'Duplicate project mapping risk',
        message: 'The same master part appears more than once inside one or more project BOMs. Ask AI to audit duplicates before drafting more POs.',
        metric: `${duplicateGroups} groups`,
        action_label: 'Open Projects',
        to: '/projects',
      })
    }
    if (missingImages > 0 || missingSuppliers > 0 || zeroPrices > 0) {
      insights.push({
        id: 'bom-health-issues',
        severity: 'warning',
        title: 'BOM master data needs cleanup',
        message: 'Some mapped parts are missing images, suppliers, or usable pricing. Use AI BOM Health to get the exact list.',
        metric: `${missingImages + missingSuppliers + zeroPrices} issues`,
        action_label: 'Open Parts',
        to: '/parts',
      })
    }
    if (priceSpikes > 0) {
      insights.push({
        id: 'price-spikes',
        severity: 'info',
        title: 'Price changes need review',
        message: 'Recent price history contains changes above 10%. Use AI Price Watch to review supplier and part impact.',
        metric: `${priceSpikes} spikes`,
        action_label: 'Review Parts',
        to: '/parts',
      })
    }
    if (missingPoPdfCount > 0) {
      insights.push({
        id: 'missing-po-pdfs',
        severity: 'info',
        title: 'PO PDF audit coverage gap',
        message: 'Some purchase orders do not have a BEP PO PDF attached, so AI cannot match them against source documents.',
        metric: `${missingPoPdfCount} POs`,
        action_label: 'Review POs',
        to: '/purchase-orders',
      })
    }
    if (insights.length === 0) {
      insights.push({
        id: 'healthy-flow',
        severity: 'success',
        title: 'Procurement baseline is clean',
        message: 'No overdue POs, pending project-part mappings, or obvious BOM coverage gaps were detected.',
        metric: 'All clear',
        action_label: 'Open Reports',
        to: '/reports',
      })
    }

    return {
      generated_at: new Date().toISOString(),
      kpis: {
        open_po_value: openPOs.reduce((sum: number, po: any) => sum + Number(po.grand_total || 0), 0),
        draft_po_value: draftPOs.reduce((sum: number, po: any) => sum + Number(po.grand_total || 0), 0),
        overdue_pos: overduePOs.length,
        pending_procurement_parts: pendingParts,
        bom_po_gap_value: bomPoGap,
        projects_at_risk: projectsAtRisk,
        bom_health_issues: bomHealthIssues,
        price_spikes: priceSpikes,
        duplicate_part_groups: duplicateGroups,
        po_pdf_missing: missingPoPdfCount,
      },
      insights: insights.slice(0, 4),
      priority_projects: projectSignals
        .sort((a, b) => a.health_score - b.health_score || b.gap_value - a.gap_value)
        .slice(0, 5),
      supplier_focus: Array.from(supplierMap.values())
        .sort((a, b) => b.overdue_po_count - a.overdue_po_count || b.open_po_value - a.open_po_value)
        .slice(0, 4),
    }
  }
};
