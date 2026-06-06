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
  item?: WorkItemLike | null
  items?: WorkItemLike[]
  onSuccess?: () => void
}

const STATUS_OPTIONS = ['not_started', 'in_progress', 'waiting_supplier', 'quoted', 'po_released', 'dispatched', 'received', 'blocked', 'closed']

export default function WorkItemUpdateModal({ isOpen, onClose, item = null, items, onSuccess }: Props) {
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [updateText, setUpdateText] = useState('')
  const [status, setStatus] = useState('')
  const [progressPercent, setProgressPercent] = useState('')
  const [blocker, setBlocker] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [updatedDeliveryDate, setUpdatedDeliveryDate] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const modalItems = items?.length ? items : item ? [item] : []
  const primaryItem = modalItems[0] || null
  const isBulkMode = modalItems.length > 1
  const isManufacturedItem = modalItems.some((entry) => entry.category === 'mechanical_manufacture' || entry.category === 'electrical_manufacture')
  const dialogTitle = isBulkMode ? 'Post Bulk Tracking Update' : 'Post Work Item Update'
  const dialogSubtitle = isBulkMode
    ? `${modalItems.length} selected manufactured parts`
    : primaryItem?.name || ''

  useEffect(() => {
    if (!modalItems.length || !isOpen) return
    setStatus(isBulkMode ? '' : primaryItem?.tracking_status || 'in_progress')
    setProgressPercent(isBulkMode ? '' : String(primaryItem?.progress_percent ?? 0))
    setBlocker(isBulkMode ? '' : primaryItem?.blocker || '')
    setNextStep(isBulkMode ? '' : primaryItem?.next_action || '')
    setUpdatedDeliveryDate(isBulkMode ? '' : primaryItem?.target_date || '')
    setImages([])
    setUpdateText('')
  }, [primaryItem, modalItems, isBulkMode, isOpen])

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
      projectTrackingApi.createBulkWorkItemUpdates(
        modalItems.map((entry) => ({
          work_item_id: entry.id,
          update_text: updateText,
          status: status || undefined,
          progress_percent: progressPercent === '' ? undefined : Number(progressPercent),
          blocker: isBulkMode ? (blocker.trim() ? blocker : undefined) : blocker || null,
          next_step: isBulkMode ? (nextStep.trim() ? nextStep : undefined) : nextStep || null,
          images,
          updated_delivery_date: updatedDeliveryDate || undefined,
        })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-tracking-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['project-tracking-work-items'] })
      queryClient.invalidateQueries({ queryKey: ['project-tracking-manufactured-items'] })
      queryClient.invalidateQueries({ queryKey: ['project-manufactured-tracking'] })
      queryClient.invalidateQueries({ queryKey: ['work-item-updates'] })
      for (const entry of modalItems) {
        if (entry.project_id) {
          queryClient.invalidateQueries({ queryKey: ['pending-parts', entry.project_id] })
          queryClient.invalidateQueries({ queryKey: ['project', entry.project_id] })
        }
      }
      showToast('success', isBulkMode ? `Update posted for ${modalItems.length} parts` : 'Progress update posted')
      onSuccess?.()
      onClose()
    },
    onError: (error: any) => showToast('error', error.message || 'Failed to post update'),
  })

  if (!isOpen || !modalItems.length) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-navy-900/40 px-4 py-10 backdrop-blur-sm">
      <div className="relative my-auto mx-auto w-full max-w-2xl rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between rounded-t-[2rem] border-b border-slate-100 bg-slate-50/50 p-6">
          <div>
            <h2 className="text-xl font-black tracking-tight text-navy-900">{dialogTitle}</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">{dialogSubtitle}</p>
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
                {isBulkMode && <option value="">Keep current status</option>}
                {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Progress %</label>
              <input type="number" min="0" max="100" value={progressPercent} onChange={(e) => setProgressPercent(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold shadow-sm" placeholder={isBulkMode ? 'Keep current progress' : '0'} />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">What changed</label>
              <textarea rows={4} value={updateText} onChange={(e) => setUpdateText(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium shadow-sm" placeholder="Describe the latest movement, follow-up, quote, dispatch, receipt, or review outcome." />
            </div>

            {isBulkMode && (
              <div className="md:col-span-2 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-700">Selected Parts</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {modalItems.map((entry) => (
                    <div key={entry.id} className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-bold text-sky-800">
                      {entry.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Blocker</label>
              <textarea rows={2} value={blocker} onChange={(e) => setBlocker(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium shadow-sm" placeholder={isBulkMode ? 'Optional. Leave blank to keep each part blocker unchanged.' : 'Optional blocker or dependency.'} />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Next Step</label>
              <textarea rows={2} value={nextStep} onChange={(e) => setNextStep(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium shadow-sm" placeholder={isBulkMode ? 'Optional. Leave blank to keep each part next step unchanged.' : 'What happens next and who should follow up.'} />
            </div>

            {isManufacturedItem && (
              <div className="md:col-span-2">
                <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Updated Delivery Date</label>
                <input
                  type="date"
                  value={updatedDeliveryDate}
                  onChange={(e) => setUpdatedDeliveryDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold shadow-sm"
                  placeholder={isBulkMode ? 'Keep current delivery date' : undefined}
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
            {mutation.isPending ? 'Posting...' : isBulkMode ? `Post Update to ${modalItems.length} Parts` : 'Post Update'}
          </button>
        </div>
      </div>
    </div>
  )
}
