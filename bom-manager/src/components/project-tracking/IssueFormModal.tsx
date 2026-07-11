import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { issuesApi, type EnrichedIssue, type IssueInsert, ISSUE_CATEGORIES, ISSUE_SEVERITIES, ISSUE_STATUSES } from '@/api/issues'
import { projectTrackingApi } from '@/api/project-tracking'
import { purchaseOrdersApi } from '@/api/purchase-orders'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { useToast } from '@/context/ToastContext'

interface IssueFormModalProps {
  isOpen: boolean
  onClose: () => void
  issue?: EnrichedIssue | null
  /** Prefill for "Log issue" quick actions */
  defaults?: Partial<IssueInsert>
}

type IssueForm = {
  title: string
  description: string
  category: string
  severity: string
  status: string
  project_id: string
  purchase_order_id: string
  assigned_to: string
  due_date: string
}

const BLANK_FORM: IssueForm = {
  title: '',
  description: '',
  category: 'other',
  severity: 'medium',
  status: 'open',
  project_id: '',
  purchase_order_id: '',
  assigned_to: '',
  due_date: '',
}

export default function IssueFormModal({ isOpen, onClose, issue, defaults }: IssueFormModalProps) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const isEditMode = !!issue
  const [form, setForm] = useState<IssueForm>(BLANK_FORM)

  useEffect(() => {
    if (!isOpen) return
    if (issue) {
      setForm({
        title: issue.title,
        description: issue.description || '',
        category: issue.category,
        severity: issue.severity,
        status: issue.status,
        project_id: issue.project_id ? String(issue.project_id) : '',
        purchase_order_id: issue.purchase_order_id ? String(issue.purchase_order_id) : '',
        assigned_to: issue.assigned_to || '',
        due_date: issue.due_date || '',
      })
    } else {
      setForm({
        ...BLANK_FORM,
        project_id: defaults?.project_id ? String(defaults.project_id) : '',
        purchase_order_id: defaults?.purchase_order_id ? String(defaults.purchase_order_id) : '',
        category: (defaults?.category as string) || BLANK_FORM.category,
        title: (defaults?.title as string) || '',
      })
    }
  }, [isOpen, issue, defaults])

  const { data: lookups } = useQuery({
    queryKey: ['tracking-lookups'],
    queryFn: projectTrackingApi.getLookupBundle,
    enabled: isOpen,
  })

  const { data: deliveryPOs = [] } = useQuery({
    queryKey: ['po-delivery-tracking', 'all-for-issue-form'],
    queryFn: () => purchaseOrdersApi.getDeliveryTracking(),
    enabled: isOpen,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['issues'] })
    queryClient.invalidateQueries({ queryKey: ['issue-open-counts'] })
  }

  const buildPayload = (): IssueInsert => ({
    title: form.title.trim(),
    description: form.description.trim() || null,
    category: form.category as IssueInsert['category'],
    severity: form.severity as IssueInsert['severity'],
    status: form.status as IssueInsert['status'],
    project_id: form.project_id ? Number(form.project_id) : null,
    purchase_order_id: form.purchase_order_id ? Number(form.purchase_order_id) : null,
    assigned_to: form.assigned_to || null,
    due_date: form.due_date || null,
  })

  const createMutation = useMutation({
    mutationFn: () => issuesApi.create(buildPayload()),
    onSuccess: () => {
      invalidate()
      showToast('success', 'Issue logged')
      onClose()
    },
    onError: (error: any) => showToast('error', error?.message || 'Failed to create issue'),
  })

  const updateMutation = useMutation({
    mutationFn: () => issuesApi.update(issue!.id, buildPayload()),
    onSuccess: () => {
      invalidate()
      showToast('success', 'Issue updated')
      onClose()
    },
    onError: (error: any) => showToast('error', error?.message || 'Failed to update issue'),
  })

  if (!isOpen) return null

  const isSaving = createMutation.isPending || updateMutation.isPending
  const canSave = !!form.title.trim() && !isSaving

  const projectOptions = [
    { value: '', label: 'No project' },
    ...(lookups?.projects || []).map((project) => ({
      value: String(project.id),
      label: project.project_name,
      subLabel: project.project_number,
    })),
  ]

  // POs filtered to the chosen project (multi-project POs match on any linked project)
  const poOptions = [
    { value: '', label: 'No purchase order' },
    ...deliveryPOs
      .filter((po: any) => !form.project_id || po.projects.some((project: any) => String(project.id) === form.project_id))
      .map((po: any) => ({
        value: String(po.id),
        label: po.po_number,
        subLabel: [po.supplier_name, po.status].filter(Boolean).join(' • '),
      })),
  ]

  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...(lookups?.profiles || []).map((profile) => ({
      value: profile.id,
      label: profile.full_name || profile.email || profile.id,
      subLabel: profile.full_name ? profile.email || undefined : undefined,
    })),
  ]

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg-overlay)] p-4">
      <div className="modal-panel max-w-2xl">
        <div className="modal-header">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{isEditMode ? 'Edit Issue' : 'Log Issue'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Link an issue to a project, purchase order, or both.</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon-sm" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body space-y-4">
          <div>
            <label className="label-caps mb-1.5 block">Title *</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Short summary of the issue"
            />
          </div>

          <div>
            <label className="label-caps mb-1.5 block">Description</label>
            <textarea
              className="input"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Details, impact, and context"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="label-caps mb-1.5 block">Category</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              >
                {ISSUE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-caps mb-1.5 block">Severity</label>
              <select
                className="input"
                value={form.severity}
                onChange={(e) => setForm((prev) => ({ ...prev, severity: e.target.value }))}
              >
                {ISSUE_SEVERITIES.map((severity) => (
                  <option key={severity} value={severity}>{severity}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-caps mb-1.5 block">Status</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                {ISSUE_STATUSES.map((status) => (
                  <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label-caps mb-1.5 block">Project</label>
              <SearchableSelect
                options={projectOptions}
                value={form.project_id}
                onChange={(value) => setForm((prev) => ({ ...prev, project_id: value, purchase_order_id: '' }))}
                placeholder="Search projects..."
              />
            </div>
            <div>
              <label className="label-caps mb-1.5 block">Purchase Order</label>
              <SearchableSelect
                options={poOptions}
                value={form.purchase_order_id}
                onChange={(value) => setForm((prev) => ({ ...prev, purchase_order_id: value }))}
                placeholder="Search POs..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label-caps mb-1.5 block">Assignee</label>
              <SearchableSelect
                options={assigneeOptions}
                value={form.assigned_to}
                onChange={(value) => setForm((prev) => ({ ...prev, assigned_to: value }))}
                placeholder="Search people..."
              />
            </div>
            <div>
              <label className="label-caps mb-1.5 block">Due Date</label>
              <input
                type="date"
                className="input"
                value={form.due_date}
                onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => (isEditMode ? updateMutation.mutate() : createMutation.mutate())}
            disabled={!canSave}
          >
            {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Log Issue'}
          </button>
        </div>
      </div>
    </div>
  )
}
