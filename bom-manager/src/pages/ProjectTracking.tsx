import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Clock3,
  Download,
  FolderKanban,
  Plus,
  PackageCheck,
  Search,
  ShieldAlert,
  Truck,
} from 'lucide-react'
import { projectTrackingApi, type TrackingSupplierAssignment, type TrackingWorkItem } from '@/api/project-tracking'
import { useAuth } from '@/context/AuthContext'
import { useRole } from '@/hooks/useRole'
import SupplierAssignmentModal from '@/components/project-tracking/SupplierAssignmentModal'
import WorkItemUpdateModal from '@/components/project-tracking/WorkItemUpdateModal'

const formatDate = (value?: string | null) => {
  if (!value) return 'No target date'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const formatDateTime = (value?: string | null) => {
  if (!value) return 'No updates yet'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const statusTone: Record<string, string> = {
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
  waiting_supplier: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  not_started: 'bg-slate-100 text-slate-600 border-slate-200',
}

const downloadCsv = (filename: string, rows: string[]) => {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function ProjectTracking() {
  const { user } = useAuth()
  const { isAdmin } = useRole()
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<TrackingSupplierAssignment | null>(null)
  const [updateItem, setUpdateItem] = useState<TrackingWorkItem | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [overdueOnly, setOverdueOnly] = useState(false)

  useEffect(() => {
    document.title = 'Project Tracking | BOM Manager'
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['project-tracking-dashboard', user?.id, isAdmin],
    queryFn: () => projectTrackingApi.getDashboard(user!.id, isAdmin),
    enabled: !!user?.id,
  })

  const { data: allWorkItems = [] } = useQuery({
    queryKey: ['project-tracking-work-items', user?.id, isAdmin],
    queryFn: () => projectTrackingApi.getWorkItems(isAdmin ? undefined : { assignedTo: user!.id }),
    enabled: !!user?.id,
  })

  const { data: allAssignments = [] } = useQuery({
    queryKey: ['project-tracking-assignments', user?.id, isAdmin],
    queryFn: () => projectTrackingApi.getSupplierAssignments(isAdmin ? undefined : { assignedUserId: user!.id }),
    enabled: !!user?.id,
  })

  const summaries = data?.summaries || []
  const myAssignments = data?.my_assignments || []
  const overdueAssignments = data?.overdue_assignments || []
  const blockedItems = data?.blocked_work_items || []
  const recentUpdates = data?.recent_updates || []
  const today = new Date().toISOString().slice(0, 10)

  const filteredWorkItems = useMemo(() => {
    return allWorkItems.filter((item) => {
      const query = search.trim().toLowerCase()
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        (item.project_name || '').toLowerCase().includes(query) ||
        (item.supplier_name || '').toLowerCase().includes(query) ||
        (item.assigned_user_name || '').toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || (item.tracking_status || 'not_started') === statusFilter
      const matchesRisk = riskFilter === 'all' || (item.risk_level || 'normal') === riskFilter
      const matchesOverdue = !overdueOnly || (!!item.due_date && item.due_date < today && item.status !== 'Approved')
      return matchesSearch && matchesStatus && matchesRisk && matchesOverdue
    })
  }, [allWorkItems, overdueOnly, riskFilter, search, statusFilter, today])

  const filteredAssignments = useMemo(() => {
    return allAssignments.filter((assignment) => {
      const query = search.trim().toLowerCase()
      const matchesSearch =
        !query ||
        assignment.supplier_name.toLowerCase().includes(query) ||
        assignment.project_name.toLowerCase().includes(query) ||
        (assignment.assigned_user_name || '').toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || assignment.current_status === statusFilter
      const matchesOverdue = !overdueOnly || (!!assignment.target_date && assignment.target_date < today && assignment.current_status !== 'closed')
      return matchesSearch && matchesStatus && matchesOverdue
    })
  }, [allAssignments, overdueOnly, search, statusFilter, today])

  const supplierBottlenecks = useMemo(() => {
    const grouped = new Map<string, { supplier: string; openAssignments: number; overdueAssignments: number; blockedItems: number }>()

    for (const assignment of allAssignments) {
      const key = assignment.supplier_name
      const existing = grouped.get(key) || { supplier: key, openAssignments: 0, overdueAssignments: 0, blockedItems: 0 }
      if (assignment.current_status !== 'closed') existing.openAssignments += 1
      if (assignment.target_date && assignment.target_date < today && assignment.current_status !== 'closed') {
        existing.overdueAssignments += 1
      }
      grouped.set(key, existing)
    }

    for (const item of allWorkItems) {
      if (!item.supplier_name) continue
      const existing = grouped.get(item.supplier_name) || { supplier: item.supplier_name, openAssignments: 0, overdueAssignments: 0, blockedItems: 0 }
      if (item.status !== 'Approved' && ((item.tracking_status || '') === 'blocked' || !!item.blocker || item.risk_level === 'critical')) {
        existing.blockedItems += 1
      }
      grouped.set(item.supplier_name, existing)
    }

    return Array.from(grouped.values())
      .sort((a, b) => (b.overdueAssignments + b.blockedItems) - (a.overdueAssignments + a.blockedItems))
      .slice(0, 6)
  }, [allAssignments, allWorkItems, today])

  const riskProjects = useMemo(() => {
    const grouped = new Map<number, { projectId: number; projectName: string; overdue: number; blocked: number }>()
    for (const item of allWorkItems) {
      if (!item.project_id) continue
      const existing = grouped.get(item.project_id) || {
        projectId: item.project_id,
        projectName: item.project_name || `Project #${item.project_id}`,
        overdue: 0,
        blocked: 0,
      }
      if (item.due_date && item.due_date < today && item.status !== 'Approved') existing.overdue += 1
      if ((item.tracking_status || '') === 'blocked' || !!item.blocker || item.risk_level === 'critical') existing.blocked += 1
      grouped.set(item.project_id, existing)
    }
    return Array.from(grouped.values())
      .filter((project) => project.overdue > 0 || project.blocked > 0)
      .sort((a, b) => (b.overdue + b.blocked) - (a.overdue + a.blocked))
      .slice(0, 6)
  }, [allWorkItems, today])

  const exportWorkItems = () => {
    const rows = [
      'Project,Project Number,Work Item,Supplier,Owner,Tracking Status,Risk,Progress %,Due Date,Next Action,Blocker',
      ...filteredWorkItems.map((item) =>
        [
          `"${item.project_name || ''}"`,
          `"${item.project_number || ''}"`,
          `"${item.name.replace(/"/g, '""')}"`,
          `"${item.supplier_name || ''}"`,
          `"${item.assigned_user_name || item.assigned_user_email || ''}"`,
          item.tracking_status || 'not_started',
          item.risk_level || 'normal',
          item.progress_percent ?? 0,
          item.due_date || '',
          `"${(item.next_action || '').replace(/"/g, '""')}"`,
          `"${(item.blocker || '').replace(/"/g, '""')}"`
        ].join(',')
      ),
    ]
    downloadCsv('tracking-work-items.csv', rows)
  }

  const exportAssignments = () => {
    const rows = [
      'Project,Project Number,Supplier,Assigned User,Status,Target Date,Section,Subsection,Remarks',
      ...filteredAssignments.map((assignment) =>
        [
          `"${assignment.project_name}"`,
          `"${assignment.project_number}"`,
          `"${assignment.supplier_name}"`,
          `"${assignment.assigned_user_name || assignment.assigned_user_email || ''}"`,
          assignment.current_status,
          assignment.target_date || '',
          `"${assignment.section_name || ''}"`,
          `"${assignment.subsection_name || ''}"`,
          `"${(assignment.remarks || '').replace(/"/g, '""')}"`
        ].join(',')
      ),
    ]
    downloadCsv('tracking-supplier-assignments.csv', rows)
  }

  const metrics = [
    {
      label: 'Active Projects',
      value: summaries.length,
      detail: `${summaries.reduce((sum, item) => sum + item.total_work_items, 0)} tracked work items`,
      icon: FolderKanban,
      cls: 'bg-navy-50 text-navy-700 border-navy-100',
    },
    {
      label: isAdmin ? 'Open Assignments' : 'My Assignments',
      value: myAssignments.length,
      detail: `${overdueAssignments.length} overdue follow-ups`,
      icon: Truck,
      cls: 'bg-amber-50 text-amber-700 border-amber-100',
    },
    {
      label: 'Blocked Items',
      value: blockedItems.length,
      detail: 'Items carrying blocker or critical risk',
      icon: ShieldAlert,
      cls: 'bg-red-50 text-red-700 border-red-100',
    },
    {
      label: 'Recent Updates',
      value: recentUpdates.length,
      detail: 'Latest execution notes from the team',
      icon: PackageCheck,
      cls: 'bg-sky-50 text-sky-700 border-sky-100',
    },
  ]

  return (
    <div className="page-container py-8 page-enter space-y-8">
      <section className="rounded-[2.25rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.7),_transparent_20%),linear-gradient(135deg,#08223d_0%,#13436c_48%,#eef6ff_100%)] px-8 py-9 shadow-xl shadow-slate-900/5">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-sky-100">
              <Briefcase size={12} />
              Project Tracking
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight">Supplier ownership, work-item risk, and follow-up visibility.</h1>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-7 text-slate-100">
              This first release brings tracking out of isolated notes and into a shared execution layer linked to projects, suppliers, sections, and subsections.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/10 p-4 text-white backdrop-blur">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-100">Current Scope</div>
            <div className="mt-3 space-y-2 text-sm font-medium text-slate-100">
              <div>Supplier assignments with ownership</div>
              <div>Work-item linkage to project hierarchy</div>
              <div>Timestamped progress updates</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingAssignment(null)
                setAssignmentModalOpen(true)
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-white/15"
            >
              <Plus className="h-3.5 w-3.5" />
              New Assignment
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, cls }) => (
          <div key={label} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</div>
                <div className="mt-3 text-3xl font-black text-navy-900">{value}</div>
                <div className="mt-2 text-xs font-semibold text-slate-500">{detail}</div>
              </div>
              <div className={`rounded-2xl border p-3 ${cls}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-navy-900">Active Project Signals</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">A project-level rollup of open work, blocked items, and supplier follow-ups.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : summaries.length ? (
            <div className="space-y-3">
              {summaries.map((summary) => (
                <Link
                  key={summary.project_id}
                  to={`/projects/${summary.project_id}?tab=work_items`}
                  className="block rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition-all hover:border-primary-200 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                        {summary.project_number}
                      </div>
                      <h3 className="mt-2 text-lg font-black text-navy-900">{summary.project_name}</h3>
                      <p className="mt-2 text-sm text-slate-500">
                        {summary.total_work_items} work items, {summary.open_supplier_assignments} supplier assignments
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-right text-xs font-semibold text-slate-600">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Blocked</div>
                        <div className="mt-1 text-lg font-black text-red-600">{summary.blocked_work_items}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Overdue</div>
                        <div className="mt-1 text-lg font-black text-amber-600">{summary.overdue_work_items}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm font-medium text-slate-500">
              Tracking data will appear here once supplier assignments and linked work items are created.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-amber-600" />
              <h2 className="text-lg font-black text-navy-900">Overdue Follow-ups</h2>
            </div>
            <div className="space-y-3">
              {overdueAssignments.length ? overdueAssignments.map((assignment) => (
                <div key={assignment.id} className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <div className="text-sm font-black text-amber-900">{assignment.supplier_name}</div>
                  <div className="mt-1 text-xs font-semibold text-amber-800">{assignment.project_name}</div>
                  <div className="mt-2 text-xs text-amber-700">Target: {formatDate(assignment.target_date)}</div>
                </div>
              )) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No overdue supplier follow-ups right now.</div>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <h2 className="text-lg font-black text-navy-900">Blocked Work Items</h2>
            </div>
            <div className="space-y-3">
              {blockedItems.length ? blockedItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black text-navy-900">{item.name}</div>
                    <div className="flex items-center gap-2">
                      <div className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusTone[item.tracking_status || 'blocked'] || statusTone.blocked}`}>
                        {item.tracking_status || 'blocked'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setUpdateItem(item)}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary-600 hover:border-primary-200 hover:bg-primary-50"
                      >
                        Update
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-500">{item.project_name || 'General'}{item.supplier_name ? ` • ${item.supplier_name}` : ''}</div>
                  <div className="mt-2 text-xs text-slate-600">{item.blocker || 'Needs review from the project team.'}</div>
                </div>
              )) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No blocked work items found.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-navy-900">{isAdmin ? 'Team Supplier Ownership' : 'My Supplier Ownership'}</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Ownership records linked to project and supplier context.</p>
            </div>
            <Link to="/suppliers" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-primary-600 hover:text-primary-700">
              Suppliers
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {myAssignments.length ? myAssignments.map((assignment) => (
              <div key={assignment.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-black text-navy-900">{assignment.supplier_name}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">{assignment.project_name} • {assignment.project_number}</div>
                    <div className="mt-2 text-xs text-slate-600">
                      {[assignment.section_name, assignment.subsection_name].filter(Boolean).join(' / ') || 'Project-level tracking'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusTone[assignment.current_status] || statusTone.not_started}`}>
                      {assignment.current_status}
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-500">{formatDate(assignment.target_date)}</div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAssignment(assignment)
                        setAssignmentModalOpen(true)
                      }}
                      className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary-600 hover:text-primary-700"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No supplier assignments yet.</div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-navy-900">Recent Updates</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Timestamped execution notes from the new update stream.</p>
            </div>
          </div>
          <div className="space-y-3">
            {recentUpdates.length ? recentUpdates.map((update) => (
              <div key={update.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-black text-navy-900">{update.work_item_name}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-500">
                      {update.project_name || 'General'}{update.supplier_name ? ` • ${update.supplier_name}` : ''}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-slate-500">{formatDateTime(update.created_at)}</div>
                </div>
                <div className="mt-3 text-sm text-slate-700">{update.update_text}</div>
                <div className="mt-2 text-xs text-slate-500">
                  {update.user_name || update.user_email || 'Unknown user'}
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No updates posted yet.</div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-lg font-black text-navy-900">Tracking Reports</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Filter live tracking records and export the operational view the team is working from.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={exportWorkItems} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-600 hover:border-slate-300 hover:text-navy-900">
              <Download className="h-3.5 w-3.5" />
              Export Work Items
            </button>
            <button type="button" onClick={exportAssignments} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-600 hover:border-slate-300 hover:text-navy-900">
              <Download className="h-3.5 w-3.5" />
              Export Assignments
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project, supplier, owner, or item..."
              className="w-full bg-transparent text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <option value="all">All statuses</option>
            {['not_started', 'in_progress', 'waiting_supplier', 'quoted', 'po_released', 'dispatched', 'received', 'blocked', 'closed'].map((status) => (
              <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <option value="all">All risk levels</option>
            {['low', 'normal', 'high', 'critical'].map((risk) => (
              <option key={risk} value={risk}>{risk}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="rounded border-slate-300" />
            Overdue only
          </label>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-sm font-black text-navy-900">Work Item Report</div>
              <div className="text-xs font-bold text-slate-500">{filteredWorkItems.length} rows</div>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Work Item</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Owner</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkItems.length ? filteredWorkItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <div className="font-bold text-navy-900">{item.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.project_name || 'General'}{item.supplier_name ? ` • ${item.supplier_name}` : ''}</div>
                        <div className="mt-1 text-xs text-slate-400">Due: {item.due_date || 'Not set'} • {item.progress_percent ?? 0}%</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.assigned_user_name || item.assigned_user_email || 'Unassigned'}</td>
                      <td className="px-4 py-3">
                        <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusTone[item.tracking_status || 'not_started'] || statusTone.not_started}`}>
                          {item.tracking_status || 'not_started'}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">Risk: {item.risk_level || 'normal'}</div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">No work items match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-sm font-black text-navy-900">Supplier Ownership Report</div>
              <div className="text-xs font-bold text-slate-500">{filteredAssignments.length} rows</div>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Supplier</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Owner</th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.length ? filteredAssignments.map((assignment) => (
                    <tr key={assignment.id} className="border-b border-slate-100 align-top">
                      <td className="px-4 py-3">
                        <div className="font-bold text-navy-900">{assignment.supplier_name}</div>
                        <div className="mt-1 text-xs text-slate-500">{assignment.project_name} • {assignment.project_number}</div>
                        <div className="mt-1 text-xs text-slate-400">{[assignment.section_name, assignment.subsection_name].filter(Boolean).join(' / ') || 'Project-level tracking'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600">{assignment.assigned_user_name || assignment.assigned_user_email || 'Unassigned'}</td>
                      <td className="px-4 py-3">
                        <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusTone[assignment.current_status] || statusTone.not_started}`}>
                          {assignment.current_status}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">{formatDate(assignment.target_date)}</div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">No assignments match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-black text-navy-900">Supplier Bottlenecks</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Suppliers accumulating the most blocked or overdue execution load.</p>
          </div>
          <div className="space-y-3">
            {supplierBottlenecks.length ? supplierBottlenecks.map((supplier) => (
              <div key={supplier.supplier} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-black text-navy-900">{supplier.supplier}</div>
                  <div className="text-xs font-bold text-slate-500">{supplier.openAssignments} open assignments</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Overdue</div>
                    <div className="mt-1 text-2xl font-black text-amber-900">{supplier.overdueAssignments}</div>
                  </div>
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-red-700">Blocked</div>
                    <div className="mt-1 text-2xl font-black text-red-900">{supplier.blockedItems}</div>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No supplier bottlenecks detected.</div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-black text-navy-900">Project Escalations</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Projects with the heaviest mix of overdue and blocked execution work.</p>
          </div>
          <div className="space-y-3">
            {riskProjects.length ? riskProjects.map((project) => (
              <Link key={project.projectId} to={`/projects/${project.projectId}?tab=work_items`} className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:border-primary-200 hover:bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-black text-navy-900">{project.projectName}</div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Overdue</div>
                    <div className="mt-1 text-2xl font-black text-amber-900">{project.overdue}</div>
                  </div>
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-red-700">Blocked</div>
                    <div className="mt-1 text-2xl font-black text-red-900">{project.blocked}</div>
                  </div>
                </div>
              </Link>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No project escalations right now.</div>
            )}
          </div>
        </div>
      </section>

      <SupplierAssignmentModal
        isOpen={assignmentModalOpen}
        onClose={() => {
          setAssignmentModalOpen(false)
          setEditingAssignment(null)
        }}
        assignment={editingAssignment}
      />

      <WorkItemUpdateModal
        isOpen={!!updateItem}
        onClose={() => setUpdateItem(null)}
        item={updateItem}
      />
    </div>
  )
}
