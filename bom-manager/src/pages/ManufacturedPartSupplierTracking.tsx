import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Camera, CheckCircle2, Clock3, Factory, FolderKanban, Search, UserCircle2 } from 'lucide-react'
import { projectTrackingApi, type ManufacturedPartTrackingItem, type TrackingWorkItemUpdate } from '@/api/project-tracking'
import { useAuth } from '@/context/AuthContext'
import { useRole } from '@/hooks/useRole'
import WorkItemUpdateModal from '@/components/project-tracking/WorkItemUpdateModal'

const formatDate = (value?: string | null) => {
  if (!value) return 'Not set'
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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const statusPillClass = (item: ManufacturedPartTrackingItem) => {
  if (item.is_received) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (item.blocker || item.tracking_status === 'blocked') return 'border-red-200 bg-red-50 text-red-700'
  if (item.tracking_status === 'waiting_supplier') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

const progressBarClass = (item: ManufacturedPartTrackingItem) => {
  if (item.is_received) return 'bg-emerald-500'
  if (item.blocker || item.tracking_status === 'blocked') return 'bg-red-500'
  if (item.tracking_status === 'waiting_supplier') return 'bg-amber-500'
  return 'bg-sky-500'
}

const getLatestUpdateSummary = (
  updatesByItem: Record<number, TrackingWorkItemUpdate[]>,
  item: ManufacturedPartTrackingItem,
) => {
  const latestUpdate = updatesByItem[item.id]?.[0]

  return {
    updatedBy:
      latestUpdate?.user_name ||
      latestUpdate?.user_email ||
      item.assigned_user_name ||
      item.assigned_user_email ||
      'No owner yet',
    updatedAt: latestUpdate?.created_at || item.updated_at || null,
    note:
      latestUpdate?.update_text?.trim() ||
      item.next_action ||
      item.blocker ||
      'Waiting for first supplier update.',
  }
}

export default function ManufacturedPartSupplierTracking() {
  const { user } = useAuth()
  const { isAdmin } = useRole()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('open')
  const [updateItem, setUpdateItem] = useState<ManufacturedPartTrackingItem | null>(null)

  useEffect(() => {
    document.title = 'Manufactured Part Supplier Tracking | BOM Manager'
  }, [])

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['project-tracking-manufactured-items', user?.id, isAdmin],
    queryFn: () => projectTrackingApi.getManufacturedPartWorkItems(isAdmin ? undefined : user!.id),
    enabled: !!user?.id,
  })

  const { data: updatesByItem = {} } = useQuery<Record<number, TrackingWorkItemUpdate[]>>({
    queryKey: ['manufactured-work-item-updates', items.map((item) => item.id).sort((a, b) => a - b).join(',')],
    queryFn: () => projectTrackingApi.getWorkItemUpdates(items.map((item) => item.id)),
    enabled: items.length > 0,
  })

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesSearch =
        !query ||
        item.part_number.toLowerCase().includes(query) ||
        (item.project_name || '').toLowerCase().includes(query) ||
        (item.supplier_name || '').toLowerCase().includes(query) ||
        (item.subsection_name || '').toLowerCase().includes(query)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'closed' ? item.is_received : !item.is_received)
      return matchesSearch && matchesStatus
    })
  }, [items, search, statusFilter])

  const projectGroups = useMemo(() => {
    const groups = new Map<number, { projectId: number; projectName: string; projectNumber: string; items: ManufacturedPartTrackingItem[] }>()
    for (const item of filteredItems) {
      const projectId = item.project_id || 0
      const existing = groups.get(projectId) || {
        projectId,
        projectName: item.project_name || 'General',
        projectNumber: item.project_number || '',
        items: [],
      }
      existing.items.push(item)
      groups.set(projectId, existing)
    }
    return Array.from(groups.values()).sort((a, b) => a.projectName.localeCompare(b.projectName))
  }, [filteredItems])

  const supplierCount = useMemo(
    () => new Set(filteredItems.map((item) => item.supplier_name || 'Unassigned Supplier')).size,
    [filteredItems],
  )

  const summary = useMemo(() => ({
    total: filteredItems.length,
    open: filteredItems.filter((item) => !item.is_received).length,
    closed: filteredItems.filter((item) => item.is_received).length,
    suppliers: supplierCount,
  }), [filteredItems, supplierCount])

  const recentActivityCount = useMemo(
    () => filteredItems.filter((item) => !!updatesByItem[item.id]?.length).length,
    [filteredItems, updatesByItem],
  )

  const attentionCount = useMemo(
    () => filteredItems.filter((item) => !item.is_received && (item.tracking_status === 'blocked' || !!item.blocker)).length,
    [filteredItems],
  )

  return (
    <>
      <div className="page-container py-8 page-enter space-y-8">
        <section className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#fffdf8_0%,#ffffff_38%,#f8fbff_100%)] px-8 py-8 shadow-sm">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-amber-700">
                <Factory size={12} />
                Manufactured Part Tracking
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-navy-900">Simplified manufacturing tracker for supplier follow-up.</h1>
              <p className="mt-4 max-w-3xl text-sm font-medium leading-7 text-slate-600">
                A cleaner operations board showing receipt progress, delivery date, owner, current action, and the last update with who changed it and when.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:min-w-[340px]">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Items With Updates</div>
                <div className="mt-2 text-2xl font-black text-navy-900">{recentActivityCount}</div>
              </div>
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Needs Attention</div>
                <div className="mt-2 text-2xl font-black text-red-700">{attentionCount}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Tracked Parts</div>
            <div className="mt-3 text-3xl font-black text-navy-900">{summary.total}</div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Open Tracking</div>
            <div className="mt-3 text-3xl font-black text-amber-700">{summary.open}</div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Closed On Receipt</div>
            <div className="mt-3 text-3xl font-black text-emerald-700">{summary.closed}</div>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Suppliers</div>
            <div className="mt-3 text-3xl font-black text-sky-700">{summary.suppliers}</div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-black text-navy-900">Live Filters</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Search by project, supplier, part number, or subsection and switch between open and closed manufacturing items.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-[280px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search project, supplier, part..."
                  className="w-full bg-transparent text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'closed')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
              >
                <option value="all">All items</option>
                <option value="open">Open tracking</option>
                <option value="closed">Closed items</option>
              </select>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <FolderKanban className="h-5 w-5 text-primary-600" />
              <div>
                <h2 className="text-lg font-black text-navy-900">Project Snapshot</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">Quick count by project.</p>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
              </div>
            ) : projectGroups.length ? (
              <div className="space-y-3">
                {projectGroups.map((group) => (
                  <div key={`${group.projectId}-${group.projectName}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {group.projectId ? (
                          <Link to={`/projects/${group.projectId}?tab=manufactured`} className="block truncate text-sm font-black text-navy-900 hover:text-primary-600">
                            {group.projectName}
                          </Link>
                        ) : (
                          <div className="truncate text-sm font-black text-navy-900">{group.projectName}</div>
                        )}
                        <div className="mt-1 text-[11px] font-semibold text-slate-500">{group.projectNumber || 'No project number'}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Open</div>
                        <div className="mt-1 text-base font-black text-amber-700">{group.items.filter((item) => !item.is_received).length}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">
                No manufactured parts match the current filters.
              </div>
            )}
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-lg font-black text-navy-900">Execution Board</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">A proven tracker layout: one part per card with status, progress, owner, delivery, and last activity.</p>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              </div>
            ) : filteredItems.length ? (
              <div className="space-y-4">
                {filteredItems.map((item) => {
                  const latest = getLatestUpdateSummary(updatesByItem, item)
                  const progressPercent = Math.max(0, Math.min(100, item.progress_percent ?? 0))

                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-black text-navy-900">{item.part_number}</div>
                            <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusPillClass(item)}`}>
                              {item.is_received ? 'closed' : (item.tracking_status || 'not_started').replace(/_/g, ' ')}
                            </div>
                            {(item.blocker || item.tracking_status === 'blocked') && (
                              <div className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-red-700">
                                <AlertTriangle className="h-3 w-3" />
                                Attention
                              </div>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">{item.description || 'No description'}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-slate-500">
                            <span>{item.project_name || 'General'}</span>
                            <span>{item.supplier_name || 'Unassigned Supplier'}</span>
                            <span>{[item.section_name, item.subsection_name].filter(Boolean).join(' / ') || 'Project-level'}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setUpdateItem(item)}
                          disabled={item.is_received}
                          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${
                            item.is_received
                              ? 'cursor-not-allowed border border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border border-primary-200 bg-white text-primary-600 hover:bg-primary-50'
                          }`}
                        >
                          {item.is_received ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
                          {item.is_received ? 'Closed' : 'Daily Update'}
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Receipt</div>
                          <div className="mt-1 text-sm font-black text-navy-900">{item.received_quantity} / {item.required_quantity}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Balance</div>
                          <div className="mt-1 text-sm font-black text-amber-700">{item.remaining_quantity}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Delivery</div>
                          <div className="mt-1 text-sm font-bold text-slate-700">{formatDate(item.target_date)}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Owner</div>
                          <div className="mt-1 text-sm font-bold text-slate-700">{item.assigned_user_name || item.assigned_user_email || 'Unassigned'}</div>
                        </div>
                        <div className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Progress</div>
                            <div className="text-[11px] font-black text-slate-500">{progressPercent}%</div>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-slate-100">
                            <div className={`h-2 rounded-full transition-all ${progressBarClass(item)}`} style={{ width: `${progressPercent}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.95fr)]">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Current Action</div>
                          <div className="mt-2 text-sm leading-6 text-slate-700">
                            {item.next_action || item.blocker || 'No current action recorded.'}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                            <Clock3 className="h-3.5 w-3.5" />
                            Last Update
                          </div>
                          <div className="mt-3 flex items-start gap-3">
                            <div className="rounded-full bg-slate-100 p-2 text-slate-500">
                              <UserCircle2 className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-black text-navy-900">{latest.updatedBy}</div>
                              <div className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(latest.updatedAt)}</div>
                              <div className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{latest.note}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">
                No manufactured parts match the current filters.
              </div>
            )}
          </div>
        </section>
      </div>

      <WorkItemUpdateModal
        isOpen={!!updateItem}
        onClose={() => setUpdateItem(null)}
        item={updateItem}
      />
    </>
  )
}
