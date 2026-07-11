import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, FilePlus2, Search } from 'lucide-react'
import { purchaseOrdersApi } from '@/api/purchase-orders'
import { issuesApi } from '@/api/issues'
import { projectTrackingApi } from '@/api/project-tracking'
import PODetailModal from '@/components/purchase-orders/PODetailModal'
import IssueFormModal from './IssueFormModal'
import { chipClass, formatDate, poStatusTone } from './trackingShared'

const PO_STATUS_FILTERS = ['Released', 'Sent', 'Confirmed', 'Partial', 'Received']

export default function TrackingDeliveriesTab() {
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [selectedPoId, setSelectedPoId] = useState<number | null>(null)
  const [issueDefaults, setIssueDefaults] = useState<{ purchase_order_id: number; project_id: number | null } | null>(null)

  const { data: pos = [], isLoading } = useQuery({
    queryKey: ['po-delivery-tracking'],
    queryFn: () => purchaseOrdersApi.getDeliveryTracking(),
  })

  const { data: openCounts } = useQuery({
    queryKey: ['issue-open-counts'],
    queryFn: issuesApi.getOpenCounts,
  })

  const { data: lookups } = useQuery({
    queryKey: ['tracking-lookups'],
    queryFn: projectTrackingApi.getLookupBundle,
  })

  const filteredPos = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (pos as any[]).filter((po) => {
      const matchesSearch =
        !query ||
        String(po.po_number || '').toLowerCase().includes(query) ||
        String(po.supplier_name || '').toLowerCase().includes(query) ||
        String(po.project_label || '').toLowerCase().includes(query)
      const matchesProject = projectFilter === 'all' || po.projects.some((project: any) => String(project.id) === projectFilter)
      const matchesStatus = statusFilter === 'all' || po.status === statusFilter
      const matchesOverdue = !overdueOnly || po.is_overdue
      return matchesSearch && matchesProject && matchesStatus && matchesOverdue
    })
  }, [pos, search, projectFilter, statusFilter, overdueOnly])

  const overdueCount = (pos as any[]).filter((po) => po.is_overdue).length
  const inTransitCount = (pos as any[]).filter((po) => !['Received', 'Cancelled'].includes(po.status)).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <span><span className="font-semibold text-slate-900">{inTransitCount}</span> POs awaiting delivery</span>
        <span className="text-slate-300">-</span>
        <span className={overdueCount ? 'text-red-600 font-medium' : ''}>
          {overdueCount} overdue
        </span>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO number, supplier, or project..."
            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <select className="input input-sm !w-auto" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">All projects</option>
          {(lookups?.projects || []).map((project) => (
            <option key={project.id} value={String(project.id)}>{project.project_number} - {project.project_name}</option>
          ))}
        </select>
        <select className="input input-sm !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {PO_STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="rounded border-slate-300" />
          Overdue only
        </label>
      </div>

      <div className="card overflow-hidden">
        <div className="responsive-table-wrapper">
          <table className="data-table-modern">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Supplier</th>
                <th>Project(s)</th>
                <th>Status</th>
                <th>Expected</th>
                <th>Received</th>
                <th>Issues</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">Loading purchase orders...</td></tr>
              ) : filteredPos.length ? (
                filteredPos.map((po: any) => {
                  const issueCount = openCounts?.byPurchaseOrder.get(po.id) || 0
                  return (
                    <tr
                      key={po.id}
                      onClick={() => setSelectedPoId(po.id)}
                      className="cursor-pointer transition-colors hover:bg-[var(--slate-50)]"
                    >
                      <td>
                        <div className="text-sm font-medium text-slate-900">{po.po_number}</div>
                        <div className="mt-0.5 text-xs text-slate-400">{formatDate(po.po_date)} - {po.line_count} lines</div>
                      </td>
                      <td className="text-sm text-slate-700">{po.supplier_name || '-'}</td>
                      <td className="text-xs text-slate-600">{po.project_label || '-'}</td>
                      <td><span className={chipClass(poStatusTone, po.status)}>{po.status}</span></td>
                      <td>
                        <div className="text-xs text-slate-600">{po.expected_delivery_date ? formatDate(po.expected_delivery_date) : 'Not set'}</div>
                        {po.is_overdue && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-red-600">
                            <AlertTriangle size={11} />
                            {po.days_overdue}d overdue
                          </div>
                        )}
                        {po.actual_delivery_date && (
                          <div className="mt-0.5 text-xs text-emerald-600">Delivered {formatDate(po.actual_delivery_date)}</div>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${po.received_pct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                              style={{ width: `${po.received_pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-600">{po.received_pct}%</span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">{po.received_qty} / {po.ordered_qty} qty</div>
                      </td>
                      <td>
                        {issueCount ? (
                          <span className="badge badge-danger">{issueCount} open</span>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                      <td className="text-right">
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            setIssueDefaults({
                              purchase_order_id: po.id,
                              project_id: po.projects.length === 1 ? po.projects[0].id : null,
                            })
                          }}
                          title="Log an issue against this PO"
                        >
                          <FilePlus2 size={13} />
                          Log issue
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                    {(pos as any[]).length ? 'No purchase orders match the current filters.' : 'No released purchase orders to track yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedPoId && (
        <PODetailModal
          isOpen={!!selectedPoId}
          onClose={() => setSelectedPoId(null)}
          poId={selectedPoId}
        />
      )}

      <IssueFormModal
        isOpen={!!issueDefaults}
        onClose={() => setIssueDefaults(null)}
        defaults={issueDefaults ? { purchase_order_id: issueDefaults.purchase_order_id, project_id: issueDefaults.project_id, category: 'delivery' } : undefined}
      />
    </div>
  )
}
