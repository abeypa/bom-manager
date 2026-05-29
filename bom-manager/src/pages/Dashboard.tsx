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
  ShoppingCart,
  UserCircle2,
  Users,
} from 'lucide-react'
import { dashboardApi } from '@/api/dashboard'
import { useRole } from '@/hooks/useRole'
import { supabase } from '@/lib/supabase'

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
    queryKey: ['work-dashboard', currentUserId],
    queryFn: () => dashboardApi.getWorkDashboard(currentUserId as string),
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
      title: 'My Open Work',
      value: workDashboard?.counts.my_open_items ?? 0,
      detail: `${workDashboard?.counts.waiting_on_me ?? 0} dependency alerts`,
      icon: UserCircle2,
      cls: 'bg-amber-50 text-amber-700 border-amber-100',
    },
    {
      title: 'Completed Work',
      value: workDashboard?.counts.completed_items ?? 0,
      detail: `${smartDashboard?.kpis.projects_at_risk ?? 0} projects at risk`,
      icon: CheckCircle2,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    },
    {
      title: 'Open PO Value',
      value: formatCurrency(smartDashboard?.kpis.open_po_value),
      detail: `${smartDashboard?.kpis.overdue_pos ?? 0} overdue POs`,
      icon: ShoppingCart,
      cls: 'bg-sky-50 text-sky-700 border-sky-100',
    },
  ]

  return (
    <div className="page-container py-8 page-enter space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.06),_transparent_32%),linear-gradient(135deg,#ffffff_0%,#f8fafc_45%,#eef6ff_100%)] px-8 py-8 shadow-sm">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-amber-200/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-28 w-28 rounded-full bg-sky-200/30 blur-2xl" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Project Workboard</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-navy-900">
              {greeting()}, {displayName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-600">
              Track multiple projects from one place, follow assigned work items, and catch cross-team dependencies the moment someone tags you to unblock their task.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:w-[540px]">
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Team Queue</div>
              <div className="mt-2 text-3xl font-black text-navy-900">{workDashboard?.counts.total_open_items ?? 0}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Open work items across all projects</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">My Queue</div>
              <div className="mt-2 text-3xl font-black text-navy-900">{workDashboard?.counts.my_open_items ?? 0}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Assigned to me right now</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Alerts</div>
              <div className="mt-2 text-3xl font-black text-navy-900">{workDashboard?.notifications.length ?? 0}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">Assignments and tagged blockers</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {topCards.map(({ title, value, detail, icon: Icon, cls }) => (
          <div key={title} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
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
              <h2 className="text-xl font-black text-navy-900">My Work Queue</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Every work item assigned to you, sorted so urgent open work stays at the top.</p>
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
          ) : workDashboard?.my_work_items.length ? (
            <div className="space-y-3">
              {workDashboard.my_work_items.slice(0, 6).map((item) => (
                <Link
                  key={item.id}
                  to={`/projects/${item.project_id}?tab=work_items`}
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
                          {item.project_number}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-black text-navy-900 group-hover:text-primary-700">{item.name}</h3>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{item.project_name}</p>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                        {item.description || 'Open the work item to add details, references, or dependency tags for teammates.'}
                      </p>
                    </div>

                    <div className="min-w-[180px] rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Requested By</div>
                      <div className="mt-2 text-sm font-bold text-navy-900">{item.requester_name || item.requester_email || 'Unknown'}</div>
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
              <h3 className="mt-4 text-lg font-black text-navy-900">Your queue is clear</h3>
              <p className="mt-2 text-sm font-medium text-slate-500">When work items are assigned to you, they will appear here with project context and priority.</p>
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
                {workDashboard.notifications.map((notification) => (
                  <Link
                    key={notification.id}
                    to={`/projects/${notification.project_id}?tab=work_items`}
                    className="block rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-all hover:border-primary-200 hover:bg-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                        notification.kind === 'mention'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-sky-200 bg-sky-50 text-sky-700'
                      }`}>
                        {notification.kind === 'mention' ? 'Dependency Tag' : 'Assigned'}
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
                ))}
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
                    {isAdmin && <span>Use Work Items tab to rebalance load</span>}
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
    </div>
  )
}
