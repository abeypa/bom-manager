import React, { useEffect, useState } from 'react'
import { X, Upload, Link as LinkIcon, Trash2, Plus, Loader2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pendingPartsApi, PendingPartInsert, PendingPart, PendingPartUpdate } from '@/api/pending-parts'
import { useToast } from '@/context/ToastContext'
import { supabase } from '@/lib/supabase'

interface Props {
  isOpen: boolean
  onClose: () => void
  projectId: number
  editPart?: PendingPart
}

const CATEGORIES = [
  { value: 'mechanical_manufacture', label: 'Mechanical Manufacture' },
  { value: 'mechanical_bought_out', label: 'Mechanical Bought Out' },
  { value: 'electrical_manufacture', label: 'Electrical Manufacture' },
  { value: 'electrical_bought_out', label: 'Electrical Bought Out' },
  { value: 'pneumatic_bought_out', label: 'Pneumatic Bought Out' },
]

const BLANK: PendingPartInsert = {
  project_id: 0,
  name: '',
  description: '',
  category: 'mechanical_bought_out',
  status: 'Pending',
  priority: 'Medium',
  images: [],
  links: [],
  created_by: null,
  rejection_reason: null,
  assigned_to: null,
}

export default function PendingPartFormModal({ isOpen, onClose, projectId, editPart }: Props) {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const isEditMode = !!editPart

  const [formData, setFormData] = useState<PendingPartInsert>({ ...BLANK, project_id: projectId })
  const [linkInput, setLinkInput] = useState({ label: '', url: '' })
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (editPart) {
      setFormData({
        project_id: editPart.project_id,
        name: editPart.name,
        description: editPart.description || '',
        category: editPart.category || 'mechanical_bought_out',
        status: editPart.status,
        priority: editPart.priority || 'Medium',
        images: editPart.images || [],
        links: editPart.links || [],
        created_by: editPart.created_by,
        rejection_reason: editPart.rejection_reason,
        assigned_to: editPart.assigned_to,
      })
      return
    }

    setFormData({ ...BLANK, project_id: projectId })
  }, [editPart, projectId])

  const { data: profiles } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => pendingPartsApi.getProfiles(),
  })

  const createMut = useMutation({
    mutationFn: (data: PendingPartInsert) => pendingPartsApi.createPendingPart(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-parts', projectId] })
      showToast('success', 'Work item created successfully')
      onClose()
    },
    onError: (err: any) => showToast('error', err.message),
  })

  const updateMut = useMutation({
    mutationFn: (data: PendingPartUpdate) => pendingPartsApi.updatePendingPart(editPart!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-parts', projectId] })
      showToast('success', 'Work item updated successfully')
      onClose()
    },
    onError: (err: any) => showToast('error', err.message),
  })

  if (!isOpen) return null

  const isPending = createMut.isPending || updateMut.isPending

  const addLink = () => {
    if (!linkInput.url) return
    setFormData((prev) => ({ ...prev, links: [...prev.links, linkInput] }))
    setLinkInput({ label: '', url: '' })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const name = `pending-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
      const { error } = await supabase.storage.from('bom_assets').upload(`pending/${name}`, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('bom_assets').getPublicUrl(`pending/${name}`)
      setFormData((prev) => ({ ...prev, images: [...prev.images, urlData.publicUrl] }))
    } catch (err: any) {
      showToast('error', 'Upload failed: ' + err.message)
    } finally {
      setIsUploading(false)
    }
  }

  const handleSubmit = () => {
    if (isEditMode) {
      updateMut.mutate({
        name: formData.name,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        images: formData.images,
        links: formData.links,
        assigned_to: formData.assigned_to,
      })
      return
    }

    createMut.mutate(formData)
  }

  const assignedProfile = profiles?.find((profile) => profile.id === formData.assigned_to)
  const getInitial = (name: string | null, email: string | null) => (name || email || '?')[0].toUpperCase()

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-navy-900/40 px-4 py-10 backdrop-blur-sm">
      <div className="relative my-auto mx-auto w-full max-w-2xl rounded-[2rem] bg-white shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between rounded-t-[2rem] border-b border-slate-100 bg-slate-50/50 p-6">
          <div>
            <h2 className="text-xl font-black tracking-tight text-navy-900">
              {isEditMode ? 'Edit Work Item' : 'Create Work Item'}
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-400">
              {isEditMode ? `Editing: ${editPart!.name}` : 'Assign and track project work for the team'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-transparent p-2 text-slate-400 shadow-sm transition-all hover:border-red-100 hover:bg-white hover:text-red-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="hidden-scrollbar max-h-[70vh] space-y-6 overflow-y-auto p-8">
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Work Item Title</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold shadow-sm focus:ring-2 focus:ring-primary-500/20"
                placeholder="e.g. Finish panel layout review or release sensor bracket drawing"
              />
            </div>

            <div className="col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Category Ecosystem</label>
              <div className="relative">
                <select
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-sm font-bold shadow-sm focus:ring-2 focus:ring-primary-500/20"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">▼</div>
              </div>
            </div>

            <div className="col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Priority Level</label>
              <div className="grid grid-cols-4 gap-2">
                {(['Urgent', 'High', 'Medium', 'Low'] as const).map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => setFormData({ ...formData, priority })}
                    className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                      formData.priority === priority
                        ? priority === 'Urgent'
                          ? 'border-red-200 bg-red-50 text-red-600 shadow-sm'
                          : priority === 'High'
                            ? 'border-orange-200 bg-orange-50 text-orange-600 shadow-sm'
                            : priority === 'Medium'
                              ? 'border-amber-200 bg-amber-50 text-amber-600 shadow-sm'
                              : 'border-slate-300 bg-slate-100 text-slate-700 shadow-sm'
                        : 'border-slate-100 bg-white text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {priority}
                  </button>
                ))}
              </div>
            </div>

            <div className="col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Assign To</label>
              <div className="relative">
                <select
                  value={formData.assigned_to || ''}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value || null })}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-sm font-bold shadow-sm focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="">Unassigned</option>
                  {(profiles || []).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email || profile.id}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">▼</div>
              </div>
              {assignedProfile && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-[10px] font-black text-primary-700 ring-2 ring-white">
                    {getInitial(assignedProfile.full_name, assignedProfile.email)}
                  </div>
                  <span className="text-xs font-bold text-slate-600">
                    {assignedProfile.full_name || assignedProfile.email}
                  </span>
                </div>
              )}
            </div>

            <div className="col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Detailed Context & Description</label>
              <textarea
                rows={4}
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium leading-relaxed shadow-sm focus:ring-2 focus:ring-primary-500/20"
                placeholder="Describe the job, expected output, references, and anything the assignee should wait for or coordinate with..."
              />
            </div>

            <div className="col-span-2 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Datasheets & References</label>
              <div className="flex gap-2">
                <input
                  placeholder="Label (e.g. Drawings)"
                  className="flex-1 rounded-xl border border-slate-200 bg-white p-2 text-sm font-bold shadow-sm"
                  value={linkInput.label}
                  onChange={(e) => setLinkInput({ ...linkInput, label: e.target.value })}
                />
                <input
                  placeholder="URL (https://...)"
                  className="flex-[2] rounded-xl border border-slate-200 bg-white p-2 text-sm font-medium shadow-sm"
                  value={linkInput.url}
                  onChange={(e) => setLinkInput({ ...linkInput, url: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
                />
                <button
                  type="button"
                  onClick={addLink}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-slate-400 shadow-sm transition-colors hover:bg-slate-50 hover:text-primary-600"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.links.map((link, index) => (
                  <span key={index} className="flex items-center gap-2 rounded-lg border border-primary-100 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 shadow-sm">
                    <LinkIcon size={12} className="opacity-50" />
                    {link.label || 'Link'}
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          links: prev.links.filter((_, linkIndex) => linkIndex !== index),
                        }))
                      }
                      className="ml-1 rounded bg-red-50 p-0.5 text-red-400 hover:text-red-600"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="col-span-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <label className="mb-3 block text-[10px] font-black uppercase tracking-wider text-slate-400">Reference Images</label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="group flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white transition-colors hover:border-primary-400 hover:bg-primary-50">
                  {isUploading ? (
                    <Loader2 size={20} className="animate-spin text-primary-500" />
                  ) : (
                    <>
                      <Upload size={20} className="mb-1 text-slate-400 transition-colors group-hover:text-primary-500" />
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 group-hover:text-primary-600">Upload</span>
                    </>
                  )}
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
                </label>
                {formData.images.map((image, index) => (
                  <div key={index} className="group relative h-24 w-24 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                    <img src={image} alt="preview" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-navy-900/40 opacity-0 transition-opacity backdrop-blur-[2px] group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            images: prev.images.filter((_, imageIndex) => imageIndex !== index),
                          }))
                        }
                        className="scale-75 rounded-full bg-red-500 p-2 text-white shadow-lg transition-all duration-200 hover:bg-red-600 group-hover:scale-100"
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
          <button type="button" onClick={onClose} className="btn btn-secondary px-6 font-bold">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name || isPending}
            className="btn btn-primary px-8 shadow-lg shadow-primary-600/20"
          >
            {isPending ? (isEditMode ? 'Saving...' : 'Submitting...') : isEditMode ? 'Save Changes' : 'Create Work Item'}
          </button>
        </div>
      </div>
    </div>
  )
}
