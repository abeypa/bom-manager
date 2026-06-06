import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Camera, CheckCircle2, Factory, FolderKanban, Search, Truck } from 'lucide-react'
import { projectTrackingApi, type ManufacturedPartTrackingItem } from '@/api/project-tracking'
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

const statusPillClass = (item: ManufacturedPartTrackingItem) => {
  if (item.is_received) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (item.blocker || item.tracking_status === 'blocked') return 'border-red-200 bg-red-50 text-red-700'
  if (item.tracking_status === 'waiting_supplier') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

export default function ManufacturedPartSupplierTracking() {
  const { user } = useAuth()
  const { isAdmin } = useRole()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [updateItem, setUpdateItem] = useState<ManufacturedPartTrackingItem | null>(null)

  useEffect(() => {
    document.title = 'Manufactured Part Supplier Tracking | BOM Manager'
  }, [])

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['project-tracking-manufactured-items', user?.id, isAdmin],
    queryFn: () => projectTrackingApi.getManufacturedPartWorkItems(isAdmin ? undefined : user!.id),
    enabled: !!user?.id,
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

  const supplierGroups = useMemo(() => {
    const groups = new Map<string, { supplierName: string; items: ManufacturedPartTrackingItem[] }>()
    for (const item of filteredItems) {
      const key = item.supplier_name || 'Unassigned Supplier'
      const existing = groups.get(key) || { supplierName: key, items: [] }
      existing.items.push(item)
      groups.set(key, existing)
    }
    return Array.from(groups.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName))
  }, [filteredItems])

  const summary = useMemo(() => ({
    total: filteredItems.length,
    open: filteredItems.filter((item) => !item.is_received).length,
    closed: filteredItems.filter((item) => item.is_received).length,
    suppliers: supplierGroups.length,
  }), [filteredItems, supplierGroups.length])

  return (
    <>
      <div className="page-container py-8 page-enter space-y-8">
        <section className="rounded-[2.25rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.7),_transparent_20%),linear-gradient(135deg,#331707_0%,#955d16_48%,#fff8ef_100%)] px-8 py-9 shadow-xl shadow-slate-900/5">
          <div className="max-w-4xl text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100">
              <Factory size={12} />
              Manufactured Part Supplier Tracking
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-tight">Track every manufactured BOM part by project and supplier.</h1>
            <p className="mt-4 max-w-3xl text-sm font-medium leading-7 text-amber-50">
              Mechanical Manufacture and Electrical Manufacture parts are synced from the BOM, updated daily with supplier progress, photos, revised delivery dates, and closed automatically once receipt is complete.
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Tracked Parts</div>
            <div className="mt-3 text-3xl font-black text-navy-900">{summary.total}</div>
          </div>
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Open Tracking</div>
            <div className="mt-3 text-3xl font-black text-amber-700">{summary.open}</div>
          </div>
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Closed On Receipt</div>
            <div className="mt-3 text-3xl font-black text-emerald-700">{summary.closed}</div>
          </div>
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Suppliers</div>
            <div className="mt-3 text-3xl font-black text-sky-700">{summary.suppliers}</div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
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

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <FolderKanban className="h-5 w-5 text-primary-600" />
            <div>
              <h2 className="text-lg font-black text-navy-900">Project-wise Tracking</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Review manufactured parts grouped by project before drilling into suppliers.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : projectGroups.length ? (
            <div className="space-y-4">
              {projectGroups.map((group) => (
                <div key={`${group.projectId}-${group.projectName}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      {group.projectId ? (
                        <Link to={`/projects/${group.projectId}?tab=manufactured`} className="text-base font-black text-navy-900 hover:text-primary-600">
                          {group.projectName}
                        </Link>
                      ) : (
                        <div className="text-base font-black text-navy-900">{group.projectName}</div>
                      )}
                      <div className="mt-1 text-xs font-semibold text-slate-500">{group.projectNumber || 'No project number'} • {group.items.length} manufactured parts</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Total</div>
                        <div className="mt-1 text-lg font-black text-navy-900">{group.items.length}</div>
                      </div>
                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">Open</div>
                        <div className="mt-1 text-lg font-black text-amber-900">{group.items.filter((item) => !item.is_received).length}</div>
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">Closed</div>
                        <div className="mt-1 text-lg font-black text-emerald-900">{group.items.filter((item) => item.is_received).length}</div>
                      </div>
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
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <Truck className="h-5 w-5 text-primary-600" />
            <div>
              <h2 className="text-lg font-black text-navy-900">Supplier-wise Tracking</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Daily execution view for each manufacturing supplier across all projects.</p>
            </div>
          </div>

          {supplierGroups.length ? (
            <div className="space-y-4">
              {supplierGroups.map((group) => (
                <div key={group.supplierName} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <div className="text-base font-black text-navy-900">{group.supplierName}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">{group.items.length} manufactured parts linked to this supplier</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Total</div>
                        <div className="mt-1 text-lg font-black text-navy-900">{group.items.length}</div>
                      </div>
                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-700">Open</div>
                        <div className="mt-1 text-lg font-black text-amber-900">{group.items.filter((item) => !item.is_received).length}</div>
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-center">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">Closed</div>
                        <div className="mt-1 text-lg font-black text-emerald-900">{group.items.filter((item) => item.is_received).length}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Part</th>
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Project</th>
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Area</th>
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Receipt</th>
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Delivery</th>
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Status</th>
                          <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => (
                          <tr key={item.id} className="border-b border-slate-100">
                            <td className="px-3 py-3">
                              <div className="font-bold text-navy-900">{item.part_number}</div>
                              <div className="mt-1 text-xs text-slate-500">{item.description || 'No description'}</div>
                            </td>
                            <td className="px-3 py-3 text-xs font-semibold text-slate-600">{item.project_name || 'General'}</td>
                            <td className="px-3 py-3 text-xs font-semibold text-slate-600">{[item.section_name, item.subsection_name].filter(Boolean).join(' / ') || 'Project-level'}</td>
                            <td className="px-3 py-3 text-xs font-semibold text-slate-600">{item.received_quantity} / {item.required_quantity}</td>
                            <td className="px-3 py-3 text-xs font-semibold text-slate-600">{formatDate(item.target_date)}</td>
                            <td className="px-3 py-3">
                              <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusPillClass(item)}`}>
                                {item.is_received ? 'closed' : (item.tracking_status || 'not_started').replace(/_/g, ' ')}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <button
                                type="button"
                                onClick={() => setUpdateItem(item)}
                                disabled={item.is_received}
                                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${
                                  item.is_received
                                    ? 'cursor-not-allowed border border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border border-primary-200 bg-white text-primary-600 hover:bg-primary-50'
                                }`}
                              >
                                {item.is_received ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
                                {item.is_received ? 'Closed' : 'Daily Update'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm text-slate-500">
              No suppliers match the current manufactured tracking filters.
            </div>
          )}
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
