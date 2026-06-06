import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2, Trash2, Upload, X } from 'lucide-react'
import { projectTrackingApi } from '@/api/project-tracking'
import { useToast } from '@/context/ToastContext'
import { supabase } from '@/lib/supabase'

type WorkItemLike = {
  id: number
  name: string
  project_id: number | null
  category?: string | null
  tracking_status?: string | null
  progress_percent?: number
  blocker?: string | null
  next_action?: string | null
  target_date?: string | null
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
  const [updatedDeliveryDate, setUpdatedDeliveryDate] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const isManufacturedItem = item?.category === 'mechanical_manufacture' || item?.category === 'electrical_manufacture'

  useEffect(() => {
    if (!item || !isOpen) return
    setStatus(item.tracking_status || 'in_progress')
    setProgressPercent(String(item.progress_percent ?? 0))
    setBlocker(item.blocker || '')
    setNextStep(item.next_action || '')
    setUpdatedDeliveryDate(item.target_date || '')
    setImages([])
    setUpdateText('')
  }, [item, isOpen])

  const handleImageUpload = async (file: File) => {
    setIsUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const name = `tracking-update-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('bom_assets').upload(`tracking-updates/${name}`, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('bom_assets').getPublicUrl(`tracking-updates/${name}`)
      setImages((prev) => [...prev, urlData.publicUrl])
    } catch (error: any) {
      showToast('error', error.message || 'Failed to upload image')
    } finally {
      setIsUploading(false)
    }
  }

  const mutation = useMutation({
    mutationFn: () =>
      projectTrackingApi.createWorkItemUpdate({
        work_item_id: item!.id,
        update_text: updateText,
        status,
        progress_percent: Number(progressPercent),
        blocker: blocker || null,
        next_step: nextStep || null,
        images,
        updated_delivery_date: updatedDeliveryDate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tracking-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['project-tracking-work-items'] })
      queryClient.invalidateQueries({ queryKey: ['project-tracking-manufactured-items'] })
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

            {isManufacturedItem && (
              <div className="md:col-span-2">
                <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Updated Delivery Date</label>
                <input
                  type="date"
                  value={updatedDeliveryDate}
                  onChange={(e) => setUpdatedDeliveryDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold shadow-sm"
                />
              </div>
            )}

            <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <label className="mb-3 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                {isManufacturedItem ? 'Manufacturing Photos' : 'Update Photos'}
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="group flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white transition-colors hover:border-primary-400 hover:bg-primary-50">
                  {isUploading ? (
                    <Loader2 size={20} className="animate-spin text-primary-500" />
                  ) : (
                    <>
                      <Camera size={18} className="mb-1 text-slate-400 transition-colors group-hover:text-primary-500" />
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 group-hover:text-primary-600">Camera</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleImageUpload(file)
                    }}
                    disabled={isUploading}
                  />
                </label>

                <label className="group flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white transition-colors hover:border-primary-400 hover:bg-primary-50">
                  {isUploading ? (
                    <Loader2 size={20} className="animate-spin text-primary-500" />
                  ) : (
                    <>
                      <Upload size={18} className="mb-1 text-slate-400 transition-colors group-hover:text-primary-500" />
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 group-hover:text-primary-600">Upload</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleImageUpload(file)
                    }}
                    disabled={isUploading}
                  />
                </label>

                {images.map((image, index) => (
                  <div key={index} className="group relative h-24 w-24 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                    <img src={image} alt="Update evidence" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-navy-900/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index))}
                        className="rounded-full bg-red-500 p-2 text-white shadow-lg hover:bg-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
