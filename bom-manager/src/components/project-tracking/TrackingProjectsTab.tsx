import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { purchaseOrdersApi } from '@/api/purchase-orders'
import { issuesApi } from '@/api/issues'
import { chipClass, formatDate, issueStatusTone, poStatusTone, severityTone } from './trackingShared'

const PHASES: Array<{ key: string; label: string }> = [
  { key: 'mechanical_design_status', label: 'Mech Design' },
  { key: 'ee_design_status', label: 'EE Design' },
  { key: 'pneumatic_design_status', label: 'Pneu Design' },
  { key: 'po_release_status', label: 'PO Release' },
  { key: 'part_arrival_status', label: 'Part Arrival' },
  { key: 'machine_build_status', label: 'Build' },
]

const ACTIVE_STATUSES = new Set(['planning', 'design', 'build', 'testing'])

const phaseChipTone = (value?: string | null) => {
  const normalized = String(value || '').toLowerCase()
  if (['completed', 'done', 'complete', 'received'].includes(normalized)) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (['in_progress', 'ongoing', 'started', 'partial'].includes(normalized)) return 'bg-sky-50 text-sky-700 border-sky-200'
  if (['blocked', 'delayed', 'on_hold'].includes(normalized)) return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-slate-100 text-slate-500 border-slate-200'
}

export default function TrackingProjectsTab() {
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null)

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['tracking-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_name, project_number, customer, status, target_completion_date, mechanical_design_status, ee_design_status, pneumatic_design_status, po_release_status, part_arrival_status, machine_build_status, project_lead_id')
        .order('updated_date', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data || []).filter((project: any) => ACTIVE_STATUSES.has(String(project.status || '').toLowerCase()))
    },
  })

  const { data: deliverySummary } = useQuery({
    queryKey: ['po-delivery-summary-by-project'],
    queryFn: purchaseOrdersApi.getDeliverySummaryByProject,
  })

  const { data: deliveryPos = [] } = useQuery({
    queryKey: ['po-delivery-tracking'],
    queryFn: () => purchaseOrdersApi.getDeliveryTracking(),
  })

  const { data: openCounts } = useQuery({
    queryKey: ['issue-open-counts'],
    queryFn: issuesApi.getOpenCounts,
  })

  const { data: allIssues = [] } = useQuery({
    queryKey: ['issues'],
    queryFn: () => issuesApi.getAll(),
  })

  const openIssuesByProject = useMemo(() => {
    const grouped = new Map<number, typeof allIssues>()
    for (const issue of allIssues) {
      if (!issue.project_id) continue
      if (issue.status !== 'open' && issue.status !== 'in_progress') continue
      const list = grouped.get(issue.project_id) || []
      list.push(issue)
      grouped.set(issue.project_id, list)
    }
    return grouped
  }, [allIssues])

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-28 w-full" />
      </div>
    )
  }

  if (!projects.length) {
    return <div className="empty-state text-sm text-slate-500">No active projects (planning / design / build / testing) to track.</div>
  }

  return (
    <div className="space-y-3">
      {projects.map((project: any) => {
        const summary = deliverySummary?.get(project.id)
        const issueCount = openCounts?.byProject.get(project.id) || 0
        const isExpanded = expandedProjectId === project.id
        const projectPos = (deliveryPos as any[]).filter((po) => po.projects.some((p: any) => p.id === project.id))
        const projectIssues = openIssuesByProject.get(project.id) || []

        return (
          <div key={project.id} className="card">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-4 p-4 text-left"
              onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="mt-1 text-slate-400">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-400">{project.project_number}</span>
                    <span className={`status-${String(project.status || '').toLowerCase().replace(/_/g, '-')}`}>{project.status}</span>
                  </div>
                  <h3 className="mt-1 truncate text-sm font-semibold text-slate-900">{project.project_name}</h3>
                  <div className="mt-1 text-xs text-slate-500">
                    {project.customer || 'No customer'} · Target: {formatDate(project.target_completion_date)}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {PHASES.map(({ key, label }) => (
                      <span
                        key={key}
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${phaseChipTone(project[key])}`}
                        title={`${label}: ${project[key] || 'not started'}`}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs">
                <div className="text-slate-600">
                  <span className="font-semibold text-slate-900">{summary?.po_count || 0}</span> POs
                  {summary?.overdue_count ? (
                    <span className="ml-1.5 inline-flex items-center gap-1 font-medium text-red-600">
                      <AlertTriangle size={11} />
                      {summary.overdue_count} overdue
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${(summary?.received_pct || 0) >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                      style={{ width: `${summary?.received_pct || 0}%` }}
                    />
                  </div>
                  {summary?.received_pct || 0}% received
                </div>
                {issueCount ? (
                  <span className="badge badge-danger">{issueCount} open issues</span>
                ) : (
                  <span className="text-slate-300">No open issues</span>
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="space-y-4 border-t border-[var(--border-subtle)] px-4 py-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="label-caps">Purchase Orders ({projectPos.length})</span>
                  </div>
                  {projectPos.length ? (
                    <div className="responsive-table-wrapper rounded-lg border border-[var(--border-subtle)]">
                      <table className="data-table-modern">
                        <thead>
                          <tr>
                            <th>PO</th>
                            <th>Supplier</th>
                            <th>Status</th>
                            <th>Expected</th>
                            <th>Received</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectPos.map((po: any) => (
                            <tr key={po.id}>
                              <td className="text-sm font-medium text-slate-900">{po.po_number}</td>
                              <td className="text-xs text-slate-600">{po.supplier_name || '—'}</td>
                              <td><span className={chipClass(poStatusTone, po.status)}>{po.status}</span></td>
                              <td className="text-xs text-slate-600">
                                {po.expected_delivery_date ? formatDate(po.expected_delivery_date) : 'Not set'}
                                {po.is_overdue && <span className="ml-1.5 font-medium text-red-600">({po.days_overdue}d late)</span>}
                              </td>
                              <td className="text-xs text-slate-600">{po.received_pct}% · {po.received_qty}/{po.ordered_qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">No released POs linked to this project yet.</div>
                  )}
                </div>

                <div>
                  <span className="label-caps">Open Issues ({projectIssues.length})</span>
                  {projectIssues.length ? (
                    <div className="mt-2 space-y-2">
                      {projectIssues.map((issue) => (
                        <div key={issue.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--slate-50)] px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-800">{issue.title}</div>
                            <div className="text-xs text-slate-400">
                              #{issue.id} · {issue.category}{issue.po_number ? ` · ${issue.po_number}` : ''}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className={chipClass(severityTone, issue.severity)}>{issue.severity}</span>
                            <span className={chipClass(issueStatusTone, issue.status)}>{issue.status.replace(/_/g, ' ')}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-slate-400">No open issues on this project.</div>
                  )}
                </div>

                <Link
                  to={`/projects/${project.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-brand)] hover:underline"
                >
                  Open project
                  <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
