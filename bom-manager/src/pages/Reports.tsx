import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi, ReportFilters } from '@/api/reports'
import {
  BarChart3, FileText, TrendingUp, Package, ShoppingCart,
  Filter, Download, RefreshCw, ChevronUp, ChevronDown, Search
} from 'lucide-react'

// ─── Status badge ────────────────────────────────────────────────────────────
const PROJECT_STATUS_COLORS: Record<string, string> = {
  planning:  'bg-blue-500/15 text-blue-400',
  design:    'bg-indigo-500/15 text-indigo-400',
  build:     'bg-amber-500/15 text-amber-400',
  testing:   'bg-orange-500/15 text-orange-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  on_hold:   'bg-gray-500/15 text-gray-400',
  cancelled: 'bg-red-500/15 text-red-400',
}

const PO_STATUS_COLORS: Record<string, string> = {
  Draft:     'bg-gray-500/15 text-gray-400',
  Released:  'bg-blue-500/15 text-blue-400',
  Pending:   'bg-amber-500/15 text-amber-400',
  Sent:      'bg-indigo-500/15 text-indigo-400',
  Confirmed: 'bg-cyan-500/15 text-cyan-400',
  Partial:   'bg-orange-500/15 text-orange-400',
  Received:  'bg-emerald-500/15 text-emerald-400',
  Cancelled: 'bg-red-500/15 text-red-400',
}

function StatusBadge({ status, colors }: { status: string; colors: Record<string, string> }) {
  const cls = colors[status] || 'bg-gray-500/15 text-gray-400'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  )
}

// ─── Currency formatter ───────────────────────────────────────────────────────
const fmt = (val: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val)

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: any; color: string
}) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-black/5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Sort helper ─────────────────────────────────────────────────────────────
type SortKey = 'project_name' | 'bom_total_value' | 'po_total_value' | 'po_count' | 'status'

export default function Reports() {
  const [tab, setTab] = useState<'projects' | 'po'>('projects')
  const [filters, setFilters] = useState<ReportFilters>({ status: 'all', poStatus: 'all' })
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('bom_total_value')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Data
  const { data: projectData = [], isLoading: projLoading, refetch: refetchProj } =
    useQuery({ queryKey: ['reports-projects', filters], queryFn: () => reportsApi.getProjectFinancials(filters) })

  const { data: poData = [], isLoading: poLoading, refetch: refetchPO } =
    useQuery({ queryKey: ['reports-po', filters], queryFn: () => reportsApi.getPOReport(filters) })

  const { data: customers = [] } =
    useQuery({ queryKey: ['report-customers'], queryFn: reportsApi.getCustomers })

  // KPIs
  const totalBOM = projectData.reduce((s, p) => s + p.bom_total_value, 0)
  const totalPO  = projectData.reduce((s, p) => s + p.po_total_value, 0)
  const totalReceived = projectData.reduce((s, p) => s + p.po_received_value, 0)
  const totalPending  = projectData.reduce((s, p) => s + p.po_pending_value, 0)

  // Sorted + filtered project rows
  const sortedProjects = useMemo(() => {
    let rows = [...projectData]
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(p =>
        p.project_name.toLowerCase().includes(q) ||
        p.project_number.toLowerCase().includes(q) ||
        (p.customer || '').toLowerCase().includes(q)
      )
    }
    rows.sort((a, b) => {
      const av = a[sortKey] as any
      const bv = b[sortKey] as any
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
    return rows
  }, [projectData, search, sortKey, sortDir])

  // Sorted PO rows
  const sortedPOs = useMemo(() => {
    let rows = [...poData]
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(p =>
        p.po_number.toLowerCase().includes(q) ||
        p.project_name.toLowerCase().includes(q) ||
        p.supplier_name.toLowerCase().includes(q)
      )
    }
    rows.sort((a, b) => b.grand_total - a.grand_total)
    return rows
  }, [poData, search])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => sortKey === k
    ? (sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)
    : null

  // CSV export
  const exportCSV = () => {
    if (tab === 'projects') {
      const header = 'Project Number,Project Name,Customer,Status,BOM Value (USD),PO Count,PO Total (USD),Received (USD),Pending (USD)'
      const rows = sortedProjects.map(p =>
        `${p.project_number},"${p.project_name}","${p.customer || ''}",${p.status},${p.bom_total_value.toFixed(2)},${p.po_count},${p.po_total_value.toFixed(2)},${p.po_received_value.toFixed(2)},${p.po_pending_value.toFixed(2)}`
      )
      downloadCSV([header, ...rows].join('\n'), 'project-financials.csv')
    } else {
      const header = 'PO Number,Project,Supplier,Status,Currency,Grand Total,PO Date'
      const rows = sortedPOs.map(p =>
        `${p.po_number},"${p.project_name}","${p.supplier_name}",${p.status},${p.currency},${p.grand_total.toFixed(2)},${p.po_date}`
      )
      downloadCSV([header, ...rows].join('\n'), 'po-report.csv')
    }
  }

  const isLoading = tab === 'projects' ? projLoading : poLoading
  const refetch = tab === 'projects' ? refetchProj : refetchPO

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Financial Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Project BOM values, PO spend, and procurement status</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2.5 text-gray-400 hover:text-gray-700 bg-white rounded-xl shadow-sm border border-black/5 transition-all hover:shadow-md"
            title="Refresh"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#1d1d1f] rounded-xl shadow-sm hover:bg-[#333] transition-all"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total BOM Value" value={fmt(totalBOM)} sub={`${projectData.length} projects`} icon={Package} color="bg-blue-50 text-blue-600" />
        <KPICard label="Total PO Value" value={fmt(totalPO)} sub={`${poData.length} purchase orders`} icon={ShoppingCart} color="bg-violet-50 text-violet-600" />
        <KPICard label="Received" value={fmt(totalReceived)} sub="Fully delivered POs" icon={TrendingUp} color="bg-emerald-50 text-emerald-600" />
        <KPICard label="Pending / In-Flight" value={fmt(totalPending)} sub="Open PO obligations" icon={BarChart3} color="bg-amber-50 text-amber-600" />
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Filter size={14} className="text-gray-400 flex-shrink-0" />

          {/* Tab */}
          <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
            {(['projects', 'po'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setSearch('') }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'projects' ? 'By Project' : 'By PO'}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-gray-200" />

          {/* Project status */}
          {tab === 'projects' && (
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
              className="text-xs font-medium border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20">
              <option value="all">All Statuses</option>
              {['planning','design','build','testing','completed','on_hold','cancelled'].map(s => (
                <option key={s} value={s}>{s.replace('_',' ')}</option>
              ))}
            </select>
          )}

          {/* PO status */}
          <select value={filters.poStatus} onChange={e => setFilters(f => ({ ...f, poStatus: e.target.value }))}
            className="text-xs font-medium border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20">
            <option value="all">All PO Statuses</option>
            {['Draft','Released','Pending','Sent','Confirmed','Partial','Received','Cancelled'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Customer */}
          {tab === 'projects' && customers.length > 0 && (
            <select value={filters.customer || ''} onChange={e => setFilters(f => ({ ...f, customer: e.target.value || undefined }))}
              className="text-xs font-medium border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20">
              <option value="">All Customers</option>
              {customers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {/* Date range */}
          <input type="date" value={filters.dateFrom || ''} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value || undefined }))}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20" />
          <span className="text-gray-300 text-xs">→</span>
          <input type="date" value={filters.dateTo || ''} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value || undefined }))}
            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20" />

          {/* Search */}
          <div className="ml-auto flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 min-w-[200px]">
            <Search size={13} className="text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="bg-transparent text-xs text-gray-700 placeholder-gray-400 focus:outline-none w-full" />
          </div>
        </div>
      </div>

      {/* Table */}
      {tab === 'projects' ? (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {[
                    { key: 'project_name', label: 'Project' },
                    { key: 'status', label: 'Status' },
                    { key: null, label: 'Customer' },
                    { key: 'bom_total_value', label: 'BOM Value' },
                    { key: 'po_count', label: 'POs' },
                    { key: 'po_total_value', label: 'PO Total' },
                    { key: null, label: 'Received' },
                    { key: null, label: 'Pending' },
                  ].map(col => (
                    <th key={col.label}
                      onClick={() => col.key && handleSort(col.key as SortKey)}
                      className={`px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap ${col.key ? 'cursor-pointer hover:text-gray-700 select-none' : ''}`}>
                      <span className="flex items-center gap-1">
                        {col.label}
                        {col.key && <SortIcon k={col.key as SortKey} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm">Loading…</td></tr>
                ) : sortedProjects.length === 0 ? (
                  <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm">No projects match the selected filters.</td></tr>
                ) : sortedProjects.map((proj, i) => (
                  <tr key={proj.project_id}
                    className={`border-b border-gray-50 hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-gray-900 text-sm">{proj.project_name}</div>
                      <div className="text-[11px] text-gray-400">{proj.project_number}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={proj.status} colors={PROJECT_STATUS_COLORS} />
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs">{proj.customer || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-semibold text-gray-900">{fmt(proj.bom_total_value)}</span>
                      <div className="text-[10px] text-gray-400">{proj.bom_part_count} parts</div>
                    </td>
                    <td className="px-5 py-3.5 text-center font-mono text-sm text-gray-700">{proj.po_count}</td>
                    <td className="px-5 py-3.5 font-mono font-semibold text-gray-900">{fmt(proj.po_total_value)}</td>
                    <td className="px-5 py-3.5 font-mono text-emerald-600 font-medium">{fmt(proj.po_received_value)}</td>
                    <td className="px-5 py-3.5 font-mono text-amber-600 font-medium">{fmt(proj.po_pending_value)}</td>
                  </tr>
                ))}
              </tbody>
              {sortedProjects.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={3} className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Totals</td>
                    <td className="px-5 py-3.5 font-mono font-bold text-gray-900">{fmt(totalBOM)}</td>
                    <td className="px-5 py-3.5 text-center font-mono font-bold text-gray-900">{poData.length}</td>
                    <td className="px-5 py-3.5 font-mono font-bold text-gray-900">{fmt(totalPO)}</td>
                    <td className="px-5 py-3.5 font-mono font-bold text-emerald-600">{fmt(totalReceived)}</td>
                    <td className="px-5 py-3.5 font-mono font-bold text-amber-600">{fmt(totalPending)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['PO Number', 'Project', 'Supplier', 'Status', 'PO Date', 'Expected Delivery', 'Items', 'Grand Total'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm">Loading…</td></tr>
                ) : sortedPOs.length === 0 ? (
                  <tr><td colSpan={8} className="py-16 text-center text-gray-400 text-sm">No purchase orders match the selected filters.</td></tr>
                ) : sortedPOs.map((po, i) => (
                  <tr key={po.id} className={`border-b border-gray-50 hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                    <td className="px-5 py-3.5 font-mono font-semibold text-gray-900">{po.po_number}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-900">{po.project_name}</div>
                      <div className="text-[11px] text-gray-400">{po.project_number}</div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs">{po.supplier_name}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={po.status} colors={PO_STATUS_COLORS} /></td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">{po.po_date}</td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">{po.expected_delivery_date || '—'}</td>
                    <td className="px-5 py-3.5 text-center text-gray-700 font-mono text-sm">{po.total_items}</td>
                    <td className="px-5 py-3.5 font-mono font-bold text-gray-900">{fmt(po.grand_total, po.currency)}</td>
                  </tr>
                ))}
              </tbody>
              {sortedPOs.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={7} className="px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">Total PO Spend</td>
                    <td className="px-5 py-3.5 font-mono font-bold text-gray-900">{fmt(sortedPOs.reduce((s, p) => s + p.grand_total, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CSV download helper ──────────────────────────────────────────────────────
function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
