import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Save, FolderOpen, Trash2 } from 'lucide-react'
import { projectsApi } from '@/api/projects'

interface ProjectSectionModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: number
  sectionToEdit?: { id: number; name: string; order_index?: number } | null
  onDelete?: (sectionId: number) => void
}

const ProjectSectionModal = ({
  isOpen,
  onClose,
  projectId,
  sectionToEdit,
  onDelete,
}: ProjectSectionModalProps) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  useEffect(() => {
    if (sectionToEdit) {
      setName(sectionToEdit.name)
    } else {
      setName('')
    }
  }, [sectionToEdit, isOpen])

  const mutation = useMutation({
    mutationFn: (data: { name: string }) =>
      sectionToEdit
        ? projectsApi.updateSection(sectionToEdit.id, { name: data.name })
        : projectsApi.createSection({ project_id: projectId, name: data.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    mutation.mutate({ name: name.trim() })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gray-900 rounded-2xl text-white shadow-lg shadow-gray-200">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight">
                {sectionToEdit ? 'Edit Section' : 'New Section'}
              </h3>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
                Top-level project grouping
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
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
              Section Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Mechanical Assembly, Electrical Panel"
              className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent border-gray-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5 transition-all outline-none"
              autoFocus
            />
            <p className="text-[10px] text-gray-400 font-medium mt-2 px-1">
              Sections group related subsections together within a project.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-2">
            <div>
              {sectionToEdit && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(sectionToEdit.id)
                    onClose()
                  }}
                  className="flex items-center gap-2 px-5 py-3 text-[10px] font-black text-red-600 hover:bg-red-50 rounded-xl transition-all uppercase tracking-widest"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Section
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
                type="submit"
                disabled={mutation.isPending}
                className="inline-flex items-center px-8 py-3 bg-gray-900 text-white text-xs font-black rounded-2xl shadow-xl shadow-gray-200 hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest"
              >
                <Save className="h-4 w-4 mr-2" />
                {mutation.isPending ? 'Saving...' : 'Save Section'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProjectSectionModal
