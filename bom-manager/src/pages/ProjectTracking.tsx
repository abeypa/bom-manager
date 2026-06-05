import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Clock3,
  FolderKanban,
  Plus,
  PackageCheck,
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

export default function ProjectTracking() {
  const { user } = useAuth()
  const { isAdmin } = useRole()
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<TrackingSupplierAssignment | null>(null)
  const [updateItem, setUpdateItem] = useState<TrackingWorkItem | null>(null)

  useEffect(() => {
    document.title = 'Project Tracking | BOM Manager'
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['project-tracking-dashboard', user?.id, isAdmin],
    queryFn: () => projectTrackingApi.getDashboard(user!.id, isAdmin),
    enabled: !!user?.id,
  })

  const summaries = data?.summaries || []
  const myAssignments = data?.my_assignments || []
  const overdueAssignments = data?.overdue_assignments || []
  const blockedItems = data?.blocked_work_items || []
  const recentUpdates = data?.recent_updates || []

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
