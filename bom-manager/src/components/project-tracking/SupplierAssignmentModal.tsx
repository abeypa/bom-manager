import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import {
  projectTrackingApi,
  type SupplierAssignmentInsert,
  type SupplierAssignmentUpdate,
  type TrackingSupplierAssignment,
} from '@/api/project-tracking'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { useToast } from '@/context/ToastContext'

interface Props {
  isOpen: boolean
  onClose: () => void
  assignment?: TrackingSupplierAssignment | null
}

type FormState = {
  project_id: string
  supplier_id: string
  section_id: string
  subsection_id: string
  work_item_id: string
  assigned_user_id: string
  current_status: string
  target_date: string
  remarks: string
}

const BLANK: FormState = {
  project_id: '',
  supplier_id: '',
  section_id: '',
  subsection_id: '',
  work_item_id: '',
  assigned_user_id: '',
  current_status: 'not_started',
  target_date: '',
  remarks: '',
}

const STATUS_OPTIONS = [
  'not_started',
  'in_progress',
  'waiting_supplier',
  'quoted',
  'po_released',
  'dispatched',
  'received',
  'blocked',
  'closed',
]

export default function SupplierAssignmentModal({ isOpen, onClose, assignment }: Props) {
  const isEditMode = !!assignment
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [form, setForm] = useState<FormState>(BLANK)

  const { data: lookups } = useQuery({
    queryKey: ['tracking-lookups'],
    queryFn: projectTrackingApi.getLookupBundle,
    enabled: isOpen,
  })

  const { data: context } = useQuery({
    queryKey: ['tracking-project-context', form.project_id],
    queryFn: () => projectTrackingApi.getProjectContext(Number(form.project_id)),
    enabled: isOpen && !!form.project_id,
  })

  useEffect(() => {
    if (!isOpen) return
    if (!assignment) {
      setForm(BLANK)
      return
    }

    setForm({
      project_id: String(assignment.project_id),
      supplier_id: String(assignment.supplier_id),
      section_id: assignment.section_id ? String(assignment.section_id) : '',
      subsection_id: assignment.subsection_id ? String(assignment.subsection_id) : '',
      work_item_id: assignment.work_item_id ? String(assignment.work_item_id) : '',
      assigned_user_id: assignment.assigned_user_id || '',
      current_status: assignment.current_status,
      target_date: assignment.target_date || '',
      remarks: assignment.remarks || '',
    })
  }, [assignment, isOpen])

  const projectOptions = useMemo(
    () =>
      (lookups?.projects || []).map((project) => ({
        value: String(project.id),
        label: project.project_name,
        subLabel: project.project_number,
      })),
    [lookups]
  )

  const supplierOptions = useMemo(
    () => (lookups?.suppliers || []).map((supplier) => ({ value: String(supplier.id), label: supplier.name })),
    [lookups]
  )

  const profileOptions = useMemo(
    () =>
      (lookups?.profiles || []).map((profile) => ({
        value: profile.id,
        label: profile.full_name || profile.email || profile.id,
        subLabel: profile.email || undefined,
      })),
    [lookups]
  )

  const sectionOptions = useMemo(
    () => (context?.sections || []).map((section) => ({ value: String(section.id), label: section.name })),
    [context]
  )

  const subsectionOptions = useMemo(
    () =>
      (context?.subsections || [])
        .filter((subsection) => !form.section_id || String(subsection.section_id || '') === form.section_id)
        .map((subsection) => ({ value: String(subsection.id), label: subsection.section_name })),
    [context, form.section_id]
  )

  const createMutation = useMutation({
    mutationFn: (payload: SupplierAssignmentInsert) => projectTrackingApi.createSupplierAssignment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tracking-dashboard'] })
      showToast('success', 'Supplier assignment created')
      onClose()
    },
    onError: (error: any) => showToast('error', error.message || 'Failed to create supplier assignment'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SupplierAssignmentUpdate }) =>
      projectTrackingApi.updateSupplierAssignment(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tracking-dashboard'] })
      showToast('success', 'Supplier assignment updated')
      onClose()
    },
    onError: (error: any) => showToast('error', error.message || 'Failed to update supplier assignment'),
  })

  const handleSubmit = () => {
    if (!form.project_id || !form.supplier_id) {
      showToast('error', 'Project and supplier are required')
      return
    }

    const payload = {
      project_id: Number(form.project_id),
      supplier_id: Number(form.supplier_id),
      section_id: form.section_id ? Number(form.section_id) : null,
      subsection_id: form.subsection_id ? Number(form.subsection_id) : null,
      work_item_id: form.work_item_id ? Number(form.work_item_id) : null,
      assigned_user_id: form.assigned_user_id || null,
      current_status: form.current_status,
      target_date: form.target_date || null,
      remarks: form.remarks || null,
    }

    if (assignment) {
      updateMutation.mutate({ id: assignment.id, payload })
      return
    }
    createMutation.mutate(payload)
  }

  if (!isOpen) return null

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-navy-900/40 px-4 py-10 backdrop-blur-sm">
      <div className="relative my-auto mx-auto w-full max-w-2xl rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between rounded-t-[2rem] border-b border-slate-100 bg-slate-50/50 p-6">
          <div>
            <h2 className="text-xl font-black tracking-tight text-navy-900">
              {isEditMode ? 'Edit Supplier Assignment' : 'Create Supplier Assignment'}
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-400">Assign a supplier owner against a project area.</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-transparent p-2 text-slate-400 hover:bg-white hover:text-red-500">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Project</label>
              <SearchableSelect options={projectOptions} value={form.project_id} onChange={(value) => setForm((prev) => ({ ...prev, project_id: value, section_id: '', subsection_id: '' }))} placeholder="Select project" />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Supplier</label>
              <SearchableSelect options={supplierOptions} value={form.supplier_id} onChange={(value) => setForm((prev) => ({ ...prev, supplier_id: value }))} placeholder="Select supplier" />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Section</label>
              <SearchableSelect options={sectionOptions} value={form.section_id} onChange={(value) => setForm((prev) => ({ ...prev, section_id: value, subsection_id: '' }))} placeholder="Optional section" disabled={!form.project_id} />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Subsection</label>
              <SearchableSelect options={subsectionOptions} value={form.subsection_id} onChange={(value) => setForm((prev) => ({ ...prev, subsection_id: value }))} placeholder="Optional subsection" disabled={!form.project_id} />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Assigned User</label>
              <SearchableSelect options={profileOptions} value={form.assigned_user_id} onChange={(value) => setForm((prev) => ({ ...prev, assigned_user_id: value }))} placeholder="Select owner" />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Current Status</label>
              <select value={form.current_status} onChange={(e) => setForm((prev) => ({ ...prev, current_status: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold shadow-sm">
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Target Date</label>
              <input type="date" value={form.target_date} onChange={(e) => setForm((prev) => ({ ...prev, target_date: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold shadow-sm" />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Remarks</label>
              <textarea rows={4} value={form.remarks} onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium shadow-sm" placeholder="What this supplier owns, risks, follow-up expectations, or context." />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 rounded-b-[2rem] border-t border-slate-100 bg-slate-50 p-6">
          <button type="button" onClick={onClose} className="btn btn-secondary px-6 font-bold">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={isPending} className="btn btn-primary px-8">
            {isPending ? 'Saving...' : isEditMode ? 'Save Assignment' : 'Create Assignment'}
          </button>
        </div>
      </div>
    </div>
  )
}
