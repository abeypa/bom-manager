import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, Search, Filter, Download, ChevronDown, ChevronRight,
  RefreshCw, User, Calendar, Clock, Plus, Edit2, Trash2, Key,
  ShieldCheck, ArrowUpDown, X, FileText
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/context/ToastContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityLog {
  id: string
  performed_by: string | null
  action: string
  entity_type: string
  entity_id: string
  old_values: Record<string, any> | null
  new_values: Record<string, any> | null
  created_at: string
  ip: string | null
}

interface Profile {
  id: string
  full_name: string | null
  email: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, typeof Plus> = {
  CREATE: Plus,
  INSERT: Plus,
  UPDATE: Edit2,
  DELETE: Trash2,
  PASSWORD_RESET: Key,
  ROLE_CHANGE: ShieldCheck,
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  INSERT: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  UPDATE: 'bg-amber-50 text-amber-600 border-amber-100',
  DELETE: 'bg-red-50 text-red-600 border-red-100',
  PASSWORD_RESET: 'bg-violet-50 text-violet-600 border-violet-100',
  ROLE_CHANGE: 'bg-blue-50 text-blue-600 border-blue-100',
}

const ENTITY_LABELS: Record<string, string> = {
  user: 'User',
  part: 'Part',
  project: 'Project',
  projects: 'Project',
  project_sections: 'Section',
  project_subsections: 'Subsection',
  project_parts: 'BOM Part',
  bom_item: 'BOM Item',
  supplier: 'Supplier',
  suppliers: 'Supplier',
  purchase_order: 'Purchase Order',
  purchase_orders: 'Purchase Order',
  mechanical_manufacture: 'Mech (Mfg)',
  mechanical_bought_out: 'Mech (BO)',
  electrical_manufacture: 'Elec (Mfg)',
  electrical_bought_out: 'Elec (BO)',
  pneumatic_bought_out: 'Pneumatic (BO)',
}

const PAGE_SIZE = 25

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const diff = now - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(dateStr)
}

/**
 * Compute a human-readable diff between old and new JSONB values.
 */
function computeChanges(
  old_values: Record<string, any> | null,
  new_values: Record<string, any> | null,
  action: string
): { field: string; from: any; to: any }[] {
  if (action === 'DELETE' && old_values) {
    return Object.entries(old_values)
      .filter(([k]) => !k.startsWith('_') && k !== 'id' && k !== 'created_at' && k !== 'updated_at')
      .slice(0, 8)
      .map(([k, v]) => ({ field: k, from: v, to: null }))
  }

  if (action === 'CREATE' || action === 'INSERT') {
    const vals = new_values || {}
    return Object.entries(vals)
      .filter(([k]) => !k.startsWith('_') && k !== 'id' && k !== 'created_at' && k !== 'updated_at')
      .slice(0, 8)
      .map(([k, v]) => ({ field: k, from: null, to: v }))
  }

  // UPDATE — show only changed fields
  if (!old_values && !new_values) return []
  const all = new Set([
    ...Object.keys(old_values || {}),
    ...Object.keys(new_values || {}),
  ])

  const changes: { field: string; from: any; to: any }[] = []
  for (const key of all) {
    if (key.startsWith('_') || key === 'id' || key === 'created_at' || key === 'updated_at') continue
    const oldVal = old_values?.[key]
    const newVal = new_values?.[key]
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field: key, from: oldVal, to: newVal })
    }
  }
  return changes.slice(0, 12)
}

function formatFieldName(field: string): string {
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (typeof val === 'object') return JSON.stringify(val).slice(0, 60)
  const str = String(val)
  return str.length > 60 ? str.slice(0, 57) + '…' : str
}

// ─── Expandable Row Component ─────────────────────────────────────────────────

function ChangeLogRow({
  log,
  profiles,
}: {
  log: ActivityLog
  profiles: Record<string, Profile>
}) {
  const [expanded, setExpanded] = useState(false)
  const action = log.action.toUpperCase()
  const ActionIcon = ACTION_ICONS[action] || Edit2
  const colorCls = ACTION_COLORS[action] || 'bg-slate-50 text-slate-600 border-slate-100'
  const entityLabel = ENTITY_LABELS[log.entity_type] || log.entity_type
  const performer = profiles[log.performed_by || '']
  const performerName = performer?.full_name || performer?.email?.split('@')[0] || 'System'
  const changes = computeChanges(log.old_values, log.new_values, action)

  return (
    <>
      <tr
        className="table-row-hover group cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Expand indicator */}
        <td className="w-8 text-center py-3">
          {changes.length > 0 ? (
            expanded ? (
              <ChevronDown size={14} className="text-navy-400 mx-auto" />
            ) : (
              <ChevronRight size={14} className="text-slate-300 mx-auto group-hover:text-navy-400 transition-colors" />
            )
          ) : (
            <span className="w-3.5 h-0.5 bg-slate-200 rounded-full block mx-auto" />
          )}
        </td>

        {/* Timestamp */}
        <td className="py-3 px-4">
          <div className="flex flex-col">
            <span className="text-xs font-black text-navy-900 tabular-nums">
              {formatRelativeTime(log.created_at)}
            </span>
            <span className="text-[9px] font-mono text-slate-400 mt-0.5">
              {formatDate(log.created_at)} {formatTime(log.created_at)}
            </span>
          </div>
        </td>

        {/* Performed By */}
        <td className="py-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-black text-navy-500 shrink-0">
              {performerName.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-xs font-bold text-navy-800 truncate max-w-[120px]">
              {performerName}
            </span>
          </div>
        </td>

        {/* Action */}
        <td className="py-3 px-4">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${colorCls}`}>
            <ActionIcon size={10} />
            {action.replace('_', ' ')}
          </span>
        </td>

        {/* Entity */}
        <td className="py-3 px-4">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-navy-900">{entityLabel}</span>
            <span className="text-[9px] font-mono text-slate-400 mt-0.5 truncate max-w-[140px]">
              {log.entity_id?.toString().slice(0, 12)}{log.entity_id?.toString().length > 12 ? '…' : ''}
            </span>
          </div>
        </td>

        {/* Summary */}
        <td className="py-3 px-4">
          <span className="text-[10px] font-bold text-slate-500">
            {changes.length > 0 ? `${changes.length} field${changes.length > 1 ? 's' : ''} changed` : 'No detail'}
          </span>
        </td>
      </tr>

      {/* Expanded Detail Row */}
      {expanded && changes.length > 0 && (
        <tr>
          <td colSpan={6} className="px-8 pb-5 pt-0 bg-slate-50/50">
            <div className="rounded-xl border border-slate-100 bg-white overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Change Detail</span>
              </div>
              <div className="divide-y divide-slate-50">
                {changes.map((c, i) => (
                  <div key={i} className="flex items-start gap-4 px-4 py-2.5 text-xs">
                    <span className="w-36 font-bold text-navy-600 shrink-0 uppercase text-[10px] tracking-tight pt-0.5">
                      {formatFieldName(c.field)}
                    </span>
                    {action === 'DELETE' || action === 'CREATE' || action === 'INSERT' ? (
                      <span className={`font-mono text-[11px] ${action === 'DELETE' ? 'text-red-500 line-through' : 'text-emerald-600'}`}>
                        {formatValue(action === 'DELETE' ? c.from : c.to)}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-mono text-[11px] text-red-400 line-through truncate max-w-[180px]">
                          {formatValue(c.from)}
                        </span>
                        <ArrowUpDown size={10} className="text-slate-300 shrink-0 rotate-90" />
                        <span className="font-mono text-[11px] text-emerald-600 font-bold truncate max-w-[180px]">
                          {formatValue(c.to)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main ChangeLog Page ──────────────────────────────────────────────────────

export default function ChangeLog() {
  const { showToast } = useToast()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    document.title = 'Change Log | BOM Manager'
  }, [])

  // Fetch activity logs
  const { data: logs, isLoading, refetch } = useQuery<ActivityLog[]>({
    queryKey: ['activity-logs', page, actionFilter, entityFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (actionFilter) query = query.eq('action', actionFilter)
      if (entityFilter) query = query.eq('entity_type', entityFilter)

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
    retry: 1,
  })

  // Fetch all profiles for name resolution
  const { data: profilesList } = useQuery<Profile[]>({
    queryKey: ['profiles-for-changelog'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('profiles').select('id, full_name, email')
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })

  const profilesMap = useMemo(() => {
    const map: Record<string, Profile> = {}
    for (const p of profilesList || []) map[p.id] = p
    return map
  }, [profilesList])

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return logs || []
    const q = search.toLowerCase()
    return (logs || []).filter(log => {
      const performer = profilesMap[log.performed_by || '']
      const performerName = (performer?.full_name || performer?.email || '').toLowerCase()
      return (
        performerName.includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.entity_type.toLowerCase().includes(q) ||
        (log.entity_id || '').toLowerCase().includes(q) ||
        JSON.stringify(log.new_values || {}).toLowerCase().includes(q)
      )
    })
  }, [logs, search, profilesMap])

  // Unique action/entity values for filters
  const uniqueActions = useMemo(() => {
    const set = new Set((logs || []).map(l => l.action.toUpperCase()))
    return Array.from(set).sort()
  }, [logs])

  const uniqueEntities = useMemo(() => {
    const set = new Set((logs || []).map(l => l.entity_type))
    return Array.from(set).sort()
  }, [logs])

  // CSV export
  const handleExportCSV = () => {
    if (!filtered.length) {
      showToast('error', 'No logs to export')
      return
    }

    const headers = ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Old Values', 'New Values']
    const rows = filtered.map(log => {
      const performer = profilesMap[log.performed_by || '']
      return [
        new Date(log.created_at).toISOString(),
        performer?.full_name || performer?.email || log.performed_by || 'System',
        log.action,
        log.entity_type,
        log.entity_id,
        JSON.stringify(log.old_values || {}),
        JSON.stringify(log.new_values || {}),
      ]
    })

    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `change-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast('success', `Exported ${filtered.length} records to CSV`)
  }

  return (
    <div className="page-container page-enter">
      {/* Header */}
      <header className="page-header">
        <div>
          <p className="label-caps mb-1.5 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-navy-500" />
            Audit Trail
          </p>
          <h1 className="page-title">Change Log</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="btn btn-secondary btn-icon h-11 w-11 shadow-sm"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleExportCSV}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="section-card p-4 flex flex-col md:flex-row items-center gap-4 mb-8">
        <div className="flex items-center gap-3 px-2">
          <FileText size={18} className="text-navy-900" />
          <div className="label-caps !text-navy-900 !text-[11px] whitespace-nowrap">Activity Feed</div>
        </div>

        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary" />
          <input
            type="text"
            className="input pl-11"
            placeholder="Search by user, action, entity, or value…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn btn-secondary flex items-center gap-2 ${showFilters ? 'bg-navy-900 text-white' : ''}`}
        >
          <Filter size={14} />
          Filters
          {(actionFilter || entityFilter) && (
            <span className="w-2 h-2 bg-amber-400 rounded-full" />
          )}
        </button>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="card p-5 mb-6 flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Action</label>
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(0) }}
              className="input !py-1.5 !text-xs !rounded-lg w-36"
            >
              <option value="">All Actions</option>
              {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entity</label>
            <select
              value={entityFilter}
              onChange={e => { setEntityFilter(e.target.value); setPage(0) }}
              className="input !py-1.5 !text-xs !rounded-lg w-44"
            >
              <option value="">All Entities</option>
              {uniqueEntities.map(e => <option key={e} value={e}>{ENTITY_LABELS[e] || e}</option>)}
            </select>
          </div>

          {(actionFilter || entityFilter) && (
            <button
              onClick={() => { setActionFilter(''); setEntityFilter(''); setPage(0) }}
              className="text-[10px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1"
            >
              <X size={12} /> Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card shadow-sm overflow-hidden">
        {isLoading && (!logs || logs.length === 0) ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <Activity size={28} className="text-slate-300" />
            </div>
            <h3 className="text-sm font-black text-navy-900 uppercase tracking-tight mb-1">No Activity Found</h3>
            <p className="text-xs text-tertiary max-w-xs mx-auto">
              {search || actionFilter || entityFilter
                ? 'No logs match your current filters. Try adjusting your search criteria.'
                : 'Activity will appear here as users create, update, and delete entities in the system.'}
            </p>
          </div>
        ) : (
          <table className="data-table-modern w-full">
            <thead>
              <tr>
                <th className="w-8" />
                <th className="text-left px-4 py-3 w-44">Timestamp</th>
                <th className="text-left px-4 py-3 w-40">Performed By</th>
                <th className="text-left px-4 py-3 w-36">Action</th>
                <th className="text-left px-4 py-3 w-40">Entity</th>
                <th className="text-left px-4 py-3">Summary</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => (
                <ChangeLogRow key={log.id} log={log} profiles={profilesMap} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-6">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Showing {filtered.length} records • Page {page + 1}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="btn btn-secondary btn-sm disabled:opacity-30"
          >
            Previous
          </button>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={(logs || []).length < PAGE_SIZE}
            className="btn btn-secondary btn-sm disabled:opacity-30"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
