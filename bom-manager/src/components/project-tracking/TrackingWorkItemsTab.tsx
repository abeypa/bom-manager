import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Download, Plus, Search } from 'lucide-react'
import { projectTrackingApi, type TrackingSupplierAssignment, type TrackingWorkItem } from '@/api/project-tracking'
import { useAuth } from '@/context/AuthContext'
import { useRole } from '@/hooks/useRole'
import SupplierAssignmentModal from '@/components/project-tracking/SupplierAssignmentModal'
import WorkItemUpdateModal from '@/components/project-tracking/WorkItemUpdateModal'
import { chipClass, downloadCsv, formatDate, statusTone } from './trackingShared'

export default function TrackingWorkItemsTab() {
  const { user } = useAuth()
  const { isAdmin } = useRole()
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<TrackingSupplierAssignment | null>(null)
  const [updateItem, setUpdateItem] = useState<TrackingWorkItem | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

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

  const { data: manufacturedItems = [] } = useQuery({
    queryKey: ['project-tracking-manufactured-items', user?.id, isAdmin],
    queryFn: () => projectTrackingApi.getManufacturedPartWorkItems(isAdmin ? undefined : user!.id),
    enabled: !!user?.id,
  })

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{allWorkItems.length}</span> work items -{' '}
          <span className="font-semibold text-slate-900">{allAssignments.length}</span> supplier assignments
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-secondary btn-sm" onClick={exportWorkItems}>
            <Download size={13} />
            Export Work Items
          </button>
          <button className="btn btn-secondary btn-sm" onClick={exportAssignments}>
            <Download size={13} />
            Export Assignments
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setEditingAssignment(null)
              setAssignmentModalOpen(true)
            }}
          >
            <Plus size={14} />
            New Assignment
          </button>
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, supplier, owner, or item..."
            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <select className="input input-sm !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {['not_started', 'in_progress', 'waiting_supplier', 'quoted', 'po_released', 'dispatched', 'received', 'blocked', 'closed'].map((status) => (
            <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select className="input input-sm !w-auto" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
          <option value="all">All risk levels</option>
          {['low', 'normal', 'high', 'critical'].map((risk) => (
            <option key={risk} value={risk}>{risk}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="rounded border-slate-300" />
          Overdue only
        </label>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-4 py-2.5">
            <div className="text-sm font-semibold text-slate-900">Work Item Report</div>
            <div className="text-xs text-slate-500">{filteredWorkItems.length} rows</div>
          </div>
          <div className="max-h-[420px] overflow-auto custom-scrollbar">
            <table className="data-table-modern">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>Work Item</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkItems.length ? filteredWorkItems.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td>
                      <div className="text-sm font-medium text-slate-900">{item.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{item.project_name || 'General'}{item.supplier_name ? ` - ${item.supplier_name}` : ''}</div>
                      <div className="mt-0.5 text-xs text-slate-400">Due: {item.due_date || 'Not set'} - {item.progress_percent ?? 0}%</div>
                    </td>
                    <td className="text-xs text-slate-600">{item.assigned_user_name || item.assigned_user_email || 'Unassigned'}</td>
                    <td>
                      <span className={chipClass(statusTone, item.tracking_status || 'not_started')}>
                        {(item.tracking_status || 'not_started').replace(/_/g, ' ')}
                      </span>
                      <div className="mt-1 text-xs text-slate-500">Risk: {item.risk_level || 'normal'}</div>
                    </td>
                    <td className="text-right">
                      <button className="btn btn-ghost btn-xs" onClick={() => setUpdateItem(item)}>Update</button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No work items match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-4 py-2.5">
            <div className="text-sm font-semibold text-slate-900">Supplier Ownership Report</div>
            <div className="text-xs text-slate-500">{filteredAssignments.length} rows</div>
          </div>
          <div className="max-h-[420px] overflow-auto custom-scrollbar">
            <table className="data-table-modern">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th>Supplier</th>
                  <th>Owner</th>
                  <th>Target</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.length ? filteredAssignments.map((assignment) => (
                  <tr key={assignment.id} className="align-top">
                    <td>
                      <div className="text-sm font-medium text-slate-900">{assignment.supplier_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{assignment.project_name} - {assignment.project_number}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{[assignment.section_name, assignment.subsection_name].filter(Boolean).join(' / ') || 'Project-level tracking'}</div>
                    </td>
                    <td className="text-xs text-slate-600">{assignment.assigned_user_name || assignment.assigned_user_email || 'Unassigned'}</td>
                    <td>
                      <span className={chipClass(statusTone, assignment.current_status)}>
                        {assignment.current_status.replace(/_/g, ' ')}
                      </span>
                      <div className="mt-1 text-xs text-slate-500">{formatDate(assignment.target_date)}</div>
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => {
                          setEditingAssignment(assignment)
                          setAssignmentModalOpen(true)
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No assignments match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="section-title !text-sm">Manufactured Part Supplier Tracking</h2>
            <p className="mt-1 text-sm text-slate-500">Synced from project BOM manufactured parts; auto-closes on full receipt.</p>
          </div>
          <div className="badge badge-slate">{manufacturedItems.length} tracked items</div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {manufacturedItems.length ? manufacturedItems.map((item) => (
            <div key={item.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--slate-50)] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{item.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{item.project_name || 'General'}{item.supplier_name ? ` - ${item.supplier_name}` : ''}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{item.category?.replace(/_/g, ' ')}</div>
                </div>
                <button className="btn btn-secondary btn-xs shrink-0" onClick={() => setUpdateItem(item)}>
                  Daily Update
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                {[
                  { label: 'Progress', value: `${item.progress_percent ?? 0}%` },
                  { label: 'Receipt', value: `${item.received_quantity} / ${item.required_quantity}` },
                  { label: 'Delivery', value: item.target_date || 'Not set' },
                  { label: 'Status', value: item.is_received ? 'closed' : (item.tracking_status || 'not_started').replace(/_/g, ' ') },
                  { label: 'Owner', value: item.assigned_user_name || item.assigned_user_email || 'Unassigned' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md border border-[var(--border-subtle)] bg-white px-2.5 py-1.5">
                    <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
                    <div className="mt-0.5 truncate text-xs font-medium text-slate-700">{value}</div>
                  </div>
                ))}
              </div>

              {(item.next_action || item.blocker) && (
                <div className="mt-3 space-y-2 rounded-md border border-[var(--border-subtle)] bg-white p-3">
                  {item.next_action && (
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Next Action</div>
                      <div className="mt-0.5 text-sm text-slate-700">{item.next_action}</div>
                    </div>
                  )}
                  {item.blocker && (
                    <div>
                      <div className="text-[10px] font-medium uppercase tracking-wide text-red-500">Blocker</div>
                      <div className="mt-0.5 text-sm text-red-700">{item.blocker}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )) : (
            <div className="text-sm text-slate-400 xl:col-span-2">
              No Mechanical Manufacture or Electrical Manufacture BOM parts are synced into tracking yet.
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3">
            <h2 className="section-title !text-sm">Supplier Bottlenecks</h2>
            <p className="mt-1 text-sm text-slate-500">Suppliers accumulating blocked or overdue execution load.</p>
          </div>
          <div className="space-y-2">
            {supplierBottlenecks.length ? supplierBottlenecks.map((supplier) => (
              <div key={supplier.supplier} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--slate-50)] px-3.5 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{supplier.supplier}</div>
                  <div className="text-xs text-slate-500">{supplier.openAssignments} open assignments</div>
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <span className="badge badge-amber">{supplier.overdueAssignments} overdue</span>
                  <span className="badge badge-danger">{supplier.blockedItems} blocked</span>
                </div>
              </div>
            )) : (
              <div className="text-sm text-slate-400">No supplier bottlenecks detected.</div>
            )}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3">
            <h2 className="section-title !text-sm">Project Escalations</h2>
            <p className="mt-1 text-sm text-slate-500">Projects with the heaviest mix of overdue and blocked work.</p>
          </div>
          <div className="space-y-2">
            {riskProjects.length ? riskProjects.map((project) => (
              <Link
                key={project.projectId}
                to={`/projects/${project.projectId}?tab=work_items`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--slate-50)] px-3.5 py-2.5 transition-colors hover:border-sky-200 hover:bg-white"
              >
                <div className="truncate text-sm font-medium text-slate-900">{project.projectName}</div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  <span className="badge badge-amber">{project.overdue} overdue</span>
                  <span className="badge badge-danger">{project.blocked} blocked</span>
                  <ArrowRight size={13} className="text-slate-400" />
                </div>
              </Link>
            )) : (
              <div className="text-sm text-slate-400">No project escalations right now.</div>
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
