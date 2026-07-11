import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, MessageSquare, Pencil, Send, Trash2, X } from 'lucide-react'
import { issuesApi, type EnrichedIssue, ISSUE_STATUSES } from '@/api/issues'
import { useRole } from '@/hooks/useRole'
import { useToast } from '@/context/ToastContext'
import { chipClass, formatDate, formatDateTime, issueStatusTone, severityTone } from './trackingShared'

interface IssueDetailDrawerProps {
  issue: EnrichedIssue | null
  onClose: () => void
  onEdit: (issue: EnrichedIssue) => void
}

export default function IssueDetailDrawer({ issue, onClose, onEdit }: IssueDetailDrawerProps) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { isAdmin } = useRole()
  const [comment, setComment] = useState('')

  const { data: comments = [], isLoading: commentsLoading } = useQuery({
    queryKey: ['issue-comments', issue?.id],
    queryFn: () => issuesApi.getComments(issue!.id),
    enabled: !!issue,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['issues'] })
    queryClient.invalidateQueries({ queryKey: ['issue-open-counts'] })
    queryClient.invalidateQueries({ queryKey: ['issue-comments', issue?.id] })
  }

  const statusMutation = useMutation({
    mutationFn: (status: string) => issuesApi.update(issue!.id, { status: status as EnrichedIssue['status'] }),
    onSuccess: () => {
      invalidate()
      showToast('success', 'Status updated')
    },
    onError: (error: any) => showToast('error', error?.message || 'Failed to update status'),
  })

  const commentMutation = useMutation({
    mutationFn: () => issuesApi.addComment(issue!.id, { comment_text: comment.trim() }),
    onSuccess: () => {
      setComment('')
      invalidate()
    },
    onError: (error: any) => showToast('error', error?.message || 'Failed to add comment'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => issuesApi.remove(issue!.id),
    onSuccess: () => {
      invalidate()
      showToast('success', 'Issue deleted')
      onClose()
    },
    onError: (error: any) => showToast('error', error?.message || 'Failed to delete issue'),
  })

  if (!issue) return null

  return (
    <div className="fixed inset-0 z-[9990] flex justify-end bg-[var(--bg-overlay)]" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl border-l border-[var(--border-subtle)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={chipClass(severityTone, issue.severity)}>{issue.severity}</span>
              <span className={chipClass(issueStatusTone, issue.status)}>{issue.status.replace(/_/g, ' ')}</span>
              <span className="badge badge-slate">{issue.category}</span>
            </div>
            <h2 className="mt-2 truncate text-base font-semibold text-slate-900">{issue.title}</h2>
            <div className="mt-1 text-xs text-slate-500">
              #{issue.id} - opened {formatDateTime(issue.created_at)}{issue.creator_name ? ` by ${issue.creator_name}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button className="btn btn-ghost btn-icon-sm" onClick={() => onEdit(issue)} title="Edit issue">
              <Pencil size={14} />
            </button>
            {isAdmin && (
              <button
                className="btn btn-ghost btn-icon-sm text-red-500 hover:text-red-700"
                onClick={() => {
                  if (window.confirm('Delete this issue permanently?')) deleteMutation.mutate()
                }}
                title="Delete issue"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button className="btn btn-ghost btn-icon-sm" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-5">
          {issue.description && (
            <p className="text-sm leading-6 text-slate-700 whitespace-pre-wrap">{issue.description}</p>
          )}

          <div className="card p-4 space-y-2.5">
            <div className="label-caps">Linked To</div>
            <div className="flex flex-wrap gap-2 text-xs">
              {issue.project_id ? (
                <Link to={`/projects/${issue.project_id}`} className="badge badge-navy hover:underline">
                  {issue.project_number || `Project #${issue.project_id}`} - {issue.project_name}
                </Link>
              ) : (
                <span className="text-slate-400">No project</span>
              )}
              {issue.po_number && (
                <span className="badge badge-slate">
                  {issue.po_number}{issue.po_supplier_name ? ` - ${issue.po_supplier_name}` : ''}
                </span>
              )}
              {issue.part_number && <span className="badge badge-teal-soft">{issue.part_number}</span>}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1 text-xs text-slate-600">
              <div>
                <div className="label-caps">Assignee</div>
                <div className="mt-1 font-medium text-slate-800">{issue.assignee_name || issue.assignee_email || 'Unassigned'}</div>
              </div>
              <div>
                <div className="label-caps">Due Date</div>
                <div className="mt-1 flex items-center gap-1.5 font-medium text-slate-800">
                  <CalendarDays size={13} className="text-slate-400" />
                  {formatDate(issue.due_date)}
                </div>
              </div>
              {issue.resolved_at && (
                <div className="col-span-2">
                  <div className="label-caps">Resolved</div>
                  <div className="mt-1 font-medium text-slate-800">{formatDateTime(issue.resolved_at)}</div>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="label-caps mb-2">Quick Status</div>
            <div className="flex flex-wrap gap-2">
              {ISSUE_STATUSES.map((status) => (
                <button
                  key={status}
                  onClick={() => statusMutation.mutate(status)}
                  disabled={statusMutation.isPending || status === issue.status}
                  className={`${chipClass(issueStatusTone, status)} transition-opacity ${
                    status === issue.status ? 'ring-2 ring-sky-300' : 'opacity-60 hover:opacity-100 cursor-pointer'
                  }`}
                >
                  {status.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <MessageSquare size={14} className="text-slate-400" />
              <span className="label-caps">Comments ({comments.length})</span>
            </div>
            {commentsLoading ? (
              <div className="skeleton h-16 w-full" />
            ) : comments.length ? (
              <div className="space-y-3">
                {comments.map((item) => (
                  <div key={item.id} className="card p-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-800">{item.user_name || item.user_email || 'Unknown user'}</span>
                      <span className="text-slate-400">{formatDateTime(item.created_at)}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap">{item.comment_text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-400">No comments yet.</div>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--border-subtle)] px-5 py-3">
          <div className="flex items-end gap-2">
            <textarea
              className="input"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment..."
            />
            <button
              className="btn btn-primary btn-icon"
              onClick={() => commentMutation.mutate()}
              disabled={!comment.trim() || commentMutation.isPending}
              aria-label="Send comment"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}
