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

export interface SmartDashboard {
  generated_at: string
  kpis: {
    open_po_value: number
    draft_po_value: number
    overdue_pos: number
    pending_procurement_parts: number
    bom_po_gap_value: number
    projects_at_risk: number
  }
  insights: SmartDashboardInsight[]
  priority_projects: SmartProjectSignal[]
  supplier_focus: SupplierFocusSignal[]
}

const OPEN_PO_STATUSES = new Set(['Draft', 'Released', 'Pending', 'Sent', 'Confirmed', 'Partial'])

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
        .select('id, project_section_id, quantity, unit_price, discount_percent')
        .in('project_section_id', subsectionIds)
      projectParts = partsData || []
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
