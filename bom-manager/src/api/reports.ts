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

export interface SupplierPaymentProjectRow {
  project_id: number | null
  project_name: string
  project_number: string
  supplier_id: number | null
  supplier_name: string
  po_count: number
  po_numbers: string[]
  payable_total: number
  paid_total: number
  pending_total: number
  overpaid_total: number
  fully_paid_po_count: number
  pending_po_count: number
  overpaid_po_count: number
  currencies: string[]
}

export interface ProjectPaymentSummary {
  project_id: number | null
  project_name: string
  project_number: string
  supplier_count: number
  po_count: number
  payable_total: number
  paid_total: number
  pending_total: number
  overpaid_total: number
  currencies: string[]
}

export interface SupplierPaymentProjectReport {
  rows: SupplierPaymentProjectRow[]
  project_totals: ProjectPaymentSummary[]
  overall_totals: {
    project_count: number
    supplier_count: number
    po_count: number
    payable_total: number
    paid_total: number
    pending_total: number
    overpaid_total: number
    currencies: string[]
  }
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

const roundMoney = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

const normalizePaymentAmount = (payment: any) => {
  const amount = Number(payment?.amount || 0)
  return payment?.payment_type === 'Refund' ? -amount : amount
}

const calcLineNetAmount = (line: any): number => {
  const explicit = Number(line?.total_amount || 0)
  if (explicit > 0) return explicit
  const qty = Number(line?.quantity || 0)
  const price = Number(line?.unit_price || 0)
  const disc = Number(line?.discount_percent || 0)
  return roundMoney(qty * price * (1 - disc / 100))
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

  getSupplierPaymentProjectReport: async (
    filters?: ReportFilters & {
      projectId?: number
      includeCancelled?: boolean
      includeFullyPaid?: boolean
    },
  ): Promise<SupplierPaymentProjectReport> => {
    let query = (supabase as any)
      .from('purchase_orders')
      .select(`
        id,
        po_number,
        project_id,
        supplier_id,
        status,
        currency,
        grand_total,
        tax_amount,
        po_date,
        suppliers (name),
        project:projects (project_name, project_number, status, customer),
        purchase_order_items (
          id,
          project_part_id,
          quantity,
          unit_price,
          discount_percent,
          total_amount
        )
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
    if (!filters?.includeCancelled) {
      query = query.neq('status', 'Cancelled')
    }

    const { data: pos, error } = await query
    if (error) throw error

    const rows = (pos || []).filter((po: any) => {
      if (filters?.status && filters.status !== 'all' && po.project?.status !== filters.status) {
        return false
      }
      if (
        filters?.customer &&
        !String(po.project?.customer || '').toLowerCase().includes(String(filters.customer).toLowerCase())
      ) {
        return false
      }
      return true
    })
    if (!rows.length) {
      return {
        rows: [],
        project_totals: [],
        overall_totals: {
          project_count: 0,
          supplier_count: 0,
          po_count: 0,
          payable_total: 0,
          paid_total: 0,
          pending_total: 0,
          overpaid_total: 0,
          currencies: [],
        },
      }
    }

    const poIds = rows.map((po: any) => po.id).filter(Boolean)
    const { data: paymentRows, error: paymentsError } = await (supabase as any)
      .from('po_payments')
      .select('purchase_order_id, amount, payment_type')
      .in('purchase_order_id', poIds)
    if (paymentsError) throw paymentsError

    const paidByPo = new Map<number, number>()
    for (const payment of paymentRows || []) {
      const poId = Number((payment as any).purchase_order_id || 0)
      if (!poId) continue
      paidByPo.set(poId, roundMoney((paidByPo.get(poId) || 0) + normalizePaymentAmount(payment)))
    }

    const projectPartIds = Array.from(new Set(
      rows.flatMap((po: any) => (po.purchase_order_items || []).map((item: any) => item.project_part_id)).filter(Boolean),
    ))

    let projectPartRows: any[] = []
    if (projectPartIds.length > 0) {
      const { data, error } = await (supabase as any)
        .from('project_parts')
        .select('id, project_section_id')
        .in('id', projectPartIds)
      if (error) throw error
      projectPartRows = data || []
    }

    const subsectionIds = Array.from(new Set(projectPartRows.map((row: any) => row.project_section_id).filter(Boolean)))
    let subsectionRows: any[] = []
    if (subsectionIds.length > 0) {
      const { data, error } = await (supabase as any)
        .from('project_subsections')
        .select('id, project_id')
        .in('id', subsectionIds)
      if (error) throw error
      subsectionRows = data || []
    }

    const projectIdsFromItems = Array.from(new Set(subsectionRows.map((row: any) => row.project_id).filter(Boolean)))
    let projectRows: any[] = []
    if (projectIdsFromItems.length > 0) {
      const { data, error } = await (supabase as any)
        .from('projects')
        .select('id, project_name, project_number, status, customer')
        .in('id', projectIdsFromItems)
      if (error) throw error
      projectRows = data || []
    }

    const projectPartToSubsection = new Map(projectPartRows.map((row: any) => [row.id, row.project_section_id]))
    const subsectionToProject = new Map(subsectionRows.map((row: any) => [row.id, row.project_id]))
    const projectById = new Map(projectRows.map((row: any) => [row.id, row]))

    const filteredProjectMatch = (project: any) => {
      if (filters?.projectId && Number(project?.id || 0) !== Number(filters.projectId)) return false
      if (filters?.status && filters.status !== 'all' && project?.status !== filters.status) return false
      if (
        filters?.customer &&
        !String(project?.customer || '').toLowerCase().includes(String(filters.customer).toLowerCase())
      ) return false
      return true
    }

    const groups = new Map<string, SupplierPaymentProjectRow>()
    const projectTotalsMap = new Map<string, ProjectPaymentSummary>()
    const overallCurrencies = new Set<string>()
    const overallPoNumbers = new Set<string>()
    const overallSuppliers = new Set<string>()

    for (const po of rows) {
      const poNumber = po.po_number || `PO#${po.id}`
      const payableTotal = roundMoney(
        Number(po?.tax_amount != null
          ? Number(po?.grand_total || 0) + Number(po?.tax_amount || 0)
          : Number(po?.grand_total || 0)),
      )
      const paidTotal = roundMoney(paidByPo.get(Number(po.id)) || 0)
      const supplierId = po.supplier_id ?? null
      const supplierName = po.suppliers?.name || 'Unknown Supplier'
      const lineBuckets = new Map<number, number>()

      for (const item of po.purchase_order_items || []) {
        const subsectionId = projectPartToSubsection.get(item.project_part_id)
        const projectId = subsectionToProject.get(subsectionId)
        if (!projectId) continue
        lineBuckets.set(projectId, roundMoney((lineBuckets.get(projectId) || 0) + calcLineNetAmount(item)))
      }

      let allocations: Array<{ project_id: number | null; project_name: string; project_number: string; net_amount: number; currency: string | null }> = []
      const totalMappedNet = roundMoney(Array.from(lineBuckets.values()).reduce((sum, value) => sum + value, 0))

      if (lineBuckets.size > 0) {
        allocations = Array.from(lineBuckets.entries())
          .map(([projectId, netAmount]) => {
            const project = projectById.get(projectId) || null
            return {
              project_id: projectId,
              project_name: project?.project_name || po.project?.project_name || 'Unassigned Project',
              project_number: project?.project_number || po.project?.project_number || '—',
              net_amount: netAmount,
              currency: po.currency || null,
            }
          })
          .filter((allocation) => filteredProjectMatch(projectById.get(allocation.project_id as number)))
      }

      if (!allocations.length) {
        const fallbackProject = po.project_id ? { id: po.project_id, ...po.project } : null
        if (!filters?.projectId || Number(fallbackProject?.id || 0) === Number(filters.projectId)) {
          if (filteredProjectMatch(fallbackProject)) {
            allocations = [{
              project_id: fallbackProject?.id ?? null,
              project_name: fallbackProject?.project_name || 'Unassigned Project',
              project_number: fallbackProject?.project_number || '—',
              net_amount: totalMappedNet > 0 ? totalMappedNet : Number(po?.grand_total || 0),
              currency: po.currency || null,
            }]
          }
        }
      }

      if (!allocations.length) continue

      const allocationBasis = roundMoney(allocations.reduce((sum, row) => sum + Number(row.net_amount || 0), 0))
      const hasBasis = allocationBasis > 0

      allocations.forEach((allocation, index) => {
        const projectShareRaw = hasBasis
          ? payableTotal * (Number(allocation.net_amount || 0) / allocationBasis)
          : payableTotal / allocations.length
        const paidShareRaw = hasBasis
          ? paidTotal * (Number(allocation.net_amount || 0) / allocationBasis)
          : paidTotal / allocations.length

        const payable = roundMoney(index === allocations.length - 1
          ? payableTotal - allocations.slice(0, index).reduce((sum, prev) => sum + roundMoney(hasBasis ? payableTotal * (Number(prev.net_amount || 0) / allocationBasis) : payableTotal / allocations.length), 0)
          : projectShareRaw)
        const paid = roundMoney(index === allocations.length - 1
          ? paidTotal - allocations.slice(0, index).reduce((sum, prev) => sum + roundMoney(hasBasis ? paidTotal * (Number(prev.net_amount || 0) / allocationBasis) : paidTotal / allocations.length), 0)
          : paidShareRaw)
        const balance = roundMoney(payable - paid)
        const pending = balance > 0.01 ? balance : 0
        const overpaid = balance < -0.01 ? Math.abs(balance) : 0
        const key = `${allocation.project_id ?? 'none'}::${supplierId ?? 'none'}`

        const current = groups.get(key) || {
          project_id: allocation.project_id,
          project_name: allocation.project_name,
          project_number: allocation.project_number,
          supplier_id: supplierId,
          supplier_name: supplierName,
          po_count: 0,
          po_numbers: [],
          payable_total: 0,
          paid_total: 0,
          pending_total: 0,
          overpaid_total: 0,
          fully_paid_po_count: 0,
          pending_po_count: 0,
          overpaid_po_count: 0,
          currencies: [],
        }

        if (!current.po_numbers.includes(poNumber)) {
          current.po_count += 1
          current.po_numbers.push(poNumber)
        }
        current.payable_total = roundMoney(current.payable_total + payable)
        current.paid_total = roundMoney(current.paid_total + paid)
        current.pending_total = roundMoney(current.pending_total + pending)
        current.overpaid_total = roundMoney(current.overpaid_total + overpaid)
        if (overpaid > 0) current.overpaid_po_count += 1
        else if (pending > 0) current.pending_po_count += 1
        else current.fully_paid_po_count += 1
        if (allocation.currency && !current.currencies.includes(allocation.currency)) {
          current.currencies.push(allocation.currency)
        }
        groups.set(key, current)

        const projectTotalKey = String(allocation.project_id ?? 'none')
        const projectTotal = projectTotalsMap.get(projectTotalKey) || {
          project_id: allocation.project_id,
          project_name: allocation.project_name,
          project_number: allocation.project_number,
          supplier_count: 0,
          po_count: 0,
          payable_total: 0,
          paid_total: 0,
          pending_total: 0,
          overpaid_total: 0,
          currencies: [],
        }
        projectTotal.payable_total = roundMoney(projectTotal.payable_total + payable)
        projectTotal.paid_total = roundMoney(projectTotal.paid_total + paid)
        projectTotal.pending_total = roundMoney(projectTotal.pending_total + pending)
        projectTotal.overpaid_total = roundMoney(projectTotal.overpaid_total + overpaid)
        if (!projectTotal.currencies.includes(po.currency || '')) {
          if (po.currency) projectTotal.currencies.push(po.currency)
        }
        projectTotalsMap.set(projectTotalKey, projectTotal)

        if (allocation.currency) overallCurrencies.add(allocation.currency)
        overallPoNumbers.add(`${allocation.project_id ?? 'none'}::${poNumber}`)
        overallSuppliers.add(`${allocation.project_id ?? 'none'}::${supplierId ?? 'none'}`)
      })
    }

    const resultRows = Array.from(groups.values())
      .filter((row) => filters?.includeFullyPaid !== false || row.paid_total > 0 || row.pending_total > 0 || row.overpaid_total > 0)
      .sort((a, b) =>
        a.project_number.localeCompare(b.project_number, undefined, { numeric: true }) ||
        a.project_name.localeCompare(b.project_name) ||
        a.supplier_name.localeCompare(b.supplier_name),
      )

    const projectTotals = Array.from(projectTotalsMap.values())
      .map((project) => ({
        ...project,
        supplier_count: resultRows.filter((row) => row.project_id === project.project_id).length,
        po_count: Array.from(new Set(
          resultRows
            .filter((row) => row.project_id === project.project_id)
            .flatMap((row) => row.po_numbers),
        )).length,
      }))
      .filter((row) => filters?.includeFullyPaid !== false || row.paid_total > 0 || row.pending_total > 0 || row.overpaid_total > 0)
      .sort((a, b) =>
        a.project_number.localeCompare(b.project_number, undefined, { numeric: true }) ||
        a.project_name.localeCompare(b.project_name),
      )

    return {
      rows: resultRows,
      project_totals: projectTotals,
      overall_totals: {
        project_count: projectTotals.length,
        supplier_count: overallSuppliers.size,
        po_count: overallPoNumbers.size,
        payable_total: roundMoney(projectTotals.reduce((sum, row) => sum + row.payable_total, 0)),
        paid_total: roundMoney(projectTotals.reduce((sum, row) => sum + row.paid_total, 0)),
        pending_total: roundMoney(projectTotals.reduce((sum, row) => sum + row.pending_total, 0)),
        overpaid_total: roundMoney(projectTotals.reduce((sum, row) => sum + row.overpaid_total, 0)),
        currencies: Array.from(overallCurrencies.values()).sort(),
      },
    }
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
