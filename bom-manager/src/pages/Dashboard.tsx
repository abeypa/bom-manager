import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Layers3,
  Shield,
  ShoppingCart,
  Sparkles,
  UserCircle2,
  Users,
} from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { useRole } from '@/hooks/useRole'
import { supabase } from '@/lib/supabase'
import DiscussionHub from '@/components/dashboard/DiscussionHub'

const formatCurrency = (value?: number) => {
  const amount = Number(value || 0)
  if (amount >= 10000000) return `INR ${(amount / 10000000).toFixed(1)}Cr`
  if (amount >= 100000) return `INR ${(amount / 100000).toFixed(1)}L`
  return `INR ${Math.round(amount).toLocaleString('en-IN')}`
}

const formatDateTime = (value?: string | null) => {
  if (!value) return 'No activity yet'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatShortDate = (value?: string | null) => {
  if (!value) return 'No updates'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

const priorityClass: Record<string, string> = {
  Urgent: 'bg-red-50 text-red-700 border-red-200',
  High: 'bg-orange-50 text-orange-700 border-orange-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-slate-100 text-slate-600 border-slate-200',
}

const statusLabel: Record<string, string> = {
  Pending: 'Open',
  Approved: 'Completed',
  Rejected: 'Needs Rework',
}

const formatCommitDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

export default function Dashboard() {
  const { userEmail, isAdmin } = useRole()

  useEffect(() => {
    document.title = 'Dashboard | BOM Manager'
  }, [])

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const displayName = userEmail
    ? userEmail.split('@')[0].split('.').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : 'Team'

  const { data: currentUserId } = useQuery({
    queryKey: ['dashboard-user-id'],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser()
      return data.user?.id || null
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.getStats,
  })

  const { data: smartDashboard } = useQuery({
    queryKey: ['smart-dashboard'],
    queryFn: dashboardApi.getSmartDashboard,
  })

  const { data: workDashboard, isLoading: isLoadingWork } = useQuery({
    queryKey: ['work-dashboard', currentUserId, isAdmin],
    queryFn: () => dashboardApi.getWorkDashboard(currentUserId as string, isAdmin),
    enabled: !!currentUserId,
  })

  const topCards = [
    {
      title: 'Active Projects',
      value: workDashboard?.counts.total_projects ?? stats?.active_projects ?? 0,
      detail: `${workDashboard?.counts.total_open_items ?? 0} open work items`,
      icon: FolderKanban,
      cls: 'bg-navy-50 text-navy-700 border-navy-100',
    },
    {
      title: isAdmin ? 'Admin Queue' : 'My Open Work',
      value: isAdmin ? workDashboard?.admin_open_work_items.length ?? 0 : workDashboard?.counts.my_open_items ?? 0,
      detail: isAdmin
        ? `${workDashboard?.counts.overdue_items ?? 0} overdue items`
        : `${workDashboard?.counts.waiting_on_me ?? 0} dependency alerts`,
      icon: isAdmin ? Shield : UserCircle2,
      cls: 'bg-amber-50 text-amber-700 border-amber-100',
    },
    {
      title: 'Tracking Escalations',
      value: (workDashboard?.counts.blocked_items ?? 0) + (workDashboard?.counts.overdue_supplier_assignments ?? 0),
      detail: `${workDashboard?.counts.blocked_items ?? 0} blocked • ${workDashboard?.counts.overdue_supplier_assignments ?? 0} supplier overdue`,
      icon: Bell,
      cls: 'bg-violet-50 text-violet-700 border-violet-100',
    },
    {
      title: 'Open PO Value',
      value: formatCurrency(smartDashboard?.kpis.open_po_value),
      detail: `${smartDashboard?.kpis.overdue_pos ?? 0} overdue POs`,
      icon: ShoppingCart,
      cls: 'bg-sky-50 text-sky-700 border-sky-100',
    },
  ]

  const queueItems = isAdmin ? workDashboard?.admin_open_work_items || [] : workDashboard?.my_work_items || []
  const queueTitle = isAdmin ? 'All Pending Work' : 'My Work Queue'
  const queueDescription = isAdmin
    ? 'Admin view of every open work item across all projects, so nothing stays hidden in individual project tabs.'
    : 'Every work item assigned to you, sorted so urgent open work stays at the top.'
  const commitDate = formatCommitDate(__GIT_COMMIT_DATE__)

  return (
    <div className="page-container py-8 page-enter space-y-8">
      <section className="relative overflow-hidden rounded-[2.25rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.55),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.20),_transparent_22%),linear-gradient(135deg,#071428_0%,#123258_45%,#eef7ff_100%)] px-8 py-10 shadow-xl shadow-slate-900/5">
        <div className="absolute -left-10 top-10 h-40 w-40 rounded-full bg-cyan-300/15 blur-3xl" />
        <div className="absolute right-16 top-0 h-48 w-48 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-sky-100">
              <Sparkles size={12} />
              Execution Dashboard
            </div>
            <div className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/15 px-4 py-2 text-[11px] font-bold text-slate-100 shadow-sm backdrop-blur">
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-sky-100">
                v{__APP_VERSION__}
              </span>
              <span className="text-white/70">Last commit</span>
              <span>{commitDate}</span>
              <span className="text-white/40">•</span>
              <span className="font-mono text-sky-100">{__GIT_HASH__}</span>
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight">
              {greeting()}, {displayName}
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-7 text-slate-100">
              Track multiple projects, monitor every pending work item, open discussions that may sit inside or outside projects, and keep finished threads out of the way in a clean archive.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4 xl:min-w-[720px]">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-100">Team Queue</div>
              <div className="mt-2 text-3xl font-black">{workDashboard?.counts.total_open_items ?? 0}</div>
              <div className="mt-1 text-xs font-semibold text-slate-200">Open work across projects</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-100">Alerts</div>
              <div className="mt-2 text-3xl font-black">{workDashboard?.notifications.length ?? 0}</div>
              <div className="mt-1 text-xs font-semibold text-slate-200">Tags and assignments</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-100">Overdue</div>
              <div className="mt-2 text-3xl font-black">{workDashboard?.counts.overdue_items ?? 0}</div>
              <div className="mt-1 text-xs font-semibold text-slate-200">Execution items past due</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-100">At Risk</div>
              <div className="mt-2 text-3xl font-black">{smartDashboard?.kpis.projects_at_risk ?? 0}</div>
              <div className="mt-1 text-xs font-semibold text-slate-200">Projects needing attention</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {topCards.map(({ title, value, detail, icon: Icon, cls }) => (
          <div key={title} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{title}</div>
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

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr,0.95fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-navy-900">{queueTitle}</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">{queueDescription}</p>
            </div>
            <Link to="/projects" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-primary-600 hover:text-primary-700">
              All Projects
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {isLoadingWork ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : queueItems.length ? (
            <div className="space-y-3">
              {queueItems.map((item) => (
                <Link
                  key={item.id}
                  to={item.project_id ? `/projects/${item.project_id}?tab=work_items` : '/dashboard'}
                  className="group block rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-all hover:border-primary-200 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${priorityClass[item.priority] || priorityClass.Medium}`}>
                          {item.priority}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                          {statusLabel[item.status] || item.status}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                          {item.project_name}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-black text-navy-900 group-hover:text-primary-700">{item.name}</h3>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                        {item.description || 'Open the work item to add details, references, or dependency tags for teammates.'}
                      </p>
                    </div>

                    <div className="min-w-[190px] rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Owner</div>
                      <div className="mt-2 text-sm font-bold text-navy-900">{item.assignee_name || item.assignee_email || 'Unassigned'}</div>
                      <div className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Last Update</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(item.updated_at || item.created_at)}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <h3 className="mt-4 text-lg font-black text-navy-900">Nothing pending right now</h3>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {isAdmin ? 'No team work is currently pending.' : 'When work items are assigned to you, they will appear here with project context and priority.'}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-amber-700">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-navy-900">Dashboard Alerts</h2>
                <p className="text-sm font-medium text-slate-500">Tagged dependencies and active assignments that need your attention.</p>
              </div>
            </div>

            {workDashboard?.notifications.length ? (
              <div className="space-y-3">
                {workDashboard.notifications.map((notification) => {
                  const target = notification.project_id ? `/projects/${notification.project_id}?tab=work_items` : '/dashboard'
                  return (
                    <Link
                      key={notification.id}
                      to={target}
                      className="block rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-all hover:border-primary-200 hover:bg-white"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                          notification.kind === 'mention'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : notification.kind === 'overdue' || notification.kind === 'supplier_followup'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : 'border-sky-200 bg-sky-50 text-sky-700'
                        }`}>
                          {notification.kind === 'mention'
                            ? 'Dependency Tag'
                            : notification.kind === 'overdue'
                              ? 'Overdue'
                              : notification.kind === 'supplier_followup'
                                ? 'Supplier Follow-up'
                                : 'Assigned'}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                          {formatShortDate(notification.created_at)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-sm font-black text-navy-900">{notification.work_item_name}</h3>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                        {notification.project_name} • {notification.project_number}
                      </p>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{notification.message}</p>
                      <div className="mt-3 text-xs font-semibold text-slate-500">
                        {notification.from_name || notification.from_email || 'System'}
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center">
                <Bell className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-500">No active alerts right now.</p>
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3 text-sky-700">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-navy-900">Team Workload</h2>
                <p className="text-sm font-medium text-slate-500">Open work distribution based on current assignees.</p>
              </div>
            </div>

            <div className="space-y-3">
              {(workDashboard?.workload.length ? workDashboard.workload : []).map((user) => (
                <div key={user.user_id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-navy-900">{user.name}</div>
                      <div className="text-xs font-medium text-slate-500">{user.email || 'No email'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-navy-900">{user.open_items}</div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Open Items</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>{user.urgent_items} urgent</span>
                    {isAdmin && <span>Admin can rebalance from the project work tabs</span>}
                  </div>
                </div>
              ))}

              {!workDashboard?.workload.length && (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-8 text-center text-sm font-semibold text-slate-500">
                  Team workload will appear after work items are assigned to users.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-navy-900">Escalation Queue</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Overdue items and blocked work that should be cleared first.</p>
            </div>
            <Link to="/project-tracking" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-primary-600 hover:text-primary-700">
              Tracking
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Overdue Items</div>
              <div className="mt-2 text-3xl font-black text-amber-900">{workDashboard?.counts.overdue_items ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-red-700">Blocked Items</div>
              <div className="mt-2 text-3xl font-black text-red-900">{workDashboard?.counts.blocked_items ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Supplier Delays</div>
              <div className="mt-2 text-3xl font-black text-violet-900">{workDashboard?.counts.overdue_supplier_assignments ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-black text-navy-900">Execution Signals</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Cross-check project risk against open execution debt.</p>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Projects At Risk</div>
              <div className="mt-2 text-3xl font-black text-navy-900">{smartDashboard?.kpis.projects_at_risk ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Open Discussions</div>
              <div className="mt-2 text-3xl font-black text-navy-900">{workDashboard?.counts.open_discussions ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Notifications</div>
              <div className="mt-2 text-3xl font-black text-navy-900">{workDashboard?.notifications.length ?? 0}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr,0.7fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-navy-900">Project Progress Tracker</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Completion is based on work items marked completed inside each project.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
              {workDashboard?.active_projects.length ?? 0} tracked projects
            </div>
          </div>

          <div className="space-y-4">
            {(workDashboard?.active_projects || []).map((project) => (
              <Link
                key={project.project_id}
                to={`/projects/${project.project_id}?tab=work_items`}
                className="block rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-5 transition-all hover:border-primary-200 hover:bg-white"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{project.project_number}</span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        {project.status || 'active'}
                      </span>
                    </div>
                    <h3 className="mt-2 text-lg font-black text-navy-900">{project.project_name}</h3>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-navy-700 via-sky-600 to-emerald-500"
                        style={{ width: `${Math.max(project.completion_percent, 4)}%` }}
                      />
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-500">
                      {project.completed_items}/{project.total_items} work items completed
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4 lg:min-w-[420px]">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Open</div>
                      <div className="mt-2 text-2xl font-black text-navy-900">{project.open_items}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Mine</div>
                      <div className="mt-2 text-2xl font-black text-navy-900">{project.my_open_items}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Waiting On Me</div>
                      <div className="mt-2 text-2xl font-black text-navy-900">{project.waiting_on_me_count}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Activity</div>
                      <div className="mt-2 text-sm font-black text-navy-900">{formatShortDate(project.last_activity_at)}</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {!workDashboard?.active_projects.length && (
              <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center">
                <Layers3 className="mx-auto h-10 w-10 text-slate-300" />
                <h3 className="mt-4 text-lg font-black text-navy-900">No work items yet</h3>
                <p className="mt-2 text-sm font-medium text-slate-500">Create project work items to start tracking progress across multiple projects from this dashboard.</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl border border-red-100 bg-red-50 p-3 text-red-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-navy-900">Operational Watch</h2>
              <p className="text-sm font-medium text-slate-500">A quick pulse on risk around project delivery and procurement.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Projects At Risk</span>
                <Clock3 className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-2 text-3xl font-black text-navy-900">{smartDashboard?.kpis.projects_at_risk ?? 0}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Projects with procurement or completion pressure</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">BOM / PO Gap</span>
                <ShoppingCart className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-2 text-3xl font-black text-navy-900">{formatCurrency(smartDashboard?.kpis.bom_po_gap_value)}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Value still uncovered by purchase orders</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pending Procurement</span>
                <FolderKanban className="h-4 w-4 text-navy-600" />
              </div>
              <div className="mt-2 text-3xl font-black text-navy-900">{smartDashboard?.kpis.pending_procurement_parts ?? 0}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">BOM parts not yet mapped to PO lines</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Latest Analysis</span>
                <Bell className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-sm font-black text-navy-900">{formatDateTime(smartDashboard?.generated_at)}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Smart dashboard signals refreshed from live project and PO data</div>
            </div>
          </div>
        </div>
      </section>

      <DiscussionHub
        openDiscussions={workDashboard?.open_discussions || []}
        closedDiscussions={workDashboard?.closed_discussions || []}
      />
    </div>
  )
}
