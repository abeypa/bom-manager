import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Plus, Search } from 'lucide-react'
import { issuesApi, type EnrichedIssue, ISSUE_CATEGORIES, ISSUE_SEVERITIES, ISSUE_STATUSES } from '@/api/issues'
import IssueFormModal from './IssueFormModal'
import IssueDetailDrawer from './IssueDetailDrawer'
import { chipClass, formatDate, issueStatusTone, severityTone } from './trackingShared'

export default function TrackingIssuesTab() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingIssue, setEditingIssue] = useState<EnrichedIssue | null>(null)
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null)

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ['issues'],
    queryFn: () => issuesApi.getAll(),
  })

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase()
    return issues.filter((issue) => {
      const matchesSearch =
        !query ||
        issue.title.toLowerCase().includes(query) ||
        (issue.project_name || '').toLowerCase().includes(query) ||
        (issue.po_number || '').toLowerCase().includes(query) ||
        (issue.assignee_name || '').toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || issue.status === statusFilter
      const matchesSeverity = severityFilter === 'all' || issue.severity === severityFilter
      const matchesCategory = categoryFilter === 'all' || issue.category === categoryFilter
      return matchesSearch && matchesStatus && matchesSeverity && matchesCategory
    })
  }, [issues, search, statusFilter, severityFilter, categoryFilter])

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedIssueId) || null,
    [issues, selectedIssueId],
  )

  const openCount = issues.filter((issue) => issue.status === 'open' || issue.status === 'in_progress').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{openCount}</span> open of {issues.length} total issues
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setEditingIssue(null)
            setFormOpen(true)
          }}
        >
          <Plus size={14} />
          Log Issue
        </button>
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, project, PO, or assignee..."
            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <select className="input input-sm !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {ISSUE_STATUSES.map((status) => (
            <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select className="input input-sm !w-auto" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="all">All severities</option>
          {ISSUE_SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>{severity}</option>
          ))}
        </select>
        <select className="input input-sm !w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All categories</option>
          {ISSUE_CATEGORIES.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="responsive-table-wrapper">
          <table className="data-table-modern">
            <thead>
              <tr>
                <th>Issue</th>
                <th>Linked To</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Due</th>
                <th className="text-right">Comments</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">Loading issues...</td></tr>
              ) : filteredIssues.length ? (
                filteredIssues.map((issue) => (
                  <tr
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    className="cursor-pointer transition-colors hover:bg-[var(--slate-50)]"
                  >
                    <td>
                      <div className="text-sm font-medium text-slate-900">{issue.title}</div>
                      <div className="mt-0.5 text-xs text-slate-400">#{issue.id} · {issue.category}</div>
                    </td>
                    <td>
                      <div className="text-xs text-slate-600">
                        {issue.project_number ? `${issue.project_number} · ${issue.project_name}` : '—'}
                      </div>
                      {issue.po_number && <div className="mt-0.5 text-xs text-slate-400">{issue.po_number}</div>}
                    </td>
                    <td><span className={chipClass(severityTone, issue.severity)}>{issue.severity}</span></td>
                    <td><span className={chipClass(issueStatusTone, issue.status)}>{issue.status.replace(/_/g, ' ')}</span></td>
                    <td className="text-xs text-slate-600">{issue.assignee_name || issue.assignee_email || 'Unassigned'}</td>
                    <td className="text-xs text-slate-600">{issue.due_date ? formatDate(issue.due_date) : '—'}</td>
                    <td className="text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <MessageSquare size={12} />
                        {issue.comment_count}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                    {issues.length ? 'No issues match the current filters.' : 'No issues logged yet. Use "Log Issue" to create the first one.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <IssueFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false)
          setEditingIssue(null)
        }}
        issue={editingIssue}
      />

      <IssueDetailDrawer
        issue={selectedIssue}
        onClose={() => setSelectedIssueId(null)}
        onEdit={(issue) => {
          setEditingIssue(issue)
          setFormOpen(true)
        }}
      />
    </div>
  )
}
