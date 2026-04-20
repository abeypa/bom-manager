import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Save, Layers, Trash2 } from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { FileUpload } from '@/components/ui/FileUpload'

interface ProjectSubsectionModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: number
  sectionId: number       // which Section this subsection belongs to
  sectionName: string     // for display
  subsectionToEdit?: any | null
  onDelete?: (subsectionId: number) => void
}

const ProjectSubsectionModal = ({
  isOpen,
  onClose,
  projectId,
  sectionId,
  sectionName,
  subsectionToEdit,
  onDelete,
}: ProjectSubsectionModalProps) => {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    section_name: '',
    description: '',
    status: 'planning',
    estimated_cost: 0,
    actual_cost: 0,
    start_date: '',
    target_completion_date: '',
    image_path: null as string | null,
    drawing_path: null as string | null,
    datasheet_path: null as string | null,
  })

  useEffect(() => {
    if (subsectionToEdit) {
      setFormData({
        section_name: subsectionToEdit.section_name || '',
        description: subsectionToEdit.description || '',
        status: subsectionToEdit.status || 'planning',
        estimated_cost: subsectionToEdit.estimated_cost || 0,
        actual_cost: subsectionToEdit.actual_cost || 0,
        start_date: subsectionToEdit.start_date || '',
        target_completion_date: subsectionToEdit.target_completion_date || '',
        image_path: subsectionToEdit.image_path || null,
        drawing_path: subsectionToEdit.drawing_path || null,
        datasheet_path: subsectionToEdit.datasheet_path || null,
      })
    } else {
      setFormData({
        section_name: '',
        description: '',
        status: 'planning',
        estimated_cost: 0,
        actual_cost: 0,
        start_date: '',
        target_completion_date: '',
        image_path: null,
        drawing_path: null,
        datasheet_path: null,
      })
    }
  }, [subsectionToEdit, isOpen])

  const mutation = useMutation({
    mutationFn: (data: typeof formData) =>
      subsectionToEdit
        ? projectsApi.updateSubsection(subsectionToEdit.id, data)
        : projectsApi.createSubsection({
            project_id: projectId,
            section_id: sectionId,
            ...data,
            sort_order: 0,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      onClose()
    },
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.section_name.trim()) return

    const payload = {
      ...formData,
      estimated_cost: parseFloat(formData.estimated_cost.toString()) || 0,
      actual_cost: parseFloat(formData.actual_cost.toString()) || 0,
      start_date: formData.start_date || null,
      target_completion_date: formData.target_completion_date || null,
    } as any

    mutation.mutate(payload)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-primary-600 rounded-2xl text-white shadow-lg shadow-primary-200">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight">
                {subsectionToEdit ? 'Edit Subsection' : 'New Subsection'}
              </h3>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                Inside: {sectionName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-white rounded-xl transition-all border border-transparent hover:border-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* Subsection Name */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
              Subsection Name *
            </label>
            <input
              type="text"
              name="section_name"
              required
              value={formData.section_name}
              onChange={handleChange}
              placeholder="e.g. Main Frame, Control Panel, Actuator Block"
              className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent border-gray-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5 transition-all outline-none"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
              Description
            </label>
            <textarea
              name="description"
              rows={2}
              value={formData.description}
              onChange={handleChange}
              placeholder="Brief description of what this subsection covers..."
              className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent border-gray-100 rounded-2xl text-sm font-medium focus:bg-white focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5 transition-all outline-none resize-none"
            />
          </div>

          {/* Status + Costs */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-gray-900 outline-none transition-all appearance-none"
              >
                <option value="planning">Planning</option>
                <option value="design">Design</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
                Est. Cost (₹)
              </label>
              <input
                type="number"
                name="estimated_cost"
                value={formData.estimated_cost}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-gray-900 outline-none transition-all tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
                Actual Cost (₹)
              </label>
              <input
                type="number"
                name="actual_cost"
                value={formData.actual_cost}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-gray-900 outline-none transition-all tabular-nums"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
                Start Date
              </label>
              <input
                type="date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-gray-900 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
                Target Completion
              </label>
              <input
                type="date"
                name="target_completion_date"
                value={formData.target_completion_date}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-gray-900 outline-none transition-all"
              />
            </div>
          </div>

          {/* Assets */}
          <div className="pt-4 border-t border-gray-100 space-y-4">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
              Subsection Assets
            </label>
            <FileUpload
              label="Section Image"
              bucket="bom_assets"
              existingUrl={formData.image_path}
              onUpload={url => setFormData(prev => ({ ...prev, image_path: url }))}
            />
            <FileUpload
              label="Technical Drawing"
              bucket="bom_assets"
              existingUrl={formData.drawing_path}
              onUpload={url => setFormData(prev => ({ ...prev, drawing_path: url }))}
            />
            <FileUpload
              label="Data Sheet"
              bucket="bom_assets"
              existingUrl={formData.datasheet_path}
              onUpload={url => setFormData(prev => ({ ...prev, datasheet_path: url }))}
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-gray-100 bg-white flex justify-between items-center shrink-0">
          <div>
            {subsectionToEdit && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(subsectionToEdit.id)
                  onClose()
                }}
                className="flex items-center gap-2 px-5 py-3 text-[10px] font-black text-red-600 hover:bg-red-50 rounded-xl transition-all uppercase tracking-widest"
              >
                <Trash2 className="h-4 w-4" />
                Delete Subsection
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-xs font-black text-gray-400 hover:text-gray-900 uppercase tracking-widest transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="inline-flex items-center px-8 py-3 bg-primary-600 text-white text-xs font-black rounded-2xl shadow-xl shadow-primary-200 hover:bg-primary-700 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest"
            >
              <Save className="h-4 w-4 mr-2" />
              {mutation.isPending ? 'Saving...' : 'Save Subsection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectSubsectionModal
