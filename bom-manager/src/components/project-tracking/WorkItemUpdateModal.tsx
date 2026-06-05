import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { projectTrackingApi } from '@/api/project-tracking'
import { useToast } from '@/context/ToastContext'

type WorkItemLike = {
  id: number
  name: string
  project_id: number | null
  tracking_status?: string | null
  progress_percent?: number
  blocker?: string | null
  next_action?: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  item: WorkItemLike | null
}

const STATUS_OPTIONS = ['not_started', 'in_progress', 'waiting_supplier', 'quoted', 'po_released', 'dispatched', 'received', 'blocked', 'closed']

export default function WorkItemUpdateModal({ isOpen, onClose, item }: Props) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [updateText, setUpdateText] = useState('')
  const [status, setStatus] = useState('in_progress')
  const [progressPercent, setProgressPercent] = useState('0')
  const [blocker, setBlocker] = useState('')
  const [nextStep, setNextStep] = useState('')

  useEffect(() => {
    if (!item || !isOpen) return
    setStatus(item.tracking_status || 'in_progress')
    setProgressPercent(String(item.progress_percent ?? 0))
    setBlocker(item.blocker || '')
    setNextStep(item.next_action || '')
    setUpdateText('')
  }, [item, isOpen])

  const mutation = useMutation({
    mutationFn: () =>
      projectTrackingApi.createWorkItemUpdate({
        work_item_id: item!.id,
        update_text: updateText,
        status,
        progress_percent: Number(progressPercent),
        blocker: blocker || null,
        next_step: nextStep || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tracking-dashboard'] })
      if (item?.project_id) {
        queryClient.invalidateQueries({ queryKey: ['pending-parts', item.project_id] })
      }
      showToast('success', 'Progress update posted')
      onClose()
    },
    onError: (error: any) => showToast('error', error.message || 'Failed to post update'),
  })

  if (!isOpen || !item) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-navy-900/40 px-4 py-10 backdrop-blur-sm">
      <div className="relative my-auto mx-auto w-full max-w-2xl rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between rounded-t-[2rem] border-b border-slate-100 bg-slate-50/50 p-6">
          <div>
            <h2 className="text-xl font-black tracking-tight text-navy-900">Post Work Item Update</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">{item.name}</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-transparent p-2 text-slate-400 hover:bg-white hover:text-red-500">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold shadow-sm">
                {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Progress %</label>
              <input type="number" min="0" max="100" value={progressPercent} onChange={(e) => setProgressPercent(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold shadow-sm" />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">What changed</label>
              <textarea rows={4} value={updateText} onChange={(e) => setUpdateText(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium shadow-sm" placeholder="Describe the latest movement, follow-up, quote, dispatch, receipt, or review outcome." />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Blocker</label>
              <textarea rows={2} value={blocker} onChange={(e) => setBlocker(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium shadow-sm" placeholder="Optional blocker or dependency." />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Next Step</label>
              <textarea rows={2} value={nextStep} onChange={(e) => setNextStep(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium shadow-sm" placeholder="What happens next and who should follow up." />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 rounded-b-[2rem] border-t border-slate-100 bg-slate-50 p-6">
          <button type="button" onClick={onClose} className="btn btn-secondary px-6 font-bold">Cancel</button>
          <button type="button" disabled={mutation.isPending || !updateText.trim()} onClick={() => mutation.mutate()} className="btn btn-primary px-8">
            {mutation.isPending ? 'Posting...' : 'Post Update'}
          </button>
        </div>
      </div>
    </div>
  )
}
