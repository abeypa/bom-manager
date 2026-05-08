import { supabase } from '@/lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectFinancialSummary {
  project_id: number
  project_name: string
  project_number: string
  customer: string | null
  status: string
  start_date: string | null
  target_completion_date: string | null

  // BOM value: sum of (unit_price * quantity * (1 - discount_percent/100)) across all project_parts
  bom_total_value: number
  bom_part_count: number

  // PO value: sum of grand_total across purchase_orders linked to this project
  po_total_value: number
  po_count: number
  po_received_value: number   // sum of grand_total for Received POs
  po_pending_value: number    // sum for Draft/Released/Sent/Confirmed/Partial POs

  // Currency breakdown (aggregated)
  currencies: string[]
}

export interface POReportItem {
  id: number
  po_number: string
  project_id: number
  project_name: string
  project_number: string
  supplier_name: string
  status: string
  currency: string
  grand_total: number
  total_items: number
  total_quantity: number
  po_date: string
  expected_delivery_date: string | null
}

export interface ReconciliationRow {
  project_id: number
  project_name: string
  project_number: string
  part_type: string
  part_id: number | null
  part_number: string
  description: string
  bom_qty: number
  po_qty: number
  qty_delta: number          // po_qty - bom_qty
  bom_value: number
  po_value: number
  value_delta: number        // po_value - bom_value
  po_numbers: string[]
  issue: 'OK' | 'QTY_MISMATCH' | 'VALUE_MISMATCH' | 'BOM_NO_PO' | 'PO_NO_BOM'
}

export interface ReportFilters {
  status?: string          // Project status filter
  customer?: string
  dateFrom?: string
  dateTo?: string
  poStatus?: string        // PO status filter
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const calcBOMValue = (parts: any[]): number => {
  return parts.reduce((sum, p) => {
    const qty = p.quantity || 0
    const price = p.unit_price || 0
    const disc = p.discount_percent || 0
    return sum + qty * price * (1 - disc / 100)
  }, 0)
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const reportsApi = {
  /**
   * Fetch financial summary for all projects (with optional filters).
   * Aggregates BOM part values + PO grand totals.
   */
  getProjectFinancials: async (filters?: ReportFilters): Promise<ProjectFinancialSummary[]> => {
    // 1. Fetch projects
    let projectQuery = (supabase as any)
      .from('projects')
      .select('id, project_name, project_number, customer, status, start_date, target_completion_date')
      .order('created_date', { ascending: false })

    if (filters?.status && filters.status !== 'all') {
      projectQuery = projectQuery.eq('status', filters.status)
    }
    if (filters?.customer) {
      projectQuery = projectQuery.ilike('customer', `%${filters.customer}%`)
    }

    const { data: projects, error: projErr } = await projectQuery
    if (projErr) throw projErr
    if (!projects?.length) return []

    const projectIds: number[] = projects.map((p: any) => p.id)

    // 2. Fetch all project_parts for these projects via subsections
    const { data: subsections } = await (supabase as any)
      .from('project_subsections')
      .select('id, project_id')
      .in('project_id', projectIds)

    const subsectionIds = (subsections || []).map((s: any) => s.id)
    const subsectionToProject: Record<number, number> = {}
    for (const s of (subsections || [])) {
      subsectionToProject[s.id] = s.project_id
    }

    let parts: any[] = []
    if (subsectionIds.length > 0) {
      const { data: partsData } = await (supabase as any)
        .from('project_parts')
        .select('project_section_id, unit_price, quantity, discount_percent, currency')
        .in('project_section_id', subsectionIds)
      parts = partsData || []
    }

    // 3. Fetch all POs linked to these projects
    let poQuery = (supabase as any)
      .from('purchase_orders')
      .select('id, project_id, status, currency, grand_total, total_items, total_quantity, po_date')
      .in('project_id', projectIds)

    if (filters?.poStatus && filters.poStatus !== 'all') {
      poQuery = poQuery.eq('status', filters.poStatus)
    }
    if (filters?.dateFrom) {
      poQuery = poQuery.gte('po_date', filters.dateFrom)
    }
    if (filters?.dateTo) {
      poQuery = poQuery.lte('po_date', filters.dateTo)
    }

    const { data: pos } = await poQuery
    const allPOs: any[] = pos || []

    // 4. Aggregate per project
    const summary: ProjectFinancialSummary[] = projects.map((proj: any) => {
      const projParts = parts.filter(
        (p: any) => subsectionToProject[p.project_section_id] === proj.id
      )
      const projPOs = allPOs.filter((po: any) => po.project_id === proj.id)

      const bomValue = calcBOMValue(projParts)
      const poTotal = projPOs.reduce((s: number, po: any) => s + (po.grand_total || 0), 0)
      const poReceived = projPOs
        .filter((po: any) => po.status === 'Received')
        .reduce((s: number, po: any) => s + (po.grand_total || 0), 0)
      const poPending = projPOs
        .filter((po: any) => !['Received', 'Cancelled'].includes(po.status))
        .reduce((s: number, po: any) => s + (po.grand_total || 0), 0)

      const currencies = [...new Set([
        ...projParts.map((p: any) => p.currency).filter(Boolean),
        ...projPOs.map((po: any) => po.currency).filter(Boolean),
      ])] as string[]

      return {
        project_id: proj.id,
        project_name: proj.project_name,
        project_number: proj.project_number,
        customer: proj.customer,
        status: proj.status,
        start_date: proj.start_date,
        target_completion_date: proj.target_completion_date,
        bom_total_value: bomValue,
        bom_part_count: projParts.length,
        po_total_value: poTotal,
        po_count: projPOs.length,
        po_received_value: poReceived,
        po_pending_value: poPending,
        currencies,
      }
    })

    return summary
  },

  /**
   * Fetch detailed PO list across all projects with optional filters.
   */
  getPOReport: async (filters?: ReportFilters): Promise<POReportItem[]> => {
    let query = (supabase as any)
      .from('purchase_orders')
      .select(`
        id, po_number, project_id, status, currency, grand_total,
        total_items, total_quantity, po_date, expected_delivery_date,
        suppliers (name),
        project:projects (project_name, project_number)
      `)
      .order('po_date', { ascending: false })

    if (filters?.poStatus && filters.poStatus !== 'all') {
      query = query.eq('status', filters.poStatus)
    }
    if (filters?.dateFrom) {
      query = query.gte('po_date', filters.dateFrom)
    }
    if (filters?.dateTo) {
      query = query.lte('po_date', filters.dateTo)
    }

    const { data, error } = await query
    if (error) throw error

    return (data || []).map((po: any) => ({
      id: po.id,
      po_number: po.po_number,
      project_id: po.project_id,
      project_name: po.project?.project_name || '—',
      project_number: po.project?.project_number || '—',
      supplier_name: po.suppliers?.name || '—',
      status: po.status,
      currency: po.currency,
      grand_total: po.grand_total || 0,
      total_items: po.total_items || 0,
      total_quantity: po.total_quantity || 0,
      po_date: po.po_date,
      expected_delivery_date: po.expected_delivery_date,
    }))
  },

  /**
   * Get the distinct list of customers for filter dropdown.
   */
  getCustomers: async (): Promise<string[]> => {
    const { data } = await (supabase as any)
      .from('projects')
      .select('customer')
      .not('customer', 'is', null)
      .order('customer')

    return [...new Set((data || []).map((d: any) => d.customer).filter(Boolean))] as string[]
  },

  /**
   * BOM vs PO reconciliation. For each (project, part_type, part_id) tuple,
   * sums BOM qty/value from project_parts and PO qty/value from
   * purchase_order_items, and returns a row only when there is a difference
   * (or a part appears on one side and not the other).
   */
  getReconciliation: async (
    projectId?: number
  ): Promise<ReconciliationRow[]> => {
    // Resolve project id list
    let projectsQ = (supabase as any)
      .from('projects')
      .select('id, project_name, project_number')
    if (projectId) projectsQ = projectsQ.eq('id', projectId)
    const { data: projects } = await projectsQ
    const projectList: any[] = projects || []
    if (projectList.length === 0) return []
    const projectIds = projectList.map((p: any) => p.id)

    // Fetch BOM
    const { data: subsections } = await (supabase as any)
      .from('project_subsections')
      .select('id, project_id')
      .in('project_id', projectIds)
    const subsectionToProject: Record<number, number> = {}
    for (const s of subsections || []) subsectionToProject[s.id] = s.project_id

    const subIds = (subsections || []).map((s: any) => s.id)
    let bomRows: any[] = []
    if (subIds.length) {
      const { data: bd } = await (supabase as any)
        .from('project_parts')
        .select('project_section_id, part_type, part_id, quantity, unit_price, discount_percent')
        .in('project_section_id', subIds)
      bomRows = bd || []
    }

    // Fetch PO items
    const { data: poRows } = await (supabase as any)
      .from('purchase_orders')
      .select('id, project_id, po_number, status, purchase_order_items(part_type, part_id, quantity, unit_price, discount_percent)')
      .in('project_id', projectIds)

    type Agg = { qty: number; value: number; po_numbers: Set<string> }
    const bomMap = new Map<string, Agg>()
    const poMap = new Map<string, Agg>()
    const partLabels = new Map<string, { part_type: string; part_id: number; project_id: number }>()

    const key = (projectId: number, part_type: string, part_id: number | null) =>
      `${projectId}::${part_type}::${part_id ?? 'null'}`

    for (const r of bomRows) {
      const projectIdHere = subsectionToProject[r.project_section_id]
      if (!projectIdHere || !r.part_type) continue
      const k = key(projectIdHere, r.part_type, r.part_id)
      const qty = r.quantity || 0
      const value = qty * (r.unit_price || 0) * (1 - (r.discount_percent || 0) / 100)
      const cur = bomMap.get(k) || { qty: 0, value: 0, po_numbers: new Set() }
      cur.qty += qty
      cur.value += value
      bomMap.set(k, cur)
      partLabels.set(k, { part_type: r.part_type, part_id: r.part_id, project_id: projectIdHere })
    }

    for (const po of poRows || []) {
      for (const it of po.purchase_order_items || []) {
        if (!it.part_type) continue
        const k = key(po.project_id, it.part_type, it.part_id)
        const qty = it.quantity || 0
        const value = qty * (it.unit_price || 0) * (1 - (it.discount_percent || 0) / 100)
        const cur = poMap.get(k) || { qty: 0, value: 0, po_numbers: new Set() }
        cur.qty += qty
        cur.value += value
        cur.po_numbers.add(po.po_number)
        poMap.set(k, cur)
        if (!partLabels.has(k)) {
          partLabels.set(k, { part_type: it.part_type, part_id: it.part_id, project_id: po.project_id })
        }
      }
    }

    // Resolve part_number / description per (part_type, part_id)
    const idsByType: Record<string, Set<number>> = {}
    for (const v of partLabels.values()) {
      if (!v.part_id) continue
      if (!idsByType[v.part_type]) idsByType[v.part_type] = new Set()
      idsByType[v.part_type].add(v.part_id)
    }
    const detailsMap: Record<string, Record<number, any>> = {}
    for (const [pt, ids] of Object.entries(idsByType)) {
      const { data: rows } = await (supabase as any)
        .from(pt)
        .select('id, part_number, description')
        .in('id', Array.from(ids))
      detailsMap[pt] = {}
      for (const d of rows || []) detailsMap[pt][d.id] = d
    }

    const projectInfo = new Map<number, any>(projectList.map((p: any) => [p.id, p]))

    const out: ReconciliationRow[] = []
    const allKeys = new Set<string>([...bomMap.keys(), ...poMap.keys()])
    for (const k of allKeys) {
      const meta = partLabels.get(k)!
      const bom = bomMap.get(k) || { qty: 0, value: 0, po_numbers: new Set() }
      const po = poMap.get(k) || { qty: 0, value: 0, po_numbers: new Set() }
      const qtyDelta = po.qty - bom.qty
      const valueDelta = po.value - bom.value
      const proj = projectInfo.get(meta.project_id) || {}
      const det = (meta.part_id && detailsMap[meta.part_type]?.[meta.part_id]) || {}
      let issue: ReconciliationRow['issue'] = 'OK'
      if (bom.qty === 0 && po.qty > 0) issue = 'PO_NO_BOM'
      else if (po.qty === 0 && bom.qty > 0) issue = 'BOM_NO_PO'
      else if (qtyDelta !== 0) issue = 'QTY_MISMATCH'
      else if (Math.abs(valueDelta) > 0.01) issue = 'VALUE_MISMATCH'
      out.push({
        project_id: meta.project_id,
        project_name: proj.project_name || '',
        project_number: proj.project_number || '',
        part_type: meta.part_type,
        part_id: meta.part_id,
        part_number: det.part_number || '—',
        description: det.description || '',
        bom_qty: bom.qty,
        po_qty: po.qty,
        qty_delta: qtyDelta,
        bom_value: bom.value,
        po_value: po.value,
        value_delta: valueDelta,
        po_numbers: Array.from(po.po_numbers),
        issue,
      })
    }
    out.sort((a, b) => Math.abs(b.value_delta) - Math.abs(a.value_delta))
    return out
  },
}
