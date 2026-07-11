import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Clock3, FolderKanban, PackageCheck, ShieldAlert, Truck } from 'lucide-react'
import { projectTrackingApi, type TrackingWorkItem } from '@/api/project-tracking'
import { issuesApi } from '@/api/issues'
import { purchaseOrdersApi } from '@/api/purchase-orders'
import { useAuth } from '@/context/AuthContext'
import { useRole } from '@/hooks/useRole'
import WorkItemUpdateModal from '@/components/project-tracking/WorkItemUpdateModal'
import { chipClass, formatDate, formatDateTime, statusTone } from './trackingShared'

export default function TrackingOverviewTab() {
  const { user } = useAuth()
  const { isAdmin } = useRole()
  const [updateItem, setUpdateItem] = useState<TrackingWorkItem | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['project-tracking-dashboard', user?.id, isAdmin],
    queryFn: () => projectTrackingApi.getDashboard(user!.id, isAdmin),
    enabled: !!user?.id,
  })

  const { data: openCounts } = useQuery({
    queryKey: ['issue-open-counts'],
    queryFn: issuesApi.getOpenCounts,
  })

  const { data: deliveryPos = [] } = useQuery({
    queryKey: ['po-delivery-tracking'],
    queryFn: () => purchaseOrdersApi.getDeliveryTracking(),
  })

  const summaries = data?.summaries || []
  const overdueAssignments = data?.overdue_assignments || []
  const blockedItems = data?.blocked_work_items || []
  const recentUpdates = data?.recent_updates || []
  const overduePoCount = (deliveryPos as any[]).filter((po) => po.is_overdue).length

  const metrics = [
    {
      label: 'Open Issues',
      value: openCounts?.total ?? 0,
      detail: 'Across projects and POs',
      icon: ShieldAlert,
      to: '?tab=issues',
      cls: 'bg-red-50 text-red-700 border-red-100',
    },
    {
      label: 'Overdue POs',
      value: overduePoCount,
      detail: 'Past expected delivery date',
      icon: Truck,
      to: '?tab=deliveries',
      cls: 'bg-amber-50 text-amber-700 border-amber-100',
    },
    {
      label: 'Blocked Work Items',
      value: blockedItems.length,
      detail: 'Carrying blocker or critical risk',
      icon: AlertTriangle,
      to: '?tab=work-items',
      cls: 'bg-orange-50 text-orange-700 border-orange-100',
    },
    {
      label: 'Active Projects',
      value: summaries.length,
      detail: `${summaries.reduce((sum, item) => sum + item.total_work_items, 0)} tracked work items`,
      icon: FolderKanban,
      to: '?tab=projects',
      cls: 'bg-sky-50 text-sky-700 border-sky-100',
    },
  ]

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, cls, to }) => (
          <Link key={label} to={to} className="stat-card hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="label-caps">{label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
                <div className="mt-1 text-xs text-slate-500">{detail}</div>
              </div>
              <div className={`rounded-lg border p-2.5 ${cls}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="card p-5">
          <div className="mb-4">
            <h2 className="section-title">Active Project Signals</h2>
            <p className="mt-1 text-sm text-slate-500">Project-level rollup of open work, blocked items, and follow-ups.</p>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <div className="skeleton h-20 w-full" />
              <div className="skeleton h-20 w-full" />
            </div>
          ) : summaries.length ? (
            <div className="space-y-2.5">
              {summaries.map((summary) => (
                <Link
                  key={summary.project_id}
                  to={`/projects/${summary.project_id}?tab=work_items`}
                  className="block rounded-lg border border-[var(--border-subtle)] bg-[var(--slate-50)] p-3.5 transition-colors hover:border-sky-200 hover:bg-white"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-400">{summary.project_number}</div>
                      <h3 className="mt-0.5 truncate text-sm font-semibold text-slate-900">{summary.project_name}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {summary.total_work_items} work items · {summary.open_supplier_assignments} supplier assignments
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-4 text-xs">
                      <div className="text-right">
                        <div className="label-caps">Blocked</div>
                        <div className="mt-0.5 text-base font-semibold text-red-600">{summary.blocked_work_items}</div>
                      </div>
                      <div className="text-right">
                        <div className="label-caps">Overdue</div>
                        <div className="mt-0.5 text-base font-semibold text-amber-600">{summary.overdue_work_items}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state text-sm text-slate-500">
              Tracking data will appear here once supplier assignments and linked work items are created.
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-amber-600" />
              <h2 className="section-title !text-sm">Overdue Follow-ups</h2>
            </div>
            <div className="space-y-2">
              {overdueAssignments.length ? overdueAssignments.map((assignment) => (
                <div key={assignment.id} className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5">
                  <div className="text-sm font-medium text-amber-900">{assignment.supplier_name}</div>
                  <div className="mt-0.5 text-xs text-amber-700">{assignment.project_name} · Target {formatDate(assignment.target_date)}</div>
                </div>
              )) : (
                <div className="text-sm text-slate-400">No overdue supplier follow-ups.</div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <h2 className="section-title !text-sm">Blocked Work Items</h2>
            </div>
            <div className="space-y-2">
              {blockedItems.length ? blockedItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--slate-50)] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium text-slate-900">{item.name}</div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={chipClass(statusTone, item.tracking_status || 'blocked')}>
                        {(item.tracking_status || 'blocked').replace(/_/g, ' ')}
                      </span>
                      <button className="btn btn-ghost btn-xs" onClick={() => setUpdateItem(item)}>Update</button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.project_name || 'General'}{item.supplier_name ? ` · ${item.supplier_name}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">{item.blocker || 'Needs review from the project team.'}</div>
                </div>
              )) : (
                <div className="text-sm text-slate-400">No blocked work items found.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-sky-600" />
            <h2 className="section-title !text-sm">Recent Updates</h2>
          </div>
          <Link to="?tab=work-items" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-brand)] hover:underline">
            All work items
            <ArrowRight size={13} />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {recentUpdates.length ? recentUpdates.map((update) => (
            <div key={update.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--slate-50)] px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{update.work_item_name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {update.project_name || 'General'}{update.supplier_name ? ` · ${update.supplier_name}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-slate-400">{formatDateTime(update.created_at)}</div>
              </div>
              <div className="mt-2 text-sm text-slate-700">{update.update_text}</div>
              {update.updated_delivery_date && (
                <div className="mt-1 text-xs font-medium text-amber-700">Updated delivery: {formatDate(update.updated_delivery_date)}</div>
              )}
              {!!(update.images && update.images.length) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {update.images.map((image: string, index: number) => (
                    <a key={index} href={image} target="_blank" rel="noreferrer" className="block h-12 w-12 overflow-hidden rounded-md border border-[var(--border-subtle)]">
                      <img src={image} alt="Update evidence" className="h-full w-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <div className="mt-1.5 text-xs text-slate-400">{update.user_name || update.user_email || 'Unknown user'}</div>
            </div>
          )) : (
            <div className="text-sm text-slate-400 lg:col-span-2">No updates posted yet.</div>
          )}
        </div>
      </section>

      <WorkItemUpdateModal
        isOpen={!!updateItem}
        onClose={() => setUpdateItem(null)}
        item={updateItem}
      />
    </div>
  )
}
