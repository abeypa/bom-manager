import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera, CheckCircle2, Clock3, Factory, MessageSquareText, PackageSearch, Truck } from 'lucide-react'
import { projectTrackingApi, type ManufacturedPartTrackingItem, type TrackingWorkItemUpdate } from '@/api/project-tracking'
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
  if (!value) return 'Unknown time'
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

type Props = {
  projectId: number
}

export default function ManufacturedPartsTrackingTab({ projectId }: Props) {
  const [view, setView] = useState<'all' | 'open' | 'received'>('all')
  const [updateItem, setUpdateItem] = useState<ManufacturedPartTrackingItem | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showBulkUpdate, setShowBulkUpdate] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState<Record<number, boolean>>({})

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['project-manufactured-tracking', projectId],
    queryFn: () => projectTrackingApi.getProjectManufacturedPartTracking(projectId),
    enabled: !!projectId,
  })

  const { data: updatesByItem = {} } = useQuery<Record<number, TrackingWorkItemUpdate[]>>({
    queryKey: ['work-item-updates', projectId, items.map((item) => item.id).sort((a, b) => a - b).join(',')],
    queryFn: () => projectTrackingApi.getWorkItemUpdates(items.map((item) => item.id)),
    enabled: items.length > 0,
  })

  const visibleItems = useMemo(() => {
    if (view === 'open') return items.filter((item) => !item.is_received)
    if (view === 'received') return items.filter((item) => item.is_received)
    return items
  }, [items, view])

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  )

  useEffect(() => {
    const validIds = new Set(items.filter((item) => !item.is_received).map((item) => item.id))
    setSelectedIds((prev) => prev.filter((id) => validIds.has(id)))
  }, [items])

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]))
  }

  const selectAllVisibleOpen = () => {
    const openVisibleIds = visibleItems.filter((item) => !item.is_received).map((item) => item.id)
    setSelectedIds((prev) => Array.from(new Set([...prev, ...openVisibleIds])))
  }

  const clearSelection = () => setSelectedIds([])

  const toggleHistory = (id: number) => {
    setExpandedHistory((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const supplierGroups = useMemo(() => {
    const groups = new Map<string, { supplierName: string; items: ManufacturedPartTrackingItem[] }>()
    for (const item of visibleItems) {
      const key = item.supplier_name || 'Unassigned Supplier'
      const existing = groups.get(key) || { supplierName: key, items: [] }
      existing.items.push(item)
      groups.set(key, existing)
    }

    return Array.from(groups.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName))
  }, [visibleItems])

  const stats = useMemo(() => {
    const total = items.length
    const closed = items.filter((item) => item.is_received).length
    const open = total - closed
    const delayed = items.filter((item) => !item.is_received && !!item.target_date).length
    return { total, closed, open, delayed }
  }, [items])

  return (
    <>
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#fff9ec_0%,#ffffff_45%,#eff6ff_100%)] p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-700">
                <Factory className="h-3.5 w-3.5" />
                Manufactured Part Tracking
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-navy-900">Project-wise manufactured parts with supplier follow-up and auto-close on receipt.</h2>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
                Mechanical Manufacture and Electrical Manufacture parts are synced from the BOM. Teams can post daily progress, upload camera photos, revise delivery dates, and the tracker closes automatically once project receipt is complete.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'open', 'received'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] transition-colors ${
                    view === option
                      ? 'border-navy-900 bg-navy-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-navy-900'
                  }`}
                >
                  {option === 'all' ? 'All Parts' : option === 'open' ? 'Open Tracking' : 'Received / Closed'}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Manufactured Parts</div>
            <div className="mt-3 text-3xl font-black text-navy-900">{stats.total}</div>
          </div>
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Open Tracking</div>
            <div className="mt-3 text-3xl font-black text-amber-700">{stats.open}</div>
          </div>
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Closed on Receipt</div>
            <div className="mt-3 text-3xl font-black text-emerald-700">{stats.closed}</div>
          </div>
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Supplier Groups</div>
            <div className="mt-3 text-3xl font-black text-sky-700">{supplierGroups.length}</div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-navy-900">Project View</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">Every manufactured BOM part in this project, including quantity received, supplier tracking, and daily visit comments with user and timestamp.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                {visibleItems.length} visible parts
              </div>
              <button
                type="button"
                onClick={selectAllVisibleOpen}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 hover:border-slate-300 hover:text-navy-900"
              >
                Select Open
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={!selectedIds.length}
                className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${
                  selectedIds.length
                    ? 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-navy-900'
                    : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                }`}
              >
                Clear
              </button>
            </div>
          </div>

          {selectedItems.length > 0 && (
            <div className="mb-5 rounded-[1.6rem] border border-sky-200 bg-[linear-gradient(135deg,#f0f9ff_0%,#ffffff_100%)] p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-700">Bulk Daily Update</div>
                  <div className="mt-1 text-sm font-bold text-navy-900">{selectedItems.length} part{selectedItems.length === 1 ? '' : 's'} selected for supplier follow-up notes</div>
                  <div className="mt-1 text-xs font-medium text-slate-500">Use this when one supplier visit covers multiple parts and you want the same comment stamped against each selected part.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkUpdate(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-sky-700 hover:bg-sky-50"
                >
                  <MessageSquareText className="h-3.5 w-3.5" />
                  Update Selected Parts
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : visibleItems.length ? (
            <div className="space-y-4">
              {visibleItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => toggleSelected(item.id)}
                            disabled={item.is_received}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed"
                          />
                          Select
                        </label>
                        <div className="text-sm font-black text-navy-900">{item.part_number}</div>
                        <div className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusPillClass(item)}`}>
                          {item.is_received ? 'closed' : (item.tracking_status || 'not_started').replace(/_/g, ' ')}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-slate-600">{item.description || 'No description added yet.'}</div>
                      <div className="mt-2 text-xs font-semibold text-slate-500">
                        {item.section_name || 'No section'} / {item.subsection_name || 'No subsection'} • {item.part_type.replace(/_/g, ' ')}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setUpdateItem(item)}
                      disabled={item.is_received}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${
                        item.is_received
                          ? 'cursor-not-allowed border border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border border-primary-200 bg-white text-primary-600 hover:bg-primary-50'
                      }`}
                    >
                      {item.is_received ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
                      {item.is_received ? 'Tracking Closed' : 'Daily Update'}
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Supplier</div>
                      <div className="mt-1 text-xs font-bold text-slate-700">{item.supplier_name || 'Unassigned'}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Required</div>
                      <div className="mt-1 text-lg font-black text-navy-900">{item.required_quantity}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Received</div>
                      <div className="mt-1 text-lg font-black text-emerald-700">{item.received_quantity}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Balance</div>
                      <div className="mt-1 text-lg font-black text-amber-700">{item.remaining_quantity}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Progress</div>
                      <div className="mt-1 text-lg font-black text-sky-700">{item.progress_percent ?? 0}%</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Delivery</div>
                      <div className="mt-1 text-xs font-bold text-slate-700">{formatDate(item.target_date)}</div>
                    </div>
                  </div>

                  {(item.next_action || item.blocker || item.assigned_user_name || item.assigned_user_email) && (
                    <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
                      <div className="rounded-2xl border border-slate-100 bg-white p-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Owner</div>
                        <div className="mt-1 text-sm font-bold text-slate-700">{item.assigned_user_name || item.assigned_user_email || 'Unassigned'}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-white p-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Next Action</div>
                        <div className="mt-1 text-sm text-slate-700">{item.next_action || 'No next action recorded.'}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-white p-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-red-500">Blocker</div>
                        <div className="mt-1 text-sm text-slate-700">{item.blocker || 'No blocker recorded.'}</div>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Daily Comment History</div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          {(updatesByItem[item.id] || []).length
                            ? `${(updatesByItem[item.id] || []).length} update${(updatesByItem[item.id] || []).length === 1 ? '' : 's'} recorded`
                            : 'No supplier visit comments posted yet.'}
                        </div>
                      </div>
                      {(updatesByItem[item.id] || []).length > 3 && (
                        <button
                          type="button"
                          onClick={() => toggleHistory(item.id)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 hover:border-slate-300 hover:text-navy-900"
                        >
                          {expandedHistory[item.id] ? 'Show Less' : 'Show All'}
                        </button>
                      )}
                    </div>

                    {(updatesByItem[item.id] || []).length ? (
                      <div className="mt-4 space-y-3">
                        {(expandedHistory[item.id] ? updatesByItem[item.id] || [] : (updatesByItem[item.id] || []).slice(0, 3)).map((update) => (
                          <div key={update.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="text-sm font-black text-navy-900">{update.user_name || update.user_email || 'Unknown user'}</div>
                                <div className="mt-1 text-[11px] font-semibold text-slate-500">{formatDateTime(update.created_at)}</div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {update.status && (
                                  <div className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">
                                    {update.status.replace(/_/g, ' ')}
                                  </div>
                                )}
                                {typeof update.progress_percent === 'number' && (
                                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                    {update.progress_percent}% progress
                                  </div>
                                )}
                              </div>
                            </div>

                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{update.update_text}</p>

                            {(update.next_step || update.blocker || update.updated_delivery_date) && (
                              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                  <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Next Step</div>
                                  <div className="mt-1 text-xs font-semibold text-slate-600">{update.next_step || 'No change'}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                  <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Blocker</div>
                                  <div className="mt-1 text-xs font-semibold text-slate-600">{update.blocker || 'No change'}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                  <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Delivery Update</div>
                                  <div className="mt-1 text-xs font-semibold text-slate-600">{formatDate(update.updated_delivery_date)}</div>
                                </div>
                              </div>
                            )}

                            {!!update.images.length && (
                              <div className="mt-3 flex flex-wrap gap-3">
                                {update.images.map((image, index) => (
                                  <a key={`${update.id}-${index}`} href={image} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200">
                                    <img src={image} alt="Update evidence" className="h-20 w-20 object-cover" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-xs font-medium text-slate-500">
                        Start with a daily update so supplier visit notes become visible here with date, time, and user details.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm font-medium text-slate-500">
              This project does not have any Mechanical Manufacture or Electrical Manufacture BOM parts yet.
            </div>
          )}
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h3 className="text-lg font-black text-navy-900">Supplier-wise View</h3>
            <p className="mt-1 text-sm font-medium text-slate-500">Follow the same project by supplier so each vendor’s manufacturing load and closures are easy to review.</p>
          </div>

          {supplierGroups.length ? (
            <div className="space-y-4">
              {supplierGroups.map((group) => {
                const openCount = group.items.filter((item) => !item.is_received).length
                const receivedCount = group.items.filter((item) => item.is_received).length

                return (
                  <div key={group.supplierName} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
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
                          <div className="mt-1 text-lg font-black text-amber-900">{openCount}</div>
                        </div>
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-center">
                          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">Closed</div>
                          <div className="mt-1 text-lg font-black text-emerald-900">{receivedCount}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Part</th>
                            <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Project Area</th>
                            <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Qty</th>
                            <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Status</th>
                            <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Delivery</th>
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
                              <td className="px-3 py-3 text-xs font-semibold text-slate-600">
                                {[item.section_name, item.subsection_name].filter(Boolean).join(' / ') || 'Project-level'}
                              </td>
                              <td className="px-3 py-3 text-xs font-semibold text-slate-600">
                                {item.received_quantity} / {item.required_quantity}
                              </td>
                              <td className="px-3 py-3">
                                <div className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${statusPillClass(item)}`}>
                                  {item.is_received ? 'closed' : (item.tracking_status || 'not_started').replace(/_/g, ' ')}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-xs font-semibold text-slate-600">{formatDate(item.target_date)}</td>
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
                                  {item.is_received ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}
                                  {item.is_received ? 'Closed' : 'Update'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm font-medium text-slate-500">
              Supplier-wise tracking will appear here once this project has manufactured BOM parts.
            </div>
          )}
        </section>
      </div>

      <WorkItemUpdateModal
        isOpen={!!updateItem}
        onClose={() => setUpdateItem(null)}
        item={updateItem}
      />
      <WorkItemUpdateModal
        isOpen={showBulkUpdate}
        onClose={() => setShowBulkUpdate(false)}
        items={selectedItems}
        onSuccess={clearSelection}
      />
    </>
  )
}
